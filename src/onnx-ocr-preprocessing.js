/**
 * OnnxOCR-based preprocessing functions
 * Pure JavaScript implementation without OpenCV dependency
 */

/**
 * Image preprocessing utilities
 */
export class ImagePreprocessor {
    /**
     * Resize image to specified dimensions using canvas
     */
    static async resizeImage(imageData, targetWidth, targetHeight) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Create image from imageData
        const img = new Image();
        const blob = new Blob([imageData], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        
        return new Promise((resolve, reject) => {
            img.onload = () => {
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                
                const resizedImageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
                URL.revokeObjectURL(url);
                resolve(resizedImageData);
            };
            img.onerror = reject;
            img.src = url;
        });
    }

    /**
     * Convert canvas to image data for processing
     */
    static canvasToImageData(canvas) {
        const ctx = canvas.getContext('2d');
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    /**
     * Normalize image data (subtract mean and divide by std)
     */
    static normalizeImageData(imageData, mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225]) {
        const data = imageData.data;
        const normalized = new Float32Array(data.length);
        
        for (let i = 0; i < data.length; i += 4) {
            // RGB channels
            normalized[i] = ((data[i] / 255.0) - mean[0]) / std[0];
            normalized[i + 1] = ((data[i + 1] / 255.0) - mean[1]) / std[1];
            normalized[i + 2] = ((data[i + 2] / 255.0) - mean[2]) / std[2];
            // Alpha channel (kept as is)
            normalized[i + 3] = data[i + 3] / 255.0;
        }
        
        return normalized;
    }

    /**
     * Convert HWC to CHW format for ONNX
     */
    static hwcToChw(imageData, width, height) {
        const channels = 3;
        const chw = new Float32Array(channels * height * width);
        const data = imageData.data || imageData;
        
        // Rearrange from HWC to CHW
        let idx = 0;
        for (let c = 0; c < channels; c++) {
            for (let h = 0; h < height; h++) {
                for (let w = 0; w < width; w++) {
                    chw[idx++] = data[(h * width + w) * 4 + c];
                }
            }
        }
        
        return chw;
    }
}

/**
 * Detection preprocessing based on OnnxOCR
 */
export class DetectionPreprocessor {
    constructor(options = {}) {
        this.limitSideLen = options.det_limit_side_len || 960;
        this.limitType = options.det_limit_type || 'min';
        this.mean = options.mean || [0.485, 0.456, 0.406];
        this.std = options.std || [0.229, 0.224, 0.225];
        this.scale = options.scale || 1.0 / 255.0;
    }

    async preprocess(canvas) {
        const originalWidth = canvas.width;
        const originalHeight = canvas.height;
        
        // Calculate resize dimensions
        const { targetWidth, targetHeight } = this.calculateResizeDimensions(originalWidth, originalHeight);
        
        // Create resized canvas
        const resizedCanvas = document.createElement('canvas');
        resizedCanvas.width = targetWidth;
        resizedCanvas.height = targetHeight;
        const ctx = resizedCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        
        // Normalize the image
        const normalized = this.normalizeImage(imageData);
        
        // Convert to CHW format
        const tensor = ImagePreprocessor.hwcToChw(normalized, targetWidth, targetHeight);
        
        return {
            tensor,
            originalShape: [originalHeight, originalWidth],
            resizedShape: [targetHeight, targetWidth],
            ratio: [targetHeight / originalHeight, targetWidth / originalWidth]
        };
    }

    calculateResizeDimensions(width, height) {
        let ratio = 1.0;
        
        if (this.limitType === 'max') {
            if (Math.max(height, width) > this.limitSideLen) {
                ratio = this.limitSideLen / Math.max(height, width);
            }
        } else if (this.limitType === 'min') {
            if (Math.min(height, width) < this.limitSideLen) {
                ratio = this.limitSideLen / Math.min(height, width);
            }
        }
        
        let targetHeight = Math.round(height * ratio);
        let targetWidth = Math.round(width * ratio);
        
        // Make divisible by 32
        targetHeight = Math.max(Math.round(targetHeight / 32) * 32, 32);
        targetWidth = Math.max(Math.round(targetWidth / 32) * 32, 32);
        
        return { targetWidth, targetHeight };
    }

    normalizeImage(imageData) {
        const data = imageData.data;
        const normalized = new Float32Array(data.length / 4 * 3); // RGB only
        
        let idx = 0;
        for (let i = 0; i < data.length; i += 4) {
            normalized[idx++] = ((data[i] * this.scale) - this.mean[0]) / this.std[0];
            normalized[idx++] = ((data[i + 1] * this.scale) - this.mean[1]) / this.std[1];
            normalized[idx++] = ((data[i + 2] * this.scale) - this.mean[2]) / this.std[2];
        }
        
        return normalized;
    }
}

