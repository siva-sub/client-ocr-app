// PDF-specific OCR configuration optimized for multi-page documents
export const PDF_OCR_CONFIG = {
    // Detection parameters optimized for PDF documents
    detection: {
        // High resolution for PDF clarity
        det_limit_side_len: 2048,
        det_limit_type: 'max',
        
        // Optimized thresholds for PDF text
        det_db_thresh: 0.12,          // Balanced threshold for PDF text
        det_db_box_thresh: 0.18,      // Moderate threshold for text regions
        det_db_unclip_ratio: 1.5,     // Standard expansion
        det_db_min_size: 3,           // Small text detection
        det_db_max_candidates: 3500,  // Many candidates for dense PDFs
        
        // Detection settings
        det_use_dilation: true,
        det_dilation_kernel: 1,
        
        // Grid and area settings
        grid_size: 16,                // Medium grid for PDFs
        min_area_thresh: 10,          // Standard minimum area
        max_area_thresh: 0.95,        // Almost full page
    },
    
    // Recognition parameters for PDFs
    recognition: {
        rec_image_height: 48,         // Standard height
        rec_image_width: 480,         // Wide for PDF text lines
        rec_batch_num: 32,            // Large batch for efficiency
        drop_score: 0.2,              // Moderate confidence threshold
        
        // Character settings
        use_space_char: true,
        max_text_length: 500,         // Long text for PDFs
        
        // Multi-language support
        support_special_chars: true,
        support_symbols: true,
        support_multilingual: true,
    },
    
    // PDF-specific preprocessing
    preprocessing: {
        // Contrast and brightness
        enhance_contrast: true,
        contrast_factor: 1.4,         // Moderate contrast
        brightness_adjustment: 5,     // Slight brightness
        
        // Grayscale conversion
        convert_to_grayscale: true,
        grayscale_method: 'luminance',
        
        // Noise reduction
        denoise: true,
        denoise_strength: 'light',    // Preserve quality
        
        // Sharpening
        sharpen: true,
        sharpen_amount: 1.0,          // Standard sharpening
        
        // Background handling
        remove_background: true,
        background_threshold: 240,    // Light background removal
        
        // Deskew
        auto_deskew: true,
        max_skew_angle: 3,            // PDFs usually well-aligned
        
        // PDF-specific
        remove_watermarks: true,
        enhance_scanned_text: true,
        fix_low_resolution: true,
    },
    
    // PDF structure analysis
    pdf: {
        // Layout analysis
        detect_columns: true,
        detect_headers: true,
        detect_footers: true,
        detect_page_numbers: true,
        
        // Content extraction
        extract_tables: true,
        extract_images: true,
        extract_footnotes: true,
        preserve_formatting: true,
        
        // Page handling
        process_all_pages: true,
        merge_pages: true,
        maintain_reading_order: true,
        
        // Text structure
        detect_paragraphs: true,
        detect_lists: true,
        detect_headings: true,
        heading_levels: ['h1', 'h2', 'h3', 'h4'],
        
        // Special elements
        detect_toc: true,             // Table of contents
        detect_references: true,      // Citations/references
        detect_equations: true,       // Mathematical equations
        detect_code_blocks: true,     // Code snippets
    },
    
    // Post-processing for PDFs
    postprocessing: {
        // Text validation
        validate_encoding: true,
        fix_encoding_errors: true,
        normalize_unicode: true,
        
        // Structure preservation
        preserve_indentation: true,
        maintain_line_breaks: true,
        preserve_paragraph_spacing: true,
        
        // Content organization
        group_by_sections: true,
        extract_outline: true,
        generate_toc: true,
        
        // Confidence settings
        min_confidence: 0.6,
        
        // Output formatting
        output_format: 'structured',
        include_metadata: true,
        include_page_numbers: true,
        include_bounding_boxes: true,
    },
    
    // Highlighting configuration
    highlighting: {
        enable_text_selection: true,
        enable_search_highlighting: true,
        highlight_colors: {
            yellow: '#FFEB3B',
            green: '#4CAF50',
            blue: '#2196F3',
            pink: '#E91E63',
            orange: '#FF9800'
        },
        default_color: 'yellow',
        opacity: 0.3,
        
        // Annotation features
        enable_comments: true,
        enable_notes: true,
        enable_bookmarks: true,
    }
};

