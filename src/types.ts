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

// 出力フォーマット
export type OutputFormat = 'text' | 'csv' | 'markdown' | 'json' | 'opml';

// ソート順
export type SortOrder = 'name' | 'newest' | 'oldest';
