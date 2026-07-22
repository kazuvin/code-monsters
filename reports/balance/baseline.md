# Code Monsters バランスシミュレーション

- ゲームデータ: schema 21
- 固定シード: 20260721
- 対象ラン: 1, 2, 3, 4, 5, 6, 7, 8, 9
- 通常戦闘: 10000戦（陣営入替 5000組）
- 反実仮想ベンチマーク: 10916戦

## 全体集計

| プレイヤー勝率 | 敵勝率 | 引分率 | 陣営差 | 平均決着tick |
| ---: | ---: | ---: | ---: | ---: |
| 46.5% | 46.5% | 7.0% | 0.0% | 35.6 |

## 要確認スキル

| スキル | レア | 登場 | 補正勝率差 | 差替勝率差 | 無効化差 | 同レア差 | 出力Z | 無効化Z | シグナル |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 斬撃 | common | 13870 | 1.6% | -56.3% | 21.3% | -11.9% | -0.75 | -0.84 | counterfactual-underpowered |
| 封環結界 | epic | 60 | -32.7% | -52.5% | 7.5% | -35.0% | -1.06 | -1.51 | counterfactual-underpowered |
| 異常伝送 | rare | 88 | -13.6% | -28.7% | 10.0% | -12.5% | -0.91 | -1.11 | counterfactual-underpowered |
| 加速術 | rare | 982 | 22.5% | -26.3% | 41.3% | 18.8% | — | 1.06 | matched-overrepresented, counterfactual-underpowered |
| アーク弾 | rare | 3012 | -27.8% | -22.5% | 45.0% | 22.5% | 1.17 | 1.32 | matched-underrepresented, counterfactual-underpowered, ablation-rarity-high |
| 充電コイル | rare | 102 | -42.1% | -17.5% | 5.0% | -17.5% | — | -1.45 | counterfactual-underpowered, ablation-rarity-low |
| 雷響器 | rare | 94 | -18.1% | -13.8% | 11.3% | -11.3% | -1.04 | -1.02 | counterfactual-underpowered |
| 双刻碑 | rare | 738 | 13.2% | 11.3% | 50.0% | 27.5% | 0.27 | 1.67 | matched-overrepresented, counterfactual-overpowered, ablation-rarity-high |
| 魔紋刃 | common | 426 | -4.4% | -8.8% | 12.5% | -20.6% | 0.18 | -1.28 | counterfactual-underpowered |
| 刻印碑 | common | 2676 | 12.4% | 3.8% | 53.8% | 20.6% | 0.48 | 0.77 | matched-overrepresented, ablation-rarity-high |

## 単独シグナル

| スキル | 補正勝率差 | 差替勝率差 | 無効化差 | 同レア差 | 出力Z | 無効化Z | シグナル |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 紋章砲 | -42.9% | — | 32.5% | -10.0% | 0.24 | -0.38 | matched-underrepresented |
| 連環陣 | 40.6% | — | 70.0% | 27.5% | -1.49 | 1.31 | matched-overrepresented |
| 障壁 | -16.8% | — | 36.3% | 3.1% | 2.00 | -0.10 | matched-underrepresented |
| 霊響砲 | 13.0% | — | 51.2% | 8.8% | 1.49 | 0.47 | matched-overrepresented |
| 調律碑 | -8.2% | — | 23.8% | -9.4% | -0.19 | -0.72 | matched-underrepresented |
| 蝕響矢 | 22.9% | -3.8% | 45.0% | 22.5% | -1.65 | 1.32 | matched-overrepresented |
| 交響結界 | -9.1% | -2.6% | 46.3% | 3.8% | 0.55 | 0.24 | matched-underrepresented |
| 充電矢 | — | — | 60.0% | 26.9% | -0.30 | 1.08 | ablation-rarity-high |
| 放電弓 | — | — | 48.8% | 26.3% | 2.01 | 1.58 | reported-output-high, ablation-rarity-high |
| 導刻矢 | — | — | 51.2% | 18.1% | -0.50 | 0.65 | ablation-rarity-high |
| 毒矢 | — | — | 86.3% | 53.1% | -1.00 | 2.39 | ablation-impact-high, ablation-rarity-high |
| 破裂砲 | — | — | 12.5% | -30.0% | 0.26 | -1.28 | ablation-rarity-low |
| 毒電池 | — | — | 16.3% | -26.3% | — | -1.11 | ablation-rarity-low |
| 猛毒花 | — | — | 66.3% | 44.4% | — | 0.95 | ablation-rarity-high |

## ビルド間警告

