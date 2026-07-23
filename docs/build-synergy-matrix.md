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
| 出力刻印 | 回路コア | 状態の種類を問わず、終端の出力先を攻撃・防御・回復へ書き換える |
| 状態複製 | 回路コア | 最後に追加された状態だけを1回複製し、再帰的な複製は止める |
| 分岐 | 回路コア | 量を保存したまま、パケットを複数経路へ分ける |

## ノードの組み合わせ

| ノード | 状態 | 出力 | 回路演算 |
| --- | --- | --- | --- |
| `strike` | `damage` | `attack` | 生成・変換 |
| `repair-dividend` | `shield`、`repair`、`coin` | `guard`、`repair`、`economy` | 生成・変換 |
| `poison-needle` | `damage`、`poison` | `attack`、`operator` | 生成・変換 |
| `venom-bloom` | `poison` | `attack` | 生成・変換 |
| `rupture-stake` | `poison` | `attack` | 生成・変換 |
| `return-coil` | `shield` | `guard`、`operator` | 再循環 |
| `amplifier` | `neutral` | `operator` | 状態複製 |
| `accelerator` | `neutral` | `operator` | 合流 |
| `charge-blade` | `charge`、`damage` | `attack` | 生成・変換 |
| `discharge-bow` | `charge` | `attack` | 生成・変換 |
| `charge-bastion` | `charge`、`repair` | `guard`、`repair` | 生成・変換 |
| `overcharge-cannon` | `charge` | `attack` | 生成・変換 |
| `guiding-bolt` | `damage` | `attack`、`operator` | 出力刻印 |
| `prism-arrow` | `damage` | `attack`、`operator` | 分岐 |

## 回路演算 × 状態 × 出力（スキル数）

> 0または少数のセルを、次に追加するスキル候補として優先します。

| 回路演算 × 状態 | 攻撃 | 防御 | 回復 | 資金 | 回路演算 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 生成・変換 × 無属性 | 0 | 0 | 0 | 0 | 0 |
| 生成・変換 × 攻撃 | 3 | 0 | 0 | 0 | 1 |
| 生成・変換 × 毒 | 3 | 0 | 0 | 0 | 1 |
| 生成・変換 × チャージ | 3 | 1 | 1 | 0 | 0 |
| 生成・変換 × 防御 | 0 | 1 | 1 | 1 | 0 |
| 生成・変換 × 回復 | 0 | 2 | 2 | 1 | 0 |
| 生成・変換 × コイン | 0 | 1 | 1 | 1 | 0 |
| 再循環 × 無属性 | 0 | 0 | 0 | 0 | 0 |
| 再循環 × 攻撃 | 0 | 0 | 0 | 0 | 0 |
| 再循環 × 毒 | 0 | 0 | 0 | 0 | 0 |
| 再循環 × チャージ | 0 | 0 | 0 | 0 | 0 |
| 再循環 × 防御 | 0 | 1 | 0 | 0 | 1 |
| 再循環 × 回復 | 0 | 0 | 0 | 0 | 0 |
| 再循環 × コイン | 0 | 0 | 0 | 0 | 0 |
| 合流 × 無属性 | 0 | 0 | 0 | 0 | 1 |
| 合流 × 攻撃 | 0 | 0 | 0 | 0 | 0 |
| 合流 × 毒 | 0 | 0 | 0 | 0 | 0 |
| 合流 × チャージ | 0 | 0 | 0 | 0 | 0 |
| 合流 × 防御 | 0 | 0 | 0 | 0 | 0 |
| 合流 × 回復 | 0 | 0 | 0 | 0 | 0 |
| 合流 × コイン | 0 | 0 | 0 | 0 | 0 |
| 出力刻印 × 無属性 | 0 | 0 | 0 | 0 | 0 |
| 出力刻印 × 攻撃 | 1 | 0 | 0 | 0 | 1 |
| 出力刻印 × 毒 | 0 | 0 | 0 | 0 | 0 |
| 出力刻印 × チャージ | 0 | 0 | 0 | 0 | 0 |
| 出力刻印 × 防御 | 0 | 0 | 0 | 0 | 0 |
| 出力刻印 × 回復 | 0 | 0 | 0 | 0 | 0 |
| 出力刻印 × コイン | 0 | 0 | 0 | 0 | 0 |
| 状態複製 × 無属性 | 0 | 0 | 0 | 0 | 1 |
| 状態複製 × 攻撃 | 0 | 0 | 0 | 0 | 0 |
| 状態複製 × 毒 | 0 | 0 | 0 | 0 | 0 |
| 状態複製 × チャージ | 0 | 0 | 0 | 0 | 0 |
| 状態複製 × 防御 | 0 | 0 | 0 | 0 | 0 |
| 状態複製 × 回復 | 0 | 0 | 0 | 0 | 0 |
| 状態複製 × コイン | 0 | 0 | 0 | 0 | 0 |
| 分岐 × 無属性 | 0 | 0 | 0 | 0 | 0 |
| 分岐 × 攻撃 | 1 | 0 | 0 | 0 | 1 |
| 分岐 × 毒 | 0 | 0 | 0 | 0 | 0 |
| 分岐 × チャージ | 0 | 0 | 0 | 0 | 0 |
| 分岐 × 防御 | 0 | 0 | 0 | 0 | 0 |
| 分岐 × 回復 | 0 | 0 | 0 | 0 | 0 |
| 分岐 × コイン | 0 | 0 | 0 | 0 | 0 |

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
| 起点 | `strike`、`poison-needle` |
| 育成 | `poison-needle`、`amplifier` |
| 回す | `strike`、`return-coil`、`accelerator`、`guiding-bolt`、`prism-arrow` |
| 維持 | `repair-dividend` |
| 活かす | `venom-bloom`、`rupture-stake` |

