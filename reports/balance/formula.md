# スキルパワー計算レポート

Game schema: 23
Formula version: 1

このレポートは戦闘シミュレーションではない。`game.json` の宣言値だけを使い、同じ入力から必ず同じ結果を返す静的なパワー予算表である。勝率や実盤面での成立率は測定しない。

## 基本式

```text
secondsPerBeat = battleStepMs / 1000 = 0.5
cooldownSeconds = cooldownBeats × secondsPerBeat
rawCVPS = referenceEffectValue / cooldownSeconds
weightedEffectCVPS = rawCVPS × conditionAvailability × resourceAvailability × attributionShare
conditionRewardMultiplier = 1 / conditionAvailability
targetCVPS = rarityTargetCVPS × price / rarityReferencePrice
budgetRatio = weightedCombatValuePerSecond / targetCVPS
```

条件付き効果のパラメーターを逆算するときは、残り予算を `conditionAvailability` で割る。例えば成立率50%相当の条件なら、無条件効果の2倍までを同じ期待予算として割り当てられる。

## 基準状態と換算

- 基準時間: 10秒
- 基準チャージ: 5
- 基準敵毒: 250
- 基準経路長／直線長: 5／5
- 基準通電軸値数: 4
- 基準支援先: 220効果、3拍
- ダメージ価値: 1.0、シールド: 0.9、回復: 0.8
- 毒1の価値: 5tick分のダメージ相当
- 戦闘中コイン1枚の進行価値: 160 CVPS相当
- チャージ1の限界価値: 全解放スキルの「perCharge ÷ cooldownSeconds」の中央値 130.0 CVPS
- チャージ変動分の帰属: 生成側 65%、解放側 35%
- チャージ準備率: 70%、破裂用毒の準備率: 65%
- 通電軸値の成立係数: 70%
- 接続価値: 追加ポート1本につき 15 CVPS、回転可能なら 10 CVPS

毒・チャージ・増幅・戦闘中コインは単独では通常DPSと同じ単位にならないため、上記の固定基準で戦闘価値または進行価値へ換算する。基準値を変更するときは個別スキルではなく `rules.balanceFormula` を更新し、全スキルを再計算する。

## 条件難度

| 条件 | availability | 許容倍率 |
|---|---:|---:|
| 相手が毒 | 0.80 | 1.25x |
| 循環 | 0.50 | 2.00x |
| 経路3以上 | 0.76 | 1.32x |
| 経路5以上 | 0.52 | 1.92x |
| 直線3以上 | 0.80 | 1.25x |
| 直線4以上 | 0.65 | 1.54x |
| 直線5以上 | 0.50 | 2.00x |
| 2ポート全接続 | 0.80 | 1.25x |
| 3ポート全接続 | 0.65 | 1.54x |
| 4ポート全接続 | 0.50 | 2.00x |

availabilityは最低 0.25 で打ち止める。これは難条件だけで無制限に基礎値を膨らませないための上限で、許容倍率は最大 4.00x となる。

## レア度別目標予算

| レア度 | 基準CVPS | 基準価格 | 1コイン当たり |
|---|---:|---:|---:|
| common | 150.0 | 4.5 | 33.33 |
| rare | 220.0 | 8.0 | 27.50 |
| epic | 340.0 | 13.5 | 25.19 |
| legendary | 520.0 | 21.0 | 24.76 |

予算比 0.75x〜1.25x を暫定許容域とする。範囲外は自動修正せず、パラメーター見直し候補として扱う。

## 全スキル比較

対象 53件: LOW 0 / OK 53 / HIGH 0

