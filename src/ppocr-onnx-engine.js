import * as ort from 'onnxruntime-web';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Configure ONNX Runtime
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/';

// Model paths - will be served from your GitHub Pages
const MODEL_BASE = '/client-ocr-app/models/';
const MODELS = {
    detection: {
        path: MODEL_BASE + 'PP-OCRv5_mobile_det_infer.onnx',
        name: 'PP-OCRv5 Mobile Detection'
    },
    recognition: {
        path: MODEL_BASE + 'en_PP-OCRv4_mobile_rec_infer.onnx',
        name: 'PP-OCRv4 English Recognition'
    },
    dictionary: {
        path: MODEL_BASE + 'en_dict.txt',
        name: 'English Dictionary'
    }
};

// OCR configuration
const CONFIG = {
    // Detection parameters
    det_limit_side_len: 960,
    det_limit_type: 'max',
    det_db_thresh: 0.3,
    det_db_box_thresh: 0.6,
    det_db_unclip_ratio: 1.5,
    
    // Recognition parameters
    rec_batch_num: 6,
    drop_score: 0.5,
    
    // Image preprocessing
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225]
};

export class PPOCREngine {
    constructor() {
        this.detectionSession = null;
        this.recognitionSession = null;
        this.charDict = [];
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

            // Load dictionary
            progressCallback?.({ status: 'loading', message: 'Loading English dictionary...', progress: 10 });
            await this.loadDictionary();

            // Load detection model
            progressCallback?.({ status: 'loading', message: 'Loading PP-OCRv5 detection model...', progress: 30 });
            this.detectionSession = await ort.InferenceSession.create(MODELS.detection.path, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all'
            });
            console.log('Detection model loaded:', this.detectionSession.inputNames, this.detectionSession.outputNames);

