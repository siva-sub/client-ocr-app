/**
 * Enhanced PP-OCRv5 Engine with OnnxOCR Best Practices
 * Incorporates optimizations from https://github.com/jingsongliujing/OnnxOCR
 * Supports PP-OCRv5, PP-OCRv4, and server models
 */

import * as ort from 'onnxruntime-web';
import { OPTIMAL_CONFIGS } from './optimal-ocr-configs.js';

// Configure ONNX Runtime for optimal performance
// Set WASM paths based on deployment environment
const isGitHubPages = window.location.hostname.includes('github.io');
const wasmBasePath = isGitHubPages ? '/client-ocr-app/assets/' : '/assets/';
ort.env.wasm.wasmPaths = wasmBasePath;
ort.env.wasm.numThreads = 1; // Single thread for now to avoid CORS issues
ort.env.wasm.simd = true;
ort.env.webgl.pack = false; // Disable WebGL packing for stability
ort.env.webgl.asyncKernel = false;
ort.env.logLevel = 'warning';

// Model configurations based on OnnxOCR structure
const MODEL_CONFIGS = {
    'PP-OCRv5': {
        det: 'PP-OCRv5/det/det.onnx',
        rec: 'PP-OCRv5/rec/rec.onnx',
        cls: 'PP-OCRv5/cls/cls.onnx',
        dict: 'PP-OCRv5/ppocrv5_dict.txt',
        rec_image_shape: [3, 48, 320],
        preprocessing: {
            det: { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
            rec: { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] }
        }
    },
    'PP-OCRv4': {
        det: 'PP-OCRv4/det/det.onnx',
        rec: 'PP-OCRv4/rec/rec.onnx',
        cls: 'PP-OCRv4/cls/cls.onnx',
        dict: 'PP-OCRv4/ppocr_keys_v1.txt',
        rec_image_shape: [3, 48, 320],
        preprocessing: {
            det: { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
            rec: { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] }
        }
    },
    'ch_ppocr_server_v2.0': {
        det: 'ch_ppocr_server_v2.0/det/det.onnx',
        rec: 'ch_ppocr_server_v2.0/rec/rec.onnx',
        cls: 'ch_ppocr_server_v2.0/cls/cls.onnx',
        dict: 'ch_ppocr_server_v2.0/ppocr_keys_v1.txt',
        rec_image_shape: [3, 32, 320],
        preprocessing: {
            det: { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
            rec: { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] }
        }
    }
};

export class PPOCRv5EnhancedEngine {
    constructor(options = {}) {
        // Model selection
        this.modelName = options.modelName || 'PP-OCRv5';
        this.useAngleCls = options.useAngleCls !== false;
        this.useGpu = options.useGpu === true && 'gpu' in navigator;
        
        // Detection parameters (from OnnxOCR defaults)
        this.detLimitSideLen = options.detLimitSideLen || 960;
        this.detLimitType = options.detLimitType || 'max';
        this.detDbThresh = options.detDbThresh || 0.3;
        this.detDbBoxThresh = options.detDbBoxThresh || 0.6;
        this.detDbUnclipRatio = options.detDbUnclipRatio || 1.7;
        this.detDbScoreMode = options.detDbScoreMode || 'fast';
        this.useDilation = options.useDilation || false;
        
        // Recognition parameters
        this.recBatchNum = options.recBatchNum || 6;
        this.dropScore = options.dropScore || 0.5;
        
        // Sessions
        this.detSession = null;
        this.recSession = null;
        this.clsSession = null;
        
        // Dictionary
        this.dictionary = [];
        
        // Current configuration
        this.currentConfig = OPTIMAL_CONFIGS.GENERAL_TEXT;
        
        // Performance tracking
        this.performanceMetrics = {
            detection: { count: 0, totalTime: 0 },
            recognition: { count: 0, totalTime: 0 },
            classification: { count: 0, totalTime: 0 },
            preprocessing: { count: 0, totalTime: 0 }
        };
        
        this.initialized = false;
    }

