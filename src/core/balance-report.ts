import type { BalanceComparison, BalanceSimulationResult } from './balance-simulation';

const percent = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`);
const decimal = (value: number | null, digits = 1) => (value === null ? '—' : value.toFixed(digits));
const markdownCell = (value: string) => value.replaceAll('|', '\\|');

export function renderBalanceMarkdown(result: BalanceSimulationResult, comparison?: BalanceComparison): string {
  const outliers = result.skills.filter((skill) => skill.suspectedOutlier);
  const singleSignals = result.skills.filter((skill) => !skill.suspectedOutlier && skill.signals.length > 0);
  const traitWarnings = result.traitMatchups.filter(
    (matchup) =>
      matchup.playerTrait !== matchup.enemyTrait &&
      Math.abs(matchup.playerScoreRate - 0.5) >= result.config.winRateLiftThreshold,
  );
  const lines = [
    '# Code Monsters バランスシミュレーション',
    '',
    `- ゲームデータ: schema ${result.gameSchemaVersion}`,
    `- 固定シード: ${result.config.seed}`,
    `- 対象ラン: ${result.config.runs.join(', ')}`,
    `- 通常戦闘: ${result.summary.tournamentBattles}戦（陣営入替 ${result.summary.sideSwappedPairs}組）`,
    `- 反実仮想ベンチマーク: ${result.summary.benchmarkBattles}戦`,
    '',
    '## 全体集計',
    '',
    '| プレイヤー勝率 | 敵勝率 | 引分率 | 陣営差 | 平均決着tick |',
    '| ---: | ---: | ---: | ---: | ---: |',
    `| ${percent(result.summary.playerWinRate)} | ${percent(result.summary.enemyWinRate)} | ${percent(result.summary.drawRate)} | ${percent(result.summary.sideBias)} | ${decimal(result.summary.averageTicks)} |`,
    '',
    '## 要確認スキル',
    '',
  ];
  if (outliers.length === 0) {
    lines.push('現在の閾値で、複数指標または信頼区間を満たす外れ値はありません。', '');
  } else {
    lines.push('| スキル | レア | 登場 | 補正勝率差 | 差替勝率差 | 無効化差 | 出力Z | 無効化Z | シグナル |');
    lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
    outliers.forEach((skill) => {
      lines.push(
        `| ${markdownCell(skill.title)} | ${skill.rarity} | ${skill.appearances} | ${percent(skill.matchedScoreLift)} | ${percent(skill.counterfactual.scoreLift)} | ${percent(skill.ablation.scoreLift)} | ${decimal(skill.efficiencyZScore, 2)} | ${decimal(skill.ablationImpactZScore, 2)} | ${skill.signals.join(', ')} |`,
      );
    });
    lines.push('');
  }
  lines.push('## 単独シグナル', '');
  if (singleSignals.length === 0) {
    lines.push('外れ値条件の一部だけを満たすスキルはありません。', '');
  } else {
    lines.push('| スキル | 補正勝率差 | 差替勝率差 | 無効化差 | 出力Z | 無効化Z | シグナル |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
    singleSignals.forEach((skill) => {
      lines.push(
        `| ${markdownCell(skill.title)} | ${percent(skill.matchedScoreLift)} | ${percent(skill.counterfactual.scoreLift)} | ${percent(skill.ablation.scoreLift)} | ${decimal(skill.efficiencyZScore, 2)} | ${decimal(skill.ablationImpactZScore, 2)} | ${skill.signals.join(', ')} |`,
      );
    });
    lines.push('');
  }
  lines.push('## 特性間警告', '');
  if (traitWarnings.length === 0) {
    lines.push('特性間スコア率は現在の閾値内です。', '');
  } else {
    lines.push('| P特性 | E特性 | 戦闘 | Pスコア率 | 50%との差 |');
    lines.push('| --- | --- | ---: | ---: | ---: |');
    traitWarnings.forEach((matchup) => {
      lines.push(
        `| ${matchup.playerTrait} | ${matchup.enemyTrait} | ${matchup.battles} | ${percent(matchup.playerScoreRate)} | ${percent(matchup.playerScoreRate - 0.5)} |`,
      );
    });
    lines.push('');
  }
  lines.push(
    '## スキル別集計',
    '',
    '| ID | スキル | レア | 登場 | 勝率 | 補正勝率差 | 発動/戦 | 報告ダメ/戦 | 毒付与/戦 | 防壁/戦 | 実回復/戦 | 差替N | 差替勝率差 | 無効化N | 無効化差 |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  result.skills.forEach((skill) => {
    lines.push(
      `| ${skill.blockId} | ${markdownCell(skill.title)} | ${skill.rarity} | ${skill.appearances} | ${percent(skill.winRate)} | ${percent(skill.matchedScoreLift)} | ${decimal(skill.activationsPerBattle, 2)} | ${decimal(skill.reportedDamagePerBattle)} | ${decimal(skill.poisonAppliedPerBattle)} | ${decimal(skill.reportedShieldPerBattle)} | ${decimal(skill.effectiveRepairPerBattle)} | ${skill.counterfactual.samples} | ${percent(skill.counterfactual.scoreLift)} | ${skill.ablation.samples} | ${percent(skill.ablation.scoreLift)} |`,
    );
  });
  lines.push(
    '',
    '## ラン別集計',
    '',
    '| Run | Lv | 予算 | 平均使用額 | 平均ノード | 戦闘 | P勝 | E勝 | 引分 | 平均tick |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  result.byRun.forEach((run) => {
    lines.push(
      `| ${run.run} | ${run.level} | ${run.budget} | ${decimal(run.averageBuildCost)} | ${decimal(run.averageNodes, 2)} | ${run.battles} | ${run.playerWins} | ${run.enemyWins} | ${run.draws} | ${decimal(run.averageTicks)} |`,
    );
  });
  lines.push(
    '',
    '## 特性マッチアップ',
    '',
    '| P特性 | E特性 | 戦闘 | Pスコア率 | 平均tick |',
    '| --- | --- | ---: | ---: | ---: |',
  );
  result.traitMatchups.forEach((matchup) => {
    lines.push(
      `| ${matchup.playerTrait} | ${matchup.enemyTrait} | ${matchup.battles} | ${percent(matchup.playerScoreRate)} | ${decimal(matchup.averageTicks)} |`,
    );
  });
  if (comparison) {
    lines.push(
      '',
      '## ベースライン比較',
      '',
      `- 比較条件: ${comparison.compatible ? '一致' : '不一致'}`,
      `- 新規外れ値: ${comparison.newSuspectedOutliers.join(', ') || 'なし'}`,
      `- 解消した外れ値: ${comparison.resolvedSuspectedOutliers.join(', ') || 'なし'}`,
      `- 平均決着tick差: ${comparison.summary.averageTicksDelta >= 0 ? '+' : ''}${comparison.summary.averageTicksDelta}`,
      `- 陣営差の変化: ${percent(comparison.summary.sideBiasDelta)}`,
    );
  }
  lines.push('', '## 読み方と制約', '');
  result.methodology.limitations.forEach((limitation) => lines.push(`- ${limitation}`));
  lines.push(
    '',
    '補正勝率差は同じ run・特性の不採用盤面との差です。差替勝率差は同一接続形状・同レア・役割重複のノードを置換した差、無効化差は接続を維持したまま対象効果だけを止めた差です。どちらも同じ相手へ両陣営から戦わせています。',
    '',
  );
  return lines.join('\n');
}

const csvCell = (value: string | number | boolean | null) => {
  if (value === null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function renderBalanceCsv(result: BalanceSimulationResult): string {
  const headers = [
    'blockId',
    'title',
    'rarity',
    'appearances',
    'wins',
    'losses',
    'draws',
    'winRate',
    'scoreRate',
    'matchedSamples',
    'matchedScoreLift',
    'activationsPerBattle',
    'reportedDamagePerBattle',
    'poisonAppliedPerBattle',
    'reportedShieldPerBattle',
    'effectiveRepairPerBattle',
    'reportedOutputPerActivation',
    'efficiencyZScore',
    'counterfactualSamples',
    'counterfactualScoreLift',
    'counterfactualDamageDelta',
    'counterfactualDefenseDelta',
    'ablationSamples',
    'ablationScoreLift',
    'ablationDamageDelta',
    'ablationDefenseDelta',
    'ablationImpactZScore',
    'suspectedOutlier',
    'signals',
  ];
  const rows = result.skills.map((skill) => [
    skill.blockId,
    skill.title,
    skill.rarity,
    skill.appearances,
    skill.wins,
    skill.losses,
    skill.draws,
    skill.winRate,
    skill.scoreRate,
    skill.matchedSamples,
    skill.matchedScoreLift,
    skill.activationsPerBattle,
    skill.reportedDamagePerBattle,
    skill.poisonAppliedPerBattle,
    skill.reportedShieldPerBattle,
    skill.effectiveRepairPerBattle,
    skill.reportedOutputPerActivation,
    skill.efficiencyZScore,
    skill.counterfactual.samples,
    skill.counterfactual.scoreLift,
    skill.counterfactual.reportedDamageDelta,
    skill.counterfactual.reportedDefenseDelta,
    skill.ablation.samples,
    skill.ablation.scoreLift,
    skill.ablation.reportedDamageDelta,
    skill.ablation.reportedDefenseDelta,
    skill.ablationImpactZScore,
    skill.suspectedOutlier,
    skill.signals.join('|'),
  ]);
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}
