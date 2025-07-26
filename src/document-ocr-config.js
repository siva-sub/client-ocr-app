// Specialized OCR configuration for official documents and ID cards
export const DOCUMENT_OCR_CONFIG = {
    // Detection parameters optimized for documents
    detection: {
        // Higher resolution for fine text in documents
        det_limit_side_len: 2560,    // Very high resolution for documents
        det_limit_type: 'max',
        
        // Optimized thresholds for document text
        det_db_thresh: 0.1,          // Lower threshold for faint text
        det_db_box_thresh: 0.15,     // Tighter threshold for precise detection
        det_db_unclip_ratio: 1.6,    // Moderate expansion for text boundaries
        det_db_min_size: 3,          // Very small text detection
        det_db_max_candidates: 5000,  // Many candidates for dense documents
        
        // Fine-grained detection
        det_use_dilation: true,
        det_dilation_kernel: 1,       // Minimal dilation for precision
        
        // Grid and area settings
        grid_size: 4,                 // Very fine grid
        min_area_thresh: 5,           // Tiny text areas
        max_area_thresh: 0.95,        // Almost full page
    },
    
    // Recognition parameters for documents
    recognition: {
        rec_image_height: 64,         // Larger height for better accuracy
        rec_image_width: 480,         // Wider for long text
        rec_batch_num: 32,           // Larger batch
        drop_score: 0.1,             // Keep more results
        
        // Character settings
        use_space_char: true,
        max_text_length: 300,        // Long text fields
        
        // Special character support
        support_special_chars: true,
        support_symbols: true,
    },
    
    // Document-specific preprocessing
    preprocessing: {
        // Contrast and brightness
        enhance_contrast: true,
        contrast_factor: 1.8,        // Higher contrast for documents
        brightness_adjustment: 10,    // Slight brightness boost
        
        // Grayscale conversion
        convert_to_grayscale: true,
        grayscale_method: 'weighted', // Better for colored security features
        
        // Noise reduction
        denoise: true,
        denoise_strength: 'light',   // Preserve fine details
        
        // Sharpening
        sharpen: true,
        sharpen_amount: 1.2,         // Strong sharpening
        
        // Background handling
        remove_background: true,
        background_threshold: 230,    // Aggressive background removal
        
        // Shadow removal
        remove_shadows: true,
        shadow_threshold: 0.8,
        
        // Deskew
        auto_deskew: true,
        max_skew_angle: 5,           // Documents usually have small skew
    },
    
    // ID card specific settings
    idcard: {
        // Field detection
        detect_fields: true,
        field_types: [
            'name', 'id_number', 'date_of_birth', 'nationality',
            'race', 'sex', 'address', 'date_of_issue', 'expiry_date'
        ],
        
        // Barcode and MRZ
        detect_barcode: true,
        detect_mrz: true,
        
        // Security features
        ignore_watermarks: true,
        ignore_holograms: true,
        
        // Text orientation
        support_vertical_text: true,
        support_multilingual: true,
        languages: ['en', 'zh', 'ms', 'ta'], // Singapore languages
    },
    
    // Banking document settings
    banking: {
        // Structured data extraction
        extract_tables: true,
        extract_lists: true,
        extract_definitions: true,
        
        // Number formats
        detect_currency: true,
        detect_percentages: true,
        detect_dates: true,
        
        // Legal text
        preserve_formatting: true,
        maintain_hierarchy: true,
        detect_sections: true,
        detect_footnotes: true,
    },
    
    // Post-processing for documents
    postprocessing: {
        // Text validation
        validate_fields: true,
        validate_formats: true,
        
        // Error correction
        fix_common_ocr_errors: true,
        fix_number_letter_confusion: true, // 0/O, 1/I confusion
        
        // Structure preservation
        preserve_formatting: true,
        maintain_indentation: true,
        detect_columns: true,
        
        // Confidence settings
        min_confidence: 0.6,         // Higher confidence for documents
        
        // Output formatting
        group_by_regions: true,
        sort_by_position: true,
        include_coordinates: true,
        include_confidence: true,
    }
};

