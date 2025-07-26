/**
 * OnnxOCR-based postprocessing functions
 * Pure JavaScript implementation
 */

/**
 * DB (Differentiable Binarization) postprocessing for text detection
 */
export class DBPostProcessor {
    constructor(options = {}) {
        this.thresh = options.thresh || 0.3;
        this.boxThresh = options.box_thresh || 0.6;
        this.maxCandidates = options.max_candidates || 1000;
        this.unclipRatio = options.unclip_ratio || 1.5;
        this.minSize = options.min_size || 3;
        this.scoreMode = options.score_mode || 'fast';
    }

    process(predictions, shapes) {
        const pred = predictions[0];
        const shape = shapes[0];
        
        // Get binary map
        const binaryMap = this.threshold(pred);
        
        // Find contours
        const contours = this.findContours(binaryMap);
        
        // Process each contour
        const boxes = [];
        const scores = [];
        
        for (const contour of contours) {
            if (contour.length < 4) continue;
            
            // Get minimum area rectangle
            const rect = this.getMinAreaRect(contour);
            if (!rect) continue;
            
            // Calculate score
            const score = this.boxScore(pred, rect);
            if (score < this.boxThresh) continue;
            
            // Unclip the box
            const box = this.unclip(rect);
            if (!box) continue;
            
            // Rescale to original image size
            const rescaledBox = this.rescaleBox(box, shape);
            
            // Filter by size
            if (this.validateBox(rescaledBox)) {
                boxes.push(rescaledBox);
                scores.push(score);
            }
        }
        
        return { boxes, scores };
    }

    threshold(pred) {
        const height = pred.length;
        const width = pred[0].length;
        const binary = [];
        
        for (let i = 0; i < height; i++) {
            binary[i] = [];
            for (let j = 0; j < width; j++) {
                binary[i][j] = pred[i][j] > this.thresh ? 1 : 0;
            }
        }
        
        return binary;
    }

