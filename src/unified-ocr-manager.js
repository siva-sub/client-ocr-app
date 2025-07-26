import { OnnxOCRProcessor } from './onnx-ocr-processor.js';
import { PPUPaddleProcessor } from './ppu-paddle-processor.js';
import { PPUCompleteProcessor } from './ppu-complete-processor.js';
import { OnnxCompleteProcessor } from './onnx-complete-processor.js';
import { ModelDownloader } from './model-downloader.js';
import { MODEL_CONFIGS } from './model-configs.js';
import { SecureModelDownloader } from './secure-model-loader.js';
import { MemoryMonitor } from './resource-manager.js';
import Tesseract from 'tesseract.js';

export class UnifiedOCRManager {
    constructor() {
        this.processors = {
            onnx: null,
            ppu: null,
            tesseract: null
        };
        
        this.modelDownloader = new SecureModelDownloader({
            verifyIntegrity: true
        });
        this.currentEngine = null;
        this.currentConfig = null;
        this.isInitializing = false;
        
        // Tesseract worker
        this.tesseractWorker = null;
        
        // Event handlers
        this.onProgress = null;
        this.onStatusChange = null;
        
        // Memory monitoring
        this.memoryMonitor = new MemoryMonitor({
            warningThreshold: 0.7,
            criticalThreshold: 0.85,
            onWarning: (stats) => {
                console.warn('Memory warning:', stats);
                this.updateStatus('High memory usage detected');
                this.attemptMemoryCleanup();
            },
            onCritical: (stats) => {
                console.error('Critical memory pressure:', stats);
                this.updateStatus('Critical memory pressure - clearing caches');
                this.emergencyMemoryCleanup();
            },
            onRecovered: (stats) => {
                console.log('Memory pressure recovered:', stats);
                this.updateStatus('Memory usage normalized');
            }
        });
        
        // Start memory monitoring
        this.memoryMonitor.startMonitoring();
    }

    async initialize(engineType = 'ppu-mobile', onProgress = null) {
        if (this.isInitializing) {
            console.log('OCR Manager already initializing...');
            return;
        }

        this.isInitializing = true;
        this.onProgress = onProgress;

        try {
            this.updateStatus('Initializing OCR engine...');
            
            if (engineType === 'tesseract') {
                await this.initializeTesseract();
            } else {
                const config = MODEL_CONFIGS[engineType];
                if (!config) {
                    throw new Error(`Unknown engine type: ${engineType}`);
                }
                
                // Download models
                this.updateStatus(`Downloading ${config.name} models...`);
                const modelData = await this.downloadModelsForConfig(engineType, config);
                
                // Initialize appropriate processor
                if (engineType.startsWith('ppu')) {
                    await this.initializePPU(config, modelData);
                } else if (engineType.startsWith('onnx')) {
                    await this.initializeOnnx(config, modelData);
                }
            }
            
            this.currentEngine = engineType;
            this.currentConfig = MODEL_CONFIGS[engineType];
            this.updateStatus('OCR engine ready');
            
        } catch (error) {
            console.error('Failed to initialize OCR:', error);
            this.updateStatus('Failed to initialize OCR engine');
            throw error;
        } finally {
            this.isInitializing = false;
        }
    }

    async downloadModelsForConfig(configKey, config) {
        const models = {};
        
        // Download detection model
        if (config.det) {
            this.updateStatus('Downloading detection model...');
            const detData = await this.modelDownloader.downloadModel(
                config.det,
                (progress) => {
                    if (this.onProgress) {
                        this.onProgress({
                            type: 'model-download',
                            model: 'detection',
                            ...progress
                        });
                    }
                }
            );
            models.det = detData;
        }
        
        // Download recognition model
        if (config.rec) {
            this.updateStatus('Downloading recognition model...');
            const recData = await this.modelDownloader.downloadModel(
                config.rec,
                (progress) => {
                    if (this.onProgress) {
                        this.onProgress({
                            type: 'model-download',
                            model: 'recognition',
                            ...progress
                        });
                    }
                }
            );
            models.rec = recData;
        }
        
        // Download classification model if available
        if (config.cls) {
            this.updateStatus('Downloading classification model...');
            const clsData = await this.modelDownloader.downloadModel(
                config.cls,
                (progress) => {
                    if (this.onProgress) {
                        this.onProgress({
                            type: 'model-download',
                            model: 'classification',
                            ...progress
                        });
                    }
                }
            );
            models.cls = clsData;
        }
        
        return models;
    }

