import * as ort from 'onnxruntime-web';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '/client-ocr-app/pdf.worker.min.js';

// Configure ONNX Runtime to use the bundled WASM files
ort.env.wasm.wasmPaths = '/client-ocr-app/assets/';
ort.env.wasm.numThreads = 1;

// Model paths
const MODEL_BASE = '/client-ocr-app/models/';

// Improved configuration based on RapidOCR and ppu-paddle-ocr - optimized for better detection
const CONFIG = {
    // Detection parameters (VERY low thresholds for maximum detection)
    det_limit_side_len: 1280,    // Higher resolution for better detail
    det_limit_type: 'max',       // Use 'max' for consistent sizing
    det_db_thresh: 0.05,         // VERY low threshold for maximum detection
    det_db_box_thresh: 0.1,      // VERY low box threshold to detect all text
    det_db_unclip_ratio: 2.5,    // Even higher ratio for better text coverage
    det_db_min_size: 2,          // Smaller minimum size for tiny text
    det_db_max_candidates: 2000,  // More candidates for complex images
    det_use_dilation: true,      // Enable for better text connectivity
    det_dilation_kernel: 3,      // Dilation kernel size
    
    // Recognition parameters (lower thresholds)
    rec_image_height: 48,
    rec_image_width: 320,        // Dynamic width calculation
    rec_batch_num: 6,
    drop_score: 0.05,            // VERY low threshold to keep all results
    
    // Preprocessing parameters (PP-OCRv5 style)
    det_mean: [0.485, 0.456, 0.406],
    det_std: [0.229, 0.224, 0.225],
    rec_mean: 0.5,
    rec_std: 0.5,
    
    // Area thresholds
    min_area_thresh: 2,          // Very small area threshold
    
    // Text line merging
    vertical_gap_threshold: 0.5,  // Standard gap threshold
    
    // English-specific optimizations
    english_mode: true,
    min_word_confidence: 0.1,    // Very low confidence threshold
    enable_word_splitting: true,  // Split connected words in English
    
    // Grid parameters for finer detection
    grid_size: 16,               // Much smaller grid size (was 32)
    overlap_ratio: 0.2           // Overlap between grid cells
};

export class PPOCRImprovedEngine {
    constructor() {
        this.detectionSession = null;
        this.recognitionSession = null;
        this.charDict = [];
        this.initialized = false;
        this.canvas = null;
        this.ctx = null;
        this.modelConfig = {
            detection: 'PP-OCRv5_mobile_det_infer.onnx',  // PP-OCRv5 mobile detection
            recognition: 'en_PP-OCRv4_mobile_rec_infer.onnx',  // English recognition model
            dictionary: 'en_dict.txt'  // English dictionary
        };
    }

    setModelConfig(config) {
        // Update model configuration
        if (config.detection) this.modelConfig.detection = config.detection;
        if (config.recognition) this.modelConfig.recognition = config.recognition;
        if (config.dictionary) this.modelConfig.dictionary = config.dictionary;
        
        // Mark as not initialized to force reload
        this.initialized = false;
    }

