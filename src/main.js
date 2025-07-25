import { ppOCRImprovedEngine } from './ppocr-improved-engine.js';
import { ppOCREngine } from './ppocr-onnx-engine.js';
import { tesseractOCREngine } from './tesseract-ocr-engine.js';
import * as pdfjsLib from 'pdfjs-dist';
import './style.css';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '/client-ocr-app/pdf.worker.min.js';

// Global variables
let currentImageBlob = null;
let currentEngine = 'tesseract';  // Default to tesseract for better accuracy
let currentPreprocessing = 'improved'; // 'standard' or 'improved'
let currentOCREngine = tesseractOCREngine;

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
    console.log('Initializing OCR engines...');
    showStatus('Loading OCR engines...', 'info');
    
    try {
        // Initialize all engines
        await Promise.all([
            ppOCRImprovedEngine.initialize((progress) => {
                if (currentEngine === 'paddle' && currentPreprocessing === 'improved') {
                    showStatus(progress.message, progress.status === 'ready' ? 'success' : 'info');
                }
                
                // Update loading indicator if visible
                const loadingText = document.querySelector('#loadingIndicator p');
                if (loadingText && progress.progress !== undefined && currentEngine === 'paddle' && currentPreprocessing === 'improved') {
                    loadingText.textContent = `${progress.message} (${progress.progress}%)`;
                }
            }),
            ppOCREngine.initialize((progress) => {
                if (currentEngine === 'paddle' && currentPreprocessing === 'standard') {
                    showStatus(progress.message, progress.status === 'ready' ? 'success' : 'info');
                }
            }),
            tesseractOCREngine.initialize((progress) => {
                if (currentEngine === 'tesseract') {
                    showStatus(progress.message, progress.status === 'ready' ? 'success' : 'info');
                }
            })
        ]);
        
        console.log('OCR engines loaded successfully!');
        showStatus('Ready to process images', 'success');
        setupEventListeners();
    } catch (error) {
        console.error('Failed to initialize OCR engines:', error);
        showError('Failed to load OCR engines. Please check your internet connection and refresh the page.');
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
    
    // Engine selection
    document.querySelectorAll('input[name="ocrEngine"]').forEach(radio => {
        radio.addEventListener('change', handleEngineChange);
    });
    
    // Preprocessing selection
    document.querySelectorAll('input[name="preprocessing"]').forEach(radio => {
        radio.addEventListener('change', handlePreprocessingChange);
    });
    
    // Model selection for PaddleOCR
    document.getElementById('detectionModel').addEventListener('change', handleModelChange);
    document.getElementById('recognitionModel').addEventListener('change', handleModelChange);
    document.getElementById('dictionary').addEventListener('change', handleModelChange);
}

// Handle engine change
async function handleEngineChange(event) {
    currentEngine = event.target.value;
    
    // Update current OCR engine based on both engine and preprocessing selection
    if (currentEngine === 'paddle') {
        currentOCREngine = currentPreprocessing === 'improved' ? ppOCRImprovedEngine : ppOCREngine;
    } else {
        currentOCREngine = tesseractOCREngine;
    }
    
    // Show/hide paddle options
    const paddleOptions = document.getElementById('paddleOptions');
    paddleOptions.style.display = currentEngine === 'paddle' ? 'block' : 'none';
    
    showStatus(`Switched to ${currentEngine === 'paddle' ? 'PaddleOCR' : 'Tesseract.js'}`, 'info');
}

// Handle preprocessing change
async function handlePreprocessingChange(event) {
    currentPreprocessing = event.target.value;
    
    // Only update if PaddleOCR is selected
    if (currentEngine === 'paddle') {
        currentOCREngine = currentPreprocessing === 'improved' ? ppOCRImprovedEngine : ppOCREngine;
        
        // If using standard preprocessing, we need to update model config
        if (currentPreprocessing === 'standard') {
            const detectionModel = document.getElementById('detectionModel').value;
            const recognitionModel = document.getElementById('recognitionModel').value;
            const dictionary = document.getElementById('dictionary').value;
            
            ppOCREngine.setModelConfig({
                detection: detectionModel,
                recognition: recognitionModel,
                dictionary: dictionary
            });
        }
        
        showStatus(`Switched to ${currentPreprocessing === 'improved' ? 'Improved (PPU)' : 'Standard'} preprocessing`, 'info');
    }
}

