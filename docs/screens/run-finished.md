# ラン終了

## ID

`run-finished`

## 目的

12cycle完走または5敗によるラン終了を示し、最終編成、戦績、操作集計、再現可能なプレイテスト記録を確認・保存できるようにする。

現在のReact実装は `FinishedScreen` が担当する。

## 入場と退出

- 入場: 12cycleを完了したとき、または5敗したとき
- 退出: 新しいseedでランを開始すると `draft` へ戻る

## 640x360レイアウト

- 左または上部: 完走・敗退title、戦績、最終主力3体
- 右または中央: seed、所要時間、content version、操作集計
- 下部: log copy、JSON保存、新しい旅

記録情報を一画面へ押し込まず、主要結果とexport操作を優先する。詳細なcommand logはファイル内に保持し、画面へ全件表示しない。

## 必須表示

- 完走または敗退
- win、loss、completed cycles
- 最終active 3体の名前、白星、色星、level
- seed
- 所要時間
- content version、report schema、command log version
- 配合、購入、装備、更新、ガンビット、全操作数
- log copy
- JSON保存
- 新しい旅
- export結果notice

## 操作

- 航路記録をcopy
- JSONを保存
- 新しいseedでランを開始

## 状態

- 12cycle完走
- 5敗による終了
- copy成功・失敗
- JSON保存後

## 子サーフェス

独立modalは持たない。export結果は同画面内のnoticeとして表示する。

## アセット計画

- `run-finished` visual master
- completion・failure背景差分
- lineage sigil
- final party slot
- ledger panel
- export icon
- restart button
- 64x64 monster sprite

戦績、seed、version、操作集計を画像へ焼き込まない。

## Unity component候補

- `RunFinishedScreenPresenter`
- `FinalPartyView`
- `RunSummaryLedger`
- `PlaytestExportActions`
- `ExportNotice`

## 高密度確認

- 長いmonster名3体
- 全activity metricが3桁
- 長いcontent versionとseed
- copy失敗notice

## 未決事項

- Unity mobile buildでJSON保存を共有sheetにするか、アプリ管理領域へ保存するか
- copy操作をどのplatformまで提供するか
