# ビルド・シナジーマトリクス

> `src/game/game.json` から生成します。直接編集しないでください。

## ビルド軸

| 軸 | 目的 | 値 |
| --- | --- | --- |
| 状態 | ノードがパケットへ生成する状態。回路演算子は状態を問わず再利用できる | 無属性（`neutral`）、攻撃（`damage`）、毒（`poison`）、チャージ（`charge`）、防御（`shield`）、回復（`repair`）、コイン（`coin`） |
| 出力 | 運ばれた状態を、戦闘でどの結果へ変えるかを示す | 攻撃（`attack`）、防御（`guard`）、回復（`repair`）、資金（`economy`）、回路演算（`operator`） |

## 回路コア

| 配置 | 分類 | 役割 |
| --- | --- | --- |
| 生成・変換 | 配置条件 | 状態をパケットへ加えるか、届いた状態を戦闘出力へ変換する |
| 再循環 | 配置条件 | 輪の中でパケット全体を1回だけ再通過させる |
| 合流 | 配置条件 | 同じ拍に別経路から届いたパケットを1つへまとめる |
| 中継複製 | 配置条件 | 長い直線の途中で、最後に追加された状態だけを1回複製する |
| 出力刻印 | 回路コア | 状態の種類を問わず、終端の出力先を攻撃・防御・回復へ書き換える |
| 状態複製 | 回路コア | 最後に追加された状態だけを1回複製し、再帰的な複製は止める |
| 分岐・合流 | 回路コア | 量を保存して複数経路へ分け、別経路のパケットを再び1つへまとめる |

## ノードの組み合わせ