            // Load recognition model
            progressCallback?.({ status: 'loading', message: 'Loading PP-OCRv4 recognition model...', progress: 70 });
            this.recognitionSession = await ort.InferenceSession.create(MODELS.recognition.path, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all'
            });
            console.log('Recognition model loaded:', this.recognitionSession.inputNames, this.recognitionSession.outputNames);

            this.initialized = true;
            progressCallback?.({ status: 'ready', message: 'PP-OCR models loaded successfully!', progress: 100 });
        } catch (error) {
            console.error('Failed to initialize PP-OCR models:', error);
            throw error;
        }
    }

    async loadDictionary() {
        try {
            const response = await fetch(MODELS.dictionary.path);
            const text = await response.text();
            this.charDict = text.split('\n').filter(line => line.trim());
            // Add blank token at the beginning
            this.charDict.unshift(' ');
            console.log(`Loaded dictionary with ${this.charDict.length} characters`);
        } catch (error) {
            console.error('Failed to load dictionary:', error);
            // Use basic ASCII as fallback
            this.charDict = [' '];
            for (let i = 32; i < 127; i++) {
                this.charDict.push(String.fromCharCode(i));
            }
        }
    }

    async process(imageBlob) {
        if (!this.initialized) {
            throw new Error('OCR engine not initialized');
        }

        // Check if it's a PDF
        if (imageBlob.type === 'application/pdf') {
            return await this.processPDF(imageBlob);
        }

        // Convert blob to image
        const imageData = await this.blobToImage(imageBlob);
        
        // Detect text regions
        const boxes = await this.detectText(imageData);
        
        // Recognize text in each region
        const results = await this.recognizeText(imageData, boxes);
        
        return results;
    }

    async detectText(imageData) {
        if (!this.detectionSession) {
            throw new Error('Detection model not loaded');
        }

        // Resize image for detection
        const { resizedImage, ratio } = await this.resizeForDetection(imageData);
        
        // Preprocess image
        const inputTensor = await this.preprocessForDetection(resizedImage);
        
        // Run detection
        const feeds = { [this.detectionSession.inputNames[0]]: inputTensor };
        const results = await this.detectionSession.run(feeds);
        
        // Post-process detection results
        const outputTensor = results[this.detectionSession.outputNames[0]];
        const boxes = await this.postprocessDetection(outputTensor, resizedImage.width, resizedImage.height, ratio);
        
        return boxes;
    }

    async resizeForDetection(imageData) {
        const limit = CONFIG.det_limit_side_len;
        const limitType = CONFIG.det_limit_type;
        
        let w = imageData.width;
        let h = imageData.height;
        
        // Calculate resize ratio
        let ratio = 1.0;
        if (limitType === 'max') {
            if (Math.max(h, w) > limit) {
                ratio = limit / Math.max(h, w);
            }
        } else {
            if (Math.min(h, w) < limit) {
                ratio = limit / Math.min(h, w);
            }
        }
        
        const newW = Math.ceil(w * ratio);
        const newH = Math.ceil(h * ratio);
        
        // Make dimensions divisible by 32
        const targetW = Math.ceil(newW / 32) * 32;
        const targetH = Math.ceil(newH / 32) * 32;
        
        // Resize image
        this.canvas.width = targetW;
        this.canvas.height = targetH;
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, targetW, targetH);
        this.ctx.drawImage(imageData, 0, 0, newW, newH);
        
        const resizedImage = new Image();
        return new Promise((resolve) => {
            this.canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                resizedImage.onload = () => {
                    URL.revokeObjectURL(url);
                    resolve({ resizedImage, ratio });
                };
                resizedImage.src = url;
            });
        });
    }

    async preprocessForDetection(imageData) {
        // Draw image to canvas
        this.canvas.width = imageData.width;
        this.canvas.height = imageData.height;
        this.ctx.drawImage(imageData, 0, 0);
        
        const imgData = this.ctx.getImageData(0, 0, imageData.width, imageData.height);
        const pixels = imgData.data;
        
        // Create tensor [1, 3, H, W]
        const size = imageData.width * imageData.height;
        const floatData = new Float32Array(3 * size);
        
        // Normalize and rearrange to CHW format
        for (let i = 0; i < size; i++) {
            const pixelIndex = i * 4;
            floatData[i] = (pixels[pixelIndex] / 255.0 - CONFIG.mean[0]) / CONFIG.std[0];
            floatData[size + i] = (pixels[pixelIndex + 1] / 255.0 - CONFIG.mean[1]) / CONFIG.std[1];
            floatData[2 * size + i] = (pixels[pixelIndex + 2] / 255.0 - CONFIG.mean[2]) / CONFIG.std[2];
        }
        
        return new ort.Tensor('float32', floatData, [1, 3, imageData.height, imageData.width]);
    }

    async postprocessDetection(outputTensor, imgWidth, imgHeight, ratio) {
        const [batchSize, channels, height, width] = outputTensor.dims;
        const data = outputTensor.data;
        
        // Apply threshold
        const bitmap = new Uint8Array(height * width);
        const thresh = CONFIG.det_db_thresh;
        
        for (let i = 0; i < height * width; i++) {
            bitmap[i] = data[i] > thresh ? 1 : 0;
        }
        
        // Find text regions
        const boxes = [];
        const visited = new Set();
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (bitmap[idx] === 1 && !visited.has(idx) && data[idx] > CONFIG.det_db_box_thresh) {
                    const box = this.expandBox(bitmap, data, x, y, width, height, visited);
                    if (box) {
                        // Scale box back to original size
                        const scaledBox = {
                            points: box.points.map(p => [
                                Math.round(p[0] * imgWidth / width / ratio),
                                Math.round(p[1] * imgHeight / height / ratio)
                            ]),
                            score: box.score
                        };
                        boxes.push(scaledBox);
                    }
                }
            }
        }
        
        return this.sortBoxes(boxes);
    }

    expandBox(bitmap, scores, startX, startY, width, height, visited) {
        let minX = startX, maxX = startX;
        let minY = startY, maxY = startY;
        let totalScore = 0;
        let count = 0;
        
        // BFS to find connected component
        const queue = [[startX, startY]];
        visited.add(startY * width + startX);
        
        while (queue.length > 0) {
            const [x, y] = queue.shift();
            totalScore += scores[y * width + x];
            count++;
            
            // Check neighbors
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    const nidx = ny * width + nx;
                    
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height && 
                        bitmap[nidx] === 1 && !visited.has(nidx)) {
                        visited.add(nidx);
                        queue.push([nx, ny]);
                        minX = Math.min(minX, nx);
                        maxX = Math.max(maxX, nx);
                        minY = Math.min(minY, ny);
                        maxY = Math.max(maxY, ny);
                    }
                }
            }
        }
        
        // Filter small regions
        if ((maxX - minX) < 5 || (maxY - minY) < 5) {
            return null;
        }
        
        // Apply unclip ratio
        const unclipRatio = CONFIG.det_db_unclip_ratio;
        const padding = Math.max((maxX - minX), (maxY - minY)) * (unclipRatio - 1) / 2;
        
        minX = Math.max(0, minX - padding);
        maxX = Math.min(width - 1, maxX + padding);
        minY = Math.max(0, minY - padding);
        maxY = Math.min(height - 1, maxY + padding);
        
        return {
            points: [
                [minX, minY],
                [maxX, minY],
                [maxX, maxY],
                [minX, maxY]
            ],
            score: totalScore / count
        };
    }

    sortBoxes(boxes) {
        // Sort boxes from top to bottom, left to right
        return boxes.sort((a, b) => {
            const aY = Math.min(...a.points.map(p => p[1]));
            const bY = Math.min(...b.points.map(p => p[1]));
            
            if (Math.abs(aY - bY) < 10) {
                const aX = Math.min(...a.points.map(p => p[0]));
                const bX = Math.min(...b.points.map(p => p[0]));
                return aX - bX;
            }
            return aY - bY;
        });
    }

    async recognizeText(imageData, boxes) {
        if (!this.recognitionSession) {
            throw new Error('Recognition model not loaded');
        }

        const results = [];
        
        for (const box of boxes) {
            // Crop image to box region
            const cropped = await this.cropToBox(imageData, box);
            
            // Preprocess for recognition
            const inputTensor = await this.preprocessForRecognition(cropped);
            
            // Run recognition
            const feeds = { [this.recognitionSession.inputNames[0]]: inputTensor };
            const output = await this.recognitionSession.run(feeds);
            
            // Decode the output
            const result = await this.decodeRecognition(output[this.recognitionSession.outputNames[0]]);
            
            if (result.score >= CONFIG.drop_score) {
                results.push({
                    text: result.text,
                    confidence: result.score,
                    box: box.points
                });
            }
        }
        
        return results;
    }

    async cropToBox(imageData, box) {
        const points = box.points;
        const minX = Math.min(...points.map(p => p[0]));
        const maxX = Math.max(...points.map(p => p[0]));
        const minY = Math.min(...points.map(p => p[1]));
        const maxY = Math.max(...points.map(p => p[1]));
        
        const width = maxX - minX;
        const height = maxY - minY;
        
        this.canvas.width = width;
        this.canvas.height = height;
        
        this.ctx.drawImage(imageData, minX, minY, width, height, 0, 0, width, height);
        
        const imgElement = new Image();
        return new Promise((resolve) => {
            this.canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                imgElement.onload = () => {
                    URL.revokeObjectURL(url);
                    resolve(imgElement);
                };
                imgElement.src = url;
            });
        });
    }

    async preprocessForRecognition(imageData) {
        // Recognition model expects fixed height (48) and variable width
        const targetHeight = 48;
        const aspectRatio = imageData.width / imageData.height;
        let targetWidth = Math.round(targetHeight * aspectRatio);
        
        // Ensure minimum width
        targetWidth = Math.max(targetWidth, 48);
        
        // Resize image
        this.canvas.width = targetWidth;
        this.canvas.height = targetHeight;
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, targetWidth, targetHeight);
        this.ctx.drawImage(imageData, 0, 0, targetWidth, targetHeight);
        
        const imgData = this.ctx.getImageData(0, 0, targetWidth, targetHeight);
        const pixels = imgData.data;
        
        // Create tensor [1, 3, H, W]
        const size = targetWidth * targetHeight;
        const floatData = new Float32Array(3 * size);
        
        // Normalize
        for (let i = 0; i < size; i++) {
            const pixelIndex = i * 4;
            floatData[i] = (pixels[pixelIndex] / 255.0 - 0.5) / 0.5;
            floatData[size + i] = (pixels[pixelIndex + 1] / 255.0 - 0.5) / 0.5;
            floatData[2 * size + i] = (pixels[pixelIndex + 2] / 255.0 - 0.5) / 0.5;
        }
        
        return new ort.Tensor('float32', floatData, [1, 3, targetHeight, targetWidth]);
    }

    async decodeRecognition(outputTensor) {
        // CTC decoding
        const [batchSize, seqLen, vocabSize] = outputTensor.dims;
        const preds = outputTensor.data;
        
        // Get argmax for each time step
        const predIdxs = [];
        const scores = [];
        
        for (let t = 0; t < seqLen; t++) {
            let maxIdx = 0;
            let maxVal = preds[t * vocabSize];
            
            for (let c = 1; c < vocabSize; c++) {
                const val = preds[t * vocabSize + c];
                if (val > maxVal) {
                    maxVal = val;
                    maxIdx = c;
                }
            }
            predIdxs.push(maxIdx);
            scores.push(maxVal);
        }
        
        // CTC decode: remove blanks and repeated characters
        const decoded = [];
        const decodedScores = [];
        let lastIdx = -1;
        
        for (let i = 0; i < predIdxs.length; i++) {
            const idx = predIdxs[i];
            
            // Skip blank (index 0) and repeated characters
            if (idx !== 0 && idx !== lastIdx) {
                if (idx < this.charDict.length) {
                    decoded.push(this.charDict[idx]);
                    decodedScores.push(scores[i]);
                }
            }
            lastIdx = idx;
        }
        
        return {
            text: decoded.join(''),
            score: decodedScores.length > 0 ? 
                decodedScores.reduce((a, b) => a + b) / decodedScores.length : 0
        };
    }

    async processPDF(pdfBlob) {
        const arrayBuffer = await pdfBlob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;
        const allResults = [];
        
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.0 });
            
            // Render page to canvas
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            await page.render({
                canvasContext: ctx,
                viewport: viewport
            }).promise;
            
            // Convert canvas to blob and process
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const pageImage = await this.blobToImage(blob);
            
            // Process with OCR
            const boxes = await this.detectText(pageImage);
            const pageResults = await this.recognizeText(pageImage, boxes);
            
            allResults.push({
                page: pageNum,
                results: pageResults
            });
        }
        
        return allResults;
    }

    async blobToImage(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
    }
}

// Create singleton instance
export const ppOCREngine = new PPOCREngine();