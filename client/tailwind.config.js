/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        arena: {
          bg: '#0a0a0f',
          surface: '#12121a',
          border: '#1e1e2e',
          hover: '#1a1a2e',
          accent: '#6366f1',
          accentHover: '#818cf8',
          text: '#e4e4e7',
          muted: '#71717a',
          green: '#22c55e',
          red: '#ef4444',
          yellow: '#eab308',
          blue: '#3b82f6',
        }
      }
    },
  },
  plugins: [],
}
