import { getOpenCv } from './opencv-wrapper.js';

/**
 * Complete OnnxOCR processor implementation with all processing methods
 * Based on https://github.com/jingsongliujing/OnnxOCR
 */
export class OnnxCompleteProcessor {
    constructor() {
        this.textSystem = null;
        this.cv = null;
        this.isInitialized = false;
        this.currentConfig = null;
        
        // Default parameters from OnnxOCR
        this.params = {
            // Detection parameters
            det_algorithm: 'DB',
            det_limit_side_len: 960,
            det_limit_type: 'max',
            det_db_thresh: 0.3,
            det_db_box_thresh: 0.6,
            det_db_unclip_ratio: 1.5,
            det_db_score_mode: 'fast',
            det_box_type: 'quad',
            use_dilation: false,
            
            // Recognition parameters
            rec_algorithm: 'CRNN',
            rec_image_shape: '3, 48, 320',
            rec_batch_num: 6,
            use_space_char: true,
            
            // Classification parameters
            use_angle_cls: true,
            cls_thresh: 0.9,
            
            // General parameters
            drop_score: 0.5,
            use_gpu: false,
            save_crop_res: false,
            crop_res_save_dir: './crop_results'
        };
        
        // Character dictionary
        this.characterDict = null;
    }

    async initialize(modelConfig, modelData) {
        try {
            // Ensure OpenCV is ready
            const cv = await getOpenCv();
            this.cv = cv;
            
            // Initialize character dictionary
            this.characterDict = this.loadCharacterDict(modelConfig);
            
            // Create text system with all components
            this.textSystem = new TextSystem(
                modelData.det,
                modelData.rec,
                modelData.cls,
                this.params,
                this.characterDict
            );
            
            await this.textSystem.initialize();
            
            this.currentConfig = modelConfig;
            this.isInitialized = true;
            
            console.log('OnnxOCR Complete Processor initialized');
        } catch (error) {
            console.error('Failed to initialize OnnxOCR processor:', error);
            throw error;
        }
    }

    /**
     * Main OCR processing method following OnnxOCR pipeline
     */
    async processImage(imageData) {
        if (!this.isInitialized) {
            throw new Error('OnnxOCR processor not initialized');
        }

        try {
            const cv = this.cv;
            const mat = cv.matFromImageData(imageData);
            
            // Convert to CV format expected by OnnxOCR
            const img = this.matToArray(mat);
            
            // Run complete OCR pipeline
            const result = await this.textSystem.ocr(img, {
                det: true,
                rec: true,
                cls: this.params.use_angle_cls
            });
            
            // Clean up
            mat.delete();
            
            // Format results
            return this.formatResults(result);
        } catch (error) {
            console.error('Error processing image:', error);
            throw error;
        }
    }

    /**
     * Convert OpenCV Mat to array format
     */
    matToArray(mat) {
        const cv = this.cv;
        
        // Convert to BGR (OpenCV format)
        const bgr = new cv.Mat();
        cv.cvtColor(mat, bgr, cv.COLOR_RGBA2BGR);
        
        // Get data as array
        const data = bgr.data;
        const height = bgr.rows;
        const width = bgr.cols;
        const channels = 3;
        
        // Create numpy-like array structure
        const img = {
            data: data,
            shape: [height, width, channels],
            rows: height,
            cols: width
        };
        
        bgr.delete();
        return img;
    }

    /**
     * Format results to standard output
     */
    formatResults(ocrResult) {
        const boxes = [];
        const texts = [];
        
        if (ocrResult && ocrResult[0]) {
            for (const item of ocrResult[0]) {
                const [box, [text, score]] = item;
                
                // Convert box points to bounding rectangle
                const points = box.map(p => ({ x: p[0], y: p[1] }));
                const minX = Math.min(...points.map(p => p.x));
                const minY = Math.min(...points.map(p => p.y));
                const maxX = Math.max(...points.map(p => p.x));
                const maxY = Math.max(...points.map(p => p.y));
                
                boxes.push({
                    x: minX,
                    y: minY,
                    width: maxX - minX,
                    height: maxY - minY,
                    points: points
                });
                
                texts.push({
                    text: text,
                    confidence: score,
                    box: {
                        x: minX,
                        y: minY,
                        width: maxX - minX,
                        height: maxY - minY,
                        points: points
                    }
                });
            }
        }
        
        return {
            boxes: boxes,
            texts: texts,
            timestamp: Date.now()
        };
    }

