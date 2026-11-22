'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  NOAH_LOCALES,
  NOAH_LOCALE_KEY,
  NOAH_LANGUAGE_NAMES,
  resolveNoahLocale,
  noahTranslate,
  type NoahLocale,
} from '@/lib/noah-i18n';
const LocaleContext = createContext<{
  locale: NoahLocale;
  choice: string;
  setChoice: (value: string) => void;
}>({ locale: 'ja', choice: 'auto', setChoice: () => {} });
export function NoahLocaleProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState('auto'),
    [locale, setLocale] = useState<NoahLocale>('ja');
  useEffect(() => {
    const read = () => {
      let saved = 'auto';
      try {
        saved = localStorage.getItem(NOAH_LOCALE_KEY) ?? 'auto';
      } catch {
        /* Preference is optional. */
      }
      setChoice(saved);
      setLocale(
        NOAH_LOCALES.includes(saved as NoahLocale)
          ? (saved as NoahLocale)
          : resolveNoahLocale(navigator.languages),
      );
    };
    read();
    window.addEventListener('storage', read);
    window.addEventListener('languagechange', read);
    return () => {
      window.removeEventListener('storage', read);
      window.removeEventListener('languagechange', read);
    };
  }, []);
  useEffect(() => {
    const before = {
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
    };
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    return () => {
      document.documentElement.lang = before.lang;
      document.documentElement.dir = before.dir;
    };
  }, [locale]);
  const change = (value: string) => {
    const valid = NOAH_LOCALES.includes(value as NoahLocale) ? value : 'auto';
    setChoice(valid);
    setLocale(
      valid === 'auto'
        ? resolveNoahLocale(navigator.languages)
        : (valid as NoahLocale),
    );
    try {
      localStorage.setItem(NOAH_LOCALE_KEY, valid);
    } catch {
      /* Works for this session. */
    }
  };
  return (
    <LocaleContext.Provider value={{ locale, choice, setChoice: change }}>
      <div lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        {children}
      </div>
    </LocaleContext.Provider>
  );
}
export function useNoahLocale() {
  const context = useContext(LocaleContext);
  const t = useCallback(
    (source: string, values?: Record<string, string | number>) =>
      noahTranslate(context.locale, source, values),
    [context.locale],
  );
  return { ...context, t };
}
export function NoahLanguageSetting() {
  const { t, choice, setChoice } = useNoahLocale();
  return (
    <label
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        paddingBlock: 16,
      }}
    >
      <strong>{t('言語')}</strong>
      <select
        aria-label={t('言語')}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      >
        <option value="auto">{t('端末の言語')}</option>
        {NOAH_LOCALES.map((code) => (
          <option key={code} value={code} lang={code}>
            {NOAH_LANGUAGE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
