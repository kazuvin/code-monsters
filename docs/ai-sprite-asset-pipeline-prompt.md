# Archived design brief: AI Sprite Production Pipeline

> This brief records the original pipeline proposal and is not the current character-animation policy. Final combat animation for `volt`, `bastion`, and `relay` is now hand-authored. Use AI generation for static backgrounds, equipment icons, portraits, effects, and non-animated props. The deterministic processing, QA, approval, and Unity export stages remain supported; follow `docs/sprite-asset-workflow.md` for the active workflow.

## あなたの役割

あなたは、ゲーム向け2Dアセットパイプラインの設計・実装経験を持つシニアソフトウェアアーキテクトです。

このリポジトリに、AI画像生成を利用したスプライト制作パイプラインを段階的に導入してください。一般論や独立したデモアプリではなく、現在のWebプロトタイプとUnity移行方針に接続できる実運用設計にしてください。

最終的な対象フローは次です。

```text
game-balance.jsonのユニット定義
  -> ユニット別アート仕様
  -> AI生成候補
  -> 決定論的な画像処理
  -> 自動品質検査
  -> 人間による承認
  -> Web用アセット生成
  -> Unity用アセット生成
```

AI生成結果をそのまま製品アセットとして採用してはいけません。AIは候補を作る非決定論的な入力元であり、正規化・検査・承認・公開はツール側の責務です。

## 最初に行うこと

実装や詳細設計を始める前に、必ず現在のチェックアウトを調査してください。少なくとも次を確認し、パスと実装上の事実を短く報告してください。

- `AGENTS.md`
- `package.json`
- `game-data/game-balance.json`
- `src/types.ts`
- `src/data.ts`
- `src/BattleScene.tsx`
- 戦闘表示に関係するCSS
- `docs/unity-migration.md`
- `unity/CodeMonsters/`
- `scripts/verify.mjs`
- 作業ツリーの既存差分

このプロンプトと現在の実装が食い違う場合は、現在のコードとリポジトリルールを優先してください。既存の未コミット差分はユーザーの作業として扱い、無関係な変更を上書き・整形・ステージングしないでください。

進行不能な不明点、生成画像の権利条件、利用する画像生成API、アートディレクションなど、成果を大きく変える判断が必要な場合は推測で進めず質問してください。それ以外は妥当な仮定を明示して進めてください。

## このプロジェクト固有の前提

### ゲームデータ

- `game-data/game-balance.json` がユニット、指示、リアクション、戦闘調整値などの正本です。
- ユニットやモーションを日本語名で関連付けてはいけません。`volt`、`bastion`、`attack`、`berserk` のような安定した英語IDで関連付けてください。
- 日本語名、ラベル、フレーバーテキストを条件分岐に使用してはいけません。
- アセット仕様にHP、攻撃力、価格などのゲームプレイ情報を複製してはいけません。
- ユニット色は `game-balance.json` の `unit.color` を参照し、アセット側へ同じ値を手入力で複製しないでください。
- アセット追加だけを理由にゲームデータの `schemaVersion` を変更しないでください。ゲームデータの破壊的変更が必要な場合だけ、リポジトリルールに従って更新してください。

### 現在の表示方式

- Web版はReact + TypeScript + Viteで動作しています。
- 戦闘キャラクターは現在、`BattleScene.tsx` とCSSの幾何形状・エフェクトで描画されています。
- 戦闘は横方向に進み、味方と敵は互いの方向を向きます。
- 元スプライトは右向きのサイドビューを正とし、左向きは実行時に反転する前提にしてください。文字、非対称な記号、利き手、武器など、単純反転できない要素が必要な場合だけ左右別アセットを許可してください。
- `BattleFlash.kind` と指示の `visualKind` が、戦闘表示イベントとアニメーションの主要な接続点です。
- `poison`、`guarded`、`berserk`、`taunted` などの継続状態は、原則としてベーススプライトへ焼き込まず、ランタイムのオーバーレイ、色変化、パーティクル、追加レイヤーとして表現してください。

### Unity

- Unityプロジェクトは `unity/CodeMonsters` にあります。
- Unity 6の現行プロジェクトはゲームルール移行のスパイクであり、完成済みのプレゼンテーション層やキャラクターPrefabが存在するとは仮定しないでください。
- `game-balance.json` はUnityでも正本のまま維持します。Prefab、Animator、ScriptableObjectへゲームプレイ値を複製しないでください。
- Unity向けのPNG、manifest、AnimationClip、AnimatorController、Prefabはプレゼンテーション資産として生成してください。
- 外部ツールからUnityの `.meta` や `.anim` YAMLを直接組み立てないでください。Unity Editor APIで生成し、GUIDの安定性を保ってください。

