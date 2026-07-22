# Code Monsters バランスシミュレーション

- ゲームデータ: schema 23
- 固定シード: 20260721
- 対象ラン: 1, 2, 3, 4, 5, 6, 7, 8, 9
- 通常戦闘: 10000戦（陣営入替 5000組）
- 反実仮想ベンチマーク: 10704戦

## 全体集計

| プレイヤー勝率 | 敵勝率 | 引分率 | 陣営差 | 平均決着tick |
| ---: | ---: | ---: | ---: | ---: |
| 46.9% | 46.9% | 6.1% | 0.0% | 28.8 |

## 要確認スキル

| スキル | レア | 登場 | 補正勝率差 | 差替勝率差 | 無効化差 | 同レア差 | 出力Z | 無効化Z | シグナル |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| アーク弾 | rare | 6012 | -6.0% | 17.5% | 51.2% | 31.3% | 0.57 | 1.58 | counterfactual-overpowered, ablation-rarity-high |
| 加速術 | rare | 2154 | 17.4% | — | 66.3% | 46.3% | — | 2.51 | matched-overrepresented, ablation-impact-high |
| 賞金矢 | rare | 1582 | -16.5% | -15.0% | 10.0% | -10.0% | 1.27 | -0.96 | matched-underrepresented, counterfactual-underpowered |
| 増幅術 | rare | 620 | 2.6% | 13.8% | 27.5% | 7.5% | — | 0.12 | counterfactual-overpowered |
| 双刻碑 | rare | 1352 | 0.8% | 11.3% | 40.0% | 20.0% | 0.11 | 0.89 | counterfactual-overpowered, ablation-rarity-high |
| 回収刃 | common | 5688 | -13.8% | -6.3% | 6.3% | -26.3% | 0.27 | -1.29 | matched-underrepresented, ablation-rarity-low |

## 単独シグナル

| スキル | 補正勝率差 | 差替勝率差 | 無効化差 | 同レア差 | 出力Z | 無効化Z | シグナル |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 集束紋 | 38.9% | — | 22.5% | -23.8% | — | -1.02 | ablation-rarity-low |
| 連環陣 | 31.6% | — | 67.5% | 21.3% | -1.72 | 1.48 | matched-overrepresented |
| 天響砲 | 31.1% | — | 75.0% | 21.3% | -1.13 | 0.97 | matched-overrepresented |
| 紋章砲 | -30.5% | — | 31.3% | -15.0% | -0.19 | -0.53 | matched-underrepresented |
| 万象交響 | 22.7% | — | 77.5% | 23.8% | -0.18 | 1.06 | matched-overrepresented |
| 交響結界 | -22.3% | — | 53.8% | 7.5% | -0.15 | 0.72 | matched-underrepresented |
| 封環結界 | -17.1% | — | 20.0% | -26.3% | -0.84 | -1.16 | matched-underrepresented |
| 汎用兵装 | 12.4% | — | 48.8% | 2.5% | 0.94 | 0.44 | matched-overrepresented |
| 響護壁 | 12.4% | — | 11.3% | -8.8% | -0.37 | -0.88 | matched-overrepresented |
| 充電刃 | -23.5% | -11.3% | 32.5% | 0.0% | -0.71 | 0.19 | matched-underrepresented |
| 雷響器 | -10.2% | — | 8.8% | -11.3% | -1.24 | -1.03 | matched-underrepresented |
| 障壁 | -8.3% | — | 45.0% | 12.5% | 2.03 | 0.89 | reported-output-high |
| 刻印碑 | 20.7% | 7.5% | 35.0% | 2.5% | 0.06 | 0.33 | matched-overrepresented |
| 配当修復機 | -4.8% | -2.8% | 17.5% | -2.5% | 2.26 | -0.49 | reported-output-high |
| 毒電池 | 1.9% | — | 18.8% | -27.5% | — | -1.23 | ablation-rarity-low |
| 導刻矢 | — | — | 48.8% | 16.3% | -0.51 | 1.10 | ablation-rarity-high |
| 毒矢 | — | — | 67.5% | 35.0% | -1.10 | 2.16 | ablation-impact-high, ablation-rarity-high |
| 破裂砲 | — | — | 12.5% | -33.8% | -0.14 | -1.58 | ablation-rarity-low |

