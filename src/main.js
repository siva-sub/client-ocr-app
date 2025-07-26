// Main entry point for Mantine-styled OCR app with visual results
import { PaddleOCR } from './paddle-ocr-refactored.js';
import { tesseractOCREngine } from './tesseract-ocr-engine.js';
import { drawOCRResults } from './ocr/utils.js';

// Global state
let currentEngine = 'paddleocr';
let paddleOCR = null;
let selectedFiles = [];
let currentResults = null;

// Initialize application
async function initialize() {
    console.log('Initializing OnnxOCR application...');
    
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
    
    // PaddleOCR will be initialized on demand
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
    
    // Process button
    const processBtn = document.getElementById('processBtn');
    processBtn.addEventListener('click', processImages);
    
    // Tab switching
    document.querySelectorAll('.mantine-Tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.currentTarget.dataset.tab;
            switchTab(tabName);
        });
    });
}

function handleEngineChange(event) {
    currentEngine = event.target.value;
    updateUIState();
}

function updateUIState() {
    const modelSelectWrapper = document.getElementById('modelSelectWrapper');
    modelSelectWrapper.style.display = currentEngine === 'paddleocr' ? 'block' : 'none';
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
    const fileListContent = document.getElementById('fileListContent');
    
    if (selectedFiles.length === 0) {
        fileList.style.display = 'none';
        return;
    }
    
    fileList.style.display = 'block';
    fileListContent.innerHTML = selectedFiles.map((file, index) => `
        <div class="mantine-FileItem">
            <div class="mantine-FileItem-info">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                <div>
                    <div>${file.name}</div>
                    <div class="mantine-Text-sm mantine-dimmed">${formatFileSize(file.size)}</div>
                </div>
            </div>
            <button class="mantine-FileItem-remove" onclick="removeFile(${index})">
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
        alert('Please select files first');
        return;
    }
    
    const progressSection = document.getElementById('progressSection');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const resultsSection = document.getElementById('resultsSection');
    
    progressSection.style.display = 'block';
    resultsSection.style.display = 'none';
    
    try {
        // Initialize PaddleOCR if needed
        if (currentEngine === 'paddleocr' && !paddleOCR.isInitialized) {
            progressText.textContent = 'Initializing PaddleOCR models...';
            const modelId = document.getElementById('modelSelect').value;
            
            await paddleOCR.initialize({
                modelId,
                useAngleCls: true,
                progressCallback: (progress) => {
                    progressBar.style.width = progress.progress + '%';
                    progressText.textContent = progress.message;
                    updateModelInfo(progress);
                }
            });
        }
        
        // Process first image (for demo)
        const file = selectedFiles[0];
        progressText.textContent = `Processing ${file.name}...`;
        progressBar.style.width = '50%';
        
        let result;
        if (currentEngine === 'paddleocr') {
            result = await paddleOCR.detect(file, { outputFormat: 'raw' });
            displayPaddleOCRResults(file, result);
        } else {
            result = await tesseractOCREngine.process(file);
            displayTesseractResults(result);
        }
        
        currentResults = result;
        progressBar.style.width = '100%';
        progressText.textContent = 'Processing complete!';
        
        setTimeout(() => {
            progressSection.style.display = 'none';
            resultsSection.style.display = 'block';
        }, 500);
        
    } catch (error) {
        console.error('Processing error:', error);
        alert('Error processing image: ' + error.message);
        progressSection.style.display = 'none';
    }
}

async function displayPaddleOCRResults(file, results) {
    const visualResults = document.getElementById('visualResults');
    const standardResults = document.getElementById('standardResults');
    
    visualResults.style.display = 'block';
    standardResults.style.display = 'none';
    
    // Load image onto canvas
    const canvas = document.getElementById('ocrCanvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        // Draw bounding boxes
        const boxesContainer = document.getElementById('ocrBoxes');
        boxesContainer.innerHTML = '';
        boxesContainer.style.width = canvas.offsetWidth + 'px';
        boxesContainer.style.height = canvas.offsetHeight + 'px';
        
        const scaleX = canvas.offsetWidth / img.width;
        const scaleY = canvas.offsetHeight / img.height;
        
        results.forEach((result, index) => {
            if (result.box) {
                const box = result.box;
                const minX = Math.min(...box.map(p => p[0]));
                const minY = Math.min(...box.map(p => p[1]));
                const maxX = Math.max(...box.map(p => p[0]));
                const maxY = Math.max(...box.map(p => p[1]));
                
                const boxDiv = document.createElement('div');
                boxDiv.className = 'ocr-box';
                boxDiv.style.left = (minX * scaleX) + 'px';
                boxDiv.style.top = (minY * scaleY) + 'px';
                boxDiv.style.width = ((maxX - minX) * scaleX) + 'px';
                boxDiv.style.height = ((maxY - minY) * scaleY) + 'px';
                boxDiv.dataset.index = index;
                
                const label = document.createElement('div');
                label.className = 'ocr-box-label';
                label.textContent = `${index + 1}`;
                boxDiv.appendChild(label);
                
                boxDiv.onclick = () => selectDetection(index);
                boxesContainer.appendChild(boxDiv);
            }
        });
        
        // Display detection list
        const detectionList = document.getElementById('detectionList');
        detectionList.innerHTML = results.map((result, index) => `
            <div class="ocr-detection-item" data-index="${index}" onclick="selectDetection(${index})">
                <div class="ocr-detection-text">${result.text}</div>
                <div class="ocr-detection-confidence">${(result.confidence * 100).toFixed(1)}%</div>
            </div>
        `).join('');
        
        // Update text results
        const textResult = document.getElementById('textResult');
        textResult.textContent = results.map(r => r.text).join('\n');
        
        // Update JSON results
        const jsonResult = document.getElementById('jsonResult');
        jsonResult.textContent = JSON.stringify(results, null, 2);
    };
    
    img.src = URL.createObjectURL(file);
}

function displayTesseractResults(results) {
    const visualResults = document.getElementById('visualResults');
    const standardResults = document.getElementById('standardResults');
    
    visualResults.style.display = 'none';
    standardResults.style.display = 'block';
    
    const standardTextResult = document.getElementById('standardTextResult');
    const text = Array.isArray(results) ? results.map(r => r.text).join('\n') : results.text || '';
    standardTextResult.textContent = text;
}

window.selectDetection = function(index) {
    // Update box selection
    document.querySelectorAll('.ocr-box').forEach(box => {
        box.classList.toggle('selected', parseInt(box.dataset.index) === index);
    });
    
    // Update list selection
    document.querySelectorAll('.ocr-detection-item').forEach(item => {
        item.classList.toggle('selected', parseInt(item.dataset.index) === index);
    });
    
    // Scroll to item
    const selectedItem = document.querySelector(`.ocr-detection-item[data-index="${index}"]`);
    if (selectedItem) {
        selectedItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

function switchTab(tabName) {
    // Update tabs
    document.querySelectorAll('.mantine-Tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    // Update panels
    document.querySelectorAll('.mantine-Tabs-panel').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.panel === tabName);
    });
}

function updateModelInfo(progress) {
    if (progress.stage === 'complete') {
        const modelInfo = paddleOCR.getModelInfo();
        document.getElementById('detModel').textContent = 'PP-OCRv5 Det';
        document.getElementById('clsModel').textContent = 'PP-OCRv5 Cls';
        document.getElementById('recModel').textContent = 'PP-OCRv5 Rec';
        document.getElementById('dictModel').textContent = 'ppocr_keys_v1.txt';
    }
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