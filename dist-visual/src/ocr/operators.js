// Image preprocessing operators ported from OnnxOCR
import cv from '@techstark/opencv-js';

export class NormalizeImage {
  constructor({
    scale = 1.0 / 255.0,
    mean = [0.485, 0.456, 0.406],
    std = [0.229, 0.224, 0.225],
    order = 'chw'
  } = {}) {
    this.scale = scale;
    this.mean = mean;
    this.std = std;
    this.order = order;
  }

  process(imageData) {
    const { data, width, height } = imageData;
    const channels = 3;
    const normalized = new Float32Array(width * height * channels);

    // Convert to float and scale
    for (let i = 0; i < data.length; i += 4) {
      const pixelIndex = Math.floor(i / 4);
      const r = data[i] * this.scale;
      const g = data[i + 1] * this.scale;
      const b = data[i + 2] * this.scale;

      if (this.order === 'chw') {
        // Channel-first format (C, H, W)
        normalized[pixelIndex] = (r - this.mean[0]) / this.std[0];
        normalized[width * height + pixelIndex] = (g - this.mean[1]) / this.std[1];
        normalized[2 * width * height + pixelIndex] = (b - this.mean[2]) / this.std[2];
      } else {
        // Channel-last format (H, W, C)
        normalized[pixelIndex * 3] = (r - this.mean[0]) / this.std[0];
        normalized[pixelIndex * 3 + 1] = (g - this.mean[1]) / this.std[1];
        normalized[pixelIndex * 3 + 2] = (b - this.mean[2]) / this.std[2];
      }
    }

    return {
      data: normalized,
      shape: this.order === 'chw' ? [channels, height, width] : [height, width, channels]
    };
  }
}

export class DetResizeForTest {
  constructor({
    imageShape = null,
    limitSideLen = 960,
    limitType = 'max',
    keepRatio = true
  } = {}) {
    this.imageShape = imageShape;
    this.limitSideLen = limitSideLen;
    this.limitType = limitType;
    this.keepRatio = keepRatio;
  }

  process(mat) {
    const srcH = mat.rows;
    const srcW = mat.cols;
    
    let resizeH, resizeW;
    
    if (this.imageShape) {
      // Fixed target shape
      [resizeH, resizeW] = this.imageShape;
      
      if (this.keepRatio) {
        const ratio = Math.min(resizeH / srcH, resizeW / srcW);
        resizeW = Math.round(srcW * ratio);
        resizeH = Math.round(srcH * ratio);
      }
    } else {
      // Dynamic resize based on limit
      let ratio = 1.0;
      
      if (this.limitType === 'max') {
        if (Math.max(srcH, srcW) > this.limitSideLen) {
          ratio = this.limitSideLen / Math.max(srcH, srcW);
        }
      } else if (this.limitType === 'min') {
        if (Math.min(srcH, srcW) < this.limitSideLen) {
          ratio = this.limitSideLen / Math.min(srcH, srcW);
        }
      }
      
      resizeH = Math.round(srcH * ratio);
      resizeW = Math.round(srcW * ratio);
    }
    
    // Make divisible by 32
    resizeH = Math.max(32, Math.round(resizeH / 32) * 32);
    resizeW = Math.max(32, Math.round(resizeW / 32) * 32);
    
    const dst = new cv.Mat();
    const size = new cv.Size(resizeW, resizeH);
    cv.resize(mat, dst, size, 0, 0, cv.INTER_LINEAR);
    
    const ratioH = resizeH / srcH;
    const ratioW = resizeW / srcW;
    
    return {
      image: dst,
      shape: [srcH, srcW, ratioH, ratioW]
    };
  }
}

