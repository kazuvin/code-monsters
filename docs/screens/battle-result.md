# 戦闘結果

## ID

`battle-result`

## 目的

勝敗だけでなく、戦闘の理由、各monsterの貢献、経験値と成長を確認し、次の育成判断へつなげる。

現在のReact実装は `ResultScreen` が担当する。

## 入場と退出

- 入場: `battle` のreplayが完了したとき
- 退出:
  - 通常cycleは次の `workshop`
  - event cycleは `event-choice`
  - 12cycle完了または5敗は `run-finished`

## 640x360レイアウト

情報量が多いため、全内容を一度に縮小して押し込まない。固定画面内でsection切替またはscrollを使う。

- Hero: win、loss、draw、cycle
- Combat data: time、damage、received、survivors、旅路skill coin
- Combat ledger: monster別貢献
- Growth: active・benchのXP、level up、能力上昇
- Footer: 続行

## 必須表示

- 勝利、敗北、引き分け
- cycleと次の遷移
- 戦闘時間、与damage、被damage、生存数
- player・enemyのmonster別report
- damage、heal、shield、buff、debuff、action
- active 100%、bench 50%のXP
- 旅路skillによるcoin・追加XP
- level変化、次levelまで、能力上昇
- reveal完了前後の続行可否

## 操作

- 報酬をすべて表示
- combat ledgerを確認
- 次cycle、event、最終結果へ進む

## 状態

- win、loss、draw
- level upあり・なし
- active・bench
- reveal中・完了
- 次cycle、event、run終了

## 子サーフェス

独立modalは持たない。combat ledgerは同画面内のsectionとして扱う。

## アセット計画

- `battle-result` visual master
- win、loss、draw seal
- metric panel
- ledger row
- XP bar
- level-up marker
- reward particle
- 続行button
- 64x64 monster sprite

勝敗文字、metric、XP、能力上昇を画像へ焼き込まない。

## Unity component候補

- `BattleResultScreenPresenter`
- `BattleResultHero`
- `CombatMetricGrid`
- `CombatLedgerView`
- `MonsterCombatLedgerRow`
- `GrowthReportView`
- `ExperienceBar`

## 高密度確認

- player・enemy各3体のledger
- roster 7体のXP
- 複数level up
- 長いmonster名と多くの能力上昇

## 未決事項

- section tab、縦scroll、段階ページのどれで640x360へ収めるか
- combat ledgerを標準表示する情報量
