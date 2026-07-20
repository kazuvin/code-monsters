import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

await page.goto(targetUrl, { waitUntil: 'networkidle' });
const encounterText = (await page.locator('.encounter-strip').innerText()).replace(/\s+/g, ' ').trim();
await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();
await page.waitForSelector('.result-dialog', { timeout: 75_000 });

const reportRows = await page.locator('.execution-report .report-scroll .report-row').count();
const reportText = (await page.locator('.execution-report').innerText()).replace(/\s+/g, ' ').trim();
const reportedDamage = await page
  .locator('.execution-report .report-damage')
  .evaluateAll((elements) =>
    elements.reduce((total, element) => total + Number.parseFloat(element.textContent ?? '0'), 0),
  );
const summaryText = (await page.locator('.result-summary').innerText()).replace(/\s+/g, ' ').trim();
const resultTitle = await page.locator('.result-dialog h1').innerText();
const desktopOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
await page.screenshot({ path: '/tmp/code-monsters-run-report-desktop.png', fullPage: true });

const downloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: /リプレイJSON/ }).click();
const download = await downloadPromise;
const replayPath = await download.path();
if (!replayPath) throw new Error('リプレイJSONの一時ファイルを取得できません');
const replay = JSON.parse(await fs.readFile(replayPath, 'utf8'));
const replayDamage = replay.frames
  .flatMap((frame) => frame.queuedSteps ?? [])
  .map((step) => step.damage)
  .filter(Boolean);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(100);
const mobileOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
const dialogFits = await page.locator('.result-dialog').evaluate((element) => {
  const rect = element.getBoundingClientRect();
  return rect.left >= 0 && rect.right <= document.documentElement.clientWidth;
});
await page.screenshot({ path: '/tmp/code-monsters-run-report-mobile.png', fullPage: true });
await browser.close();

console.log(
  JSON.stringify(
    {
      encounterText,
      reportRows,
      reportText,
      summaryText,
      resultTitle,
      replay: {
        schemaVersion: replay.schemaVersion,
        encounter: replay.encounter?.id,
        frames: replay.frames?.length,
        decisions: replay.frames?.flatMap((frame) => frame.decisions ?? []).length,
        damageEvents: replayDamage.length,
        totalDamage: replayDamage.reduce((total, event) => total + event.amount, 0),
      },
      reportedDamage,
      desktopOverflow,
      mobileOverflow,
      dialogFits,
      errors,
    },
    null,
    2,
  ),
);

if (
  !encounterText.includes('MISSION 01') ||
  !encounterText.includes('ラッシュ・プロトコル') ||
  !encounterText.includes('ENEMY PROGRAM')
)
  throw new Error('初回の1vs1遭遇と敵プログラムが準備画面に表示されていません');
if (reportRows === 0 || !reportText.includes('COMBAT EXECUTION TRACE') || !reportText.includes('DMG'))
  throw new Error('戦闘結果に指示実行レポートが表示されていません');
if (reportedDamage <= 0) throw new Error('指示実行レポートに技別ダメージが集計されていません');
if (resultTitle !== '勝利') throw new Error('初期ロードアウトで最初の1vs1を突破できません');
for (const label of ['実行イベント', '戦闘時間', 'ゲージ空', 'ゲージ満タン'])
  if (!summaryText.includes(label)) throw new Error(`戦闘サマリーに${label}がありません`);
if (
  replay.schemaVersion !== 20 ||
  replay.encounter?.id !== 'rush-protocol' ||
  replay.initialFighters?.filter((fighter) => fighter.team === 'ally').length !== 1 ||
  replay.initialFighters?.filter((fighter) => fighter.team === 'enemy').length !== 1
)
  throw new Error('リプレイJSONに遭遇とスキーマ情報が保存されていません');
if (!Array.isArray(replay.frames) || replay.frames.length === 0)
  throw new Error('リプレイJSONに戦闘フレームがありません');
if (!Array.isArray(replay.initialZones) || replay.frames.some((frame) => !Array.isArray(frame.zones)))
  throw new Error('リプレイJSONに設置エリアの状態が保存されていません');
if (!Array.isArray(replay.initialProjectiles) || replay.frames.some((frame) => !Array.isArray(frame.projectiles)))
  throw new Error('リプレイJSONに投射物の状態が保存されていません');
if (replay.frames.flatMap((frame) => frame.decisions ?? []).length === 0)
  throw new Error('リプレイJSONに指示判定がありません');
if (
  replayDamage.length === 0 ||
  replayDamage.some(
    (event) =>
      !event.actorId ||
      !event.actionId ||
      event.amount <= 0 ||
      !['normal', 'reaction', 'projectile', 'status'].includes(event.source),
  )
)
  throw new Error('リプレイJSONに技別ダメージイベントが保存されていません');
if (desktopOverflow > 0 || mobileOverflow > 0 || !dialogFits)
  throw new Error('戦闘レポートが画面幅からはみ出しています');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
