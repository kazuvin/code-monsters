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
  await page.getByRole('button', { name: 'デバッグ', exact: true }).evaluate((button) => button.click());
  await page.waitForSelector('.debug-room');

  const readStage = async () =>
    page.evaluate(() => ({
      sprites: document.querySelectorAll('.debug-arena-stage .sprite').length,
      range: document.querySelector('.debug-range-lock')?.textContent?.replace(/\s+/g, ' ').trim(),
      targetHp: document.querySelector('.debug-duel-bars .enemy b')?.textContent?.replace(/\s+/g, ' ').trim(),
      eventRows: document.querySelectorAll('.debug-impact-tape article').length,
      statuses: Array.from(document.querySelectorAll('.debug-profile-statuses span')).map((element) =>
        element.textContent?.trim(),
      ),
      targetClasses: document.querySelector('.debug-arena-stage .sprite.enemy')?.className,
      actorLeft: document.querySelector('.debug-arena-stage .sprite.ally')?.style.left,
      targetLeft: document.querySelector('.debug-arena-stage .sprite.enemy')?.style.left,
      recovery: document.querySelector('.debug-auto-recovery')?.textContent?.replace(/\s+/g, ' ').trim(),
    }));

  const readMeasurement = async () => ({
    verdict: (await page.locator('.debug-verdict small').textContent())?.trim(),
    value: Number(await page.locator('.debug-verdict strong').textContent()),
    metrics: (await page.locator('.debug-primary-metrics').innerText()).replace(/\s+/g, ' ').trim(),
    stage: await readStage(),
  });

  const openSettings = async () => {
    await page.getByRole('button', { name: '設定', exact: true }).click();
    await page.waitForSelector('.debug-config.is-open');
  };
  const applySettings = async () => {
    await page.getByRole('button', { name: '設定を適用', exact: true }).click();
    await page.waitForSelector('.debug-config:not(.is-open)');
  };
  const measure = async () => {
    await page.getByRole('button', { name: '計測開始', exact: true }).click();
    await page.waitForTimeout(460);
  };

  const initial = await readMeasurement();
  await measure();
  const normalAttack = await readMeasurement();
  await page.waitForTimeout(3000);
  const normalRecovered = await readMeasurement();

  await page.getByRole('button', { name: 'リセット', exact: true }).click();
  const reset = await readMeasurement();

  await openSettings();
  await page.getByLabel('計測する技').selectOption('retreat');
  await applySettings();
  const movementStart = await readMeasurement();
  await measure();
  const movement = await readMeasurement();
  await page.waitForTimeout(800);
  const movementPersisted = await readMeasurement();
  await page.getByRole('button', { name: 'リセット', exact: true }).click();
  const movementReset = await readMeasurement();

  await openSettings();
  await page.getByLabel('計測する技').selectOption('toxic-mark');
  await applySettings();
  await measure();
  const poisoned = await readMeasurement();
  await page.waitForTimeout(800);
  const poisonPersisted = await readMeasurement();
  await page.getByRole('button', { name: 'リセット', exact: true }).click();
  const poisonReset = await readMeasurement();

  await openSettings();
  const settingsScrollTop = await page.locator('.debug-config-scroll').evaluate((element) => element.scrollTop);
  await page.getByLabel('計測する技').selectOption('knock-away');
  await page.getByLabel('最大HP').fill('500');
  await page.getByLabel('防御').fill('0');
  await page.getByLabel('敵のロール属性').selectOption('STRIKER');
  await page.getByLabel('毒スタック').fill('2');
  await page.getByRole('button', { name: 'ガード 被ダメージ軽減', exact: true }).click();
  await page.getByRole('button', { name: 'バーサーク 状態表示', exact: true }).click();
  await page.getByRole('button', { name: '挑発 標的固定', exact: true }).click();
  if (viewport.name === 'mobile') {
    await page.screenshot({ path: '/tmp/code-monsters-mobile-debug-room-settings.png', fullPage: false });
  }
  await applySettings();
  await measure();
  const guarded = await readMeasurement();

  await openSettings();
  await page.getByRole('button', { name: 'ガード 被ダメージ軽減', exact: true }).click();
  await applySettings();
  await measure();
  const unguarded = await readMeasurement();

  await page.getByRole('button', { name: 'リセット', exact: true }).click();
  const configuredReset = await readMeasurement();
  const measuredSkillAfterReset = (await page.locator('.debug-skill-readout b').textContent())?.trim();

  const layout = await page.evaluate(() => ({
    xOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    yOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    scrollY: window.scrollY,
  }));
  await page.screenshot({ path: `/tmp/code-monsters-${viewport.name}-debug-room.png`, fullPage: false });
  results.push({
    viewport: viewport.name,
    initial,
    normalAttack,
    normalRecovered,
    reset,
    movementStart,
    movement,
    movementPersisted,
    movementReset,
    poisoned,
    poisonPersisted,
    poisonReset,
    guarded,
    unguarded,
    configuredReset,
    measuredSkillAfterReset,
    settingsScrollTop,
    layout,
    errors,
  });
  await page.close();
}
await browser.close();

