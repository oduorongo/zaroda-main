// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy:   { DEFAULT: '#1a2e5a', deep: '#0f1c38', mid: '#243f7a' },
        gold:   { DEFAULT: '#d4af37', light: '#f0d060' },
        orange: { DEFAULT: '#f5820a' },
        zaroda: {
          navy:   '#1a2e5a',
          gold:   '#d4af37',
          orange: '#f5820a',
          muted:  '#f4f6fb',
          border: '#e2e6f0',
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { xl: '12px', '2xl': '16px', '3xl': '20px' },
      boxShadow: {
        card:  '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        modal: '0 20px 60px -10px rgb(0 0 0 / 0.25)',
      },
    },
  },
  plugins: [],
};
export default config;
