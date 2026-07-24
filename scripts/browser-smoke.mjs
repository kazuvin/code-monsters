import { chromium } from 'playwright-core';

const requestedTarget = process.argv.slice(2).find((argument) => argument !== '--') ?? 'http://127.0.0.1:5173';
const target = new URL(requestedTarget);
target.searchParams.set('seed', target.searchParams.get('seed') ?? '7261');

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const errors = [];
const watchErrors = (page) => {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
};

const assertFitsViewport = async (page, label) => {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  if (metrics.scrollWidth > metrics.viewportWidth + 1 || metrics.scrollHeight > metrics.viewportHeight + 1) {
    throw new Error(`${label} overflows the viewport: ${JSON.stringify(metrics)}`);
  }
};

const desktop = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
watchErrors(desktop);
await desktop.goto(target.toString(), { waitUntil: 'networkidle' });
await desktop.getByRole('heading', { name: '血統航路' }).waitFor();

for (let round = 0; round < 3; round += 1) {
  const choices = desktop.locator('.draft-grid .definition-card');
  if ((await choices.count()) !== 3) throw new Error(`Draft round ${round + 1} does not show three choices`);
  await choices.first().click();
}

await desktop.getByRole('heading', { name: '旅商人の棚' }).waitFor();
if ((await desktop.locator('.team-panel .roster-card.is-active').count()) !== 3) {
  throw new Error('Initial draft did not create a three-monster active party');
}
if ((await desktop.locator('.shop-monsters .definition-card, .shop-monsters .sold-slot').count()) !== 3) {
  throw new Error('Monster shop does not have three slots');
}
if ((await desktop.locator('.equipment-offers > *').count()) !== 2) {
  throw new Error('Equipment shop does not have two slots');
}

const coinsBefore = Number((await desktop.locator('.coin-metric b').textContent())?.trim());
await desktop.locator('.shop-monsters .buy-button').first().click();
const coinsAfter = Number((await desktop.locator('.coin-metric b').textContent())?.trim());
if (coinsAfter !== coinsBefore - 3) throw new Error('Buying a rank-one monster did not spend three coins');
if ((await desktop.locator('.team-panel .roster-card').count()) !== 4) {
  throw new Error('Bought monster did not enter the roster');
}

await desktop.getByRole('button', { name: '03 ガンビット' }).click();
if ((await desktop.locator('.gambit-row').count()) !== 3)
  throw new Error('Selected monster does not have three gambits');

await desktop.screenshot({ path: '/tmp/code-monsters-casual-desktop.png', fullPage: true });
await desktop.getByRole('button', { name: 'ATB 3 × 3 戦闘を開始する' }).click();
await desktop.getByRole('heading', { name: '非同期ゴースト戦' }).waitFor();
if ((await desktop.locator('.battle-monster').count()) !== 6) throw new Error('Battle is not 3v3');
await desktop.getByRole('button', { name: '最後まで送る' }).click();
await desktop.getByRole('button', { name: '結果を見る →' }).click();
await desktop.getByRole('button', { name: 'NEXT CYCLE 2 旅を続ける' }).waitFor();
if ((await desktop.locator('.result-roster > div').count()) !== 4) {
  throw new Error('Battle result does not show active and bench XP');
}
await desktop.screenshot({ path: '/tmp/code-monsters-result-desktop.png', fullPage: true });

const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
});
watchErrors(mobile);
await mobile.goto(target.toString(), { waitUntil: 'networkidle' });
await mobile.getByRole('heading', { name: '旅のはじまりを選ぶ' }).waitFor();
if ((await mobile.locator('.draft-grid .definition-card').count()) !== 3) {
  throw new Error('Mobile draft does not show three choices');
}
await assertFitsViewport(mobile, 'Mobile draft');
await mobile.screenshot({ path: '/tmp/code-monsters-draft-mobile.png' });

for (let round = 0; round < 3; round += 1) {
  const choices = mobile.locator('.draft-grid .definition-card');
  if ((await choices.count()) !== 3) throw new Error(`Mobile draft round ${round + 1} does not show three choices`);
  await choices.first().click();
}

await mobile.getByRole('heading', { name: '旅商人の棚' }).waitFor();
await assertFitsViewport(mobile, 'Mobile workshop');

const mobileActiveCard = mobile.locator('.team-zone.is-active .roster-card').first();
await mobileActiveCard.click();
await mobile.locator('dialog[open]').waitFor();
if ((await mobile.locator('.monster-dialog .stat-grid span').count()) !== 7) {
  throw new Error('Monster detail dialog does not show all seven stats');
}
await mobile.getByRole('button', { name: '閉じる' }).click();

await mobile.locator('.shop-monsters .buy-button').first().click();
const draggable = mobile.locator('.team-zone.is-active .roster-card').first();
const draggableBox = await draggable.boundingBox();
const benchBox = await mobile.locator('.team-zone.is-bench').boundingBox();
if (!draggableBox || !benchBox) throw new Error('Could not measure the long-press drag targets');
await mobile.mouse.move(draggableBox.x + draggableBox.width / 2, draggableBox.y + draggableBox.height / 2);
await mobile.mouse.down();
await mobile.waitForTimeout(500);
await mobile.mouse.move(benchBox.x + benchBox.width / 2, benchBox.y + benchBox.height / 2, { steps: 5 });
await mobile.mouse.up();
if ((await mobile.locator('.team-zone.is-active .roster-card').count()) !== 2) {
  throw new Error('Long-press drag did not move a monster from active to bench');
}
await mobile.screenshot({ path: '/tmp/code-monsters-workshop-mobile.png' });

await browser.close();
if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);

console.log(
  JSON.stringify({
    target: target.toString(),
    screenshots: [
      '/tmp/code-monsters-casual-desktop.png',
      '/tmp/code-monsters-result-desktop.png',
      '/tmp/code-monsters-draft-mobile.png',
      '/tmp/code-monsters-workshop-mobile.png',
    ],
  }),
);