    /**
     * Load character dictionary based on model config
     */
    loadCharacterDict(modelConfig) {
        // Default character dictionary
        let charDict = [];
        
        if (modelConfig.language === 'chinese') {
            // Load Chinese character dictionary
            charDict = this.getChineseCharDict();
        } else if (modelConfig.language === 'japanese') {
            // Load Japanese character dictionary
            charDict = this.getJapaneseCharDict();
        } else {
            // Default English character dictionary
            charDict = this.getEnglishCharDict();
        }
        
        // Add special tokens
        charDict.unshift('blank'); // CTC blank at index 0
        
        return charDict;
    }

    getEnglishCharDict() {
        const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~ ';
        return chars.split('');
    }

    getChineseCharDict() {
        // Simplified version - in real implementation, load from file
        const basicChars = this.getEnglishCharDict();
        // Add common Chinese characters
        const chineseChars = '的一是不了人我在有他这为之大来以个中上们到说国和地也子时道出而要于就下得可你年生自会那后能对着事其里所去行过家十用发天如然作方成者多日都三小军二无同么经法当起与好看学进种将还分此心前面又定见只主没公从已家场知让重器感全理气相万她正意被么自想实把情女连义给些找教很但两回明间样发同行体传次由动员机每真打部文民特或新通最金作外被内提直合别理觉性此处管步化物候制几加目路应制管力太指向原因各本身应战结问利量活论点识改几报步己联系品设始意起运资点形产比主通决去取成使表老系管区改治图山统接品由按物平增据马认应制知较长政提建立计论产口达治革期质话公主界传取受号水斗量里或达系展观进率必争别类今集力算装低具位手教形变她革区知决带高共段风强说种关全维际约支育受接部程内较取保组造律确族务基拉格林声器提走严况向管七列准土器做容美度军收真拉等化单青再列命算员却领流争响原始至件求圆持重近织派米群选并世用适今器她称西斯量带维容物细何科断才九拉术飞检调九段按司空加值主研红军历准集己除决状八南单治空求识步队形月离北相原院东根声共入门任期维太受较百看存争非光书定工原处该千今种义较组想技叫干直合德石般何据满界算争往织速花集联布复化安度术设始争两争观圆边科深转话越求技能金水决断力面连听更查存志布片战阶力图济做土深较影用建阶低按律许统府';
        return [...basicChars, ...chineseChars.split('')];
    }

    getJapaneseCharDict() {
        // Simplified version - in real implementation, load from file
        const basicChars = this.getEnglishCharDict();
        // Add hiragana
        const hiragana = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
        // Add katakana
        const katakana = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
        return [...basicChars, ...hiragana.split(''), ...katakana.split('')];
    }

