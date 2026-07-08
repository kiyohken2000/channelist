export const YOUTUBE_PRIVACY_URL = 'https://www.youtube.com/account_privacy';
export const GITHUB_REPO_URL = 'https://github.com/kiyohken2000/channelist';
export const PRIVACY_POLICY_URL = '/privacy.html';
export const SITE_URL = 'https://channelist.pages.dev';
export const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/votepurchase';

/**
 * X(Twitter)の投稿画面 URL を組み立てる。
 * ※ X の intent は画像添付に非対応。テキストとリンクのみプリフィルできる。
 *   画像付き共有はモバイルの Web Share API(共有シート)経由でのみ可能。
 */
export function buildXIntentUrl(text: string, url: string = SITE_URL): string {
  const params = new URLSearchParams({ text, url });
  return `https://x.com/intent/post?${params.toString()}`;
}
