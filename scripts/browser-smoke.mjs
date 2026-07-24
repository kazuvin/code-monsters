import { chromium } from 'playwright-core';

const requestedTarget = process.argv.slice(2).find((argument) => argument !== '--') ?? 'http://127.0.0.1:5173';
const target = new URL(requestedTarget);
target.searchParams.set('seed', target.searchParams.get('seed') ?? '7261');

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const errors = [];
const watchErrors = (page) => {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
};

const assertFitsViewport = async (page, label) => {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  if (metrics.scrollWidth > metrics.viewportWidth + 1 || metrics.scrollHeight > metrics.viewportHeight + 1) {
    throw new Error(`${label} overflows the viewport: ${JSON.stringify(metrics)}`);
  }
};

const desktop = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
watchErrors(desktop);
await desktop.addInitScript(() => {
  window.localStorage.setItem('code-monsters:recipe-discovery:v1', JSON.stringify(['fire-spirit-3']));
});
await desktop.goto(target.toString(), { waitUntil: 'networkidle' });
await desktop.getByRole('heading', { name: '血統航路' }).waitFor();
if ((await desktop.locator('.white-stars').first().textContent()) !== '★') {
  throw new Error('White stars are not rendered with the shared text glyph');
}
if ((await desktop.locator('body').innerText()).includes('⭐')) {
  throw new Error('Emoji stars are still visible in the UI');
}

for (let round = 0; round < 3; round += 1) {
  const choices = desktop.locator('.draft-grid .definition-card');
  if ((await choices.count()) !== 3) throw new Error(`Draft round ${round + 1} does not show three choices`);
  if (round === 0) {
    await choices.first().locator('.definition-card-main').click();
    await desktop.locator('.prospect-dialog[open]').waitFor();
    if ((await desktop.locator('.prospect-dialog .monster-detail-card').count()) !== 1) {
      throw new Error('Draft monster does not open the shared detail card');
    }
    await desktop.locator('.prospect-dialog').getByRole('button', { name: '閉じる' }).click();
  }
  await desktop.locator('.draft-choice .monster-card-footer button').first().click();
}

await desktop.getByRole('heading', { name: '旅商人の棚' }).waitFor();
if ((await desktop.locator('.team-panel .roster-card.is-active').count()) !== 3) {
  throw new Error('Initial draft did not create a three-monster active party');
}
if ((await desktop.locator('.shop-monsters .definition-card, .shop-monsters .sold-slot').count()) !== 3) {
  throw new Error('Monster shop does not have three slots');
}
if ((await desktop.locator('.equipment-offers > *').count()) !== 2) {
  throw new Error('Equipment shop does not have two slots');
}
if ((await desktop.locator('.shop-monsters .card-detail-button').count()) !== 3) {
  throw new Error('Shop monsters do not expose a detail action');
}
await desktop.locator('.shop-monsters .definition-card-main').first().click();
await desktop.locator('.prospect-dialog[open]').waitFor();
if ((await desktop.locator('.prospect-dialog .stat-grid span').count()) !== 7) {
  throw new Error('Shop prospect detail does not show all seven stats');
}
await desktop.screenshot({ path: '/tmp/code-monsters-prospect-desktop.png', fullPage: true });
await desktop.locator('.prospect-dialog').getByRole('button', { name: '閉じる' }).click();

await desktop.locator('.equipment-offers article footer button').first().click();
const coinsBefore = Number((await desktop.locator('.coin-metric b').textContent())?.trim());
await desktop.locator('.shop-monsters .buy-button').first().click();
const coinsAfter = Number((await desktop.locator('.coin-metric b').textContent())?.trim());
if (coinsAfter !== coinsBefore - 3) throw new Error('Buying a rank-one monster did not spend three coins');
if ((await desktop.locator('.team-panel .roster-card').count()) !== 4) {
  throw new Error('Bought monster did not enter the roster');
}
const activeNamesBeforeReorder = await desktop.locator('.team-zone.is-active .roster-card strong').allTextContents();
const firstActiveBox = await desktop.locator('.team-zone.is-active .roster-card').first().boundingBox();
const lastActiveBox = await desktop.locator('.team-zone.is-active .roster-card').last().boundingBox();
if (!firstActiveBox || !lastActiveBox) throw new Error('Could not measure active formation slots');
await desktop.mouse.move(firstActiveBox.x + firstActiveBox.width / 2, firstActiveBox.y + firstActiveBox.height / 2);
await desktop.mouse.down();
await desktop.mouse.move(lastActiveBox.x + lastActiveBox.width / 2, lastActiveBox.y + lastActiveBox.height / 2, {
  steps: 8,
});
await desktop.mouse.up();
const activeNamesAfterReorder = await desktop.locator('.team-zone.is-active .roster-card strong').allTextContents();
if (activeNamesBeforeReorder.join('|') === activeNamesAfterReorder.join('|')) {
  throw new Error('Drag and drop did not reorder the active formation');
}

