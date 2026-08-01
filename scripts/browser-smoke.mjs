import { chromium } from 'playwright-core';

const requestedTarget = process.argv.slice(2).find((argument) => argument !== '--') ?? 'http://127.0.0.1:5173';
const target = new URL(requestedTarget);
target.searchParams.set('seed', '1');
target.searchParams.set('mode', 'casual');

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const browserErrors = [];

const watchErrors = (page) => {
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
};

const assertNoHorizontalOverflow = async (page, label) => {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    root: document.documentElement.scrollWidth,
    shell: document.querySelector('.synergy-shell')?.scrollWidth ?? 0,
    shellClient: document.querySelector('.synergy-shell')?.clientWidth ?? 0,
  }));
  if (metrics.root > metrics.viewport + 1 || metrics.shell > metrics.shellClient + 1) {
    throw new Error(`${label} overflows horizontally: ${JSON.stringify(metrics)}`);
  }
};

const draftThree = async (page) => {
  for (let round = 0; round < 3; round += 1) {
    const cards = page.locator('.synergy-draft-grid .synergy-monster-card');
    if ((await cards.count()) !== 3) throw new Error(`Draft round ${round + 1} does not show three choices`);
    if ((await cards.first().locator('.synergy-trait').count()) !== 1)
      throw new Error('Draft does not show the fixed trait');
    if ((await cards.first().locator('.synergy-skill-chip').count()) !== 3)
      throw new Error('Draft does not show three native skills');
    await cards.first().getByRole('button', { name: 'この個体を迎える' }).click();
  }
  await page.locator('.prep-board').waitFor();
};

const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
watchErrors(desktop);
await desktop.goto(target.toString(), { waitUntil: 'networkidle' });
await desktop.getByRole('heading', { name: '血統航路' }).waitFor();
const draftText = await desktop.locator('body').innerText();
if (
  draftText.includes('レベル') ||
  draftText.includes('経験値') ||
  draftText.includes('白星') ||
  draftText.includes('色星')
) {
  throw new Error('Retired progression concepts are visible in the draft');
}
await draftThree(desktop);

if ((await desktop.locator('.workbench-layout').count()) !== 1)
  throw new Error('Workshop is not presented as a one-screen workbench');
if ((await desktop.locator('.team-panel').count()) !== 1 || (await desktop.locator('.shop-view').count()) !== 1)
  throw new Error('Team and shop are not visible together');
if ((await desktop.locator('.team-zone.is-active .roster-card').count()) !== 3)
  throw new Error('The one-screen team panel does not show three active monsters');
if ((await desktop.locator('.synergy-tabs').count()) !== 0)
  throw new Error('The regressed full-page tab navigation is still visible');
if ((await desktop.locator('.prep-command-dock').count()) !== 1)
  throw new Error('The persistent workshop command dock is missing');
await assertNoHorizontalOverflow(desktop, 'Desktop team view');
await desktop.screenshot({ path: '/tmp/code-monsters-workbench-desktop.png' });
await desktop.locator('.team-zone.is-active .roster-card').first().click();
const inspector = desktop.locator('.synergy-inspector');
await inspector.waitFor();
if ((await inspector.locator('.synergy-skill-chip').count()) !== 3)
  throw new Error('The direct monster inspector does not show the selected three skills');
if ((await inspector.locator('.synergy-gambits').count()) !== 1)
  throw new Error('The direct monster inspector does not expose tactics');
await desktop.screenshot({ path: '/tmp/code-monsters-inspector-desktop.png' });
await inspector.getByRole('button', { name: '閉じる', exact: true }).click();

await desktop.getByRole('button', { name: '戦闘を開始する' }).click();
await desktop.locator('.battle-screen').waitFor();
if ((await desktop.locator('.battlefield.battle-arena').count()) !== 1)
  throw new Error('The original battle arena is missing');
if ((await desktop.locator('.battle-sprite').count()) !== 6)
  throw new Error('The battle arena does not render both 3-monster formations');
if ((await desktop.locator('.battle-console').count()) !== 1 || (await desktop.locator('.replay-pips').count()) !== 1)
  throw new Error('Battle replay controls or timeline are missing');
await desktop.screenshot({ path: '/tmp/code-monsters-battle-desktop.png' });
await desktop.getByRole('button', { name: '再生速度 4倍' }).click();
await desktop.locator('.battle-screen.is-frame-battle-start-effect').waitFor();
if ((await desktop.locator('.battle-opening-sequence').count()) !== 1)
  throw new Error('Trait or equipment opening animation is missing');
await desktop.locator('.battle-screen.is-frame-action').waitFor();
if ((await desktop.locator('.battle-sprite.is-acting').count()) !== 1)
  throw new Error('Battle action animation does not identify the acting monster');
await desktop.screenshot({ path: '/tmp/code-monsters-battle-action-desktop.png' });
const skipBattle = desktop.getByRole('button', { name: '最後まで送る' });
if ((await skipBattle.count()) > 0) await skipBattle.click();
await desktop.getByRole('button', { name: '結果を見る' }).click();
await desktop.locator('.result-screen').waitFor();
if ((await desktop.locator('.combat-ledger').count()) !== 1) throw new Error('The detailed combat report is missing');
await desktop.screenshot({ path: '/tmp/code-monsters-result-restored-desktop.png' });
await desktop.getByRole('button', { name: '次のサイクルへ' }).click();
await desktop.locator('.prep-board').waitFor();