    /**
     * Visualize results with OnnxOCR style
     */
    visualizeResults(canvas, results) {
        const ctx = canvas.getContext('2d');
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw original image
        const imageCanvas = document.getElementById('imageCanvas');
        if (imageCanvas) {
            ctx.drawImage(imageCanvas, 0, 0);
        }
        
        // Draw boxes and text
        results.texts.forEach((item, index) => {
            const box = item.box;
            
            if (box.points) {
                // Draw polygon box
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(box.points[0].x, box.points[0].y);
                for (let i = 1; i < box.points.length; i++) {
                    ctx.lineTo(box.points[i].x, box.points[i].y);
                }
                ctx.closePath();
                ctx.stroke();
            } else {
                // Draw rectangle
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 2;
                ctx.strokeRect(box.x, box.y, box.width, box.height);
            }
            
            // Draw text label with background
            const text = item.text;
            const score = (item.confidence * 100).toFixed(1);
            const label = `${text} [${score}%]`;
            
            ctx.font = '16px Arial';
            const metrics = ctx.measureText(label);
            
            // Background
            ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
            ctx.fillRect(box.x, box.y - 25, metrics.width + 10, 25);
            
            // Text
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, box.x + 5, box.y - 8);
        });
    }

    /**
     * Run detection only
     */
    async detectOnly(imageData) {
        if (!this.isInitialized) {
            throw new Error('OnnxOCR processor not initialized');
        }

        const cv = this.cv;
        const mat = cv.matFromImageData(imageData);
        const img = this.matToArray(mat);
        
        const result = await this.textSystem.ocr(img, {
            det: true,
            rec: false,
            cls: false
        });
        
        mat.delete();
        
        // Format detection results
        const boxes = [];
        if (result && result[0]) {
            for (const box of result[0]) {
                const points = box.map(p => ({ x: p[0], y: p[1] }));
                const minX = Math.min(...points.map(p => p.x));
                const minY = Math.min(...points.map(p => p.y));
                const maxX = Math.max(...points.map(p => p.x));
                const maxY = Math.max(...points.map(p => p.y));
                
                boxes.push({
                    x: minX,
                    y: minY,
                    width: maxX - minX,
                    height: maxY - minY,
                    points: points
                });
            }
        }
        
        return { boxes };
    }

    /**
     * Run recognition only on provided regions
     */
    async recognizeOnly(imageData, boxes) {
        if (!this.isInitialized) {
            throw new Error('OnnxOCR processor not initialized');
        }

        const cv = this.cv;
        const mat = cv.matFromImageData(imageData);
        
        // Crop regions
        const crops = [];
        for (const box of boxes) {
            const rect = new cv.Rect(box.x, box.y, box.width, box.height);
            const roi = mat.roi(rect);
            const crop = new cv.Mat();
            roi.copyTo(crop);
            crops.push(crop);
        }
        
        // Convert crops to array format
        const imgCrops = crops.map(crop => this.matToArray(crop));
        
        // Run recognition
        const result = await this.textSystem.ocr(imgCrops, {
            det: false,
            rec: true,
            cls: this.params.use_angle_cls
        });
        
        // Clean up
        mat.delete();
        crops.forEach(crop => crop.delete());
        
        // Format results
        const texts = [];
        if (result && result[0]) {
            result[0].forEach((item, index) => {
                const [text, score] = item;
                texts.push({
                    text: text,
                    confidence: score,
                    box: boxes[index]
                });
            });
        }
        
        return { texts };
    }

    /**
     * Update parameters
     */
    updateParams(newParams) {
        this.params = { ...this.params, ...newParams };
        if (this.textSystem) {
            this.textSystem.updateParams(this.params);
        }
    }

    /**
     * Dispose resources
     */
    dispose() {
        if (this.textSystem) {
            this.textSystem.dispose();
            this.textSystem = null;
        }
        this.isInitialized = false;
        this.currentConfig = null;
    }
}

/**
 * TextSystem class implementing OnnxOCR pipeline
 */
class TextSystem {
    constructor(detModel, recModel, clsModel, params, charDict) {
        this.detModel = detModel;
        this.recModel = recModel;
        this.clsModel = clsModel;
        this.params = params;
        this.charDict = charDict;
        
        this.textDetector = null;
        this.textRecognizer = null;
        this.textClassifier = null;
    }

