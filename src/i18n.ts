import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ja from './locales/ja.json';
import en from './locales/en.json';

export const LANGUAGE_STORAGE_KEY = 'channelist:lang';

/**
 * 初期言語を決定する。
 * localStorage に保存された選択があればそれを優先し、
 * なければ navigator.language が `ja` 系なら日本語、それ以外は英語。
 * (保存するのは言語設定のみ。それ以外のデータは localStorage に置かない)
 */
function detectInitialLanguage(): 'ja' | 'en' {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === 'ja' || saved === 'en') return saved;
  } catch {
    // localStorage 不可時は navigator 判定にフォールバック
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return nav.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    ja: { translation: ja },
    en: { translation: en },
  },
  lng: detectInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function changeLanguage(lang: 'ja' | 'en'): void {
  i18n.changeLanguage(lang);
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // 保存失敗は無視(プライベートブラウジング等)
  }
}

export default i18n;
