import fs from 'node:fs';
import { chromium } from 'playwright-core';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const data = JSON.parse(fs.readFileSync(new URL('../game-data/game-balance.json', import.meta.url), 'utf8'));
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
      actorClasses: document.querySelector('.debug-arena-stage .sprite.ally')?.className,
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
    await page.waitForTimeout(920);
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
  await page.getByLabel('計測する技').selectOption('reveal-weakness');
  await applySettings();
  await measure();
  const vulnerable = await readMeasurement();
  await page.screenshot({ path: `/tmp/code-monsters-${viewport.name}-vulnerable.png`, fullPage: false });
  await page.waitForTimeout(800);
  const vulnerabilityPersisted = await readMeasurement();
  await page.getByRole('button', { name: 'リセット', exact: true }).click();
  const vulnerabilityReset = await readMeasurement();

  await openSettings();
  const settingsScrollTop = await page.locator('.debug-config-scroll').evaluate((element) => element.scrollTop);
  await page.getByLabel('計測する技').selectOption('knock-away');
  await page.getByLabel('最大HP').fill('500');
  await page.getByLabel('防御').fill('0');
  await page.getByLabel('敵のロール属性').selectOption('STRIKER');
  await page.getByLabel('敵側 毒スタック').fill('2');
  await page.getByRole('button', { name: '敵側 ガード 被ダメージ・ノックバック軽減', exact: true }).click();
  await page.getByRole('button', { name: '敵側 バーサーク 攻撃力・速度を強化', exact: true }).click();
  await page.getByRole('button', { name: '敵側 挑発 相手を標的として固定', exact: true }).click();
  if (viewport.name === 'mobile') {
    await page.screenshot({ path: '/tmp/code-monsters-mobile-debug-room-settings.png', fullPage: false });
  }
  await applySettings();
  await measure();
  const guarded = await readMeasurement();

  await openSettings();
  await page.getByRole('button', { name: '敵側 ガード 被ダメージ・ノックバック軽減', exact: true }).click();
  await applySettings();
  await measure();
  const unguarded = await readMeasurement();

  await openSettings();
  await page.getByLabel('計測する技').selectOption('pull-in');
  await page.getByLabel('開始位置').selectOption('actor-out-of-range');
  await page.getByLabel('攻撃側 毒スタック').fill('3');
  await page.getByRole('button', { name: '攻撃側 ガード 被ダメージ・ノックバック軽減', exact: true }).click();
  await page.getByRole('button', { name: '攻撃側 バーサーク 攻撃力・速度を強化', exact: true }).click();
  await page.getByRole('button', { name: '攻撃側 挑発 相手を標的として固定', exact: true }).click();
  await applySettings();
  const actorConfigured = await readMeasurement();
  await measure();
  const actorMeasured = await readMeasurement();
  await page.getByRole('button', { name: 'リセット', exact: true }).click();
  const actorReset = await readMeasurement();

  const configuredReset = await readMeasurement();
  const measuredSkillAfterReset = (await page.locator('.debug-skill-readout b').textContent())?.trim();

  await page.getByRole('button', { name: 'シナジー', exact: true }).click();
  await page.waitForSelector('.synergy-page');
  const synergy = await page.evaluate(() => ({
    packs: document.querySelectorAll('.synergy-pack').length,
    ready: document.querySelectorAll('.synergy-pack.is-ready').length,
    summary: document.querySelector('.synergy-summary')?.textContent?.replace(/\s+/g, ' ').trim(),
    xOverflow:
      document.querySelector('.synergy-page').scrollWidth - document.querySelector('.synergy-page').clientWidth,
  }));
  await page.screenshot({ path: `/tmp/code-monsters-${viewport.name}-synergy-graph.png`, fullPage: false });
  await page.getByRole('button', { name: /デバッグルーム/ }).click();
  await page.waitForSelector('.debug-room');

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
    vulnerable,
    vulnerabilityPersisted,
    vulnerabilityReset,
    guarded,
    unguarded,
    actorConfigured,
    actorMeasured,
    actorReset,
    configuredReset,
    measuredSkillAfterReset,
    synergy,
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
    !result.vulnerable.stage.statuses.includes('脆弱') ||
    !result.vulnerable.stage.targetClasses.includes('vulnerable') ||
    !result.vulnerabilityPersisted.stage.targetClasses.includes('vulnerable') ||
    result.vulnerabilityReset.stage.targetClasses.includes('vulnerable') ||
    !result.vulnerabilityReset.stage.statuses.includes('状態なし')
  )
    throw new Error(`${result.viewport}: 技で付与した脆弱状態が表示され、リセットまで保持されていません`);
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
    !result.actorConfigured.stage.range.includes('攻撃側の射程外') ||
    !result.actorConfigured.stage.statuses.includes('毒 ×3') ||
    !result.actorConfigured.stage.statuses.includes('ガード') ||
    !result.actorConfigured.stage.actorClasses.includes('poisoned') ||
    !result.actorConfigured.stage.actorClasses.includes('berserk-active') ||
    !result.actorConfigured.stage.actorClasses.includes('taunt-locked') ||
    result.actorMeasured.verdict !== 'EFFECT CONFIRMED' ||
    result.actorMeasured.stage.targetLeft === result.actorConfigured.stage.targetLeft ||
    !result.actorReset.stage.range.includes('攻撃側の射程外') ||
    !result.actorReset.stage.actorClasses.includes('poisoned')
  )
    throw new Error(`${result.viewport}: 攻撃側の状態または射程プリセットが戦闘・リセットへ反映されていません`);
  if (
    result.configuredReset.verdict !== 'READY TO MEASURE' ||
    result.configuredReset.stage.targetHp !== '500 / 500' ||
    result.measuredSkillAfterReset !== '引き寄せる'
  )
    throw new Error(`${result.viewport}: リセット時に現在の計測設定を維持した初期状態へ戻りません`);
  if (result.settingsScrollTop !== 0) throw new Error(`${result.viewport}: 設定を開いたとき先頭が表示されません`);
  if (
    result.synergy.packs !== data.statuses.length ||
    result.synergy.ready !== data.statuses.length ||
    !result.synergy.summary.includes('全パック検証済み') ||
    result.synergy.xOverflow > 0
  )
    throw new Error(`${result.viewport}: シナジーグラフが全状態パックを正しく表示していません`);
  if (result.layout.xOverflow > 0 || result.layout.yOverflow > 0 || result.layout.scrollY !== 0)
    throw new Error(`${result.viewport}: デバッグルームが画面からはみ出しています`);
  if (result.errors.length > 0) throw new Error(`${result.viewport}: ブラウザエラー: ${result.errors.join(', ')}`);
}
