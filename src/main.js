import { ppOCREngine } from './ppocr-onnx-engine.js';
import * as pdfjsLib from 'pdfjs-dist';
import './style.css';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '/client-ocr-app/pdf.worker.min.js';

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
    console.log('Initializing PP-OCR with ONNX Runtime...');
    showStatus('Loading PP-OCR models...', 'info');
    
    try {
        await ppOCREngine.initialize((progress) => {
            showStatus(progress.message, progress.status === 'ready' ? 'success' : 'info');
            
            // Update loading indicator if visible
            const loadingText = document.querySelector('#loadingIndicator p');
            if (loadingText && progress.progress !== undefined) {
                loadingText.textContent = `${progress.message} (${progress.progress}%)`;
            }
        });
        
        console.log('PP-OCR loaded successfully!');
        setupEventListeners();
    } catch (error) {
        console.error('Failed to initialize OCR models:', error);
        showError('Failed to load OCR models. Please check your internet connection and refresh the page.');
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
    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
        loadFile(file);
    } else {
        showError('Please select a valid image or PDF file');
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
    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
        loadFile(file);
    } else {
        showError('Please drop a valid image or PDF file');
    }
}

// Load and display file
async function loadFile(file) {
    // Store the file blob for processing
    currentImageBlob = file;
    
    previewSection.style.display = 'block';
    resultsSection.style.display = 'none';
    
    if (file.type === 'application/pdf') {
        // For PDFs, render the first page as preview
        previewImage.style.display = 'none';
        const previewContainer = previewImage.parentElement;
        previewContainer.innerHTML = '';
        
        // Create PDF preview container
        const pdfPreview = document.createElement('div');
        pdfPreview.className = 'pdf-preview';
        pdfPreview.innerHTML = `
            <div class="pdf-header">
                <h3>${file.name}</h3>
                <p class="pdf-info">Loading PDF preview...</p>
            </div>
            <div class="pdf-pages" id="pdfPages"></div>
        `;
        previewContainer.appendChild(pdfPreview);
        
        // Load and render PDF preview
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const numPages = pdf.numPages;
            
            const pdfInfo = pdfPreview.querySelector('.pdf-info');
            pdfInfo.textContent = `${numPages} page${numPages > 1 ? 's' : ''}`;
            
            const pagesContainer = document.getElementById('pdfPages');
            
            // Render first few pages as preview (max 3)
            const pagesToRender = Math.min(numPages, 3);
            
            for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale: 0.5 });
                
                const pageDiv = document.createElement('div');
                pageDiv.className = 'pdf-page-preview';
                
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                
                await page.render(renderContext).promise;
                
                pageDiv.innerHTML = `<p>Page ${pageNum}</p>`;
                pageDiv.appendChild(canvas);
                pagesContainer.appendChild(pageDiv);
            }
            
            if (numPages > 3) {
                pagesContainer.innerHTML += `<p class="more-pages">... and ${numPages - 3} more pages</p>`;
            }
        } catch (error) {
            console.error('Error rendering PDF preview:', error);
            pdfPreview.querySelector('.pdf-info').textContent = 'Error loading PDF preview';
        }
    } else {
        // For images, show preview
        const existingPlaceholder = document.querySelector('.pdf-placeholder');
        if (existingPlaceholder) {
            existingPlaceholder.remove();
        }
        previewImage.style.display = 'block';
        
        const objectUrl = URL.createObjectURL(file);
        previewImage.src = objectUrl;
        
        // Clean up old object URLs
        previewImage.onload = () => {
            URL.revokeObjectURL(objectUrl);
        };
    }
}

// Process image with PP-OCR
async function processImage() {
    if (!currentImageBlob) {
        showError('Please upload an image first');
        return;
    }
    
    resultsSection.style.display = 'block';
    loadingIndicator.style.display = 'flex';
    ocrResults.innerHTML = '';
    
    // Update loading text
    const loadingText = document.querySelector('#loadingIndicator p');
    if (loadingText) {
        loadingText.textContent = 'Processing image with PP-OCR...';
    }
    
    try {
        console.log('Processing image with PP-OCR...');
        showStatus('Detecting and recognizing text...', 'info');
        
        const startTime = performance.now();
        
        // Process with real OCR engine
        const results = await ppOCREngine.process(currentImageBlob);
        
        const processingTime = performance.now() - startTime;
        console.log(`Processing completed in ${processingTime.toFixed(2)}ms`);
        console.log('OCR Results:', results);
        
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
    // Check if results is from PDF (array of page results)
    const isPDF = Array.isArray(results) && results[0]?.page !== undefined;
    
    if (isPDF) {
        // Handle PDF results
        let allText = '';
        let totalRegions = 0;
        let detailsHTML = '';
        
        results.forEach(pageResult => {
            const pageText = pageResult.results.map(r => r.text).join('\n');
            allText += `\n--- Page ${pageResult.page} ---\n${pageText}\n`;
            totalRegions += pageResult.results.length;
            
            detailsHTML += `
                <div class="page-results">
                    <h4>Page ${pageResult.page}</h4>
                    <ul class="detection-list">
                        ${pageResult.results.map((result, index) => `
                            <li>
                                <span class="detection-index">${index + 1}.</span>
                                <span class="detection-text">${escapeHtml(result.text)}</span>
                                <span class="detection-confidence">${(result.confidence * 100).toFixed(1)}%</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        });
        
        ocrResults.innerHTML = `
            <div class="ocr-stats">
                <p><strong>Processing Time:</strong> ${(processingTime / 1000).toFixed(2)}s</p>
                <p><strong>Pages Processed:</strong> ${results.length}</p>
                <p><strong>Total Text Regions:</strong> ${totalRegions}</p>
                <p><strong>Model:</strong> PP-OCRv5</p>
            </div>
            <div class="text-result">
                <h3>Extracted Text:</h3>
                <div class="text-content" id="extractedText">${escapeHtml(allText || 'No text detected')}</div>
            </div>
            <div class="detection-results">
                <h3>Detection Details by Page:</h3>
                ${detailsHTML}
            </div>
        `;
    } else {
        // Handle image results
        const allText = results.map(r => r.text).join('\n');
        
        ocrResults.innerHTML = `
            <div class="ocr-stats">
                <p><strong>Processing Time:</strong> ${(processingTime / 1000).toFixed(2)}s</p>
                <p><strong>Text Regions Found:</strong> ${results.length}</p>
                <p><strong>Model:</strong> PP-OCRv5</p>
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
        a.download = `pp-ocrv5-result-${Date.now()}.txt`;
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
    showStatus(message, 'error');
    
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = 'toast error';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
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