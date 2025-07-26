// ONNX Runtime is loaded globally via script tag
const ort = window.ort;
import { getOpenCv } from './opencv-wrapper.js';

export class PPUPaddleProcessor {
    constructor() {
        this.detModel = null;
        this.recModel = null;
        this.isInitialized = false;
        this.currentConfig = null;
    }

    async initialize(modelConfig, modelData) {
        // Ensure OpenCV is ready
        const cv = await getOpenCv();
        this.cv = cv;
        try {
            // Initialize ONNX Runtime with WebGL backend for mobile performance
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/';
            
            // Try WebGL first for better mobile performance
            const sessionOptions = {
                executionProviders: ['webgl', 'wasm'],
                graphOptimizationLevel: 'all'
            };
            
            // Load detection model
            if (modelData.det) {
                this.detModel = await ort.InferenceSession.create(
                    modelData.det.data, 
                    sessionOptions
                );
            }
            
            // Load recognition model
            if (modelData.rec) {
                this.recModel = await ort.InferenceSession.create(
                    modelData.rec.data,
                    sessionOptions
                );
            }
            
            this.currentConfig = modelConfig;
            this.isInitialized = true;
            
            console.log('PPU Paddle initialized with config:', modelConfig.name);
        } catch (error) {
            console.error('Failed to initialize PPU Paddle:', error);
            throw error;
        }
    }

    async processImage(imageData) {
        if (!this.isInitialized) {
            throw new Error('PPU Paddle not initialized');
        }

        try {
            // PPU workflow: original image --> predict --> draw --> crop --> result
            
            // Convert image to OpenCV Mat
            const cv = this.cv;
            const mat = cv.matFromImageData(imageData);
            
            // Step 1: Predict (detect text regions)
            const predictions = await this.predict(mat);
            
            // Step 2: Draw (visualize predictions - optional)
            const visualized = this.drawPredictions(mat, predictions);
            
            // Step 3: Crop (extract text regions)
            const croppedRegions = this.cropRegions(mat, predictions.boxes);
            
            // Step 4: Result (recognize text from cropped regions)
            const results = await this.recognizeRegions(croppedRegions);
            
            // Combine all results
            const finalResult = {
                boxes: predictions.boxes,
                texts: results,
                visualized: visualized,
                timestamp: Date.now()
            };
            
            // Clean up
            mat.delete();
            croppedRegions.forEach(region => region.mat.delete());
            
            return finalResult;
        } catch (error) {
            console.error('Error processing image:', error);
            throw error;
        }
    }

    async predict(mat) {
        if (!this.detModel) {
            throw new Error('Detection model not loaded');
        }

        const config = this.currentConfig.det;
        
        // Preprocess image for mobile-optimized detection
        const preprocessed = this.preprocessForMobile(mat, config);
        
        // Create tensor
        const tensor = new ort.Tensor('float32', preprocessed.data, preprocessed.shape);
        
        // Run inference
        const feeds = { [config.inputName]: tensor };
        const startTime = performance.now();
        const results = await this.detModel.run(feeds);
        const inferenceTime = performance.now() - startTime;
        
        console.log(`Detection inference time: ${inferenceTime.toFixed(2)}ms`);
        
        // Post-process to get boxes
        const boxes = this.postprocessMobileDetection(
            results[config.outputName], 
            mat.cols, 
            mat.rows,
            preprocessed.scale
        );
        
        preprocessed.mat.delete();
        
        return { boxes, inferenceTime };
    }

    preprocessForMobile(mat, config) {
        const cv = this.cv;
        // Mobile-optimized preprocessing
        const maxSize = 960; // Limit size for mobile
        const [h, w] = [mat.rows, mat.cols];
        
        // Calculate scale to fit mobile constraints
        let scale = 1;
        if (Math.max(h, w) > maxSize) {
            scale = maxSize / Math.max(h, w);
        }
        
        const newH = Math.round(h * scale);
        const newW = Math.round(w * scale);
        
        // Ensure dimensions are divisible by 32 (mobile model requirement)
        const targetH = Math.ceil(newH / 32) * 32;
        const targetW = Math.ceil(newW / 32) * 32;
        
        // Resize image
        const resized = new cv.Mat();
        cv.resize(mat, resized, new cv.Size(targetW, targetH));
        
        // Convert to RGB
        const rgb = new cv.Mat();
        cv.cvtColor(resized, rgb, cv.COLOR_RGBA2RGB);
        
        // Normalize for mobile model
        const normalized = new cv.Mat();
        rgb.convertTo(normalized, cv.CV_32F, 1/255.0);
        
        // Mobile models typically use simpler normalization
        const mean = [0.485, 0.456, 0.406];
        const std = [0.229, 0.224, 0.225];
        
        // Apply normalization channel by channel
        const channels = new cv.MatVector();
        cv.split(normalized, channels);
        
        for (let i = 0; i < 3; i++) {
            const channel = channels.get(i);
            cv.subtract(channel, new cv.Scalar(mean[i]), channel);
            cv.divide(channel, new cv.Scalar(std[i]), channel);
        }
        
        cv.merge(channels, normalized);
        
        // Convert to CHW format
        const data = new Float32Array(3 * targetH * targetW);
        for (let c = 0; c < 3; c++) {
            const channelData = channels.get(c).data32F;
            data.set(channelData, c * targetH * targetW);
        }
        
        // Clean up
        resized.delete();
        rgb.delete();
        normalized.delete();
        channels.delete();
        
        return {
            data,
            shape: [1, 3, targetH, targetW],
            scale: { x: w / targetW, y: h / targetH },
            mat: resized
        };
    }

