#!/bin/bash

# Create placeholder icons for PWA
# These are simple colored squares with text

mkdir -p public/icons

# Function to create a simple SVG icon
create_icon() {
    local size=$1
    local filename=$2
    local text=$3
    local bg_color="${4:-#1a1b1e}"
    
    cat > "public/icons/${filename}" << EOF
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${bg_color}"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size%.*}px" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#228be6" transform="scale(0.15)">${text}</text>
</svg>
EOF
}

# Create standard icons
for size in 72 96 128 144 152 192 384 512; do
    create_icon $size "icon-${size}.svg" "OCR"
    # Convert SVG to PNG using ImageMagick if available
    if command -v convert &> /dev/null; then
        convert -background none "public/icons/icon-${size}.svg" "public/icons/icon-${size}.png"
        rm "public/icons/icon-${size}.svg"
    else
        # If ImageMagick is not available, keep the SVG files
        echo "Created icon-${size}.svg (install ImageMagick to convert to PNG)"
    fi
done

# Create special icons
create_icon 96 "upload-96.svg" "UP" "#25262b"
create_icon 96 "camera-96.svg" "CAM" "#25262b"

if command -v convert &> /dev/null; then
    convert -background none "public/icons/upload-96.svg" "public/icons/upload-96.png"
    convert -background none "public/icons/camera-96.svg" "public/icons/camera-96.png"
    rm "public/icons/upload-96.svg" "public/icons/camera-96.svg"
fi

# Create screenshots directory
mkdir -p public/screenshots

# Create placeholder screenshots
create_icon "1920x1080" "desktop-1.svg" "Smart OCR Desktop" "#1a1b1e"
create_icon "1080x1920" "mobile-1.svg" "Smart OCR Mobile" "#1a1b1e"

if command -v convert &> /dev/null; then
    convert -background none -size 1920x1080 "public/screenshots/desktop-1.svg" "public/screenshots/desktop-1.png"
    convert -background none -size 1080x1920 "public/screenshots/mobile-1.svg" "public/screenshots/mobile-1.png"
    rm "public/screenshots/desktop-1.svg" "public/screenshots/mobile-1.svg"
else
    mv "public/screenshots/desktop-1.svg" "public/screenshots/"
    mv "public/screenshots/mobile-1.svg" "public/screenshots/"
fi

echo "Placeholder icons created successfully!"
ls -la public/icons/
ls -la public/screenshots/