// PDF preprocessing optimized for text extraction
export async function preprocessPDF(imageData, canvas, ctx, pageNumber = 1) {
    const { width, height } = imageData;
    
    // Create working canvas
    const workCanvas = document.createElement('canvas');
    const workCtx = workCanvas.getContext('2d');
    workCanvas.width = width;
    workCanvas.height = height;
    
    // Draw original image
    workCtx.drawImage(imageData, 0, 0);
    let imgData = workCtx.getImageData(0, 0, width, height);
    
    // Apply PDF-specific preprocessing
    imgData = enhancePDFText(imgData, width, height);
    
    // Apply sharpening
    imgData = applyPDFSharpening(imgData, width, height);
    
    workCtx.putImageData(imgData, 0, 0);
    return workCanvas;
}

// Enhance PDF text
function enhancePDFText(imgData, width, height) {
    const data = imgData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Luminance-based grayscale
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        
        // Adaptive thresholding for PDF text
        let enhanced;
        if (gray < 50) {
            // Very dark - likely text
            enhanced = 0;
        } else if (gray < 180) {
            // Gray text - enhance contrast
            enhanced = Math.pow((gray - 50) / 130, 1.2) * 255;
        } else {
            // Light background
            enhanced = 255;
        }
        
        // Apply local contrast enhancement
        if (enhanced < 128) {
            enhanced = enhanced * 0.8;
        } else {
            enhanced = Math.min(255, enhanced * 1.1);
        }
        
        enhanced = Math.max(0, Math.min(255, enhanced));
        
        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
    }
    
    return imgData;
}

// PDF-specific sharpening
function applyPDFSharpening(imageData, width, height) {
    const data = imageData.data;
    const output = new Uint8ClampedArray(data);
    
    // Laplacian kernel for edge enhancement
    const kernel = [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
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
            
            output[idx] = Math.max(0, Math.min(255, sum));
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

// Extract structured content from PDF OCR results
export function extractPDFStructure(ocrResults, pageNumber = 1) {
    const structure = {
        page: pageNumber,
        headings: [],
        paragraphs: [],
        lists: [],
        tables: [],
        footnotes: [],
        pageNumber: '',
        metadata: {
            totalWords: 0,
            totalCharacters: 0,
            avgConfidence: 0
        }
    };
    
    // Sort results by position
    const sortedResults = [...ocrResults].sort((a, b) => {
        const aY = a.box ? Math.min(...a.box.map(p => p[1])) : a.bbox ? a.bbox.y0 : 0;
        const bY = b.box ? Math.min(...b.box.map(p => p[1])) : b.bbox ? b.bbox.y0 : 0;
        const aX = a.box ? Math.min(...a.box.map(p => p[0])) : a.bbox ? a.bbox.x0 : 0;
        const bX = b.box ? Math.min(...b.box.map(p => p[0])) : b.bbox ? b.bbox.x0 : 0;
        
        if (Math.abs(aY - bY) < 10) {
            return aX - bX;
        }
        return aY - bY;
    });
    
    // Group into lines
    const lines = [];
    let currentLine = [];
    let lastY = -1;
    
    sortedResults.forEach(result => {
        const y = result.box ? Math.min(...result.box.map(p => p[1])) : 
                 result.bbox ? result.bbox.y0 : 0;
        
        if (lastY !== -1 && Math.abs(y - lastY) > 20) {
            if (currentLine.length > 0) {
                lines.push({
                    text: currentLine.map(r => r.text).join(' '),
                    y: lastY,
                    results: currentLine
                });
                currentLine = [];
            }
        }
        
        currentLine.push(result);
        lastY = y;
    });
    
    if (currentLine.length > 0) {
        lines.push({
            text: currentLine.map(r => r.text).join(' '),
            y: lastY,
            results: currentLine
        });
    }
    
    // Analyze lines for structure
    lines.forEach((line, index) => {
        const text = line.text.trim();
        
        // Detect headings
        if (isHeading(text, line.results)) {
            structure.headings.push({
                text,
                level: getHeadingLevel(text, line.results),
                position: line.y
            });
        }
        // Detect lists
        else if (isList(text)) {
            structure.lists.push({
                text: text.replace(/^[\-\*\•\d+\.]\s*/, ''),
                type: getListType(text),
                position: line.y
            });
        }
        // Detect page numbers
        else if (isPageNumber(text, line.y, lines.length)) {
            structure.pageNumber = text;
        }
        // Detect footnotes
        else if (isFootnote(text, line.y, lines)) {
            structure.footnotes.push({
                text,
                position: line.y
            });
        }
        // Regular paragraphs
        else if (text.length > 20) {
            structure.paragraphs.push({
                text,
                position: line.y
            });
        }
    });
    
    // Calculate metadata
    const allText = lines.map(l => l.text).join(' ');
    structure.metadata.totalWords = allText.split(/\s+/).length;
    structure.metadata.totalCharacters = allText.length;
    structure.metadata.avgConfidence = sortedResults.reduce((sum, r) => sum + (r.confidence || 0), 0) / sortedResults.length;
    
    return structure;
}

// Helper functions for structure detection
function isHeading(text, results) {
    // Check if text is likely a heading
    if (text.length > 100) return false; // Too long for heading
    if (text.endsWith('.') && text.length > 50) return false; // Likely a sentence
    
    // Check formatting clues
    const isUpperCase = text === text.toUpperCase() && text.length > 3;
    const startsWithNumber = /^\d+\.?\s+[A-Z]/.test(text);
    const isShort = text.length < 60;
    
    return (isUpperCase || startsWithNumber) && isShort;
}

function getHeadingLevel(text, results) {
    if (/^[A-Z\s]+$/.test(text) && text.length < 30) return 1;
    if (/^\d+\.\s+[A-Z]/.test(text)) return 2;
    if (/^\d+\.\d+\s+/.test(text)) return 3;
    return 4;
}

function isList(text) {
    return /^[\-\*\•]\s+/.test(text) || /^\d+\.\s+/.test(text) || /^[a-z]\)\s+/.test(text);
}

function getListType(text) {
    if (/^[\-\*\•]\s+/.test(text)) return 'bullet';
    if (/^\d+\.\s+/.test(text)) return 'numbered';
    if (/^[a-z]\)\s+/.test(text)) return 'letter';
    return 'unknown';
}

