import { useTranslation } from 'react-i18next';

export function FetchingView() {
  const { t } = useTranslation();
  // Function 側で全件取得してから返す設計のため実際は単一リクエスト。
  // 不確定スピナーで良い。
  // 将来ストリーミング(逐次ページ受信)にする場合は、ここで進捗率を
  // 受け取って determinate なバーに差し替える拡張点となる。
  return (
    <div className="fetching" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>{t('fetching.message')}</p>
    </div>
  );
}
