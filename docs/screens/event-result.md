# 旅路イベント結果

## ID

`event-result`

## 目的

選んだイベントの結果と、誰または何が変化したかを明確に確認してから育成・編成へ進む。

現在のReact実装は `EventResultScreen` が担当する。

## 入場と退出

- 入場: `event-choice` でイベントを確定したとき
- 退出: 続行すると `workshop` へ進む

## 640x360レイアウト

- 上部: RunHeader
- 中央: event glyph、結果title、説明
- 対象がある場合: 対象monsterと変化
- 下部: 育成・編成へ進む操作

## 必須表示

- 選択したevent
- 成功、gain、risk、lossのtone
- 結果説明
- 対象monster
- coin、XP、shop補正などの変化
- 次へ進む操作

## 操作

- 結果を確認して育成・編成へ進む

## 状態

- gain
- risk成功
- risk失敗
- 対象monsterあり・なし

## 子サーフェス

なし。

## アセット計画

- `event-result` visual master
- tone別背景・枠
- event glyph
- reward・loss marker
- 64x64 monster sprite
- 続行button

結果数値と対象名を画像へ焼き込まない。

## Unity component候補

- `EventResultScreenPresenter`
- `EventResultPanel`
- `RewardDeltaView`
- `MonsterViewport`

## 高密度確認

- 長い結果説明
- 対象monster、複数の変化量、risk toneを同時表示

## 未決事項

- 結果の変化量をanimationしてから続行可能にするか