function isPageNumber(text, yPosition, totalLines) {
    // Simple page number detection
    const pagePattern = /^-?\s*\d+\s*-?$/;
    const isAtBottom = yPosition > 0.9 * totalLines;
    return pagePattern.test(text) && (isAtBottom || text.length < 5);
}

function isFootnote(text, yPosition, lines) {
    // Simple footnote detection
    const footnotePattern = /^[\d+\*†‡§¶]\s+/;
    const isNearBottom = yPosition > 0.8 * lines.length;
    return footnotePattern.test(text) && isNearBottom;
}

// Search and highlight functionality
export function createPDFSearchHighlighter(ocrResults) {
    const searchIndex = {};
    
    // Build search index
    ocrResults.forEach((result, index) => {
        const words = result.text.toLowerCase().split(/\s+/);
        words.forEach(word => {
            if (!searchIndex[word]) {
                searchIndex[word] = [];
            }
            searchIndex[word].push({
                index,
                result,
                originalText: result.text
            });
        });
    });
    
    return {
        search: (query) => {
            const queryWords = query.toLowerCase().split(/\s+/);
            const matches = [];
            
            queryWords.forEach(word => {
                if (searchIndex[word]) {
                    matches.push(...searchIndex[word]);
                }
            });
            
            // Remove duplicates
            const uniqueMatches = Array.from(new Set(matches.map(m => m.index)))
                .map(index => matches.find(m => m.index === index));
            
            return uniqueMatches;
        },
        
        highlightResults: (matches, color = 'yellow') => {
            return matches.map(match => ({
                ...match.result,
                highlight: {
                    color: PDF_OCR_CONFIG.highlighting.highlight_colors[color],
                    opacity: PDF_OCR_CONFIG.highlighting.opacity
                }
            }));
        }
    };
}

// Update PaddleOCR configuration for PDFs
export function updatePaddleOCRForPDF(engineInstance) {
    const config = PDF_OCR_CONFIG;
    
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
    
    console.log('PaddleOCR configuration updated for PDF processing');
}