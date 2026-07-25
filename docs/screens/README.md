# 画面仕様

## 目的

主要画面ごとに、目的、表示情報、操作、状態、所有するオーバーレイ、画像アセットを一つのファイルへまとめる。ゲームルールの正本は `docs/game-system-spec.md`、画面仕様の正本はこのdirectoryとする。

主要画面は1画面1ファイルにする。小さなdialog、sheet、tab、toastは独立画面へ昇格させず、呼び出し元の主要画面に「子サーフェス」として記録する。複数の主要画面から同じサーフェスを使うようになった場合だけ、共通仕様へ分離する。

## 共通画面契約

- 横向き16:9固定
- 論理解像度 `640x360`
- Point Filterによる画面全体の整数倍拡大
- 余剰領域はレターボックス
- レイアウト座標と枠線は論理pixel整数
- モンスター1フレームは64x64
- 文字、数値、ゲーム状態は画像へ焼き込まない
- lineage、attribute、white stars、color stars、level、equipment、active・bench位置を判断箇所で見えるようにする
- 属性色は分類と視覚的アイデンティティとして使い、有利不利を示さない

画像制作は `docs/assets/image-asset-workflow.md` に従う。

## 主要画面一覧

| ID | 画面 | RunPhase・状態 | 仕様 |
|---|---|---|---|
| `draft` | 初期ドラフト | `draft` | [draft.md](draft.md) |
| `workshop` | 育成・編成 | `prepare` | [workshop.md](workshop.md) |
| `event-choice` | 旅路イベント選択 | `event` | [event-choice.md](event-choice.md) |
| `event-result` | 旅路イベント結果 | `event-result` | [event-result.md](event-result.md) |
| `battle` | 戦闘リプレイ | BattleViewStateあり | [battle.md](battle.md) |
| `battle-result` | 戦闘結果 | `result` | [battle-result.md](battle-result.md) |
| `run-finished` | ラン終了 | `finished` | [run-finished.md](run-finished.md) |

## 画面遷移

```text
Draft
  ↓ 3体決定
Workshop
  ↓ 戦闘開始
Battle
  ↓ リプレイ完了
Battle Result
  ├─ 最大12サイクル完了または5敗 → Run Finished
  ├─ イベントサイクル → Event Choice → Event Result → Workshop
  └─ 通常サイクル → Workshop

Run Finished
  └─ 新しいseedで開始 → Draft
```

## 子サーフェスの所属

| 子サーフェス | 所属する主要画面 |
|---|---|
| 候補モンスター詳細 | Draft、Workshop |
| 配合ラボ | Workshop |
| 配合確認 | Workshop |
| 誕生演出 | Workshop |
| モンスター詳細 | Workshop |
| ガンビット編集 | Workshopのモンスター詳細 |
| 特殊配合レシピ | Workshopのモンスター詳細・配合 |
| モンスター図鑑 | Workshop |
| notice strip | Workshop |
| 再生、一時停止、速度、skip | Battle |

## 画面ファイルの更新ルール

新しい主要画面を追加するときは次を行う。

1. stable English IDを決める。
2. このREADMEの一覧と遷移図へ追加する。
3. 同じIDのMarkdownを作る。
4. `designs/ui-masters/<screen-id>/` を画像制作の保存先にする。
5. 640x360の高密度状態を定義する。
6. 画面が所有する子サーフェスを列挙する。
7. ReactとUnityのどちらでもcoreの結果を表示するだけにし、画面でルール計算しない。

各画面ファイルは、少なくとも次を持つ。

- 目的
- 入場条件と退出先
- 640x360のレイアウト領域
- 必須表示
- 主要操作
- 状態と例外
- 子サーフェス
- アセット計画
- Unity component候補
- 未決事項
