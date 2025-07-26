/**
 * Main entry point for Smart OCR PWA
 * Refactored to use centralized configuration and better architecture
 */

import Tesseract from 'tesseract.js';
import { PaddleOCR } from './paddle-ocr.js';
import { 
    OCR_MODELS, 
    PRESET_CONFIGS, 
    ENGINE_TYPES,
    TESSERACT_CONFIG,
    APP_CONFIG,
    getModelConfig,
    getPresetConfig
} from './config.js';
import { getAssetUrl, formatFileSize, isCrossOriginIsolated } from './utils.js';
import { ocrCache } from './ocr-cache-manager.js';

// Global state
const engines = {
    tesseract: null,
    paddleOCR: null
};

// Current selections
let currentEngine = APP_CONFIG.defaultEngine;
let currentModelId = APP_CONFIG.defaultModel;
let currentPresetId = APP_CONFIG.defaultPreset;

/**
 * Initialize service worker
 */
async function initializeServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            // Use enhanced service worker for COOP/COEP
            const swPath = getAssetUrl('sw-enhanced.js');
            const registration = await navigator.serviceWorker.register(swPath, {
                scope: getAssetUrl('')
            });
            
            console.log('Service Worker registered:', registration.scope);
            
            // Check if we have cross-origin isolation
            if (isCrossOriginIsolated()) {
                console.log('Cross-origin isolation enabled - WebAssembly threading available');
            }
            
            return registration;
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
}

/**
 * Initialize Tesseract engine
 */
async function initializeTesseract(progressCallback = null) {
    if (engines.tesseract) {
        return engines.tesseract;
    }

    progressCallback?.('Initializing Tesseract...');
    
    engines.tesseract = await Tesseract.createWorker('eng', 1, {
        logger: TESSERACT_CONFIG.logger,
        workerPath: TESSERACT_CONFIG.workerPath,
        langPath: TESSERACT_CONFIG.langPath,
        corePath: TESSERACT_CONFIG.corePath
    });
    
    progressCallback?.('Tesseract ready!');
    
    return engines.tesseract;
}

/**
 * Initialize PaddleOCR engine with selected model
 */
async function initializePaddleOCR(modelId = null, presetId = null, progressCallback = null) {
    if (!engines.paddleOCR) {
        engines.paddleOCR = new PaddleOCR();
    }
    
    await engines.paddleOCR.initialize({
        modelId: modelId || currentModelId,
        presetId: presetId || currentPresetId,
        progressCallback
    });
    
    return engines.paddleOCR;
}

/**
 * Process image with selected engine
 */
async function processImage(file, options = {}, progressCallback = null) {
    const {
        engine = currentEngine,
        modelId = currentModelId,
        presetId = currentPresetId,
        useCache = true
    } = options;
    
    // Check file size
    if (file.size > APP_CONFIG.maxFileSize) {
        throw new Error(`File too large. Maximum size is ${formatFileSize(APP_CONFIG.maxFileSize)}`);
    }
    
    // Check file type
    if (!APP_CONFIG.supportedFormats.includes(file.type)) {
        throw new Error(`Unsupported file type: ${file.type}`);
    }
    
    try {
        switch (engine) {
            case ENGINE_TYPES.TESSERACT:
                return await processWithTesseract(file, progressCallback);
                
            case ENGINE_TYPES.PADDLE_OCR:
            case ENGINE_TYPES.PPOCR_V5:
                return await processWithPaddleOCR(file, {
                    modelId,
                    presetId,
                    useCache
                }, progressCallback);
                
            default:
                throw new Error(`Unknown engine: ${engine}`);
        }
    } catch (error) {
        console.error('OCR processing error:', error);
        throw error;
    }
}

/**
 * Process with Tesseract
 */
async function processWithTesseract(file, progressCallback) {
    const worker = await initializeTesseract(progressCallback);
    
    progressCallback?.('Processing with Tesseract...');
    
    const result = await worker.recognize(file, {
        rotateAuto: true
    });
    
    return {
        text: result.data.text,
        boxes: result.data.words.map(word => ({
            text: word.text,
            bbox: word.bbox,
            confidence: word.confidence
        })),
        lines: result.data.lines.map(line => ({
            text: line.text,
            bbox: line.bbox,
            confidence: line.confidence
        })),
        engineName: 'Tesseract',
        timestamp: new Date().toISOString()
    };
}

/**
 * Process with PaddleOCR
 */
async function processWithPaddleOCR(file, options, progressCallback) {
    const { modelId, presetId, useCache } = options;
    
    // Initialize or reinitialize with selected model
    const paddle = await initializePaddleOCR(modelId, presetId, progressCallback);
    
    progressCallback?.('Processing with PaddleOCR...');
    
    // Process the image
    const result = await paddle.process(file, {
        useCache,
        progressCallback
    });
    
    return result;
}

/**
 * Update UI with model selection
 */
function updateModelSelection(modelId, presetId) {
    currentModelId = modelId;
    currentPresetId = presetId;
    
    // Update model info display
    const modelInfo = engines.paddleOCR?.getSelectedModels();
    if (modelInfo) {
        updateModelInfoDisplay(modelInfo);
    }
}

/**
 * Update model info display in UI
 */
function updateModelInfoDisplay(modelInfo) {
    const modelInfoSection = document.getElementById('modelInfoSection');
    if (!modelInfoSection) return;
    
    // Show the section
    modelInfoSection.style.display = 'block';
    
    // Update model paths
    document.getElementById('selectedDET').textContent = modelInfo.paths.DET;
    document.getElementById('selectedCLS').textContent = modelInfo.paths.CLS;
    document.getElementById('selectedREC').textContent = modelInfo.paths.REC;
    document.getElementById('selectedDICT').textContent = modelInfo.paths.DICT;
}

/**
 * Clear OCR cache
 */
function clearCache() {
    ocrCache.clear();
    console.log('OCR cache cleared');
}

/**
 * Get cache statistics
 */
function getCacheStats() {
    return ocrCache.getStats();
}

/**
 * Cleanup resources
 */
async function cleanup() {
    if (engines.tesseract) {
        await engines.tesseract.terminate();
        engines.tesseract = null;
    }
    
    if (engines.paddleOCR) {
        await engines.paddleOCR.dispose();
        engines.paddleOCR = null;
    }
}

// Export for use in UI
export {
    initializeServiceWorker,
    processImage,
    updateModelSelection,
    clearCache,
    getCacheStats,
    cleanup,
    OCR_MODELS,
    PRESET_CONFIGS,
    ENGINE_TYPES,
    currentEngine,
    currentModelId,
    currentPresetId
};

// Initialize service worker on load
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        initializeServiceWorker();
    });
    
    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
        cleanup();
    });
}