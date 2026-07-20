# CODE MONSTERS

3体のモンスターに4つの命令を並べ、同時実行されるターン制バトルを見守るミニプロトタイプです。

## 遊び方

1. 作戦ボードのマスを選ぶ
2. 命令チップを置く
3. ショップで命令を増やす
4. 「プログラム実行」で3対3の結果を見る

`もう一度` は、ひとつ前の命令を再実行します。連鎖は2段までです。

## 開発

```bash
pnpm install
pnpm dev
pnpm verify
pnpm test:browser
```

- `src/game/game.json`: ユニット、命令、初期構成、ゲームルール
- `src/core/`: UIに依存しない決定的な戦闘・ショップ・装備ロジック
- `src/App.tsx`: 状態管理と画面
- `src/styles.css`: ピクセルアート風のプレゼンテーション

旧リアルタイム版はブランチ `archive/realtime-prototype-v1` とタグ `realtime-prototype-v1` に保存しています。

## デプロイ

```bash
pnpm build
pnpm run deploy
```

Cloudflare Workers Static Assets に `dist/` を公開します。
