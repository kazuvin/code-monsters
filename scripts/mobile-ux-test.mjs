import { chromium } from 'playwright-core';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(targetUrl, { waitUntil: 'networkidle' });

const viewportSnapshot = async () =>
  page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return {
        top: Math.round(bounds.top),
        right: Math.round(bounds.right),
        bottom: Math.round(bounds.bottom),
        left: Math.round(bounds.left),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
        display: getComputedStyle(element).display,
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      pageScroll: { x: scrollX, y: scrollY },
      documentOverflow: {
        x: document.documentElement.scrollWidth - innerWidth,
        y: document.documentElement.scrollHeight - innerHeight,
      },
      topbar: rect('.topbar'),
      encounter: rect('.encounter-strip'),
      workbench: rect('.workbench'),
      summary: rect('.mobile-build-summary'),
      dock: rect('.mobile-build-dock'),
      panelHeader: rect('.mobile-panel-header'),
      choicePanel: rect('.choice-panel'),
      shopPanel: rect('.shop-panel'),
    };
  });

const main = await viewportSnapshot();
const dockLabels = (await page.locator('.mobile-build-dock button').allInnerTexts()).map((text) =>
  text.replace(/\s+/g, ''),
);
await page.screenshot({ path: '/tmp/code-monsters-mobile-command-main.png' });

await page.locator('.mobile-build-dock button').filter({ hasText: '通常' }).click();
const program = await viewportSnapshot();
const programRows = await page.locator('.mobile-panel-program .workbench > .program-list .sentence-block').count();
const programPanelTitle = (await page.locator('.mobile-panel-header').innerText()).replace(/\s+/g, ' ').trim();
await page.screenshot({ path: '/tmp/code-monsters-mobile-command-program.png' });

await page.locator('.mobile-build-dock button').filter({ hasText: '反応' }).click();
const reaction = await viewportSnapshot();
const reactionVisible = await page.locator('.mobile-panel-reaction .reaction-loop').isVisible();
await page.screenshot({ path: '/tmp/code-monsters-mobile-command-reaction.png' });

await page.locator('.mobile-build-dock button').filter({ hasText: '購入' }).click();
const shop = await viewportSnapshot();
const shopFlow = await page.locator('.mobile-panel-shop .shop-grid').evaluate((element) => ({
  clientWidth: element.clientWidth,
  scrollWidth: element.scrollWidth,
  clientHeight: element.clientHeight,
  scrollHeight: element.scrollHeight,
}));
const shopItems = {
  count: await page.locator('.mobile-panel-shop .shop-item').count(),
  labels: await page.locator('.mobile-panel-shop .shop-item > strong').allInnerTexts(),
};
await page.screenshot({ path: '/tmp/code-monsters-mobile-command-shop.png' });

await page.locator('.mobile-build-dock button').filter({ hasText: '装備' }).click();
const loadout = await viewportSnapshot();
const loadoutDetails = {
  rack: await page.locator('.mobile-panel-loadout .loadout-rack').isVisible(),
  bays: await page.locator('.mobile-panel-loadout .loadout-bay').count(),
  options: await page.locator('.mobile-panel-loadout .loadout-options button').count(),
  labels: await page.locator('.mobile-panel-loadout .loadout-bay-head small').allInnerTexts(),
};
await page.screenshot({ path: '/tmp/code-monsters-mobile-command-loadout.png' });

await page.getByRole('button', { name: 'パネルを閉じる' }).click();
const closed = await viewportSnapshot();
await browser.close();

const result = {
  main,
  dockLabels,
  program: { ...program, rows: programRows, title: programPanelTitle },
  reaction: { ...reaction, visible: reactionVisible },
  shop: { ...shop, flow: shopFlow, items: shopItems },
  loadout: { ...loadout, details: loadoutDetails },
  closed,
  errors,
};
console.log(JSON.stringify(result, null, 2));

if (main.documentOverflow.x > 0 || main.documentOverflow.y > 0 || main.pageScroll.x !== 0 || main.pageScroll.y !== 0)
  throw new Error('モバイルのデュエル準備画面にページスクロールが残っています');
if (
  !main.topbar ||
  !main.encounter ||
  !main.workbench ||
  !main.summary ||
  !main.dock ||
  main.topbar.top !== 0 ||
  main.dock.bottom !== main.viewport.height
)
  throw new Error('モバイルの指揮画面が1画面内に収まっていません');
for (const label of ['通常', '反応', '装備', '購入', '戦闘開始'])
  if (!dockLabels.includes(label)) throw new Error(`固定コマンドドックに${label}がありません`);
if (
  !programPanelTitle.includes('通常作戦') ||
  programRows === 0 ||
  !program.panelHeader ||
  !program.choicePanel ||
  program.choicePanel.bottom > program.viewport.height
)
  throw new Error('通常作戦シート内で指示と選択肢を操作できません');
if (!reactionVisible || !reaction.panelHeader || !reaction.choicePanel)
  throw new Error('リアクションシートが表示されていません');
if (
  !shop.shopPanel ||
  shopItems.count !== 4 ||
  new Set(shopItems.labels).size !== 4 ||
  shopFlow.scrollWidth > shopFlow.clientWidth + 1 ||
  shopFlow.scrollHeight > shopFlow.clientHeight + 1
)
  throw new Error('ショップの重複なし4商品が1画面内に収まっていません');
if (
  !loadoutDetails.rack ||
  loadoutDetails.bays !== 3 ||
  loadoutDetails.options < 3 ||
  !['フレーム', 'ウェポン', 'ロジックチップ'].every((label) => loadoutDetails.labels.includes(label))
)
  throw new Error('装備シートで3つのハードウェアベイを操作できません');
if (closed.documentOverflow.y > 0 || errors.length > 0) throw new Error(`モバイルUIエラー: ${errors.join(', ')}`);
