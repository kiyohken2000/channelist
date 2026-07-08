# channelist 仕様書

YouTubeの登録チャンネル一覧を各種テキスト形式でエクスポートし、画像としてSNS共有もできる公開Webアプリ。

- 本番URL: `https://channelist.pages.dev`(サブドメインが取得不可の場合は `channelist-app` にフォールバック)
- リポジトリ: `https://github.com/kiyohken2000/channelist`(OSS、MITライセンス。フッターのGitHubリンク先)
- 運用コスト: ゼロ円(Cloudflare Pages無料枠 + YouTube Data API無料クォータ)

---

## 1. コンセプトと設計判断(経緯の要約)

- **OAuthを使わない。** YouTube Data API v3 の `subscriptions.list` は、対象チャンネルが「登録チャンネルを公開」に設定していればAPIキーのみで取得できる(非公開なら403)。この仕様を利用し、GoogleのOAuth審査を完全に回避する。ユーザーにはYouTubeのプライバシー設定を一時的に切り替えてもらう。
- **APIキーはブラウザに露出させない。** Cloudflare Pages Functions をプロキシとし、キーはCloudflareのシークレットに保持する。
- **データは保存しない。** ハンドル名と取得結果はFunctionを通過するのみで、ログ・DB等への保存は一切行わない(プライバシーポリシーに明記)。
- **画像共有はブラウザ内Canvasで生成。** サーバーでの画像生成は行わない。チャンネルアイコンの取得のみ、CORSフォールバック用の画像プロキシFunctionを用意する。
- V2でOAuthログイン方式を追加する可能性があるため、取得後の処理(整形・表示・画像生成)は入力手段から独立させておく。

## 2. 技術スタック

| 項目 | 選定 |
|---|---|
| フロントエンド | Vite + React + TypeScript |
| バックエンド | Cloudflare Pages Functions(`functions/` ディレクトリ、TypeScript) |
| i18n | react-i18next(日本語・英語) |
| 状態管理 | useReducer(ライブラリ不要) |
| HTTP | fetch(axios等は使わない) |
| 画像生成 | Canvas API(ライブラリなし) |
| ホスティング | Cloudflare Pages(GitHub連携で自動デプロイ) |
| ローカル開発 | `wrangler pages dev`(Functions込みで動作確認) |

追加npmパッケージは最小限にする。UIフレームワークは使わず素のCSS(またはCSS Modules)で良い。

## 3. ディレクトリ構成

```
channelist/
├── functions/
│   └── api/
│       ├── subscriptions.ts    # Pages Function(YouTube APIプロキシ)
│       └── thumbnail.ts        # チャンネルアイコンのCORSフォールバックプロキシ
├── src/
│   ├── components/
│   │   ├── Header.tsx          # アプリ名、言語切替
│   │   ├── LandingView.tsx     # 説明、手順ガイド、ハンドル入力
│   │   ├── FetchingView.tsx    # 取得中の進捗表示
│   │   ├── ResultView.tsx      # 形式タブ、ソート、出力エリア、ボタン
│   │   ├── ShareImagePanel.tsx # 画像共有: レイアウト/件数選択、プレビュー、共有・保存
│   │   └── Footer.tsx          # GitHubリンク、プライバシーポリシーリンク
│   ├── lib/
│   │   ├── formatters.ts       # Subscription[] → 各形式文字列(純関数)
│   │   ├── shareImage.ts       # Canvas描画・アイコン取得・PNG生成
│   │   └── api.ts              # /api/subscriptions を叩くクライアント
│   ├── locales/
│   │   ├── ja.json
│   │   └── en.json
│   ├── types.ts                # 共有型定義(functionsからも参照)
│   ├── App.tsx                 # 状態機械(useReducer)とビュー切替
│   └── main.tsx
├── public/
│   └── privacy.html            # プライバシーポリシー(日英併記の静的ページ)
├── index.html
├── vite.config.ts
├── wrangler.toml               # 必要に応じて(基本はダッシュボード設定で足りる)
└── README.md                   # セットアップ手順、スクショ、英語で記述+日本語セクション
```

