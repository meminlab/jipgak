/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '집각',
        short_name: '집각',
        description: '실거래가 지도 + 내 종잣돈·대출로 살 수 있는 아파트 단지 관리',
        lang: 'ko',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        // 임시 아이콘. 디자인 기준(BANB-63) 확정 후 PNG 192/512로 교체.
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
