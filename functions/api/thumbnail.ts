// チャンネルアイコンを Canvas に描く際の CORS フォールバック用プロキシ。
// オープンプロキシ化を防ぐため、ホスト名 allowlist を必須とする(仕様書 5.2)。

const ALLOWED_HOSTS = new Set([
  'yt3.ggpht.com',
  'yt3.googleusercontent.com',
  'i.ytimg.com',
]);

const TIMEOUT_MS = 5000;

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface Env {}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const target = url.searchParams.get('url');

  if (!target) {
    return new Response('missing url', { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response('invalid url', { status: 400 });
  }

  // https のみ + allowlist に含まれるホストのみ許可
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return new Response('forbidden host', { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(parsed.toString(), {
      signal: controller.signal,
      // 画像取得のみ。Cookie 等は送らない
      headers: { Accept: 'image/*' },
    });

    if (!upstream.ok || !upstream.body) {
      return new Response('upstream error', { status: 502 });
    }

    const headers = new Headers();
    const contentType = upstream.headers.get('Content-Type') ?? 'image/jpeg';
    headers.set('Content-Type', contentType);
    // Cloudflare キャッシュで YouTube 側への再取得を抑える
    headers.set('Cache-Control', 'public, max-age=86400');
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(upstream.body, { status: 200, headers });
  } catch {
    return new Response('fetch failed', { status: 502 });
  } finally {
    clearTimeout(timer);
  }
};
