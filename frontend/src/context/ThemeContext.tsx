import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

export type Theme = 'light' | 'dark';

/**
 * Thème unique clair pour toutes les zones.
 * Les tokens sombres restent définis dans styles/tokens.css pour un éventuel retour.
 */
export const AGENT_ROUTE_PREFIXES = ['/login', '/verification', '/coordination', '/enquete', '/agent'];

export function isAgentPath(pathname: string): boolean {
  return AGENT_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function getTheme(_pathname: string): Theme {
  return 'light';
}

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();

  const theme = useMemo(() => getTheme(location.pathname), [location.pathname]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#04101c' : '#f3f6fa');
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      isDark: theme === 'dark',
    }),
    [theme]
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
