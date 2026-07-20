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
  Math.random = () => 8.25 / 0x7fffffff;
});
await page.goto(targetUrl, { waitUntil: 'networkidle' });

const jumpCard = page.locator('.instruction-shop-item').filter({ hasText: '上昇推力をかける' }).first();
const shopText = (await jumpCard.innerText()).replace(/\s+/g, ' ').trim();
await jumpCard.getByRole('button', { name: /購入/ }).click();

const firstProgramBlock = page.locator('.workbench > .program-list').first().locator('.sentence-block').first();
await firstProgramBlock.locator('.word-slot').last().click();
await page.locator('.choice-list .instruction-choice-card').filter({ hasText: '上昇推力をかける' }).click();
const configuredProgram = (await firstProgramBlock.innerText()).replace(/\s+/g, ' ').trim();

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();

let flightEventSeen = false;
let cannedJumpAnimation = false;
let returnedToFloor = false;
let ascentSeen = false;
let descentSeen = false;
const xs = [];
const ys = [];
const vys = [];
for (let tick = 0; tick < 900; tick += 1) {
  const volt = page.locator('.sprite.ally.unit-volt').first();
  const className = (await volt.getAttribute('class')) ?? '';
  const x = Number.parseFloat((await volt.getAttribute('data-x')) ?? '0');
  const y = Number.parseFloat((await volt.getAttribute('data-y')) ?? '0');
  const vy = Number.parseFloat((await volt.getAttribute('data-vy')) ?? '0');
  xs.push(x);
  ys.push(y);
  vys.push(vy);
  if (className.includes('is-flight')) {
    flightEventSeen = true;
    const animation = await volt.locator('.sprite-body').evaluate((element) => getComputedStyle(element).animationName);
    cannedJumpAnimation ||= animation.startsWith('ability-jump-');
  }
  if (y > 4 && vy > 0) ascentSeen = true;
  if (y > 4 && vy < 0) descentSeen = true;
  if (flightEventSeen && ascentSeen && descentSeen && y <= 0.1) {
    returnedToFloor = true;
    break;
  }
  await page.waitForTimeout(35);
}

const staleAltitudeAttribute = await page.locator('.sprite.ally.unit-volt').first().getAttribute('data-altitude');
await browser.close();

const horizontalTravel = Math.max(...xs) - Math.min(...xs);
const peakHeight = Math.max(...ys);
const result = {
  shopText,
  configuredProgram,
  flightEventSeen,
  ascentSeen,
  descentSeen,
  returnedToFloor,
  horizontalTravel,
  peakHeight,
  cannedJumpAnimation,
  staleAltitudeAttribute,
  errors,
};
console.log(JSON.stringify(result, null, 2));

if (!shopText.includes('RARE / JUMP') || !shopText.includes('水平速度 +12') || !shopText.includes('垂直速度 +54'))
  throw new Error('ジャンプジェットの速度ベース表示が不正です');
if (!configuredProgram.includes('上昇推力をかける')) throw new Error('ジャンプジェットを通常作戦へ設定できません');
if (!flightEventSeen || !ascentSeen || !descentSeen || !returnedToFloor)
  throw new Error('Y座標と重力による上昇・下降・接地を確認できません');
if (horizontalTravel < 4 || peakHeight < 30) throw new Error('ジャンプジェットの大跳躍量が不足しています');
if (cannedJumpAnimation) throw new Error('廃止したジャンプ専用アニメーションが再生されています');
if (staleAltitudeAttribute !== null) throw new Error('地上・空中のカテゴリ属性が戦闘表示に残っています');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