| スキル | レア度 | 価格 | 拍 | 条件 | 基準攻撃PS | 基準防御PS | 重み付きCVPS | 目標CVPS | 予算比 | 判定 | 融合倍率 |
|---|---|---:|---:|---|---:|---:|---:|---:|---:|---|---:|
| 障壁 | common | 4 | 2 | なし | 0.0 | 117.0 | 157.0 | 133.3 | 1.18x | OK | 1.49x |
| 充電刃 | common | 4 | 2 | なし | 75.0 | 0.0 | 149.2 | 133.3 | 1.12x | OK | 2.41x |
| 刻印碑 | common | 4 | 2 | なし | 0.0 | 81.0 | 113.0 | 133.3 | 0.85x | OK | 2.50x |
| 霊響刃 | common | 4 | 1 | なし | 112.0 | 0.0 | 128.4 | 133.3 | 0.96x | OK | 1.43x |
| 斬撃 | common | 4 | 1 | なし | 140.0 | 0.0 | 165.0 | 133.3 | 1.24x | OK | 1.57x |
| 破砕撃 | common | 5 | 2 | なし | 160.0 | 0.0 | 185.0 | 166.7 | 1.11x | OK | 1.56x |
| 充電矢 | common | 5 | 2 | なし | 80.0 | 0.0 | 169.2 | 166.7 | 1.01x | OK | 2.30x |
| 残響矢 | common | 5 | 2 | なし | 120.0 | 0.0 | 152.8 | 166.7 | 0.92x | OK | 2.50x |
| 導刻矢 | common | 5 | 2 | なし | 75.0 | 0.0 | 129.0 | 166.7 | 0.77x | OK | 2.28x |
| 毒矢 | common | 5 | 2 | enemy-poisoned | 115.0 | 0.0 | 163.0 | 166.7 | 0.98x | OK | 3.24x |
| 回収刃 | common | 5 | 4 | なし | 55.0 | 0.0 | 160.0 | 166.7 | 0.96x | OK | 1.59x |
| 魔紋刃 | common | 5 | 2 | なし | 140.0 | 0.0 | 147.0 | 166.7 | 0.88x | OK | 2.66x |
| 調律碑 | common | 5 | 2 | なし | 0.0 | 111.6 | 129.7 | 166.7 | 0.78x | OK | 2.61x |
| アーク弾 | rare | 7 | 2 | なし | 190.0 | 0.0 | 230.0 | 192.5 | 1.19x | OK | 1.43x |
| 充電コイル | rare | 7 | - | なし | 0.0 | 0.0 | 192.5 | 192.5 | 1.00x | OK | 1.61x |
| 守護紋 | rare | 7 | 3 | なし | 0.0 | 170.0 | 180.6 | 192.5 | 0.94x | OK | 2.08x |
| 響護壁 | rare | 7 | 2 | adjacent-resonance>=3 | 0.0 | 196.5 | 209.0 | 192.5 | 1.09x | OK | 2.77x |
| 修復 | rare | 7 | 3 | なし | 0.0 | 138.7 | 163.7 | 192.5 | 0.85x | OK | 1.72x |
| 加速術 | rare | 8 | - | all-3-ports | 0.0 | 0.0 | 219.8 | 220.0 | 1.00x | OK | 1.23x |
| 増幅術 | rare | 8 | - | なし | 0.0 | 0.0 | 218.3 | 220.0 | 0.99x | OK | 1.21x |
| 賞金矢 | rare | 8 | 5 | なし | 96.0 | 0.0 | 200.0 | 220.0 | 0.91x | OK | 1.53x |
| 蓄電装甲 | rare | 8 | 2 | なし | 0.0 | 157.5 | 231.7 | 220.0 | 1.05x | OK | 2.62x |
| 培養刃 | rare | 8 | 2 | enemy-poisoned | 170.0 | 0.0 | 221.0 | 220.0 | 1.00x | OK | 2.90x |
| 長路の牙 | rare | 8 | 2 | straight>=4 | 205.0 | 0.0 | 220.5 | 220.0 | 1.00x | OK | 1.28x |
| 帰還コイル | rare | 8 | 2 | in-cycle | 0.0 | 153.0 | 220.9 | 220.0 | 1.00x | OK | 1.39x |
| 異常伝送 | rare | 8 | 2 | enemy-poisoned | 120.0 | 0.0 | 213.4 | 220.0 | 0.97x | OK | 2.60x |
| 雷響器 | rare | 8 | 2 | なし | 110.0 | 0.0 | 187.0 | 220.0 | 0.85x | OK | 2.43x |
| 双刻碑 | rare | 8 | 3 | なし | 120.0 | 0.0 | 174.0 | 220.0 | 0.79x | OK | 1.94x |
| 蝕響矢 | rare | 8 | 2 | なし | 180.0 | 0.0 | 205.6 | 220.0 | 0.93x | OK | 2.61x |
| 放電弓 | rare | 9 | 3 | なし | 713.3 | 0.0 | 260.3 | 247.5 | 1.05x | OK | 2.25x |
| 配当修復機 | rare | 9 | 5 | なし | 0.0 | 137.6 | 226.6 | 247.5 | 0.92x | OK | 1.48x |
| 雷紋 | rare | 9 | 2 | なし | 100.0 | 0.0 | 198.2 | 247.5 | 0.80x | OK | 2.38x |
| 汎用兵装 | epic | 13 | 3 | なし | 293.3 | 0.0 | 289.3 | 327.4 | 0.88x | OK | 1.33x |
| 集束紋 | epic | 13 | 3 | なし | 0.0 | 216.0 | 255.0 | 327.4 | 0.78x | OK | 2.09x |
| 交響結界 | epic | 13 | 3 | adjacent-resonance>=4 | 0.0 | 298.0 | 292.0 | 327.4 | 0.89x | OK | 2.06x |
| 連環陣 | epic | 13 | 3 | magic-sigil>=1 | 340.0 | 0.0 | 267.8 | 327.4 | 0.82x | OK | 2.06x |
| 封環結界 | epic | 13 | 3 | all-4-ports | 0.0 | 528.0 | 357.0 | 327.4 | 1.09x | OK | 1.68x |
| 毒電池 | epic | 13 | 3 | なし | 53.3 | 21.0 | 325.9 | 327.4 | 1.00x | OK | 1.65x |
| 汎用防壁 | epic | 14 | 4 | なし | 0.0 | 274.5 | 270.9 | 352.6 | 0.77x | OK | 1.73x |
| 防壁展開 | epic | 14 | 3 | なし | 0.0 | 819.3 | 366.3 | 352.6 | 1.04x | OK | 2.25x |
| 解放砲 | epic | 14 | 3 | なし | 898.7 | 0.0 | 370.2 | 352.6 | 1.05x | OK | 2.25x |
| 霊響砲 | epic | 14 | 3 | adjacent-resonance>=4 | 346.7 | 0.0 | 327.5 | 352.6 | 0.93x | OK | 2.08x |
| 破裂砲 | epic | 14 | 4 | なし | 739.5 | 0.0 | 339.3 | 352.6 | 0.96x | OK | 3.49x |
| 紋章砲 | epic | 14 | 3 | magic-sigil>=1 | 493.3 | 0.0 | 344.5 | 352.6 | 0.98x | OK | 2.25x |
| 輪毒術 | epic | 14 | 3 | in-cycle | 500.0 | 0.0 | 363.3 | 352.6 | 1.03x | OK | 2.15x |
| 猛毒花 | legendary | 20 | 3 | なし | 516.7 | 0.0 | 495.0 | 495.2 | 1.00x | OK | 2.22x |
| 架橋中枢 | legendary | 21 | 5 | なし | 320.0 | 151.2 | 442.0 | 520.0 | 0.85x | OK | 1.41x |
| 天響砲 | legendary | 21 | 4 | adjacent-resonance>=6 | 620.0 | 0.0 | 510.3 | 520.0 | 0.98x | OK | 1.91x |
| 雷路槍 | legendary | 21 | - | straight>=5 | 0.0 | 0.0 | 517.8 | 520.0 | 1.00x | OK | 1.51x |
| 深奥砲 | legendary | 21 | 4 | magic-sigil>=3 | 1,000.0 | 0.0 | 459.3 | 520.0 | 0.88x | OK | 2.00x |
| 万象連環 | legendary | 22 | 4 | magic-sigil>=1 | 450.0 | 180.0 | 481.1 | 544.8 | 0.88x | OK | 1.91x |
| 万象交響 | legendary | 22 | 4 | adjacent-resonance>=8 | 540.0 | 243.0 | 578.7 | 544.8 | 1.06x | OK | 1.92x |
| 超過解放砲 | legendary | 22 | 5 | なし | 1,176.0 | 0.0 | 572.0 | 544.8 | 1.05x | OK | 1.88x |

