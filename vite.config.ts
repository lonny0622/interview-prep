import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const gatewayPort = Number(process.env.VITE_GATEWAY_PORT || 8787)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://127.0.0.1:${gatewayPort}`,
    },
  },
})
