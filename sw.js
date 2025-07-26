/**
 * Service Worker for Smart OCR PWA
 * Provides offline functionality and caching
 */

const CACHE_NAME = 'smart-ocr-v3';
const RUNTIME_CACHE = 'smart-ocr-runtime-v3';
const MODEL_CACHE = 'smart-ocr-models-v3';

// Essential files to cache immediately
const STATIC_CACHE_URLS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/src/main.js',
    '/src/style-mantine.css',
    '/icons/icon-192.png'
];

// Model files to cache on demand
const MODEL_PATTERNS = [
    /\/models\/.*\.onnx$/,
    /\/models\/.*\.txt$/
];

// External resources that should bypass service worker
const EXTERNAL_URLS = [
    'docs.opencv.org',
    'cdn.jsdelivr.net',
    'cdnjs.cloudflare.com'
];

// Install event
self.addEventListener('install', event => {
    console.log('[SW] Installing Service Worker...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching static files');
                // Filter out invalid URLs and cache valid ones
                const validUrls = STATIC_CACHE_URLS.filter(url => {
                    try {
                        new URL(url, self.location.origin);
                        return true;
                    } catch {
                        return false;
                    }
                });
                
                return Promise.allSettled(
                    validUrls.map(url => 
                        cache.add(url).catch(err => 
                            console.warn(`[SW] Failed to cache ${url}:`, err)
                        )
                    )
                );
            })
            .then(() => {
                console.log('[SW] Installation complete');
                return self.skipWaiting();
            })
    );
});

// Activate event
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
                console.log('[SW] Service Worker activated');
                return self.clients.claim();
            })
    );
});

// Fetch event
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip chrome-extension URLs
    if (url.protocol === 'chrome-extension:') {
        return;
    }
    
    // Skip external URLs that may have CORS issues
    if (EXTERNAL_URLS.some(domain => url.hostname.includes(domain))) {
        return;
    }
    
    // Check if it's a model file
    const isModelFile = MODEL_PATTERNS.some(pattern => pattern.test(url.pathname));
    
    if (isModelFile) {
        // Cache models with network-first strategy
        event.respondWith(
            caches.open(MODEL_CACHE).then(cache => {
                return fetch(request)
                    .then(response => {
                        if (response.ok) {
                            cache.put(request, response.clone());
                        }
                        return response;
                    })
                    .catch(() => {
                        return cache.match(request);
                    });
            })
        );
    } else {
        // For other resources, try cache first
        event.respondWith(
            caches.match(request)
                .then(cached => {
                    if (cached) {
                        // Update cache in background
                        fetch(request).then(response => {
                            if (response.ok) {
                                caches.open(RUNTIME_CACHE).then(cache => {
                                    cache.put(request, response);
                                });
                            }
                        }).catch(() => {});
                        
                        return cached;
                    }
                    
                    // Not in cache, fetch from network
                    return fetch(request).then(response => {
                        if (response.ok && request.url.startsWith(self.location.origin)) {
                            // Clone and cache the response
                            const responseToCache = response.clone();
                            caches.open(RUNTIME_CACHE).then(cache => {
                                cache.put(request, responseToCache);
                            });
                        }
                        return response;
                    });
                })
        );
    }
});

// Handle messages from the main thread
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] Skip waiting requested');
        self.skipWaiting();
    }
});