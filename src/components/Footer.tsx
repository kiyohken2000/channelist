import { useTranslation } from 'react-i18next';
import {
  GITHUB_REPO_URL,
  PRIVACY_POLICY_URL,
  BUY_ME_A_COFFEE_URL,
} from '../constants';
import bmcButton from '../assets/images/bmc-button.png';

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="footer">
      <div className="footer__links">
        <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
          {t('footer.github')}
        </a>
        <span aria-hidden="true">·</span>
        <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
          {t('footer.privacy')}
        </a>
      </div>
      <a
        className="footer__bmc"
        href={BUY_ME_A_COFFEE_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img src={bmcButton} alt={t('footer.buyMeACoffee')} height={40} />
      </a>
    </footer>
  );
}
