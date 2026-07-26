import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';

const requestedTarget = process.argv.slice(2).find((argument) => argument !== '--') ?? 'http://127.0.0.1:5173';
const target = new URL(requestedTarget);
target.searchParams.set('seed', target.searchParams.get('seed') ?? '1');
target.searchParams.set('mode', 'casual');

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

const assertFitsViewport = async (page, label, allowVerticalScroll = false) => {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  if (
    metrics.scrollWidth > metrics.viewportWidth + 1 ||
    (!allowVerticalScroll && metrics.scrollHeight > metrics.viewportHeight + 1)
  ) {
    throw new Error(`${label} overflows the viewport: ${JSON.stringify(metrics)}`);
  }
};

const assertReadableMonsterCards = async (page, label, cardSelector, nameSelector, minimumStarSize = 12) => {
  const cards = page.locator(`${cardSelector}:visible`);
  if ((await cards.count()) === 0) {
    throw new Error(`${label} does not expose any visible monster cards`);
  }

  const clippedNames = await cards.locator(nameSelector).evaluateAll((names) =>
    names
      .map((name) => {
        const style = getComputedStyle(name);
        return {
          name: name.textContent?.trim(),
          whiteSpace: style.whiteSpace,
          textOverflow: style.textOverflow,
          fontSize: Number.parseFloat(style.fontSize),
          clientWidth: name.clientWidth,
          scrollWidth: name.scrollWidth,
        };
      })
      .filter(
        ({ whiteSpace, textOverflow, fontSize, clientWidth, scrollWidth }) =>
          whiteSpace === 'nowrap' || textOverflow === 'ellipsis' || fontSize < 10 || scrollWidth > clientWidth + 1,
      ),
  );
  if (clippedNames.length > 0) {
    throw new Error(`${label} clips or miniaturizes monster names: ${JSON.stringify(clippedNames)}`);
  }

  const longestNameLayout = await cards
    .locator(nameSelector)
    .first()
    .evaluate((name) => {
      const originalName = name.textContent;
      name.textContent = '白翼アークデーモン';
      const layout = {
        clientWidth: name.clientWidth,
        scrollWidth: name.scrollWidth,
        clientHeight: name.clientHeight,
        scrollHeight: name.scrollHeight,
      };
      name.textContent = originalName;
      return layout;
    });
  if (
    longestNameLayout.scrollWidth > longestNameLayout.clientWidth + 1 ||
    longestNameLayout.scrollHeight > longestNameLayout.clientHeight + 1
  ) {
    throw new Error(`${label} cannot fit the longest monster name: ${JSON.stringify(longestNameLayout)}`);
  }

  const cardStars = cards.locator('.stars');
  if ((await cardStars.count()) < (await cards.count())) {
    throw new Error(`${label} does not show a star rank on every monster card`);
  }
  const undersizedStars = await cardStars.evaluateAll(
    (stars, threshold) =>
      stars
        .map((star) => ({
          text: star.textContent?.trim(),
          fontSize: Number.parseFloat(getComputedStyle(star).fontSize),
        }))
        .filter(({ fontSize }) => fontSize < threshold),
    minimumStarSize,
  );
  if (undersizedStars.length > 0) {
    throw new Error(`${label} has undersized stars: ${JSON.stringify(undersizedStars)}`);
  }
};