    async initialize(progressCallback) {
        try {
            // Create canvas for image processing with willReadFrequently for better performance
            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

            // Load dictionary
            progressCallback?.({ status: 'loading', message: 'Loading dictionary...', progress: 10 });
            await this.loadDictionary();

            // Load detection model
            const detectionName = this.modelConfig.detection.replace('.onnx', '').replace(/_/g, ' ');
            progressCallback?.({ status: 'loading', message: `Loading ${detectionName}...`, progress: 30 });
            
            // Release existing session if any
            if (this.detectionSession) {
                await this.detectionSession.release();
            }
            
            this.detectionSession = await ort.InferenceSession.create(
                MODEL_BASE + this.modelConfig.detection, 
                {
                    executionProviders: ['wasm'],
                    graphOptimizationLevel: 'all'
                }
            );
            console.log('Detection model loaded:', this.detectionSession.inputNames, this.detectionSession.outputNames);

            // Load recognition model
            const recognitionName = this.modelConfig.recognition.replace('.onnx', '').replace(/_/g, ' ');
            progressCallback?.({ status: 'loading', message: `Loading ${recognitionName}...`, progress: 70 });
            
            // Release existing session if any
            if (this.recognitionSession) {
                await this.recognitionSession.release();
            }
            
            this.recognitionSession = await ort.InferenceSession.create(
                MODEL_BASE + this.modelConfig.recognition, 
                {
                    executionProviders: ['wasm'],
                    graphOptimizationLevel: 'all'
                }
            );
            console.log('Recognition model loaded:', this.recognitionSession.inputNames, this.recognitionSession.outputNames);

            this.initialized = true;
            progressCallback?.({ status: 'ready', message: 'PP-OCR ready!', progress: 100 });

        } catch (error) {
            console.error('Failed to initialize PP-OCR models:', error);
            throw error;
        }
    }

    async loadDictionary() {
        try {
            const response = await fetch(MODEL_BASE + this.modelConfig.dictionary);
            const text = await response.text();
            this.charDict = text.split('\n').filter(line => line.trim());
            // Add blank token at the beginning
            this.charDict.unshift(' ');
            console.log(`Loaded dictionary ${this.modelConfig.dictionary} with ${this.charDict.length} characters`);
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

        console.log('Processing blob type:', imageBlob.type, 'size:', imageBlob.size);

        // Check if it's a PDF
        if (imageBlob.type === 'application/pdf') {
            return await this.processPDF(imageBlob);
        }

        // Convert blob to image
        console.log('Converting blob to image...');
        const imageData = await this.blobToImage(imageBlob);
        console.log('Image loaded:', imageData.width, 'x', imageData.height);
        
        // Detect text regions
        const boxes = await this.detectText(imageData);
        
        // Recognize text in each region
        const results = await this.recognizeText(imageData, boxes);
        
        // Post-process: merge text lines
        return this.mergeTextLines(results);
    }

    async detectText(imageData) {
        console.log('detectText called, checking detection session...');
        if (!this.detectionSession) {
            throw new Error('Detection model not loaded');
        }
        console.log('Detection session exists:', this.detectionSession);
        console.log('Current dictionary:', this.modelConfig.dictionary, 'Dictionary length:', this.charDict.length);

        try {
            // Resize image for detection
            console.log('Starting image resize...');
            const { resizedImage, ratio } = await this.resizeForDetection(imageData);
            console.log('Image resized, ratio:', ratio);
            
            // Preprocess for detection
            console.log('Starting preprocessing...');
            const inputTensor = await this.preprocessForDetection(resizedImage);
            console.log('Preprocessing complete, tensor shape:', inputTensor.dims);
            
            // Run detection
            console.log('Running detection model...');
            console.log('Input names:', this.detectionSession.inputNames);
            console.log('Output names:', this.detectionSession.outputNames);
            const feeds = { [this.detectionSession.inputNames[0]]: inputTensor };
            
            let output;
            try {
                output = await this.detectionSession.run(feeds);
                console.log('Detection complete');
            } catch (inferenceError) {
                console.error('ONNX inference error:', inferenceError);
                console.error('Error code:', inferenceError.code);
                console.error('Error message:', inferenceError.message);
                throw inferenceError;
            }
            
            // Post-process detection results
            const boxes = await this.postprocessDetection(
                output[this.detectionSession.outputNames[0]], 
                resizedImage.width, 
                resizedImage.height, 
                ratio
            );
            
            console.log(`Detected ${boxes.length} text regions`);
            return this.sortBoxes(boxes);
        } catch (error) {
            console.error('Error in detectText:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name,
                code: error.code
            });
            // Return empty array instead of throwing to allow partial results
            return [];
        }
    }

