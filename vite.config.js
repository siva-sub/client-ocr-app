import { defineConfig } from 'vite'
import { resolve } from 'path'
import fs from 'fs'

export default defineConfig({
  base: '/client-ocr-app/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'onnxruntime': ['onnxruntime-web'],
          'pdfjs': ['pdfjs-dist']
        }
      }
    }
  },
  publicDir: 'public',
  server: {
    port: 3000,
    open: true
  },
  optimizeDeps: {
    include: ['onnxruntime-web', 'pdfjs-dist']
  },
  worker: {
    format: 'es'
  }
})