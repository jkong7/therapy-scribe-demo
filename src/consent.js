/*
 * Consent + capture gating. Pure logic, no DOM, so it can be unit-tested.
 *
 * Rules:
 *  - Microphone capture may only start when consent is checked AND the
 *    browser exposes a speech recognition API.
 *  - Withdrawing consent while listening must stop capture immediately.
 *  - Resetting the session clears consent; it must be given again.
 */
(function (root) {
  'use strict';

  function createConsentState() {
    return { consented: false, listening: false };
  }

  function getSpeechRecognitionCtor(win) {
    if (!win) return null;
    return win.SpeechRecognition || win.webkitSpeechRecognition || null;
  }

  /** Can the user start mic capture right now? Returns { ok, reason }. */
  function canStartCapture(state, speechSupported) {
    if (!speechSupported) {
      return { ok: false, reason: 'unsupported' };
    }
    if (!state.consented) {
      return { ok: false, reason: 'no-consent' };
    }
    if (state.listening) {
      return { ok: false, reason: 'already-listening' };
    }
    return { ok: true, reason: null };
  }

  /** Returns the new state and whether an active capture must be stopped. */
  function setConsent(state, consented) {
    var mustStop = !consented && state.listening;
    return {
      state: { consented: !!consented, listening: consented ? state.listening : false },
      mustStop: mustStop
    };
  }

  function startListening(state, speechSupported) {
    var check = canStartCapture(state, speechSupported);
    if (!check.ok) return { state: state, started: false, reason: check.reason };
    return { state: { consented: true, listening: true }, started: true, reason: null };
  }

  function stopListening(state) {
    return { consented: state.consented, listening: false };
  }

  function resetConsent() {
    return createConsentState();
  }

  var MESSAGES = {
    unsupported: 'Speech recognition is not available in this browser. Paste or type the transcript instead.',
    'no-consent': 'Confirm consent before starting the microphone.',
    'already-listening': 'Already listening.'
  };

  var api = {
    createConsentState: createConsentState,
    getSpeechRecognitionCtor: getSpeechRecognitionCtor,
    canStartCapture: canStartCapture,
    setConsent: setConsent,
    startListening: startListening,
    stopListening: stopListening,
    resetConsent: resetConsent,
    MESSAGES: MESSAGES
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.TherapyConsent = api;
  }
})(this);
