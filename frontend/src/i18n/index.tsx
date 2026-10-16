import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { dictionaries } from './translations';

export type Language = 'pt' | 'en';

const STORAGE_KEY = 'app_language';

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function isLanguage(value: unknown): value is Language {
  return value === 'pt' || value === 'en';
}

function resolveInitial(): Language {
  if (typeof localStorage === 'undefined') return 'pt';
  const stored = localStorage.getItem(STORAGE_KEY);
  return isLanguage(stored) ? stored : 'pt';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user, refreshUser } = useAuth();
  const [language, setLanguageState] = useState<Language>(resolveInitial);

  // The account preference wins once the profile is available.
  useEffect(() => {
    const preferred = (user as { language?: string } | null)?.language;
    if (isLanguage(preferred) && preferred !== language) {
      setLanguageState(preferred);
      localStorage.setItem(STORAGE_KEY, preferred);
    }
  }, [user, language]);

  const setLanguage = useCallback(
    (next: Language) => {
      setLanguageState(next);
      localStorage.setItem(STORAGE_KEY, next);
      // Persist per-user when signed in (best effort).
      if (user) {
        api
          .updateMyProfile({ language: next })
          .then(() => refreshUser?.())
          .catch(() => {});
      }
    },
    [user, refreshUser]
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = dictionaries[language] ?? dictionaries.pt;
      let value = dict[key] ?? dictionaries.pt[key] ?? key;
      if (vars) {
        for (const [name, replacement] of Object.entries(vars)) {
          value = value.replaceAll(`{${name}}`, String(replacement));
        }
      }
      return value;
    },
    [language]
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
}