    async resizeForDetection(imageData) {
        try {
            console.log('resizeForDetection - input image size:', imageData.width, 'x', imageData.height);
            const limitSideLen = CONFIG.det_limit_side_len;
            const limitType = CONFIG.det_limit_type;
            let newW = imageData.width;
            let newH = imageData.height;
        
        // Calculate resize ratio based on RapidOCR approach
        let ratio = 1;
        if (limitType === 'max') {
            if (Math.max(newH, newW) > limitSideLen) {
                ratio = newH > newW ? limitSideLen / newH : limitSideLen / newW;
            }
        } else {
            // 'min' type - better for small text
            if (Math.min(newH, newW) < limitSideLen) {
                ratio = newH < newW ? limitSideLen / newH : limitSideLen / newW;
            }
        }
        
        newW = Math.round(newW * ratio);
        newH = Math.round(newH * ratio);
        
        // Make dimensions divisible by grid size for finer detection
        const gridSize = CONFIG.grid_size;
        const targetW = Math.round(newW / gridSize) * gridSize;
        const targetH = Math.round(newH / gridSize) * gridSize;
        
        // Apply preprocessing to improve image quality
        const preprocessedImage = await this.preprocessImage(imageData, targetW, targetH);
        
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
        } catch (error) {
            console.error('Error in resizeForDetection:', error);
            throw error;
        }
    }
    
    async preprocessImage(imageData, targetW, targetH) {
        // Resize image
        this.canvas.width = targetW;
        this.canvas.height = targetH;
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, targetW, targetH);
        
        // Enable image smoothing for better quality
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        
        // Draw with proper scaling
        const scale = Math.min(targetW / imageData.width, targetH / imageData.height);
        const scaledW = imageData.width * scale;
        const scaledH = imageData.height * scale;
        const offsetX = (targetW - scaledW) / 2;
        const offsetY = (targetH - scaledH) / 2;
        
        this.ctx.drawImage(imageData, offsetX, offsetY, scaledW, scaledH);
        
        // Apply moderate contrast enhancement to preserve text
        const imgData = this.ctx.getImageData(0, 0, targetW, targetH);
        const pixels = imgData.data;
        
        // Convert to grayscale and enhance contrast
        for (let i = 0; i < pixels.length; i += 4) {
            // Convert to grayscale
            const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
            
            // Moderate contrast enhancement - less aggressive
            let enhanced = ((gray - 128) * 1.2) + 128;
            
            // Gentle clamping to preserve mid-tones
            if (enhanced > 240) {
                enhanced = 255;
            } else if (enhanced < 15) {
                enhanced = 0;
            }
            
            enhanced = Math.max(0, Math.min(255, enhanced));
            
            pixels[i] = enhanced;
            pixels[i + 1] = enhanced;
            pixels[i + 2] = enhanced;
        }
        
        this.ctx.putImageData(imgData, 0, 0);
        return this.canvas;
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
        
        // Normalize and rearrange to CHW format (RapidOCR style)
        for (let i = 0; i < size; i++) {
            const pixelIndex = i * 4;
            floatData[i] = (pixels[pixelIndex] / 255.0 - CONFIG.det_mean[0]) / CONFIG.det_std[0];
            floatData[size + i] = (pixels[pixelIndex + 1] / 255.0 - CONFIG.det_mean[1]) / CONFIG.det_std[1];
            floatData[2 * size + i] = (pixels[pixelIndex + 2] / 255.0 - CONFIG.det_mean[2]) / CONFIG.det_std[2];
        }
        
