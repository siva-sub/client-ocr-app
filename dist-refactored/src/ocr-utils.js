/**
 * OCR Utilities based on OnnxOCR
 * Includes visualization, cropping, and other helper functions
 */

/**
 * Draw OCR results on canvas with bounding boxes and text
 */
export function drawOCRResults(canvas, boxes, texts, scores, options = {}) {
    const {
        boxColor = '#FF0000',
        boxWidth = 2,
        fontSize = 14,
        fontColor = '#000000',
        backgroundColor = '#FFFFFF',
        dropScore = 0.5,
        showText = true,
        showScore = true
    } = options;
    
    const ctx = canvas.getContext('2d');
    const scale = canvas.width / canvas.naturalWidth || 1;
    
    // Draw boxes
    ctx.strokeStyle = boxColor;
    ctx.lineWidth = boxWidth;
    
    boxes.forEach((box, index) => {
        if (scores && scores[index] < dropScore) return;
        
        ctx.beginPath();
        ctx.moveTo(box[0][0] * scale, box[0][1] * scale);
        for (let i = 1; i < box.length; i++) {
            ctx.lineTo(box[i][0] * scale, box[i][1] * scale);
        }
        ctx.closePath();
        ctx.stroke();
        
        // Draw text label if enabled
        if (showText && texts && texts[index]) {
            const text = texts[index] + (showScore && scores ? ` (${scores[index].toFixed(2)})` : '');
            
            // Calculate text position
            const minX = Math.min(...box.map(p => p[0])) * scale;
            const minY = Math.min(...box.map(p => p[1])) * scale;
            
            // Draw background for text
            ctx.font = `${fontSize}px Arial`;
            const textMetrics = ctx.measureText(text);
            const textHeight = fontSize * 1.2;
            
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(minX, minY - textHeight, textMetrics.width + 4, textHeight);
            
            // Draw text
            ctx.fillStyle = fontColor;
            ctx.fillText(text, minX + 2, minY - 2);
        }
    });
}

/**
 * Create visualization image with OCR results
 */
export function createOCRVisualization(image, results, options = {}) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = image.width;
    canvas.height = image.height;
    
    // Draw original image
    ctx.drawImage(image, 0, 0);
    
    // Extract data from results
    const boxes = results.boxes || [];
    const texts = results.lines ? results.lines.map(line => line.text) : [];
    const scores = results.lines ? results.lines.map(line => line.confidence) : [];
    
    // Draw OCR results
    drawOCRResults(canvas, boxes, texts, scores, options);
    
    return canvas;
}

/**
 * Get rotate crop image (from OnnxOCR utils)
 */
export function getRotateCropImage(canvas, points) {
    if (points.length !== 4) {
        throw new Error('Points must have exactly 4 coordinates');
    }
    
    // Calculate crop dimensions
    const width = Math.max(
        distance(points[0], points[1]),
        distance(points[2], points[3])
    );
    const height = Math.max(
        distance(points[0], points[3]),
        distance(points[1], points[2])
    );
    
    // Create destination points
    const dstPoints = [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height]
    ];
    
    // Create cropped canvas
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = Math.round(width);
    croppedCanvas.height = Math.round(height);
    const ctx = croppedCanvas.getContext('2d');
    
    // Simple perspective transform using canvas
    // For more accurate transform, use a proper perspective transform library
    ctx.save();
    
    // Calculate transform
    const transform = getPerspectiveTransform(points, dstPoints);
    ctx.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f);
    
    // Draw transformed image
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
    
    // Check if rotation is needed (height > width * 1.5)
    if (height > width * 1.5) {
        return rotateCanvas(croppedCanvas, 90);
    }
    
    return croppedCanvas;
}

/**
 * Get minimum area rectangle crop
 */
export function getMinAreaRectCrop(canvas, points) {
    // Find minimum bounding rectangle
    const rect = getMinBoundingRect(points);
    const box = rect.points;
    
    // Get rotated crop
    return getRotateCropImage(canvas, box);
}

