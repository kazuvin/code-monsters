import { conditionAvailability, type PowerFormulaReport } from './power-formula';
import type { EffectTrigger, Rarity } from './types';

const number = (value: number, digits = 1) =>
  value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const ratio = (value: number) => `${number(value, 2)}x`;
const percent = (value: number) => `${number(value * 100, 0)}%`;
const markdownCell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ');
const csvCell = (value: string | number | null) => {
  const text = value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const STATUS_LABEL = {
  low: 'LOW',
  'in-range': 'OK',
  high: 'HIGH',
} as const;

export function renderPowerFormulaMarkdown(report: PowerFormulaReport): string {
  const rules = report.formula;
  const conditionRows: Array<{ label: string; trigger: EffectTrigger; ports: number }> = [
    { label: '相手が毒', trigger: { kind: 'enemy-poisoned' }, ports: 2 },
    { label: '循環', trigger: { kind: 'in-cycle' }, ports: 2 },
    { label: '経路3以上', trigger: { kind: 'path-length-at-least', amount: 3 }, ports: 2 },
    { label: '経路5以上', trigger: { kind: 'path-length-at-least', amount: 5 }, ports: 2 },
    { label: '直線3以上', trigger: { kind: 'straight-line-at-least', amount: 3 }, ports: 2 },
    { label: '直線4以上', trigger: { kind: 'straight-line-at-least', amount: 4 }, ports: 2 },
    { label: '直線5以上', trigger: { kind: 'straight-line-at-least', amount: 5 }, ports: 2 },
    { label: '2ポート全接続', trigger: { kind: 'all-ports-connected' }, ports: 2 },
    { label: '3ポート全接続', trigger: { kind: 'all-ports-connected' }, ports: 3 },
    { label: '4ポート全接続', trigger: { kind: 'all-ports-connected' }, ports: 4 },
  ];
  const rarityOrder: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

  const lines = [
    '# スキルパワー計算レポート',
    '',
    `Game schema: ${report.gameSchemaVersion}`,
    `Formula version: ${report.formulaVersion}`,
    '',
    'このレポートは戦闘シミュレーションではない。`game.json` の宣言値だけを使い、同じ入力から必ず同じ結果を返す静的なパワー予算表である。勝率や実盤面での成立率は測定しない。',
    '',
    '## 基本式',
    '',
    '```text',
    `secondsPerBeat = battleStepMs / 1000 = ${report.battleStepSeconds}`,
    'cooldownSeconds = cooldownBeats × secondsPerBeat',
    'rawCVPS = referenceEffectValue / cooldownSeconds',
    'weightedEffectCVPS = rawCVPS × conditionAvailability × resourceAvailability × attributionShare',
    'conditionRewardMultiplier = 1 / conditionAvailability',
    'targetCVPS = rarityTargetCVPS × price / rarityReferencePrice',
    'budgetRatio = weightedCombatValuePerSecond / targetCVPS',
    '```',
    '',
    '条件付き効果のパラメーターを逆算するときは、残り予算を `conditionAvailability` で割る。例えば成立率50%相当の条件なら、無条件効果の2倍までを同じ期待予算として割り当てられる。',
    '',
    '## 基準状態と換算',
    '',
    `- 基準時間: ${rules.reference.windowSeconds}秒`,
    `- 基準チャージ: ${rules.reference.charge}`,
    `- 基準敵毒: ${rules.reference.enemyPoison}`,
    `- 基準経路長／直線長: ${rules.reference.pathLength}／${rules.reference.straightLineLength}`,
    `- 基準通電軸値数: ${rules.reference.poweredAxisCount}`,
    `- 基準支援先: ${rules.reference.targetEffectAmount}効果、${rules.reference.targetCooldownBeats}拍`,
    `- ダメージ価値: 1.0、シールド: ${rules.effectValue.shield}、回復: ${rules.effectValue.repair}`,
    `- 毒1の価値: ${rules.effectValue.poisonTicks}tick分のダメージ相当`,
    `- 戦闘中コイン1枚の進行価値: ${rules.effectValue.coin} CVPS相当`,
    `- チャージ1の限界価値: 全解放スキルの「perCharge ÷ cooldownSeconds」の中央値 ${number(report.chargeMarginalCvps)} CVPS`,
    `- チャージ変動分の帰属: 生成側 ${percent(rules.chargeAttribution.producer)}、解放側 ${percent(rules.chargeAttribution.consumer)}`,
    `- チャージ準備率: ${percent(rules.resourceAvailability.charge)}、破裂用毒の準備率: ${percent(rules.resourceAvailability.rupturePoison)}`,
    `- 通電軸値の成立係数: ${percent(rules.resourceAvailability.poweredAxis)}`,
    `- 接続価値: 追加ポート1本につき ${rules.topologyUtility.perAdditionalPort} CVPS、回転可能なら ${rules.topologyUtility.rotatable} CVPS`,
    '',
    '毒・チャージ・増幅・戦闘中コインは単独では通常DPSと同じ単位にならないため、上記の固定基準で戦闘価値または進行価値へ換算する。基準値を変更するときは個別スキルではなく `rules.balanceFormula` を更新し、全スキルを再計算する。',
    '',
    '## 条件難度',
    '',
    '| 条件 | availability | 許容倍率 |',
    '|---|---:|---:|',
    ...conditionRows.map(({ label, trigger, ports }) => {
      const availability = conditionAvailability(trigger, ports, rules);
      return `| ${label} | ${number(availability, 2)} | ${ratio(1 / availability)} |`;
    }),
    '',
    `availabilityは最低 ${number(rules.conditionAvailability.minimum, 2)} で打ち止める。これは難条件だけで無制限に基礎値を膨らませないための上限で、許容倍率は最大 ${ratio(1 / rules.conditionAvailability.minimum)} となる。`,
    '',
    '## レア度別目標予算',
    '',
    '| レア度 | 基準CVPS | 基準価格 | 1コイン当たり |',
    '|---|---:|---:|---:|',
    ...rarityOrder.map(
      (rarity) =>
        `| ${rarity} | ${number(rules.targetCvpsByRarity[rarity])} | ${number(rules.referencePriceByRarity[rarity])} | ${number(rules.targetCvpsByRarity[rarity] / rules.referencePriceByRarity[rarity], 2)} |`,
    ),
    '',
    `予算比 ${ratio(rules.acceptableBudgetRatio.minimum)}〜${ratio(rules.acceptableBudgetRatio.maximum)} を暫定許容域とする。範囲外は自動修正せず、パラメーター見直し候補として扱う。`,
    '',
    '## 全スキル比較',
    '',
    `対象 ${report.summary.skillCount}件: LOW ${report.summary.low} / OK ${report.summary['in-range']} / HIGH ${report.summary.high}`,
    '',
    '| スキル | レア度 | 価格 | 拍 | 条件 | 基準攻撃PS | 基準防御PS | 重み付きCVPS | 目標CVPS | 予算比 | 判定 | 融合倍率 |',
    '|---|---|---:|---:|---|---:|---:|---:|---:|---:|---|---:|',
    ...report.skills.map(
      (skill) =>
        `| ${markdownCell(skill.title)} | ${skill.rarity} | ${skill.price} | ${skill.cooldownBeats ?? '-'} | ${markdownCell(skill.conditions.join(', ') || 'なし')} | ${number(skill.referenceOffensePerSecond)} | ${number(skill.referenceDefensePerSecond)} | ${number(skill.weightedCombatValuePerSecond)} | ${number(skill.targetCombatValuePerSecond)} | ${ratio(skill.budgetRatio)} | ${STATUS_LABEL[skill.budgetStatus]} | ${ratio(skill.fused.gainOverNormal)} |`,
    ),
    '',
    '基準攻撃PSは、条件を満たした状態の直接ダメージ・毒の基準tick換算・破裂・チャージ解放を含む。重み付きCVPSは条件成立率、資源準備率、チャージ帰属、支援、接続価値を含むため、基準攻撃PSより小さいとは限らない。',
    '',
    '## 効果別内訳',
    '',
    '| スキル | 効果 | 条件 | availability | 許容倍率 | raw CVPS | weighted CVPS | 式 |',
    '|---|---|---|---:|---:|---:|---:|---|',
    ...report.skills.flatMap((skill) =>
      skill.effects.map(
        (effect) =>
          `| ${markdownCell(skill.title)} | ${effect.kind} | ${effect.condition} | ${number(effect.conditionAvailability, 2)} | ${ratio(effect.rewardMultiplier)} | ${number(effect.rawCvps)} | ${number(effect.weightedCvps)} | ${markdownCell(effect.formula)} |`,
      ),
    ),
    '',
    '## 読み方と限界',
    '',
    '- `HIGH` は即ナーフ、`LOW` は即バフという意味ではない。まず効果内訳と、意図した役割・コンボ上限を確認する。',
    '- 条件availabilityは実測確率ではなく、パラメーター設計用の固定難度係数である。実際の成立率を変更理由に使う場合だけシミュレーション結果を併読する。',
    '- 成長は基準時間内の平均蓄積段数、加速と増幅は基準支援先、破裂は基準敵毒、解放は基準チャージで比較する。',
    '- コイン効果は将来ランの購買力を固定係数で近似する。単戦闘シミュレーションでは将来ランへの複利効果を再現しない。',
    '- 合流倍率は全スキル共通の盤面上限なので基礎予算へ入れない。融合は通常値とは別に倍率だけを表示する。',
    '- 新しいplayableスキルは自動で追加され、未知の効果kindは計算を失敗させる。係数や式を定義せずに比較対象から漏らさない。',
  ];
  return `${lines.join('\n')}\n`;
}

export function renderPowerFormulaCsv(report: PowerFormulaReport): string {
  const headers = [
    'blockId',
    'title',
    'rarity',
    'price',
    'placementPatternId',
    'cooldownBeats',
    'cooldownSeconds',
    'conditions',
    'referenceOffensePerSecond',
    'referenceDefensePerSecond',
    'rawCombatValuePerSecond',
    'weightedCombatValuePerSecond',
    'topologyUtilityCvps',
    'targetCombatValuePerSecond',
    'budgetRatio',
    'budgetStatus',
    'fusedWeightedCombatValuePerSecond',
    'fusedGainOverNormal',
  ];
  const rows = report.skills.map((skill) => [
    skill.blockId,
    skill.title,
    skill.rarity,
    skill.price,
    skill.placementPatternId,
    skill.cooldownBeats,
    skill.cooldownSeconds,
    skill.conditions.join('|'),
    skill.referenceOffensePerSecond,
    skill.referenceDefensePerSecond,
    skill.rawCombatValuePerSecond,
    skill.weightedCombatValuePerSecond,
    skill.topologyUtilityCvps,
    skill.targetCombatValuePerSecond,
    skill.budgetRatio,
    skill.budgetStatus,
    skill.fused.weightedCombatValuePerSecond,
    skill.fused.gainOverNormal,
  ]);
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}
