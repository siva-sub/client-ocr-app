/**
 * PP-OCRv5 ONNX Engine with exact OnnxOCR preprocessing/postprocessing
 * Includes CLS (angle classification), DET (text detection), and REC (text recognition)
 */

import * as ort from 'onnxruntime-web';
import { 
    DetectionPreprocessor, 
    ClassificationPreprocessor, 
    RecognitionPreprocessor,
    TextRegionExtractor 
} from './onnx-ocr-preprocessing.js';
import { 
    DBPostProcessor, 
    ClassificationPostProcessor, 
    CTCDecoder, 
    sortBoxes 
} from './onnx-ocr-postprocessing.js';
import { ocrCache } from './ocr-cache-manager.js';

// Configure ONNX Runtime
const isGitHubPages = window.location.hostname.includes('github.io');
const basePath = isGitHubPages ? '/client-ocr-app' : '';
const wasmPath = `${basePath}/assets/`;
ort.env.wasm.wasmPaths = wasmPath;
ort.env.wasm.numThreads = 1;

export class PPOCRv5OnnxEngine {
    constructor(options = {}) {
        this.modelName = options.modelName || 'PP-OCRv5';
        this.useAngleCls = options.useAngleCls !== false;
        this.useCache = options.useCache !== false;
        
        // Model paths based on model name
        const modelBasePath = `${basePath}/models/`;
        this.modelPaths = {
            'PP-OCRv5': {
                det: modelBasePath + 'PP-OCRv5/det/det.onnx',
                cls: modelBasePath + 'PP-OCRv5/cls/cls.onnx',
                rec: modelBasePath + 'PP-OCRv5/rec/rec.onnx',
                dict: modelBasePath + 'PP-OCRv5/ppocrv5_dict.txt'
            },
            'PP-OCRv5_mobile': {
                det: modelBasePath + 'PP-OCRv5_mobile_det_infer.onnx',
                cls: modelBasePath + 'PP-OCRv5/cls/cls.onnx',
                rec: modelBasePath + 'PP-OCRv5_mobile_rec_infer.onnx',
                dict: modelBasePath + 'ppocrv5_dict.txt'
            },
            'PP-OCRv4': {
                det: modelBasePath + 'PP-OCRv4/det/det.onnx',
                cls: modelBasePath + 'PP-OCRv4/cls/cls.onnx',
                rec: modelBasePath + 'PP-OCRv4/rec/rec.onnx',
                dict: modelBasePath + 'PP-OCRv4/ppocr_keys_v1.txt'
            },
            'PP-OCRv4_mobile': {
                det: modelBasePath + 'PP-OCRv4/det/det.onnx',
                cls: modelBasePath + 'PP-OCRv4/cls/cls.onnx',
                rec: modelBasePath + 'en_PP-OCRv4_mobile_rec_infer.onnx',
                dict: modelBasePath + 'en_dict.txt'
            },
            'ch_ppocr_server_v2.0': {
                det: modelBasePath + 'ch_ppocr_server_v2.0/det/det.onnx',
                cls: modelBasePath + 'ch_ppocr_server_v2.0/cls/cls.onnx',
                rec: null, // Server v2.0 doesn't have rec model in the directory
                dict: modelBasePath + 'ch_ppocr_server_v2.0/ppocr_keys_v1.txt'
            }
        };
        
        // OnnxOCR parameters
        this.detParams = {
            det_limit_side_len: options.detLimitSideLen || 960,
            det_limit_type: options.detLimitType || 'min',
            det_db_thresh: options.detDbThresh || 0.3,
            det_db_box_thresh: options.detDbBoxThresh || 0.6,
            det_db_unclip_ratio: options.detDbUnclipRatio || 1.7,
            det_db_score_mode: options.detDbScoreMode || 'fast'
        };
        
        this.clsParams = {
            cls_image_shape: [3, 48, 192],
            cls_thresh: options.clsThresh || 0.9,
            label_list: ['0', '180']
        };
        
        this.recParams = {
            rec_image_shape: [3, 48, 320],
            rec_algorithm: 'SVTR_LCNet'
        };
        
        // Preprocessors
        this.detPreprocessor = new DetectionPreprocessor(this.detParams);
        this.clsPreprocessor = new ClassificationPreprocessor(this.clsParams);
        this.recPreprocessor = new RecognitionPreprocessor(this.recParams);
        
        // Postprocessors
        this.detPostprocessor = new DBPostProcessor({
            thresh: this.detParams.det_db_thresh,
            box_thresh: this.detParams.det_db_box_thresh,
            unclip_ratio: this.detParams.det_db_unclip_ratio,
            score_mode: this.detParams.det_db_score_mode
        });
        this.clsPostprocessor = new ClassificationPostProcessor(this.clsParams);
        
        // Sessions
        this.detSession = null;
        this.clsSession = null;
        this.recSession = null;
        
        // Character dictionary
        this.characterDict = null;
        this.ctcDecoder = null;
        
        this.initialized = false;
    }
    
