# ビルド・シナジーマトリクス

> `src/game/game.json` から生成します。直接編集しないでください。

## 毒（`poison`）

| 項目 | 内容 |
| --- | --- |
| 配置思想 | 長い経路と循環 |
| 得意 | 後半の継続成長 |
| リスク | 立ち上がりが遅い |
| 戦い方 | 毒を重ねながら回路を繰り返し通し、戦闘中強化を後半の圧力へ変える |

### 役割

| 役割 | 対応する技 |
| --- | --- |
| 起点 | `poison-needle` |
| 育成 | `poison-needle`、`cultivation-blade`、`toxic-reservoir`、`status-relay`、`long-route-fang` |
| 回す | `serpentine-venom`、`return-coil`、`long-route-fang` |
| 維持 | `corrosion-film`、`toxic-reservoir` |
| 活かす | `venom-bloom`、`rupture-stake` |

### 決め手

| 分岐 | 方針 | 育成・循環・活用技 | 固有の決め手 |
| --- | --- | --- | --- |
| 培養 | 毒を残して育てる | `poison-needle`、`cultivation-blade`、`serpentine-venom`、`corrosion-film`、`toxic-reservoir`、`venom-bloom`、`status-relay`、`return-coil`、`long-route-fang` | `venom-bloom` |
| 破裂 | 毒を一気に破裂させる | `poison-needle`、`serpentine-venom`、`toxic-reservoir`、`rupture-stake`、`status-relay`、`return-coil`、`long-route-fang` | `rupture-stake` |

### 開放性と実装状況

- 開放スキル: `status-relay`、`return-coil`、`long-route-fang`
- 専用技率: 70%（上限 75%）
- 計画中: —
- 実装済み: `poison-needle`、`cultivation-blade`、`serpentine-venom`、`corrosion-film`、`toxic-reservoir`、`venom-bloom`、`rupture-stake`、`status-relay`、`return-coil`、`long-route-fang`（最低 10）