/**
 * Resize image limiting the longest side
 */
export function resizeImage(canvas, maxSize = 600) {
    const width = canvas.width;
    const height = canvas.height;
    const maxDim = Math.max(width, height);
    
    if (maxDim <= maxSize) {
        return canvas;
    }
    
    const scale = maxSize / maxDim;
    const newWidth = Math.round(width * scale);
    const newHeight = Math.round(height * scale);
    
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = newWidth;
    resizedCanvas.height = newHeight;
    
    const ctx = resizedCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, newWidth, newHeight);
    
    return resizedCanvas;
}

/**
 * Convert base64 to canvas
 */
export async function base64ToCanvas(base64) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas);
        };
        img.onerror = reject;
        img.src = base64;
    });
}

/**
 * Sort text regions for better reading order
 */
export function sortTextRegions(regions) {
    return regions.sort((a, b) => {
        const centerA = getCenter(a.box);
        const centerB = getCenter(b.box);
        
        // Sort by y coordinate first (top to bottom)
        if (Math.abs(centerA[1] - centerB[1]) > 10) {
            return centerA[1] - centerB[1];
        }
        
        // Then by x coordinate (left to right)
        return centerA[0] - centerB[0];
    });
}

/**
 * Group text regions into lines
 */
export function groupTextIntoLines(regions, lineThreshold = 10) {
    const lines = [];
    const sorted = sortTextRegions(regions);
    
    sorted.forEach(region => {
        const center = getCenter(region.box);
        
        // Find existing line or create new one
        let foundLine = false;
        for (const line of lines) {
            const lineCenter = line.center;
            if (Math.abs(center[1] - lineCenter) < lineThreshold) {
                line.regions.push(region);
                line.center = (line.center * line.regions.length + center[1]) / (line.regions.length + 1);
                foundLine = true;
                break;
            }
        }
        
        if (!foundLine) {
            lines.push({
                center: center[1],
                regions: [region]
            });
        }
    });
    
    // Sort regions within each line
    lines.forEach(line => {
        line.regions.sort((a, b) => {
            const centerA = getCenter(a.box);
            const centerB = getCenter(b.box);
            return centerA[0] - centerB[0];
        });
    });
    
    return lines;
}

/**
 * Format OCR results for different output formats
 */
export function formatOCRResults(results, format = 'text') {
    switch (format) {
        case 'text':
            return results.text || '';
            
        case 'json':
            return JSON.stringify(results, null, 2);
            
        case 'csv':
            if (!results.lines) return '';
            const headers = ['Index', 'Text', 'Confidence', 'X1', 'Y1', 'X2', 'Y2', 'X3', 'Y3', 'X4', 'Y4'];
            const rows = [headers.join(',')];
            
            results.lines.forEach((line, index) => {
                const row = [
                    index + 1,
                    `"${line.text.replace(/"/g, '""')}"`,
                    line.confidence.toFixed(3),
                    ...line.box.flat().map(coord => Math.round(coord))
                ];
                rows.push(row.join(','));
            });
            
            return rows.join('\n');
            
        case 'markdown':
            if (!results.lines) return results.text || '';
            
            const lines = groupTextIntoLines(results.lines);
            return lines.map(line => 
                line.regions.map(r => r.text).join(' ')
            ).join('\n\n');
            
        default:
            return results.text || '';
    }
}

// Helper functions
function distance(p1, p2) {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    return Math.sqrt(dx * dx + dy * dy);
}

function getCenter(box) {
    const sumX = box.reduce((sum, p) => sum + p[0], 0);
    const sumY = box.reduce((sum, p) => sum + p[1], 0);
    return [sumX / box.length, sumY / box.length];
}