// Handle model change for PaddleOCR
async function handleModelChange() {
    if (currentEngine !== 'paddle') return;
    
    const detectionModel = document.getElementById('detectionModel').value;
    const recognitionModel = document.getElementById('recognitionModel').value;
    const dictionary = document.getElementById('dictionary').value;
    
    // Update model configuration for both engines
    if (currentPreprocessing === 'improved') {
        ppOCRImprovedEngine.setModelConfig({
            detection: detectionModel,
            recognition: recognitionModel,
            dictionary: dictionary
        });
    } else {
        ppOCREngine.setModelConfig({
            detection: detectionModel,
            recognition: recognitionModel,
            dictionary: dictionary
        });
    }
    
    // Reinitialize with new models
    showStatus('Loading new models...', 'info');
    try {
        await currentOCREngine.initialize((progress) => {
            showStatus(progress.message, progress.status === 'ready' ? 'success' : 'info');
        });
        showStatus('Models updated successfully!', 'success');
    } catch (error) {
        console.error('Failed to load new models:', error);
        showError('Failed to load new models. Please try again.');
    }
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
    // Clean up previous file from memory
    if (currentImageBlob) {
        // Release any object URLs if they exist
        const oldPreviewSrc = previewImage.src;
        if (oldPreviewSrc && oldPreviewSrc.startsWith('blob:')) {
            URL.revokeObjectURL(oldPreviewSrc);
        }
        currentImageBlob = null;
    }
    
    // Clear previous results
    ocrResults.innerHTML = '';
    resultsSection.style.display = 'none';
    
    // Store the new file blob for processing
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
        
        previewImage.onload = () => {
            showStatus('Image loaded. Click "Extract Text" to process.', 'success');
        };
        previewImage.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            showError('Failed to load image');
        };
    }
}

// Process image with current OCR engine
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
    let engineName = currentEngine === 'paddle' ? 'PaddleOCR' : 'Tesseract.js';
    if (currentEngine === 'paddle') {
        engineName += ` (${currentPreprocessing === 'improved' ? 'Improved PPU' : 'Standard'})`;
    }
    if (loadingText) {
        loadingText.textContent = `Processing image with ${engineName}...`;
    }
    
    try {
        console.log(`Processing image with ${engineName}...`);
        showStatus('Detecting and recognizing text...', 'info');
        
        const startTime = performance.now();
        
        // Process with current OCR engine
        const results = await currentOCREngine.process(currentImageBlob);
        
        const processingTime = performance.now() - startTime;
        console.log(`Processing completed in ${processingTime.toFixed(2)}ms`);
        console.log('OCR Results:', results);
        
        // Display results
        loadingIndicator.style.display = 'none';
        
        if (results && results.length > 0) {
            displayResults(results, processingTime, engineName);
            showStatus(`Text extraction complete! Found ${results.length} text regions.`, 'success');
        } else {
            displayResults([], processingTime, engineName);
            showStatus('No text found in the image', 'warning');
        }
        
    } catch (error) {
        console.error('OCR processing error:', error);
        loadingIndicator.style.display = 'none';
        showError('Failed to process image: ' + error.message);
    }
}