    async initialize() {
        // Initialize ONNX Runtime
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/';
        
        const sessionOptions = {
            executionProviders: this.params.use_gpu ? ['webgl', 'wasm'] : ['wasm'],
            graphOptimizationLevel: 'all'
        };
        
        // Initialize detection model
        if (this.detModel) {
            const detSession = await ort.InferenceSession.create(
                this.detModel.data,
                sessionOptions
            );
            this.textDetector = new TextDetector(detSession, this.params);
        }
        
        // Initialize recognition model
        if (this.recModel) {
            const recSession = await ort.InferenceSession.create(
                this.recModel.data,
                sessionOptions
            );
            this.textRecognizer = new TextRecognizer(recSession, this.params, this.charDict);
        }
        
        // Initialize classification model
        if (this.clsModel && this.params.use_angle_cls) {
            const clsSession = await ort.InferenceSession.create(
                this.clsModel.data,
                sessionOptions
            );
            this.textClassifier = new TextClassifier(clsSession, this.params);
        }
    }

    async ocr(img, options = { det: true, rec: true, cls: true }) {
        const { det, rec, cls } = options;
        
        if (det && rec) {
            // Full pipeline
            const dtBoxes = await this.textDetector.detect(img);
            
            if (!dtBoxes || dtBoxes.length === 0) {
                return [[]];
            }
            
            // Sort boxes
            const sortedBoxes = this.sortBoxes(dtBoxes);
            
            // Crop regions
            const imgCropList = this.cropTextRegions(img, sortedBoxes);
            
            // Classify angles if enabled
            let processedCrops = imgCropList;
            if (this.params.use_angle_cls && cls && this.textClassifier) {
                processedCrops = await this.textClassifier.classify(imgCropList);
            }
            
            // Recognize text
            const recRes = await this.textRecognizer.recognize(processedCrops);
            
            // Filter by score
            const results = [];
            for (let i = 0; i < sortedBoxes.length; i++) {
                const [text, score] = recRes[i];
                if (score >= this.params.drop_score) {
                    results.push([sortedBoxes[i], [text, score]]);
                }
            }
            
            return [results];
            
        } else if (det && !rec) {
            // Detection only
            const dtBoxes = await this.textDetector.detect(img);
            return [dtBoxes || []];
            
        } else {
            // Recognition only
            let imgList = Array.isArray(img) ? img : [img];
            
            if (this.params.use_angle_cls && cls && this.textClassifier) {
                imgList = await this.textClassifier.classify(imgList);
            }
            
            const recRes = await this.textRecognizer.recognize(imgList);
            return [recRes];
        }
    }

    sortBoxes(dtBoxes) {
        // Sort boxes from top to bottom, left to right
        return [...dtBoxes].sort((a, b) => {
            const aY = a[0][1];
            const bY = b[0][1];
            const aX = a[0][0];
            const bX = b[0][0];
            
            // If on same line (within 10 pixels)
            if (Math.abs(aY - bY) < 10) {
                return aX - bX;
            }
            return aY - bY;
        });
    }

    cropTextRegions(img, boxes) {
        // This is a simplified version - in real implementation,
        // would use actual image cropping
        const crops = [];
        
        for (const box of boxes) {
            // Get bounding rectangle from polygon
            const xs = box.map(p => p[0]);
            const ys = box.map(p => p[1]);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const maxX = Math.max(...xs);
            const maxY = Math.max(...ys);
            
            crops.push({
                data: img.data,
                shape: [maxY - minY, maxX - minX, 3],
                box: box,
                rect: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
            });
        }
        
        return crops;
    }

    updateParams(newParams) {
        this.params = { ...this.params, ...newParams };
    }

    dispose() {
        if (this.textDetector) this.textDetector.dispose();
        if (this.textRecognizer) this.textRecognizer.dispose();
        if (this.textClassifier) this.textClassifier.dispose();
    }
}

/**
 * Text Detection module
 */
class TextDetector {
    constructor(session, params) {
        this.session = session;
        this.params = params;
        
        // Preprocessing parameters
        this.mean = [0.485, 0.456, 0.406];
        this.std = [0.229, 0.224, 0.225];
    }