    postprocessMobileDetection(output, origWidth, origHeight, scale) {
        const cv = this.cv;
        // Mobile-optimized postprocessing
        const data = output.data;
        const [batch, height, width] = output.dims;
        
        const boxes = [];
        const threshold = 0.5; // Higher threshold for mobile to reduce false positives
        const minArea = 10; // Minimum area to filter noise
        
        // Create binary map
        const binaryMap = new cv.Mat(height, width, cv.CV_8U);
        for (let i = 0; i < height * width; i++) {
            binaryMap.data[i] = data[i] > threshold ? 255 : 0;
        }
        
        // Dilate to connect nearby regions (mobile optimization)
        const kernel = cv.Mat.ones(2, 2, cv.CV_8U);
        cv.dilate(binaryMap, binaryMap, kernel);
        
        // Find contours
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(binaryMap, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        
        // Process contours
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);
            
            if (area < minArea) continue;
            
            // Get rotated rectangle for better text region fitting
            const rect = cv.minAreaRect(contour);
            const box = cv.boxPoints(rect);
            
            // Scale box coordinates back to original image size
            const scaledBox = [];
            for (let j = 0; j < 4; j++) {
                scaledBox.push({
                    x: box.data32F[j * 2] * scale.x,
                    y: box.data32F[j * 2 + 1] * scale.y
                });
            }
            
            // Sort points to ensure consistent order
            const sortedBox = this.sortBoxPoints(scaledBox);
            boxes.push(sortedBox);
        }
        
        // Clean up
        binaryMap.delete();
        kernel.delete();
        contours.delete();
        hierarchy.delete();
        
