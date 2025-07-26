// Main entry point for Unified OCR app with multiple engine support
import { UnifiedOCRManager } from './unified-ocr-manager.js';
import { tesseractOCREngine } from './tesseract-ocr-engine.js';
import { drawOCRResults } from './ocr/utils.js';
import { ensureOpenCvReady } from './opencv-wrapper.js';

// Global state
let ocrManager = null;
let selectedFiles = [];
let currentResults = null;
let isProcessing = false;

// Initialize application
async function initialize() {
    console.log('Initializing Unified OCR application...');
    
    // Ensure OpenCV is ready first
    try {
        await ensureOpenCvReady();
        console.log('OpenCV.js is ready');
    } catch (error) {
        console.error('Failed to load OpenCV.js:', error);
        updateStatus('Failed to load OpenCV.js. Please refresh the page.');
        return;
    }
    
    // Initialize OCR manager
    ocrManager = new UnifiedOCRManager();
    
    // Setup UI
    setupEventListeners();
    updateEngineSelector();
    updateUIState();
    
    // Initialize default engine
    await initializeDefaultEngine();
    
    console.log('Application ready');
}

async function initializeDefaultEngine() {
    try {
        const engineSelect = document.getElementById('engineSelect');
        const defaultEngine = engineSelect?.value || 'ppu-mobile';
        
        updateStatus('Initializing default OCR engine...');
        await ocrManager.initialize(defaultEngine, handleProgress);
        updateStatus('OCR engine ready');
    } catch (error) {
        console.error('Failed to initialize default engine:', error);
        updateStatus('Failed to initialize OCR engine');
    }
}

function handleProgress(progress) {
    if (progress.type === 'model-download') {
        const percent = progress.percent?.toFixed(1) || 0;
        updateStatus(`Downloading ${progress.model} model: ${percent}%`);
        updateProgressBar(progress.percent);
    } else if (progress.type === 'tesseract') {
        updateStatus(`Tesseract: ${progress.status}`);
        if (progress.progress) {
            updateProgressBar(progress.progress * 100);
        }
    }
}

function updateProgressBar(percent) {
    const progressBar = document.querySelector('.progress-bar');
    const progressFill = document.querySelector('.progress-fill');
    
    if (progressBar && progressFill) {
        progressBar.style.display = percent > 0 && percent < 100 ? 'block' : 'none';
        progressFill.style.width = `${percent}%`;
    }
}

function updateEngineSelector() {
    const engineSelect = document.getElementById('engineSelect');
    if (!engineSelect) return;
    
    const engines = ocrManager.getAvailableEngines();
    engineSelect.innerHTML = '';
    
    for (const [key, engine] of Object.entries(engines)) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = engine.name + (engine.isCached ? ' ✓' : ' ⬇');
        option.title = engine.description;
        engineSelect.appendChild(option);
    }
}

function setupEventListeners() {
    // File handling
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    
    dropzone?.addEventListener('click', () => fileInput?.click());
    dropzone?.addEventListener('dragover', handleDragOver);
    dropzone?.addEventListener('dragleave', handleDragLeave);
    dropzone?.addEventListener('drop', handleDrop);
    fileInput?.addEventListener('change', handleFileSelect);
    
    // Engine selection
    const engineSelect = document.getElementById('engineSelect');
    engineSelect?.addEventListener('change', handleEngineChange);
    
    // Process button
    const processBtn = document.getElementById('processBtn');
    processBtn?.addEventListener('click', processSelectedFiles);
    
    // Copy button
    const copyBtn = document.getElementById('copyBtn');
    copyBtn?.addEventListener('click', copyResults);
    
    // Clear button
    const clearBtn = document.getElementById('clearBtn');
    clearBtn?.addEventListener('click', clearAll);
    
    // Download button
    const downloadBtn = document.getElementById('downloadBtn');
    downloadBtn?.addEventListener('click', downloadResults);
    
    // Model info button
    const modelInfoBtn = document.getElementById('modelInfoBtn');
    modelInfoBtn?.addEventListener('click', showModelInfo);
    
    // Result view toggles
    document.querySelectorAll('input[name="resultView"]').forEach(radio => {
        radio.addEventListener('change', updateResultView);
    });
}