## 4. 型定義(`src/types.ts`)

```typescript
export interface Subscription {
  title: string;         // チャンネル名
  channelId: string;     // UC...
  url: string;           // https://www.youtube.com/channel/{channelId}
  description: string;   // チャンネル説明(snippet.description)
  publishedAt: string;   // 登録日時(ISO 8601)— 登録順ソートに使用
  thumbnailUrl: string;  // snippet.thumbnails.default.url(88px)— 画像共有に使用
}

export interface SubscriptionsResponse {
  channelTitle: string;       // 解決されたチャンネル名(本人確認用に表示)
  totalResults: number;
  subscriptions: Subscription[];
}

export type ApiError =
  | 'HANDLE_NOT_FOUND'        // ハンドル/チャンネルIDが存在しない
  | 'SUBSCRIPTIONS_PRIVATE'   // 403: 登録チャンネルが非公開のまま
  | 'QUOTA_EXCEEDED'          // 403: quotaExceeded
  | 'RATE_LIMITED'            // 429: 当アプリのレート制限
  | 'UNKNOWN';

export interface ApiErrorResponse {
  error: ApiError;
  message?: string;
}

// 画像共有
export type ShareLayout = 'list' | 'icon-grid' | 'card-grid';

export interface ShareImageOptions {
  layout: ShareLayout;
  count: number;              // レイアウトごとの上限内(下記参照)
  // 並び順は ResultView で選択中のソートを引き継ぐ(独立オプションにしない)
}
```

## 5. Pages Functions 仕様

### 5.1 `GET /api/subscriptions?handle={input}`(`functions/api/subscriptions.ts`)

`handle` はユーザー入力をそのまま受ける。以下をすべて受理する:

- `@handle` 形式(先頭 `@` の有無どちらも可)
- チャンネルID(`UC` で始まる24文字)
- チャンネルURL(`youtube.com/@handle`、`youtube.com/channel/UC...` を貼り付けた場合はパース)

処理フロー:

1. 入力を正規化し、チャンネルIDを解決する
   - チャンネルID形式ならそのまま使用
   - それ以外は `GET https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle={handle}&key={KEY}` で解決。ヒットしなければ `HANDLE_NOT_FOUND`
2. `GET https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&channelId={id}&maxResults=50&key={KEY}` を `nextPageToken` が尽きるまでループし全件取得
   - 403 で reason が `subscriptionForbidden` 系 → `SUBSCRIPTIONS_PRIVATE`
   - 403 で reason が `quotaExceeded` → `QUOTA_EXCEEDED`
   - 安全弁として最大40ページ(2,000件)で打ち切り、それ以上は取得分のみ返す
3. `SubscriptionsResponse` 形式に整形してJSONで返す

実装上の要件:

- APIキーは `context.env.YOUTUBE_API_KEY` から取得(Cloudflareのシークレット)
- レスポンスに `Cache-Control: public, max-age=300` を付与し、同一ハンドルへの連打をCloudflareキャッシュで吸収する
- ハンドル名・結果をログ出力しない(`console.log` 禁止。エラー時もエラー種別のみ)
- CORSは同一オリジンなので設定不要

### 5.2 `GET /api/thumbnail?url={encodedUrl}`(`functions/api/thumbnail.ts`)

チャンネルアイコンをCanvasに描く際のCORSフォールバック用プロキシ。

- **allowlist必須**: `url` のホスト名が `yt3.ggpht.com` / `yt3.googleusercontent.com` / `i.ytimg.com` のいずれかでなければ400を返す(オープンプロキシ化の防止)。httpsのみ許可
- 取得した画像を `Content-Type` そのままに返し、`Cache-Control: public, max-age=86400` と `Access-Control-Allow-Origin: *` を付与(CloudflareキャッシュでYouTube側への再取得を抑える)
- タイムアウト5秒。失敗時は502
- YouTube APIクォータは消費しない(単なる画像取得)

## 6. フロントエンド仕様

### 状態機械(App.tsx、useReducer)

```
idle → fetching → done
              ↘ error(ApiError)
```

### LandingView(初期画面)

