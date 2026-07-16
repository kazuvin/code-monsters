import { chromium } from 'playwright-core';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=swiftshader'],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(targetUrl, { waitUntil: 'networkidle' });

try {
  await page.locator('.reaction-list .sentence-block').first().waitFor({ state: 'visible', timeout: 15_000 });
} catch (error) {
  const diagnostics = {
    url: page.url(),
    title: await page.title(),
    body: (await page.locator('body').innerText().catch(() => '')).slice(0, 1_000),
    errors,
  };
  console.error(JSON.stringify(diagnostics, null, 2));
  throw error;
}

const normalProgram = page.locator('.program-list').first();
const normalRowClasses = await normalProgram.locator('.sentence-block').first().getAttribute('class');
const reactionRowClasses = await page.locator('.reaction-list .sentence-block').first().getAttribute('class');
const legacyReactionEditorCount = await page.locator('.reaction-editor').count();
const reactionCopy = (await page.locator('.reaction-loop').innerText()).replace(/\s+/g, ' ').trim();

const homeRunCard = page.locator('.shop-item').filter({ hasText: '敵をホームランする' }).first();
const homeRunCardText = (await homeRunCard.innerText()).replace(/\s+/g, ' ').trim();
await homeRunCard.getByRole('button', { name: /購入/ }).click();

await page.getByRole('button', { name: '＋ 通常作戦を追加' }).click();
const addedRow = normalProgram.locator('.sentence-block').last();
await addedRow.locator('.word-slot').last().click();
await page.locator('.choice-list button').filter({ hasText: '敵をホームランする' }).click();
const homeRunRow = normalProgram.locator('.sentence-block').filter({ hasText: '敵をホームランする' });
await homeRunRow.getByRole('button', { name: '上へ移動' }).click();
await homeRunRow.getByRole('button', { name: '上へ移動' }).click();
const program = (await normalProgram.innerText()).replace(/\s+/g, ' ').trim();

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();

const events = [];
let lastEventId = '';
let homeRunTargetX = null;
let knockbackTargetX = null;
for (let tick = 0; tick < 1200 && knockbackTargetX === null; tick += 1) {
  const battlefield = page.locator('.side-battlefield');
  const eventId = await battlefield.getAttribute('data-event-id');
  if (eventId && eventId !== lastEventId) {
    lastEventId = eventId;
    const active = page.locator('.unit-status-card.acting').first();
    const actor = (await active.locator('.status-id strong').textContent().catch(() => ''))?.trim() ?? '';
    const label = (await active.locator('.card-action-bubble').textContent().catch(() => ''))?.trim() ?? '';
    const event = { id: eventId, actor, label, heavyAnimationCount: await page.locator('.sprite.is-heavy').count() };
    events.push(event);
    if (label === 'ホームラン') {
      homeRunTargetX = await page.locator('.hit-spark').evaluate(element => Number.parseFloat(element.closest('.sprite').style.left));
    } else if (homeRunTargetX !== null && label === 'KNOCKBACK') {
      knockbackTargetX = await page.locator('.sprite.is-hit').evaluate(element => Number.parseFloat(element.style.left));
    }
  }
  await page.waitForTimeout(25);
}

const homeRunAnimationSeen = events.some(event => event.label === 'ホームラン' && event.heavyAnimationCount > 0);
await browser.close();

const knockbackDistance = homeRunTargetX === null || knockbackTargetX === null ? 0 : Math.abs(knockbackTargetX - homeRunTargetX);
console.log(JSON.stringify({ normalRowClasses, reactionRowClasses, legacyReactionEditorCount, reactionCopy, homeRunCardText, program, events, homeRunTargetX, knockbackTargetX, knockbackDistance, homeRunAnimationSeen, errors }, null, 2));

for (const classes of [normalRowClasses, reactionRowClasses]) {
  if (!classes?.includes('code-block') || !classes.includes('sentence-block')) throw new Error('通常作戦とリアクションが同じ行UIを使用していません');
}
if (legacyReactionEditorCount !== 0) throw new Error('旧リアクション専用カードUIが残っています');
if (!reactionCopy.includes('REACTION LOOP') || !reactionCopy.includes('もし') || !reactionCopy.includes('なら')) throw new Error('リアクションが通常作戦と同じ文型で表示されていません');
if (!homeRunCardText.includes('RARE') || !homeRunCardText.includes('KB 120')) throw new Error('ショップでホームランのレアリティとノックバック値を確認できません');
if (!program.startsWith('1 もし 射程範囲内 なら 敵をホームランする')) throw new Error('ホームランを作戦の先頭へ設定できませんでした');
if (!events.some(event => event.label === 'ホームラン')) throw new Error('ホームランの固有アクション表示を確認できませんでした');
if (!events.some(event => event.label === 'KNOCKBACK')) throw new Error('ホームラン後にノックバックイベントが発生しませんでした');
if (knockbackDistance < 25) throw new Error(`ホームランのノックバック距離が不足しています: ${knockbackDistance}`);
if (!homeRunAnimationSeen) throw new Error('ホームランの戦闘アニメーションを確認できませんでした');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