// Receipt-specific OCR configuration
export const RECEIPT_OCR_CONFIG = {
    // Detection parameters optimized for receipts
    detection: {
        // Medium-high resolution for receipt text
        det_limit_side_len: 1920,
        det_limit_type: 'max',
        
        // Optimized for receipt text (often faint thermal printing)
        det_db_thresh: 0.08,          // Very low threshold for faint text
        det_db_box_thresh: 0.12,      // Lower threshold for receipt text
        det_db_unclip_ratio: 1.4,     // Moderate expansion
        det_db_min_size: 2,           // Tiny text detection
        det_db_max_candidates: 4000,  // Many candidates for dense receipts
        
        // Fine detection
        det_use_dilation: true,
        det_dilation_kernel: 1,
        
        // Grid settings for receipts
        grid_size: 8,                 // Fine grid for small text
        min_area_thresh: 3,           // Very small areas
        max_area_thresh: 0.9,
    },
    
    // Recognition parameters for receipts
    recognition: {
        rec_image_height: 48,         // Standard height
        rec_image_width: 320,         // Standard width for receipt lines
        rec_batch_num: 24,            // Medium batch
        drop_score: 0.15,             // Keep more results
        
        // Character settings
        use_space_char: true,
        max_text_length: 200,         // Receipt lines can be long
        
        // Number and symbol support
        support_special_chars: true,
        support_symbols: true,
        support_numbers: true,
        support_decimals: true,
        support_currency: true,
    },
    
    // Receipt-specific preprocessing
    preprocessing: {
        // Contrast for thermal receipts
        enhance_contrast: true,
        contrast_factor: 2.0,         // High contrast for faded receipts
        brightness_adjustment: 20,    // Brighten dark receipts
        
        // Grayscale
        convert_to_grayscale: true,
        grayscale_method: 'standard',
        
        // Noise reduction
        denoise: true,
        denoise_strength: 'medium',   // Balance detail preservation
        
        // Sharpening
        sharpen: true,
        sharpen_amount: 1.5,          // Strong sharpening for thermal prints
        
        // Background
        remove_background: true,
        background_threshold: 220,    // Remove gray backgrounds
        
        // Deskew
        auto_deskew: true,
        max_skew_angle: 10,           // Receipts can be quite skewed
        
        // Receipt-specific
        enhance_thermal_print: true,
        fix_faded_text: true,
    },
    
    // Receipt field extraction
    receipt: {
        // Field detection
        detect_fields: true,
        field_types: [
            'store_name', 'store_address', 'date', 'time',
            'items', 'prices', 'subtotal', 'tax', 'total',
            'payment_method', 'card_last_digits', 'receipt_number'
        ],
        
        // Layout analysis
        detect_columns: true,
        align_prices: true,
        group_items: true,
        
        // Number formats
        detect_currency: true,
        currency_symbols: ['$', '€', '£', '¥', 'S$', 'Rs', 'RM'],
        decimal_separator: '.',
        thousands_separator: ',',
        
        // Date/time formats
        date_formats: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY'],
        time_formats: ['HH:MM', 'HH:MM:SS', 'HH:MM AM/PM'],
    },
    
    // Post-processing for receipts
    postprocessing: {
        // Text validation
        validate_prices: true,
        validate_totals: true,
        validate_dates: true,
        
        // Error correction
        fix_common_ocr_errors: true,
        fix_number_letter_confusion: true,
        fix_decimal_points: true,
        
        // Structure
        align_columns: true,
        group_line_items: true,
        extract_table_structure: true,
        
        // Confidence
        min_confidence: 0.5,          // Lower for receipts
        
        // Output
        structured_output: true,
        include_line_items: true,
        calculate_totals: true,
    }
};

// Preprocessing function optimized for documents
export async function preprocessDocument(imageData, canvas, ctx, docType = 'general') {
    const { width, height } = imageData;
    
    // Create working canvas
    const workCanvas = document.createElement('canvas');
    const workCtx = workCanvas.getContext('2d');
    workCanvas.width = width;
    workCanvas.height = height;
    
    // Draw original image
    workCtx.drawImage(imageData, 0, 0);
    let imgData = workCtx.getImageData(0, 0, width, height);
    
    // Apply document-specific preprocessing
    if (docType === 'idcard') {
        imgData = preprocessIDCard(imgData, width, height);
    } else if (docType === 'banking') {
        imgData = preprocessBankingDoc(imgData, width, height);
    } else if (docType === 'receipt') {
        imgData = preprocessReceipt(imgData, width, height);
    } else {
        imgData = preprocessGeneralDoc(imgData, width, height);
    }
    
    // Apply final sharpening
    imgData = applySharpeningFilter(imgData, width, height, DOCUMENT_OCR_CONFIG.preprocessing.sharpen_amount);
    
    workCtx.putImageData(imgData, 0, 0);
    return workCanvas;
}