## 成果目標

ゲーム開発者が、既存ユニットIDと生成対象モーションを選び、1つのコマンドまたは開発者向けUI操作を実行すると、次が生成される状態を目指してください。

- 高解像度のAI生成候補と生成メタデータ
- 背景透過・正規化済みフレーム
- 固定パレットのピクセルアート
- モーション別プレビュー
- Web用スプライトシートまたはテクスチャアトラス
- Unity用スプライトシート
- 機械可読なアセットmanifest
- 品質検査レポート
- 承認後に生成されるAnimationClip
- AnimatorController
- プレゼンテーション用Prefab

ただし、生成ボタンを押しただけで未検査アセットが製品配置へ上書きされる設計は禁止します。処理状態を明確に分けてください。

```text
generated -> normalized -> validated -> approved -> published
```

`error` 判定が1件でもある候補は承認・公開できないようにしてください。`warning` は内容を表示し、人間が理由を確認したうえで承認できるようにしてください。

## 非目標

MVPでは次を行わないでください。

- ゲーム本体とは独立したキャラクターCRUDやユニット用データベースの構築
- `game-balance.json` と競合するユニットマスターの作成
- FastAPIサーバーやジョブキューの常時運用
- 全ユニット・全モーションの一括生成
- AI出力の無検査なUnity Import
- Unityのゲームロジックや完成済みシーンの構築
- 状態エフェクトを全フレームへ焼き込むこと
- `.unitypackage` をリポジトリ内の正本にすること
- 生成プロバイダー固有コードを画像処理ロジックへ混在させること

## アートディレクション

現在のゲームは、プログラムした指示に従って戦う小型ロボット「Code Monsters」を扱います。既存のユニット色、役割、攻撃タイプ、固有能力を読み取り、次を満たすデザインにしてください。

- 小さい表示サイズでもユニットをシルエットで識別できる
- 機械生命体、競技用ロボット、サイバーな戦闘UIと整合する
- 頭、胴、腕、脚、武器の関係がフレーム間で変形しない
- ユニットのアクセント色を維持する
- STRIKER、TANK、SUPPORT、VENOM、CHASE、BERSERKERの役割差が輪郭と装備に現れる
- melee、blunt、sniperの攻撃タイプが武器または攻撃姿勢から判別できる
- 右向きのサイドビューまたは軽い3/4サイドビューで統一する
- 正投影に近く、強い遠近感を使わない
- 地面、床の影、背景小物、UI、文字、ロゴを描かない
- 1フレームの外へ武器やエフェクトをはみ出させない

最初に7ユニットすべての詳細デザインをAIへ自由生成させてはいけません。まず1ユニットの基準デザインを生成・承認し、そのデザインをidentity referenceとして固定してからモーションを生成してください。

## モーション契約

モーション定義は、ゲームルールではなくプレゼンテーション設定として、安定した英語IDでJSON管理してください。YAMLとの二重対応は不要です。

現行の `BattleFlash.kind` を調査し、少なくとも次の分類を扱える設計にしてください。

### 共通の基本モーション

- `idle`
- `move`
- `attack`
- `hit`
- `death`

### アクション固有モーション

- `dash`
- `jump`
- `throw`
- `taunt`
- `pull`
- `retreat`
- `heal`
- `heavy`
- `poison`
- `burn`
- `follow`
- `guard`
- `berserk`
- `wait`

### 対象側リアクションまたは表示フォールバック

- `thrown`
- `pulled`
- `miss`

すべてのユニットにすべての固有モーションを生成してはいけません。`game-balance.json` の指示、`fixedFor`、`visualKind`、デフォルトプログラム、リアクションを読み取り、ユニットごとに必要なモーションを導出してください。

専用モーションがない場合のフォールバック規則をmanifestへ明示してください。例として `follow -> attack`、`dash -> move` のような対応は可能ですが、実データを調査して決めてください。日本語ラベルをフォールバック判定に使用してはいけません。

フレーム数、fps、loop、基準pivot、キャンバスサイズは1つの設定ファイルに集約してください。戦闘シミュレーションの時間進行はアニメーション尺に依存させず、表示側が戦闘イベントを消費する構造を維持してください。