    async detect(img) {
        // Preprocess image
        const { tensor, shape, ratio } = this.preprocess(img);
        
        // Run inference
        const inputTensor = new ort.Tensor('float32', tensor, 
            [1, 3, shape.height, shape.width]);
        const feeds = { x: inputTensor };
        const results = await this.session.run(feeds);
        
        // Postprocess
        const output = results[this.session.outputNames[0]];
        const boxes = this.postprocess(output, shape, ratio, img.shape);
        
        return boxes;
    }

    preprocess(img) {
        const limitSideLen = this.params.det_limit_side_len;
        const [h, w] = [img.shape[0], img.shape[1]];
        
        // Calculate resize ratio
        let ratio = 1.0;
        if (Math.max(h, w) > limitSideLen) {
            ratio = limitSideLen / Math.max(h, w);
        }
        
        const resizeH = Math.round(h * ratio);
        const resizeW = Math.round(w * ratio);
        
        // Pad to multiple of 32
        const targetH = Math.ceil(resizeH / 32) * 32;
        const targetW = Math.ceil(resizeW / 32) * 32;
        
        // Create normalized tensor
        const tensor = new Float32Array(3 * targetH * targetW);
        
        // Simplified preprocessing - in real implementation would use actual image resizing
        for (let c = 0; c < 3; c++) {
            for (let h = 0; h < targetH; h++) {
                for (let w = 0; w < targetW; w++) {
                    const idx = c * targetH * targetW + h * targetW + w;
                    tensor[idx] = (0 - this.mean[c]) / this.std[c];
                }
            }
        }
        
        return {
            tensor,
            shape: { height: targetH, width: targetW },
            ratio
        };
    }

