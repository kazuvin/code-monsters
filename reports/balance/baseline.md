# Code Monsters バランスシミュレーション

- ゲームデータ: schema 20
- 固定シード: 20260721
- 対象ラン: 1, 2, 3, 4, 5, 6, 7, 8, 9
- 通常戦闘: 10000戦（陣営入替 5000組）
- 反実仮想ベンチマーク: 11200戦

## 全体集計

| プレイヤー勝率 | 敵勝率 | 引分率 | 陣営差 | 平均決着tick |
| ---: | ---: | ---: | ---: | ---: |
| 47.9% | 47.9% | 4.1% | 0.0% | 26.1 |

## 要確認スキル

| スキル | レア | 登場 | 補正勝率差 | 差替勝率差 | 無効化差 | 同レア差 | 出力Z | 無効化Z | シグナル |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| アーク弾 | rare | 7066 | -1.0% | -45.0% | 17.5% | 0.0% | 0.31 | -0.15 | counterfactual-underpowered |
| 封環結界 | epic | 6130 | -13.2% | -30.0% | 6.3% | -17.5% | -0.60 | -1.31 | matched-underrepresented, counterfactual-underpowered |
| 斬撃 | common | 14348 | 5.0% | -20.0% | 7.5% | -11.3% | -0.73 | -1.63 | counterfactual-underpowered |
| 充電刃 | common | 3458 | 0.1% | -8.8% | 12.5% | -6.3% | -0.40 | -0.82 | counterfactual-underpowered |
| 修復 | rare | 2482 | -1.9% | -8.8% | 5.0% | -12.5% | 0.15 | -1.37 | counterfactual-underpowered |

## 単独シグナル

| スキル | 補正勝率差 | 差替勝率差 | 無効化差 | 同レア差 | 出力Z | 無効化Z | シグナル |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 連環陣 | 32.7% | — | 55.0% | 31.3% | -1.08 | 1.73 | matched-overrepresented |
| 万象交響 | 30.1% | — | 47.5% | 3.8% | 0.51 | 0.75 | matched-overrepresented |
| 紋章砲 | -29.7% | — | 17.5% | -6.3% | -0.02 | -0.61 | matched-underrepresented |
| 天響砲 | 22.6% | — | 43.8% | 0.0% | -1.01 | 0.56 | matched-overrepresented |
| 輪毒術 | 20.6% | — | 56.3% | 32.5% | -1.03 | 1.81 | matched-overrepresented |
| 破裂砲 | -14.7% | — | 12.5% | -11.3% | 2.23 | -0.92 | reported-output-high |
| 調律碑 | 10.1% | — | 13.8% | -5.0% | -0.31 | -0.62 | matched-overrepresented |
| 加速術 | 14.0% | -8.8% | 37.5% | 20.0% | — | 1.80 | matched-overrepresented |
| 放電弓 | 3.7% | — | 25.0% | 7.5% | 2.73 | 0.58 | reported-output-high |
| 障壁 | -3.2% | — | 17.5% | -1.3% | 2.41 | -0.02 | reported-output-high |
| 交響結界 | -9.4% | -1.3% | 35.0% | 11.3% | 0.34 | 0.48 | matched-underrepresented |

## ビルド間警告

| Pビルド | Eビルド | 戦闘 | Pスコア率 | 50%との差 |
| --- | --- | ---: | ---: | ---: |
| charge | magic-sigil | 605 | 37.3% | -12.7% |
| charge | resonance | 605 | 29.3% | -20.7% |
| magic-sigil | charge | 605 | 62.7% | 12.7% |
| magic-sigil | resonance | 607 | 60.5% | 10.5% |
| poison | resonance | 644 | 60.6% | 10.6% |
| resonance | charge | 605 | 70.7% | 20.7% |
| resonance | magic-sigil | 607 | 39.5% | -10.5% |
| resonance | poison | 644 | 39.4% | -10.6% |

## スキル別集計

