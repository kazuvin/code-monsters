# 画像アセット制作ワークフロー

## 目的

AIで作った全体UIとパーツ原稿を、兄弟リポジトリ `../pixel-forge` で再現可能なピクセルアートへ変換し、Unityでコンポーネントとして組み立てる。

全体UI画像は完成画面の見た目を決める「ビジュアルマスター」として扱う。文字、数値、ボタン、カード、ゲージなどの動的UIを1枚の画像へ焼き込まず、ビジュアルマスターから抽出・再制作した部品をUnityで再構成する。

## 制作契約

- ゲームウィンドウは横向き16:9へ固定する。
- UIの論理解像度は `640x360` とする。
- 実画面へはゲーム画面全体をPoint Filterで整数倍拡大する。
- 端末解像度が整数倍にならない余白はレターボックスとして残し、引き伸ばさない。
- モンスターの1フレームは `64x64`、Unityの標準PPUは64とする。
- 基準画面内の画像拡大は1倍、2倍などの整数倍率だけを使う。
- 配置、枠線、余白、9-slice borderは論理pixel整数で定義する。
- 日本語、数値、ゲーム状態は画像へ含めず、Unityのテキストとデータバインドで表示する。
- stable English IDをファイル名、manifest、Unity参照へ使い、日本語名で分岐しない。
- 属性色は分類と視覚的アイデンティティであり、戦闘上の有利不利を示す演出にしない。

## 成果物の分類

| 種別 | 制作単位 | Unityでの扱い |
|---|---|---|
| 全体UI | 640x360のビジュアルマスター | 実装比較用。原則として直接操作UIに使わない |
| 固定背景 | 640x360 PNGまたは複数レイヤー | Point Filterの背景Sprite |
| パネル・ボタン・スロット | 個別透過PNG | SimpleまたはSliced Image |
| UI icon | 個別透過PNG | Simple Image、Sprite Atlasへ収録 |
| モンスター | 64x64フレームのsprite sheet | SpriteRenderer、AnimationClip |
| 戦闘・状態FX | 小さなsprite sheet | SpriteRendererまたはUI Image animation |
| 文字・数値 | 画像化しない | Unityのテキストコンポーネント |

## 推奨ディレクトリ

制作を開始するときは、Code Monsters側へ次の構成で保存する。

```text
designs/
├─ ui-masters/
│  └─ <screen-id>/
│     ├─ wireframe-640x360.png
│     ├─ ai-source.png
│     ├─ visual-master-640x360.png
│     ├─ visual-master.recipe.json
│     └─ unity-reference-640x360.png
├─ ui-kit/
│  ├─ code-monsters-ui.palette.json
│  ├─ code-monsters-ui.palette.png
│  ├─ ui-kit.sprite.json
│  ├─ ui-kit.parts-source.png
│  └─ output/
└─ monsters/
   └─ <monster-id>/
      ├─ <monster-id>.sprite.json
      ├─ <monster-id>.parts-source.png
      └─ output/
```

AIの不採用案を無制限に追跡せず、採用候補、最終原稿、recipe、manifest、Unity比較画像を残す。Pixel Forgeの一時buildや再生成可能な拡大previewは、必要になるまでCode Monstersへ複製しない。

Unity projectを作成した後は、最終アセットを次の責務へ分ける。

```text
Assets/CodeMonsters/Presentation/
├─ UI/
│  ├─ Sprites/
│  ├─ Atlases/
│  ├─ Fonts/
│  └─ Prefabs/
├─ Monsters/
├─ Effects/
└─ Backgrounds/
```

## 画面制作の流れ

### 1. 画面仕様を確定する

対象画面の `docs/screens/<screen-id>.md` を読み、目的、表示情報、操作、状態、所有するオーバーレイを確認する。新しい主要画面なら、画像生成より先に画面仕様を追加する。

### 2. 640x360ワイヤーフレームを作る

実データの最大量を前提に配置を決める。AIへ画面構成を自由に決めさせない。

- 文字領域は実際の日本語に近い長さを確保する。
- モンスターは64x64または128x128の整数枠で配置する。
- 1pxの枠線と4pxまたは8pxのspacing gridを優先する。
- 重要操作をノッチやレターボックス境界へ寄せない。
- モーダルを開いた状態も別wireframeとして確認する。

### 3. AIで全体UI原稿を作る

ワイヤーフレームを構図参照、既存のパレットと画面仕様を制約として渡す。

