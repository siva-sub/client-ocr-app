#!/usr/bin/env node

/**
 * Generate PWA icons for Smart OCR
 * Creates all required icon sizes from a base SVG
 */

const fs = require('fs');
const path = require('path');

// Base SVG icon
const baseSvg = `
<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#1a1b1e"/>
  <g transform="translate(256,256)">
    <g transform="scale(8,8)">
      <path d="M9 11H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1zM20 11h-5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1zM9 22H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1zM20 22h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1z" 
            fill="none" 
            stroke="#228be6" 
            stroke-width="2"
            transform="translate(-12,-12)"/>
    </g>
    <text x="0" y="80" font-family="Arial, sans-serif" font-size="60" font-weight="bold" text-anchor="middle" fill="#228be6">OCR</text>
  </g>
</svg>
`;

// Icon sizes to generate
const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Ensure icons directory exists
const iconsDir = path.join(__dirname, 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

// Create a simple HTML file to convert SVG to PNG
const htmlTemplate = (size) => `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin: 0; padding: 0; }
        canvas { display: none; }
    </style>
</head>
<body>
    <canvas id="canvas" width="${size}" height="${size}"></canvas>
    <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        
        // Create image from SVG
        const svgBlob = new Blob([${JSON.stringify(baseSvg)}], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        
        img.onload = function() {
            ctx.drawImage(img, 0, 0, ${size}, ${size});
            
            // Convert to blob and save
            canvas.toBlob(function(blob) {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'icon-${size}.png';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }, 'image/png');
        };
        
        img.src = url;
    </script>
</body>
</html>
`;

// Save base SVG
fs.writeFileSync(path.join(iconsDir, 'icon.svg'), baseSvg);

// Create HTML converter page
const converterHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>PWA Icon Generator</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            padding: 20px;
            background: #1a1b1e;
            color: #ced4da;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        h1 {
            color: #228be6;
        }
        .icon-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 20px;
            margin-top: 30px;
        }
        .icon-item {
            background: #25262b;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
        }
        .icon-item canvas {
            background: white;
            border-radius: 8px;
            margin-bottom: 10px;
        }
        .icon-item button {
            background: #228be6;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .icon-item button:hover {
            background: #1c7ed6;
        }
        .generate-all {
            background: #40c057;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            margin: 20px 0;
        }
        .generate-all:hover {
            background: #37b24d;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>PWA Icon Generator for Smart OCR</h1>
        <p>Click on individual icons to download, or use the button below to generate all icons.</p>
        
        <button class="generate-all" onclick="generateAllIcons()">Generate All Icons</button>
        
        <div class="icon-grid" id="iconGrid"></div>
    </div>

    <script>
        const baseSvg = ${JSON.stringify(baseSvg)};
        const iconSizes = ${JSON.stringify(iconSizes)};
        
        // Also generate special icons
        const specialIcons = [
            { name: 'upload', size: 96, svg: \`
                <svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
                    <rect width="96" height="96" fill="#25262b"/>
                    <g transform="translate(48,48)">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10L12 15L17 10M12 15L12 3" 
                              fill="none" 
                              stroke="#228be6" 
                              stroke-width="2"
                              transform="translate(-12,-12) scale(1.5,1.5)"/>
                    </g>
                </svg>
            \`},
            { name: 'camera', size: 96, svg: \`
                <svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
                    <rect width="96" height="96" fill="#25262b"/>
                    <g transform="translate(48,48)">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" 
                              fill="none" 
                              stroke="#228be6" 
                              stroke-width="2"
                              transform="translate(-12,-12) scale(1.5,1.5)"/>
                        <circle cx="0" cy="1" r="6" fill="none" stroke="#228be6" stroke-width="2"/>
                    </g>
                </svg>
            \`}
        ];
        
        function createIcon(size, customSvg = null, customName = null) {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            
            const svgContent = customSvg || baseSvg;
            const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(svgBlob);
            const img = new Image();
            
            return new Promise((resolve) => {
                img.onload = function() {
                    ctx.fillStyle = '#1a1b1e';
                    ctx.fillRect(0, 0, size, size);
                    ctx.drawImage(img, 0, 0, size, size);
                    URL.revokeObjectURL(url);
                    
                    const iconItem = document.createElement('div');
                    iconItem.className = 'icon-item';
                    
                    const displayCanvas = canvas.cloneNode();
                    displayCanvas.width = 100;
                    displayCanvas.height = 100;
                    const displayCtx = displayCanvas.getContext('2d');
                    displayCtx.drawImage(canvas, 0, 0, 100, 100);
                    
                    iconItem.appendChild(displayCanvas);
                    
                    const label = document.createElement('div');
                    label.textContent = customName ? \`\${customName}-\${size}.png\` : \`icon-\${size}.png\`;
                    label.style.marginBottom = '10px';
                    iconItem.appendChild(label);
                    
                    const downloadBtn = document.createElement('button');
                    downloadBtn.textContent = 'Download';
                    downloadBtn.onclick = () => {
                        canvas.toBlob((blob) => {
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = customName ? \`\${customName}-\${size}.png\` : \`icon-\${size}.png\`;
                            a.click();
                        }, 'image/png');
                    };
                    iconItem.appendChild(downloadBtn);
                    
                    resolve({ iconItem, canvas, name: customName ? \`\${customName}-\${size}\` : \`icon-\${size}\` });
                };
                img.src = url;
            });
        }
        
        async function generateAllIcons() {
            const zip = new JSZip();
            const allIcons = [];
            
            // Generate standard icons
            for (const size of iconSizes) {
                const { canvas, name } = await createIcon(size);
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                allIcons.push({ name: \`\${name}.png\`, blob });
            }
            
            // Generate special icons
            for (const special of specialIcons) {
                const { canvas, name } = await createIcon(special.size, special.svg, special.name);
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                allIcons.push({ name: \`\${name}.png\`, blob });
            }
            
            // Create download link for all icons
            alert('Click OK to download all icons. Save them to the public/icons directory.');
            
            for (const icon of allIcons) {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(icon.blob);
                a.download = icon.name;
                a.click();
                await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between downloads
            }
        }
        
        // Initialize icon grid
        async function initializeGrid() {
            const grid = document.getElementById('iconGrid');
            
            // Add standard icons
            for (const size of iconSizes) {
                const { iconItem } = await createIcon(size);
                grid.appendChild(iconItem);
            }
            
            // Add special icons
            for (const special of specialIcons) {
                const { iconItem } = await createIcon(special.size, special.svg, special.name);
                grid.appendChild(iconItem);
            }
        }
        
        initializeGrid();
    </script>
</body>
</html>
`;

// Save the converter HTML
fs.writeFileSync(path.join(__dirname, 'generate-pwa-icons.html'), converterHtml);

console.log('PWA Icon generator created!');
console.log('1. Open generate-pwa-icons.html in a browser');
console.log('2. Click "Generate All Icons" to download all icons');
console.log('3. Save the downloaded icons to the public/icons directory');