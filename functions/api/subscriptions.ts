import type {
  Subscription,
  SubscriptionsResponse,
  ApiError,
  ApiErrorResponse,
} from '../../src/types';

interface Env {
  YOUTUBE_API_KEY: string;
}

const YT_BASE = 'https://www.googleapis.com/youtube/v3';
const MAX_PAGES = 40; // 安全弁: 40ページ = 2,000件で打ち切り
const PAGE_SIZE = 50;

// --- YouTube API レスポンス(必要部分のみ) ---------------------------------

interface YtErrorItem {
  reason?: string;
  domain?: string;
}
interface YtErrorBody {
  error?: { code?: number; errors?: YtErrorItem[]; message?: string };
}

interface YtChannelItem {
  id?: string;
  snippet?: { title?: string };
}
interface YtChannelsResponse {
  items?: YtChannelItem[];
}

interface YtSubscriptionSnippet {
  title?: string;
  description?: string;
  publishedAt?: string;
  resourceId?: { channelId?: string };
  thumbnails?: { default?: { url?: string } };
}
interface YtSubscriptionItem {
  snippet?: YtSubscriptionSnippet;
}
interface YtSubscriptionsResponse {
  items?: YtSubscriptionItem[];
  nextPageToken?: string;
}

// --- ヘルパー ----------------------------------------------------------------

function jsonResponse(body: unknown, status: number, cache?: string): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=utf-8',
  };
  if (cache) headers['Cache-Control'] = cache;
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(error: ApiError, status: number): Response {
  const body: ApiErrorResponse = { error };
  return jsonResponse(body, status);
}

const CHANNEL_ID_RE = /^UC[\w-]{22}$/;
// 制御文字(タブ・改行・DEL 含む)を拒否
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x1F\x7F]/;

/**
 * ユーザー入力を正規化し、チャンネルID or ハンドルに分解する。
 * URL 貼り付け(youtube.com/@handle, youtube.com/channel/UC...)にも対応。
 */
function parseInput(raw: string): { channelId?: string; handle?: string } {
  let input = raw.trim();

  // URL の場合はパスを抽出
  if (/youtube\.com/i.test(input) || /^https?:/i.test(input)) {
    try {
      const u = new URL(/^https?:/i.test(input) ? input : `https://${input}`);
      const parts = u.pathname.split('/').filter(Boolean);
      const channelIdx = parts.indexOf('channel');
      if (channelIdx >= 0 && parts[channelIdx + 1]) {
        input = parts[channelIdx + 1];
      } else {
        // /@handle または /handle
        const handlePart = parts.find((p) => p.startsWith('@')) ?? parts[0];
        if (handlePart) input = handlePart;
      }
    } catch {
      // URL パース失敗時はそのまま扱う
    }
  }

  if (CHANNEL_ID_RE.test(input)) {
    return { channelId: input };
  }

  const handle = input.startsWith('@') ? input.slice(1) : input;
  return { handle };
}

/** YouTube のエラーボディから ApiError を判定する。 */
function classifyYtError(status: number, body: YtErrorBody): ApiError {
  const reasons = (body.error?.errors ?? []).map((e) => e.reason ?? '');
  if (status === 403) {
    if (reasons.some((r) => /quota/i.test(r))) return 'QUOTA_EXCEEDED';
    // subscriptionForbidden など
    return 'SUBSCRIPTIONS_PRIVATE';
  }
  if (status === 429) return 'RATE_LIMITED';
  return 'UNKNOWN';
}

async function safeJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

/** チャンネルID とタイトルを解決する。見つからなければ null、クォータ超過なら 'quota'。 */
async function resolveChannel(
  parsed: { channelId?: string; handle?: string },
  key: string,
): Promise<{ id: string; title: string } | null | 'quota'> {
  const params = new URLSearchParams({ part: 'snippet', key });
  if (parsed.channelId) {
    params.set('id', parsed.channelId);
  } else if (parsed.handle) {
    params.set('forHandle', parsed.handle);
  } else {
    return null;
  }

  const res = await fetch(`${YT_BASE}/channels?${params.toString()}`);
  if (!res.ok) {
    const body = await safeJson<YtErrorBody>(res);
    if (
      res.status === 403 &&
      (body.error?.errors ?? []).some((e) => /quota/i.test(e.reason ?? ''))
    ) {
      return 'quota';
    }
    return null;
  }

  const data = await safeJson<YtChannelsResponse>(res);
  const item = data.items?.[0];
  if (!item?.id) return null;
  return { id: item.id, title: item.snippet?.title ?? '' };
}

// --- エントリポイント --------------------------------------------------------

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const key = context.env.YOUTUBE_API_KEY;
  if (!key) return errorResponse('UNKNOWN', 500);

  const url = new URL(context.request.url);
  const handleParam = url.searchParams.get('handle') ?? '';

  // 入力バリデーション(最大100文字・制御文字拒否)
  if (!handleParam || handleParam.length > 100 || CONTROL_CHAR_RE.test(handleParam)) {
    return errorResponse('HANDLE_NOT_FOUND', 400);
  }

  const parsed = parseInput(handleParam);

  // 1. チャンネル解決
  let channel: { id: string; title: string } | null | 'quota';
  try {
    channel = await resolveChannel(parsed, key);
  } catch {
    return errorResponse('UNKNOWN', 502);
  }
  if (channel === 'quota') return errorResponse('QUOTA_EXCEEDED', 403);
  if (!channel) return errorResponse('HANDLE_NOT_FOUND', 404);

  // 2. subscriptions を nextPageToken が尽きるまで取得(最大 40 ページ)
  const subscriptions: Subscription[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  try {
    do {
      const params = new URLSearchParams({
        part: 'snippet',
        channelId: channel.id,
        maxResults: String(PAGE_SIZE),
        key,
      });
      if (pageToken) params.set('pageToken', pageToken);

      const res = await fetch(`${YT_BASE}/subscriptions?${params.toString()}`);
      if (!res.ok) {
        const body = await safeJson<YtErrorBody>(res);
        const apiError = classifyYtError(res.status, body);
        const status = res.status === 429 ? 429 : res.status === 403 ? 403 : 502;
        return errorResponse(apiError, status);
      }

      const data = await safeJson<YtSubscriptionsResponse>(res);
      for (const it of data.items ?? []) {
        const s = it.snippet;
        const channelId = s?.resourceId?.channelId;
        if (!channelId) continue;
        subscriptions.push({
          title: s?.title ?? '',
          channelId,
          url: `https://www.youtube.com/channel/${channelId}`,
          description: s?.description ?? '',
          publishedAt: s?.publishedAt ?? '',
          thumbnailUrl: s?.thumbnails?.default?.url ?? '',
        });
      }

      pageToken = data.nextPageToken;
      pages += 1;
    } while (pageToken && pages < MAX_PAGES);
  } catch {
    return errorResponse('UNKNOWN', 502);
  }

  const payload: SubscriptionsResponse = {
    channelTitle: channel.title,
    totalResults: subscriptions.length,
    subscriptions,
  };

  // 同一ハンドルへの連打を Cloudflare キャッシュで吸収
  return jsonResponse(payload, 200, 'public, max-age=300');
};