生成時の原則:

- 16:9で作る。
- 文字、数字、ロゴ、モンスター名を描かせない。
- 余計なパネル、操作、装飾を追加させない。
- hard-edged panel、抑制した装飾、field-journalの観察記録感を維持する。
- plum、ivory、coral、mint、goldを中心とした現行visual languageへ合わせる。
- モンスター、HP bar、色星、装備などの動的要素はplaceholderか別レイヤーにする。

全体UIのAI原稿はレイアウトの正本ではない。ワイヤーフレームの配置を維持したまま、質感、色面積、枠、背景、視線誘導を提案する資料として使う。

### 4. Pixel Forgeで640x360へ変換する

最初の採用画面はPixel Forgeの自動paletteで変換し、ビジュアルマスター候補を作る。

```bash
cd ../pixel-forge

cargo run -p pixel-cli -- convert \
  ../code-monsters/designs/ui-masters/<screen-id>/ai-source.png \
  --output ../code-monsters/designs/ui-masters/<screen-id>/visual-master-640x360.png \
  --width 640 \
  --height 360 \
  --colors 12 \
  --dither none \
  --scale 1 \
  --recipe ../code-monsters/designs/ui-masters/<screen-id>/visual-master.recipe.json
```

入力も16:9にし、意図しない中央cropを避ける。UIの大きな色面と直線を守るため、標準ではditherを使わない。

### 5. 共通paletteを確定する

承認したビジュアルマスターからCode Monsters用palette artifactを作る。

```bash
cd ../pixel-forge

cargo run -p pixel-cli -- palette extract \
  ../code-monsters/designs/ui-masters/<screen-id>/visual-master-640x360.png \
  --output ../code-monsters/designs/ui-kit/code-monsters-ui \
  --name "Code Monsters UI" \
  --colors 12
```

出力される `.palette.json` を色列の正本とし、swatch PNGとprompt MarkdownをAI生成にも渡す。現在のWeb presentation tokenは `src/styles.css`、属性色は `src/game/game.json` が正本なので、palette確定時に両方と照合する。

2画面目以降の不透明なビジュアルマスターには同じpaletteを厳密適用する。

```bash
cd ../pixel-forge

cargo run -p pixel-cli -- palette apply \
  ../code-monsters/designs/ui-masters/<screen-id>/ai-source.png \
  --palette ../code-monsters/designs/ui-kit/code-monsters-ui.palette.json \
  --output ../code-monsters/designs/ui-masters/<screen-id>/visual-master-640x360.png \
  --long-side 640 \
  --scale 1 \
  --recipe ../code-monsters/designs/ui-masters/<screen-id>/visual-master.recipe.json
```

### 6. ビジュアルマスターを承認する

承認対象は画面全体の次の要素とする。

- 情報の優先順位
- 余白と密度
- パネル面積と背景面積の比率
- 1px・2px枠線の使い分け
- ボタン、選択、危険、無効状態のコントラスト
- 64x64モンスターの見かけの大きさ
- 日本語テキストを後から置ける領域

AIが描いた文字や反復部品の不整合は承認対象にしない。

### 7. UI kitへ分解する

ビジュアルマスターから、再利用する部品を洗い出す。

```text
panel / button / slot / tab / badge / icon / cursor / divider / decoration
```

全体画像をそのまま矩形cropするのではなく、一つの基準部品を選んで次を整える。

- 左右・上下の対称性
- 枠線の太さ
- 角のpixel
- 9-sliceで伸ばす中央領域
- 押下、選択、無効、警告、lock状態
- 背景と分離したalpha

パネル、ボタン、モーダルは原則として9-slice化する。文字、数字、HP・MP・ATB量、価格、星数を含めない。

### 8. 透過UI parts sheetを作る

UI部品は、部品ごとに別生成して色を揺らすのではなく、一枚のparts sheetへ分離して生成する。

- 一つのcellへ一部品だけを置く。
- label、grid線、完成画面を描かせない。
- chroma-key色を部品に使わない。
- 各cellの境界へ触れさせない。
- 同じ光源、outline、palette、materialを使う。

背景除去後の透過PNGをPixel Forgeのsprite clean profileへ渡す。UI kit manifestは `animation.frames = 1` とし、`output/parts/*.png` をUI部品候補として使う。manifestのpart名は `panel-standard`、`button-primary` のようなstable English IDにする。

