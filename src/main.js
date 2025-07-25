import { pipeline, env } from '@huggingface/transformers';
import './style.css';

// Configure environment for client-side processing
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.remoteURL = 'https://huggingface.co/';

// Global variables
let imageToTextPipeline = null;
let currentImageData = null;

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
    console.log('Initializing OCR pipeline...');
    
    try {
        // Create image-to-text pipeline
        imageToTextPipeline = await pipeline('image-to-text', 'Xenova/trocr-base-handwritten');
        console.log('OCR pipeline ready!');
        
        setupEventListeners();
    } catch (error) {
        console.error('Failed to initialize pipeline:', error);
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
function loadImage(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        currentImageData = e.target.result;
        previewImage.src = currentImageData;
        previewSection.style.display = 'block';
        resultsSection.style.display = 'none';
    };
    
    reader.readAsDataURL(file);
}

// Process image with OCR
async function processImage() {
    if (!currentImageData || !imageToTextPipeline) {
        showError('Please upload an image first');
        return;
    }
    
    resultsSection.style.display = 'block';
    loadingIndicator.style.display = 'flex';
    ocrResults.innerHTML = '';
    
    try {
        console.log('Processing image...');
        
        // Run OCR
        const result = await imageToTextPipeline(currentImageData);
        
        console.log('OCR result:', result);
        
        // Display results
        loadingIndicator.style.display = 'none';
        
        if (result && result.length > 0) {
            const text = result[0].generated_text || 'No text detected';
            displayResults(text);
        } else {
            displayResults('No text detected in the image');
        }
        
    } catch (error) {
        console.error('OCR processing error:', error);
        loadingIndicator.style.display = 'none';
        showError('Failed to process image: ' + error.message);
    }
}

// Display OCR results
function displayResults(text) {
    ocrResults.innerHTML = `
        <div class="text-result">
            <h3>Extracted Text:</h3>
            <div class="text-content" id="extractedText">${escapeHtml(text)}</div>
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
        a.download = `ocr-result-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Reset the app
function reset() {
    fileInput.value = '';
    currentImageData = null;
    previewSection.style.display = 'none';
    resultsSection.style.display = 'none';
    ocrResults.innerHTML = '';
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);