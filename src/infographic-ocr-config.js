// Optimized OCR configuration for complex infographics and multi-region documents
export const INFOGRAPHIC_OCR_CONFIG = {
    // Detection parameters optimized for infographics
    detection: {
        // Use higher resolution for better text detection in complex layouts
        det_limit_side_len: 1920,    // Increased from 1280 for better detail
        det_limit_type: 'max',
        
        // Very low thresholds to detect all text regions
        det_db_thresh: 0.15,         // Slightly higher than 0.05 to reduce noise
        det_db_box_thresh: 0.2,      // Balanced threshold for text/graphics
        det_db_unclip_ratio: 2.0,    // Good coverage without over-expansion
        det_db_min_size: 5,          // Small enough for tiny text
        det_db_max_candidates: 3000,  // More candidates for complex layouts
        
        // Enable dilation for better text connectivity
        det_use_dilation: true,
        det_dilation_kernel: 2,       // Smaller kernel for precision
        
        // Grid size for dimension alignment
        grid_size: 8,                 // Smaller grid for finer control
        
        // Area thresholds
        min_area_thresh: 10,          // Small area threshold for tiny text
        max_area_thresh: 0.9,         // Percentage of image area
    },
    
    // Recognition parameters for better accuracy
    recognition: {
        rec_image_height: 48,
        rec_image_width: 320,
        rec_batch_num: 16,           // Larger batch for efficiency
        drop_score: 0.3,             // Higher threshold for quality
        
        // Character set optimization
        use_space_char: true,
        max_text_length: 200,        // Longer for paragraph text
    },
    
    // Preprocessing for infographics
    preprocessing: {
        // Contrast enhancement for colored backgrounds
        enhance_contrast: true,
        contrast_factor: 1.5,
        
        // Color space conversion
        convert_to_grayscale: true,
        grayscale_method: 'luminosity', // Better for colored text
        
        // Noise reduction
        denoise: true,
        denoise_strength: 'medium',
        
        // Edge enhancement for text clarity
        sharpen: true,
        sharpen_amount: 0.8,
        
        // Background removal for better detection
        remove_background: true,
        background_threshold: 240,
        
        // Text/graphics separation
        separate_text_graphics: true,
    },
    
    // Region-specific processing
    regions: {
        // Enable multi-region detection
        enable_region_detection: true,
        
        // Region types to detect
        detect_titles: true,
        detect_paragraphs: true,
        detect_captions: true,
        detect_labels: true,
        
        // Layout analysis
        analyze_layout: true,
        merge_nearby_regions: true,
        merge_threshold: 30,         // Pixels distance for merging
        
        // Text orientation
        detect_text_direction: true,
        support_vertical_text: false,
        support_rotated_text: true,
        rotation_angles: [-45, -30, -15, 0, 15, 30, 45],
    },
    
    // Post-processing for better results
    postprocessing: {
        // Text cleaning
        remove_extra_spaces: true,
        fix_common_ocr_errors: true,
        
        // Structure preservation
        preserve_formatting: true,
        detect_bullet_points: true,
        detect_numbering: true,
        
        // Confidence filtering
        min_confidence: 0.5,
        
        // Output formatting
        group_by_regions: true,
        sort_by_position: true,
        include_coordinates: true,
    },
    
    // Performance optimization
    performance: {
        use_gpu: true,
        gpu_backend: 'webgl',
        fallback_backend: 'wasm',
        
        // Memory management
        max_memory_mb: 512,
        release_intermediate: true,
        
        // Threading
        num_threads: 4,
        use_simd: true,
    }
};