| ノード | 状態 | 出力 | 回路演算 |
| --- | --- | --- | --- |
| `strike` | `damage` | `attack` | 生成・変換 |
| `breaker` | `damage` | `attack` | 生成・変換 |
| `arc-shot` | `damage` | `attack` | 生成・変換 |
| `barrier` | `shield` | `guard` | 生成・変換 |
| `repair` | `repair` | `repair` | 生成・変換 |
| `salvage-blade` | `damage`、`coin` | `attack`、`economy` | 生成・変換 |
| `bounty-arrow` | `damage`、`coin` | `attack`、`economy` | 生成・変換 |
| `repair-dividend` | `shield`、`repair`、`coin` | `guard`、`repair`、`economy` | 生成・変換 |
| `poison-needle` | `damage`、`poison` | `attack`、`operator` | 生成・変換 |
| `cultivation-blade` | `damage` | `attack`、`operator` | 生成・変換 |
| `toxic-reservoir` | `charge`、`poison`、`shield` | `attack`、`guard` | 生成・変換 |
| `venom-bloom` | `poison` | `attack` | 生成・変換 |
| `rupture-stake` | `poison` | `attack` | 生成・変換 |
| `status-relay` | `charge`、`damage` | `attack`、`operator` | 生成・変換 |
| `return-coil` | `shield` | `guard`、`operator` | 再循環 |
| `long-route-fang` | `damage` | `attack`、`operator` | 中継複製 |
| `amplifier` | `neutral` | `operator` | 生成・変換 |
| `accelerator` | `neutral` | `operator` | 合流 |
| `charge-guard` | `charge`、`shield` | `guard` | 生成・変換 |
| `charge-blade` | `charge`、`damage` | `attack` | 生成・変換 |
| `charge-arrow` | `charge`、`damage` | `attack` | 生成・変換 |
| `charge-coil` | `charge` | `operator` | 生成・変換 |
| `discharge-bow` | `charge` | `attack` | 生成・変換 |
| `rail-cannon` | `charge` | `attack` | 生成・変換 |
| `charge-bastion` | `charge`、`repair` | `guard`、`repair` | 生成・変換 |
| `venom-orbit` | `poison` | `attack`、`operator` | 再循環 |
| `sealed-junction` | `shield` | `guard`、`operator` | 合流 |
| `adaptive-arsenal` | `damage` | `attack` | 生成・変換 |
| `adaptive-bulwark` | `shield` | `guard` | 生成・変換 |
| `bridge-core` | `damage`、`shield` | `attack`、`guard` | 生成・変換 |
| `charge-line-lance` | `charge` | `operator` | 中継複製 |
| `overcharge-cannon` | `charge` | `attack` | 生成・変換 |
| `inscription-stone` | `shield` | `guard`、`operator` | 出力刻印 |
| `guiding-bolt` | `damage` | `attack`、`operator` | 出力刻印 |
| `sigil-blade` | `damage` | `attack`、`operator` | 出力刻印 |
| `guardian-sigil` | `shield`、`repair` | `guard`、`repair`、`operator` | 出力刻印 |
| `twin-inscription` | `damage` | `attack`、`operator` | 出力刻印 |
| `thunder-sigil` | `charge`、`damage` | `attack`、`operator` | 出力刻印 |
| `convergence-sigil` | `shield` | `guard`、`operator` | 出力刻印 |
| `sigil-cannon` | `damage` | `attack`、`operator` | 出力刻印 |
| `resonance-circle` | `poison` | `attack`、`operator` | 出力刻印 |
| `deep-sigil-cannon` | `damage` | `attack`、`operator` | 出力刻印 |
| `all-sigil-resonance` | `damage`、`shield` | `attack`、`guard`、`operator` | 出力刻印 |
| `spirit-blade` | `damage` | `attack`、`operator` | 状態複製 |
| `echo-arrow` | `damage` | `attack`、`operator` | 状態複製 |
| `tuning-stone` | `shield` | `guard`、`operator` | 状態複製 |
| `harmony-ward` | `shield`、`repair` | `guard`、`repair`、`operator` | 状態複製 |
| `thunder-echo` | `charge`、`damage` | `attack`、`operator` | 状態複製 |
| `venom-chorus` | `poison` | `attack`、`operator` | 状態複製 |
| `resonance-cannon` | `damage` | `attack`、`operator` | 状態複製 |
| `harmonic-sanctuary` | `shield`、`repair` | `guard`、`repair`、`operator` | 状態複製 |
| `celestial-echo-cannon` | `damage` | `attack`、`operator` | 状態複製 |
| `grand-harmony` | `damage`、`shield` | `attack`、`guard`、`operator` | 状態複製 |
| `light-vein-blade` | `damage` | `attack` | 分岐・合流 |
| `prism-arrow` | `damage` | `attack`、`operator` | 分岐・合流 |
| `light-guide` | `shield`、`repair` | `guard`、`repair` | 分岐・合流 |
| `thunder-prism` | `charge`、`damage` | `attack`、`operator` | 分岐・合流 |
| `venom-ray` | `poison` | `attack`、`operator` | 分岐・合流 |
| `radiant-fork` | `shield` | `guard`、`operator` | 分岐・合流 |
| `branchlight-barrage` | `damage` | `attack`、`operator` | 分岐・合流 |
| `convergence-cannon` | `damage` | `attack`、`operator` | 分岐・合流 |
| `myriad-light-array` | `damage` | `attack`、`operator` | 分岐・合流 |
| `solar-convergence` | `damage` | `attack`、`operator` | 分岐・合流 |

## 回路演算 × 状態 × 出力（スキル数）

> 0または少数のセルを、次に追加するスキル候補として優先します。

