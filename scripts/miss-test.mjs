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
await page.goto(targetUrl, { waitUntil: 'networkidle' });

const normalProgram = page.locator('.program-list').first();
const attackRow = normalProgram.locator('.sentence-block').first();
await attackRow.locator('.word-slot').nth(1).click();
await page.locator('.condition-choice-card').filter({ hasText: '射程範囲外' }).click();
const program = (await normalProgram.innerText()).replace(/\s+/g, ' ').trim();

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();

let missEvent = null;
let lastEventId = '';
for (let tick = 0; tick < 800 && !missEvent; tick += 1) {
  const battlefield = page.locator('.side-battlefield');
  const eventId = await battlefield.getAttribute('data-event-id');
  if (eventId && eventId !== lastEventId) {
    lastEventId = eventId;
    const active = page.locator('.unit-status-card.acting').first();
    const label =
      (
        await active
          .locator('.card-action-bubble')
          .textContent()
          .catch(() => '')
      )?.trim() ?? '';
    if (label.includes('MISS')) {
      missEvent = {
        id: eventId,
        actor: (await active.locator('.status-id strong').textContent())?.trim() ?? '',
        label,
        missAnimationCount: await page.locator('.sprite.is-miss').count(),
        missCallout: (await page.locator('.miss-callout').textContent())?.replace(/\s+/g, ' ').trim() ?? '',
        attackFxCount: await page.locator('.sprite.is-miss .attack-fx').count(),
        hitSparkCount: await page.locator('.hit-spark').count(),
        targetHitCount: await page.locator('.sprite.is-hit').count(),
      };
      await page.waitForTimeout(150);
      missEvent.calloutOpacity = Number.parseFloat(
        await page.locator('.miss-callout').evaluate((element) => getComputedStyle(element).opacity),
      );
      await page.screenshot({ path: '/tmp/code-monsters-miss.png', fullPage: true });
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

if (!program.startsWith('1 もし このユニットから見て 一番近い敵 が 射程範囲外 なら 通常攻撃'))
  throw new Error('射程外で攻撃する空振り作戦を構成できませんでした');
if (!missEvent) throw new Error('空振りイベントを観測できませんでした');
if (!missEvent.label.includes('攻撃｜MISS')) throw new Error('ステータス表示で空振りを確認できません');
if (missEvent.missAnimationCount !== 1 || missEvent.attackFxCount !== 1)
  throw new Error('空振り時に攻撃モーションが再生されていません');
if (!missEvent.missCallout.includes('MISS') || !missEvent.missCallout.includes('空振り'))
  throw new Error('戦場に空振り表示が出ていません');
if (missEvent.calloutOpacity < 0.8) throw new Error(`空振り表示の視認性が不足しています: ${missEvent.calloutOpacity}`);
if (missEvent.hitSparkCount !== 0 || missEvent.targetHitCount !== 0)
  throw new Error('空振り時に対象のヒット演出が発生しています');
if (!missLog.includes('空振り（射程外）')) throw new Error('戦闘ログに空振りが記録されていません');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
