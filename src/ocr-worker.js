/**
 * Web Worker for OCR processing
 * Moves heavy computation off the main thread
 */

// Import ONNX Runtime in worker context
importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/ort.min.js');

// Worker state
let currentProcessor = null;
let isInitialized = false;
let modelCache = new Map();

// Message handler
self.addEventListener('message', async (event) => {
    const { type, data, id } = event.data;
    
    try {
        let result;
        
        switch (type) {
            case 'init':
                result = await handleInit(data);
                break;
                
            case 'process':
                result = await handleProcess(data);
                break;
                
            case 'dispose':
                result = await handleDispose();
                break;
                
            case 'get-stats':
                result = getWorkerStats();
                break;
                
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
        
        // Send success response
        self.postMessage({
            id,
            type: 'success',
            result
        });
        
    } catch (error) {
        // Send error response
        self.postMessage({
            id,
            type: 'error',
            error: {
                message: error.message,
                stack: error.stack
            }
        });
    }
});

/**
 * Initialize the worker with a specific OCR engine
 */
async function handleInit(data) {
    const { engineType, modelData, config } = data;
    
    // Configure ONNX Runtime for Web Worker
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/';
    ort.env.wasm.numThreads = 1; // Use single thread in worker
    
    // Create appropriate processor based on engine type
    if (engineType === 'ppu-worker') {
        currentProcessor = new PPUWorkerProcessor();
    } else if (engineType === 'onnx-worker') {
        currentProcessor = new ONNXWorkerProcessor();
    } else {
        throw new Error(`Unsupported engine type: ${engineType}`);
    }
    
    // Initialize processor with models
    await currentProcessor.initialize(config, modelData);
    isInitialized = true;
    
    return {
        engineType,
        initialized: true,
        workerInfo: {
            threadId: self.name || 'unnamed',
            memoryUsage: getMemoryUsage()
        }
    };
}

/**
 * Process an image
 */
async function handleProcess(data) {
    if (!isInitialized || !currentProcessor) {
        throw new Error('Worker not initialized');
    }
    
    const { imageData, options } = data;
    
    // Reconstruct ImageData object
    const reconstructedImageData = new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height
    );
    
    // Process image
    const startTime = performance.now();
    const result = await currentProcessor.processImage(reconstructedImageData, options);
    const processingTime = performance.now() - startTime;
    
    return {
        ...result,
        processingTime,
        workerStats: getMemoryUsage()
    };
}

/**
 * Dispose resources
 */
async function handleDispose() {
    if (currentProcessor && currentProcessor.dispose) {
        await currentProcessor.dispose();
    }
    
    currentProcessor = null;
    isInitialized = false;
    modelCache.clear();
    
    // Force garbage collection if available
    if (self.gc) {
        self.gc();
    }
    
    return { disposed: true };
}

/**
 * Get worker statistics
 */
function getWorkerStats() {
    return {
        initialized: isInitialized,
        engineType: currentProcessor ? currentProcessor.type : null,
        memory: getMemoryUsage(),
        modelCacheSize: modelCache.size
    };
}

/**
 * Get memory usage if available
 */
function getMemoryUsage() {
    if (performance.memory) {
        return {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
            usage: performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit
        };
    }
    return null;
}

/**
 * Simplified PPU processor for Web Worker
 */
class PPUWorkerProcessor {
    constructor() {
        this.type = 'ppu-worker';
        this.detModel = null;
        this.recModel = null;
        this.isInitialized = false;
    }
    
    async initialize(config, modelData) {
        const sessionOptions = {
            executionProviders: ['wasm'],
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
        
        this.config = config;
        this.isInitialized = true;
    }
    
    async processImage(imageData, options = {}) {
        // Simplified processing pipeline
        // In real implementation, this would include full PPU pipeline
        
        const boxes = await this.detectText(imageData);
        const texts = await this.recognizeText(imageData, boxes);
        
        return {
            boxes,
            texts,
            timestamp: Date.now()
        };
    }
    
    async detectText(imageData) {
        // Simplified detection
        // Real implementation would preprocess image and run inference
        
        if (!this.detModel) {
            return [];
        }
        
        // Placeholder - return dummy boxes
        return [
            { x: 10, y: 10, width: 100, height: 30 },
            { x: 10, y: 50, width: 150, height: 30 }
        ];
    }
    
    async recognizeText(imageData, boxes) {
        // Simplified recognition
        // Real implementation would crop regions and run inference
        
        if (!this.recModel) {
            return [];
        }
        
        // Placeholder - return dummy texts
        return boxes.map((box, i) => ({
            text: `Text ${i + 1}`,
            confidence: 0.95,
            box
        }));
    }
    
    async dispose() {
        if (this.detModel) {
            await this.detModel.release();
            this.detModel = null;
        }
        
        if (this.recModel) {
            await this.recModel.release();
            this.recModel = null;
        }
        
        this.isInitialized = false;
    }
}

/**
 * Simplified ONNX processor for Web Worker
 */
class ONNXWorkerProcessor {
    constructor() {
        this.type = 'onnx-worker';
        this.textSystem = null;
        this.isInitialized = false;
    }
    
    async initialize(config, modelData) {
        // Initialize ONNX text system
        // Simplified for worker context
        
        this.config = config;
        this.modelData = modelData;
        this.isInitialized = true;
    }
    
    async processImage(imageData, options = {}) {
        // Simplified ONNX processing
        // Real implementation would use TextSystem pipeline
        
        return {
            boxes: [],
            texts: [],
            timestamp: Date.now()
        };
    }
    
    async dispose() {
        this.textSystem = null;
        this.isInitialized = false;
    }
}

/**
 * Utility function to transfer large arrays efficiently
 */
function createTransferable(data) {
    if (data instanceof ArrayBuffer) {
        return { data, transferable: [data] };
    }
    
    if (data instanceof Uint8Array) {
        const buffer = data.buffer.slice(0);
        return { data: new Uint8Array(buffer), transferable: [buffer] };
    }
    
    return { data, transferable: [] };
}