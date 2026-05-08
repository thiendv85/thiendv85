/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
    './design-system/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.75rem' }],
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        slate: {
          850: '#151f32',
        },
        atp: {
          primary: '#1E293B',
          secondary: '#334155',
          action: '#DC2626',
          accent: '#F59E0B',
          success: '#10B981',
          background: '#F8FAFC',
          text: {
            dark: '#0F172A',
            light: '#64748B',
          },
        },
      },
      backgroundImage: {
        'gradient-blue': 'linear-gradient(135deg, #1E3A8A 0%, #1E293B 100%)',
        'gradient-emerald': 'linear-gradient(135deg, #065F46 0%, #1E293B 100%)',
        'gradient-rose': 'linear-gradient(135deg, #9F1239 0%, #7F1D1D 100%)',
        'gradient-amber': 'linear-gradient(135deg, #92400E 0%, #78350F 100%)',
        'gradient-slate': 'linear-gradient(135deg, #334155 0%, #1E293B 100%)',
        'gradient-header': 'linear-gradient(135deg, #ffffff 0%, #F8FAFC 100%)',
        'gradient-soft-blue': 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)',
        'gradient-dark': 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        'gradient-professional': 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
        'glass-white': 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
      },
      boxShadow: {
        'soft': '0 4px 12px rgba(0, 0, 0, 0.05)',
        'medium': '0 8px 24px rgba(0, 0, 0, 0.08)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.12)',
        'glow-blue': '0 12px 24px -6px rgba(59, 130, 246, 0.4)',
        'glow-rose': '0 12px 24px -6px rgba(244, 63, 94, 0.4)',
        'glow-emerald': '0 12px 24px -6px rgba(16, 185, 129, 0.4)',
        'glow-amber': '0 12px 24px -6px rgba(245, 158, 11, 0.4)',
      },
    },
  },
  plugins: [],
};
