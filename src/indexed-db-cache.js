/**
 * IndexedDB cache for persistent model storage
 * Prevents re-downloading models on page refresh
 */

const DB_NAME = 'OCRModelCache';
const DB_VERSION = 2;
const STORE_NAME = 'models';
const META_STORE_NAME = 'metadata';

export class IndexedDBModelCache {
    constructor() {
        this.db = null;
        this.isInitialized = false;
    }
    
    /**
     * Initialize IndexedDB
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                this.isInitialized = true;
                console.log('IndexedDB initialized successfully');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create model store if it doesn't exist
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const modelStore = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
                    modelStore.createIndex('timestamp', 'timestamp');
                    modelStore.createIndex('size', 'size');
                }
                
                // Create metadata store
                if (!db.objectStoreNames.contains(META_STORE_NAME)) {
                    const metaStore = db.createObjectStore(META_STORE_NAME, { keyPath: 'key' });
                    metaStore.createIndex('lastAccessed', 'lastAccessed');
                }
            };
        });
    }
    
    /**
     * Store model in IndexedDB
     */
    async storeModel(url, data, metadata = {}) {
        await this.ensureInitialized();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            
            const modelData = {
                url,
                data: data instanceof ArrayBuffer ? data : data.buffer,
                timestamp: Date.now(),
                size: data.byteLength || data.length,
                version: metadata.version || '1.0',
                hash: metadata.hash || null,
                ...metadata
            };
            
            const request = store.put(modelData);
            
            request.onsuccess = () => {
                console.log(`Model cached: ${url} (${this.formatSize(modelData.size)})`);
                resolve(modelData);
            };
            
            request.onerror = () => {
                console.error('Failed to store model:', request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * Retrieve model from IndexedDB
     */
    async getModel(url) {
        await this.ensureInitialized();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(url);
            
            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    console.log(`Model retrieved from cache: ${url}`);
                    // Update last accessed time
                    this.updateLastAccessed(url);
                    resolve(result);
                } else {
                    resolve(null);
                }
            };
            
            request.onerror = () => {
                console.error('Failed to retrieve model:', request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * Check if model exists in cache
     */
    async hasModel(url) {
        const model = await this.getModel(url);
        return model !== null;
    }
    
    /**
     * Delete model from cache
     */
    async deleteModel(url) {
        await this.ensureInitialized();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(url);
            
            request.onsuccess = () => {
                console.log(`Model deleted from cache: ${url}`);
                resolve();
            };
            
            request.onerror = () => {
                console.error('Failed to delete model:', request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * Get all cached models metadata
     */
    async getAllModels() {
        await this.ensureInitialized();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.openCursor();
            
            const models = [];
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    // Don't include the actual data in the list
                    const { data, ...metadata } = cursor.value;
                    models.push(metadata);
                    cursor.continue();
                } else {
                    resolve(models);
                }
            };
            
            request.onerror = () => {
                console.error('Failed to list models:', request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * Get cache statistics
     */
    async getCacheStats() {
        const models = await this.getAllModels();
        
        const stats = {
            modelCount: models.length,
            totalSize: models.reduce((sum, model) => sum + (model.size || 0), 0),
            oldestModel: models.length > 0 
                ? new Date(Math.min(...models.map(m => m.timestamp)))
                : null,
            newestModel: models.length > 0
                ? new Date(Math.max(...models.map(m => m.timestamp)))
                : null,
            models: models.map(m => ({
                url: m.url,
                size: m.size,
                timestamp: new Date(m.timestamp),
                version: m.version
            }))
        };
        
        return stats;
    }
    
    /**
     * Clear old models based on age or size limit
     */
    async clearOldModels(options = {}) {
        const {
            maxAge = 30 * 24 * 60 * 60 * 1000, // 30 days
            maxSize = 500 * 1024 * 1024, // 500MB
            keepRecent = 5 // Keep at least 5 recent models
        } = options;
        
        const models = await this.getAllModels();
        const now = Date.now();
        
        // Sort by timestamp (newest first)
        models.sort((a, b) => b.timestamp - a.timestamp);
        
        let totalSize = 0;
        const toDelete = [];
        
        for (let i = 0; i < models.length; i++) {
            const model = models[i];
            totalSize += model.size || 0;
            
            // Skip recent models
            if (i < keepRecent) {
                continue;
            }
            
            // Check age
            if (now - model.timestamp > maxAge) {
                toDelete.push(model.url);
                continue;
            }
            
            // Check total size
            if (totalSize > maxSize) {
                toDelete.push(model.url);
            }
        }
        
        // Delete old models
        for (const url of toDelete) {
            await this.deleteModel(url);
        }
        
        console.log(`Cleared ${toDelete.length} old models from cache`);
        return toDelete.length;
    }
    
    /**
     * Clear all cached models
     */
    async clearAll() {
        await this.ensureInitialized();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();
            
            request.onsuccess = () => {
                console.log('All models cleared from cache');
                resolve();
            };
            
            request.onerror = () => {
                console.error('Failed to clear cache:', request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * Update last accessed time
     */
    async updateLastAccessed(url) {
        try {
            const transaction = this.db.transaction([META_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(META_STORE_NAME);
            
            store.put({
                key: `lastAccessed_${url}`,
                lastAccessed: Date.now()
            });
        } catch (error) {
            // Non-critical error
            console.warn('Failed to update last accessed time:', error);
        }
    }
    
    /**
     * Ensure database is initialized
     */
    async ensureInitialized() {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }
    
    /**
     * Format file size for display
     */
    formatSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }
    
    /**
     * Estimate available storage space
     */
    async getStorageEstimate() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            return {
                usage: estimate.usage || 0,
                quota: estimate.quota || 0,
                available: (estimate.quota || 0) - (estimate.usage || 0),
                percentUsed: estimate.quota ? (estimate.usage / estimate.quota) * 100 : 0
            };
        }
        return null;
    }
}

/**
 * Singleton instance
 */
let cacheInstance = null;

/**
 * Get or create cache instance
 */
export async function getModelCache() {
    if (!cacheInstance) {
        cacheInstance = new IndexedDBModelCache();
        await cacheInstance.initialize();
    }
    return cacheInstance;
}

/**
 * Model cache manager with automatic cleanup
 */
export class ModelCacheManager {
    constructor(cache) {
        this.cache = cache;
        this.cleanupInterval = null;
    }
    
    /**
     * Start automatic cleanup
     */
    startAutoCleanup(intervalMs = 60 * 60 * 1000) { // 1 hour
        this.stopAutoCleanup();
        
        this.cleanupInterval = setInterval(async () => {
            try {
                await this.cache.clearOldModels();
            } catch (error) {
                console.error('Auto cleanup failed:', error);
            }
        }, intervalMs);
        
        // Run initial cleanup
        this.cache.clearOldModels().catch(console.error);
    }
    
    /**
     * Stop automatic cleanup
     */
    stopAutoCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
    
    /**
     * Download and cache model with fallback
     */
    async getOrDownloadModel(url, downloader) {
        // Check cache first
        const cached = await this.cache.getModel(url);
        if (cached) {
            return {
                data: new Uint8Array(cached.data),
                fromCache: true,
                size: cached.size
            };
        }
        
        // Download if not cached
        console.log(`Model not in cache, downloading: ${url}`);
        const downloaded = await downloader(url);
        
        // Store in cache
        try {
            await this.cache.storeModel(url, downloaded.data, {
                version: downloaded.version,
                hash: downloaded.hash
            });
        } catch (error) {
            console.error('Failed to cache model:', error);
            // Continue even if caching fails
        }
        
        return {
            ...downloaded,
            fromCache: false
        };
    }
}