// Preprocessing function for infographics
export async function preprocessInfographic(imageData, canvas, ctx) {
    const { width, height } = imageData;
    
    // Apply preprocessing steps
    const processedData = ctx.createImageData(width, height);
    const src = imageData.data;
    const dst = processedData.data;
    
    // 1. Convert to grayscale with luminosity method
    for (let i = 0; i < src.length; i += 4) {
        const gray = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
        
        // 2. Apply contrast enhancement
        let enhanced = ((gray - 128) * INFOGRAPHIC_OCR_CONFIG.preprocessing.contrast_factor) + 128;
        enhanced = Math.max(0, Math.min(255, enhanced));
        
        // 3. Background removal (make light backgrounds white)
        if (enhanced > INFOGRAPHIC_OCR_CONFIG.preprocessing.background_threshold) {
            enhanced = 255;
        }
        
        // 4. Enhance dark text
        if (enhanced < 100) {
            enhanced = enhanced * 0.8; // Make dark text darker
        }
        
        dst[i] = enhanced;
        dst[i + 1] = enhanced;
        dst[i + 2] = enhanced;
        dst[i + 3] = src[i + 3];
    }
    
    // 5. Apply sharpening filter
    if (INFOGRAPHIC_OCR_CONFIG.preprocessing.sharpen) {
        applySharpening(processedData, width, height);
    }
    
    return processedData;
}

// Sharpening filter for text clarity
function applySharpening(imageData, width, height) {
    const data = imageData.data;
    const output = new Uint8ClampedArray(data);
    
    // Sharpening kernel
    const kernel = [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
    ];
    
    const amount = INFOGRAPHIC_OCR_CONFIG.preprocessing.sharpen_amount;
    
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
            
            // Blend sharpened with original
            const sharpened = data[idx] + (sum - data[idx]) * amount;
            output[idx] = Math.max(0, Math.min(255, sharpened));
            output[idx + 1] = output[idx];
            output[idx + 2] = output[idx];
        }
    }
    
    // Copy back
    for (let i = 0; i < data.length; i++) {
        data[i] = output[i];
    }
}

// Region detection for infographics
export function detectTextRegions(binaryImage, width, height) {
    const regions = [];
    const visited = new Set();
    
    // Scan for text regions with adaptive grid
    const gridSize = 15; // Smaller grid for finer detection
    
    for (let y = 0; y < height; y += gridSize) {
        for (let x = 0; x < width; x += gridSize) {
            const idx = y * width + x;
            
            if (binaryImage[idx] === 255 && !visited.has(idx)) {
                const region = floodFillRegion(binaryImage, width, height, x, y, visited);
                
                if (region && isValidTextRegion(region)) {
                    regions.push(region);
                }
            }
        }
    }
    
    // Merge nearby regions
    const mergedRegions = mergeNearbyRegions(regions, INFOGRAPHIC_OCR_CONFIG.regions.merge_threshold);
    
    // Sort regions by position (top-to-bottom, left-to-right)
    mergedRegions.sort((a, b) => {
        const yDiff = a.bounds.minY - b.bounds.minY;
        if (Math.abs(yDiff) > 20) return yDiff;
        return a.bounds.minX - b.bounds.minX;
    });
    
    return mergedRegions;
}

// Helper functions
function floodFillRegion(image, width, height, startX, startY, visited) {
    const region = {
        points: [],
        bounds: {
            minX: startX,
            maxX: startX,
            minY: startY,
            maxY: startY
        }
    };
    
    const stack = [[startX, startY]];
    const maxSize = 50000; // Limit region size
    
    while (stack.length > 0 && region.points.length < maxSize) {
        const [x, y] = stack.pop();
        const idx = y * width + x;
        
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        if (visited.has(idx) || image[idx] !== 255) continue;
        
        visited.add(idx);
        region.points.push([x, y]);
        
        // Update bounds
        region.bounds.minX = Math.min(region.bounds.minX, x);
        region.bounds.maxX = Math.max(region.bounds.maxX, x);
        region.bounds.minY = Math.min(region.bounds.minY, y);
        region.bounds.maxY = Math.max(region.bounds.maxY, y);
        
        // Add neighbors (8-connectivity for better region detection)
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                stack.push([x + dx, y + dy]);
            }
        }
    }
    
    return region;
}

