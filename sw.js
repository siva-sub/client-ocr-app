/**
 * Service Worker for Smart OCR PWA
 * Provides offline functionality and caching
 */

const CACHE_NAME = 'smart-ocr-v1';
const RUNTIME_CACHE = 'smart-ocr-runtime-v1';

// Determine if running on GitHub Pages
const isGitHubPages = self.location.hostname.includes('github.io');
const basePath = isGitHubPages ? '/client-ocr-app' : '';

// Files to cache for offline use
const STATIC_CACHE_URLS = [
    `${basePath}/`,
    `${basePath}/index.html`,
    `${basePath}/manifest.json`
    // Other resources will be cached on-demand
];

// Model files to cache (large files, cached on demand)
const MODEL_CACHE_URLS = [
    `${basePath}/models/PP-OCRv5/det/det.onnx`,
    `${basePath}/models/PP-OCRv5/cls/cls.onnx`,
    `${basePath}/models/PP-OCRv5/rec/rec.onnx`,
    `${basePath}/models/PP-OCRv5/ppocrv5_dict.txt`,
    `${basePath}/models/PP-OCRv4/det/det.onnx`,
    `${basePath}/models/PP-OCRv4/cls/cls.onnx`,
    `${basePath}/models/PP-OCRv4/rec/rec.onnx`,
    `${basePath}/models/PP-OCRv4/ppocr_keys_v1.txt`
];

// Install event - cache static assets
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching static files');
                return cache.addAll(STATIC_CACHE_URLS);
            })
            .then(() => {
                console.log('Service Worker: Static files cached');
                return self.skipWaiting();
            })
            .catch(err => {
                console.error('Service Worker: Cache failed', err);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(cacheName => {
                            return cacheName.startsWith('smart-ocr-') && 
                                   cacheName !== CACHE_NAME && 
                                   cacheName !== RUNTIME_CACHE;
                        })
                        .map(cacheName => {
                            console.log('Service Worker: Deleting old cache', cacheName);
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(() => {
                console.log('Service Worker: Claiming clients');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip external requests
    if (url.origin !== location.origin) {
        return;
    }
    
    // Handle model files with cache-first strategy
    if (url.pathname.includes('/models/')) {
        event.respondWith(
            caches.match(request)
                .then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    
                    return fetch(request)
                        .then(response => {
                            if (!response || response.status !== 200 || response.type !== 'basic') {
                                return response;
                            }
                            
                            const responseToCache = response.clone();
                            caches.open(RUNTIME_CACHE)
                                .then(cache => {
                                    cache.put(request, responseToCache);
                                });
                            
                            return response;
                        });
                })
        );
        return;
    }
    
    // Handle API requests with network-first strategy
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    const responseToCache = response.clone();
                    caches.open(RUNTIME_CACHE)
                        .then(cache => {
                            cache.put(request, responseToCache);
                        });
                    return response;
                })
                .catch(() => {
                    return caches.match(request);
                })
        );
        return;
    }
    
    // Handle static assets with cache-first strategy
    event.respondWith(
        caches.match(request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    // Return cached version
                    return cachedResponse;
                }
                
                // Fetch from network
                return fetch(request)
                    .then(response => {
                        // Check if valid response
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        // Clone the response
                        const responseToCache = response.clone();
                        
                        // Cache the response
                        caches.open(RUNTIME_CACHE)
                            .then(cache => {
                                cache.put(request, responseToCache);
                            });
                        
                        return response;
                    });
            })
            .catch(() => {
                // Offline fallback for navigation requests
                if (request.destination === 'document') {
                    return caches.match('/index-mantine.html');
                }
            })
    );
});

// Message event - handle messages from the app
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CACHE_MODELS') {
        event.waitUntil(
            caches.open(RUNTIME_CACHE)
                .then(cache => {
                    console.log('Service Worker: Caching model files');
                    return cache.addAll(MODEL_CACHE_URLS);
                })
                .then(() => {
                    event.ports[0].postMessage({ success: true });
                })
                .catch(err => {
                    console.error('Service Worker: Model cache failed', err);
                    event.ports[0].postMessage({ success: false, error: err.message });
                })
        );
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys()
                .then(cacheNames => {
                    return Promise.all(
                        cacheNames.map(cacheName => {
                            if (cacheName.startsWith('smart-ocr-')) {
                                return caches.delete(cacheName);
                            }
                        })
                    );
                })
                .then(() => {
                    event.ports[0].postMessage({ success: true });
                })
                .catch(err => {
                    event.ports[0].postMessage({ success: false, error: err.message });
                })
        );
    }
});

// Background sync for pending OCR results
self.addEventListener('sync', event => {
    if (event.tag === 'sync-ocr-results') {
        event.waitUntil(syncOCRResults());
    }
});

async function syncOCRResults() {
    // Implement sync logic for pending OCR results
    console.log('Service Worker: Syncing OCR results...');
}