1. アプリ名とワンライナー説明(「登録チャンネル一覧をテキスト/CSV/Markdown/JSON/OPMLで書き出し、画像でシェアできます」)
2. **手順ガイド(3ステップ、番号付き)**:
   - Step 1: YouTubeのプライバシー設定(`https://www.youtube.com/account_privacy`、新しいタブで開くリンク)で「チャンネル登録をすべて非公開にする」を**オフ**にする
     - リンクの下に補足を折りたたみ(details/summary)で併記: 「YouTubeアプリをお使いの場合: 右下の「マイページ」→ 右上の歯車(設定)→ プライバシー → 『チャンネル登録をすべて非公開にする』をオフ」(リンクがアプリに飛んで設定ページに着地しないケースへの対策)
   - Step 2: 自分のハンドル(@から始まる名前)またはチャンネルURLを下に入力して取得
   - Step 3: 取得できたら設定を**非公開に戻す**(忘れないよう強調)
3. **注意書き(明確に表示)**: 「オフにしている間、あなたの登録チャンネル一覧は誰でも閲覧可能な状態になります」
4. ハンドル入力欄 + 取得ボタン
5. 「データはサーバーに保存されません」の一文とプライバシーポリシーへのリンク

### FetchingView

- スピナー + 「取得中…」。Function側で全件取得してから返す設計のため実際は単一リクエスト。不確定スピナーで良い(将来ストリーミングにする場合の拡張点としてコメントを残す)

### ResultView

- 冒頭に「**{channelTitle}** さんの登録チャンネル {totalResults} 件」を表示(本人のデータか確認できるように)
- **形式切替タブ**: Text / CSV / Markdown / JSON / OPML(デフォルトはText)
- **ソート切替**: 名前順(locale対応の `localeCompare`) / 登録が新しい順 / 登録が古い順(`publishedAt` でクライアント側ソート)
- 読み取り専用テキストエリアに整形結果を表示
- **[コピー]** ボタン(Clipboard API、成功時にトースト的フィードバック)
- **[ダウンロード]** ボタン(Blob + aタグ。ファイル名は `channelist-{YYYYMMDD}.{ext}`)
- **[画像でシェア]** ボタン → ShareImagePanel を開く(セクション8)
- 「設定を非公開に戻しましたか?」のリマインダーを結果画面にも表示(設定ページへのリンク付き)
- [最初からやり直す] リンクで idle に戻る

### エラー表示(ApiError → メッセージ)

| エラー | 表示内容 |
|---|---|
| HANDLE_NOT_FOUND | 「チャンネルが見つかりません。ハンドル名を確認してください」 |
| SUBSCRIPTIONS_PRIVATE | 「登録チャンネルが非公開になっています。手順1の設定をオフにしてから数分待って再度お試しください」+ 設定リンク |
| QUOTA_EXCEEDED | 「本日の利用上限に達しました。日本時間の夕方(太平洋時間0時)にリセットされます」 |
| RATE_LIMITED | 「リクエストが多すぎます。しばらく待ってからお試しください」 |
| UNKNOWN | 「エラーが発生しました。時間をおいて再度お試しください」 |

## 7. 出力フォーマット仕様(`src/lib/formatters.ts`)

すべて `(subs: Subscription[]) => string` の純関数。**ユニットテスト対象**(Vitest)。

| 形式 | 拡張子 | 仕様 |
|---|---|---|
| Text | .txt | チャンネル名のみ、1行1件、改行は `\n` |
| CSV | .csv | ヘッダ行 `title,channelId,url`。RFC 4180準拠のエスケープ(カンマ・引用符・改行を含む値は `"` で囲み、`"` は `""` に)。**BOM付きUTF-8**で出力(Excelでの文字化け対策) |
| Markdown | .md | `- [チャンネル名](URL)`、1行1件。チャンネル名中の `[ ] ( )` はエスケープ |
| JSON | .json | `Subscription[]` をそのまま `JSON.stringify(subs, null, 2)` |
| OPML | .opml | RSSリーダーインポート用。各チャンネルを `<outline type="rss" text="{title}" title="{title}" xmlUrl="https://www.youtube.com/feeds/videos.xml?channel_id={channelId}" htmlUrl="{url}"/>` として出力。XML特殊文字(`& < > " '`)を必ずエスケープ。ルートは `<opml version="1.0">` + `<head><title>channelist export</title></head>` |

