# Code Monsters バランスシミュレーション

- ゲームデータ: schema 25
- 固定シード: 20260721
- 対象ラン: 1, 2, 3, 4, 5, 6, 7, 8, 9
- 通常戦闘: 10000戦（陣営入替 5000組）
- 反実仮想ベンチマーク: 11680戦

## 全体集計

| プレイヤー勝率 | 敵勝率 | 引分率 | 陣営差 | 平均決着tick |
| ---: | ---: | ---: | ---: | ---: |
| 47.1% | 47.1% | 5.7% | 0.0% | 26.1 |

## 要確認スキル

現在の閾値で、複数指標または信頼区間を満たす外れ値はありません。

## 単独シグナル

| スキル | 補正勝率差 | 差替勝率差 | 無効化差 | 同レア差 | 出力Z | 無効化Z | シグナル |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 輝叉術 | -39.1% | — | 66.3% | 38.8% | -0.50 | 2.09 | matched-underrepresented, ablation-impact-high |
| 枝光矢 | -30.9% | — | 20.0% | 0.0% | 1.65 | -0.14 | matched-underrepresented |
| 蝕響矢 | 27.1% | — | 70.0% | 42.5% | -1.52 | 2.31 | ablation-impact-high |
| 導光器 | -26.9% | — | 23.8% | 3.8% | 1.30 | 0.35 | matched-underrepresented |
| 架橋中枢 | 26.0% | — | 37.5% | -17.5% | 1.07 | -0.35 | ablation-rarity-low |
| 猛毒花 | 22.4% | — | 56.3% | 1.3% | -1.34 | 0.32 | matched-overrepresented |
| 導刻矢 | 17.6% | — | 31.3% | 11.3% | -0.87 | 1.32 | matched-overrepresented |
| 刻印碑 | 15.8% | — | 25.0% | 5.0% | -0.38 | 0.51 | matched-overrepresented |
| 残響矢 | 12.4% | — | 32.5% | 12.5% | 0.56 | 1.49 | matched-overrepresented |
| 調律碑 | 11.9% | — | 20.0% | 0.0% | 0.02 | -0.14 | matched-overrepresented |
| 充電コイル | -26.2% | -10.0% | 5.0% | -22.5% | — | -1.43 | ablation-rarity-low |
| 培養刃 | -8.6% | — | 57.5% | 30.0% | -0.30 | 1.59 | ablation-rarity-high |
| 障壁 | 8.6% | — | 21.3% | 1.3% | 0.28 | 0.02 | matched-overrepresented |
| 防壁展開 | -7.1% | — | 57.5% | 21.3% | -0.37 | 1.15 | ablation-rarity-high |
| 毒電池 | -6.6% | — | 5.0% | -31.3% | — | -1.55 | ablation-rarity-low |
| 配当修復機 | -25.0% | -6.3% | 23.8% | -3.8% | 2.01 | -0.35 | reported-output-high |
| 斬撃 | 24.7% | 3.8% | 17.5% | -2.5% | -1.48 | -0.47 | matched-overrepresented |
| 汎用防壁 | -3.4% | — | 20.0% | -16.3% | 1.79 | -0.78 | ablation-rarity-low |
| 破裂砲 | -1.5% | — | 13.8% | -22.5% | -0.58 | -1.10 | ablation-rarity-low |
| 放電弓 | 0.9% | — | 42.5% | 15.0% | 2.63 | 0.73 | reported-output-high |
| 毒矢 | — | — | 37.5% | 17.5% | -0.21 | 2.14 | ablation-impact-high, ablation-rarity-high |

## ビルド間警告

ビルド間スコア率は現在の閾値内です。

## スキル別集計

