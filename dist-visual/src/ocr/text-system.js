// Text system that orchestrates DET, CLS, and REC
import cv from '@techstark/opencv-js';
import { TextDetector } from './predict-det.js';
import { TextClassifier } from './predict-cls.js';
import { TextRecognizer } from './predict-rec.js';
import { getRotateCropImage, sortedBoxes } from './utils.js';

export class TextSystem {
  constructor(args = {}) {
    this.args = args;
    this.textDetector = new TextDetector(args);
    this.textRecognizer = new TextRecognizer(args);
    this.useAngleCls = args.useAngleCls !== false;
    this.dropScore = args.dropScore || 0.5;
    
    if (this.useAngleCls) {
      this.textClassifier = new TextClassifier(args);
    }
  }

  async initialize(progressCallback = null) {
    const steps = this.useAngleCls ? 3 : 2;
    let currentStep = 0;

    // Initialize detection model
    if (progressCallback) {
      progressCallback({
        stage: 'detection',
        progress: (currentStep / steps) * 100,
        message: 'Loading detection model...'
      });
    }
    await this.textDetector.initialize();
    currentStep++;

    // Initialize classification model if needed
    if (this.useAngleCls) {
      if (progressCallback) {
        progressCallback({
          stage: 'classification',
          progress: (currentStep / steps) * 100,
          message: 'Loading classification model...'
        });
      }
      await this.textClassifier.initialize();
      currentStep++;
    }

    // Initialize recognition model
    if (progressCallback) {
      progressCallback({
        stage: 'recognition',
        progress: (currentStep / steps) * 100,
        message: 'Loading recognition model...'
      });
    }
    await this.textRecognizer.initialize();
    
    if (progressCallback) {
      progressCallback({
        stage: 'complete',
        progress: 100,
        message: 'Models loaded successfully'
      });
    }
  }

  async detect(img) {
    // Run text detection
    const dtBoxes = await this.textDetector.predict(img);
    
    if (!dtBoxes || dtBoxes.length === 0) {
      return [];
    }

    // Sort boxes from top to bottom, left to right
    const sortedDtBoxes = sortedBoxes(dtBoxes);
    
    // Crop text regions
    const imgCropList = [];
    for (const box of sortedDtBoxes) {
      const imgCrop = getRotateCropImage(img, box);
      imgCropList.push(imgCrop);
    }

    // Apply angle classification if enabled
    let processedImgs = imgCropList;
    let angleList = null;
    
    if (this.useAngleCls && imgCropList.length > 0) {
      [processedImgs, angleList] = await this.textClassifier.predict(imgCropList);
      
      // Clean up rotated images
      imgCropList.forEach((img, idx) => {
        if (processedImgs[idx] !== img) {
          img.delete();
        }
      });
    }

    // Run text recognition
    const recRes = await this.textRecognizer.predict(processedImgs);

    // Clean up cropped images
    processedImgs.forEach(img => img.delete());

    // Filter results by score
    const filterBoxes = [];
    const filterRecRes = [];
    
    for (let i = 0; i < sortedDtBoxes.length; i++) {
      const [text, score] = recRes[i];
      if (score >= this.dropScore) {
        filterBoxes.push(sortedDtBoxes[i]);
        filterRecRes.push(recRes[i]);
      }
    }

    return { boxes: filterBoxes, texts: filterRecRes, angles: angleList };
  }

  async recognize(img, det = true, rec = true, cls = true) {
    if (det && rec) {
      // Full pipeline
      const results = await this.detect(img);
      return results.boxes.map((box, idx) => ({
        box: box,
        text: results.texts[idx][0],
        score: results.texts[idx][1],
        angle: results.angles ? results.angles[idx] : null
      }));
    } else if (det && !rec) {
      // Detection only
      const dtBoxes = await this.textDetector.predict(img);
      return dtBoxes.map(box => ({ box }));
    } else if (!det && rec) {
      // Recognition only (single image or list)
      const imgList = Array.isArray(img) ? img : [img];
      
      // Apply angle classification if needed
      let processedImgs = imgList;
      let angleList = null;
      
      if (this.useAngleCls && cls) {
        [processedImgs, angleList] = await this.textClassifier.predict(imgList);
      }
      
      // Run recognition
      const recRes = await this.textRecognizer.predict(processedImgs);
      
      // Clean up if images were rotated
      if (processedImgs !== imgList) {
        imgList.forEach((img, idx) => {
          if (processedImgs[idx] !== img && img.delete) {
            img.delete();
          }
        });
      }
      
      return recRes.map((res, idx) => ({
        text: res[0],
        score: res[1],
        angle: angleList ? angleList[idx] : null
      }));
    }
    
    return [];
  }
}