import { chromium } from 'playwright-core';

const requestedTarget = process.argv.slice(2).find((argument) => argument !== '--') ?? 'http://127.0.0.1:5173';
const target = new URL(requestedTarget);
target.searchParams.set('shopSeed', target.searchParams.get('shopSeed') ?? '73');
target.searchParams.set('enemyBuildFixture', target.searchParams.get('enemyBuildFixture') ?? 'charge');
target.searchParams.set('enemyCoreFixture', target.searchParams.get('enemyCoreFixture') ?? 'resonance');

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

const longDrag = async (page, source, destination) => {
  const sourceBox = await source.boundingBox();
  const destinationBox = await destination.boundingBox();
  if (!sourceBox || !destinationBox) throw new Error('Could not measure drag targets');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(380);
  await page.mouse.move(destinationBox.x + destinationBox.width / 2, destinationBox.y + destinationBox.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForTimeout(100);
};

const desktop = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
watchErrors(desktop);
await desktop.goto(target.toString(), { waitUntil: 'networkidle' });
await desktop.getByRole('heading', { name: 'CODE MONSTERS' }).waitFor();

if ((await desktop.locator('.circuit-cell').count()) !== 25) throw new Error('Desktop circuit is not 5x5');
if ((await desktop.locator('.shop-card, .shop-empty').count()) !== 6) throw new Error('Shop does not have six slots');
if ((await desktop.locator('.circuit-cell .block-button').count()) !== 0) {
  throw new Error('Player circuit should start empty');
}
if ((await desktop.locator('.heart-button .heart-port').count()) !== 4) {
  throw new Error('Heart does not expose four connectors');
}
if (
  (await desktop.locator('.shop-card .axis-badge.is-trait').count()) < (await desktop.locator('.shop-card').count()) ||
  (await desktop.locator('.shop-card .axis-badge.is-weapon').count()) < (await desktop.locator('.shop-card').count())
) {
  throw new Error('Shop cards do not show both state and output axes');
}

await desktop.getByRole('button', { name: /カード一覧/ }).click();
await desktop.locator('.catalog-screen').waitFor();
if ((await desktop.locator('.catalog-card').count()) !== 63) throw new Error('Catalog does not show all 63 cards');
for (const label of ['無属性', '毒', 'チャージ', 'コイン', '回路演算']) {
  if ((await desktop.locator('.catalog-filters button').filter({ hasText: label }).count()) === 0) {
    throw new Error(`Catalog is missing the ${label} filter`);
  }
}
await desktop.locator('.catalog-filters button').filter({ hasText: '回路演算' }).click();
const operatorCount = await desktop.locator('.catalog-card').count();
if (operatorCount <= 0 || operatorCount >= 63) throw new Error('Circuit operator filter did not narrow the catalog');
await desktop.getByRole('button', { name: /すべて/ }).click();

const splitter = desktop.locator('.catalog-card').filter({ hasText: '枝光矢' });
await splitter.click();
const desktopDialog = desktop.getByRole('dialog');
await desktopDialog.waitFor();
if (
  (await desktopDialog.getByText('状態軸', { exact: true }).count()) !== 1 ||
  (await desktopDialog.getByText('出力軸', { exact: true }).count()) !== 1
) {
  throw new Error('Card detail does not explain state and output axes');
}
const diagram = desktopDialog.locator('.circuit-scope-diagram[data-diagram-kind="branch"]');
if ((await diagram.count()) !== 1) throw new Error('Splitter detail is missing its branch diagram');
if ((await diagram.locator('.circuit-diagram-cell').count()) !== 25) {
  throw new Error('Circuit scope diagram is not a complete 5x5 grid');
}
if ((await diagram.locator('.circuit-diagram-node.is-target').count()) !== 1) {
  throw new Error('Circuit scope diagram does not keep the selected node in the center');
}
if (!(await diagram.locator('figcaption').textContent())?.includes('分ける前と同じ')) {
  throw new Error('Splitter diagram does not explain payload conservation');
}
await desktop.screenshot({ path: '/tmp/code-monsters-packet-detail-desktop.png' });
await desktop.getByRole('button', { name: '詳細を閉じる' }).click();
await desktop.screenshot({ path: '/tmp/code-monsters-catalog-desktop.png', fullPage: true });

await desktop.getByRole('button', { name: /01 回路/ }).click();
const firstOffer = desktop.locator('.shop-card').first();
const coinsBefore = Number((await desktop.locator('.coin-readout b').textContent())?.trim());
await firstOffer.getByRole('button', { name: /買う/ }).click();
const coinsAfter = Number((await desktop.locator('.coin-readout b').textContent())?.trim());
if (!(coinsAfter < coinsBefore)) throw new Error('Buying a card did not spend coins');
const destination = desktop.locator('[data-row="2"][data-column="3"]');
await longDrag(desktop, desktop.locator('.rack-block').first(), destination);
if ((await destination.locator('.block-button').count()) !== 1) throw new Error('Long-press drag did not place a card');
await destination.locator('.block-button').click();
await desktopDialog.waitFor();
if (!/パケット|通過する|届いた/.test((await desktopDialog.locator('.dialog-copy > p').textContent()) ?? '')) {
  throw new Error('Placed card detail does not use packet-language copy');
}
await desktop.getByRole('button', { name: '詳細を閉じる' }).click();
await desktop.screenshot({ path: '/tmp/code-monsters-circuit-desktop.png', fullPage: true });

await desktop.getByRole('button', { name: /戦闘開始/ }).click();
await desktop.locator('.battle-screen').waitFor();
if ((await desktop.locator('.arena-fighter').count()) !== 2) throw new Error('Battle does not show two fighters');
if ((await desktop.locator('.battle-circuit-cell').count()) !== 50) {
  throw new Error('Battle does not show two complete 5x5 circuits');
}
await desktop.locator('.battle-circuit-summary.team-enemy [data-pulse-step]').first().waitFor({ timeout: 5000 });
if ((await desktop.locator('.battle-circuit-cell .block-port.is-conducting').count()) === 0) {
  throw new Error('Packet battle did not visualize circuit flow');
}
await desktop.screenshot({ path: '/tmp/code-monsters-packet-battle-desktop.png', fullPage: true });

const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
});
watchErrors(mobile);
await mobile.goto(target.toString(), { waitUntil: 'networkidle' });
await mobile.getByRole('button', { name: /カード一覧/ }).click();
await mobile.locator('.catalog-screen').waitFor();
if ((await mobile.locator('.catalog-card').count()) !== 63) throw new Error('Mobile catalog is incomplete');
await mobile.locator('.catalog-card').filter({ hasText: '枝光矢' }).click();
await mobile.getByRole('dialog').waitFor();
const mobileDiagram = mobile.locator('.circuit-scope-diagram[data-diagram-kind="branch"]');
if ((await mobileDiagram.count()) !== 1) throw new Error('Mobile packet diagram is missing');
const mobileDialogBox = await mobile.locator('.block-dialog').boundingBox();
if (!mobileDialogBox || mobileDialogBox.x < 0 || mobileDialogBox.x + mobileDialogBox.width > 390) {
  throw new Error(`Mobile packet detail is clipped: ${JSON.stringify(mobileDialogBox)}`);
}
await mobile.screenshot({ path: '/tmp/code-monsters-packet-detail-mobile.png' });
await mobile.getByRole('button', { name: '詳細を閉じる' }).click();
await mobile.getByRole('button', { name: /01 回路/ }).click();
const cellBounds = await mobile.locator('.circuit-cell').evaluateAll((cells) =>
  cells.map((cell) => {
    const box = cell.getBoundingClientRect();
    return { left: box.left, right: box.right };
  }),
);
if (cellBounds.some((box) => box.left < 0 || box.right > 390)) {
  throw new Error(`Mobile 5x5 circuit is clipped: ${JSON.stringify(cellBounds)}`);
}
if ((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) > 1) {
  throw new Error('Mobile page overflows horizontally');
}
await mobile.screenshot({ path: '/tmp/code-monsters-circuit-mobile.png', fullPage: true });

await browser.close();
if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);

console.log(
  JSON.stringify({
    target: target.toString(),
    packetOperatorCards: operatorCount,
    screenshots: [
      '/tmp/code-monsters-packet-detail-desktop.png',
      '/tmp/code-monsters-catalog-desktop.png',
      '/tmp/code-monsters-circuit-desktop.png',
      '/tmp/code-monsters-packet-battle-desktop.png',
      '/tmp/code-monsters-packet-detail-mobile.png',
      '/tmp/code-monsters-circuit-mobile.png',
    ],
  }),
);
