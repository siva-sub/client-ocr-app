// DB postprocessing for text detection
import cv from '@techstark/opencv-js';

export class DBPostProcess {
  constructor({
    thresh = 0.3,
    boxThresh = 0.7,
    maxCandidates = 1000,
    unclipRatio = 2.0,
    useDilation = false,
    scoreMode = 'fast',
    boxType = 'quad'
  } = {}) {
    this.thresh = thresh;
    this.boxThresh = boxThresh;
    this.maxCandidates = maxCandidates;
    this.unclipRatio = unclipRatio;
    this.minSize = 3;
    this.scoreMode = scoreMode;
    this.boxType = boxType;
    this.useDilation = useDilation;
  }

  process(pred, shapeList) {
    // pred shape: [1, 1, H, W]
    const [batchSize, _, height, width] = pred.dims;
    const predData = pred.data;
    
    const boxesBatch = [];
    
    for (let batchIdx = 0; batchIdx < batchSize; batchIdx++) {
      const [srcH, srcW, ratioH, ratioW] = shapeList[batchIdx];
      
      // Create binary mask
      const segmentation = new cv.Mat(height, width, cv.CV_8UC1);
      for (let i = 0; i < height * width; i++) {
        segmentation.data[i] = predData[batchIdx * height * width + i] > this.thresh ? 255 : 0;
      }
      
      // Apply dilation if needed
      let mask = segmentation;
      if (this.useDilation) {
        mask = new cv.Mat();
        const kernel = cv.Mat.ones(2, 2, cv.CV_8UC1);
        cv.dilate(segmentation, mask, kernel);
        kernel.delete();
      }
      
      // Extract boxes
      let boxes, scores;
      if (this.boxType === 'poly') {
        [boxes, scores] = this.polygonsFromBitmap(predData, mask, srcW, srcH);
      } else {
        [boxes, scores] = this.boxesFromBitmap(predData, mask, srcW, srcH, height, width);
      }
      
      mask.delete();
      if (mask !== segmentation) {
        segmentation.delete();
      }
      
      boxesBatch.push({ points: boxes, scores });
    }
    
    return boxesBatch;
  }

  boxesFromBitmap(pred, bitmap, destWidth, destHeight, height, width) {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(bitmap, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    
    const numContours = Math.min(contours.size(), this.maxCandidates);
    const boxes = [];
    const scores = [];
    
    for (let i = 0; i < numContours; i++) {
      const contour = contours.get(i);
      const [points, sside] = this.getMiniBoxes(contour);
      
      if (sside < this.minSize) {
        continue;
      }
      
      const score = this.boxScoreFast(pred, points, height, width);
      if (score < this.boxThresh) {
        continue;
      }
      
      // Unclip
      const box = this.unclip(points, this.unclipRatio);
      if (!box || box.length === 0) {
        continue;
      }
      
      const [newPoints, newSside] = this.getMiniBoxes(box);
      if (newSside < this.minSize + 2) {
        continue;
      }
      
      // Scale to original size
      const scaledBox = newPoints.map(point => [
        Math.round(Math.min(Math.max(point[0] / width * destWidth, 0), destWidth)),
        Math.round(Math.min(Math.max(point[1] / height * destHeight, 0), destHeight))
      ]);
      
      boxes.push(scaledBox);
      scores.push(score);
    }
    
    contours.delete();
    hierarchy.delete();
    
    return [boxes, scores];
  }

  getMiniBoxes(contour) {
    // Get minimum area rectangle
    const rect = cv.minAreaRect(contour);
    const vertices = cv.boxPoints(rect);
    
    // Sort points
    const points = [];
    for (let i = 0; i < 4; i++) {
      points.push([vertices.data32F[i * 2], vertices.data32F[i * 2 + 1]]);
    }
    points.sort((a, b) => a[0] - b[0]);
    
    // Determine correct order
    let index1 = 0, index2 = 1, index3 = 2, index4 = 3;
    if (points[1][1] > points[0][1]) {
      index1 = 0;
      index4 = 1;
    } else {
      index1 = 1;
      index4 = 0;
    }
    
    if (points[3][1] > points[2][1]) {
      index2 = 2;
      index3 = 3;
    } else {
      index2 = 3;
      index3 = 2;
    }
    
    const box = [points[index1], points[index2], points[index3], points[index4]];
    const sside = Math.min(rect.size.width, rect.size.height);
    
    return [box, sside];
  }

  boxScoreFast(bitmap, box, height, width) {
    // Calculate box score using mean of pixels inside the box
    const xmin = Math.floor(Math.min(...box.map(p => p[0])));
    const xmax = Math.ceil(Math.max(...box.map(p => p[0])));
    const ymin = Math.floor(Math.min(...box.map(p => p[1])));
    const ymax = Math.ceil(Math.max(...box.map(p => p[1])));
    
    const maskWidth = xmax - xmin + 1;
    const maskHeight = ymax - ymin + 1;
    
    // Create mask for the box region
    const mask = new cv.Mat.zeros(maskHeight, maskWidth, cv.CV_8UC1);
    const offsetBox = box.map(p => [p[0] - xmin, p[1] - ymin]);
    
    // Fill polygon
    const pts = cv.matFromArray(4, 1, cv.CV_32SC2, offsetBox.flat());
    const ptsVector = new cv.MatVector();
    ptsVector.push_back(pts);
    cv.fillPoly(mask, ptsVector, new cv.Scalar(255));
    
    // Calculate mean
    let sum = 0;
    let count = 0;
    for (let y = ymin; y <= ymax && y < height; y++) {
      for (let x = xmin; x <= xmax && x < width; x++) {
        if (mask.data[(y - ymin) * maskWidth + (x - xmin)] > 0) {
          sum += bitmap[y * width + x];
          count++;
        }
      }
    }
    
    pts.delete();
    ptsVector.delete();
    mask.delete();
    
    return count > 0 ? sum / count : 0;
  }

  unclip(box, ratio) {
    // Simple unclip implementation
    // Calculate centroid
    const centerX = box.reduce((sum, p) => sum + p[0], 0) / 4;
    const centerY = box.reduce((sum, p) => sum + p[1], 0) / 4;
    
    // Expand box
    const expandedBox = box.map(point => {
      const dx = point[0] - centerX;
      const dy = point[1] - centerY;
      const scale = 1 + (ratio - 1) * 0.5;
      return [
        centerX + dx * scale,
        centerY + dy * scale
      ];
    });
    
    // Convert to cv.Mat for getMiniBoxes
    const mat = new cv.Mat(4, 1, cv.CV_32FC2);
    for (let i = 0; i < 4; i++) {
      mat.data32F[i * 2] = expandedBox[i][0];
      mat.data32F[i * 2 + 1] = expandedBox[i][1];
    }
    
    return mat;
  }

  polygonsFromBitmap(pred, bitmap, destWidth, destHeight) {
    // Simplified polygon extraction (similar to boxes but with polygon support)
    return this.boxesFromBitmap(pred, bitmap, destWidth, destHeight, bitmap.rows, bitmap.cols);
  }
}