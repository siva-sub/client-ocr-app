/**
 * Enhanced Service Worker for Smart OCR PWA
 * Provides offline functionality, caching, and COOP/COEP headers for SharedArrayBuffer
 */

const CACHE_NAME = 'smart-ocr-v2';
const RUNTIME_CACHE = 'smart-ocr-runtime-v2';
const MODEL_CACHE = 'smart-ocr-models-v2';

// Repository name for GitHub Pages
const REPO_NAME = 'client-ocr-app';
const isGitHubPages = self.location.hostname.includes('github.io');
const basePath = isGitHubPages ? `/${REPO_NAME}/` : '/';

// Helper to get absolute URL
function getAbsoluteUrl(path) {
    return new URL(path, new URL(basePath, self.location.origin)).href;
}

// Essential files to cache immediately
const STATIC_CACHE_URLS = [
    getAbsoluteUrl(''),
    getAbsoluteUrl('index.html'),
    getAbsoluteUrl('manifest.json'),
    getAbsoluteUrl('assets/'),
    getAbsoluteUrl('icons/icon-192.png')
];

// Model files to cache on demand
const MODEL_PATTERNS = [
    /\/models\/.*\.onnx$/,
    /\/models\/.*\.txt$/
];

// Install event - cache essential files
self.addEventListener('install', event => {
    console.log('[SW] Installing Service Worker...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching static files');
                // Try to cache each URL individually to handle failures gracefully
                return Promise.allSettled(
                    STATIC_CACHE_URLS.map(url => 
                        cache.add(url).catch(err => 
                            console.warn(`[SW] Failed to cache ${url}:`, err)
                        )
                    )
                );
            })
            .then(() => {
                console.log('[SW] Static files cached, skipping waiting');
                return self.skipWaiting();
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('[SW] Activating Service Worker...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(cacheName => {
                            return cacheName.startsWith('smart-ocr-') && 
                                   cacheName !== CACHE_NAME && 
                                   cacheName !== RUNTIME_CACHE &&
                                   cacheName !== MODEL_CACHE;
                        })
                        .map(cacheName => {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Claiming clients');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache and add COOP/COEP headers
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Handle navigation requests with COOP/COEP headers
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    // Clone the response to modify headers
                    const newHeaders = new Headers(response.headers);
                    newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
                    newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
                    
                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders
                    });
                })
                .catch(() => {
                    // Offline fallback
                    return caches.match(getAbsoluteUrl('index.html'));
                })
        );
        return;
    }
    
    // Handle WASM files with proper CORS
    if (url.pathname.endsWith('.wasm') || url.pathname.endsWith('.mjs')) {
        event.respondWith(
            fetch(request, {
                mode: 'cors',
                credentials: 'same-origin'
            })
            .then(response => {
                const newHeaders = new Headers(response.headers);
                newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
                
                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: newHeaders
                });
            })
            .catch(() => caches.match(request))
        );
        return;
    }
    
    // Check if this is a model file
    const isModelFile = MODEL_PATTERNS.some(pattern => pattern.test(url.pathname));
    
    if (isModelFile) {
        // Model files - cache first, long-term caching
        event.respondWith(
            caches.open(MODEL_CACHE)
                .then(cache => cache.match(request))
                .then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    
                    return fetch(request)
                        .then(response => {
                            if (!response || response.status !== 200) {
                                return response;
                            }
                            
                            const responseToCache = response.clone();
                            caches.open(MODEL_CACHE)
                                .then(cache => cache.put(request, responseToCache));
                            
                            return response;
                        });
                })
        );
        return;
    }
    
    // Default strategy - network first, fallback to cache
    event.respondWith(
        fetch(request)
            .then(response => {
                // Cache successful responses
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(RUNTIME_CACHE)
                        .then(cache => cache.put(request, responseToCache));
                }
                return response;
            })
            .catch(() => {
                // Try cache on network failure
                return caches.match(request);
            })
    );
});

// Message handler for cache management
self.addEventListener('message', event => {
    const { type, data } = event.data || {};
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'CACHE_MODELS':
            event.waitUntil(
                cacheModels(data)
                    .then(() => {
                        event.ports[0].postMessage({ 
                            success: true, 
                            message: 'Models cached successfully' 
                        });
                    })
                    .catch(error => {
                        event.ports[0].postMessage({ 
                            success: false, 
                            error: error.message 
                        });
                    })
            );
            break;
            
        case 'CLEAR_CACHE':
            event.waitUntil(
                clearAllCaches()
                    .then(() => {
                        event.ports[0].postMessage({ 
                            success: true, 
                            message: 'All caches cleared' 
                        });
                    })
                    .catch(error => {
                        event.ports[0].postMessage({ 
                            success: false, 
                            error: error.message 
                        });
                    })
            );
            break;
            
        case 'CACHE_STATUS':
            event.waitUntil(
                getCacheStatus()
                    .then(status => {
                        event.ports[0].postMessage({ 
                            success: true, 
                            data: status 
                        });
                    })
            );
            break;
    }
});

// Helper functions

async function cacheModels(modelUrls) {
    const cache = await caches.open(MODEL_CACHE);
    const promises = modelUrls.map(url => 
        cache.add(url).catch(err => {
            console.error(`[SW] Failed to cache model ${url}:`, err);
            throw err;
        })
    );
    
    return Promise.all(promises);
}

async function clearAllCaches() {
    const cacheNames = await caches.keys();
    const promises = cacheNames
        .filter(name => name.startsWith('smart-ocr-'))
        .map(name => caches.delete(name));
    
    return Promise.all(promises);
}

async function getCacheStatus() {
    const cacheNames = await caches.keys();
    const status = {};
    
    for (const cacheName of cacheNames) {
        if (cacheName.startsWith('smart-ocr-')) {
            const cache = await caches.open(cacheName);
            const keys = await cache.keys();
            status[cacheName] = {
                count: keys.length,
                urls: keys.map(req => req.url)
            };
        }
    }
    
    return status;
}

// Periodic cache cleanup (every 24 hours)
setInterval(async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    const keys = await cache.keys();
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
            const dateHeader = response.headers.get('date');
            if (dateHeader) {
                const responseTime = new Date(dateHeader).getTime();
                if (now - responseTime > maxAge) {
                    await cache.delete(request);
                }
            }
        }
    }
}, 24 * 60 * 60 * 1000);