### 決め手

| 分岐 | 方針 | 育成・循環・活用技 | 固有の決め手 |
| --- | --- | --- | --- |
| 培養 | 毒を残して育てる | `strike`、`repair-dividend`、`poison-needle`、`venom-bloom`、`return-coil`、`amplifier`、`accelerator`、`guiding-bolt`、`prism-arrow` | `venom-bloom` |
| 破裂 | 毒を一気に破裂させる | `strike`、`repair-dividend`、`poison-needle`、`rupture-stake`、`return-coil`、`amplifier`、`accelerator`、`guiding-bolt`、`prism-arrow` | `rupture-stake` |

### 開放性と実装状況

- 開放スキル: `strike`、`repair-dividend`、`return-coil`、`amplifier`、`accelerator`、`guiding-bolt`、`prism-arrow`
- 複合特性スキル: `repair-dividend`、`poison-needle`
- 出力の幅: `attack`、`guard`、`repair`、`economy`、`operator`
- 専用技率: 30%（上限 50%）
- 計画中: —
- 実装済み: `strike`、`repair-dividend`、`poison-needle`、`venom-bloom`、`rupture-stake`、`return-coil`、`amplifier`、`accelerator`、`guiding-bolt`、`prism-arrow`（最低 0）

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
| 起点 | `strike`、`charge-blade` |
| 育成 | `amplifier`、`charge-blade` |
| 回す | `strike`、`return-coil`、`accelerator`、`guiding-bolt`、`prism-arrow` |
| 維持 | `repair-dividend`、`charge-bastion` |
| 活かす | `discharge-bow`、`charge-bastion`、`overcharge-cannon` |

### 決め手

| 分岐 | 方針 | 育成・循環・活用技 | 固有の決め手 |
| --- | --- | --- | --- |
| 一括解放 | 全チャージを大ダメージへ変える | `strike`、`repair-dividend`、`return-coil`、`amplifier`、`accelerator`、`charge-blade`、`discharge-bow`、`overcharge-cannon`、`guiding-bolt`、`prism-arrow` | `discharge-bow`、`overcharge-cannon` |
| 防壁解放 | 全チャージをシールドへ変える | `strike`、`repair-dividend`、`return-coil`、`amplifier`、`accelerator`、`charge-blade`、`charge-bastion`、`guiding-bolt`、`prism-arrow` | `charge-bastion` |

### 開放性と実装状況

- 開放スキル: `strike`、`repair-dividend`、`return-coil`、`amplifier`、`accelerator`、`guiding-bolt`、`prism-arrow`
- 複合特性スキル: `repair-dividend`、`charge-blade`、`charge-bastion`
- 出力の幅: `attack`、`guard`、`repair`、`economy`、`operator`
- 専用技率: 36%（上限 50%）
- 計画中: —
- 実装済み: `strike`、`repair-dividend`、`return-coil`、`amplifier`、`accelerator`、`charge-blade`、`discharge-bow`、`charge-bastion`、`overcharge-cannon`、`guiding-bolt`、`prism-arrow`（最低 0）
