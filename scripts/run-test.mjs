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
await page.waitForSelector('.result-dialog', { timeout: 60_000 });

const reportRows = await page.locator('.execution-report .report-scroll .report-row').count();
const reportText = (await page.locator('.execution-report').innerText()).replace(/\s+/g, ' ').trim();
const summaryText = (await page.locator('.result-summary').innerText()).replace(/\s+/g, ' ').trim();
const desktopOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
await page.screenshot({ path: '/tmp/code-monsters-run-report-desktop.png', fullPage: true });

const downloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: /リプレイJSON/ }).click();
const download = await downloadPromise;
const stream = await download.createReadStream();
const chunks = [];
for await (const chunk of stream) chunks.push(chunk);
const replay = JSON.parse(Buffer.concat(chunks).toString('utf8'));

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
      replay: {
        schemaVersion: replay.schemaVersion,
        encounter: replay.encounter?.id,
        frames: replay.frames?.length,
        decisions: replay.frames?.flatMap((frame) => frame.decisions ?? []).length,
      },
      desktopOverflow,
      mobileOverflow,
      dialogFits,
      errors,
    },
    null,
    2,
  ),
);

if (!encounterText.includes('MISSION 01') || !encounterText.includes('接近戦プロトコル'))
  throw new Error('初回遭遇の予告が編成画面に表示されていません');
if (reportRows === 0 || !reportText.includes('NORMAL LOOP TRACE'))
  throw new Error('戦闘結果に指示実行レポートが表示されていません');
for (const label of ['実行イベント', '戦闘時間', 'ゲージ空', 'ゲージ満タン'])
  if (!summaryText.includes(label)) throw new Error(`戦闘サマリーに${label}がありません`);
if (replay.schemaVersion !== 6 || replay.encounter?.id !== 'opening-line')
  throw new Error('リプレイJSONに遭遇とスキーマ情報が保存されていません');
if (!Array.isArray(replay.frames) || replay.frames.length === 0)
  throw new Error('リプレイJSONに戦闘フレームがありません');
if (replay.frames.flatMap((frame) => frame.decisions ?? []).length === 0)
  throw new Error('リプレイJSONに指示判定がありません');
if (desktopOverflow > 0 || mobileOverflow > 0 || !dialogFits)
  throw new Error('戦闘レポートが画面幅からはみ出しています');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
