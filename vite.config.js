import { defineConfig } from 'vite'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, readdirSync } from 'fs'

// Plugin to copy static assets
const copyAssetsPlugin = () => {
  return {
    name: 'copy-assets',
    writeBundle() {
      // Copy icons
      try {
        mkdirSync('dist/icons', { recursive: true });
        const iconFiles = readdirSync('icons');
        iconFiles.forEach(file => {
          copyFileSync(`icons/${file}`, `dist/icons/${file}`);
        });
        console.log('Icons copied successfully');
      } catch (error) {
        console.error('Error copying icons:', error);
      }

      // Copy models
      try {
        mkdirSync('dist/models', { recursive: true });
        
        // Copy PPU models
        copyFileSync('models/PP-OCRv5_mobile_det_infer.onnx', 'dist/models/PP-OCRv5_mobile_det_infer.onnx');
        copyFileSync('models/en_PP-OCRv4_mobile_rec_infer.onnx', 'dist/models/en_PP-OCRv4_mobile_rec_infer.onnx');
        
        // Copy OnnxOCR models
        const modelDirs = ['ppocrv5', 'ppocrv4', 'ch_ppocr_server_v2.0'];
        modelDirs.forEach(dir => {
          const subDirs = ['det', 'rec', 'cls'];
          subDirs.forEach(subDir => {
            try {
              mkdirSync(`dist/models/${dir}/${subDir}`, { recursive: true });
              const files = readdirSync(`models/${dir}/${subDir}`);
              files.forEach(file => {
                if (file.endsWith('.onnx')) {
                  copyFileSync(`models/${dir}/${subDir}/${file}`, `dist/models/${dir}/${subDir}/${file}`);
                }
              });
            } catch (error) {
              // Some models might not have all subdirs
            }
          });
        });
        
        console.log('Models copied successfully');
      } catch (error) {
        console.error('Error copying models:', error);
      }

      // Copy manifest and service worker
      try {
        copyFileSync('manifest.json', 'dist/manifest.json');
        copyFileSync('sw.js', 'dist/sw.js');
        console.log('PWA files copied successfully');
      } catch (error) {
        console.error('Error copying PWA files:', error);
      }
    }
  };
};

export default defineConfig({
  base: '/client-ocr-app/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'tesseract': ['tesseract.js']
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
    include: ['tesseract.js'],
    exclude: ['onnxruntime-web']
  },
  worker: {
    format: 'es'
  },
  plugins: [copyAssetsPlugin()]
})