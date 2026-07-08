import { useState, type FormEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { YOUTUBE_PRIVACY_URL, PRIVACY_POLICY_URL } from '../constants';

interface LandingViewProps {
  onFetch: (handle: string) => void;
}

export function LandingView({ onFetch }: LandingViewProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onFetch(trimmed);
  };

  return (
    <section className="landing">
      <p className="landing__tagline">{t('app.tagline')}</p>

      <ol className="steps">
        <li className="step">
          <h3 className="step__title">{t('landing.step1Title')}</h3>
          <p>
            <Trans i18nKey="landing.step1Body">
              <strong />
            </Trans>
          </p>
          <a
            className="step__link"
            href={YOUTUBE_PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('landing.step1Link')} ↗
          </a>
          <details className="step__details">
            <summary>{t('landing.step1AppSummary')}</summary>
            <p>{t('landing.step1AppDetail')}</p>
          </details>
        </li>

        <li className="step">
          <h3 className="step__title">{t('landing.step2Title')}</h3>
          <p>{t('landing.step2Body')}</p>
        </li>

        <li className="step">
          <h3 className="step__title">{t('landing.step3Title')}</h3>
          <p>
            <Trans i18nKey="landing.step3Body">
              <strong />
            </Trans>
          </p>
        </li>
      </ol>

      <p className="landing__warning" role="note">
        ⚠️ {t('landing.warning')}
      </p>

      <form className="landing__form" onSubmit={handleSubmit}>
        <label className="landing__label" htmlFor="handle-input">
          {t('landing.inputLabel')}
        </label>
        <div className="landing__inputrow">
          <input
            id="handle-input"
            className="landing__input"
            type="text"
            inputMode="text"
            autoComplete="off"
            maxLength={100}
            placeholder={t('landing.inputPlaceholder')}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit" className="btn btn--primary" disabled={!value.trim()}>
            {t('landing.fetchButton')}
          </button>
        </div>
      </form>

      <p className="landing__note">
        {t('landing.noStore')}{' '}
        <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
          {t('landing.privacyLink')}
        </a>
      </p>
    </section>
  );
}
