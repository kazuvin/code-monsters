# CODE MONSTERS

ショップで仲間を集め、配合で血統を更新し、ガンビットを組んで3対3の戦闘を見守るラン制モンスターオートバトラーです。

現在のWEB版では、12サイクル固定・5敗で敗退するカジュアルモードを最後までプレイできます。

## 実装済み

- 3回選択する初期モンスタードラフト
- 3枠のモンスターショップ、2枠の装備ショップ、更新、棚固定
- 主力3体＋控え4体、装備1枠
- `光・闇・火 × 竜・悪魔・精霊 × 白星1〜5` の45種カタログ
- 位階配合、同名配合、特殊配合、色星、ステータス継承、1スキル継承
- 3ルールのガンビット、MP、素早さATB、会心、状態効果
- 決定論的な3対3戦闘とリプレイ
- 45秒から始まる環境崩壊ダメージ
- 主力・控えの経験値、サイクル3・6・9の仮イベント
- 12サイクル完走または5敗によるラン終了

## 開発

```bash
pnpm install
pnpm dev
pnpm verify
pnpm test:browser
```

- `docs/game-system-spec.md`: 合意済みゲーム仕様
- `docs/architecture.md`: データ駆動コアとUnity移行方針
- `src/game/game.json`: コンテンツと調整値の単一ソース
- `src/core/`: UI非依存のラン・配合・ガンビット・戦闘ロジック
- `src/App.tsx`: カジュアルモードを操作するWEB UI

URLへ `?seed=7261` を付けるとショップ、ゴースト、戦闘を同じ条件で再現できます。

## アーカイブ

- リアルタイム版: branch `archive/realtime-prototype-v1`, tag `realtime-prototype-v1`
- 回路版: branch `archive/circuit-prototype-v2`, tag `circuit-prototype-v2`

## デプロイ

```bash
pnpm build
pnpm run deploy
```

Cloudflare Workers Static Assets に `dist/` を公開します。