| Pビルド | Eビルド | 戦闘 | Pスコア率 | 50%との差 |
| --- | --- | ---: | ---: | ---: |
| charge | magic-sigil | 605 | 37.9% | -12.1% |
| charge | poison | 634 | 68.8% | 18.8% |
| magic-sigil | charge | 605 | 62.1% | 12.1% |
| magic-sigil | poison | 647 | 72.6% | 22.6% |
| magic-sigil | resonance | 607 | 75.0% | 25.0% |
| poison | charge | 634 | 31.2% | -18.8% |
| poison | magic-sigil | 647 | 27.4% | -22.6% |
| poison | resonance | 644 | 33.2% | -16.8% |
| resonance | magic-sigil | 607 | 25.0% | -25.0% |
| resonance | poison | 644 | 66.8% | 16.8% |

## スキル別集計

| ID | スキル | 配置 | レア | 登場 | 不採用 | 勝率 | 補正勝率差 | 発動/戦 | 報告ダメ/戦 | 毒付与/戦 | 防壁/戦 | 実回復/戦 | 差替N | 差替勝率差 | 無効化N | 無効化差 | 同レア差 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| strike | 斬撃 | free | common | 13870 | 3992 | 44.9% | 1.6% | 57.18 | 4384.8 | 0.0 | 0.0 | 0.0 | 40 | -56.3% | 40 | 21.3% | -11.9% |
| sealed-junction | 封環結界 | fully-connected | epic | 60 | 1056 | 20.0% | -32.7% | 11.67 | 0.0 | 0.0 | 2474.7 | 0.0 | 40 | -52.5% | 40 | 7.5% | -35.0% |
| status-relay | 異常伝送 | free | rare | 88 | 1518 | 36.4% | -13.6% | 14.61 | 1753.6 | 0.0 | 0.0 | 0.0 | 40 | -28.7% | 40 | 10.0% | -12.5% |
| accelerator | 加速術 | fully-connected | rare | 982 | 3992 | 67.6% | 22.5% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | -26.3% | 40 | 41.3% | 18.8% |
| arc-shot | アーク弾 | free | rare | 3012 | 4748 | 30.1% | -27.8% | 20.61 | 6519.0 | 0.0 | 0.0 | 0.0 | 40 | -22.5% | 40 | 45.0% | 22.5% |
| charge-coil | 充電コイル | free | rare | 102 | 1486 | 5.9% | -42.1% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | -17.5% | 40 | 5.0% | -17.5% |
| thunder-echo | 雷響器 | resonance | rare | 94 | 2630 | 25.5% | -18.1% | 20.30 | 2180.3 | 0.0 | 0.0 | 0.0 | 40 | -13.8% | 40 | 11.3% | -11.3% |
| twin-inscription | 双刻碑 | free | rare | 738 | 1504 | 65.3% | 13.2% | 11.17 | 2592.8 | 0.0 | 0.0 | 0.0 | 40 | 11.3% | 40 | 50.0% | 27.5% |
| sigil-blade | 魔紋刃 | magic-sigil | common | 426 | 3476 | 54.0% | -4.4% | 20.58 | 2335.1 | 0.0 | 0.0 | 0.0 | 40 | -8.8% | 40 | 12.5% | -20.6% |
| inscription-stone | 刻印碑 | free | common | 2676 | 1226 | 64.9% | 12.4% | 25.25 | 0.0 | 0.0 | 3165.6 | 0.0 | 40 | 3.8% | 40 | 53.8% | 20.6% |
| celestial-echo-cannon | 天響砲 | resonance | legendary | 72 | 1066 | 94.4% | 54.5% | 5.86 | 18286.7 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 90.0% | 68.1% |
| sigil-cannon | 紋章砲 | magic-sigil | epic | 892 | 4038 | 28.7% | -42.9% | 12.80 | 6889.3 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 32.5% | -10.0% |
| resonance-circle | 連環陣 | magic-sigil | epic | 4038 | 892 | 69.6% | 40.6% | 12.04 | 0.0 | 1266.4 | 0.0 | 0.0 | 0 | — | 40 | 70.0% | 27.5% |
| barrier | 障壁 | free | common | 16348 | 2542 | 46.5% | -16.8% | 29.47 | 0.0 | 0.0 | 5464.3 | 0.0 | 0 | — | 40 | 36.3% | 3.1% |
| resonance-cannon | 霊響砲 | resonance | epic | 1212 | 3804 | 59.1% | 13.0% | 10.48 | 8920.7 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 51.2% | 8.8% |
| cultivation-blade | 培養刃 | free | rare | 18 | 554 | 44.4% | -3.6% | 8.33 | 1812.2 | 0.0 | 0.0 | 0.0 | 30 | 10.0% | 40 | 21.3% | -1.3% |
| tuning-stone | 調律碑 | resonance | common | 2598 | 2418 | 44.1% | -8.2% | 21.68 | 0.0 | 0.0 | 2144.4 | 0.0 | 0 | — | 40 | 23.8% | -9.4% |
| harmony-ward | 響護壁 | resonance | rare | 224 | 2560 | 53.6% | 5.6% | 20.21 | 0.0 | 0.0 | 2843.0 | 595.1 | 40 | 7.5% | 40 | 20.0% | -2.5% |
| charge-blade | 充電刃 | free | common | 2584 | 2372 | 45.0% | -7.1% | 28.90 | 2198.2 | 0.0 | 0.0 | 0.0 | 40 | 6.3% | 40 | 35.0% | 1.9% |
| charge-guard | 蓄電装甲 | free | rare | 22 | 1064 | 36.4% | -11.2% | 19.82 | 0.0 | 0.0 | 3468.2 | 0.0 | 40 | -6.3% | 40 | 25.0% | 2.5% |
| repair | 修復 | free | rare | 464 | 10078 | 45.7% | -10.4% | 13.36 | 0.0 | 0.0 | 0.0 | 3426.7 | 40 | -5.0% | 40 | 13.8% | -8.8% |
| long-route-fang | 長路の牙 | straight-line | rare | 118 | 4906 | 66.1% | 9.5% | 16.59 | 4346.1 | 0.0 | 0.0 | 0.0 | 40 | 3.8% | 40 | 30.0% | 7.5% |
| return-coil | 帰還コイル | loop | rare | 98 | 4374 | 59.2% | 7.2% | 19.55 | 0.0 | 0.0 | 4103.7 | 0.0 | 40 | -3.8% | 40 | 22.5% | 0.0% |
| spirit-blade | 霊響刃 | resonance | common | 4824 | 192 | 43.8% | -8.7% | 65.29 | 3158.3 | 0.0 | 0.0 | 0.0 | 40 | 3.8% | 40 | 20.0% | -13.1% |
| venom-chorus | 蝕響矢 | resonance | rare | 966 | 2390 | 60.0% | 22.9% | 18.88 | 0.0 | 950.6 | 0.0 | 0.0 | 40 | -3.8% | 40 | 45.0% | 22.5% |
| harmonic-sanctuary | 交響結界 | resonance | epic | 3732 | 1284 | 38.5% | -9.1% | 13.87 | 0.0 | 0.0 | 6873.3 | 1661.1 | 19 | -2.6% | 40 | 46.3% | 3.8% |
| guardian-sigil | 守護紋 | magic-sigil | rare | 208 | 2574 | 54.8% | -6.9% | 12.87 | 0.0 | 0.0 | 2269.6 | 810.9 | 40 | -2.5% | 40 | 23.8% | 1.3% |
| breaker | 破砕撃 | free | common | 10738 | 8152 | 46.0% | 1.3% | 21.00 | 3545.9 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 27.5% | -5.6% |
| amplifier | 増幅術 | free | rare | 126 | 3710 | 57.1% | 6.5% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | -1.3% | 40 | 20.0% | -2.5% |
| all-sigil-resonance | 万象連環 | magic-sigil | legendary | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 20.0% | -1.9% |
| charge-arrow | 充電矢 | free | common | 4956 | 0 | 48.1% | — | 25.41 | 2405.0 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 60.0% | 26.9% |
| charge-bastion | 防壁展開 | free | epic | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 42.5% | 0.0% |
| charge-line-lance | 雷路槍 | straight-line | legendary | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 23.8% | 1.9% |
| convergence-sigil | 集束紋 | free | epic | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 38.8% | -3.8% |
| deep-sigil-cannon | 深奥砲 | magic-sigil | legendary | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 0.0% | -21.9% |
| discharge-bow | 放電弓 | free | rare | 4956 | 0 | 48.1% | — | 12.03 | 4771.0 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 48.8% | 26.3% |
| echo-arrow | 残響矢 | resonance | common | 5016 | 0 | 44.3% | — | 35.13 | 4765.1 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 31.3% | -1.9% |
| grand-harmony | 万象交響 | resonance | legendary | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 0 | — | — |
| guiding-bolt | 導刻矢 | free | common | 4930 | 0 | 62.2% | — | 30.21 | 2614.8 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 51.2% | 18.1% |
| overcharge-cannon | 超過解放砲 | free | legendary | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 20.0% | -1.9% |
| poison-needle | 毒矢 | free | common | 5098 | 0 | 31.8% | — | 23.85 | 948.9 | 649.2 | 0.0 | 0.0 | 0 | — | 40 | 86.3% | 53.1% |
| rail-cannon | 解放砲 | free | epic | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 50.0% | 7.5% |
| rupture-stake | 破裂砲 | free | epic | 5098 | 0 | 31.8% | — | 9.00 | 4875.0 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 12.5% | -30.0% |
| thunder-sigil | 雷紋 | free | rare | 180 | 1424 | 62.2% | -7.1% | 17.71 | 2004.1 | 0.0 | 0.0 | 0.0 | 40 | 0.0% | 40 | 8.8% | -13.8% |
| toxic-reservoir | 毒電池 | free | epic | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 16.3% | -26.3% |
| venom-bloom | 猛毒花 | free | legendary | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 66.3% | 44.4% |
| venom-orbit | 輪毒術 | loop | epic | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 82.5% | 40.0% |

