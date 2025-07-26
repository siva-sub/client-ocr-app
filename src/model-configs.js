/**
 * Model configurations for different OCR accuracy/speed trade-offs
 */

export const MODEL_CONFIGS = {
  // Fast mobile models from PPU-Paddle-OCR
  'ppu-mobile': {
    name: 'PPU Mobile (Fast)',
    description: 'Fastest processing, suitable for real-time on mobile devices',
    det: {
      url: './models/PP-OCRv5_mobile_det_infer.onnx',
      inputName: 'x',
      outputName: 'sigmoid_0.tmp_0',
      shape: [1, 3, 960, 960], // dynamic height/width
      mean: [0.485, 0.456, 0.406],
      std: [0.229, 0.224, 0.225],
      limitSideLen: 960,
      limitType: 'max'
    },
    rec: {
      url: './models/en_PP-OCRv4_mobile_rec_infer.onnx',
      inputName: 'x',
      outputName: 'softmax_0.tmp_0',
      shape: [1, 3, 48, 320],
      mean: [0.5, 0.5, 0.5],
      std: [0.5, 0.5, 0.5],
      keepRatio: true
    },
    cls: null, // No angle classification in PPU mobile
    dict: {
      url: './models/en_dict.txt',
      lang: 'en'
    },
    postProcess: {
      thresh: 0.3,
      boxThresh: 0.6,
      unclipRatio: 1.5,
      maxCandidates: 1000
    }
  },

  // Accurate models from OnnxOCR - PP-OCRv5
  'onnx-v5-accurate': {
    name: 'OnnxOCR v5 (Accurate)',
    description: 'Best accuracy, supports multiple languages and angle classification',
    det: {
      url: './models/ppocrv5/det/det.onnx',
      inputName: 'x',
      outputName: 'sigmoid_0.tmp_0',
      shape: [1, 3, 960, 960],
      mean: [0.485, 0.456, 0.406],
      std: [0.229, 0.224, 0.225],
      limitSideLen: 960,
      limitType: 'max'
    },
    rec: {
      url: './models/ppocrv5/rec/rec.onnx',
      inputName: 'x',
      outputName: 'softmax_0.tmp_0',
      shape: [1, 3, 48, 320],
      mean: [0.5, 0.5, 0.5],
      std: [0.5, 0.5, 0.5],
      keepRatio: true
    },
    cls: {
      url: './models/ppocrv5/cls/cls.onnx',
      inputName: 'x',
      outputName: 'softmax_0.tmp_0',
      shape: [1, 3, 48, 192],
      mean: [0.5, 0.5, 0.5],
      std: [0.5, 0.5, 0.5],
      labelList: ['0', '180']
    },
    dict: {
      url: './models/ppocrv5/ppocrv5_dict.txt',
      lang: 'multi'
    },
    postProcess: {
      thresh: 0.3,
      boxThresh: 0.7,
      unclipRatio: 2.0,
      maxCandidates: 1000
    }
  },

  // Balanced models from OnnxOCR - PP-OCRv4
  'onnx-v4-balanced': {
    name: 'OnnxOCR v4 (Balanced)',
    description: 'Good balance of speed and accuracy',
    det: {
      url: './models/ppocrv4/det/det.onnx',
      inputName: 'x',
      outputName: 'sigmoid_0.tmp_0',
      shape: [1, 3, 640, 640],
      mean: [0.485, 0.456, 0.406],
      std: [0.229, 0.224, 0.225],
      limitSideLen: 736,
      limitType: 'max'
    },
    rec: {
      url: './models/ppocrv4/rec/rec.onnx',
      inputName: 'x',
      outputName: 'softmax_0.tmp_0',
      shape: [1, 3, 48, 320],
      mean: [0.5, 0.5, 0.5],
      std: [0.5, 0.5, 0.5],
      keepRatio: true
    },
    cls: {
      url: './models/ppocrv4/cls/cls.onnx',
      inputName: 'x',
      outputName: 'softmax_0.tmp_0',
      shape: [1, 3, 48, 192],
      mean: [0.5, 0.5, 0.5],
      std: [0.5, 0.5, 0.5],
      labelList: ['0', '180']
    },
    dict: {
      url: './models/ppocr_keys_v1.txt',
      lang: 'ch_sim'
    },
    postProcess: {
      thresh: 0.3,
      boxThresh: 0.6,
      unclipRatio: 1.5,
      maxCandidates: 1000
    }
  },

  // Server models from OnnxOCR - PP-OCRv2 Server
  'onnx-v2-server': {
    name: 'OnnxOCR v2 Server (Heavy)',
    description: 'Server-grade accuracy, larger model size',
    det: {
      url: './models/ch_ppocr_server_v2.0/det/det.onnx',
      inputName: 'x',
      outputName: 'sigmoid_0.tmp_0',
      shape: [1, 3, 960, 960],
      mean: [0.485, 0.456, 0.406],
      std: [0.229, 0.224, 0.225],
      limitSideLen: 960,
      limitType: 'max'
    },
    rec: null, // Server v2.0 rec model not included in OnnxOCR
    cls: {
      url: './models/ch_ppocr_server_v2.0/cls/cls.onnx',
      inputName: 'x',
      outputName: 'softmax_0.tmp_0',
      shape: [1, 3, 48, 192],
      mean: [0.5, 0.5, 0.5],
      std: [0.5, 0.5, 0.5],
      labelList: ['0', '180']
    },
    dict: {
      url: './models/ch_ppocr_server_v2.0/ppocr_keys_v1.txt',
      lang: 'ch_sim'
    },
    postProcess: {
      thresh: 0.3,
      boxThresh: 0.7,
      unclipRatio: 2.0,
      maxCandidates: 1000
    }
  }
};

