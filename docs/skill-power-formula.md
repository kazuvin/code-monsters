# スキルパワー設計式

## 目的

スキルの数値を感覚だけで決めず、発動間隔、効果種別、条件難度、資源依存、接続形状、価格、レア度を同じ手順でパワー予算へ変換する。

この式は戦闘シミュレーションではない。ゲームデータだけから決定論的に計算し、勝率や実際の条件成立率は使用しない。現在の全スキルの結果は [`reports/balance/formula.md`](../reports/balance/formula.md) に生成する。

## コマンド

```bash
pnpm balance:formula
pnpm balance:formula:check
```

- `balance:formula` は全playableスキルを再取得して `formula.json`、`formula.csv`、`formula.md` を更新する。
- `balance:formula:check` は再計算結果とコミット済みレポートを比較し、スキル、式、係数、ゲームテンポの変更でレポートが古くなっていれば失敗する。
- どちらも戦闘を1回も実行しない。
- 通常の `pnpm verify` とCIには含めない。パワーバランス調整を依頼されたときだけ手動で実行する。

## 数値を決める順序

### 1. 目標予算を決める

```text
targetCVPS = rarityTargetCVPS × price / rarityReferencePrice
```

`rarityTargetCVPS` と `rarityReferencePrice` は `src/game/game.json` の `rules.balanceFormula` が正本となる。レア度の基準CVPSは必ず上位ほど大きくする。

### 2. 接続形状の価値を差し引く

```text
topologyUtility = max(0, portCount - 1) × perAdditionalPort
                + (rotatable ? rotatableUtility : 0)
effectBudget = targetCVPS - topologyUtility
```

分岐や回転可能性も盤面上の強さなので、同じ価格の終端スキルより直接出力を低くできる。

### 3. 拍を秒へ変換する

```text
secondsPerBeat = battleStepMs / 1000
cooldownSeconds = cooldownBeats × secondsPerBeat
rawCVPS = effectValuePerActivation / cooldownSeconds
```

現在は1拍0.5秒である。`3拍ごとに300ダメージ` は `300 / 1.5 = 200 DPS` となる。拍数だけを比較してはいけない。

### 4. 効果種別を戦闘価値へ換算する

```text
damageCV = amount
shieldCV = amount × shieldValue
repairCV = amount × repairValue
poisonCV = amount × poisonTicks
```

毒は固定した基準tick数、防御は固定した価値係数で換算する。現在の毒5tickは、10秒の基準窓へ継続的に付与した毒が平均で残る時間（`10秒 ÷ 1秒tick ÷ 2`）から決めている。チャージ、破裂、成長、増幅、加速は基準チャージ、基準敵毒、基準時間、基準支援先を使う。係数を個別スキルへ埋め込まず、`rules.balanceFormula` だけで管理する。

### 5. 条件難度で割り引く

```text
weightedEffectCVPS = rawCVPS × conditionAvailability
conditionRewardMultiplier = 1 / conditionAvailability
```

条件が難しいほどavailabilityを小さくする。同じ期待予算へ合わせる場合、条件付き部分の許容値を逆数倍できる。

```text
conditionalRawBudget = remainingWeightedBudget / conditionAvailability
conditionalAmount = conditionalRawBudget × cooldownSeconds / effectUnitValue
```

最低availabilityを設け、難条件を理由に無制限な倍率を与えない。条件の実測成立率ではなく、設計上の固定難度である。

### 6. 資源の二重計上を防ぐ

チャージ1の価値は、全解放スキルの `perCharge × effectUnitValue / cooldownSeconds` の中央値から自動算出する。変動分は生成側と解放側へ分割する。

```text
chargeProducerCVPS = charge × marginalChargeCVPS × readiness × producerShare
chargeConsumerCVPS = referenceCharge × perCharge / cooldownSeconds × readiness × consumerShare
producerShare + consumerShare = 1
```

破裂は基準敵毒から消費量を求め、失う毒の継続価値を機会費用として引く。これにより、毒生成側と破裂側へ同じ毒価値を全額計上しない。

### 7. 目標と比較する

```text
budgetRatio = weightedCombatValuePerSecond / targetCVPS
```

暫定許容域は `rules.balanceFormula.acceptableBudgetRatio` で定義する。範囲外は自動修正せず、効果内訳、役割、コンボ上限を確認する対象とする。

## 逆算例: 4ポート条件付きシールド

価格13のエピックを例にする。

```text
targetCVPS = 340 × 13 / 13.5 = 327.4
topologyUtility = (4 - 1) × 15 = 45
effectBudget = 327.4 - 45 = 282.4
```

3拍ごとの基礎シールド160は次の価値になる。

```text
baseCVPS = 160 × 0.9 / (3 × 0.5) = 96
remainingWeightedBudget = 282.4 - 96 = 186.4
```

4ポート全接続のavailabilityが0.50なら、条件付き部分は次の値まで割り当てられる。

```text
conditionalRawCVPS = 186.4 / 0.50 = 372.8
conditionalShield = 372.8 × 1.5 / 0.9 = 621.3
```

この約621を初期候補とし、整数への丸め、役割、上限テストを確認して最終値を決める。条件倍率を先に感覚で決め、あとからDPSを見る順序にはしない。

## 新しいスキルを追加するとき

1. `buildDesign.skills` にplayableな設計と `blockId` を追加する。
2. `blocks` に効果、拍、価格、レア度、ポートを宣言する。
3. `pnpm balance:formula` を実行する。
4. `formula.md` の効果別式、基準PS、重み付きCVPS、目標CVPS、予算比を確認する。
5. 蓄積資源、倍率、合流、融合と組み合わさる効果には、別途決定論的な上限テストを追加する。
6. `pnpm verify` を通し、依頼されたバランス調整では `pnpm balance:formula:check` も通す。

新しいplayableスキルは自動で対象になる。未知の効果kindは計算を失敗させるため、換算式を定義せずにレポートから抜けることはない。

## 式だけでは決められない点

- プレイヤーが条件を実際に成立させる頻度
- ショップでの取得しやすさ、リロール判断、ビルド転換
- シールドの余剰、回復の上限、オーバーキル
- 毒を残す戦略と破裂させる戦略の勝敗差
- 複数の成長、加速、増幅、合流を重ねた最適配置

これらは静的な式へ推測で混ぜない。必要になった時点で、シミュレーションレポートまたは手書きの上限テストを別の証拠として扱う。
