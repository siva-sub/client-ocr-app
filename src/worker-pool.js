/**
 * Web Worker pool for efficient OCR processing
 * Manages multiple workers for parallel processing
 */

export class OCRWorkerPool {
    constructor(options = {}) {
        this.maxWorkers = options.maxWorkers || navigator.hardwareConcurrency || 4;
        this.workers = [];
        this.availableWorkers = [];
        this.busyWorkers = new Map();
        this.taskQueue = [];
        this.messageId = 0;
        this.pendingMessages = new Map();
        this.isInitialized = false;
        
        // Performance tracking
        this.stats = {
            totalProcessed: 0,
            totalProcessingTime: 0,
            errors: 0
        };
    }
    
    /**
     * Initialize the worker pool
     */
    async initialize(engineType, modelData, config) {
        if (this.isInitialized) {
            console.warn('Worker pool already initialized');
            return;
        }
        
        console.log(`Initializing OCR worker pool with ${this.maxWorkers} workers`);
        
        // Create workers
        const initPromises = [];
        for (let i = 0; i < this.maxWorkers; i++) {
            const worker = this.createWorker(i);
            this.workers.push(worker);
            this.availableWorkers.push(worker);
            
            // Initialize each worker
            const initPromise = this.sendMessage(worker, 'init', {
                engineType,
                modelData,
                config
            });
            
            initPromises.push(initPromise);
        }
        
        // Wait for all workers to initialize
        await Promise.all(initPromises);
        this.isInitialized = true;
        
        console.log('Worker pool initialized successfully');
    }
    
    /**
     * Create a new worker
     */
    createWorker(index) {
        const worker = new Worker('./src/ocr-worker.js', {
            name: `ocr-worker-${index}`
        });
        
        // Set up message handler
        worker.addEventListener('message', (event) => {
            this.handleWorkerMessage(worker, event);
        });
        
        // Set up error handler
        worker.addEventListener('error', (error) => {
            console.error(`Worker ${worker.name} error:`, error);
            this.handleWorkerError(worker, error);
        });
        
        return worker;
    }
    
    /**
     * Send message to worker and wait for response
     */
    async sendMessage(worker, type, data) {
        const id = this.messageId++;
        
        return new Promise((resolve, reject) => {
            // Store pending message
            this.pendingMessages.set(id, { resolve, reject });
            
            // Send message
            worker.postMessage({ id, type, data });
            
            // Set timeout
            setTimeout(() => {
                if (this.pendingMessages.has(id)) {
                    this.pendingMessages.delete(id);
                    reject(new Error(`Worker message timeout: ${type}`));
                }
            }, 30000); // 30 second timeout
        });
    }
    
    /**
     * Handle message from worker
     */
    handleWorkerMessage(worker, event) {
        const { id, type, result, error } = event.data;
        
        // Find pending message
        const pending = this.pendingMessages.get(id);
        if (!pending) {
            console.warn('Received message for unknown id:', id);
            return;
        }
        
        // Remove from pending
        this.pendingMessages.delete(id);
        
        // Handle response
        if (type === 'success') {
            pending.resolve(result);
        } else if (type === 'error') {
            pending.reject(new Error(error.message));
        }
    }
    
    /**
     * Handle worker error
     */
    handleWorkerError(worker, error) {
        console.error('Worker error:', error);
        this.stats.errors++;
        
        // Mark worker as available again if it was busy
        if (this.busyWorkers.has(worker)) {
            const task = this.busyWorkers.get(worker);
            this.busyWorkers.delete(worker);
            this.availableWorkers.push(worker);
            
            // Retry the task with another worker
            if (task) {
                this.processTask(task);
            }
        }
    }
    
    /**
     * Process image using worker pool
     */
    async processImage(imageData, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Worker pool not initialized');
        }
        
        // Create task
        const task = {
            imageData: {
                data: Array.from(imageData.data),
                width: imageData.width,
                height: imageData.height
            },
            options,
            promise: null
        };
        
        // Create promise for task completion
        const promise = new Promise((resolve, reject) => {
            task.resolve = resolve;
            task.reject = reject;
        });
        
        task.promise = promise;
        
        // Process task
        await this.processTask(task);
        
