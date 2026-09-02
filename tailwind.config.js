/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#56B2C1',
          50: '#EEF8FA',
          100: '#D4EFF4',
          200: '#A9DFE9',
          300: '#7ECFDE',
          400: '#56B2C1',
          500: '#56B2C1',
          600: '#3E96A6',
          700: '#347385',
          800: '#245A6B',
          900: '#164050',
        },
        accent: {
          DEFAULT: '#E69738',
          light: '#F0B060',
          dark: '#C67E20',
        },
        secondary: {
          DEFAULT: '#4A5568',
          50: '#F7FAFC',
          100: '#EDF2F7',
          200: '#E2E8F0',
          300: '#CBD5E0',
          400: '#A0AEC0',
          500: '#718096',
          600: '#4A5568',
          700: '#2D3748',
          800: '#1A202C',
          900: '#171923',
        }
      }
    },
  },
  plugins: [],
}