基準攻撃PSは、条件を満たした状態の直接ダメージ・毒の基準tick換算・破裂・チャージ解放を含む。重み付きCVPSは条件成立率、資源準備率、チャージ帰属、支援、接続価値を含むため、基準攻撃PSより小さいとは限らない。

## 効果別内訳

| スキル | 効果 | 条件 | availability | 許容倍率 | raw CVPS | weighted CVPS | 式 |
|---|---|---|---:|---:|---:|---:|---|
| 障壁 | shield | always | 1.00 | 1.00x | 117.0 | 117.0 | (amount 130)*unit 0.9/seconds 1 |
| 充電刃 | charge | always | 1.00 | 1.00x | 130.0 | 59.2 | charge 1*marginalCVPS 130*producerShare 0.65 |
| 充電刃 | damage | always | 1.00 | 1.00x | 75.0 | 75.0 | (amount 75)*unit 1/seconds 1 |
| 刻印碑 | inscribe-magic-sigil | always | 1.00 | 1.00x | 10.0 | 7.0 | level 1*targets 1*effectPower 15/targetSeconds 1.5 |
| 刻印碑 | shield | always | 1.00 | 1.00x | 81.0 | 81.0 | (amount 90)*unit 0.9/seconds 1 |
| 霊響刃 | damage | always | 1.00 | 1.00x | 112.0 | 103.4 | (amount 20 + floor(4/1)*9)*unit 1/seconds 0.5 |
| 斬撃 | damage | always | 1.00 | 1.00x | 140.0 | 140.0 | (amount 70)*unit 1/seconds 0.5 |
| 破砕撃 | damage | always | 1.00 | 1.00x | 160.0 | 160.0 | (amount 160)*unit 1/seconds 1 |
| 充電矢 | charge | always | 1.00 | 1.00x | 130.0 | 59.2 | charge 1*marginalCVPS 130*producerShare 0.65 |
| 充電矢 | damage | always | 1.00 | 1.00x | 80.0 | 80.0 | (amount 80)*unit 1/seconds 1 |
| 残響矢 | damage | always | 1.00 | 1.00x | 120.0 | 112.8 | (amount 60 + floor(4/1)*15)*unit 1/seconds 1 |
| 導刻矢 | inscribe-magic-sigil | always | 1.00 | 1.00x | 20.0 | 14.0 | level 1*targets 2*effectPower 15/targetSeconds 1.5 |
| 導刻矢 | damage | always | 1.00 | 1.00x | 75.0 | 75.0 | (amount 75)*unit 1/seconds 1 |
| 毒矢 | damage | always | 1.00 | 1.00x | 35.0 | 35.0 | (amount 35)*unit 1/seconds 1 |
| 毒矢 | poison | always | 1.00 | 1.00x | 80.0 | 80.0 | (amount 16)*unit 5/seconds 1 |
| 毒矢 | growth | enemy-poisoned | 0.80 | 1.25x | 22.5 | 18.0 | amount 1*avgPriorStacks 4.5*unit 5/targetSeconds 1 |
| 回収刃 | damage | always | 1.00 | 1.00x | 55.0 | 55.0 | (amount 110)*unit 1/seconds 2 |
| 回収刃 | coin | always | 1.00 | 1.00x | 80.0 | 80.0 | coin 1*utility 160/seconds 2 |
| 魔紋刃 | damage | always | 1.00 | 1.00x | 140.0 | 122.0 | (amount 80 + floor(2/1)*30)*unit 1/seconds 1 |
| 調律碑 | shield | always | 1.00 | 1.00x | 111.6 | 104.7 | (amount 60 + floor(4/1)*16)*unit 0.9/seconds 1 |
| アーク弾 | damage | always | 1.00 | 1.00x | 190.0 | 190.0 | (amount 190)*unit 1/seconds 1 |
| 充電コイル | charge | always | 1.00 | 1.00x | 390.0 | 177.5 | charge 3*marginalCVPS 130*producerShare 0.65 |
| 守護紋 | shield | always | 1.00 | 1.00x | 138.0 | 123.6 | (amount 150 + floor(2/1)*40)*unit 0.9/seconds 1.5 |
| 守護紋 | repair | always | 1.00 | 1.00x | 32.0 | 32.0 | (amount 60)*unit 0.8/seconds 1.5 |
| 響護壁 | shield | always | 1.00 | 1.00x | 148.5 | 139.9 | (amount 85 + floor(4/1)*20)*unit 0.9/seconds 1 |
| 響護壁 | repair | adjacent-resonance>=3 | 0.92 | 1.09x | 48.0 | 44.2 | (amount 60)*unit 0.8/seconds 1 |
| 修復 | repair | always | 1.00 | 1.00x | 138.7 | 138.7 | (amount 260)*unit 0.8/seconds 1.5 |
| 加速術 | haste | all-3-ports | 0.65 | 1.54x | 73.3 | 47.7 | target 220*(1/1 - 1/1.5) |
| 加速術 | amplify | all-3-ports | 0.65 | 1.54x | 203.3 | 132.2 | amount 305*supportUnit 1/targetSeconds 1.5 |
| 増幅術 | amplify | always | 1.00 | 1.00x | 193.3 | 193.3 | amount 290*supportUnit 1/targetSeconds 1.5 |
| 賞金矢 | damage | always | 1.00 | 1.00x | 96.0 | 96.0 | (amount 240)*unit 1/seconds 2.5 |
| 賞金矢 | coin | always | 1.00 | 1.00x | 64.0 | 64.0 | coin 1*utility 160/seconds 2.5 |
| 蓄電装甲 | charge | always | 1.00 | 1.00x | 130.0 | 59.2 | charge 1*marginalCVPS 130*producerShare 0.65 |
| 蓄電装甲 | shield | always | 1.00 | 1.00x | 157.5 | 157.5 | (amount 175)*unit 0.9/seconds 1 |
| 培養刃 | damage | always | 1.00 | 1.00x | 170.0 | 170.0 | (amount 170)*unit 1/seconds 1 |
| 培養刃 | growth | enemy-poisoned | 0.80 | 1.25x | 45.0 | 36.0 | amount 15*avgPriorStacks 4.5*unit 1/targetSeconds 1.5 |
| 長路の牙 | damage | always | 1.00 | 1.00x | 205.0 | 167.5 | (amount 130 + floor(5/1)*15)*unit 1/seconds 1 |
| 長路の牙 | growth | straight>=4 | 0.65 | 1.54x | 58.5 | 38.0 | amount 13*avgPriorStacks 4.5*unit 1/targetSeconds 1 |
| 帰還コイル | shield | always | 1.00 | 1.00x | 153.0 | 153.0 | (amount 170)*unit 0.9/seconds 1 |
| 帰還コイル | growth | in-cycle | 0.50 | 2.00x | 60.8 | 30.4 | amount 15*avgPriorStacks 4.5*unit 0.9/targetSeconds 1 |
| 帰還コイル | growth | in-cycle | 0.50 | 2.00x | 45.0 | 22.5 | amount 15*avgPriorStacks 4.5*unit 1/targetSeconds 1.5 |
| 異常伝送 | charge | always | 1.00 | 1.00x | 130.0 | 59.2 | charge 1*marginalCVPS 130*producerShare 0.65 |
| 異常伝送 | damage | always | 1.00 | 1.00x | 120.0 | 120.0 | (amount 120)*unit 1/seconds 1 |
| 異常伝送 | growth | enemy-poisoned | 0.80 | 1.25x | 24.0 | 19.2 | amount 8*avgPriorStacks 4.5*unit 1/targetSeconds 1.5 |
| 雷響器 | charge | always | 1.00 | 1.00x | 130.0 | 59.2 | charge 1*marginalCVPS 130*producerShare 0.65 |
| 雷響器 | damage | always | 1.00 | 1.00x | 110.0 | 102.8 | (amount 50 + floor(4/1)*15)*unit 1/seconds 1 |
| 双刻碑 | inscribe-magic-sigil | always | 1.00 | 1.00x | 20.0 | 14.0 | level 1*targets 2*effectPower 15/targetSeconds 1.5 |
| 双刻碑 | damage | always | 1.00 | 1.00x | 120.0 | 120.0 | (amount 180)*unit 1/seconds 1.5 |
| 蝕響矢 | poison | always | 1.00 | 1.00x | 180.0 | 165.6 | (amount 12 + floor(4/1)*6)*unit 5/seconds 1 |
| 放電弓 | release-charge | always | 1.00 | 1.00x | 713.3 | 260.3 | (base 170 + charge=5*180)*unit 1/seconds 1.5 |
| 配当修復機 | shield | always | 1.00 | 1.00x | 86.4 | 86.4 | (amount 240)*unit 0.9/seconds 2.5 |
| 配当修復機 | repair | always | 1.00 | 1.00x | 51.2 | 51.2 | (amount 160)*unit 0.8/seconds 2.5 |
| 配当修復機 | coin | always | 1.00 | 1.00x | 64.0 | 64.0 | coin 1*utility 160/seconds 2.5 |
| 雷紋 | inscribe-magic-sigil | always | 1.00 | 1.00x | 20.0 | 14.0 | level 1*targets 2*effectPower 15/targetSeconds 1.5 |
| 雷紋 | charge | always | 1.00 | 1.00x | 130.0 | 59.2 | charge 1*marginalCVPS 130*producerShare 0.65 |
| 雷紋 | damage | always | 1.00 | 1.00x | 100.0 | 100.0 | (amount 100)*unit 1/seconds 1 |
| 汎用兵装 | damage | always | 1.00 | 1.00x | 293.3 | 249.3 | (amount 220 + min(floor(4/2),4)*110)*unit 1/seconds 1.5 |
| 集束紋 | inscribe-magic-sigil | always | 1.00 | 1.00x | 20.0 | 14.0 | level 2*targets 1*effectPower 15/targetSeconds 1.5 |
| 集束紋 | shield | always | 1.00 | 1.00x | 216.0 | 216.0 | (amount 360)*unit 0.9/seconds 1.5 |
| 交響結界 | shield | adjacent-resonance>=4 | 0.88 | 1.14x | 234.0 | 190.7 | (amount 150 + floor(4/1)*60)*unit 0.9/seconds 1.5 |
| 交響結界 | repair | adjacent-resonance>=4 | 0.88 | 1.14x | 64.0 | 56.3 | (amount 120)*unit 0.8/seconds 1.5 |
| 連環陣 | poison | magic-sigil>=1 | 0.85 | 1.18x | 340.0 | 227.8 | (amount 30 + floor(4/1)*18)*unit 5/seconds 1.5 |
| 封環結界 | shield | always | 1.00 | 1.00x | 96.0 | 96.0 | (amount 160)*unit 0.9/seconds 1.5 |
| 封環結界 | shield | all-4-ports | 0.50 | 2.00x | 432.0 | 216.0 | (amount 720)*unit 0.9/seconds 1.5 |
| 毒電池 | charge | always | 1.00 | 1.00x | 520.0 | 236.6 | charge 4*marginalCVPS 130*producerShare 0.65 |
| 毒電池 | poison | always | 1.00 | 1.00x | 53.3 | 53.3 | (amount 16)*unit 5/seconds 1.5 |
| 毒電池 | shield | always | 1.00 | 1.00x | 21.0 | 21.0 | (amount 35)*unit 0.9/seconds 1.5 |
| 汎用防壁 | shield | always | 1.00 | 1.00x | 274.5 | 225.9 | (amount 250 + min(floor(4/2),3)*180)*unit 0.9/seconds 2 |
| 防壁展開 | release-charge | always | 1.00 | 1.00x | 726.0 | 273.0 | (base 210 + charge=5*200)*unit 0.9/seconds 1.5 |
| 防壁展開 | repair | always | 1.00 | 1.00x | 93.3 | 93.3 | (amount 175)*unit 0.8/seconds 1.5 |
| 解放砲 | release-charge | always | 1.00 | 1.00x | 898.7 | 370.2 | (base 298 + charge=5*210)*unit 1/seconds 1.5 |
| 霊響砲 | damage | adjacent-resonance>=4 | 0.88 | 1.14x | 346.7 | 282.5 | (amount 200 + floor(4/1)*80)*unit 1/seconds 1.5 |
| 破裂砲 | rupture-poison | always | 1.00 | 1.00x | 739.5 | 339.3 | (floor(poison 250*0.35)*17 - consumed*poisonTicks 5)/seconds 2 |
| 紋章砲 | damage | magic-sigil>=1 | 0.85 | 1.18x | 493.3 | 344.5 | (amount 300 + floor(2/1)*220)*unit 1/seconds 1.5 |
| 輪毒術 | poison | always | 1.00 | 1.00x | 166.7 | 166.7 | (amount 50)*unit 5/seconds 1.5 |
| 輪毒術 | poison | in-cycle | 0.50 | 2.00x | 333.3 | 166.7 | (amount 100)*unit 5/seconds 1.5 |
| 猛毒花 | poison | always | 1.00 | 1.00x | 516.7 | 480.0 | (amount 100 + floor(250/250)*55)*unit 5/seconds 1.5 |
| 架橋中枢 | damage | always | 1.00 | 1.00x | 320.0 | 269.6 | (amount 380 + min(floor(4/2),4)*210)*unit 1/seconds 2.5 |
| 架橋中枢 | shield | always | 1.00 | 1.00x | 151.2 | 127.4 | (amount 200 + min(floor(4/2),4)*110)*unit 0.9/seconds 2.5 |
| 天響砲 | damage | adjacent-resonance>=6 | 0.80 | 1.25x | 620.0 | 465.3 | (amount 600 + floor(4/1)*160)*unit 1/seconds 2 |
| 雷路槍 | charge | always | 1.00 | 1.00x | 780.0 | 354.9 | charge 6*marginalCVPS 130*producerShare 0.65 |
| 雷路槍 | charge | straight>=5 | 0.50 | 2.00x | 650.0 | 147.9 | charge 5*marginalCVPS 130*producerShare 0.65 |
| 深奥砲 | damage | magic-sigil>=3 | 0.55 | 1.82x | 1,000.0 | 459.3 | (amount 900 + floor(2/1)*550)*unit 1/seconds 2 |
| 万象連環 | damage | magic-sigil>=1 | 0.85 | 1.18x | 450.0 | 306.0 | (amount 300 + floor(4/1)*150)*unit 1/seconds 2 |
| 万象連環 | shield | magic-sigil>=1 | 0.85 | 1.18x | 180.0 | 130.1 | (amount 200 + floor(4/1)*50)*unit 0.9/seconds 2 |
| 万象交響 | damage | adjacent-resonance>=8 | 0.72 | 1.39x | 540.0 | 368.1 | (amount 600 + floor(4/1)*120)*unit 1/seconds 2 |
| 万象交響 | shield | adjacent-resonance>=8 | 0.72 | 1.39x | 243.0 | 165.6 | (amount 300 + floor(4/1)*60)*unit 0.9/seconds 2 |
| 超過解放砲 | release-charge | always | 1.00 | 1.00x | 1,176.0 | 572.0 | (base 940 + charge=5*400)*unit 1/seconds 2.5 |

## 読み方と限界

- `HIGH` は即ナーフ、`LOW` は即バフという意味ではない。まず効果内訳と、意図した役割・コンボ上限を確認する。
- 条件availabilityは実測確率ではなく、パラメーター設計用の固定難度係数である。実際の成立率を変更理由に使う場合だけシミュレーション結果を併読する。
- 成長は基準時間内の平均蓄積段数、加速と増幅は基準支援先、破裂は基準敵毒、解放は基準チャージで比較する。
- コイン効果は将来ランの購買力を固定係数で近似する。単戦闘シミュレーションでは将来ランへの複利効果を再現しない。
- 合流倍率は全スキル共通の盤面上限なので基礎予算へ入れない。融合は通常値とは別に倍率だけを表示する。
- 新しいplayableスキルは自動で追加され、未知の効果kindは計算を失敗させる。係数や式を定義せずに比較対象から漏らさない。