| ID | スキル | 配置 | レア | 登場 | 不採用 | 勝率 | 補正勝率差 | 発動/戦 | 報告ダメ/戦 | 毒付与/戦 | 防壁/戦 | 実回復/戦 | 差替N | 差替勝率差 | 無効化N | 無効化差 | 同レア差 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| venom-ray | 蝕光矢 | light-vein | rare | 136 | 4346 | 13.2% | -44.8% | 2.85 | 0.0 | 102.7 | 0.0 | 0.0 | 0 | — | 40 | 25.0% | -2.5% |
| radiant-fork | 輝叉術 | light-vein | rare | 1936 | 12490 | 19.2% | -39.1% | 0.57 | 0.0 | 0.0 | 85.8 | 0.0 | 0 | — | 40 | 66.3% | 38.8% |
| prism-arrow | 枝光矢 | light-vein | common | 6510 | 13490 | 27.0% | -30.9% | 14.10 | 2396.3 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 20.0% | 0.0% |
| venom-orbit | 輪毒術 | loop | epic | 12 | 1092 | 83.3% | 28.8% | 7.83 | 0.0 | 391.7 | 0.0 | 0.0 | 0 | — | 40 | 55.0% | 18.8% |
| venom-chorus | 蝕響矢 | resonance | rare | 310 | 5284 | 78.1% | 27.1% | 12.76 | 0.0 | 357.0 | 0.0 | 0.0 | 0 | — | 40 | 70.0% | 42.5% |
| light-guide | 導光器 | light-vein | common | 2572 | 12980 | 27.6% | -26.9% | 24.40 | 0.0 | 0.0 | 2583.8 | 1263.0 | 0 | — | 40 | 23.8% | 3.8% |
| bridge-core | 架橋中枢 | free | legendary | 72 | 1044 | 69.4% | 26.0% | 5.22 | 9719.4 | 0.0 | 5112.2 | 0.0 | 0 | — | 40 | 37.5% | -17.5% |
| venom-bloom | 猛毒花 | free | legendary | 1086 | 2296 | 56.5% | 22.4% | 7.69 | 0.0 | 1100.4 | 0.0 | 0.0 | 0 | — | 40 | 56.3% | 1.3% |
| thunder-prism | 雷光器 | light-vein | rare | 192 | 6448 | 21.9% | -22.4% | 4.56 | 638.8 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 5.0% | -22.5% |
| charge-line-lance | 雷路槍 | straight-line | legendary | 8 | 1108 | 25.0% | -20.3% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 0.0% | -55.0% |
| charge-arrow | 充電矢 | free | common | 9264 | 682 | 47.0% | -18.6% | 20.49 | 1464.6 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 13.8% | -6.3% |
| guiding-bolt | 導刻矢 | magic-sigil | common | 6830 | 13170 | 58.7% | 17.6% | 18.49 | 1509.5 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 31.3% | 11.3% |
| return-coil | 帰還コイル | loop | rare | 366 | 12968 | 33.3% | -17.2% | 16.06 | 0.0 | 0.0 | 3261.7 | 0.0 | 0 | — | 40 | 31.3% | 3.8% |
| inscription-stone | 刻印碑 | magic-sigil | common | 4188 | 14662 | 60.3% | 15.8% | 20.37 | 0.0 | 0.0 | 2010.9 | 0.0 | 0 | — | 40 | 25.0% | 5.0% |
| long-route-fang | 長路の牙 | straight-line | rare | 370 | 11836 | 33.5% | -15.1% | 14.54 | 2813.9 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 35.0% | 7.5% |
| echo-arrow | 残響矢 | resonance | common | 6660 | 13340 | 55.0% | 12.4% | 19.06 | 2508.1 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 32.5% | 12.5% |
| convergence-sigil | 集束紋 | magic-sigil | epic | 18 | 1098 | 33.3% | -12.0% | 10.67 | 0.0 | 0.0 | 3840.0 | 0.0 | 0 | — | 40 | 42.5% | 6.3% |
| tuning-stone | 調律碑 | resonance | common | 1894 | 16956 | 57.6% | 11.9% | 16.39 | 0.0 | 0.0 | 1846.3 | 0.0 | 0 | — | 40 | 20.0% | 0.0% |
| charge-coil | 充電コイル | free | rare | 248 | 7484 | 21.8% | -26.2% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | -10.0% | 40 | 5.0% | -22.5% |
| amplifier | 増幅術 | free | rare | 538 | 13888 | 50.9% | 2.5% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | 8.8% | 40 | 15.0% | -12.5% |
| cultivation-blade | 培養刃 | free | rare | 164 | 6530 | 46.3% | -8.6% | 13.63 | 2375.4 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 57.5% | 30.0% |
| barrier | 障壁 | free | common | 18234 | 1766 | 48.3% | 8.6% | 23.02 | 0.0 | 0.0 | 2802.3 | 0.0 | 0 | — | 40 | 21.3% | 1.3% |
| arc-shot | アーク弾 | free | rare | 5632 | 8794 | 48.2% | -0.8% | 16.62 | 3719.0 | 0.0 | 0.0 | 0.0 | 40 | 7.5% | 40 | 41.3% | 13.8% |
| thunder-echo | 雷響器 | resonance | rare | 138 | 2114 | 53.6% | 7.4% | 13.17 | 1973.8 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 13.8% | -13.8% |
| charge-bastion | 防壁展開 | free | epic | 986 | 5654 | 40.8% | -7.1% | 12.51 | 0.0 | 0.0 | 9310.2 | 1991.7 | 0 | — | 40 | 57.5% | 21.3% |
| thunder-sigil | 雷紋 | magic-sigil | rare | 94 | 3260 | 40.4% | -7.1% | 14.89 | 1749.3 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 25.0% | -2.5% |
| sealed-junction | 封環結界 | fully-connected | epic | 504 | 7226 | 52.4% | 7.0% | 11.45 | 0.0 | 0.0 | 13147.1 | 0.0 | 0 | — | 40 | 2.5% | -33.8% |
| toxic-reservoir | 毒電池 | free | epic | 28 | 5514 | 35.7% | -6.6% | 10.07 | 0.0 | 161.1 | 352.5 | 0.0 | 0 | — | 40 | 5.0% | -31.3% |
| light-vein-blade | 光脈刃 | light-vein | common | 1426 | 17424 | 44.6% | -6.4% | 29.19 | 2169.3 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 23.8% | 3.8% |
| charge-guard | 蓄電装甲 | free | rare | 200 | 6440 | 39.0% | -6.3% | 16.71 | 0.0 | 0.0 | 2766.8 | 0.0 | 40 | 6.3% | 40 | 18.8% | -8.8% |
| repair-dividend | 配当修復機 | free | rare | 190 | 10932 | 26.3% | -25.0% | 6.82 | 0.0 | 0.0 | 1871.7 | 1199.2 | 40 | -6.3% | 40 | 23.8% | -3.8% |
| adaptive-arsenal | 汎用兵装 | free | epic | 310 | 7420 | 51.0% | 5.5% | 8.74 | 6771.1 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 32.5% | -3.8% |
| overcharge-cannon | 超過解放砲 | free | legendary | 320 | 2962 | 46.3% | 4.0% | 5.43 | 10526.2 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 55.0% | 0.0% |
| guardian-sigil | 守護紋 | magic-sigil | rare | 200 | 10846 | 46.0% | -3.8% | 10.73 | 0.0 | 0.0 | 1879.7 | 735.6 | 0 | — | 40 | 30.0% | 2.5% |
| strike | 斬撃 | free | common | 16676 | 2174 | 50.1% | 24.7% | 44.29 | 2666.1 | 0.0 | 0.0 | 0.0 | 40 | 3.8% | 40 | 17.5% | -2.5% |
| adaptive-bulwark | 汎用防壁 | free | epic | 344 | 6302 | 43.6% | -3.4% | 8.72 | 0.0 | 0.0 | 11557.4 | 0.0 | 0 | — | 40 | 20.0% | -16.3% |
| accelerator | 加速術 | fully-connected | rare | 1276 | 13150 | 50.5% | 3.3% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 37.5% | 10.0% |
| rail-cannon | 解放砲 | free | epic | 998 | 5642 | 48.5% | 3.0% | 9.19 | 7711.5 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 50.0% | 13.8% |
| twin-inscription | 双刻碑 | magic-sigil | rare | 500 | 8326 | 43.6% | -2.6% | 10.38 | 2486.3 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 35.0% | 7.5% |
| charge-blade | 充電刃 | free | common | 6020 | 3926 | 45.7% | -6.3% | 17.07 | 1395.7 | 0.0 | 0.0 | 0.0 | 40 | 2.5% | 40 | 20.0% | 0.0% |
| salvage-blade | 回収刃 | free | common | 3172 | 14594 | 45.1% | -1.8% | 8.64 | 1172.8 | 0.0 | 0.0 | 0.0 | 40 | -2.5% | 40 | 6.3% | -13.8% |
| breaker | 破砕撃 | free | common | 11796 | 7054 | 48.8% | 2.2% | 20.92 | 3484.4 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 16.3% | -3.8% |
| rupture-stake | 破裂砲 | free | epic | 9574 | 480 | 45.5% | -1.5% | 6.51 | 5619.0 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 13.8% | -22.5% |
| discharge-bow | 放電弓 | free | rare | 7642 | 2304 | 49.5% | 0.9% | 9.12 | 4779.0 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 42.5% | 15.0% |
| harmony-ward | 響護壁 | resonance | rare | 114 | 9898 | 47.4% | -0.8% | 14.21 | 0.0 | 0.0 | 2297.4 | 788.7 | 0 | — | 40 | 12.5% | -15.0% |
| all-sigil-resonance | 万象連環 | magic-sigil | legendary | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 55.0% | 0.0% |
| bounty-arrow | 賞金矢 | free | rare | 884 | 13542 | 35.5% | -13.7% | 6.15 | 2082.9 | 0.0 | 0.0 | 0.0 | 40 | 0.0% | 40 | 12.5% | -15.0% |
| branchlight-barrage | 枝光連弩 | light-vein | epic | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 30.0% | -6.3% |
| celestial-echo-cannon | 天響砲 | resonance | legendary | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 73.8% | 18.8% |
| convergence-cannon | 収光砲 | light-vein | epic | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 15.0% | -21.3% |
| deep-sigil-cannon | 深奥砲 | magic-sigil | legendary | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 0.0% | -55.0% |
| grand-harmony | 万象交響 | resonance | legendary | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 83.8% | 28.7% |
| harmonic-sanctuary | 交響結界 | resonance | epic | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 50.0% | 13.8% |
| myriad-light-array | 万条光陣 | light-vein | legendary | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 0 | — | — |
| poison-needle | 毒矢 | free | common | 10054 | 0 | 45.9% | — | 25.15 | 1892.7 | 738.7 | 0.0 | 0.0 | 0 | — | 40 | 37.5% | 17.5% |
| repair | 修復 | free | rare | 702 | 13724 | 37.6% | -13.4% | 11.10 | 0.0 | 0.0 | 0.0 | 2837.3 | 40 | 0.0% | 40 | 30.0% | 2.5% |
| resonance-cannon | 霊響砲 | resonance | epic | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 65.0% | 28.7% |
| resonance-circle | 連環陣 | magic-sigil | epic | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 52.5% | 16.3% |
| sigil-blade | 魔紋刃 | magic-sigil | common | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 16.3% | -3.8% |
| sigil-cannon | 紋章砲 | magic-sigil | epic | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 36.3% | 0.0% |
| solar-convergence | 天光収束砲 | light-vein | legendary | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 63.7% | 8.8% |
| spirit-blade | 霊響刃 | resonance | common | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 12.5% | -7.5% |
| status-relay | 異常伝送 | free | rare | 618 | 13808 | 44.7% | -5.4% | 14.42 | 1885.6 | 0.0 | 0.0 | 0.0 | 40 | 0.0% | 40 | 23.8% | -3.8% |