テストケースに含めること: チャンネル名に `"`, `,`, `&`, `<`, 改行, 絵文字を含むケース、0件のケース。

## 8. 画像共有機能(`ShareImagePanel.tsx` + `src/lib/shareImage.ts`)

スマホでのSNS共有向けに、登録チャンネルをカード画像(PNG)にして共有シートに渡す。

### UI(ShareImagePanel)

- **レイアウト選択**(3択、アイコン付きトグル):
  - `list` — チャンネル名のテキストリスト(1カラム)
  - `icon-grid` — チャンネルアイコンのみの正方格子
  - `card-grid` — アイコン+名前のカード格子
- **件数選択**: 10 / 30 / 50 / 100 から選択。レイアウトごとの上限: list=30、card-grid=50、icon-grid=100(上限を超える選択肢はグレーアウト)。対象は現在のソート順の先頭N件
- **プレビュー**: 選択変更のたびにCanvasで再生成し、縮小表示(`<img>` にdataURL)
- **アクションボタン**: `navigator.canShare({ files })` が真なら **[共有]**(Web Share API Level 2でPNGファイルを共有シートへ)、偽なら **[画像を保存]**(ダウンロード)。両対応環境では両方表示して良い
- ファイル名: `channelist-{YYYYMMDD}.png`

### Canvas描画仕様(shareImage.ts)

- 幅 **1200px固定**、高さはレイアウトと件数から算出(最大でも約4000pxに収まる設計にする)
- **ヘッダーは付けない**(ユーザー名等の識別情報を画像に含めない。匿名でのシェアを妨げないため)。コンテンツは上端から余白のみで開始
- **フッター(透かし)**: `channelist.pages.dev` を右下に小さく
- レイアウト詳細:
  - `list`: 1行1チャンネル、名前が長い場合は末尾省略(…)
  - `icon-grid`: 10列固定、セル約110px、アイコンは角丸クリップ、行数=⌈N/10⌉
  - `card-grid`: 5列固定、アイコン(円形)+下に名前(2行まで、省略記号)
- 配色はライトテーマ1種で開始(ダークはV1.1候補)。日本語・英語・絵文字を含むチャンネル名が正しく描画されること(`system-ui` 系フォント指定)
- テキストのみの `list` は同期生成。アイコン系はアイコン取得完了後に描画

### アイコン取得戦略

1. まず `new Image()` + `crossOrigin="anonymous"` で `thumbnailUrl` から直接ロード(YouTubeの画像サーバーは概ねCORS許可。成功すればプロキシ・帯域不要)
2. 失敗した画像のみ `/api/thumbnail?url=...` 経由で再ロード
3. それも失敗したセルは**プレースホルダ**(チャンネル名の頭文字+チャンネルIDから決定する背景色)で描画。一部の失敗で全体を壊さない
- 並列ロードは同時8件までに制限、1画像あたりタイムアウト5秒
- 取得済み画像はメモリ内でキャッシュし、レイアウト切替時に再取得しない

### 注意

- Canvas汚染(tainted canvas)が起きると `toBlob` が例外を投げるため、**CORS未確認の画像は絶対に直接描画しない**(必ず上記1→2→3の順)
- `canvas.toBlob('image/png')` → `new File([blob], name, { type: 'image/png' })` → `navigator.share({ files: [file] })`
- iOS Safariでは `share()` をユーザージェスチャ(ボタンclick)から同期的に呼ぶ必要がある点に注意。プレビュー生成を先に済ませ、共有ボタン押下時は生成済みBlobを渡すだけにする

## 9. i18n

- react-i18next。初期言語は `navigator.language` が `ja` 系なら日本語、それ以外は英語
- ヘッダーに言語切替(JA / EN)。選択は `localStorage` に保存(保存するのは言語設定のみ。それ以外のデータは一切localStorageに置かない)
- すべてのUI文字列を `locales/ja.json` / `en.json` に外出し。ハードコード禁止(共有画像内はフッターのURL透かしのみで、i18n対象の文言はなし)
- プライバシーポリシー(`public/privacy.html`)は1ページに日英併記

