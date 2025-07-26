/**
 * PP-OCRv5 Engine with High-Performance Inference
 * Based on PaddleOCR 3.x documentation
 * Supports both mobile and server models
 */

import * as ort from 'onnxruntime-web';
import { OPTIMAL_CONFIGS } from './optimal-ocr-configs.js';

// Configure ONNX Runtime for optimal performance
ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
ort.env.wasm.simd = true;
ort.env.webgl.pack = true;
ort.env.webgl.asyncKernel = true;

const MODEL_BASE_PATH = '/client-ocr-app/models/ppocr-v5/';

export class PPOCRv5Engine {
    constructor(options = {}) {
        this.modelType = options.modelType || 'mobile'; // 'mobile' or 'server'
        this.executionProvider = options.executionProvider || 'webgl'; // 'webgl' or 'wasm'
        this.initialized = false;
        
        // Model metadata
        this.modelMetadata = null;
        
        // Sessions
        this.detectionSession = null;
        this.recognitionSession = null;
        
        // Configurations
        this.currentConfig = OPTIMAL_CONFIGS.GENERAL_TEXT;
        this.preprocessingOptions = {
            enhance_contrast: true,
            contrast_factor: 1.5,
            sharpen_amount: 1.0,
            denoise: true,
            ...this.currentConfig.preprocessing
        };
        
        // Performance monitoring
        this.performanceMetrics = {
            detection: { count: 0, totalTime: 0 },
            recognition: { count: 0, totalTime: 0 },
            preprocessing: { count: 0, totalTime: 0 }
        };
    }

    async initialize(progressCallback = null) {
        if (this.initialized) return;
        
        try {
            // Load model metadata
            const metadataResponse = await fetch(`${MODEL_BASE_PATH}model_metadata.json`);
            this.modelMetadata = await metadataResponse.json();
            
            progressCallback?.({ 
                status: 'loading', 
                message: `Loading PP-OCRv5 ${this.modelType} models...`, 
                progress: 10 
            });
            
            // Determine model paths
            const modelInfo = this.modelMetadata.models[this.modelType];
            const detModelPath = `${MODEL_BASE_PATH}${this.modelType}/${modelInfo.detection.file}`;
            const recModelPath = `${MODEL_BASE_PATH}${this.modelType}/${modelInfo.recognition.file}`;
            
            // Create sessions with optimal settings
            const sessionOptions = this.getOptimalSessionOptions();
            
            // Load detection model
            progressCallback?.({ 
                status: 'loading', 
                message: 'Loading detection model...', 
                progress: 30 
            });
            
            this.detectionSession = await this.createSession(detModelPath, sessionOptions);
            
            // Load recognition model
            progressCallback?.({ 
                status: 'loading', 
                message: 'Loading recognition model...', 
                progress: 60 
            });
            
            this.recognitionSession = await this.createSession(recModelPath, sessionOptions);
            
            // Load dictionary
            progressCallback?.({ 
                status: 'loading', 
                message: 'Loading dictionary...', 
                progress: 80 
            });
            
            await this.loadDictionary();
            
            this.initialized = true;
            
            progressCallback?.({ 
                status: 'ready', 
                message: `PP-OCRv5 ${this.modelType} ready!`, 
                progress: 100 
            });
            
            console.log(`PP-OCRv5 ${this.modelType} engine initialized successfully`);
            
        } catch (error) {
            console.error('Failed to initialize PP-OCRv5:', error);
            throw error;
        }
    }

    getOptimalSessionOptions() {
        const options = {
            executionProviders: [],
            graphOptimizationLevel: 'all',
            enableCpuMemArena: true,
            enableMemPattern: true,
            executionMode: 'parallel',
            interOpNumThreads: navigator.hardwareConcurrency || 4,
            intraOpNumThreads: navigator.hardwareConcurrency || 4
        };
        
        // Configure execution providers based on preference and availability
        if (this.executionProvider === 'webgl') {
            options.executionProviders.push({
                name: 'webgl',
                deviceType: 'gpu',
                powerPreference: 'high-performance',
                layout: 'NHWC' // Optimal for WebGL
            });
        }
        
        // Always add WASM as fallback
        options.executionProviders.push({
            name: 'wasm',
            simd: true,
            threads: navigator.hardwareConcurrency || 4
        });
        
        return options;
    }

    async createSession(modelPath, options) {
        // Try creating session with primary provider
        try {
            return await ort.InferenceSession.create(modelPath, options);
        } catch (error) {
            console.warn(`Failed with primary provider, falling back to WASM:`, error.message);
            
            // Fallback to WASM only
            const fallbackOptions = {
                ...options,
                executionProviders: ['wasm']
            };
            
            return await ort.InferenceSession.create(modelPath, fallbackOptions);
        }
    }

