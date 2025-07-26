#!/usr/bin/env node

import { createCanvas, loadImage } from 'canvas';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfjsLib from 'pdfjs-dist';
import { ppOCRImprovedEngine } from './src/ppocr-improved-engine.js';
import { tesseractOCREngine } from './src/tesseract-ocr-engine.js';
import { RECEIPT_OCR_CONFIG, updatePaddleOCRForDocuments } from './src/document-ocr-config.js';
import { PDF_OCR_CONFIG, updatePaddleOCRForPDF } from './src/pdf-ocr-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const RECEIPT_PDF = '/home/siva/Projects/OCR and Semantic search/receipts_extracted/2022/us/wynnsw_20221210_011.pdf';

// Helper function to convert PDF page to image
async function pdfPageToImage(pdfPath, pageNum = 1) {
    const data = await fs.readFile(pdfPath);
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const page = await pdf.getPage(pageNum);
    
    const scale = 2.0; // Higher scale for better quality
    const viewport = page.getViewport({ scale });
    
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    
    await page.render({
        canvasContext: context,
        viewport: viewport
    }).promise;
    
    return canvas.toBuffer('image/png');
}

// Process with OCR and measure performance
async function processWithOCR(imageBuffer, engineName, engine, configFunction = null) {
    console.log(`\n=== Testing ${engineName} ===`);
    
    // Apply configuration if provided
    if (configFunction) {
        configFunction();
    }
    
    const startTime = Date.now();
    const results = await engine.process(imageBuffer);
    const processingTime = Date.now() - startTime;
    
    // Extract text and calculate metrics
    const allText = results.map(r => r.text).join(' ');
    const lines = results.map(r => r.text);
    
    // Look for receipt-specific elements
    const pricePattern = /\$?\d+\.\d{2}/g;
    const prices = allText.match(pricePattern) || [];
    const itemLines = lines.filter(line => line.length > 3);
    const totalLine = lines.find(line => line.toLowerCase().includes('total'));
    
    return {
        engineName,
        processingTime,
        totalChars: allText.length,
        lineCount: lines.length,
        wordCount: allText.split(/\s+/).filter(w => w.length > 0).length,
        priceCount: prices.length,
        itemCount: itemLines.length,
        foundTotal: !!totalLine,
        avgConfidence: results.reduce((sum, r) => sum + (r.confidence || 0), 0) / (results.length || 1),
        fullText: allText,
        prices,
        totalLine
    };
}

