#!/bin/bash
# Build script for visual OCR application with Mantine styling

echo "Building visual OCR application..."

# Create dist directory
rm -rf dist-visual
mkdir -p dist-visual

# Copy HTML file
echo "Copying HTML files..."
cp index-mantine.html dist-visual/index.html

# Copy static files
echo "Copying static files..."
cp -r public/* dist-visual/
cp package.json dist-visual/
cp README.md dist-visual/

# Copy source files
echo "Copying source files..."
mkdir -p dist-visual/src
cp -r src/* dist-visual/src/

# Update main entry point
mv dist-visual/src/main-visual.js dist-visual/src/main.js
sed -i 's|main-visual\.js|main.js|g' dist-visual/index.html

# Create deployment info
cat > dist-visual/deployment-info.json << EOF
{
  "version": "3.0.0",
  "buildDate": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "features": [
    "Visual bounding box display",
    "Mantine UI design system",
    "PaddleOCR ONNX models",
    "Tesseract.js support",
    "Interactive results viewer"
  ]
}
EOF

echo "Build complete! Files are in dist-visual/"
echo ""
echo "To test locally:"
echo "  cd dist-visual && python3 -m http.server 8080"
echo ""
echo "To deploy to GitHub Pages:"
echo "  1. Copy dist-visual/* to root directory"
echo "  2. Commit and push to gh-pages branch"