# ビルド・シナジーマトリクス

> `src/game/game.json` から生成します。直接編集しないでください。

## ビルド軸

| 軸 | 目的 | 値 |
| --- | --- | --- |
| 特性 | ノード固有の蓄積・変換。無特性はどのビルドにも属さない | 無特性（`neutral`）、毒（`poison`）、チャージ（`charge`） |
| 武器・装置 | 特性を運び、攻撃や防御へ変換する手段 | 剣（`blade`）、弓（`bow`）、砲（`cannon`）、装置（`device`）、魔法（`magic`） |

## ノードの組み合わせ

| ノード | 特性 | 武器・装置 | 配置条件 |
| --- | --- | --- | --- |
| `strike` | `neutral` | `blade` | 条件なし |
| `breaker` | `neutral` | `blade` | 条件なし |
| `arc-shot` | `neutral` | `bow` | 条件なし |
| `barrier` | `neutral` | `device` | 条件なし |
| `repair` | `neutral` | `device` | 条件なし |
| `poison-needle` | `poison` | `bow` | 条件なし |
| `cultivation-blade` | `poison` | `blade` | 条件なし |
| `toxic-reservoir` | `poison`、`charge` | `device` | 条件なし |
| `venom-bloom` | `poison` | `device` | 条件なし |
| `rupture-stake` | `poison` | `cannon` | 条件なし |
| `status-relay` | `poison`、`charge` | `device` | 条件なし |
| `return-coil` | `neutral` | `device` | 循環 |
| `long-route-fang` | `neutral` | `blade` | 長直線 |
| `amplifier` | `neutral` | `magic` | 条件なし |
| `accelerator` | `neutral` | `magic` | 全接続 |
| `charge-guard` | `charge` | `device` | 条件なし |
| `charge-blade` | `charge` | `blade` | 条件なし |
| `charge-arrow` | `charge` | `bow` | 条件なし |
| `charge-coil` | `charge` | `device` | 条件なし |
| `discharge-bow` | `charge` | `bow` | 条件なし |
| `rail-cannon` | `charge` | `cannon` | 条件なし |
| `charge-bastion` | `charge` | `device` | 条件なし |
| `venom-orbit` | `poison` | `magic` | 循環 |
| `sealed-junction` | `neutral` | `magic` | 全接続 |
| `charge-line-lance` | `charge` | `blade` | 長直線 |
| `overcharge-cannon` | `charge` | `cannon` | 条件なし |

## 配置条件 × 特性 × 武器・装置（スキル数）

> 0または少数のセルを、次に追加するスキル候補として優先します。

| 配置条件 × 特性 | 剣 | 弓 | 砲 | 装置 | 魔法 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 条件なし × 無特性 | 2 | 1 | 0 | 2 | 1 |
| 条件なし × 毒 | 1 | 1 | 1 | 3 | 0 |
| 条件なし × チャージ | 1 | 2 | 2 | 5 | 0 |
| 循環 × 無特性 | 0 | 0 | 0 | 1 | 0 |
| 循環 × 毒 | 0 | 0 | 0 | 0 | 1 |
| 循環 × チャージ | 0 | 0 | 0 | 0 | 0 |
| 全接続 × 無特性 | 0 | 0 | 0 | 0 | 2 |
| 全接続 × 毒 | 0 | 0 | 0 | 0 | 0 |
| 全接続 × チャージ | 0 | 0 | 0 | 0 | 0 |
| 長直線 × 無特性 | 1 | 0 | 0 | 0 | 0 |
| 長直線 × 毒 | 0 | 0 | 0 | 0 | 0 |
| 長直線 × チャージ | 1 | 0 | 0 | 0 | 0 |

## 毒（`poison`）

| 項目 | 内容 |
| --- | --- |
| 配置思想 | 毒を持つ武器と循環装置の組み合わせ |
| 得意 | 後半の継続成長 |
| リスク | 立ち上がりが遅い |
| 戦い方 | 剣・弓・砲へ毒を組み込み、毒を残す培養か消費する破裂へつなぐ |

### 役割