    findContours(binaryMap) {
        const height = binaryMap.length;
        const width = binaryMap[0].length;
        const visited = Array(height).fill(null).map(() => Array(width).fill(false));
        const contours = [];
        
        // Find connected components
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                if (binaryMap[i][j] === 1 && !visited[i][j]) {
                    const contour = this.traceContour(binaryMap, visited, i, j);
                    if (contour.length >= 4) {
                        contours.push(contour);
                    }
                }
            }
        }
        
        return contours;
    }

    traceContour(binaryMap, visited, startY, startX) {
        const height = binaryMap.length;
        const width = binaryMap[0].length;
        const contour = [];
        const queue = [[startY, startX]];
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
        
        while (queue.length > 0) {
            const [y, x] = queue.shift();
            if (visited[y][x]) continue;
            
            visited[y][x] = true;
            
            // Check if it's a boundary point
            let isBoundary = false;
            for (const [dy, dx] of directions) {
                const ny = y + dy;
                const nx = x + dx;
                if (ny < 0 || ny >= height || nx < 0 || nx >= width || binaryMap[ny][nx] === 0) {
                    isBoundary = true;
                    break;
                }
            }
            
            if (isBoundary) {
                contour.push([x, y]);
            }
            
            // Add neighbors to queue
            for (const [dy, dx] of directions) {
                const ny = y + dy;
                const nx = x + dx;
                if (ny >= 0 && ny < height && nx >= 0 && nx < width && 
                    binaryMap[ny][nx] === 1 && !visited[ny][nx]) {
                    queue.push([ny, nx]);
                }
            }
        }
        
        return contour;
    }

    getMinAreaRect(contour) {
        if (contour.length < 4) return null;
        
        // Find convex hull
        const hull = this.convexHull(contour);
        if (hull.length < 4) return null;
        
        // Find minimum area rectangle
        let minArea = Infinity;
        let bestRect = null;
        
        for (let i = 0; i < hull.length; i++) {
            const p1 = hull[i];
            const p2 = hull[(i + 1) % hull.length];
            
            // Calculate edge vector
            const edge = [p2[0] - p1[0], p2[1] - p1[1]];
            const edgeLength = Math.sqrt(edge[0] * edge[0] + edge[1] * edge[1]);
            if (edgeLength === 0) continue;
            
            edge[0] /= edgeLength;
            edge[1] /= edgeLength;
            
            // Project all points onto this edge
            let minProj = Infinity;
            let maxProj = -Infinity;
            let minPerpProj = Infinity;
            let maxPerpProj = -Infinity;
            
            for (const point of hull) {
                const proj = (point[0] - p1[0]) * edge[0] + (point[1] - p1[1]) * edge[1];
                const perpProj = (point[0] - p1[0]) * (-edge[1]) + (point[1] - p1[1]) * edge[0];
                
                minProj = Math.min(minProj, proj);
                maxProj = Math.max(maxProj, proj);
                minPerpProj = Math.min(minPerpProj, perpProj);
                maxPerpProj = Math.max(maxPerpProj, perpProj);
            }
            
            const width = maxProj - minProj;
            const height = maxPerpProj - minPerpProj;
            const area = width * height;
            
            if (area < minArea) {
                minArea = area;
                
                // Calculate rectangle corners
                const corner1 = [
                    p1[0] + minProj * edge[0] + minPerpProj * (-edge[1]),
                    p1[1] + minProj * edge[1] + minPerpProj * edge[0]
                ];
                const corner2 = [
                    p1[0] + maxProj * edge[0] + minPerpProj * (-edge[1]),
                    p1[1] + maxProj * edge[1] + minPerpProj * edge[0]
                ];
                const corner3 = [
                    p1[0] + maxProj * edge[0] + maxPerpProj * (-edge[1]),
                    p1[1] + maxProj * edge[1] + maxPerpProj * edge[0]
                ];
                const corner4 = [
                    p1[0] + minProj * edge[0] + maxPerpProj * (-edge[1]),
                    p1[1] + minProj * edge[1] + maxPerpProj * edge[0]
                ];
                
                bestRect = [corner1, corner2, corner3, corner4];
            }
        }
        
        return bestRect;
    }

    convexHull(points) {
        // Graham scan algorithm
        if (points.length < 3) return points;
        
        // Find the bottom-most point (and left-most if tied)
        let start = 0;
        for (let i = 1; i < points.length; i++) {
            if (points[i][1] < points[start][1] || 
                (points[i][1] === points[start][1] && points[i][0] < points[start][0])) {
                start = i;
            }
        }
        
        // Sort points by polar angle with respect to start point
        const sorted = points.slice();
        const startPoint = sorted.splice(start, 1)[0];
        
        sorted.sort((a, b) => {
            const angleA = Math.atan2(a[1] - startPoint[1], a[0] - startPoint[0]);
            const angleB = Math.atan2(b[1] - startPoint[1], b[0] - startPoint[0]);
            if (angleA !== angleB) return angleA - angleB;
            
            // If angles are equal, sort by distance
            const distA = (a[0] - startPoint[0]) * (a[0] - startPoint[0]) + 
                         (a[1] - startPoint[1]) * (a[1] - startPoint[1]);
            const distB = (b[0] - startPoint[0]) * (b[0] - startPoint[0]) + 
                         (b[1] - startPoint[1]) * (b[1] - startPoint[1]);
            return distA - distB;
        });
        
        // Build hull
        const hull = [startPoint];
        for (const point of sorted) {
            while (hull.length >= 2) {
                const p1 = hull[hull.length - 2];
                const p2 = hull[hull.length - 1];
                const cross = (p2[0] - p1[0]) * (point[1] - p1[1]) - 
                            (p2[1] - p1[1]) * (point[0] - p1[0]);
                if (cross <= 0) {
                    hull.pop();
                } else {
                    break;
                }
            }
            hull.push(point);
        }
        
        return hull;
    }

    boxScore(pred, box) {
        // Fast box score calculation
        const xmin = Math.min(...box.map(p => p[0]));
        const xmax = Math.max(...box.map(p => p[0]));
        const ymin = Math.min(...box.map(p => p[1]));
        const ymax = Math.max(...box.map(p => p[1]));
        
        let sum = 0;
        let count = 0;
        
        for (let y = Math.floor(ymin); y <= Math.ceil(ymax); y++) {
            for (let x = Math.floor(xmin); x <= Math.ceil(xmax); x++) {
                if (y >= 0 && y < pred.length && x >= 0 && x < pred[0].length) {
                    if (this.pointInPolygon([x, y], box)) {
                        sum += pred[y][x];
                        count++;
                    }
                }
            }
        }
        
        return count > 0 ? sum / count : 0;
    }

    pointInPolygon(point, polygon) {
        let inside = false;
        const x = point[0];
        const y = point[1];
        
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0];
            const yi = polygon[i][1];
            const xj = polygon[j][0];
            const yj = polygon[j][1];
            
            const intersect = ((yi > y) !== (yj > y)) &&
                            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        
        return inside;
    }

    unclip(box) {
        // Calculate perimeter
        let perimeter = 0;
        for (let i = 0; i < box.length; i++) {
            const j = (i + 1) % box.length;
            const dx = box[j][0] - box[i][0];
            const dy = box[j][1] - box[i][1];
            perimeter += Math.sqrt(dx * dx + dy * dy);
        }
        
        // Calculate area
        let area = 0;
        for (let i = 0; i < box.length; i++) {
            const j = (i + 1) % box.length;
            area += box[i][0] * box[j][1] - box[j][0] * box[i][1];
        }
        area = Math.abs(area) / 2;
        
        // Calculate distance to expand
        const distance = area * this.unclipRatio / perimeter;
        
        // Expand box
        const expandedBox = [];
        for (let i = 0; i < box.length; i++) {
            const prev = box[(i - 1 + box.length) % box.length];
            const curr = box[i];
            const next = box[(i + 1) % box.length];
            
            // Calculate normal vector
            const v1 = [prev[0] - curr[0], prev[1] - curr[1]];
            const v2 = [next[0] - curr[0], next[1] - curr[1]];
            
            const len1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]);
            const len2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);
            
            if (len1 > 0) {
                v1[0] /= len1;
                v1[1] /= len1;
            }
            if (len2 > 0) {
                v2[0] /= len2;
                v2[1] /= len2;
            }
            
            const bisector = [v1[0] + v2[0], v1[1] + v2[1]];
            const bisectorLen = Math.sqrt(bisector[0] * bisector[0] + bisector[1] * bisector[1]);
            
            if (bisectorLen > 0) {
                bisector[0] /= bisectorLen;
                bisector[1] /= bisectorLen;
                
                expandedBox.push([
                    curr[0] - bisector[0] * distance,
                    curr[1] - bisector[1] * distance
                ]);
            } else {
                expandedBox.push(curr);
            }
        }
        
        return expandedBox;
    }

    rescaleBox(box, shape) {
        const [origH, origW, ratioH, ratioW] = shape;
        
        return box.map(point => [
            point[0] / ratioW,
            point[1] / ratioH
        ]);
    }

    validateBox(box) {
        // Calculate box dimensions
        const width = Math.max(
            this.distance(box[0], box[1]),
            this.distance(box[2], box[3])
        );
        const height = Math.max(
            this.distance(box[0], box[3]),
            this.distance(box[1], box[2])
        );
        
        return width >= this.minSize && height >= this.minSize;
    }

    distance(p1, p2) {
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        return Math.sqrt(dx * dx + dy * dy);
    }
}