## 推奨アーキテクチャ

MVPは、既存のNode.jsワークフローから呼び出せるローカルCLIとして実装してください。

```text
pnpm scripts / TypeScript orchestration
  -> game-balance loader and contract validation
  -> image-generation provider adapter
  -> Python CLI image processor (OpenCV + Pillow + NumPy)
  -> QA report and approval manifest
  -> Web asset publisher
  -> Unity Editor importer/generator (C#)
```

### TypeScriptが担当するもの

- `game-balance.json` からのユニット・指示・色・モーション要件の読み取り
- JSON Schemaまたは同等のランタイム検証
- 生成ジョブの組み立て
- 画像生成プロバイダーの抽象化
- run ID、ハッシュ、キャッシュ、状態遷移の管理
- Python CLIの呼び出し
- QA結果の集約
- 承認・公開コマンド
- Web用manifest生成

### Pythonが担当するもの

- 画像デコードと色空間正規化
- 背景除去
- 前景領域検出
- クロップ
- スケールと足元アンカーの正規化
- 高解像度画像からの縮小
- ピクセル化
- 固定パレットへの量子化
- 孤立ピクセルと小領域ノイズの除去
- スプライトシート合成
- 画像由来の品質指標計算

Pythonは標準入出力またはファイルベースのJSON契約を持つCLIにし、MVPではFastAPIサーバーにしないでください。入出力をplain dataに保ち、画像生成なしでもfixtureを使ってテスト可能にしてください。

Pythonと画像生成APIはアセット制作時だけ使うauthoring toolです。CloudflareへdeployされるWebランタイムやブラウザへ組み込まず、画像生成APIキーをフロントエンドへ渡してはいけません。

### C#が担当するもの

- approved manifestの検証
- TextureImporter設定
- SpriteMetaData相当のslice設定
- AnimationClip生成
- AnimatorController生成
- プレゼンテーション用Prefab生成
- Unity Editorテスト

### 将来の開発者向けUI

必要になった場合は、既存Reactアプリに開発時限定のAsset Labを追加できます。ただし、UIはCLIと同じユースケース層を呼び出し、画像処理をReactコンポーネントへ実装しないでください。ユニット一覧は `game-balance.json` から読み取り、追加・編集・削除機能は持たせないでください。

## 推奨ディレクトリ構成

現在のリポジトリ構造を確認したうえで、次を基準に具体化してください。

```text
game-assets/
  config/
    pipeline.json
    motions.json
    art-direction.json
  specs/
    units/
      <unitId>.json
  fixtures/
  runs/                    # 原則gitignore。未承認の生データと中間生成物
  approved/
    <unitId>/
      sprite-sheet.png
      manifest.json
      qa-report.json
      qa-report.html

packages/
  asset-contracts/
    schemas/

tools/
  asset-cli/
    src/
    tests/
  sprite-pipeline/
    pyproject.toml
    src/
    tests/

scripts/
  python-asset-setup.mjs
  python-asset-tests.mjs
  unity-assets-compile.mjs
  unity-assets-test.mjs

src/
  assets/
    generated/
      units/

unity/CodeMonsters/Assets/CodeMonsters/
  Presentation/
    Runtime/
    Editor/
    Generated/
    Tests/
```

未承認runと巨大なAI生成原画はGitへ無条件に追加しないでください。approved asset、生成物、Unityの `.meta` をどこまで追跡するかを、再現性、デプロイ、GUID安定性、リポジトリサイズの観点から決定し、文書化してください。

## データモデル

少なくとも次のモデルを設計してください。TypeScript、Python、C#で独自に曖昧な型を作らず、JSON Schemaなどの機械可読な契約を正本にする方法を優先してください。

### UnitArtSpec

- `schemaVersion`
- `unitId`
- `silhouette`
- `bodyParts`
- `weapon`
- `surfaceMaterials`
- `identityConstraints`
- `negativeConstraints`
- `paletteOverrides`（必要な場合のみ）
- `notes`

`unitId` 以外のゲームプレイ値や日本語名を複製しないでください。ユニット色、役割、攻撃タイプは生成時に `game-balance.json` から解決してください。

### MotionSpec

- `motionId`
- `frames`
- `fps`
- `loop`
- `canvasWidth`
- `canvasHeight`
- `pivot`
- `fallbackMotionId`
- `requiredFor`
- `generationHints`
- `validationThresholds`