        return boxes;
    }

    sortBoxPoints(points) {
        // Sort points in clockwise order starting from top-left
        const center = points.reduce((acc, p) => ({
            x: acc.x + p.x / 4,
            y: acc.y + p.y / 4
        }), { x: 0, y: 0 });
        
        return points.sort((a, b) => {
            const angleA = Math.atan2(a.y - center.y, a.x - center.x);
            const angleB = Math.atan2(b.y - center.y, b.x - center.x);
            return angleA - angleB;
        });
    }

    drawPredictions(mat, predictions) {
        const cv = this.cv;
        // Create a copy for visualization
        const visualized = new cv.Mat();
        mat.copyTo(visualized);
        
        // Draw boxes on the copy
        predictions.boxes.forEach((box, index) => {
            // Convert to integer points
            const points = box.map(p => new cv.Point(Math.round(p.x), Math.round(p.y)));
            
            // Draw polygon
            const contour = cv.matFromArray(4, 1, cv.CV_32SC2, 
                points.flatMap(p => [p.x, p.y]));
            const contours = new cv.MatVector();
            contours.push_back(contour);
            
            // Green color for detected regions
            cv.drawContours(visualized, contours, 0, new cv.Scalar(0, 255, 0, 255), 2);
            
            // Add index label
            cv.putText(visualized, `${index}`, points[0], 
                cv.FONT_HERSHEY_SIMPLEX, 0.5, new cv.Scalar(255, 0, 0, 255), 1);
            
            contour.delete();
            contours.delete();
        });
        
        return visualized;
    }

    cropRegions(mat, boxes) {
        const cv = this.cv;
        const regions = [];
        
        for (const box of boxes) {
            try {
                // Get bounding rectangle
                const points = box.map(p => new cv.Point(Math.round(p.x), Math.round(p.y)));
                const contour = cv.matFromArray(4, 1, cv.CV_32SC2, 
                    points.flatMap(p => [p.x, p.y]));
                const rect = cv.boundingRect(contour);
                
                // Add padding for better recognition
                const padding = 5;
                rect.x = Math.max(0, rect.x - padding);
                rect.y = Math.max(0, rect.y - padding);
                rect.width = Math.min(mat.cols - rect.x, rect.width + 2 * padding);
                rect.height = Math.min(mat.rows - rect.y, rect.height + 2 * padding);
                
                // Crop region
                const roi = mat.roi(rect);
                const cropped = new cv.Mat();
                roi.copyTo(cropped);
                
                regions.push({
                    mat: cropped,
                    box: box,
                    rect: rect
                });
                
                contour.delete();
            } catch (error) {
                console.error('Error cropping region:', error);
            }
        }
        
        return regions;
    }

    async recognizeRegions(regions) {
        if (!this.recModel) {
            throw new Error('Recognition model not loaded');
        }
        
        const results = [];
        const batchSize = 4; // Process in batches for mobile efficiency
        
        for (let i = 0; i < regions.length; i += batchSize) {
            const batch = regions.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(region => this.recognizeText(region))
            );
            results.push(...batchResults);
        }
        
        return results;
    }

    async recognizeText(region) {
        const config = this.currentConfig.rec;
        
        // Preprocess for recognition
        const preprocessed = this.preprocessForRecognition(region.mat, config);
        
        // Create tensor
        const tensor = new ort.Tensor('float32', preprocessed.data, preprocessed.shape);
        
        // Run inference
        const feeds = { [config.inputName]: tensor };
        const startTime = performance.now();
        const results = await this.recModel.run(feeds);
        const inferenceTime = performance.now() - startTime;
        
        // Decode text
        const decoded = this.decodeText(results[config.outputName]);
        
        return {
            text: decoded.text,
            confidence: decoded.confidence,
            box: region.box,
            inferenceTime
        };
    }

    preprocessForRecognition(mat, config) {
        const cv = this.cv;
        // Mobile-optimized preprocessing for recognition
        const targetHeight = 48; // Fixed height for mobile models
        const maxWidth = 320; // Maximum width for mobile
        
        // Calculate dimensions
        const scale = targetHeight / mat.rows;
        let targetWidth = Math.round(mat.cols * scale);
        targetWidth = Math.min(targetWidth, maxWidth);
        
        // Resize
        const resized = new cv.Mat();
        cv.resize(mat, resized, new cv.Size(targetWidth, targetHeight));
        
        // Convert to grayscale
        const gray = new cv.Mat();
        cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY);
        
        // Pad to fixed width
        const padded = new cv.Mat();
        if (targetWidth < maxWidth) {
            const padRight = maxWidth - targetWidth;
            cv.copyMakeBorder(gray, padded, 0, 0, 0, padRight, 
                cv.BORDER_CONSTANT, new cv.Scalar(0));
        } else {
            gray.copyTo(padded);
        }
        
        // Normalize
        const normalized = new cv.Mat();
        padded.convertTo(normalized, cv.CV_32F, 1/127.5, -1);
        
        // Create tensor data
        const data = new Float32Array(normalized.data32F);
        
        // Clean up
        resized.delete();
        gray.delete();
        padded.delete();
        normalized.delete();
        
        return {
            data,
            shape: [1, 1, targetHeight, maxWidth]
        };
    }

    decodeText(output) {
        // CTC greedy decoder for mobile
        const data = output.data;
        const dims = output.dims;
        const seqLen = dims[1];
        const vocabSize = dims[2];
        
        // Character set for English
        const charset = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~ ';
        
        let text = '';
        let confidence = 0;
        let prevIdx = -1;
        let charCount = 0;
        
        for (let t = 0; t < seqLen; t++) {
            let maxIdx = 0;
            let maxProb = data[t * vocabSize];
            
            // Find character with highest probability
            for (let c = 1; c < vocabSize; c++) {
                if (data[t * vocabSize + c] > maxProb) {
                    maxProb = data[t * vocabSize + c];
                    maxIdx = c;
                }
            }
            
            // Decode character (skip blanks and repeats)
            if (maxIdx !== 0 && maxIdx !== prevIdx && maxIdx - 1 < charset.length) {
                text += charset[maxIdx - 1];
                confidence += maxProb;
                charCount++;
            }
            
            prevIdx = maxIdx;
        }
        
        return {
            text: text.trim(),
            confidence: charCount > 0 ? confidence / charCount : 0
        };
    }

    visualizeResults(canvas, results) {
        const cv = this.cv;
        const ctx = canvas.getContext('2d');
        
        // Clear previous drawings
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw the visualized image if available
        if (results.visualized) {
            cv.imshow(canvas, results.visualized);
            results.visualized.delete();
        }
        
        // Overlay text results
        results.texts.forEach((item, index) => {
            if (!item.text) return;
            
            const box = item.box;
            
            // Calculate text position
            const minY = Math.min(...box.map(p => p.y));
            const minX = Math.min(...box.map(p => p.x));
            
            // Draw background for text
            const text = `${item.text} (${(item.confidence * 100).toFixed(0)}%)`;
            ctx.font = '14px Arial';
            const textMetrics = ctx.measureText(text);
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(minX, minY - 25, textMetrics.width + 10, 20);
            
            // Draw text
            ctx.fillStyle = '#ffffff';
            ctx.fillText(text, minX + 5, minY - 10);
            
            // Show inference time if available
            if (item.inferenceTime) {
                ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
                ctx.font = '10px Arial';
                ctx.fillText(`${item.inferenceTime.toFixed(1)}ms`, minX + 5, minY - 28);
            }
        });
    }

    dispose() {
        if (this.detModel) {
            this.detModel.release();
            this.detModel = null;
        }
        if (this.recModel) {
            this.recModel.release();
            this.recModel = null;
        }
        this.isInitialized = false;
        this.currentConfig = null;
    }
}