#!/bin/bash

# Script to download and prepare PP-OCRv5 models for web deployment
# Based on PaddleOCR 3.x documentation with high-performance optimization

set -e

echo "======================================"
echo "PP-OCRv5 Model Preparation Script"
echo "Based on PaddleOCR 3.x Documentation"
echo "======================================"

# Create directories
BASE_DIR="public/models/ppocr-v5"
mkdir -p $BASE_DIR/{mobile,server,temp}
cd $BASE_DIR

# PP-OCRv5 Model URLs - Both Mobile and Server versions
# Mobile models (faster, smaller, suitable for real-time)
DET_MOBILE_URL="https://paddleocr.bj.bcebos.com/PP-OCRv5/chinese/ch_PP-OCRv5_det_infer.tar"
REC_EN_MOBILE_URL="https://paddleocr.bj.bcebos.com/PP-OCRv5/english/en_PP-OCRv5_rec_infer.tar"

# Server models (more accurate, larger, better for high-quality OCR)
DET_SERVER_URL="https://paddleocr.bj.bcebos.com/PP-OCRv5/chinese/ch_PP-OCRv5_det_server_infer.tar"
REC_EN_SERVER_URL="https://paddleocr.bj.bcebos.com/PP-OCRv5/english/en_PP-OCRv5_rec_server_infer.tar"

# Function to download and extract model
download_model() {
    local url=$1
    local output_dir=$2
    local filename=$(basename $url)
    
    cd temp
    if [ ! -f "$filename" ]; then
        echo "Downloading $filename..."
        wget -q --show-progress $url
    fi
    
    echo "Extracting $filename..."
    tar -xf $filename
    cd ..
}

# Check for PaddleX CLI installation (as per PaddleOCR 3.x docs)
if ! command -v paddlex &> /dev/null; then
    echo "Installing PaddleX CLI for model conversion..."
    pip install paddlex paddle2onnx onnx onnxruntime-tools
fi

# Install paddle2onnx plugin via PaddleX
echo "Setting up paddle2onnx plugin..."
paddlex --install paddle2onnx

# Function to convert model using PaddleX CLI (as per docs)
convert_model_paddlex() {
    local paddle_dir=$1
    local onnx_file=$2
    local model_type=$3
    local opset_version=${4:-13}  # Default to opset 13 for better web compatibility
    
    echo "Converting $paddle_dir to $onnx_file using PaddleX..."
    
    # Use PaddleX CLI for conversion as per documentation
    paddlex \
        --paddle2onnx \
        --paddle_model_dir "$paddle_dir" \
        --onnx_model_dir "$(dirname $onnx_file)" \
        --opset_version $opset_version
    
    # Rename output to our desired filename
    mv "$(dirname $onnx_file)/model.onnx" "$onnx_file"
}

# Alternative: Direct paddle2onnx conversion with optimizations
convert_model_direct() {
    local paddle_dir=$1
    local onnx_file=$2
    local model_type=$3
    
    echo "Converting $paddle_dir to $onnx_file..."
    
    if [ "$model_type" == "det" ]; then
        # Detection model with dynamic input
        paddle2onnx \
            --model_dir "$paddle_dir" \
            --model_filename inference.pdmodel \
            --params_filename inference.pdiparams \
            --save_file "$onnx_file" \
            --opset_version 13 \
            --enable_onnx_checker \
            --enable_auto_update_opset \
            --deploy_backend onnxruntime \
            --input_shape_dict '{"x": [1, 3, 960, 960]}'
    else
        # Recognition model with fixed height
        paddle2onnx \
            --model_dir "$paddle_dir" \
            --model_filename inference.pdmodel \
            --params_filename inference.pdiparams \
            --save_file "$onnx_file" \
            --opset_version 13 \
            --enable_onnx_checker \
            --enable_auto_update_opset \
            --deploy_backend onnxruntime \
            --input_shape_dict '{"x": [1, 3, 48, 320]}'
    fi
}

# Download all models
echo -e "\n=== Phase 1: Downloading Models ==="
download_model $DET_MOBILE_URL temp
download_model $REC_EN_MOBILE_URL temp
download_model $DET_SERVER_URL temp
download_model $REC_EN_SERVER_URL temp

# Convert models to ONNX
echo -e "\n=== Phase 2: Converting to ONNX ==="

# Mobile models
echo "Converting mobile models..."
convert_model_direct "temp/ch_PP-OCRv5_det_infer" "mobile/det_mobile.onnx" "det"
convert_model_direct "temp/en_PP-OCRv5_rec_infer" "mobile/rec_en_mobile.onnx" "rec"

# Server models
echo "Converting server models..."
convert_model_direct "temp/ch_PP-OCRv5_det_server_infer" "server/det_server.onnx" "det"
convert_model_direct "temp/en_PP-OCRv5_rec_server_infer" "server/rec_en_server.onnx" "rec"

