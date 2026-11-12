/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          DEFAULT: '#0B0F17',
          deep: '#06090F',
          surface: '#111827',
          elevated: '#161F30',
        },
        slate: {
          hairline: '#1E293B',
          muted: '#64748B',
          light: '#94A3B8',
          alabaster: '#E2E8F0',
          bright: '#F8FAFC',
        },
        accent: {
          DEFAULT: '#FF5500',
          hover: '#FF6A1A',
          dim: '#993300',
          cyan: '#00F5D4',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Geist Mono', 'SF Mono', 'monospace'],
      },
      borderWidth: {
        hairline: '1px',
      },
    },
  },
  plugins: [],
}
