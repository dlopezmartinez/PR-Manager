/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#5865f2',
          50: '#eef0ff',
          100: '#e0e4ff',
          200: '#c7cdfe',
          300: '#a5aefc',
          400: '#818cf8',
          500: '#5865f2',
          600: '#4752c4',
          700: '#3c45a5',
          800: '#343b85',
          900: '#2e346b',
        },
        accent: {
          DEFAULT: '#ec4899',
          50: '#fdf2f8',
          100: '#fce7f3',
          200: '#fbcfe8',
          300: '#f9a8d4',
          400: '#f472b6',
          500: '#ec4899',
          600: '#db2777',
          700: '#be185d',
          800: '#9d174d',
          900: '#831843',
        },
        dark: {
          DEFAULT: '#050507',
          50: '#18181b',
          100: '#141416',
          200: '#0f0f11',
          300: '#0a0a0c',
          400: '#050507',
        },
        success: '#1a7339',
        warning: '#9a5e00',
        error: '#c42b2b',
        pr: {
          open: '#1a7339',
          merged: '#6d28d9',
          closed: '#c42b2b',
          draft: '#5c5e66',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'liquid': 'liquid 20s ease-in-out infinite',
        'pulse-border': 'pulse-border 4s infinite',
        'gradient': 'gradient 8s ease infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-20px) scale(1.02)' },
        },
        liquid: {
          '0%': { borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%' },
          '50%': { borderRadius: '30% 60% 70% 40% / 50% 60% 30% 60%' },
          '100%': { borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%' },
        },
        'pulse-border': {
          '0%, 100%': {
            borderColor: 'rgba(88, 101, 242, 0.3)',
            boxShadow: '0 0 0 0 rgba(88, 101, 242, 0.2)',
          },
          '50%': {
            borderColor: 'rgba(236, 72, 153, 0.6)',
            boxShadow: '0 0 20px 2px rgba(236, 72, 153, 0.3)',
          },
        },
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backgroundSize: {
        '300%': '300%',
      },
    },
  },
  plugins: [],
};