### GenerationRun

- `runId`
- `unitId`
- `motionIds`
- `createdAt`
- `provider`
- `model`
- `seed`
- `promptVersion`
- `promptHash`
- `sourceGameSchemaVersion`
- `pipelineVersion`
- `inputHashes`
- `outputs`
- `status`

### AssetManifest

- `schemaVersion`
- `pipelineVersion`
- `unitId`
- `sourceRunId`
- `sourceGameSchemaVersion`
- `sheet`
- `palette`
- `motions`
- `frames`
- `pivot`
- `ppu`
- `fallbacks`
- `qaSummary`
- `approvedAt`
- `approvedBy`
- `contentHash`

各フレームには少なくとも `motionId`、`frameIndex`、矩形、pivot、durationまたはfps参照、画像ハッシュを持たせてください。並び順の暗黙依存だけでsliceしないでください。

### QualityIssue

- `code`
- `severity`: `error | warning | info`
- `unitId`
- `motionId`
- `frameIndex`
- `measuredValue`
- `threshold`
- `message`
- `suggestedAction`

## AI生成戦略

AIに完成済みの低解像度ドット絵や最終Unityアセットを作らせないでください。次の段階を分けてください。

1. 高解像度のidentity referenceを生成する
2. identity referenceを人間が承認する
3. 承認済みreferenceを条件としてモーション候補を生成する
4. 元画像と生成条件をimmutableなrunとして保存する
5. 決定論的な画像処理を行う
6. 自動QAとプレビューを生成する
7. 人間が候補を承認する
8. approved assetからのみWebとUnityへ公開する

キャラクター全体と全モーションを1枚のAI画像へ詰め込むことを前提にしないでください。プロバイダーが参照画像や編集機能を持つ場合はidentity referenceを利用し、持たない場合は再現性の限界を明示してください。

画像生成プロバイダーはadapterで隠蔽し、prompt assembly、API通信、レスポンス保存を分離してください。APIキーや秘密情報をリポジトリへ保存してはいけません。

### 生成プロンプトに含める内容

- Code Monstersの共通アートディレクション
- 対象ユニットの安定ID
- `game-balance.json` から取得した役割、攻撃タイプ、アクセント色
- UnitArtSpecの外形、装備、武器、素材
- 対象モーションとフレームごとの動作意図
- 右向きサイドビュー
- 一定カメラ、一定倍率、一定地面位置
- 全身が収まり、外周に安全余白があること
- 強い遠近感がないこと
- 背景が完全な単色であること
- 床、影、文字、UI、追加キャラクターがないこと
- identity referenceから形状、配色、部品数、武器を変えないこと

背景色は固定の `#00FF00` に決め打ちせず、対象パレットから知覚的に十分離れた色をパイプラインが選択してください。背景除去は画像全体の同色ピクセルを単純削除せず、画像外周から連結した背景領域を基準にしてください。これにより、キャラクター内部に偶然同じ色が現れた場合の欠損を減らします。

### ネガティブ制約

- pixel art
- low resolution
- text
- logo
- UI
- floor
- cast shadow
- scenery
- gradient background
- multiple characters
- cropped body
- cropped weapon
- perspective camera
- motion blur
- glow merged into silhouette
- detached limbs
- extra limbs
- missing weapon
- inconsistent armor
- inconsistent proportions

ネガティブプロンプトは補助でしかありません。遵守判定は必ず後段の検査で行ってください。

## 画像処理パイプライン

処理順を固定し、各ステップの入力・出力・設定・メトリクスを保存してください。

1. 入力デコードとEXIF orientation補正
2. sRGBへの色空間正規化
3. 解像度、破損、alpha、背景色の事前検査
4. 外周から連結した背景領域の抽出
5. 色差とエッジを使ったalpha mask生成
6. 小領域ノイズ除去と穴埋め
7. 前景connected componentsの分析
8. 本体、武器、意図した分離パーツを考慮したbounding box取得
9. 切れ検出と安全余白検査
10. 基準フレームに対するスケール正規化
11. 足元baselineとpivotの正規化
12. 固定キャンバスへの配置
13. 高解像度からの縮小
14. 輪郭安定化と孤立ピクセル除去
15. 知覚色空間での固定パレット量子化
16. 必要な場合だけ決定論的なordered dithering
17. alpha値の正規化
18. モーション内・モーション間QA
19. スプライトシート合成
20. manifest、プレビュー、QAレポート生成

