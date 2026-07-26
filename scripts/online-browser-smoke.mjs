import { chromium } from 'playwright-core';

const requestedTarget = process.argv.slice(2).find((argument) => argument !== '--') ?? 'http://127.0.0.1:8787';
const roomId = `route-browser-${Date.now()}`;
const target = new URL(requestedTarget);
target.searchParams.set('mode', 'online');
target.searchParams.set('room', roomId);

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const errors = [];
const watchErrors = (page, label) => {
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
  });
};
const assertNoHorizontalOverflow = async (page, label) => {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  if (metrics.document > metrics.viewport + 1) {
    throw new Error(`${label} overflows horizontally: ${JSON.stringify(metrics)}`);
  }
};
const finishDraft = async (page) => {
  await page.getByRole('heading', { name: '血統航路' }).waitFor();
  for (let round = 0; round < 3; round += 1) {
    await page.locator('.draft-choice .monster-card-footer button').first().click();
  }
  await page.getByRole('heading', { name: '旅商人の棚' }).waitFor();
};

const host = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const guest = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
watchErrors(host, 'host');
watchErrors(guest, 'guest');

const modeTarget = new URL(requestedTarget);
await Promise.all([
  host.goto(modeTarget.toString(), { waitUntil: 'networkidle' }),
  guest.goto(modeTarget.toString(), { waitUntil: 'networkidle' }),
]);
await Promise.all([
  host.getByRole('heading', { name: '検証する航路を選ぶ' }).waitFor(),
  guest.getByRole('heading', { name: '検証する航路を選ぶ' }).waitFor(),
]);
await assertNoHorizontalOverflow(host, 'Desktop route ledger');
await assertNoHorizontalOverflow(guest, 'Mobile route ledger');
await host.screenshot({ path: '/tmp/code-monsters-online-mode-desktop.png' });
await guest.screenshot({ path: '/tmp/code-monsters-online-mode-mobile.png', fullPage: true });

await host.goto(target.toString(), { waitUntil: 'networkidle' });
await host.locator('.online-room-bar').waitFor();
await guest.goto(target.toString(), { waitUntil: 'networkidle' });
await guest.locator('.online-room-bar').waitFor();
await host.getByText('2人とも育成中').waitFor();
await guest.getByText('2人とも育成中').waitFor();

await Promise.all([finishDraft(host), finishDraft(guest)]);
await host.reload({ waitUntil: 'networkidle' });
await host.getByRole('heading', { name: '旅商人の棚' }).waitFor();
if ((await host.locator('.team-zone.is-active .roster-card').count()) !== 3) {
  throw new Error('Host did not recover the submitted local run after reconnecting');
}
await host.getByText('2人とも育成中').waitFor();
await assertNoHorizontalOverflow(host, 'Desktop online workshop');
await assertNoHorizontalOverflow(guest, 'Mobile online workshop');
await host.screenshot({ path: '/tmp/code-monsters-online-workshop-desktop.png' });
await guest.screenshot({ path: '/tmp/code-monsters-online-workshop-mobile.png' });

await host.getByRole('button', { name: /編成を提出する/ }).click();
await host.getByText('編成提出済み · 相手待ち').waitFor();
await guest.getByRole('button', { name: /編成を提出する/ }).click();

await Promise.all([
  host.locator('.battle-screen').waitFor({ timeout: 20_000 }),
  guest.locator('.battle-screen').waitFor({ timeout: 20_000 }),
]);
await assertNoHorizontalOverflow(host, 'Desktop online battle');
await assertNoHorizontalOverflow(guest, 'Mobile online battle');
await host.screenshot({ path: '/tmp/code-monsters-online-battle-desktop.png' });
await guest.screenshot({ path: '/tmp/code-monsters-online-battle-mobile.png' });

const hostScore = await host.locator('.online-room-score').innerText();
const guestStatus = await guest.locator('.online-room-copy strong').innerText();
if (!hostScore.includes('YOU') || !hostScore.includes('RIVAL')) throw new Error('Online score is not visible');
if (!guestStatus) throw new Error('Mobile room status is empty');

await browser.close();
if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);

console.log(
  JSON.stringify({
    target: target.toString(),
    screenshots: [
      '/tmp/code-monsters-online-mode-desktop.png',
      '/tmp/code-monsters-online-mode-mobile.png',
      '/tmp/code-monsters-online-workshop-desktop.png',
      '/tmp/code-monsters-online-workshop-mobile.png',
      '/tmp/code-monsters-online-battle-desktop.png',
      '/tmp/code-monsters-online-battle-mobile.png',
    ],
  }),
);
