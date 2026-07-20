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

const programList = page.locator('.workbench > .program-list').first();
while ((await programList.locator('.sentence-block').count()) > 1) {
  await programList.locator('.sentence-block').last().getByRole('button', { name: '削除' }).click();
}
const firstProgramBlock = programList.locator('.sentence-block').first();
await firstProgramBlock.locator('.word-slot').first().click();
await page.locator('.condition-choice-card').filter({ hasText: 'いつでも' }).click();
await firstProgramBlock.locator('.word-slot').last().click();
await page.locator('.instruction-choice-card').filter({ hasText: '推力で接近する' }).click();
const configuredProgram = (await firstProgramBlock.innerText()).replace(/\s+/g, ' ').trim();

await page.getByRole('button', { name: /戦闘開始/ }).click();
const actor = page.locator('.sprite.ally').first();
let peakVx = 0;
let burstTick = null;
let burstOriginX = null;
let settledTick = null;
let settledX = null;
for (let tick = 0; tick < 320; tick += 1) {
  const vx = Number.parseFloat((await actor.getAttribute('data-vx')) ?? '0');
  const x = Number.parseFloat((await actor.getAttribute('data-x')) ?? '0');
  peakVx = Math.max(peakVx, Math.abs(vx));
  if (burstTick === null && Math.abs(vx) >= 35) {
    burstTick = tick;
    burstOriginX = x;
  }
  if (burstTick !== null && tick > burstTick && Math.abs(vx) <= 0.05) {
    settledTick = tick;
    settledX = x;
    break;
  }
  await page.waitForTimeout(25);
}

await page.waitForTimeout(250);
const finalX = Number.parseFloat((await actor.getAttribute('data-x')) ?? '0');
await browser.close();

const settleSeconds = burstTick !== null && settledTick !== null ? ((settledTick - burstTick) * 25) / 1000 : null;
const controlledTravel = burstOriginX !== null && settledX !== null ? settledX - burstOriginX : null;
const residualDrift = settledX !== null ? Math.abs(finalX - settledX) : null;
const result = {
  configuredProgram,
  peakVx,
  settleSeconds,
  controlledTravel,
  residualDrift,
  errors,
};
console.log(JSON.stringify(result, null, 2));

if (!configuredProgram.includes('いつでも') || !configuredProgram.includes('推力で接近する'))
  throw new Error('接近推力だけを通常作戦へ設定できません');
if (peakVx < 35) throw new Error(`接近推力の初速が不足しています: ${peakVx}`);
if (settleSeconds === null || settleSeconds > 1)
  throw new Error(`接近推力が短時間で制動していません: ${settleSeconds}`);
if (controlledTravel === null || controlledTravel < 16 || controlledTravel > 20)
  throw new Error(`接近推力の制御距離が不正です: ${controlledTravel}`);
if (residualDrift === null || residualDrift > 0.5) throw new Error(`接近推力の終了後も滑っています: ${residualDrift}`);
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
