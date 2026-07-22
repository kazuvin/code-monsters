# Code Monsters バランスシミュレーション

- ゲームデータ: schema 19
- 固定シード: 20260721
- 対象ラン: 1, 2, 3, 4, 5, 6, 7, 8, 9
- 通常戦闘: 10000戦（陣営入替 5000組）
- 反実仮想ベンチマーク: 8640戦

## 全体集計

| プレイヤー勝率 | 敵勝率 | 引分率 | 陣営差 | 平均決着tick |
| ---: | ---: | ---: | ---: | ---: |
| 48.0% | 48.0% | 3.9% | 0.0% | 24.9 |

## 要確認スキル

| スキル | レア | 登場 | 補正勝率差 | 差替勝率差 | 無効化差 | 同レア差 | 出力Z | 無効化Z | シグナル |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 輪毒術 | epic | 1926 | 24.6% | — | 60.0% | 36.3% | -0.92 | 2.01 | matched-overrepresented, ablation-impact-high |
| 充電刃 | common | 4712 | -5.0% | -11.3% | 13.8% | -6.3% | -0.63 | -1.04 | counterfactual-underpowered |
| 長路の牙 | rare | 1840 | 5.7% | 10.0% | 18.8% | 3.1% | 0.57 | 0.21 | counterfactual-overpowered |
| 加速術 | rare | 9528 | 14.6% | 7.5% | 36.3% | 20.6% | — | 2.22 | matched-overrepresented, ablation-impact-high |

## 単独シグナル

| スキル | 補正勝率差 | 差替勝率差 | 無効化差 | 同レア差 | 出力Z | 無効化Z | シグナル |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 連環陣 | 29.1% | — | 48.8% | 25.0% | -0.99 | 1.34 | matched-overrepresented |
| 紋章砲 | -24.7% | — | 25.0% | 1.3% | 0.14 | -0.08 | matched-underrepresented |
| 封環結界 | -12.1% | — | 3.8% | -20.0% | -0.43 | -1.35 | matched-underrepresented |
| 破裂砲 | -9.4% | — | 22.5% | -1.3% | 2.02 | -0.23 | reported-output-high |
| 雷路槍 | -8.0% | — | 10.0% | -27.5% | — | -0.91 | matched-underrepresented |
| 障壁 | -7.7% | — | 18.8% | -1.3% | 2.25 | -0.21 | reported-output-high |
| 放電弓 | -7.6% | — | 22.5% | 6.9% | 2.72 | 0.64 | reported-output-high |
| 双刻碑 | -13.9% | -6.3% | 28.7% | 13.1% | 0.03 | 1.36 | matched-underrepresented |

## ビルド間警告

| Pビルド | Eビルド | 戦闘 | Pスコア率 | 50%との差 |
| --- | --- | ---: | ---: | ---: |
| charge | magic-sigil | 1071 | 36.2% | -13.8% |
| magic-sigil | charge | 1071 | 63.8% | 13.8% |

## スキル別集計

