#!/bin/bash

# Download PP-OCR models from ppu-paddle-ocr repository

echo "Downloading PP-OCR models..."

# Base URL
BASE_URL="https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr/main/models"

# Create models directory
mkdir -p public/models

# Download detection model (PP-OCRv5)
echo "Downloading PP-OCRv5 detection model..."
curl -L -o public/models/PP-OCRv5_mobile_det_infer.onnx \
  "${BASE_URL}/PP-OCRv5_mobile_det_infer.onnx"

# Download English recognition model (PP-OCRv4)
echo "Downloading English recognition model..."
curl -L -o public/models/en_PP-OCRv4_mobile_rec_infer.onnx \
  "${BASE_URL}/en_PP-OCRv4_mobile_rec_infer.onnx"

# Download English dictionary from PaddleOCR
echo "Downloading English dictionary..."
curl -L -o public/models/en_dict.txt \
  "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.7/ppocr/utils/en_dict.txt"

# Download ppocr_keys_v1.txt from PaddleOCR
echo "Downloading ppocr_keys_v1.txt..."
curl -L -o public/models/ppocr_keys_v1.txt \
  "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.7/ppocr/utils/ppocr_keys_v1.txt"

echo "All models downloaded!"
echo "Model sizes:"
ls -lh public/models/