    async initializePPU(config, modelData) {
        this.updateStatus('Initializing PPU Paddle processor...');
        
        if (!this.processors.ppu) {
            // Use complete PPU processor with all processing methods
            this.processors.ppu = new PPUCompleteProcessor();
        }
        
        await this.processors.ppu.initialize(config, modelData);
    }

    async initializeOnnx(config, modelData) {
        this.updateStatus('Initializing Onnx OCR processor...');
        
        if (!this.processors.onnx) {
            // Use complete OnnxOCR processor with TextSystem implementation
            this.processors.onnx = new OnnxCompleteProcessor();
        }
        
        await this.processors.onnx.initialize(config, modelData);
    }

    async initializeTesseract() {
        this.updateStatus('Initializing Tesseract...');
        
        if (!this.tesseractWorker) {
            this.tesseractWorker = await Tesseract.createWorker({
                logger: (m) => {
                    if (this.onProgress) {
                        this.onProgress({
                            type: 'tesseract',
                            status: m.status,
                            progress: m.progress
                        });
                    }
                }
            });
            
            await this.tesseractWorker.loadLanguage('eng');
            await this.tesseractWorker.initialize('eng');
            await this.tesseractWorker.setParameters({
                tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
                preserve_interword_spaces: '1',
            });
        }
        
        this.processors.tesseract = {
            processImage: async (imageData) => {
                const canvas = document.createElement('canvas');
                canvas.width = imageData.width;
                canvas.height = imageData.height;
                const ctx = canvas.getContext('2d');
                ctx.putImageData(imageData, 0, 0);
                
                const result = await this.tesseractWorker.recognize(canvas);
                
                // Convert Tesseract format to our standard format
                return {
                    boxes: result.data.words.map(word => {
                        const bbox = word.bbox;
                        return [
                            { x: bbox.x0, y: bbox.y0 },
                            { x: bbox.x1, y: bbox.y0 },
                            { x: bbox.x1, y: bbox.y1 },
                            { x: bbox.x0, y: bbox.y1 }
                        ];
                    }),
                    texts: result.data.words.map(word => ({
                        text: word.text,
                        confidence: word.confidence / 100,
                        box: [
                            { x: word.bbox.x0, y: word.bbox.y0 },
                            { x: word.bbox.x1, y: word.bbox.y0 },
                            { x: word.bbox.x1, y: word.bbox.y1 },
                            { x: word.bbox.x0, y: word.bbox.y1 }
                        ]
                    })),
                    fullText: result.data.text,
                    timestamp: Date.now()
                };
            },
            visualizeResults: (canvas, results) => {
                const ctx = canvas.getContext('2d');
                
                results.texts.forEach(item => {
                    const box = item.box;
                    
                    // Draw bounding box
                    ctx.strokeStyle = '#ff0000';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(
                        box[0].x, box[0].y,
                        box[1].x - box[0].x,
                        box[2].y - box[0].y
                    );
                    
                    // Draw text label
                    const text = `${item.text} (${(item.confidence * 100).toFixed(0)}%)`;
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(box[0].x, box[0].y - 20, ctx.measureText(text).width + 10, 20);
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '14px Arial';
                    ctx.fillText(text, box[0].x + 5, box[0].y - 5);
                });
            }
        };
    }

    async processImage(imageData) {
        if (!this.currentEngine) {
            throw new Error('No OCR engine initialized');
        }

        // Check memory before processing
        const memStats = this.memoryMonitor.checkMemoryPressure();
        if (memStats && memStats.usage > 0.9) {
            await this.emergencyMemoryCleanup();
        }

        this.updateStatus('Processing image...');

        try {
            let processor;
            
            if (this.currentEngine === 'tesseract') {
                processor = this.processors.tesseract;
            } else if (this.currentEngine.startsWith('ppu')) {
                processor = this.processors.ppu;
            } else if (this.currentEngine.startsWith('onnx')) {
                processor = this.processors.onnx;
            }

            if (!processor) {
                throw new Error('Processor not available');
            }

            const startTime = performance.now();
            const result = await processor.processImage(imageData);
            const totalTime = performance.now() - startTime;

            result.engine = this.currentEngine;
            result.processingTime = totalTime;

            this.updateStatus(`Processing complete (${totalTime.toFixed(0)}ms)`);
            
            // Attempt cleanup after processing
            if (MemoryMonitor.forceGC()) {
                console.log('Forced garbage collection after processing');
            }
            
            return result;
        } catch (error) {
            console.error('Error processing image:', error);
            
            // Check if error is memory-related
            if (error.message && error.message.includes('memory')) {
                await this.emergencyMemoryCleanup();
            }
            
            // Fallback to Tesseract if other engines fail
            if (this.currentEngine !== 'tesseract') {
                console.log('Falling back to Tesseract...');
                this.updateStatus('Falling back to Tesseract...');
                
                await this.initialize('tesseract');
                return await this.processImage(imageData);
            }
            
            throw error;
        }
    }

