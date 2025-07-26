import store from 'store2';

/**
 * OCR Cache Manager using store2
 * Provides intelligent caching for OCR results with automatic cleanup
 */
export class OCRCacheManager {
    constructor(options = {}) {
        this.namespace = options.namespace || 'ocr-cache';
        this.maxCacheSize = options.maxCacheSize || 50 * 1024 * 1024; // 50MB default
        this.maxAge = options.maxAge || 7 * 24 * 60 * 60 * 1000; // 7 days default
        this.store = store.namespace(this.namespace);
        
        // Initialize cache metadata
        if (!this.store.get('metadata')) {
            this.store.set('metadata', {
                version: '1.0',
                created: Date.now(),
                totalSize: 0,
                entries: {}
            });
        }
        
        // Clean old entries on initialization
        this.cleanupOldEntries();
    }
    
    /**
     * Generate cache key from image data
     */
    generateCacheKey(imageData, engineType, modelVersion) {
        // Create a unique key based on image content and processing parameters
        const dataStr = typeof imageData === 'string' ? imageData : JSON.stringify(imageData);
        const keyData = `${dataStr}-${engineType}-${modelVersion}`;
        
        // Simple hash function for key generation
        let hash = 0;
        for (let i = 0; i < keyData.length; i++) {
            const char = keyData.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return `ocr-${Math.abs(hash).toString(36)}`;
    }
    
    /**
     * Get cached OCR result
     */
    get(imageData, engineType, modelVersion) {
        const key = this.generateCacheKey(imageData, engineType, modelVersion);
        const entry = this.store.get(key);
        
        if (!entry) {
            return null;
        }
        
        // Check if entry is expired
        if (Date.now() - entry.timestamp > this.maxAge) {
            this.remove(key);
            return null;
        }
        
        // Update last accessed time
        entry.lastAccessed = Date.now();
        this.store.set(key, entry);
        
        return entry.data;
    }
    
    /**
     * Cache OCR result
     */
    set(imageData, engineType, modelVersion, ocrResult) {
        const key = this.generateCacheKey(imageData, engineType, modelVersion);
        const dataStr = JSON.stringify(ocrResult);
        const size = new Blob([dataStr]).size;
        
        // Check if we need to make room
        this.ensureCacheSpace(size);
        
        const entry = {
            timestamp: Date.now(),
            lastAccessed: Date.now(),
            engineType,
            modelVersion,
            size,
            data: ocrResult
        };
        
        // Update metadata
        const metadata = this.store.get('metadata');
        metadata.totalSize += size;
        metadata.entries[key] = {
            size,
            timestamp: entry.timestamp
        };
        this.store.set('metadata', metadata);
        
        // Store the entry
        this.store.set(key, entry);
        
        return key;
    }
    
    /**
     * Remove cached entry
     */
    remove(key) {
        const entry = this.store.get(key);
        if (entry) {
            const metadata = this.store.get('metadata');
            if (metadata.entries[key]) {
                metadata.totalSize -= metadata.entries[key].size;
                delete metadata.entries[key];
                this.store.set('metadata', metadata);
            }
            this.store.remove(key);
        }
    }
    
    /**
     * Clear all cache
     */
    clear() {
        const keys = this.store.keys();
        keys.forEach(key => {
            if (key !== 'metadata') {
                this.store.remove(key);
            }
        });
        
        // Reset metadata
        this.store.set('metadata', {
            version: '1.0',
            created: Date.now(),
            totalSize: 0,
            entries: {}
        });
    }
    
    /**
     * Get cache statistics
     */
    getStats() {
        const metadata = this.store.get('metadata');
        const entries = Object.keys(metadata.entries).length;
        
        return {
            totalSize: metadata.totalSize,
            maxSize: this.maxCacheSize,
            usagePercent: (metadata.totalSize / this.maxCacheSize) * 100,
            entries,
            oldestEntry: this.getOldestEntry(),
            newestEntry: this.getNewestEntry()
        };
    }
    
    /**
     * Clean up old entries
     */
    cleanupOldEntries() {
        const now = Date.now();
        const metadata = this.store.get('metadata');
        const keysToRemove = [];
        
        Object.entries(metadata.entries).forEach(([key, info]) => {
            if (now - info.timestamp > this.maxAge) {
                keysToRemove.push(key);
            }
        });
        
        keysToRemove.forEach(key => this.remove(key));
    }
    
    /**
     * Ensure there's enough space in cache
     */
    ensureCacheSpace(requiredSize) {
        const metadata = this.store.get('metadata');
        
        if (metadata.totalSize + requiredSize <= this.maxCacheSize) {
            return;
        }
        
        // Remove oldest entries until we have enough space
        const entries = Object.entries(metadata.entries)
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        let currentSize = metadata.totalSize;
        for (const [key] of entries) {
            if (currentSize + requiredSize <= this.maxCacheSize) {
                break;
            }
            
            const entry = this.store.get(key);
            if (entry) {
                currentSize -= entry.size;
                this.remove(key);
            }
        }
    }
    
    /**
     * Get oldest entry info
     */
    getOldestEntry() {
        const metadata = this.store.get('metadata');
        let oldest = null;
        
        Object.entries(metadata.entries).forEach(([key, info]) => {
            if (!oldest || info.timestamp < oldest.timestamp) {
                oldest = { key, ...info };
            }
        });
        
        return oldest;
    }
    
    /**
     * Get newest entry info
     */
    getNewestEntry() {
        const metadata = this.store.get('metadata');
        let newest = null;
        
        Object.entries(metadata.entries).forEach(([key, info]) => {
            if (!newest || info.timestamp > newest.timestamp) {
                newest = { key, ...info };
            }
        });
        
        return newest;
    }
    
    /**
     * Export cache data (for debugging/backup)
     */
    export() {
        const data = {
            metadata: this.store.get('metadata'),
            entries: {}
        };
        
        this.store.keys().forEach(key => {
            if (key !== 'metadata') {
                data.entries[key] = this.store.get(key);
            }
        });
        
        return data;
    }
    
    /**
     * Import cache data
     */
    import(data) {
        if (!data || !data.metadata) {
            throw new Error('Invalid cache data format');
        }
        
        // Clear existing cache
        this.clear();
        
        // Import metadata
        this.store.set('metadata', data.metadata);
        
        // Import entries
        Object.entries(data.entries).forEach(([key, entry]) => {
            this.store.set(key, entry);
        });
    }
}

// Create singleton instance
export const ocrCache = new OCRCacheManager();