    async initialize(progressCallback = null) {
        if (this.initialized) return;
        
        try {
            const modelConfig = MODEL_CONFIGS[this.modelName];
            if (!modelConfig) {
                throw new Error(`Unknown model: ${this.modelName}`);
            }
            
            const isGitHubPages = window.location.hostname.includes('github.io');
            const basePath = isGitHubPages ? '/client-ocr-app/models/' : '/models/';
            
            progressCallback?.({ 
                status: 'loading', 
                message: `Loading ${this.modelName} models...`, 
                progress: 10 
            });
            
            // Create optimal session options
            const sessionOptions = this.getSessionOptions();
            
            // Load detection model
            progressCallback?.({ 
                status: 'loading', 
                message: 'Loading detection model...', 
                progress: 25 
            });
            this.detSession = await this.createSession(
                basePath + modelConfig.det, 
                sessionOptions
            );
            
            // Load recognition model
            progressCallback?.({ 
                status: 'loading', 
                message: 'Loading recognition model...', 
                progress: 50 
            });
            this.recSession = await this.createSession(
                basePath + modelConfig.rec, 
                sessionOptions
            );
            
            // Load classification model if enabled
            if (this.useAngleCls) {
                progressCallback?.({ 
                    status: 'loading', 
                    message: 'Loading classification model...', 
                    progress: 70 
                });
                this.clsSession = await this.createSession(
                    basePath + modelConfig.cls, 
                    sessionOptions
                );
            }
            
            // Load dictionary
            progressCallback?.({ 
                status: 'loading', 
                message: 'Loading dictionary...', 
                progress: 85 
            });
            await this.loadDictionary(basePath + modelConfig.dict);
            
            // Store model config
            this.modelConfig = modelConfig;
            
            this.initialized = true;
            
            progressCallback?.({ 
                status: 'ready', 
                message: `${this.modelName} ready!`, 
                progress: 100 
            });
            
            console.log(`${this.modelName} engine initialized successfully`);
            
        } catch (error) {
            console.error('Failed to initialize PP-OCR:', error);
            throw error;
        }
    }

    getSessionOptions() {
        const providers = [];
        
        // GPU provider if available and enabled
        if (this.useGpu) {
            providers.push({
                name: 'webgl',
                deviceType: 'gpu',
                powerPreference: 'high-performance'
            });
        }
        
        // Always add WASM as fallback
        providers.push({
            name: 'wasm',
            simd: true,
            threads: navigator.hardwareConcurrency || 4
        });
        
        return {
            executionProviders: providers,
            graphOptimizationLevel: 'all',
            enableCpuMemArena: true,
            enableMemPattern: true,
            executionMode: 'parallel',
            interOpNumThreads: navigator.hardwareConcurrency || 4,
            intraOpNumThreads: navigator.hardwareConcurrency || 4
        };
    }

    async createSession(modelPath, options) {
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

    async loadDictionary(dictPath) {
        const response = await fetch(dictPath);
        const text = await response.text();
        this.dictionary = text.split('\n').filter(line => line.trim());
        
        // Add blank at index 0 for CTC decoding
        if (this.dictionary[0] !== ' ') {
            this.dictionary.unshift(' ');
        }
    }

    applyConfiguration(configType) {
        const config = OPTIMAL_CONFIGS[configType];
        if (!config) {
            console.warn(`Unknown configuration: ${configType}`);
            return;
        }
        
        this.currentConfig = config;
        
        // Update detection parameters
        if (config.detection) {
            this.detDbThresh = config.detection.det_db_thresh || this.detDbThresh;
            this.detDbBoxThresh = config.detection.det_db_box_thresh || this.detDbBoxThresh;
            this.detDbUnclipRatio = config.detection.det_db_unclip_ratio || this.detDbUnclipRatio;
            this.detLimitSideLen = config.detection.det_limit_side_len || this.detLimitSideLen;
        }
        
        // Update recognition parameters
        if (config.recognition) {
            this.dropScore = config.recognition.drop_score || this.dropScore;
            this.recBatchNum = config.recognition.rec_batch_num || this.recBatchNum;
        }
        
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
            
            // Convert to cv2-like format (numpy array)
            const cvImage = await this.imageToCv(image);
            
            // Run full OCR pipeline
            const results = await this.ocr(cvImage, true, true, this.useAngleCls);
            
            const totalTime = performance.now() - startTime;
            console.log(`${this.modelName} processing complete in ${totalTime.toFixed(2)}ms`);
            console.log(`Performance metrics:`, this.getPerformanceReport());
            
            // Convert results to our format
            return this.formatResults(results);
            
        } catch (error) {
            console.error('PP-OCR processing error:', error);
            throw error;
        }
    }