| ID | スキル | 配置 | レア | 登場 | 不採用 | 勝率 | 補正勝率差 | 発動/戦 | 報告ダメ/戦 | 毒付与/戦 | 防壁/戦 | 実回復/戦 | 差替N | 差替勝率差 | 無効化N | 無効化差 | 同レア差 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| venom-orbit | 輪毒術 | loop | epic | 1926 | 1920 | 72.8% | 24.6% | 6.29 | 0.0 | 1307.5 | 0.0 | 0.0 | 0 | — | 40 | 60.0% | 36.3% |
| charge-blade | 充電刃 | free | common | 4712 | 1774 | 39.2% | -5.0% | 19.50 | 2061.5 | 0.0 | 0.0 | 0.0 | 40 | -11.3% | 40 | 13.8% | -6.3% |
| long-route-fang | 長路の牙 | straight-line | rare | 1840 | 14436 | 54.2% | 5.7% | 12.94 | 4462.3 | 0.0 | 0.0 | 0.0 | 40 | 10.0% | 40 | 18.8% | 3.1% |
| accelerator | 加速術 | fully-connected | rare | 9528 | 6748 | 54.6% | 14.6% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | 7.5% | 40 | 36.3% | 20.6% |
| deep-sigil-cannon | 深奥砲 | magic-sigil | legendary | 128 | 3540 | 14.1% | -39.3% | 0.30 | 770.4 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 0.0% | -37.5% |
| resonance-circle | 連環陣 | magic-sigil | epic | 4628 | 2068 | 63.0% | 29.1% | 8.63 | 0.0 | 1560.6 | 0.0 | 0.0 | 0 | — | 40 | 48.8% | 25.0% |
| sigil-cannon | 紋章砲 | magic-sigil | epic | 1846 | 4850 | 36.4% | -24.7% | 10.10 | 6277.9 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 25.0% | 1.3% |
| arc-shot | アーク弾 | free | rare | 7876 | 3926 | 46.4% | 0.4% | 17.10 | 5027.3 | 0.0 | 0.0 | 0.0 | 40 | -15.0% | 40 | 13.8% | -1.9% |
| sealed-junction | 封環結界 | fully-connected | epic | 7032 | 6298 | 42.9% | -12.1% | 11.83 | 0.0 | 0.0 | 4706.9 | 0.0 | 0 | — | 40 | 3.8% | -20.0% |
| charge-bastion | 防壁展開 | free | epic | 346 | 4718 | 45.1% | 11.1% | 10.92 | 0.0 | 0.0 | 8076.3 | 1758.5 | 0 | — | 40 | 27.5% | 3.8% |
| charge-coil | 充電コイル | free | rare | 1858 | 3880 | 32.3% | -5.9% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | -10.0% | 40 | 0.0% | -15.6% |
| overcharge-cannon | 超過解放砲 | free | legendary | 36 | 2120 | 44.4% | 9.6% | 5.50 | 11606.4 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 37.5% | 0.0% |
| rupture-stake | 破裂砲 | free | epic | 6784 | 34 | 46.8% | -9.4% | 6.21 | 8397.7 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 22.5% | -1.3% |
| all-sigil-resonance | 万象連環 | magic-sigil | legendary | 94 | 3574 | 59.6% | 8.7% | 6.66 | 17270.9 | 0.0 | 7362.3 | 0.0 | 0 | — | 40 | 37.5% | 0.0% |
| charge-line-lance | 雷路槍 | straight-line | legendary | 618 | 2972 | 28.8% | -8.0% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 10.0% | -27.5% |
| barrier | 障壁 | free | common | 19302 | 698 | 47.9% | -7.7% | 25.12 | 0.0 | 0.0 | 6327.2 | 0.0 | 0 | — | 40 | 18.8% | -1.3% |
| discharge-bow | 放電弓 | free | rare | 5830 | 656 | 42.3% | -7.6% | 9.10 | 5175.2 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 22.5% | 6.9% |
| charge-guard | 蓄電装甲 | free | rare | 708 | 5030 | 41.5% | 4.7% | 16.14 | 0.0 | 0.0 | 3696.7 | 0.0 | 40 | -7.5% | 40 | 18.8% | 3.1% |
| twin-inscription | 双刻碑 | free | rare | 3932 | 2042 | 53.4% | -13.9% | 13.82 | 3986.2 | 0.0 | 0.0 | 0.0 | 40 | -6.3% | 40 | 28.7% | 13.1% |
| rail-cannon | 解放砲 | free | epic | 274 | 4790 | 40.1% | 6.2% | 8.96 | 8013.3 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 23.8% | 0.0% |
| sigil-blade | 魔紋刃 | magic-sigil | common | 3222 | 2752 | 51.0% | -5.9% | 17.55 | 2517.1 | 0.0 | 0.0 | 0.0 | 40 | -5.0% | 40 | 20.0% | 0.0% |
| strike | 斬撃 | free | common | 14954 | 3570 | 48.7% | 2.4% | 37.63 | 3610.3 | 0.0 | 0.0 | 0.0 | 40 | -5.0% | 40 | 12.5% | -7.5% |
| thunder-sigil | 雷紋 | free | rare | 3874 | 6360 | 45.3% | 0.6% | 16.04 | 2563.5 | 0.0 | 0.0 | 0.0 | 40 | -5.0% | 40 | 12.5% | -3.1% |
| convergence-sigil | 集束紋 | free | epic | 574 | 3846 | 56.1% | 4.1% | 9.36 | 0.0 | 0.0 | 3793.2 | 0.0 | 0 | — | 40 | 12.5% | -11.3% |
| toxic-reservoir | 毒電池 | free | epic | 618 | 7514 | 41.4% | -3.1% | 8.34 | 0.0 | 442.6 | 610.1 | 0.0 | 0 | — | 40 | 13.8% | -10.0% |
| breaker | 破砕撃 | free | common | 9364 | 10636 | 49.6% | 2.5% | 14.33 | 2808.3 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 11.3% | -8.8% |
| amplifier | 増幅術 | free | rare | 5040 | 9758 | 50.0% | 0.5% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | -2.5% | 40 | 12.5% | -3.1% |
| repair | 修復 | free | rare | 2648 | 15128 | 45.5% | -4.2% | 9.77 | 0.0 | 0.0 | 0.0 | 2542.2 | 40 | -2.5% | 40 | 6.3% | -9.4% |
| return-coil | 帰還コイル | loop | rare | 1902 | 14374 | 52.4% | 3.9% | 15.16 | 0.0 | 0.0 | 4392.0 | 0.0 | 40 | 2.5% | 40 | 22.5% | 6.9% |
| status-relay | 異常伝送 | free | rare | 3508 | 6120 | 46.7% | -3.3% | 15.15 | 2667.8 | 0.0 | 0.0 | 0.0 | 40 | 2.5% | 40 | 17.5% | 1.9% |
| venom-bloom | 猛毒花 | free | legendary | 34 | 3034 | 64.7% | 1.7% | 5.65 | 0.0 | 2125.6 | 0.0 | 0.0 | 0 | — | 40 | 43.8% | 6.3% |
| cultivation-blade | 培養刃 | free | rare | 490 | 4074 | 62.0% | 2.6% | 10.68 | 2406.6 | 0.0 | 0.0 | 0.0 | 40 | -1.3% | 40 | 13.8% | -1.9% |
| guardian-sigil | 守護紋 | magic-sigil | rare | 802 | 5172 | 54.1% | -1.1% | 10.07 | 0.0 | 0.0 | 2179.0 | 894.9 | 40 | -1.3% | 40 | 13.8% | -1.9% |
| inscription-stone | 刻印碑 | free | common | 4546 | 1428 | 56.0% | 7.5% | 19.91 | 0.0 | 0.0 | 2552.3 | 0.0 | 40 | -1.3% | 40 | 28.7% | 8.8% |
| charge-arrow | 充電矢 | free | common | 6486 | 0 | 42.4% | — | 25.00 | 3037.4 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 25.0% | 5.0% |
| guiding-bolt | 導刻矢 | free | common | 6696 | 0 | 54.7% | — | 24.94 | 2876.4 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 26.3% | 6.3% |
| poison-needle | 毒矢 | free | common | 6818 | 0 | 46.9% | — | 21.71 | 1042.7 | 740.7 | 0.0 | 0.0 | 0 | — | 40 | 23.8% | 3.8% |

