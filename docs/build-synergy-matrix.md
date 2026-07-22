# ビルド・シナジーマトリクス

> `src/game/game.json` から生成します。直接編集しないでください。

## ビルド軸

| 軸 | 目的 | 値 |
| --- | --- | --- |
| 特性 | ノードの効果と回路上の個性を示す。複数特性は混成を表す | 汎用（`neutral`）、毒（`poison`）、チャージ（`charge`）、魔紋（`magic-sigil`）、霊響（`resonance`）、光脈（`light-vein`） |
| 武器・装置 | 特性を運び、攻撃や防御へ変換する手段 | 剣（`blade`）、弓（`bow`）、砲（`cannon`）、装置（`device`）、魔法（`magic`） |

## 回路コア

| 配置 | 分類 | 役割 |
| --- | --- | --- |
| 条件なし | 配置条件 | 接続できれば効果を発揮する基礎配置 |
| 循環 | 配置条件 | ノードが閉じた輪の一部として通電する配置 |
| 全接続 | 配置条件 | ノードが持つ接続部をすべて相互接続する配置 |
| 長直線 | 配置条件 | 指定数以上の連続した直線へノードを組み込む配置 |
| 魔紋 | 回路コア | 刻印元で魔紋を重ね、特性を問わずその上の通電ノードを強化する回路コア |
| 霊響 | 回路コア | 中心の周囲8マスにある通電ノード数を共鳴度へ変える回路コア |
| 光脈 | 回路コア | 通電信号を複数の枝へ分け、異なる経路を一点へ合流させる回路コア |

## ノードの組み合わせ

| ノード | 特性 | 武器・装置 | 配置条件 |
| --- | --- | --- | --- |
| `strike` | `neutral` | `blade` | 条件なし |
| `breaker` | `neutral` | `blade` | 条件なし |
| `arc-shot` | `neutral` | `bow` | 条件なし |
| `barrier` | `neutral` | `device` | 条件なし |
| `repair` | `neutral` | `device` | 条件なし |
| `salvage-blade` | `neutral` | `blade` | 条件なし |
| `bounty-arrow` | `neutral` | `bow` | 条件なし |
| `repair-dividend` | `neutral` | `device` | 条件なし |
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
| `adaptive-arsenal` | `neutral` | `cannon` | 条件なし |
| `adaptive-bulwark` | `neutral` | `device` | 条件なし |
| `bridge-core` | `neutral` | `magic` | 条件なし |
| `charge-line-lance` | `charge` | `blade` | 長直線 |
| `overcharge-cannon` | `charge` | `cannon` | 条件なし |
| `inscription-stone` | `magic-sigil` | `device` | 魔紋 |
| `guiding-bolt` | `magic-sigil` | `bow` | 魔紋 |
| `sigil-blade` | `magic-sigil` | `blade` | 魔紋 |
| `guardian-sigil` | `magic-sigil` | `device` | 魔紋 |
| `twin-inscription` | `magic-sigil` | `bow` | 魔紋 |
| `thunder-sigil` | `charge`、`magic-sigil` | `device` | 魔紋 |
| `convergence-sigil` | `magic-sigil` | `magic` | 魔紋 |
| `sigil-cannon` | `magic-sigil` | `cannon` | 魔紋 |
| `resonance-circle` | `poison`、`magic-sigil` | `magic` | 魔紋 |
| `deep-sigil-cannon` | `magic-sigil` | `cannon` | 魔紋 |
| `all-sigil-resonance` | `magic-sigil` | `magic` | 魔紋 |
| `spirit-blade` | `resonance` | `blade` | 霊響 |
| `echo-arrow` | `resonance` | `bow` | 霊響 |
| `tuning-stone` | `resonance` | `magic` | 霊響 |
| `harmony-ward` | `resonance` | `device` | 霊響 |
| `thunder-echo` | `charge`、`resonance` | `device` | 霊響 |
| `venom-chorus` | `poison`、`resonance` | `bow` | 霊響 |
| `resonance-cannon` | `resonance` | `cannon` | 霊響 |
| `harmonic-sanctuary` | `resonance` | `magic` | 霊響 |
| `celestial-echo-cannon` | `resonance` | `cannon` | 霊響 |
| `grand-harmony` | `resonance` | `magic` | 霊響 |
| `light-vein-blade` | `light-vein` | `blade` | 光脈 |
| `prism-arrow` | `light-vein` | `bow` | 光脈 |
| `light-guide` | `light-vein` | `device` | 光脈 |
| `thunder-prism` | `charge`、`light-vein` | `device` | 光脈 |
| `venom-ray` | `poison`、`light-vein` | `bow` | 光脈 |
| `radiant-fork` | `light-vein` | `magic` | 光脈 |
| `branchlight-barrage` | `light-vein` | `bow` | 光脈 |
| `convergence-cannon` | `light-vein` | `cannon` | 光脈 |
| `myriad-light-array` | `light-vein` | `magic` | 光脈 |
| `solar-convergence` | `light-vein` | `cannon` | 光脈 |

