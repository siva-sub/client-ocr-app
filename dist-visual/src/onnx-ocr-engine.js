/**
 * OnnxOCR Engine Implementation
 * Based on https://github.com/jingsongliujing/OnnxOCR
 * Refactored to use centralized configuration
 */

import * as ort from 'onnxruntime-web';
import { DetectionPreprocessor, RecognitionPreprocessor, AngleClassificationPreprocessor } from './onnx-ocr-preprocessing.js';
import { DBPostProcessor, CTCDecoder } from './onnx-ocr-postprocessing.js';
import { ocrCache } from './ocr-cache-manager.js';
import { ORT_CONFIG } from './config.js';
import { generateId } from './utils.js';

export class OnnxOCREngine {
    constructor() {
        this.id = generateId();
        this.modelConfig = null;
        this.detSession = null;
        this.clsSession = null;
        this.recSession = null;
        this.dictionary = [];
        this.initialized = false;
        
        // Processors will be initialized based on model config
        this.detPreprocessor = null;
        this.recPreprocessor = null;
        this.clsPreprocessor = null;
        this.dbPostProcessor = null;
        this.ctcDecoder = null;
    }

    /**
     * Initialize the OCR engine with a specific model configuration
     * @param {Object} modelConfig - Model configuration from config.js
     * @param {Function} progressCallback - Optional progress callback
     */
    async initialize(modelConfig, progressCallback = null) {
        if (!modelConfig) {
            throw new Error('Model configuration is required');
        }

        this.modelConfig = modelConfig;
        
        try {
            // Configure ONNX Runtime
            progressCallback?.(`Configuring ONNX Runtime...`);
            this.configureOnnxRuntime();

            // Initialize preprocessors with model settings
            this.initializePreprocessors();

            // Load model sessions
            progressCallback?.(`Loading ${modelConfig.name}...`);
            await this.loadModelSessions(progressCallback);

            // Load dictionary
            progressCallback?.('Loading dictionary...');
            await this.loadDictionary();

            // Initialize postprocessors
            this.initializePostprocessors();

            this.initialized = true;
            progressCallback?.('Initialization complete!');
            
            console.log(`OnnxOCR Engine initialized with ${modelConfig.name}`);
        } catch (error) {
            console.error('Failed to initialize OnnxOCR:', error);
            throw error;
        }
    }

    /**
     * Configure ONNX Runtime with optimal settings
     */
    configureOnnxRuntime() {
        ort.env.wasm.wasmPaths = ORT_CONFIG.wasmPaths;
        ort.env.wasm.numThreads = ORT_CONFIG.numThreads;
        ort.env.logLevel = ORT_CONFIG.logLevel;
        
        // Additional optimizations
        ort.env.wasm.simd = true;
        ort.env.webgl.pack = false; // Disable for stability
        ort.env.webgl.asyncKernel = false;
        
        console.log(`ONNX Runtime configured with ${ort.env.wasm.numThreads} threads`);
    }

    /**
     * Initialize preprocessors based on model settings
     */
    initializePreprocessors() {
        const { settings } = this.modelConfig;
        
        this.detPreprocessor = new DetectionPreprocessor({
            det_limit_side_len: settings.det_limit_side_len,
            det_limit_type: 'min'
        });
        
        this.recPreprocessor = new RecognitionPreprocessor({
            rec_image_shape: settings.rec_image_shape
        });
        
        this.clsPreprocessor = new AngleClassificationPreprocessor({
            cls_image_shape: settings.cls_image_shape
        });
    }

    /**
     * Load ONNX model sessions
     */
    async loadModelSessions(progressCallback) {
        const { paths } = this.modelConfig;
        const sessionOptions = {
            executionProviders: ORT_CONFIG.providers,
            graphOptimizationLevel: ORT_CONFIG.graphOptimizationLevel,
            executionMode: ORT_CONFIG.executionMode,
            enableCpuMemArena: ORT_CONFIG.enableCpuMemArena,
            enableMemPattern: ORT_CONFIG.enableMemPattern
        };

        // Load detection model
        progressCallback?.('Loading detection model...');
        this.detSession = await ort.InferenceSession.create(paths.det, sessionOptions);

        // Load classification model if available
        if (paths.cls) {
            progressCallback?.('Loading classification model...');
            this.clsSession = await ort.InferenceSession.create(paths.cls, sessionOptions);
        }

        // Load recognition model
        if (paths.rec) {
            progressCallback?.('Loading recognition model...');
            this.recSession = await ort.InferenceSession.create(paths.rec, sessionOptions);
        }
    }

    /**
     * Load character dictionary
     */
    async loadDictionary() {
        const { paths } = this.modelConfig;
        
        try {
            const response = await fetch(paths.dict);
            if (!response.ok) {
                throw new Error(`Failed to load dictionary: ${response.statusText}`);
            }
            
            const text = await response.text();
            this.dictionary = text.split('\n').filter(line => line.trim() !== '');
            
            // Add special tokens for CTC decoding
            this.dictionary.unshift('blank'); // CTC blank label
            if (!this.dictionary.includes(' ')) {
                this.dictionary.push(' '); // Space character
            }
            
            console.log(`Dictionary loaded with ${this.dictionary.length} characters`);
        } catch (error) {
            console.error('Failed to load dictionary:', error);
            throw error;
        }
    }