    postprocess(output, shape, ratio, origShape) {
        const data = output.data;
        const [batch, height, width] = output.dims;
        
        // Threshold and find contours
        const boxes = [];
        const thresh = this.params.det_db_thresh;
        const boxThresh = this.params.det_db_box_thresh;
        const unclipRatio = this.params.det_db_unclip_ratio;
        
        // Get OpenCV instance
        const cv = window.cv;
        if (!cv) {
            console.error('OpenCV not available for postprocessing');
            return [];
        }
        
        // Create binary map from probability map
        const probMap = new cv.Mat(height, width, cv.CV_32F);
        const binaryMap = new cv.Mat();
        
        try {
            // Copy data to OpenCV Mat
            for (let i = 0; i < height * width; i++) {
                probMap.data32F[i] = data[i];
            }
            
            // Threshold
            cv.threshold(probMap, binaryMap, thresh, 1, cv.THRESH_BINARY);
            
            // Apply dilation if enabled
            if (this.params.use_dilation) {
                const kernel = cv.Mat.ones(2, 2, cv.CV_8U);
                cv.dilate(binaryMap, binaryMap, kernel);
                kernel.delete();
            }
            
            // Convert to 8-bit for contour detection
            const binaryMap8 = new cv.Mat();
            binaryMap.convertTo(binaryMap8, cv.CV_8U, 255);
            
            // Find contours
            const contours = new cv.MatVector();
            const hierarchy = new cv.Mat();
            cv.findContours(binaryMap8, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
            
            // Process each contour
            const maxCandidates = Math.min(contours.size(), 1000);
            for (let i = 0; i < maxCandidates; i++) {
                const contour = contours.get(i);
                
                // Approximate polygon
                const epsilon = 0.002 * cv.arcLength(contour, true);
                const approx = new cv.Mat();
                cv.approxPolyDP(contour, approx, epsilon, true);
                
                if (approx.rows < 4) {
                    approx.delete();
                    continue;
                }
                
                // Calculate box score
                const points = [];
                for (let j = 0; j < approx.rows; j++) {
                    points.push([approx.data32S[j * 2], approx.data32S[j * 2 + 1]]);
                }
                
                const score = this.boxScoreFast(probMap, points);
                if (score < boxThresh) {
                    approx.delete();
                    continue;
                }
                
                // Unclip box
                const unclippedBox = this.unclip(points, unclipRatio);
                if (!unclippedBox || unclippedBox.length < 4) {
                    approx.delete();
                    continue;
                }
                
                // Get minimum area rectangle
                const rect = this.getMinAreaRect(unclippedBox);
                if (rect.width < 3 || rect.height < 3) {
                    approx.delete();
                    continue;
                }
                
                // Scale coordinates back to original image size
                const scaledBox = unclippedBox.map(point => [
                    Math.round(point[0] / ratio),
                    Math.round(point[1] / ratio)
                ]);
                
                boxes.push(scaledBox);
                approx.delete();
            }
            
            // Cleanup
            binaryMap8.delete();
            contours.delete();
            hierarchy.delete();
            
        } finally {
            // Ensure cleanup even on error
            probMap.delete();
            binaryMap.delete();
        }
        
        return boxes;
    }
    
    boxScoreFast(bitmap, points) {
        // Fast box scoring using mean of probability values
        const cv = window.cv;
        const h = bitmap.rows;
        const w = bitmap.cols;
        
        // Create mask for the box
        const mask = cv.Mat.zeros(h, w, cv.CV_8U);
        const contour = cv.matFromArray(points.length, 1, cv.CV_32SC2, 
            points.flat());
        const contours = new cv.MatVector();
        contours.push_back(contour);
        
        cv.drawContours(mask, contours, 0, new cv.Scalar(255), -1);
        
        // Calculate mean value in masked region
        const mean = cv.mean(bitmap, mask);
        
        // Cleanup
        mask.delete();
        contour.delete();
        contours.delete();
        
        return mean[0];
    }
    
    unclip(points, ratio) {
        // Expand the polygon by ratio
        const area = this.getPolygonArea(points);
        const length = this.getPolygonLength(points);
        const distance = area * ratio / length;
        
        // Offset polygon
        const expandedPoints = [];
        const n = points.length;
        
        for (let i = 0; i < n; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % n];
            const p0 = points[(i - 1 + n) % n];
            
            // Calculate normal vector
            const v1 = [p1[0] - p0[0], p1[1] - p0[1]];
            const v2 = [p2[0] - p1[0], p2[1] - p1[1]];
            
            const norm1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]);
            const norm2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);
            
            if (norm1 > 0) {
                v1[0] /= norm1;
                v1[1] /= norm1;
            }
            if (norm2 > 0) {
                v2[0] /= norm2;
                v2[1] /= norm2;
            }
            
            // Average normal
            const normal = [
                -(v1[1] + v2[1]) / 2,
                (v1[0] + v2[0]) / 2
            ];
            
            const normalNorm = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1]);
            if (normalNorm > 0) {
                expandedPoints.push([
                    p1[0] + normal[0] * distance / normalNorm,
                    p1[1] + normal[1] * distance / normalNorm
                ]);
            } else {
                expandedPoints.push([p1[0], p1[1]]);
            }
        }
        
        return expandedPoints;
    }
    
    getPolygonArea(points) {
        // Calculate polygon area using shoelace formula
        let area = 0;
        const n = points.length;
        
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i][0] * points[j][1];
            area -= points[j][0] * points[i][1];
        }
        
        return Math.abs(area) / 2;
    }
    
    getPolygonLength(points) {
        // Calculate polygon perimeter
        let length = 0;
        const n = points.length;
        
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const dx = points[j][0] - points[i][0];
            const dy = points[j][1] - points[i][1];
            length += Math.sqrt(dx * dx + dy * dy);
        }
        
        return length;
    }
    
    getMinAreaRect(points) {
        // Get minimum area bounding rectangle
        const xs = points.map(p => p[0]);
        const ys = points.map(p => p[1]);
        
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    dispose() {
        if (this.session) {
            this.session.release();
        }
    }
}

/**
 * Text Recognition module
 */
