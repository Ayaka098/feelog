# Supabase Plan

feelog を localStorage 実装から Supabase 実装へ移行するための設計メモです。
このドキュメントは接続前の準備であり、APIキー、URL、`.env`、DB作成、認証実装は含めません。

## 前提

- feelog は個人用の非公開感情ログアプリ。
- 投稿はユーザー本人だけが作成、閲覧、編集、削除できる。
- 公開投稿、フォロワー、通知、コメント、本物のいいねは実装しない。
- 画像は投稿に任意で添付できる。
- 疑似ハートは本物のユーザー操作ではなく、投稿ごとに保存した成長パラメータと `created_at` から表示時に計算する。
- AI出力はアプリ内で分析せず、指定期間の投稿日時と本文だけをテキスト化する。

## テーブル案

### 必須

- `posts`
  - 投稿本文、作成日時、編集日時、疑似ハート成長パラメータを保存する中心テーブル。
- `images`
  - 投稿に紐づく画像メタデータと Storage path を保存するテーブル。

### 任意

- `profiles`
  - ユーザー表示名や初回作成日時を保存する場合のみ使用。
  - MVPでは `auth.users` の `id` だけで投稿分離できるため、必須ではない。

## posts テーブルのカラム案

| column | type | nullable | default | note |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | 投稿ID |
| `user_id` | `uuid` | no | `auth.uid()` 相当 | `auth.users.id` と対応 |
| `body` | `text` | no | none | 投稿本文。文字数制限なし |
| `like_initial` | `integer` | no | none | 疑似ハート初期値 |
| `like_max` | `integer` | no | none | 最大値。アプリ側でもDB側でも最大900に制限 |
| `like_plateau_hours` | `numeric` | no | none | ほぼ止まるまでの時間 |
| `like_velocity` | `numeric` | no | none | 増加カーブ |
| `created_at` | `timestamptz` | no | `now()` | 投稿日時 |
| `updated_at` | `timestamptz` | yes | none | 編集日時 |

想定インデックス:

- `posts_user_created_idx` on `(user_id, created_at desc)`
- 検索が重くなった場合のみ、後で本文検索用の index を検討する。

制約案:

- `body <> ''`
- `like_initial >= 0`
- `like_max >= 0 and like_max <= 900`
- `like_initial <= like_max`
- `like_plateau_hours > 0`
- `like_velocity > 0`

## images テーブルのカラム案

| column | type | nullable | default | note |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | 画像ID |
| `user_id` | `uuid` | no | `auth.uid()` 相当 | 所有者 |
| `post_id` | `uuid` | no | none | `posts.id` への外部キー |
| `bucket` | `text` | no | `feelog-images` | Storage bucket名 |
| `storage_path` | `text` | no | none | Storage内のpath |
| `mime_type` | `text` | yes | none | `image/webp` など |
| `size` | `integer` | yes | none | bytes |
| `width` | `integer` | yes | none | 圧縮後幅 |
| `height` | `integer` | yes | none | 圧縮後高さ |
| `created_at` | `timestamptz` | no | `now()` | 添付日時 |

制約案:

- `post_id` は `posts(id)` に `on delete cascade`
- `storage_path` はユーザーごとに一意にする
- MVPでは投稿1件につき画像1枚想定でもよい。将来複数枚にするなら `images` を配列ではなくこのテーブルのまま増やす。

## ユーザーごとの投稿分離方針

- Supabase Auth の `auth.uid()` を信頼できるユーザーIDとして使う。
- `posts.user_id` と `images.user_id` に必ず現在ログイン中ユーザーのIDを保存する。
- クライアントから取得する投稿は常に `user_id = auth.uid()` の条件に限定する。
- RLSを有効にし、アプリ側の条件漏れがあっても他ユーザーのデータを読めないようにする。
- Storage path も `user_id/post_id/image_id.webp` のようにユーザーID配下へ分離する。

## RLS ポリシー案

### posts

- select
  - ログイン済みユーザーは `user_id = auth.uid()` の投稿だけ読める。
- insert
  - ログイン済みユーザーは `user_id = auth.uid()` の投稿だけ作成できる。
- update
  - ログイン済みユーザーは `user_id = auth.uid()` の投稿だけ編集できる。
- delete
  - ログイン済みユーザーは `user_id = auth.uid()` の投稿だけ削除できる。

### images

- select
  - ログイン済みユーザーは `user_id = auth.uid()` の画像メタデータだけ読める。
