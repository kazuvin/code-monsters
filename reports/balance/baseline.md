# Code Monsters バランスシミュレーション

- ゲームデータ: schema 17
- 固定シード: 20260721
- 対象ラン: 1, 2, 3, 4, 5, 6, 7, 8, 9
- 通常戦闘: 10000戦（陣営入替 5000組）
- 反実仮想ベンチマーク: 6080戦

## 全体集計

| プレイヤー勝率 | 敵勝率 | 引分率 | 陣営差 | 平均決着tick |
| ---: | ---: | ---: | ---: | ---: |
| 45.4% | 45.4% | 9.3% | 0.0% | 17.1 |

## 要確認スキル

現在の閾値で、複数指標または信頼区間を満たす外れ値はありません。

## 単独シグナル

| スキル | 補正勝率差 | 差替勝率差 | 無効化差 | 同レア差 | 出力Z | 無効化Z | シグナル |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 輪毒術 | 26.5% | — | 42.5% | 11.3% | -0.97 | 0.80 | matched-overrepresented |
| 破裂砲 | -21.0% | — | 10.0% | -21.3% | 0.41 | -1.03 | ablation-rarity-low |
| 封環結界 | -14.0% | — | 3.8% | -27.5% | -0.95 | -1.38 | matched-underrepresented |
| 放電弓 | -10.9% | — | 45.0% | 26.3% | 2.51 | 2.10 | matched-underrepresented, reported-output-high, ablation-impact-high, ablation-rarity-high |
| 蓄電装甲 | 8.7% | -7.5% | 25.0% | 6.3% | -0.45 | 0.28 | matched-overrepresented |
| 増幅術 | -8.4% | -5.0% | 6.3% | -12.5% | — | -1.43 | matched-underrepresented |
| 長路の牙 | 16.0% | 3.8% | 37.5% | 18.8% | 0.38 | 1.42 | matched-overrepresented |
| 防壁展開 | 2.9% | — | 47.5% | 16.3% | 1.53 | 1.08 | ablation-rarity-high |

## ビルド間警告

ビルド間スコア率は現在の閾値内です。

## スキル別集計

| ID | スキル | 配置 | レア | 登場 | 不採用 | 勝率 | 補正勝率差 | 発動/戦 | 報告ダメ/戦 | 毒付与/戦 | 防壁/戦 | 実回復/戦 | 差替N | 差替勝率差 | 無効化N | 無効化差 | 同レア差 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| overcharge-cannon | 超過解放砲 | free | legendary | 58 | 6576 | 65.5% | 28.1% | 3.34 | 17700.7 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 58.8% | 12.5% |
| venom-orbit | 輪毒術 | loop | epic | 2842 | 2752 | 70.4% | 26.5% | 6.18 | 0.0 | 1846.8 | 0.0 | 0.0 | 0 | — | 40 | 42.5% | 11.3% |
| rupture-stake | 破裂砲 | free | epic | 10012 | 42 | 44.4% | -21.0% | 4.59 | 7536.9 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 10.0% | -21.3% |
| toxic-reservoir | 毒電池 | free | epic | 930 | 11274 | 59.8% | 16.5% | 7.12 | 0.0 | 644.1 | 1773.8 | 0.0 | 0 | — | 40 | 20.0% | -11.3% |
| venom-bloom | 猛毒花 | free | legendary | 42 | 4430 | 76.2% | 15.2% | 5.19 | 0.0 | 3857.9 | 0.0 | 0.0 | 0 | — | 40 | 46.3% | 0.0% |
| sealed-junction | 封環結界 | fully-connected | epic | 7206 | 6120 | 41.5% | -14.0% | 9.90 | 0.0 | 0.0 | 3118.2 | 0.0 | 0 | — | 40 | 3.8% | -27.5% |
| discharge-bow | 放電弓 | free | rare | 8774 | 1172 | 46.4% | -10.9% | 6.12 | 9937.7 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 45.0% | 26.3% |
| rail-cannon | 解放砲 | free | epic | 540 | 7192 | 45.9% | 9.1% | 7.26 | 15440.8 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 46.3% | 15.0% |
| barrier | 障壁 | free | common | 19578 | 422 | 45.2% | -8.1% | 17.89 | 0.0 | 0.0 | 3597.2 | 0.0 | 0 | — | 40 | 12.5% | -2.5% |
| charge-guard | 蓄電装甲 | free | rare | 1236 | 7636 | 49.7% | 8.7% | 12.13 | 0.0 | 0.0 | 3112.1 | 0.0 | 40 | -7.5% | 40 | 25.0% | 6.3% |
| repair | 修復 | free | rare | 2570 | 15206 | 42.7% | -4.2% | 7.45 | 0.0 | 0.0 | 0.0 | 1918.7 | 40 | -7.5% | 40 | 18.8% | 0.0% |
| return-coil | 帰還コイル | loop | rare | 1862 | 13704 | 51.9% | 4.3% | 12.02 | 0.0 | 0.0 | 4210.2 | 0.0 | 40 | -6.3% | 40 | 26.3% | 7.5% |
| charge-line-lance | 雷路槍 | straight-line | legendary | 1052 | 4458 | 32.1% | -6.2% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 5.0% | -41.3% |
| accelerator | 加速術 | fully-connected | rare | 9710 | 5856 | 49.6% | 4.4% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | 5.0% | 40 | 26.3% | 7.5% |
| amplifier | 増幅術 | free | rare | 5528 | 8898 | 42.9% | -8.4% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | -5.0% | 40 | 6.3% | -12.5% |
| arc-shot | アーク弾 | free | rare | 11972 | 5804 | 47.5% | 2.7% | 14.21 | 3720.3 | 0.0 | 0.0 | 0.0 | 40 | -5.0% | 40 | 13.8% | -5.0% |
| charge-blade | 充電刃 | free | common | 7240 | 2706 | 45.9% | 1.6% | 14.05 | 1302.3 | 0.0 | 0.0 | 0.0 | 40 | -3.8% | 40 | 18.8% | 3.8% |
| charge-coil | 充電コイル | free | rare | 3096 | 5776 | 39.3% | -0.8% | 0.00 | 0.0 | 0.0 | 0.0 | 0.0 | 40 | 3.8% | 40 | 12.5% | -6.3% |
| long-route-fang | 長路の牙 | straight-line | rare | 1858 | 13708 | 60.1% | 16.0% | 9.84 | 6287.7 | 0.0 | 0.0 | 0.0 | 40 | 3.8% | 40 | 37.5% | 18.8% |
| charge-bastion | 防壁展開 | free | epic | 574 | 7158 | 41.8% | 2.9% | 11.85 | 0.0 | 0.0 | 27856.3 | 4547.2 | 0 | — | 40 | 47.5% | 16.3% |
| cultivation-blade | 培養刃 | free | rare | 702 | 5992 | 57.8% | 2.4% | 9.34 | 2052.9 | 0.0 | 0.0 | 0.0 | 40 | -2.5% | 40 | 15.0% | -3.8% |
| status-relay | 異常伝送 | free | rare | 5650 | 8776 | 46.0% | -3.5% | 13.23 | 1306.6 | 0.0 | 0.0 | 0.0 | 40 | 2.5% | 40 | 15.0% | -3.8% |
| breaker | 破砕撃 | free | common | 10702 | 9298 | 46.0% | 0.7% | 11.06 | 1968.0 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 10.0% | -5.0% |
| charge-arrow | 充電矢 | free | common | 9946 | 0 | 46.2% | — | 17.46 | 1560.5 | 0.0 | 0.0 | 0.0 | 0 | — | 40 | 26.3% | 11.3% |
| poison-needle | 毒矢 | free | common | 10054 | 0 | 44.5% | — | 16.13 | 918.9 | 1368.4 | 0.0 | 0.0 | 0 | — | 40 | 17.5% | 2.5% |
| strike | 斬撃 | free | common | 16238 | 2612 | 46.9% | 2.6% | 28.64 | 2279.8 | 0.0 | 0.0 | 0.0 | 40 | 0.0% | 40 | 11.3% | -3.8% |

