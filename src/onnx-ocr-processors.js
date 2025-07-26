/**
 * OnnxOCR-based preprocessing and postprocessing functions
 * Exact JavaScript implementation of OnnxOCR's Python preprocessing/postprocessing
 */

import cv from '@techstark/opencv-js';

// Wait for OpenCV to be ready
let cvReady = false;
if (typeof cv !== 'undefined') {
    cv['onRuntimeInitialized'] = () => {
        cvReady = true;
    };
}

/**
 * NormalizeImage - normalize image by subtracting mean and dividing by std
 */
export class NormalizeImage {
    constructor(options = {}) {
        this.scale = options.scale !== undefined ? options.scale : 1.0 / 255.0;
        this.mean = options.mean || [0.485, 0.456, 0.406];
        this.std = options.std || [0.229, 0.224, 0.225];
        this.order = options.order || 'chw';
    }

    process(img) {
        // Convert to float32 and scale
        const normalized = new cv.Mat();
        img.convertTo(normalized, cv.CV_32F, this.scale);

        // Subtract mean and divide by std
        const channels = new cv.MatVector();
        cv.split(normalized, channels);

        for (let i = 0; i < 3; i++) {
            const channel = channels.get(i);
            cv.subtract(channel, new cv.Scalar(this.mean[i]), channel);
            cv.divide(channel, new cv.Scalar(this.std[i]), channel);
        }

        cv.merge(channels, normalized);
        
        // Clean up
        channels.delete();
        
        return normalized;
    }
}

/**
 * DetResizeForTest - resize image for detection with specific constraints
 */
export class DetResizeForTest {
    constructor(options = {}) {
        this.limitSideLen = options.limit_side_len || 960;
        this.limitType = options.limit_type || 'min';
    }

    process(img) {
        const h = img.rows;
        const w = img.cols;
        
        // Resize image to a size multiple of 32
        let ratio = 1.0;
        
        if (this.limitType === 'max') {
            if (Math.max(h, w) > this.limitSideLen) {
                ratio = this.limitSideLen / Math.max(h, w);
            }
        } else if (this.limitType === 'min') {
            if (Math.min(h, w) < this.limitSideLen) {
                ratio = this.limitSideLen / Math.min(h, w);
            }
        }
        
        let resizeH = Math.round(h * ratio);
        let resizeW = Math.round(w * ratio);
        
        // Make divisible by 32
        resizeH = Math.max(Math.round(resizeH / 32) * 32, 32);
        resizeW = Math.max(Math.round(resizeW / 32) * 32, 32);
        
        const resized = new cv.Mat();
        const size = new cv.Size(resizeW, resizeH);
        cv.resize(img, resized, size, 0, 0, cv.INTER_LINEAR);
        
        return {
            image: resized,
            shape: [h, w, resizeH / h, resizeW / w]
        };
    }
}

/**
 * ClsResizeNormImg - resize and normalize image for text angle classification
 */
export class ClsResizeNormImg {
    constructor(options = {}) {
        this.imageShape = options.cls_image_shape || [3, 48, 192];
    }

    process(img) {
        const [imgC, imgH, imgW] = this.imageShape;
        const h = img.rows;
        const w = img.cols;
        const ratio = w / h;
        
        let resizedW;
        if (Math.ceil(imgH * ratio) > imgW) {
            resizedW = imgW;
        } else {
            resizedW = Math.ceil(imgH * ratio);
        }
        
        // Resize image
        const resized = new cv.Mat();
        const size = new cv.Size(resizedW, imgH);
        cv.resize(img, resized, size, 0, 0, cv.INTER_LINEAR);
        
        // Convert to float32 and normalize
        const normalized = new cv.Mat();
        resized.convertTo(normalized, cv.CV_32F, 1.0 / 255.0);
        
        // Subtract 0.5 and divide by 0.5
        cv.subtract(normalized, new cv.Scalar(0.5, 0.5, 0.5), normalized);
        cv.divide(normalized, new cv.Scalar(0.5, 0.5, 0.5), normalized);
        
        // Create padding image
        const paddingIm = new cv.Mat.zeros(imgH, imgW, cv.CV_32FC3);
        const roi = paddingIm.roi(new cv.Rect(0, 0, resizedW, imgH));
        normalized.copyTo(roi);
        
        // Clean up
        resized.delete();
        normalized.delete();
        roi.delete();
        
        return paddingIm;
    }
}

/**
 * RecResizeNormImg - resize and normalize image for text recognition
 */
export class RecResizeNormImg {
    constructor(options = {}) {
        this.imageShape = options.rec_image_shape || [3, 48, 320];
        this.recAlgorithm = options.rec_algorithm || 'SVTR_LCNet';
    }

