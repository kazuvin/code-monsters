import { chromium } from 'playwright-core';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=swiftshader'],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(targetUrl, { waitUntil: 'networkidle' });

const reactionSnapshot = async () => {
  const editor = page.locator('.reaction-loop');
  const block = editor.locator('.reaction-code-block');
  if (await block.count() === 0) return { exists: false, text: (await editor.innerText()).replace(/\s+/g, ' ').trim() };
  return {
    exists: true,
    text: (await block.innerText()).replace(/\s+/g, ' ').trim(),
    triggerDisabled: await block.locator('.word-slot').first().isDisabled(),
    actionDisabled: await block.locator('.word-slot').last().isDisabled(),
    deleteDisabled: await block.getByRole('button', { name: 'リアクションを削除' }).isDisabled(),
  };
};

const fixedNormalInstruction = async () => {
  const block = page.locator('.program-list .fixed-action').first();
  return {
    text: (await block.innerText()).replace(/\s+/g, ' ').trim(),
    conditionDisabled: await block.locator('.word-slot').first().isDisabled(),
    actionDisabled: await block.locator('.word-slot').last().isDisabled(),
    deleteDisabled: await block.getByRole('button', { name: '削除' }).isDisabled(),
  };
};

const volt = await reactionSnapshot();
const voltNormal = (await page.locator('.program-list').first().innerText()).replace(/\s+/g, ' ').trim();
await page.locator('.unit-tabs button').filter({ hasText: 'バスティオン' }).click();
const bastion = await reactionSnapshot();

const relayCard = page.locator('.shop-item').filter({ hasText: 'リレイ' }).first();
await relayCard.getByRole('button', { name: /購入/ }).click();
await page.locator('.inventory button').filter({ hasText: 'リレイ' }).click();
await page.locator('.unit-tabs button').filter({ hasText: 'リレイ' }).click();
const relayEmpty = await reactionSnapshot();
const relayNormal = await fixedNormalInstruction();
await page.getByRole('button', { name: /リアクションを追加/ }).click();
await page.locator('.reaction-code-block .word-slot').first().click();
const reactionChoices = (await page.locator('.choice-list button').allTextContents()).map(text => text.trim());
await page.locator('.choice-list button').filter({ hasText: '味方ヒット時' }).click();
const relayConfigured = await reactionSnapshot();

await page.reload({ waitUntil: 'networkidle' });

const actions = new Set();
const animationClasses = new Set();
const followDistances = [];
let relayHoldSeen = false;
const observeBattle = async (required, maxTicks = 400, extraCheck = () => true) => {
  for (let i = 0; i < maxTicks; i += 1) {
    for (const label of await page.locator('.card-action-bubble').allTextContents()) actions.add(label.trim());
    for (const className of await page.locator('.sprite').evaluateAll(elements => elements.map(element => element.className))) {
      for (const token of className.split(/\s+/).filter(token => token.startsWith('is-'))) animationClasses.add(token);
    }
    const followState = await page.locator('.sprite.is-follow').evaluateAll(elements => elements.map(element => {
      const target = document.querySelector('.hit-spark')?.closest('.sprite');
      return {
        actor: element.textContent ?? '',
        distance: target ? Math.abs(Number.parseFloat(element.style.left) - Number.parseFloat(target.style.left)) : 0,
      };
    }));
    for (const state of followState) if (state.actor.includes('ヴォルト')) followDistances.push(state.distance);
    const relayStatuses = await page.locator('.sprite').filter({ hasText: 'リレイ' }).locator('.status-chip').allTextContents();
    if (relayStatuses.some(label => label.trim() === 'HOLD')) relayHoldSeen = true;
    if (required.every(label => actions.has(label)) && extraCheck()) return;
    await page.waitForTimeout(50);
  }
};

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();
await observeBattle(['⚡ 追撃', '⚡ 防御', '高速接近'], 500, () => followDistances.some(distance => distance > 10));
const depthLayers = await page.locator('.sprite').evaluateAll(elements => elements.map(element => ({
  laneOffset: Number.parseFloat(getComputedStyle(element).getPropertyValue('--lane-offset')),
  zIndex: Number.parseInt(getComputedStyle(element).zIndex, 10),
})));
await page.locator('.battle-controls button').last().click({ force: true });

await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: /更新/ }).click();
await page.waitForTimeout(80);
await page.getByRole('button', { name: /更新/ }).click();
await page.waitForTimeout(80);
const arrowCard = page.locator('.shop-item').filter({ hasText: 'アロー' }).first();
await arrowCard.getByRole('button', { name: /購入/ }).click();
await page.locator('.inventory button').filter({ hasText: 'アロー' }).click();
await page.locator('.unit-tabs button').filter({ hasText: 'アロー' }).click();
const arrow = await reactionSnapshot();
const arrowNormal = (await page.locator('.program-list').first().innerText()).replace(/\s+/g, ' ').trim();
for (const unitName of ['ヴォルト', 'バスティオン']) {
  await page.locator('.unit-tabs button').filter({ hasText: unitName }).click();
  await page.getByRole('button', { name: '外す' }).click();
}

