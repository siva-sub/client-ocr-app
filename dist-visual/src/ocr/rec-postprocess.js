// Recognition postprocessing - CTC decoder
export class CTCLabelDecode {
  constructor({ characterDict = null, useSpaceChar = true } = {}) {
    this.characterDict = characterDict;
    this.useSpaceChar = useSpaceChar;
    
    // Build character mapping
    this.charList = [];
    if (characterDict) {
      this.charList = [...characterDict];
    }
    
    // Add blank token at the beginning
    this.charList.unshift('blank');
    
    // Create character to index mapping
    this.charToIdx = {};
    this.charList.forEach((char, idx) => {
      this.charToIdx[char] = idx;
    });
  }

  decode(preds, widthList = null) {
    // preds shape: [batch, time_steps, num_classes]
    const [batchSize, timeSteps, numClasses] = preds.dims;
    const predData = preds.data;
    
    const results = [];
    
    for (let b = 0; b < batchSize; b++) {
      // Get predictions for this batch item
      const batchPreds = [];
      const actualWidth = widthList ? Math.ceil(widthList[b] / 4) : timeSteps;
      
      for (let t = 0; t < actualWidth && t < timeSteps; t++) {
        const startIdx = b * timeSteps * numClasses + t * numClasses;
        const scores = Array.from(predData.slice(startIdx, startIdx + numClasses));
        const maxIdx = scores.indexOf(Math.max(...scores));
        const maxScore = scores[maxIdx];
        batchPreds.push({ idx: maxIdx, score: maxScore });
      }
      
      // Decode using CTC
      const decoded = this.ctcDecode(batchPreds);
      results.push(decoded);
    }
    
    return results;
  }

  ctcDecode(predictions) {
    // Remove consecutive duplicates and blank tokens
    const blankIdx = 0;
    const filtered = [];
    let prevIdx = -1;
    let scores = [];
    
    for (const pred of predictions) {
      if (pred.idx !== blankIdx && pred.idx !== prevIdx) {
        filtered.push(pred.idx);
        scores.push(pred.score);
      }
      prevIdx = pred.idx;
    }
    
    // Convert indices to characters
    const text = filtered
      .map(idx => this.charList[idx] || '')
      .join('');
    
    // Calculate average confidence
    const avgScore = scores.length > 0 
      ? scores.reduce((a, b) => a + b, 0) / scores.length 
      : 0;
    
    return [text, avgScore];
  }
}

export class AttnLabelDecode {
  constructor({ characterDict = null, useSpaceChar = true } = {}) {
    this.characterDict = characterDict;
    this.useSpaceChar = useSpaceChar;
    
    // Build character mapping with special tokens
    this.charList = ['<blank>', '<sos>', '<eos>'];
    if (characterDict) {
      this.charList.push(...characterDict);
    }
    
    this.sosIdx = 1;
    this.eosIdx = 2;
    
    // Create character to index mapping
    this.charToIdx = {};
    this.charList.forEach((char, idx) => {
      this.charToIdx[char] = idx;
    });
  }

  decode(preds) {
    // Attention-based decoding (simplified)
    const [batchSize, timeSteps, numClasses] = preds.dims;
    const predData = preds.data;
    
    const results = [];
    
    for (let b = 0; b < batchSize; b++) {
      const text = [];
      const scores = [];
      
      for (let t = 0; t < timeSteps; t++) {
        const startIdx = b * timeSteps * numClasses + t * numClasses;
        const logits = Array.from(predData.slice(startIdx, startIdx + numClasses));
        const maxIdx = logits.indexOf(Math.max(...logits));
        const maxScore = Math.exp(logits[maxIdx]) / logits.reduce((sum, x) => sum + Math.exp(x), 0);
        
        if (maxIdx === this.eosIdx) {
          break;
        }
        
        if (maxIdx !== this.sosIdx && maxIdx < this.charList.length) {
          text.push(this.charList[maxIdx]);
          scores.push(maxScore);
        }
      }
      
      const avgScore = scores.length > 0 
        ? scores.reduce((a, b) => a + b, 0) / scores.length 
        : 0;
      
      results.push([text.join(''), avgScore]);
    }
    
    return results;
  }
}