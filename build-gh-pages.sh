#!/bin/bash

# Build for GitHub Pages
echo "Building for GitHub Pages..."

# Build the app
npm run build

# Copy public files to dist
echo "Copying public files..."
cp -r public/icons dist/
cp -r public/screenshots dist/
cp -r public/models dist/
cp -r public/assets dist/
cp public/manifest.json dist/
cp public/sw.js dist/

# List the dist directory
echo "Build complete. Contents of dist directory:"
ls -la dist/

echo "Ready to deploy to GitHub Pages!"