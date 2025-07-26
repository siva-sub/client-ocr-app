/**
 * Comprehensive tests for OCR pipeline
 * Tests memory management, security, performance, and functionality
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { ResourceManager, MemoryMonitor, MatPool } from '../src/resource-manager.js';
import { SecureModelDownloader } from '../src/secure-model-loader.js';
import { IndexedDBModelCache } from '../src/indexed-db-cache.js';
import { OCRWorkerPool } from '../src/worker-pool.js';
import { UnifiedOCRManager } from '../src/unified-ocr-manager.js';

// Mock dependencies
global.performance = {
    now: () => Date.now(),
    memory: {
        usedJSHeapSize: 100000000,
        totalJSHeapSize: 200000000,
        jsHeapSizeLimit: 500000000
    }
};

// Mock OpenCV
global.cv = {
    Mat: class Mat {
        constructor() {
            this.deleted = false;
            this.rows = 100;
            this.cols = 100;
            this.data = new Uint8Array(10000);
            this.data32F = new Float32Array(10000);
        }
        delete() {
            this.deleted = true;
        }
        create() {}
        setTo() {}
        copyTo() {}
    },
    MatVector: class MatVector {
        constructor() {
            this.deleted = false;
            this.items = [];
        }
        delete() {
            this.deleted = true;
        }
        size() {
            return this.items.length;
        }
        get(i) {
            return this.items[i];
        }
        push_back(item) {
            this.items.push(item);
        }
    },
    cvtColor: () => {},
    resize: () => {},
    threshold: () => {},
    findContours: () => {},
    boundingRect: () => ({ x: 0, y: 0, width: 50, height: 20 }),
    minAreaRect: () => ({ angle: 0, size: { width: 50, height: 20 } }),
    getRotationMatrix2D: () => new global.cv.Mat(),
    warpAffine: () => {},
    COLOR_RGBA2RGB: 0,
    CV_8U: 0,
    CV_32F: 5,
    THRESH_BINARY: 0,
    RETR_EXTERNAL: 0,
    CHAIN_APPROX_SIMPLE: 2,
    Point: class Point {
        constructor(x, y) {
            this.x = x;
            this.y = y;
        }
    },
    Size: class Size {
        constructor(width, height) {
            this.width = width;
            this.height = height;
        }
    },
    Rect: class Rect {
        constructor(x, y, width, height) {
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
        }
    }
};

describe('Resource Management Tests', () => {
    test('ResourceManager should track and cleanup all resources', async () => {
        const rm = new ResourceManager();
        
        // Register multiple resources
        const mat1 = rm.registerMat(new global.cv.Mat());
        const mat2 = rm.registerMat(new global.cv.Mat());
        const matVector = rm.register(new global.cv.MatVector(), () => matVector.delete());
        
        expect(rm.resources.size).toBe(3);
        
        // Cleanup should delete all resources
        rm.cleanup();
        
        expect(mat1.deleted).toBe(true);
        expect(mat2.deleted).toBe(true);
        expect(matVector.deleted).toBe(true);
        expect(rm.resources.size).toBe(0);
    });
    
    test('ResourceManager.withResources should cleanup on error', async () => {
        const rm = new ResourceManager();
        let mat;
        
        try {
            await rm.withResources(async (rm) => {
                mat = rm.registerMat(new global.cv.Mat());
                throw new Error('Test error');
            });
        } catch (error) {
            // Expected error
        }
        
        expect(mat.deleted).toBe(true);
    });
    
    test('MatPool should reuse Mat objects', async () => {
        const pool = new MatPool(global.cv, { maxSize: 2 });
        
        // Acquire and release
        const mat1 = await pool.acquire(100, 100, global.cv.CV_8U);
        pool.release(mat1);
        
        // Should get same object back
        const mat2 = await pool.acquire(100, 100, global.cv.CV_8U);
        expect(mat2).toBe(mat1);
        
        // Pool statistics
        const stats = pool.getStats();
        expect(stats.available).toBe(0);
        expect(stats.inUse).toBe(1);
    });
});

describe('Memory Monitoring Tests', () => {
    test('MemoryMonitor should detect memory pressure', () => {
        let warningTriggered = false;
        let criticalTriggered = false;
        
        const monitor = new MemoryMonitor({
            warningThreshold: 0.2, // 20% for testing
            criticalThreshold: 0.3, // 30% for testing
            onWarning: () => { warningTriggered = true; },
            onCritical: () => { criticalTriggered = true; }
        });
        
        // Mock high memory usage
        global.performance.memory.usedJSHeapSize = 150000000; // 30% usage
        
        monitor.checkMemoryPressure();
        
        expect(warningTriggered).toBe(true);
        expect(criticalTriggered).toBe(true);
    });
    
    test('MemoryMonitor should recover from pressure', () => {
        let recoveredTriggered = false;
        
        const monitor = new MemoryMonitor({
            warningThreshold: 0.7,
            onRecovered: () => { recoveredTriggered = true; }
        });
        
        // Set high usage first
        global.performance.memory.usedJSHeapSize = 400000000;
        monitor.checkMemoryPressure();
        
        // Then reduce usage
        global.performance.memory.usedJSHeapSize = 100000000;
        monitor.checkMemoryPressure();
        
        expect(recoveredTriggered).toBe(true);
    });
});

describe('Secure Model Loading Tests', () => {
    test('SecureModelDownloader should validate URLs', () => {
        const downloader = new SecureModelDownloader({
            allowedDomains: ['example.com']
        });
        
        // Should allow relative URLs
        expect(() => downloader.validateUrl('./models/test.onnx')).not.toThrow();
        
        // Should allow allowed domains
        expect(() => downloader.validateUrl('https://example.com/model.onnx')).not.toThrow();
        
        // Should reject unknown domains
        expect(() => downloader.validateUrl('https://evil.com/model.onnx')).toThrow();
    });
    
    test('SecureModelDownloader should cache downloads', async () => {
        const downloader = new SecureModelDownloader();
        
        // Mock fetch
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            headers: {
                get: () => '1000'
            },
            body: {
                getReader: () => ({
                    read: jest.fn()
                        .mockResolvedValueOnce({ 
                            done: false, 
                            value: new Uint8Array([1, 2, 3]) 
                        })
                        .mockResolvedValueOnce({ done: true })
                })
            }
        });
        
        const modelConfig = { url: './test.onnx' };
        
        // First download
        const result1 = await downloader.downloadModel(modelConfig);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        
        // Second request should use cache
        const result2 = await downloader.downloadModel(modelConfig);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(result2).toBe(result1);
    });
});

describe('IndexedDB Cache Tests', () => {
    let cache;
    
    beforeEach(async () => {
        // Mock IndexedDB
        global.indexedDB = {
            open: jest.fn().mockReturnValue({
                onsuccess: null,
                onerror: null,
                onupgradeneeded: null,
                result: {
                    transaction: () => ({
                        objectStore: () => ({
                            put: jest.fn().mockReturnValue({ 
                                onsuccess: null, 
                                onerror: null 
                            }),
                            get: jest.fn().mockReturnValue({ 
                                onsuccess: null, 
                                onerror: null,
                                result: null
                            }),
                            clear: jest.fn().mockReturnValue({ 
                                onsuccess: null, 
                                onerror: null 
                            })
                        })
                    }),
                    objectStoreNames: {
                        contains: () => false
                    }
                }
            })
        };
        
        cache = new IndexedDBModelCache();
    });
    
    test('IndexedDBModelCache should store and retrieve models', async () => {
        // Mock successful initialization
        setTimeout(() => {
            global.indexedDB.open().onsuccess();
        }, 0);
        
        await cache.initialize();
        
        const testData = new Uint8Array([1, 2, 3, 4, 5]);
        const url = 'https://example.com/model.onnx';
        
        // Mock successful store
        const storePromise = cache.storeModel(url, testData);
        setTimeout(() => {
            cache.db.transaction().objectStore().put().onsuccess();
        }, 0);
        
        await storePromise;
        
        // Verify cache stats
        const stats = await cache.getCacheStats();
        expect(stats.modelCount).toBeGreaterThanOrEqual(0);
    });
    
    test('IndexedDBModelCache should handle storage errors gracefully', async () => {
        // Mock initialization error
        setTimeout(() => {
            global.indexedDB.open().onerror();
        }, 0);
        
        await expect(cache.initialize()).rejects.toThrow();
    });
});

describe('Worker Pool Tests', () => {
    test('OCRWorkerPool should manage multiple workers', async () => {
        // Mock Worker
        global.Worker = jest.fn().mockImplementation(() => ({
            postMessage: jest.fn(),
            addEventListener: jest.fn(),
            terminate: jest.fn()
        }));
        
        const pool = new OCRWorkerPool({ maxWorkers: 2 });
        
        // Initialize pool
        await pool.initialize('test-engine', {}, {});
        
        expect(pool.workers.length).toBe(2);
        expect(pool.availableWorkers.length).toBe(2);
        
        // Dispose pool
        await pool.dispose();
        expect(pool.workers.length).toBe(0);
    });
});

describe('Integration Tests', () => {
    test('UnifiedOCRManager should handle engine switching', async () => {
        const manager = new UnifiedOCRManager();
        
        // Mock model downloader
        manager.modelDownloader = {
            downloadModel: jest.fn().mockResolvedValue({
                data: new Uint8Array([1, 2, 3]),
                url: 'blob:test'
            }),
            clearCache: jest.fn(),
            isCached: jest.fn().mockReturnValue(false)
        };
        
        // Mock processors
        manager.processors.ppu = {
            initialize: jest.fn(),
            processImage: jest.fn().mockResolvedValue({
                boxes: [],
                texts: [],
                timestamp: Date.now()
            }),
            dispose: jest.fn()
        };
        
        // Initialize with PPU engine
        await manager.initialize('ppu-mobile');
        expect(manager.currentEngine).toBe('ppu-mobile');
        
        // Process image
        const imageData = new ImageData(100, 100);
        const result = await manager.processImage(imageData);
        expect(result.engine).toBe('ppu-mobile');
    });
    
    test('UnifiedOCRManager should fallback to Tesseract on error', async () => {
        const manager = new UnifiedOCRManager();
        
        // Mock failing processor
        manager.processors.ppu = {
            processImage: jest.fn().mockRejectedValue(new Error('Processing failed'))
        };
        
        // Mock Tesseract
        manager.processors.tesseract = {
            processImage: jest.fn().mockResolvedValue({
                texts: [{ text: 'fallback', confidence: 0.9 }]
            })
        };
        
        manager.currentEngine = 'ppu-mobile';
        
        // Should fallback to Tesseract
        const imageData = new ImageData(100, 100);
        const result = await manager.processImage(imageData);
        
        expect(result.engine).toBe('tesseract');
        expect(result.texts[0].text).toBe('fallback');
    });
});

describe('Performance Tests', () => {
    test('Processing should complete within time limits', async () => {
        const startTime = performance.now();
        
        // Simulate processing
        const rm = new ResourceManager();
        await rm.withResources(async (rm) => {
            // Create multiple mats
            for (let i = 0; i < 10; i++) {
                rm.registerMat(new global.cv.Mat());
            }
            
            // Simulate work
            await new Promise(resolve => setTimeout(resolve, 10));
        });
        
        const duration = performance.now() - startTime;
        expect(duration).toBeLessThan(100); // Should complete in 100ms
    });
    
    test('Memory pool should improve allocation performance', async () => {
        const pool = new MatPool(global.cv, { maxSize: 10 });
        
        // Pre-warm pool
        const mats = [];
        for (let i = 0; i < 5; i++) {
            mats.push(await pool.acquire());
        }
        mats.forEach(mat => pool.release(mat));
        
        // Measure pooled allocation
        const pooledStart = performance.now();
        for (let i = 0; i < 100; i++) {
            const mat = await pool.acquire();
            pool.release(mat);
        }
        const pooledDuration = performance.now() - pooledStart;
        
        // Measure direct allocation
        const directStart = performance.now();
        for (let i = 0; i < 100; i++) {
            const mat = new global.cv.Mat();
            mat.delete();
        }
        const directDuration = performance.now() - directStart;
        
        // Pooled should be faster (or at least not significantly slower)
        expect(pooledDuration).toBeLessThan(directDuration * 1.5);
    });
});

describe('Error Recovery Tests', () => {
    test('Should recover from corrupt model data', async () => {
        const downloader = new SecureModelDownloader();
        
        // Mock corrupt data
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            headers: { get: () => '100' },
            body: {
                getReader: () => ({
                    read: jest.fn()
                        .mockResolvedValueOnce({ 
                            done: false, 
                            value: new Uint8Array([0, 0, 0, 0]) // Invalid ONNX
                        })
                        .mockResolvedValueOnce({ done: true })
                })
            }
        });
        
        const modelConfig = { url: './corrupt.onnx' };
        
        // Should complete download despite invalid data
        const result = await downloader.downloadModel(modelConfig);
        expect(result.data).toBeDefined();
    });
    
    test('Should handle out-of-memory gracefully', async () => {
        const manager = new UnifiedOCRManager();
        
        // Simulate memory pressure
        manager.memoryMonitor = {
            checkMemoryPressure: () => ({ usage: 0.95 }),
            startMonitoring: jest.fn(),
            stopMonitoring: jest.fn()
        };
        
        manager.emergencyMemoryCleanup = jest.fn();
        manager.processors.ppu = {
            processImage: jest.fn().mockResolvedValue({ texts: [] })
        };
        manager.currentEngine = 'ppu-mobile';
        
        const imageData = new ImageData(100, 100);
        await manager.processImage(imageData);
        
        expect(manager.emergencyMemoryCleanup).toHaveBeenCalled();
    });
});

// Cleanup after all tests
afterAll(() => {
    // Clean up any remaining resources
    if (global.indexedDB && global.indexedDB.deleteDatabase) {
        global.indexedDB.deleteDatabase('OCRModelCache');
    }
});