// ID card specific preprocessing
function preprocessIDCard(imgData, width, height) {
    const data = imgData.data;
    
    // Enhance contrast for ID cards
    for (let i = 0; i < data.length; i += 4) {
        // Convert to grayscale with emphasis on red channel (good for pink/red backgrounds)
        const gray = 0.4 * data[i] + 0.4 * data[i + 1] + 0.2 * data[i + 2];
        
        // Apply adaptive thresholding
        let enhanced = gray;
        if (gray < 100) {
            // Dark text - make darker
            enhanced = gray * 0.7;
        } else if (gray > 200) {
            // Light background - make white
            enhanced = 255;
        } else {
            // Mid-tones - enhance contrast
            enhanced = ((gray - 128) * 2.0) + 128;
        }
        
        enhanced = Math.max(0, Math.min(255, enhanced));
        
        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
    }
    
    // Remove pink/red tint from Singapore ID cards
    removeTint(data, [255, 200, 200], 50); // Pink tint removal
    
    return imgData;
}

// Banking document preprocessing
function preprocessBankingDoc(imgData, width, height) {
    const data = imgData.data;
    
    // Standard document processing with emphasis on clean text
    for (let i = 0; i < data.length; i += 4) {
        // Weighted grayscale for documents
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        
        // Binary threshold for clean documents
        let enhanced = gray > 180 ? 255 : gray < 80 ? 0 : gray;
        
        // Enhance mid-tones
        if (enhanced > 80 && enhanced < 180) {
            enhanced = ((enhanced - 130) * 1.5) + 130;
        }
        
        enhanced = Math.max(0, Math.min(255, enhanced));
        
        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
    }
    
    return imgData;
}

// General document preprocessing
function preprocessGeneralDoc(imgData, width, height) {
    const data = imgData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        
        // Adaptive enhancement
        let enhanced = gray;
        if (gray < 127) {
            enhanced = Math.pow(gray / 127, 1.5) * 127;
        } else {
            enhanced = 127 + Math.pow((gray - 127) / 128, 0.7) * 128;
        }
        
        enhanced = Math.max(0, Math.min(255, enhanced));
        
        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
    }
    
    return imgData;
}

// Remove color tint from images
function removeTint(data, tintColor, threshold) {
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Calculate distance from tint color
        const distance = Math.sqrt(
            Math.pow(r - tintColor[0], 2) +
            Math.pow(g - tintColor[1], 2) +
            Math.pow(b - tintColor[2], 2)
        );
        
        if (distance < threshold) {
            // Replace tint with white
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
        }
    }
}

// Enhanced sharpening filter
function applySharpeningFilter(imageData, width, height, amount) {
    const data = imageData.data;
    const output = new Uint8ClampedArray(data);
    
    // Unsharp mask kernel
    const kernel = [
        -1, -1, -1,
        -1,  9, -1,
        -1, -1, -1
    ];
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            
            let sum = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const kidx = ((y + ky) * width + (x + kx)) * 4;
                    sum += data[kidx] * kernel[(ky + 1) * 3 + (kx + 1)];
                }
            }
            
            // Apply sharpening with amount control
            const sharpened = data[idx] + (sum - data[idx]) * amount / 9;
            output[idx] = Math.max(0, Math.min(255, sharpened));
            output[idx + 1] = output[idx];
            output[idx + 2] = output[idx];
        }
    }
    
    // Copy back
    for (let i = 0; i < data.length; i++) {
        data[i] = output[i];
    }
    
    return imageData;
}

// Field extraction for ID cards
export function extractIDCardFields(ocrResults) {
    const fields = {
        name: '',
        idNumber: '',
        dateOfBirth: '',
        race: '',
        sex: '',
        countryOfBirth: '',
        address: '',
        dateOfIssue: '',
        nricNumber: ''
    };
    
    // Pattern matching for Singapore ID fields
    const patterns = {
        idNumber: /[ST]\d{7}[A-Z]/i,
        dateOfBirth: /\d{2}-\d{2}-\d{4}/,
        nricNumber: /NRIC\s*No[:\s]*([A-Z0-9]+)/i,
        datePattern: /Date of (birth|issue|change)[:\s]*(\d{2}[-/]\d{2}[-/]\d{4})/i
    };
    
    // Extract fields from OCR results
    for (const result of ocrResults) {
        const text = result.text.trim();
        
        // ID Number
        if (patterns.idNumber.test(text)) {
            fields.idNumber = text.match(patterns.idNumber)[0];
        }
        
        // Name (usually the longest text in caps)
        if (text.length > 10 && text === text.toUpperCase() && !text.includes('SINGAPORE')) {
            if (text.includes('RAMANATHAN') || text.includes('SUBRAMANIAN')) {
                fields.name = text;
            }
        }
        
        // Date fields
        const dateMatch = text.match(patterns.datePattern);
        if (dateMatch) {
            if (dateMatch[1].toLowerCase().includes('birth')) {
                fields.dateOfBirth = dateMatch[2];
            } else if (dateMatch[1].toLowerCase().includes('issue')) {
                fields.dateOfIssue = dateMatch[2];
            }
        }
        
        // Simple field matching
        if (text.includes('Race')) {
            const nextResult = ocrResults[ocrResults.indexOf(result) + 1];
            if (nextResult) fields.race = nextResult.text;
        }
        
        if (text === 'M' || text === 'F') {
            fields.sex = text;
        }
        
        // Address
        if (text.includes('BLK') || text.includes('SINGAPORE')) {
            fields.address += text + ' ';
        }
    }
    
    return fields;
}