## ビルド間警告

| Pビルド | Eビルド | 戦闘 | Pスコア率 | 50%との差 |
| --- | --- | ---: | ---: | ---: |
| charge | magic-sigil | 605 | 34.4% | -15.6% |
| charge | resonance | 605 | 41.3% | -8.7% |
| magic-sigil | charge | 605 | 65.6% | 15.6% |
| magic-sigil | poison | 647 | 73.3% | 23.3% |
| magic-sigil | resonance | 607 | 71.7% | 21.7% |
| poison | magic-sigil | 647 | 26.7% | -23.3% |
| poison | resonance | 644 | 36.3% | -13.7% |
| resonance | charge | 605 | 58.7% | 8.7% |
| resonance | magic-sigil | 607 | 28.3% | -21.7% |
| resonance | poison | 644 | 63.7% | 13.7% |

## スキル別集計

| ID | スキル | 配置 | レア | 登場 | 不採用 | 勝率 | 補正勝率差 | 発動/戦 | 報告ダメ/戦 | 毒付与/戦 | 防壁/戦 | 実回復/戦 | 差替N | 差替勝率差 | 無効化N | 無効化差 | 同レア差 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| arc-shot | アーク弾 | free | rare | 6012 | 4616 | 39.9% | -6.0% | 17.98 | 5131.9 | 0.0 | 0.0 | 0.0 | 40 | 17.5% | 40 | 51.2% | 31.3% |
| accelerator | 加速術 | fully-connected | rare | 2154 | 10074 | 63.7% | 17.4% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 66.3% | 46.3% |
| bounty-arrow | 賞金矢 | free | rare | 1582 | 10646 | 34.8% | -16.5% | 6.03 | 2147.8 | 0.0 | 0.0 | 0.0 | 40 | -15.0% | 40 | 10.0% | -10.0% |
| amplifier | 増幅術 | free | rare | 620 | 10466 | 49.4% | 2.6% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | 13.8% | 40 | 27.5% | 7.5% |
| twin-inscription | 双刻碑 | free | rare | 1352 | 2512 | 63.5% | 0.8% | 9.62 | 2313.1 | 0.0 | 0.0 | 0.0 | 40 | 11.3% | 40 | 40.0% | 20.0% |
| salvage-blade | 回収刃 | free | common | 5688 | 12680 | 40.7% | -13.8% | 9.30 | 1068.2 | 0.0 | 0.0 | 0.0 | 40 | -6.3% | 40 | 6.3% | -26.3% |
| convergence-sigil | 集束紋 | free | epic | 2 | 542 | 100.0% | 38.9% | 6.00 | 0.0 | 0.0 | 2160.0 | 0.0 | 0 | — | 40 | 22.5% | -23.8% |
| deep-sigil-cannon | 深奥砲 | magic-sigil | legendary | 2 | 542 | 100.0% | 38.9% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 0.0% | -53.8% |
| resonance-circle | 連環陣 | magic-sigil | epic | 4128 | 802 | 67.0% | 31.6% | 9.59 | 0.0 | 1264.4 | 0.0 | 0.0 | 0 | — | 40 | 67.5% | 21.3% |
| celestial-echo-cannon | 天響砲 | resonance | legendary | 414 | 2918 | 75.8% | 31.1% | 5.15 | 12178.6 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 75.0% | 21.3% |
| sigil-cannon | 紋章砲 | magic-sigil | epic | 800 | 4130 | 38.3% | -30.5% | 10.18 | 5951.6 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 31.3% | -15.0% |
| venom-orbit | 輪毒術 | loop | epic | 16 | 556 | 75.0% | 28.8% | 6.75 | 0.0 | 437.5 | 0.0 | 0.0 | 0 | — | 40 | 70.0% | 23.8% |
| grand-harmony | 万象交響 | resonance | legendary | 88 | 484 | 70.5% | 22.7% | 6.45 | 11203.6 | 0.0 | 5601.8 | 0.0 | 0 | — | 40 | 77.5% | 23.8% |
| harmonic-sanctuary | 交響結界 | resonance | epic | 3084 | 1932 | 39.5% | -22.3% | 12.63 | 0.0 | 0.0 | 5994.7 | 1512.6 | 0 | — | 40 | 53.8% | 7.5% |
| bridge-core | 架橋中枢 | free | legendary | 164 | 2050 | 64.6% | 20.5% | 4.80 | 9365.7 | 0.0 | 4931.6 | 0.0 | 0 | — | 40 | 50.0% | -3.8% |
| charge-line-lance | 雷路槍 | straight-line | legendary | 10 | 522 | 20.0% | -18.3% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 0.0% | -53.8% |
| sealed-junction | 封環結界 | fully-connected | epic | 828 | 4164 | 33.3% | -17.1% | 9.77 | 0.0 | 0.0 | 3839.0 | 0.0 | 0 | — | 40 | 20.0% | -26.3% |
| spirit-blade | 霊響刃 | resonance | common | 4810 | 206 | 46.3% | -17.0% | 57.73 | 3002.5 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 12.5% | -20.0% |
| adaptive-arsenal | 汎用兵装 | free | epic | 810 | 4182 | 57.5% | 12.4% | 7.66 | 7013.0 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 48.8% | 2.5% |
| harmony-ward | 響護壁 | resonance | rare | 456 | 4008 | 59.6% | 12.4% | 15.38 | 0.0 | 0.0 | 2289.8 | 663.3 | 0 | — | 40 | 11.3% | -8.8% |
| charge-blade | 充電刃 | free | common | 3342 | 1614 | 36.2% | -23.5% | 22.17 | 1760.7 | 0.0 | 0.0 | 0.0 | 40 | -11.3% | 40 | 32.5% | 0.0% |
| charge-coil | 充電コイル | free | rare | 248 | 3604 | 18.5% | -24.1% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | -11.3% | 40 | 6.3% | -13.8% |
| thunder-echo | 雷響器 | resonance | rare | 814 | 5778 | 40.8% | -10.2% | 14.72 | 1563.7 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 8.8% | -11.3% |
| status-relay | 異常伝送 | free | rare | 428 | 4588 | 34.6% | -6.8% | 13.46 | 2030.7 | 0.0 | 0.0 | 0.0 | 40 | -10.0% | 40 | 12.5% | -7.5% |
| barrier | 障壁 | free | common | 18704 | 744 | 46.5% | -8.3% | 27.15 | 0.0 | 0.0 | 4839.3 | 0.0 | 0 | — | 40 | 45.0% | 12.5% |
| inscription-stone | 刻印碑 | free | common | 2526 | 1882 | 67.8% | 20.7% | 17.65 | 0.0 | 0.0 | 1893.1 | 0.0 | 40 | 7.5% | 40 | 35.0% | 2.5% |
| breaker | 破砕撃 | free | common | 14584 | 4864 | 47.5% | 7.5% | 20.71 | 3581.8 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 33.8% | 1.3% |
| resonance-cannon | 霊響砲 | resonance | epic | 1430 | 3586 | 52.2% | 6.7% | 8.53 | 6136.7 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 48.8% | 2.5% |
| venom-chorus | 蝕響矢 | resonance | rare | 1838 | 4354 | 50.9% | 6.5% | 14.79 | 0.0 | 712.4 | 0.0 | 0.0 | 0 | — | 40 | 48.8% | 28.7% |
| guardian-sigil | 守護紋 | magic-sigil | rare | 276 | 3588 | 58.7% | -5.1% | 11.76 | 0.0 | 0.0 | 2075.6 | 807.8 | 0 | — | 40 | 15.0% | -5.0% |
| tuning-stone | 調律碑 | resonance | common | 3166 | 1850 | 48.2% | -5.1% | 19.74 | 0.0 | 0.0 | 1994.2 | 0.0 | 0 | — | 40 | 10.0% | -22.5% |
| cultivation-blade | 培養刃 | free | rare | 112 | 2174 | 39.3% | -4.9% | 11.00 | 2166.0 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 22.5% | 2.5% |
| thunder-sigil | 雷紋 | free | rare | 518 | 4376 | 54.1% | -3.5% | 15.36 | 1842.5 | 0.0 | 0.0 | 0.0 | 40 | -3.8% | 40 | 16.3% | -3.8% |
| repair-dividend | 配当修復機 | free | rare | 206 | 6430 | 45.6% | -4.8% | 6.19 | 0.0 | 0.0 | 1703.3 | 1111.1 | 36 | -2.8% | 40 | 17.5% | -2.5% |
| repair | 修復 | free | rare | 1384 | 13178 | 50.1% | -1.0% | 11.11 | 0.0 | 0.0 | 0.0 | 2892.7 | 40 | -2.5% | 40 | 28.7% | 8.8% |
| toxic-reservoir | 毒電池 | free | epic | 34 | 1070 | 41.2% | 1.9% | 8.59 | 0.0 | 355.0 | 528.2 | 0.0 | 0 | — | 40 | 18.8% | -27.5% |
| charge-guard | 蓄電装甲 | free | rare | 92 | 2108 | 37.0% | -4.5% | 15.02 | 0.0 | 0.0 | 2954.2 | 0.0 | 40 | 1.3% | 40 | 20.0% | 0.0% |
| strike | 斬撃 | free | common | 17782 | 1144 | 46.4% | -6.0% | 52.64 | 4045.2 | 0.0 | 0.0 | 0.0 | 40 | 1.3% | 40 | 21.3% | -11.3% |
| sigil-blade | 魔紋刃 | magic-sigil | common | 1130 | 3278 | 60.9% | 0.8% | 15.06 | 1631.3 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 3.8% | -28.7% |
| return-coil | 帰還コイル | loop | rare | 374 | 10220 | 48.7% | -0.7% | 14.35 | 0.0 | 0.0 | 2860.7 | 0.0 | 0 | — | 40 | 26.3% | 6.3% |
| long-route-fang | 長路の牙 | straight-line | rare | 392 | 10178 | 48.0% | -0.5% | 13.38 | 3476.7 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 41.3% | 21.3% |
| adaptive-bulwark | 汎用防壁 | free | epic | 462 | 3378 | 47.2% | -0.1% | 7.59 | 0.0 | 0.0 | 8922.3 | 0.0 | 0 | — | 40 | 37.5% | -8.8% |
| all-sigil-resonance | 万象連環 | magic-sigil | legendary | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 47.5% | -6.3% |
| charge-arrow | 充電矢 | free | common | 4956 | 0 | 43.3% | — | 22.89 | 2164.1 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 26.3% | -6.3% |
| charge-bastion | 防壁展開 | free | epic | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 46.3% | 0.0% |
| discharge-bow | 放電弓 | free | rare | 4956 | 0 | 43.3% | — | 9.65 | 3434.7 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 15.0% | -5.0% |
| echo-arrow | 残響矢 | resonance | common | 5016 | 0 | 46.7% | — | 30.85 | 3927.3 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 36.3% | 3.8% |
| guiding-bolt | 導刻矢 | free | common | 4930 | 0 | 62.3% | — | 26.82 | 2317.5 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 48.8% | 16.3% |
| overcharge-cannon | 超過解放砲 | free | legendary | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 57.5% | 3.8% |
| poison-needle | 毒矢 | free | common | 5098 | 0 | 35.8% | — | 22.29 | 876.7 | 575.5 | 0.0 | 0.0 | 0 | — | 40 | 67.5% | 35.0% |
| rail-cannon | 解放砲 | free | epic | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 53.8% | 7.5% |
| rupture-stake | 破裂砲 | free | epic | 5098 | 0 | 35.8% | — | 7.50 | 4495.8 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 12.5% | -33.8% |
| venom-bloom | 猛毒花 | free | legendary | 0 | 0 | — | — | — | — | — | — | — | 0 | — | 40 | 67.5% | 13.8% |

