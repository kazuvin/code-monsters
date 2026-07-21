# Code Monsters バランスシミュレーション

- ゲームデータ: schema 16
- 固定シード: 20260721
- 対象ラン: 1, 2, 3, 4, 5, 6, 7, 8, 9
- 通常戦闘: 10000戦（陣営入替 5000組）
- 反実仮想ベンチマーク: 6400戦

## 全体集計

| プレイヤー勝率 | 敵勝率 | 引分率 | 陣営差 | 平均決着tick |
| ---: | ---: | ---: | ---: | ---: |
| 45.4% | 45.4% | 9.3% | 0.0% | 17.4 |

## 要確認スキル

現在の閾値で、複数指標または信頼区間を満たす外れ値はありません。

## 単独シグナル

| スキル | 補正勝率差 | 差替勝率差 | 無効化差 | 同レア差 | 出力Z | 無効化Z | シグナル |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 輪毒術 | 25.8% | — | 38.8% | 10.0% | -0.96 | 0.72 | matched-overrepresented |
| 破裂砲 | -21.2% | — | 6.3% | -22.5% | 0.42 | -1.15 | ablation-rarity-low |
| 封環結界 | -12.3% | — | 3.8% | -25.0% | -0.95 | -1.29 | matched-underrepresented |
| 長路の牙 | 16.6% | 11.3% | 42.5% | 23.8% | 0.42 | 1.72 | matched-overrepresented |
| 放電弓 | -8.4% | — | 46.3% | 27.5% | 2.50 | 2.03 | matched-underrepresented, reported-output-high, ablation-impact-high, ablation-rarity-high |
| 解放砲 | 5.4% | -7.5% | 45.0% | 16.3% | 0.82 | 1.08 | ablation-rarity-high |
| 充電矢 | — | — | 31.3% | 18.1% | -0.88 | 1.91 | ablation-rarity-high |
| 防壁展開 | 3.7% | 0.0% | 45.0% | 16.3% | 1.58 | 1.08 | ablation-rarity-high |

## ビルド間警告

ビルド間スコア率は現在の閾値内です。

## スキル別集計

| ID | スキル | 配置 | レア | 登場 | 不採用 | 勝率 | 補正勝率差 | 発動/戦 | 報告ダメ/戦 | 毒付与/戦 | 防壁/戦 | 実回復/戦 | 差替N | 差替勝率差 | 無効化N | 無効化差 | 同レア差 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| venom-orbit | 輪毒術 | loop | epic | 2842 | 2752 | 70.2% | 25.8% | 6.27 | 0.0 | 1874.2 | 0.0 | 0.0 | 0 | — | 40 | 38.8% | 10.0% |
| charge-line-lance | 雷路槍 | straight-line | legendary | 106 | 6528 | 15.1% | -24.8% | 7.68 | 5159.6 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 18.8% | -20.0% |
| rupture-stake | 破裂砲 | free | epic | 10012 | 42 | 44.3% | -21.2% | 4.63 | 7685.1 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 6.3% | -22.5% |
| toxic-reservoir | 毒電池 | free | epic | 1052 | 11152 | 58.6% | 16.5% | 7.51 | 0.0 | 671.6 | 1867.6 | 0.0 | 0 | — | 40 | 18.8% | -10.0% |
| venom-bloom | 猛毒花 | free | legendary | 42 | 4430 | 76.2% | 15.1% | 5.19 | 0.0 | 3857.9 | 0.0 | 0.0 | 0 | — | 40 | 48.8% | 10.0% |
| sealed-junction | 封環結界 | fully-connected | epic | 7490 | 5836 | 41.8% | -12.3% | 10.33 | 0.0 | 0.0 | 3173.7 | 0.0 | 0 | — | 40 | 3.8% | -25.0% |
| long-route-fang | 長路の牙 | straight-line | rare | 2042 | 13524 | 59.1% | 16.6% | 10.38 | 6724.2 | 0.0 | 0.0 | 0.0 | 40 | 11.3% | 40 | 42.5% | 23.8% |
| discharge-bow | 放電弓 | free | rare | 8336 | 1610 | 47.5% | -8.4% | 6.17 | 9762.3 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 46.3% | 27.5% |
| rail-cannon | 解放砲 | free | epic | 682 | 7050 | 42.2% | 5.4% | 7.35 | 15103.4 | 0.0 | 0.0 | 0.0 | 40 | -7.5% | 40 | 45.0% | 16.3% |
| repair | 修復 | free | rare | 2692 | 15084 | 41.6% | -5.4% | 7.71 | 0.0 | 0.0 | 0.0 | 2000.0 | 40 | -7.5% | 40 | 11.3% | -7.5% |
| return-coil | 帰還コイル | loop | rare | 1942 | 13624 | 52.0% | 5.1% | 12.66 | 0.0 | 0.0 | 4515.9 | 0.0 | 40 | -7.5% | 40 | 25.0% | 6.3% |
| amplifier | 増幅術 | free | rare | 5766 | 8660 | 43.1% | -7.5% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | -6.3% | 40 | 6.3% | -12.5% |
| barrier | 障壁 | free | common | 19540 | 460 | 45.3% | -5.7% | 18.16 | 0.0 | 0.0 | 3666.1 | 0.0 | 0 | — | 40 | 8.8% | -4.4% |
| arc-shot | アーク弾 | free | rare | 12046 | 5730 | 47.2% | 1.6% | 14.81 | 3893.0 | 0.0 | 0.0 | 0.0 | 40 | -3.8% | 40 | 13.8% | -5.0% |
| cultivation-blade | 培養刃 | free | rare | 702 | 5992 | 59.8% | 4.0% | 9.70 | 2134.4 | 0.0 | 0.0 | 0.0 | 40 | -3.8% | 40 | 18.8% | 0.0% |
| charge-coil | 充電コイル | free | rare | 3252 | 5620 | 38.1% | -2.9% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | 2.5% | 40 | 12.5% | -6.3% |
| overcharge-cannon | 超過解放砲 | free | legendary | 68 | 5442 | 41.2% | 2.3% | 4.35 | 16311.9 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 38.8% | 0.0% |
| breaker | 破砕撃 | free | common | 10508 | 9492 | 46.4% | 1.3% | 11.16 | 1990.5 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 10.0% | -3.1% |
| charge-blade | 充電刃 | free | common | 7036 | 2910 | 46.2% | 1.4% | 14.30 | 1331.4 | 0.0 | 0.0 | 0.0 | 40 | -1.3% | 40 | 20.0% | 6.9% |
| charge-guard | 蓄電装甲 | free | rare | 1296 | 7576 | 48.1% | 7.1% | 13.06 | 0.0 | 0.0 | 3340.5 | 0.0 | 40 | 1.3% | 40 | 23.8% | 5.0% |
| status-relay | 異常伝送 | free | rare | 5800 | 8626 | 46.0% | -3.1% | 13.80 | 1375.6 | 0.0 | 0.0 | 0.0 | 40 | -1.3% | 40 | 15.0% | -3.8% |
| accelerator | 加速術 | fully-connected | rare | 9862 | 5704 | 49.5% | 4.6% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | 0.0% | 40 | 23.8% | 5.0% |
| charge-arrow | 充電矢 | free | common | 9946 | 0 | 46.3% | — | 18.18 | 1628.8 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 31.3% | 18.1% |
| charge-bastion | 防壁展開 | free | epic | 754 | 6978 | 41.9% | 3.7% | 11.97 | 0.0 | 0.0 | 29164.7 | 4555.9 | 40 | 0.0% | 40 | 45.0% | 16.3% |
| poison-needle | 毒矢 | free | common | 10054 | 0 | 44.5% | — | 16.28 | 926.2 | 1389.4 | 0.0 | 0.0 | 0 | — | 40 | 16.3% | 3.1% |
| strike | 斬撃 | free | common | 16022 | 2828 | 47.0% | -0.1% | 29.07 | 2326.0 | 0.0 | 0.0 | 0.0 | 40 | 0.0% | 40 | 8.8% | -4.4% |