/**
 * Classification postprocessing
 */
export class ClassificationPostProcessor {
    constructor(options = {}) {
        this.labelList = options.label_list || ['0', '180'];
        this.clsThresh = options.cls_thresh || 0.9;
    }

    process(predictions) {
        const results = [];
        const preds = predictions[0];
        
        for (let i = 0; i < preds.length; i++) {
            const pred = preds[i];
            const maxIdx = pred.indexOf(Math.max(...pred));
            const score = pred[maxIdx];
            const label = this.labelList[maxIdx];
            
            results.push({
                label,
                score,
                shouldRotate: label === '180' && score > this.clsThresh
            });
        }
        
        return results;
    }
}

/**
 * CTC (Connectionist Temporal Classification) decoder for text recognition
 */
export class CTCDecoder {
    constructor(characterDict) {
        this.characterDict = characterDict;
        this.blankIdx = characterDict.length; // Blank token is usually at the end
    }

    decode(predictions, method = 'greedy') {
        if (method === 'greedy') {
            return this.greedyDecode(predictions);
        } else if (method === 'beam_search') {
            return this.beamSearchDecode(predictions);
        }
        throw new Error(`Unknown decode method: ${method}`);
    }

    greedyDecode(predictions) {
        const results = [];
        
        for (const pred of predictions) {
            const indices = [];
            let lastIdx = -1;
            
            // Get max indices
            for (let t = 0; t < pred.length; t++) {
                const maxIdx = pred[t].indexOf(Math.max(...pred[t]));
                
                // Skip blanks and repeated characters
                if (maxIdx !== this.blankIdx && maxIdx !== lastIdx) {
                    indices.push(maxIdx);
                }
                lastIdx = maxIdx;
            }
            
            // Convert indices to text
            const text = indices.map(idx => this.characterDict[idx]).join('');
            const confidence = this.calculateConfidence(pred, indices);
            
            results.push({ text, confidence });
        }
        
        return results;
    }

