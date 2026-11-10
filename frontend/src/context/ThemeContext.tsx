import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'oid-theme';

/**
 * Constante modifiable définissant les zones et leurs thèmes par défaut
 * - Zone agent (/login, /verification, /coordination, /enquete) -> sombre
 * - Zone publique (/, /signaler, /suivi) -> clair
 */
export const AGENT_ROUTE_PREFIXES = ['/login', '/verification', '/coordination', '/enquete', '/agent'];

export function isAgentPath(pathname: string): boolean {
  return AGENT_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function getDefaultTheme(pathname: string): Theme {
  return isAgentPath(pathname) ? 'dark' : 'light';
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();

  const [storedTheme, setStoredTheme] = useState<Theme | null>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // localStorage indisponible
    }
    return null;
  });

  const currentTheme: Theme = useMemo(() => {
    if (storedTheme) return storedTheme;
    return getDefaultTheme(location.pathname);
  }, [storedTheme, location.pathname]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    document.documentElement.style.colorScheme = currentTheme;
  }, [currentTheme]);

  const setTheme = (newTheme: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // localStorage indisponible
    }
    setStoredTheme(newTheme);
  };

  const toggleTheme = () => {
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  };

  const value = useMemo(
    () => ({
      theme: currentTheme,
      setTheme,
      toggleTheme,
      isDark: currentTheme === 'dark',
    }),
    [currentTheme, storedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