Nearest Neighborでの単純縮小だけをピクセル化と呼ばないでください。高解像度からAreaまたはLanczos系で縮小した後に、輪郭整理、色数削減、固定パレット変換を行ってください。誤差拡散ディザはフレーム間のちらつきを生みやすいため、デフォルトで使わないでください。

各フレームを個別のbounding boxいっぱいに拡大しないでください。identity referenceから得た基準身長、基準baseline、共通pivot、固定キャンバスを使い、アニメーション時の足元の跳ねと見かけ上の体格変化を防いでください。

## パレット

共通のアウトライン色・金属色・ハイライト色と、`unit.color` 由来のアクセント色を組み合わせた固定パレットを基本としてください。

パレットは次を満たしてください。

- ユニットごと、runごとに勝手に再生成されない
- manifestにパレットIDとハッシュが残る
- `unit.color` との色差が許容範囲内
- 透明色を色数へ含めるかを明記する
- 色距離は単純RGB距離ではなくLabまたはOKLab系を使う
- アニメーション全フレームへ同一パレットを適用する
- 状態エフェクト用パレットはベースキャラクターと分離できる

## 品質検査

検査は再現可能な数値と安定したissue codeを返してください。「よさそう」のような主観だけで合否を決めてはいけません。

### 必須の構造検査

- ファイルをデコードできる
- unit IDとmotion IDが既知である
- 必須モーションが存在する
- フレーム数がMotionSpecと一致する
- フレームサイズが一致する
- sheet rectangleが重複・範囲外になっていない
- manifestのハッシュが実ファイルと一致する
- 透明背景である
- 許容色数以内である
- UnityとWebが同じmanifest schemaを解釈できる

### 必須の画像検査

- 背景色の残留率
- 外周へ接する前景ピクセル
- 上下左右の安全余白
- 前景占有率
- 透明率
- 不透明・半透明ピクセルの比率
- 小さすぎるconnected componentの数と面積
- baselineのフレーム間偏差
- pivotのフレーム間偏差
- 前景bounding boxの高さ・幅の急変
- 重心のフレーム間偏差
- 隣接フレームのsilhouette IoU
- 隣接フレームの画像差分
- 重複フレームの疑い
- 極端に差が大きいフレームの疑い
- パレット外色
- アクセント色の消失
- 武器または主要部品の消失の疑い

「武器消失」や「形状崩壊」は、単一の簡易ヒューリスティックで確実に判定できると主張しないでください。UnitArtSpecの部品領域、輪郭、色、参照画像との類似度など複数の信号を使い、確信度が低い場合はwarningとして人間へ提示してください。

loopモーションは最終フレームから先頭フレームへの差分も検査してください。静止しすぎるモーションと変化しすぎるモーションの両方を検出してください。閾値はコードへ埋め込まず、名前付き設定として管理してください。

### QA出力

- machine-readable JSON
- 人間が確認しやすいHTMLまたは画像レポート
- 元画像、処理後画像、alpha mask、bounding box、baseline、pivotの比較
- モーション再生プレビュー
- issueごとのseverity、測定値、閾値、対象フレーム

自動補正を行った場合は、何をどの値からどの値へ変更したかをレポートへ残してください。補正によってissueを黙って消さないでください。

## Web公開設計

Web版は、approved manifestから生成したアセットだけを参照してください。

- `BattleFlash.kind` とmanifestのmotion IDを対応付ける
- 左右反転は表示層で行う
- `image-rendering: pixelated` を使う
- フレーム選択、経過時間、loop処理を小さなテスト可能なモジュールへ分離する
- 戦闘ルールや `src/core/` から画像・DOM・Reactへ依存しない
- CSSスプライトを一度に削除せず、未生成モーションや未承認ユニットには既存表示をフォールバックとして残せる構造にする
- 状態表示と攻撃エフェクトをベースアニメーションから分離する
- 画像読み込み失敗時に戦闘進行を止めない

Web表示の置き換えはアセットパイプラインそのものと別フェーズにし、差分と回帰範囲を小さくしてください。

## Unity Export設計

approved manifestとPNGをUnity Editor拡張が読み込み、次を生成してください。

### Texture Importer

