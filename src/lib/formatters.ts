import type { Subscription, OutputFormat } from '../types';

/**
 * 各出力フォーマットは `(subs: Subscription[]) => string` の純関数。
 * 仕様書セクション7に準拠。全形式が Vitest のユニットテスト対象。
 */

// --- エスケープユーティリティ ------------------------------------------------

/** RFC 4180: カンマ・引用符・改行(CR/LF)を含む値は `"` で囲み、`"` は `""` に。 */
function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Markdown リンクテキスト中の `[ ] ( )` をバックスラッシュでエスケープ。 */
function escapeMarkdownText(value: string): string {
  return value.replace(/[[\]()]/g, '\\$&');
}

/** XML 特殊文字 `& < > " '` をエスケープ。`&` を最初に処理する。 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// --- 各フォーマッタ ----------------------------------------------------------

/** Text (.txt): チャンネル名のみ、1行1件、改行は `\n`。 */
export function toText(subs: Subscription[]): string {
  return subs.map((s) => s.title).join('\n');
}

/**
 * CSV (.csv): ヘッダ行 `title,channelId,url`。RFC 4180 準拠のエスケープ。
 * BOM 付き UTF-8(Excel での文字化け対策)。レコード区切りは CRLF。
 */
export function toCsv(subs: Subscription[]): string {
  const BOM = String.fromCharCode(0xfeff); // UTF-8 BOM(Excel 文字化け対策)
  const rows = [
    'title,channelId,url',
    ...subs.map((s) =>
      [s.title, s.channelId, s.url].map(escapeCsvField).join(','),
    ),
  ];
  return BOM + rows.join('\r\n');
}

/** Markdown (.md): `- [チャンネル名](URL)`、1行1件。名前中の `[ ] ( )` をエスケープ。 */
export function toMarkdown(subs: Subscription[]): string {
  return subs
    .map((s) => `- [${escapeMarkdownText(s.title)}](${s.url})`)
    .join('\n');
}

/** JSON (.json): `Subscription[]` をそのまま整形出力。 */
export function toJson(subs: Subscription[]): string {
  return JSON.stringify(subs, null, 2);
}

/**
 * OPML (.opml): RSS リーダーインポート用。
 * 各チャンネルを `<outline type="rss" .../>` として出力し、XML 特殊文字をエスケープ。
 */
export function toOpml(subs: Subscription[]): string {
  const outlines = subs
    .map((s) => {
      const text = escapeXml(s.title);
      const xmlUrl = escapeXml(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${s.channelId}`,
      );
      const htmlUrl = escapeXml(s.url);
      return `    <outline type="rss" text="${text}" title="${text}" xmlUrl="${xmlUrl}" htmlUrl="${htmlUrl}"/>`;
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="1.0">',
    '  <head><title>channelist export</title></head>',
    '  <body>',
    outlines,
    '  </body>',
    '</opml>',
  ]
    // 0件時に空の outlines 行が入らないよう除去
    .filter((line) => line !== '')
    .join('\n');
}

// --- ディスパッチ / メタ情報 -------------------------------------------------

export interface FormatMeta {
  extension: string;
  mimeType: string;
  format: (subs: Subscription[]) => string;
}

export const FORMATTERS: Record<OutputFormat, FormatMeta> = {
  text: { extension: 'txt', mimeType: 'text/plain;charset=utf-8', format: toText },
  csv: { extension: 'csv', mimeType: 'text/csv;charset=utf-8', format: toCsv },
  markdown: { extension: 'md', mimeType: 'text/markdown;charset=utf-8', format: toMarkdown },
  json: { extension: 'json', mimeType: 'application/json;charset=utf-8', format: toJson },
  opml: { extension: 'opml', mimeType: 'text/x-opml;charset=utf-8', format: toOpml },
};

/** 指定フォーマットで整形した文字列を返す。 */
export function formatSubscriptions(subs: Subscription[], format: OutputFormat): string {
  return FORMATTERS[format].format(subs);
}
