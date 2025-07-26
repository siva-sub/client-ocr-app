export class ModelDownloader {
    constructor() {
        this.modelCache = new Map();
        this.downloadProgress = new Map();
    }

    async downloadModel(modelConfig, onProgress) {
        const cacheKey = modelConfig.url;
        
        // Check if already cached
        if (this.modelCache.has(cacheKey)) {
            return this.modelCache.get(cacheKey);
        }

        // Check if download in progress
        if (this.downloadProgress.has(cacheKey)) {
            return this.downloadProgress.get(cacheKey);
        }

        // Start download
        const downloadPromise = this._downloadWithProgress(modelConfig, onProgress);
        this.downloadProgress.set(cacheKey, downloadPromise);

        try {
            const modelData = await downloadPromise;
            this.modelCache.set(cacheKey, modelData);
            this.downloadProgress.delete(cacheKey);
            return modelData;
        } catch (error) {
            this.downloadProgress.delete(cacheKey);
            throw error;
        }
    }

    async _downloadWithProgress(modelConfig, onProgress) {
        try {
            const response = await fetch(modelConfig.url);
            if (!response.ok) {
                throw new Error(`Failed to download model: ${response.statusText}`);
            }

            const contentLength = +response.headers.get('Content-Length');
            const reader = response.body.getReader();
            const chunks = [];
            let receivedLength = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                receivedLength += value.length;

                if (onProgress && contentLength) {
                    const progress = (receivedLength / contentLength) * 100;
                    onProgress({
                        loaded: receivedLength,
                        total: contentLength,
                        percent: progress,
                        model: modelConfig.name
                    });
                }
            }

            // Combine chunks
            const blob = new Blob(chunks);
            const arrayBuffer = await blob.arrayBuffer();
            
            return {
                data: new Uint8Array(arrayBuffer),
                blob: blob,
                url: URL.createObjectURL(blob)
            };
        } catch (error) {
            console.error('Model download error:', error);
            throw error;
        }
    }

    async preloadModels(modelConfigs, onProgress) {
        const downloads = [];
        
        for (const [configKey, config] of Object.entries(modelConfigs)) {
            if (config.det?.url) {
                downloads.push({
                    key: `${configKey}_det`,
                    config: config.det,
                    promise: this.downloadModel(config.det, (progress) => {
                        if (onProgress) {
                            onProgress({
                                ...progress,
                                modelType: 'det',
                                configKey
                            });
                        }
                    })
                });
            }
            
            if (config.rec?.url) {
                downloads.push({
                    key: `${configKey}_rec`,
                    config: config.rec,
                    promise: this.downloadModel(config.rec, (progress) => {
                        if (onProgress) {
                            onProgress({
                                ...progress,
                                modelType: 'rec',
                                configKey
                            });
                        }
                    })
                });
            }
            
            if (config.cls?.url) {
                downloads.push({
                    key: `${configKey}_cls`,
                    config: config.cls,
                    promise: this.downloadModel(config.cls, (progress) => {
                        if (onProgress) {
                            onProgress({
                                ...progress,
                                modelType: 'cls',
                                configKey
                            });
                        }
                    })
                });
            }
        }

        const results = await Promise.allSettled(downloads.map(d => d.promise));
        
        const loadedModels = {};
        downloads.forEach((download, index) => {
            if (results[index].status === 'fulfilled') {
                loadedModels[download.key] = results[index].value;
            } else {
                console.error(`Failed to load ${download.key}:`, results[index].reason);
            }
        });

        return loadedModels;
    }

    clearCache() {
        // Revoke all blob URLs
        for (const modelData of this.modelCache.values()) {
            if (modelData.url && modelData.url.startsWith('blob:')) {
                URL.revokeObjectURL(modelData.url);
            }
        }
        
        this.modelCache.clear();
        this.downloadProgress.clear();
    }

    getCachedModel(url) {
        return this.modelCache.get(url);
    }

    isCached(url) {
        return this.modelCache.has(url);
    }
}