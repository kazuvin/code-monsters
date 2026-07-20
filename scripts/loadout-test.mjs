import { chromium } from 'playwright-core';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(5_000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  Math.random = () => 36 / 0x7fffffff;
});
await page.goto(targetUrl, { waitUntil: 'networkidle' });

const encounterText = (await page.locator('.encounter-strip').innerText()).replace(/\s+/g, ' ').trim();
const initialBays = await page.locator('.loadout-bay').count();
const initialLoadout = await page.locator('.loadout-bay > strong').allInnerTexts();
const shopCounts = {
  equipment: await page.locator('.shop-item:not(.instruction-shop-item)').count(),
  instructions: await page.locator('.instruction-shop-item').count(),
};

const heavyFrame = page.locator('.shop-item:not(.instruction-shop-item)').filter({ hasText: '重装フレーム' });
await heavyFrame.getByRole('button', { name: /購入/ }).click();
const equippedFrame = await page.locator('.loadout-bay.slot-frame > strong').innerText();
const statsAfterFrame = (await page.locator('.unit-meta .stats').innerText()).replace(/\s+/g, ' ').trim();

const repairChip = page.locator('.shop-item:not(.instruction-shop-item)').filter({ hasText: '自己修復チップ' });
await repairChip.getByRole('button', { name: /購入/ }).click();
const equippedChip = await page.locator('.loadout-bay.slot-chip > strong').innerText();
const programRowsAfterChip = await page.locator('.workbench > .program-list .sentence-block').count();
const reactionText = (await page.locator('.workbench .reaction-loop').innerText()).replace(/\s+/g, ' ').trim();
const remainingShopItems = await page.locator('.shop-item').count();
const remainingCoins = await page.locator('.wallet b').innerText();
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
await page.screenshot({ path: '/tmp/code-monsters-loadout-desktop.png', fullPage: true });
await browser.close();

const result = {
  encounterText,
  initialBays,
  initialLoadout,
  shopCounts,
  equippedFrame,
  statsAfterFrame,
  equippedChip,
  programRowsAfterChip,
  reactionText,
  remainingShopItems,
  remainingCoins,
  overflow,
  errors,
};
console.log(JSON.stringify(result, null, 2));

if (
  !encounterText.includes('ラッシュ・プロトコル') ||
  !encounterText.includes('ENEMY PROGRAM') ||
  !encounterText.includes('リレイ')
)
  throw new Error('次の1vs1相手と敵プログラムが予告されていません');
if (initialBays !== 3 || !['標準フレーム', 'パルスエッジ', '追撃サーボ'].every((name) => initialLoadout.includes(name)))
  throw new Error('初期装備が3つのハードウェアベイに表示されていません');
if (shopCounts.equipment !== 2 || shopCounts.instructions !== 2)
  throw new Error('ショップが装備2件・指示2件の構成ではありません');
if (equippedFrame !== '重装フレーム' || !statsAfterFrame.includes('HP 146'))
  throw new Error('購入したフレームのトレードオフが自動装備へ反映されていません');
if (equippedChip !== '自己修復チップ' || programRowsAfterChip !== 3 || !reactionText.includes('追加'))
  throw new Error('チップ交換後に容量と所有アクションの整合性が保たれていません');
if (remainingShopItems !== 2 || remainingCoins !== '2')
  throw new Error('装備購入後のショップまたはコイン残高が不正です');
if (overflow > 0 || errors.length > 0) throw new Error(`装備UIエラー: ${errors.join(', ')}`);
