// Refactored main entry point with clean OnnxOCR-style implementation
import { PaddleOCR } from './paddle-ocr-refactored.js';
import { tesseractOCREngine } from './tesseract-ocr-engine.js';
import { ocrCache } from './ocr-cache-manager.js';
import './style-modern.css';

// Global state
let currentEngine = 'paddleocr';
let paddleOCR = null;
let selectedFiles = [];
let isProcessing = false;

// Model configurations
const MODEL_CONFIGS = {
    'PP-OCRv5': {
        name: 'PP-OCRv5 (Latest)',
        description: 'Latest model with best accuracy',
        useAngleCls: true
    },
    'PP-OCRv4': {
        name: 'PP-OCRv4',
        description: 'Previous generation model',
        useAngleCls: true
    }
};

// Initialize application
async function initialize() {
    console.log('Initializing OCR application...');
    
    // Initialize engines
    await initializeEngines();
    
    // Setup UI
    setupEventListeners();
    updateUIState();
    
    console.log('Application ready');
}

async function initializeEngines() {
    // Initialize Tesseract
    try {
        await tesseractOCREngine.initialize((progress) => {
            console.log('Tesseract:', progress.message);
        });
    } catch (error) {
        console.error('Failed to initialize Tesseract:', error);
    }
    
    // Initialize PaddleOCR (lazy loaded when selected)
    paddleOCR = new PaddleOCR();
}

function setupEventListeners() {
    // File handling
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', handleDragOver);
    dropzone.addEventListener('dragleave', handleDragLeave);
    dropzone.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);
    
    // Engine selection
    const engineSelect = document.getElementById('engineSelect');
    engineSelect.addEventListener('change', handleEngineChange);
    
    // Model selection (only visible for PaddleOCR)
    const modelSelect = document.getElementById('modelSelect');
    modelSelect.addEventListener('change', handleModelChange);
    
    // Process button
    const processBtn = document.getElementById('processBtn');
    processBtn.addEventListener('click', processImages);
    
    // Download button
    const downloadBtn = document.getElementById('downloadAllBtn');
    downloadBtn.addEventListener('click', downloadResults);
}

function handleEngineChange(event) {
    currentEngine = event.target.value;
    updateUIState();
    
    // Initialize PaddleOCR if selected and not initialized
    if (currentEngine === 'paddleocr' && !paddleOCR.isInitialized) {
        initializePaddleOCR();
    }
}

async function initializePaddleOCR() {
    const modelSelect = document.getElementById('modelSelect');
    const modelId = modelSelect.value;
    const progressSection = document.getElementById('progressSection');
    
    progressSection.classList.remove('hidden');
    updateProgress(0, 'Initializing PaddleOCR...');
    
    try {
        await paddleOCR.initialize({
            modelId,
            useAngleCls: MODEL_CONFIGS[modelId].useAngleCls,
            progressCallback: (progress) => {
                updateProgress(progress.progress, progress.message);
                updateModelInfo(progress);
            }
        });
        
        showNotification('PaddleOCR initialized successfully', 'success');
    } catch (error) {
        console.error('Failed to initialize PaddleOCR:', error);
        showNotification('Failed to initialize PaddleOCR', 'error');
    } finally {
        progressSection.classList.add('hidden');
    }
}

function updateModelInfo(progress) {
    const modelInfoSection = document.getElementById('modelInfoSection');
    
    if (progress.stage === 'complete') {
        const modelInfo = paddleOCR.getModelInfo();
        
        document.getElementById('selectedDET').textContent = 
            modelInfo.models.det ? 'Loaded' : 'Not loaded';
        document.getElementById('selectedCLS').textContent = 
            modelInfo.models.cls ? 'Loaded' : 'Not loaded';
        document.getElementById('selectedREC').textContent = 
            modelInfo.models.rec ? 'Loaded' : 'Not loaded';
        document.getElementById('selectedDICT').textContent = 
            modelInfo.models.dict ? 'Loaded' : 'Not loaded';
        
        modelInfoSection.style.display = 'block';
    }
}

function updateUIState() {
    const modelSelectGroup = document.querySelector('.model-select-group');
    const modelInfoSection = document.getElementById('modelInfoSection');
    
    // Show/hide model selection based on engine
    if (currentEngine === 'paddleocr') {
        modelSelectGroup.style.display = 'block';
        if (paddleOCR && paddleOCR.isInitialized) {
            modelInfoSection.style.display = 'block';
        }
    } else {
        modelSelectGroup.style.display = 'none';
        modelInfoSection.style.display = 'none';
    }
}

function handleModelChange(event) {
    if (paddleOCR && paddleOCR.isInitialized) {
        // Re-initialize with new model
        initializePaddleOCR();
    }
}

function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('active');
}

function handleDragLeave(event) {
    event.currentTarget.classList.remove('active');
}

function handleDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('active');
    handleFiles(event.dataTransfer.files);
}

function handleFileSelect(event) {
    handleFiles(event.target.files);
}

function handleFiles(files) {
    selectedFiles = Array.from(files).filter(file => 
        file.type.startsWith('image/') || file.type === 'application/pdf'
    );
    
    updateFileList();
}