## ラン別集計

| Run | Lv | 予算 | 平均使用額 | 平均ノード | 戦闘 | P勝 | E勝 | 引分 | 平均tick |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 32 | 31.8 | 5.48 | 1112 | 410 | 410 | 292 | 12.5 |
| 2 | 2 | 42 | 41.5 | 7.51 | 1112 | 470 | 470 | 172 | 11.8 |
| 3 | 3 | 52 | 51.5 | 9.00 | 1112 | 465 | 465 | 182 | 15.0 |
| 4 | 4 | 62 | 60.9 | 10.00 | 1112 | 527 | 527 | 58 | 16.0 |
| 5 | 5 | 72 | 70.8 | 11.00 | 1112 | 536 | 536 | 40 | 19.3 |
| 6 | 6 | 82 | 80.7 | 12.00 | 1110 | 536 | 536 | 38 | 19.6 |
| 7 | 7 | 92 | 90.4 | 13.00 | 1110 | 532 | 532 | 46 | 20.2 |
| 8 | 8 | 102 | 99.8 | 14.00 | 1110 | 531 | 531 | 48 | 20.1 |
| 9 | 9 | 112 | 109.6 | 15.00 | 1110 | 529 | 529 | 52 | 18.9 |

## ビルドマッチアップ

| Pビルド | Eビルド | 戦闘 | Pスコア率 | 平均tick |
| --- | --- | ---: | ---: | ---: |
| charge | charge | 2472 | 50.0% | 20.0 |
| charge | poison | 2501 | 50.5% | 15.8 |
| poison | charge | 2501 | 49.5% | 15.8 |
| poison | poison | 2526 | 50.0% | 16.7 |

## 読み方と制約

- Generated builds spend no more than the average cumulative player coin budget for that run and use level-adjusted rarity weights, but do not model individual shop choices, rerolls, locked offers, or fusion decisions.
- Per-skill damage is reported trace output before shield absorption and overkill; repair is capped effective healing.
- Poison tick damage is team-attributed rather than source-skill-attributed.
- Passive support is evaluated primarily through matched and counterfactual outcome lift rather than direct trace output.
- Generated builds are not an optimizer for strongest placements or multi-skill combo ceilings; multiplicative payoffs require deterministic high-synergy regression tests.
- Rarity-relative signals for topology-gated skills remain informational because the fixed generator does not guarantee each loop, fully-connected, or straight-line condition.

補正勝率差は同じ run・ビルドの不採用盤面との差です。差替勝率差は同一接続形状・同レア・役割重複のノードを置換した差、無効化差は接続を維持したまま対象効果だけを止めた差です。どちらも同じ相手へ両陣営から戦わせています。
