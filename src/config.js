/**
 * Centralized configuration for OCR models and application settings
 */

import { getAssetUrl, getAvailableThreads } from './utils.js';

/**
 * OCR Engine Types
 */
export const ENGINE_TYPES = {
  TESSERACT: 'tesseract',
  PADDLE_OCR: 'paddleocr',
  PPOCR_V5: 'ppocr-v5'
};

/**
 * Centralized configuration for all available OCR models.
 * Each model includes paths to all required files and metadata.
 */
export const OCR_MODELS = {
  'PP-OCRv5': {
    id: 'PP-OCRv5',
    name: 'PP-OCRv5 (Latest)',
    description: 'Latest and most accurate model with best performance',
    type: 'server',
    engine: ENGINE_TYPES.PPOCR_V5,
    paths: {
      det: getAssetUrl('models/PP-OCRv5/det/det.onnx'),
      cls: getAssetUrl('models/PP-OCRv5/cls/cls.onnx'),
      rec: getAssetUrl('models/PP-OCRv5/rec/rec.onnx'),
      dict: getAssetUrl('models/PP-OCRv5/ppocrv5_dict.txt')
    },
    settings: {
      det_limit_side_len: 960,
      det_db_thresh: 0.3,
      det_db_box_thresh: 0.6,
      det_db_unclip_ratio: 1.7,
      cls_thresh: 0.9,
      rec_image_shape: [3, 48, 320],
      cls_image_shape: [3, 48, 192]
    }
  },
  'PP-OCRv4': {
    id: 'PP-OCRv4',
    name: 'PP-OCRv4',
    description: 'Previous generation model, stable and reliable',
    type: 'server',
    engine: ENGINE_TYPES.PPOCR_V5,
    paths: {
      det: getAssetUrl('models/PP-OCRv4/det/det.onnx'),
      cls: getAssetUrl('models/PP-OCRv4/cls/cls.onnx'),
      rec: getAssetUrl('models/PP-OCRv4/rec/rec.onnx'),
      dict: getAssetUrl('models/PP-OCRv4/ppocr_keys_v1.txt')
    },
    settings: {
      det_limit_side_len: 960,
      det_db_thresh: 0.3,
      det_db_box_thresh: 0.6,
      det_db_unclip_ratio: 1.7,
      cls_thresh: 0.9,
      rec_image_shape: [3, 48, 320],
      cls_image_shape: [3, 48, 192]
    }
  },
  'ch_ppocr_server_v2.0': {
    id: 'ch_ppocr_server_v2.0',
    name: 'Server v2.0',
    description: 'Chinese server model v2.0',
    type: 'server',
    engine: ENGINE_TYPES.PPOCR_V5,
    paths: {
      det: getAssetUrl('models/ch_ppocr_server_v2.0/det/det.onnx'),
      cls: getAssetUrl('models/ch_ppocr_server_v2.0/cls/cls.onnx'),
      rec: getAssetUrl('models/PP-OCRv4/rec/rec.onnx'), // Fallback to v4 rec
      dict: getAssetUrl('models/ch_ppocr_server_v2.0/ppocr_keys_v1.txt')
    },
    settings: {
      det_limit_side_len: 960,
      det_db_thresh: 0.3,
      det_db_box_thresh: 0.5,
      det_db_unclip_ratio: 1.6,
      cls_thresh: 0.9,
      rec_image_shape: [3, 32, 320],
      cls_image_shape: [3, 48, 192]
    }
  },
  'PP-OCRv5_mobile': {
    id: 'PP-OCRv5_mobile',
    name: 'PP-OCRv5 Mobile',
    description: 'Lightweight model optimized for mobile/web',
    type: 'mobile',
    engine: ENGINE_TYPES.PPOCR_V5,
    paths: {
      det: getAssetUrl('models/PP-OCRv5_mobile_det_infer.onnx'),
      cls: getAssetUrl('models/PP-OCRv5/cls/cls.onnx'),
      rec: getAssetUrl('models/PP-OCRv5_mobile_rec_infer.onnx'),
      dict: getAssetUrl('models/ppocrv5_dict.txt')
    },
    settings: {
      det_limit_side_len: 640,
      det_db_thresh: 0.3,
      det_db_box_thresh: 0.5,
      det_db_unclip_ratio: 1.5,
      cls_thresh: 0.9,
      rec_image_shape: [3, 48, 320],
      cls_image_shape: [3, 48, 192]
    }
  },
  'PP-OCRv4_mobile': {
    id: 'PP-OCRv4_mobile',
    name: 'PP-OCRv4 Mobile',
    description: 'Lightweight v4 model for mobile/web',
    type: 'mobile',
    engine: ENGINE_TYPES.PPOCR_V5,
    paths: {
      det: getAssetUrl('models/PP-OCRv4/det/det.onnx'),
      cls: getAssetUrl('models/PP-OCRv4/cls/cls.onnx'),
      rec: getAssetUrl('models/en_PP-OCRv4_mobile_rec_infer.onnx'),
      dict: getAssetUrl('models/en_dict.txt')
    },
    settings: {
      det_limit_side_len: 640,
      det_db_thresh: 0.3,
      det_db_box_thresh: 0.5,
      det_db_unclip_ratio: 1.5,
      cls_thresh: 0.9,
      rec_image_shape: [3, 48, 320],
      cls_image_shape: [3, 48, 192]
    }
  }
};