| 回路演算 × 状態 | 攻撃 | 防御 | 回復 | 資金 | 回路演算 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 生成・変換 × 無属性 | 0 | 0 | 0 | 0 | 1 |
| 生成・変換 × 攻撃 | 12 | 1 | 0 | 2 | 3 |
| 生成・変換 × 毒 | 4 | 1 | 0 | 0 | 1 |
| 生成・変換 × チャージ | 7 | 3 | 1 | 0 | 2 |
| 生成・変換 × 防御 | 2 | 6 | 1 | 1 | 0 |
| 生成・変換 × 回復 | 0 | 2 | 3 | 1 | 0 |
| 生成・変換 × コイン | 2 | 1 | 1 | 3 | 0 |
| 再循環 × 無属性 | 0 | 0 | 0 | 0 | 0 |
| 再循環 × 攻撃 | 0 | 0 | 0 | 0 | 0 |
| 再循環 × 毒 | 1 | 0 | 0 | 0 | 1 |
| 再循環 × チャージ | 0 | 0 | 0 | 0 | 0 |
| 再循環 × 防御 | 0 | 1 | 0 | 0 | 1 |
| 再循環 × 回復 | 0 | 0 | 0 | 0 | 0 |
| 再循環 × コイン | 0 | 0 | 0 | 0 | 0 |
| 合流 × 無属性 | 0 | 0 | 0 | 0 | 1 |
| 合流 × 攻撃 | 0 | 0 | 0 | 0 | 0 |
| 合流 × 毒 | 0 | 0 | 0 | 0 | 0 |
| 合流 × チャージ | 0 | 0 | 0 | 0 | 0 |
| 合流 × 防御 | 0 | 1 | 0 | 0 | 1 |
| 合流 × 回復 | 0 | 0 | 0 | 0 | 0 |
| 合流 × コイン | 0 | 0 | 0 | 0 | 0 |
| 中継複製 × 無属性 | 0 | 0 | 0 | 0 | 0 |
| 中継複製 × 攻撃 | 1 | 0 | 0 | 0 | 1 |
| 中継複製 × 毒 | 0 | 0 | 0 | 0 | 0 |
| 中継複製 × チャージ | 0 | 0 | 0 | 0 | 1 |
| 中継複製 × 防御 | 0 | 0 | 0 | 0 | 0 |
| 中継複製 × 回復 | 0 | 0 | 0 | 0 | 0 |
| 中継複製 × コイン | 0 | 0 | 0 | 0 | 0 |
| 出力刻印 × 無属性 | 0 | 0 | 0 | 0 | 0 |
| 出力刻印 × 攻撃 | 7 | 1 | 0 | 0 | 7 |
| 出力刻印 × 毒 | 1 | 0 | 0 | 0 | 1 |
| 出力刻印 × チャージ | 1 | 0 | 0 | 0 | 1 |
| 出力刻印 × 防御 | 1 | 4 | 1 | 0 | 4 |
| 出力刻印 × 回復 | 0 | 1 | 1 | 0 | 1 |
| 出力刻印 × コイン | 0 | 0 | 0 | 0 | 0 |
| 状態複製 × 無属性 | 0 | 0 | 0 | 0 | 0 |
| 状態複製 × 攻撃 | 6 | 1 | 0 | 0 | 6 |
| 状態複製 × 毒 | 1 | 0 | 0 | 0 | 1 |
| 状態複製 × チャージ | 1 | 0 | 0 | 0 | 1 |
| 状態複製 × 防御 | 1 | 4 | 2 | 0 | 4 |
| 状態複製 × 回復 | 0 | 2 | 2 | 0 | 2 |
| 状態複製 × コイン | 0 | 0 | 0 | 0 | 0 |
| 分岐・合流 × 無属性 | 0 | 0 | 0 | 0 | 0 |
| 分岐・合流 × 攻撃 | 7 | 0 | 0 | 0 | 6 |
| 分岐・合流 × 毒 | 1 | 0 | 0 | 0 | 1 |
| 分岐・合流 × チャージ | 1 | 0 | 0 | 0 | 1 |
| 分岐・合流 × 防御 | 0 | 2 | 1 | 0 | 1 |
| 分岐・合流 × 回復 | 0 | 1 | 1 | 0 | 0 |
| 分岐・合流 × コイン | 0 | 0 | 0 | 0 | 0 |

## 毒（`poison`）

| 項目 | 内容 |
| --- | --- |
| 配置思想 | 毒を生成し、汎用演算子を通して培養か破裂の終端へ届ける |
| 得意 | 後半の継続成長 |
| リスク | 立ち上がりが遅い |
| 戦い方 | 毒パケットを複製して長期蓄積するか、分岐・合流で束ねて破裂へ変換する |

### 役割

| 役割 | 対応する技 |
| --- | --- |
| 起点 | `strike`、`breaker`、`salvage-blade`、`poison-needle` |
| 育成 | `poison-needle`、`cultivation-blade`、`status-relay`、`long-route-fang`、`amplifier`、`venom-orbit`、`adaptive-arsenal`、`bridge-core`、`venom-chorus`、`venom-ray` |
| 回す | `strike`、`arc-shot`、`salvage-blade`、`bounty-arrow`、`toxic-reservoir`、`return-coil`、`long-route-fang`、`accelerator`、`venom-orbit`、`venom-chorus`、`venom-ray` |
| 維持 | `barrier`、`repair`、`repair-dividend`、`toxic-reservoir`、`sealed-junction`、`adaptive-bulwark`、`bridge-core` |
| 活かす | `venom-bloom`、`rupture-stake` |

### 決め手

