'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/consent.js');

test('capture is blocked until consent is given', () => {
  const s = C.createConsentState();
  assert.deepEqual(C.canStartCapture(s, true), { ok: false, reason: 'no-consent' });
  const r = C.startListening(s, true);
  assert.equal(r.started, false);
  assert.equal(r.state.listening, false);
});

test('capture starts once consent is given and speech is supported', () => {
  const s = C.setConsent(C.createConsentState(), true).state;
  assert.deepEqual(C.canStartCapture(s, true), { ok: true, reason: null });
  const r = C.startListening(s, true);
  assert.equal(r.started, true);
  assert.equal(r.state.listening, true);
  assert.equal(C.startListening(r.state, true).reason, 'already-listening');
});

test('unsupported browser falls back to pasted transcript even with consent', () => {
  const s = C.setConsent(C.createConsentState(), true).state;
  const r = C.startListening(s, false);
  assert.equal(r.started, false);
  assert.equal(r.reason, 'unsupported');
  assert.match(C.MESSAGES.unsupported, /Paste/);
});

test('withdrawing consent while listening forces capture to stop', () => {
  let s = C.startListening(C.setConsent(C.createConsentState(), true).state, true).state;
  const res = C.setConsent(s, false);
  assert.equal(res.mustStop, true);
  assert.deepEqual(res.state, { consented: false, listening: false });
  assert.equal(C.canStartCapture(res.state, true).reason, 'no-consent');
});

test('withdrawing consent while idle does not request a stop', () => {
  const s = C.setConsent(C.createConsentState(), true).state;
  assert.equal(C.setConsent(s, false).mustStop, false);
});

test('reset clears consent so it must be given again', () => {
  const s = C.startListening(C.setConsent(C.createConsentState(), true).state, true).state;
  const reset = C.resetConsent(s);
  assert.deepEqual(reset, { consented: false, listening: false });
  assert.equal(C.canStartCapture(reset, true).reason, 'no-consent');
});

test('speech recognition constructor detection', () => {
  function Std() {}
  function Webkit() {}
  assert.equal(C.getSpeechRecognitionCtor({ SpeechRecognition: Std, webkitSpeechRecognition: Webkit }), Std);
  assert.equal(C.getSpeechRecognitionCtor({ webkitSpeechRecognition: Webkit }), Webkit);
  assert.equal(C.getSpeechRecognitionCtor({}), null);
  assert.equal(C.getSpeechRecognitionCtor(undefined), null);
});