/**
 * Classification preprocessing based on OnnxOCR
 */
export class ClassificationPreprocessor {
    constructor(options = {}) {
        this.imageShape = options.cls_image_shape || [3, 48, 192];
    }

    async preprocess(canvas) {
        const [channels, targetHeight, targetWidth] = this.imageShape;
        const originalWidth = canvas.width;
        const originalHeight = canvas.height;
        
        // Calculate resize width maintaining aspect ratio
        const ratio = originalWidth / originalHeight;
        let resizeWidth = Math.ceil(targetHeight * ratio);
        if (resizeWidth > targetWidth) {
            resizeWidth = targetWidth;
        }
        
        // Create canvas for resizing
        const resizedCanvas = document.createElement('canvas');
        resizedCanvas.width = resizeWidth;
        resizedCanvas.height = targetHeight;
        const ctx = resizedCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0, resizeWidth, targetHeight);
        
        // Create padded canvas
        const paddedCanvas = document.createElement('canvas');
        paddedCanvas.width = targetWidth;
        paddedCanvas.height = targetHeight;
        const paddedCtx = paddedCanvas.getContext('2d');
        paddedCtx.fillStyle = 'black';
        paddedCtx.fillRect(0, 0, targetWidth, targetHeight);
        paddedCtx.drawImage(resizedCanvas, 0, 0);
        
        // Get image data and normalize
        const imageData = paddedCtx.getImageData(0, 0, targetWidth, targetHeight);
        const normalized = this.normalizeImage(imageData);
        
        // Convert to CHW format
        const tensor = ImagePreprocessor.hwcToChw(normalized, targetWidth, targetHeight);
        
        return tensor;
    }

    normalizeImage(imageData) {
        const data = imageData.data;
        const normalized = new Float32Array(data.length / 4 * 3);
        
        let idx = 0;
        for (let i = 0; i < data.length; i += 4) {
            // Normalize: (pixel / 255 - 0.5) / 0.5
            normalized[idx++] = (data[i] / 255.0 - 0.5) / 0.5;
            normalized[idx++] = (data[i + 1] / 255.0 - 0.5) / 0.5;
            normalized[idx++] = (data[i + 2] / 255.0 - 0.5) / 0.5;
        }
        
        return normalized;
    }
}

/**
 * Recognition preprocessing based on OnnxOCR
 */
export class RecognitionPreprocessor {
    constructor(options = {}) {
        this.imageShape = options.rec_image_shape || [3, 48, 320];
        this.recAlgorithm = options.rec_algorithm || 'SVTR_LCNet';
    }

    async preprocess(canvas, maxWhRatio = null) {
        const [channels, targetHeight, targetWidth] = this.imageShape;
        const originalWidth = canvas.width;
        const originalHeight = canvas.height;
        
        // Calculate max width-height ratio if not provided
        if (!maxWhRatio) {
            maxWhRatio = originalWidth / originalHeight;
        }
        
        // Calculate target dimensions
        let imgW = Math.round(targetHeight * maxWhRatio);
        if (this.recAlgorithm === 'NRTR' || this.recAlgorithm === 'ViTSTR') {
            imgW = targetWidth;
        } else {
            imgW = Math.min(imgW, targetWidth);
        }
        
        // Calculate resize width maintaining aspect ratio
        const ratio = originalWidth / originalHeight;
        let resizeWidth = Math.ceil(targetHeight * ratio);
        if (resizeWidth > imgW) {
            resizeWidth = imgW;
        }
        
        // Create canvas for resizing
        const resizedCanvas = document.createElement('canvas');
        resizedCanvas.width = resizeWidth;
        resizedCanvas.height = targetHeight;
        const ctx = resizedCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0, resizeWidth, targetHeight);
        
        // Create padded canvas
        const paddedCanvas = document.createElement('canvas');
        paddedCanvas.width = imgW;
        paddedCanvas.height = targetHeight;
        const paddedCtx = paddedCanvas.getContext('2d');
        paddedCtx.fillStyle = 'black';
        paddedCtx.fillRect(0, 0, imgW, targetHeight);
        paddedCtx.drawImage(resizedCanvas, 0, 0);
        
        // Get image data and normalize
        const imageData = paddedCtx.getImageData(0, 0, imgW, targetHeight);
        const normalized = this.normalizeImage(imageData);
        
