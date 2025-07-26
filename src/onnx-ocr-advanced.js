/**
 * Advanced OnnxOCR functionalities
 * Includes multi-language support, batch processing, and advanced options
 */

import { PPOCRv5OnnxEngine } from './ppocr-v5-onnx-engine.js';
import { ocrCache } from './ocr-cache-manager.js';
import { 
    drawOCRResults, 
    createOCRVisualization, 
    sortTextRegions,
    groupTextIntoLines,
    formatOCRResults 
} from './ocr-utils.js';

/**
 * Multi-language OCR engine supporting multiple languages
 */
export class MultiLanguageOCREngine extends PPOCRv5OnnxEngine {
    constructor(options = {}) {
        super(options);
        
        // Language-specific model configurations
        this.languageModels = {
            'en': {
                modelName: 'PP-OCRv4_mobile',
                dict: '/public/models/en_dict.txt'
            },
            'ch': {
                modelName: 'PP-OCRv5',
                dict: '/public/models/ppocrv5_dict.txt'
            },
            'japan': {
                modelName: 'PP-OCRv4',
                dict: '/public/models/japan_dict.txt'
            },
            'korean': {
                modelName: 'PP-OCRv4',
                dict: '/public/models/korean_dict.txt'
            },
            'multi': {
                modelName: 'PP-OCRv5',
                dict: '/public/models/multi_dict.txt'
            }
        };
        
        this.currentLanguage = options.language || 'en';
    }
    
    async setLanguage(language) {
        if (!this.languageModels[language]) {
            throw new Error(`Unsupported language: ${language}`);
        }
        
        this.currentLanguage = language;
        const config = this.languageModels[language];
        this.modelName = config.modelName;
        
        // Reset initialization to reload models
        this.initialized = false;
        await this.initialize();
    }
    
    getSupportedLanguages() {
        return Object.keys(this.languageModels);
    }
}

/**
 * Batch OCR processor with parallel processing capabilities
 */
export class BatchOCRProcessor {
    constructor(engine, options = {}) {
        this.engine = engine;
        this.concurrency = options.concurrency || 2;
        this.batchSize = options.batchSize || 5;
        this.progressCallback = options.progressCallback;
    }
    
    async processBatch(files, options = {}) {
        const results = [];
        const totalFiles = files.length;
        let processedCount = 0;
        
        // Process files in batches
        for (let i = 0; i < totalFiles; i += this.batchSize) {
            const batch = files.slice(i, Math.min(i + this.batchSize, totalFiles));
            
            // Process batch with concurrency control
            const batchPromises = batch.map(async (file, index) => {
                try {
                    const globalIndex = i + index;
                    this.progressCallback?.({
                        current: processedCount,
                        total: totalFiles,
                        processing: file.name,
                        phase: 'processing'
                    });
                    
                    const result = await this.engine.process(file);
                    processedCount++;
                    
                    return {
                        file: file.name,
                        index: globalIndex,
                        result,
                        success: true
                    };
                } catch (error) {
                    processedCount++;
                    return {
                        file: file.name,
                        index: globalIndex,
                        error: error.message,
                        success: false
                    };
                }
            });
            
            // Wait for batch to complete
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            this.progressCallback?.({
                current: processedCount,
                total: totalFiles,
                phase: 'batch_complete',
                batchNumber: Math.floor(i / this.batchSize) + 1
            });
        }
        
        return results;
    }
    