if ((await desktop.locator('.workshop-tabs button').count()) !== 2) {
  throw new Error('Workshop navigation should contain only shop and breeding');
}
await desktop.locator('.team-zone.is-active .roster-card').first().click();
await desktop.locator('.monster-dialog .inventory-list .equipment-card').first().click();
if ((await desktop.locator('.monster-dialog[open]').count()) !== 1) {
  throw new Error('Equipping an item closed the monster detail dialog');
}
await desktop.getByRole('button', { name: 'ガンビット' }).click();
if ((await desktop.locator('.gambit-row').count()) !== 3) throw new Error('Monster detail does not show three gambits');
if ((await desktop.locator('.gambit-skill-note').count()) !== 3) {
  throw new Error('Gambit actions do not explain skill effects');
}
await desktop.locator('.gambit-row select[aria-label="スキル"]').first().selectOption({ index: 1 });
if ((await desktop.locator('.monster-dialog[open]').count()) !== 1) {
  throw new Error('Editing a gambit closed the monster detail dialog');
}
if ((await desktop.locator('.inspector-tabs button').count()) !== 2) {
  throw new Error('Monster detail still contains a breeding recipe tab');
}
await desktop.getByRole('button', { name: '閉じる' }).click();
await desktop.getByRole('button', { name: '02 配合' }).click();
await desktop.getByRole('button', { name: /特殊配合図鑑/ }).click();
if ((await desktop.locator('.recipe-card.is-special').count()) !== 3) {
  throw new Error('Breeding archive does not show all three special breeding recipes');
}
if ((await desktop.locator('.recipe-card:not(.is-special)').count()) !== 0) {
  throw new Error('Breeding archive still shows non-special breeding recipes');
}
if ((await desktop.locator('[data-recipe-slot="result"].is-locked').count()) !== 2) {
  throw new Error('Previously discovered special result was not restored from persistent discovery');
}
await desktop.getByRole('button', { name: '閉じる' }).click();

await desktop.screenshot({ path: '/tmp/code-monsters-casual-desktop.png', fullPage: true });
await desktop.getByRole('button', { name: 'ATB 3 × 3 戦闘を開始する' }).click();
await desktop.getByRole('heading', { name: '非同期ゴースト戦' }).waitFor();
if ((await desktop.locator('.battle-sprite').count()) !== 6) throw new Error('Battle field is not 3v3');
if ((await desktop.locator('.battle-fx').count()) !== 1) throw new Error('Battle effect layer is missing');
const enemyFormationBox = await desktop.locator('.battle-team.is-enemy').boundingBox();
const playerFormationBox = await desktop.locator('.battle-team.is-player').boundingBox();
if (!enemyFormationBox || !playerFormationBox || enemyFormationBox.x >= playerFormationBox.x) {
  throw new Error('Battle teams are not arranged left-to-right');
}
await desktop.getByRole('button', { name: '再生速度 4倍' }).click();
await desktop.locator('.battle-screen[data-skill-id]').waitFor({ timeout: 3000 });
if (
  (await desktop
    .locator(
      '.battle-screen.is-skill-physical, .battle-screen.is-skill-magic, .battle-screen.is-skill-heal, .battle-screen.is-skill-status, .battle-screen.is-skill-shield',
    )
    .count()) !== 1
) {
  throw new Error('Battle skill did not select an effect presentation');
}
await desktop.screenshot({ path: '/tmp/code-monsters-battle-desktop.png', fullPage: true });
await desktop.getByRole('button', { name: '最後まで送る' }).click();
await desktop.getByRole('button', { name: '結果を見る →' }).click();
await desktop.getByRole('heading', { name: '戦闘報告' }).waitFor();
const revealRewards = desktop.getByRole('button', { name: '報酬をすべて表示' });
if ((await revealRewards.count()) === 1) await revealRewards.click();
await desktop.locator('.result-screen[data-reveal-complete="true"]').waitFor();
if ((await desktop.locator('.battle-report-metric').count()) !== 4) {
  throw new Error('Battle result does not show the four report metrics');
}
if ((await desktop.locator('.result-monster-card').count()) !== 4) {
  throw new Error('Battle result does not show active and bench XP');
}
if ((await desktop.locator('.result-monster-card [data-xp-gain]').count()) !== 4) {
  throw new Error('Battle result does not expose each monster XP gain');
}
await desktop.waitForTimeout(450);
await desktop.screenshot({ path: '/tmp/code-monsters-result-desktop.png', fullPage: true });

