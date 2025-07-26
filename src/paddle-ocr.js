import { OnnxOCREngine } from './onnx-ocr-engine.js';

export class PaddleOCR {
    constructor() {
        this.engine = null;
        this.initialized = false;
        this.CONFIG = {};
        this.config = {};
    }

    async initialize(progressCallback) {
        if (this.initialized) return;

        try {
            // Create OnnxOCR engine instance
            this.engine = new OnnxOCREngine({
                modelPath: 'models/PP-OCRv5',
                useAngleCls: true,
                useGPU: false
            });

            // Initialize the engine
            await this.engine.initialize(progressCallback);
            
            this.initialized = true;
            
            progressCallback?.({ status: 'ready', message: 'PaddleOCR initialized successfully!' });
        } catch (error) {
            console.error('Failed to initialize PaddleOCR:', error);
            throw error;
        }
    }

    async init() {
        // Alias for initialize
        return this.initialize();
    }

    async detect(canvas) {
        if (!this.initialized || !this.engine) {
            throw new Error('PaddleOCR not initialized');
        }

        // Use the OnnxOCR engine to detect text
        const result = await this.engine.detect(canvas);
        
        return result;
    }

    async process(file, progressCallback) {
        if (!this.initialized || !this.engine) {
            throw new Error('PaddleOCR not initialized');
        }

        // Use the OnnxOCR engine to process
        return await this.engine.process(file, progressCallback);
    }

    // Apply configuration from optimal configs
    applyConfig(config) {
        if (!this.engine) return;
        
        // Update engine configuration
        Object.assign(this.engine.config, config);
        
        // Update local config references for compatibility
        this.CONFIG = { ...this.CONFIG, ...config };
        this.config = { ...this.config, ...config };
    }

    // Get selected models info
    getSelectedModels() {
        return this.engine ? this.engine.getSelectedModels() : null;
    }
}

// Create singleton instance
export const paddleOCR = new PaddleOCR();