/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#b45309',
          dark:    '#92400e',
          light:   '#d97706',
        },
        surface: {
          DEFAULT: '#1c1917',
          card:    '#292524',
          border:  '#44403c',
        },
      },
    },
  },
  plugins: [],
};
