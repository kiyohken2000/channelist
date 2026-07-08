import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../i18n';

export function Header() {
  const { t, i18n } = useTranslation();
  const current = i18n.language.startsWith('ja') ? 'ja' : 'en';

  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__logo" aria-hidden="true">
          📺
        </span>
        <span className="header__name">{t('app.name')}</span>
      </div>
      <div
        className="header__lang"
        role="group"
        aria-label={t('header.language')}
      >
        <button
          type="button"
          className={`lang-btn ${current === 'ja' ? 'lang-btn--active' : ''}`}
          aria-pressed={current === 'ja'}
          onClick={() => changeLanguage('ja')}
        >
          JA
        </button>
        <button
          type="button"
          className={`lang-btn ${current === 'en' ? 'lang-btn--active' : ''}`}
          aria-pressed={current === 'en'}
          onClick={() => changeLanguage('en')}
        >
          EN
        </button>
      </div>
    </header>
  );
}