- insert
  - ログイン済みユーザーは `user_id = auth.uid()` の画像メタデータだけ作成できる。
  - 対象の `post_id` も同じユーザーの投稿であることを確認する。
- update
  - 基本不要。必要になった場合も `user_id = auth.uid()` のみ。
- delete
  - ログイン済みユーザーは `user_id = auth.uid()` の画像メタデータだけ削除できる。

### Storage objects

- select
  - private bucket前提。ログイン済みユーザーが自分のprefix配下だけ読める。
- insert
  - ログイン済みユーザーが自分のprefix配下だけアップロードできる。
- update
  - 原則不要。差し替え時は古いobject削除と新規作成で扱う。
- delete
  - ログイン済みユーザーが自分のprefix配下だけ削除できる。

## Supabase Storage bucket 案

- bucket名: `feelog-images`
- public/private: private
- path案: `{user_id}/{post_id}/{image_id}.webp`
- サムネイルが必要になった場合: `{user_id}/{post_id}/{image_id}_thumb.webp`
- アプリ側では現在のlocalStorage版と同じく、アップロード前に画像を圧縮し、可能ならWebPへ変換する。
- 表示時は署名付きURLを短時間発行する方針にする。

## Googleログイン後に必要になる処理の流れ

1. ユーザーがGoogleログインを開始する。
2. Supabase Auth のOAuthフローでGoogleへ遷移する。
3. コールバック後、セッションを取得する。
4. `auth.user.id` をアプリ内の `user_id` として扱う。
5. 必要なら `profiles` を初回作成または更新する。
6. `posts` を `created_at desc` で30件取得する。
7. スクロール下部で、最後に表示している `created_at` またはページ範囲を使って次の30件を取得する。
8. 投稿作成時は、画像があれば先にStorageへアップロードし、`posts` と `images` を作成する。
9. 投稿編集時は `posts.body` と `posts.updated_at` を更新する。
10. 投稿削除時は `posts` を削除し、`images` は外部キー cascade と Storage object 削除処理を合わせて行う。

## localStorage 実装から Supabase 実装へ差し替える箇所

現在の主な差し替え対象:

- `lib/feelog/local-post-store.ts`
  - `loadLocalPosts()` を Supabaseの投稿取得処理へ置き換える。
  - `saveLocalPosts()` は一括保存ではなく、作成、編集、削除の個別処理へ分解する。
- `app/page.tsx`
  - `useEffect` でlocalStorageから読む処理を、ログイン状態確定後のSupabase取得へ変更する。
  - `setPosts` だけで完結している投稿作成、編集、削除を、Supabase操作成功後にstate更新する形へ変更する。
- `lib/feelog/image-processing.ts`
  - 圧縮処理は維持する。
  - Base64を保存するのではなく、`Blob` または `File` としてStorageへアップロードする処理を追加する。
- `lib/feelog/types.ts`
  - `PostImage` の `UploadedImage.dataUrl` を、将来的に `storagePath`、`signedUrl`、`width`、`height` などへ置き換える。
- `lib/feelog/post-model.ts`
  - 疑似ハート計算、検索条件、AI出力整形は基本維持できる。
  - 検索は件数が増えたらDBクエリへ寄せる。

## 必要な環境変数名

`.env` はまだ作成しない。実装時に必要になる名前だけを定義する。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

将来必要になりうるもの:

- `NEXT_PUBLIC_SITE_URL`
  - OAuth redirect URL を環境ごとに組み立てる場合に使う。

## 実装時の注意点

- service role key はクライアントに置かない。
- RLSを必ず有効化してからクライアント接続する。
- `user_id` はクライアント入力を信用しすぎず、RLSと `auth.uid()` で守る。
- 投稿作成の心理的負荷を増やさない。タグ、カテゴリ、感情選択は追加しない。
- 疑似ハートは本物のいいねではないため、likeテーブルは作らない。
- AI出力に画像、疑似ハート、メタ情報を含めない。
- 画像はアップロード前に圧縮する。巨大画像をそのままStorageへ送らない。
- 投稿削除時はDB行だけでなくStorage objectの削除漏れに注意する。
- 初期移行時、localStorageの既存データをSupabaseへ移すかどうかは別途判断する。
- 無限スクロールは30件ずつ取得し、`created_at desc` の安定した並びを維持する。
- 日付範囲検索はユーザーのローカル日付感覚と `timestamptz` の扱いに注意する。
