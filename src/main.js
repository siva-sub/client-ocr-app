import { paddleOCR } from './paddle-ocr.js';
import './style.css';

// Global variables
let currentImageBlob = null;

// DOM elements
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const previewSection = document.getElementById('previewSection');
const previewImage = document.getElementById('previewImage');
const processBtn = document.getElementById('processBtn');
const resultsSection = document.getElementById('resultsSection');
const loadingIndicator = document.getElementById('loadingIndicator');
const ocrResults = document.getElementById('ocrResults');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');

// Initialize the app
async function initializeApp() {
    console.log('Initializing PaddleOCR...');
    showStatus('Initializing PaddleOCR models...', 'info');
    
    try {
        await paddleOCR.initialize((progress) => {
            showStatus(progress.message, progress.status === 'ready' ? 'success' : 'info');
        });
        
        console.log('PaddleOCR initialized successfully!');
        setupEventListeners();
    } catch (error) {
        console.error('Failed to initialize PaddleOCR:', error);
        showError('Failed to initialize OCR. Please refresh the page.');
    }
}

// Set up event listeners
function setupEventListeners() {
    // File upload
    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    
    // Drag and drop
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    
    // Buttons
    processBtn.addEventListener('click', processImage);
    copyBtn.addEventListener('click', copyText);
    downloadBtn.addEventListener('click', downloadText);
    resetBtn.addEventListener('click', reset);
}

// File handling
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        loadImage(file);
    } else {
        showError('Please select a valid image file');
    }
}

function handleDragOver(event) {
    event.preventDefault();
    uploadArea.classList.add('dragover');
}

function handleDragLeave(event) {
    event.preventDefault();
    uploadArea.classList.remove('dragover');
}

function handleDrop(event) {
    event.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        loadImage(file);
    } else {
        showError('Please drop a valid image file');
    }
}

// Load and display image
async function loadImage(file) {
    // Store the file blob for processing
    currentImageBlob = file;
    
    // Create object URL for preview
    const objectUrl = URL.createObjectURL(file);
    previewImage.src = objectUrl;
    previewSection.style.display = 'block';
    resultsSection.style.display = 'none';
    
    // Clean up old object URLs
    previewImage.onload = () => {
        URL.revokeObjectURL(objectUrl);
    };
}

// Process image with PaddleOCR
async function processImage() {
    if (!currentImageBlob) {
        showError('Please upload an image first');
        return;
    }
    
    resultsSection.style.display = 'block';
    loadingIndicator.style.display = 'flex';
    ocrResults.innerHTML = '';
    
    try {
        console.log('Processing image with PaddleOCR...');
        showStatus('Processing image with PaddleOCR...', 'info');
        
        const startTime = performance.now();
        
        // Process with PaddleOCR
        const results = await paddleOCR.process(currentImageBlob);
        
        const processingTime = performance.now() - startTime;
        console.log(`Processing completed in ${processingTime.toFixed(2)}ms`);
        
        // Display results
        loadingIndicator.style.display = 'none';
        
        if (results && results.length > 0) {
            displayResults(results, processingTime);
            showStatus(`Text extraction complete! Found ${results.length} text regions.`, 'success');
        } else {
            displayResults([]);
            showStatus('No text found in the image', 'warning');
        }
        
    } catch (error) {
        console.error('OCR processing error:', error);
        loadingIndicator.style.display = 'none';
        showError('Failed to process image: ' + error.message);
    }
}

// Display OCR results
function displayResults(results, processingTime) {
    const allText = results.map(r => r.text).join('\n');
    
    ocrResults.innerHTML = `
        <div class="ocr-stats">
            <p><strong>Processing Time:</strong> ${(processingTime / 1000).toFixed(2)}s</p>
            <p><strong>Text Regions Found:</strong> ${results.length}</p>
        </div>
        <div class="text-result">
            <h3>Extracted Text:</h3>
            <div class="text-content" id="extractedText">${escapeHtml(allText || 'No text detected')}</div>
        </div>
        <div class="detection-results">
            <h3>Detection Details:</h3>
            <ul class="detection-list">
                ${results.map((result, index) => `
                    <li>
                        <span class="detection-index">${index + 1}.</span>
                        <span class="detection-text">${escapeHtml(result.text)}</span>
                        <span class="detection-confidence">${(result.confidence * 100).toFixed(1)}%</span>
                    </li>
                `).join('')}
            </ul>
        </div>
    `;
}

// Copy text to clipboard
async function copyText() {
    const textElement = document.getElementById('extractedText');
    if (textElement) {
        try {
            await navigator.clipboard.writeText(textElement.textContent);
            showSuccess('Text copied to clipboard!');
        } catch (error) {
            showError('Failed to copy text');
        }
    }
}

// Download text as file
function downloadText() {
    const textElement = document.getElementById('extractedText');
    if (textElement) {
        const text = textElement.textContent;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `paddleocr-result-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Reset the app
function reset() {
    fileInput.value = '';
    currentImageBlob = null;
    previewSection.style.display = 'none';
    resultsSection.style.display = 'none';
    ocrResults.innerHTML = '';
    showStatus('Ready to process a new image', 'info');
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = 'toast error';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function showSuccess(message) {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = 'toast success';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function showStatus(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Update status in UI
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `status ${type}`;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);