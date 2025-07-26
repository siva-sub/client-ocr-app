// ONNX Runtime is loaded globally via script tag
const ort = window.ort;
import { getOpenCv } from './opencv-wrapper.js';

export class OnnxOCRProcessor {
    constructor() {
        this.detModel = null;
        this.recModel = null;
        this.clsModel = null;
        this.isInitialized = false;
        this.currentConfig = null;
    }

    async initialize(modelConfig, modelData) {
        // Ensure OpenCV is ready
        const cv = await getOpenCv();
        this.cv = cv;
        try {
            // Initialize ONNX Runtime
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/';
            
            // Load detection model
            if (modelData.det) {
                this.detModel = await ort.InferenceSession.create(modelData.det.data);
            }
            
            // Load recognition model
            if (modelData.rec) {
                this.recModel = await ort.InferenceSession.create(modelData.rec.data);
            }
            
            // Load classification model (optional)
            if (modelData.cls) {
                this.clsModel = await ort.InferenceSession.create(modelData.cls.data);
            }
            
            this.currentConfig = modelConfig;
            this.isInitialized = true;
            
            console.log('OnnxOCR initialized with config:', modelConfig.name);
        } catch (error) {
            console.error('Failed to initialize OnnxOCR:', error);
            throw error;
        }
    }

    async processImage(imageData) {
        if (!this.isInitialized) {
            throw new Error('OnnxOCR not initialized');
        }

        try {
            // Convert image to OpenCV Mat
            const cv = this.cv;
            const mat = cv.matFromImageData(imageData);
            
            // Step 1: Text Detection
            const detectionResult = await this.detectText(mat);
            
            // Step 2: Crop text regions
            const textRegions = this.cropTextRegions(mat, detectionResult.boxes);
            
            // Step 3: Optional - Classify text angle
            const classifiedRegions = this.clsModel ? 
                await this.classifyTextAngles(textRegions) : 
                textRegions;
            
            // Step 4: Recognize text
            const recognitionResults = await this.recognizeText(classifiedRegions);
            
            // Step 5: Combine results
            const result = this.combineResults(detectionResult, recognitionResults);
            
            // Clean up
            mat.delete();
            textRegions.forEach(region => region.mat.delete());
            
            return result;
        } catch (error) {
            console.error('Error processing image:', error);
            throw error;
        }
    }

    async detectText(mat) {
        if (!this.detModel) {
            throw new Error('Detection model not loaded');
        }

        const config = this.currentConfig.det;
        
        // Preprocess image for detection
        const preprocessed = this.preprocessForDetection(mat, config);
        
        // Create tensor
        const tensor = new ort.Tensor('float32', preprocessed.data, preprocessed.shape);
        
        // Run inference
        const feeds = { [config.inputName]: tensor };
        const results = await this.detModel.run(feeds);
        
        // Post-process detection results
        const boxes = this.postprocessDetection(results[config.outputName], mat.cols, mat.rows);
        
        preprocessed.mat.delete();
        
        return { boxes };
    }

    preprocessForDetection(mat, config) {
        const cv = this.cv;
        // Resize to model input size
        const targetSize = config.inputShape || [640, 640];
        const resized = new cv.Mat();
        cv.resize(mat, resized, new cv.Size(targetSize[1], targetSize[0]));
        
        // Convert to RGB if needed
        const rgb = new cv.Mat();
        cv.cvtColor(resized, rgb, cv.COLOR_RGBA2RGB);
        
        // Normalize
        const normalized = new cv.Mat();
        rgb.convertTo(normalized, cv.CV_32F, 1/255.0);
        
        // Apply mean and std normalization if specified
        if (config.mean && config.std) {
            const mean = cv.matFromArray(1, 1, cv.CV_32FC3, config.mean);
            const std = cv.matFromArray(1, 1, cv.CV_32FC3, config.std);
            cv.subtract(normalized, mean, normalized);
            cv.divide(normalized, std, normalized);
            mean.delete();
            std.delete();
        }
        
        // Convert to CHW format
        const channels = new cv.MatVector();
        cv.split(normalized, channels);
        
        const data = new Float32Array(3 * targetSize[0] * targetSize[1]);
        for (let c = 0; c < 3; c++) {
            const channelData = channels.get(c).data32F;
            data.set(channelData, c * targetSize[0] * targetSize[1]);
        }
        
        // Clean up
        resized.delete();
        rgb.delete();
        normalized.delete();
        channels.delete();
        
        return {
            data,
            shape: [1, 3, targetSize[0], targetSize[1]],
            mat: resized
        };
    }

