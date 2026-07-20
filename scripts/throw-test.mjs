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
  Math.random = () => 0.25 / 0x7fffffff;
});
await page.goto(targetUrl, { waitUntil: 'networkidle' });

const throwCard = page.locator('.instruction-shop-item').filter({ hasText: '背負い投げ' }).first();
const shopText = (await throwCard.innerText()).replace(/\s+/g, ' ').trim();
await throwCard.getByRole('button', { name: /購入/ }).click();

const firstProgramBlock = page.locator('.workbench > .program-list').first().locator('.sentence-block').first();
await firstProgramBlock.locator('.word-slot').last().click();
await page.locator('.choice-list .instruction-choice-card').filter({ hasText: '背負い投げ' }).click();
const configuredProgram = (await firstProgramBlock.innerText()).replace(/\s+/g, ' ').trim();

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();

let throwSeen = false;
let targetMovedBehind = false;
let throwAnimation = '';
let thrownAnimation = '';
const actions = new Set();
for (let tick = 0; tick < 900; tick += 1) {
  const actionLabel = await page.locator('.side-battlefield').getAttribute('data-action-label');
  if (actionLabel) actions.add(actionLabel.trim());
  const volt = page.locator('.sprite.ally.unit-volt').first();
  const className = (await volt.getAttribute('class')) ?? '';
  if (className.includes('is-throw')) {
    throwSeen = true;
    throwAnimation = await volt.locator('.sprite-body').evaluate((element) => getComputedStyle(element).animationName);
  }
  const thrownStates = await page
    .locator('.sprite.enemy.is-thrown .sprite-body')
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).animationName));
  if (thrownStates.length > 0) thrownAnimation = thrownStates[0];
  const voltX = Number.parseFloat((await volt.getAttribute('style'))?.match(/left:\s*([\d.]+)%/)?.[1] ?? '0');
  const enemyPositions = await page
    .locator('.sprite.enemy')
    .evaluateAll((elements) =>
      elements
        .filter((element) => !element.classList.contains('is-dead'))
        .map((element) => Number.parseFloat(element.style.left)),
    );
  if (throwSeen && enemyPositions.some((enemyX) => enemyX < voltX)) targetMovedBehind = true;
  if (throwSeen && targetMovedBehind && thrownAnimation && actions.has('THROW')) break;
  await page.waitForTimeout(35);
}

await browser.close();

const result = {
  shopText,
  configuredProgram,
  throwSeen,
  targetMovedBehind,
  throwAnimation,
  thrownAnimation,
  actions: [...actions],
  errors,
};
console.log(JSON.stringify(result, null, 2));

if (!shopText.includes('RARE / THROW') || !shopText.includes('基礎DMG 20') || !shopText.includes('着地 背後 6 m'))
  throw new Error('背負い投げのショップ表示が不正です');
if (
  !configuredProgram.includes('このユニットから見て 対戦相手 が 射程範囲内') ||
  !configuredProgram.includes('背負い投げ')
)
  throw new Error('背負い投げを通常作戦へ設定できません');
if (!throwSeen || !throwAnimation.startsWith('ability-throw-'))
  throw new Error('背負い投げの戦闘アニメーションを確認できません');
if (!thrownAnimation.startsWith('ability-thrown-')) throw new Error('投げられた敵の着地アニメーションを確認できません');
if (!targetMovedBehind || ![...actions].some((label) => label.split(' / ').includes('THROW')))
  throw new Error('背負い投げで敵を使用者の背後へ移動できません');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