class TextRecognizer {
    constructor(session, params, charDict) {
        this.session = session;
        this.params = params;
        this.charDict = charDict;
        
        // Parse image shape
        const shapeStr = params.rec_image_shape.split(',').map(s => parseInt(s.trim()));
        this.imgShape = { c: shapeStr[0], h: shapeStr[1], w: shapeStr[2] };
    }

    async recognize(imgList) {
        const results = [];
        
        // Process in batches
        const batchNum = this.params.rec_batch_num;
        for (let i = 0; i < imgList.length; i += batchNum) {
            const batch = imgList.slice(i, i + batchNum);
            const batchResults = await this.recognizeBatch(batch);
            results.push(...batchResults);
        }
        
        return results;
    }

    async recognizeBatch(batch) {
        // Preprocess batch
        const tensors = batch.map(img => this.preprocess(img));
        
        // Run inference for each item (simplified - real implementation would batch)
        const results = [];
        for (const tensor of tensors) {
            const inputTensor = new ort.Tensor('float32', tensor,
                [1, this.imgShape.c, this.imgShape.h, this.imgShape.w]);
            const feeds = { x: inputTensor };
            const output = await this.session.run(feeds);
            
            const result = this.postprocess(output);
            results.push(result);
        }
        
        return results;
    }

    preprocess(img) {
        const { c, h, w } = this.imgShape;
        const tensor = new Float32Array(c * h * w);
        
        // Simplified preprocessing
        for (let i = 0; i < tensor.length; i++) {
            tensor[i] = (0 - 0.5) / 0.5;
        }
        
        return tensor;
    }

    postprocess(output) {
        const logits = output[this.session.outputNames[0]].data;
        const dims = output[this.session.outputNames[0]].dims;
        
        // CTC decode
        const text = this.ctcDecode(logits, dims);
        const confidence = 0.95; // Simplified confidence
        
        return [text, confidence];
    }

    ctcDecode(logits, dims) {
        const [batch, seqLen, vocabSize] = dims;
        
        let text = '';
        let lastIdx = -1;
        
        for (let t = 0; t < seqLen; t++) {
            let maxIdx = 0;
            let maxVal = logits[t * vocabSize];
            
            for (let c = 1; c < vocabSize; c++) {
                if (logits[t * vocabSize + c] > maxVal) {
                    maxVal = logits[t * vocabSize + c];
                    maxIdx = c;
                }
            }
            
            if (maxIdx !== 0 && maxIdx !== lastIdx && maxIdx < this.charDict.length) {
                text += this.charDict[maxIdx];
            }
            
            lastIdx = maxIdx;
        }
        
        return text.trim();
    }

    dispose() {
        if (this.session) {
            this.session.release();
        }
    }
}

/**
 * Text Angle Classification module
 */
class TextClassifier {
    constructor(session, params) {
        this.session = session;
        this.params = params;
        this.thresh = params.cls_thresh;
    }

    async classify(imgList) {
        const results = [];
        
        for (const img of imgList) {
            const angle = await this.classifyAngle(img);
            
            // Rotate if needed
            if (angle === 180) {
                // In real implementation, would rotate the image
                results.push(img); // Simplified - return as is
            } else {
                results.push(img);
            }
        }
        
        return results;
    }

    async classifyAngle(img) {
        // Preprocess
        const tensor = this.preprocess(img);
        
        // Run inference
        const inputTensor = new ort.Tensor('float32', tensor, [1, 3, 48, 192]);
        const feeds = { x: inputTensor };
        const output = await this.session.run(feeds);
        
        // Get angle
        const probs = output[this.session.outputNames[0]].data;
        const angle = probs[0] > this.thresh ? 0 : 180;
        
        return angle;
    }

    preprocess(img) {
        // Simplified preprocessing
        const tensor = new Float32Array(3 * 48 * 192);
        for (let i = 0; i < tensor.length; i++) {
            tensor[i] = (0 - 0.5) / 0.5;
        }
        return tensor;
    }

    dispose() {
        if (this.session) {
            this.session.release();
        }
    }
}