// Processing workflow configurations based on model type
export const WORKFLOW_CONFIGS = {
  'ppu-mobile': {
    steps: ['preprocess', 'detect', 'crop', 'recognize', 'postprocess'],
    enableAngleCls: false,
    enableDeskew: false,
    batchSize: 6
  },
  'onnx-v5-accurate': {
    steps: ['preprocess', 'detect', 'crop', 'classify', 'recognize', 'postprocess'],
    enableAngleCls: true,
    enableDeskew: true,
    batchSize: 4
  },
  'onnx-v4-balanced': {
    steps: ['preprocess', 'detect', 'crop', 'classify', 'recognize', 'postprocess'],
    enableAngleCls: true,
    enableDeskew: false,
    batchSize: 6
  },
  'onnx-v2-server': {
    steps: ['preprocess', 'detect', 'crop', 'classify', 'postprocess'],
    enableAngleCls: true,
    enableDeskew: true,
    batchSize: 2
  }
};

// Default model selection based on device capabilities
export function getDefaultModel() {
  // Check if mobile device
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  // Check available memory
  const memory = navigator.deviceMemory || 4; // GB
  
  // Check connection speed
  const connection = navigator.connection?.effectiveType || '4g';
  
  if (isMobile || memory < 4) {
    return 'ppu-mobile';
  } else if (connection === 'slow-2g' || connection === '2g') {
    return 'onnx-v4-balanced';
  } else {
    return 'onnx-v5-accurate';
  }
}

// Model size information for UI display
export const MODEL_SIZES = {
  'ppu-mobile': {
    det: '4.8MB',
    rec: '7.7MB',
    cls: null,
    total: '12.5MB'
  },
  'onnx-v5-accurate': {
    det: '4.7MB',
    rec: '16.5MB',
    cls: '583KB',
    total: '21.8MB'
  },
  'onnx-v4-balanced': {
    det: '4.7MB',
    rec: '10.8MB',
    cls: '583KB',
    total: '16.1MB'
  },
  'onnx-v2-server': {
    det: '48.9MB',
    rec: 'N/A',
    cls: '583KB',
    total: '49.5MB'
  }
};