# 🔍 Smart OCR - Multi-Engine Visual Text Recognition

<div align="center">

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20Now-blue?style=for-the-badge&logo=github)](https://siva-sub.github.io/client-ocr-app)
[![npm version](https://img.shields.io/npm/v/@siva-sub/client-ocr-app?style=for-the-badge)](https://www.npmjs.com/package/@siva-sub/client-ocr-app)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-Ready-orange?style=for-the-badge&logo=pwa)](https://siva-sub.github.io/client-ocr-app)

**Advanced browser-based OCR with multiple engines and visual results**

Choose between fast mobile models or accurate server models. Features PPU-Paddle OCR, OnnxOCR, and Tesseract fallback. 100% client-side processing.

[**🚀 Try Live Demo**](https://siva-sub.github.io/client-ocr-app) | [**📦 NPM Package**](https://www.npmjs.com/package/@siva-sub/client-ocr-app) | [**📖 Documentation**](#documentation)

</div>

## ✨ What's New in v4.0

### 🚀 Complete Multi-Engine Implementation
- **PPU-Paddle-OCR Complete**: Full implementation with deskew, detection, angle classification
- **OnnxOCR TextSystem**: Complete pipeline with TextDetector, TextRecognizer, TextClassifier
- **Enhanced Processing**: All preprocessing and postprocessing methods from both repositories
- **Visual Results**: Advanced visualization with polygon boxes and confidence scores

### 🎯 Advanced Features
- **Auto-Deskew**: Automatic image rotation correction
- **Angle Classification**: 180° rotation detection and correction
- **Smart Padding**: Adaptive padding for better recognition
- **Batch Processing**: Efficient batch recognition for multiple regions
- **WebGL Acceleration**: Optimized for mobile and desktop performance

## 🌟 Features

- **🔐 100% Private**: All processing in browser, no data uploads
- **⚡ Multiple Engines**: 
  - PPU-Paddle-OCR: Fast mobile models with complete processing pipeline
  - OnnxOCR: Accurate server models with TextSystem architecture
  - Tesseract: Reliable fallback with word-level detection
- **🎨 Advanced Visualization**: 
  - Polygon and rectangle bounding boxes
  - Color-coded confidence scores
  - Reading order visualization
- **📱 PWA Support**: Install as app, works offline with cached models
- **🌍 Multi-language**: English, Chinese, Japanese, Korean with proper character dictionaries
- **💾 Smart Model Management**: 
  - Automatic model downloading with progress tracking
  - IndexedDB caching for instant switching
  - Model size optimization
- **📊 Comprehensive Metrics**: 
  - Per-stage processing time
  - Confidence scores for each detected text
  - Model performance comparison

## 🚀 Quick Start

### Online Demo
Visit [https://siva-sub.github.io/client-ocr-app](https://siva-sub.github.io/client-ocr-app)

### NPM Installation
```bash
npm install @siva-sub/client-ocr-app
```

### Local Development
```bash
git clone https://github.com/siva-sub/client-ocr-app.git
cd client-ocr-app
npm install
npm run dev
```

## 📖 Documentation

### Available OCR Engines

#### PPU Mobile (Fast) ⚡
- Optimized for mobile and real-time processing
- PP-OCRv5 detection + PP-OCRv4 recognition
- ~50-200ms processing time
- Best for: Live camera OCR, mobile apps

#### OnnxOCR v5 (Most Accurate) 🎯
- Latest PP-OCRv5 models with angle classification
- Highest accuracy on complex documents
- ~500-1000ms processing time
- Best for: Documents, receipts, forms

#### OnnxOCR v4 (Balanced) ⚖️
- Good balance of speed and accuracy
- PP-OCRv4 full pipeline
- ~300-500ms processing time
- Best for: General purpose OCR

#### OnnxOCR v2 (Server) 🖥️
- Heavy server models for maximum accuracy
- Designed for backend processing
- ~1000-2000ms processing time
- Best for: Batch processing, archives

#### Tesseract (Fallback) 🛡️
- Classic OCR engine
- Works offline without model downloads
- ~500-1500ms processing time
- Best for: Fallback, offline usage

### Usage Guide

1. **Select Engine**: Choose based on your speed/accuracy needs
2. **Upload Image**: Drag & drop or click to select
3. **Process**: Models download automatically on first use
4. **View Results**:
   - Visual mode: See bounding boxes with confidence
   - Text mode: Get clean, copyable text
   - Download results as JSON

### Model Management

- Models are cached after first download
- ✓ indicates cached models (instant loading)
- ⬇ indicates models need downloading
- Switch engines anytime without re-uploading

## 🛠️ Technology Stack

- **[PPU-Paddle-OCR](https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr)**: Mobile-optimized models
- **[OnnxOCR](https://github.com/jingsongliujing/OnnxOCR)**: High-accuracy ONNX models
- **ONNX Runtime Web**: Hardware-accelerated inference
- **Tesseract.js**: Classic OCR fallback
- **OpenCV.js**: Image preprocessing
- **Vite + Mantine**: Modern UI framework

## 📊 Performance Comparison

| Engine | Speed | Accuracy | Model Size | Use Case |
|--------|-------|----------|------------|----------|
| PPU Mobile | ⚡⚡⚡⚡⚡ | ⭐⭐⭐ | 12MB | Real-time OCR |
| OnnxOCR v5 | ⚡⚡ | ⭐⭐⭐⭐⭐ | 25MB | Documents |
| OnnxOCR v4 | ⚡⚡⚡ | ⭐⭐⭐⭐ | 20MB | General |
| OnnxOCR v2 | ⚡ | ⭐⭐⭐⭐⭐ | 40MB | Batch |
| Tesseract | ⚡⚡ | ⭐⭐⭐ | 11MB | Fallback |

## 🤝 Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT License - see [LICENSE](LICENSE) file

## 🙏 Acknowledgments

- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) - State-of-the-art models
- [PPU-Paddle-OCR](https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr) - Mobile optimization
- [OnnxOCR](https://github.com/jingsongliujing/OnnxOCR) - ONNX implementation
- [Tesseract.js](https://tesseract.projectnaptha.com/) - Classic OCR engine

---

<div align="center">
Made with ❤️ by <a href="https://github.com/siva-sub">Siva</a>
</div>