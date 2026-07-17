import { chromium } from 'playwright-core';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=swiftshader'],
});

const results = [];
for (const viewport of [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 3 },
]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: viewport.deviceScaleFactor });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'デバッグ' }).click();
  await page.waitForSelector('.debug-room');
  await page.waitForTimeout(320);

  const openSetup = async () => {
    if (viewport.name === 'mobile') await page.getByRole('button', { name: '設定', exact: true }).click();
  };
  const runSetup = async () => {
    await page
      .getByRole('button', { name: viewport.name === 'mobile' ? 'この設定で計測' : '計測する', exact: true })
      .click();
    await page.waitForTimeout(320);
  };

  const initial = {
    verdict: (await page.locator('.debug-verdict small').textContent())?.trim(),
    total: Number(await page.locator('.debug-verdict strong').textContent()),
    metrics: (await page.locator('.debug-primary-metrics').innerText()).replace(/\s+/g, ' ').trim(),
  };
  await page.screenshot({ path: `/tmp/code-monsters-${viewport.name}-debug-room.png`, fullPage: false });

  await page.getByRole('button', { name: '30秒' }).click();
  await openSetup();
  if (viewport.name === 'mobile') {
    await page.waitForTimeout(280);
    await page.screenshot({ path: '/tmp/code-monsters-mobile-debug-room-settings.png', fullPage: false });
  }
  await page.getByLabel('攻撃ユニット').selectOption('arrow');
  await page.getByLabel('実行する技').selectOption('toxic-mark');
  await page.getByLabel('最大HP').fill('99999');
  await page.getByLabel('距離').fill('4');
  await runSetup();
  const timeline = {
    verdict: (await page.locator('.debug-verdict small').textContent())?.trim(),
    total: Number(await page.locator('.debug-verdict strong').textContent()),
    events: await page.locator('.debug-impact-tape i.damage').count(),
    metrics: (await page.locator('.debug-primary-metrics').innerText()).replace(/\s+/g, ' ').trim(),
  };

  await page.getByRole('button', { name: '単発' }).click();
  await openSetup();
  await page.getByLabel('実行する技').selectOption('shoulder-throw');
  await page.getByLabel('条件').selectOption('always');
  await page.getByLabel('距離').fill('72');
  const retainedSkillBeforeRun = (await page.locator('.debug-skill-readout b').textContent())?.trim();
  await runSetup();
  const rangeMiss = {
    verdict: (await page.locator('.debug-verdict small').textContent())?.trim(),
    skipText: (await page.locator('.debug-skips').innerText()).replace(/\s+/g, ' ').trim(),
    retainedSkillBeforeRun,
    measuredSkill: (await page.locator('.debug-skill-readout b').textContent())?.trim(),
  };

  await page.getByRole('button', { name: '10秒' }).click();
  await openSetup();
  await page.getByLabel('攻撃ユニット').selectOption('mender');
  await page.getByLabel('実行する技').selectOption('field-repair');
  await page.getByLabel('距離').fill('4');
  await runSetup();
  const healing = {
    verdict: (await page.locator('.debug-verdict small').textContent())?.trim(),
    total: Number(await page.locator('.debug-verdict strong').textContent()),
    target: await page.getByLabel('対象').inputValue(),
    metrics: (await page.locator('.debug-primary-metrics').innerText()).replace(/\s+/g, ' ').trim(),
  };

  await page.getByRole('button', { name: '単発' }).click();
  await openSetup();
  await page.getByLabel('攻撃ユニット').selectOption('wrath');
  await page.getByLabel('実行する技').selectOption('berserker-mode');
  await page.getByLabel('開始コスト').fill('10');
  await page.getByLabel('実行ユニットの現在HP').fill('30');
  await runSetup();
  const selfEffect = {
    verdict: (await page.locator('.debug-verdict small').textContent())?.trim(),
    targetRigs: await page.locator('.debug-target-rig').count(),
    metrics: (await page.locator('.debug-primary-metrics').innerText()).replace(/\s+/g, ' ').trim(),
  };

  const layout = await page.evaluate(() => ({
    xOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    yOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    scrollY: window.scrollY,
  }));
  results.push({ viewport: viewport.name, initial, timeline, rangeMiss, healing, selfEffect, layout, errors });
  await page.close();
}
await browser.close();

console.log(JSON.stringify(results, null, 2));

for (const result of results) {
  if (result.initial.verdict !== 'DAMAGE CONFIRMED' || result.initial.total <= 0)
    throw new Error(`${result.viewport}: 初期の単発ダメージ計測が表示されていません`);
  if (result.timeline.verdict !== 'DAMAGE CONFIRMED' || result.timeline.total <= 0 || result.timeline.events < 2)
    throw new Error(`${result.viewport}: 30秒の継続ダメージ計測ができません`);
  if (!result.timeline.metrics.includes('DPS') || !result.timeline.metrics.includes('DMG / COST'))
    throw new Error(`${result.viewport}: DPSまたはコスト効率が表示されていません`);
  if (
    result.rangeMiss.verdict !== 'NO EFFECT' ||
    !result.rangeMiss.skipText.includes('射程外 1') ||
    result.rangeMiss.retainedSkillBeforeRun !== '毒弾を撃つ' ||
    result.rangeMiss.measuredSkill !== '背負い投げ'
  )
    throw new Error(`${result.viewport}: 射程外のスキップ理由が表示されていません`);
  if (
    result.healing.verdict !== 'REPAIR CONFIRMED' ||
    result.healing.total <= 0 ||
    result.healing.target !== 'lowestHpAlly' ||
    !result.healing.metrics.includes('HPS') ||
    !result.healing.metrics.includes('1 REPAIR')
  )
    throw new Error(`${result.viewport}: 味方への回復計測ができません`);
  if (
    result.selfEffect.verdict !== 'EFFECT CONFIRMED' ||
    result.selfEffect.targetRigs !== 0 ||
    !result.selfEffect.metrics.includes('STATE BERSERK') ||
    !result.selfEffect.metrics.includes('ATK DELTA')
  )
    throw new Error(`${result.viewport}: 自己対象技の効果計測または表示が不正です`);
  if (result.layout.xOverflow > 0 || result.layout.yOverflow > 0 || result.layout.scrollY !== 0)
    throw new Error(`${result.viewport}: デバッグルームが画面からはみ出しています`);
  if (result.errors.length > 0) throw new Error(`${result.viewport}: ブラウザエラー: ${result.errors.join(', ')}`);
}