## ラン別集計

| Run | Lv | 予算 | 平均使用額 | 平均ノード | 戦闘 | P勝 | E勝 | 引分 | 平均tick |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 32 | 31.8 | 5.26 | 1112 | 497 | 497 | 118 | 22.8 |
| 2 | 2 | 42 | 41.8 | 6.24 | 1112 | 515 | 515 | 82 | 32.4 |
| 3 | 3 | 52 | 51.6 | 6.49 | 1112 | 515 | 515 | 82 | 35.8 |
| 4 | 4 | 62 | 61.5 | 6.46 | 1112 | 528 | 528 | 56 | 39.1 |
| 5 | 5 | 72 | 71.8 | 6.25 | 1112 | 519 | 519 | 74 | 42.2 |
| 6 | 6 | 82 | 81.7 | 5.24 | 1110 | 509 | 509 | 92 | 41.1 |
| 7 | 7 | 92 | 91.6 | 7.42 | 1110 | 509 | 509 | 92 | 40.7 |
| 8 | 8 | 102 | 101.9 | 9.39 | 1110 | 526 | 526 | 58 | 36.6 |
| 9 | 9 | 112 | 111.6 | 10.97 | 1110 | 530 | 530 | 50 | 29.5 |

## ビルドマッチアップ

| Pビルド | Eビルド | 戦闘 | Pスコア率 | 平均tick |
| --- | --- | ---: | ---: | ---: |
| charge | charge | 634 | 50.0% | 33.0 |
| charge | magic-sigil | 605 | 37.9% | 35.2 |
| charge | poison | 634 | 68.8% | 33.4 |
| charge | resonance | 605 | 47.9% | 37.5 |
| magic-sigil | charge | 605 | 62.1% | 35.2 |
| magic-sigil | magic-sigil | 606 | 50.0% | 35.9 |
| magic-sigil | poison | 647 | 72.6% | 33.8 |
| magic-sigil | resonance | 607 | 75.0% | 37.1 |
| poison | charge | 634 | 31.2% | 33.4 |
| poison | magic-sigil | 647 | 27.4% | 33.8 |
| poison | poison | 624 | 50.0% | 33.7 |
| poison | resonance | 644 | 33.2% | 36.2 |
| resonance | charge | 605 | 52.1% | 37.5 |
| resonance | magic-sigil | 607 | 25.0% | 37.1 |
| resonance | poison | 644 | 66.8% | 36.2 |
| resonance | resonance | 652 | 50.0% | 40.1 |

## 読み方と制約

- Generated builds spend their paid body-upgrade cost and skills within the average cumulative player coin budget for that run and use tier-adjusted rarity weights, but do not model individual shop choices, rerolls, locked offers, or fusion decisions.
- Per-skill damage is reported trace output before shield absorption and overkill; repair is capped effective healing.
- Poison tick damage is team-attributed rather than source-skill-attributed.
- Passive support is evaluated primarily through matched and counterfactual outcome lift rather than direct trace output.
- Generated builds are not an optimizer for strongest placements or multi-skill combo ceilings; multiplicative payoffs require deterministic high-synergy regression tests.
- Rarity-relative signals for topology-gated skills remain informational because generated heart layouts do not guarantee each loop, fully-connected, or straight-line condition.

補正勝率差は同じ run・ビルドの不採用盤面との差です。差替勝率差は同一接続形状・同レア・役割重複のノードを置換した差、無効化差は接続を維持したまま対象効果だけを止めた差です。どちらも同じ相手へ両陣営から戦わせています。
