import type { Subscription, SortOrder } from '../types';

/**
 * ソート順に応じて Subscription 配列を並べ替える(非破壊)。
 * - name: locale 対応の localeCompare(引数の locale を使用)
 * - newest / oldest: publishedAt(登録日時)で比較
 */
export function sortSubscriptions(
  subs: Subscription[],
  order: SortOrder,
  locale: string,
): Subscription[] {
  const copy = [...subs];
  switch (order) {
    case 'name':
      return copy.sort((a, b) =>
        a.title.localeCompare(b.title, locale, { sensitivity: 'base' }),
      );
    case 'newest':
      return copy.sort(
        (a, b) => toTime(b.publishedAt) - toTime(a.publishedAt),
      );
    case 'oldest':
      return copy.sort(
        (a, b) => toTime(a.publishedAt) - toTime(b.publishedAt),
      );
    default:
      return copy;
  }
}

function toTime(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}
