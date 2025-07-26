import { getOpenCv } from './opencv-wrapper.js';
import { ResourceManager, safeExecute, MatPool } from './resource-manager.js';

/**
 * Complete PPU-Paddle-OCR processor implementation with all processing methods
 * Based on https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr
 */
export class PPUCompleteProcessor {
    constructor() {
        this.detModel = null;
        this.recModel = null;
        this.clsModel = null;
        this.cv = null;
        this.isInitialized = false;
        this.currentConfig = null;
        this.matPool = null;
        
        // Default options from PPU
        this.detectionOptions = {
            maxSideLength: 960,
            mean: [0.485, 0.456, 0.406],
            stdDeviation: [0.229, 0.224, 0.225],
            threshold: 0.3,
            boxThreshold: 0.6,
            unclipRatio: 1.5,
            minimumAreaThreshold: 20,
            paddingVertical: 0.4,
            paddingHorizontal: 0.6,
            autoDeskew: false,
            useDilation: false,
            scoreMode: 'fast'
        };
        
        this.recognitionOptions = {
            imageHeight: 48,
            imageWidth: 320,
            charactersDictionary: this.getDefaultCharset(),
            blankIndex: 0,
            minCropWidth: 8
        };
        
        this.debugging = {
            verbose: false,
            debug: false,
            debugFolder: './debug'
        };
    }

    async initialize(modelConfig, modelData) {
        try {
            // Ensure OpenCV is ready
            const cv = await getOpenCv();
            this.cv = cv;
            
            // Initialize Mat pool
            this.matPool = new MatPool(cv, { maxSize: 30 });
            
            // Initialize ONNX Runtime with WebGL backend for mobile performance
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/';
            
            const sessionOptions = {
                executionProviders: ['webgl', 'wasm'],
                graphOptimizationLevel: 'all'
            };
            
            // Load models
            if (modelData.det) {
                this.detModel = await ort.InferenceSession.create(
                    modelData.det.data, 
                    sessionOptions
                );
                this.log('Detection model loaded');
            }
            
            if (modelData.rec) {
                this.recModel = await ort.InferenceSession.create(
                    modelData.rec.data,
                    sessionOptions
                );
                this.log('Recognition model loaded');
            }
            
            if (modelData.cls) {
                this.clsModel = await ort.InferenceSession.create(
                    modelData.cls.data,
                    sessionOptions
                );
                this.log('Classification model loaded');
            }
            
            this.currentConfig = modelConfig;
            this.isInitialized = true;
            
            console.log('PPU Complete Processor initialized');
        } catch (error) {
            console.error('Failed to initialize PPU processor:', error);
            throw error;
        }
    }

    /**
     * Main processing pipeline matching PPU workflow
     * original image --> predict --> draw --> crop --> result
     */
    async processImage(imageData) {
        if (!this.isInitialized) {
            throw new Error('PPU processor not initialized');
        }

        return safeExecute(async (rm) => {
            const cv = this.cv;
            const mat = rm.registerMat(cv.matFromImageData(imageData));
            
            // Step 1: Auto-deskew if enabled
            let processedMat = mat;
            if (this.detectionOptions.autoDeskew) {
                processedMat = await this.deskewImage(mat, rm);
                if (processedMat !== mat) {
                    rm.registerMat(processedMat);
                }
            }
            
            // Step 2: Text Detection
            const detectionResult = await this.detectText(processedMat, rm);
            
            // Step 3: Sort boxes in reading order
            const sortedBoxes = this.sortBoxes(detectionResult.boxes);
            
            // Step 4: Crop text regions
            const croppedRegions = await this.cropTextRegions(processedMat, sortedBoxes, rm);
            
            // Step 5: Angle classification (if available)
            let classifiedRegions = croppedRegions;
            if (this.clsModel) {
                classifiedRegions = await this.classifyAngles(croppedRegions, rm);
            }
            
            // Step 6: Text Recognition
            const recognitionResults = await this.recognizeText(classifiedRegions, rm);
            
            // Step 7: Filter results by confidence
            const filteredResults = this.filterResults(recognitionResults, sortedBoxes);
            
            return {
                boxes: filteredResults.boxes,
                texts: filteredResults.texts,
                timestamp: Date.now(),
                processingTime: detectionResult.inferenceTime + 
                    recognitionResults.reduce((sum, r) => sum + (r.inferenceTime || 0), 0)
            };
        }, (error) => {
            console.error('Error processing image:', error);
            throw error;
        });
    }

