/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // CSS variable-based colors for theming
        background: 'var(--color-background)',
        'background-alt': 'var(--color-background-alt)',
        foreground: 'var(--color-foreground)',
        'foreground-secondary': 'var(--color-foreground-secondary)',
        'foreground-muted': 'var(--color-foreground-muted)',
        card: 'var(--color-card)',
        border: 'var(--color-border)',

        // Primary brand color (consistent across themes)
        primary: {
          DEFAULT: '#6366F1',
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
          950: '#1E1B4B',
        },

        // Accent colors
        accent: {
          DEFAULT: '#EC4899',
          purple: '#8B5CF6',
        },

        // Semantic colors
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',

        // PR status colors
        pr: {
          open: '#22C55E',
          merged: '#8B5CF6',
          closed: '#EF4444',
          draft: '#6B7280',
        },

        // GitLab orange
        gitlab: '#F97316',
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
      fontSize: {
        'hero': ['64px', { lineHeight: '1.1', fontWeight: '700' }],
        'section': ['48px', { lineHeight: '1.2', fontWeight: '700' }],
        'faq': ['40px', { lineHeight: '1.2', fontWeight: '700' }],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'float-slow': 'float 20s ease-in-out infinite',
        'pulse-border': 'pulse-border 4s infinite',
        'gradient': 'gradient 8s ease infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'scroll': 'scroll 1.5s ease-in-out infinite',
        'shimmer': 'shimmer 3s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '25%': { transform: 'translateY(-20px) scale(1.02)' },
          '50%': { transform: 'translateY(-10px) scale(0.98)' },
          '75%': { transform: 'translateY(-15px) scale(1.01)' },
        },
        'pulse-border': {
          '0%, 100%': {
            borderColor: 'rgba(99, 102, 241, 0.3)',
            boxShadow: '0 0 0 0 rgba(99, 102, 241, 0.2)',
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
        scroll: {
          '0%, 100%': { transform: 'translateY(0)', opacity: '1' },
          '50%': { transform: 'translateY(8px)', opacity: '0.5' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      backgroundSize: {
        '300%': '300%',
      },
      boxShadow: {
        'card': '0 20px 40px -15px rgba(0, 0, 0, 0.15)',
        'card-hover': '0 25px 50px -12px rgba(99, 102, 241, 0.25)',
        'glow': '0 0 40px rgba(99, 102, 241, 0.4)',
      },
    },
  },
  plugins: [],
};