async function handleEngineChange(e) {
    const newEngine = e.target.value;
    
    try {
        updateStatus(`Switching to ${newEngine}...`);
        await ocrManager.switchEngine(newEngine);
        updateStatus(`Switched to ${newEngine}`);
        updateEngineSelector();
        
        // Re-process current image if available
        if (selectedFiles.length > 0 && currentResults) {
            await processSelectedFiles();
        }
    } catch (error) {
        console.error('Failed to switch engine:', error);
        updateStatus('Failed to switch engine');
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files).filter(file => 
        file.type.startsWith('image/')
    );
    
    if (files.length > 0) {
        handleFiles(files);
    }
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        handleFiles(files);
    }
}

function handleFiles(files) {
    selectedFiles = files;
    displaySelectedFiles();
    updateUIState();
}

function displaySelectedFiles() {
    const fileList = document.getElementById('fileList');
    if (!fileList || selectedFiles.length === 0) return;
    
    fileList.innerHTML = '';
    
    selectedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <span class="file-name">${file.name}</span>
            <span class="file-size">${formatFileSize(file.size)}</span>
            <button class="file-remove" data-index="${index}">×</button>
        `;
        
        item.querySelector('.file-remove').addEventListener('click', (e) => {
            removeFile(parseInt(e.target.dataset.index));
        });
        
        fileList.appendChild(item);
    });
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    displaySelectedFiles();
    updateUIState();
    
    if (selectedFiles.length === 0) {
        clearResults();
    }
}

async function processSelectedFiles() {
    if (selectedFiles.length === 0 || isProcessing) return;
    
    isProcessing = true;
    updateUIState();
    
    try {
        // Process first file for now
        const file = selectedFiles[0];
        updateStatus(`Processing ${file.name}...`);
        
        // Read and display image
        const imageData = await readImageFile(file);
        displayImage(imageData);
        
        // Process with OCR
        const startTime = performance.now();
        const results = await ocrManager.processImage(imageData);
        const processTime = performance.now() - startTime;
        
        // Display results
        currentResults = results;
        displayResults(results, processTime);
        updateStatus(`Processed in ${processTime.toFixed(0)}ms`);
        
    } catch (error) {
        console.error('Processing error:', error);
        updateStatus(`Error: ${error.message}`);
    } finally {
        isProcessing = false;
        updateUIState();
    }
}

async function readImageFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function displayImage(imageData) {
    const canvas = document.getElementById('imageCanvas');
    if (!canvas) return;
    
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
    
    // Update container visibility
    document.querySelector('.canvas-container').style.display = 'block';
}

function displayResults(results, processTime) {
    // Update canvas with visual results
    const canvas = document.getElementById('resultCanvas');
    if (canvas && ocrManager) {
        canvas.width = document.getElementById('imageCanvas').width;
        canvas.height = document.getElementById('imageCanvas').height;
        
        // Copy original image
        const ctx = canvas.getContext('2d');
        ctx.drawImage(document.getElementById('imageCanvas'), 0, 0);
        
        // Draw OCR results
        ocrManager.visualizeResults(canvas, results);
    }
    
    // Update text results
    const textResults = document.getElementById('textResults');
    if (textResults) {
        const extractedTexts = results.texts || [];
        const fullText = extractedTexts
            .map(item => item.text)
            .filter(text => text.trim())
            .join('\n');
        
        textResults.value = fullText || 'No text detected';
    }
    
    // Update statistics
    updateStatistics(results, processTime);
    
    // Show results section
    document.getElementById('results').style.display = 'block';
    updateResultView();
}

function updateStatistics(results, processTime) {
    const stats = document.getElementById('statistics');
    if (!stats) return;
    
    const textCount = results.texts?.length || 0;
    const avgConfidence = textCount > 0 
        ? results.texts.reduce((sum, item) => sum + item.confidence, 0) / textCount 
        : 0;
    
    stats.innerHTML = `
        <div class="stat-item">
            <span class="stat-label">Engine:</span>
            <span class="stat-value">${results.engine || 'Unknown'}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Processing Time:</span>
            <span class="stat-value">${processTime.toFixed(0)}ms</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Text Regions:</span>
            <span class="stat-value">${textCount}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Avg Confidence:</span>
            <span class="stat-value">${(avgConfidence * 100).toFixed(1)}%</span>
        </div>
    `;
}

function updateResultView() {
    const selectedView = document.querySelector('input[name="resultView"]:checked')?.value || 'visual';
    
    document.getElementById('visualResults').style.display = 
        selectedView === 'visual' ? 'block' : 'none';
    document.getElementById('textResultsContainer').style.display = 
        selectedView === 'text' ? 'block' : 'none';
}

function copyResults() {
    const textResults = document.getElementById('textResults');
    if (!textResults) return;
    
    textResults.select();
    document.execCommand('copy');
    
    const copyBtn = document.getElementById('copyBtn');
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
        copyBtn.textContent = originalText;
    }, 2000);
}

function downloadResults() {
    if (!currentResults) return;
    
    const data = {
        engine: currentResults.engine,
        timestamp: new Date().toISOString(),
        processingTime: currentResults.processingTime,
        results: currentResults.texts?.map(item => ({
            text: item.text,
            confidence: item.confidence,
            bounds: item.box
        })) || []
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function showModelInfo() {
    const engines = ocrManager.getAvailableEngines();
    const current = ocrManager.currentEngine;
    
    let info = `**Current Engine: ${current || 'None'}**\n\n`;
    info += '**Available Engines:**\n\n';
    
    for (const [key, engine] of Object.entries(engines)) {
        info += `**${engine.name}**\n`;
        info += `${engine.description}\n`;
        info += `Status: ${engine.isCached ? 'Cached ✓' : 'Not cached ⬇'}\n\n`;
    }
    
    alert(info);
}

function clearAll() {
    selectedFiles = [];
    currentResults = null;
    clearResults();
    displaySelectedFiles();
    updateUIState();
}

function clearResults() {
    // Clear canvases
    ['imageCanvas', 'resultCanvas'].forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    });
    
    // Clear text results
    const textResults = document.getElementById('textResults');
    if (textResults) {
        textResults.value = '';
    }
    
    // Hide containers
    document.querySelector('.canvas-container').style.display = 'none';
    document.getElementById('results').style.display = 'none';
    
    // Clear statistics
    const stats = document.getElementById('statistics');
    if (stats) {
        stats.innerHTML = '';
    }
}

function updateUIState() {
    const processBtn = document.getElementById('processBtn');
    const fileInput = document.getElementById('fileInput');
    const engineSelect = document.getElementById('engineSelect');
    
    if (processBtn) {
        processBtn.disabled = selectedFiles.length === 0 || isProcessing;
        processBtn.textContent = isProcessing ? 'Processing...' : 'Process with OCR';
    }
    
    if (fileInput) {
        fileInput.disabled = isProcessing;
    }
    
    if (engineSelect) {
        engineSelect.disabled = isProcessing;
    }
    
    // Update result buttons
    const hasResults = currentResults !== null;
    ['copyBtn', 'downloadBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !hasResults;
    });
}

function updateStatus(message) {
    const status = document.getElementById('status');
    if (status) {
        status.textContent = message;
        status.style.display = message ? 'block' : 'none';
    }
    
    // Also set status for OCR manager
    ocrManager.onStatusChange = (status) => {
        updateStatus(status);
    };
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}