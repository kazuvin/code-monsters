# CODE MONSTERS

5×5の回路へ技ブロックをつなぎ、1対1の戦闘を見守るミニプロトタイプです。

## 遊び方

1. ブロックをクリックして効果と接続口を見る
2. ラックのブロックを長押しして回路へ置く
3. 盤面のブロックを長押しして移動・交換する
4. ブロックを回し、左のコアから通電させる
5. ショップでブロックを増やし「戦闘開始」で結果を見る

技は終端以外にも配置できます。通電中の技はそれぞれの間隔で自動発動し、接続している後続ブロックへも電流を通します。

## 開発

```bash
pnpm install
pnpm dev
pnpm verify
pnpm test:browser
```

- `src/game/game.json`: ユニット、ブロック、初期回路、経済、戦闘ルール
- `src/core/circuit.ts`: 接続口の回転と通電判定
- `src/core/battle.ts`: UIに依存しない決定的な1対1戦闘
- `src/core/loadout.ts`: 配置、交換、回転、取り外し
- `src/App.tsx`: ショップ、回路盤、長押しドラッグ、戦闘画面

旧リアルタイム版はブランチ `archive/realtime-prototype-v1` とタグ `realtime-prototype-v1` に保存しています。

## デプロイ

```bash
pnpm build
pnpm run deploy
```

Cloudflare Workers Static Assets に `dist/` を公開します。
