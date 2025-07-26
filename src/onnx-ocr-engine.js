/**
 * OnnxOCR Engine Implementation
 * Based on https://github.com/jingsongliujing/OnnxOCR
 * Implements CLS, DET, and REC models pipeline
 */

import * as ort from 'onnxruntime-web';
import { DetectionPreprocessor, RecognitionPreprocessor, AngleClassificationPreprocessor } from './onnx-ocr-preprocessing.js';
import { DBPostProcessor, CTCDecoder } from './onnx-ocr-postprocessing.js';
import { ocrCache } from './ocr-cache-manager.js';

// Configure ONNX Runtime
const isGitHubPages = window.location.hostname.includes('github.io');
const basePath = isGitHubPages ? '/client-ocr-app' : '';
const wasmPath = `${basePath}/public/assets/`;

ort.env.wasm.wasmPaths = wasmPath;
ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;

export class OnnxOCREngine {
    constructor(options = {}) {
        this.config = {
            modelPath: options.modelPath || '/public/models/PP-OCRv5',
            useAngleCls: options.useAngleCls !== false,
            useGPU: options.useGPU || false,
            detLimitSideLen: options.detLimitSideLen || 960,
            detDbThresh: options.detDbThresh || 0.3,
            detDbBoxThresh: options.detDbBoxThresh || 0.6,
            detDbUnclipRatio: options.detDbUnclipRatio || 1.7,
            dropScore: options.dropScore || 0.5,
            ...options
        };

        // Model sessions
        this.detSession = null;
        this.clsSession = null;
        this.recSession = null;

        // Processors
        this.detPreprocessor = new DetectionPreprocessor({
            det_limit_side_len: this.config.detLimitSideLen,
            det_limit_type: 'min'
        });
        this.recPreprocessor = new RecognitionPreprocessor();
        this.clsPreprocessor = new AngleClassificationPreprocessor();

        // Post processors
        this.dbPostProcess = new DBPostProcessor({
            thresh: this.config.detDbThresh,
            box_thresh: this.config.detDbBoxThresh,
            max_candidates: 1000,
            unclip_ratio: this.config.detDbUnclipRatio
        });

        // Dictionary
        this.dictionary = null;
        this.dictPath = null;

        // Status
        this.initialized = false;
        this.selectedModels = {
            det: null,
            cls: null,
            rec: null,
            dict: null
        };
    }

    async initialize(progressCallback) {
        if (this.initialized) return;

        try {
            // Determine model paths
            const modelBase = isGitHubPages ? 
                `/client-ocr-app${this.config.modelPath}` : 
                this.config.modelPath;

            // Update selected models info
            this.selectedModels = {
                det: `${this.config.modelPath}/det/det.onnx`,
                cls: this.config.useAngleCls ? `${this.config.modelPath}/cls/cls.onnx` : 'disabled',
                rec: `${this.config.modelPath}/rec/rec.onnx`,
                dict: `${this.config.modelPath}/ppocrv5_dict.txt`
            };

            progressCallback?.({
                phase: 'model_selection',
                models: this.selectedModels,
                message: `Loading models: DET=${this.selectedModels.det}, CLS=${this.selectedModels.cls}, REC=${this.selectedModels.rec}`
            });

            // Session options
            const sessionOptions = {
                executionProviders: this.config.useGPU ? ['webgl', 'wasm'] : ['wasm'],
                graphOptimizationLevel: 'all',
                enableCpuMemArena: true,
                enableMemPattern: true,
                executionMode: 'sequential'
            };

            // Load detection model
            progressCallback?.({ phase: 'loading', message: 'Loading detection model...' });
            const detModelPath = `${modelBase}/det/det.onnx`;
            this.detSession = await ort.InferenceSession.create(detModelPath, sessionOptions);
            progressCallback?.({ phase: 'loaded', message: 'Detection model loaded', model: 'det' });

            // Load classification model if enabled
            if (this.config.useAngleCls) {
                progressCallback?.({ phase: 'loading', message: 'Loading angle classification model...' });
                const clsModelPath = `${modelBase}/cls/cls.onnx`;
                this.clsSession = await ort.InferenceSession.create(clsModelPath, sessionOptions);
                progressCallback?.({ phase: 'loaded', message: 'Classification model loaded', model: 'cls' });
            }

            // Load recognition model
            progressCallback?.({ phase: 'loading', message: 'Loading recognition model...' });
            const recModelPath = `${modelBase}/rec/rec.onnx`;
            this.recSession = await ort.InferenceSession.create(recModelPath, sessionOptions);
            progressCallback?.({ phase: 'loaded', message: 'Recognition model loaded', model: 'rec' });

            // Load dictionary
            progressCallback?.({ phase: 'loading', message: 'Loading dictionary...' });
            this.dictPath = `${modelBase}/ppocrv5_dict.txt`;
            await this.loadDictionary(this.dictPath);
            progressCallback?.({ phase: 'loaded', message: 'Dictionary loaded', dict: this.dictPath });

            this.initialized = true;
            progressCallback?.({ 
                phase: 'ready', 
                message: 'OnnxOCR engine initialized successfully',
                models: this.selectedModels
            });

        } catch (error) {
            console.error('Failed to initialize OnnxOCR:', error);
            progressCallback?.({ phase: 'error', message: error.message });
            throw error;
        }
    }