    async ocr(img, det = true, rec = true, cls = true) {
        // Based on OnnxOCR implementation
        if (cls && !this.useAngleCls) {
            console.log("Angle classifier not initialized, skipping classification");
            cls = false;
        }

        if (det && rec) {
            // Full pipeline: detection + recognition
            const dtBoxes = await this.textDetector(img);
            
            if (!dtBoxes || dtBoxes.length === 0) {
                return [];
            }
            
            // Sort boxes from top to bottom, left to right
            const sortedBoxes = this.sortedBoxes(dtBoxes);
            
            // Crop text regions
            const imgCropList = [];
            for (const box of sortedBoxes) {
                const imgCrop = this.getRotateCropImage(img, box);
                imgCropList.push(imgCrop);
            }
            
            // Angle classification if enabled
            if (cls && this.clsSession) {
                const startTime = performance.now();
                const angleResults = await this.textClassifier(imgCropList);
                this.recordMetric('classification', performance.now() - startTime);
                
                // Rotate images based on angle
                for (let i = 0; i < imgCropList.length; i++) {
                    if (angleResults[i].label === '180') {
                        imgCropList[i] = this.rotateImage(imgCropList[i], 180);
                    }
                }
            }
            
            // Recognition
            const recResults = await this.textRecognizer(imgCropList);
            
            // Combine results
            const results = [];
            for (let i = 0; i < sortedBoxes.length; i++) {
                if (recResults[i][1] >= this.dropScore) {
                    results.push({
                        box: sortedBoxes[i],
                        text: recResults[i][0],
                        confidence: recResults[i][1]
                    });
                }
            }
            
            return results;
            
        } else if (det && !rec) {
            // Detection only
            return await this.textDetector(img);
            
        } else {
            // Recognition only
            const imgList = Array.isArray(img) ? img : [img];
            
            if (cls && this.clsSession) {
                const angleResults = await this.textClassifier(imgList);
                for (let i = 0; i < imgList.length; i++) {
                    if (angleResults[i].label === '180') {
                        imgList[i] = this.rotateImage(imgList[i], 180);
                    }
                }
            }
            
            return await this.textRecognizer(imgList);
        }
    }

    async textDetector(img) {
        const startTime = performance.now();
        
        // Preprocess image for detection
        const { processedImg, ratioH, ratioW } = this.preprocessDetection(img);
        
        // Prepare input tensor
        const input = this.imageToTensor(processedImg, 'det');
        
        // Run inference
        const feeds = { x: input };
        const results = await this.detSession.run(feeds);
        
        // Get output
        const outputName = this.detSession.outputNames[0];
        const output = results[outputName];
        
        // Postprocess to get boxes
        const boxes = await this.postprocessDetection(output, ratioH, ratioW);
        
        this.recordMetric('detection', performance.now() - startTime);
        
        return boxes;
    }

    preprocessDetection(img) {
        // Resize image based on limit side length
        const h = img.height;
        const w = img.width;
        
        let resizeH, resizeW;
        
        if (this.detLimitType === 'max') {
            if (Math.max(h, w) > this.detLimitSideLen) {
                const ratio = this.detLimitSideLen / Math.max(h, w);
                resizeH = Math.round(h * ratio);
                resizeW = Math.round(w * ratio);
            } else {
                resizeH = h;
                resizeW = w;
            }
        } else {
            if (Math.min(h, w) < this.detLimitSideLen) {
                const ratio = this.detLimitSideLen / Math.min(h, w);
                resizeH = Math.round(h * ratio);
                resizeW = Math.round(w * ratio);
            } else {
                resizeH = h;
                resizeW = w;
            }
        }
        
        // Make dimensions divisible by 32
        resizeH = Math.round(resizeH / 32) * 32;
        resizeW = Math.round(resizeW / 32) * 32;
        
        // Resize image
        const canvas = document.createElement('canvas');
        canvas.width = resizeW;
        canvas.height = resizeH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img.canvas || img, 0, 0, resizeW, resizeH);
        