// Compare results
function compareResults(tesseractResult, paddleResults) {
    console.log('\n=== COMPARISON RESULTS ===\n');
    
    // Create comparison table
    console.log('Metric               | Tesseract  | PaddleOCR Receipt | PaddleOCR PDF | Winner');
    console.log('---------------------|------------|-------------------|---------------|--------');
    
    // Processing time
    const timeWinner = paddleResults.reduce((best, curr) => 
        curr.processingTime < best.processingTime ? curr : best, tesseractResult);
    console.log(`Processing Time (ms) | ${tesseractResult.processingTime.toString().padEnd(10)} | ${paddleResults[0].processingTime.toString().padEnd(17)} | ${paddleResults[1].processingTime.toString().padEnd(13)} | ${timeWinner.engineName}`);
    
    // Character count
    const charWinner = [tesseractResult, ...paddleResults].reduce((best, curr) => 
        curr.totalChars > best.totalChars ? curr : best);
    console.log(`Total Characters     | ${tesseractResult.totalChars.toString().padEnd(10)} | ${paddleResults[0].totalChars.toString().padEnd(17)} | ${paddleResults[1].totalChars.toString().padEnd(13)} | ${charWinner.engineName}`);
    
    // Line count
    const lineWinner = [tesseractResult, ...paddleResults].reduce((best, curr) => 
        curr.lineCount > best.lineCount ? curr : best);
    console.log(`Lines Detected       | ${tesseractResult.lineCount.toString().padEnd(10)} | ${paddleResults[0].lineCount.toString().padEnd(17)} | ${paddleResults[1].lineCount.toString().padEnd(13)} | ${lineWinner.engineName}`);
    
    // Price detection
    const priceWinner = [tesseractResult, ...paddleResults].reduce((best, curr) => 
        curr.priceCount > best.priceCount ? curr : best);
    console.log(`Prices Detected      | ${tesseractResult.priceCount.toString().padEnd(10)} | ${paddleResults[0].priceCount.toString().padEnd(17)} | ${paddleResults[1].priceCount.toString().padEnd(13)} | ${priceWinner.engineName}`);
    
    // Found total
    console.log(`Found Total Line     | ${(tesseractResult.foundTotal ? 'Yes' : 'No').padEnd(10)} | ${(paddleResults[0].foundTotal ? 'Yes' : 'No').padEnd(17)} | ${(paddleResults[1].foundTotal ? 'Yes' : 'No').padEnd(13)} | -`);
    
    // Confidence
    const confWinner = [tesseractResult, ...paddleResults].reduce((best, curr) => 
        curr.avgConfidence > best.avgConfidence ? curr : best);
    console.log(`Avg Confidence (%)   | ${(tesseractResult.avgConfidence * 100).toFixed(1).padEnd(10)} | ${(paddleResults[0].avgConfidence * 100).toFixed(1).padEnd(17)} | ${(paddleResults[1].avgConfidence * 100).toFixed(1).padEnd(13)} | ${confWinner.engineName}`);
    
    // Overall assessment
    console.log('\n=== DETAILED RESULTS ===\n');
    
    // Show detected prices
    console.log('Detected Prices:');
    console.log(`  Tesseract: ${tesseractResult.prices.join(', ') || 'None'}`);
    console.log(`  PaddleOCR Receipt: ${paddleResults[0].prices.join(', ') || 'None'}`);
    console.log(`  PaddleOCR PDF: ${paddleResults[1].prices.join(', ') || 'None'}`);
    
    // Show total line if found
    console.log('\nTotal Line:');
    console.log(`  Tesseract: ${tesseractResult.totalLine || 'Not found'}`);
    console.log(`  PaddleOCR Receipt: ${paddleResults[0].totalLine || 'Not found'}`);
    console.log(`  PaddleOCR PDF: ${paddleResults[1].totalLine || 'Not found'}`);
    
    // Calculate overall winner
    let tesseractScore = 0;
    let paddleReceiptScore = 0;
    let paddlePDFScore = 0;
    
    if (charWinner.engineName === 'Tesseract') tesseractScore++;
    else if (charWinner.engineName === 'PaddleOCR Receipt') paddleReceiptScore++;
    else if (charWinner.engineName === 'PaddleOCR PDF') paddlePDFScore++;
    
    if (lineWinner.engineName === 'Tesseract') tesseractScore++;
    else if (lineWinner.engineName === 'PaddleOCR Receipt') paddleReceiptScore++;
    else if (lineWinner.engineName === 'PaddleOCR PDF') paddlePDFScore++;
    
    if (priceWinner.engineName === 'Tesseract') tesseractScore += 2; // Double weight for price detection
    else if (priceWinner.engineName === 'PaddleOCR Receipt') paddleReceiptScore += 2;
    else if (priceWinner.engineName === 'PaddleOCR PDF') paddlePDFScore += 2;
    
    console.log('\n=== OVERALL WINNER ===');
    const maxScore = Math.max(tesseractScore, paddleReceiptScore, paddlePDFScore);
    if (paddleReceiptScore === maxScore || paddlePDFScore === maxScore) {
        console.log('✅ PaddleOCR OUTPERFORMS Tesseract for receipt processing!');
        if (paddleReceiptScore > paddlePDFScore) {
            console.log('   Best configuration: PaddleOCR Receipt Optimized');
        } else {
            console.log('   Best configuration: PaddleOCR PDF Optimized');
        }
    } else {
        console.log('❌ Tesseract performs better - optimization needed');
    }
    
    // Performance improvement
    const paddleBestChars = Math.max(paddleResults[0].totalChars, paddleResults[1].totalChars);
    const charImprovement = ((paddleBestChars - tesseractResult.totalChars) / tesseractResult.totalChars * 100).toFixed(1);
    const paddleBestPrices = Math.max(paddleResults[0].priceCount, paddleResults[1].priceCount);
    const priceImprovement = ((paddleBestPrices - tesseractResult.priceCount) / Math.max(tesseractResult.priceCount, 1) * 100).toFixed(1);
    
    console.log(`\nCharacter detection improvement: ${charImprovement}%`);
    console.log(`Price detection improvement: ${priceImprovement}%`);
}

// Main test function
async function testReceiptPDF() {
    console.log('🧾 Receipt PDF OCR Test');
    console.log(`Testing: ${RECEIPT_PDF}`);
    console.log('=' .repeat(60));
    
    try {
        // Initialize OCR engines
        console.log('\nInitializing OCR engines...');
        await Promise.all([
            ppOCRImprovedEngine.initialize((progress) => {
                if (progress.status === 'progress') {
                    process.stdout.write(`\rPaddleOCR: ${progress.progress}%`);
                }
            }),
            tesseractOCREngine.initialize((progress) => {
                if (progress.status === 'progress') {
                    process.stdout.write(`\rTesseract: ${progress.progress}%`);
                }
            })
        ]);
        console.log('\n✅ OCR engines initialized');
        
        // Convert PDF to image
        console.log('\nConverting PDF to image...');
        const imageBuffer = await pdfPageToImage(RECEIPT_PDF);
        console.log('✅ PDF converted to image');
        
        // Test with Tesseract
        const tesseractResult = await processWithOCR(imageBuffer, 'Tesseract', tesseractOCREngine);
        
        // Test with PaddleOCR Receipt config
        const paddleReceiptResult = await processWithOCR(
            imageBuffer, 
            'PaddleOCR Receipt', 
            ppOCRImprovedEngine,
            () => updatePaddleOCRForDocuments(ppOCRImprovedEngine, 'receipt')
        );
        
        // Test with PaddleOCR PDF config
        const paddlePDFResult = await processWithOCR(
            imageBuffer, 
            'PaddleOCR PDF', 
            ppOCRImprovedEngine,
            () => updatePaddleOCRForPDF(ppOCRImprovedEngine)
        );
        
        // Compare results
        compareResults(tesseractResult, [paddleReceiptResult, paddlePDFResult]);
        
        // Save sample outputs for inspection
        console.log('\n=== SAMPLE TEXT OUTPUT ===');
        console.log('\nFirst 500 chars from each engine:');
        console.log('\nTesseract:');
        console.log(tesseractResult.fullText.substring(0, 500));
        console.log('\nPaddleOCR Receipt:');
        console.log(paddleReceiptResult.fullText.substring(0, 500));
        console.log('\nPaddleOCR PDF:');
        console.log(paddlePDFResult.fullText.substring(0, 500));
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
testReceiptPDF().catch(console.error);