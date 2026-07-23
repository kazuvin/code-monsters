# コアアーキテクチャとUnity移行方針

## 結論

このゲームはデータ駆動と相性が良い。モンスター数そのものより、「配合・継承・ガンビット・スキル効果」の組み合わせが増えていくため、種ごとのクラスを増やす設計より、共通ルールがデータを解釈する設計のほうが検証・バランス調整・Unity移行を行いやすい。

ただし、すべてをJSONへ押し込むのではなく、責務を次の2層へ分ける。

- JSON: コンテンツ、数値、組み合わせ、効果プログラム
- コアコード: 不変条件、計算順序、検証、効果の解釈

## 現在の境界

```text
src/game/game.json
  content + tuning
        |
        v
src/game/game-data.ts
  expand + validate
        |
        v
src/core/
  monster / shop / breeding / gambit / battle / run
        |
        +---- serializable state + replay ----> server / ghost storage
        |
        +---- serializable state + replay ----> React UI
        |
        `---- same DTO + seed contract -------> Unity C# core
```

Reactはゲーム結果を計算しない。入力コマンドをコアへ渡し、返された状態と戦闘フレームを表示する。

## 採用するパターン

### Functional Core / Imperative Shell

`src/core` は副作用を持たない計算層、React・保存・通信は外側のシェルとする。戦闘テストをブラウザやUnityなしで回せ、サーバーで同じ戦闘を再計算できる。

### Data Interpreter

スキル・特性・装備は `EffectDefinition` の列として表現し、戦闘リゾルバが順番に解釈する。新しいモンスターを追加するだけなら戦闘コードを変更しない。新しい効果の種類を追加するときだけ、判別共用体とリゾルバを一度拡張する。

### State Machine

ランは `draft -> event/prepare -> result -> finished` の明示的な状態を持つ。不正なフェーズの購入・配合・進行をコア側で拒否できる。オンライン化ではサーバーも同じ状態遷移を検証する。

### Command Functions

`buyMonster`、`breedInRun`、`updateGambit` などを状態と入力から新状態を返すコマンドとして扱う。将来はコマンド自体を判別共用体にして保存すれば、監査ログ、再送、対戦同期へ拡張できる。

### Strategy by Data

ガンビット条件、対象選択、ダメージ計算、ショップ抽選、配合候補算出を交換可能な方針として分離する。継承クラスではなく、安定IDとデータの組み合わせで選ぶ。

### Seeded Random Dependency

乱数はxorshift32を使い、シードを呼び出し元から注入する。同じコンテンツバージョン、入力、シードから同じショップ・ゴースト・戦闘を再現する。Unity側でも32bit演算順を一致させる。

### Replay Snapshot Log

戦闘結果は勝敗だけでなく、時刻・表示文・全戦闘者のスナップショットを持つフレーム列を返す。WEBとUnityは同じ結果を別速度・別演出で再生できる。将来はフレームを軽量イベントへ置換しても、入力契約は維持する。

### Repository / Adapter Boundary

永続化、ゴースト取得、マッチング、分析送信はコアへ直接入れず、将来のアダプタ層へ置く。ローカル保存、Cloudflare、Unityクライアントが変わってもルール層を変更しない。

## Unityへ移す単位

1. TypeScriptの判別共用体をC#のDTO（enum + record/class）へ写す
2. `game.json` をTextAssetとして読み、同じ検証を通す
3. xorshift32、丸め、同時解決、並び順をテストベクタで一致させる
4. `src/core` の純粋関数をC#サービスへ移す
5. UnityのMonoBehaviourは入力、アニメーション、オーディオ、画面遷移だけを担当する

ScriptableObjectは編集補助やインポート後キャッシュには使えるが、WEBと共有する正本はJSONに置く。MonoBehaviour継承やモンスター種別ごとのサブクラスをドメインモデルには使わない。

## 現時点で採用しないもの

- Unity ECS: 3対3とショップ中心の規模では複雑さが先に立つ
- モンスター種別ごとの継承階層: 配合で組み合わせるほど分岐が破綻する
- グローバル乱数・Singletonゲーム状態: 再現とサーバー再計算を壊す
- UIイベントから直接ステータスを書き換える方式: 不正状態と移植差分を生む

## 次の実装境界

ランク・オンライン対戦へ進む前に、コマンドログの共通形式、コンテンツバージョン互換、ゴーストスナップショット、サーバー再計算APIを追加する。ゲームバランスの調整はこの境界を変えず、原則 `game.json` の差し替えで行う。
