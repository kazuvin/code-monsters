# ビルド・シナジーマトリクス

> `src/game/game.json` から生成します。直接編集しないでください。

## ビルド軸

| 軸 | 目的 | 値 |
| --- | --- | --- |
| 特性 | ノード固有の蓄積・変換。無特性はどのビルドにも属さない | 無特性（`neutral`）、毒（`poison`）、チャージ（`charge`）、魔紋（`magic-sigil`）、霊響（`resonance`） |
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
| `inscription-stone` | `magic-sigil` | `device` | 条件なし |
| `guiding-bolt` | `magic-sigil` | `bow` | 条件なし |
| `sigil-blade` | `magic-sigil` | `blade` | 魔紋 |
| `guardian-sigil` | `magic-sigil` | `device` | 魔紋 |
| `twin-inscription` | `magic-sigil` | `bow` | 条件なし |
| `thunder-sigil` | `magic-sigil`、`charge` | `device` | 条件なし |
| `convergence-sigil` | `magic-sigil` | `magic` | 条件なし |
| `sigil-cannon` | `magic-sigil` | `cannon` | 魔紋 |
| `resonance-circle` | `magic-sigil`、`poison` | `magic` | 魔紋 |
| `deep-sigil-cannon` | `magic-sigil` | `cannon` | 魔紋 |
| `all-sigil-resonance` | `magic-sigil` | `magic` | 魔紋 |
| `spirit-blade` | `resonance` | `blade` | 霊響 |
| `echo-arrow` | `resonance` | `bow` | 霊響 |
| `tuning-stone` | `resonance` | `magic` | 霊響 |
| `harmony-ward` | `resonance` | `device` | 霊響 |
| `thunder-echo` | `resonance`、`charge` | `device` | 霊響 |
| `venom-chorus` | `resonance`、`poison` | `bow` | 霊響 |
| `resonance-cannon` | `resonance` | `cannon` | 霊響 |
| `harmonic-sanctuary` | `resonance` | `magic` | 霊響 |
| `celestial-echo-cannon` | `resonance` | `cannon` | 霊響 |
| `grand-harmony` | `resonance` | `magic` | 霊響 |

## 配置条件 × 特性 × 武器・装置（スキル数）

> 0または少数のセルを、次に追加するスキル候補として優先します。

| 配置条件 × 特性 | 剣 | 弓 | 砲 | 装置 | 魔法 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 条件なし × 無特性 | 2 | 1 | 0 | 2 | 1 |
| 条件なし × 毒 | 1 | 1 | 1 | 3 | 0 |
| 条件なし × チャージ | 1 | 2 | 2 | 6 | 0 |
| 条件なし × 魔紋 | 0 | 2 | 0 | 2 | 1 |
| 条件なし × 霊響 | 0 | 0 | 0 | 0 | 0 |
| 循環 × 無特性 | 0 | 0 | 0 | 1 | 0 |
| 循環 × 毒 | 0 | 0 | 0 | 0 | 1 |
| 循環 × チャージ | 0 | 0 | 0 | 0 | 0 |
| 循環 × 魔紋 | 0 | 0 | 0 | 0 | 0 |
| 循環 × 霊響 | 0 | 0 | 0 | 0 | 0 |
| 全接続 × 無特性 | 0 | 0 | 0 | 0 | 2 |
| 全接続 × 毒 | 0 | 0 | 0 | 0 | 0 |
| 全接続 × チャージ | 0 | 0 | 0 | 0 | 0 |
| 全接続 × 魔紋 | 0 | 0 | 0 | 0 | 0 |
| 全接続 × 霊響 | 0 | 0 | 0 | 0 | 0 |
| 長直線 × 無特性 | 1 | 0 | 0 | 0 | 0 |
| 長直線 × 毒 | 0 | 0 | 0 | 0 | 0 |
| 長直線 × チャージ | 1 | 0 | 0 | 0 | 0 |
| 長直線 × 魔紋 | 0 | 0 | 0 | 0 | 0 |
| 長直線 × 霊響 | 0 | 0 | 0 | 0 | 0 |
| 魔紋 × 無特性 | 0 | 0 | 0 | 0 | 0 |
| 魔紋 × 毒 | 0 | 0 | 0 | 0 | 1 |
| 魔紋 × チャージ | 0 | 0 | 0 | 0 | 0 |
| 魔紋 × 魔紋 | 1 | 0 | 2 | 1 | 2 |
| 魔紋 × 霊響 | 0 | 0 | 0 | 0 | 0 |
| 霊響 × 無特性 | 0 | 0 | 0 | 0 | 0 |
| 霊響 × 毒 | 0 | 1 | 0 | 0 | 0 |
| 霊響 × チャージ | 0 | 0 | 0 | 1 | 0 |
| 霊響 × 魔紋 | 0 | 0 | 0 | 0 | 0 |
| 霊響 × 霊響 | 1 | 2 | 2 | 2 | 3 |

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
| 育成 | `poison-needle`、`cultivation-blade`、`status-relay`、`long-route-fang`、`amplifier`、`venom-orbit`、`venom-chorus` |
| 回す | `strike`、`arc-shot`、`toxic-reservoir`、`return-coil`、`long-route-fang`、`accelerator`、`venom-orbit`、`venom-chorus` |
| 維持 | `barrier`、`repair`、`toxic-reservoir`、`sealed-junction` |
| 活かす | `venom-bloom`、`rupture-stake` |