        return promise;
    }
    
    /**
     * Process a task
     */
    async processTask(task) {
        // Get available worker
        const worker = await this.getAvailableWorker();
        
        // Mark as busy
        this.busyWorkers.set(worker, task);
        
        try {
            // Send task to worker
            const startTime = performance.now();
            const result = await this.sendMessage(worker, 'process', {
                imageData: task.imageData,
                options: task.options
            });
            
            // Update stats
            this.stats.totalProcessed++;
            this.stats.totalProcessingTime += performance.now() - startTime;
            
            // Resolve task
            task.resolve(result);
            
        } catch (error) {
            console.error('Task processing error:', error);
            this.stats.errors++;
            task.reject(error);
            
        } finally {
            // Mark worker as available
            this.busyWorkers.delete(worker);
            this.availableWorkers.push(worker);
            
            // Process next task in queue
            this.processNextTask();
        }
    }
    
    /**
     * Get an available worker
     */
    async getAvailableWorker() {
        // If worker available, return it
        if (this.availableWorkers.length > 0) {
            return this.availableWorkers.shift();
        }
        
        // Otherwise wait for one to become available
        return new Promise((resolve) => {
            const checkWorker = () => {
                if (this.availableWorkers.length > 0) {
                    resolve(this.availableWorkers.shift());
                } else {
                    setTimeout(checkWorker, 10);
                }
            };
            checkWorker();
        });
    }
    
    /**
     * Process next task in queue
     */
    processNextTask() {
        if (this.taskQueue.length > 0 && this.availableWorkers.length > 0) {
            const task = this.taskQueue.shift();
            this.processTask(task);
        }
    }
    
    /**
     * Process multiple images in parallel
     */
    async processBatch(imageDatas, options = {}) {
        const promises = imageDatas.map(imageData => 
            this.processImage(imageData, options)
        );
        
        return Promise.all(promises);
    }
    
    /**
     * Get pool statistics
     */
    getStats() {
        return {
            ...this.stats,
            averageProcessingTime: this.stats.totalProcessed > 0 
                ? this.stats.totalProcessingTime / this.stats.totalProcessed 
                : 0,
            activeWorkers: this.busyWorkers.size,
            availableWorkers: this.availableWorkers.length,
            queueLength: this.taskQueue.length
        };
    }
    
    /**
     * Get worker statistics
     */
    async getWorkerStats() {
        const statsPromises = this.workers.map(worker => 
            this.sendMessage(worker, 'get-stats', {})
        );
        
        return Promise.all(statsPromises);
    }
    
    /**
     * Dispose of all workers
     */
    async dispose() {
        console.log('Disposing worker pool...');
        
        // Cancel pending tasks
        this.taskQueue.forEach(task => {
            task.reject(new Error('Worker pool disposed'));
        });
        this.taskQueue = [];
        
        // Dispose all workers
        const disposePromises = this.workers.map(worker => 
            this.sendMessage(worker, 'dispose', {})
                .then(() => worker.terminate())
                .catch(err => {
                    console.error('Error disposing worker:', err);
                    worker.terminate();
                })
        );
        
        await Promise.all(disposePromises);
        
        // Clear state
        this.workers = [];
        this.availableWorkers = [];
        this.busyWorkers.clear();
        this.pendingMessages.clear();
        this.isInitialized = false;
        
        console.log('Worker pool disposed');
    }
}

/**
 * Singleton worker pool instance
 */
let globalWorkerPool = null;

/**
 * Get or create global worker pool
 */
export function getWorkerPool() {
    if (!globalWorkerPool) {
        globalWorkerPool = new OCRWorkerPool({
            maxWorkers: Math.min(navigator.hardwareConcurrency || 4, 8)
        });
    }
    return globalWorkerPool;
}

/**
 * Dispose global worker pool
 */
export async function disposeWorkerPool() {
    if (globalWorkerPool) {
        await globalWorkerPool.dispose();
        globalWorkerPool = null;
    }
}

/**
 * Worker-enabled OCR processor wrapper
 */
export class WorkerOCRProcessor {
    constructor(pool) {
        this.pool = pool || getWorkerPool();
        this.isInitialized = false;
    }
    
    async initialize(engineType, modelData, config) {
        await this.pool.initialize(engineType, modelData, config);
        this.isInitialized = true;
    }
    
    async processImage(imageData, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Processor not initialized');
        }
        
        return this.pool.processImage(imageData, options);
    }
    
    async processBatch(imageDatas, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Processor not initialized');
        }
        
        return this.pool.processBatch(imageDatas, options);
    }
    
    getStats() {
        return this.pool.getStats();
    }
    
    async dispose() {
        // Pool is shared, so we don't dispose it here
        this.isInitialized = false;
    }
}