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
const toxinCard = page.locator('.shop-item').filter({ hasText: 'トキシン' }).first();
await toxinCard.getByRole('button', { name: /購入/ }).click();
await page.locator('.inventory button').filter({ hasText: 'トキシン' }).click();
await page.locator('.unit-tabs button').filter({ hasText: 'リレイ' }).click();
await page.getByRole('button', { name: '外す' }).click();

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();
await page.waitForSelector('.sprite.poisoned .poison-chip', { timeout: 45_000 });

const poison = await page
  .locator('.sprite.poisoned')
  .first()
  .evaluate((element) => {
    const chip = element.querySelector('.poison-chip');
    const surface = element.querySelector('.poison-surface');
    const haze = element.querySelector('.poison-haze');
    return {
      chip: chip?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      chipDisplay: chip ? getComputedStyle(chip).display : 'none',
      surfaceAnimation: surface ? getComputedStyle(surface).animationName : 'none',
      hazeAnimation: haze ? getComputedStyle(haze).animationName : 'none',
      bodyShadow: getComputedStyle(element.querySelector('.sprite-body')).boxShadow,
    };
  });
const status = await page
  .locator('.unit-status-card.poisoned')
  .first()
  .evaluate((element) => ({
    text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    tag: element.querySelector('.status-tags .poison')?.textContent?.trim() ?? '',
    borderColor: getComputedStyle(element).borderColor,
  }));
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
await page.screenshot({ path: '/tmp/code-monsters-poison.png', fullPage: true });
await browser.close();

console.log(JSON.stringify({ poison, status, overflow, errors }, null, 2));

if (!poison.chip.includes('POISON') || !poison.chip.includes('×1') || poison.chipDisplay === 'none')
  throw new Error('戦場ユニットに毒状態ラベルが表示されていません');
if (poison.surfaceAnimation === 'none' || poison.hazeAnimation === 'none' || poison.bodyShadow === 'none')
  throw new Error('毒状態の表面・粒子エフェクトが適用されていません');
if (!status.tag.startsWith('毒 ×') || !status.text.includes('毒'))
  throw new Error('ユニット状態パネルに毒状態が表示されていません');
if (overflow > 0) throw new Error('毒表示で画面が横にはみ出しています');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