await desktop.getByRole('button', { name: 'NEXT CYCLE 2 旅を続ける' }).click();
for (const cycle of [2, 3]) {
  if (cycle === 3) {
    await desktop.getByRole('heading', { name: '旅路が枝分かれした' }).waitFor();
    await desktop.locator('.event-grid button').first().click();
  }
  await desktop.getByRole('button', { name: 'ATB 3 × 3 戦闘を開始する' }).click();
  await desktop.getByRole('button', { name: '最後まで送る' }).click();
  await desktop.getByRole('button', { name: '結果を見る →' }).click();
  await desktop.getByRole('heading', { name: '戦闘報告' }).waitFor();
  const reveal = desktop.getByRole('button', { name: '報酬をすべて表示' });
  if ((await reveal.count()) === 1) await reveal.click();
  await desktop.locator('.result-screen[data-reveal-complete="true"]').waitFor();
  await desktop.getByRole('button', { name: `NEXT CYCLE ${cycle + 1} 旅を続ける` }).click();
}

await desktop.getByRole('button', { name: '02 配合' }).click();
const eligibleParents = desktop.locator('.parent-choice:not(:disabled)');
if ((await eligibleParents.count()) < 2) {
  throw new Error('Three battles did not produce two eligible breeding parents');
}
await eligibleParents.first().click();
await eligibleParents.nth(1).click();
await desktop.locator('.breeding-preview').waitFor();
if ((await desktop.locator('.breeding-preview .preview-stat').count()) !== 7) {
  throw new Error('Selected breeding result does not preview all seven stats');
}
await desktop.getByRole('button', { name: '能力を詳しく見る' }).click();
await desktop.locator('.prospect-dialog[open]').waitFor();
if ((await desktop.locator('.prospect-dialog .stat-grid span').count()) !== 7) {
  throw new Error('Breeding result detail does not show all seven stats');
}
await desktop.locator('.prospect-dialog').getByRole('button', { name: '閉じる' }).click();
if ((await desktop.getByRole('button', { name: '配合内容を確認' }).count()) !== 1) {
  throw new Error('Breeding flow does not include a confirmation step');
}
await desktop.screenshot({ path: '/tmp/code-monsters-breeding-desktop.png', fullPage: true });
await desktop.getByRole('button', { name: '配合内容を確認' }).click();
await desktop.locator('.breeding-confirm-dialog[open]').waitFor();
if ((await desktop.locator('.breeding-confirm-dialog li').count()) !== 4) {
  throw new Error('Breeding confirmation does not explain all irreversible effects');
}
await desktop.getByRole('button', { name: 'この内容で配合する' }).click();
await desktop.locator('.breeding-reveal-dialog[open]').waitFor();
await desktop.locator('.breeding-reveal-dialog.reveal-stage-2').waitFor();
await desktop.screenshot({ path: '/tmp/code-monsters-breeding-reveal-desktop.png', fullPage: true });
await desktop.getByRole('button', { name: 'この仲間を見る →' }).click();
await desktop.locator('.monster-dialog[open]').waitFor();
if ((await desktop.locator('.monster-dialog .stat-grid span').count()) !== 7) {
  throw new Error('Newborn monster detail did not open after breeding');
}
await desktop.getByRole('button', { name: 'ガンビット' }).click();
if ((await desktop.locator('.monster-dialog .gambit-row').count()) !== 3) {
  throw new Error('Newborn monster gambits are not reachable after breeding');
}
await desktop.getByRole('button', { name: '閉じる' }).click();

const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
});
watchErrors(mobile);
await mobile.goto(target.toString(), { waitUntil: 'networkidle' });
await mobile.getByRole('heading', { name: '旅のはじまりを選ぶ' }).waitFor();
if ((await mobile.locator('.draft-grid .definition-card').count()) !== 3) {
  throw new Error('Mobile draft does not show three choices');
}
await assertFitsViewport(mobile, 'Mobile draft');
await mobile.screenshot({ path: '/tmp/code-monsters-draft-mobile.png' });

