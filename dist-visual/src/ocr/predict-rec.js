// Text recognition predictor
import * as ort from 'onnxruntime-web';
import { createOperators } from './operators.js';
import { CTCLabelDecode } from './rec-postprocess.js';

export class TextRecognizer {
  constructor(args = {}) {
    this.session = null;
    this.modelPath = args.recModelPath;
    this.operators = createOperators('rec');
    this.recImageShape = args.recImageShape || [3, 48, 320];
    this.recBatchNum = args.recBatchNum || 6;
    this.characterDict = null;
    this.characterDictPath = args.recCharDictPath;
    this.decoder = null;
    this.useSpaceChar = args.useSpaceChar || true;
    this.maxTextLength = args.maxTextLength || 100;
  }

  async initialize() {
    if (!this.modelPath) {
      throw new Error('Recognition model path is required');
    }
    
    // Load character dictionary
    if (this.characterDictPath) {
      await this.loadCharacterDict();
    }
    
    // Initialize decoder
    this.decoder = new CTCLabelDecode({
      characterDict: this.characterDict,
      useSpaceChar: this.useSpaceChar
    });
    
    const sessionOptions = {
      executionProviders: ['webgl', 'wasm'],
      graphOptimizationLevel: 'all'
    };
    
    this.session = await ort.InferenceSession.create(this.modelPath, sessionOptions);
  }

  async loadCharacterDict() {
    try {
      const response = await fetch(this.characterDictPath);
      const text = await response.text();
      this.characterDict = text.trim().split('\n');
      
      // Add space char if needed
      if (this.useSpaceChar && !this.characterDict.includes(' ')) {
        this.characterDict.push(' ');
      }
    } catch (error) {
      console.error('Failed to load character dictionary:', error);
      throw error;
    }
  }

  async predict(imgList) {
    if (!this.session) {
      throw new Error('Model not initialized. Call initialize() first.');
    }

    const results = [];
    
    // Process in batches
    for (let beg = 0; beg < imgList.length; beg += this.recBatchNum) {
      const end = Math.min(beg + this.recBatchNum, imgList.length);
      const batchImgs = imgList.slice(beg, end);
      
      // Preprocess batch
      const batchTensors = [];
      const processedMats = [];
      const widthList = [];
      
      for (const img of batchImgs) {
        let processedData = { image: img };
        
        for (const operator of this.operators) {
          if (operator.constructor.name === 'RecResizeImg') {
            const result = operator.process(processedData.image);
            processedMats.push(result);
            processedData.image = result;
            widthList.push(result.cols);
          } else if (operator.constructor.name === 'NormalizeImage') {
            const imageData = this.matToImageData(processedData.image);
            processedData = operator.process(imageData);
          } else if (operator.constructor.name === 'ToCHWImage') {
            processedData = operator.process(processedData);
          }
        }
        
        batchTensors.push(processedData.data);
      }
      
      // Pad batch to same width
      const maxWidth = Math.max(...widthList);
      const [c, h, _] = this.recImageShape;
      const batchSize = batchTensors.length;
      const batchData = new Float32Array(batchSize * c * h * maxWidth);
      
      for (let i = 0; i < batchSize; i++) {
        const tensorData = batchTensors[i];
        const width = widthList[i];
        
        // Copy data with padding
        for (let ch = 0; ch < c; ch++) {
          for (let row = 0; row < h; row++) {
            for (let col = 0; col < width; col++) {
              const srcIdx = ch * h * width + row * width + col;
              const dstIdx = i * c * h * maxWidth + ch * h * maxWidth + row * maxWidth + col;
              batchData[dstIdx] = tensorData[srcIdx];
            }
          }
        }
      }
      
      // Create tensor
      const tensor = new ort.Tensor('float32', batchData, [batchSize, c, h, maxWidth]);
      
      // Run inference
      const feeds = { x: tensor };
      const output = await this.session.run(feeds);
      
      // Get predictions
      const predictions = output[Object.keys(output)[0]];
      
      // Decode results
      const batchResults = this.decoder.decode(predictions, widthList);
      results.push(...batchResults);
      
      // Clean up processed mats
      processedMats.forEach(mat => mat.delete());
    }
    
    return results;
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