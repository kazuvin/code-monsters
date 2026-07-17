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

const strongCardText = (
  await page.locator('.instruction-shop-item').filter({ hasText: 'ちょっと吹き飛ばす' }).first().innerText()
)
  .replace(/\s+/g, ' ')
  .trim();
await page.locator('.program-list .sentence-block').first().locator('.word-slot').last().click();
const normalAttackText = (
  await page.locator('.instruction-choice-card').filter({ hasText: '通常攻撃' }).first().innerText()
)
  .replace(/\s+/g, ' ')
  .trim();

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.waitForSelector('.status-ability');
const initialRelayGauge = Number(
  await page.locator('.unit-status-card.enemy.unit-relay .status-ability em').first().innerText(),
);
await page.waitForTimeout(700);
const recoveredRelayGauge = Number(
  await page.locator('.unit-status-card.enemy.unit-relay .status-ability em').first().innerText(),
);
const statusCards = await page.locator('.unit-status-card').count();
const gaugeCount = await page.locator('.status-ability').count();
const pipCount = await page.locator('.status-ability-pip').count();
const resourceOverflow = await page.locator('.unit-status-card').evaluateAll((cards) =>
  cards.some((card) => {
    const resources = card.querySelector('.status-resources');
    if (!resources) return true;
    const cardRect = card.getBoundingClientRect();
    const resourceRect = resources.getBoundingClientRect();
    return resourceRect.left < cardRect.left || resourceRect.right > cardRect.right;
  }),
);
const pageOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
await page.screenshot({ path: '/tmp/code-monsters-cost-gauge.png', fullPage: true });
await browser.close();

console.log(
  JSON.stringify(
    {
      strongCardText,
      normalAttackText,
      initialRelayGauge,
      recoveredRelayGauge,
      statusCards,
      gaugeCount,
      pipCount,
      resourceOverflow,
      pageOverflow,
      errors,
    },
    null,
    2,
  ),
);

if (!strongCardText.includes('COST 3')) throw new Error('大技のショップカードにCOST 3が表示されていません');
if (!normalAttackText.includes('COST FREE')) throw new Error('通常攻撃にCOST FREEが表示されていません');
if (!(recoveredRelayGauge > initialRelayGauge)) throw new Error('戦闘中にコストゲージが時間回復していません');
if (gaugeCount !== statusCards || pipCount !== statusCards * 3)
  throw new Error('ユニットごとの3分割コストゲージが表示されていません');
if (resourceOverflow || pageOverflow > 0) throw new Error('コストゲージ追加後のステータスUIが横にはみ出しています');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
