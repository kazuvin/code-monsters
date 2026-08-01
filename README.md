# CODE MONSTERS

ショップで仲間を集め、特殊配合で新しい固有特性とスキル構成を作り、3体のシナジーを組むラン制モンスターオートバトラーです。

## 実装済み

- 3回選択する初期ドラフト
- 主力3体＋控え4体、装備1枠
- 3系統 × 3属性 × 5種の45基本種と追加5種
- 星・レベル・経験値・成長待ちのない即時編成
- 種ごとに固定された特性と、個体が選択保持する3スキル
- 18の店頭種から27の特殊配合限定種を作る54レシピ
- 配合時に親1・親2・子の候補から重複しない3スキルを選択
- ショップの特殊配合予兆と、結果から逆引きできる全公開配合図
- 2〜6ルールのガンビット、MP、ATB、会心、状態効果
- 決定論的な3対3戦闘、45秒からの環境崩壊ダメージ
- 12サイクル完走または5敗によるラン終了

## 開発

```bash
pnpm install
pnpm dev
pnpm verify
pnpm test:browser
pnpm build
pnpm exec wrangler dev
```

- `docs/game-system-spec.md`: 合意済みゲーム仕様
- `docs/architecture.md`: データ駆動コアとUnity移行方針
- `src/game/game.json`: コンテンツと調整値の単一ソース
- `src/core/`: UI非依存のラン・配合・ガンビット・戦闘ロジック
- `src/App.tsx`: WEB UI

URLへ `?seed=7261` を付けるとショップ、対戦相手、戦闘を同じ条件で再現できます。

## アーカイブ

- リアルタイム版: branch `archive/realtime-prototype-v1`, tag `realtime-prototype-v1`
- 回路版: branch `archive/circuit-prototype-v2`, tag `circuit-prototype-v2`

## デプロイ

```bash
pnpm build
pnpm run deploy
```

Cloudflare Workersへ公開します。