    /**
     * Initialize postprocessors
     */
    initializePostprocessors() {
        const { settings } = this.modelConfig;
        
        this.dbPostProcessor = new DBPostProcessor({
            thresh: settings.det_db_thresh,
            box_thresh: settings.det_db_box_thresh,
            unclip_ratio: settings.det_db_unclip_ratio,
            score_mode: 'fast'
        });
        
        this.ctcDecoder = new CTCDecoder(this.dictionary);
    }

    /**
     * Process an image through the OCR pipeline
     * @param {File|Blob|HTMLCanvasElement|string} input - Input image
     * @param {Object} options - Processing options
     * @returns {Object} OCR results
     */
    async process(input, options = {}) {
        if (!this.initialized) {
            throw new Error('Engine not initialized. Call initialize() first.');
        }

        const {
            useCache = true,
            useAngleCls = true,
            progressCallback = null
        } = options;

        // Check cache if enabled
        if (useCache) {
            const cached = await this.checkCache(input);
            if (cached) {
                progressCallback?.('Using cached result');
                return cached;
            }
        }

        try {
            // Convert input to canvas
            progressCallback?.('Preparing image...');
            const canvas = await this.inputToCanvas(input);

            // Text detection
            progressCallback?.('Detecting text regions...');
            const detectionResult = await this.detectText(canvas);

            if (!detectionResult || detectionResult.boxes.length === 0) {
                const emptyResult = {
                    text: '',
                    boxes: [],
                    lines: [],
                    modelName: this.modelConfig.name,
                    timestamp: new Date().toISOString()
                };
                
                if (useCache) {
                    await this.cacheResult(input, emptyResult);
                }
                
                return emptyResult;
            }

            // Process each text region
            progressCallback?.('Recognizing text...');
            const textResults = await this.processTextRegions(
                canvas, 
                detectionResult.boxes, 
                useAngleCls, 
                progressCallback
            );

            // Compile final result
            const result = {
                text: textResults.map(r => r.text).join('\n'),
                boxes: detectionResult.boxes,
                lines: textResults,
                modelName: this.modelConfig.name,
                timestamp: new Date().toISOString()
            };

            // Cache result if enabled
            if (useCache) {
                await this.cacheResult(input, result);
            }

            return result;
        } catch (error) {
            console.error('OCR processing error:', error);
            throw error;
        }
    }

    /**
     * Detect text regions in the image
     */
    async detectText(canvas) {
        // Preprocess image
        const preprocessed = await this.detPreprocessor.preprocess(canvas);
        
        // Create input tensor
        const inputTensor = new ort.Tensor(
            'float32', 
            preprocessed.tensor, 
            [1, 3, preprocessed.resizedShape[0], preprocessed.resizedShape[1]]
        );

        // Run inference
        const feeds = { x: inputTensor };
        const results = await this.detSession.run(feeds);

        // Get output tensor (handle different output names)
        const output = results.sigmoid_0 || 
                      results.save_infer_model_scale_0_tmp_1 || 
                      Object.values(results)[0];

        // Process output
        const [, , height, width] = output.dims;
        const outputData = output.data;
        const predMap = [];

        for (let h = 0; h < height; h++) {
            predMap[h] = [];
            for (let w = 0; w < width; w++) {
                predMap[h][w] = outputData[h * width + w];
            }
        }

        // Postprocess to get boxes
        const boxes = this.dbPostProcessor.process(
            [predMap], 
            [preprocessed.originalShape.concat(preprocessed.ratio)]
        );

        return boxes;
    }

    /**
     * Process detected text regions
     */
    async processTextRegions(canvas, boxes, useAngleCls, progressCallback) {
        const results = [];
        
        for (let i = 0; i < boxes.boxes.length; i++) {
            progressCallback?.(`Processing region ${i + 1}/${boxes.boxes.length}...`);
            
            const box = boxes.boxes[i];
            
            // Extract text region
            const regionCanvas = this.extractTextRegion(canvas, box);
            
            // Angle classification if enabled
            let angle = 0;
            if (useAngleCls && this.clsSession) {
                const clsResult = await this.classifyAngle(regionCanvas);
                if (clsResult && clsResult.shouldRotate) {
                    this.rotateCanvas(regionCanvas, 180);
                    angle = 180;
                }
            }
            
            // Text recognition
            const recResult = await this.recognizeText(regionCanvas);
            
            results.push({
                box,
                text: recResult.text,
                confidence: recResult.confidence,
                angle
            });
        }
        
        return results;
    }

