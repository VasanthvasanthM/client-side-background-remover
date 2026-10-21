/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.html', './assets/js/**/*.js', './scripts/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Noto Sans',
          'Noto Sans Devanagari',
          'Noto Sans Arabic',
          'Segoe UI Arabic',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        /* The product accent. Violet sits far from every preset background
           swatch and from the checkerboard grey, so a selected control is
           never confused with the image being edited. */
        cut: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5d9e2',
          300: '#b0b8c9',
          400: '#8591a9',
          500: '#66738e',
          600: '#515c75',
          700: '#424a5e',
          800: '#394050',
          900: '#242936',
          950: '#171a22',
        },
      },
      maxWidth: {
        content: '84rem',
      },
    },
  },
  plugins: [],
};
