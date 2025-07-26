/**
 * Utility functions for the OCR application
 * Centralizes path handling and common utilities
 */

/**
 * The name of the repository, used for GitHub Pages deployment.
 * This is the only place you should need to change the repo name.
 */
const REPO_NAME = 'client-ocr-app';

/**
 * Determines the base path for assets.
 * For local development, it's the root '/'.
 * For GitHub Pages, it's '/<repo-name>/'.
 */
const isGitHubPages = window.location.hostname.includes('github.io');
const basePath = isGitHubPages ? `/${REPO_NAME}/` : '/';

/**
 * Constructs a full, correct URL for a project asset.
 * It correctly handles local development vs. GitHub Pages deployment.
 *
 * @param {string} relativePath - The path to the asset relative to the project root
 *   (e.g., 'models/PP-OCRv5/det/det.onnx').
 * @returns {string} The absolute URL for the asset.
 */
export function getAssetUrl(relativePath) {
  // Remove leading slash if present to avoid double slashes
  const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  
  // The URL constructor robustly joins the base URL and relative path
  return new URL(cleanPath, new URL(basePath, window.location.origin)).href;
}

/**
 * Get the base path for the application
 * @returns {string} The base path with trailing slash
 */
export function getBasePath() {
  return basePath;
}

/**
 * Check if running on GitHub Pages
 * @returns {boolean} True if on GitHub Pages
 */
export function isOnGitHubPages() {
  return isGitHubPages;
}

/**
 * Format file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Create a unique ID
 * @returns {string} Unique identifier
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Debounce function to limit function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Check if the environment supports cross-origin isolation
 * @returns {boolean} True if cross-origin isolated
 */
export function isCrossOriginIsolated() {
  return 'crossOriginIsolated' in self && self.crossOriginIsolated;
}

/**
 * Get the number of CPU threads available
 * @returns {number} Number of threads (1 if not cross-origin isolated)
 */
export function getAvailableThreads() {
  if (!isCrossOriginIsolated()) {
    return 1;
  }
  return navigator.hardwareConcurrency || 4;
}