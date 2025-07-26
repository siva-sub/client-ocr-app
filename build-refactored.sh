#!/bin/bash
# Build script for refactored OCR application

echo "Building refactored OCR application..."

# Create dist directory
rm -rf dist-refactored
mkdir -p dist-refactored

# Copy static files
echo "Copying static files..."
cp index-refactored.html dist-refactored/index.html
cp -r public/* dist-refactored/
cp package.json dist-refactored/

# Copy source files
echo "Copying source files..."
mkdir -p dist-refactored/src
cp -r src/* dist-refactored/src/

# Remove old engine files that are no longer needed
echo "Cleaning up old files..."
rm -f dist-refactored/src/ppocr-*.js
rm -f dist-refactored/src/onnx-ocr-engine.js
rm -f dist-refactored/src/onnx-ocr-processors.js
rm -f dist-refactored/src/onnx-ocr-preprocessing.js
rm -f dist-refactored/src/onnx-ocr-postprocessing.js

# Keep only the refactored files
echo "Keeping refactored implementation..."
# Main entry points
mv dist-refactored/src/main-refactored.js dist-refactored/src/main.js
rm -f dist-refactored/src/main-mantine.js

# Update index.html to use the correct main.js
sed -i 's|main-refactored\.js|main.js|g' dist-refactored/index.html

echo "Build complete! Files are in dist-refactored/"
echo ""
echo "To test locally:"
echo "  cd dist-refactored && python3 -m http.server 8080"
echo ""
echo "To deploy to GitHub Pages:"
echo "  1. Copy dist-refactored/* to your gh-pages branch"
echo "  2. Push to GitHub"