- Texture Type: Sprite
- Sprite Mode: Multiple
- Filter Mode: Point
- Compression: None
- Generate Mip Maps: Off
- Alpha Is Transparency: On
- Read/Write: 必要な場合のみOn
- Pixels Per Unit: manifest参照
- Mesh Type: Full Rectを基本とし、必要性が確認できた場合のみ変更
- Pivot: manifest参照の足元pivot

### 生成アセット

- sliced sprites
- AnimationClip
- AnimatorControllerまたはAnimatorOverrideController
- プレゼンテーション用Prefab
- import result report

AnimationClip名、Animator state名、Prefab名は安定IDから決定してください。日本語表示名をパスや参照キーにしないでください。

Prefabは描画とアニメーション再生の責務に限定し、HP、攻撃力、速度、指示ロジックを保持しないでください。将来のUnity戦闘エンジンがplain dataのbattle eventを渡し、プレゼンテーション層がmotion IDへ変換する境界を保ってください。

生成処理は冪等にし、同じmanifestを再Importしても不要な差分やGUID変更が発生しないようにしてください。生成先パスを安定させ、Unity Editorテストで次を検証してください。

- manifest schemaの受理・拒否
- sprite slice数と矩形
- pivot
- TextureImporter設定
- AnimationClipのフレーム数、fps、loop
- Animator stateとfallback
- 再Importの冪等性

`.unitypackage` 出力は必要になった場合の配布機能として追加できますが、リポジトリ内の通常開発では `Assets/CodeMonsters/Presentation` 配下のファイルを正規ルートとしてください。

## CLI契約

具体的なスクリプト名は現在の `package.json` に合わせて決めて構いませんが、MVPでは次の用途を分離してください。

```text
pnpm assets:requirements --unit volt
pnpm assets:generate --unit volt --source-dir <sourceDir> --motions idle,move,attack,follow,hit,death
pnpm assets:process --run <runId>
pnpm assets:validate --run <runId>
pnpm assets:preview --run <runId>
pnpm assets:approve --run <runId> --by <reviewer>
pnpm assets:publish --unit volt
```

MVPの `generate` は、外部で作成した高解像度PNGをimmutable runへ取り込む `manual` providerとして実装してください。各コマンドは失敗時に非0で終了し、JSONレポートを出力できるようにしてください。MVPの全コマンドはネットワークと画像生成APIなしで実行できるようにしてください。

approved assetを上書きする場合は、既存バージョンとの差分、content hash、QA結果を表示し、明示的な承認なしに置換しないでください。

## MVP

最初の縦切りは `volt` 1体に限定してください。`volt` は開始ユニットであり、通常攻撃・接近・固有の追撃を持つため、基本フローと固有リアクションの両方を確認できます。

MVP対象モーションは次を基準にし、現在のゲームデータから必要性を再確認してください。

- `idle`
- `move`
- `attack`
- `follow`
- `hit`
- `death`

MVPの完了条件は次です。

1. `game-balance.json` から `volt` の存在、色、役割、攻撃タイプ、必要モーションを取得できる
2. UnitArtSpec、MotionSpec、GenerationRun、AssetManifestの契約が検証できる
3. fixture画像を使い、AI APIなしで画像処理全体をテストできる
4. 生成候補と処理結果がrun IDで分離される
5. 背景除去、アンカー正規化、固定パレット変換、sheet生成が決定論的である
6. QA errorがあるrunをapproveできない
7. approved assetだけをWeb用出力へpublishできる
8. Unity Editor拡張が同じmanifestからSprite、AnimationClip、Animator、Prefabを生成できる
9. 同じ入力を再処理した結果のcontent hashが一致する
10. テスト、実行方法、既知の限界が文書化されている

AI生成APIの接続をMVPの最初の作業にしないでください。まずfixtureで決定論的な処理・検査・公開境界を完成させ、その後provider adapterを接続してください。

## 段階的な実装順

### Phase 0: 現状調査と契約

- 現行ユニット、指示、BattleFlash、Unity境界を調査
- ADRまたは短い設計文書を作成
- manifestとissue codeを定義
- tracked / generated / ignoredファイル方針を決定

### Phase 1: 決定論的な画像処理

- Python CLIの最小構成
- fixture
- 背景除去
- crop、scale、baseline、pivot正規化
- palette量子化
- sheet生成
- unit testsとgolden tests

### Phase 2: QAと承認

- 構造検査
- 画像メトリクス
- JSON/HTMLレポート
- approve/publish状態遷移
- content hashと再現性検査

