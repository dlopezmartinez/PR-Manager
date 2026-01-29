/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            fontSize: '1rem',
            lineHeight: '1.75',
            color: 'var(--color-foreground-secondary)',
            p: {
              marginTop: '1em',
              marginBottom: '1em',
            },
            h1: {
              color: 'var(--color-foreground)',
              fontSize: '1.875rem',
              fontWeight: '700',
              marginTop: '2em',
              marginBottom: '0.75em',
            },
            h2: {
              color: 'var(--color-foreground)',
              fontSize: '1.5rem',
              fontWeight: '600',
              marginTop: '1.75em',
              marginBottom: '0.75em',
            },
            h3: {
              color: 'var(--color-foreground)',
              fontSize: '1.25rem',
              fontWeight: '600',
              marginTop: '1.5em',
              marginBottom: '0.5em',
            },
            h4: {
              color: 'var(--color-foreground)',
              fontSize: '1.125rem',
              fontWeight: '600',
            },
            strong: {
              color: 'var(--color-foreground)',
            },
            a: {
              color: '#6366F1',
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline',
              },
            },
            code: {
              color: '#6366F1',
              backgroundColor: 'var(--color-card)',
              borderRadius: '0.25rem',
              padding: '0.125rem 0.375rem',
              fontSize: '0.875em',
            },
            'code::before': {
              content: '""',
            },
            'code::after': {
              content: '""',
            },
            pre: {
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
              borderWidth: '1px',
              fontSize: '0.875rem',
              borderRadius: '0.5rem',
            },
            blockquote: {
              color: 'var(--color-foreground-secondary)',
              borderLeftColor: '#6366F1',
              backgroundColor: 'var(--color-card)',
              borderRadius: '0 0.5rem 0.5rem 0',
              paddingTop: '0.5rem',
              paddingBottom: '0.5rem',
              fontStyle: 'normal',
            },
            hr: {
              borderColor: 'var(--color-border)',
            },
            ul: {
              paddingLeft: '1.25em',
            },
            ol: {
              paddingLeft: '1.25em',
            },
            li: {
              marginTop: '0.25em',
              marginBottom: '0.25em',
            },
            'ul > li::marker': {
              color: 'var(--color-foreground-muted)',
            },
            'ol > li::marker': {
              color: 'var(--color-foreground-muted)',
            },
            thead: {
              borderBottomColor: 'var(--color-border)',
            },
            'tbody tr': {
              borderBottomColor: 'var(--color-border)',
            },
            table: {
              fontSize: '0.875rem',
            },
            th: {
              color: 'var(--color-foreground)',
              fontWeight: '600',
              padding: '0.75rem',
            },
            td: {
              padding: '0.75rem',
            },
          },
        },
      },
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
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