| 分岐 | 方針 | 育成・循環・活用技 | 固有の決め手 |
| --- | --- | --- | --- |
| 培養 | 毒を残して育てる | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`salvage-blade`、`bounty-arrow`、`repair-dividend`、`poison-needle`、`cultivation-blade`、`toxic-reservoir`、`venom-bloom`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`venom-orbit`、`sealed-junction`、`adaptive-arsenal`、`adaptive-bulwark`、`bridge-core`、`venom-chorus`、`venom-ray` | `venom-bloom` |
| 破裂 | 毒を一気に破裂させる | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`salvage-blade`、`bounty-arrow`、`repair-dividend`、`poison-needle`、`toxic-reservoir`、`rupture-stake`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`venom-orbit`、`sealed-junction`、`adaptive-arsenal`、`adaptive-bulwark`、`bridge-core`、`venom-chorus`、`venom-ray` | `rupture-stake` |

### 開放性と実装状況

- 開放スキル: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`salvage-blade`、`bounty-arrow`、`repair-dividend`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`sealed-junction`、`adaptive-arsenal`、`adaptive-bulwark`、`bridge-core`、`inscription-stone`、`guiding-bolt`、`sigil-blade`、`guardian-sigil`、`twin-inscription`、`convergence-sigil`、`sigil-cannon`、`resonance-circle`、`deep-sigil-cannon`、`all-sigil-resonance`、`spirit-blade`、`echo-arrow`、`tuning-stone`、`harmony-ward`、`venom-chorus`、`resonance-cannon`、`harmonic-sanctuary`、`celestial-echo-cannon`、`grand-harmony`、`light-vein-blade`、`prism-arrow`、`light-guide`、`venom-ray`、`radiant-fork`、`branchlight-barrage`、`convergence-cannon`、`myriad-light-array`、`solar-convergence`
- 複合特性スキル: `salvage-blade`、`bounty-arrow`、`repair-dividend`、`poison-needle`、`toxic-reservoir`、`status-relay`、`bridge-core`、`guardian-sigil`、`all-sigil-resonance`、`harmony-ward`、`harmonic-sanctuary`、`grand-harmony`、`light-guide`
- 出力の幅: `attack`、`guard`、`repair`、`economy`、`operator`
- 専用技率: 10%（上限 50%）
- 計画中: —
- 実装済み: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`salvage-blade`、`bounty-arrow`、`repair-dividend`、`poison-needle`、`cultivation-blade`、`toxic-reservoir`、`venom-bloom`、`rupture-stake`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`venom-orbit`、`sealed-junction`、`adaptive-arsenal`、`adaptive-bulwark`、`bridge-core`、`inscription-stone`、`guiding-bolt`、`sigil-blade`、`guardian-sigil`、`twin-inscription`、`convergence-sigil`、`sigil-cannon`、`resonance-circle`、`deep-sigil-cannon`、`all-sigil-resonance`、`spirit-blade`、`echo-arrow`、`tuning-stone`、`harmony-ward`、`venom-chorus`、`resonance-cannon`、`harmonic-sanctuary`、`celestial-echo-cannon`、`grand-harmony`、`light-vein-blade`、`prism-arrow`、`light-guide`、`venom-ray`、`radiant-fork`、`branchlight-barrage`、`convergence-cannon`、`myriad-light-array`、`solar-convergence`（最低 8）

## チャージ（`charge`）

| 項目 | 内容 |
| --- | --- |
| 配置思想 | チャージを生成し、汎用演算子を通して攻撃か防御の終端へ届ける |
| 得意 | 完成した経路からの瞬間出力 |
| リスク | 充電ノードが足りないか経路が切れると弱い |
| 戦い方 | 一時的なチャージパケットを経路で加工し、砲撃か防壁として終端で解放する |

### 役割

| 役割 | 対応する技 |
| --- | --- |
| 起点 | `strike`、`breaker`、`salvage-blade`、`charge-blade`、`charge-arrow` |
| 育成 | `toxic-reservoir`、`status-relay`、`long-route-fang`、`amplifier`、`charge-guard`、`charge-blade`、`charge-coil`、`adaptive-arsenal`、`bridge-core`、`charge-line-lance`、`thunder-sigil`、`thunder-echo`、`thunder-prism` |
| 回す | `strike`、`arc-shot`、`salvage-blade`、`bounty-arrow`、`toxic-reservoir`、`return-coil`、`long-route-fang`、`accelerator`、`charge-arrow`、`charge-coil`、`charge-line-lance`、`thunder-sigil`、`thunder-echo`、`thunder-prism` |
| 維持 | `barrier`、`repair`、`repair-dividend`、`toxic-reservoir`、`charge-guard`、`charge-bastion`、`sealed-junction`、`adaptive-bulwark`、`bridge-core` |
| 活かす | `discharge-bow`、`rail-cannon`、`charge-bastion`、`overcharge-cannon` |