```bash
cd ../pixel-forge

cargo run -p pixel-cli -- sprite validate \
  ../code-monsters/designs/ui-kit/ui-kit.sprite.json

cargo run -p pixel-cli -- sprite build \
  ../code-monsters/designs/ui-kit/ui-kit.sprite.json \
  --source ../code-monsters/designs/ui-kit/ui-kit.parts-source.png \
  --output ../code-monsters/designs/ui-kit/output \
  --palette ../code-monsters/designs/ui-kit/code-monsters-ui.palette.json
```

現在のPixel Forge Unity exporterはAnimationClip、AnimatorController、Prefabを作るmonster向けadapterであり、Unity UIの9-slice borderは生成しない。UI部品は `output/parts/` を確認して個別importし、Sprite BorderとImage TypeをUnity側で設定する。繰り返し作業になった段階で、Pixel ForgeへUI kit manifestとUnity UI importerを追加する。

### 9. モンスターを作る

モンスターはPixel Forgeの既存sprite workflowを利用する。詳細は `../pixel-forge/docs/sprite-workflow.md` を正本とする。

- 1フレーム64x64
- 共通palette
- clean profile
- integer offsetとresize
- bottom-center pivot
- PPU 64
- Point Filter、mipmap無効、無圧縮

Unity bundleの例:

```bash
cd ../pixel-forge

cargo run -p pixel-cli -- sprite export-unity \
  ../code-monsters/designs/monsters/<monster-id>/<monster-id>.sprite.json \
  --source ../code-monsters/designs/monsters/<monster-id>/<monster-id>.parts-source.png \
  --output ../code-monsters/designs/monsters/<monster-id>/output/exports/unity \
  --pixels-per-unit 64 \
  --palette ../code-monsters/designs/ui-kit/code-monsters-ui.palette.json
```

MVPの基本27種を独立した画風で作らない。系統はsilhouette、属性はpaletteとmotif、白星は形態の複雑さ、色星はUnity UIのbadge・overlayとして分担する。

### 10. Unityでコンポーネント化する

全体UI画像を切り抜いて完成画面にしない。640x360のCanvas上で次を組み立てる。

```text
ScreenRoot
├─ StaticBackground
├─ Header
├─ Content
│  └─ Reusable Panel / Card / Slot / MonsterViewport
├─ OverlayLayer
└─ TransitionLayer
```

- Screen Space - Cameraまたは同じ低解像度RenderTexture内でUIを描画する。
- Screen Space - Overlayだけを物理解像度へ直接描画しない。
- MonsterViewportとカードのlayoutを分離する。
- Imageの `Set Native Size()` を画面layout決定に使わない。
- 静止UI PNGはUnity Sprite Atlasへまとめる。
- Sprite Atlas側もPoint Filter、mipmap無効、無圧縮にする。

### 11. 640x360で比較する

Unityから `640x360` のスクリーンショットを取得し、ビジュアルマスターと同じサイズで比較する。

```text
wireframe
    ↓
visual-master-640x360.png
    ↓
Unity implementation
    ↓
unity-reference-640x360.png
```

実装確認後は2倍、3倍、4倍でも表示し、1 source pixelが均一な正方形として拡大されていることを確認する。

## 画面別の完了条件

- 画面仕様にある情報と操作をすべて含む。
- 640x360で日本語が読める。
- 最大文字数、7体所持、3候補、6体戦闘などの高密度状態で重ならない。
- 画像へ動的文字やゲーム数値を焼き込んでいない。
- モンスター、icon、枠線が整数pixel位置にある。
- 全体UIと部品が同じpalette artifactを使う。
- 背景、UI、monster、FXの責務が分かれている。
- Unityの640x360 captureをビジュアルマスターと比較した。
- Point Filter、mipmap無効、無圧縮をsourceとSprite Atlasの両方で確認した。
- AI原稿、最終PNG、recipe、manifestの対応を追跡できる。

## Pixel Forgeとの責務境界

Code Monstersが所有するもの:

- 画面仕様とレイアウト
- UI componentの意味と状態
- stable IDとファイル配置
- Unity prefab、9-slice border、Sprite Atlas
- game dataとのバインド

Pixel Forgeが所有するもの:

- 決定的な縮小とpalette適用
- 透過spriteのclean変換
- nearest-neighbor preview
- sprite part分割と合成
- recipeとalgorithm version
- monster向けUnity export

AI生成provider、認証、ゲーム固有UI importerをPixel Forge coreへ入れない。
