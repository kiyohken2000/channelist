import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Subscription, ShareLayout } from '../types';
import {
  renderShareImage,
  LAYOUT_MAX_COUNT,
  COUNT_OPTIONS,
  HARD_MAX_COUNT,
} from '../lib/shareImage';
import { downloadBlob, todayStamp } from '../lib/download';

interface ShareImagePanelProps {
  /** ResultView で選択中のソート順に並んだ配列(先頭 N 件が対象)。 */
  subscriptions: Subscription[];
  onClose: () => void;
}

const LAYOUTS: ShareLayout[] = ['list', 'icon-grid', 'card-grid'];

function fileName(): string {
  return `channelist-${todayStamp()}.png`;
}

/**
 * iOS(iPhone/iPad)判定。
 * iOS Safari は <a download> で写真アプリに保存できず、写真アプリへは
 * 共有シートの「画像を保存」経由でのみ入るため、保存経路の分岐に使う。
 */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ は MacIntel + タッチとして現れる
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function ShareImagePanel({ subscriptions, onClose }: ShareImagePanelProps) {
  const { t } = useTranslation();
  const [layout, setLayout] = useState<ShareLayout>('card-grid');
  // 数値(固定件数)または 'all'(全件)。
  const [count, setCount] = useState<number | 'all'>(30);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);

  const blobRef = useRef<Blob | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const total = subscriptions.length;
  const maxCount = LAYOUT_MAX_COUNT[layout];
  // 'all' はレイアウト上限を無視して全件(ハード上限まで)。数値はレイアウト上限でクリップ。
  const effectiveCount =
    count === 'all'
      ? Math.min(total, HARD_MAX_COUNT)
      : Math.min(count, maxCount);

  // 選択変更のたびに Canvas で再生成
  useEffect(() => {
    let cancelled = false;
    setGenerating(true);
    setError(false);

    renderShareImage(subscriptions, { layout, count: effectiveCount })
      .then((result) => {
        if (cancelled) {
          URL.revokeObjectURL(result.previewUrl);
          return;
        }
        // 直前のプレビュー URL を解放
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = result.previewUrl;
        blobRef.current = result.blob;
        setPreviewUrl(result.previewUrl);

        // iOS の保存経路(共有シート)判定用に、実ファイルで canShare を確認
        try {
          const file = new File([result.blob], fileName(), { type: 'image/png' });
          setCanShareFiles(
            typeof navigator.canShare === 'function' &&
              navigator.canShare({ files: [file] }),
          );
        } catch {
          setCanShareFiles(false);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setGenerating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [subscriptions, layout, effectiveCount]);

  // アンマウント時にプレビュー URL を解放
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const handleSave = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    // iOS は <a download> では写真アプリに保存できない。
    // 共有シートの「画像を保存」経由でのみ写真アプリに入るため share() を使う。
    if (isIOS() && canShareFiles) {
      const file = new File([blob], fileName(), { type: 'image/png' });
      try {
        await navigator.share({ files: [file] });
      } catch {
        // ユーザーキャンセル等は無視
      }
      return;
    }
    downloadBlob(blob, fileName());
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={t('share.title')}>
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__panel">
        <div className="modal__header">
          <h2>{t('share.title')}</h2>
          <button
            type="button"
            className="modal__close"
            aria-label={t('share.close')}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="share__controls">
          <div className="share__group">
            <span className="share__label">{t('share.layoutLabel')}</span>
            <div className="toggle-row" role="group">
              {LAYOUTS.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`toggle ${layout === l ? 'toggle--active' : ''}`}
                  aria-pressed={layout === l}
                  onClick={() => setLayout(l)}
                >
                  {t(`share.layout.${l}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="share__group">
            <span className="share__label">{t('share.countLabel')}</span>
            <div className="toggle-row" role="group">
              {COUNT_OPTIONS.map((c) => {
                const disabled = c > maxCount;
                const active = count !== 'all' && effectiveCount === c;
                return (
                  <button
                    key={c}
                    type="button"
                    className={`toggle ${active ? 'toggle--active' : ''}`}
                    aria-pressed={active}
                    disabled={disabled}
                    onClick={() => setCount(c)}
                  >
                    {c}
                  </button>
                );
              })}
              <button
                type="button"
                className={`toggle ${count === 'all' ? 'toggle--active' : ''}`}
                aria-pressed={count === 'all'}
                onClick={() => setCount('all')}
              >
                {t('share.countAll', { count: total })}
              </button>
            </div>
          </div>
        </div>

        <div className="share__preview">
          {error ? (
            <p className="share__error">{t('share.error')}</p>
          ) : previewUrl ? (
            <img src={previewUrl} alt={t('share.preview')} />
          ) : null}
          {generating && (
            <div className="share__generating" role="status">
              {t('share.generating')}
            </div>
          )}
        </div>

        <div className="share__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleSave}
            disabled={generating || !previewUrl}
          >
            {t('share.save')}
          </button>
        </div>

        {isIOS() && (
          <p className="share__xhint">{t('share.iosSaveHint')}</p>
        )}
      </div>
    </div>
  );
}
