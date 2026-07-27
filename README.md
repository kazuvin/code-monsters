# CODE MONSTERS

ショップで仲間を集め、配合で血統を更新し、ガンビットを組んで3対3の戦闘を見守るラン制モンスターオートバトラーです。

現在のWEB版では、5敗で敗退するカジュアルモードと、招待URLで参加する12戦固定のオンライン1対1モードをプレイできます。

## 実装済み

- 3回選択する初期モンスタードラフト
- 3枠のモンスターショップ、2枠の装備ショップ、更新、棚固定
- 主力3体＋控え4体、装備1枠
- `光・闇・火 × 竜・悪魔・精霊 × 白星1〜3` の27種と、同じ通常配合へ参加する追加7種
- 位階配合、同名配合、特殊配合、色星、ステータス継承、1スキル継承
- 3ルールのガンビット、MP、素早さATB、会心、状態効果
- 決定論的な3対3戦闘とリプレイ
- 45秒から始まる環境崩壊ダメージ
- 主力・控えの経験値、サイクル3・6・9の仮イベント
- 12サイクル完走または5敗によるラン終了
- バージョン付き操作ログと、終了時のプレイテスト記録コピー・JSON保存
- PartyServer、PartySocket、Durable Objectsによる2人対戦室、編成同期、サーバー戦闘
- WebSocket Hibernation、席の復帰token、12戦同点時の最終編成サドンデス

## 開発

```bash
pnpm install
pnpm dev
pnpm verify
pnpm test:browser
pnpm build
pnpm exec wrangler dev
pnpm test:browser:online -- http://127.0.0.1:8787
```

- `docs/game-system-spec.md`: 合意済みゲーム仕様
- `docs/architecture.md`: データ駆動コアとUnity移行方針
- `docs/online-prototype.md`: オンライン構成、通信フロー、料金概算、制限
- `docs/assets/image-asset-workflow.md`: AI、Pixel Forge、Unityをつなぐ画像アセット制作手順
- `docs/screens/README.md`: 画面一覧、画面遷移、画面別仕様の索引
- `src/game/game.json`: コンテンツと調整値の単一ソース
- `src/core/`: UI非依存のラン・配合・ガンビット・戦闘ロジック
- `src/App.tsx`: カジュアル／オンラインモードを操作するWEB UI
- `src/worker.ts`: Static AssetsとPartyServerを配信するWorker
- `src/worker/match-room.ts`: 1対戦室を管理するDurable Object

URLへ `?seed=7261` を付けるとショップ、ゴースト、戦闘を同じ条件で再現できます。

## アーカイブ

- リアルタイム版: branch `archive/realtime-prototype-v1`, tag `realtime-prototype-v1`
- 回路版: branch `archive/circuit-prototype-v2`, tag `circuit-prototype-v2`

## デプロイ

```bash
pnpm build
pnpm run deploy
```

Cloudflare Workers Static Assets、Worker、SQLite-backed Durable Objectをまとめて公開します。