### 決め手

| 分岐 | 方針 | 育成・循環・活用技 | 固有の決め手 |
| --- | --- | --- | --- |
| 培養 | 毒を残して育てる | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`poison-needle`、`cultivation-blade`、`toxic-reservoir`、`venom-bloom`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`venom-orbit`、`sealed-junction`、`venom-chorus` | `venom-bloom` |
| 破裂 | 毒を一気に破裂させる | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`poison-needle`、`toxic-reservoir`、`rupture-stake`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`venom-orbit`、`sealed-junction`、`venom-chorus` | `rupture-stake` |

### 開放性と実装状況

- 開放スキル: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`sealed-junction`、`venom-chorus`
- 複合特性スキル: `toxic-reservoir`、`status-relay`、`venom-chorus`
- 武器・装置の幅: `blade`、`bow`、`device`、`cannon`、`magic`
- 専用技率: 28%（上限 50%）
- 計画中: —
- 実装済み: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`poison-needle`、`cultivation-blade`、`toxic-reservoir`、`venom-bloom`、`rupture-stake`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`venom-orbit`、`sealed-junction`、`venom-chorus`（最低 8）

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
| 育成 | `toxic-reservoir`、`status-relay`、`long-route-fang`、`amplifier`、`charge-guard`、`charge-blade`、`charge-coil`、`charge-line-lance`、`thunder-sigil`、`thunder-echo` |
| 回す | `strike`、`arc-shot`、`toxic-reservoir`、`return-coil`、`long-route-fang`、`accelerator`、`charge-arrow`、`charge-coil`、`charge-line-lance`、`thunder-sigil`、`thunder-echo` |
| 維持 | `barrier`、`repair`、`toxic-reservoir`、`charge-guard`、`charge-bastion`、`sealed-junction` |
| 活かす | `discharge-bow`、`rail-cannon`、`charge-bastion`、`overcharge-cannon` |

### 決め手

| 分岐 | 方針 | 育成・循環・活用技 | 固有の決め手 |
| --- | --- | --- | --- |
| 一括解放 | 全チャージを大ダメージへ変える | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`、`charge-blade`、`charge-arrow`、`charge-coil`、`discharge-bow`、`rail-cannon`、`sealed-junction`、`charge-line-lance`、`overcharge-cannon`、`thunder-sigil`、`thunder-echo` | `discharge-bow`、`rail-cannon`、`overcharge-cannon` |
| 防壁解放 | 全チャージをシールドへ変える | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`、`charge-blade`、`charge-arrow`、`charge-coil`、`charge-bastion`、`sealed-junction`、`charge-line-lance`、`thunder-sigil`、`thunder-echo` | `charge-bastion` |

### 開放性と実装状況

