/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Anton ships one weight (400) — display-only, never body text.
        display: ['Anton', 'sans-serif'],
        body: ['Archivo', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      colors: {
        'bg-primary':    'rgb(var(--bg-primary) / <alpha-value>)',
        'bg-secondary':  'rgb(var(--bg-secondary) / <alpha-value>)',
        'bg-card':       'rgb(var(--bg-card) / <alpha-value>)',
        'border-default':'rgb(var(--border-default) / <alpha-value>)',
        'text-primary':  'rgb(var(--text-primary) / <alpha-value>)',
        'text-secondary':'rgb(var(--text-secondary) / <alpha-value>)',
        'text-tertiary': 'rgb(var(--text-tertiary) / <alpha-value>)',
        accent:          'rgb(var(--accent) / <alpha-value>)',
        // Brand red is rationed (hero score-bug, "you" accents, active
        // sub-tab underline) — never a substitute for danger/trend red.
        brand:           'rgb(var(--brand) / <alpha-value>)',
        'brand-deep':    'rgb(var(--brand-deep) / <alpha-value>)',
        'brand-bright':  'rgb(var(--brand-bright) / <alpha-value>)',
        'tier-contend':  'rgb(var(--tier-contend) / <alpha-value>)',
        'tier-middle':   'rgb(var(--tier-middle) / <alpha-value>)',
        'tier-rebuild':  'rgb(var(--tier-rebuild) / <alpha-value>)',
        success:         'rgb(var(--success) / <alpha-value>)',
        warning:         'rgb(var(--warning) / <alpha-value>)',
        danger:          'rgb(var(--danger) / <alpha-value>)',
        'pos-qb':        'rgb(var(--pos-qb) / <alpha-value>)',
        'pos-rb':        'rgb(var(--pos-rb) / <alpha-value>)',
        'pos-wr':        'rgb(var(--pos-wr) / <alpha-value>)',
        'pos-te':        'rgb(var(--pos-te) / <alpha-value>)',
        'pos-def':       'rgb(var(--pos-def) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}
