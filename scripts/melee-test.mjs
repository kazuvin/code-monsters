import { chromium } from 'playwright-core';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=swiftshader'],
});
const errors = [];

const openDebugRoom = async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'デバッグ' }).click();
  return page;
};

const meleePage = await openDebugRoom();
await meleePage.getByRole('button', { name: /計測開始/ }).click();
let meleeEffect = null;
for (let tick = 0; tick < 180 && !meleeEffect; tick += 1) {
  const sector = meleePage.locator('[data-attack-shape="sector"]').first();
  if ((await sector.count()) > 0) {
    meleeEffect = {
      label: (await meleePage.locator('.side-battlefield').getAttribute('data-action-label')) ?? '',
      direction: await sector.getAttribute('data-attack-direction'),
      effectKind: await sector.getAttribute('data-effect-kind'),
      polygonCount: await sector.locator('polygon').count(),
      damageEffectCount: await meleePage.locator('.debug-impact-pop.damage').count(),
    };
  }
  await meleePage.waitForTimeout(30);
}
await meleePage.close();

const divePage = await openDebugRoom();
await divePage.getByRole('button', { name: '設定', exact: true }).click();
await divePage.getByLabel('計測する技').selectOption('dive-strike');
await divePage.getByRole('button', { name: '設定を適用' }).click();
await divePage.getByRole('button', { name: '10秒', exact: true }).click();
await divePage.getByRole('button', { name: /計測開始/ }).click();
let diveStartedY = null;
let landingEffect = null;
for (let tick = 0; tick < 240 && !landingEffect; tick += 1) {
  const battlefield = divePage.locator('.side-battlefield');
  const label = (await battlefield.getAttribute('data-action-label')) ?? '';
  const actorY = Number.parseFloat((await divePage.locator('.sprite.ally').first().getAttribute('data-y')) ?? 'NaN');
  if (label.includes('急降下') && Number.isFinite(actorY)) diveStartedY ??= actorY;
  const landing = divePage.locator('[data-effect-kind="landingImpact"][data-attack-shape="circle"]').first();
  if ((await landing.count()) > 0) {
    landingEffect = {
      label,
      actorY,
      hasImpactClass: ((await landing.getAttribute('class')) ?? '').includes('is-landing-impact'),
      damageEffectCount: await divePage.locator('.debug-impact-pop.damage').count(),
    };
  }
  await divePage.waitForTimeout(30);
}
await divePage.close();
await browser.close();

console.log(JSON.stringify({ meleeEffect, diveStartedY, landingEffect, errors }, null, 2));

if (
  !meleeEffect ||
  !meleeEffect.label.includes('パルススワイプ') ||
  meleeEffect.effectKind !== 'meleeFan' ||
  meleeEffect.polygonCount !== 1 ||
  !['left', 'right'].includes(meleeEffect.direction) ||
  meleeEffect.damageEffectCount < 1
)
  throw new Error('前方向の扇形近接エフェクトと重なり命中を確認できません');
if (
  diveStartedY === null ||
  diveStartedY < 8 ||
  !landingEffect ||
  !landingEffect.label.includes('ダイブストライク｜着地') ||
  landingEffect.actorY !== 0 ||
  !landingEffect.hasImpactClass ||
  landingEffect.damageEffectCount < 1
)
  throw new Error('高速降下後の床接触と同時に着地攻撃エフェクトが発生していません');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