    /**
     * Classify text angle
     */
    async classifyAngle(canvas) {
        const preprocessed = await this.clsPreprocessor.preprocess(canvas);
        
        const inputTensor = new ort.Tensor(
            'float32', 
            preprocessed, 
            [1, ...this.modelConfig.settings.cls_image_shape]
        );

        const feeds = { x: inputTensor };
        const results = await this.clsSession.run(feeds);
        
        const output = results.save_infer_model_scale_0_tmp_1 || Object.values(results)[0];
        const probs = Array.from(output.data);
        
        // Softmax
        const maxProb = Math.max(...probs);
        const expProbs = probs.map(p => Math.exp(p - maxProb));
        const sumExp = expProbs.reduce((a, b) => a + b, 0);
        const softmaxProbs = expProbs.map(p => p / sumExp);
        
        // Decision: rotate if 180-degree probability is higher
        return {
            shouldRotate: softmaxProbs[1] > softmaxProbs[0],
            confidence: Math.max(...softmaxProbs)
        };
    }

    /**
     * Recognize text in a region
     */
    async recognizeText(canvas) {
        if (!this.recSession) {
            return { text: '', confidence: 0 };
        }

        // Calculate aspect ratio for dynamic width
        const maxWhRatio = Math.max(canvas.width / canvas.height, 1);
        
        // Preprocess
        const preprocessed = await this.recPreprocessor.preprocess(canvas, maxWhRatio);
        
        // Create tensor
        const inputTensor = new ort.Tensor('float32', preprocessed.tensor, preprocessed.shape);
        
        // Run inference
        const feeds = { x: inputTensor };
        const results = await this.recSession.run(feeds);
        
        // Get output
        const output = results.save_infer_model_scale_0_tmp_1 || Object.values(results)[0];
        
        // Reshape and decode
        const [, timeSteps, vocabSize] = output.dims;
        const outputData = output.data;
        const predictions = [];
        
        for (let t = 0; t < timeSteps; t++) {
            const probs = [];
            for (let v = 0; v < vocabSize; v++) {
                probs.push(outputData[t * vocabSize + v]);
            }
            predictions.push(probs);
        }
        
        // CTC decode
        const decoded = this.ctcDecoder.decode([predictions], 'greedy');
        
        return decoded[0] || { text: '', confidence: 0 };
    }

    /**
     * Extract text region from image
     */
    extractTextRegion(sourceCanvas, box) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Calculate bounding box
        const xs = box.map(p => p[0]);
        const ys = box.map(p => p[1]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        
        const width = maxX - minX;
        const height = maxY - minY;
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw the region
        ctx.drawImage(
            sourceCanvas,
            minX, minY, width, height,
            0, 0, width, height
        );
        
        return canvas;
    }

    /**
     * Rotate canvas
     */
    rotateCanvas(canvas, degrees) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((degrees * Math.PI) / 180);
        ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
        ctx.restore();
    }

    /**
     * Convert input to canvas
     */
    async inputToCanvas(input) {
        if (input instanceof HTMLCanvasElement) {
            return input;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (input instanceof File || input instanceof Blob) {
            const img = new Image();
            const url = URL.createObjectURL(input);
            
            return new Promise((resolve, reject) => {
                img.onload = () => {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    URL.revokeObjectURL(url);
                    resolve(canvas);
                };
                img.onerror = reject;
                img.src = url;
            });
        } else if (typeof input === 'string') {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            return new Promise((resolve, reject) => {
                img.onload = () => {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas);
                };
                img.onerror = reject;
                img.src = input;
            });
        }

        throw new Error('Unsupported input type');
    }

    /**
     * Check cache for results
     */
    async checkCache(input) {
        const cacheKey = await this.generateCacheKey(input);
        return ocrCache.get(cacheKey, 'onnx-ocr', this.modelConfig.id);
    }

    /**
     * Cache OCR results
     */
    async cacheResult(input, result) {
        const cacheKey = await this.generateCacheKey(input);
        ocrCache.set(cacheKey, 'onnx-ocr', this.modelConfig.id, result);
    }

    /**
     * Generate cache key from input
     */
    async generateCacheKey(input) {
        if (input instanceof File) {
            return `${input.name}-${input.size}-${input.lastModified}`;
        } else if (input instanceof Blob) {
            const buffer = await input.arrayBuffer();
            const hash = await crypto.subtle.digest('SHA-256', buffer);
            return Array.from(new Uint8Array(hash))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
        } else if (typeof input === 'string') {
            return input;
        } else if (input instanceof HTMLCanvasElement) {
            return input.toDataURL();
        }
        return JSON.stringify(input);
    }

    /**
     * Get current model info
     */
    getModelInfo() {
        if (!this.modelConfig) return null;
        
        return {
            id: this.modelConfig.id,
            name: this.modelConfig.name,
            description: this.modelConfig.description,
            type: this.modelConfig.type,
            paths: {
                det: this.modelConfig.paths.det,
                cls: this.modelConfig.paths.cls,
                rec: this.modelConfig.paths.rec,
                dict: this.modelConfig.paths.dict
            }
        };
    }

    /**
     * Clean up resources
     */
    async dispose() {
        if (this.detSession) await this.detSession.release();
        if (this.clsSession) await this.clsSession.release();
        if (this.recSession) await this.recSession.release();
        
        this.detSession = null;
        this.clsSession = null;
        this.recSession = null;
        this.initialized = false;
    }
}