// Utility functions for OCR processing
import cv from '@techstark/opencv-js';

export function getRotateCropImage(img, points) {
  // Get the four corner points
  const pts = points.map(p => new cv.Point(p[0], p[1]));
  
  // Calculate the width and height of the box
  const widthA = Math.sqrt(Math.pow(pts[2].x - pts[3].x, 2) + Math.pow(pts[2].y - pts[3].y, 2));
  const widthB = Math.sqrt(Math.pow(pts[1].x - pts[0].x, 2) + Math.pow(pts[1].y - pts[0].y, 2));
  const maxWidth = Math.max(Math.floor(widthA), Math.floor(widthB));
  
  const heightA = Math.sqrt(Math.pow(pts[1].x - pts[2].x, 2) + Math.pow(pts[1].y - pts[2].y, 2));
  const heightB = Math.sqrt(Math.pow(pts[0].x - pts[3].x, 2) + Math.pow(pts[0].y - pts[3].y, 2));
  const maxHeight = Math.max(Math.floor(heightA), Math.floor(heightB));
  
  // Destination points for perspective transform
  const dstPts = [
    new cv.Point(0, 0),
    new cv.Point(maxWidth - 1, 0),
    new cv.Point(maxWidth - 1, maxHeight - 1),
    new cv.Point(0, maxHeight - 1)
  ];
  
  // Get perspective transform matrix
  const srcMat = cv.matFromArray(4, 1, cv.CV_32FC2, points.flat());
  const dstMat = cv.matFromArray(4, 1, cv.CV_32FC2, dstPts.map(p => [p.x, p.y]).flat());
  const M = cv.getPerspectiveTransform(srcMat, dstMat);
  
  // Apply perspective transform
  const dst = new cv.Mat();
  const dsize = new cv.Size(maxWidth, maxHeight);
  cv.warpPerspective(img, dst, M, dsize, cv.INTER_LINEAR);
  
  // Clean up
  srcMat.delete();
  dstMat.delete();
  M.delete();
  
  // Check if we need to rotate (height > width * 1.5)
  if (maxHeight > maxWidth * 1.5) {
    const rotated = new cv.Mat();
    const center = new cv.Point(dst.cols / 2, dst.rows / 2);
    const rotM = cv.getRotationMatrix2D(center, 90, 1);
    cv.warpAffine(dst, rotated, rotM, new cv.Size(dst.rows, dst.cols));
    rotM.delete();
    dst.delete();
    return rotated;
  }
  
  return dst;
}

export function getMinAreaRectCrop(img, points) {
  // Convert points to cv format
  const cvPoints = cv.matFromArray(points.length, 1, cv.CV_32FC2, points.flat());
  
  // Get minimum area rectangle
  const rect = cv.minAreaRect(cvPoints);
  const box = cv.boxPoints(rect);
  
  // Get width and height
  const width = rect.size.width;
  const height = rect.size.height;
  const angle = rect.angle;
  
  // Adjust angle for proper orientation
  let adjustedAngle = angle;
  if (width < height) {
    adjustedAngle = angle + 90;
  }
  
  // Get rotation matrix
  const center = rect.center;
  const M = cv.getRotationMatrix2D(center, adjustedAngle, 1);
  
  // Rotate the image
  const rotated = new cv.Mat();
  cv.warpAffine(img, rotated, M, new cv.Size(img.cols, img.rows));
  
  // Crop the rotated rectangle
  const cropSize = new cv.Size(
    Math.floor(Math.max(width, height)),
    Math.floor(Math.min(width, height))
  );
  
  const startX = Math.floor(center.x - cropSize.width / 2);
  const startY = Math.floor(center.y - cropSize.height / 2);
  
  const roi = rotated.roi(new cv.Rect(
    Math.max(0, startX),
    Math.max(0, startY),
    Math.min(cropSize.width, rotated.cols - startX),
    Math.min(cropSize.height, rotated.rows - startY)
  ));
  
  // Clean up
  cvPoints.delete();
  M.delete();
  rotated.delete();
  
  return roi;
}

export function sortedBoxes(dtBoxes) {
  // Sort text boxes from top to bottom, left to right
  const sorted = [...dtBoxes].sort((a, b) => {
    const aY = Math.min(a[0][1], a[1][1], a[2][1], a[3][1]);
    const bY = Math.min(b[0][1], b[1][1], b[2][1], b[3][1]);
    const aX = Math.min(a[0][0], a[1][0], a[2][0], a[3][0]);
    const bX = Math.min(b[0][0], b[1][0], b[2][0], b[3][0]);
    
    // First sort by Y (top to bottom)
    if (Math.abs(aY - bY) > 10) {
      return aY - bY;
    }
    // Then sort by X (left to right)
    return aX - bX;
  });
  
  // Fine-tune the order for boxes on the same line
  for (let i = 0; i < sorted.length - 1; i++) {
    for (let j = i; j >= 0; j--) {
      const box1 = sorted[j];
      const box2 = sorted[j + 1];
      
      const y1 = Math.min(box1[0][1], box1[1][1], box1[2][1], box1[3][1]);
      const y2 = Math.min(box2[0][1], box2[1][1], box2[2][1], box2[3][1]);
      const x1 = Math.min(box1[0][0], box1[1][0], box1[2][0], box1[3][0]);
      const x2 = Math.min(box2[0][0], box2[1][0], box2[2][0], box2[3][0]);
      
      if (Math.abs(y1 - y2) < 10 && x2 < x1) {
        // Swap
        [sorted[j], sorted[j + 1]] = [sorted[j + 1], sorted[j]];
      } else {
        break;
      }
    }
  }
  
  return sorted;
}

export function drawOCRResults(canvas, results, options = {}) {
  const {
    boxColor = 'rgba(0, 255, 0, 0.5)',
    textColor = 'black',
    textBackground = 'white',
    fontSize = 14,
    showScore = true
  } = options;
  
  const ctx = canvas.getContext('2d');
  
  results.forEach(result => {
    const { box, text, score } = result;
    
    // Draw box
    ctx.strokeStyle = boxColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(box[0][0], box[0][1]);
    for (let i = 1; i < box.length; i++) {
      ctx.lineTo(box[i][0], box[i][1]);
    }
    ctx.closePath();
    ctx.stroke();
    
    // Draw text label
    const label = showScore ? `${text} (${(score * 100).toFixed(1)}%)` : text;
    ctx.font = `${fontSize}px Arial`;
    const metrics = ctx.measureText(label);
    const textHeight = fontSize;
    
    // Draw background for text
    ctx.fillStyle = textBackground;
    ctx.fillRect(
      box[0][0],
      box[0][1] - textHeight - 4,
      metrics.width + 8,
      textHeight + 8
    );
    
    // Draw text
    ctx.fillStyle = textColor;
    ctx.fillText(label, box[0][0] + 4, box[0][1] - 4);
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const mat = cv.imread(img);
      resolve(mat);
    };
    img.onerror = reject;
    img.src = src;
  });
}