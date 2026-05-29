/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['"Barlow Condensed"', 'sans-serif'],
        body: ['"IBM Plex Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      colors: {
        'bg-primary':    '#0D0D0F',
        'bg-secondary':  '#16161A',
        'bg-card':       '#1C1C21',
        'border-default':'#2A2A30',
        'text-primary':  '#F0F0F5',
        'text-secondary':'#8A8A95',
        'text-tertiary': '#55555F',
        accent:          '#4F7FFF',
        success:         '#22C55E',
        warning:         '#F59E0B',
        danger:          '#EF4444',
      },
    },
  },
  plugins: [],
}
