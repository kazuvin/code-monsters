# CODE MONSTERS

5×5の回路へ技ブロックをつなぎ、1対1の戦闘を見守るミニプロトタイプです。

## 遊び方

1. ブロックをクリックして効果と接続口を見る
2. ラックのブロックを長押しして回路へ置く
3. 盤面のブロックを長押しして移動・交換する
4. 心臓を長押しで移動し、上下左右の接続口から技へ通電させる
5. ショップ横の機体強化へコインを使うと最大HPと上位レアの排出率が増える
6. ショップでブロックを増やし「戦闘開始」で結果を見る

技は、状態をパケットへ加える「生成」、状態を問わず加工する「回路演算」、届いた状態を戦闘結果へ変える「変換」に分かれます。
分岐・合流・複製・刻印・再循環を組み合わせ、同じ毒やチャージを攻撃・防御・回復の異なる終端へ届けます。
現在はこの組み合わせ自体の面白さを確認するため、役割が重複しない14枚にカタログを絞っています。

## 開発

```bash
pnpm install
pnpm dev
pnpm design:matrix
pnpm design:matrix:check
pnpm verify
pnpm test:browser
```

- `src/game/game.json`: ユニット、ブロック、初期回路、経済、戦闘ルール
- `src/game/build-design.ts`: ビルドの役割・決め手・開放性の検証とマトリクス生成
- `docs/build-synergy-matrix.md`: `game.json`から生成するビルド設計の一覧
- `docs/state-circuit-synergy-matrix.md`: 状態軸・回路軸・出力軸を分離する次期設計
- `src/core/circuit.ts`: 接続口の回転と通電判定
- `src/core/packet.ts`: 汎用パケットの分岐・合流・複製・刻印・再循環・変換
- `src/core/battle.ts`: UIに依存しない決定的な1対1戦闘
- `src/core/loadout.ts`: 技の配置・交換・回転・取り外しと、撤去できない心臓の移動
- `src/App.tsx`: ショップ、回路盤、長押しドラッグ、戦闘画面

旧リアルタイム版はブランチ `archive/realtime-prototype-v1` とタグ `realtime-prototype-v1` に保存しています。

## デプロイ

```bash
pnpm build
pnpm run deploy
```

Cloudflare Workers Static Assets に `dist/` を公開します。
