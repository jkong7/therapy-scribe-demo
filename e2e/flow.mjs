// End-to-end UI flow check using Playwright + Chromium.
// Usage: node e2e/flow.mjs [screenshotDir]
// Playwright is not a project dependency; if it cannot be found this script
// exits 0 with a "skipped" message so `npm test` stays dependency-free.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = process.argv[2] || null;

let chromium;
try {
  const require = createRequire(import.meta.url);
  let pw;
  try { pw = require('playwright'); } catch { pw = require(path.join(process.execPath, '../../lib/node_modules/playwright')); }
  chromium = pw.chromium;
} catch {
  console.log('SKIPPED: playwright not installed (npm i -D playwright to run this check).');
  process.exit(0);
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(root, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const results = [];
async function step(name, fn) {
  await fn();
  results.push(name);
  console.log('ok -', name);
}

// Fake speech recognition so the consent-gated mic path can be exercised.
const fakeSpeech = () => {
  window.__recStarts = 0;
  window.__lastRec = null;
  window.SpeechRecognition = window.webkitSpeechRecognition = class {
    start() { window.__recStarts++; window.__lastRec = this; }
    stop() { this.onend && this.onend(); }
    abort() { window.__aborted = true; window.__lastRec = null; }
    emit(text) {
      const r = [{ transcript: text }];
      r.isFinal = true;
      this.onresult({ resultIndex: 0, results: [r] });
    }
  };
};

try {
  // ---------- Desktop flow with (fake) speech support
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(fakeSpeech);
  await page.goto(url);

  await step('title and warning visible', async () => {
    assert.equal(await page.title(), 'Therapy Scribe Demo');
    assert.match(await page.locator('.warning').innerText(), /Fictional data only\. Not for clinical use\./);
  });

  await step('mic is disabled until consent', async () => {
    assert.equal(await page.locator('#mic-start').isDisabled(), true);
    assert.match(await page.locator('#mic-status').innerText(), /Confirm consent/);
    await page.locator('#consent').check();
    assert.equal(await page.locator('#mic-start').isDisabled(), false);
  });

  await step('live phrases are appended with the selected speaker label', async () => {
    await page.locator('#mic-start').click();
    assert.equal(await page.evaluate(() => window.__recStarts), 1);
    await page.evaluate(() => window.__lastRec.emit('How was your week?'));
    await page.locator('input[name="speaker"][value="Client"]').check();
    await page.evaluate(() => window.__lastRec.emit('I could not sleep'));
    assert.equal(await page.locator('#transcript').inputValue(), 'Therapist: How was your week?\nClient: I could not sleep');
  });

  await step('withdrawing consent stops recognition immediately and disables capture', async () => {
    const rec = await page.evaluateHandle(() => window.__lastRec);
    await page.locator('#consent').uncheck();
    assert.equal(await page.evaluate(() => window.__aborted), true);
    assert.equal(await page.locator('#mic-start').isDisabled(), true);
    assert.equal(await page.locator('#mic-stop').isDisabled(), true);
    assert.match(await page.locator('#mic-status').innerText(), /Confirm consent/);
    // Handlers are detached: a late result from the aborted recognizer is ignored.
    const before = await page.locator('#transcript').inputValue();
    assert.equal(await rec.evaluate((r) => r.onresult), null);
    assert.equal(await page.locator('#transcript').inputValue(), before);
    // Clicking the disabled start button cannot restart capture.
    await page.locator('#mic-start').click({ force: true });
    assert.equal(await page.evaluate(() => window.__recStarts), 1);
  });

  await step('sample loads and draft generates with evidence', async () => {
    await page.locator('#load-sample').click();
    assert.equal(await page.locator('#line-count').innerText(), '17');
    await page.locator('#generate').click();
    const data = await page.locator('#dap-data').inputValue();
    assert.match(data, /better off without me\." .*\[L12, L13\]/);
    assert.match(await page.locator('#dap-assessment').inputValue(), /Diagnosis \/ clinical impression:\n- Not documented/);
    assert.match(await page.locator('#dap-plan').inputValue(), /next week, same time on Thursday\." \[L17\]/);
    assert.ok(await page.locator('#evidence li').count() >= 10);
  });

  await step('evidence ref highlights the transcript line', async () => {
    await page.locator('#evidence button', { hasText: /^L12$/ }).click();
    assert.equal(await page.locator('#line-12').getAttribute('class'), 'hl');
  });

  if (shotDir) await page.screenshot({ path: path.join(shotDir, 'desktop.png'), fullPage: true });

  await step('copy requires review and copies the edited draft', async () => {
    assert.equal(await page.locator('#copy').isDisabled(), true);
    await page.locator('#dap-plan').fill('Clinician-written plan [L15] [L99]');
    assert.match(await page.locator('#evidence').innerText(), /No such line/);
    await page.locator('#reviewed').check();
    assert.equal(await page.locator('#copy').isDisabled(), false);
    await page.locator('#reviewed').uncheck();
    assert.equal(await page.locator('#copy').isDisabled(), true);
    await page.locator('#reviewed').check();
    await page.locator('#copy').click();
    await page.waitForFunction(() => /copied/.test(document.getElementById('review-status').textContent));
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(clip, /^THERAPY SCRIBE DEMO — FICTIONAL DATA ONLY/);
    assert.match(clip, /PLAN\nClinician-written plan \[L15\] \[L99\]/);
  });

  await step('editing the transcript marks evidence stale and clears review', async () => {
    assert.equal(await page.locator('#reviewed').isChecked(), true);
    await page.locator('#transcript').press('Control+Home');
    await page.locator('#transcript').type('Therapist: Inserted line.\n');
    assert.match(await page.locator('#draft-status').innerText(), /evidence may be stale/);
    assert.equal(await page.locator('#evidence-stale').count(), 1);
    assert.equal(await page.locator('#reviewed').isChecked(), false);
    assert.equal(await page.locator('#copy').isDisabled(), true);
    // Regenerating clears the stale state.
    await page.locator('#generate').click();
    assert.equal(await page.locator('#evidence-stale').count(), 0);
    await page.locator('#reviewed').check();
  });

  await step('reset clears transcript, draft, review and consent', async () => {
    await page.locator('#consent').check();
    await page.locator('#reset').click();
    assert.equal(await page.locator('#transcript').inputValue(), '');
    for (const id of ['#dap-data', '#dap-assessment', '#dap-plan']) {
      assert.equal(await page.locator(id).inputValue(), '');
    }
    assert.equal(await page.locator('#line-count').innerText(), '0');
    assert.equal(await page.locator('#evidence-stale').count(), 0);
    assert.equal(await page.locator('#draft-status').innerText(), '');
    assert.equal(await page.locator('#consent').isChecked(), false);
    assert.equal(await page.locator('#reviewed').isChecked(), false);
    assert.equal(await page.locator('#copy').isDisabled(), true);
    assert.equal(await page.locator('#mic-start').isDisabled(), true);
  });

  await step('nothing written to browser storage', async () => {
    const n = await page.evaluate(() => localStorage.length + sessionStorage.length);
    assert.equal(n, 0);
  });

  assert.deepEqual(errors, [], 'page errors: ' + errors.join('; '));
  await ctx.close();

  // ---------- Mobile, no speech support -> paste fallback
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await mctx.newPage();
  m.on('dialog', (d) => d.accept());
  await m.addInitScript(() => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; });
  await m.goto(url);

  await step('unsupported browser shows paste fallback and keeps mic disabled', async () => {
    await m.locator('#consent').check();
    assert.equal(await m.locator('#mic-start').isDisabled(), true);
    assert.match(await m.locator('#mic-status').innerText(), /not available.*Paste/);
  });

  await step('mobile layout has no horizontal scroll', async () => {
    await m.locator('#load-sample').click();
    await m.locator('#generate').click();
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, 'horizontal overflow ' + overflow + 'px');
  });
  if (shotDir) await m.screenshot({ path: path.join(shotDir, 'mobile.png'), fullPage: true });
  await mctx.close();

  console.log(`\n${results.length} e2e checks passed`);
} finally {
  await browser.close();
  server.close();
}