export class ToCHWImage {
  process(imageData) {
    const { data, width, height } = imageData;
    const channels = imageData.channels || 3;
    const chw = new Float32Array(width * height * channels);
    
    // Convert HWC to CHW
    for (let h = 0; h < height; h++) {
      for (let w = 0; w < width; w++) {
        for (let c = 0; c < channels; c++) {
          const srcIdx = (h * width + w) * channels + c;
          const dstIdx = c * height * width + h * width + w;
          chw[dstIdx] = data[srcIdx];
        }
      }
    }
    
    return {
      data: chw,
      shape: [channels, height, width]
    };
  }
}

export class ClsResizeImg {
  constructor({ imageShape = [3, 48, 192] } = {}) {
    this.imageShape = imageShape;
  }

  process(mat) {
    const [_, imgH, imgW] = this.imageShape;
    const h = mat.rows;
    const w = mat.cols;
    const ratio = w / h;
    
    let resizeW;
    if (Math.ceil(imgH * ratio) > imgW) {
      resizeW = imgW;
    } else {
      resizeW = Math.ceil(imgH * ratio);
    }
    
    const dst = new cv.Mat();
    const size = new cv.Size(resizeW, imgH);
    cv.resize(mat, dst, size, 0, 0, cv.INTER_LINEAR);
    
    // Pad to target width if needed
    if (resizeW < imgW) {
      const padded = new cv.Mat.zeros(imgH, imgW, dst.type());
      const roi = padded.roi(new cv.Rect(0, 0, resizeW, imgH));
      dst.copyTo(roi);
      dst.delete();
      return padded;
    }
    
    return dst;
  }
}

export class RecResizeImg {
  constructor({ 
    imageShape = [3, 48, 320],
    characterType = 'ch',
    limitSideLen = 1280,
    maxTextLength = 100
  } = {}) {
    this.imageShape = imageShape;
    this.characterType = characterType;
    this.limitSideLen = limitSideLen;
    this.maxTextLength = maxTextLength;
  }

  process(mat) {
    const [_, imgH, imgW] = this.imageShape;
    const h = mat.rows;
    const w = mat.cols;
    
    // Limit max width for very long images
    const maxWH = this.limitSideLen;
    let resizeW = w;
    if (w > maxWH) {
      resizeW = maxWH;
    }
    
    const ratio = resizeW / w;
    const resizeH = Math.ceil(h * ratio);
    
    // First resize to maintain aspect ratio
    let resized = new cv.Mat();
    cv.resize(mat, resized, new cv.Size(resizeW, resizeH), 0, 0, cv.INTER_LINEAR);
    
    // Then resize to target height
    const finalW = Math.round(resizeW * (imgH / resizeH));
    const dst = new cv.Mat();
    cv.resize(resized, dst, new cv.Size(finalW, imgH), 0, 0, cv.INTER_LINEAR);
    resized.delete();
    
    // Pad or crop to target width
    if (finalW < imgW) {
      // Pad with zeros
      const padded = new cv.Mat.zeros(imgH, imgW, dst.type());
      const roi = padded.roi(new cv.Rect(0, 0, finalW, imgH));
      dst.copyTo(roi);
      dst.delete();
      return padded;
    } else if (finalW > imgW) {
      // Crop
      const cropped = dst.roi(new cv.Rect(0, 0, imgW, imgH));
      return cropped;
    }
    
    return dst;
  }
}

export function createOperators(mode = 'det') {
  switch (mode) {
    case 'det':
      return [
        new DetResizeForTest({ limitType: 'max', limitSideLen: 960 }),
        new NormalizeImage({ scale: 1.0 / 255.0, mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] }),
        new ToCHWImage()
      ];
    case 'cls':
      return [
        new ClsResizeImg({ imageShape: [3, 48, 192] }),
        new NormalizeImage({ scale: 1.0 / 255.0, mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] }),
        new ToCHWImage()
      ];
    case 'rec':
      return [
        new RecResizeImg({ imageShape: [3, 48, 320] }),
        new NormalizeImage({ scale: 1.0 / 255.0, mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] }),
        new ToCHWImage()
      ];
    default:
      throw new Error(`Unknown mode: ${mode}`);
  }
}