    async exportResults(results, format = 'json') {
        switch (format) {
            case 'json':
                return JSON.stringify(results, null, 2);
                
            case 'csv':
                const headers = ['File', 'Success', 'Text', 'Confidence', 'Error'];
                const rows = [headers.join(',')];
                
                results.forEach(result => {
                    if (result.success) {
                        const text = result.result.text.replace(/"/g, '""').replace(/\n/g, ' ');
                        const confidence = result.result.lines
                            ? result.result.lines.reduce((sum, line) => sum + line.confidence, 0) / result.result.lines.length
                            : 0;
                        rows.push(`"${result.file}","true","${text}","${confidence.toFixed(3)}",""`);
                    } else {
                        rows.push(`"${result.file}","false","","","${result.error}"`);
                    }
                });
                
                return rows.join('\n');
                
            case 'xlsx':
                // For Excel export, return structured data that can be converted client-side
                return {
                    headers: ['File', 'Success', 'Text', 'Confidence', 'Error'],
                    data: results.map(result => [
                        result.file,
                        result.success,
                        result.success ? result.result.text : '',
                        result.success && result.result.lines 
                            ? (result.result.lines.reduce((sum, line) => sum + line.confidence, 0) / result.result.lines.length).toFixed(3)
                            : '',
                        result.error || ''
                    ])
                };
                
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }
}

/**
 * Advanced OCR options and configurations
 */
export class AdvancedOCROptions {
    static getPresets() {
        return {
            'high_accuracy': {
                detLimitSideLen: 1920,
                detDbThresh: 0.2,
                detDbBoxThresh: 0.5,
                detDbUnclipRatio: 2.0,
                dropScore: 0.3,
                useAngleCls: true
            },
            'fast_processing': {
                detLimitSideLen: 640,
                detDbThresh: 0.4,
                detDbBoxThresh: 0.7,
                detDbUnclipRatio: 1.5,
                dropScore: 0.6,
                useAngleCls: false
            },
            'balanced': {
                detLimitSideLen: 960,
                detDbThresh: 0.3,
                detDbBoxThresh: 0.6,
                detDbUnclipRatio: 1.7,
                dropScore: 0.5,
                useAngleCls: true
            },
            'handwritten': {
                detLimitSideLen: 1280,
                detDbThresh: 0.15,
                detDbBoxThresh: 0.4,
                detDbUnclipRatio: 2.5,
                dropScore: 0.3,
                useAngleCls: true
            },
            'low_quality': {
                detLimitSideLen: 1440,
                detDbThresh: 0.1,
                detDbBoxThresh: 0.3,
                detDbUnclipRatio: 3.0,
                dropScore: 0.2,
                useAngleCls: true
            }
        };
    }
    
    static mergeWithPreset(presetName, customOptions = {}) {
        const presets = this.getPresets();
        const preset = presets[presetName] || presets.balanced;
        return { ...preset, ...customOptions };
    }
}

/**
 * OCR result analyzer for extracting structured information
 */
export class OCRResultAnalyzer {
    constructor() {
        // Common patterns for structured data extraction
        this.patterns = {
            email: /[\w.-]+@[\w.-]+\.\w+/g,
            phone: /[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}/g,
            date: /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})|(\d{4}[-/]\d{1,2}[-/]\d{1,2})/g,
            url: /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g,
            amount: /[$€£¥₹]\s*\d+(?:,\d{3})*(?:\.\d{2})?/g,
            percentage: /\d+\.?\d*\s*%/g,
            time: /\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?/gi
        };
    }
    
    analyze(ocrResult) {
        const text = ocrResult.text || '';
        const analysis = {
            totalWords: this.countWords(text),
            totalLines: ocrResult.lines ? ocrResult.lines.length : 0,
            averageConfidence: this.calculateAverageConfidence(ocrResult),
            extractedData: this.extractStructuredData(text),
            layout: this.analyzeLayout(ocrResult),
            quality: this.assessQuality(ocrResult)
        };
        
        return analysis;
    }
    
    countWords(text) {
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }
    
    calculateAverageConfidence(ocrResult) {
        if (!ocrResult.lines || ocrResult.lines.length === 0) return 0;
        
        const totalConfidence = ocrResult.lines.reduce((sum, line) => sum + line.confidence, 0);
        return totalConfidence / ocrResult.lines.length;
    }
    
    extractStructuredData(text) {
        const extracted = {};
        
        for (const [key, pattern] of Object.entries(this.patterns)) {
            const matches = text.match(pattern);
            if (matches && matches.length > 0) {
                extracted[key] = [...new Set(matches)]; // Remove duplicates
            }
        }
        
        return extracted;
    }
    
