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
  Math.random = () => 1.25 / 0x7fffffff;
});
await page.goto(targetUrl, { waitUntil: 'networkidle' });

const corrosionCore = page.locator('.shop-item:not(.instruction-shop-item)').filter({ hasText: 'コロージョンコア' });
await corrosionCore.getByRole('button', { name: /購入/ }).click();

const firstProgramBlock = page.locator('.workbench > .program-list').first().locator('.sentence-block').first();
await firstProgramBlock.locator('.word-slot').first().click();
await page.locator('.condition-choice-card').filter({ hasText: 'いつでも' }).click();
await firstProgramBlock.locator('.word-slot').last().click();
await page.locator('.choice-list .instruction-choice-card').filter({ hasText: '腐食弾を投げ込む' }).click();
const configuredProgram = (await firstProgramBlock.innerText()).replace(/\s+/g, ' ').trim();

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();

let lobSeen = false;
let lobMoved = false;
let lobRose = false;
let lobFell = false;
let zoneBeforeLanding = false;
let zoneSeen = false;
let landingLabel = '';
let firstX = null;
let firstY = null;
let peakY = Number.NEGATIVE_INFINITY;
let zoneY = null;
for (let tick = 0; tick < 1200 && !(zoneSeen && landingLabel); tick += 1) {
  const actionLabel = (await page.locator('.side-battlefield').getAttribute('data-action-label')) ?? '';
  if (actionLabel.includes('コロージョンロブ｜着地')) landingLabel = actionLabel;
  const lob = page.locator('.spatial-projectile[data-projectile-kind="lob"]').first();
  const zone = page.locator('.battle-zone[data-zone-id="corrosion-field"]').first();
  const lobCount = await lob.count();
  const zoneCount = await zone.count();
  if (lobCount > 0) {
    const style = (await lob.getAttribute('style')) ?? '';
    const x = Number.parseFloat(style.match(/left:\s*([\d.-]+)%/)?.[1] ?? '0');
    const y = Number.parseFloat((await lob.getAttribute('data-y')) ?? '0');
    if (!lobSeen) {
      lobSeen = true;
      firstX = x;
      firstY = y;
      peakY = y;
    } else {
      lobMoved ||= Math.abs(x - firstX) > 1;
      lobRose ||= y > firstY + 4;
      peakY = Math.max(peakY, y);
      lobFell ||= peakY - y > 3;
    }
    zoneBeforeLanding ||= zoneCount > 0;
  }
  if (zoneCount > 0) {
    zoneSeen = true;
    zoneY = Number.parseFloat((await zone.getAttribute('data-y')) ?? 'NaN');
  }
  await page.waitForTimeout(25);
}

await browser.close();

const result = {
  configuredProgram,
  lobSeen,
  lobMoved,
  lobRose,
  lobFell,
  peakY,
  zoneBeforeLanding,
  zoneSeen,
  zoneY,
  landingLabel,
  errors,
};
console.log(JSON.stringify(result, null, 2));

if (!configuredProgram.includes('いつでも') || !configuredProgram.includes('腐食弾を投げ込む'))
  throw new Error('腐食弾の投擲を通常作戦へ設定できません');
if (!lobSeen || !lobMoved || !lobRose || !lobFell) throw new Error('腐食弾が上昇・下降する放物線を描いていません');
if (zoneBeforeLanding) throw new Error('腐食弾が空中にある間に毒床が生成されています');
if (!zoneSeen || zoneY !== 0) throw new Error('腐食弾の着地地点に地面Y=0の毒床が生成されていません');
if (!landingLabel.includes('コロージョンロブ｜着地')) throw new Error('腐食弾の着地イベントが表示されていません');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