        return new ort.Tensor('float32', floatData, [1, 3, imageData.height, imageData.width]);
    }

    async postprocessDetection(outputTensor, imgWidth, imgHeight, ratio) {
        try {
            // PP-OCRv5 might have different output format
            let height, width, data;
            
            if (outputTensor.dims.length === 4) {
                // Standard format: [batch, channels, height, width]
                const [batchSize, channels, h, w] = outputTensor.dims;
                height = h;
                width = w;
                data = outputTensor.data;
            } else if (outputTensor.dims.length === 3) {
                // Alternative format: [batch, height, width]
                const [batchSize, h, w] = outputTensor.dims;
                height = h;
                width = w;
                data = outputTensor.data;
            } else {
                throw new Error(`Unexpected output tensor dimensions: ${outputTensor.dims}`);
            }
            
            console.log(`Detection output shape: ${height}x${width}, total pixels: ${height * width}`);
            console.log('Output tensor dims:', outputTensor.dims);
            console.log('Data length:', data.length);
            
            // Convert to probability map
            const probMap = new Float32Array(height * width);
            for (let i = 0; i < height * width; i++) {
                probMap[i] = 1 / (1 + Math.exp(-data[i]));  // Sigmoid
            }
            
            // Threshold
            const bitmap = new Uint8Array(height * width);
            for (let i = 0; i < height * width; i++) {
                bitmap[i] = probMap[i] > CONFIG.det_db_thresh ? 255 : 0;
            }
        
        // Find contours (limit to prevent overflow)
        const boxes = [];
        const visited = new Set();
        let numContours = 0;
        
        for (let y = 0; y < height && numContours < CONFIG.det_db_max_candidates; y++) {
            for (let x = 0; x < width && numContours < CONFIG.det_db_max_candidates; x++) {
                const idx = y * width + x;
                if (bitmap[idx] === 255 && !visited.has(idx)) {
                    const box = this.findConnectedComponent(bitmap, width, height, x, y, visited, probMap);
                    if (box && box.score >= CONFIG.det_db_box_thresh) {
                        // Scale back to original size
                        box.points = box.points.map(p => [
                            Math.round(p[0] / ratio),
                            Math.round(p[1] / ratio)
                        ]);
                        
                        // Calculate area
                        const area = this.calculatePolygonArea(box.points);
                        if (area > CONFIG.min_area_thresh) {
                            boxes.push(box);
                            numContours++;
                        }
                    }
                }
            }
        }
        
        return boxes;
        } catch (error) {
            console.error('Error in postprocessDetection:', error);
            throw new Error(`Detection post-processing failed: ${error.message}`);
        }
    }

    findConnectedComponent(bitmap, width, height, startX, startY, visited, probMap) {
        const stack = [[startX, startY]];
        const points = [];
        let totalScore = 0;
        let count = 0;
        const MAX_COMPONENT_SIZE = 10000; // Smaller limit for individual components
        
        // Mark starting point as visited immediately
        const startIdx = startY * width + startX;
        if (visited.has(startIdx) || bitmap[startIdx] !== 255) {
            return null;
        }
        
        // For text detection, we want to find individual text lines/words
        // not merge everything into one giant component
        const componentMap = new Set();
        componentMap.add(startIdx);
        
        while (stack.length > 0 && points.length < MAX_COMPONENT_SIZE) {
            const [x, y] = stack.pop();
            const idx = y * width + x;
            
            if (visited.has(idx)) continue;
            visited.add(idx);
            
            if (bitmap[idx] === 255) {
                points.push([x, y]);
                totalScore += probMap[idx];
                count++;
                
                // For text, use 4-connectivity instead of 8 to avoid merging separate lines
                const neighbors = [
                    [x, y - 1], // top
                    [x, y + 1], // bottom
                    [x - 1, y], // left
                    [x + 1, y]  // right
                ];
                
                for (const [nx, ny] of neighbors) {
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const nidx = ny * width + nx;
                        if (!visited.has(nidx) && bitmap[nidx] === 255) {
                            // Check if this would create too large a component
                            // This helps separate text lines
                            const yDiff = Math.abs(ny - startY);
                            const xDiff = Math.abs(nx - startX);
                            
                            // Limit component growth to prevent merging text lines
                            if (yDiff < height * 0.05 || xDiff < width * 0.3) {
                                stack.push([nx, ny]);
                                componentMap.add(nidx);
                            }
                        }
                    }
                }
            }
        }
        
        if (points.length < CONFIG.det_db_min_size) {
            return null;
        }
        
        // Find bounding box
        const xs = points.map(p => p[0]);
        const ys = points.map(p => p[1]);
        let minX = Math.min(...xs);
        let maxX = Math.max(...xs);
        let minY = Math.min(...ys);
        let maxY = Math.max(...ys);
        
        // Apply unclip ratio - different padding for x and y to better fit text
        const unclipRatio = CONFIG.det_db_unclip_ratio;
        const xPadding = (maxX - minX) * 0.1; // 10% horizontal padding
        const yPadding = (maxY - minY) * 0.2; // 20% vertical padding for better line coverage
        
        minX = Math.max(0, minX - xPadding);
        maxX = Math.min(width - 1, maxX + xPadding);
        minY = Math.max(0, minY - yPadding);
        maxY = Math.min(height - 1, maxY + yPadding);
        
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

    calculatePolygonArea(points) {
        let area = 0;
        const n = points.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i][0] * points[j][1];
            area -= points[j][0] * points[i][1];
        }
        return Math.abs(area) / 2;
    }

    sortBoxes(boxes) {
        // RapidOCR-style box sorting: top to bottom, left to right
        if (boxes.length === 0) return boxes;
        
        // First sort by Y coordinate
        boxes.sort((a, b) => {
            const aY = a.points[0][1]; // Top-left Y
            const bY = b.points[0][1];
            return aY - bY;
        });
        
        // Then adjust for boxes on the same line
        for (let i = boxes.length - 1; i > 0; i--) {
            for (let j = i - 1; j >= 0; j--) {
                // If boxes are on the same horizontal line (within 10 pixels)
                if (Math.abs(boxes[j + 1].points[0][1] - boxes[j].points[0][1]) < 10 &&
                    boxes[j + 1].points[0][0] < boxes[j].points[0][0]) {
                    // Swap if the right box is actually to the left
                    const tmp = boxes[j];
                    boxes[j] = boxes[j + 1];
                    boxes[j + 1] = tmp;
                } else {
                    break;
                }
            }
        }
        
        return boxes;
    }

    async recognizeText(imageData, boxes) {
        if (!this.recognitionSession) {
            throw new Error('Recognition model not loaded');
        }

        const results = [];
        
        // Process in batches like RapidOCR
        const batchSize = CONFIG.rec_batch_num;
        
        for (let i = 0; i < boxes.length; i += batchSize) {
            const batchBoxes = boxes.slice(i, Math.min(i + batchSize, boxes.length));
            const batchResults = await this.processBatch(imageData, batchBoxes);
            results.push(...batchResults);
        }
        
        return results;
    }

    async processBatch(imageData, boxes) {
        const results = [];
        
        // Sort by width ratio for better batching (RapidOCR approach)
        const croppedImages = [];
        const widthRatios = [];
        
        for (const box of boxes) {
            const cropped = await this.getRotateCropImage(imageData, box);
            const ratio = cropped.width / cropped.height;
            croppedImages.push(cropped);
            widthRatios.push(ratio);
        }
        
        // Sort by width ratio
        const indices = Array.from({length: boxes.length}, (_, i) => i)
            .sort((a, b) => widthRatios[a] - widthRatios[b]);
        
        // Process sorted batch
        for (const idx of indices) {
            const cropped = croppedImages[idx];
            const box = boxes[idx];
            
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

    async getRotateCropImage(imageData, box) {
        // RapidOCR-style perspective transform and rotation handling
        const points = box.points;
        
        // Calculate crop dimensions
        const width1 = Math.sqrt(Math.pow(points[0][0] - points[1][0], 2) + 
                               Math.pow(points[0][1] - points[1][1], 2));
        const width2 = Math.sqrt(Math.pow(points[2][0] - points[3][0], 2) + 
                               Math.pow(points[2][1] - points[3][1], 2));
        const cropWidth = Math.max(width1, width2);
        
        const height1 = Math.sqrt(Math.pow(points[0][0] - points[3][0], 2) + 
                                Math.pow(points[0][1] - points[3][1], 2));
        const height2 = Math.sqrt(Math.pow(points[1][0] - points[2][0], 2) + 
                                Math.pow(points[1][1] - points[2][1], 2));
        const cropHeight = Math.max(height1, height2);
        
        // For now, use simple cropping (perspective transform would require additional libraries)
        // This is a simplified version that works well for most cases
        const minX = Math.min(...points.map(p => p[0]));
        const maxX = Math.max(...points.map(p => p[0]));
        const minY = Math.min(...points.map(p => p[1]));
        const maxY = Math.max(...points.map(p => p[1]));
        
        const width = maxX - minX;
        const height = maxY - minY;
        
        this.canvas.width = width;
        this.canvas.height = height;
        
        this.ctx.drawImage(imageData, minX, minY, width, height, 0, 0, width, height);
        
        // Check if image needs rotation (height > 1.5 * width)
        let needRotation = false;
        if (height * 1.0 / width >= 1.5) {
            needRotation = true;
            // Rotate 90 degrees
            const rotatedCanvas = document.createElement('canvas');
            const rotatedCtx = rotatedCanvas.getContext('2d', { willReadFrequently: true });
            rotatedCanvas.width = height;
            rotatedCanvas.height = width;
            rotatedCtx.translate(height / 2, width / 2);
            rotatedCtx.rotate(Math.PI / 2);
            rotatedCtx.drawImage(this.canvas, -width / 2, -height / 2);
            
            // Copy back to main canvas
            this.canvas.width = height;
            this.canvas.height = width;
            this.ctx.drawImage(rotatedCanvas, 0, 0);
        }
        
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
        // Recognition model expects fixed height
        const imgChannel = 3;
        const imgHeight = CONFIG.rec_image_height;
        const imgWidth = CONFIG.rec_image_width;
        
        // Calculate max width ratio (RapidOCR style)
        const h = imageData.height;
        const w = imageData.width;
        const ratio = w / h;
        const maxWhRatio = imgWidth / imgHeight;
        
        let resizedW;
        if (Math.ceil(imgHeight * ratio) > imgWidth) {
            resizedW = imgWidth;
        } else {
            resizedW = Math.ceil(imgHeight * ratio);
        }
        
        // Resize image
        this.canvas.width = resizedW;
        this.canvas.height = imgHeight;
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, resizedW, imgHeight);
        this.ctx.drawImage(imageData, 0, 0, resizedW, imgHeight);
        
        const imgData = this.ctx.getImageData(0, 0, resizedW, imgHeight);
        const pixels = imgData.data;
        
        // Create padding tensor with fixed width
        const paddingData = new Float32Array(imgChannel * imgHeight * imgWidth);
        
        // Copy resized image to padded tensor (RapidOCR normalization)
        for (let c = 0; c < imgChannel; c++) {
            for (let y = 0; y < imgHeight; y++) {
                for (let x = 0; x < resizedW; x++) {
                    const srcIdx = (y * resizedW + x) * 4 + c;
                    const dstIdx = c * imgHeight * imgWidth + y * imgWidth + x;
                    // RapidOCR recognition normalization: (x/255 - 0.5) / 0.5
                    paddingData[dstIdx] = (pixels[srcIdx] / 255.0 - CONFIG.rec_mean) / CONFIG.rec_std;
                }
            }
        }
        
        return new ort.Tensor('float32', paddingData, [1, imgChannel, imgHeight, imgWidth]);
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

    mergeTextLines(results) {
        if (results.length === 0) return results;
        
        // Filter results by confidence score first (RapidOCR approach)
        let filteredResults = this.filterResults(results);
        if (filteredResults.length === 0) return filteredResults;
        
        // Apply English-specific post-processing if enabled
        if (CONFIG.english_mode) {
            filteredResults = this.postProcessEnglishText(filteredResults);
        }
        
        // Calculate average text height
        const heights = filteredResults.map(r => {
            const ys = r.box.map(p => p[1]);
            return Math.max(...ys) - Math.min(...ys);
        });
        const avgHeight = heights.reduce((a, b) => a + b) / heights.length;
        
        // Group results into lines
        const lines = [];
        let currentLine = [filteredResults[0]];
        
        for (let i = 1; i < filteredResults.length; i++) {
            const current = filteredResults[i];
            const previous = filteredResults[i - 1];
            
            const prevY = Math.min(...previous.box.map(p => p[1]));
            const currY = Math.min(...current.box.map(p => p[1]));
            
            const verticalGap = Math.abs(currY - prevY);
            const threshold = avgHeight * CONFIG.vertical_gap_threshold;
            
            if (verticalGap <= threshold) {
                currentLine.push(current);
            } else {
                lines.push(currentLine);
                currentLine = [current];
            }
        }
        
        if (currentLine.length > 0) {
            lines.push(currentLine);
        }
        
        // Merge text within each line
        const mergedResults = [];
        for (const line of lines) {
            // Sort by x-coordinate within line
            line.sort((a, b) => {
                const aX = Math.min(...a.box.map(p => p[0]));
                const bX = Math.min(...b.box.map(p => p[0]));
                return aX - bX;
            });
            
            // Merge text
            const text = line.map(r => r.text).join(' ');
            const avgConfidence = line.reduce((sum, r) => sum + r.confidence, 0) / line.length;
            
            // Calculate combined bounding box
            const allPoints = line.flatMap(r => r.box);
            const xs = allPoints.map(p => p[0]);
            const ys = allPoints.map(p => p[1]);
            
            mergedResults.push({
                text: text,
                confidence: avgConfidence,
                box: [
                    [Math.min(...xs), Math.min(...ys)],
                    [Math.max(...xs), Math.min(...ys)],
                    [Math.max(...xs), Math.max(...ys)],
                    [Math.min(...xs), Math.max(...ys)]
                ]
            });
        }
        
        return mergedResults;
    }

    filterResults(results) {
        // Filter out low confidence results - much lower threshold
        const textScoreThreshold = CONFIG.drop_score; // Use the configured drop score
        return results.filter(result => {
            // Keep results with any reasonable confidence
            if (result.confidence < textScoreThreshold) {
                return false;
            }
            
            // Keep any text that has content (even single characters)
            return result.text && result.text.trim().length > 0;
        });
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
            
            // Convert to blob
            const blob = await new Promise(resolve => canvas.toBlob(resolve));
            
            // Process as image
            const pageResults = await this.process(blob);
            
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
            const url = URL.createObjectURL(blob);
            
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image'));
            };
            
            img.src = url;
        });
    }
    
    postProcessEnglishText(results) {
        // English-specific post-processing
        return results.map(result => {
            let text = result.text;
            
            // Fix common OCR errors in English
            text = text
                .replace(/([a-z])([A-Z])/g, '$1 $2')  // Split camelCase
                .replace(/([a-zA-Z])(\d)/g, '$1 $2')   // Split letters from numbers
                .replace(/(\d)([a-zA-Z])/g, '$1 $2')   // Split numbers from letters
                .replace(/\s+/g, ' ')                   // Normalize whitespace
                .replace(/([.,!?;:])([a-zA-Z])/g, '$1 $2') // Add space after punctuation
                .trim();
            
            // Common English OCR corrections
            const corrections = {
                'tne': 'the',
                'tnat': 'that',
                'wnen': 'when',
                'wnere': 'where',
                'witn': 'with',
                'l\'': 'I\'',
                ' l ': ' I ',
                '^l ': 'I ',
            };
            
            for (const [wrong, correct] of Object.entries(corrections)) {
                const regex = new RegExp(wrong, 'gi');
                text = text.replace(regex, correct);
            }
            
            return {
                ...result,
                text: text
            };
        });
    }
}

// Create singleton instance
export const ppOCRImprovedEngine = new PPOCRImprovedEngine();