// Receipt preprocessing
function preprocessReceipt(imgData, width, height) {
    const data = imgData.data;
    
    // Enhance thermal receipt text
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Grayscale conversion
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        
        // Thermal receipt enhancement
        let enhanced;
        if (gray < 60) {
            // Very dark text - make black
            enhanced = 0;
        } else if (gray < 120) {
            // Dark gray text - enhance
            enhanced = (gray - 60) * 0.5;
        } else if (gray < 180) {
            // Medium gray - likely faded text
            enhanced = ((gray - 120) / 60) * 255;
        } else {
            // Light background - make white
            enhanced = 255;
        }
        
        // Apply adaptive threshold for thermal prints
        if (enhanced < 128) {
            // Apply sigmoid curve for smoother transitions
            enhanced = 255 / (1 + Math.exp(-(enhanced - 64) / 16));
        } else {
            enhanced = 255;
        }
        
        enhanced = Math.max(0, Math.min(255, enhanced));
        
        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
    }
    
    // Apply thermal print enhancement
    enhanceThermalPrint(data, width, height);
    
    return imgData;
}

// Enhance thermal print quality
function enhanceThermalPrint(data, width, height) {
    // Edge enhancement for thermal prints
    const temp = new Uint8ClampedArray(data);
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            
            // Sobel edge detection
            const gx = 
                -temp[((y - 1) * width + (x - 1)) * 4] + temp[((y - 1) * width + (x + 1)) * 4] +
                -2 * temp[(y * width + (x - 1)) * 4] + 2 * temp[(y * width + (x + 1)) * 4] +
                -temp[((y + 1) * width + (x - 1)) * 4] + temp[((y + 1) * width + (x + 1)) * 4];
            
            const gy = 
                -temp[((y - 1) * width + (x - 1)) * 4] - 2 * temp[((y - 1) * width + x) * 4] - temp[((y - 1) * width + (x + 1)) * 4] +
                temp[((y + 1) * width + (x - 1)) * 4] + 2 * temp[((y + 1) * width + x) * 4] + temp[((y + 1) * width + (x + 1)) * 4];
            
            const edge = Math.sqrt(gx * gx + gy * gy);
            
            // Enhance edges
            if (edge > 30) {
                const current = temp[idx];
                const enhanced = current < 128 ? Math.max(0, current - 50) : Math.min(255, current + 50);
                data[idx] = enhanced;
                data[idx + 1] = enhanced;
                data[idx + 2] = enhanced;
            }
        }
    }
}