    process(img, maxWhRatio) {
        const [imgC, imgH, imgW] = this.imageShape;
        
        let targetW = Math.round(imgH * maxWhRatio);
        if (this.recAlgorithm === 'NRTR' || this.recAlgorithm === 'ViTSTR') {
            targetW = imgW;
        } else {
            targetW = Math.min(targetW, imgW);
        }
        
        const h = img.rows;
        const w = img.cols;
        const ratio = w / h;
        
        let resizedW;
        if (Math.ceil(imgH * ratio) > targetW) {
            resizedW = targetW;
        } else {
            resizedW = Math.ceil(imgH * ratio);
        }
        
        // Resize image
        const resized = new cv.Mat();
        const size = new cv.Size(resizedW, imgH);
        cv.resize(img, resized, size, 0, 0, cv.INTER_LINEAR);
        
        // Convert to float32 and normalize
        const normalized = new cv.Mat();
        resized.convertTo(normalized, cv.CV_32F, 1.0 / 255.0);
        
        // Subtract 0.5 and divide by 0.5
        cv.subtract(normalized, new cv.Scalar(0.5, 0.5, 0.5), normalized);
        cv.divide(normalized, new cv.Scalar(0.5, 0.5, 0.5), normalized);
        
        // Create padding image
        const paddingIm = new cv.Mat.zeros(imgH, targetW, cv.CV_32FC3);
        const roi = paddingIm.roi(new cv.Rect(0, 0, resizedW, imgH));
        normalized.copyTo(roi);
        
        // Clean up
        resized.delete();
        normalized.delete();
        roi.delete();
        
        return paddingIm;
    }
}

/**
 * DBPostProcess - postprocessing for DB text detection
 */
export class DBPostProcess {
    constructor(options = {}) {
        this.thresh = options.thresh || 0.3;
        this.boxThresh = options.box_thresh || 0.6;
        this.maxCandidates = options.max_candidates || 1000;
        this.unclipRatio = options.unclip_ratio || 1.5;
        this.minSize = options.min_size || 3;
        this.scoreMode = options.score_mode || 'fast';
    }

    process(pred, shape) {
        const predMap = pred[0][0];
        const segmentation = predMap > this.thresh ? 255 : 0;
        
        // Find contours
        const bitmap = new cv.Mat(segmentation.length, segmentation[0].length, cv.CV_8UC1);
        for (let i = 0; i < segmentation.length; i++) {
            for (let j = 0; j < segmentation[i].length; j++) {
                bitmap.data[i * segmentation[i].length + j] = segmentation[i][j];
            }
        }
        
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(bitmap, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
        
        const boxes = [];
        const scores = [];
        
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const points = this.getMinAreaRect(contour);
            
            if (points) {
                const score = this.boxScoreFast(predMap, points);
                if (score >= this.boxThresh) {
                    const box = this.unclip(points, this.unclipRatio);
                    if (box) {
                        boxes.push(box);
                        scores.push(score);
                    }
                }
            }
        }
        
        // Clean up
        bitmap.delete();
        contours.delete();
        hierarchy.delete();
        
        return { boxes, scores };
    }

    getMinAreaRect(contour) {
        const rect = cv.minAreaRect(contour);
        const points = cv.boxPoints(rect);
        return points;
    }

    boxScoreFast(bitmap, box) {
        const h = bitmap.length;
        const w = bitmap[0].length;
        
        const boxArr = [];
        for (let i = 0; i < box.length; i++) {
            boxArr.push([box[i][0], box[i][1]]);
        }
        
        const xmin = Math.max(0, Math.floor(Math.min(...boxArr.map(p => p[0]))));
        const xmax = Math.min(w - 1, Math.ceil(Math.max(...boxArr.map(p => p[0]))));
        const ymin = Math.max(0, Math.floor(Math.min(...boxArr.map(p => p[1]))));
        const ymax = Math.min(h - 1, Math.ceil(Math.max(...boxArr.map(p => p[1]))));
        
        let sum = 0;
        let count = 0;
        for (let y = ymin; y <= ymax; y++) {
            for (let x = xmin; x <= xmax; x++) {
                sum += bitmap[y][x];
                count++;
            }
        }
        
        return count > 0 ? sum / count : 0;
    }