    async loadDictionary() {
        // Load PP-OCRv5 English dictionary
        const response = await fetch(`${MODEL_BASE_PATH}ppocr_keys_v1.txt`);
        const text = await response.text();
        this.dictionary = text.split('\n').filter(line => line.trim());
        this.dictionary.unshift(' '); // Add blank at index 0
    }

    applyConfiguration(configType) {
        const config = OPTIMAL_CONFIGS[configType];
        if (!config) {
            console.warn(`Unknown configuration: ${configType}`);
            return;
        }
        
        this.currentConfig = config;
        this.preprocessingOptions = {
            ...this.preprocessingOptions,
            ...config.preprocessing
        };
        
        console.log(`Applied ${configType} configuration`);
    }

    async process(imageBlob) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        const startTime = performance.now();
        
        try {
            // Convert blob to image
            const image = await this.blobToImage(imageBlob);
            
            // Preprocess image with enhancements
            const preprocessStart = performance.now();
            const processedCanvas = await this.preprocessImage(image);
            this.recordMetric('preprocessing', performance.now() - preprocessStart);
            
            // Run detection
            const detectionStart = performance.now();
            const detectionResult = await this.runDetection(processedCanvas);
            this.recordMetric('detection', performance.now() - detectionStart);
            
            if (!detectionResult || detectionResult.boxes.length === 0) {
                console.log('No text detected');
                return [];
            }
            
            // Run recognition on detected regions
            const recognitionStart = performance.now();
            const results = await this.runRecognition(processedCanvas, detectionResult.boxes);
            this.recordMetric('recognition', performance.now() - recognitionStart);
            
            const totalTime = performance.now() - startTime;
            console.log(`PP-OCRv5 processing complete in ${totalTime.toFixed(2)}ms`);
            console.log(`Performance metrics:`, this.getPerformanceReport());
            
            return results;
            
        } catch (error) {
            console.error('PP-OCRv5 processing error:', error);
            throw error;
        }
    }

    async preprocessImage(image) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set canvas size based on model type and config
        const modelInfo = this.modelMetadata.models[this.modelType];
        const maxSize = this.modelType === 'server' ? 1280 : 960;
        
        // Calculate scaling to fit within max size while preserving aspect ratio
        const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        
        // Apply image enhancements based on configuration
        ctx.filter = this.getImageFilters();
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        
        // Additional preprocessing based on config
        if (this.preprocessingOptions.enhance_contrast) {
            this.enhanceContrast(ctx, canvas.width, canvas.height);
        }
        
        if (this.preprocessingOptions.sharpen_amount > 0) {
            this.sharpenImage(ctx, canvas.width, canvas.height);
        }
        
        if (this.preprocessingOptions.denoise) {
            this.denoiseImage(ctx, canvas.width, canvas.height);
        }
        
        return canvas;
    }

    getImageFilters() {
        const filters = [];
        
        if (this.preprocessingOptions.contrast_factor !== 1) {
            filters.push(`contrast(${this.preprocessingOptions.contrast_factor})`);
        }
        
        if (this.preprocessingOptions.enhance_thermal) {
            filters.push('contrast(2) brightness(1.2)');
        }
        
        return filters.join(' ');
    }

    enhanceContrast(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const factor = this.preprocessingOptions.contrast_factor;
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, (data[i] - 128) * factor + 128);
            data[i + 1] = Math.min(255, (data[i + 1] - 128) * factor + 128);
            data[i + 2] = Math.min(255, (data[i + 2] - 128) * factor + 128);
        }
        
        ctx.putImageData(imageData, 0, 0);
    }

    sharpenImage(ctx, width, height) {
        // Simple sharpening kernel
        const imageData = ctx.getImageData(0, 0, width, height);
        const output = ctx.createImageData(width, height);
        const src = imageData.data;
        const dst = output.data;
        const amount = this.preprocessingOptions.sharpen_amount;
        
        // Apply sharpening
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                
                for (let c = 0; c < 3; c++) {
                    const center = src[idx + c] * (1 + 4 * amount);
                    const surrounding = (
                        src[((y - 1) * width + x) * 4 + c] +
                        src[((y + 1) * width + x) * 4 + c] +
                        src[(y * width + x - 1) * 4 + c] +
                        src[(y * width + x + 1) * 4 + c]
                    ) * -amount;
                    
                    dst[idx + c] = Math.min(255, Math.max(0, center + surrounding));
                }
                dst[idx + 3] = 255; // Alpha
            }
        }
        
        ctx.putImageData(output, 0, 0);
    }

    denoiseImage(ctx, width, height) {
        // Simple median filter for noise reduction
        const imageData = ctx.getImageData(0, 0, width, height);
        const output = ctx.createImageData(width, height);
        const src = imageData.data;
        const dst = output.data;
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                
                for (let c = 0; c < 3; c++) {
                    const pixels = [];
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            pixels.push(src[((y + dy) * width + (x + dx)) * 4 + c]);
                        }
                    }
                    pixels.sort((a, b) => a - b);
                    dst[idx + c] = pixels[4]; // Median
                }
                dst[idx + 3] = 255; // Alpha
            }
        }
        
        ctx.putImageData(output, 0, 0);
    }

    async runDetection(canvas) {
        const input = await this.prepareDetectionInput(canvas);
        
        // Run inference
        const feeds = { x: input };
        const results = await this.detectionSession.run(feeds);
        
        // Process detection output
        const outputName = Object.keys(results)[0];
        const output = results[outputName];
        
        // Extract bounding boxes
        const boxes = this.extractBoundingBoxes(output, canvas.width, canvas.height);
        
        return { boxes };
    }

    async prepareDetectionInput(canvas) {
        const modelInfo = this.modelMetadata.models[this.modelType];
        const [batch, channels, height, width] = modelInfo.detection.input_shape;
        
        // Create input tensor
        const input = new Float32Array(batch * channels * height * width);
        
        // Resize canvas to model input size
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvas, 0, 0, width, height);
        
        // Get image data and normalize
        const imageData = tempCtx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const mean = modelInfo.detection.preprocessing.mean;
        const std = modelInfo.detection.preprocessing.std;
        
        // Convert to CHW format and normalize
        for (let c = 0; c < channels; c++) {
            for (let h = 0; h < height; h++) {
                for (let w = 0; w < width; w++) {
                    const idx = (h * width + w) * 4 + c;
                    const value = data[idx] / 255.0;
                    input[c * height * width + h * width + w] = (value - mean[c]) / std[c];
                }
            }
        }
        
        return new ort.Tensor('float32', input, [batch, channels, height, width]);
    }

    extractBoundingBoxes(output, origWidth, origHeight) {
        // Implementation based on PP-OCRv5 detection output format
        const boxes = [];
        const data = output.data;
        const [batch, height, width] = output.dims;
        
        // Apply threshold and extract contours
        const threshold = this.currentConfig.detection.det_db_thresh;
        const boxThreshold = this.currentConfig.detection.det_db_box_thresh;
        
        // Process detection map
        const binaryMap = new Uint8Array(height * width);
        for (let i = 0; i < height * width; i++) {
            binaryMap[i] = data[i] > threshold ? 1 : 0;
        }
        
        // Find contours and convert to bounding boxes
        const contours = this.findContours(binaryMap, width, height);
        
        for (const contour of contours) {
            if (contour.score > boxThreshold) {
                // Scale coordinates back to original image size
                const scaleX = origWidth / width;
                const scaleY = origHeight / height;
                
                const box = contour.points.map(p => [
                    Math.round(p[0] * scaleX),
                    Math.round(p[1] * scaleY)
                ]);
                
                boxes.push({
                    box,
                    score: contour.score
                });
            }
        }
        
        return boxes;
    }

    findContours(binaryMap, width, height) {
        // Simplified contour detection
        // In production, use proper contour detection algorithm
        const contours = [];
        const visited = new Uint8Array(width * height);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                
                if (binaryMap[idx] && !visited[idx]) {
                    const contour = this.traceContour(binaryMap, visited, x, y, width, height);
                    if (contour.points.length >= 4) {
                        contours.push(contour);
                    }
                }
            }
        }
        
        return contours;
    }

    traceContour(binaryMap, visited, startX, startY, width, height) {
        // Simplified contour tracing - returns bounding box
        let minX = startX, maxX = startX;
        let minY = startY, maxY = startY;
        let pixelCount = 0;
        let scoreSum = 0;
        
        const stack = [[startX, startY]];
        
        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const idx = y * width + x;
            
            if (x < 0 || x >= width || y < 0 || y >= height || visited[idx] || !binaryMap[idx]) {
                continue;
            }
            
            visited[idx] = 1;
            pixelCount++;
            
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            
            // Add neighbors
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        
        // Convert to polygon (rectangle for simplicity)
        const points = [
            [minX, minY],
            [maxX, minY],
            [maxX, maxY],
            [minX, maxY]
        ];
        
        return {
            points,
            score: Math.min(pixelCount / ((maxX - minX) * (maxY - minY)), 1.0)
        };
    }

    async runRecognition(canvas, boxes) {
        const results = [];
        
        for (const { box, score } of boxes) {
            // Crop text region
            const cropCanvas = this.cropTextRegion(canvas, box);
            
            // Prepare recognition input
            const input = await this.prepareRecognitionInput(cropCanvas);
            
            // Run inference
            const feeds = { x: input };
            const output = await this.recognitionSession.run(feeds);
            
            // Decode output
            const text = this.decodeRecognitionOutput(output);
            
            if (text.trim()) {
                results.push({
                    text: text.trim(),
                    confidence: score,
                    box
                });
            }
        }
        
        return results;
    }

    cropTextRegion(canvas, box) {
        // Calculate bounding rectangle
        const xs = box.map(p => p[0]);
        const ys = box.map(p => p[1]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        
        const width = maxX - minX;
        const height = maxY - minY;
        
        // Create cropped canvas
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = width;
        cropCanvas.height = height;
        
        const ctx = cropCanvas.getContext('2d');
        ctx.drawImage(
            canvas,
            minX, minY, width, height,
            0, 0, width, height
        );
        
        return cropCanvas;
    }

    async prepareRecognitionInput(canvas) {
        const modelInfo = this.modelMetadata.models[this.modelType];
        const [batch, channels, height, maxWidth] = modelInfo.recognition.input_shape;
        
        // Calculate width maintaining aspect ratio
        const aspectRatio = canvas.width / canvas.height;
        const width = Math.min(Math.round(height * aspectRatio), maxWidth);
        
        // Resize to recognition input size
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0, width, height);
        
        // Create input tensor
        const input = new Float32Array(batch * channels * height * maxWidth);
        
        // Get image data and normalize
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const mean = modelInfo.recognition.preprocessing.mean;
        const std = modelInfo.recognition.preprocessing.std;
        
        // Convert to CHW format and normalize
        for (let c = 0; c < channels; c++) {
            for (let h = 0; h < height; h++) {
                for (let w = 0; w < width; w++) {
                    const srcIdx = (h * width + w) * 4 + c;
                    const dstIdx = c * height * maxWidth + h * maxWidth + w;
                    const value = data[srcIdx] / 255.0;
                    input[dstIdx] = (value - mean[c]) / std[c];
                }
            }
        }
        
        return new ort.Tensor('float32', input, [batch, channels, height, maxWidth]);
    }

    decodeRecognitionOutput(output) {
        const outputName = Object.keys(output)[0];
        const data = output[outputName].data;
        const [batch, timesteps, vocabSize] = output[outputName].dims;
        
        // CTC decoding
        const decoded = [];
        let lastIdx = -1;
        
        for (let t = 0; t < timesteps; t++) {
            let maxIdx = 0;
            let maxProb = data[t * vocabSize];
            
            for (let v = 1; v < vocabSize; v++) {
                const prob = data[t * vocabSize + v];
                if (prob > maxProb) {
                    maxProb = prob;
                    maxIdx = v;
                }
            }
            
            // CTC blank is usually at index 0
            if (maxIdx !== 0 && maxIdx !== lastIdx) {
                if (maxIdx < this.dictionary.length) {
                    decoded.push(this.dictionary[maxIdx]);
                }
            }
            
            lastIdx = maxIdx;
        }
        
        return decoded.join('');
    }

    recordMetric(stage, time) {
        this.performanceMetrics[stage].count++;
        this.performanceMetrics[stage].totalTime += time;
    }

    getPerformanceReport() {
        const report = {};
        
        for (const [stage, metrics] of Object.entries(this.performanceMetrics)) {
            if (metrics.count > 0) {
                report[stage] = {
                    avgTime: (metrics.totalTime / metrics.count).toFixed(2),
                    totalTime: metrics.totalTime.toFixed(2),
                    count: metrics.count
                };
            }
        }
        
        return report;
    }

    async blobToImage(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(img.src);
                resolve(img);
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
    }

    setModelType(type) {
        if (type !== this.modelType && (type === 'mobile' || type === 'server')) {
            this.modelType = type;
            this.initialized = false;
            console.log(`Switched to ${type} models. Re-initialization required.`);
        }
    }

    setExecutionProvider(provider) {
        if (provider !== this.executionProvider && (provider === 'webgl' || provider === 'wasm')) {
            this.executionProvider = provider;
            this.initialized = false;
            console.log(`Switched to ${provider} execution provider. Re-initialization required.`);
        }
    }
}

// Export singleton instance
export const ppOCRv5Engine = new PPOCRv5Engine();