/**
 * Resource management utilities for proper cleanup of OpenCV Mat objects
 * and other resources to prevent memory leaks
 */

export class ResourceManager {
    constructor() {
        this.resources = new Set();
        this.cleanupFunctions = new Map();
    }

    /**
     * Register a resource for automatic cleanup
     */
    register(resource, cleanupFn = null) {
        this.resources.add(resource);
        if (cleanupFn) {
            this.cleanupFunctions.set(resource, cleanupFn);
        }
        return resource;
    }

    /**
     * Register an OpenCV Mat for automatic deletion
     */
    registerMat(mat) {
        return this.register(mat, () => mat.delete());
    }

    /**
     * Register multiple Mats at once
     */
    registerMats(...mats) {
        return mats.map(mat => this.registerMat(mat));
    }

    /**
     * Unregister a resource (e.g., if manually cleaned up)
     */
    unregister(resource) {
        this.resources.delete(resource);
        this.cleanupFunctions.delete(resource);
    }

    /**
     * Clean up all registered resources
     */
    cleanup() {
        for (const resource of this.resources) {
            try {
                const cleanupFn = this.cleanupFunctions.get(resource);
                if (cleanupFn) {
                    cleanupFn();
                } else if (resource && typeof resource.delete === 'function') {
                    resource.delete();
                }
            } catch (error) {
                console.error('Error cleaning up resource:', error);
            }
        }
        this.resources.clear();
        this.cleanupFunctions.clear();
    }

    /**
     * Execute a function with automatic resource cleanup
     */
    async withResources(fn) {
        try {
            return await fn(this);
        } finally {
            this.cleanup();
        }
    }
}

/**
 * Memory pressure monitor to detect and handle low memory conditions
 */
export class MemoryMonitor {
    constructor(options = {}) {
        this.thresholds = {
            warning: options.warningThreshold || 0.7, // 70% memory usage
            critical: options.criticalThreshold || 0.85, // 85% memory usage
            ...options.thresholds
        };
        
        this.callbacks = {
            onWarning: options.onWarning || (() => {}),
            onCritical: options.onCritical || (() => {}),
            onRecovered: options.onRecovered || (() => {})
        };
        
        this.isMonitoring = false;
        this.lastState = 'normal';
        this.checkInterval = options.checkInterval || 5000; // 5 seconds
    }

    /**
     * Get current memory usage stats
     */
    getMemoryStats() {
        if (!performance.memory) {
            return null;
        }

        const used = performance.memory.usedJSHeapSize;
        const total = performance.memory.totalJSHeapSize;
        const limit = performance.memory.jsHeapSizeLimit;

        return {
            used,
            total,
            limit,
            usage: used / limit,
            available: limit - used
        };
    }

    /**
     * Check memory pressure and trigger callbacks
     */
    checkMemoryPressure() {
        const stats = this.getMemoryStats();
        if (!stats) return;

        const { usage } = stats;
        let currentState = 'normal';

        if (usage >= this.thresholds.critical) {
            currentState = 'critical';
            if (this.lastState !== 'critical') {
                this.callbacks.onCritical(stats);
            }
        } else if (usage >= this.thresholds.warning) {
            currentState = 'warning';
            if (this.lastState === 'normal') {
                this.callbacks.onWarning(stats);
            }
        } else if (this.lastState !== 'normal') {
            this.callbacks.onRecovered(stats);
        }

        this.lastState = currentState;
        return stats;
    }

    /**
     * Start monitoring memory pressure
     */
    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        this.intervalId = setInterval(() => {
            this.checkMemoryPressure();
        }, this.checkInterval);
        
        // Check immediately
        this.checkMemoryPressure();
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isMonitoring = false;
    }

    /**
     * Force garbage collection if available
     */
    static forceGC() {
        if (window.gc) {
            window.gc();
            return true;
        }
        return false;
    }
}

/**
 * Resource pool for reusing expensive resources like OpenCV Mats
 */
export class ResourcePool {
    constructor(factory, options = {}) {
        this.factory = factory;
        this.maxSize = options.maxSize || 10;
        this.maxAge = options.maxAge || 60000; // 1 minute
        this.available = [];
        this.inUse = new Set();
        this.timestamps = new WeakMap();
    }

