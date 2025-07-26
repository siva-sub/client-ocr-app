/**
 * Main script for Mantine UI version
 * Handles Tesseract and PaddleOCR engines
 */

import Tesseract from 'tesseract.js';
import { PaddleOCR } from './paddle-ocr.js';
import { improvedPreprocessingUnit } from './preprocessing-unit.js';
import { applyOptimalConfiguration } from './optimal-ocr-configs.js';
import { PPOCRv5OnnxEngine } from './ppocr-v5-onnx-engine.js';
import { ocrCache } from './ocr-cache-manager.js';
import { AdvancedOCROptions } from './onnx-ocr-advanced.js';

// Global engines
let tesseractWorker = null;
let paddleOCRInstance = null;
let ppOCRv5Engine = null;

// Initialize Tesseract
async function initializeTesseract() {
    if (!tesseractWorker) {
        tesseractWorker = await Tesseract.createWorker({
            logger: m => console.log('Tesseract:', m)
        });
        await tesseractWorker.loadLanguage('eng');
        await tesseractWorker.initialize('eng');
    }
    return tesseractWorker;
}

// Initialize PaddleOCR
async function initializePaddleOCR() {
    if (!paddleOCRInstance) {
        paddleOCRInstance = new PaddleOCR();
        await paddleOCRInstance.init();
    }
    return paddleOCRInstance;
}

// Process with Tesseract
async function processWithTesseract(file, progressCallback) {
    const worker = await initializeTesseract();
    const result = await worker.recognize(file);
    return {
        text: result.data.text,
        boxes: result.data.words.map(word => ({
            text: word.text,
            bbox: word.bbox
        }))
    };
}

// Process with PaddleOCR
async function processWithPaddleOCR(file, options, progressCallback) {
    const paddle = await initializePaddleOCR();
    
    // Apply configuration
    if (options.preset && options.preset !== 'custom') {
        applyOptimalConfiguration(paddle, options.preset);
    }
    
    // Convert file to canvas
    const canvas = await fileToCanvas(file);
    
    // Apply preprocessing if improved mode
    let processedCanvas = canvas;
    if (options.preprocessing === 'improved') {
        processedCanvas = await improvedPreprocessingUnit.processImage(canvas);
    }
    
    // Run OCR
    const result = await paddle.detect(processedCanvas);
    
    return {
        text: result.text || '',
        boxes: result.boxes || []
    };
}

// Convert file to canvas
async function fileToCanvas(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            resolve(canvas);
        };
        
        img.onerror = reject;
        img.src = url;
    });
}

// Export functions for use in index.html
window.OCREngine = {
    processWithTesseract,
    processWithPaddleOCR,
    PPOCRv5OnnxEngine,
    ocrCache,
    AdvancedOCROptions
};