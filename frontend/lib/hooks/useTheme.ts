// lib/hooks/useTheme.ts
'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

// Applies the theme to the <html> element
function apply(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark', // default to the dark design
      setTheme: (t) => { apply(t); set({ theme: t }); },
      toggle:   () => { const next = get().theme === 'dark' ? 'light' : 'dark'; apply(next); set({ theme: next }); },
    }),
    {
      name: 'zaroda-theme',
      onRehydrateStorage: () => (state) => { if (state) apply(state.theme); },
    },
  ),
);
