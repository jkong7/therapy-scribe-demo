/* UI wiring. All state lives in memory in this closure; nothing is persisted. */
(function () {
  'use strict';

  var Consent = window.TherapyConsent;
  var Drafter = window.TherapyDrafter;
  var SAMPLE = window.TherapySample.SAMPLE_TRANSCRIPT;

  function $(id) { return document.getElementById(id); }

  var el = {
    consent: $('consent'),
    micStart: $('mic-start'),
    micStop: $('mic-stop'),
    micStatus: $('mic-status'),
    interim: $('interim'),
    loadSample: $('load-sample'),
    transcript: $('transcript'),
    lines: $('lines'),
    linesDetails: $('lines-details'),
    lineCount: $('line-count'),
    generate: $('generate'),
    draftStatus: $('draft-status'),
    draftWarnings: $('draft-warnings'),
    data: $('dap-data'),
    assessment: $('dap-assessment'),
    plan: $('dap-plan'),
    evidence: $('evidence'),
    reviewed: $('reviewed'),
    copy: $('copy'),
    reset: $('reset'),
    reviewStatus: $('review-status')
  };

  var SpeechCtor = Consent.getSpeechRecognitionCtor(window);
  var speechSupported = !!SpeechCtor;

  var state = {
    consent: Consent.createConsentState(),
    recognition: null,
    lines: [],
    draftSource: null // transcript text the current draft was generated from
  };

  // ---------- Consent & microphone

  function selectedSpeaker() {
    var checked = document.querySelector('input[name="speaker"]:checked');
    return checked ? checked.value : 'Therapist';
  }

  function renderCapture() {
    var check = Consent.canStartCapture(state.consent, speechSupported);
    el.micStart.disabled = !check.ok;
    el.micStop.disabled = !state.consent.listening;
    el.micStart.textContent = state.consent.listening ? 'Listening…' : 'Start microphone';
    if (state.consent.listening) {
      el.micStatus.textContent = 'Listening. Final phrases are appended as "' + selectedSpeaker() + ':" lines. No audio is kept by this app.';
    } else if (!check.ok && check.reason !== 'already-listening') {
      el.micStatus.textContent = Consent.MESSAGES[check.reason];
    } else {
      el.micStatus.textContent = 'Ready. Microphone is off.';
    }
  }

  function appendTranscriptLine(speaker, text) {
    var current = el.transcript.value.replace(/\s+$/, '');
    el.transcript.value = (current ? current + '\n' : '') + speaker + ': ' + text.trim();
    onTranscriptChange();
  }

  function stopRecognition() {
    var rec = state.recognition;
    state.recognition = null;
    state.consent = Consent.stopListening(state.consent);
    el.interim.textContent = '';
    if (rec) {
      rec.onresult = rec.onerror = rec.onend = null;
      try { rec.abort(); } catch (e) { /* already stopped */ }
    }
    renderCapture();
  }

  function startRecognition() {
    var result = Consent.startListening(state.consent, speechSupported);
    if (!result.started) {
      el.micStatus.textContent = Consent.MESSAGES[result.reason];
      return;
    }
    var rec;
    try {
      rec = new SpeechCtor();
    } catch (e) {
      el.micStatus.textContent = Consent.MESSAGES.unsupported;
      return;
    }
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = document.documentElement.lang || 'en-US';
    rec.onresult = function (event) {
      var interim = '';
      for (var i = event.resultIndex; i < event.results.length; i++) {
        var r = event.results[i];
        if (r.isFinal) {
          if (r[0].transcript.trim()) appendTranscriptLine(selectedSpeaker(), r[0].transcript);
        } else {
          interim += r[0].transcript;
        }
      }
      el.interim.textContent = interim ? '…' + interim : '';
    };
    rec.onerror = function (event) {
      stopRecognition();
      el.micStatus.textContent = 'Microphone stopped (' + event.error + '). You can paste or type the transcript instead.';
    };
    rec.onend = function () { stopRecognition(); };
    state.recognition = rec;
    state.consent = result.state;
    try {
      rec.start();
    } catch (e) {
      stopRecognition();
      el.micStatus.textContent = 'Could not start the microphone. Paste or type the transcript instead.';
      return;
    }
    renderCapture();
  }

  el.consent.addEventListener('change', function () {
    var res = Consent.setConsent(state.consent, el.consent.checked);
    if (res.mustStop) stopRecognition();
    state.consent = res.state;
    renderCapture();
  });
  el.micStart.addEventListener('click', startRecognition);
  el.micStop.addEventListener('click', stopRecognition);
  document.querySelectorAll('input[name="speaker"]').forEach(function (r) {
    r.addEventListener('change', renderCapture);
  });

  // ---------- Transcript

  function onTranscriptChange() {
    state.lines = Drafter.parseTranscript(el.transcript.value);
    el.lineCount.textContent = String(state.lines.length);
    el.lines.innerHTML = '';
    state.lines.forEach(function (line) {
      var li = document.createElement('li');
      li.id = 'line-' + line.n;
      li.tabIndex = -1;
      var num = document.createElement('span');
      num.className = 'ln';
      num.textContent = 'L' + line.n;
      var who = document.createElement('span');
      who.className = 'who who-' + line.speaker.toLowerCase();
      who.textContent = line.speaker;
      var txt = document.createElement('span');
      txt.textContent = line.text;
      li.append(num, ' ', who, ' ', txt);
      el.lines.appendChild(li);
    });
    if (isStale()) {
      // Line numbers may have shifted: evidence is stale and any prior review no longer applies.
      el.draftStatus.textContent = 'Transcript changed since the draft was generated — evidence may be stale. Regenerate or re-check every reference, then review again.';
      el.reviewed.checked = false;
      renderReview();
    }
    renderEvidence();
  }

  el.transcript.addEventListener('input', onTranscriptChange);
  el.loadSample.addEventListener('click', function () {
    if (el.transcript.value.trim() && !window.confirm('Replace the current transcript with the fictional sample?')) return;
    el.transcript.value = SAMPLE;
    onTranscriptChange();
    el.draftStatus.textContent = 'Fictional sample loaded. Select “Generate draft”.';
  });

  // ---------- Draft

  function isStale() {
    return state.draftSource !== null && state.draftSource !== el.transcript.value;
  }

  function draftFields() { return [el.data, el.assessment, el.plan]; }

  function hasDraft() {
    return draftFields().some(function (t) { return t.value.trim(); });
  }

  function renderReview() {
    el.reviewed.disabled = !hasDraft();
    if (el.reviewed.disabled) el.reviewed.checked = false;
    el.copy.disabled = !(el.reviewed.checked && hasDraft());
  }

  el.generate.addEventListener('click', function () {
    if (hasDraft() && !window.confirm('Replace your current (possibly edited) draft?')) return;
    var draft = Drafter.generateDraft(el.transcript.value);
    el.data.value = Drafter.sectionToText(draft.sections.data);
    el.assessment.value = Drafter.sectionToText(draft.sections.assessment);
    el.plan.value = Drafter.sectionToText(draft.sections.plan);
    state.draftSource = el.transcript.value;
    el.draftWarnings.innerHTML = '';
    draft.warnings.forEach(function (w) {
      var li = document.createElement('li');
      li.textContent = w;
      el.draftWarnings.appendChild(li);
    });
    el.draftStatus.textContent = 'Draft generated from ' + draft.lineCount + ' transcript lines by the demo engine. Review and edit before use.';
    el.reviewed.checked = false;
    renderEvidence();
    renderReview();
  });

  function highlightLine(n) {
    el.linesDetails.open = true;
    var target = $('line-' + n);
    if (!target) return;
    document.querySelectorAll('.lines li.hl').forEach(function (li) { li.classList.remove('hl'); });
    target.classList.add('hl');
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.focus({ preventScroll: true });
  }

  function renderEvidence() {
    var text = draftFields().map(function (t) { return t.value; }).join('\n');
    var refs = Drafter.extractRefs(text);
    el.evidence.innerHTML = '';
    if (isStale() && refs.length) {
      var warn = document.createElement('li');
      warn.className = 'bad';
      warn.id = 'evidence-stale';
      warn.textContent = 'Stale: the transcript was edited after this draft was generated. Line references below may no longer match.';
      el.evidence.appendChild(warn);
    }
    if (!refs.length) {
      var empty = document.createElement('li');
      empty.className = 'muted';
      empty.textContent = 'No [Ln] references in the draft.';
      el.evidence.appendChild(empty);
      return;
    }
    refs.forEach(function (n) {
      var line = state.lines[n - 1];
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ref';
      btn.textContent = 'L' + n;
      btn.setAttribute('aria-label', 'Highlight transcript line ' + n);
      btn.addEventListener('click', function () { highlightLine(n); });
      li.appendChild(btn);
      var q = document.createElement('span');
      if (line) {
        q.textContent = ' ' + line.speaker + ': “' + line.text + '”';
      } else {
        q.className = 'bad';
        q.textContent = ' No such line in the current transcript — check this reference.';
      }
      li.appendChild(q);
      el.evidence.appendChild(li);
    });
  }

  draftFields().forEach(function (t) {
    t.addEventListener('input', function () { renderEvidence(); renderReview(); });
  });

  // ---------- Review, copy, reset

  el.reviewed.addEventListener('change', renderReview);

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  el.copy.addEventListener('click', function () {
    var text;
    try {
      text = Drafter.buildExport({ data: el.data.value, assessment: el.assessment.value, plan: el.plan.value }, el.reviewed.checked);
    } catch (e) {
      el.reviewStatus.textContent = e.message;
      return;
    }
    var done = function () { el.reviewStatus.textContent = 'Reviewed draft copied to clipboard (fictional data only).'; };
    var fail = function () { el.reviewStatus.textContent = fallbackCopy(text) ? 'Reviewed draft copied.' : 'Copy failed — select the text and copy manually.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fail);
    } else {
      fail();
    }
  });

  el.reset.addEventListener('click', function () {
    if (!window.confirm('Reset the session? The transcript and draft will be discarded.')) return;
    stopRecognition();
    state.consent = Consent.resetConsent();
    el.consent.checked = false;
    el.transcript.value = '';
    draftFields().forEach(function (t) { t.value = ''; });
    el.draftWarnings.innerHTML = '';
    el.draftStatus.textContent = '';
    el.reviewed.checked = false;
    state.draftSource = null;
    onTranscriptChange();
    renderReview();
    renderCapture();
    el.reviewStatus.textContent = 'Session reset. Nothing was saved.';
  });

  // ---------- Init
  if (!speechSupported) {
    $('speaker-fieldset').disabled = true;
  }
  onTranscriptChange();
  renderCapture();
  renderReview();
})();
