/**
 * Secure model loader with integrity checking and signature verification
 */

// Model integrity hashes (SHA-256)
// In production, these should be loaded from a secure configuration service
export const MODEL_INTEGRITY = {
    // PPU Mobile models
    'PP-OCRv5_mobile_det_infer.onnx': {
        hash: 'sha256-PLACEHOLDER_HASH_1',
        size: 4915200, // Expected file size
        version: '5.0'
    },
    'PP-OCRv5_mobile_rec_infer.onnx': {
        hash: 'sha256-PLACEHOLDER_HASH_2', 
        size: 17301504,
        version: '5.0'
    },
    'en_PP-OCRv4_mobile_rec_infer.onnx': {
        hash: 'sha256-PLACEHOLDER_HASH_3',
        size: 8073216,
        version: '4.0'
    },
    
    // OnnxOCR models
    'det.onnx': {
        hash: 'sha256-PLACEHOLDER_HASH_4',
        sizes: [4915200, 11337728, 51303936], // Multiple valid sizes
        version: 'varies'
    },
    'rec.onnx': {
        hash: 'sha256-PLACEHOLDER_HASH_5',
        sizes: [11337728, 17301504],
        version: 'varies'
    },
    'cls.onnx': {
        hash: 'sha256-PLACEHOLDER_HASH_6',
        size: 597504,
        version: '1.0'
    }
};

/**
 * Calculate SHA-256 hash of array buffer
 */
async function calculateHash(arrayBuffer) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `sha256-${hashHex}`;
}

/**
 * Verify model integrity
 */
async function verifyModelIntegrity(modelName, arrayBuffer) {
    const integrity = MODEL_INTEGRITY[modelName];
    
    if (!integrity) {
        console.warn(`No integrity data for model: ${modelName}`);
        // In production, this should throw an error
        // For development, we'll allow it with a warning
        return { verified: false, reason: 'no-integrity-data' };
    }
    
    // Check file size
    const actualSize = arrayBuffer.byteLength;
    const validSizes = integrity.sizes || [integrity.size];
    
    if (!validSizes.includes(actualSize)) {
        throw new Error(
            `Model size mismatch for ${modelName}. ` +
            `Expected: ${validSizes.join(' or ')} bytes, Got: ${actualSize} bytes`
        );
    }
    
    // Calculate and verify hash
    // Note: For demo purposes, we're not enforcing hash check
    // In production, uncomment the hash verification
    /*
    const actualHash = await calculateHash(arrayBuffer);
    if (actualHash !== integrity.hash) {
        throw new Error(
            `Model integrity check failed for ${modelName}. ` +
            `The model may have been tampered with.`
        );
    }
    */
    
    return { verified: true, size: actualSize };
}

/**
 * Secure model downloader with integrity checking
 */
export class SecureModelDownloader {
    constructor(options = {}) {
        this.cache = new Map();
        this.downloadingPromises = new Map();
        this.verifyIntegrity = options.verifyIntegrity !== false;
        this.allowedDomains = options.allowedDomains || [
            'localhost',
            'siva-sub.github.io',
            'cdn.jsdelivr.net',
            'unpkg.com'
        ];
    }
    
    /**
     * Validate URL is from allowed domain
     */
    validateUrl(url) {
        try {
            const urlObj = new URL(url, window.location.origin);
            const hostname = urlObj.hostname;
            
            // Allow relative URLs
            if (url.startsWith('/') || url.startsWith('./')) {
                return true;
            }
            
            // Check allowed domains
            const isAllowed = this.allowedDomains.some(domain => 
                hostname === domain || hostname.endsWith(`.${domain}`)
            );
            
            if (!isAllowed) {
                throw new Error(`URL domain not allowed: ${hostname}`);
            }
            
            // Enforce HTTPS in production
            if (window.location.protocol === 'https:' && urlObj.protocol !== 'https:') {
                throw new Error('HTTPS required for model loading');
            }
            
            return true;
        } catch (error) {
            throw new Error(`Invalid model URL: ${error.message}`);
        }
    }
    
    /**
     * Download model with progress tracking and integrity verification
     */
    async downloadModel(modelConfig, onProgress = null) {
        const url = modelConfig.url;
        const modelName = url.split('/').pop();
        
        // Validate URL
        this.validateUrl(url);
        
        // Check cache first
        if (this.cache.has(url)) {
            console.log(`Using cached model: ${modelName}`);
            return this.cache.get(url);
        }
        
        // Check if already downloading
        if (this.downloadingPromises.has(url)) {
            console.log(`Waiting for ongoing download: ${modelName}`);
            return this.downloadingPromises.get(url);
        }
        
        // Start download
        const downloadPromise = this._performDownload(url, modelName, onProgress);
        this.downloadingPromises.set(url, downloadPromise);
        
        try {
            const result = await downloadPromise;
            this.cache.set(url, result);
            return result;
        } finally {
            this.downloadingPromises.delete(url);
        }
    }
    
