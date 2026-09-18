import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    // Vite 8 usa Rolldown como bundler. Su API nativa para dividir chunks es
    // `rolldownOptions.output.codeSplitting` con `groups`, que agrupa las
    // dependencias pesadas en chunks de vendor independientes y cacheables.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|react-router|react-redux)[\\/]/,
            },
            {
              name: 'redux-vendor',
              test: /node_modules[\\/]@reduxjs[\\/]/,
            },
            {
              name: 'ui-vendor',
              test: /node_modules[\\/](lucide-react|sonner)[\\/]/,
            },
          ],
        },
      },
    },
  },
})
