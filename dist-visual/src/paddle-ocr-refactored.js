// Refactored PaddleOCR implementation using OnnxOCR structure
import { TextSystem } from './ocr/text-system.js';
import { getAssetUrl } from './utils.js';
import cv from '@techstark/opencv-js';

export class PaddleOCR {
  constructor() {
    this.textSystem = null;
    this.modelConfig = null;
    this.isInitialized = false;
  }

  async initialize(options = {}) {
    const {
      modelId = 'PP-OCRv5',
      useAngleCls = true,
      progressCallback = null,
      models
    } = options;

    // Set up model configuration
    this.modelConfig = models || this.getDefaultModelConfig(modelId);
    
    // Create text system with configuration
    const args = {
      // Detection model
      detModelPath: this.modelConfig.det,
      detDBThresh: 0.3,
      detDBBoxThresh: 0.6,
      detDBUnclipRatio: 1.5,
      maxTextCandidates: 1000,
      
      // Classification model
      useAngleCls: useAngleCls,
      clsModelPath: useAngleCls ? this.modelConfig.cls : null,
      clsImageShape: [3, 48, 192],
      clsBatchNum: 6,
      clsThresh: 0.9,
      
      // Recognition model
      recModelPath: this.modelConfig.rec,
      recCharDictPath: this.modelConfig.dict,
      recImageShape: [3, 48, 320],
      recBatchNum: 6,
      useSpaceChar: true,
      
      // General settings
      dropScore: 0.5
    };

    this.textSystem = new TextSystem(args);
    await this.textSystem.initialize(progressCallback);
    
    this.isInitialized = true;
  }

  getDefaultModelConfig(modelId) {
    const configs = {
      'PP-OCRv5': {
        det: getAssetUrl('models/PP-OCRv5/det/det.onnx'),
        cls: getAssetUrl('models/PP-OCRv5/cls/cls.onnx'),
        rec: getAssetUrl('models/PP-OCRv5/rec/rec.onnx'),
        dict: getAssetUrl('models/PP-OCRv5/ppocrv5_dict.txt')
      },
      'PP-OCRv4': {
        det: getAssetUrl('models/PP-OCRv4/det/det.onnx'),
        cls: getAssetUrl('models/PP-OCRv4/cls/cls.onnx'),
        rec: getAssetUrl('models/PP-OCRv4/rec/rec.onnx'),
        dict: getAssetUrl('models/PP-OCRv4/ppocr_keys_v1.txt')
      }
    };
    
    if (!configs[modelId]) {
      throw new Error(`Unknown model ID: ${modelId}`);
    }
    
    return configs[modelId];
  }

  async detect(imageSource, options = {}) {
    if (!this.isInitialized) {
      throw new Error('PaddleOCR not initialized. Call initialize() first.');
    }

    const { outputFormat = 'json' } = options;
    
    // Load image if needed
    let mat;
    if (typeof imageSource === 'string') {
      // Load from URL or base64
      mat = await this.loadImage(imageSource);
    } else if (imageSource instanceof HTMLCanvasElement) {
      // Load from canvas
      mat = cv.imread(imageSource);
    } else if (imageSource.constructor.name === 'Mat') {
      // Already a cv.Mat
      mat = imageSource;
    } else {
      throw new Error('Invalid image source');
    }

    try {
      // Run OCR
      const results = await this.textSystem.recognize(mat, true, true, true);
      
      // Format output
      if (outputFormat === 'json') {
        return this.formatResults(results);
      } else if (outputFormat === 'raw') {
        return results;
      }
      
      return results;
    } finally {
      // Clean up if we loaded the image
      if (mat !== imageSource && mat.delete) {
        mat.delete();
      }
    }
  }

  formatResults(results) {
    return {
      words: results.map(r => ({
        text: r.text,
        bbox: r.box,
        confidence: r.score,
        angle: r.angle
      })),
      lines: this.groupIntoLines(results),
      fullText: results.map(r => r.text).join(' ')
    };
  }

  groupIntoLines(results) {
    // Group words into lines based on Y-coordinate proximity
    const lines = [];
    const used = new Set();
    
    for (let i = 0; i < results.length; i++) {
      if (used.has(i)) continue;
      
      const line = [results[i]];
      used.add(i);
      
      const baseY = Math.min(...results[i].box.map(p => p[1]));
      
      for (let j = i + 1; j < results.length; j++) {
        if (used.has(j)) continue;
        
        const y = Math.min(...results[j].box.map(p => p[1]));
        if (Math.abs(y - baseY) < 10) {
          line.push(results[j]);
          used.add(j);
        }
      }
      
      // Sort line by X coordinate
      line.sort((a, b) => {
        const aX = Math.min(...a.box.map(p => p[0]));
        const bX = Math.min(...b.box.map(p => p[0]));
        return aX - bX;
      });
      
      lines.push({
        text: line.map(w => w.text).join(' '),
        words: line,
        bbox: this.getLineBBox(line)
      });
    }
    
    return lines;
  }

  getLineBBox(words) {
    const allPoints = words.flatMap(w => w.box);
    const xs = allPoints.map(p => p[0]);
    const ys = allPoints.map(p => p[1]);
    
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    
    return [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY]
    ];
  }

  async loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const mat = cv.imread(img);
        resolve(mat);
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  getModelInfo() {
    return {
      name: 'PaddleOCR (ONNX)',
      version: '2.0',
      models: this.modelConfig,
      capabilities: ['detection', 'recognition', 'angle_classification']
    };
  }
}