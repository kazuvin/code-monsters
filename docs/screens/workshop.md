# 育成・編成

## ID

`workshop`

## 目的

ショップ、編成、装備、配合、ガンビットを一つの準備画面へ集約し、次の戦闘へ向けた判断を行う。Run中でもっとも情報量と操作量が多い主要画面である。

現在のReact実装は `WorkshopScreen` が担当する。

## 入場と退出

- 入場: 初期ドラフト完了後、通常サイクル開始時、イベント結果確認後
- 退出: 主力3体を編成して「戦闘を開始する」を実行すると `battle` へ進む

## 640x360レイアウト

- 上部: RunHeader、cycle rail、図鑑入口、cycle・win・loss・coin
- 左領域: 主力3体と控え4体
- 中央領域: ショップ、装備、更新、棚固定
- 下部または右下: 次戦情報と戦闘開始
- Overlay: 配合、モンスター詳細、図鑑、確認、誕生演出、孵化演出

主画面へ全機能を同時に露出しない。選択と比較に必要な状態は残し、配合、詳細、図鑑は子サーフェスとして重ねる。

## 必須表示

- cycle、win、loss、coin、12cycle進行
- active 3枠とbench 4枠
- 各個体の名前、系統、属性、白星、色星、level、equipment
- モンスターショップ3枠
- 装備ショップ2枠
- 装備のレアリティとレアリティ別排出率
- 商品価格と購入可否
- 更新cost、無料更新数、棚固定状態、⭐2出現率
- 希少入荷率、卵の孵化までの保持回数
- 別れで得るcoinと、白星・level・色星・特性の内訳
- 早熟・晩成と役割を示す性能tag
- 配合可能level
- 主力3体が揃っているか
- 次の非同期対戦へ進む操作

## 操作

- モンスター購入、装備購入
- ショップ更新、棚固定
- active・bench間と各slot間の移動
- モンスター詳細を開く
- 装備、売却
- ガンビット3ルールを編集
- 配合を開く
- モンスター・スキル・イベント図鑑を開く
- 戦闘を開始する

## 状態

- roster 3〜7体
- active不足
- roster上限
- coin不足
- shop frozen
- 無料更新あり
- notice表示
- monster選択・drag中・drop target
- 配合可能・不可能
- 図鑑の未確認・輪郭確認・解放

## 子サーフェス

### 配合ラボ

親2体、成立候補、子の能力、継承率、固有スキル、継承スキル候補を表示する。複数候補が成立するときは結果を選べるようにする。

### 配合確認

消費する親、誕生する子、解除される装備、獲得coin、継承スキルを確定前に表示する。

### 誕生演出

子の名前、白星、色星、level、能力、スキルを段階表示し、完了後に育成画面へ戻す。

### モンスター詳細

profile、gambit、特殊配合のtabを持つ。能力の最終値と成長・個体値・装備内訳、別れcoinの内訳を表示する。必要経験値と能力成長量は、レベル2〜10を共通軸にした2段のgrowth scanで表示し、選んだレベルの値と現在levelを読めるようにする。すべてのモンスターで特殊配合tabを表示し、「この種を作る」「この種を使う」の両方向が存在しない場合は明示する。

### 孵化通知

卵が孵化したサイクルでは、卵の鼓動、亀裂、閃光、孵化個体の順に専用overlayで段階表示する。複数の卵は仲間枠の順で1体ずつ表示し、結果確認後に次の卵へ進める。演出終了後は孵化前後の白星と誕生したモンスター名をworkshop上部へ再掲する。

### フィールド図鑑

モンスター、スキル、イベントのtabを持つ。モンスターtabは基本45種と追加7種、全52種の発見状態、系統filter、詳細、成長scan、特殊配合を表示する。スキルtabは効果と基本所持モンスター、イベントtabは選択済みの旅路記録を表示する。発見状態はランをまたいで保持する。

開発者モードのスイッチはプロトタイプ上で常時表示する。ONの間だけ全図鑑を閲覧可能にし、実際の発見記録は変更しない。

### 特殊配合レシピ

作るrecipeと親として使うrecipeを区別し、未発見情報を仕様どおり隠す。

## アセット計画

- `workshop` visual master
- workbench背景
- panel、card、slot、tabの9-slice
- active・bench slot
- shop coin、reroll、freeze、lock icon
- equipment icon
- inspector tab
- dialog frame
- recipe connector
- catalog index card
- notice strip
- 64x64 monster sprite

商品名、価格、能力、ガンビット、図鑑番号を画像へ焼き込まない。

## Unity component候補

- `WorkshopScreenPresenter`
- `RunHeaderView`
- `PartyBoard`
- `RosterCard`
- `ShopPanel`
- `ShopOfferCard`
- `EquipmentOfferCard`
- `MonsterInspectorModal`
- `GambitEditor`
- `BreedingLabModal`
- `BreedingConfirmationModal`
- `BreedingRevealModal`
- `MonsterCatalogModal`
- `SpecialRecipeView`

## 高密度確認

- active 3体、bench 4体の7体所持
- 長い日本語名、色星2、装備あり
- shop商品5枠がすべて埋まる
- 詳細で7能力と内訳を表示
- gambit 3ルールの条件、行動、対象を表示
- 配合候補が複数成立
- モンスター図鑑52種、スキル図鑑、イベント図鑑と各詳細を表示

## 未決事項

- Unity版でdragを維持するか、選択後に移動先を選ぶ操作も用意するか
- 配合をfull-screen child viewにするかmodalにするか
- 640x360で図鑑一覧と詳細を同時表示する密度