await page.getByRole('button', { name: /戦闘開始/ }).click();
await page.getByRole('button', { name: 'x2' }).click();
await observeBattle(['⚡ 緊急離脱'], 500);
await page.getByRole('button', { name: /ログ/ }).click();
const stacking = await page.evaluate(() => ({
  log: Number.parseInt(getComputedStyle(document.querySelector('.log-dialog-overlay')).zIndex, 10),
  sprites: [...document.querySelectorAll('.sprite')].map(element => Number.parseInt(getComputedStyle(element).zIndex, 10)),
}));
const reactionLogCount = await page.locator('.log-dialog .log.reaction').count();
await page.waitForSelector('.result-dialog', { timeout: 45_000 });
const logClosedAtResult = await page.locator('.log-dialog').count() === 0;

await browser.close();

const result = {
  fixedReactions: { volt, bastion, arrow },
  voltNormal,
  arrowNormal,
  relay: { empty: relayEmpty, normal: relayNormal, configured: relayConfigured },
  reactionChoices,
  actions: [...actions],
  animationClasses: [...animationClasses],
  followDistances,
  relayHoldSeen,
  reactionLogCount,
  depthLayers,
  stacking,
  logClosedAtResult,
  errors,
};
console.log(JSON.stringify(result, null, 2));

const fixedChecks = [
  [volt, '自分の攻撃がヒットしたら', '追撃'],
  [bastion, '自分が攻撃を受けたら', 'ガード'],
  [arrow, '自分が攻撃を受けたら', '緊急離脱'],
];
for (const [reaction, trigger, action] of fixedChecks) {
  if (!reaction.exists || !reaction.text.includes(trigger) || !reaction.text.includes(action) || !reaction.triggerDisabled || !reaction.actionDisabled || !reaction.deleteDisabled) {
    throw new Error(`${action}の固定リアクションUIが不正です`);
  }
}
if (voltNormal.includes('追撃') || arrowNormal.includes('緊急離脱')) throw new Error('リアクションが通常作戦にも残っています');
if (relayEmpty.exists || !relayEmpty.text.includes('0 / 1')) throw new Error('リレイのリアクション初期状態が不正です');
if (!relayNormal.text.includes('高速接近') || relayNormal.conditionDisabled || !relayNormal.actionDisabled || !relayNormal.deleteDisabled) throw new Error('高速接近の通常作戦UIが不正です');
if (!relayConfigured.exists || relayConfigured.triggerDisabled || relayConfigured.actionDisabled || relayConfigured.deleteDisabled || !relayConfigured.text.includes('味方の攻撃がヒットしたら')) throw new Error('編集可能なリアクションUIが不正です');
const expectedTriggers = ['攻撃ヒット時', '被弾時', '味方ヒット時', 'HP 30%以下'];
if (reactionChoices.length !== expectedTriggers.length || !expectedTriggers.every(trigger => reactionChoices.some(choice => choice.includes(trigger)))) throw new Error('リアクション条件が4種に分離されていません');
for (const label of ['⚡ 追撃', '⚡ 防御', '高速接近', '⚡ 緊急離脱']) {
  if (!actions.has(label)) throw new Error(`${label}が戦闘中に再生されませんでした`);
}
for (const className of ['is-follow', 'is-guard', 'is-dash', 'is-retreat']) {
  if (!animationClasses.has(className)) throw new Error(`${className}のアニメーションが確認できませんでした`);
}
if (!followDistances.some(distance => distance > 10)) throw new Error('射程外のリアクション追撃を確認できませんでした');
if (relayHoldSeen) throw new Error('リレイにHOLD表示が出ています');
if (reactionLogCount === 0) throw new Error('リアクションが戦闘ログに記録されていません');
const frontLayer = depthLayers.find(layer => layer.laneOffset === Math.min(...depthLayers.map(item => item.laneOffset)));
const rearLayer = depthLayers.find(layer => layer.laneOffset === Math.max(...depthLayers.map(item => item.laneOffset)));
if (!frontLayer || !rearLayer || frontLayer.zIndex <= rearLayer.zIndex) throw new Error('手前のユニットが上に描画されていません');
if (stacking.log <= Math.max(...stacking.sprites)) throw new Error('ログダイアログがユニットより手前に表示されていません');
if (!logClosedAtResult) throw new Error('対戦完了時にログダイアログが閉じていません');
if (errors.length > 0) throw new Error(`ブラウザエラー: ${errors.join(', ')}`);