## 配置条件 × 特性 × 武器・装置（スキル数）

> 0または少数のセルを、次に追加するスキル候補として優先します。

| 配置条件 × 特性 | 剣 | 弓 | 砲 | 装置 | 魔法 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 条件なし × 汎用 | 3 | 2 | 1 | 4 | 2 |
| 条件なし × 毒 | 1 | 1 | 1 | 3 | 0 |
| 条件なし × チャージ | 1 | 2 | 2 | 5 | 0 |
| 条件なし × 魔紋 | 0 | 0 | 0 | 0 | 0 |
| 条件なし × 霊響 | 0 | 0 | 0 | 0 | 0 |
| 条件なし × 光脈 | 0 | 0 | 0 | 0 | 0 |
| 循環 × 汎用 | 0 | 0 | 0 | 1 | 0 |
| 循環 × 毒 | 0 | 0 | 0 | 0 | 1 |
| 循環 × チャージ | 0 | 0 | 0 | 0 | 0 |
| 循環 × 魔紋 | 0 | 0 | 0 | 0 | 0 |
| 循環 × 霊響 | 0 | 0 | 0 | 0 | 0 |
| 循環 × 光脈 | 0 | 0 | 0 | 0 | 0 |
| 全接続 × 汎用 | 0 | 0 | 0 | 0 | 2 |
| 全接続 × 毒 | 0 | 0 | 0 | 0 | 0 |
| 全接続 × チャージ | 0 | 0 | 0 | 0 | 0 |
| 全接続 × 魔紋 | 0 | 0 | 0 | 0 | 0 |
| 全接続 × 霊響 | 0 | 0 | 0 | 0 | 0 |
| 全接続 × 光脈 | 0 | 0 | 0 | 0 | 0 |
| 長直線 × 汎用 | 1 | 0 | 0 | 0 | 0 |
| 長直線 × 毒 | 0 | 0 | 0 | 0 | 0 |
| 長直線 × チャージ | 1 | 0 | 0 | 0 | 0 |
| 長直線 × 魔紋 | 0 | 0 | 0 | 0 | 0 |
| 長直線 × 霊響 | 0 | 0 | 0 | 0 | 0 |
| 長直線 × 光脈 | 0 | 0 | 0 | 0 | 0 |
| 魔紋 × 汎用 | 0 | 0 | 0 | 0 | 0 |
| 魔紋 × 毒 | 0 | 0 | 0 | 0 | 1 |
| 魔紋 × チャージ | 0 | 0 | 0 | 1 | 0 |
| 魔紋 × 魔紋 | 1 | 2 | 2 | 3 | 3 |
| 魔紋 × 霊響 | 0 | 0 | 0 | 0 | 0 |
| 魔紋 × 光脈 | 0 | 0 | 0 | 0 | 0 |
| 霊響 × 汎用 | 0 | 0 | 0 | 0 | 0 |
| 霊響 × 毒 | 0 | 1 | 0 | 0 | 0 |
| 霊響 × チャージ | 0 | 0 | 0 | 1 | 0 |
| 霊響 × 魔紋 | 0 | 0 | 0 | 0 | 0 |
| 霊響 × 霊響 | 1 | 2 | 2 | 2 | 3 |
| 霊響 × 光脈 | 0 | 0 | 0 | 0 | 0 |
| 光脈 × 汎用 | 0 | 0 | 0 | 0 | 0 |
| 光脈 × 毒 | 0 | 1 | 0 | 0 | 0 |
| 光脈 × チャージ | 0 | 0 | 0 | 1 | 0 |
| 光脈 × 魔紋 | 0 | 0 | 0 | 0 | 0 |
| 光脈 × 霊響 | 0 | 0 | 0 | 0 | 0 |
| 光脈 × 光脈 | 1 | 3 | 2 | 2 | 2 |

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
- 複合特性スキル: `toxic-reservoir`、`status-relay`、`resonance-circle`、`venom-chorus`、`venom-ray`
- 武器・装置の幅: `blade`、`bow`、`device`、`cannon`、`magic`
- 専用技率: 10%（上限 50%）
- 計画中: —
- 実装済み: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`salvage-blade`、`bounty-arrow`、`repair-dividend`、`poison-needle`、`cultivation-blade`、`toxic-reservoir`、`venom-bloom`、`rupture-stake`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`venom-orbit`、`sealed-junction`、`adaptive-arsenal`、`adaptive-bulwark`、`bridge-core`、`inscription-stone`、`guiding-bolt`、`sigil-blade`、`guardian-sigil`、`twin-inscription`、`convergence-sigil`、`sigil-cannon`、`resonance-circle`、`deep-sigil-cannon`、`all-sigil-resonance`、`spirit-blade`、`echo-arrow`、`tuning-stone`、`harmony-ward`、`venom-chorus`、`resonance-cannon`、`harmonic-sanctuary`、`celestial-echo-cannon`、`grand-harmony`、`light-vein-blade`、`prism-arrow`、`light-guide`、`venom-ray`、`radiant-fork`、`branchlight-barrage`、`convergence-cannon`、`myriad-light-array`、`solar-convergence`（最低 8）

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
- 複合特性スキル: `toxic-reservoir`、`status-relay`、`thunder-sigil`、`thunder-echo`、`thunder-prism`
- 武器・装置の幅: `blade`、`bow`、`device`、`magic`、`cannon`
- 専用技率: 16%（上限 50%）
- 計画中: —
- 実装済み: `strike`、`breaker`、`arc-shot`、`barrier`、`repair`、`salvage-blade`、`bounty-arrow`、`repair-dividend`、`toxic-reservoir`、`status-relay`、`return-coil`、`long-route-fang`、`amplifier`、`accelerator`、`charge-guard`、`charge-blade`、`charge-arrow`、`charge-coil`、`discharge-bow`、`rail-cannon`、`charge-bastion`、`sealed-junction`、`adaptive-arsenal`、`adaptive-bulwark`、`bridge-core`、`charge-line-lance`、`overcharge-cannon`、`inscription-stone`、`guiding-bolt`、`sigil-blade`、`guardian-sigil`、`twin-inscription`、`thunder-sigil`、`convergence-sigil`、`sigil-cannon`、`deep-sigil-cannon`、`all-sigil-resonance`、`spirit-blade`、`echo-arrow`、`tuning-stone`、`harmony-ward`、`thunder-echo`、`resonance-cannon`、`harmonic-sanctuary`、`celestial-echo-cannon`、`grand-harmony`、`light-vein-blade`、`prism-arrow`、`light-guide`、`thunder-prism`、`radiant-fork`、`branchlight-barrage`、`convergence-cannon`、`myriad-light-array`、`solar-convergence`（最低 8）
