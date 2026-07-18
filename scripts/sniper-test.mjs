import { chromium } from 'playwright-core';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=swiftshader'],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  Math.random = () => 9.25 / 0x7fffffff;
});
await page.goto(targetUrl, { waitUntil: 'networkidle' });

const arrowCard = page.locator('.shop-item').filter({ hasText: 'アロー' }).first();
await page.locator('.unit-tabs button').filter({ hasText: 'メンダー' }).click();
await page.getByRole('button', { name: /売却/ }).click();
await arrowCard.getByRole('button', { name: /購入/ }).click();
await page.locator('.inventory button').filter({ hasText: 'アロー' }).click();
await page.locator('.unit-tabs button').filter({ hasText: 'アロー' }).click();

const normalProgram = page.locator('.program-list').first();
await normalProgram
  .locator('.sentence-block')
  .filter({ hasText: '前進する' })
  .getByRole('button', { name: '削除' })
  .click();
await page.getByRole('button', { name: '＋ 通常作戦を追加' }).click();
await page.getByRole('button', { name: '＋ 通常作戦を追加' }).click();
const program = (await normalProgram.innerText()).replace(/\s+/g, ' ').trim();

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();

const events = [];
const sniperShots = [];
let lastEventId = '';
for (let tick = 0; tick < 800 && sniperShots.length < 3; tick += 1) {
  const eventId = await page.locator('.side-battlefield').getAttribute('data-event-id');
  if (eventId && eventId !== lastEventId) {
    lastEventId = eventId;
    const readout = page.locator('.battle-action-readout').first();
    const actor = await readout
      .locator('span')
      .first()
      .textContent()
      .catch(() => '');
    const label = await readout
      .locator('b')
      .textContent()
      .catch(() => '');
    const bastion = page
      .locator('.status-group')
      .filter({ hasText: '敵ユニット' })
      .locator('.unit-status-card')
      .filter({ hasText: 'バスティオン' });
    const cooldownWidth = Number.parseFloat(
      (await bastion.locator('.status-cooldown i').getAttribute('style'))?.match(/[\d.]+/)?.[0] ?? '0',
    );
    const projectileCount = await page.locator('.battle-projectile.projectile-arrow').count();
    const projectileAnimation =
      projectileCount > 0
        ? await page
            .locator('.battle-projectile.projectile-arrow')
            .first()
            .evaluate((element) => getComputedStyle(element).animationName)
        : '';
    const event = {
      id: eventId,
      actor: actor?.trim() ?? '',
      label: label?.trim() ?? '',
      targetFlinchCount: await page.locator('.sprite.is-hit').count(),
      hitSparkCount: await page.locator('.hit-spark').count(),
      projectileCount,
      projectileAnimation,
      projectilePositions: [],
      bastionCooldownWidth: cooldownWidth,
    };
    events.push(event);
    if (event.actor === 'アロー' && event.label === '狙撃') sniperShots.push(event);
  }
  const activeShot = sniperShots.find((shot) => shot.id === eventId);
  if (activeShot && (await page.locator('.battle-projectile.projectile-arrow').count()) > 0) {
    const projectileX = await page
      .locator('.battle-projectile.projectile-arrow')
      .first()
      .evaluate((element) => element.getBoundingClientRect().x);
    activeShot.projectilePositions.push(Math.round(projectileX));
  }
  await page.waitForTimeout(25);
}

await browser.close();

console.log(JSON.stringify({ program, events, sniperShots, errors }, null, 2));

if ((program.match(/通常攻撃/g) ?? []).length !== 3) throw new Error('アローの3連続攻撃を構成できませんでした');
if (sniperShots.length !== 3) throw new Error('アローの3連続狙撃を観測できませんでした');
if (events.some((event) => event.actor === 'アロー' && event.label === 'KNOCKBACK'))
  throw new Error('遠距離通常攻撃でKNOCKBACKイベントが発生しています');
if (sniperShots.some((event) => event.targetFlinchCount > 0))
  throw new Error('遠距離通常攻撃で対象のよろけイベントが発生しています');
if (sniperShots.some((event) => event.hitSparkCount === 0))
  throw new Error('ノックバックを抑止した狙撃の命中表示が失われています');
if (sniperShots.some((event) => event.projectileCount === 0 || event.projectileAnimation !== 'projectile-flight'))
  throw new Error('狙撃時に飛翔する矢のアニメーションが表示されていません');
if (
  !sniperShots.some(
    (event) =>
      event.projectilePositions.length >= 2 &&
      Math.max(...event.projectilePositions) - Math.min(...event.projectilePositions) >= 40,
  )
)
  throw new Error('狙撃の矢が敵に向かって画面上を移動していません');
if (
  sniperShots[0].bastionCooldownWidth < 100 &&
  sniperShots.at(-1).bastionCooldownWidth <= sniperShots[0].bastionCooldownWidth
)
  throw new Error('連続狙撃の演出中に対象のクールダウンが停止しています');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