    /**
     * Deskew image using text detection
     */
    async deskewImage(mat, rm) {
        this.log('Starting deskew process');
        
        // Run lightweight detection pass
        const input = await this.preprocessDetection(mat, rm);
        const detection = await this.runDetectionInference(input.tensor, input.width, input.height);
        
        if (!detection) {
            this.log('Skew calculation failed: no detection output');
            return mat;
        }
        
        // Calculate skew angle from detection probability map
        const angle = await this.calculateSkewAngle(detection, input.width, input.height, rm);
        
        if (Math.abs(angle) < 0.5) {
            this.log('Skew angle too small, skipping rotation');
            return mat;
        }
        
        this.log(`Rotating image by ${-angle.toFixed(2)}°`);
        
        // Rotate image
        const cv = this.cv;
        const center = new cv.Point(mat.cols / 2, mat.rows / 2);
        const M = rm.registerMat(cv.getRotationMatrix2D(center, -angle, 1));
        const rotated = rm.registerMat(new cv.Mat());
        cv.warpAffine(mat, rotated, M, new cv.Size(mat.cols, mat.rows));
        
        return rotated;
    }

    /**
     * Calculate skew angle from detection probability map
     */
    async calculateSkewAngle(detection, width, height, rm) {
        const cv = this.cv;
        
        // Convert detection tensor to binary map
        const binaryMap = rm.registerMat(new cv.Mat(height, width, cv.CV_8U));
        const threshold = 0.5;
        
        for (let i = 0; i < height * width; i++) {
            binaryMap.data[i] = detection[i] > threshold ? 255 : 0;
        }
        
        // Find contours
        const contours = rm.register(new cv.MatVector(), () => contours.delete());
        const hierarchy = rm.registerMat(new cv.Mat());
        cv.findContours(binaryMap, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        
        let totalAngle = 0;
        let angleCount = 0;
        
        // Calculate angle for each contour
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            
            if (cv.contourArea(contour) < 100) continue;
            
            // Fit minimum area rectangle
            const rect = cv.minAreaRect(contour);
            let angle = rect.angle;
            
            // Normalize angle
            if (rect.size.width < rect.size.height) {
                angle = angle - 90;
            }
            
            // Only consider small angles
            if (Math.abs(angle) < 30) {
                totalAngle += angle;
                angleCount++;
            }
        }
        
        // Return average angle
        return angleCount > 0 ? totalAngle / angleCount : 0;
    }

    /**
     * Detect text regions in image
     */
    async detectText(mat, rm) {
        const input = await this.preprocessDetection(mat, rm);
        
        const startTime = performance.now();
        const detection = await this.runDetectionInference(input.tensor, input.width, input.height);
        const inferenceTime = performance.now() - startTime;
        
        if (!detection) {
            return { boxes: [], inferenceTime };
        }
        
        const boxes = await this.postprocessDetection(detection, input, rm);
        
        this.log(`Detected ${boxes.length} text regions in ${inferenceTime.toFixed(0)}ms`);
        
        return { boxes, inferenceTime };
    }

    /**
     * Preprocess image for detection model
     */
    async preprocessDetection(mat, rm) {
        const cv = this.cv;
        const { maxSideLength, mean, stdDeviation } = this.detectionOptions;
        
        // Calculate resize dimensions
        const [h, w] = [mat.rows, mat.cols];
        let resizeW = w;
        let resizeH = h;
        let ratio = 1.0;
        
        if (Math.max(h, w) > maxSideLength) {
            ratio = maxSideLength / Math.max(h, w);
            resizeW = Math.round(w * ratio);
            resizeH = Math.round(h * ratio);
        }
        
        // Resize image
        const resized = rm.registerMat(await this.matPool.acquire());
        cv.resize(mat, resized, new cv.Size(resizeW, resizeH));
        
        // Pad to multiple of 32
        const targetW = Math.ceil(resizeW / 32) * 32;
        const targetH = Math.ceil(resizeH / 32) * 32;
        
        const padded = rm.registerMat(await this.matPool.acquire());
        cv.copyMakeBorder(resized, padded, 0, targetH - resizeH, 0, targetW - resizeW,
            cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));
        
        // Convert to RGB and normalize
        const rgb = rm.registerMat(await this.matPool.acquire());
        cv.cvtColor(padded, rgb, cv.COLOR_RGBA2RGB);
        
        // Create tensor with bounds checking
        const tensor = new Float32Array(3 * targetH * targetW);
        const data = rgb.data;
        const dataLength = data.length;
        
        for (let h = 0; h < targetH; h++) {
            for (let w = 0; w < targetW; w++) {
                const idx = (h * targetW + w) * 3;
                if (idx + 2 < dataLength) {
                    for (let c = 0; c < 3; c++) {
                        const value = data[idx + c] / 255.0;
                        const normalized = (value - mean[c]) / stdDeviation[c];
                        tensor[c * targetH * targetW + h * targetW + w] = normalized;
                    }
                }
            }
        }
        