    visualizeResults(canvas, results) {
        const processor = this.getActiveProcessor();
        if (processor && processor.visualizeResults) {
            processor.visualizeResults(canvas, results);
        }
    }

    getActiveProcessor() {
        if (this.currentEngine === 'tesseract') {
            return this.processors.tesseract;
        } else if (this.currentEngine?.startsWith('ppu')) {
            return this.processors.ppu;
        } else if (this.currentEngine?.startsWith('onnx')) {
            return this.processors.onnx;
        }
        return null;
    }

    async switchEngine(engineType) {
        if (engineType === this.currentEngine) {
            console.log('Engine already active:', engineType);
            return;
        }

        await this.initialize(engineType, this.onProgress);
    }

    getAvailableEngines() {
        return {
            'ppu-mobile': {
                ...MODEL_CONFIGS['ppu-mobile'],
                isCached: this.modelDownloader.isCached(MODEL_CONFIGS['ppu-mobile'].det?.url) &&
                         this.modelDownloader.isCached(MODEL_CONFIGS['ppu-mobile'].rec?.url)
            },
            'onnx-v5-accurate': {
                ...MODEL_CONFIGS['onnx-v5-accurate'],
                isCached: this.modelDownloader.isCached(MODEL_CONFIGS['onnx-v5-accurate'].det?.url) &&
                         this.modelDownloader.isCached(MODEL_CONFIGS['onnx-v5-accurate'].rec?.url)
            },
            'onnx-v4-balanced': {
                ...MODEL_CONFIGS['onnx-v4-balanced'],
                isCached: this.modelDownloader.isCached(MODEL_CONFIGS['onnx-v4-balanced'].det?.url) &&
                         this.modelDownloader.isCached(MODEL_CONFIGS['onnx-v4-balanced'].rec?.url)
            },
            'onnx-v2-server': {
                ...MODEL_CONFIGS['onnx-v2-server'],
                isCached: this.modelDownloader.isCached(MODEL_CONFIGS['onnx-v2-server'].det?.url) &&
                         this.modelDownloader.isCached(MODEL_CONFIGS['onnx-v2-server'].rec?.url)
            },
            'tesseract': {
                name: 'Tesseract (Fallback)',
                description: 'Classic OCR engine, works offline, good accuracy',
                isCached: true
            }
        };
    }

    updateStatus(status) {
        console.log(`[OCR Manager] ${status}`);
        if (this.onStatusChange) {
            this.onStatusChange(status);
        }
    }

    dispose() {
        // Stop memory monitoring
        if (this.memoryMonitor) {
            this.memoryMonitor.stopMonitoring();
        }
        
        // Dispose all processors
        if (this.processors.onnx) {
            this.processors.onnx.dispose();
            this.processors.onnx = null;
        }
        
        if (this.processors.ppu) {
            this.processors.ppu.dispose();
            this.processors.ppu = null;
        }
        
        if (this.tesseractWorker) {
            this.tesseractWorker.terminate();
            this.tesseractWorker = null;
            this.processors.tesseract = null;
        }
        
        // Clear model cache
        this.modelDownloader.clearCache();
        
        this.currentEngine = null;
        this.currentConfig = null;
        
        // Force garbage collection if available
        MemoryMonitor.forceGC();
    }
    
    /**
     * Attempt to free memory under pressure
     */
    async attemptMemoryCleanup() {
        console.log('Attempting memory cleanup...');
        
        // Clear unused processors
        for (const [engineType, processor] of Object.entries(this.processors)) {
            if (processor && engineType !== this.currentEngine) {
                if (processor.dispose) {
                    processor.dispose();
                }
                this.processors[engineType] = null;
            }
        }
        
        // Force garbage collection
        MemoryMonitor.forceGC();
    }
    
    /**
     * Emergency memory cleanup when critical
     */
    async emergencyMemoryCleanup() {
        console.warn('Emergency memory cleanup initiated');
        
        // Dispose all non-active processors
        await this.attemptMemoryCleanup();
        
        // Clear model cache except current
        const currentUrls = this.currentConfig ? [
            this.currentConfig.det?.url,
            this.currentConfig.rec?.url,
            this.currentConfig.cls?.url
        ].filter(Boolean) : [];
        
        // This would need to be implemented in SecureModelDownloader
        // to selectively clear cache
        
        // Force multiple GC attempts
        for (let i = 0; i < 3; i++) {
            MemoryMonitor.forceGC();
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}