import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext({ isDarkMode: true, toggleTheme: () => {} });

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('planora:isDarkMode');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('planora:isDarkMode', JSON.stringify(isDarkMode));
    } catch {
      // ignore storage errors
    }
    // Optional: sync a class on html for future Tailwind dark usage
    const root = document.documentElement;
    if (isDarkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [isDarkMode]);

  const value = useMemo(
    () => ({ isDarkMode, toggleTheme: () => setIsDarkMode((d) => !d) }),
    [isDarkMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