    /**
     * Acquire a resource from the pool
     */
    async acquire(...args) {
        // Clean old resources
        this.cleanOldResources();

        // Try to get from pool
        let resource = this.available.pop();
        
        if (!resource) {
            // Create new resource
            resource = await this.factory(...args);
        }
        
        this.inUse.add(resource);
        return resource;
    }

    /**
     * Release a resource back to the pool
     */
    release(resource) {
        if (!this.inUse.has(resource)) {
            console.warn('Attempting to release resource not from this pool');
            return;
        }

        this.inUse.delete(resource);

        // Check if we should keep it
        if (this.available.length < this.maxSize) {
            this.timestamps.set(resource, Date.now());
            this.available.push(resource);
        } else {
            // Dispose of excess resource
            this.disposeResource(resource);
        }
    }

    /**
     * Clean up resources older than maxAge
     */
    cleanOldResources() {
        const now = Date.now();
        this.available = this.available.filter(resource => {
            const timestamp = this.timestamps.get(resource);
            if (timestamp && now - timestamp > this.maxAge) {
                this.disposeResource(resource);
                return false;
            }
            return true;
        });
    }

    /**
     * Dispose of a resource
     */
    disposeResource(resource) {
        try {
            if (resource && typeof resource.delete === 'function') {
                resource.delete();
            } else if (resource && typeof resource.dispose === 'function') {
                resource.dispose();
            }
        } catch (error) {
            console.error('Error disposing resource:', error);
        }
    }

    /**
     * Clear the entire pool
     */
    clear() {
        // Dispose all available resources
        this.available.forEach(resource => this.disposeResource(resource));
        this.available = [];
        
        // Note: Resources in use are not disposed
        console.warn(`ResourcePool cleared. ${this.inUse.size} resources still in use.`);
    }

    /**
     * Get pool statistics
     */
    getStats() {
        return {
            available: this.available.length,
            inUse: this.inUse.size,
            total: this.available.length + this.inUse.size
        };
    }
}

/**
 * OpenCV Mat pool for efficient memory management
 */
export class MatPool extends ResourcePool {
    constructor(cv, options = {}) {
        super(() => new cv.Mat(), {
            maxSize: options.maxSize || 20,
            maxAge: options.maxAge || 30000, // 30 seconds
            ...options
        });
        this.cv = cv;
    }

    /**
     * Acquire a Mat with specific dimensions and type
     */
    async acquire(rows, cols, type) {
        const mat = await super.acquire();
        
        // Resize if needed
        if (rows && cols && type !== undefined) {
            mat.create(rows, cols, type);
        }
        
        return mat;
    }

    /**
     * Create common Mat types
     */
    async acquireZeros(rows, cols, type) {
        const mat = await this.acquire(rows, cols, type);
        mat.setTo(new this.cv.Scalar(0, 0, 0, 0));
        return mat;
    }

    async acquireOnes(rows, cols, type) {
        const mat = await this.acquire(rows, cols, type);
        mat.setTo(new this.cv.Scalar(1, 1, 1, 1));
        return mat;
    }
}

/**
 * Safe execution wrapper for operations that might throw
 */
export async function safeExecute(operation, errorHandler = null) {
    const resources = new ResourceManager();
    
    try {
        return await resources.withResources(async (rm) => {
            return await operation(rm);
        });
    } catch (error) {
        if (errorHandler) {
            return errorHandler(error);
        }
        throw error;
    }
}

/**
 * Batch resource cleanup for multiple operations
 */
export class BatchResourceManager {
    constructor() {
        this.managers = [];
    }

    createManager() {
        const manager = new ResourceManager();
        this.managers.push(manager);
        return manager;
    }

    async executeAll(operations) {
        const results = [];
        
        try {
            for (let i = 0; i < operations.length; i++) {
                const manager = this.createManager();
                const result = await operations[i](manager);
                results.push(result);
            }
            return results;
        } finally {
            this.cleanupAll();
        }
    }

    cleanupAll() {
        this.managers.forEach(manager => manager.cleanup());
        this.managers = [];
    }
}