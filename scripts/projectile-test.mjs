import { chromium } from 'playwright-core';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=swiftshader'],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  Math.random = () => 6.25 / 0x7fffffff;
});
await page.goto(targetUrl, { waitUntil: 'networkidle' });

const pulseBoltCard = page
  .locator('.instruction-shop-item')
  .filter({ has: page.locator('strong').filter({ hasText: /^直進弾を撃つ$/ }) });
await pulseBoltCard.getByRole('button', { name: /購入/ }).click();

const firstProgramBlock = page.locator('.workbench > .program-list').first().locator('.sentence-block').first();
await firstProgramBlock.locator('.word-slot').first().click();
await page.locator('.condition-choice-card').filter({ hasText: 'いつでも' }).click();
await firstProgramBlock.locator('.word-slot').last().click();
await page.locator('.choice-list .instruction-choice-card').filter({ hasText: '直進弾を撃つ' }).click();
const configuredProgram = (await firstProgramBlock.innerText()).replace(/\s+/g, ' ').trim();

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();

const enemy = page.locator('.sprite.enemy').first();
const initialEnemyHp = Number.parseFloat(
  (await enemy.locator('.sprite-hp i').getAttribute('style'))?.match(/[\d.]+/)?.[0] ?? '100',
);
let projectileSeen = false;
let projectileMoved = false;
let damageAfterFlight = false;
let launchLabel = '';
let projectileAppearedBeforeLaunchReadout = false;
let firstProjectileX = null;
let armingSeen = false;
let armedSeen = false;
let enemyHpWhenProjectileAppeared = null;
let finalEnemyHp = initialEnemyHp;
for (let tick = 0; tick < 900 && !(damageAfterFlight && launchLabel); tick += 1) {
  const actionLabel = (await page.locator('.side-battlefield').getAttribute('data-action-label')) ?? '';
  if (actionLabel.includes('パルスボルト｜発射')) launchLabel = actionLabel;
  const projectile = page.locator('.spatial-projectile[data-projectile-kind="direct"]').first();
  if ((await projectile.count()) > 0) {
    const className = (await projectile.getAttribute('class')) ?? '';
    armingSeen ||= className.includes('is-arming');
    armedSeen ||= className.includes('is-armed');
    const x = Number.parseFloat((await projectile.getAttribute('style'))?.match(/left:\s*([\d.]+)%/)?.[1] ?? '0');
    if (!projectileSeen) {
      projectileSeen = true;
      firstProjectileX = x;
      enemyHpWhenProjectileAppeared = Number.parseFloat(
        (await enemy.locator('.sprite-hp i').getAttribute('style'))?.match(/[\d.]+/)?.[0] ?? '100',
      );
      projectileAppearedBeforeLaunchReadout = !launchLabel;
    } else if (Math.abs(x - firstProjectileX) > 1) {
      projectileMoved = true;
    }
  }
  finalEnemyHp = Number.parseFloat(
    (await enemy.locator('.sprite-hp i').getAttribute('style'))?.match(/[\d.]+/)?.[0] ?? String(finalEnemyHp),
  );
  if (projectileMoved && finalEnemyHp < (enemyHpWhenProjectileAppeared ?? initialEnemyHp)) damageAfterFlight = true;
  await page.waitForTimeout(25);
}

await browser.close();

const result = {
  configuredProgram,
  projectileSeen,
  projectileMoved,
  damageAfterFlight,
  launchLabel,
  projectileAppearedBeforeLaunchReadout,
  initialEnemyHp,
  enemyHpWhenProjectileAppeared,
  finalEnemyHp,
  armingSeen,
  armedSeen,
  errors,
};
console.log(JSON.stringify(result, null, 2));

if (!configuredProgram.includes('いつでも') || !configuredProgram.includes('直進弾を撃つ'))
  throw new Error('直進弾を通常作戦へ設定できません');
if (!projectileSeen || !projectileMoved) throw new Error('直進弾が独立した座標オブジェクトとして移動していません');
if (!armingSeen || !armedSeen) throw new Error('直進弾の安全距離から有効化への遷移が表示されていません');
if ((enemyHpWhenProjectileAppeared ?? 0) < initialEnemyHp)
  throw new Error('投射物の発射時点で即時ダメージが発生しています');
if (!damageAfterFlight) throw new Error('投射物が時間経過後の接触でダメージを与えていません');
if (!launchLabel.includes('パルスボルト｜発射')) throw new Error('投射物の発射イベントが表示されていません');
if (!projectileAppearedBeforeLaunchReadout)
  throw new Error('演出キューを待たずに投射物シミュレーションが進んでいません');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
