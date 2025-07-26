# 🔍 Smart OCR - Visual Text Recognition in Your Browser

<div align="center">

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20Now-blue?style=for-the-badge&logo=github)](https://siva-sub.github.io/client-ocr-app)
[![npm version](https://img.shields.io/npm/v/@siva-sub/client-ocr-app?style=for-the-badge)](https://www.npmjs.com/package/@siva-sub/client-ocr-app)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-Ready-orange?style=for-the-badge&logo=pwa)](https://siva-sub.github.io/client-ocr-app)

**State-of-the-art browser-based OCR with visual results display**

Extract text from images and PDFs with interactive bounding boxes, powered by PaddleOCR 3.0 and ONNX Runtime. 100% client-side - your data never leaves your device.

[**🚀 Try Live Demo**](https://siva-sub.github.io/client-ocr-app) | [**📦 NPM Package**](https://www.npmjs.com/package/@siva-sub/client-ocr-app) | [**📖 Documentation**](#documentation)

<img src="https://github.com/siva-sub/client-ocr-app/assets/demo-screenshot.png" alt="Smart OCR Demo" width="600">

</div>

## ✨ What's New in v3.0

### 🎯 Visual OCR Interface
- **Interactive Bounding Boxes**: See exactly where text was detected
- **Click-to-Select**: Click any detection to highlight and view details
- **Three View Modes**: Visual, Text-only, and JSON views
- **Responsive Design**: Works perfectly on desktop and mobile

### 🏗️ OnnxOCR Architecture
- Modular pipeline following [OnnxOCR](https://github.com/jingsongliujing/OnnxOCR) implementation
- Separated preprocessing, detection, classification, and recognition modules
- Enhanced accuracy with proper DB postprocessing and CTC decoding

## 🚀 Features

- **🔒 100% Private**: All processing in your browser, no server uploads
- **🎨 Visual Results**: Interactive bounding boxes show detected text regions
- **⚡ Fast & Accurate**: PP-OCRv5 models with WebGL acceleration
- **📱 PWA Support**: Install and use offline
- **🌍 Multi-language**: English, Chinese, Japanese, Korean support
- **📄 PDF Support**: Extract text from multi-page PDFs
- **💾 Smart Caching**: Instant re-processing of previously analyzed files

## 📸 Screenshots

<table>
<tr>
<td><img src="screenshots/visual-mode.png" alt="Visual Mode" width="300"><br><b>Visual Detection Mode</b></td>
<td><img src="screenshots/text-results.png" alt="Text Results" width="300"><br><b>Clean Text Output</b></td>
<td><img src="screenshots/mobile-view.png" alt="Mobile View" width="300"><br><b>Mobile Responsive</b></td>
</tr>
</table>

## 🎯 Quick Start

### Online Demo (Recommended)
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

### Using the Visual Interface

1. **Upload Image**: Drag & drop or click to select images/PDFs
2. **Select Engine**: Choose PaddleOCR for visual results or Tesseract for text-only
3. **Process**: Click "Process Images" to start OCR
4. **View Results**:
   - **Visual Tab**: See bounding boxes overlaid on your image
   - **Text Tab**: Get clean, copyable text
   - **JSON Tab**: Access raw OCR data with coordinates

### Supported Formats
- **Images**: JPEG, PNG, WebP
- **Documents**: PDF (multi-page support)
- **Batch Processing**: Process multiple files at once

### OCR Engines

#### PaddleOCR (Recommended)
- Visual bounding box display
- PP-OCRv5 models for best accuracy
- Angle classification for rotated text
- Mobile models for faster processing

#### Tesseract.js
- Traditional OCR engine
- Good baseline accuracy
- Text-only output

## 🛠️ Technology Stack

- **PaddleOCR 3.0**: State-of-the-art OCR models
- **ONNX Runtime Web**: Hardware-accelerated inference
- **Mantine UI**: Modern, responsive design
- **Vite**: Lightning-fast build tool
- **PDF.js**: PDF rendering and processing

## 📊 Performance

- **Model Size**: ~12MB (cached after first load)
- **Processing Time**: 1-3 seconds per image
- **Accuracy**: 95%+ on clean documents
- **Browser Support**: Chrome 90+, Firefox 89+, Safari 15.4+

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details

## 🙏 Acknowledgments

- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) - State-of-the-art OCR models
- [OnnxOCR](https://github.com/jingsongliujing/OnnxOCR) - ONNX implementation reference
- [Tesseract.js](https://tesseract.projectnaptha.com/) - JavaScript OCR engine
- [ONNX Runtime Web](https://onnxruntime.ai/) - Browser-based model inference

## 📧 Contact

**Sivasubramanian Ramanathan**
- Email: [hello@sivasub.com](mailto:hello@sivasub.com)
- GitHub: [@siva-sub](https://github.com/siva-sub)
- Website: [sivasub.com](https://sivasub.com)

---

<div align="center">
Made with ❤️ by <a href="https://github.com/siva-sub">Siva</a>
</div>