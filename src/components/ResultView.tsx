import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type {
  SubscriptionsResponse,
  OutputFormat,
  SortOrder,
} from '../types';
import { FORMATTERS, formatSubscriptions } from '../lib/formatters';
import { sortSubscriptions } from '../lib/sort';
import { downloadText, todayStamp } from '../lib/download';
import { YOUTUBE_PRIVACY_URL } from '../constants';
import { ShareImagePanel } from './ShareImagePanel';

interface ResultViewProps {
  data: SubscriptionsResponse;
  onRestart: () => void;
}

const FORMATS: OutputFormat[] = ['text', 'csv', 'markdown', 'json', 'opml'];
const SORTS: SortOrder[] = ['name', 'newest', 'oldest'];

export function ResultView({ data, onRestart }: ResultViewProps) {
  const { t, i18n } = useTranslation();
  const [format, setFormat] = useState<OutputFormat>('text');
  const [sortOrder, setSortOrder] = useState<SortOrder>('name');
  const [toast, setToast] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const sorted = useMemo(
    () => sortSubscriptions(data.subscriptions, sortOrder, i18n.language),
    [data.subscriptions, sortOrder, i18n.language],
  );

  const output = useMemo(
    () => formatSubscriptions(sorted, format),
    [sorted, format],
  );

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2000);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      showToast(t('result.copied'));
    } catch {
      showToast(t('result.copyFailed'));
    }
  };

  const handleDownload = () => {
    const meta = FORMATTERS[format];
    downloadText(output, `channelist-${todayStamp()}.${meta.extension}`, meta.mimeType);
  };

  return (
    <section className="result">
      <p className="result__summary">
        <Trans
          i18nKey="result.summary"
          values={{ channelTitle: data.channelTitle, count: data.totalResults }}
        >
          <strong />
        </Trans>
      </p>

      <div className="result__controls">
        <div
          className="tabs"
          role="tablist"
          aria-label={t('result.formatLabel')}
        >
          {FORMATS.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={format === f}
              className={`tab ${format === f ? 'tab--active' : ''}`}
              onClick={() => setFormat(f)}
            >
              {t(`result.format.${f}`)}
            </button>
          ))}
        </div>

        <label className="result__sort">
          <span>{t('result.sortLabel')}</span>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`result.sort.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <textarea
        className="result__output"
        readOnly
        value={output}
        spellCheck={false}
        aria-label={t(`result.format.${format}`)}
      />

      <div className="result__actions">
        <button type="button" className="btn" onClick={handleCopy}>
          {t('result.copy')}
        </button>
        <button type="button" className="btn" onClick={handleDownload}>
          {t('result.download')}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setShareOpen(true)}
        >
          {t('result.shareImage')}
        </button>
      </div>

      <p className="result__reminder" role="note">
        🔒 {t('result.reminder')}{' '}
        <a href={YOUTUBE_PRIVACY_URL} target="_blank" rel="noopener noreferrer">
          {t('result.reminderLink')} ↗
        </a>
      </p>

      <button type="button" className="link-btn" onClick={onRestart}>
        ← {t('result.restart')}
      </button>

      {toast && <div className="toast" role="status">{toast}</div>}

      {shareOpen && (
        <ShareImagePanel
          subscriptions={sorted}
          onClose={() => setShareOpen(false)}
        />
      )}
    </section>
  );
}