    async loadDictionary(dictPath) {
        try {
            const response = await fetch(dictPath);
            const text = await response.text();
            this.dictionary = text.trim().split('\n');
            // Add blank for CTC decoding
            this.dictionary.unshift('blank');
        } catch (error) {
            console.error('Failed to load dictionary:', error);
            throw error;
        }
    }

    async detect(imageElement, progressCallback) {
        if (!this.initialized) {
            throw new Error('OnnxOCR engine not initialized');
        }

        // Check cache first
        const cacheKey = await this.generateCacheKey(imageElement);
        const cached = ocrCache.get(cacheKey, 'onnxocr', this.config.modelPath);
        if (cached) {
            progressCallback?.({ phase: 'cache_hit', message: 'Using cached results' });
            return cached;
        }

        try {
            progressCallback?.({ phase: 'preprocessing', message: 'Preprocessing image...' });

            // Step 1: Detection preprocessing
            const detInput = await this.detPreprocessor.preprocess(imageElement);
            
            // Step 2: Run detection
            progressCallback?.({ phase: 'detection', message: 'Detecting text regions...' });
            const detOutput = await this.detSession.run({
                x: detInput.tensor
            });

            // Step 3: Detection postprocessing
            const boxes = await this.dbPostProcess.process(
                detOutput.sigmoid_0 || detOutput.output,
                detInput.originalSize,
                detInput.resizedSize,
                detInput.ratio
            );

            if (boxes.length === 0) {
                const result = { text: '', boxes: [], lines: [] };
                ocrCache.set(cacheKey, 'onnxocr', this.config.modelPath, result);
                return result;
            }

            progressCallback?.({ phase: 'detection_complete', message: `Found ${boxes.length} text regions` });

            // Step 4: Process each box
            const results = [];
            for (let i = 0; i < boxes.length; i++) {
                progressCallback?.({ 
                    phase: 'recognition', 
                    message: `Processing region ${i + 1}/${boxes.length}...`,
                    progress: (i / boxes.length) * 100
                });

                const box = boxes[i];
                
                // Crop image to box
                const cropped = await this.cropImageToBox(imageElement, box.points);
                
                // Classification (if enabled)
                let angle = 0;
                if (this.config.useAngleCls && this.clsSession) {
                    const clsInput = await this.clsPreprocessor.preprocess(cropped);
                    const clsOutput = await this.clsSession.run({
                        x: clsInput.tensor
                    });
                    
                    const probs = clsOutput.softmax_0 || clsOutput.output;
                    const probsData = probs.data;
                    angle = probsData[1] > probsData[0] ? 180 : 0;
                    
                    if (angle === 180) {
                        // Rotate image 180 degrees
                        cropped.getContext('2d').rotate(Math.PI);
                    }
                }

                // Recognition preprocessing
                const recInput = await this.recPreprocessor.preprocess(cropped);
                
                // Run recognition
                const recOutput = await this.recSession.run({
                    x: recInput.tensor
                });

                // Decode text
                const logits = recOutput.softmax_0 || recOutput.output;
                const decoder = new CTCDecoder(this.dictionary);
                const [text, confidence] = decoder.decode(logits.data, logits.dims);

                if (confidence >= this.config.dropScore) {
                    results.push({
                        text: text.trim(),
                        confidence: confidence,
                        box: box.points,
                        angle: angle
                    });
                }
            }

            // Sort results by position (top to bottom, left to right)
            results.sort((a, b) => {
                const aTop = Math.min(...a.box.map(p => p[1]));
                const bTop = Math.min(...b.box.map(p => p[1]));
                if (Math.abs(aTop - bTop) < 10) {
                    const aLeft = Math.min(...a.box.map(p => p[0]));
                    const bLeft = Math.min(...b.box.map(p => p[0]));
                    return aLeft - bLeft;
                }
                return aTop - bTop;
            });

            // Combine results
            const finalResult = {
                text: results.map(r => r.text).join('\n'),
                boxes: results.map(r => r.box),
                lines: results,
                modelInfo: this.selectedModels
            };

            // Cache result
            ocrCache.set(cacheKey, 'onnxocr', this.config.modelPath, finalResult);

            progressCallback?.({ 
                phase: 'complete', 
                message: 'OCR processing complete',
                resultCount: results.length
            });

            return finalResult;

        } catch (error) {
            console.error('OCR processing error:', error);
            progressCallback?.({ phase: 'error', message: error.message });
            throw error;
        }
    }

    async cropImageToBox(imageElement, points) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Calculate bounding box
        const xs = points.map(p => p[0]);
        const ys = points.map(p => p[1]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const width = maxX - minX;
        const height = maxY - minY;

        canvas.width = width;
        canvas.height = height;

        // Draw cropped region
        ctx.drawImage(
            imageElement,
            minX, minY, width, height,
            0, 0, width, height
        );

        return canvas;
    }

    async generateCacheKey(imageElement) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Resize to small size for hashing
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(imageElement, 0, 0, size, size);
        
        return canvas.toDataURL('image/jpeg', 0.5);
    }

    async process(file, progressCallback) {
        // Convert file to image element
        const imageElement = await this.fileToImage(file);
        return await this.detect(imageElement, progressCallback);
    }

    async fileToImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            
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

    getSelectedModels() {
        return this.selectedModels;
    }
}

// Export singleton instance
export const onnxOCREngine = new OnnxOCREngine();