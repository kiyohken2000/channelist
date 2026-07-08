# channelist

Export your YouTube subscriptions as **Text / CSV / Markdown / JSON / OPML** and share them as an **image** — no OAuth, no login, no data stored.

- **Live:** https://channelist.pages.dev
- **License:** MIT
- **Cost to run:** $0 (Cloudflare Pages free tier + YouTube Data API free quota)

## How it works

YouTube Data API v3's `subscriptions.list` returns a channel's subscriptions with **just an API key** — as long as that channel has set its subscriptions to public. channelist uses this to avoid Google's OAuth verification entirely: you temporarily make your subscriptions public, fetch, then set them private again.

The API key lives only in a Cloudflare Pages Function (server side) and is never exposed to the browser. Handles and results pass through the function but are **never logged or stored**.

---

## Tech stack

| Area | Choice |
|---|---|
| Frontend | Vite + React + TypeScript |
| Backend | Cloudflare Pages Functions (`functions/`, TypeScript) |
| i18n | react-i18next (Japanese / English) |
| State | `useReducer` |
| HTTP | `fetch` |
| Image | Canvas API |
| Hosting | Cloudflare Pages |

## Project layout

```
functions/api/subscriptions.ts   YouTube API proxy (server-side key)
functions/api/thumbnail.ts       CORS-fallback image proxy (host allowlist)
src/lib/formatters.ts            Subscription[] → format strings (pure, unit-tested)
src/lib/shareImage.ts            Canvas rendering + icon fetch + PNG
src/lib/api.ts                   /api/subscriptions client
src/components/                  Header / Landing / Fetching / Result / ShareImage / Footer
src/locales/                     ja.json / en.json
public/privacy.html              Bilingual privacy policy
```

---

## Local development

```bash
npm install

# 1. API key for local Functions
cp .env.example .dev.vars        # then edit .dev.vars and set YOUTUBE_API_KEY

# 2a. UI only (Functions not available)
npm run dev

# 2b. Full stack incl. Functions (recommended)
npm run pages:dev                # = wrangler pages dev -- npm run dev
```

- `npm test` — run the formatter unit tests (Vitest)
- `npm run typecheck` — typecheck app + functions
- `npm run build` — production build to `dist/`

> `.dev.vars` holds the local secret and is gitignored. Never commit an API key.

---

## Google Cloud setup (one-time)

1. Create a project → enable **YouTube Data API v3**.
2. Create an **API key**.
3. Under **API restrictions**, restrict the key to **YouTube Data API v3** only.
   - No HTTP referrer restriction (the key is used server-side).
   - No IP restriction (Cloudflare egress IPs are not fixed).

---

## Deploy (Cloudflare Pages — CLI direct upload)

This project deploys via `wrangler` direct upload (no GitHub integration).

One-time setup:

```bash
npx wrangler login                                   # authenticate
npx wrangler pages project create channelist --production-branch main
# Set the production secret (use a key restricted to YouTube Data API v3):
npx wrangler pages secret put YOUTUBE_API_KEY --project-name channelist
```

Every deploy:

```bash
npm run deploy        # = npm run build && wrangler pages deploy dist --project-name channelist --branch main
```

Live at https://channelist.pages.dev after the first deploy.

**Rate limiting (WAF, recommended):** add a rule limiting each IP to **20 requests/min** on `/api/*`. The thumbnail proxy is also under `/api/*`; direct icon loading + max-8 concurrency keeps normal usage well under the limit. Tune the threshold after release.

> Alternatively you can connect the GitHub repo in the Cloudflare dashboard (Framework preset: Vite, build `npm run build`, output `dist`) for push-to-deploy. If you do, set `YOUTUBE_API_KEY` for both Production and Preview environments.

---

## Privacy

No handle, subscription list, or output is ever stored or logged. The only value kept in the browser is your language preference. Full policy: [`public/privacy.html`](public/privacy.html).

While your subscriptions are set to public, anyone can view them — remember to switch back to private after exporting.

---

## 日本語

YouTubeの登録チャンネル一覧を **テキスト / CSV / Markdown / JSON / OPML** で書き出し、**画像**としてSNSでシェアできる公開Webアプリです。OAuth不要・ログイン不要・データ保存なし。

### 仕組み

YouTube Data API v3 の `subscriptions.list` は、対象チャンネルが「登録チャンネルを公開」に設定していれば **APIキーのみ** で取得できます。これを利用してGoogleのOAuth審査を回避します。使い方は「プライバシー設定を一時的にオフ → 取得 → 設定を戻す」の3ステップです。

APIキーはCloudflare Pages Function(サーバー側)にのみ保持し、ブラウザには露出しません。ハンドル名や取得結果は関数を通過するだけで **ログ・保存を一切行いません**。

### ローカル開発

```bash
npm install
cp .env.example .dev.vars   # .dev.vars に YOUTUBE_API_KEY を設定
npm run pages:dev           # Functions込みで起動
npm test                    # formatters のユニットテスト
```

### デプロイ

GitHubリポジトリを Cloudflare Pages に接続し、ビルドコマンド `npm run build` / 出力 `dist` を設定。シークレット `YOUTUBE_API_KEY` を Production・Preview 両方に登録します。WAFで `/api/*` に「同一IPから20リクエスト/分」のレート制限を設定してください。
