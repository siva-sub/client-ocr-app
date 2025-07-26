// Script to verify all OCR configurations are properly set up
import { ppOCRImprovedEngine } from './src/ppocr-improved-engine.js';
import { INFOGRAPHIC_OCR_CONFIG, updatePaddleOCRConfig } from './src/infographic-ocr-config.js';
import { 
    DOCUMENT_OCR_CONFIG, 
    RECEIPT_OCR_CONFIG,
    updatePaddleOCRForDocuments 
} from './src/document-ocr-config.js';

console.log('🔍 Verifying OCR Configurations...\n');

// Check if configs are exported properly
console.log('✅ Configuration Exports:');
console.log('  - INFOGRAPHIC_OCR_CONFIG:', typeof INFOGRAPHIC_OCR_CONFIG === 'object' ? '✓' : '✗');
console.log('  - DOCUMENT_OCR_CONFIG:', typeof DOCUMENT_OCR_CONFIG === 'object' ? '✓' : '✗');
console.log('  - RECEIPT_OCR_CONFIG:', typeof RECEIPT_OCR_CONFIG === 'object' ? '✓' : '✗');

// Check update functions
console.log('\n✅ Update Functions:');
console.log('  - updatePaddleOCRConfig:', typeof updatePaddleOCRConfig === 'function' ? '✓' : '✗');
console.log('  - updatePaddleOCRForDocuments:', typeof updatePaddleOCRForDocuments === 'function' ? '✓' : '✗');

// Check configuration values
console.log('\n📊 Configuration Values:');

console.log('\n1. Infographic Config:');
console.log('  - Detection limit:', INFOGRAPHIC_OCR_CONFIG.detection.det_limit_side_len);
console.log('  - Detection threshold:', INFOGRAPHIC_OCR_CONFIG.detection.det_db_thresh);
console.log('  - Max candidates:', INFOGRAPHIC_OCR_CONFIG.detection.det_db_max_candidates);

console.log('\n2. Document Config:');
console.log('  - Detection limit:', DOCUMENT_OCR_CONFIG.detection.det_limit_side_len);
console.log('  - Detection threshold:', DOCUMENT_OCR_CONFIG.detection.det_db_thresh);
console.log('  - ID card languages:', DOCUMENT_OCR_CONFIG.idcard.languages.join(', '));

console.log('\n3. Receipt Config:');
console.log('  - Detection limit:', RECEIPT_OCR_CONFIG.detection.det_limit_side_len);
console.log('  - Detection threshold:', RECEIPT_OCR_CONFIG.detection.det_db_thresh);
console.log('  - Currency symbols:', RECEIPT_OCR_CONFIG.receipt.currency_symbols.join(', '));

// Check PaddleOCR engine CONFIG property
console.log('\n🔧 PaddleOCR Engine:');
console.log('  - CONFIG property exists:', ppOCRImprovedEngine.CONFIG !== undefined ? '✓' : '✗');
console.log('  - CONFIG is object:', typeof ppOCRImprovedEngine.CONFIG === 'object' ? '✓' : '✗');

// Test configuration application
console.log('\n🧪 Testing Configuration Application:');

// Test infographic config
try {
    updatePaddleOCRConfig(ppOCRImprovedEngine);
    console.log('  - Infographic config applied:', ppOCRImprovedEngine.CONFIG.det_limit_side_len === 1920 ? '✓' : '✗');
} catch (e) {
    console.log('  - Infographic config error:', e.message);
}

// Test document config
try {
    updatePaddleOCRForDocuments(ppOCRImprovedEngine, 'general');
    console.log('  - Document config applied:', ppOCRImprovedEngine.CONFIG.det_limit_side_len === 2560 ? '✓' : '✗');
} catch (e) {
    console.log('  - Document config error:', e.message);
}

// Test receipt config
try {
    updatePaddleOCRForDocuments(ppOCRImprovedEngine, 'receipt');
    console.log('  - Receipt config applied:', ppOCRImprovedEngine.CONFIG.det_limit_side_len === 1920 ? '✓' : '✗');
} catch (e) {
    console.log('  - Receipt config error:', e.message);
}

console.log('\n✅ Configuration verification complete!');