/**
 * Preset configurations for different use cases
 */
export const PRESET_CONFIGS = {
  balanced: {
    name: 'Balanced (Default)',
    description: 'Good balance between speed and accuracy',
    modelId: 'PP-OCRv5',
    settings: {
      useAngleCls: true,
      useCache: true,
      batchSize: 5
    }
  },
  high_accuracy: {
    name: 'High Accuracy',
    description: 'Maximum accuracy, slower processing',
    modelId: 'PP-OCRv5',
    settings: {
      useAngleCls: true,
      useCache: true,
      batchSize: 3,
      det_db_thresh: 0.2,
      det_db_box_thresh: 0.5
    }
  },
  fast_processing: {
    name: 'Fast Processing',
    description: 'Optimized for speed',
    modelId: 'PP-OCRv5_mobile',
    settings: {
      useAngleCls: false,
      useCache: true,
      batchSize: 10,
      det_limit_side_len: 480
    }
  },
  handwritten: {
    name: 'Handwritten Text',
    description: 'Optimized for handwritten content',
    modelId: 'PP-OCRv5',
    settings: {
      useAngleCls: true,
      useCache: true,
      batchSize: 3,
      det_db_thresh: 0.2,
      det_db_unclip_ratio: 2.0
    }
  },
  low_quality: {
    name: 'Low Quality Images',
    description: 'For poor quality or low resolution images',
    modelId: 'PP-OCRv5',
    settings: {
      useAngleCls: true,
      useCache: true,
      batchSize: 3,
      det_db_thresh: 0.2,
      det_db_box_thresh: 0.4,
      det_db_unclip_ratio: 2.2
    }
  }
};

/**
 * ONNX Runtime Web configuration
 */
export const ORT_CONFIG = {
  wasmPaths: getAssetUrl('assets/'),
  numThreads: getAvailableThreads(),
  graphOptimizationLevel: 'all',
  executionMode: 'sequential',
  enableCpuMemArena: true,
  enableMemPattern: true,
  logLevel: 'warning',
  providers: ['wasm'] // Can be extended with 'webgl', 'webgpu' when available
};

/**
 * Tesseract.js configuration
 */
export const TESSERACT_CONFIG = {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
  langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd.wasm.js',
  defaultLang: 'eng',
  logger: m => console.log('[Tesseract]', m)
};

/**
 * Application settings
 */
export const APP_CONFIG = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  supportedFormats: ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'application/pdf'],
  cacheExpiration: 24 * 60 * 60 * 1000, // 24 hours
  maxCacheSize: 50 * 1024 * 1024, // 50MB
  defaultEngine: ENGINE_TYPES.PADDLE_OCR,
  defaultModel: 'PP-OCRv5',
  defaultPreset: 'balanced'
};

/**
 * Get model configuration by ID
 * @param {string} modelId - Model identifier
 * @returns {Object|null} Model configuration or null if not found
 */
export function getModelConfig(modelId) {
  return OCR_MODELS[modelId] || null;
}

/**
 * Get preset configuration by ID
 * @param {string} presetId - Preset identifier
 * @returns {Object|null} Preset configuration or null if not found
 */
export function getPresetConfig(presetId) {
  return PRESET_CONFIGS[presetId] || null;
}

/**
 * Get all available models for a specific engine type
 * @param {string} engineType - Engine type from ENGINE_TYPES
 * @returns {Array} Array of model configurations
 */
export function getModelsForEngine(engineType) {
  return Object.values(OCR_MODELS).filter(model => model.engine === engineType);
}

/**
 * Merge preset settings with model settings
 * @param {string} modelId - Model identifier
 * @param {string} presetId - Preset identifier
 * @returns {Object} Merged configuration
 */
export function getMergedConfig(modelId, presetId) {
  const model = getModelConfig(modelId);
  const preset = getPresetConfig(presetId);
  
  if (!model) {
    throw new Error(`Model ${modelId} not found`);
  }
  
  const settings = {
    ...model.settings,
    ...(preset?.settings || {})
  };
  
  return {
    ...model,
    settings,
    presetId
  };
}