const desktop = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
watchErrors(desktop);
await desktop.addInitScript(() => {
  window.localStorage.setItem('code-monsters:recipe-discovery:v4', JSON.stringify(['fire-spirit-3', 'buried-mole-1']));
  window.localStorage.setItem('code-monsters:skill-discovery:v4', JSON.stringify(['tail-swipe']));
  window.localStorage.setItem('code-monsters:event-discovery:v4', JSON.stringify(['merchant-gift']));
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
    await assertReadableMonsterCards(
      desktop,
      'Desktop draft',
      '.draft-grid .definition-card',
      '.monster-card-copy > strong',
    );
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
if (!(await desktop.locator('.equipment-rarity-readout').innerText()).includes('C 55% · R 28% · E 13% · L 4%')) {
  throw new Error('Equipment shop does not expose all rarity rates');
}
if (
  (await desktop
    .locator('.equipment-offer header > small')
    .evaluateAll((labels) =>
      labels.every((label) => /コモン|レア|エピック|レジェンダリー/.test(label.textContent ?? '')),
    )) !== true
) {
  throw new Error('Equipment offers do not display their rarity');
}
if ((await desktop.locator('.shop-monsters .card-detail-button').count()) !== 3) {
  throw new Error('Shop monsters do not expose a detail action');
}
await assertReadableMonsterCards(desktop, 'Desktop active formation', '.team-zone.is-active .roster-card', 'strong');
await assertReadableMonsterCards(
  desktop,
  'Desktop monster shop',
  '.shop-monsters .definition-card',
  '.monster-card-copy > strong',
);
await desktop.getByRole('button', { name: /図鑑/ }).click();
await desktop.locator('.catalog-dialog[open]').waitFor();
if ((await desktop.locator('.catalog-index .catalog-card').count()) !== 52) {
  throw new Error('Monster catalog does not show all 45 lineage-grid and seven standalone records');
}
if ((await desktop.locator('.catalog-card[data-catalog-id="training-lynx-1"]').count()) !== 1) {
  throw new Error('Attack-experience monster is missing from the catalog');
}
if ((await desktop.locator('.catalog-card.is-unlocked').count()) < 3) {
  throw new Error('Monsters welcomed during the draft were not unlocked in the catalog');
}
await assertReadableMonsterCards(
  desktop,
  'Desktop monster catalog',
  '.catalog-card.is-unlocked',
  '.catalog-card-copy strong',
);
await desktop.locator('.catalog-card[data-catalog-id="light-dragon-2"]').click();
if ((await desktop.locator('.catalog-detail[data-catalog-detail-state="locked"]').count()) !== 1) {
  throw new Error('Undiscovered monster does not open a locked silhouette record');
}
if ((await desktop.locator('.catalog-detail.is-locked .effect-skill-card').count()) !== 0) {
  throw new Error('Undiscovered monster exposes skill effects');
}
if ((await desktop.locator('.catalog-detail-tabs button').count()) !== 2) {
  throw new Error('Catalog detail does not expose profile and special breeding tabs');
}
await desktop.locator('.catalog-detail-tabs').getByRole('button', { name: '特殊配合' }).click();
if ((await desktop.locator('[data-recipe-relation="used-by"] .recipe-card.is-special').count()) !== 3) {
  throw new Error('Catalog detail does not show all special recipes that consume the selected monster');
}
if ((await desktop.locator('.catalog-detail [data-recipe-focus="true"].is-locked').count()) !== 3) {
  throw new Error('Undiscovered selected monster is not silhouetted in its catalog recipe relations');
}
if ((await desktop.locator('.catalog-detail .recipe-card:not(.is-special)').count()) !== 0) {
  throw new Error('Catalog detail recipe tab contains a non-special recipe');
}
await desktop.screenshot({ path: '/tmp/code-monsters-catalog-recipes-desktop.png', fullPage: true });
await desktop.locator('.catalog-card[data-catalog-id="buried-mole-1"]').click();
if ((await desktop.locator('.catalog-detail[data-catalog-detail-state="unlocked"]').count()) !== 1) {
  throw new Error('Discovered standalone monster does not open as a complete catalog record');
}
await desktop.locator('.catalog-detail-tabs').getByRole('button', { name: '特殊配合' }).click();
if ((await desktop.locator('.catalog-detail .monster-recipe-empty').count()) !== 2) {
  throw new Error('Standalone catalog record does not keep both empty special breeding directions');
}
if (
  (await desktop.getByText('このモンスターを作る特殊配合はありません。').count()) !== 1 ||
  (await desktop.getByText('このモンスターを親として使う特殊配合はありません。').count()) !== 1
) {
  throw new Error('Standalone catalog record does not explain both unavailable special breeding directions');
}
await desktop.screenshot({ path: '/tmp/code-monsters-catalog-standalone-desktop.png', fullPage: true });
await desktop.locator('.catalog-card.is-unlocked').first().click();
if ((await desktop.locator('.catalog-detail.is-unlocked .catalog-stat-grid span').count()) !== 7) {
  throw new Error('Discovered catalog record does not show all seven base stats');
}
if ((await desktop.locator('.catalog-detail.is-unlocked .effect-skill-card').count()) !== 3) {
  throw new Error('Discovered catalog record does not show all three skill effects');
}
if ((await desktop.locator('.catalog-detail.is-unlocked .growth-scan-row').count()) !== 2) {
  throw new Error('Discovered catalog record does not show aligned experience and stat growth scans');
}
await desktop
  .locator('.catalog-detail.is-unlocked .growth-scan-row.is-experience')
  .getByRole('button', { name: /レベル10/ })
  .click();
if (!(await desktop.locator('.catalog-detail.is-unlocked .growth-scan-reading').innerText()).includes('LV.10')) {
  throw new Error('Catalog growth scan does not expose the selected level reading');
}
await desktop.screenshot({ path: '/tmp/code-monsters-catalog-desktop.png', fullPage: true });
await desktop
  .locator('.catalog-section-tabs')
  .getByRole('button', { name: /スキル/ })
  .click();
if ((await desktop.locator('.catalog-text-index .catalog-card').count()) !== 39) {
  throw new Error('Skill catalog does not show all skill records');
}
await desktop.locator('[data-skill-catalog-id="tail-swipe"]').click();
if ((await desktop.locator('.catalog-skill-detail .effect-skill-card').count()) !== 1) {
  throw new Error('Discovered skill does not expose its complete effect record');
}
if ((await desktop.locator('.catalog-skill-detail .rarity-badge').innerText()) !== 'コモン') {
  throw new Error('Skill catalog does not show the selected skill rarity');
}
if ((await desktop.locator('.catalog-skill-detail .catalog-holder').count()) === 0) {
  throw new Error('Skill catalog does not show base monster holders');
}
await desktop.screenshot({ path: '/tmp/code-monsters-skill-catalog-desktop.png', fullPage: true });
await desktop
  .locator('.catalog-section-tabs')
  .getByRole('button', { name: /イベント/ })
  .click();
if ((await desktop.locator('.catalog-text-index .catalog-card').count()) !== 9) {
  throw new Error('Event catalog does not show all event records');
}
await desktop.locator('[data-event-catalog-id="merchant-gift"]').click();
if (!(await desktop.locator('.catalog-event-copy').innerText()).includes('コインを5枚受け取る')) {
  throw new Error('Experienced event does not expose its route effect');
}
await desktop.screenshot({ path: '/tmp/code-monsters-event-catalog-desktop.png', fullPage: true });
await desktop.locator('.catalog-dialog').getByRole('button', { name: '閉じる' }).click();
const discoveryBeforeDeveloperMode = await desktop.evaluate(() => ({
  monsters: window.localStorage.getItem('code-monsters:recipe-discovery:v4'),
  skills: window.localStorage.getItem('code-monsters:skill-discovery:v4'),
  events: window.localStorage.getItem('code-monsters:event-discovery:v4'),
}));
await desktop.locator('.developer-mode-switch').click();
await desktop.getByRole('button', { name: /図鑑/ }).click();
await desktop.locator('.catalog-dialog[open]').waitFor();
await desktop
  .locator('.catalog-section-tabs')
  .getByRole('button', { name: /モンスター/ })
  .click();
if ((await desktop.locator('.catalog-card.is-unlocked').count()) !== 52) {
  throw new Error('Developer mode does not reveal every monster catalog record');
}
await desktop
  .locator('.catalog-section-tabs')
  .getByRole('button', { name: /スキル/ })
  .click();
if ((await desktop.locator('.catalog-card.is-unlocked').count()) !== 39) {
  throw new Error('Developer mode does not reveal every skill catalog record');
}
await desktop
  .locator('.catalog-section-tabs')
  .getByRole('button', { name: /イベント/ })
  .click();
if ((await desktop.locator('.catalog-card.is-unlocked').count()) !== 9) {
  throw new Error('Developer mode does not reveal every event catalog record');
}
await desktop.screenshot({ path: '/tmp/code-monsters-developer-catalog-desktop.png', fullPage: true });
await desktop.locator('.catalog-dialog').getByRole('button', { name: '閉じる' }).click();
await desktop.locator('.developer-mode-switch').click();
const discoveryAfterDeveloperMode = await desktop.evaluate(() => ({
  monsters: window.localStorage.getItem('code-monsters:recipe-discovery:v4'),
  skills: window.localStorage.getItem('code-monsters:skill-discovery:v4'),
  events: window.localStorage.getItem('code-monsters:event-discovery:v4'),
}));
if (JSON.stringify(discoveryAfterDeveloperMode) !== JSON.stringify(discoveryBeforeDeveloperMode)) {
  throw new Error('Developer mode mutated persistent catalog discovery');
}
await desktop.locator('.shop-monsters .definition-card-main').first().click();
await desktop.locator('.prospect-dialog[open]').waitFor();
if ((await desktop.locator('.prospect-dialog .stat-grid span').count()) !== 7) {
  throw new Error('Shop prospect detail does not show all seven stats');
}
if ((await desktop.locator('.prospect-dialog .stat-bonus.is-base').count()) !== 7) {
  throw new Error('Base shop prospect stats do not expose their baseline breakdown');
}
if ((await desktop.locator('.prospect-dialog .effect-skill-card').count()) !== 3) {
  throw new Error('Monster detail does not show all three skills as effect cards');
}
if ((await desktop.locator('.prospect-dialog .skill-effect-fact').count()) < 3) {
  throw new Error('Monster detail skill cards do not expose concrete effect values');
}
if ((await desktop.locator('.prospect-dialog .farewell-value').count()) !== 1) {
  throw new Error('Monster detail does not expose the common farewell coin value');
}
await desktop.screenshot({ path: '/tmp/code-monsters-prospect-desktop.png', fullPage: true });
await desktop.locator('.prospect-dialog').getByRole('button', { name: '閉じる' }).click();

await desktop.locator('.equipment-offers article footer button').first().click();
const coinsBefore = Number((await desktop.locator('.coin-metric b').textContent())?.trim());
const firstOfferPrice = Number((await desktop.locator('.shop-monsters .buy-button b').first().textContent())?.trim());
await desktop.locator('.shop-monsters .buy-button').first().click();
const coinsAfter = Number((await desktop.locator('.coin-metric b').textContent())?.trim());
if (coinsAfter !== coinsBefore - firstOfferPrice) throw new Error('Buying a monster did not spend its displayed price');
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
if (
  (await desktop.locator('.monster-dialog .stat-bonus.is-equipment').count()) < 1 &&
  (await desktop.locator('.monster-dialog .equipped-row:not(.is-empty)').count()) !== 1
) {
  throw new Error('Equipped monster does not show its stat or battle-start equipment effect');
}
await desktop.screenshot({ path: '/tmp/code-monsters-stat-breakdown-desktop.png', fullPage: true });
await desktop.getByRole('button', { name: 'ガンビット' }).click();
if ((await desktop.locator('.gambit-row').count()) !== 3) throw new Error('Monster detail does not show three gambits');
if ((await desktop.locator('.gambit-skill-note').count()) !== 3) {
  throw new Error('Gambit actions do not explain skill effects');
}
await desktop.locator('.gambit-row select[aria-label="スキル"]').first().selectOption({ index: 1 });
if ((await desktop.locator('.monster-dialog[open]').count()) !== 1) {
  throw new Error('Editing a gambit closed the monster detail dialog');
}
if ((await desktop.locator('.monster-dialog .inspector-tabs button').count()) !== 3) {
  throw new Error('Monster detail does not expose profile, gambit, and special breeding tabs');
}
await desktop.locator('.monster-dialog .inspector-tabs').getByRole('button', { name: '特殊配合' }).click();
if ((await desktop.locator('.monster-dialog .monster-recipe-relation').count()) !== 2) {
  throw new Error('Monster detail does not show both directions of special breeding relations');
}
if ((await desktop.locator('.monster-dialog .recipe-card:not(.is-special)').count()) !== 0) {
  throw new Error('Monster detail recipe tab contains a non-special recipe');
}
await desktop.screenshot({ path: '/tmp/code-monsters-monster-recipes-desktop.png', fullPage: true });
await desktop.getByRole('button', { name: '閉じる', exact: true }).click();
await desktop.getByRole('button', { name: '02 配合' }).click();
await desktop.getByRole('button', { name: /特殊配合図鑑/ }).click();
if ((await desktop.locator('.recipe-card.is-special').count()) !== 9) {
  throw new Error('Breeding archive does not show all nine special breeding recipes');
}
if ((await desktop.locator('.recipe-card:not(.is-special)').count()) !== 0) {
  throw new Error('Breeding archive still shows non-special breeding recipes');
}
if ((await desktop.locator('[data-recipe-slot="result"].is-locked').count()) !== 8) {
  throw new Error('Previously discovered special result was not restored from persistent discovery');
}
await desktop.getByRole('button', { name: '閉じる', exact: true }).click();
await desktop.getByRole('button', { name: '配合ラボを閉じる' }).click();

await desktop.screenshot({ path: '/tmp/code-monsters-casual-desktop.png', fullPage: true });
await desktop.getByRole('button', { name: 'ATB 3 × 3 戦闘を開始する' }).click();
await desktop.getByRole('heading', { name: '非同期ゴースト戦' }).waitFor();
if ((await desktop.locator('.battle-sprite').count()) !== 6) throw new Error('Battle field is not 3v3');
if ((await desktop.locator('.battle-fx').count()) !== 1) throw new Error('Battle effect layer is missing');
await assertReadableMonsterCards(desktop, 'Desktop battle', '.battle-sprite', '.battle-monster-copy > strong');
const criticalFrameCount = Number(await desktop.locator('.battle-screen').getAttribute('data-critical-frame-count'));
if (criticalFrameCount < 1) {
  throw new Error(`Browser smoke seed does not produce a critical hit: ${target.toString()}`);
}
await desktop.evaluate(() => {
  let captureScheduled = false;
  const observer = new MutationObserver(() => {
    const screen = document.querySelector('.battle-screen.is-critical');
    if (!screen || captureScheduled || screen.getAttribute('data-critical-captured') === 'true') return;
    captureScheduled = true;
    const pulseDuration = Number.parseFloat(getComputedStyle(screen).getPropertyValue('--battle-pulse-duration'));
    window.setTimeout(() => {
      const currentScreen = document.querySelector('.battle-screen.is-critical');
      if (!currentScreen) {
        captureScheduled = false;
        return;
      }
      currentScreen.getAnimations({ subtree: true }).forEach((animation) => animation.pause());
      currentScreen.setAttribute('data-critical-captured', 'true');
      const pauseButton = [...currentScreen.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('一時停止'),
      );
      pauseButton?.click();
      observer.disconnect();
    }, pulseDuration * 0.52);
  });
  observer.observe(document.body, { attributes: true, childList: true, subtree: true });
});
const enemyFormationBox = await desktop.locator('.battle-team.is-enemy').boundingBox();
const playerFormationBox = await desktop.locator('.battle-team.is-player').boundingBox();
if (!enemyFormationBox || !playerFormationBox || playerFormationBox.x >= enemyFormationBox.x) {
  throw new Error('Player party is not positioned on the left side of the battle');
}
const playerBattleSprites = await desktop.locator('.battle-team.is-player .battle-sprite').all();
const enemyBattleSprites = await desktop.locator('.battle-team.is-enemy .battle-sprite').all();
const playerSpriteBoxes = await Promise.all(playerBattleSprites.map((sprite) => sprite.boundingBox()));
const enemySpriteBoxes = await Promise.all(enemyBattleSprites.map((sprite) => sprite.boundingBox()));
if (
  !playerSpriteBoxes[0] ||
  !playerSpriteBoxes[2] ||
  Math.abs(playerSpriteBoxes[0].y - playerSpriteBoxes[2].y) < 12 ||
  !enemySpriteBoxes[0] ||
  !enemySpriteBoxes[2] ||
  Math.abs(enemySpriteBoxes[0].y - enemySpriteBoxes[2].y) < 12
) {
  throw new Error('Battle formations do not face each other on opposing diagonals');
}
if ((await desktop.locator('.battle-screen').getAttribute('data-replay-delay-ms')) !== '920') {
  throw new Error('Normal replay speed is not using the readable 920ms step interval');
}
const pendingHpHit = desktop.locator('.battle-sprite.is-hit[data-hp-pending="true"]').first();
await pendingHpHit.waitFor({ timeout: 4000 });
const hpRevealSequence = await pendingHpHit.evaluate((sprite) => {
  const screen = sprite.closest('.battle-screen');
  return {
    fighterId: sprite.getAttribute('data-fighter-id'),
    currentHp: Number(sprite.getAttribute('data-hp-current')),
    displayedHp: Number(sprite.getAttribute('data-hp-displayed')),
    revealDelayMs: Number(sprite.getAttribute('data-hp-reveal-delay-ms')),
    pulseDurationMs: Number.parseFloat(getComputedStyle(screen).getPropertyValue('--battle-pulse-duration')),
  };
});
if (
  !hpRevealSequence.fighterId ||
  hpRevealSequence.displayedHp <= hpRevealSequence.currentHp ||
  hpRevealSequence.revealDelayMs <= hpRevealSequence.pulseDurationMs * 0.5
) {
  throw new Error(`HP bar does not wait until after the hit effect: ${JSON.stringify(hpRevealSequence)}`);
}
await desktop.waitForFunction(
  (fighterId) => {
    const sprite = document.querySelector(`[data-fighter-id="${fighterId}"]`);
    return (
      sprite?.getAttribute('data-hp-pending') === 'false' &&
      sprite.getAttribute('data-hp-displayed') === sprite.getAttribute('data-hp-current')
    );
  },
  hpRevealSequence.fighterId,
  { timeout: 1000 },
);
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
const singleTargetImpact = desktop.locator('.battle-screen.is-impact-single .battlefield');
await singleTargetImpact.waitFor({ timeout: 5000 });
const singleTargetImpactAnimation = await singleTargetImpact.evaluate((field) => getComputedStyle(field).animationName);
if (
  !singleTargetImpactAnimation.includes('arena-shake') &&
  !singleTargetImpactAnimation.includes('critical-arena-kick')
) {
  throw new Error(`Single-target damage does not shake the battlefield: ${singleTargetImpactAnimation}`);
}
const actingSkillCallout = desktop.locator('.battle-sprite.is-acting .skill-callout');
await actingSkillCallout.waitFor();
if (!(await actingSkillCallout.locator('small').textContent())?.trim()) {
  throw new Error('Skill callout does not identify the acting monster');
}
const actingMotion = await actingSkillCallout
  .locator('..')
  .locator('..')
  .evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      side: element.classList.contains('is-player') ? 'player' : 'enemy',
      animationName: style.animationName,
      animationTimingFunction: style.animationTimingFunction,
      actionSlideX: Number.parseFloat(style.getPropertyValue('--action-slide-x')),
    };
  });