| 役割 | 対応する技 |
| --- | --- |
| 起点 | `strike`、`breaker`、`poison-needle` |
| 育成 | `poison-needle`、`cultivation-blade`、`status-relay`、`long-route-fang`、`amplifier`、`venom-orbit` |
| 回す | `strike`、`arc-shot`、`toxic-reservoir`、`return-coil`、`long-route-fang`、`accelerator`、`venom-orbit` |
| 維持 | `barrier`、`repair`、`toxic-reservoir`、`sealed-junction` |
| 活かす | `venom-bloom`、`rupture-stake` |

### 決め手

| 分岐 | 方針 | 育成・循環・活用技 | 固有の決め手 |
| --- | --- | --- | --- |
| 培養 | 毒を残して育てる | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`poison-needle`、`cultivation-blade`、`toxic-reservoir`、`venom-bloom`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`venom-orbit`、`sealed-junction` | `venom-bloom` |
| 破裂 | 毒を一気に破裂させる | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`poison-needle`、`toxic-reservoir`、`rupture-stake`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`venom-orbit`、`sealed-junction` | `rupture-stake` |

### 開放性と実装状況

- 開放スキル: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`sealed-junction`
- 複合特性スキル: `toxic-reservoir`、`status-relay`
- 武器・装置の幅: `blade`、`bow`、`device`、`cannon`、`magic`
- 専用技率: 29%（上限 50%）
- 計画中: —
- 実装済み: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`poison-needle`、`cultivation-blade`、`toxic-reservoir`、`venom-bloom`、`rupture-stake`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`venom-orbit`、`sealed-junction`（最低 8）

## チャージ（`charge`）

| 項目 | 内容 |
| --- | --- |
| 配置思想 | 充電ノードを連ねた経路と遠い解放点 |
| 得意 | 完成した経路からの瞬間出力 |
| リスク | 充電ノードが足りないか経路が切れると弱い |
| 戦い方 | 充電ノードを通るたびにチャージし、砲撃か防壁として終端でまとめて解放する |

### 役割

| 役割 | 対応する技 |
| --- | --- |
| 起点 | `strike`、`breaker`、`charge-blade`、`charge-arrow` |
| 育成 | `toxic-reservoir`、`status-relay`、`long-route-fang`、`amplifier`、`charge-guard`、`charge-blade`、`charge-coil`、`charge-line-lance` |
| 回す | `strike`、`arc-shot`、`toxic-reservoir`、`return-coil`、`long-route-fang`、`accelerator`、`charge-arrow`、`charge-coil` |
| 維持 | `barrier`、`repair`、`toxic-reservoir`、`charge-guard`、`charge-bastion`、`sealed-junction` |
| 活かす | `discharge-bow`、`rail-cannon`、`charge-bastion`、`charge-line-lance`、`overcharge-cannon` |

### 決め手

| 分岐 | 方針 | 育成・循環・活用技 | 固有の決め手 |
| --- | --- | --- | --- |
| 一括解放 | 全チャージを大ダメージへ変える | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`、`charge-blade`、`charge-arrow`、`charge-coil`、`discharge-bow`、`rail-cannon`、`sealed-junction`、`charge-line-lance`、`overcharge-cannon` | `discharge-bow`、`rail-cannon`、`charge-line-lance`、`overcharge-cannon` |
| 防壁解放 | 全チャージをシールドへ変える | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`、`charge-blade`、`charge-arrow`、`charge-coil`、`charge-bastion`、`sealed-junction` | `charge-bastion` |

### 開放性と実装状況

- 開放スキル: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`sealed-junction`
- 複合特性スキル: `toxic-reservoir`、`status-relay`
- 武器・装置の幅: `blade`、`bow`、`device`、`magic`、`cannon`
- 専用技率: 43%（上限 50%）
- 計画中: —
- 実装済み: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`、`charge-blade`、`charge-arrow`、`charge-coil`、`discharge-bow`、`rail-cannon`、`charge-bastion`、`sealed-junction`、`charge-line-lance`、`overcharge-cannon`（最低 8）
