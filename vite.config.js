import { defineConfig } from 'vite'

export default defineConfig({
  base: '/client-ocr-app/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  },
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