## ラン別集計

| Run | Lv | 予算 | 平均使用額 | 平均ノード | 戦闘 | P勝 | E勝 | 引分 | 平均tick |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 32 | 32.0 | 5.48 | 1112 | 493 | 493 | 126 | 17.8 |
| 2 | 2 | 46 | 46.0 | 7.51 | 1112 | 504 | 504 | 104 | 22.9 |
| 3 | 3 | 60 | 59.7 | 8.34 | 1112 | 525 | 525 | 62 | 22.7 |
| 4 | 4 | 74 | 73.7 | 9.03 | 1112 | 532 | 532 | 48 | 27.1 |
| 5 | 5 | 88 | 87.5 | 9.14 | 1112 | 537 | 537 | 38 | 29.1 |
| 6 | 6 | 102 | 101.5 | 9.11 | 1110 | 532 | 532 | 46 | 32.2 |
| 7 | 7 | 116 | 115.7 | 12.20 | 1110 | 530 | 530 | 50 | 29.5 |
| 8 | 8 | 130 | 129.8 | 14.00 | 1110 | 546 | 546 | 18 | 29.3 |
| 9 | 9 | 144 | 143.8 | 15.00 | 1110 | 516 | 516 | 78 | 24.6 |

## ビルドマッチアップ

| Pビルド | Eビルド | 戦闘 | Pスコア率 | 平均tick |
| --- | --- | ---: | ---: | ---: |
| charge | charge | 2472 | 50.0% | 29.5 |
| charge | poison | 2501 | 49.8% | 25.5 |
| poison | charge | 2501 | 50.2% | 25.5 |
| poison | poison | 2526 | 50.0% | 24.0 |

## 読み方と制約

- Generated builds spend their paid body-upgrade cost and skills within the average cumulative player coin budget for that run and use tier-adjusted rarity weights, but do not model individual shop choices, rerolls, locked offers, or fusion decisions.
- Coins earned by skill activations are reported by battles but are not reinvested into later simulated runs; their progression value is covered by the deterministic power formula.
- Per-skill damage is reported trace output before shield absorption and overkill; repair is capped effective healing.
- Poison tick damage is team-attributed rather than source-skill-attributed.
- Passive support is evaluated primarily through matched and counterfactual outcome lift rather than direct trace output.
- Generated builds are not an optimizer for strongest placements or multi-skill combo ceilings; multiplicative payoffs require deterministic high-synergy regression tests.
- Rarity-relative signals for topology-gated skills remain informational because generated heart layouts do not guarantee each loop, fully-connected, or straight-line condition.

補正勝率差は同じ run・ビルドの不採用盤面との差です。差替勝率差は同一接続形状・同レア・役割重複のノードを置換した差、無効化差は接続を維持したまま対象効果だけを止めた差です。どちらも同じ相手へ両陣営から戦わせています。
