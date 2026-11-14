/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  corePlugins: { preflight: false },
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: 'var(--s1)',
        surface2: 'var(--s2)',
        surface3: 'var(--s3)',
        ink: 'var(--tx)',
        ink2: 'var(--tx2)',
        ink3: 'var(--tx3)',
        line: 'var(--line)',
        line2: 'var(--line2)',
        accent: 'var(--water)',
        'accent-hi': 'var(--water-hi)',
        brand: {
          50: '#eff6ff', 100: '#dbeafe', 500: '#2563eb', 600: '#1d4ed8',
          700: '#1d40b0', 900: '#0f172a', 950: '#060d1f',
        },
        alert: { red: '#ef4444', orange: '#f97316', amber: '#eab308', emerald: '#10b981' },
      },
    },
  },
}