    postprocessDetection(output, origWidth, origHeight) {
        const cv = this.cv;
        // This implements the DB postprocessing similar to PaddleOCR
        const data = output.data;
        const [batch, height, width] = output.dims;
        
        const boxes = [];
        const threshold = this.currentConfig.det.threshold || 0.3;
        
        // Convert probability map to binary map
        const binaryMap = new cv.Mat(height, width, cv.CV_8U);
        for (let i = 0; i < height * width; i++) {
            binaryMap.data[i] = data[i] > threshold ? 255 : 0;
        }
        
        // Find contours
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(binaryMap, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        
        // Process each contour
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const rect = cv.minAreaRect(contour);
            const box = cv.boxPoints(rect);
            
            // Scale box coordinates back to original image size
            const scaledBox = [];
            for (let j = 0; j < 4; j++) {
                scaledBox.push({
                    x: box.data32F[j * 2] * (origWidth / width),
                    y: box.data32F[j * 2 + 1] * (origHeight / height)
                });
            }
            
            boxes.push(scaledBox);
        }
        
        // Clean up
        binaryMap.delete();
        contours.delete();
        hierarchy.delete();
        
        return boxes;
    }

    cropTextRegions(mat, boxes) {
        const cv = this.cv;
        const regions = [];
        
        for (const box of boxes) {
            // Get bounding rectangle
            const points = box.map(p => new cv.Point(Math.round(p.x), Math.round(p.y)));
            const rect = cv.boundingRect(cv.matFromArray(4, 1, cv.CV_32SC2, 
                points.flatMap(p => [p.x, p.y])));
            
            // Crop region
            const roi = mat.roi(rect);
            const cropped = new cv.Mat();
            roi.copyTo(cropped);
            
            regions.push({
                mat: cropped,
                box: box,
                rect: rect
            });
        }
        
        return regions;
    }

    async classifyTextAngles(regions) {
        const cv = this.cv;
        if (!this.clsModel) {
            return regions;
        }
        
        const classifiedRegions = [];
        
        for (const region of regions) {
            const angle = await this.classifyAngle(region.mat);
            
            if (angle === 180) {
                // Rotate 180 degrees
                const rotated = new cv.Mat();
                const center = new cv.Point(region.mat.cols / 2, region.mat.rows / 2);
                const M = cv.getRotationMatrix2D(center, 180, 1);
                cv.warpAffine(region.mat, rotated, M, new cv.Size(region.mat.cols, region.mat.rows));
                region.mat.delete();
                region.mat = rotated;
                M.delete();
            }
            
            classifiedRegions.push(region);
        }
        
        return classifiedRegions;
    }

    async classifyAngle(mat) {
        const cv = this.cv;
        const config = this.currentConfig.cls;
        
        // Preprocess
        const resized = new cv.Mat();
        cv.resize(mat, resized, new cv.Size(config.inputShape[3], config.inputShape[2]));
        
        // Convert to tensor
        const data = new Float32Array(resized.data.length / 4 * 3);
        for (let i = 0; i < resized.data.length / 4; i++) {
            data[i * 3] = resized.data[i * 4] / 255.0;
            data[i * 3 + 1] = resized.data[i * 4 + 1] / 255.0;
            data[i * 3 + 2] = resized.data[i * 4 + 2] / 255.0;
        }
        
        const tensor = new ort.Tensor('float32', data, config.inputShape);
        const feeds = { [config.inputName]: tensor };
        const results = await this.clsModel.run(feeds);
        
        // Get angle class (0 or 180)
        const output = results[config.outputName];
        const angle = output.data[0] > output.data[1] ? 0 : 180;
        
        resized.delete();
        
        return angle;
    }

    async recognizeText(regions) {
        if (!this.recModel) {
            throw new Error('Recognition model not loaded');
        }
        
        const results = [];
        
        for (const region of regions) {
            const text = await this.recognizeRegion(region.mat);
            results.push({
                text,
                box: region.box,
                confidence: text.confidence
            });
        }
        
        return results;
    }