        // Convert to CHW format
        const tensor = ImagePreprocessor.hwcToChw(normalized, imgW, targetHeight);
        
        return {
            tensor,
            shape: [1, channels, targetHeight, imgW]
        };
    }

    normalizeImage(imageData) {
        const data = imageData.data;
        const normalized = new Float32Array(data.length / 4 * 3);
        
        let idx = 0;
        for (let i = 0; i < data.length; i += 4) {
            // Normalize: (pixel / 255 - 0.5) / 0.5
            normalized[idx++] = (data[i] / 255.0 - 0.5) / 0.5;
            normalized[idx++] = (data[i + 1] / 255.0 - 0.5) / 0.5;
            normalized[idx++] = (data[i + 2] / 255.0 - 0.5) / 0.5;
        }
        
        return normalized;
    }
}

/**
 * Crop and rotate text regions from detection results
 */
export class TextRegionExtractor {
    static extractRegion(canvas, points) {
        // Sort points to get correct order: top-left, top-right, bottom-right, bottom-left
        const sortedPoints = this.sortPoints(points);
        
        // Calculate dimensions of the cropped region
        const width = Math.max(
            this.distance(sortedPoints[0], sortedPoints[1]),
            this.distance(sortedPoints[3], sortedPoints[2])
        );
        const height = Math.max(
            this.distance(sortedPoints[0], sortedPoints[3]),
            this.distance(sortedPoints[1], sortedPoints[2])
        );
        
        // Create canvas for cropped region
        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = Math.round(width);
        croppedCanvas.height = Math.round(height);
        const ctx = croppedCanvas.getContext('2d');
        
        // Calculate perspective transform
        const srcPoints = sortedPoints;
        const dstPoints = [
            [0, 0],
            [width, 0],
            [width, height],
            [0, height]
        ];
        
        // Simple perspective transform using canvas
        ctx.save();
        
        // Draw the transformed image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvas, 0, 0);
        
        // Use clip path to extract the region
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(width, 0);
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.clip();
        
        // Calculate transform matrix (simplified)
        const transform = this.getPerspectiveTransform(srcPoints, dstPoints, width, height);
        ctx.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f);
        ctx.drawImage(canvas, 0, 0);
        
        ctx.restore();
        
        // Check if rotation is needed (if height > width * 1.5)
        if (height > width * 1.5) {
            const rotatedCanvas = document.createElement('canvas');
            rotatedCanvas.width = croppedCanvas.height;
            rotatedCanvas.height = croppedCanvas.width;
            const rotatedCtx = rotatedCanvas.getContext('2d');
            rotatedCtx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
            rotatedCtx.rotate(Math.PI / 2);
            rotatedCtx.drawImage(croppedCanvas, -croppedCanvas.width / 2, -croppedCanvas.height / 2);
            return rotatedCanvas;
        }
        
        return croppedCanvas;
    }

    static sortPoints(points) {
        // Find center point
        const center = points.reduce((acc, point) => {
            return [acc[0] + point[0] / points.length, acc[1] + point[1] / points.length];
        }, [0, 0]);
        
        // Sort points by angle from center
        const sortedPoints = points.slice().sort((a, b) => {
            const angleA = Math.atan2(a[1] - center[1], a[0] - center[0]);
            const angleB = Math.atan2(b[1] - center[1], b[0] - center[0]);
            return angleA - angleB;
        });
        
        // Find top-left point (minimum sum of x and y)
        let topLeftIdx = 0;
        let minSum = sortedPoints[0][0] + sortedPoints[0][1];
        for (let i = 1; i < sortedPoints.length; i++) {
            const sum = sortedPoints[i][0] + sortedPoints[i][1];
            if (sum < minSum) {
                minSum = sum;
                topLeftIdx = i;
            }
        }
        
        // Reorder starting from top-left
        const reordered = [];
        for (let i = 0; i < sortedPoints.length; i++) {
            reordered.push(sortedPoints[(topLeftIdx + i) % sortedPoints.length]);
        }
        
        return reordered;
    }

    static distance(p1, p2) {
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        return Math.sqrt(dx * dx + dy * dy);
    }

    static getPerspectiveTransform(src, dst, width, height) {
        // Simplified perspective transform
        // For more accurate transform, use a proper perspective transform library
        const scaleX = width / (src[1][0] - src[0][0]);
        const scaleY = height / (src[3][1] - src[0][1]);
        
        return {
            a: scaleX,
            b: 0,
            c: 0,
            d: scaleY,
            e: -src[0][0] * scaleX,
            f: -src[0][1] * scaleY
        };
    }
}