## ラン別集計

| Run | Lv | 予算 | 平均使用額 | 平均ノード | 戦闘 | P勝 | E勝 | 引分 | 平均tick |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 32 | 31.8 | 5.48 | 1112 | 410 | 410 | 292 | 12.5 |
| 2 | 2 | 42 | 41.5 | 7.51 | 1112 | 470 | 470 | 172 | 11.8 |
| 3 | 3 | 52 | 51.5 | 9.00 | 1112 | 465 | 465 | 182 | 15.0 |
| 4 | 4 | 62 | 60.9 | 10.00 | 1112 | 527 | 527 | 58 | 16.0 |
| 5 | 5 | 72 | 70.8 | 11.00 | 1112 | 535 | 535 | 42 | 19.6 |
| 6 | 6 | 82 | 80.6 | 12.00 | 1110 | 531 | 531 | 48 | 19.6 |
| 7 | 7 | 92 | 90.1 | 13.00 | 1110 | 533 | 533 | 44 | 20.6 |
| 8 | 8 | 102 | 99.4 | 14.00 | 1110 | 533 | 533 | 44 | 21.3 |
| 9 | 9 | 112 | 108.8 | 15.00 | 1110 | 533 | 533 | 44 | 20.6 |

## ビルドマッチアップ

| Pビルド | Eビルド | 戦闘 | Pスコア率 | 平均tick |
| --- | --- | ---: | ---: | ---: |
| charge | charge | 2472 | 50.0% | 21.0 |
| charge | poison | 2501 | 50.6% | 16.1 |
| poison | charge | 2501 | 49.4% | 16.1 |
| poison | poison | 2526 | 50.0% | 16.7 |

## 読み方と制約

- Generated builds spend no more than the average cumulative player coin budget for that run and use level-adjusted rarity weights, but do not model individual shop choices, rerolls, locked offers, or fusion decisions.
- Per-skill damage is reported trace output before shield absorption and overkill; repair is capped effective healing.
- Poison tick damage is team-attributed rather than source-skill-attributed.
- Passive support is evaluated primarily through matched and counterfactual outcome lift rather than direct trace output.
- Generated builds are not an optimizer for strongest placements or multi-skill combo ceilings; multiplicative payoffs require deterministic high-synergy regression tests.
- Rarity-relative signals for topology-gated skills remain informational because the fixed generator does not guarantee each loop, fully-connected, or straight-line condition.

補正勝率差は同じ run・ビルドの不採用盤面との差です。差替勝率差は同一接続形状・同レア・役割重複のノードを置換した差、無効化差は接続を維持したまま対象効果だけを止めた差です。どちらも同じ相手へ両陣営から戦わせています。
