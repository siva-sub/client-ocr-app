/**
 * PaddleOCR wrapper using the refactored OnnxOCR engine
 * Provides a simplified interface for the UI
 */

import { OnnxOCREngine } from './onnx-ocr-engine.js';
import { getModelConfig, getMergedConfig, APP_CONFIG } from './config.js';

export class PaddleOCR {
    constructor() {
        this.engine = null;
        this.currentModelId = null;
        this.currentPresetId = null;
        this.initialized = false;
    }

    /**
     * Initialize with a specific model and preset
     * @param {Object} options - Initialization options
     * @param {string} options.modelId - Model ID from config.js
     * @param {string} options.presetId - Preset ID from config.js
     * @param {Function} options.progressCallback - Progress callback
     */
    async initialize(options = {}) {
        const {
            modelId = APP_CONFIG.defaultModel,
            presetId = APP_CONFIG.defaultPreset,
            progressCallback = null
        } = options;

        // Don't reinitialize if already using the same model
        if (this.initialized && this.currentModelId === modelId) {
            return;
        }

        try {
            // Clean up existing engine
            if (this.engine) {
                await this.engine.dispose();
            }

            // Get merged configuration
            const config = getMergedConfig(modelId, presetId);
            
            // Create new engine instance
            this.engine = new OnnxOCREngine();
            
            // Initialize with the configuration
            await this.engine.initialize(config, progressCallback);
            
            this.currentModelId = modelId;
            this.currentPresetId = presetId;
            this.initialized = true;
            
            progressCallback?.({ 
                status: 'ready', 
                message: 'PaddleOCR initialized successfully!' 
            });
        } catch (error) {
            console.error('Failed to initialize PaddleOCR:', error);
            this.initialized = false;
            throw error;
        }
    }

    /**
     * Alias for initialize for backward compatibility
     */
    async init(progressCallback) {
        return this.initialize({ progressCallback });
    }

    /**
     * Process an image with OCR
     * @param {File|Blob|HTMLCanvasElement|string} input - Input image
     * @param {Object} options - Processing options
     * @returns {Object} OCR results
     */
    async process(input, options = {}) {
        if (!this.initialized || !this.engine) {
            throw new Error('PaddleOCR not initialized');
        }

        const {
            progressCallback = null,
            useCache = true,
            useAngleCls = true
        } = options;

        return await this.engine.process(input, {
            useCache,
            useAngleCls,
            progressCallback
        });
    }

    /**
     * Detect text regions (used by UI for visualization)
     * @param {HTMLCanvasElement} canvas - Input canvas
     * @returns {Object} Detection results
     */
    async detect(canvas) {
        if (!this.initialized || !this.engine) {
            throw new Error('PaddleOCR not initialized');
        }

        // Run full OCR but only return detection results
        const result = await this.engine.process(canvas, {
            useCache: false,
            progressCallback: null
        });
        
        return {
            boxes: result.boxes,
            regions: result.lines.map(line => ({
                box: line.box,
                confidence: line.confidence
            }))
        };
    }

    /**
     * Change the OCR model
     * @param {string} modelId - Model ID from config.js
     * @param {Function} progressCallback - Progress callback
     */
    async changeModel(modelId, progressCallback = null) {
        if (!getModelConfig(modelId)) {
            throw new Error(`Invalid model ID: ${modelId}`);
        }

        await this.initialize({
            modelId,
            presetId: this.currentPresetId,
            progressCallback
        });
    }

    /**
     * Change the preset configuration
     * @param {string} presetId - Preset ID from config.js
     * @param {Function} progressCallback - Progress callback
     */
    async changePreset(presetId, progressCallback = null) {
        await this.initialize({
            modelId: this.currentModelId,
            presetId,
            progressCallback
        });
    }

    /**
     * Apply custom configuration (backward compatibility)
     * @param {Object} config - Custom configuration
     */
    applyConfig(config) {
        if (!this.engine) return;
        
        // Merge custom config with current model settings
        if (this.engine.modelConfig) {
            Object.assign(this.engine.modelConfig.settings, config);
        }
    }

    /**
     * Get information about the selected models
     * @returns {Object|null} Model information
     */
    getSelectedModels() {
        if (!this.engine || !this.engine.modelConfig) {
            return null;
        }

        const modelInfo = this.engine.getModelInfo();
        
        return {
            modelId: this.currentModelId,
            presetId: this.currentPresetId,
            modelName: modelInfo.name,
            modelType: modelInfo.type,
            paths: {
                DET: modelInfo.paths.det.split('/').pop(),
                CLS: modelInfo.paths.cls ? modelInfo.paths.cls.split('/').pop() : 'Not used',
                REC: modelInfo.paths.rec ? modelInfo.paths.rec.split('/').pop() : 'Not used',
                DICT: modelInfo.paths.dict.split('/').pop()
            }
        };
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return this.engine ? this.engine.getCacheStats() : null;
    }

    /**
     * Clear the cache
     */
    clearCache() {
        if (this.engine) {
            this.engine.clearCache();
        }
    }

    /**
     * Dispose of resources
     */
    async dispose() {
        if (this.engine) {
            await this.engine.dispose();
            this.engine = null;
        }
        this.initialized = false;
        this.currentModelId = null;
        this.currentPresetId = null;
    }
}

// Create singleton instance for backward compatibility
export const paddleOCR = new PaddleOCR();