// Extract receipt fields
export function extractReceiptFields(ocrResults) {
    const fields = {
        storeName: '',
        storeAddress: '',
        date: '',
        time: '',
        items: [],
        subtotal: '',
        tax: '',
        total: '',
        paymentMethod: '',
        receiptNumber: ''
    };
    
    // Pattern matching for receipt fields
    const patterns = {
        date: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,
        time: /\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?/i,
        price: /[$]?\d+\.\d{2}/,
        total: /(?:TOTAL|AMOUNT|BALANCE)\s*:?\s*[$]?([\d,]+\.\d{2})/i,
        tax: /(?:TAX|GST|VAT)\s*:?\s*[$]?([\d,]+\.\d{2})/i,
        subtotal: /(?:SUBTOTAL|SUB\s*TOTAL)\s*:?\s*[$]?([\d,]+\.\d{2})/i,
        receiptNumber: /(?:RECEIPT|INVOICE|TRANS)\s*(?:#|NO\.?|NUMBER)?\s*:?\s*([A-Z0-9\-]+)/i,
        cardNumber: /(?:\*{4}|X{4})\s*(\d{4})/
    };
    
    // Sort and group results
    const sortedResults = [...ocrResults].sort((a, b) => {
        const aY = a.box ? Math.min(...a.box.map(p => p[1])) : a.bbox ? a.bbox.y0 : 0;
        const bY = b.box ? Math.min(...b.box.map(p => p[1])) : b.bbox ? b.bbox.y0 : 0;
        const aX = a.box ? Math.min(...a.box.map(p => p[0])) : a.bbox ? a.bbox.x0 : 0;
        const bX = b.box ? Math.min(...b.box.map(p => p[0])) : b.bbox ? b.bbox.x0 : 0;
        
        if (Math.abs(aY - bY) < 15) {
            return aX - bX;
        }
        return aY - bY;
    });
    
    // Group by lines
    const lines = [];
    let currentLine = [];
    let lastY = -1;
    
    sortedResults.forEach(result => {
        const y = result.box ? Math.min(...result.box.map(p => p[1])) : 
                 result.bbox ? result.bbox.y0 : 0;
        
        if (lastY !== -1 && Math.abs(y - lastY) > 20) {
            if (currentLine.length > 0) {
                lines.push(currentLine.join(' '));
                currentLine = [];
            }
        }
        
        currentLine.push(result.text);
        lastY = y;
    });
    
    if (currentLine.length > 0) {
        lines.push(currentLine.join(' '));
    }
    
    // Extract store name (usually first few lines)
    if (lines.length > 0) {
        fields.storeName = lines[0];
        // Check if second line might be part of store name
        if (lines.length > 1 && !patterns.date.test(lines[1]) && !patterns.time.test(lines[1])) {
            fields.storeAddress = lines[1];
        }
    }
    
    // Process each result
    for (const result of ocrResults) {
        const text = result.text.trim();
        
        // Date
        const dateMatch = text.match(patterns.date);
        if (dateMatch && !fields.date) {
            fields.date = dateMatch[0];
        }
        
        // Time
        const timeMatch = text.match(patterns.time);
        if (timeMatch && !fields.time) {
            fields.time = timeMatch[0];
        }
        
        // Total
        const totalMatch = text.match(patterns.total);
        if (totalMatch) {
            fields.total = totalMatch[1];
        }
        
        // Tax
        const taxMatch = text.match(patterns.tax);
        if (taxMatch) {
            fields.tax = taxMatch[1];
        }
        
        // Subtotal
        const subtotalMatch = text.match(patterns.subtotal);
        if (subtotalMatch) {
            fields.subtotal = subtotalMatch[1];
        }
        
        // Receipt number
        const receiptMatch = text.match(patterns.receiptNumber);
        if (receiptMatch) {
            fields.receiptNumber = receiptMatch[1];
        }
        
        // Items with prices
        if (patterns.price.test(text) && !patterns.total.test(text) && 
            !patterns.tax.test(text) && !patterns.subtotal.test(text)) {
            // This might be a line item
            const priceMatch = text.match(patterns.price);
            if (priceMatch) {
                const itemName = text.replace(priceMatch[0], '').trim();
                if (itemName) {
                    fields.items.push({
                        name: itemName,
                        price: priceMatch[0]
                    });
                }
            }
        }
        
        // Payment method
        if (text.includes('VISA') || text.includes('MASTERCARD') || 
            text.includes('AMEX') || text.includes('CASH')) {
            fields.paymentMethod = text;
        }
    }
    
    return fields;
}

// Update PaddleOCR configuration for documents
export function updatePaddleOCRForDocuments(engineInstance, docType = 'general') {
    const config = docType === 'idcard' ? DOCUMENT_OCR_CONFIG : 
                   docType === 'receipt' ? RECEIPT_OCR_CONFIG :
                   DOCUMENT_OCR_CONFIG;
    
    // Update detection parameters
    engineInstance.CONFIG.det_limit_side_len = config.detection.det_limit_side_len;
    engineInstance.CONFIG.det_db_thresh = config.detection.det_db_thresh;
    engineInstance.CONFIG.det_db_box_thresh = config.detection.det_db_box_thresh;
    engineInstance.CONFIG.det_db_unclip_ratio = config.detection.det_db_unclip_ratio;
    engineInstance.CONFIG.det_db_min_size = config.detection.det_db_min_size;
    engineInstance.CONFIG.det_db_max_candidates = config.detection.det_db_max_candidates;
    engineInstance.CONFIG.grid_size = config.detection.grid_size;
    engineInstance.CONFIG.min_area_thresh = config.detection.min_area_thresh;
    
    // Update recognition parameters
    engineInstance.CONFIG.rec_batch_num = config.recognition.rec_batch_num;
    engineInstance.CONFIG.drop_score = config.recognition.drop_score;
    
    console.log(`PaddleOCR configuration updated for ${docType} processing`);
}