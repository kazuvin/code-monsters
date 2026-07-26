# オンライン対戦プロトタイプ

## 採用構成

```text
React / Vite
  ├─ 静的ファイル ── Workers Static Assets
  └─ PartySocket ─── WebSocket
                         │
                    PartyServer
                         │
              MatchRoom Durable Object
                 ├─ 2人の席と復帰token
                 ├─ サイクル・提出・スコア
                 ├─ 決定論的な戦闘計算
                 └─ SQLite-backed storage
```

D1、Hono、ログイン、ランダムマッチングは使っていない。ユーザーテストに必要な「招待URLを作る」「2人が育成する」「編成を提出する」「同じ戦闘結果を受け取る」だけに絞っている。

### Workers Static Assets

Reactのビルド結果を配信する。静的アセットへのリクエストは無料・無制限で、アセット保存の追加料金もない。`/parties/*` だけWorkerを先に通し、通常の画像、CSS、JavaScriptはアセット配信へ直接流す。

### PartySocket

ブラウザ側のWebSocketクライアント。接続が切れたときの再接続を担当する。ポーリングを行わないため、相手待ちの間に定期HTTPリクエストは発生しない。

### PartyServer

Cloudflare Workers上で部屋単位のWebSocket処理を扱う薄いフレームワーク。URLの `room` ごとに `MatchRoom` Durable Objectへ接続を振り分ける。

### MatchRoom Durable Object

1対戦室につき1インスタンスが存在する。2人から届く操作を1列に処理できるため、「同時に提出した」「片方だけ次へ進んだ」といった競合をDBロックや別サーバーなしで扱える。

WebSocket Hibernationを有効にしている。2人が育成していてメッセージが来ない時間は、接続を維持したままDurable Objectが休止できる。これがポーリングよりリクエスト数と実行時間を抑えられる理由である。

### SQLite-backed storage

Durable Objectに付属するストレージへ、席、tokenのハッシュ、現在サイクル、提出編成、スコア、直近の戦闘結果を保存する。D1を別に用意する必要はない。対戦室は最終操作から24時間後にalarmで削除する。

## 対戦の流れ

1. ホストが推測しにくいUUID入りの招待URLを作る。
2. 先着2接続へA/Bの席を割り当てる。3人目は拒否する。
3. 各ブラウザは別seedで、ローカルにショップ・配合・ガンビットを進める。
4. 各サイクルで主力3体だけをMatchRoomへ提出する。
5. 2人分が揃うとMatchRoomが既存の決定論的コアで戦闘を1回だけ計算し、各プレイヤー視点へ変換した同じ結果を送る。
6. 2人が結果確認を終えると次の育成へ進む。
7. 5敗では終了せず12戦を行う。同点なら12戦目の最終編成でサドンデスを繰り返す。

戦闘中の各フレームは送信しない。サーバーがまとめて計算したリプレイデータを1回送り、アニメーション再生は各ブラウザで行う。このためアクションゲームのような高頻度通信は発生しない。

## 料金概算

2026年7月時点の公式料金を基準にする。

- Workers Free: 1日100,000リクエスト。静的アセットのリクエストは無料・無制限。
- Durable Objects Free: 1日100,000リクエスト、13,000 GB-s、SQLite 5百万行read、10万行write、合計5 GB。
- Workers Paid: アカウント最低料金は月額5 USD。Workersは月1,000万リクエスト、Durable Objectsは月100万リクエストと400,000 GB-sを含む。
- Durable Objectへの受信WebSocketメッセージは、課金上20メッセージを1リクエストとして数える。送信メッセージとプロトコルpingは課金対象外。

通常の12戦では、2人あわせて編成提出24回、結果確認24回、接続2回程度になる。Durable Objectの課金request換算はおよそ5回/対戦室で、保存とalarmを含むwriteは概ね100行/対戦室を上限目安とする。

| ユーザーテスト規模 | 対戦室数 | 想定 |
|---|---:|---|
| 20人が1回 | 10 | Free枠内。約0 USD |
| 200人が1回 | 100 | Free枠内。約0 USD |
| 2,000人が1日で1回 | 1,000 | write上限付近。日を分けるかPaid推奨 |
| 月1万対戦室 | 10,000 | Paidの包含量に十分収まり、概ね月5 USD |

実際の行数やCPU時間は戦闘データ量と再提出回数で変わる。公開テスト開始後はWorkers Observabilityでrequest、Duration、SQLite writeを確認する。

公式資料:

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Static Assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

## ローカル確認

```bash
pnpm build
pnpm exec wrangler dev
pnpm test:browser:online -- http://127.0.0.1:8787
```

通常のVite開発サーバーからWorkerへつなぐ場合は、`VITE_PARTY_HOST=127.0.0.1:8787` を指定する。

## プロトタイプ上の制限

- 招待URLを知っている人だけが参加できる前提で、アカウント認証はない。
- 同一端末での席復帰用tokenとローカル育成状態はlocalStorageへ保存する。
- 対戦履歴の恒久保存、観戦、ランキング、ランダムマッチング、切断ペナルティはない。
- 育成結果そのものはクライアントから提出するため、不正改変を検出するアンチチートはない。戦闘計算と勝敗だけがサーバー権威である。
- 公開規模が増えたらTurnstile、参加期限、レート制限、対戦ログのD1保存を追加候補とする。