## ラン別集計

| Run | Lv | 予算 | 平均使用額 | 平均ノード | 戦闘 | P勝 | E勝 | 引分 | 平均tick |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 32 | 31.7 | 5.26 | 1112 | 500 | 500 | 112 | 23.4 |
| 2 | 2 | 46 | 45.9 | 7.17 | 1112 | 506 | 506 | 100 | 30.5 |
| 3 | 3 | 60 | 59.5 | 8.23 | 1112 | 522 | 522 | 68 | 27.6 |
| 4 | 4 | 74 | 73.7 | 9.14 | 1112 | 535 | 535 | 42 | 33.9 |
| 5 | 5 | 88 | 87.9 | 9.41 | 1112 | 514 | 514 | 84 | 35.0 |
| 6 | 6 | 102 | 101.9 | 9.43 | 1110 | 520 | 520 | 70 | 37.7 |
| 7 | 7 | 116 | 115.7 | 11.77 | 1110 | 527 | 527 | 56 | 26.0 |
| 8 | 8 | 130 | 129.7 | 13.51 | 1110 | 532 | 532 | 46 | 23.0 |
| 9 | 9 | 144 | 143.7 | 14.91 | 1110 | 537 | 537 | 36 | 22.4 |

## ビルドマッチアップ

| Pビルド | Eビルド | 戦闘 | Pスコア率 | 平均tick |
| --- | --- | ---: | ---: | ---: |
| charge | charge | 634 | 50.0% | 25.8 |
| charge | magic-sigil | 605 | 34.4% | 26.6 |
| charge | poison | 634 | 56.9% | 26.8 |
| charge | resonance | 605 | 41.3% | 31.5 |
| magic-sigil | charge | 605 | 65.6% | 26.6 |
| magic-sigil | magic-sigil | 606 | 50.0% | 28.2 |
| magic-sigil | poison | 647 | 73.3% | 27.3 |
| magic-sigil | resonance | 607 | 71.7% | 29.8 |
| poison | charge | 634 | 43.1% | 26.8 |
| poison | magic-sigil | 647 | 26.7% | 27.3 |
| poison | poison | 624 | 50.0% | 27.8 |
| poison | resonance | 644 | 36.3% | 30.8 |
| resonance | charge | 605 | 58.7% | 31.5 |
| resonance | magic-sigil | 607 | 28.3% | 29.8 |
| resonance | poison | 644 | 63.7% | 30.8 |
| resonance | resonance | 652 | 50.0% | 33.9 |

## 読み方と制約

- Generated builds spend their paid body-upgrade cost and skills within the average cumulative player coin budget for that run and use tier-adjusted rarity weights, but do not model individual shop choices, rerolls, locked offers, or fusion decisions.
- Coins earned by skill activations are reported by battles but are not reinvested into later simulated runs; their progression value is covered by the deterministic power formula.
- Per-skill damage is reported trace output before shield absorption and overkill; repair is capped effective healing.
- Poison tick damage is team-attributed rather than source-skill-attributed.
- Passive support is evaluated primarily through matched and counterfactual outcome lift rather than direct trace output.
- Generated builds are not an optimizer for strongest placements or multi-skill combo ceilings; multiplicative payoffs require deterministic high-synergy regression tests.
- Rarity-relative signals for topology-gated skills remain informational because generated heart layouts do not guarantee each loop, fully-connected, or straight-line condition.

補正勝率差は同じ run・ビルドの不採用盤面との差です。差替勝率差は同一接続形状・同レア・役割重複のノードを置換した差、無効化差は接続を維持したまま対象効果だけを止めた差です。どちらも同じ相手へ両陣営から戦わせています。