    async recognizeRegion(mat) {
        const config = this.currentConfig.rec;
        
        // Preprocess for recognition
        const preprocessed = this.preprocessForRecognition(mat, config);
        
        // Create tensor
        const tensor = new ort.Tensor('float32', preprocessed.data, preprocessed.shape);
        
        // Run inference
        const feeds = { [config.inputName]: tensor };
        const results = await this.recModel.run(feeds);
        
        // Decode text
        const text = this.decodeText(results[config.outputName], config);
        
        return text;
    }

    preprocessForRecognition(mat, config) {
        const cv = this.cv;
        // Resize to fixed height while maintaining aspect ratio
        const targetHeight = config.inputShape[2] || 48;
        const scale = targetHeight / mat.rows;
        const targetWidth = Math.round(mat.cols * scale);
        
        const resized = new cv.Mat();
        cv.resize(mat, resized, new cv.Size(targetWidth, targetHeight));
        
        // Pad to max width
        const maxWidth = config.inputShape[3] || 320;
        const padded = new cv.Mat();
        if (targetWidth < maxWidth) {
            cv.copyMakeBorder(resized, padded, 0, 0, 0, maxWidth - targetWidth, 
                cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));
        } else {
            resized.copyTo(padded);
        }
        
        // Convert to grayscale if needed
        const gray = new cv.Mat();
        if (config.channels === 1) {
            cv.cvtColor(padded, gray, cv.COLOR_RGBA2GRAY);
        } else {
            cv.cvtColor(padded, gray, cv.COLOR_RGBA2RGB);
        }
        
        // Normalize
        const normalized = new cv.Mat();
        gray.convertTo(normalized, cv.CV_32F, 1/255.0);
        
        // Convert to tensor format
        const data = new Float32Array(normalized.data32F);
        
        // Clean up
        resized.delete();
        padded.delete();
        gray.delete();
        normalized.delete();
        
        return {
            data,
            shape: [1, config.channels || 3, targetHeight, maxWidth]
        };
    }

    decodeText(output, config) {
        // This is a simplified CTC decoder
        const chars = config.characterSet || this.getDefaultCharset();
        const data = output.data;
        const [batch, seq_len, num_classes] = output.dims;
        
        let text = '';
        let confidence = 0;
        let prev_idx = -1;
        
        for (let t = 0; t < seq_len; t++) {
            let max_idx = 0;
            let max_prob = data[t * num_classes];
            
            for (let c = 1; c < num_classes; c++) {
                if (data[t * num_classes + c] > max_prob) {
                    max_prob = data[t * num_classes + c];
                    max_idx = c;
                }
            }
            
            if (max_idx !== 0 && max_idx !== prev_idx) {
                text += chars[max_idx - 1] || '';
                confidence += max_prob;
            }
            
            prev_idx = max_idx;
        }
        
        return {
            text: text.trim(),
            confidence: text.length > 0 ? confidence / text.length : 0
        };
    }

    getDefaultCharset() {
        // Default English character set
        return ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
    }

    combineResults(detectionResult, recognitionResults) {
        return {
            boxes: detectionResult.boxes,
            texts: recognitionResults.map(r => ({
                text: r.text.text,
                confidence: r.text.confidence,
                box: r.box
            })),
            timestamp: Date.now()
        };
    }

    visualizeResults(canvas, results) {
        const ctx = canvas.getContext('2d');
        
        results.texts.forEach((item, index) => {
            const box = item.box;
            
            // Draw bounding box
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(box[0].x, box[0].y);
            for (let i = 1; i < 4; i++) {
                ctx.lineTo(box[i].x, box[i].y);
            }
            ctx.closePath();
            ctx.stroke();
            
            // Draw text label
            const text = `${item.text} (${(item.confidence * 100).toFixed(1)}%)`;
            ctx.fillStyle = '#000000';
            ctx.fillRect(box[0].x, box[0].y - 20, ctx.measureText(text).width + 10, 20);
            ctx.fillStyle = '#ffffff';
            ctx.font = '14px Arial';
            ctx.fillText(text, box[0].x + 5, box[0].y - 5);
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
        if (this.clsModel) {
            this.clsModel.release();
            this.clsModel = null;
        }
        this.isInitialized = false;
        this.currentConfig = null;
    }
}