    analyzeLayout(ocrResult) {
        if (!ocrResult.boxes || ocrResult.boxes.length === 0) {
            return { type: 'unknown', columns: 0, rows: 0 };
        }
        
        // Group text regions into lines
        const lines = groupTextIntoLines(ocrResult.lines || []);
        
        // Detect columns by analyzing x-coordinates
        const xCoordinates = ocrResult.boxes.map(box => {
            const minX = Math.min(...box.map(p => p[0]));
            const maxX = Math.max(...box.map(p => p[0]));
            return { min: minX, max: maxX, center: (minX + maxX) / 2 };
        });
        
        // Simple column detection
        const sortedByX = xCoordinates.sort((a, b) => a.center - b.center);
        let columns = 1;
        let lastCenter = sortedByX[0].center;
        
        for (let i = 1; i < sortedByX.length; i++) {
            if (sortedByX[i].center - lastCenter > 100) { // Threshold for column gap
                columns++;
                lastCenter = sortedByX[i].center;
            }
        }
        
        return {
            type: columns > 1 ? 'multi-column' : 'single-column',
            columns,
            rows: lines.length
        };
    }
    
    assessQuality(ocrResult) {
        const avgConfidence = this.calculateAverageConfidence(ocrResult);
        
        if (avgConfidence >= 0.9) return 'excellent';
        if (avgConfidence >= 0.8) return 'good';
        if (avgConfidence >= 0.6) return 'fair';
        if (avgConfidence >= 0.4) return 'poor';
        return 'very poor';
    }
}

/**
 * Table detection and extraction from OCR results
 */
export class TableExtractor {
    constructor() {
        this.cellGapThreshold = 30;
        this.rowGapThreshold = 10;
    }
    
    extractTables(ocrResult) {
        if (!ocrResult.lines || ocrResult.lines.length === 0) {
            return [];
        }
        
        // Group text into potential table cells
        const cells = this.groupIntoCells(ocrResult.lines);
        
        // Detect table structure
        const tables = this.detectTableStructure(cells);
        
        // Format tables
        return tables.map(table => this.formatTable(table));
    }
    
    groupIntoCells(lines) {
        // Sort lines by position
        const sorted = sortTextRegions(lines);
        
        // Group into rows based on y-coordinate proximity
        const rows = [];
        let currentRow = [sorted[0]];
        
        for (let i = 1; i < sorted.length; i++) {
            const prevCenter = this.getCenter(sorted[i - 1].box);
            const currCenter = this.getCenter(sorted[i].box);
            
            if (Math.abs(currCenter[1] - prevCenter[1]) < this.rowGapThreshold) {
                currentRow.push(sorted[i]);
            } else {
                rows.push(currentRow);
                currentRow = [sorted[i]];
            }
        }
        if (currentRow.length > 0) {
            rows.push(currentRow);
        }
        
        return rows;
    }
    
    detectTableStructure(rows) {
        // Simple table detection: rows with similar number of cells
        const tables = [];
        let currentTable = [];
        
        for (const row of rows) {
            if (currentTable.length === 0) {
                currentTable.push(row);
            } else {
                const prevCellCount = currentTable[currentTable.length - 1].length;
                const currCellCount = row.length;
                
                // Allow some variation in cell count
                if (Math.abs(prevCellCount - currCellCount) <= 1) {
                    currentTable.push(row);
                } else {
                    if (currentTable.length > 1) {
                        tables.push(currentTable);
                    }
                    currentTable = [row];
                }
            }
        }
        
        if (currentTable.length > 1) {
            tables.push(currentTable);
        }
        
        return tables;
    }
    
    formatTable(tableRows) {
        const maxCells = Math.max(...tableRows.map(row => row.length));
        
        // Normalize rows to have same number of cells
        const normalizedRows = tableRows.map(row => {
            const cells = row.map(cell => cell.text);
            while (cells.length < maxCells) {
                cells.push('');
            }
            return cells;
        });
        
        return {
            rows: normalizedRows.length,
            columns: maxCells,
            data: normalizedRows,
            confidence: this.calculateTableConfidence(tableRows)
        };
    }
    
    calculateTableConfidence(tableRows) {
        let totalConfidence = 0;
        let cellCount = 0;
        
        for (const row of tableRows) {
            for (const cell of row) {
                totalConfidence += cell.confidence;
                cellCount++;
            }
        }
        
        return cellCount > 0 ? totalConfidence / cellCount : 0;
    }
    
    getCenter(box) {
        const sumX = box.reduce((sum, p) => sum + p[0], 0);
        const sumY = box.reduce((sum, p) => sum + p[1], 0);
        return [sumX / box.length, sumY / box.length];
    }
}

// All classes are already exported above