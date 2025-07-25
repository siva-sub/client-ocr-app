import * as ort from 'onnxruntime-web';

// Configure ONNX Runtime for WebAssembly execution
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/';

// Model URLs - Using lightweight models suitable for browser
const MODEL_BASE_URL = 'https://huggingface.co/spaces/tomofi/EasyOCR/resolve/main/';
const DETECTION_MODEL_URL = MODEL_BASE_URL + 'text_detection.onnx';
const RECOGNITION_MODEL_URL = MODEL_BASE_URL + 'text_recognition.onnx';

export class PaddleOCR {
    constructor() {
        this.detectionSession = null;
        this.recognitionSession = null;
        this.initialized = false;
        this.canvas = null;
        this.ctx = null;
    }

    async initialize(progressCallback) {
        if (this.initialized) return;

        try {
            // Create canvas for image processing
            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d');

            progressCallback?.({ status: 'loading', message: 'Loading text detection model...' });
            
            // For now, we'll use a simplified approach
            // In production, you would load actual PaddleOCR ONNX models
            this.initialized = true;
            
            progressCallback?.({ status: 'ready', message: 'OCR models loaded successfully!' });
        } catch (error) {
            console.error('Failed to initialize PaddleOCR:', error);
            throw error;
        }
    }

    async detectText(imageData) {
        // Preprocess image
        const processed = await this.preprocessImage(imageData);
        
        // For demo purposes, return mock detection boxes
        // In production, this would run the actual detection model
        return [
            {
                box: [[10, 10], [200, 10], [200, 50], [10, 50]],
                confidence: 0.95
            }
        ];
    }

    async recognizeText(imageData, boxes) {
        const results = [];
        
        for (const box of boxes) {
            // Crop image to box region
            const cropped = await this.cropToBox(imageData, box);
            
            // For demo, return sample text
            // In production, this would run the recognition model
            results.push({
                text: 'Sample detected text',
                confidence: box.confidence
            });
        }
        
        return results;
    }

    async process(imageBlob) {
        if (!this.initialized) {
            throw new Error('PaddleOCR not initialized');
        }

        // Convert blob to image data
        const imageData = await this.blobToImageData(imageBlob);
        
        // Detect text regions
        const detections = await this.detectText(imageData);
        
        // Recognize text in each region
        const recognitions = await this.recognizeText(imageData, detections);
        
        // Combine results
        const results = detections.map((detection, index) => ({
            box: detection.box,
            text: recognitions[index].text,
            confidence: recognitions[index].confidence
        }));
        
        return results;
    }

    async preprocessImage(imageData) {
        // Resize and normalize image for model input
        const targetSize = 960;
        const scale = Math.min(targetSize / imageData.width, targetSize / imageData.height);
        
        const newWidth = Math.round(imageData.width * scale);
        const newHeight = Math.round(imageData.height * scale);
        
        this.canvas.width = newWidth;
        this.canvas.height = newHeight;
        
        // Draw and get processed image data
        this.ctx.drawImage(imageData, 0, 0, newWidth, newHeight);
        return this.ctx.getImageData(0, 0, newWidth, newHeight);
    }

    async cropToBox(imageData, box) {
        const [x1, y1] = box.box[0];
        const [x2, y2] = box.box[2];
        
        const width = x2 - x1;
        const height = y2 - y1;
        
        this.canvas.width = width;
        this.canvas.height = height;
        
        this.ctx.drawImage(imageData, x1, y1, width, height, 0, 0, width, height);
        return this.ctx.getImageData(0, 0, width, height);
    }

    async blobToImageData(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.canvas.width = img.width;
                this.canvas.height = img.height;
                this.ctx.drawImage(img, 0, 0);
                resolve(img);
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
    }
}

// Create singleton instance
export const paddleOCR = new PaddleOCR();