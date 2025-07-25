#!/bin/bash

# Create models directory
mkdir -p public/models

# Download models from paddleocr.js repository
echo "Downloading PaddleOCR models from X3ZvaWQ/paddleocr.js..."

# Detection model
echo "Downloading detection model..."
curl -L "https://raw.githubusercontent.com/X3ZvaWQ/paddleocr.js/main/assets/ch_PP-OCRv4_det_infer.onnx" -o public/models/ch_PP-OCRv4_det_infer.onnx

# Recognition model
echo "Downloading recognition model..."
curl -L "https://raw.githubusercontent.com/X3ZvaWQ/paddleocr.js/main/assets/ch_PP-OCRv4_rec_infer.onnx" -o public/models/ch_PP-OCRv4_rec_infer.onnx

# English recognition model
echo "Downloading English recognition model..."
curl -L "https://raw.githubusercontent.com/X3ZvaWQ/paddleocr.js/main/assets/en_PP-OCRv4_rec_infer.onnx" -o public/models/en_PP-OCRv4_rec_infer_new.onnx

# Dictionary files
echo "Downloading dictionary files..."
curl -L "https://raw.githubusercontent.com/X3ZvaWQ/paddleocr.js/main/assets/ppocr_keys_v1.txt" -o public/models/ppocr_keys_v1_new.txt
curl -L "https://raw.githubusercontent.com/X3ZvaWQ/paddleocr.js/main/assets/dict.txt" -o public/models/dict.txt

# Download PDF-Extract-Kit scripts
echo "Downloading PDF-Extract-Kit scripts..."
mkdir -p public/scripts

# Table parsing script
echo "Downloading table parsing script..."
curl -L "https://raw.githubusercontent.com/opendatalab/PDF-Extract-Kit/main/scripts/table_parsing.py" -o public/scripts/table_parsing.py

# Layout detection script
echo "Downloading layout detection script..."
curl -L "https://raw.githubusercontent.com/opendatalab/PDF-Extract-Kit/main/scripts/layout_detection.py" -o public/scripts/layout_detection.py

# Formula detection script
echo "Downloading formula detection script..."
curl -L "https://raw.githubusercontent.com/opendatalab/PDF-Extract-Kit/main/scripts/formula_detection.py" -o public/scripts/formula_detection.py

# Formula recognition script
echo "Downloading formula recognition script..."
curl -L "https://raw.githubusercontent.com/opendatalab/PDF-Extract-Kit/main/scripts/formula_recognition.py" -o public/scripts/formula_recognition.py

echo "All models and scripts downloaded successfully!"
ls -la public/models/
ls -la public/scripts/