| ID | スキル | 配置 | レア | 登場 | 不採用 | 勝率 | 補正勝率差 | 発動/戦 | 報告ダメ/戦 | 毒付与/戦 | 防壁/戦 | 実回復/戦 | 差替N | 差替勝率差 | 無効化N | 無効化差 | 同レア差 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| arc-shot | アーク弾 | free | rare | 7066 | 5170 | 46.2% | -1.0% | 16.69 | 4723.7 | 0.0 | 0.0 | 0.0 | 40 | -45.0% | 40 | 17.5% | 0.0% |
| sealed-junction | 封環結界 | fully-connected | epic | 6130 | 7264 | 40.9% | -13.2% | 11.51 | 0.0 | 0.0 | 4358.1 | 0.0 | 40 | -30.0% | 40 | 6.3% | -17.5% |
| strike | 斬撃 | free | common | 14348 | 4006 | 48.9% | 5.0% | 36.73 | 3324.3 | 0.0 | 0.0 | 0.0 | 40 | -20.0% | 40 | 7.5% | -11.3% |
| charge-blade | 充電刃 | free | common | 3458 | 1498 | 37.4% | 0.1% | 19.68 | 2079.6 | 0.0 | 0.0 | 0.0 | 40 | -8.8% | 40 | 12.5% | -6.3% |
| repair | 修復 | free | rare | 2482 | 14162 | 47.5% | -1.9% | 9.72 | 0.0 | 0.0 | 0.0 | 2577.5 | 40 | -8.8% | 40 | 5.0% | -12.5% |
| resonance-circle | 連環陣 | magic-sigil | epic | 3380 | 1550 | 64.5% | 32.7% | 8.79 | 0.0 | 1578.3 | 0.0 | 0.0 | 0 | — | 40 | 55.0% | 31.3% |
| grand-harmony | 万象交響 | resonance | legendary | 358 | 1332 | 70.9% | 30.1% | 5.72 | 12828.6 | 0.0 | 6414.3 | 0.0 | 0 | — | 40 | 47.5% | 3.8% |
| sigil-cannon | 紋章砲 | magic-sigil | epic | 1412 | 3518 | 33.1% | -29.7% | 9.90 | 6146.2 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 17.5% | -6.3% |
| overcharge-cannon | 超過解放砲 | free | legendary | 14 | 1072 | 0.0% | -27.5% | 5.00 | 11919.3 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 51.2% | 7.5% |
| deep-sigil-cannon | 深奥砲 | magic-sigil | legendary | 80 | 2150 | 25.0% | -27.3% | 0.40 | 1038.0 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 0.0% | -43.8% |
| celestial-echo-cannon | 天響砲 | resonance | legendary | 634 | 2140 | 66.2% | 22.6% | 5.00 | 12647.3 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 43.8% | 0.0% |
| venom-orbit | 輪毒術 | loop | epic | 1416 | 1492 | 72.5% | 20.6% | 6.15 | 0.0 | 1225.3 | 0.0 | 0.0 | 0 | — | 40 | 56.3% | 32.5% |
| all-sigil-resonance | 万象連環 | magic-sigil | legendary | 58 | 2678 | 69.0% | 20.5% | 6.59 | 17664.7 | 0.0 | 7664.7 | 0.0 | 0 | — | 40 | 37.5% | -6.3% |
| rupture-stake | 破裂砲 | free | epic | 5074 | 24 | 51.4% | -14.7% | 6.26 | 9715.3 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 12.5% | -11.3% |
| venom-bloom | 猛毒花 | free | legendary | 24 | 2322 | 75.0% | 11.6% | 7.08 | 0.0 | 2688.8 | 0.0 | 0.0 | 0 | — | 40 | 45.0% | 1.3% |
| tuning-stone | 調律碑 | resonance | common | 2694 | 2322 | 51.4% | 10.1% | 18.30 | 0.0 | 0.0 | 2011.6 | 0.0 | 0 | — | 40 | 13.8% | -5.0% |
| accelerator | 加速術 | fully-connected | rare | 8318 | 7244 | 53.6% | 14.0% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | -8.8% | 40 | 37.5% | 20.0% |
| sigil-blade | 魔紋刃 | magic-sigil | common | 2432 | 1976 | 51.0% | -6.7% | 17.88 | 2520.6 | 0.0 | 0.0 | 0.0 | 40 | -7.5% | 40 | 21.3% | 2.5% |
| status-relay | 異常伝送 | free | rare | 2308 | 4988 | 45.7% | -3.7% | 13.79 | 2329.1 | 0.0 | 0.0 | 0.0 | 40 | -7.5% | 40 | 11.3% | -6.3% |
| cultivation-blade | 培養刃 | free | rare | 300 | 3144 | 64.7% | 2.8% | 11.04 | 2435.8 | 0.0 | 0.0 | 0.0 | 40 | 6.3% | 40 | 10.0% | -7.5% |
| resonance-cannon | 霊響砲 | resonance | epic | 1338 | 3126 | 43.9% | -6.1% | 8.61 | 7345.3 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 23.8% | 0.0% |
| charge-guard | 蓄電装甲 | free | rare | 504 | 3874 | 36.1% | 2.0% | 15.64 | 0.0 | 0.0 | 3685.6 | 0.0 | 40 | -5.0% | 40 | 15.0% | -2.5% |
| inscription-stone | 刻印碑 | free | common | 3348 | 1060 | 56.1% | 3.7% | 19.93 | 0.0 | 0.0 | 2645.6 | 0.0 | 40 | 5.0% | 40 | 23.8% | 5.0% |
| long-route-fang | 長路の牙 | straight-line | rare | 1884 | 13678 | 51.6% | 3.8% | 12.61 | 4101.0 | 0.0 | 0.0 | 0.0 | 40 | 5.0% | 40 | 32.5% | 15.0% |
| charge-bastion | 防壁展開 | free | epic | 198 | 3052 | 37.4% | 4.3% | 10.75 | 0.0 | 0.0 | 8409.5 | 1738.5 | 0 | — | 40 | 28.7% | 5.0% |
| toxic-reservoir | 毒電池 | free | epic | 416 | 5782 | 39.9% | -3.9% | 8.09 | 0.0 | 301.8 | 463.0 | 0.0 | 0 | — | 40 | 10.0% | -13.8% |
| thunder-sigil | 雷紋 | free | rare | 2814 | 4902 | 44.9% | 1.5% | 15.77 | 2499.2 | 0.0 | 0.0 | 0.0 | 40 | -3.8% | 40 | 27.5% | 10.0% |
| twin-inscription | 双刻碑 | free | rare | 2846 | 1562 | 53.8% | -1.6% | 13.64 | 3927.0 | 0.0 | 0.0 | 0.0 | 40 | -3.8% | 40 | 27.5% | 10.0% |
| discharge-bow | 放電弓 | free | rare | 4524 | 432 | 38.8% | 3.7% | 9.39 | 5347.3 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 25.0% | 7.5% |
| barrier | 障壁 | free | common | 17910 | 1538 | 48.0% | -3.2% | 24.38 | 0.0 | 0.0 | 5760.5 | 0.0 | 0 | — | 40 | 17.5% | -1.3% |
| spirit-blade | 霊響刃 | resonance | common | 4366 | 650 | 47.2% | 5.4% | 43.02 | 2375.9 | 0.0 | 0.0 | 0.0 | 40 | -2.5% | 40 | 11.3% | -7.5% |
| venom-chorus | 蝕響矢 | resonance | rare | 5650 | 1662 | 52.2% | 3.1% | 17.10 | 0.0 | 933.6 | 0.0 | 0.0 | 40 | -2.5% | 40 | 36.3% | 18.8% |
| rail-cannon | 解放砲 | free | epic | 220 | 3632 | 34.5% | 1.7% | 8.70 | 8014.1 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 21.3% | -2.5% |
| charge-line-lance | 雷路槍 | straight-line | legendary | 384 | 2302 | 30.7% | -1.5% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 5.0% | -38.8% |
| harmonic-sanctuary | 交響結界 | resonance | epic | 2686 | 2330 | 40.5% | -9.4% | 11.61 | 0.0 | 0.0 | 7365.6 | 1551.3 | 40 | -1.3% | 40 | 35.0% | 11.3% |
| harmony-ward | 響護壁 | resonance | rare | 830 | 3098 | 51.6% | 4.5% | 15.15 | 0.0 | 0.0 | 2316.4 | 330.8 | 40 | 1.3% | 40 | 21.3% | 3.8% |
| thunder-echo | 雷響器 | resonance | rare | 3204 | 3980 | 41.3% | -2.4% | 16.40 | 1785.5 | 0.0 | 0.0 | 0.0 | 40 | -1.3% | 40 | 10.0% | -7.5% |
| breaker | 破砕撃 | free | common | 8698 | 10750 | 48.6% | -0.9% | 14.52 | 2750.9 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 21.3% | 2.5% |
| convergence-sigil | 集束紋 | free | epic | 384 | 2918 | 52.1% | -0.5% | 8.83 | 0.0 | 0.0 | 3525.5 | 0.0 | 0 | — | 40 | 33.8% | 10.0% |
| amplifier | 増幅術 | free | rare | 4432 | 9502 | 49.1% | -0.1% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | 0.0% | 40 | 7.5% | -10.0% |
| charge-arrow | 充電矢 | free | common | 4956 | 0 | 38.5% | — | 25.41 | 2906.5 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 27.5% | 8.8% |
| charge-coil | 充電コイル | free | rare | 1376 | 3002 | 32.0% | -3.3% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | 0.0% | 40 | 5.0% | -12.5% |
| echo-arrow | 残響矢 | resonance | common | 5016 | 0 | 46.9% | — | 28.77 | 3446.1 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 10.0% | -8.8% |
| guardian-sigil | 守護紋 | magic-sigil | rare | 586 | 3822 | 56.7% | 3.1% | 10.10 | 0.0 | 0.0 | 2131.0 | 919.5 | 40 | 0.0% | 40 | 16.3% | -1.3% |
| guiding-bolt | 導刻矢 | free | common | 4930 | 0 | 54.9% | — | 25.24 | 2966.2 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 25.0% | 6.3% |
| poison-needle | 毒矢 | free | common | 5098 | 0 | 51.5% | — | 21.68 | 999.3 | 700.8 | 0.0 | 0.0 | 0 | — | 40 | 20.0% | 1.3% |
| return-coil | 帰還コイル | loop | rare | 1810 | 13752 | 50.3% | 1.9% | 14.80 | 0.0 | 0.0 | 4434.4 | 0.0 | 40 | 0.0% | 40 | 18.8% | 1.3% |