for (let round = 0; round < 3; round += 1) {
  const choices = mobile.locator('.draft-grid .definition-card');
  if ((await choices.count()) !== 3) throw new Error(`Mobile draft round ${round + 1} does not show three choices`);
  await mobile.locator('.draft-choice .monster-card-footer button').first().click();
}

await mobile.getByRole('heading', { name: '旅商人の棚' }).waitFor();
await assertFitsViewport(mobile, 'Mobile workshop');

const mobileActiveCard = mobile.locator('.team-zone.is-active .roster-card').first();
await mobileActiveCard.click();
await mobile.locator('dialog[open]').waitFor();
if ((await mobile.locator('.monster-dialog .stat-grid span').count()) !== 7) {
  throw new Error('Monster detail dialog does not show all seven stats');
}
await mobile.getByRole('button', { name: 'ガンビット' }).click();
if ((await mobile.locator('.monster-dialog .gambit-row').count()) !== 3) {
  throw new Error('Mobile monster dialog does not show all three gambits');
}
if ((await mobile.locator('.monster-dialog .inspector-tabs button').count()) !== 2) {
  throw new Error('Mobile monster dialog still contains a breeding recipe tab');
}
await mobile.getByRole('button', { name: '閉じる' }).click();
await mobile.getByRole('button', { name: '02 配合' }).click();
await mobile.getByRole('button', { name: /特殊配合図鑑/ }).click();
if ((await mobile.locator('.recipe-dialog .recipe-card.is-special').count()) !== 3) {
  throw new Error('Mobile breeding archive does not show all three special breeding recipes');
}
if ((await mobile.locator('.recipe-dialog [data-recipe-slot="result"].is-locked').count()) !== 3) {
  throw new Error('Undiscovered special breeding results are not silhouetted on mobile');
}
await mobile.screenshot({ path: '/tmp/code-monsters-recipes-mobile.png' });
await mobile.getByRole('button', { name: '閉じる' }).click();
await mobile.getByRole('button', { name: '01 ショップ' }).click();

await mobile.locator('.shop-monsters .buy-button').first().click();
const draggable = mobile.locator('.team-zone.is-active .roster-card').first();
const draggableBox = await draggable.boundingBox();
const benchBox = await mobile.locator('.team-zone.is-bench').boundingBox();
if (!draggableBox || !benchBox) throw new Error('Could not measure the long-press drag targets');
await mobile.mouse.move(draggableBox.x + draggableBox.width / 2, draggableBox.y + draggableBox.height / 2);
await mobile.mouse.down();
await mobile.waitForTimeout(500);
await mobile.mouse.move(benchBox.x + benchBox.width / 2, benchBox.y + benchBox.height / 2, { steps: 5 });
await mobile.mouse.up();
if ((await mobile.locator('.team-zone.is-active .roster-card').count()) !== 2) {
  throw new Error('Long-press drag did not move a monster from active to bench');
}
await mobile.screenshot({ path: '/tmp/code-monsters-workshop-mobile.png' });

await mobile.locator('.team-zone.is-bench .roster-card').first().click();
await mobile.getByRole('button', { name: '主力へ出す' }).click();
await mobile.getByRole('button', { name: '閉じる' }).click();
await mobile.getByRole('button', { name: 'ATB 3 × 3 戦闘を開始する' }).click();
await mobile.getByRole('button', { name: '最後まで送る' }).click();
await mobile.getByRole('button', { name: '結果を見る →' }).click();
const revealMobileRewards = mobile.getByRole('button', { name: '報酬をすべて表示' });
if ((await revealMobileRewards.count()) === 1) await revealMobileRewards.click();
await mobile.locator('.result-screen[data-reveal-complete="true"]').waitFor();
await mobile.waitForTimeout(450);
await assertFitsViewport(mobile, 'Mobile result');
await mobile.screenshot({ path: '/tmp/code-monsters-result-mobile.png' });

await browser.close();
if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);

console.log(
  JSON.stringify({
    target: target.toString(),
    screenshots: [
      '/tmp/code-monsters-casual-desktop.png',
      '/tmp/code-monsters-prospect-desktop.png',
      '/tmp/code-monsters-battle-desktop.png',
      '/tmp/code-monsters-result-desktop.png',
      '/tmp/code-monsters-breeding-desktop.png',
      '/tmp/code-monsters-breeding-reveal-desktop.png',
      '/tmp/code-monsters-draft-mobile.png',
      '/tmp/code-monsters-recipes-mobile.png',
      '/tmp/code-monsters-workshop-mobile.png',
      '/tmp/code-monsters-result-mobile.png',
    ],
  }),
);