if (
  !actingMotion.animationName.includes('sprite-lunge') ||
  !actingMotion.animationTimingFunction.includes('cubic-bezier') ||
  (actingMotion.side === 'player' ? actingMotion.actionSlideX <= 0 : actingMotion.actionSlideX >= 0)
) {
  throw new Error(`Acting monster does not slide toward the enemy: ${JSON.stringify(actingMotion)}`);
}
if ((await desktop.locator('.battle-fx.is-action strong').count()) !== 0) {
  throw new Error('Action name is still shown in the middle of the battlefield');
}
await desktop.locator('.battle-feedback .battle-number, .battle-feedback .status-callout').first().waitFor({
  timeout: 3000,
});
const hitSprite = desktop.locator('.battle-sprite.is-hit').first();
await hitSprite.waitFor({ timeout: 3000 });
const hitMotion = await hitSprite.evaluate((element) => {
  const style = getComputedStyle(element);
  return {
    side: element.classList.contains('is-player') ? 'player' : 'enemy',
    animationName: style.animationName,
    animationTimingFunction: style.animationTimingFunction,
    hitSlideX: Number.parseFloat(style.getPropertyValue('--hit-slide-x')),
  };
});
if (
  !hitMotion.animationName.includes('sprite-hit') ||
  !hitMotion.animationTimingFunction.includes('cubic-bezier') ||
  (hitMotion.side === 'player' ? hitMotion.hitSlideX >= 0 : hitMotion.hitSlideX <= 0)
) {
  throw new Error(`Hit monster does not slide away from the enemy: ${JSON.stringify(hitMotion)}`);
}
const battleTimeline = await desktop.evaluate(() => {
  const keyframes = new Map();
  const collectRules = (rules) => {
    for (const rule of rules) {
      if (rule instanceof CSSKeyframesRule) keyframes.set(rule.name, rule);
      if ('cssRules' in rule) collectRules(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) collectRules(sheet.cssRules);
  const offsetFor = (name, predicate) => {
    const animation = keyframes.get(name);
    if (!animation) return undefined;
    const frame = [...animation.cssRules].find((rule) => predicate(rule.style));
    return frame ? Number.parseFloat(frame.keyText) / 100 : undefined;
  };
  return {
    actionPeak: offsetFor('sprite-lunge', (style) => style.transform.includes('--action-slide-x')),
    effectPeak: offsetFor('battle-target-pulse', (style) => style.opacity === '1'),
    knockbackPeak: offsetFor('sprite-hit', (style) => style.transform.includes('--hit-slide-x')),
  };
});
if (
  battleTimeline.actionPeak === undefined ||
  battleTimeline.effectPeak === undefined ||
  battleTimeline.knockbackPeak === undefined ||
  !(battleTimeline.actionPeak < battleTimeline.effectPeak && battleTimeline.effectPeak < battleTimeline.knockbackPeak)
) {
  throw new Error(`Battle motion is not sequenced action → effect → knockback: ${JSON.stringify(battleTimeline)}`);
}
const criticalImpact = desktop.locator('.battle-screen[data-critical-captured="true"] .critical-impact').first();
await criticalImpact.waitFor({ timeout: 8000 });
const criticalPresentation = await criticalImpact.evaluate((impact) => {
  const labelStyle = getComputedStyle(impact.querySelector('strong'));
  const battlefieldStyle = getComputedStyle(impact.closest('.battlefield'));
  const screenStyle = getComputedStyle(impact.closest('.battle-screen'), '::after');
  return {
    particleCount: impact.querySelectorAll('i').length,
    labelAnimation: labelStyle.animationName,
    battlefieldAnimation: battlefieldStyle.animationName,
    screenAnimation: screenStyle.animationName,
  };
});
if (
  criticalPresentation.particleCount !== 12 ||
  !criticalPresentation.labelAnimation.includes('critical-label') ||
  !criticalPresentation.battlefieldAnimation.includes('critical-arena-kick') ||
  !criticalPresentation.screenAnimation.includes('critical-screen-flash')
) {
  throw new Error(`Critical hit presentation is incomplete: ${JSON.stringify(criticalPresentation)}`);
}
await desktop.screenshot({ path: '/tmp/code-monsters-critical-desktop.png', fullPage: true });
await desktop.screenshot({ path: '/tmp/code-monsters-battle-desktop.png', fullPage: true });
await desktop.getByRole('button', { name: '最後まで送る' }).click();
await desktop.getByRole('button', { name: '結果を見る →' }).click();
await desktop.getByRole('heading', { name: '戦闘報告' }).waitFor();
const revealRewards = desktop.getByRole('button', { name: '報酬をすべて表示' });
if ((await revealRewards.count()) === 1) await revealRewards.click();
await desktop.locator('.result-screen[data-reveal-complete="true"]').waitFor();
if ((await desktop.locator('.battle-report-metric').count()) !== 5) {
  throw new Error('Battle result does not show combat and journey reward metrics');
}
if ((await desktop.locator('.result-monster-card').count()) !== 4) {
  throw new Error('Battle result does not show active and bench XP');
}
if ((await desktop.locator('.result-monster-card [data-xp-gain]').count()) !== 4) {
  throw new Error('Battle result does not expose each monster XP gain');
}
if ((await desktop.locator('.combat-ledger-card').count()) !== 6) {
  throw new Error('Battle result does not show a detailed ledger for all six combatants');
}
if ((await desktop.locator('.combat-ledger-metrics > span').count()) !== 60) {
  throw new Error('Battle result does not expose every per-monster combat metric');
}
if ((await desktop.locator('.combat-ledger-team').count()) !== 2) {
  throw new Error('Battle result does not compare player and rival ledgers');
}
await assertReadableMonsterCards(
  desktop,
  'Desktop battle result',
  '.result-monster-card',
  '.result-monster-identity strong',
);
const desktopResultType = await desktop.evaluate(() => ({
  metricValue: Number.parseFloat(getComputedStyle(document.querySelector('.battle-report-metric b')).fontSize),
  xpGain: Number.parseFloat(getComputedStyle(document.querySelector('.xp-gain')).fontSize),
  levelValue: Number.parseFloat(getComputedStyle(document.querySelector('.result-level-line span')).fontSize),
  growthValue: Number.parseFloat(getComputedStyle(document.querySelector('.result-growth span')).fontSize),
}));
if (
  desktopResultType.metricValue < 28 ||
  desktopResultType.xpGain < 18 ||
  desktopResultType.levelValue < 10 ||
  desktopResultType.growthValue < 9
) {
  throw new Error(`Desktop battle report numbers are too small: ${JSON.stringify(desktopResultType)}`);
}
const clippedDesktopReportValues = await desktop
  .locator('.battle-report-metric b')
  .evaluateAll((values) =>
    values.filter((value) => value.scrollWidth > value.clientWidth + 1).map((value) => value.textContent?.trim()),
  );
if (clippedDesktopReportValues.length > 0) {
  throw new Error(`Desktop battle report values are clipped: ${JSON.stringify(clippedDesktopReportValues)}`);
}
await desktop.waitForTimeout(450);
await desktop.screenshot({ path: '/tmp/code-monsters-result-desktop.png', fullPage: true });

await desktop.getByRole('button', { name: 'NEXT CYCLE 2 旅を続ける' }).click();
for (const cycle of [2, 3]) {
  if (cycle === 3) {
    await desktop.getByRole('heading', { name: '旅路が枝分かれした' }).waitFor();
    if ((await desktop.locator('.event-choice-card').count()) !== 3) {
      throw new Error('Route event does not offer exactly three distinct choices');
    }
    await desktop.screenshot({ path: '/tmp/code-monsters-event-desktop.png', fullPage: true });
    await desktop.locator('.event-commit:not(:disabled)').first().click();
    await desktop.locator('.event-result-stage').waitFor();
    await desktop.screenshot({ path: '/tmp/code-monsters-event-result-desktop.png', fullPage: true });
    await desktop.getByRole('button', { name: '育成と編成へ進む' }).click();
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
await desktop.locator('.breeding-lab-dialog[open]').waitFor();
const desktopBreedingDialogLayout = await desktop.locator('.breeding-lab-dialog').evaluate((dialog) => {
  const box = dialog.getBoundingClientRect();
  return {
    width: box.width,
    height: box.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
});
if (
  desktopBreedingDialogLayout.width < desktopBreedingDialogLayout.viewportWidth * 0.9 ||
  desktopBreedingDialogLayout.height < desktopBreedingDialogLayout.viewportHeight * 0.9
) {
  throw new Error(`Breeding lab is not using the full decision space: ${JSON.stringify(desktopBreedingDialogLayout)}`);
}
const eligibleParents = desktop.locator('.parent-choice:not(:disabled)');
if ((await eligibleParents.count()) < 2) {
  throw new Error('Three battles did not produce two eligible breeding parents');
}
await assertReadableMonsterCards(desktop, 'Desktop breeding parent cards', '.parent-choice:not(:disabled)', 'strong');
await eligibleParents.first().click();
await eligibleParents.nth(1).click();
await desktop.locator('.breeding-outcome').waitFor();
if ((await desktop.locator('.breeding-outcome .breeding-stat-row').count()) !== 7) {
  throw new Error('Selected breeding result does not prominently list all seven stats');
}
if ((await desktop.locator('.breeding-outcome [data-inherited-bonus]').count()) !== 7) {
  throw new Error('Breeding result does not expose the inherited bonus for every stat');
}
if ((await desktop.locator('.breeding-intrinsic-skills .effect-skill-card').count()) !== 2) {
  throw new Error('Breeding result does not prominently show both intrinsic skills');
}
if (
  (await desktop.locator('.breeding-outcome .skill-effect-fact').count()) < 2 ||
  (await desktop.locator('.inheritance-skill-token i').count()) < 2
) {
  throw new Error('Breeding skill cards do not expose concrete effect values');
}
if ((await desktop.locator('.parent-skill-bank').count()) !== 2) {
  throw new Error('Breeding inheritance does not separate the skills held by both parents');
}
if ((await desktop.locator('.inheritance-skill-token:not(:disabled)').count()) < 2) {
  throw new Error('Breeding inheritance does not expose draggable parent skills');
}
if ((await desktop.locator('.inheritance-drop-slot').count()) !== 1) {
  throw new Error('Breeding inheritance does not expose a drop slot');
}
const desktopBreedingType = await desktop.evaluate(() => ({
  total: Number.parseFloat(getComputedStyle(document.querySelector('.breeding-stat-row > strong')).fontSize),
  breakdown: Number.parseFloat(getComputedStyle(document.querySelector('.breeding-stat-row > b')).fontSize),
}));
if (desktopBreedingType.total < 26 || desktopBreedingType.breakdown < 11) {
  throw new Error(`Desktop breeding parameters are too small: ${JSON.stringify(desktopBreedingType)}`);
}
const desktopBreedingStatVisibility = await desktop.locator('.breeding-stat-ledger').evaluate((ledger) => {
  const firstRow = ledger.querySelector('.breeding-stat-row');
  if (!firstRow) return undefined;
  const ledgerBox = ledger.getBoundingClientRect();
  const rowBox = firstRow.getBoundingClientRect();
  return {
    ledgerBottom: ledgerBox.bottom,
    rowTop: rowBox.top,
    rowBottom: rowBox.bottom,
    rowHeight: rowBox.height,
  };
});
if (
  !desktopBreedingStatVisibility ||
  desktopBreedingStatVisibility.rowHeight < 50 ||
  desktopBreedingStatVisibility.rowTop < 0 ||
  desktopBreedingStatVisibility.rowBottom > desktopBreedingStatVisibility.ledgerBottom + 1
) {
  throw new Error(`Desktop breeding parameters are hidden: ${JSON.stringify(desktopBreedingStatVisibility)}`);
}
const selectedInheritanceChoice = desktop.locator('.inheritance-skill-token:not(:disabled)').nth(1);
const selectedInheritanceSkillName = (await selectedInheritanceChoice.locator('strong').textContent())?.trim();
await selectedInheritanceChoice.dragTo(desktop.locator('.inheritance-drop-slot'));
if ((await desktop.locator('.inheritance-drop-slot').getAttribute('data-selected-skill-id')) === '') {
  throw new Error('Dragging a parent skill did not assign the inheritance slot');
}
if ((await desktop.getByRole('button', { name: '配合内容を確認' }).count()) !== 1) {
  throw new Error('Breeding flow does not include a confirmation step');
}
await desktop.screenshot({ path: '/tmp/code-monsters-breeding-desktop.png', fullPage: true });
await desktop.setViewportSize({ width: 390, height: 844 });
const mobileBreedingLayout = await desktop.evaluate(() => {
  const view = document.querySelector('.breeding-view');
  const parentPool = document.querySelector('.parent-pool');
  const candidatePool = document.querySelector('.candidate-pool');
  const preview = document.querySelector('.inheritance-control');
  const outcome = document.querySelector('.breeding-outcome');
  if (!view || !parentPool || !candidatePool || !preview || !outcome) return undefined;
  const viewBox = view.getBoundingClientRect();
  const parentBox = parentPool.getBoundingClientRect();
  const candidateBox = candidatePool.getBoundingClientRect();
  const previewBox = preview.getBoundingClientRect();
  const outcomeBox = outcome.getBoundingClientRect();
  return {
    viewClientWidth: view.clientWidth,
    viewScrollWidth: view.scrollWidth,
    parentBottom: parentBox.bottom,
    candidateTop: candidateBox.top,
    previewLeft: previewBox.left,
    previewRight: previewBox.right,
    outcomeLeft: outcomeBox.left,
    outcomeRight: outcomeBox.right,
    viewLeft: viewBox.left,
    viewRight: viewBox.right,
  };
});
if (
  !mobileBreedingLayout ||
  mobileBreedingLayout.viewScrollWidth > mobileBreedingLayout.viewClientWidth + 1 ||
  mobileBreedingLayout.candidateTop < mobileBreedingLayout.parentBottom - 1 ||
  mobileBreedingLayout.previewLeft < mobileBreedingLayout.viewLeft - 1 ||
  mobileBreedingLayout.previewRight > mobileBreedingLayout.viewRight + 1 ||
  mobileBreedingLayout.outcomeLeft < mobileBreedingLayout.previewLeft - 1 ||
  mobileBreedingLayout.outcomeRight > mobileBreedingLayout.previewRight + 1
) {
  throw new Error(`Mobile breeding controls are clipped or overlapping: ${JSON.stringify(mobileBreedingLayout)}`);
}
const mobileBreedingStatLayout = await desktop
  .locator('.breeding-stat-row')
  .first()
  .evaluate((row) => ({
    clientWidth: row.clientWidth,
    scrollWidth: row.scrollWidth,
    gridTemplateColumns: getComputedStyle(row).gridTemplateColumns,
    rowRight: row.getBoundingClientRect().right,
    ledgerRight: row.closest('.breeding-stat-ledger')?.getBoundingClientRect().right,
    outcomeRight: row.closest('.breeding-outcome')?.getBoundingClientRect().right,
  }));
if (
  mobileBreedingStatLayout.scrollWidth > mobileBreedingStatLayout.clientWidth + 1 ||
  !mobileBreedingStatLayout.ledgerRight ||
  !mobileBreedingStatLayout.outcomeRight ||
  mobileBreedingStatLayout.rowRight > mobileBreedingStatLayout.ledgerRight + 1 ||
  mobileBreedingStatLayout.ledgerRight > mobileBreedingStatLayout.outcomeRight + 1
) {
  throw new Error(`Mobile breeding stat row overflows: ${JSON.stringify(mobileBreedingStatLayout)}`);
}
const clippedMobileBreedingBonuses = await desktop
  .locator('.breeding-stat-row > b')
  .evaluateAll((bonuses) =>
    bonuses.filter((bonus) => bonus.scrollWidth > bonus.clientWidth + 1).map((bonus) => bonus.textContent?.trim()),
  );
if (clippedMobileBreedingBonuses.length > 0) {
  throw new Error(`Mobile breeding bonuses are clipped: ${JSON.stringify(clippedMobileBreedingBonuses)}`);
}
const mobileBreedingType = await desktop.evaluate(() => ({
  total: Number.parseFloat(getComputedStyle(document.querySelector('.breeding-stat-row > strong')).fontSize),
  breakdown: Number.parseFloat(getComputedStyle(document.querySelector('.breeding-stat-row > b')).fontSize),
}));
if (mobileBreedingType.total < 20 || mobileBreedingType.breakdown < 9) {
  throw new Error(`Mobile breeding parameters are too small: ${JSON.stringify(mobileBreedingType)}`);
}
await desktop.locator('.inheritance-control').scrollIntoViewIfNeeded();
await desktop.screenshot({ path: '/tmp/code-monsters-breeding-mobile.png' });
await desktop.locator('.breeding-skill-workbench').scrollIntoViewIfNeeded();
await desktop.screenshot({ path: '/tmp/code-monsters-breeding-skills-mobile.png' });
await desktop.setViewportSize({ width: 1440, height: 1100 });
await desktop.getByRole('button', { name: '配合内容を確認' }).click();
await desktop.locator('.breeding-confirm-dialog[open]').waitFor();
if ((await desktop.locator('.breeding-confirm-dialog li').count()) !== 4) {
  throw new Error('Breeding confirmation does not explain all irreversible effects');
}
await desktop.getByRole('button', { name: 'この内容で配合する' }).click();
await desktop.locator('.breeding-reveal-dialog[open]').waitFor();
await desktop.locator('.breeding-reveal-dialog.reveal-stage-2').waitFor();
if ((await desktop.locator('.breeding-reveal-dialog .breeding-stat-row').count()) !== 7) {
  throw new Error('Breeding reveal does not retain the full inherited-stat ledger');
}
if ((await desktop.locator('.breeding-reveal-dialog .effect-skill-card').count()) !== 3) {
  throw new Error('Breeding reveal does not show the newborn complete skill set');
}
if (
  !selectedInheritanceSkillName ||
  !(await desktop.locator('.breeding-reveal-dialog .effect-skill-card > strong').allTextContents()).includes(
    selectedInheritanceSkillName,
  )
) {
  throw new Error('Breeding reveal does not retain the selected inherited skill');
}
await desktop.screenshot({ path: '/tmp/code-monsters-breeding-reveal-desktop.png', fullPage: true });
await desktop.getByRole('button', { name: 'ホームへ戻る' }).click();
await desktop.locator('.breeding-lab-dialog').waitFor({ state: 'hidden' });
if ((await desktop.locator('.monster-dialog[open]').count()) !== 0) {
  throw new Error('Breeding completion unexpectedly opened the newborn detail dialog');
}
if ((await desktop.getByRole('heading', { name: '旅商人の棚' }).count()) !== 1) {
  throw new Error('Breeding completion did not return directly to the workshop home');
}

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
await assertReadableMonsterCards(mobile, 'Mobile draft', '.draft-grid .definition-card', '.monster-card-copy > strong');
await assertFitsViewport(mobile, 'Mobile draft');
await mobile.screenshot({ path: '/tmp/code-monsters-draft-mobile.png' });

for (let round = 0; round < 3; round += 1) {
  const choices = mobile.locator('.draft-grid .definition-card');
  if ((await choices.count()) !== 3) throw new Error(`Mobile draft round ${round + 1} does not show three choices`);
  await mobile.locator('.draft-choice .monster-card-footer button').first().click();
}

await mobile.getByRole('heading', { name: '旅商人の棚' }).waitFor();
await assertReadableMonsterCards(mobile, 'Mobile active formation', '.team-zone.is-active .roster-card', 'strong');
await assertReadableMonsterCards(
  mobile,
  'Mobile monster shop',
  '.shop-monsters .definition-card',
  '.monster-card-copy > strong',
);
await assertFitsViewport(mobile, 'Mobile workshop');

await mobile.getByRole('button', { name: /図鑑/ }).click();
await mobile.locator('.catalog-dialog[open]').waitFor();
if ((await mobile.locator('.catalog-index .catalog-card').count()) !== 52) {
  throw new Error('Mobile monster catalog does not show all 45 lineage-grid and seven standalone records');
}
await assertReadableMonsterCards(
  mobile,
  'Mobile monster catalog',
  '.catalog-card.is-unlocked',
  '.catalog-card-copy strong',
);
await mobile.locator('.catalog-card[data-catalog-id="light-dragon-2"]').click();
if ((await mobile.locator('.catalog-detail[data-catalog-detail-state="locked"]').count()) !== 1) {
  throw new Error('Mobile undiscovered monster does not remain locked');
}
await mobile.locator('.catalog-detail-tabs').getByRole('button', { name: '特殊配合' }).click();
if ((await mobile.locator('[data-recipe-relation="used-by"] .recipe-card.is-special').count()) !== 3) {
  throw new Error('Mobile catalog does not show the selected monster special breeding descendants');
}
if ((await mobile.locator('.catalog-detail [data-recipe-focus="true"].is-locked').count()) !== 3) {
  throw new Error('Mobile catalog exposes an undiscovered monster in special breeding relations');
}
await mobile.locator('.catalog-card.is-unlocked').first().click();
if ((await mobile.locator('.catalog-detail.is-unlocked .growth-scan-row').count()) !== 2) {
  throw new Error('Mobile catalog does not show both growth scan rows');
}
await mobile.screenshot({ path: '/tmp/code-monsters-catalog-mobile.png' });
await mobile.locator('.catalog-dialog').getByRole('button', { name: '閉じる' }).click();

const mobileActiveCard = mobile.locator('.team-zone.is-active .roster-card').first();
await mobileActiveCard.click();
await mobile.locator('dialog[open]').waitFor();
if ((await mobile.locator('.monster-dialog .stat-grid span').count()) !== 7) {
  throw new Error('Monster detail dialog does not show all seven stats');
}
if ((await mobile.locator('.monster-dialog .farewell-value').count()) !== 1) {
  throw new Error('Mobile monster detail does not show the farewell coin value');
}
await mobile.screenshot({ path: '/tmp/code-monsters-stat-breakdown-mobile.png' });
await mobile.getByRole('button', { name: 'ガンビット' }).click();
if ((await mobile.locator('.monster-dialog .gambit-row').count()) !== 3) {
  throw new Error('Mobile monster dialog does not show all three gambits');
}
if ((await mobile.locator('.monster-dialog .inspector-tabs button').count()) !== 3) {
  throw new Error('Mobile monster dialog does not expose its special breeding tab');
}
await mobile.locator('.monster-dialog .inspector-tabs').getByRole('button', { name: '特殊配合' }).click();
if ((await mobile.locator('.monster-dialog .monster-recipe-relation').count()) !== 2) {
  throw new Error('Mobile monster dialog does not show both special breeding relation directions');
}
await mobile.screenshot({ path: '/tmp/code-monsters-monster-recipes-mobile.png' });
await mobile.getByRole('button', { name: '閉じる', exact: true }).click();
await mobile.getByRole('button', { name: '02 配合' }).click();
await mobile.locator('.breeding-lab-dialog[open]').waitFor();
await mobile.getByRole('button', { name: /特殊配合図鑑/ }).click();
if ((await mobile.locator('.recipe-dialog .recipe-card.is-special').count()) !== 9) {
  throw new Error('Mobile breeding archive does not show all nine special breeding recipes');
}
if ((await mobile.locator('.recipe-dialog [data-recipe-slot="result"].is-locked').count()) !== 9) {
  throw new Error('Undiscovered special breeding results are not silhouetted on mobile');
}
await mobile.screenshot({ path: '/tmp/code-monsters-recipes-mobile.png' });
await mobile.getByRole('button', { name: '閉じる', exact: true }).click();
await mobile.getByRole('button', { name: '配合ラボを閉じる' }).click();
await mobile.locator('.breeding-lab-dialog').waitFor({ state: 'hidden' });

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
await mobile.getByRole('button', { name: '閉じる', exact: true }).click();
await mobile.getByRole('button', { name: 'ATB 3 × 3 戦闘を開始する' }).click();
await mobile.locator('.battle-screen[data-skill-id]').waitFor({ timeout: 4000 });
if ((await mobile.locator('.battle-sprite.is-acting .skill-callout').count()) !== 1) {
  throw new Error('Mobile battle does not show the acting monster beside its skill');
}
await assertReadableMonsterCards(mobile, 'Mobile battle', '.battle-sprite', '.battle-monster-copy > strong');
await mobile.screenshot({ path: '/tmp/code-monsters-battle-mobile.png' });
await mobile.getByRole('button', { name: '最後まで送る' }).click();
await mobile.getByRole('button', { name: '結果を見る →' }).click();
const revealMobileRewards = mobile.getByRole('button', { name: '報酬をすべて表示' });
if ((await revealMobileRewards.count()) === 1) await revealMobileRewards.click();
await mobile.locator('.result-screen[data-reveal-complete="true"]').waitFor();
await mobile.waitForTimeout(450);
await assertReadableMonsterCards(
  mobile,
  'Mobile battle result',
  '.result-monster-card',
  '.result-monster-identity strong',
);
const mobileResultType = await mobile.evaluate(() => ({
  metricValue: Number.parseFloat(getComputedStyle(document.querySelector('.battle-report-metric b')).fontSize),
  xpGain: Number.parseFloat(getComputedStyle(document.querySelector('.xp-gain')).fontSize),
  levelValue: Number.parseFloat(getComputedStyle(document.querySelector('.result-level-line span')).fontSize),
  growthValue: Number.parseFloat(getComputedStyle(document.querySelector('.result-growth span')).fontSize),
}));
if (
  mobileResultType.metricValue < 22 ||
  mobileResultType.xpGain < 16 ||
  mobileResultType.levelValue < 10 ||
  mobileResultType.growthValue < 9
) {
  throw new Error(`Mobile battle report numbers are too small: ${JSON.stringify(mobileResultType)}`);
}
const clippedMobileReportValues = await mobile
  .locator('.battle-report-metric b')
  .evaluateAll((values) =>
    values.filter((value) => value.scrollWidth > value.clientWidth + 1).map((value) => value.textContent?.trim()),
  );
if (clippedMobileReportValues.length > 0) {
  throw new Error(`Mobile battle report values are clipped: ${JSON.stringify(clippedMobileReportValues)}`);
}
if ((await mobile.locator('.combat-ledger-card').count()) !== 6) {
  throw new Error('Mobile battle result does not show all six combatant ledgers');
}
await assertFitsViewport(mobile, 'Mobile result', true);
await mobile.screenshot({ path: '/tmp/code-monsters-result-mobile.png', fullPage: true });

const playtest = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
watchErrors(playtest);
await playtest.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: target.origin });
await playtest.goto(target.toString(), { waitUntil: 'networkidle' });
await playtest.getByRole('heading', { name: '旅のはじまりを選ぶ' }).waitFor();
for (let round = 0; round < 3; round += 1) {
  await playtest.locator('.draft-choice .monster-card-footer button').first().click();
}

for (let battleNumber = 0; battleNumber < 12; battleNumber += 1) {
  await playtest.getByRole('button', { name: 'ATB 3 × 3 戦闘を開始する' }).click();
  await playtest.getByRole('button', { name: '最後まで送る' }).click();
  await playtest.getByRole('button', { name: '結果を見る →' }).click();
  await playtest.getByRole('heading', { name: '戦闘報告' }).waitFor();
  const reveal = playtest.getByRole('button', { name: '報酬をすべて表示' });
  if ((await reveal.count()) === 1) await reveal.click();
  await playtest.locator('.result-screen[data-reveal-complete="true"]').waitFor();
  await playtest.locator('.result-actions .launch-button').click();
  await playtest.waitForFunction(() =>
    Boolean(document.querySelector('.finished-screen, .event-choice-card, .battle-launcher')),
  );

  if ((await playtest.locator('.finished-screen').count()) === 1) break;
  if ((await playtest.locator('.event-choice-card').count()) > 0) {
    await playtest.locator('.event-commit:not(:disabled)').first().click();
    await playtest.locator('.event-result-stage').waitFor();
    await playtest.getByRole('button', { name: '育成と編成へ進む' }).click();
  }
  await playtest.locator('.battle-launcher').waitFor();
}

await playtest.locator('.finished-screen').waitFor();
await playtest.getByRole('heading', { name: /十二の航路を完走|血統の旅はここまで/ }).waitFor();
if ((await playtest.locator('.playtest-ledger-grid > div').count()) !== 6) {
  throw new Error('Finished screen does not show all playtest activity metrics');
}
const commandMetric = Number(
  (await playtest.locator('.playtest-ledger-grid > div').last().locator('b').textContent())?.trim(),
);
if (!Number.isInteger(commandMetric) || commandMetric < 10) {
  throw new Error(`Finished screen does not expose a credible command count: ${commandMetric}`);
}
await playtest.getByRole('button', { name: '航路記録をコピー' }).click();
await playtest.getByText('航路記録をコピーしました').waitFor();
const reportDownload = playtest.waitForEvent('download');
await playtest.getByRole('button', { name: 'JSONを保存' }).click();
const download = await reportDownload;
if (!download.suggestedFilename().startsWith('code-monsters-playtest-')) {
  throw new Error(`Playtest report has an unexpected filename: ${download.suggestedFilename()}`);
}
const reportPath = await download.path();
if (!reportPath) throw new Error('Playtest report download did not produce a local file');
const report = JSON.parse(await readFile(reportPath, 'utf8'));
if (
  report.schemaVersion !== 1 ||
  report.commandLogVersion !== 1 ||
  report.run.commandCount !== report.commandLog.length ||
  report.commandLog.at(-1)?.kind !== 'finish-run'
) {
  throw new Error(`Downloaded playtest report has an invalid contract: ${JSON.stringify(report.run)}`);
}
if (JSON.stringify(report).includes('"frames"')) {
  throw new Error('Downloaded playtest report contains heavyweight replay frames');
}
await assertFitsViewport(playtest, 'Desktop finished screen', true);
await playtest.screenshot({ path: '/tmp/code-monsters-playtest-report-desktop.png', fullPage: true });

await playtest.setViewportSize({ width: 390, height: 844 });
await assertFitsViewport(playtest, 'Mobile finished screen', true);
const mobileLedgerLayout = await playtest.locator('.playtest-ledger').evaluate((ledger) => ({
  viewportWidth: window.innerWidth,
  left: ledger.getBoundingClientRect().left,
  right: ledger.getBoundingClientRect().right,
  scrollWidth: ledger.scrollWidth,
  clientWidth: ledger.clientWidth,
}));
if (
  mobileLedgerLayout.left < -1 ||
  mobileLedgerLayout.right > mobileLedgerLayout.viewportWidth + 1 ||
  mobileLedgerLayout.scrollWidth > mobileLedgerLayout.clientWidth + 1
) {
  throw new Error(`Mobile playtest ledger is clipped: ${JSON.stringify(mobileLedgerLayout)}`);
}
await playtest.locator('.playtest-ledger').scrollIntoViewIfNeeded();
await playtest.screenshot({ path: '/tmp/code-monsters-playtest-report-mobile.png' });

const hatchTarget = new URL(target);
hatchTarget.searchParams.set('seed', '1638');
const hatchPage = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
});
watchErrors(hatchPage);
await hatchPage.goto(hatchTarget.toString(), { waitUntil: 'networkidle' });
for (let round = 0; round < 3; round += 1) {
  await hatchPage.locator('.draft-choice .monster-card-footer button').first().click();
}
await hatchPage.getByRole('heading', { name: '旅商人の棚' }).waitFor();
if ((await hatchPage.locator('.shop-monsters .definition-card').filter({ hasText: 'まだら卵' }).count()) !== 2) {
  throw new Error('Seed 1638 no longer exposes the two-egg hatch smoke fixture');
}
for (let egg = 0; egg < 2; egg += 1) {
  await hatchPage
    .locator('.shop-monsters .definition-card')
    .filter({ hasText: 'まだら卵' })
    .first()
    .locator('.buy-button')
    .click();
}
await hatchPage.locator('.workshop-tabs').getByRole('button', { name: /配合/ }).click();
await hatchPage.locator('.breeding-lab-dialog[open]').waitFor();
const eggParentChoices = hatchPage.locator('.breeding-lab-dialog .parent-choice').filter({ hasText: 'まだら卵' });
if ((await eggParentChoices.count()) !== 2) {
  throw new Error('Level-one eggs are not available as egg-breeding parents');
}
await eggParentChoices.nth(0).click();
await eggParentChoices.nth(1).click();
if ((await hatchPage.locator('.breeding-candidate').filter({ hasText: '星殻の卵' }).count()) !== 1) {
  throw new Error('Two rank-one eggs do not expose the rank-two egg breeding route');
}
await hatchPage.getByRole('button', { name: '配合ラボを閉じる' }).click();
const ownedEgg = hatchPage.locator('.team-zone.is-bench .roster-card').filter({ hasText: 'まだら卵' }).first();
await ownedEgg.click();
if ((await hatchPage.locator('.monster-dialog .inspector-tabs button').count()) !== 3) {
  throw new Error('Owned egg does not retain its special breeding page');
}
await hatchPage.locator('.monster-dialog .inspector-tabs').getByRole('button', { name: '特殊配合' }).click();
if ((await hatchPage.locator('.monster-dialog .monster-recipe-empty').count()) !== 2) {
  throw new Error('Owned egg does not show both unavailable special breeding directions');
}
await hatchPage.getByRole('button', { name: '閉じる', exact: true }).click();
await hatchPage.getByRole('button', { name: 'ATB 3 × 3 戦闘を開始する' }).click();
await hatchPage.getByRole('button', { name: '最後まで送る' }).click();
await hatchPage.getByRole('button', { name: '結果を見る →' }).click();
const hatchRewards = hatchPage.getByRole('button', { name: '報酬をすべて表示' });
if ((await hatchRewards.count()) === 1) await hatchRewards.click();
await hatchPage.locator('.result-screen[data-reveal-complete="true"]').waitFor();
await hatchPage.getByRole('button', { name: 'NEXT CYCLE 2 旅を続ける' }).click();
const hatchDialog = hatchPage.locator('.hatch-reveal-dialog[open]');
await hatchDialog.waitFor();
if (!((await hatchDialog.getAttribute('aria-label')) ?? '').endsWith('1/2')) {
  throw new Error('Multi-egg reveal did not begin with the first hatch');
}
await hatchPage.locator('.hatch-reveal-dialog.hatch-stage-3').waitFor();
await hatchPage.screenshot({ path: '/tmp/code-monsters-hatch-reveal-1-mobile.png' });
await hatchPage.getByRole('button', { name: '次の卵を孵す' }).click();
await hatchPage.waitForFunction(() =>
  document.querySelector('.hatch-reveal-dialog')?.getAttribute('aria-label')?.endsWith('2/2'),
);
await hatchPage.locator('.hatch-reveal-dialog.hatch-stage-3').waitFor();
await hatchPage.screenshot({ path: '/tmp/code-monsters-hatch-reveal-2-mobile.png' });
await hatchPage.getByRole('button', { name: '旅へ戻る' }).click();
await hatchDialog.waitFor({ state: 'hidden' });
await hatchPage.getByRole('heading', { name: '旅商人の棚' }).waitFor();
await assertFitsViewport(hatchPage, 'Mobile workshop after sequential hatches');

await browser.close();
if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);

