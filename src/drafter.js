/*
 * Demo draft engine — deterministic keyword matching, no AI.
 *
 * It only ever QUOTES transcript lines (with line references). It never
 * paraphrases into clinical conclusions, never generates a diagnosis,
 * intervention name, treatment recommendation, or a statement that risk
 * is absent. Anything it cannot ground in a quoted line is "Not documented".
 *
 * Works as a classic browser script (window.TherapyDrafter) and as a
 * CommonJS module for Node tests.
 */
(function (root) {
  'use strict';

  var NOT_DOCUMENTED = 'Not documented';
  var ENGINE_LABEL = 'Demo draft engine (deterministic keyword matching, no AI)';

  var SPEAKER_ALIASES = {
    therapist: 'Therapist', t: 'Therapist', clinician: 'Therapist', counselor: 'Therapist',
    client: 'Client', c: 'Client', patient: 'Client'
  };

  var THEMES = [
    { name: 'sleep', words: ['sleep', 'sleeping', 'slept', 'insomnia', 'tired', 'exhausted', 'awake', 'nightmare', 'nightmares'] },
    { name: 'anxiety / worry', words: ['anxious', 'anxiety', 'worry', 'worried', 'worrying', 'nervous', 'panic', 'on edge', 'stressed', 'stress', 'overwhelmed'] },
    { name: 'mood', words: ['sad', 'feeling down', 'depressed', 'feeling low', 'hopeless', 'crying', 'cry', 'empty', 'numb', 'irritable'] },
    { name: 'work / school', words: ['work', 'job', 'boss', 'deadline', 'deadlines', 'manager', 'school', 'class', 'exam', 'coworker', 'coworkers'] },
    { name: 'relationships / family', words: ['partner', 'wife', 'husband', 'girlfriend', 'boyfriend', 'friend', 'friends', 'family', 'mom', 'dad', 'mother', 'father', 'sister', 'brother', 'kids', 'roommate'] },
    { name: 'substance use', words: ['drink', 'drinking', 'drinks', 'alcohol', 'beer', 'wine', 'weed', 'cannabis', 'smoking', 'vape'] },
    { name: 'appetite / eating', words: ['appetite', 'eating', 'meals', 'skipping meals'] }
  ];

  // Any line matching these is quoted verbatim under risk-related language.
  var RISK_PATTERNS = [
    /suicid/i, /kill(ing)? (myself|yourself)/i, /end (my|your) life/i, /end it all/i,
    /want(ed)? to die/i, /wish (i|you) (was|were) dead/i, /better off without me/i,
    /not (be|being) (here|around|alive)/i, /(hurt|hurting|harm|harming) (myself|yourself)/i,
    /self[- ]harm/i, /\bcutting\b/i, /overdose/i, /(hurt|hurting|harm|kill) (someone|somebody|him|her|them)\b/i,
    /\b(gun|guns|weapon|weapons)\b/i, /\bunsafe\b/i, /\bsafe(ty)?\b/i
  ];

  var RATING_PATTERN = /\b(\d{1,2})\s*(out of|\/)\s*10\b/i;
  var INTERVENTION_WORDS = ['breath', 'breathing', 'grounding', 'thought', 'thoughts', 'notice', 'noticed', 'evidence',
    'reframe', 'values', 'exposure', 'mindful', 'mindfulness', 'body', 'reflect', 'what happened', 'what goes through',
    'how did', 'what would', 'sounds like', 'it makes sense'];
  var GOAL_WORDS = ['goal', 'goals', 'progress', 'better', 'improved', 'improving', 'worse', 'helped', 'helping'];
  var HOMEWORK_WORDS = ['homework', 'practice', 'practise', 'log', 'journal', 'worksheet', 'write down',
    'between now and', 'before next', 'this week', 'try that'];
  var NEXT_SESSION_WORDS = ['next session', 'next week', 'next appointment', 'see you', 'follow up', 'follow-up',
    'same time', 'schedule'];
  var REFERRAL_WORDS = ['refer', 'referral', 'medication', 'psychiatrist', 'psychiatry', 'prescriber', 'doctor', 'primary care'];
  var DIAGNOSIS_WORDS = ['diagnosis', 'diagnosed', 'disorder'];

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function containsAny(text, words) {
    for (var i = 0; i < words.length; i++) {
      if (new RegExp('\\b' + escapeRegex(words[i]) + '\\b', 'i').test(text)) return true;
    }
    return false;
  }

  /**
   * Split a transcript into numbered lines. "Therapist:" / "Client:" (or
   * T:/C:) prefixes are recognised; an unlabeled line inherits the previous speaker (or
   * "Unlabeled" if there is none). Blank lines are skipped and not numbered.
   */
  function parseTranscript(text) {
    var lines = [];
    var lastSpeaker = 'Unlabeled';
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      var trimmed = raw.trim();
      if (!trimmed) return;
      // Only known role labels count as speakers, e.g. "Therapist:", "C:",
      // "Client (Sam):". Anything else is treated as part of the utterance.
      var m = trimmed.match(/^(therapist|clinician|counselor|client|patient|t|c)\b(?:\s*\([^)]{0,40}\))?\s*:\s*(.*)$/i);
      var speaker = lastSpeaker;
      var body = trimmed;
      if (m) {
        speaker = SPEAKER_ALIASES[m[1].toLowerCase()];
        body = m[2].trim();
      }
      lastSpeaker = speaker;
      if (!body) return;
      lines.push({ n: lines.length + 1, speaker: speaker, text: body });
    });
    return lines;
  }

  function quote(line) {
    return { text: line.speaker + ': "' + line.text + '"', refs: [line.n] };
  }

  function isClient(line) { return line.speaker === 'Client'; }
  function isTherapist(line) { return line.speaker === 'Therapist'; }

  function field(label, items, emptyNote) {
    return { label: label, items: items, empty: items.length === 0, emptyNote: emptyNote || NOT_DOCUMENTED };
  }

  function generateDraft(transcriptText) {
    var lines = parseTranscript(transcriptText);
    var hasClient = lines.some(isClient);
    var hasTherapist = lines.some(isTherapist);

    // ---------- Risk-related language (quoted verbatim, with next line as context)
    var riskItems = [];
    var riskRefs = [];
    lines.forEach(function (line, i) {
      if (!RISK_PATTERNS.some(function (re) { return re.test(line.text); })) return;
      riskRefs.push(line.n);
      var item = quote(line);
      var next = lines[i + 1];
      if (next) {
        item.text += ' — next line (context, not interpreted) L' + next.n + ' ' + next.speaker + ': "' + next.text + '"';
        item.refs.push(next.n);
      }
      riskItems.push(item);
    });

    // ---------- Data
    var allThemeWords = THEMES.reduce(function (acc, t) { return acc.concat(t.words); }, []);
    var clientReports = lines.filter(function (l) {
      return isClient(l) && containsAny(l.text, allThemeWords);
    }).map(quote);

    var ratings = lines.filter(function (l) {
      return isClient(l) && RATING_PATTERN.test(l.text);
    }).map(quote);

    var therapistStatements = lines.filter(function (l) {
      return isTherapist(l) && containsAny(l.text, INTERVENTION_WORDS);
    }).map(quote);

    // ---------- Assessment (descriptive, grounded in line refs only)
    var themeItems = [];
    THEMES.forEach(function (theme) {
      var refs = lines.filter(function (l) {
        return isClient(l) && containsAny(l.text, theme.words);
      }).map(function (l) { return l.n; });
      if (refs.length) {
        themeItems.push({ text: 'Client statements mention ' + theme.name, refs: refs });
      }
    });

    var progress = lines.filter(function (l) {
      return isClient(l) && riskRefs.indexOf(l.n) === -1 && containsAny(l.text, GOAL_WORDS);
    }).map(quote);

    var riskSummary = riskRefs.length
      ? [{ text: 'Risk-related language appears in the transcript (quoted under Data). Clinician must review and document their own risk assessment; this demo does not assess risk.', refs: riskRefs.slice() }]
      : [];

    var diagnosisMentions = lines.filter(function (l) {
      return containsAny(l.text, DIAGNOSIS_WORDS);
    }).map(quote);

    // ---------- Plan
    var homework = lines.filter(function (l) {
      return containsAny(l.text, HOMEWORK_WORDS);
    }).map(quote);

    var nextSession = lines.filter(function (l) {
      return containsAny(l.text, NEXT_SESSION_WORDS);
    }).map(quote);

    var referrals = lines.filter(function (l) {
      return containsAny(l.text, REFERRAL_WORDS);
    }).map(quote);

    var warnings = [];
    if (!lines.length) warnings.push('Transcript is empty.');
    if (lines.length && !hasClient) warnings.push('No lines labeled "Client:" — client-reported content cannot be identified.');
    if (lines.length && !hasTherapist) warnings.push('No lines labeled "Therapist:".');

    return {
      engine: ENGINE_LABEL,
      lineCount: lines.length,
      lines: lines,
      warnings: warnings,
      sections: {
        data: [
          field('Client-reported concerns / context (quoted)', clientReports),
          field('Client self-ratings (quoted)', ratings),
          field('Therapist statements (quoted; clinician to name any intervention)', therapistStatements),
          field('Risk-related language (quoted verbatim)', riskItems,
            'Not documented — no risk-related keywords found by the demo scan. This is NOT a risk assessment and does not indicate absence of risk.')
        ],
        assessment: [
          field('Themes in client statements (descriptive)', themeItems),
          field('Progress / change described by client (quoted)', progress),
          field('Risk', riskSummary,
            'Not documented. Clinician must assess and document risk; the demo engine does not assess risk.'),
          field('Diagnosis / clinical impression', diagnosisMentions,
            'Not documented (the demo engine never generates a diagnosis or clinical impression).')
        ],
        plan: [
          field('Between-session tasks discussed (quoted)', homework),
          field('Next session (quoted)', nextSession),
          field('Referrals / medication / treatment changes (quoted)', referrals,
            'Not documented (the demo engine never generates treatment recommendations).')
        ]
      }
    };
  }

  function formatRefs(refs) {
    return '[' + refs.map(function (n) { return 'L' + n; }).join(', ') + ']';
  }

  /** Plain-text rendering of one section, used to prefill editable fields. */
  function sectionToText(fields) {
    return fields.map(function (f) {
      var body = f.empty
        ? '- ' + f.emptyNote
        : f.items.map(function (it) { return '- ' + it.text + ' ' + formatRefs(it.refs); }).join('\n');
      return f.label + ':\n' + body;
    }).join('\n\n');
  }

  /** Line numbers referenced as [L3] or [L3, L5] anywhere in edited text. */
  function extractRefs(text) {
    var seen = {};
    var out = [];
    var groups = String(text || '').match(/\[(\s*L\d+\s*,?)+\]/g) || [];
    groups.forEach(function (g) {
      (g.match(/L(\d+)/g) || []).forEach(function (tok) {
        var n = parseInt(tok.slice(1), 10);
        if (!seen[n]) { seen[n] = true; out.push(n); }
      });
    });
    return out.sort(function (x, y) { return x - y; });
  }

  /** Text copied to the clipboard. Requires an explicit reviewed flag. */
  function buildExport(edited, reviewed) {
    if (!reviewed) {
      throw new Error('Draft must be marked as reviewed by the clinician before copying.');
    }
    return [
      'THERAPY SCRIBE DEMO — FICTIONAL DATA ONLY — NOT FOR CLINICAL USE',
      'Clinician-reviewed draft. Line references [Ln] point to the session transcript.',
      '',
      'DATA',
      (edited.data || '').trim() || NOT_DOCUMENTED,
      '',
      'ASSESSMENT',
      (edited.assessment || '').trim() || NOT_DOCUMENTED,
      '',
      'PLAN',
      (edited.plan || '').trim() || NOT_DOCUMENTED
    ].join('\n');
  }

  var api = {
    NOT_DOCUMENTED: NOT_DOCUMENTED,
    ENGINE_LABEL: ENGINE_LABEL,
    parseTranscript: parseTranscript,
    generateDraft: generateDraft,
    sectionToText: sectionToText,
    formatRefs: formatRefs,
    extractRefs: extractRefs,
    buildExport: buildExport
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.TherapyDrafter = api;
  }
})(this);
