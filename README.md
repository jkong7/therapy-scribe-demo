# Therapy Scribe Demo

A small, single-page prototype of an ambient scribe loop for individual psychotherapy:

**consent → microphone / sample / pasted transcript → evidence-linked DAP draft → clinician review → copy**

> **Fictional data only. Not for clinical use.** This is a capability demo. Do not enter real
> client information. It is not a medical device, not a diagnostic, risk-assessment or emergency
> tool, and makes no privacy, security or regulatory compliance claims.

## Run it

No build step and no dependencies. From the repo root:

```sh
python3 -m http.server 8000      # or: npm start
# open http://localhost:8000
```

Serving from `localhost` (a secure context) is needed for the microphone and clipboard.
Opening `index.html` directly from disk also works for the sample / paste / draft flow.

## Test it

```sh
npm test            # unit tests: drafting engine + consent gating (Node >= 18, no deps)
npm run test:e2e    # browser flow via Playwright + Chromium, if Playwright is installed
                    # (prints SKIPPED and exits 0 otherwise)
node e2e/flow.mjs ./shots   # same, also saves desktop.png / mobile.png screenshots
```

The e2e script swaps in a fake `SpeechRecognition`, so it tests the consent and capture UI
without real audio.

## How it works

| Step | What happens |
| --- | --- |
| 1. Consent & capture | The microphone button stays disabled until the consent box is checked. Unchecking it during capture aborts recognition immediately. Live phrases are added as `Therapist:` / `Client:` lines, using whichever speaker toggle is selected (browser speech recognition can't tell speakers apart). If the browser has no speech recognition, you're prompted to paste a transcript instead. |
| 2. Transcript | Editable text. Lines are numbered `L1…Ln`. "Load fictional sample session" fills in a made-up therapist/client session. |
| 3. DAP draft | The **demo draft engine** builds editable Data / Assessment / Plan text. Every statement is a verbatim quote or a descriptive pointer with `[Ln]` references. The evidence list re-reads the references as you edit, flags references to lines that don't exist, and highlights the source line when clicked. If you edit the transcript after generating, the evidence is marked **stale** and any review checkbox is cleared. |
| 4. Review | You can only copy after ticking "I have reviewed and edited this draft". Copied text starts with a fictional-data / not-for-clinical-use header. "Reset session" clears the transcript, the draft, the review state and consent. |

### About the demo draft engine (`src/drafter.js`)

It is **deterministic keyword matching, not AI** and not summarization. It:

- quotes transcript lines word for word, with line references; it does not paraphrase them into clinical conclusions
- writes **"Not documented"** for anything it can't quote
- never generates a diagnosis, clinical impression, intervention name, treatment recommendation or referral. It only quotes these if someone actually said them
- quotes risk-related language only as it was spoken, plus the following line as uninterpreted context. It is a keyword scan, **not a risk assessment**. If no keywords are found, it says that is *not* evidence that risk is absent, and it never writes phrases like "denies SI" or "low risk"

## Privacy / data handling

- Everything is kept in page memory only: no `localStorage`/`sessionStorage`, cookies, accounts, backend, analytics, sharing or billing. Reloading or resetting the page discards everything.
- No audio is recorded or kept by this app, and no API keys or paid services are used.
- **Caveat:** live transcription uses the browser's own Web Speech API. Some browsers (e.g. Chrome) send audio to the vendor's servers under the vendor's own terms, which this app cannot control. Use fictional speech only, or paste a transcript instead.

## Limitations

- Keyword rules are simple and English-only. They will miss things and flag irrelevant lines; the clinician must check everything.
- Speaker labels come from the manual toggle (live mode) or `Therapist:` / `Client:` prefixes (pasted text). Speakers are not detected automatically.
- Browser speech recognition support varies, and it often stops after a silence; press Start again.
- DAP only, individual sessions only. No other note formats, no EHR integration, no export beyond the clipboard.

## Files

```
index.html          page markup
styles.css          responsive styles (light/dark)
src/consent.js      consent + capture gating (pure logic)
src/drafter.js      demo draft engine (pure logic)
src/sample.js       fictional sample session
src/app.js          UI wiring
tests/*.test.js     node:test unit tests
e2e/flow.mjs        Playwright browser flow + screenshots
```
