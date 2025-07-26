import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const TEST_URL = 'http://localhost:3001/client-ocr-app/';

async function testPPOCRv5() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    try {
        console.log('Testing PP-OCRv5 Enhanced OCR...');
        
        // Navigate to the app
        await page.goto(TEST_URL);
        await page.waitForSelector('#status', { state: 'visible' });
        
        // Wait for engines to initialize
        await page.waitForFunction(() => {
            const status = document.querySelector('#status');
            return status && status.textContent.includes('Ready');
        }, { timeout: 30000 });
        
        console.log('✓ Page loaded and engines initialized');
        
        // Select PaddleOCR engine
        await page.click('#enginePaddle');
        await page.waitForTimeout(500);
        
        // Select PP-OCRv5 model
        const modelSelector = await page.$('#modelVersion');
        if (modelSelector) {
            await page.selectOption('#modelVersion', 'PP-OCRv5');
            console.log('✓ Selected PP-OCRv5 model');
        }
        
        // Select Receipt configuration for testing
        await page.selectOption('#configPreset', 'RECEIPT_OPTIMIZED');
        console.log('✓ Selected Receipt optimized configuration');
        
        // Test with a receipt PDF
        const receiptPath = '/home/siva/Projects/OCR and Semantic search/receipts_extracted/2024/us/walmtsv_20240817_020.pdf';
        
        if (fs.existsSync(receiptPath)) {
            // Upload the file
            const fileInput = await page.$('#fileInput');
            await fileInput.setInputFiles(receiptPath);
            
            console.log('✓ Uploaded receipt PDF:', path.basename(receiptPath));
            
            // Wait for preview to load
            await page.waitForSelector('#previewSection', { state: 'visible' });
            await page.waitForTimeout(1000);
            
            // Process the image
            await page.click('#processBtn');
            console.log('⏳ Processing with PP-OCRv5...');
            
            // Wait for results with longer timeout
            await page.waitForSelector('#resultsSection', { state: 'visible', timeout: 60000 });
            await page.waitForSelector('.ocr-results', { state: 'visible' });
            
            // Check for errors
            const errorElement = await page.$('.toast.error');
            if (errorElement) {
                const errorText = await errorElement.textContent();
                console.error('❌ Error during processing:', errorText);
                
                // Take a screenshot of the error
                await page.screenshot({ path: 'pp-ocrv5-error.png' });
                console.log('Screenshot saved as pp-ocrv5-error.png');
            } else {
                // Extract results
                const extractedText = await page.evaluate(() => {
                    const textElement = document.querySelector('#extractedText');
                    return textElement ? textElement.textContent : '';
                });
                
                if (extractedText) {
                    console.log('✓ Successfully extracted text with PP-OCRv5');
                    console.log('Text preview:', extractedText.substring(0, 200) + '...');
                    
                    // Save the result
                    fs.writeFileSync('pp-ocrv5-result.txt', extractedText);
                    console.log('✓ Result saved to pp-ocrv5-result.txt');
                    
                    // Take a screenshot
                    await page.screenshot({ path: 'pp-ocrv5-success.png', fullPage: true });
                    console.log('✓ Screenshot saved as pp-ocrv5-success.png');
                } else {
                    console.log('⚠️ No text extracted');
                }
            }
            
            // Test multi-file processing
            console.log('\n--- Testing Multi-file Processing ---');
            
            // Clear and upload multiple files
            await page.click('#resetBtn');
            await page.waitForTimeout(1000);
            
            const multipleFiles = [
                '/home/siva/Projects/OCR and Semantic search/receipts_extracted/2024/us/walmtsv_20240817_020.pdf',
                '/home/siva/Projects/OCR and Semantic search/receipts_extracted/2024/us/walmtsv_20240817_019.pdf'
            ].filter(f => fs.existsSync(f));
            
            if (multipleFiles.length > 1) {
                await fileInput.setInputFiles(multipleFiles);
                console.log(`✓ Uploaded ${multipleFiles.length} files`);
                
                // Check file list display
                await page.waitForSelector('#fileList', { state: 'visible' });
                const fileCount = await page.$$eval('#fileListItems li', items => items.length);
                console.log(`✓ File list shows ${fileCount} files`);
                
                // Process all files
                await page.click('#processBtn');
                console.log('⏳ Processing multiple files...');
                
                // Wait for batch results
                await page.waitForSelector('.result-block', { state: 'visible', timeout: 60000 });
                const resultBlocks = await page.$$('.result-block');
                console.log(`✓ Processed ${resultBlocks.length} files`);
                
                // Test copy buttons
                const copyBtn = await page.$('.copy-btn');
                if (copyBtn) {
                    await copyBtn.click();
                    await page.waitForSelector('#globalTip', { state: 'visible' });
                    console.log('✓ Copy button works');
                }
                
                // Test ZIP download
                const downloadBtn = await page.$('#downloadBtn');
                if (downloadBtn && (await downloadBtn.textContent()).includes('ZIP')) {
                    console.log('✓ ZIP download button available');
                }
            }
            
        } else {
            console.log('⚠️ Test receipt not found:', receiptPath);
            console.log('Testing with a sample image instead...');
            
            // Create a test image
            const testImagePath = 'test-image.png';
            await page.screenshot({ path: testImagePath });
            
            const fileInput = await page.$('#fileInput');
            await fileInput.setInputFiles(testImagePath);
            
            await page.waitForSelector('#previewSection', { state: 'visible' });
            await page.click('#processBtn');
            await page.waitForSelector('#resultsSection', { state: 'visible' });
            
            fs.unlinkSync(testImagePath);
        }
        
        console.log('\n✅ PP-OCRv5 testing completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        await page.screenshot({ path: 'pp-ocrv5-test-error.png' });
        console.log('Error screenshot saved as pp-ocrv5-test-error.png');
    } finally {
        await browser.close();
    }
}

// Run the test
testPPOCRv5().catch(console.error);