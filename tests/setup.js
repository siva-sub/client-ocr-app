// Test environment setup
global.URL = {
    createObjectURL: jest.fn(() => 'blob:mock-url'),
    revokeObjectURL: jest.fn()
};

// Mock crypto API
global.crypto = {
    subtle: {
        digest: jest.fn(() => Promise.resolve(new ArrayBuffer(32)))
    }
};

// Mock performance API if not available
if (!global.performance) {
    global.performance = {
        now: () => Date.now(),
        memory: {
            usedJSHeapSize: 100000000,
            totalJSHeapSize: 200000000,
            jsHeapSizeLimit: 500000000
        }
    };
}

// Mock ImageData
global.ImageData = class ImageData {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
    }
};