- 開放スキル: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`sealed-junction`、`thunder-sigil`、`thunder-echo`
- 複合特性スキル: `toxic-reservoir`、`status-relay`、`thunder-sigil`、`thunder-echo`
- 武器・装置の幅: `blade`、`bow`、`device`、`magic`、`cannon`
- 専用技率: 39%（上限 50%）
- 計画中: —
- 実装済み: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`、`charge-blade`、`charge-arrow`、`charge-coil`、`discharge-bow`、`rail-cannon`、`charge-bastion`、`sealed-junction`、`charge-line-lance`、`overcharge-cannon`、`thunder-sigil`、`thunder-echo`（最低 8）

## 魔紋（`magic-sigil`）

| 項目 | 内容 |
| --- | --- |
| 配置思想 | 未通電でも刻める刻印元を自由に置き、価値の高い魔紋マスを盤面に重ねる |
| 得意 | 任意の技を置き換えながら強化先を選べる |
| リスク | 刻印元で盤面を使うため、受け手を通電できないと盤面投資が働かない |
| 戦い方 | 同じマスへ魔紋を重ねる重刻か、複数マスを連ねる連環へ展開する |

### 役割

| 役割 | 対応する技 |
| --- | --- |
| 起点 | `strike`、`breaker`、`inscription-stone`、`guiding-bolt` |
| 育成 | `return-coil`、`long-route-fang`、`amplifier`、`inscription-stone`、`guiding-bolt`、`twin-inscription`、`thunder-sigil`、`convergence-sigil` |
| 回す | `strike`、`return-coil`、`long-route-fang`、`accelerator`、`guiding-bolt`、`sigil-blade`、`twin-inscription`、`thunder-sigil`、`convergence-sigil` |
| 維持 | `barrier`、`repair`、`sealed-junction`、`guardian-sigil`、`thunder-sigil`、`convergence-sigil` |
| 活かす | `sigil-cannon`、`resonance-circle`、`deep-sigil-cannon`、`all-sigil-resonance` |

### 決め手

| 分岐 | 方針 | 育成・循環・活用技 | 固有の決め手 |
| --- | --- | --- | --- |
| 重刻 | 一つの魔紋を位階IIIまで重ねて決め手を強化する | `strike`、`breaker`、`barrier`、`repair`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`sealed-junction`、`inscription-stone`、`guiding-bolt`、`sigil-blade`、`guardian-sigil`、`thunder-sigil`、`convergence-sigil`、`sigil-cannon`、`deep-sigil-cannon` | `sigil-cannon`、`deep-sigil-cannon` |
| 連環 | 刻印元を自由に散らし、通電ノードを置いた魔紋マスを増やして共鳴させる | `strike`、`breaker`、`barrier`、`repair`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`sealed-junction`、`inscription-stone`、`guiding-bolt`、`sigil-blade`、`guardian-sigil`、`twin-inscription`、`thunder-sigil`、`resonance-circle`、`all-sigil-resonance` | `resonance-circle`、`all-sigil-resonance` |

### 開放性と実装状況

- 開放スキル: `strike`、`breaker`、`barrier`、`repair`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`sealed-junction`、`thunder-sigil`、`resonance-circle`
- 複合特性スキル: `thunder-sigil`、`resonance-circle`
- 武器・装置の幅: `blade`、`device`、`magic`、`bow`、`cannon`
- 専用技率: 45%（上限 50%）
- 計画中: —
- 実装済み: `strike`、`breaker`、`barrier`、`repair`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`sealed-junction`、`inscription-stone`、`guiding-bolt`、`sigil-blade`、`guardian-sigil`、`twin-inscription`、`thunder-sigil`、`convergence-sigil`、`sigil-cannon`、`resonance-circle`、`deep-sigil-cannon`、`all-sigil-resonance`（最低 8）

## 霊響（`resonance`）

| 項目 | 内容 |
| --- | --- |
| 配置思想 | 決め手の周囲8マスへ通電した霊響を集め、共鳴度を高める |
| 得意 | 密集した盤面から攻撃か防御へ大きな出力を得る |
| リスク | 中心と周囲を同時に通電させる必要があり、盤面の空きと経路を圧迫する |
| 戦い方 | 小さな響きを斜めにも重ね、中央へ集める集響か全周を満たす交響へ展開する |

### 役割

| 役割 | 対応する技 |
| --- | --- |
| 起点 | `strike`、`breaker`、`spirit-blade`、`echo-arrow` |
| 育成 | `return-coil`、`long-route-fang`、`amplifier`、`spirit-blade`、`tuning-stone`、`harmony-ward`、`thunder-echo`、`venom-chorus` |
| 回す | `strike`、`arc-shot`、`return-coil`、`long-route-fang`、`accelerator`、`spirit-blade`、`echo-arrow`、`thunder-echo`、`venom-chorus` |
| 維持 | `barrier`、`repair`、`sealed-junction`、`tuning-stone`、`harmony-ward`、`harmonic-sanctuary`、`grand-harmony` |
| 活かす | `resonance-cannon`、`harmonic-sanctuary`、`celestial-echo-cannon`、`grand-harmony` |

### 決め手

| 分岐 | 方針 | 育成・循環・活用技 | 固有の決め手 |
| --- | --- | --- | --- |
| 集響 | 共鳴度4以上を火力へ集中させる | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`sealed-junction`、`spirit-blade`、`echo-arrow`、`tuning-stone`、`thunder-echo`、`venom-chorus`、`resonance-cannon`、`celestial-echo-cannon` | `resonance-cannon`、`celestial-echo-cannon` |
| 交響 | 共鳴度を攻防と回復へ分配する | `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`sealed-junction`、`spirit-blade`、`echo-arrow`、`tuning-stone`、`harmony-ward`、`thunder-echo`、`venom-chorus`、`harmonic-sanctuary`、`grand-harmony` | `harmonic-sanctuary`、`grand-harmony` |

### 開放性と実装状況

- 開放スキル: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`sealed-junction`、`thunder-echo`、`venom-chorus`
- 複合特性スキル: `thunder-echo`、`venom-chorus`
- 武器・装置の幅: `blade`、`bow`、`device`、`magic`、`cannon`
- 専用技率: 40%（上限 50%）
- 計画中: —
- 実装済み: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`sealed-junction`、`spirit-blade`、`echo-arrow`、`tuning-stone`、`harmony-ward`、`thunder-echo`、`venom-chorus`、`resonance-cannon`、`harmonic-sanctuary`、`celestial-echo-cannon`、`grand-harmony`（最低 8）