## ラン別集計

| Run | Lv | 予算 | 平均使用額 | 平均ノード | 戦闘 | P勝 | E勝 | 引分 | 平均tick |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 32 | 31.8 | 5.26 | 1112 | 488 | 488 | 136 | 34.5 |
| 2 | 2 | 42 | 41.4 | 7.24 | 1112 | 525 | 525 | 62 | 32.4 |
| 3 | 3 | 52 | 51.7 | 9.00 | 1112 | 519 | 519 | 74 | 26.4 |
| 4 | 4 | 62 | 61.2 | 10.00 | 1112 | 538 | 538 | 36 | 26.5 |
| 5 | 5 | 72 | 70.8 | 10.74 | 1112 | 544 | 544 | 24 | 23.2 |
| 6 | 6 | 82 | 80.9 | 12.00 | 1110 | 544 | 544 | 22 | 23.4 |
| 7 | 7 | 92 | 90.2 | 13.00 | 1110 | 544 | 544 | 22 | 23.3 |
| 8 | 8 | 102 | 99.6 | 14.00 | 1110 | 545 | 545 | 20 | 22.6 |
| 9 | 9 | 112 | 108.7 | 15.00 | 1110 | 548 | 548 | 14 | 22.3 |

## ビルドマッチアップ

| Pビルド | Eビルド | 戦闘 | Pスコア率 | 平均tick |
| --- | --- | ---: | ---: | ---: |
| charge | charge | 634 | 50.0% | 28.4 |
| charge | magic-sigil | 605 | 37.3% | 26.4 |
| charge | poison | 634 | 42.4% | 22.3 |
| charge | resonance | 605 | 29.3% | 30.3 |
| magic-sigil | charge | 605 | 62.7% | 26.4 |
| magic-sigil | magic-sigil | 606 | 50.0% | 26.9 |
| magic-sigil | poison | 647 | 52.9% | 23.3 |
| magic-sigil | resonance | 607 | 60.5% | 27.9 |
| poison | charge | 634 | 57.6% | 22.3 |
| poison | magic-sigil | 647 | 47.1% | 23.3 |
| poison | poison | 624 | 50.0% | 20.9 |
| poison | resonance | 644 | 60.6% | 25.4 |
| resonance | charge | 605 | 70.7% | 30.3 |
| resonance | magic-sigil | 607 | 39.5% | 27.9 |
| resonance | poison | 644 | 39.4% | 25.4 |
| resonance | resonance | 652 | 50.0% | 30.3 |

## 読み方と制約

- Generated builds spend no more than the average cumulative player coin budget for that run and use level-adjusted rarity weights, but do not model individual shop choices, rerolls, locked offers, or fusion decisions.
- Per-skill damage is reported trace output before shield absorption and overkill; repair is capped effective healing.
- Poison tick damage is team-attributed rather than source-skill-attributed.
- Passive support is evaluated primarily through matched and counterfactual outcome lift rather than direct trace output.
- Generated builds are not an optimizer for strongest placements or multi-skill combo ceilings; multiplicative payoffs require deterministic high-synergy regression tests.
- Rarity-relative signals for topology-gated skills remain informational because the fixed generator does not guarantee each loop, fully-connected, or straight-line condition.

補正勝率差は同じ run・ビルドの不採用盤面との差です。差替勝率差は同一接続形状・同レア・役割重複のノードを置換した差、無効化差は接続を維持したまま対象効果だけを止めた差です。どちらも同じ相手へ両陣営から戦わせています。
