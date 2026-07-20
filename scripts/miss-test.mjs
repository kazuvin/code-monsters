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
  Math.random = () => 38.25 / 0x7fffffff;
});
await page.goto(targetUrl, { waitUntil: 'networkidle' });

const skillCard = page.locator('.instruction-shop-item').filter({ hasText: '縦断魔法を放つ' }).first();
await skillCard.getByRole('button', { name: /購入/ }).click();
const firstProgramBlock = page.locator('.workbench > .program-list').first().locator('.sentence-block').first();
await firstProgramBlock.locator('.word-slot').first().click();
await page.locator('.condition-choice-card').filter({ hasText: 'いつでも' }).click();
await firstProgramBlock.locator('.word-slot').last().click();
await page.locator('.choice-list .instruction-choice-card').filter({ hasText: '縦断魔法を放つ' }).click();
const program = (await firstProgramBlock.innerText()).replace(/\s+/g, ' ').trim();

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();

let missEvent = null;
let lastEventId = '';
for (let tick = 0; tick < 800 && !missEvent; tick += 1) {
  const battlefield = page.locator('.side-battlefield');
  const eventId = await battlefield.getAttribute('data-event-id');
  if (eventId && eventId !== lastEventId) {
    lastEventId = eventId;
    const readout = page.locator('.battle-action-readout').first();
    const label = (await readout.textContent().catch(() => ''))?.trim() ?? '';
    if (label.includes('コロージョン') || label.includes('バーティカルランス')) {
      const isMiss = label.includes('MISS');
      if (isMiss) {
        missEvent = {
          id: eventId,
          label,
          shapeCount: await page.locator('[data-attack-shape="box"]').count(),
          infiniteHeightCount: await page.locator('.spatial-attack-shape.is-infinite-height').count(),
          missCallout: (await page.locator('.miss-callout').textContent())?.replace(/\s+/g, ' ').trim() ?? '',
          hitSparkCount: await page.locator('.hit-spark').count(),
          targetHitCount: await page.locator('.sprite.is-hit').count(),
        };
        await page.waitForTimeout(120);
        missEvent.calloutOpacity = Number.parseFloat(
          await page.locator('.miss-callout').evaluate((element) => getComputedStyle(element).opacity),
        );
      }
    }
  }
  await page.waitForTimeout(25);
}

await page.locator('.battle-controls button').first().click();
await page.getByRole('button', { name: /^ログ/ }).click();
const missLog = (
  await page
    .locator('.log.miss')
    .first()
    .innerText()
    .catch(() => '')
)
  .replace(/\s+/g, ' ')
  .trim();
await browser.close();

console.log(JSON.stringify({ program, missEvent, missLog, errors }, null, 2));

if (!program.includes('いつでも') || !program.includes('縦断魔法を放つ'))
  throw new Error('無条件の空間攻撃プログラムを構成できませんでした');
if (!missEvent) throw new Error('座標不一致による空振りイベントを観測できませんでした');
if (!missEvent.label.includes('バーティカルランス｜MISS')) throw new Error('空間攻撃のMISS表示が不正です');
if (missEvent.shapeCount !== 1 || missEvent.infiniteHeightCount !== 1)
  throw new Error('幅20m・高さ無限の矩形判定が描画されていません');
if (!missEvent.missCallout.includes('MISS') || missEvent.calloutOpacity < 0.8)
  throw new Error('空振り表示の視認性が不足しています');
if (missEvent.hitSparkCount !== 0 || missEvent.targetHitCount !== 0)
  throw new Error('形状が交差しないのに対象のヒット演出が発生しています');
if (!missLog.includes('攻撃形状と相手座標が交差せず')) throw new Error('空間MISSが戦闘ログに記録されていません');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