## ラン別集計

| Run | Lv | 予算 | 平均使用額 | 平均ノード | 戦闘 | P勝 | E勝 | 引分 | 平均tick |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 32 | 31.8 | 5.34 | 1112 | 501 | 501 | 110 | 28.8 |
| 2 | 2 | 42 | 41.4 | 7.30 | 1112 | 511 | 511 | 90 | 30.2 |
| 3 | 3 | 52 | 51.6 | 9.00 | 1112 | 509 | 509 | 94 | 25.5 |
| 4 | 4 | 62 | 61.1 | 10.00 | 1112 | 544 | 544 | 24 | 23.5 |
| 5 | 5 | 72 | 70.6 | 10.67 | 1112 | 549 | 549 | 14 | 23.4 |
| 6 | 6 | 82 | 80.9 | 12.00 | 1110 | 545 | 545 | 20 | 23.1 |
| 7 | 7 | 92 | 90.1 | 13.00 | 1110 | 543 | 543 | 24 | 22.8 |
| 8 | 8 | 102 | 99.9 | 14.00 | 1110 | 550 | 550 | 10 | 23.9 |
| 9 | 9 | 112 | 109.1 | 15.00 | 1110 | 552 | 552 | 6 | 23.3 |

## ビルドマッチアップ

| Pビルド | Eビルド | 戦闘 | Pスコア率 | 平均tick |
| --- | --- | ---: | ---: | ---: |
| charge | charge | 1024 | 50.0% | 28.4 |
| charge | magic-sigil | 1071 | 36.2% | 27.1 |
| charge | poison | 1148 | 45.1% | 23.4 |
| magic-sigil | charge | 1071 | 63.8% | 27.1 |
| magic-sigil | magic-sigil | 1148 | 50.0% | 26.9 |
| magic-sigil | poison | 1129 | 55.7% | 23.9 |
| poison | charge | 1148 | 54.9% | 23.4 |
| poison | magic-sigil | 1129 | 44.3% | 23.9 |
| poison | poison | 1132 | 50.0% | 20.8 |

## 読み方と制約

- Generated builds spend no more than the average cumulative player coin budget for that run and use level-adjusted rarity weights, but do not model individual shop choices, rerolls, locked offers, or fusion decisions.
- Per-skill damage is reported trace output before shield absorption and overkill; repair is capped effective healing.
- Poison tick damage is team-attributed rather than source-skill-attributed.
- Passive support is evaluated primarily through matched and counterfactual outcome lift rather than direct trace output.
- Generated builds are not an optimizer for strongest placements or multi-skill combo ceilings; multiplicative payoffs require deterministic high-synergy regression tests.
- Rarity-relative signals for topology-gated skills remain informational because the fixed generator does not guarantee each loop, fully-connected, or straight-line condition.

補正勝率差は同じ run・ビルドの不採用盤面との差です。差替勝率差は同一接続形状・同レア・役割重複のノードを置換した差、無効化差は接続を維持したまま対象効果だけを止めた差です。どちらも同じ相手へ両陣営から戦わせています。
