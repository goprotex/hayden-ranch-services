/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        tan: {
          50: '#faf6f0', 100: '#f0e6d4', 200: '#e0cba8', 300: '#d1b080',
          400: '#c19a6b', 500: '#a8825a', 600: '#8c6a47', 700: '#6e5238',
          800: '#54402c', 900: '#3d2f21', 950: '#261d15',
        },
        steel: {
          50: '#fafafa', 100: '#f5f5f5', 200: '#e5e5e5', 300: '#d4d4d4',
          400: '#a3a3a3', 500: '#737373', 600: '#525252', 700: '#404040',
          800: '#262626', 900: '#171717', 950: '#0a0a0a',
        },
        surface: {
          50: '#1a1a1a', 100: '#141414', 200: '#0f0f0f', 300: '#0a0a0a',
          400: '#050505', 500: '#000000',
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.04em',
        brutal: '-0.02em',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'fade-in-up': 'fadeInUp 0.5s ease-out',
        'slide-in-left': 'slideInLeft 0.4s ease-out',
        'slide-in-right': 'slideInRight 0.4s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeInUp: { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideInLeft: { '0%': { opacity: '0', transform: 'translateX(-12px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        slideInRight: { '0%': { opacity: '0', transform: 'translateX(12px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(0.98)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
      },
      borderRadius: {
        'none': '0',
        'sm': '2px',
        DEFAULT: '3px',
        'md': '4px',
        'lg': '6px',
        'xl': '6px',
        '2xl': '6px',
      },
    },
  },
  plugins: [],
};
