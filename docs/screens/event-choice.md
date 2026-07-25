# 旅路イベント選択

## ID

`event-choice`

## 目的

イベントサイクルに3候補から一つを選び、育成方針へ短い変化を加える。効果、cost、risk、対象を確定前に理解できるようにする。

現在のReact実装は `EventScreen` が担当する。

## 入場と退出

- 入場: cycle 3、6、9の開始時
- 退出: 候補を確定すると `event-result` へ進む

## 640x360レイアウト

- 上部: RunHeaderとcycle rail
- 中央: event card 3枚
- card内: glyph、route、名前、説明、対象選択、確定

## 必須表示

- 現在cycle
- 候補3件
- event名、glyph、説明
- risk routeかどうか
- coin costと利用可否
- 対象が必要な場合のroster
- 現在選択している対象

## 操作

- 対象モンスターを選ぶ
- event候補を確定する

## 状態

- 通常効果
- risk効果
- coin不足
- 対象未選択
- roster 3〜7体

## 子サーフェス

独立dialogは持たない。対象選択をevent card内に表示する。

## アセット計画

- `event-choice` visual master
- event背景
- event card 9-slice
- risk frame
- route glyph frame
- target slot
- disabled state
- 64x64 monster sprite

event名、説明、cost、確率を画像へ焼き込まない。

## Unity component候補

- `EventChoiceScreenPresenter`
- `EventChoiceCard`
- `EventTargetPicker`
- `MonsterViewport`

## 高密度確認

- 3候補すべて説明が長い
- roster 7体から対象を選ぶ
- risk、通常、coin不足を同時に表示

## 未決事項

- roster 7体の対象選択を横railにするか、compact gridにするか