### Phase 3: 画像生成adapter

- provider-neutral interface
- prompt builder
- provenance保存
- retry、timeout、rate limit、失敗処理
- identity reference運用

### Phase 4: Web表示

- manifest loader
- sprite animation runtime
- CSS表示との段階的な切り替え
- 状態・攻撃FXのレイヤー維持
- ブラウザ回帰テスト

### Phase 5: Unity Import

- Editor importer
- TextureImporter設定
- Clip、Controller、Prefab生成
- EditMode tests
- 冪等Import

### Phase 6: 対象拡大

- 7ユニットへの展開
- 固有モーション
- バッチ実行
- 差分再生成
- 開発者向けAsset Lab
- CIでのapproved asset検証

各Phaseを、別のAI実装タスクとして渡せる大きさへ分割してください。各タスクには対象ファイル、入出力、受け入れ条件、実行コマンド、テスト、対象外を記載してください。

## テストと完了ゲート

画像生成APIの結果そのものをCIの必須条件にしてはいけません。CIはfixture、保存済みmanifest、決定論的処理、importerを検証してください。

少なくとも次を用意してください。

- TypeScriptのschema/contract tests
- 必要モーション導出テスト
- provider adapterのmock test
- Python unit tests
- 画像golden tests
- 同一入力のhash再現テスト
- QA threshold境界テスト
- approve拒否テスト
- Web animation mapping test
- Unity EditMode importer tests

リポジトリの既存ルールに従い、対応ファイルを編集したらformatterと関連検証を実行してください。

- `pnpm format`
- `pnpm verify`
- `pnpm test:unity-core`
- 戦闘表示を変更した場合は、変更内容に応じて `test:ability`、`test:berserker`、`test:knockback`、`test:miss`、`test:sniper`、`test:visual`

新しいアセット検査コマンドは最終的に `pnpm verify` から非書き込みモードで実行できるようにしてください。ただし、ネットワークアクセスやAI生成APIを `pnpm verify` に含めてはいけません。

既存の未コミット差分がある場合、リポジトリ全体への書き込みformatterがその差分を変更しないか確認してください。安全に分離できない場合は、対象ファイル限定の検証を行い、その制約を報告してください。

## コーディング原則

TypeScript、Python、C#すべてで次を守ってください。

- 小さく決定論的な関数を優先する
- 画像生成、画像処理、検査、公開、Unity生成を分離する
- plain serializable dataを境界にする
- 副作用をadapterとCLI entrypointへ閉じ込める
- ファイルを責務単位に分割する
- コメントは「なぜこの制約が必要か」「なぜ別案を採らないか」を中心にする
- ローカライズ文字列で分岐しない
- 閾値や画像サイズをコードへ直書きしない
- 同じ入力とバージョンから同じ処理結果を得られるようにする
- エラーを握りつぶさず、安定したcodeと対象を返す
- 外部コマンド失敗、破損画像、部分出力を正常系として扱わない
- APIキー、秘密情報、巨大な未承認画像をコミットしない
- AIが続きを実装しやすいことより、契約と受け入れ条件が明確であることを優先する

DDDや多数の抽象レイヤーは不要です。ただし、AI provider、画像処理、manifest検証、公開先は交換可能な境界として分離してください。

## 出力してほしいもの

最初の回答では巨大な実装を始めず、調査結果に基づいて次を順番に提示してください。

1. 現状のリポジトリ構成と、この機能が接続する実ファイル
2. 元の構想から変更すべき点と理由
3. 重要な前提、未決事項、必要なら質問
4. 全体アーキテクチャ
5. ディレクトリ構成
6. JSON契約とschema管理方針
7. ユニット別モーション導出方法
8. AI生成戦略とprompt template
9. 画像処理パイプライン
10. QAアルゴリズム、issue code、初期閾値
11. Web公開設計
12. Unity Import設計
13. MVPのファイル単位実装計画
14. Phaseごとの次AI向けタスク一覧
15. テスト戦略と完了コマンド
16. リスク、非目標、将来拡張

設計上の数値を提案する場合は、根拠と調整場所を示してください。未確認のライブラリ、API機能、Unity packageが存在すると仮定しないでください。

設計レビュー後に実装を依頼された場合は、一度に全Phaseへ着手せず、Phase 0とPhase 1の最小縦切りから実装・検証し、実際の変更ファイル、テスト結果、残課題を報告してください。