console.log(
  JSON.stringify({
    target: target.toString(),
    screenshots: [
      '/tmp/code-monsters-casual-desktop.png',
      '/tmp/code-monsters-prospect-desktop.png',
      '/tmp/code-monsters-catalog-desktop.png',
      '/tmp/code-monsters-skill-catalog-desktop.png',
      '/tmp/code-monsters-event-catalog-desktop.png',
      '/tmp/code-monsters-developer-catalog-desktop.png',
      '/tmp/code-monsters-catalog-recipes-desktop.png',
      '/tmp/code-monsters-catalog-standalone-desktop.png',
      '/tmp/code-monsters-stat-breakdown-desktop.png',
      '/tmp/code-monsters-monster-recipes-desktop.png',
      '/tmp/code-monsters-battle-desktop.png',
      '/tmp/code-monsters-critical-desktop.png',
      '/tmp/code-monsters-result-desktop.png',
      '/tmp/code-monsters-event-desktop.png',
      '/tmp/code-monsters-event-result-desktop.png',
      '/tmp/code-monsters-breeding-desktop.png',
      '/tmp/code-monsters-breeding-mobile.png',
      '/tmp/code-monsters-breeding-skills-mobile.png',
      '/tmp/code-monsters-breeding-reveal-desktop.png',
      '/tmp/code-monsters-draft-mobile.png',
      '/tmp/code-monsters-catalog-mobile.png',
      '/tmp/code-monsters-monster-recipes-mobile.png',
      '/tmp/code-monsters-stat-breakdown-mobile.png',
      '/tmp/code-monsters-recipes-mobile.png',
      '/tmp/code-monsters-workshop-mobile.png',
      '/tmp/code-monsters-battle-mobile.png',
      '/tmp/code-monsters-result-mobile.png',
      '/tmp/code-monsters-playtest-report-desktop.png',
      '/tmp/code-monsters-playtest-report-mobile.png',
      '/tmp/code-monsters-hatch-reveal-1-mobile.png',
      '/tmp/code-monsters-hatch-reveal-2-mobile.png',
    ],
  }),
);