    unclip(box, unclipRatio) {
        const area = this.getContourArea(box);
        const length = this.getContourLength(box);
        const distance = area * unclipRatio / length;
        
        const expandedBox = [];
        for (let i = 0; i < box.length; i++) {
            const point = box[i];
            const nextPoint = box[(i + 1) % box.length];
            const prevPoint = box[(i - 1 + box.length) % box.length];
            
            const edge1 = [nextPoint[0] - point[0], nextPoint[1] - point[1]];
            const edge2 = [prevPoint[0] - point[0], prevPoint[1] - point[1]];
            
            const norm1 = Math.sqrt(edge1[0] * edge1[0] + edge1[1] * edge1[1]);
            const norm2 = Math.sqrt(edge2[0] * edge2[0] + edge2[1] * edge2[1]);
            
            if (norm1 > 0 && norm2 > 0) {
                edge1[0] /= norm1;
                edge1[1] /= norm1;
                edge2[0] /= norm2;
                edge2[1] /= norm2;
                
                const bisector = [
                    edge1[0] + edge2[0],
                    edge1[1] + edge2[1]
                ];
                
                const bisectorNorm = Math.sqrt(bisector[0] * bisector[0] + bisector[1] * bisector[1]);
                if (bisectorNorm > 0) {
                    bisector[0] /= bisectorNorm;
                    bisector[1] /= bisectorNorm;
                    
                    expandedBox.push([
                        point[0] + bisector[0] * distance,
                        point[1] + bisector[1] * distance
                    ]);
                }
            }
        }
        
        return expandedBox.length === box.length ? expandedBox : box;
    }

    getContourArea(box) {
        let area = 0;
        for (let i = 0; i < box.length; i++) {
            const j = (i + 1) % box.length;
            area += box[i][0] * box[j][1];
            area -= box[j][0] * box[i][1];
        }
        return Math.abs(area) / 2;
    }

    getContourLength(box) {
        let length = 0;
        for (let i = 0; i < box.length; i++) {
            const j = (i + 1) % box.length;
            const dx = box[j][0] - box[i][0];
            const dy = box[j][1] - box[i][1];
            length += Math.sqrt(dx * dx + dy * dy);
        }
        return length;
    }
}

/**
 * Sorted boxes from top to bottom, left to right
 */
export function sortedBoxes(dtBoxes) {
    const numBoxes = dtBoxes.length;
    const sortedBoxes = [];
    
    for (let i = 0; i < numBoxes; i++) {
        sortedBoxes.push({
            box: dtBoxes[i],
            index: i
        });
    }
    
    // Sort by top y coordinate first, then by left x coordinate
    sortedBoxes.sort((a, b) => {
        const aMinY = Math.min(...a.box.map(p => p[1]));
        const bMinY = Math.min(...b.box.map(p => p[1]));
        
        if (Math.abs(aMinY - bMinY) < 10) {
            const aMinX = Math.min(...a.box.map(p => p[0]));
            const bMinX = Math.min(...b.box.map(p => p[0]));
            return aMinX - bMinX;
        }
        
        return aMinY - bMinY;
    });
    
    return sortedBoxes.map(item => item.box);
}

/**
 * Get rotate crop image for recognition
 */
export function getRotateCropImage(img, points) {
    const imgCrop = new cv.Mat();
    const pointsMat = cv.matFromArray(4, 1, cv.CV_32FC2, points.flat());
    
    const [imgCropWidth, imgCropHeight] = getMinBoundingRect(points);
    const ptsStd = [
        [0, 0],
        [imgCropWidth, 0],
        [imgCropWidth, imgCropHeight],
        [0, imgCropHeight]
    ];
    const ptsStdMat = cv.matFromArray(4, 1, cv.CV_32FC2, ptsStd.flat());
    
    const M = cv.getPerspectiveTransform(pointsMat, ptsStdMat);
    const dsize = new cv.Size(imgCropWidth, imgCropHeight);
    cv.warpPerspective(img, imgCrop, M, dsize, cv.INTER_CUBIC, cv.BORDER_REPLICATE);
    
    // Check if need to rotate
    const imgCropHeight2 = imgCrop.rows;
    const imgCropWidth2 = imgCrop.cols;
    if (imgCropHeight2 * 1.5 < imgCropWidth2) {
        // No rotation needed
        return imgCrop;
    } else {
        // Rotate 90 degrees
        const rotated = new cv.Mat();
        cv.transpose(imgCrop, rotated);
        cv.flip(rotated, rotated, 0);
        imgCrop.delete();
        return rotated;
    }
}

function getMinBoundingRect(points) {
    const xs = points.map(p => p[0]);
    const ys = points.map(p => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return [Math.round(maxX - minX), Math.round(maxY - minY)];
}

/**
 * Convert OpenCV Mat to tensor format for ONNX
 */
export function matToTensor(mat, targetShape) {
    const [c, h, w] = targetShape;
    const data = new Float32Array(c * h * w);
    
    // Convert HWC to CHW format
    const matData = mat.data32F;
    for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
            for (let k = 0; k < c; k++) {
                data[k * h * w + i * w + j] = matData[(i * w + j) * c + k];
            }
        }
    }
    
    return data;
}

/**
 * Wait for OpenCV to be ready
 */
export async function waitForOpenCV() {
    if (cvReady) return;
    
    return new Promise((resolve) => {
        const checkReady = () => {
            if (cvReady) {
                resolve();
            } else {
                setTimeout(checkReady, 100);
            }
        };
        checkReady();
    });
}