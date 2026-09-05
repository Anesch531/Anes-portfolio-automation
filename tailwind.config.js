/** Mirrors the theme that used to live inline in portfolio/index.html. */
module.exports = {
  content: ['./portfolio/**/*.html'],
  theme: {
    extend: {
      colors: {
        ink: '#0B0D10',
        paper: '#F4F7F0',
        acid: '#B8FF3D',
        muted: '#9CA3AF',
        line: 'rgba(244,247,240,.12)'
      },
      fontFamily: {
        display: ['Space Grotesk', 'ui-sans-serif'],
        body: ['IBM Plex Sans', 'ui-sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      }
    }
  },
  plugins: []
}