## 10. セキュリティ・悪用対策

- **APIキー**: Cloudflareシークレット `YOUTUBE_API_KEY` のみ。リポジトリ・フロントに一切含めない。`.env.example` にはプレースホルダを記載
- **レート制限**: Cloudflare WAFのレート制限ルールで「同一IPから `/api/*` へ 20リクエスト/分」を設定(ダッシュボード操作。READMEのデプロイ手順に記載。thumbnailプロキシも `/api/*` に含まれるため、アイコン100件を一斉にプロキシ経由で取ると引っかかり得る — 直接ロード優先+並列8制限でほぼ回避できるが、閾値はリリース後に調整)
- **thumbnailプロキシ**: ホスト名allowlist(5.2参照)で任意URL中継を禁止
- **キャッシュ**: subscriptionsは `max-age=300`、thumbnailは `max-age=86400`
- **DDoS**: Cloudflareの標準防御に委任。追加実装なし
- 入力バリデーション: `handle` は最大100文字、制御文字を拒否

## 11. 環境変数

| 変数 | 場所 | 用途 |
|---|---|---|
| `YOUTUBE_API_KEY` | Cloudflare Pages のシークレット(本番) / `.dev.vars`(ローカル、gitignore) | YouTube Data API v3 キー |

Google Cloud Console側の設定(コード外の作業、READMEに手順を記載):

1. プロジェクト作成 → YouTube Data API v3 を有効化
2. APIキー発行
3. キー制限: 「APIの制限」で YouTube Data API v3 のみに限定(サーバー側で使うためリファラ制限は不要。IP制限はCloudflareのegressが不定のため設定しない)

## 12. 開発・デプロイ

- ローカル: `npm run dev` はVite単体(APIはモック or `wrangler pages dev` 併用)。`npx wrangler pages dev -- npm run dev` でFunctions込みの統合確認
- デプロイ: GitHubリポジトリをCloudflare Pagesに接続。ビルド設定は Framework preset: Vite / Build command: `npm run build` / Output: `dist`。`functions/` は自動認識
- mainブランチへのpushで本番デプロイ、PRでプレビューデプロイ(プレビューでもFunctionsは動く。シークレットはPreview環境にも設定)

## 13. スコープ外(V1では作らない)

- OAuthログイン方式(V2候補。Google審査通過後に入力手段として追加。取得後の処理は共通化してあるため追加コストは入力UIと審査対応のみ)
- Google Takeout CSVの読み込み
- 登録者数などの追加チャンネル情報(`channels.list` の追加呼び出しが必要になるため)
- 共有画像のダークテーマ・カラーバリエーション(V1.1候補)
- 共有画像の複数枚分割(全件を画像化する機能)
- アカウント機能、履歴、保存機能一切

## 14. 受け入れ基準

1. ハンドル `@xxx`、`xxx`、チャンネルID、チャンネルURLのいずれの入力でも取得できる
2. 登録チャンネル600件のアカウントで全件取得できる(ページネーション動作)
3. 非公開設定のチャンネルで、案内付きのエラーが表示される
4. 5形式すべてでコピー・ダウンロードが機能し、CSVはExcelで、OPMLは一般的なRSSリーダー(Feedlyなど)でインポートできる
5. ブラウザ言語が日本語なら日本語UI、それ以外は英語UIで表示され、手動切替が永続化される
6. リポジトリ内・ビルド成果物内のどこにもAPIキーが含まれない(`grep` で確認)
7. 画像共有: 3レイアウト×件数選択でプレビューが生成され、iOS Safari / Android Chromeで共有シートにPNGが渡る。PC ChromeではPNG保存にフォールバックする
8. 画像共有: アイコンの一部取得失敗時もプレースホルダで画像が完成する。生成画像に文字化け・アイコン欠けによる例外が発生しない
9. `/api/thumbnail` にallowlist外のURLを渡すと400が返る