### 決め手

| 分岐 | 方針 | 育成・循環・活用技 | 固有の決め手 |
| --- | --- | --- | --- |
| 一括解放 | 全チャージを大ダメージへ変える | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`salvage-blade`、`bounty-arrow`、`repair-dividend`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`、`charge-blade`、`charge-arrow`、`charge-coil`、`discharge-bow`、`rail-cannon`、`sealed-junction`、`adaptive-arsenal`、`adaptive-bulwark`、`bridge-core`、`charge-line-lance`、`overcharge-cannon`、`thunder-sigil`、`thunder-echo`、`thunder-prism` | `discharge-bow`、`rail-cannon`、`overcharge-cannon` |
| 防壁解放 | 全チャージをシールドへ変える | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`salvage-blade`、`bounty-arrow`、`repair-dividend`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`、`charge-blade`、`charge-arrow`、`charge-coil`、`charge-bastion`、`sealed-junction`、`adaptive-arsenal`、`adaptive-bulwark`、`bridge-core`、`charge-line-lance`、`thunder-sigil`、`thunder-echo`、`thunder-prism` | `charge-bastion` |

### 開放性と実装状況

- 開放スキル: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`salvage-blade`、`bounty-arrow`、`repair-dividend`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`sealed-junction`、`adaptive-arsenal`、`adaptive-bulwark`、`bridge-core`、`inscription-stone`、`guiding-bolt`、`sigil-blade`、`guardian-sigil`、`twin-inscription`、`thunder-sigil`、`convergence-sigil`、`sigil-cannon`、`deep-sigil-cannon`、`all-sigil-resonance`、`spirit-blade`、`echo-arrow`、`tuning-stone`、`harmony-ward`、`thunder-echo`、`resonance-cannon`、`harmonic-sanctuary`、`celestial-echo-cannon`、`grand-harmony`、`light-vein-blade`、`prism-arrow`、`light-guide`、`thunder-prism`、`radiant-fork`、`branchlight-barrage`、`convergence-cannon`、`myriad-light-array`、`solar-convergence`
- 複合特性スキル: `salvage-blade`、`bounty-arrow`、`repair-dividend`、`toxic-reservoir`、`status-relay`、`charge-guard`、`charge-blade`、`charge-arrow`、`charge-bastion`、`bridge-core`、`guardian-sigil`、`thunder-sigil`、`all-sigil-resonance`、`harmony-ward`、`thunder-echo`、`harmonic-sanctuary`、`grand-harmony`、`light-guide`、`thunder-prism`
- 出力の幅: `attack`、`guard`、`repair`、`economy`、`operator`
- 専用技率: 16%（上限 50%）
- 計画中: —
- 実装済み: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`salvage-blade`、`bounty-arrow`、`repair-dividend`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`、`charge-blade`、`charge-arrow`、`charge-coil`、`discharge-bow`、`rail-cannon`、`charge-bastion`、`sealed-junction`、`adaptive-arsenal`、`adaptive-bulwark`、`bridge-core`、`charge-line-lance`、`overcharge-cannon`、`inscription-stone`、`guiding-bolt`、`sigil-blade`、`guardian-sigil`、`twin-inscription`、`thunder-sigil`、`convergence-sigil`、`sigil-cannon`、`deep-sigil-cannon`、`all-sigil-resonance`、`spirit-blade`、`echo-arrow`、`tuning-stone`、`harmony-ward`、`thunder-echo`、`resonance-cannon`、`harmonic-sanctuary`、`celestial-echo-cannon`、`grand-harmony`、`light-vein-blade`、`prism-arrow`、`light-guide`、`thunder-prism`、`radiant-fork`、`branchlight-barrage`、`convergence-cannon`、`myriad-light-array`、`solar-convergence`（最低 8）
