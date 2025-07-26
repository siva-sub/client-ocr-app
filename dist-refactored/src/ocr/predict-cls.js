// Text angle classification predictor
import * as ort from 'onnxruntime-web';
import cv from '@techstark/opencv-js';
import { createOperators } from './operators.js';

export class TextClassifier {
  constructor(args = {}) {
    this.session = null;
    this.modelPath = args.clsModelPath;
    this.operators = createOperators('cls');
    this.clsImageShape = args.clsImageShape || [3, 48, 192];
    this.clsBatchNum = args.clsBatchNum || 6;
    this.clsThresh = args.clsThresh || 0.9;
    this.labelList = args.labelList || ['0', '180'];
  }

  async initialize() {
    if (!this.modelPath) {
      throw new Error('Classification model path is required');
    }
    
    const sessionOptions = {
      executionProviders: ['webgl', 'wasm'],
      graphOptimizationLevel: 'all'
    };
    
    this.session = await ort.InferenceSession.create(this.modelPath, sessionOptions);
  }

  async predict(imgList) {
    if (!this.session) {
      throw new Error('Model not initialized. Call initialize() first.');
    }

    const results = [];
    const angleList = [];
    
    // Process in batches
    for (let beg = 0; beg < imgList.length; beg += this.clsBatchNum) {
      const end = Math.min(beg + this.clsBatchNum, imgList.length);
      const batchImgs = imgList.slice(beg, end);
      
      // Preprocess batch
      const batchTensors = [];
      const processedMats = [];
      
      for (const img of batchImgs) {
        let processedData = { image: img };
        
        for (const operator of this.operators) {
          if (operator.constructor.name === 'ClsResizeImg') {
            const result = operator.process(processedData.image);
            processedMats.push(result);
            processedData.image = result;
          } else if (operator.constructor.name === 'NormalizeImage') {
            const imageData = this.matToImageData(processedData.image);
            processedData = operator.process(imageData);
          } else if (operator.constructor.name === 'ToCHWImage') {
            processedData = operator.process(processedData);
          }
        }
        
        batchTensors.push(processedData.data);
      }
      
      // Stack batch
      const batchSize = batchTensors.length;
      const [c, h, w] = this.clsImageShape;
      const batchData = new Float32Array(batchSize * c * h * w);
      
      for (let i = 0; i < batchSize; i++) {
        batchData.set(batchTensors[i], i * c * h * w);
      }
      
      // Create tensor
      const tensor = new ort.Tensor('float32', batchData, [batchSize, c, h, w]);
      
      // Run inference
      const feeds = { x: tensor };
      const output = await this.session.run(feeds);
      
      // Get predictions
      const predictions = output[Object.keys(output)[0]];
      const predData = predictions.data;
      
      // Process results
      for (let i = 0; i < batchSize; i++) {
        const startIdx = i * this.labelList.length;
        const scores = Array.from(predData.slice(startIdx, startIdx + this.labelList.length));
        const maxIdx = scores.indexOf(Math.max(...scores));
        const label = this.labelList[maxIdx];
        const score = scores[maxIdx];
        
        angleList.push({ label, score });
        
        // Rotate image if needed
        if (label === '180' && score > this.clsThresh) {
          const rotated = new cv.Mat();
          const center = new cv.Point(img.cols / 2, img.rows / 2);
          const M = cv.getRotationMatrix2D(center, 180, 1);
          cv.warpAffine(img, rotated, M, new cv.Size(img.cols, img.rows));
          M.delete();
          results.push(rotated);
        } else {
          results.push(img);
        }
      }
      
      // Clean up processed mats
      processedMats.forEach(mat => mat.delete());
    }
    
    return [results, angleList];
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