function isValidTextRegion(region) {
    const width = region.bounds.maxX - region.bounds.minX;
    const height = region.bounds.maxY - region.bounds.minY;
    const area = width * height;
    
    // Filter out too small or too large regions
    if (area < INFOGRAPHIC_OCR_CONFIG.detection.min_area_thresh) return false;
    if (width < 10 || height < 8) return false; // Minimum text size
    if (width > 2000 || height > 2000) return false; // Maximum region size
    
    // Aspect ratio check (text regions typically have certain ratios)
    const aspectRatio = width / height;
    if (aspectRatio > 50 || aspectRatio < 0.05) return false;
    
    return true;
}

function mergeNearbyRegions(regions, threshold) {
    const merged = [];
    const used = new Set();
    
    for (let i = 0; i < regions.length; i++) {
        if (used.has(i)) continue;
        
        const currentRegion = { ...regions[i] };
        used.add(i);
        
        // Check for nearby regions to merge
        for (let j = i + 1; j < regions.length; j++) {
            if (used.has(j)) continue;
            
            const distance = calculateRegionDistance(currentRegion.bounds, regions[j].bounds);
            
            if (distance < threshold) {
                // Merge regions
                currentRegion.bounds.minX = Math.min(currentRegion.bounds.minX, regions[j].bounds.minX);
                currentRegion.bounds.maxX = Math.max(currentRegion.bounds.maxX, regions[j].bounds.maxX);
                currentRegion.bounds.minY = Math.min(currentRegion.bounds.minY, regions[j].bounds.minY);
                currentRegion.bounds.maxY = Math.max(currentRegion.bounds.maxY, regions[j].bounds.maxY);
                currentRegion.points = currentRegion.points.concat(regions[j].points);
                used.add(j);
            }
        }
        
        merged.push(currentRegion);
    }
    
    return merged;
}

function calculateRegionDistance(bounds1, bounds2) {
    // Calculate minimum distance between two rectangular regions
    const xDistance = Math.max(0, Math.max(bounds1.minX - bounds2.maxX, bounds2.minX - bounds1.maxX));
    const yDistance = Math.max(0, Math.max(bounds1.minY - bounds2.maxY, bounds2.minY - bounds1.maxY));
    
    return Math.sqrt(xDistance * xDistance + yDistance * yDistance);
}

// Export configuration updater for PaddleOCR
export function updatePaddleOCRConfig(engineInstance) {
    // Update detection parameters
    engineInstance.CONFIG.det_limit_side_len = INFOGRAPHIC_OCR_CONFIG.detection.det_limit_side_len;
    engineInstance.CONFIG.det_db_thresh = INFOGRAPHIC_OCR_CONFIG.detection.det_db_thresh;
    engineInstance.CONFIG.det_db_box_thresh = INFOGRAPHIC_OCR_CONFIG.detection.det_db_box_thresh;
    engineInstance.CONFIG.det_db_unclip_ratio = INFOGRAPHIC_OCR_CONFIG.detection.det_db_unclip_ratio;
    engineInstance.CONFIG.det_db_min_size = INFOGRAPHIC_OCR_CONFIG.detection.det_db_min_size;
    engineInstance.CONFIG.det_db_max_candidates = INFOGRAPHIC_OCR_CONFIG.detection.det_db_max_candidates;
    engineInstance.CONFIG.grid_size = INFOGRAPHIC_OCR_CONFIG.detection.grid_size;
    engineInstance.CONFIG.min_area_thresh = INFOGRAPHIC_OCR_CONFIG.detection.min_area_thresh;
    
    // Update recognition parameters
    engineInstance.CONFIG.rec_batch_num = INFOGRAPHIC_OCR_CONFIG.recognition.rec_batch_num;
    engineInstance.CONFIG.drop_score = INFOGRAPHIC_OCR_CONFIG.recognition.drop_score;
    
    console.log('PaddleOCR configuration updated for infographic processing');
}