// Display OCR results
function displayResults(results, processingTime, engineName = 'PaddleOCR') {
    // Check if results is from PDF (array of page results)
    const isPDF = Array.isArray(results) && results[0]?.page !== undefined;
    
    // Check if it's PaddleOCR with bounding boxes
    const isPaddleWithBoxes = currentEngine === 'paddle' && results.length > 0 && results[0].box;
    
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
                            <li data-index="${index}">
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
                <p><strong>Engine:</strong> ${engineName}</p>
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
    } else if (isPaddleWithBoxes) {
        // Enhanced display for PaddleOCR with visual bounding boxes
        displayPaddleOCRResults(results, processingTime, engineName);
    } else {
        // Handle standard image results
        const allText = results.map(r => r.text).join('\n');
        
        ocrResults.innerHTML = `
            <div class="ocr-stats">
                <p><strong>Processing Time:</strong> ${(processingTime / 1000).toFixed(2)}s</p>
                <p><strong>Text Regions Found:</strong> ${results.length}</p>
                <p><strong>Engine:</strong> ${engineName}</p>
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

// Enhanced display function for PaddleOCR results
function displayPaddleOCRResults(results, processingTime, engineName) {
    const allText = results.map(r => r.text).join('\n');
    
    // Group results by vertical position (text lines)
    const groupedResults = groupResultsByLine(results);
    
    // Create the enhanced display
    ocrResults.innerHTML = `
        <div class="ocr-stats">
            <p><strong>Processing Time:</strong> ${(processingTime / 1000).toFixed(2)}s</p>
            <p><strong>Text Regions Found:</strong> ${results.length}</p>
            <p><strong>Engine:</strong> ${engineName}</p>
            <p><strong>Average Confidence:</strong> ${calculateAverageConfidence(results)}%</p>
        </div>
        
        <div class="paddle-results-container">
            <div class="result-tabs">
                <button class="result-tab active" onclick="showResultTab('visual')">Visual Results</button>
                <button class="result-tab" onclick="showResultTab('text')">Text Only</button>
                <button class="result-tab" onclick="showResultTab('grouped')">Grouped by Line</button>
            </div>
            
            <div id="visualResults" class="tab-content active">
                <div class="result-image-container">
                    <img id="resultImage" src="${previewImage.src}" alt="OCR Result">
                    <div class="bounding-box-overlay" id="boundingBoxOverlay"></div>
                </div>
                <div class="detection-results">
                    <h3>Detected Text Regions:</h3>
                    <ul class="detection-list" id="visualDetectionList">
                        ${results.map((result, index) => {
                            const confidenceClass = getConfidenceClass(result.confidence);
                            return `
                                <li data-index="${index}" onmouseover="highlightBox(${index})" onmouseout="unhighlightBox(${index})" onclick="selectBox(${index})">
                                    <span class="detection-index">${index + 1}.</span>
                                    <span class="detection-text">${escapeHtml(result.text)}</span>
                                    <span class="detection-confidence ${confidenceClass}">${(result.confidence * 100).toFixed(1)}%</span>
                                </li>
                            `;
                        }).join('')}
                    </ul>
                </div>
            </div>
            
            <div id="textResults" class="tab-content grouped-results">
                <div class="text-result">
                    <h3>Extracted Text:</h3>
                    <div class="text-content" id="extractedText">${escapeHtml(allText || 'No text detected')}</div>
                </div>
            </div>
            
            <div id="groupedResults" class="tab-content grouped-results">
                <h3>Text Grouped by Line:</h3>
                ${groupedResults.map((group, groupIndex) => `
                    <div class="text-region-group">
                        <div class="region-header">
                            <span class="region-title">Line ${groupIndex + 1}</span>
                            <div class="region-confidence">
                                <div class="confidence-bar">
                                    <div class="confidence-fill" style="width: ${group.avgConfidence}%"></div>
                                </div>
                                <span class="confidence-text">${group.avgConfidence.toFixed(1)}%</span>
                            </div>
                        </div>
                        <p>${escapeHtml(group.text)}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // Draw bounding boxes after DOM is updated
    setTimeout(() => drawBoundingBoxes(results), 100);
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
    // Clean up memory
    if (currentImageBlob) {
        // Release object URLs
        const previewSrc = previewImage.src;
        if (previewSrc && previewSrc.startsWith('blob:')) {
            URL.revokeObjectURL(previewSrc);
        }
        currentImageBlob = null;
    }
    
    // Reset UI
    fileInput.value = '';
    previewSection.style.display = 'none';
    resultsSection.style.display = 'none';
    ocrResults.innerHTML = '';
    previewImage.src = '';
    
    // Reset preview container for PDFs
    const previewContainer = previewImage.parentElement;
    previewContainer.innerHTML = '<img id="previewImage" alt="Preview">';
    // Re-cache the image element reference
    window.previewImage = document.getElementById('previewImage');
    
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

// Helper functions for enhanced PaddleOCR display
function calculateAverageConfidence(results) {
    if (results.length === 0) return 0;
    const sum = results.reduce((acc, r) => acc + r.confidence, 0);
    return (sum / results.length * 100).toFixed(1);
}

function getConfidenceClass(confidence) {
    const percent = confidence * 100;
    if (percent >= 80) return 'high-confidence';
    if (percent >= 60) return 'medium-confidence';
    return 'low-confidence';
}

function groupResultsByLine(results) {
    if (results.length === 0) return [];
    
    // Sort by Y position
    const sorted = [...results].sort((a, b) => {
        const aY = Math.min(...a.box.map(p => p[1]));
        const bY = Math.min(...b.box.map(p => p[1]));
        return aY - bY;
    });
    
    const groups = [];
    let currentGroup = [sorted[0]];
    
    for (let i = 1; i < sorted.length; i++) {
        const prevY = Math.min(...sorted[i-1].box.map(p => p[1]));
        const currY = Math.min(...sorted[i].box.map(p => p[1]));
        
        // If vertical difference is small, they're on the same line
        if (Math.abs(currY - prevY) < 20) {
            currentGroup.push(sorted[i]);
        } else {
            groups.push(currentGroup);
            currentGroup = [sorted[i]];
        }
    }
    
    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }
    
    // Process each group
    return groups.map(group => {
        // Sort by X position within group
        group.sort((a, b) => {
            const aX = Math.min(...a.box.map(p => p[0]));
            const bX = Math.min(...b.box.map(p => p[0]));
            return aX - bX;
        });
        
        const text = group.map(r => r.text).join(' ');
        const avgConfidence = group.reduce((sum, r) => sum + r.confidence, 0) / group.length * 100;
        
        return { text, avgConfidence, items: group };
    });
}

function drawBoundingBoxes(results) {
    const overlay = document.getElementById('boundingBoxOverlay');
    const image = document.getElementById('resultImage');
    
    if (!overlay || !image) return;
    
    // Clear existing boxes
    overlay.innerHTML = '';
    
    // Wait for image to load
    if (!image.complete) {
        image.onload = () => drawBoundingBoxes(results);
        return;
    }
    
    const rect = image.getBoundingClientRect();
    const scaleX = image.naturalWidth / rect.width;
    const scaleY = image.naturalHeight / rect.height;
    
    results.forEach((result, index) => {
        const box = result.box;
        const minX = Math.min(...box.map(p => p[0])) / scaleX;
        const minY = Math.min(...box.map(p => p[1])) / scaleY;
        const maxX = Math.max(...box.map(p => p[0])) / scaleX;
        const maxY = Math.max(...box.map(p => p[1])) / scaleY;
        
        const boxElement = document.createElement('div');
        boxElement.className = `text-box ${getConfidenceClass(result.confidence)}`;
        boxElement.dataset.index = index;
        boxElement.style.left = `${minX}px`;
        boxElement.style.top = `${minY}px`;
        boxElement.style.width = `${maxX - minX}px`;
        boxElement.style.height = `${maxY - minY}px`;
        
        // Add label
        const label = document.createElement('div');
        label.className = 'text-box-label';
        label.textContent = `${index + 1}: ${(result.confidence * 100).toFixed(0)}%`;
        boxElement.appendChild(label);
        
        // Add click handler
        boxElement.onclick = () => selectBox(index);
        
        overlay.appendChild(boxElement);
    });
}

// Tab switching functionality
window.showResultTab = function(tabName) {
    // Update tab buttons
    document.querySelectorAll('.result-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    if (tabName === 'visual') {
        document.getElementById('visualResults').classList.add('active');
    } else if (tabName === 'text') {
        document.getElementById('textResults').classList.add('active');
    } else if (tabName === 'grouped') {
        document.getElementById('groupedResults').classList.add('active');
    }
};

// Box interaction functions
window.highlightBox = function(index) {
    const box = document.querySelector(`.text-box[data-index="${index}"]`);
    const listItem = document.querySelector(`#visualDetectionList li[data-index="${index}"]`);
    
    if (box) box.classList.add('hover');
    if (listItem) listItem.classList.add('highlighted');
};

window.unhighlightBox = function(index) {
    const box = document.querySelector(`.text-box[data-index="${index}"]`);
    const listItem = document.querySelector(`#visualDetectionList li[data-index="${index}"]`);
    
    if (box) box.classList.remove('hover');
    if (listItem) listItem.classList.remove('highlighted');
};

window.selectBox = function(index) {
    // Remove previous selection
    document.querySelectorAll('.text-box.selected').forEach(box => {
        box.classList.remove('selected');
    });
    
    // Add new selection
    const box = document.querySelector(`.text-box[data-index="${index}"]`);
    if (box) {
        box.classList.add('selected');
        
        // Scroll list item into view
        const listItem = document.querySelector(`#visualDetectionList li[data-index="${index}"]`);
        if (listItem) {
            listItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Highlight temporarily
            listItem.classList.add('highlighted');
            setTimeout(() => listItem.classList.remove('highlighted'), 2000);
        }
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);