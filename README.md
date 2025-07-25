# Client-Side OCR Web Application

A browser-based OCR (Optical Character Recognition) application with multiple OCR engines running entirely client-side. Extract text from images and PDFs directly in your browser without any server. Features both Tesseract.js (recommended for accuracy) and experimental PaddleOCR v5 support.

🔗 **Live Demo**: [https://siva-sub.github.io/client-ocr-app](https://siva-sub.github.io/client-ocr-app)

## Features

- 🚀 **100% Client-Side**: All processing happens in your browser using WebAssembly
- 🔒 **Privacy-First**: Your images and PDFs never leave your device
- 🔄 **Dual OCR Engines**: 
  - **Tesseract.js** (Recommended): Mature, accurate OCR engine especially for English
  - **PaddleOCR v5** (Experimental): Mobile models via ONNX Runtime - faster but less accurate
- 📄 **PDF Support**: Extract text from multi-page PDF documents with visual preview
- 🖼️ **PDF Preview**: See thumbnails of PDF pages before processing
- 🌍 **Language Support**: English (best), with experimental multilingual support
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🎯 **Easy to Use**: Simple drag-and-drop interface
- 💾 **Export Options**: Copy text or download as file
- 📊 **Confidence Scores**: See detection confidence for each text region

## Technology Stack

- **Tesseract.js**: Mature OCR engine with excellent English support
- **PaddleOCR v5** (Experimental): Mobile models for faster processing
- **ONNX Runtime Web**: Neural network inference in browser (for PaddleOCR)
- **PDF.js**: Mozilla's PDF rendering library
- **Vite**: Lightning fast build tool
- **WebAssembly**: Near-native performance for OCR processing

## OCR Engines

### Tesseract.js (Recommended)
- **Accuracy**: Excellent for English text
- **Languages**: 100+ languages with downloadable language packs
- **Size**: ~15MB core + language data
- **Performance**: Slower but more accurate

### PaddleOCR v5 (Experimental)
- **Note**: Using mobile models via ONNX Runtime - lower accuracy than native implementation
- **Detection**: PP-OCRv5_mobile_det_infer.onnx (4.7MB)
- **Recognition**: en_PP-OCRv4_mobile_rec_infer.onnx (7.4MB) for English
- **Performance**: Faster but less accurate, especially for complex layouts

## PDF-Extract-Kit Integration

The project includes Python scripts from [PDF-Extract-Kit](https://github.com/opendatalab/PDF-Extract-Kit) for advanced PDF processing:

- **Table Parsing**: Extract and parse tables from PDFs
- **Layout Detection**: Analyze document structure and layout
- **Formula Detection**: Detect mathematical formulas
- **Formula Recognition**: Extract and recognize mathematical expressions

Note: These scripts require server-side execution and are included for future integration.

## Getting Started

### Prerequisites

- Node.js 16+ and npm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/siva-sub/client-ocr-app.git
cd client-ocr-app
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:3000`

## Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Deployment

### Deploy to GitHub Pages

```bash
npm run deploy
```

### Deploy to Other Platforms

The `dist` folder contains static files that can be deployed to any static hosting service:
- Netlify
- Vercel
- AWS S3
- Cloudflare Pages

## Usage

1. **Upload a File**: Click the upload area or drag and drop an image/PDF
2. **Process**: Click "Extract Text" to run OCR
3. **View Results**: See extracted text with confidence scores
4. **Export**: Copy the text or download as a .txt file

## Supported File Formats

### Images
- JPEG/JPG
- PNG
- WebP

### Documents
- PDF (multi-page support)

## How It Works

### Tesseract.js Engine (Default)
1. **Image Loading**: Files are loaded directly in the browser
2. **PDF Processing**: PDFs are rendered to images using PDF.js
3. **Preprocessing**: Image enhancement and binarization
4. **OCR Processing**: Tesseract engine analyzes the entire image
5. **Post-processing**: Text extraction with confidence scores
6. **Results Display**: Extracted text with formatting preserved

### PaddleOCR Engine (Experimental)
1. **Image Loading**: Files are loaded directly in the browser
2. **PDF Processing**: PDFs are rendered to images using PDF.js
3. **Text Detection**: PP-OCRv5 mobile model identifies text regions
4. **Text Recognition**: PP-OCRv4 model extracts text from each region
5. **Post-processing**: CTC decoding with lowered thresholds
6. **Results Display**: Text shown with bounding boxes

## Performance

### Tesseract.js (Recommended)
- Model loading: ~15MB core + language data (cached)
- Processing time: 3-5 seconds per image (more accurate)
- Better handling of complex layouts and fonts

### PaddleOCR (Experimental)
- Model loading: ~12MB (one-time download, cached)
- Processing time: 1-2 seconds per image (faster but less accurate)
- Mobile models have limitations compared to server models
- Lower accuracy due to ONNX Runtime constraints

All processing is local after initial model download.

## OCR Pipeline

```
Image/PDF → Preprocessing → Detection (PP-OCRv5) → Cropping → Recognition (PP-OCRv4) → Results
```

### Detection Phase
- Resizes image to optimal size (max 960px)
- Normalizes using ImageNet statistics
- Runs PP-OCRv5 detection model
- Post-processes with DB algorithm
- Outputs text region bounding boxes

### Recognition Phase
- Crops detected regions
- Resizes to fixed height (48px)
- Runs PP-OCRv4 recognition model
- CTC decodes character sequences
- Filters by confidence threshold

## Privacy & Security

- **No Data Transmission**: All processing happens in your browser
- **No Server Storage**: We don't store or transmit your files
- **Complete Privacy**: Your documents never leave your device
- **Open Source**: All code is publicly auditable
- **Local Model Execution**: Neural networks run entirely in WebAssembly

## Browser Support

- ✅ Chrome/Edge 90+: Full support with best performance
- ✅ Firefox 89+: Full support
- ✅ Safari 15.4+: Full support (requires WebAssembly SIMD)
- ⚠️ Mobile browsers: Supported but slower due to limited resources

## Project Structure

```
client-ocr-app/
├── src/
│   ├── main.js                    # Main application logic
│   ├── ppocr-onnx-engine.js      # PP-OCR engine with ONNX Runtime
│   ├── tesseract-ocr-engine.js   # Alternative Tesseract engine
│   └── style.css                 # Styles
├── public/
│   └── models/                   # ONNX model files
│       ├── PP-OCRv5_mobile_det_infer.onnx
│       ├── PP-OCRv5_mobile_rec_infer.onnx
│       ├── en_PP-OCRv4_mobile_rec_infer.onnx
│       └── en_dict.txt
├── index.html                    # Entry HTML file
├── vite.config.js               # Vite configuration
└── package.json                 # Project metadata
```

## Configuration

The OCR engine can be configured by modifying the CONFIG object in `ppocr-onnx-engine.js`:

```javascript
const CONFIG = {
    // Detection parameters
    det_limit_side_len: 960,      // Max image size for detection
    det_db_thresh: 0.3,           // Detection threshold
    det_db_box_thresh: 0.6,       // Box confidence threshold
    det_db_unclip_ratio: 1.5,     // Box expansion ratio
    
    // Recognition parameters
    rec_batch_num: 6,             // Batch size for recognition
    drop_score: 0.5,              // Min confidence to keep result
};
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Guidelines

1. Keep models lightweight for web deployment
2. Maintain client-side only processing
3. Test on multiple browsers
4. Follow existing code style
5. Update documentation for new features

## Troubleshooting

### Slow Initial Load
- First load downloads ~12MB of models
- Models are cached after first download
- Check browser DevTools Network tab

### Low Accuracy
- Ensure images have good contrast
- Text should be horizontal or nearly horizontal
- Minimum text height ~20 pixels
- Try adjusting detection threshold

### Memory Issues
- Large PDFs may cause memory issues
- Process one page at a time for large documents
- Close other browser tabs to free memory

## Model Information

### PP-OCRv5 Mobile Detection Model
- Architecture: DBNet with MobileNetV3 backbone
- Input size: Dynamic (resized to multiple of 32)
- Output: Probability map of text regions
- Optimized thresholds for better detection

### PP-OCRv4 English Recognition Model
- Architecture: CRNN with MobileNetV3 backbone
- Input size: Fixed height 48px, variable width
- Output: Character sequence probabilities
- Language: English-specific
- Enhanced preprocessing for better accuracy

## License

MIT License - see LICENSE file for details

## Author

**Siva Sub**
- GitHub: [@siva-sub](https://github.com/siva-sub)
- LinkedIn: [sivasub987](https://www.linkedin.com/in/sivasub987)

## Acknowledgments

- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) for the amazing OCR models
- **Special thanks to [SWHL's PaddleOCR Model Converter](https://huggingface.co/spaces/SWHL/PaddleOCRModelConverter)** for the excellent tool that enabled converting PP-OCRv5 server models to ONNX format
- [ONNX Runtime](https://onnxruntime.ai/) for WebAssembly inference
- [PT-Perkasa-Pilar-Utama](https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr) for preprocessing implementations
- [RapidOCR](https://github.com/RapidAI/RapidOCR) for optimization techniques
- [PDF.js](https://mozilla.github.io/pdf.js/) for PDF rendering
- [Vite](https://vitejs.dev/) for the blazing fast build tool

## References

- [PaddleOCR Documentation](https://paddlepaddle.github.io/PaddleOCR/)
- [ONNX Runtime Web Documentation](https://onnxruntime.ai/docs/get-started/with-javascript.html)
- [PP-OCRv5 Paper](https://arxiv.org/abs/2206.03001)