function updateFileList() {
    const fileList = document.getElementById('fileList');
    
    if (selectedFiles.length === 0) {
        fileList.classList.add('hidden');
        return;
    }
    
    fileList.classList.remove('hidden');
    fileList.innerHTML = selectedFiles.map((file, index) => `
        <div class="file-item">
            <div class="file-info">
                <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                <div>
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${formatFileSize(file.size)}</div>
                </div>
            </div>
            <button class="button button-subtle" onclick="removeFile(${index})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
    `).join('');
}

window.removeFile = function(index) {
    selectedFiles.splice(index, 1);
    updateFileList();
};

async function processImages() {
    if (selectedFiles.length === 0) {
        showNotification('Please select files first', 'warning');
        return;
    }
    
    if (isProcessing) {
        showNotification('Already processing...', 'info');
        return;
    }
    
    isProcessing = true;
    const progressSection = document.getElementById('progressSection');
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsList = document.getElementById('resultsList');
    
    progressSection.classList.remove('hidden');
    resultsContainer.classList.remove('hidden');
    resultsList.innerHTML = '';
    
    const results = [];
    
    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const progress = ((i / selectedFiles.length) * 100).toFixed(0);
        updateProgress(progress, `Processing ${file.name}...`);
        
        try {
            let result;
            
            // Check cache first
            const cacheKey = await generateCacheKey(file);
            const cached = await ocrCache.get(cacheKey);
            
            if (cached) {
                result = cached;
                console.log(`Using cached result for ${file.name}`);
            } else {
                // Process with selected engine
                if (currentEngine === 'paddleocr') {
                    if (!paddleOCR.isInitialized) {
                        await initializePaddleOCR();
                    }
                    result = await paddleOCR.detect(file, { outputFormat: 'json' });
                } else {
                    result = await tesseractOCREngine.process(file);
                }
                
                // Cache result
                await ocrCache.set(cacheKey, result);
            }
            
            results.push({
                filename: file.name,
                result: result,
                engine: currentEngine
            });
            
            // Display result
            displayResult(file, result);
            
        } catch (error) {
            console.error(`Error processing ${file.name}:`, error);
            showNotification(`Failed to process ${file.name}`, 'error');
        }
    }
    
    updateProgress(100, 'Processing complete');
    progressSection.classList.add('hidden');
    isProcessing = false;
    
    // Store results for download
    window.ocrResults = results;
}

function displayResult(file, result) {
    const resultsList = document.getElementById('resultsList');
    
    const resultDiv = document.createElement('div');
    resultDiv.className = 'result-item';
    
    // Create preview if image
    let previewHTML = '';
    if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        previewHTML = `<img src="${url}" class="result-preview" alt="${file.name}">`;
    }
    
    // Extract text
    let text = '';
    if (currentEngine === 'paddleocr' && result.fullText) {
        text = result.fullText;
    } else if (Array.isArray(result)) {
        text = result.map(r => r.text).join('\n');
    } else if (result.text) {
        text = result.text;
    }
    
    resultDiv.innerHTML = `
        <div class="result-header">
            <h3>${file.name}</h3>
            <div class="result-actions">
                <button class="button button-subtle" onclick="copyText('${encodeURIComponent(text)}')">
                    Copy
                </button>
                <button class="button button-subtle" onclick="downloadText('${file.name}', '${encodeURIComponent(text)}')">
                    Download
                </button>
            </div>
        </div>
        ${previewHTML}
        <pre class="result-text">${escapeHtml(text)}</pre>
    `;
    
    resultsList.appendChild(resultDiv);
}

window.copyText = async function(encodedText) {
    const text = decodeURIComponent(encodedText);
    try {
        await navigator.clipboard.writeText(text);
        showNotification('Copied to clipboard', 'success');
    } catch (error) {
        showNotification('Failed to copy', 'error');
    }
};

window.downloadText = function(filename, encodedText) {
    const text = decodeURIComponent(encodedText);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.replace(/\.[^.]+$/, '.txt');
    a.click();
    URL.revokeObjectURL(url);
};

async function downloadResults() {
    if (!window.ocrResults || window.ocrResults.length === 0) {
        showNotification('No results to download', 'warning');
        return;
    }
    
    // Create ZIP file
    const zip = new JSZip();
    
    window.ocrResults.forEach(({ filename, result }) => {
        let text = '';
        if (currentEngine === 'paddleocr' && result.fullText) {
            text = result.fullText;
        } else if (Array.isArray(result)) {
            text = result.map(r => r.text).join('\n');
        } else if (result.text) {
            text = result.text;
        }
        
        const txtFilename = filename.replace(/\.[^.]+$/, '.txt');
        zip.file(txtFilename, text);
    });
    
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-results-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
}

function updateProgress(percent, message) {
    const progressBar = document.getElementById('progressBar');
    const progressLabel = document.getElementById('progressLabel');
    
    progressBar.style.width = percent + '%';
    progressLabel.textContent = message || `Processing... ${percent}%`;
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

async function generateCacheKey(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `${currentEngine}_${hashHex}`;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load JSZip for download functionality
if (typeof JSZip === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    document.head.appendChild(script);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}