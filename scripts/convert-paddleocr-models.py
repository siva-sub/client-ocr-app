#!/usr/bin/env python3
"""
Convert PaddleOCR models to optimized ONNX format using Paddle2ONNX
Based on PaddleOCR 3.x documentation
"""

import os
import sys
import subprocess
import argparse
import json
from pathlib import Path

# Model URLs for PP-OCRv5
MODEL_URLS = {
    "det": {
        "mobile": "https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/ch_PP-OCRv4_det_infer.tar",
        "server": "https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/ch_PP-OCRv4_det_server_infer.tar"
    },
    "rec": {
        "mobile_en": "https://paddleocr.bj.bcebos.com/PP-OCRv4/english/en_PP-OCRv4_rec_infer.tar",
        "mobile_ch": "https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/ch_PP-OCRv4_rec_infer.tar",
        "server_en": "https://paddleocr.bj.bcebos.com/PP-OCRv4/english/en_PP-OCRv4_rec_server_infer.tar"
    }
}

# ONNX optimization settings for web deployment
ONNX_SETTINGS = {
    "opset_version": 11,  # Higher opset for better operator support
    "enable_onnx_checker": True,
    "enable_auto_update_opset": True,
    "deploy_backend": "onnxruntime",  # Optimize for ONNX Runtime
    "save_external_data": False,  # Keep model in single file
    "enable_optimize": True,  # Enable graph optimizations
}

def download_model(url, output_dir):
    """Download and extract PaddleOCR model"""
    filename = url.split('/')[-1]
    filepath = os.path.join(output_dir, filename)
    
    if not os.path.exists(filepath):
        print(f"Downloading {filename}...")
        subprocess.run(["wget", "-q", url, "-O", filepath], check=True)
    
    # Extract tar file
    extract_dir = filepath.replace('.tar', '')
    if not os.path.exists(extract_dir):
        print(f"Extracting {filename}...")
        subprocess.run(["tar", "-xf", filepath, "-C", output_dir], check=True)
    
    return extract_dir

def convert_to_onnx(paddle_model_dir, onnx_output_path, model_type="det"):
    """Convert Paddle model to optimized ONNX format"""
    print(f"Converting {model_type} model to ONNX...")
    
    # Prepare conversion command
    cmd = [
        "paddle2onnx",
        "--model_dir", paddle_model_dir,
        "--model_filename", "inference.pdmodel",
        "--params_filename", "inference.pdiparams",
        "--save_file", onnx_output_path,
        "--opset_version", str(ONNX_SETTINGS["opset_version"]),
        "--deploy_backend", ONNX_SETTINGS["deploy_backend"]
    ]
    
    if ONNX_SETTINGS["enable_onnx_checker"]:
        cmd.append("--enable_onnx_checker")
    
    if ONNX_SETTINGS["enable_auto_update_opset"]:
        cmd.append("--enable_auto_update_opset")
    
    # Add input/output specs for better optimization
    if model_type == "det":
        cmd.extend([
            "--input_shape_dict", '{"x": [-1, 3, -1, -1]}',
        ])
    else:  # rec
        cmd.extend([
            "--input_shape_dict", '{"x": [-1, 3, 48, -1]}',
        ])
    
    # Run conversion
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"Error converting model: {result.stderr}")
        raise RuntimeError(f"Model conversion failed: {result.stderr}")
    
    print(f"Successfully converted to {onnx_output_path}")
    return onnx_output_path