function rotateCanvas(canvas, degrees) {
    const radians = degrees * Math.PI / 180;
    const rotatedCanvas = document.createElement('canvas');
    
    if (degrees === 90 || degrees === -270) {
        rotatedCanvas.width = canvas.height;
        rotatedCanvas.height = canvas.width;
    } else if (degrees === -90 || degrees === 270) {
        rotatedCanvas.width = canvas.height;
        rotatedCanvas.height = canvas.width;
    } else {
        rotatedCanvas.width = canvas.width;
        rotatedCanvas.height = canvas.height;
    }
    
    const ctx = rotatedCanvas.getContext('2d');
    ctx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
    ctx.rotate(radians);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    
    return rotatedCanvas;
}

function getPerspectiveTransform(src, dst) {
    // Simplified perspective transform
    // For production use, consider using a proper computer vision library
    const scaleX = (dst[1][0] - dst[0][0]) / (src[1][0] - src[0][0]);
    const scaleY = (dst[3][1] - dst[0][1]) / (src[3][1] - src[0][1]);
    
    return {
        a: scaleX,
        b: 0,
        c: 0,
        d: scaleY,
        e: -src[0][0] * scaleX + dst[0][0],
        f: -src[0][1] * scaleY + dst[0][1]
    };
}

function getMinBoundingRect(points) {
    // Find convex hull
    const hull = convexHull(points);
    
    // Find minimum area rectangle
    let minArea = Infinity;
    let bestRect = null;
    
    for (let i = 0; i < hull.length; i++) {
        const p1 = hull[i];
        const p2 = hull[(i + 1) % hull.length];
        
        // Calculate edge angle
        const angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
        
        // Rotate all points by -angle
        const rotated = points.map(p => [
            (p[0] - p1[0]) * Math.cos(-angle) - (p[1] - p1[1]) * Math.sin(-angle),
            (p[0] - p1[0]) * Math.sin(-angle) + (p[1] - p1[1]) * Math.cos(-angle)
        ]);
        
        // Find bounding box
        const minX = Math.min(...rotated.map(p => p[0]));
        const maxX = Math.max(...rotated.map(p => p[0]));
        const minY = Math.min(...rotated.map(p => p[1]));
        const maxY = Math.max(...rotated.map(p => p[1]));
        
        const area = (maxX - minX) * (maxY - minY);
        
        if (area < minArea) {
            minArea = area;
            
            // Calculate rectangle corners in original coordinates
            const corners = [
                [minX, minY],
                [maxX, minY],
                [maxX, maxY],
                [minX, maxY]
            ];
            
            bestRect = {
                points: corners.map(c => [
                    c[0] * Math.cos(angle) - c[1] * Math.sin(angle) + p1[0],
                    c[0] * Math.sin(angle) + c[1] * Math.cos(angle) + p1[1]
                ]),
                area: area,
                angle: angle * 180 / Math.PI
            };
        }
    }
    
    return bestRect;
}

function convexHull(points) {
    // Graham scan algorithm
    if (points.length < 3) return points;
    
    // Find bottom-most point
    let start = 0;
    for (let i = 1; i < points.length; i++) {
        if (points[i][1] < points[start][1] || 
            (points[i][1] === points[start][1] && points[i][0] < points[start][0])) {
            start = i;
        }
    }
    
    // Sort by polar angle
    const sorted = points.slice();
    const startPoint = sorted.splice(start, 1)[0];
    
    sorted.sort((a, b) => {
        const angleA = Math.atan2(a[1] - startPoint[1], a[0] - startPoint[0]);
        const angleB = Math.atan2(b[1] - startPoint[1], b[0] - startPoint[0]);
        return angleA - angleB;
    });
    
    // Build hull
    const hull = [startPoint];
    for (const point of sorted) {
        while (hull.length >= 2) {
            const p1 = hull[hull.length - 2];
            const p2 = hull[hull.length - 1];
            const cross = (p2[0] - p1[0]) * (point[1] - p1[1]) - 
                         (p2[1] - p1[1]) * (point[0] - p1[0]);
            if (cross <= 0) {
                hull.pop();
            } else {
                break;
            }
        }
        hull.push(point);
    }
    
    return hull;
}