await desktop.getByRole('button', { name: '特殊配合を開く' }).click();
if ((await desktop.locator('.synergy-recipe-grid > article').count()) !== 27) {
  throw new Error('Breeding map does not show all 27 breeding-only species');
}
const recipeCards = desktop.locator('.synergy-recipe-grid > article');
if ((await recipeCards.first().locator('p').count()) !== 2) {
  throw new Error('A breeding-only species does not show exactly two recipes');
}
const readyRecipe = desktop.locator('.synergy-ready-recipes > button').first();
if ((await readyRecipe.count()) !== 1) throw new Error('Seed 1 does not expose the expected immediate special recipe');
await desktop.screenshot({ path: '/tmp/code-monsters-breeding-map-desktop.png' });
await readyRecipe.click();

const dialog = desktop.locator('.synergy-breeding-dialog');
await dialog.waitFor();
if (!(await dialog.getByText('TRAIT IS FIXED', { exact: false }).count()))
  throw new Error('Breeding does not identify the fixed child trait');
if ((await dialog.locator('.synergy-gene-slots > span').count()) !== 3)
  throw new Error('Breeding does not show three gene slots');
if ((await dialog.locator('.synergy-gene-slots > .is-filled').count()) !== 3)
  throw new Error('Breeding does not initialize an exact three-skill selection');
if ((await dialog.locator('.synergy-skill-pool button').count()) < 3)
  throw new Error('Breeding skill pool is incomplete');
const sourceLabels = await dialog.locator('.synergy-skill-pool .synergy-skill-chip small').allTextContents();
if (sourceLabels.some((label) => !label || !/(親1|親2|子)/.test(label)))
  throw new Error(`Skill provenance is missing: ${sourceLabels.join(',')}`);

const selectedSkill = dialog.locator('.synergy-skill-pool button.is-selected').first();
await selectedSkill.click();
if ((await dialog.locator('.synergy-gene-slots > .is-filled').count()) !== 2)
  throw new Error('Removing a skill does not free one gene slot');
const replacementSkill = dialog.locator('.synergy-skill-pool button:not(.is-selected)').first();
await replacementSkill.click();
if ((await dialog.locator('.synergy-gene-slots > .is-filled').count()) !== 3)
  throw new Error('Selecting a replacement does not refill the gene slot');
await desktop.screenshot({ path: '/tmp/code-monsters-breeding-skills-desktop.png' });
await dialog.getByRole('button', { name: 'この3スキルで特殊配合する' }).click();
await desktop.locator('.synergy-breeding-dialog').waitFor({ state: 'detached' });
await desktop.getByRole('button', { name: '特殊配合を閉じる' }).click();

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
watchErrors(mobile);
await mobile.goto(target.toString(), { waitUntil: 'networkidle' });
await mobile.getByRole('heading', { name: '血統航路' }).waitFor();
await assertNoHorizontalOverflow(mobile, 'Mobile draft');
await mobile.screenshot({ path: '/tmp/code-monsters-synergy-draft-mobile.png' });
await draftThree(mobile);
await assertNoHorizontalOverflow(mobile, 'Mobile team view');
await mobile.screenshot({ path: '/tmp/code-monsters-workbench-mobile.png' });
await mobile.getByRole('button', { name: '戦闘を開始する' }).click();
await mobile.locator('.battle-screen').waitFor();
await assertNoHorizontalOverflow(mobile, 'Mobile battle');
if ((await mobile.locator('.battle-sprite').count()) !== 6)
  throw new Error('Mobile battle does not render both formations');
await mobile.screenshot({ path: '/tmp/code-monsters-battle-restored-mobile.png' });
const mobileSkipBattle = mobile.getByRole('button', { name: '最後まで送る' });
if ((await mobileSkipBattle.count()) > 0) await mobileSkipBattle.click();
await mobile.getByRole('button', { name: '結果を見る' }).click();
await mobile.getByRole('button', { name: '次のサイクルへ' }).click();
await mobile.locator('.prep-board').waitFor();
await mobile.getByRole('button', { name: '特殊配合を開く' }).click();
await mobile.locator('.synergy-ready-recipes > button').first().click();
await assertNoHorizontalOverflow(mobile, 'Mobile breeding dialog');
await mobile.screenshot({ path: '/tmp/code-monsters-breeding-skills-mobile.png' });

await browser.close();
if (browserErrors.length > 0) throw new Error(`Browser errors:\n${browserErrors.join('\n')}`);

console.log(
  JSON.stringify({
    target: target.toString(),
    screenshots: [
      '/tmp/code-monsters-workbench-desktop.png',
      '/tmp/code-monsters-inspector-desktop.png',
      '/tmp/code-monsters-breeding-map-desktop.png',
      '/tmp/code-monsters-breeding-skills-desktop.png',
      '/tmp/code-monsters-battle-desktop.png',
      '/tmp/code-monsters-battle-action-desktop.png',
      '/tmp/code-monsters-result-restored-desktop.png',
      '/tmp/code-monsters-synergy-draft-mobile.png',
      '/tmp/code-monsters-workbench-mobile.png',
      '/tmp/code-monsters-battle-restored-mobile.png',
      '/tmp/code-monsters-breeding-skills-mobile.png',
    ],
  }),
);
