/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // ECharts is ~250 kB gzipped; fine for a client-only app
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
