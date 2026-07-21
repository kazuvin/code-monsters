# ビルド・シナジーマトリクス

> `src/game/game.json` から生成します。直接編集しないでください。

## ビルド軸

| 軸 | 目的 | 値 |
| --- | --- | --- |
| 特性 | 戦闘中に育て、別の武器へ受け渡せる仕組み | 毒（`poison`）、チャージ（`charge`） |
| 武器・装置 | 特性を運び、攻撃や防御へ変換する手段 | 剣（`blade`）、弓（`bow`）、砲（`cannon`）、装置（`device`） |

## ノードの組み合わせ

| ノード | 特性 | 武器・装置 |
| --- | --- | --- |
| `strike` | `poison`、`charge` | `blade` |
| `breaker` | `poison`、`charge` | `blade` |
| `arc-shot` | `poison`、`charge` | `bow` |
| `barrier` | `poison`、`charge` | `device` |
| `repair` | `poison`、`charge` | `device` |
| `poison-needle` | `poison` | `bow` |
| `cultivation-blade` | `poison` | `blade` |
| `toxic-reservoir` | `poison`、`charge` | `device` |
| `venom-bloom` | `poison` | `device` |
| `rupture-stake` | `poison` | `cannon` |
| `status-relay` | `poison`、`charge` | `device` |
| `return-coil` | `poison`、`charge` | `device` |
| `long-route-fang` | `poison`、`charge` | `blade` |
| `amplifier` | `poison`、`charge` | `device` |
| `accelerator` | `poison`、`charge` | `device` |
| `charge-guard` | `poison`、`charge` | `device` |
| `charge-blade` | `charge` | `blade` |
| `charge-arrow` | `charge` | `bow` |
| `charge-coil` | `charge` | `device` |
| `discharge-bow` | `charge` | `bow` |
| `rail-cannon` | `charge` | `cannon` |
| `charge-bastion` | `charge` | `device` |
| `overcharge-cannon` | `charge` | `cannon` |

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
| 育成 | `poison-needle`、`cultivation-blade`、`status-relay`、`long-route-fang`、`amplifier` |
| 回す | `strike`、`arc-shot`、`toxic-reservoir`、`return-coil`、`long-route-fang`、`accelerator` |
| 維持 | `barrier`、`repair`、`toxic-reservoir`、`charge-guard` |
| 活かす | `venom-bloom`、`rupture-stake` |

### 決め手

| 分岐 | 方針 | 育成・循環・活用技 | 固有の決め手 |
| --- | --- | --- | --- |
| 培養 | 毒を残して育てる | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`poison-needle`、`cultivation-blade`、`toxic-reservoir`、`venom-bloom`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard` | `venom-bloom` |
| 破裂 | 毒を一気に破裂させる | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`poison-needle`、`toxic-reservoir`、`rupture-stake`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard` | `rupture-stake` |

### 開放性と実装状況

- 開放スキル: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`
- 複合特性スキル: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`
- 武器・装置の幅: `blade`、`bow`、`device`、`cannon`
- 専用技率: 25%（上限 50%）
- 計画中: —
- 実装済み: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`poison-needle`、`cultivation-blade`、`toxic-reservoir`、`venom-bloom`、`rupture-stake`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`（最低 8）

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
| 育成 | `toxic-reservoir`、`status-relay`、`long-route-fang`、`amplifier`、`charge-guard`、`charge-blade`、`charge-coil` |
| 回す | `strike`、`arc-shot`、`toxic-reservoir`、`return-coil`、`long-route-fang`、`accelerator`、`charge-arrow`、`charge-coil` |
| 維持 | `barrier`、`repair`、`toxic-reservoir`、`charge-guard`、`charge-bastion` |
| 活かす | `discharge-bow`、`rail-cannon`、`charge-bastion`、`overcharge-cannon` |

### 決め手

| 分岐 | 方針 | 育成・循環・活用技 | 固有の決め手 |
| --- | --- | --- | --- |
| 一括解放 | 全チャージを大ダメージへ変える | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`、`charge-blade`、`charge-arrow`、`charge-coil`、`discharge-bow`、`rail-cannon`、`overcharge-cannon` | `discharge-bow`、`rail-cannon`、`overcharge-cannon` |
| 防壁解放 | 全チャージをシールドへ変える | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`、`charge-blade`、`charge-arrow`、`charge-coil`、`charge-bastion` | `charge-bastion` |

### 開放性と実装状況

- 開放スキル: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`
- 複合特性スキル: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`
- 武器・装置の幅: `blade`、`bow`、`device`、`cannon`
- 専用技率: 37%（上限 50%）
- 計画中: —
- 実装済み: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`、`charge-blade`、`charge-arrow`、`charge-coil`、`discharge-bow`、`rail-cannon`、`charge-bastion`、`overcharge-cannon`（最低 8）
