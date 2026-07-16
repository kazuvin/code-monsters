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
const startingConditions = await page.locator('.condition-choice-card').allInnerTexts();
await normalProgram.locator('.sentence-block').first().locator('.word-slot').last().click();
const startingActions = await page.locator('.instruction-choice-card').allInnerTexts();
const startingShopInstructions = await page.locator('.instruction-shop-item').allInnerTexts();

const knockAwayCard = page.locator('.shop-item').filter({ hasText: 'ちょっと吹き飛ばす' }).first();
const knockAwayCardText = (await knockAwayCard.innerText()).replace(/\s+/g, ' ').trim();
await knockAwayCard.getByRole('button', { name: /購入/ }).click();

await page.getByRole('button', { name: '＋ 通常作戦を追加' }).click();
const addedRow = normalProgram.locator('.sentence-block').last();
await addedRow.locator('.word-slot').last().click();
const knockAwayChoice = page.locator('.instruction-choice-card').filter({ hasText: 'ちょっと吹き飛ばす' });
const knockAwayChoiceText = (await knockAwayChoice.innerText()).replace(/\s+/g, ' ').trim();
await page.screenshot({ path: '/tmp/code-monsters-action-cards.png', fullPage: true });
await knockAwayChoice.click();
const knockAwayRow = normalProgram.locator('.sentence-block').filter({ hasText: 'ちょっと吹き飛ばす' });
await knockAwayRow.getByRole('button', { name: '上へ移動' }).click();
await knockAwayRow.getByRole('button', { name: '上へ移動' }).click();
const program = (await normalProgram.innerText()).replace(/\s+/g, ' ').trim();

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();

const events = [];
let lastEventId = '';
let knockAwayTargetX = null;
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
    if (label === '吹き飛ばす') {
      knockAwayTargetX = await page.locator('.hit-spark').evaluate(element => Number.parseFloat(element.closest('.sprite').style.left));
    } else if (knockAwayTargetX !== null && label === 'KNOCKBACK') {
      knockbackTargetX = await page.locator('.sprite.is-hit').evaluate(element => Number.parseFloat(element.style.left));
    }
  }
  await page.waitForTimeout(25);
}

const knockAwayAnimationSeen = events.some(event => event.label === '吹き飛ばす' && event.heavyAnimationCount > 0);
await browser.close();

const knockbackDistance = knockAwayTargetX === null || knockbackTargetX === null ? 0 : Math.abs(knockbackTargetX - knockAwayTargetX);
console.log(JSON.stringify({ normalRowClasses, reactionRowClasses, legacyReactionEditorCount, reactionCopy, startingConditions, startingActions, startingShopInstructions, knockAwayCardText, knockAwayChoiceText, program, events, knockAwayTargetX, knockbackTargetX, knockbackDistance, knockAwayAnimationSeen, errors }, null, 2));

for (const classes of [normalRowClasses, reactionRowClasses]) {
  if (!classes?.includes('code-block') || !classes.includes('sentence-block')) throw new Error('通常作戦とリアクションが同じ行UIを使用していません');
}
if (legacyReactionEditorCount !== 0) throw new Error('旧リアクション専用カードUIが残っています');
if (!reactionCopy.includes('REACTION LOOP') || !reactionCopy.includes('もし') || !reactionCopy.includes('なら')) throw new Error('リアクションが通常作戦と同じ文型で表示されていません');
if (startingConditions.length !== 2 || !startingConditions.some(text => text.includes('射程範囲内')) || !startingConditions.some(text => text.includes('射程範囲外'))) throw new Error('初期条件は「射程範囲内」「射程範囲外」の2つである必要があります');
if (startingActions.length !== 2 || !startingActions.some(text => text.includes('通常攻撃')) || !startingActions.some(text => text.includes('前進する'))) throw new Error('初期行動は「通常攻撃」「前進する」の2つである必要があります');
if (startingShopInstructions.some(text => text.includes('通常攻撃') || text.includes('前進する'))) throw new Error('初期行動がショップにも並んでいます');
if (!knockAwayCardText.includes('RARE') || !knockAwayCardText.includes('KB出力 120') || !knockAwayCardText.includes('どっか遠くへ、ぽん。じゃあね。')) throw new Error('ショップで技名・遊びのある説明・定量効果を確認できません');
if (!knockAwayChoiceText.includes('ちょっと吹き飛ばす') || !knockAwayChoiceText.includes('ABILITY') || !knockAwayChoiceText.includes('基礎DMG 35') || !knockAwayChoiceText.includes('KB出力 120')) throw new Error('行動選択カードで技名・能力値を確認できません');
if (!program.startsWith('1 もし 射程範囲内 なら ちょっと吹き飛ばす')) throw new Error('「ちょっと吹き飛ばす」を作戦の先頭へ設定できませんでした');
if (!events.some(event => event.label === '吹き飛ばす')) throw new Error('「ちょっと吹き飛ばす」の固有アクション表示を確認できませんでした');
if (!events.some(event => event.label === 'KNOCKBACK')) throw new Error('「ちょっと吹き飛ばす」の後にノックバックイベントが発生しませんでした');
if (knockbackDistance < 25) throw new Error(`「ちょっと吹き飛ばす」のノックバック距離が不足しています: ${knockbackDistance}`);
if (!knockAwayAnimationSeen) throw new Error('「ちょっと吹き飛ばす」の戦闘アニメーションを確認できませんでした');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
