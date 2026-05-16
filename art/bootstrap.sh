#!/usr/bin/env bash
# Download Flux Schnell + text encoders + VAE into art/comfy-data/, and
# install the ComfyUI-GGUF custom node. Idempotent: skips files that
# already exist. Total disk: ~18 GB.
#
# Run from anywhere; paths are resolved relative to this script.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="$ROOT/comfy-data/ComfyUI"

UNET="$BASE/models/unet"
CLIP="$BASE/models/clip"
VAE="$BASE/models/vae"
NODES="$BASE/custom_nodes"

mkdir -p "$UNET" "$CLIP" "$VAE" "$NODES"

dl() {
  local url="$1" out="$2"
  if [[ -f "$out" ]]; then
    echo "skip (exists): ${out#$ROOT/}"
    return
  fi
  echo "downloading $(basename "$out") (this is the slow part)"
  curl -L --fail --retry 3 --retry-delay 5 -o "$out.tmp" "$url"
  mv "$out.tmp" "$out"
}

# Flux Schnell UNet, Q8 GGUF quantization (~12 GB; near-fp16 quality at half disk).
dl "https://huggingface.co/city96/FLUX.1-schnell-gguf/resolve/main/flux1-schnell-Q8_0.gguf" \
   "$UNET/flux1-schnell-Q8_0.gguf"

# T5-XXL text encoder, fp8 (~4.9 GB).
dl "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors" \
   "$CLIP/t5xxl_fp8_e4m3fn.safetensors"

# CLIP-L text encoder (~246 MB).
dl "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors" \
   "$CLIP/clip_l.safetensors"

# Flux VAE (~335 MB). FLUX.1-schnell is Apache-2.0 and ungated.
dl "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/ae.safetensors" \
   "$VAE/ae.safetensors"

# ComfyUI-GGUF custom node: lets ComfyUI load the .gguf UNet above.
if [[ ! -d "$NODES/ComfyUI-GGUF" ]]; then
  echo "cloning ComfyUI-GGUF custom node"
  git clone --depth=1 https://github.com/city96/ComfyUI-GGUF.git "$NODES/ComfyUI-GGUF"
else
  echo "skip (exists): custom_nodes/ComfyUI-GGUF"
fi

echo
echo "done. start (or restart) the container so it picks up new files:"
echo "  docker compose up -d comfyui      # if not running"
echo "  docker compose restart comfyui    # if already running"