console.log(JSON.stringify(results, null, 2));

for (const result of results) {
  if (
    result.initial.verdict !== 'READY TO MEASURE' ||
    result.initial.value !== 0 ||
    result.initial.stage.sprites !== 2 ||
    !result.initial.stage.range.includes('相互射程内')
  )
    throw new Error(`${result.viewport}: 初期状態が1対1・相互射程内の待機状態ではありません`);
  if (
    result.normalAttack.verdict !== 'DAMAGE CONFIRMED' ||
    result.normalAttack.value <= 0 ||
    result.normalAttack.stage.eventRows !== 1 ||
    !result.normalAttack.metrics.includes('AUTO RECOVER 1') ||
    result.normalAttack.stage.targetHp === '176 / 176' ||
    !result.normalAttack.stage.recovery.includes('RECOVERING')
  )
    throw new Error(`${result.viewport}: 単発ダメージまたは敵の最低HP維持を確認できません`);
  if (
    result.normalRecovered.stage.targetHp !== '176 / 176' ||
    !result.normalRecovered.stage.recovery.includes('AUTO RECOVER')
  )
    throw new Error(`${result.viewport}: 被弾後3秒の敵HP全回復を確認できません`);
  if (
    result.reset.verdict !== 'READY TO MEASURE' ||
    result.reset.value !== 0 ||
    result.reset.stage.eventRows !== 0 ||
    result.reset.stage.targetHp !== '176 / 176'
  )
    throw new Error(`${result.viewport}: リセットで戦闘の初期状態へ戻りません`);
  if (
    result.movement.verdict !== 'EFFECT CONFIRMED' ||
    result.movement.stage.actorLeft === result.movementStart.stage.actorLeft ||
    result.movementPersisted.stage.actorLeft !== result.movement.stage.actorLeft ||
    result.movementReset.stage.actorLeft !== result.movementStart.stage.actorLeft
  )
    throw new Error(`${result.viewport}: 技による移動がリセットまで保持されていません`);
  if (
    !result.poisoned.stage.statuses.includes('毒 ×1') ||
    !result.poisoned.stage.targetClasses.includes('poisoned') ||
    !result.poisonPersisted.stage.targetClasses.includes('poisoned') ||
    result.poisonReset.stage.targetClasses.includes('poisoned') ||
    !result.poisonReset.stage.statuses.includes('状態なし')
  )
    throw new Error(`${result.viewport}: 技で付与した毒状態がリセットまで保持されていません`);
  if (
    result.guarded.value <= 0 ||
    result.guarded.stage.targetHp === '500 / 500' ||
    !result.guarded.stage.statuses.includes('毒 ×2') ||
    !result.guarded.stage.statuses.includes('ガード') ||
    !result.guarded.stage.statuses.includes('バーサーク') ||
    !result.guarded.stage.statuses.includes('挑発') ||
    !result.guarded.stage.targetClasses.includes('poisoned') ||
    !result.guarded.stage.targetClasses.includes('berserk-active') ||
    !result.guarded.stage.targetClasses.includes('taunt-locked')
  )
    throw new Error(`${result.viewport}: 敵の属性・状態設定が計測と戦闘表示へ反映されていません`);
  if (result.unguarded.value <= result.guarded.value)
    throw new Error(`${result.viewport}: ガード状態の有無が実ダメージへ反映されていません`);
  if (
    result.configuredReset.verdict !== 'READY TO MEASURE' ||
    result.configuredReset.stage.targetHp !== '500 / 500' ||
    result.measuredSkillAfterReset !== 'ちょっと吹き飛ばす'
  )
    throw new Error(`${result.viewport}: リセット時に現在の計測設定を維持した初期状態へ戻りません`);
  if (result.settingsScrollTop !== 0) throw new Error(`${result.viewport}: 設定を開いたとき先頭が表示されません`);
  if (result.layout.xOverflow > 0 || result.layout.yOverflow > 0 || result.layout.scrollY !== 0)
    throw new Error(`${result.viewport}: デバッグルームが画面からはみ出しています`);
  if (result.errors.length > 0) throw new Error(`${result.viewport}: ブラウザエラー: ${result.errors.join(', ')}`);
}
