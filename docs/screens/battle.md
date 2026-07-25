# 戦闘リプレイ

## ID

`battle`

## 目的

決定済みの戦闘frameを再生し、3対3の状態、誰が何をしたか、HP・MP・ATB、状態変化、環境崩壊を読み取れるようにする。画面は戦闘結果を計算せず、coreのreplayを演出する。

現在のReact実装は `BattleScreen` が担当する。

## 入場と退出

- 入場: `workshop` から戦闘を開始したとき
- 退出: replay完了後に結果へ進むと `battle-result` へ移る

## 640x360レイアウト

- 上部: cycle、対戦情報、battle clock
- 中央: player 3体、arena divider、enemy 3体
- 各monster: 64x64または128x128の整数表示、名前、HP、MP、ATB、状態
- 下部: log、再生、一時停止、速度、skip、timeline

戦闘fieldとconsoleの情報を競合させない。monsterの足元とfeedback表示位置を全frameで固定する。

## 必須表示

- player・enemyの区別
- 各3体の配置
- 名前、白星、色星、level
- HP、MP、ATB
- 生存・戦闘不能
- 使用skill、対象、damage、heal、critical
- statusと残り時間
- battle time
- 45秒以降の環境崩壊
- replayの再生状態と速度
- 戦闘終了時のwinner

## 操作

- 再生・一時停止
- 速度1x、2x、4x
- 最終frameへskip
- replay完了後に戦闘結果へ進む

戦闘中のmonsterへ命令する操作は持たない。

## 状態

- idle
- acting
- targeted
- hit
- critical
- healed
- defeated
- status付与・解除
- environment damage
- player win、enemy win、draw
- reduced motion

## 子サーフェス

独立modalは持たない。skill callout、damage number、target FX、battle logをfieldとconsoleへ重ねる。

## アセット計画

- `battle` visual master
- battle背景
- arena divider
- team marker
- HP、MP、ATB bar
- status icon
- target cursor
- skill callout frame
- damage、heal、critical FX
- environment collapse FX
- 64x64 monster sprite sheet

monster spriteへteam色、HP bar、skill名、状態iconを焼き込まない。敵側反転で破綻しないside-viewまたは正面構図を採用する。

## Unity component候補

- `BattleReplayPresenter`
- `BattlefieldView`
- `BattleMonsterView`
- `BattleGaugeStack`
- `StatusIconRow`
- `BattleFeedbackLayer`
- `BattleConsole`
- `ReplayControls`

## 高密度確認

- 6体が生存
- 6体すべてにstatus
- 全体skill、複数damage number、criticalが同frame
- HP、MP、ATBの同時変化
- 4x replay
- 45秒以降

## 未決事項

- monsterを64x64の1倍にするか、field内で2倍にするか
- battle logを常時表示するか、直近数件だけにするか
- 16:9外のレターボックスへ装飾だけを出すか
