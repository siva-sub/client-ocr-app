# Client-Side OCR App

A modern, client-side OCR (Optical Character Recognition) application that runs entirely in your browser using Transformers.js.

🔗 **Live Demo**: [https://siva-sub.github.io/client-ocr-app](https://siva-sub.github.io/client-ocr-app)

## Features

- 🚀 **100% Client-Side**: All processing happens in your browser - no server required
- 🔒 **Privacy-First**: Your images never leave your device
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🎯 **Easy to Use**: Simple drag-and-drop interface
- 💾 **Export Options**: Copy text or download as file
- ⚡ **Fast Processing**: Powered by WebAssembly and modern web APIs

## Technology Stack

- **Vite** - Lightning fast build tool
- **Transformers.js** - Run transformer models directly in the browser
- **TrOCR** - State-of-the-art OCR model from Microsoft
- **GitHub Pages** - Free hosting for static sites

## Getting Started

### Prerequisites

- Node.js 18+ and npm

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

1. Update the `homepage` field in `package.json` with your GitHub username
2. Build and deploy:
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

1. **Upload an Image**: Click the upload area or drag and drop an image
2. **Process**: Click "Extract Text" to run OCR
3. **Export**: Copy the text or download as a file

## Supported Image Formats

- JPEG/JPG
- PNG
- WebP

## Performance Tips

- For best results, use clear, high-contrast images
- Images with handwritten text may take longer to process
- First-time loading may be slower as models are downloaded and cached

## Development

### Project Structure

```
client-ocr-app/
├── src/
│   ├── main.js      # Main application logic
│   └── style.css    # Styles
├── index.html       # Entry HTML file
├── vite.config.js   # Vite configuration
└── package.json     # Project metadata
```

### Key Components

- **Image Upload**: Drag-and-drop or click to upload
- **OCR Pipeline**: Uses Transformers.js with TrOCR model
- **Results Display**: Shows extracted text with copy/download options

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License

## Author

**Siva Sub**
- GitHub: [@siva-sub](https://github.com/siva-sub)
- LinkedIn: [sivasub987](https://www.linkedin.com/in/sivasub987)

## Acknowledgments

- [Hugging Face](https://huggingface.co/) for Transformers.js
- [Microsoft](https://github.com/microsoft/unilm/tree/master/trocr) for TrOCR model
- [Vite](https://vitejs.dev/) for the amazing build tool