# Optimize models for web deployment
echo -e "\n=== Phase 3: Optimizing for Web ==="
python3 - <<'EOF'
import os
import json
try:
    from onnxruntime.tools.optimizer import optimize_model
    
    def optimize_onnx_model(input_path, output_path, model_type="det"):
        print(f"Optimizing {input_path}...")
        
        # Use optimization level 99 for maximum optimization
        optimize_model(
            input=input_path,
            output=output_path,
            model_type='bert',  # Generic optimization
            opt_level=99,       # Maximum optimization
            use_gpu=False,      # CPU optimization for web
            only_onnxruntime=True,
            verbose=False
        )
        
        # Calculate size reduction
        orig_size = os.path.getsize(input_path) / (1024 * 1024)
        opt_size = os.path.getsize(output_path) / (1024 * 1024)
        reduction = (1 - opt_size/orig_size) * 100
        
        print(f"  Original: {orig_size:.2f} MB")
        print(f"  Optimized: {opt_size:.2f} MB ({reduction:.1f}% reduction)")
    
    # Optimize all models
    models = [
        ("mobile/det_mobile.onnx", "mobile/det_mobile_opt.onnx", "det"),
        ("mobile/rec_en_mobile.onnx", "mobile/rec_en_mobile_opt.onnx", "rec"),
        ("server/det_server.onnx", "server/det_server_opt.onnx", "det"),
        ("server/rec_en_server.onnx", "server/rec_en_server_opt.onnx", "rec")
    ]
    
    for input_model, output_model, model_type in models:
        if os.path.exists(input_model):
            optimize_onnx_model(input_model, output_model, model_type)
    
    # Create comprehensive metadata
    metadata = {
        "version": "PP-OCRv5",
        "created": "2025-07",
        "models": {
            "mobile": {
                "detection": {
                    "file": "det_mobile_opt.onnx",
                    "original_size_mb": round(os.path.getsize("mobile/det_mobile.onnx") / (1024 * 1024), 2),
                    "optimized_size_mb": round(os.path.getsize("mobile/det_mobile_opt.onnx") / (1024 * 1024), 2),
                    "input_shape": [1, 3, 960, 960],
                    "preprocessing": {
                        "mean": [0.485, 0.456, 0.406],
                        "std": [0.229, 0.224, 0.225]
                    }
                },
                "recognition": {
                    "file": "rec_en_mobile_opt.onnx",
                    "original_size_mb": round(os.path.getsize("mobile/rec_en_mobile.onnx") / (1024 * 1024), 2),
                    "optimized_size_mb": round(os.path.getsize("mobile/rec_en_mobile_opt.onnx") / (1024 * 1024), 2),
                    "input_shape": [1, 3, 48, 320],
                    "preprocessing": {
                        "mean": [0.5, 0.5, 0.5],
                        "std": [0.5, 0.5, 0.5]
                    }
                }
            },
            "server": {
                "detection": {
                    "file": "det_server_opt.onnx",
                    "original_size_mb": round(os.path.getsize("server/det_server.onnx") / (1024 * 1024), 2),
                    "optimized_size_mb": round(os.path.getsize("server/det_server_opt.onnx") / (1024 * 1024), 2),
                    "input_shape": [1, 3, 1280, 1280],
                    "preprocessing": {
                        "mean": [0.485, 0.456, 0.406],
                        "std": [0.229, 0.224, 0.225]
                    }
                },
                "recognition": {
                    "file": "rec_en_server_opt.onnx",
                    "original_size_mb": round(os.path.getsize("server/rec_en_server.onnx") / (1024 * 1024), 2),
                    "optimized_size_mb": round(os.path.getsize("server/rec_en_server_opt.onnx") / (1024 * 1024), 2),
                    "input_shape": [1, 3, 48, 480],
                    "preprocessing": {
                        "mean": [0.5, 0.5, 0.5],
                        "std": [0.5, 0.5, 0.5]
                    }
                }
            }
        },
        "optimization_notes": {
            "opset_version": 13,
            "optimization_level": 99,
            "backend": "onnxruntime",
            "techniques": [
                "Graph optimization",
                "Operator fusion",
                "Constant folding",
                "Dead code elimination"
            ]
        },
        "performance_recommendations": {
            "mobile": "Use for real-time OCR, web applications, and resource-constrained environments",
            "server": "Use for batch processing, high-accuracy requirements, and when resources allow"
        }
    }
    
    with open("model_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    
    print("\nModel metadata saved to model_metadata.json")
    
except ImportError as e:
    print(f"Warning: Could not import optimization tools: {e}")
    print("Models converted but not optimized. Install onnxruntime-tools for optimization.")
EOF

# Clean up
echo -e "\n=== Phase 4: Cleanup ==="
rm -rf temp

# Final summary
echo -e "\n======================================"
echo "Model preparation complete!"
echo "======================================"
echo "Location: $(pwd)"
echo ""
echo "Mobile models (faster, smaller):"
ls -la mobile/*.onnx 2>/dev/null || echo "  No mobile models found"
echo ""
echo "Server models (more accurate):"
ls -la server/*.onnx 2>/dev/null || echo "  No server models found"
echo ""
echo "Use mobile models for real-time applications"
echo "Use server models for highest accuracy"