    async initialize(progressCallback = null) {
        if (this.initialized) return;
        
        try {
            const paths = this.modelPaths[this.modelName];
            if (!paths) {
                throw new Error(`Unknown model: ${this.modelName}`);
            }
            
            // Load character dictionary
            progressCallback?.('Loading character dictionary...');
            await this.loadCharacterDict(paths.dict);
            
            // Load detection model
            progressCallback?.('Loading detection model...');
            this.detSession = await ort.InferenceSession.create(paths.det, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all'
            });
            
            // Load classification model if enabled
            if (this.useAngleCls) {
                progressCallback?.('Loading angle classification model...');
                this.clsSession = await ort.InferenceSession.create(paths.cls, {
                    executionProviders: ['wasm'],
                    graphOptimizationLevel: 'all'
                });
            }
            
            // Load recognition model if available
            if (paths.rec) {
                progressCallback?.('Loading recognition model...');
                this.recSession = await ort.InferenceSession.create(paths.rec, {
                    executionProviders: ['wasm'],
                    graphOptimizationLevel: 'all'
                });
            } else if (this.modelName === 'ch_ppocr_server_v2.0') {
                // Use PP-OCRv4 rec model as fallback for server v2.0
                const fallbackRecPath = '/public/models/PP-OCRv4/rec/rec.onnx';
                progressCallback?.('Loading recognition model (fallback)...');
                this.recSession = await ort.InferenceSession.create(fallbackRecPath, {
                    executionProviders: ['wasm'],
                    graphOptimizationLevel: 'all'
                });
            }
            
            this.initialized = true;
            progressCallback?.('Initialization complete!');
        } catch (error) {
            console.error('Failed to initialize PP-OCRv5 ONNX engine:', error);
            throw error;
        }
    }
    
    async loadCharacterDict(dictPath) {
        try {
            const response = await fetch(dictPath);
            const text = await response.text();
            this.characterDict = text.split('\n').filter(char => char.length > 0);
            this.ctcDecoder = new CTCDecoder(this.characterDict);
        } catch (error) {
            console.error('Failed to load character dictionary:', error);
            throw error;
        }
    }
    
    async process(input, progressCallback = null) {
        if (!this.initialized) {
            await this.initialize(progressCallback);
        }
        
        // Check cache if enabled
        if (this.useCache) {
            const cached = await this.checkCache(input);
            if (cached) {
                progressCallback?.('Using cached result');
                return cached;
            }
        }
        
        // Convert input to canvas
        const canvas = await this.inputToCanvas(input);
        
        // Text Detection
        progressCallback?.('Detecting text regions...');
        const detectionResult = await this.detectText(canvas);
        
        if (!detectionResult || detectionResult.boxes.length === 0) {
            return { text: '', boxes: [], lines: [] };
        }
        
        // Sort boxes from top to bottom, left to right
        const sortedBoxes = sortBoxes(detectionResult.boxes);
        
        // Process each text region
        const textResults = [];
        for (let i = 0; i < sortedBoxes.length; i++) {
            progressCallback?.(`Processing region ${i + 1}/${sortedBoxes.length}...`);
            
            const box = sortedBoxes[i];
            
            // Extract text region
            const regionCanvas = TextRegionExtractor.extractRegion(canvas, box);
            
            // Angle classification
            let angle = 0;
            if (this.useAngleCls && this.clsSession) {
                const clsResult = await this.classifyAngle(regionCanvas);
                if (clsResult.shouldRotate) {
                    // Rotate 180 degrees
                    const rotatedCanvas = this.rotateCanvas(regionCanvas, 180);
                    regionCanvas.width = rotatedCanvas.width;
                    regionCanvas.height = rotatedCanvas.height;
                    regionCanvas.getContext('2d').drawImage(rotatedCanvas, 0, 0);
                    angle = 180;
                }
            }
            
            // Text recognition
            const recResult = await this.recognizeText(regionCanvas);
            
            textResults.push({
                box,
                text: recResult.text,
                confidence: recResult.confidence,
                angle
            });
        }
        
        // Combine results
        const fullText = textResults.map(r => r.text).join('\n');
        const result = {
            text: fullText,
            boxes: sortedBoxes,
            lines: textResults,
            modelName: this.modelName
        };
        
        // Cache result if enabled
        if (this.useCache) {
            await this.cacheResult(input, result);
        }
        
        return result;
    }
    
    async detectText(canvas) {
        // Preprocess image
        const preprocessed = await this.detPreprocessor.preprocess(canvas);
        
        // Create tensor
        const inputTensor = new ort.Tensor('float32', preprocessed.tensor, [1, 3, preprocessed.resizedShape[0], preprocessed.resizedShape[1]]);
        
        // Run inference
        const feeds = { x: inputTensor };
        const results = await this.detSession.run(feeds);
        
        // Get output tensor
        const output = results.sigmoid_0 || results.save_infer_model_scale_0_tmp_1 || Object.values(results)[0];
        
        // Reshape output to [height, width]
        const outputData = output.data;
        const [, , height, width] = output.dims;
        const predMap = [];
        
        for (let h = 0; h < height; h++) {
            predMap[h] = [];
            for (let w = 0; w < width; w++) {
                predMap[h][w] = outputData[h * width + w];
            }
        }
        
        // Postprocess to get boxes
        const postResult = this.detPostprocessor.process([predMap], [preprocessed.originalShape.concat(preprocessed.ratio)]);
        
        return postResult;
    }
    
    async classifyAngle(canvas) {
        // Preprocess image
        const preprocessed = await this.clsPreprocessor.preprocess(canvas);
        
        // Create tensor
        const inputTensor = new ort.Tensor('float32', preprocessed, [1, ...this.clsParams.cls_image_shape]);
        
        // Run inference
        const feeds = { x: inputTensor };
        const results = await this.clsSession.run(feeds);
        
        // Get output
        const output = results.save_infer_model_scale_0_tmp_1 || Object.values(results)[0];
        const outputData = Array.from(output.data);
        
        // Postprocess
        const clsResult = this.clsPostprocessor.process([outputData]);
        
        return clsResult[0];
    }
    
    async recognizeText(canvas) {
        if (!this.recSession) {
            return { text: '', confidence: 0 };
        }
        
        // Calculate max width-height ratio
        const maxWhRatio = canvas.width / canvas.height;
        
        // Preprocess image
        const preprocessed = await this.recPreprocessor.preprocess(canvas, maxWhRatio);
        
        // Create tensor
        const inputTensor = new ort.Tensor('float32', preprocessed.tensor, preprocessed.shape);
        
        // Run inference
        const feeds = { x: inputTensor };
        const results = await this.recSession.run(feeds);
        
        // Get output
        const output = results.save_infer_model_scale_0_tmp_1 || Object.values(results)[0];
        
        // Reshape output
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
        
        // Decode using CTC
        const decoded = this.ctcDecoder.decode([predictions], 'greedy');
        
        return decoded[0];
    }
    
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
            // URL or base64
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
    
    rotateCanvas(canvas, degrees) {
        const radians = degrees * Math.PI / 180;
        const rotatedCanvas = document.createElement('canvas');
        const ctx = rotatedCanvas.getContext('2d');
        
        if (degrees === 180) {
            rotatedCanvas.width = canvas.width;
            rotatedCanvas.height = canvas.height;
            ctx.translate(canvas.width, canvas.height);
            ctx.rotate(radians);
            ctx.drawImage(canvas, 0, 0);
        } else if (degrees === 90 || degrees === -270) {
            rotatedCanvas.width = canvas.height;
            rotatedCanvas.height = canvas.width;
            ctx.translate(canvas.height, 0);
            ctx.rotate(radians);
            ctx.drawImage(canvas, 0, 0);
        } else if (degrees === -90 || degrees === 270) {
            rotatedCanvas.width = canvas.height;
            rotatedCanvas.height = canvas.width;
            ctx.translate(0, canvas.width);
            ctx.rotate(radians);
            ctx.drawImage(canvas, 0, 0);
        }
        
        return rotatedCanvas;
    }
    
    async checkCache(input) {
        if (!this.useCache) return null;
        
        const cacheKey = await this.generateCacheKey(input);
        return ocrCache.get(cacheKey, 'ppocr-v5-onnx', this.modelName);
    }
    
    async cacheResult(input, result) {
        if (!this.useCache) return;
        
        const cacheKey = await this.generateCacheKey(input);
        ocrCache.set(cacheKey, 'ppocr-v5-onnx', this.modelName, result);
    }
    
    async generateCacheKey(input) {
        if (input instanceof File) {
            return await this.fileToBase64(input);
        } else if (typeof input === 'string') {
            return input;
        } else if (input instanceof HTMLCanvasElement) {
            return input.toDataURL();
        }
        return JSON.stringify(input);
    }
    
    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    
    getCacheStats() {
        return ocrCache.getStats();
    }
    
    clearCache() {
        ocrCache.clear();
    }
}

// Export singleton instance for backward compatibility
export const ppOCRv5OnnxEngine = new PPOCRv5OnnxEngine();