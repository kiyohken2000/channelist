import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Subscription, ShareLayout } from '../types';
import {
  renderShareImage,
  LAYOUT_MAX_COUNT,
  COUNT_OPTIONS,
} from '../lib/shareImage';
import { downloadBlob, todayStamp } from '../lib/download';
import { SITE_URL, buildXIntentUrl } from '../constants';
import xIcon from '../assets/images/x-icon-64.png';

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
 * タッチ端末(スマホ/タブレット)らしいかを判定する。
 * デスクトップ Chrome/Edge(Windows)も navigator.canShare({files}) が真になるため、
 * X 共有では「共有シート経路(画像添付可)」を使うかどうかの分岐にこれを併用する。
 */
function isTouchLikeDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return coarsePointer || mobileUA;
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
  const [count, setCount] = useState(30);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [xHint, setXHint] = useState(false);

  const blobRef = useRef<Blob | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const maxCount = LAYOUT_MAX_COUNT[layout];
  const effectiveCount = Math.min(count, maxCount);

  // 共有シート(画像添付)経路を使うのはタッチ端末かつ Web Share 対応時のみ。
  // PC(canShare が真でも)は共有シートに行かず、保存/intent 経路にする。
  const useShareSheet = canShareFiles && isTouchLikeDevice();

  // 選択変更のたびに Canvas で再生成
  useEffect(() => {
    let cancelled = false;
    setGenerating(true);
    setError(false);
    setXHint(false);

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

        // 共有可否を実ファイルで判定(iOS Safari / Android Chrome で true)
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

  // iOS Safari 対策: 生成済み Blob をユーザージェスチャ内で同期的に共有
  const handleShare = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    const file = new File([blob], fileName(), { type: 'image/png' });
    try {
      await navigator.share({ files: [file] });
    } catch {
      // ユーザーキャンセル等は無視
    }
  };

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

  // X で共有:
  //  - モバイル(canShareFiles): 共有シートに画像 + テキストを渡す(X を選べば画像添付済み)
  //  - PC: X の intent は画像添付不可のため、画像を自動保存してから
  //        テキスト+リンク入りの投稿画面を開き、手動添付を促す
  const handleShareX = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    const tweetText = t('share.tweetText');

    // スマホ等のタッチ端末のみ共有シート経路(画像添付可)。
    // PC は canShare が真でも Windows 共有UIが開くだけで X に飛べないため、
    // intent(テキスト+リンク)+ 画像自動保存の経路にする。
    if (useShareSheet) {
      const file = new File([blob], fileName(), { type: 'image/png' });
      try {
        await navigator.share({ files: [file], text: `${tweetText}\n${SITE_URL}` });
      } catch {
        // ユーザーキャンセル等は無視
      }
      return;
    }

    downloadBlob(blob, fileName());
    window.open(buildXIntentUrl(tweetText), '_blank', 'noopener,noreferrer');
    setXHint(true);
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
                return (
                  <button
                    key={c}
                    type="button"
                    className={`toggle ${effectiveCount === c ? 'toggle--active' : ''}`}
                    aria-pressed={effectiveCount === c}
                    disabled={disabled}
                    onClick={() => setCount(c)}
                  >
                    {c}
                  </button>
                );
              })}
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
            className="btn btn--x"
            onClick={handleShareX}
            disabled={generating || !previewUrl}
          >
            <img src={xIcon} alt="" width={18} height={18} aria-hidden="true" />
            {t('share.shareX')}
          </button>
          {useShareSheet && !isIOS() && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleShare}
              disabled={generating || !previewUrl}
            >
              {t('share.share')}
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={handleSave}
            disabled={generating || !previewUrl}
          >
            {t('share.save')}
          </button>
        </div>

        {xHint && (
          <p className="share__xhint" role="status">
            {t('share.xSavedHint')}
          </p>
        )}
        {isIOS() && (
          <p className="share__xhint">{t('share.iosSaveHint')}</p>
        )}
      </div>
    </div>
  );
}