    beamSearchDecode(predictions, beamWidth = 5) {
        const results = [];
        
        for (const pred of predictions) {
            const beams = this.beamSearch(pred, beamWidth);
            const bestBeam = beams[0];
            
            results.push({
                text: bestBeam.text,
                confidence: bestBeam.score
            });
        }
        
        return results;
    }

    beamSearch(pred, beamWidth) {
        let beams = [{ text: '', score: 1.0, lastIdx: -1 }];
        
        for (let t = 0; t < pred.length; t++) {
            const newBeams = [];
            
            for (const beam of beams) {
                // Get top k indices
                const probs = pred[t];
                const topK = this.getTopK(probs, beamWidth);
                
                for (const [idx, prob] of topK) {
                    if (idx === this.blankIdx) {
                        // Blank token - keep current beam
                        newBeams.push({
                            text: beam.text,
                            score: beam.score * prob,
                            lastIdx: idx
                        });
                    } else if (idx !== beam.lastIdx) {
                        // New character
                        newBeams.push({
                            text: beam.text + this.characterDict[idx],
                            score: beam.score * prob,
                            lastIdx: idx
                        });
                    } else {
                        // Repeated character - keep current beam
                        newBeams.push({
                            text: beam.text,
                            score: beam.score * prob,
                            lastIdx: idx
                        });
                    }
                }
            }
            
            // Keep top beams
            newBeams.sort((a, b) => b.score - a.score);
            beams = newBeams.slice(0, beamWidth);
        }
        
        return beams;
    }

    getTopK(arr, k) {
        const indexed = arr.map((val, idx) => [idx, val]);
        indexed.sort((a, b) => b[1] - a[1]);
        return indexed.slice(0, k);
    }

    calculateConfidence(pred, indices) {
        if (indices.length === 0) return 0;
        
        let totalConf = 0;
        let t = 0;
        
        for (const idx of indices) {
            // Find the time step where this character appears
            while (t < pred.length) {
                const maxIdx = pred[t].indexOf(Math.max(...pred[t]));
                if (maxIdx === idx) {
                    totalConf += pred[t][idx];
                    t++;
                    break;
                }
                t++;
            }
        }
        
        return totalConf / indices.length;
    }
}

/**
 * Sort detected text boxes from top to bottom, left to right
 */
export function sortBoxes(boxes) {
    if (!boxes || boxes.length === 0) return [];
    
    // Calculate center points
    const boxesWithCenter = boxes.map((box, index) => {
        const centerX = box.reduce((sum, p) => sum + p[0], 0) / box.length;
        const centerY = box.reduce((sum, p) => sum + p[1], 0) / box.length;
        return { box, index, centerX, centerY };
    });
    
    // Sort by y coordinate first, then by x coordinate
    boxesWithCenter.sort((a, b) => {
        // If boxes are on the same line (y difference < 10 pixels)
        if (Math.abs(a.centerY - b.centerY) < 10) {
            return a.centerX - b.centerX;
        }
        return a.centerY - b.centerY;
    });
    
    return boxesWithCenter.map(item => item.box);
}