def optimize_onnx_for_web(onnx_path, optimized_path):
    """Further optimize ONNX model for web deployment"""
    print(f"Optimizing ONNX model for web deployment...")
    
    try:
        import onnx
        from onnxruntime.transformers import optimizer
        from onnxruntime.quantization import quantize_dynamic, QuantType
        
        # Load model
        model = onnx.load(onnx_path)
        
        # Run ONNX Runtime optimizations
        optimized_model = optimizer.optimize_model(
            onnx_path,
            model_type='bert',  # Use bert optimization passes
            num_heads=0,  # Will be auto-detected
            hidden_size=0,  # Will be auto-detected
            optimization_options=optimizer.FusionOptions('all')
        )
        
        # Save optimized model
        optimized_model.save_model_to_file(optimized_path)
        
        # Optionally create quantized version for smaller size
        quantized_path = optimized_path.replace('.onnx', '_quantized.onnx')
        quantize_dynamic(
            optimized_path,
            quantized_path,
            weight_type=QuantType.QUInt8
        )
        
        print(f"Optimization complete: {optimized_path}")
        print(f"Quantized version: {quantized_path}")
        
        # Compare file sizes
        original_size = os.path.getsize(onnx_path) / (1024 * 1024)
        optimized_size = os.path.getsize(optimized_path) / (1024 * 1024)
        quantized_size = os.path.getsize(quantized_path) / (1024 * 1024)
        
        print(f"Size comparison:")
        print(f"  Original: {original_size:.2f} MB")
        print(f"  Optimized: {optimized_size:.2f} MB ({(1 - optimized_size/original_size)*100:.1f}% reduction)")
        print(f"  Quantized: {quantized_size:.2f} MB ({(1 - quantized_size/original_size)*100:.1f}% reduction)")
        
    except ImportError:
        print("Warning: onnxruntime optimization tools not available")
        print("Install with: pip install onnxruntime-tools")
        # Just copy the file if optimization tools aren't available
        import shutil
        shutil.copy2(onnx_path, optimized_path)

def create_model_metadata(models_info, output_path):
    """Create metadata file for converted models"""
    metadata = {
        "version": "PP-OCRv5",
        "models": models_info,
        "conversion_settings": ONNX_SETTINGS,
        "optimization_notes": {
            "detection": {
                "input_shape": "[-1, 3, -1, -1]",
                "notes": "Dynamic batch and spatial dimensions"
            },
            "recognition": {
                "input_shape": "[-1, 3, 48, -1]",
                "notes": "Fixed height of 48, dynamic width"
            }
        }
    }
    
    with open(output_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Model metadata saved to {output_path}")

def main():
    parser = argparse.ArgumentParser(description="Convert PaddleOCR models to optimized ONNX")
    parser.add_argument("--output-dir", default="./onnx_models", help="Output directory for ONNX models")
    parser.add_argument("--models", nargs="+", default=["det_mobile", "rec_mobile_en"], 
                        help="Models to convert (det_mobile, det_server, rec_mobile_en, rec_mobile_ch)")
    parser.add_argument("--skip-download", action="store_true", help="Skip downloading if models exist")
    parser.add_argument("--skip-optimization", action="store_true", help="Skip ONNX optimization step")
    
    args = parser.parse_args()
    
    # Create directories
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    temp_dir = output_dir / "temp"
    temp_dir.mkdir(exist_ok=True)
    
    models_info = {}
    
    for model_spec in args.models:
        try:
            model_type, variant = model_spec.split('_', 1)
            
            if model_type == "det":
                url = MODEL_URLS["det"].get(variant)
                model_name = f"PP-OCRv5_{variant}_det"
            elif model_type == "rec":
                url = MODEL_URLS["rec"].get(f"{variant}")
                model_name = f"PP-OCRv5_{variant}_rec"
            else:
                print(f"Unknown model type: {model_type}")
                continue
            
            if not url:
                print(f"Unknown model variant: {model_spec}")
                continue
            
            print(f"\nProcessing {model_name}...")
            
            # Download and extract
            paddle_model_dir = download_model(url, str(temp_dir))
            
            # Convert to ONNX
            onnx_path = output_dir / f"{model_name}.onnx"
            convert_to_onnx(paddle_model_dir, str(onnx_path), model_type)
            
            # Optimize for web
            if not args.skip_optimization:
                optimized_path = output_dir / f"{model_name}_optimized.onnx"
                optimize_onnx_for_web(str(onnx_path), str(optimized_path))
                
                models_info[model_name] = {
                    "type": model_type,
                    "variant": variant,
                    "original_onnx": str(onnx_path.name),
                    "optimized_onnx": str(optimized_path.name),
                    "quantized_onnx": str(optimized_path.name.replace('.onnx', '_quantized.onnx'))
                }
            else:
                models_info[model_name] = {
                    "type": model_type,
                    "variant": variant,
                    "onnx": str(onnx_path.name)
                }
            
        except Exception as e:
            print(f"Error processing {model_spec}: {e}")
            continue
    
    # Create metadata
    create_model_metadata(models_info, output_dir / "models_metadata.json")
    
    print("\nConversion complete!")
    print(f"Models saved to: {output_dir}")
    
    # Cleanup
    print("\nCleaning up temporary files...")
    subprocess.run(["rm", "-rf", str(temp_dir)], check=True)

if __name__ == "__main__":
    main()