import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export class TesseractOCREngine {
    constructor() {
        this.initialized = false;
        this.worker = null;
    }

    async initialize(progressCallback) {
        if (this.initialized) return;

        try {
            progressCallback?.({ 
                status: 'loading', 
                message: 'Loading Tesseract OCR engine...', 
                progress: 10 
            });

            // Create Tesseract worker
            this.worker = await Tesseract.createWorker('eng', 1, {
                logger: (m) => {
                    if (m.status === 'loading tesseract core') {
                        progressCallback?.({ 
                            status: 'loading', 
                            message: 'Loading OCR core...', 
                            progress: 30 
                        });
                    } else if (m.status === 'loading language traineddata') {
                        progressCallback?.({ 
                            status: 'loading', 
                            message: 'Loading English language model...', 
                            progress: 60 
                        });
                    } else if (m.status === 'initialized tesseract') {
                        progressCallback?.({ 
                            status: 'loading', 
                            message: 'Initializing OCR engine...', 
                            progress: 90 
                        });
                    }
                },
                errorHandler: (error) => {
                    console.error('Tesseract error:', error);
                }
            });

            // Configure recognition parameters
            await this.worker.setParameters({
                tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
                preserve_interword_spaces: '1',
                tessedit_pageseg_mode: Tesseract.PSM.AUTO,
            });

            this.initialized = true;
            progressCallback?.({ 
                status: 'ready', 
                message: 'Tesseract OCR engine loaded successfully!', 
                progress: 100 
            });
        } catch (error) {
            console.error('Failed to initialize Tesseract:', error);
            throw error;
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

        // Process image with Tesseract
        const result = await this.worker.recognize(imageBlob);
        
        // Convert Tesseract results to our format
        return this.formatResults(result);
    }

    formatResults(tesseractResult) {
        const results = [];
        
        // Process each word
        for (const word of tesseractResult.data.words) {
            if (word.confidence > 30) { // Filter low confidence
                results.push({
                    box: [
                        [word.bbox.x0, word.bbox.y0],
                        [word.bbox.x1, word.bbox.y0],
                        [word.bbox.x1, word.bbox.y1],
                        [word.bbox.x0, word.bbox.y1]
                    ],
                    text: word.text,
                    confidence: word.confidence / 100
                });
            }
        }

        // Group words into lines if needed
        const lines = this.groupWordsIntoLines(results);
        
        return lines;
    }

    groupWordsIntoLines(words) {
        if (words.length === 0) return [];
        
        // Sort words by vertical position
        words.sort((a, b) => a.box[0][1] - b.box[0][1]);
        
        const lines = [];
        let currentLine = {
            words: [words[0]],
            minY: words[0].box[0][1],
            maxY: words[0].box[2][1]
        };
        
        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const wordY = word.box[0][1];
            
            // Check if word is on the same line (within threshold)
            if (wordY <= currentLine.maxY && wordY >= currentLine.minY - 5) {
                currentLine.words.push(word);
                currentLine.minY = Math.min(currentLine.minY, wordY);
                currentLine.maxY = Math.max(currentLine.maxY, word.box[2][1]);
            } else {
                // Start new line
                lines.push(this.mergeLine(currentLine));
                currentLine = {
                    words: [word],
                    minY: wordY,
                    maxY: word.box[2][1]
                };
            }
        }
        
        // Add last line
        if (currentLine.words.length > 0) {
            lines.push(this.mergeLine(currentLine));
        }
        
        return lines;
    }

    mergeLine(line) {
        // Sort words horizontally
        line.words.sort((a, b) => a.box[0][0] - b.box[0][0]);
        
        // Calculate bounding box for the entire line
        const minX = Math.min(...line.words.map(w => w.box[0][0]));
        const maxX = Math.max(...line.words.map(w => w.box[1][0]));
        const minY = Math.min(...line.words.map(w => w.box[0][1]));
        const maxY = Math.max(...line.words.map(w => w.box[2][1]));
        
        // Merge text with spaces
        const text = line.words.map(w => w.text).join(' ');
        
        // Average confidence
        const confidence = line.words.reduce((sum, w) => sum + w.confidence, 0) / line.words.length;
        
        return {
            box: [
                [minX, minY],
                [maxX, minY],
                [maxX, maxY],
                [minX, maxY]
            ],
            text: text,
            confidence: confidence
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
            
            // Convert canvas to blob
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            
            // Process with Tesseract
            const result = await this.worker.recognize(blob);
            const pageResults = this.formatResults(result);
            
            allResults.push({
                page: pageNum,
                results: pageResults
            });
        }
        
        return allResults;
    }

    async cleanup() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
            this.initialized = false;
        }
    }
}

// Create singleton instance
export const tesseractOCREngine = new TesseractOCREngine();