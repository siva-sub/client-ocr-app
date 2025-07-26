#!/usr/bin/env node

import { createCanvas } from 'canvas';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import Tesseract from 'tesseract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const RECEIPT_PDF = '/home/siva/Projects/OCR and Semantic search/receipts_extracted/2022/us/wynnsw_20221210_011.pdf';

// Helper function to convert PDF page to image
async function pdfPageToImage(pdfPath, pageNum = 1) {
    const data = await fs.readFile(pdfPath);
    const pdf = await getDocument({ data }).promise;
    const page = await pdf.getPage(pageNum);
    
    const scale = 2.0; // Higher scale for better quality
    const viewport = page.getViewport({ scale });
    
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    
    // Create a compatible render context
    const canvasFactory = {
        create: (width, height) => {
            const canvas = createCanvas(width, height);
            const context = canvas.getContext('2d');
            return {
                canvas,
                context
            };
        },
        reset: (canvasAndContext, width, height) => {
            canvasAndContext.canvas.width = width;
            canvasAndContext.canvas.height = height;
        },
        destroy: (canvasAndContext) => {
            canvasAndContext.canvas.width = 0;
            canvasAndContext.canvas.height = 0;
        }
    };
    
    await page.render({
        canvasContext: context,
        viewport: viewport,
        canvasFactory
    }).promise;
    
    return canvas.toBuffer('image/png');
}

// Process with Tesseract
async function processWithTesseract(imageBuffer) {
    console.log('\n=== Testing Tesseract ===');
    
    const startTime = Date.now();
    
    const { data } = await Tesseract.recognize(imageBuffer, 'eng', {
        logger: m => {
            if (m.status === 'recognizing text') {
                process.stdout.write(`\rTesseract: ${Math.round(m.progress * 100)}%`);
            }
        }
    });
    
    const processingTime = Date.now() - startTime;
    console.log('\n');
    
    // Extract text and calculate metrics
    const allText = data.text;
    const lines = data.lines.map(line => line.text);
    
    // Look for receipt-specific elements
    const pricePattern = /\$?\d+\.\d{2}/g;
    const prices = allText.match(pricePattern) || [];
    const itemLines = lines.filter(line => line.trim().length > 3);
    const totalLine = lines.find(line => line.toLowerCase().includes('total'));
    
    return {
        engineName: 'Tesseract',
        processingTime,
        totalChars: allText.length,
        lineCount: lines.length,
        wordCount: data.words.length,
        priceCount: prices.length,
        itemCount: itemLines.length,
        foundTotal: !!totalLine,
        avgConfidence: data.confidence / 100,
        fullText: allText,
        prices,
        totalLine,
        lines
    };
}

// Main test function
async function testReceiptPDF() {
    console.log('🧾 Receipt PDF OCR Test - Tesseract Baseline');
    console.log(`Testing: ${RECEIPT_PDF}`);
    console.log('=' .repeat(60));
    
    try {
        // Convert PDF to image
        console.log('\nConverting PDF to image...');
        const imageBuffer = await pdfPageToImage(RECEIPT_PDF);
        console.log('✅ PDF converted to image');
        
        // Save the image for inspection
        const imagePath = path.join(__dirname, 'test-receipt.png');
        await fs.writeFile(imagePath, imageBuffer);
        console.log(`✅ Image saved to: ${imagePath}`);
        
        // Test with Tesseract
        const tesseractResult = await processWithTesseract(imageBuffer);
        
        // Display results
        console.log('\n=== TESSERACT RESULTS ===');
        console.log(`Processing Time: ${tesseractResult.processingTime}ms`);
        console.log(`Total Characters: ${tesseractResult.totalChars}`);
        console.log(`Lines Detected: ${tesseractResult.lineCount}`);
        console.log(`Words Detected: ${tesseractResult.wordCount}`);
        console.log(`Prices Detected: ${tesseractResult.priceCount}`);
        console.log(`Found Total Line: ${tesseractResult.foundTotal ? 'Yes' : 'No'}`);
        console.log(`Average Confidence: ${(tesseractResult.avgConfidence * 100).toFixed(1)}%`);
        
        console.log('\nDetected Prices:');
        console.log(tesseractResult.prices.join(', ') || 'None');
        
        if (tesseractResult.totalLine) {
            console.log('\nTotal Line:');
            console.log(tesseractResult.totalLine);
        }
        
        console.log('\n=== FIRST 10 LINES ===');
        tesseractResult.lines.slice(0, 10).forEach((line, i) => {
            console.log(`${i + 1}: ${line.trim()}`);
        });
        
        console.log('\n=== FULL TEXT (first 1000 chars) ===');
        console.log(tesseractResult.fullText.substring(0, 1000));
        
        // Save results for comparison
        const resultsPath = path.join(__dirname, 'tesseract-receipt-results.json');
        await fs.writeFile(resultsPath, JSON.stringify(tesseractResult, null, 2));
        console.log(`\n✅ Results saved to: ${resultsPath}`);
        
        console.log('\n📊 BASELINE METRICS FOR PADDLEOCR TO BEAT:');
        console.log(`   - Characters: ${tesseractResult.totalChars}`);
        console.log(`   - Lines: ${tesseractResult.lineCount}`);
        console.log(`   - Prices: ${tesseractResult.priceCount}`);
        console.log(`   - Time: ${tesseractResult.processingTime}ms`);
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
testReceiptPDF().catch(console.error);