        const ratioH = resizeH / h;
        const ratioW = resizeW / w;
        
        return { processedImg: canvas, ratioH, ratioW };
    }

    imageToTensor(canvas, modelType = 'det') {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { data } = imageData;
        
        const preprocessing = this.modelConfig.preprocessing[modelType];
        const mean = preprocessing.mean;
        const std = preprocessing.std;
        
        // Convert to CHW format and normalize
        const channels = 3;
        const height = canvas.height;
        const width = canvas.width;
        const float32Data = new Float32Array(channels * height * width);
        
        for (let c = 0; c < channels; c++) {
            for (let h = 0; h < height; h++) {
                for (let w = 0; w < width; w++) {
                    const idx = (h * width + w) * 4 + c;
                    const value = data[idx] / 255.0;
                    float32Data[c * height * width + h * width + w] = (value - mean[c]) / std[c];
                }
            }
        }
        
        return new ort.Tensor('float32', float32Data, [1, channels, height, width]);
    }

    async postprocessDetection(output, ratioH, ratioW) {
        const data = output.data;
        const [batch, height, width] = output.dims;
        
        // Apply threshold to get binary map
        const binaryMap = new Uint8Array(height * width);
        for (let i = 0; i < height * width; i++) {
            binaryMap[i] = data[i] > this.detDbThresh ? 255 : 0;
        }
        
        // Find contours using OpenCV-like algorithm
        const contours = this.findContours(binaryMap, width, height);
        
        // Filter and process contours
        const boxes = [];
        for (const contour of contours) {
            if (contour.area < 5) continue;
            
            // Calculate box score
            const score = this.boxScoreFast(data, contour.points, width, height);
            if (score < this.detDbBoxThresh) continue;
            
            // Unclip box
            const box = this.unclip(contour.points, this.detDbUnclipRatio);
            if (!box || box.length < 4) continue;
            
            // Get minimum area rectangle
            const minBox = this.getMiniBoxes(box);
            if (this.calculateBoxArea(minBox) < 10) continue;
            
            // Scale back to original size
            const scaledBox = minBox.map(point => [
                Math.round(point[0] / ratioW),
                Math.round(point[1] / ratioH)
            ]);
            
            boxes.push(scaledBox);
        }
        
        return boxes;
    }

    findContours(binaryMap, width, height) {
        // Simplified contour detection
        const contours = [];
        const visited = new Uint8Array(width * height);
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                
                if (binaryMap[idx] === 255 && !visited[idx]) {
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
        const points = [];
        const stack = [[startX, startY]];
        let area = 0;
        
        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const idx = y * width + x;
            
            if (x < 0 || x >= width || y < 0 || y >= height || 
                visited[idx] || binaryMap[idx] !== 255) {
                continue;
            }
            
            visited[idx] = 1;
            points.push([x, y]);
            area++;
            
            // Add 8-connected neighbors
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx !== 0 || dy !== 0) {
                        stack.push([x + dx, y + dy]);
                    }
                }
            }
        }
        
        // Get convex hull of points
        const hull = this.convexHull(points);
        
        return { points: hull, area };
    }

    convexHull(points) {
        if (points.length < 3) return points;
        
        // Sort points
        points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        
        // Build lower hull
        const lower = [];
        for (const p of points) {
            while (lower.length >= 2 && 
                   this.cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
                lower.pop();
            }
            lower.push(p);
        }
        
        // Build upper hull
        const upper = [];
        for (let i = points.length - 1; i >= 0; i--) {
            const p = points[i];
            while (upper.length >= 2 && 
                   this.cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
                upper.pop();
            }
            upper.push(p);
        }
        
        // Remove last point of each half because it's repeated
        lower.pop();
        upper.pop();
        
        return lower.concat(upper);
    }

    cross(o, a, b) {
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    }

    boxScoreFast(predMap, box, width, height) {
        // Calculate average score within box
        const mask = this.createMask(box, width, height);
        let sum = 0;
        let count = 0;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (mask[y * width + x]) {
                    sum += predMap[y * width + x];
                    count++;
                }
            }
        }
        
        return count > 0 ? sum / count : 0;
    }

    createMask(box, width, height) {
        const mask = new Uint8Array(width * height);
        
        // Simple point-in-polygon test
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (this.pointInPolygon([x, y], box)) {
                    mask[y * width + x] = 1;
                }
            }
        }
        
        return mask;
    }

    pointInPolygon(point, polygon) {
        let inside = false;
        const x = point[0], y = point[1];
        
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            
            const intersect = ((yi > y) !== (yj > y)) &&
                            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        
        return inside;
    }

    unclip(box, unclipRatio) {
        // Expand box using polygon offset
        try {
            const area = this.calculatePolygonArea(box);
            const length = this.calculatePolygonPerimeter(box);
            const distance = area * unclipRatio / length;
            
            // Offset polygon
            const offsetBox = [];
            const n = box.length;
            
            for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                const k = (i - 1 + n) % n;
                
                const v1 = [box[j][0] - box[i][0], box[j][1] - box[i][1]];
                const v2 = [box[k][0] - box[i][0], box[k][1] - box[i][1]];
                
                const norm1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]);
                const norm2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);
                
                v1[0] /= norm1;
                v1[1] /= norm1;
                v2[0] /= norm2;
                v2[1] /= norm2;
                
                const bisector = [v1[0] + v2[0], v1[1] + v2[1]];
                const bisectorNorm = Math.sqrt(bisector[0] * bisector[0] + bisector[1] * bisector[1]);
                
                if (bisectorNorm > 0) {
                    bisector[0] /= bisectorNorm;
                    bisector[1] /= bisectorNorm;
                    
                    offsetBox.push([
                        box[i][0] + bisector[0] * distance,
                        box[i][1] + bisector[1] * distance
                    ]);
                } else {
                    offsetBox.push(box[i]);
                }
            }
            
            return offsetBox;
            
        } catch (e) {
            console.warn('Unclip failed:', e);
            return box;
        }
    }

    calculatePolygonArea(polygon) {
        let area = 0;
        const n = polygon.length;
        
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += polygon[i][0] * polygon[j][1];
            area -= polygon[j][0] * polygon[i][1];
        }
        
        return Math.abs(area) / 2;
    }

    calculatePolygonPerimeter(polygon) {
        let perimeter = 0;
        const n = polygon.length;
        
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const dx = polygon[j][0] - polygon[i][0];
            const dy = polygon[j][1] - polygon[i][1];
            perimeter += Math.sqrt(dx * dx + dy * dy);
        }
        
        return perimeter;
    }

    getMiniBoxes(contour) {
        // Get minimum area rectangle
        // Simplified version - just return the convex hull ordered clockwise
        const points = [...contour];
        
        // Find bounding box
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        for (const [x, y] of points) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
        
        // Return rectangle corners
        return [
            [minX, minY],
            [maxX, minY],
            [maxX, maxY],
            [minX, maxY]
        ];
    }

    calculateBoxArea(box) {
        // Calculate area of quadrilateral
        const [p1, p2, p3, p4] = box;
        
        // Using shoelace formula
        const area = Math.abs(
            (p1[0] * p2[1] - p2[0] * p1[1]) +
            (p2[0] * p3[1] - p3[0] * p2[1]) +
            (p3[0] * p4[1] - p4[0] * p3[1]) +
            (p4[0] * p1[1] - p1[0] * p4[1])
        ) / 2;
        
        return area;
    }

    sortedBoxes(boxes) {
        // Sort boxes from top to bottom, left to right
        return boxes.sort((a, b) => {
            const y1 = Math.min(...a.map(p => p[1]));
            const y2 = Math.min(...b.map(p => p[1]));
            
            if (Math.abs(y1 - y2) < 10) {
                // Same row, sort by x
                const x1 = Math.min(...a.map(p => p[0]));
                const x2 = Math.min(...b.map(p => p[0]));
                return x1 - x2;
            }
            
            return y1 - y2;
        });
    }

    getRotateCropImage(img, box) {
        // Extract region from image based on box coordinates
        const canvas = img.canvas || img;
        
        // Get bounding rectangle
        const xs = box.map(p => p[0]);
        const ys = box.map(p => p[1]);
        const minX = Math.max(0, Math.min(...xs));
        const maxX = Math.min(canvas.width, Math.max(...xs));
        const minY = Math.max(0, Math.min(...ys));
        const maxY = Math.min(canvas.height, Math.max(...ys));
        
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

    rotateImage(canvas, angle) {
        if (angle === 0) return canvas;
        
        const rotated = document.createElement('canvas');
        const ctx = rotated.getContext('2d');
        
        if (angle === 180) {
            rotated.width = canvas.width;
            rotated.height = canvas.height;
            ctx.translate(canvas.width, canvas.height);
            ctx.rotate(Math.PI);
        } else if (angle === 90) {
            rotated.width = canvas.height;
            rotated.height = canvas.width;
            ctx.translate(canvas.height, 0);
            ctx.rotate(Math.PI / 2);
        } else if (angle === 270) {
            rotated.width = canvas.height;
            rotated.height = canvas.width;
            ctx.translate(0, canvas.width);
            ctx.rotate(-Math.PI / 2);
        }
        
        ctx.drawImage(canvas, 0, 0);
        return rotated;
    }

    async textClassifier(imgList) {
        if (!this.clsSession) return imgList.map(() => ({ label: '0', confidence: 1 }));
        
        const results = [];
        const batchSize = 8; // Process in batches
        
        for (let i = 0; i < imgList.length; i += batchSize) {
            const batch = imgList.slice(i, i + batchSize);
            const batchResults = await this.classifyBatch(batch);
            results.push(...batchResults);
        }
        
        return results;
    }

    async classifyBatch(imgBatch) {
        const inputs = [];
        
        for (const img of imgBatch) {
            // Resize to 48x192 for classification
            const resized = this.resizeNormImg(img, [3, 48, 192]);
            inputs.push(resized);
        }
        
        // Stack inputs
        const batchSize = inputs.length;
        const [c, h, w] = [3, 48, 192];
        const batchData = new Float32Array(batchSize * c * h * w);
        
        for (let b = 0; b < batchSize; b++) {
            const offset = b * c * h * w;
            batchData.set(inputs[b], offset);
        }
        
        // Run inference
        const input = new ort.Tensor('float32', batchData, [batchSize, c, h, w]);
        const feeds = { x: input };
        const results = await this.clsSession.run(feeds);
        
        // Process outputs
        const outputName = this.clsSession.outputNames[0];
        const output = results[outputName];
        
        const batchResults = [];
        for (let b = 0; b < batchSize; b++) {
            const probs = output.data.slice(b * 2, (b + 1) * 2);
            const label = probs[1] > probs[0] ? '180' : '0';
            const confidence = Math.max(...probs);
            batchResults.push({ label, confidence });
        }
        
        return batchResults;
    }

    async textRecognizer(imgList) {
        const startTime = performance.now();
        const results = [];
        
        // Process in batches
        const batchSize = this.recBatchNum;
        
        for (let i = 0; i < imgList.length; i += batchSize) {
            const batch = imgList.slice(i, i + batchSize);
            const batchResults = await this.recognizeBatch(batch);
            results.push(...batchResults);
        }
        
        this.recordMetric('recognition', performance.now() - startTime);
        
        return results;
    }

    async recognizeBatch(imgBatch) {
        const inputs = [];
        const maxWhRatio = 320 / 48;
        
        for (const img of imgBatch) {
            const normalized = this.resizeNormImg(img, this.modelConfig.rec_image_shape, maxWhRatio);
            inputs.push(normalized);
        }
        
        // Prepare batch tensor
        const batchSize = inputs.length;
        const [c, h, w] = this.modelConfig.rec_image_shape;
        const maxWidth = w;
        
        const batchData = new Float32Array(batchSize * c * h * maxWidth);
        
        for (let b = 0; b < batchSize; b++) {
            const offset = b * c * h * maxWidth;
            batchData.set(inputs[b], offset);
        }
        
        // Run inference
        const input = new ort.Tensor('float32', batchData, [batchSize, c, h, maxWidth]);
        const feeds = { x: input };
        const results = await this.recSession.run(feeds);
        
        // Decode outputs
        const outputName = this.recSession.outputNames[0];
        const output = results[outputName];
        
        return this.decodeRecognitionBatch(output, batchSize);
    }

    resizeNormImg(img, shape, maxWhRatio = null) {
        const [imgC, imgH, imgW] = shape;
        const canvas = img.canvas || img;
        
        // Calculate resize dimensions
        const h = canvas.height;
        const w = canvas.width;
        const ratio = w / h;
        
        let resizeW;
        if (maxWhRatio && Math.ceil(imgH * ratio) > imgW) {
            resizeW = imgW;
        } else {
            resizeW = Math.min(imgW, Math.ceil(imgH * ratio));
        }
        
        // Resize image
        const resized = document.createElement('canvas');
        resized.width = resizeW;
        resized.height = imgH;
        const ctx = resized.getContext('2d');
        ctx.drawImage(canvas, 0, 0, resizeW, imgH);
        
        // Normalize and pad
        const imageData = ctx.getImageData(0, 0, resizeW, imgH);
        const data = imageData.data;
        
        const mean = this.modelConfig.preprocessing.rec.mean;
        const std = this.modelConfig.preprocessing.rec.std;
        
        const normalized = new Float32Array(imgC * imgH * imgW);
        
        // Convert to CHW and normalize
        for (let c = 0; c < imgC; c++) {
            for (let h = 0; h < imgH; h++) {
                for (let w = 0; w < resizeW; w++) {
                    const srcIdx = (h * resizeW + w) * 4 + c;
                    const dstIdx = c * imgH * imgW + h * imgW + w;
                    const value = data[srcIdx] / 255.0;
                    normalized[dstIdx] = (value - mean[c]) / std[c];
                }
                // Pad remaining width with zeros
                for (let w = resizeW; w < imgW; w++) {
                    const dstIdx = c * imgH * imgW + h * imgW + w;
                    normalized[dstIdx] = (0 - mean[c]) / std[c];
                }
            }
        }
        
        return normalized;
    }

    decodeRecognitionBatch(output, batchSize) {
        const results = [];
        const [batch, timesteps, vocabSize] = output.dims;
        const data = output.data;
        
        for (let b = 0; b < batchSize; b++) {
            const offset = b * timesteps * vocabSize;
            const probs = data.slice(offset, offset + timesteps * vocabSize);
            
            // CTC decoding
            const decoded = [];
            let lastIdx = -1;
            let confidence = 0;
            let charCount = 0;
            
            for (let t = 0; t < timesteps; t++) {
                let maxIdx = 0;
                let maxProb = probs[t * vocabSize];
                
                for (let v = 1; v < vocabSize; v++) {
                    const prob = probs[t * vocabSize + v];
                    if (prob > maxProb) {
                        maxProb = prob;
                        maxIdx = v;
                    }
                }
                
                // CTC blank is at index 0
                if (maxIdx !== 0 && maxIdx !== lastIdx) {
                    if (maxIdx < this.dictionary.length) {
                        decoded.push(this.dictionary[maxIdx]);
                        confidence += maxProb;
                        charCount++;
                    }
                }
                
                lastIdx = maxIdx;
            }
            
            const text = decoded.join('');
            const avgConfidence = charCount > 0 ? confidence / charCount : 0;
            
            results.push([text, avgConfidence]);
        }
        
        return results;
    }

    formatResults(ocrResults) {
        // Convert to our standard format
        const formatted = [];
        
        for (const result of ocrResults) {
            formatted.push({
                text: result.text,
                confidence: result.confidence,
                box: result.box
            });
        }
        
        return formatted;
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

    async imageToCv(image) {
        // Convert image to canvas for cv2-like operations
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        
        return { canvas, width: image.width, height: image.height };
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

    // Model switching
    setModel(modelName) {
        if (MODEL_CONFIGS[modelName] && modelName !== this.modelName) {
            this.modelName = modelName;
            this.initialized = false;
            console.log(`Switched to ${modelName} model. Re-initialization required.`);
        }
    }
}

// Export singleton instance
export const ppOCRv5Engine = new PPOCRv5EnhancedEngine();