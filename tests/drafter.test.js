'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/drafter.js');
const { SAMPLE_TRANSCRIPT } = require('../src/sample.js');

function allItems(draft) {
  return ['data', 'assessment', 'plan'].flatMap((k) => draft.sections[k]).flatMap((f) => f.items);
}
function fullText(draft) {
  return ['data', 'assessment', 'plan'].map((k) => D.sectionToText(draft.sections[k])).join('\n');
}
function field(draft, section, labelStart) {
  return draft.sections[section].find((f) => f.label.startsWith(labelStart));
}

test('parseTranscript numbers non-blank lines and maps speaker labels', () => {
  const lines = D.parseTranscript('Therapist: Hi.\n\nC: Hello.\ncontinued thought\nclient (Sam): Yes\nNote: aside');
  assert.deepEqual(lines.map((l) => [l.n, l.speaker, l.text]), [
    [1, 'Therapist', 'Hi.'],
    [2, 'Client', 'Hello.'],
    [3, 'Client', 'continued thought'],
    [4, 'Client', 'Yes'],
    [5, 'Client', 'Note: aside'] // unknown labels are not treated as speakers
  ]);
});

test('unlabeled transcript is marked Unlabeled and warns', () => {
  const d = D.generateDraft('I slept badly all week.');
  assert.equal(d.lines[0].speaker, 'Unlabeled');
  assert.ok(d.warnings.some((w) => /Client/.test(w)));
});

test('empty transcript yields Not documented everywhere and no fabricated content', () => {
  const d = D.generateDraft('');
  assert.equal(d.lineCount, 0);
  assert.equal(allItems(d).length, 0);
  for (const k of ['data', 'assessment', 'plan']) {
    for (const f of d.sections[k]) {
      assert.ok(f.empty);
      assert.match(f.emptyNote, /^Not documented/);
    }
  }
  assert.ok(d.warnings.includes('Transcript is empty.'));
});

test('every reference points to an existing line and quoted text is verbatim', () => {
  const d = D.generateDraft(SAMPLE_TRANSCRIPT);
  const byN = new Map(d.lines.map((l) => [l.n, l]));
  for (const item of allItems(d)) {
    assert.ok(item.refs.length > 0, 'item without refs: ' + item.text);
    for (const n of item.refs) assert.ok(byN.has(n), 'bad ref L' + n);
    const quotes = [...item.text.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    for (const q of quotes) {
      assert.ok(d.lines.some((l) => l.text === q), 'quote not verbatim: ' + q);
    }
  }
});

test('sample draft fills D, A and P from transcript evidence', () => {
  const d = D.generateDraft(SAMPLE_TRANSCRIPT);
  assert.ok(!field(d, 'data', 'Client-reported').empty);
  assert.deepEqual(field(d, 'data', 'Client self-ratings').items[0].refs, [6]);
  assert.ok(field(d, 'assessment', 'Themes').items.some((i) => /sleep/.test(i.text)));
  assert.deepEqual(field(d, 'plan', 'Next session').items.map((i) => i.refs[0]), [17]);
  assert.ok(field(d, 'plan', 'Between-session').items.some((i) => i.refs[0] === 15));
});

test('never invents a diagnosis, intervention or treatment recommendation', () => {
  const d = D.generateDraft(SAMPLE_TRANSCRIPT);
  assert.ok(field(d, 'assessment', 'Diagnosis').empty);
  assert.match(field(d, 'assessment', 'Diagnosis').emptyNote, /Not documented/);
  assert.ok(field(d, 'plan', 'Referrals').empty);
  const text = allItems(d).map((i) => i.text).join('\n');
  // Clinical labels absent from the transcript must never appear in generated items.
  for (const word of ['depression', 'disorder', 'GAD', 'MDD', 'CBT', 'cognitive restructuring', 'recommend', 'medication', 'prognosis']) {
    assert.ok(!new RegExp('\\b' + word + '\\b', 'i').test(text), 'invented term: ' + word);
  }
});

test('diagnosis is only quoted when actually spoken', () => {
  const d = D.generateDraft('Client: My doctor diagnosed me with migraines last year.');
  const dx = field(d, 'assessment', 'Diagnosis');
  assert.equal(dx.items.length, 1);
  assert.deepEqual(dx.items[0].refs, [1]);
  assert.match(dx.items[0].text, /^Client: "My doctor diagnosed me with migraines last year\."$/);
});

test('risk language is quoted verbatim with next-line context and line refs', () => {
  const d = D.generateDraft(SAMPLE_TRANSCRIPT);
  const risk = field(d, 'data', 'Risk-related');
  assert.equal(risk.items.length, 1);
  assert.deepEqual(risk.items[0].refs, [12, 13]);
  assert.match(risk.items[0].text, /"Sometimes I think everyone would be better off without me\."/);
  assert.match(risk.items[0].text, /context, not interpreted/);
  const riskA = field(d, 'assessment', 'Risk');
  assert.deepEqual(riskA.items[0].refs, [12]);
  assert.match(riskA.items[0].text, /does not assess risk/);
});

test('no risk keywords never becomes a denial of risk', () => {
  const d = D.generateDraft('Therapist: How was the week?\nClient: Busy at work, but fine overall.');
  const text = fullText(d);
  assert.ok(field(d, 'data', 'Risk-related').empty);
  assert.match(text, /does not indicate absence of risk/);
  for (const phrase of [/\bdenie[sd]\b/i, /\bno (SI|HI)\b/i, /\blow risk\b/i, /\bnot at risk\b/i, /\bno risk\b(?!-related)/i, /\bsafe\b/i]) {
    assert.ok(!phrase.test(text), 'risk denial phrase found: ' + phrase);
  }
});

test('a therapist risk question is quoted with the following answer, not summarised', () => {
  const d = D.generateDraft('Therapist: Any thoughts of hurting yourself this week?\nClient: No, nothing like that.');
  const risk = field(d, 'data', 'Risk-related');
  assert.equal(risk.items.length, 1);
  assert.deepEqual(risk.items[0].refs, [1, 2]);
  assert.match(risk.items[0].text, /"No, nothing like that\."/);
  assert.ok(!/denies/i.test(fullText(d)));
});

test('draft generation is deterministic', () => {
  assert.deepEqual(D.generateDraft(SAMPLE_TRANSCRIPT), D.generateDraft(SAMPLE_TRANSCRIPT));
});

test('extractRefs finds bracketed line references only', () => {
  assert.deepEqual(D.extractRefs('a [L3, L12] b [L3] [L1] [Lx] L9'), [1, 3, 12]);
  assert.deepEqual(D.extractRefs(''), []);
});

test('buildExport requires review and keeps the demo warning', () => {
  assert.throws(() => D.buildExport({ data: 'x', assessment: 'y', plan: 'z' }, false), /reviewed/);
  const out = D.buildExport({ data: 'Edited data [L1]', assessment: '', plan: 'Plan text' }, true);
  assert.match(out, /^THERAPY SCRIBE DEMO — FICTIONAL DATA ONLY — NOT FOR CLINICAL USE/);
  assert.match(out, /DATA\nEdited data \[L1\]/);
  assert.match(out, /ASSESSMENT\nNot documented/);
  assert.match(out, /PLAN\nPlan text/);
});
