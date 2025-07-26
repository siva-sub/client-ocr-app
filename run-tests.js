#!/usr/bin/env node
/**
 * Simple test runner for the OCR pipeline
 * Validates that all critical components are working correctly
 */

import { ResourceManager, MemoryMonitor, MatPool } from './src/resource-manager.js';
import { SecureModelDownloader } from './src/secure-model-loader.js';

console.log('Running OCR Pipeline Tests...\n');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passedTests++;
    } catch (error) {
        console.log(`✗ ${name}`);
        console.log(`  Error: ${error.message}`);
        failedTests++;
    }
}

function expect(value) {
    return {
        toBe(expected) {
            if (value !== expected) {
                throw new Error(`Expected ${expected}, got ${value}`);
            }
        },
        toBeTruthy() {
            if (!value) {
                throw new Error(`Expected truthy value, got ${value}`);
            }
        },
        toBeGreaterThan(expected) {
            if (!(value > expected)) {
                throw new Error(`Expected ${value} to be greater than ${expected}`);
            }
        },
        toThrow() {
            let threw = false;
            try {
                value();
            } catch (e) {
                threw = true;
            }
            if (!threw) {
                throw new Error(`Expected function to throw`);
            }
        },
        not: {
            toThrow() {
                let threw = false;
                try {
                    value();
                } catch (e) {
                    threw = true;
                }
                if (threw) {
                    throw new Error(`Expected function not to throw`);
                }
            }
        }
    };
}

// Mock cv for testing
global.cv = {
    Mat: class Mat {
        constructor() {
            this.deleted = false;
            this.rows = 100;
            this.cols = 100;
        }
        delete() {
            this.deleted = true;
        }
    }
};

// Mock performance API
global.performance = {
    memory: {
        usedJSHeapSize: 100000000,
        totalJSHeapSize: 200000000,
        jsHeapSizeLimit: 500000000
    }
};

// Mock window for SecureModelDownloader
global.window = {
    location: {
        origin: 'http://localhost:3000'
    }
};

// Mock URL constructor
global.URL = class URL {
    constructor(url, base) {
        if (url.startsWith('./') || url.startsWith('/')) {
            this.hostname = 'localhost';
        } else if (url.startsWith('https://')) {
            const match = url.match(/https:\/\/([^/]+)/);
            this.hostname = match ? match[1] : 'unknown';
        } else {
            this.hostname = 'unknown';
        }
    }
};

console.log('=== Resource Management Tests ===');

test('ResourceManager should track resources', () => {
    const rm = new ResourceManager();
    const mat = rm.registerMat(new global.cv.Mat());
    expect(rm.resources.size).toBe(1);
});

test('ResourceManager should cleanup resources', () => {
    const rm = new ResourceManager();
    const mat = rm.registerMat(new global.cv.Mat());
    rm.cleanup();
    expect(mat.deleted).toBe(true);
    expect(rm.resources.size).toBe(0);
});

test('ResourceManager.withResources should handle errors', async () => {
    const rm = new ResourceManager();
    let mat;
    
    try {
        await rm.withResources(async (rm) => {
            mat = rm.registerMat(new global.cv.Mat());
            throw new Error('Test error');
        });
    } catch (error) {
        // Expected
    }
    
    expect(mat.deleted).toBe(true);
});

console.log('\n=== Memory Monitoring Tests ===');

test('MemoryMonitor should initialize with defaults', () => {
    const monitor = new MemoryMonitor();
    expect(monitor.thresholds.warning).toBe(0.7);
    expect(monitor.thresholds.critical).toBe(0.85);
});

test('MemoryMonitor should detect thresholds', () => {
    let warningTriggered = false;
    const monitor = new MemoryMonitor({
        warningThreshold: 0.1, // Very low for testing
        onWarning: () => { warningTriggered = true; }
    });
    
    // Current mock usage is 20% (100M / 500M)
    monitor.checkMemoryPressure();
    expect(warningTriggered).toBe(true);
});

console.log('\n=== Secure Model Loading Tests ===');

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

test('SecureModelDownloader should have proper cache', () => {
    const downloader = new SecureModelDownloader();
    
    // Should have cache map
    expect(downloader.cache instanceof Map).toBe(true);
    
    // Should have default allowed domains
    expect(downloader.allowedDomains.length).toBeGreaterThan(0);
});

console.log('\n=== Mat Pool Tests ===');

test('MatPool should be created with cv instance', () => {
    const pool = new MatPool(global.cv);
    expect(pool).toBeTruthy();
    expect(pool.maxSize).toBeGreaterThan(0);
});

console.log('\n=== Test Summary ===');
console.log(`Total: ${passedTests + failedTests}`);
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${failedTests}`);

if (failedTests > 0) {
    process.exit(1);
} else {
    console.log('\nAll tests passed! ✓');
}