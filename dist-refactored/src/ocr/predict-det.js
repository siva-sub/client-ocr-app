// Text detection predictor
import * as ort from 'onnxruntime-web';
import { createOperators } from './operators.js';
import { DBPostProcess } from './db-postprocess.js';

export class TextDetector {
  constructor(args = {}) {
    this.session = null;
    this.modelPath = args.detModelPath;
    this.operators = createOperators('det');
    this.postProcessor = new DBPostProcess({
      thresh: args.detDBThresh || 0.3,
      boxThresh: args.detDBBoxThresh || 0.6,
      maxCandidates: args.maxTextCandidates || 1000,
      unclipRatio: args.detDBUnclipRatio || 1.5,
      scoreMode: args.detDBScoreMode || 'fast',
      useDilation: args.useDilation || false
    });
  }

  async initialize() {
    if (!this.modelPath) {
      throw new Error('Detection model path is required');
    }
    
    const sessionOptions = {
      executionProviders: ['webgl', 'wasm'],
      graphOptimizationLevel: 'all'
    };
    
    this.session = await ort.InferenceSession.create(this.modelPath, sessionOptions);
  }

  async predict(mat) {
    if (!this.session) {
      throw new Error('Model not initialized. Call initialize() first.');
    }

    // Apply preprocessing operators
    let processedData = { image: mat };
    let shape;
    
    for (const operator of this.operators) {
      if (operator.constructor.name === 'DetResizeForTest') {
        const result = operator.process(processedData.image);
        processedData.image = result.image;
        shape = result.shape;
      } else if (operator.constructor.name === 'NormalizeImage') {
        // Convert mat to imageData
        const imageData = this.matToImageData(processedData.image);
        processedData = operator.process(imageData);
      } else if (operator.constructor.name === 'ToCHWImage') {
        processedData = operator.process(processedData);
      }
    }

    // Create tensor
    const tensor = new ort.Tensor('float32', processedData.data, processedData.shape);
    
    // Run inference
    const feeds = { x: tensor };
    const results = await this.session.run(feeds);
    
    // Get output
    const output = results[Object.keys(results)[0]];
    
    // Postprocess
    const boxes = this.postProcessor.process(output, [shape]);
    
    // Clean up
    if (processedData.image && processedData.image.delete) {
      processedData.image.delete();
    }
    
    return boxes[0].points;
  }

  matToImageData(mat) {
    const data = new Uint8ClampedArray(mat.data);
    const width = mat.cols;
    const height = mat.rows;
    const channels = mat.channels();
    
    // Convert BGR to RGB if needed
    const rgbData = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        const idx = (i * width + j) * channels;
        const rgbIdx = (i * width + j) * 4;
        if (channels === 3) {
          rgbData[rgbIdx] = data[idx + 2];     // R
          rgbData[rgbIdx + 1] = data[idx + 1]; // G
          rgbData[rgbIdx + 2] = data[idx];     // B
          rgbData[rgbIdx + 3] = 255;           // A
        } else {
          rgbData[rgbIdx] = data[idx];
          rgbData[rgbIdx + 1] = data[idx];
          rgbData[rgbIdx + 2] = data[idx];
          rgbData[rgbIdx + 3] = 255;
        }
      }
    }
    
    return { data: rgbData, width, height, channels: 3 };
  }
}