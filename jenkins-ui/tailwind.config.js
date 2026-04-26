/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        jenkins: {
          blue: '#335061',
          red: '#d33833',
          yellow: '#f0ad4e',
          green: '#5cb85c',
        },
      },
    },
  },
  plugins: [],
}