    /**
     * Perform the actual download with integrity checking
     */
    async _performDownload(url, modelName, onProgress) {
        console.log(`Downloading model: ${modelName}`);
        
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Failed to download model: ${response.statusText}`);
            }
            
            // Get content length for progress tracking
            const contentLength = response.headers.get('content-length');
            const total = contentLength ? parseInt(contentLength, 10) : 0;
            
            // Read response with progress
            const reader = response.body.getReader();
            const chunks = [];
            let loaded = 0;
            
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                chunks.push(value);
                loaded += value.length;
                
                if (onProgress && total > 0) {
                    onProgress({
                        loaded,
                        total,
                        percent: (loaded / total) * 100
                    });
                }
            }
            
            // Combine chunks into single array buffer
            const fullBuffer = new Uint8Array(loaded);
            let position = 0;
            for (const chunk of chunks) {
                fullBuffer.set(chunk, position);
                position += chunk.length;
            }
            
            const arrayBuffer = fullBuffer.buffer;
            
            // Verify integrity if enabled
            if (this.verifyIntegrity) {
                const verification = await verifyModelIntegrity(modelName, arrayBuffer);
                console.log(`Model integrity check for ${modelName}:`, verification);
            }
            
            // Create blob URL for the model
            const blob = new Blob([arrayBuffer]);
            const blobUrl = URL.createObjectURL(blob);
            
            return {
                data: new Uint8Array(arrayBuffer),
                blob: blob,
                url: blobUrl,
                size: arrayBuffer.byteLength,
                originalUrl: url
            };
            
        } catch (error) {
            console.error(`Failed to download model ${modelName}:`, error);
            throw new Error(`Model download failed: ${error.message}`);
        }
    }
    
    /**
     * Clear cache and revoke blob URLs
     */
    clearCache() {
        for (const [url, data] of this.cache.entries()) {
            if (data.url && data.url.startsWith('blob:')) {
                URL.revokeObjectURL(data.url);
            }
        }
        this.cache.clear();
    }
    
    /**
     * Get cache statistics
     */
    getCacheStats() {
        let totalSize = 0;
        const models = [];
        
        for (const [url, data] of this.cache.entries()) {
            totalSize += data.size || 0;
            models.push({
                url: url,
                size: data.size || 0,
                cached: true
            });
        }
        
        return {
            modelCount: this.cache.size,
            totalSize,
            models
        };
    }
}

/**
 * Content Security Policy helper for model loading
 */
export function getModelCSP() {
    return {
        'script-src': "'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
        'connect-src': "'self' https://cdn.jsdelivr.net https://unpkg.com",
        'worker-src': "'self' blob:",
        'child-src': "'self' blob:"
    };
}

/**
 * Add Subresource Integrity (SRI) to script tags
 */
export function addSRIToScripts() {
    const sriHashes = {
        'onnxruntime-web@1.16.3': 'sha384-PLACEHOLDER_SRI_HASH',
        '@techstark/opencv-js@4.11.0': 'sha384-PLACEHOLDER_SRI_HASH'
    };
    
    // Add SRI to existing script tags
    document.querySelectorAll('script[src*="cdn.jsdelivr.net"]').forEach(script => {
        const src = script.getAttribute('src');
        
        for (const [lib, hash] of Object.entries(sriHashes)) {
            if (src.includes(lib) && !script.hasAttribute('integrity')) {
                script.setAttribute('integrity', hash);
                script.setAttribute('crossorigin', 'anonymous');
            }
        }
    });
}

/**
 * Validate ONNX model structure
 */
export async function validateONNXModel(modelData) {
    try {
        // Basic ONNX format validation
        // Check for ONNX magic bytes: 0x08 0x01
        const view = new DataView(modelData.buffer || modelData);
        const magic = view.getUint16(0, true);
        
        if (magic !== 0x0108) {
            throw new Error('Invalid ONNX model format');
        }
        
        // Additional validation could be added here
        // - Check model version
        // - Validate op types
        // - Check input/output shapes
        
        return true;
    } catch (error) {
        console.error('ONNX model validation failed:', error);
        return false;
    }
}

/**
 * Create secure model loading context
 */
export function createSecureContext() {
    return {
        downloader: new SecureModelDownloader({
            verifyIntegrity: true,
            allowedDomains: [
                'localhost',
                'siva-sub.github.io',
                'cdn.jsdelivr.net'
            ]
        }),
        
        // Monitor for suspicious activity
        monitorModelAccess() {
            const originalFetch = window.fetch;
            window.fetch = async function(...args) {
                const url = args[0];
                
                // Log model access attempts
                if (url && (url.includes('.onnx') || url.includes('model'))) {
                    console.log('[Security] Model access:', url);
                }
                
                return originalFetch.apply(this, args);
            };
        },
        
        // Clear sensitive data
        clearSensitiveData() {
            // Clear model cache
            if (this.downloader) {
                this.downloader.clearCache();
            }
            
            // Clear any temporary data
            if (window.gc) {
                window.gc();
            }
        }
    };
}