        return {
            tensor,
            width: targetW,
            height: targetH,
            resizeRatio: ratio,
            originalWidth: w,
            originalHeight: h
        };
    }

    /**
     * Run detection model inference
     */
    async runDetectionInference(tensor, width, height) {
        if (!this.detModel) {
            throw new Error('Detection model not loaded');
        }
        
        try {
            const inputTensor = new ort.Tensor('float32', tensor, [1, 3, height, width]);
            const feeds = { x: inputTensor };
            const results = await this.detModel.run(feeds);
            
            const outputName = this.detModel.outputNames[0];
            const outputTensor = results[outputName];
            
            return outputTensor ? outputTensor.data : null;
        } catch (error) {
            console.error('Detection inference error:', error);
            return null;
        }
    }

    /**
     * Postprocess detection results
     */
    async postprocessDetection(detection, input, rm) {
        const cv = this.cv;
        const { width, height, resizeRatio, originalWidth, originalHeight } = input;
        const { threshold, boxThreshold, unclipRatio, minimumAreaThreshold,
                paddingVertical, paddingHorizontal, useDilation } = this.detectionOptions;
        
        // Convert to probability map
        const probMap = rm.registerMat(await this.matPool.acquire(height, width, cv.CV_32F));
        for (let i = 0; i < height * width; i++) {
            probMap.data32F[i] = detection[i];
        }
        
        // Threshold
        const binaryMap = rm.registerMat(await this.matPool.acquire());
        cv.threshold(probMap, binaryMap, threshold, 1, cv.THRESH_BINARY);
        
        // Optional dilation
        if (useDilation) {
            const kernel = rm.registerMat(cv.Mat.ones(2, 2, cv.CV_8U));
            cv.dilate(binaryMap, binaryMap, kernel);
        }
        
        // Convert to 8-bit for contour detection
        const binaryMap8 = rm.registerMat(await this.matPool.acquire());
        binaryMap.convertTo(binaryMap8, cv.CV_8U, 255);
        
        // Find contours
        const contours = rm.register(new cv.MatVector(), () => contours.delete());
        const hierarchy = rm.registerMat(new cv.Mat());
        cv.findContours(binaryMap8, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        
        const boxes = [];
        
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            
            // Get bounding box
            const rect = cv.boundingRect(contour);
            
            // Filter by area
            if (rect.width * rect.height < minimumAreaThreshold) {
                continue;
            }
            
            // Calculate score with temporary mask
            const mask = rm.registerMat(await this.matPool.acquireZeros(height, width, cv.CV_8U));
            cv.drawContours(mask, contours, i, new cv.Scalar(255), -1);
            
            let score = 0;
            let count = 0;
            for (let y = rect.y; y < rect.y + rect.height && y < height; y++) {
                for (let x = rect.x; x < rect.x + rect.width && x < width; x++) {
                    const idx = y * width + x;
                    if (idx < mask.data.length && mask.data[idx] > 0) {
                        score += probMap.data32F[idx];
                        count++;
                    }
                }
            }
            score = count > 0 ? score / count : 0;
            
            if (score < boxThreshold) {
                continue;
            }
            
            // Apply padding with bounds checking
            const vPad = Math.round(rect.height * paddingVertical);
            const hPad = Math.round(rect.height * paddingHorizontal);
            
            let x = Math.max(0, rect.x - hPad);
            let y = Math.max(0, rect.y - vPad);
            let w = Math.min(width - x, rect.width + 2 * hPad);
            let h = Math.min(height - y, rect.height + 2 * vPad);
            
            // Convert back to original coordinates
            x = Math.round(x / resizeRatio);
            y = Math.round(y / resizeRatio);
            w = Math.round(w / resizeRatio);
            h = Math.round(h / resizeRatio);
            
            // Ensure within image bounds
            x = Math.max(0, Math.min(x, originalWidth - 1));
            y = Math.max(0, Math.min(y, originalHeight - 1));
            w = Math.min(w, originalWidth - x);
            h = Math.min(h, originalHeight - y);
            
            if (w > 5 && h > 5) {
                boxes.push({
                    x, y, width: w, height: h, score
                });
            }
        }
        
        return boxes;
    }

    /**
     * Sort boxes in reading order (top to bottom, left to right)
     */
    sortBoxes(boxes) {
        return [...boxes].sort((a, b) => {
            // If boxes are on same line (within 1/4 of combined height)
            if (Math.abs(a.y - b.y) < (a.height + b.height) / 4) {
                return a.x - b.x; // Sort left to right
            }
            return a.y - b.y; // Sort top to bottom
        });
    }

    /**
     * Crop text regions from image
     */
    cropTextRegions(mat, boxes) {
        const cv = this.cv;
        const regions = [];
        
        for (const box of boxes) {
            try {
                // Add small padding
                const padding = 5;
                const x = Math.max(0, box.x - padding);
                const y = Math.max(0, box.y - padding);
                const width = Math.min(mat.cols - x, box.width + 2 * padding);
                const height = Math.min(mat.rows - y, box.height + 2 * padding);
                
                const rect = new cv.Rect(x, y, width, height);
                const roi = mat.roi(rect);
                const cropped = new cv.Mat();
                roi.copyTo(cropped);
                
                regions.push({
                    mat: cropped,
                    box: box,
                    rect: { x, y, width, height }
                });
            } catch (error) {
                console.error('Error cropping region:', error);
            }
        }
        
        return regions;
    }

    /**
     * Classify text angles
     */
    async classifyAngles(regions) {
        if (!this.clsModel) {
            return regions;
        }
        
        const cv = this.cv;
        const classifiedRegions = [];
        
        for (const region of regions) {
            const angle = await this.classifyAngle(region.mat);
            
            if (angle === 180) {
                // Rotate 180 degrees
                const rotated = new cv.Mat();
                const center = new cv.Point(region.mat.cols / 2, region.mat.rows / 2);
                const M = cv.getRotationMatrix2D(center, 180, 1);
                cv.warpAffine(region.mat, rotated, M, 
                    new cv.Size(region.mat.cols, region.mat.rows));
                
                region.mat.delete();
                region.mat = rotated;
                M.delete();
            }
            
            classifiedRegions.push(region);
        }
        
        return classifiedRegions;
    }

    /**
     * Classify angle for single region
     */
    async classifyAngle(mat) {
        const cv = this.cv;
        
        // Resize to model input size (usually 48x192)
        const targetH = 48;
        const targetW = 192;
        const resized = new cv.Mat();
        cv.resize(mat, resized, new cv.Size(targetW, targetH));
        
        // Convert to RGB and normalize
        const rgb = new cv.Mat();
        cv.cvtColor(resized, rgb, cv.COLOR_RGBA2RGB);
        
        const data = new Float32Array(3 * targetH * targetW);
        for (let h = 0; h < targetH; h++) {
            for (let w = 0; w < targetW; w++) {
                const idx = (h * targetW + w) * 3;
                for (let c = 0; c < 3; c++) {
                    const value = rgb.data[idx + c] / 255.0;
                    const normalized = (value - 0.5) / 0.5;
                    data[c * targetH * targetW + h * targetW + w] = normalized;
                }
            }
        }
        
        // Run inference
        const tensor = new ort.Tensor('float32', data, [1, 3, targetH, targetW]);
        const feeds = { x: tensor };
        const results = await this.clsModel.run(feeds);
        
        const output = results[this.clsModel.outputNames[0]];
        const probs = output.data;
        
        // Clean up
        resized.delete();
        rgb.delete();
        
        // Return angle class (0 or 180)
        return probs[0] > probs[1] ? 0 : 180;
    }

    /**
     * Recognize text in regions
     */
    async recognizeText(regions) {
        const results = [];
        
        // Process in batches for efficiency
        const batchSize = 4;
        for (let i = 0; i < regions.length; i += batchSize) {
            const batch = regions.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(region => this.recognizeSingleRegion(region))
            );
            results.push(...batchResults);
        }
        
        return results;
    }

    /**
     * Recognize text in single region
     */
    async recognizeSingleRegion(region) {
        const cv = this.cv;
        const { imageHeight, imageWidth, charactersDictionary } = this.recognitionOptions;
        
        // Calculate resize dimensions maintaining aspect ratio
        const aspectRatio = region.mat.cols / region.mat.rows;
        const targetHeight = imageHeight;
        let targetWidth = Math.round(targetHeight * aspectRatio);
        targetWidth = Math.max(this.recognitionOptions.minCropWidth, 
                              Math.min(targetWidth, imageWidth));
        
        // Resize
        const resized = new cv.Mat();
        cv.resize(region.mat, resized, new cv.Size(targetWidth, targetHeight));
        
        // Convert to grayscale
        const gray = new cv.Mat();
        cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY);
        
        // Pad to fixed width
        const padded = new cv.Mat();
        if (targetWidth < imageWidth) {
            cv.copyMakeBorder(gray, padded, 0, 0, 0, imageWidth - targetWidth,
                cv.BORDER_CONSTANT, new cv.Scalar(0));
        } else {
            gray.copyTo(padded);
        }
        
        // Normalize
        const tensor = new Float32Array(3 * targetHeight * imageWidth);
        for (let h = 0; h < targetHeight; h++) {
            for (let w = 0; w < imageWidth; w++) {
                const value = padded.data[h * imageWidth + w] / 255.0;
                const normalized = (value - 0.5) / 0.5;
                
                // Fill all 3 channels with same value
                for (let c = 0; c < 3; c++) {
                    tensor[c * targetHeight * imageWidth + h * imageWidth + w] = normalized;
                }
            }
        }
        
        // Run inference
        const startTime = performance.now();
        const inputTensor = new ort.Tensor('float32', tensor, 
            [1, 3, targetHeight, imageWidth]);
        const feeds = { x: inputTensor };
        const results = await this.recModel.run(feeds);
        const inferenceTime = performance.now() - startTime;
        
        // Decode text
        const output = results[this.recModel.outputNames[0]];
        const decoded = this.ctcGreedyDecode(output.data, output.dims, charactersDictionary);
        
        // Clean up
        resized.delete();
        gray.delete();
        padded.delete();
        
        return {
            text: decoded.text,
            confidence: decoded.confidence,
            box: region.box,
            inferenceTime
        };
    }

    /**
     * CTC greedy decode
     */
    ctcGreedyDecode(logits, dims, charDict) {
        const [batch, seqLen, numClasses] = dims;
        
        let text = '';
        let lastIdx = -1;
        const confidences = [];
        
        for (let t = 0; t < seqLen; t++) {
            let maxIdx = 0;
            let maxProb = logits[t * numClasses];
            
            for (let c = 1; c < numClasses; c++) {
                if (logits[t * numClasses + c] > maxProb) {
                    maxProb = logits[t * numClasses + c];
                    maxIdx = c;
                }
            }
            
            // Skip blank and repeated indices
            if (maxIdx !== this.recognitionOptions.blankIndex && 
                maxIdx !== lastIdx && 
                maxIdx < charDict.length) {
                text += charDict[maxIdx];
                confidences.push(maxProb);
            }
            
            lastIdx = maxIdx;
        }
        
        const confidence = confidences.length > 0 ?
            confidences.reduce((a, b) => a + b) / confidences.length : 0;
        
        return { text: text.trim(), confidence };
    }

    /**
     * Filter results by confidence threshold
     */
    filterResults(recognitionResults, boxes) {
        const dropScore = 0.5; // Default confidence threshold
        const filteredBoxes = [];
        const filteredTexts = [];
        
        recognitionResults.forEach((result, index) => {
            if (result.confidence >= dropScore) {
                filteredBoxes.push(boxes[index]);
                filteredTexts.push({
                    text: result.text,
                    confidence: result.confidence,
                    box: boxes[index]
                });
            }
        });
        
        return { boxes: filteredBoxes, texts: filteredTexts };
    }

    /**
     * Visualize results on canvas
     */
    visualizeResults(canvas, results) {
        const ctx = canvas.getContext('2d');
        
        results.texts.forEach((item, index) => {
            const box = item.box;
            
            // Draw rectangle
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.strokeRect(box.x, box.y, box.width, box.height);
            
            // Draw text label
            const text = `${item.text} (${(item.confidence * 100).toFixed(0)}%)`;
            ctx.font = '14px Arial';
            const metrics = ctx.measureText(text);
            
            // Background for text
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(box.x, box.y - 20, metrics.width + 10, 20);
            
            // Text
            ctx.fillStyle = '#ffffff';
            ctx.fillText(text, box.x + 5, box.y - 5);
            
            // Box number
            ctx.fillStyle = '#ffff00';
            ctx.font = '12px Arial';
            ctx.fillText(`#${index + 1}`, box.x + box.width - 20, box.y + box.height - 5);
        });
    }

    /**
     * Get default character set
     */
    getDefaultCharset() {
        // PPU default English character set
        const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~ ';
        return chars.split('');
    }

    /**
     * Log message if verbose mode enabled
     */
    log(message) {
        if (this.debugging.verbose) {
            console.log(`[PPUCompleteProcessor] ${message}`);
        }
    }

    /**
     * Dispose resources
     */
    dispose() {
        if (this.detModel) {
            this.detModel.release();
            this.detModel = null;
        }
        if (this.recModel) {
            this.recModel.release();
            this.recModel = null;
        }
        if (this.clsModel) {
            this.clsModel.release();
            this.clsModel = null;
        }
        this.isInitialized = false;
        this.currentConfig = null;
    }
}