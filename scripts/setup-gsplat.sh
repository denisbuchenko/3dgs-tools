#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${GSPLAT_VENV:-"$ROOT_DIR/server/tools/nerfstudio"}"
if [[ -n "${PYTHON_BIN:-}" ]]; then
  PYTHON_BIN="$PYTHON_BIN"
elif command -v python3.10 >/dev/null 2>&1; then
  PYTHON_BIN="python3.10"
else
  PYTHON_BIN="python3"
fi
NERFSTUDIO_PACKAGE="${GSPLAT_BOOTSTRAP_PACKAGE:-nerfstudio}"

echo "Installing system packages for Gaussian Splatting..."
if command -v apt-get >/dev/null 2>&1; then
  if sudo -n true >/dev/null 2>&1 || [[ -t 0 ]]; then
    sudo apt-get update
    sudo apt-get install -y python3-pip python3-venv python3.10-venv python3-dev build-essential git ninja-build gcc-12 g++-12 nvidia-cuda-toolkit
  else
    echo "sudo is not available non-interactively. Continuing with local Python setup."
    echo "If installation fails, run manually: sudo apt install -y python3-pip python3-venv python3.10-venv python3-dev build-essential git ninja-build gcc-12 g++-12 nvidia-cuda-toolkit"
  fi
else
  echo "apt-get not found. Install Python venv/pip, build-essential, git, and ninja manually." >&2
fi

if ! command -v nvcc >/dev/null 2>&1; then
  echo
  echo "CUDA toolkit is not installed: gsplat needs nvcc to compile its CUDA backend."
  echo "Install it and run this script again:"
  echo
  echo "  sudo apt install -y nvidia-cuda-toolkit"
  echo
  exit 1
fi

if ! command -v gcc-12 >/dev/null 2>&1 || ! command -v g++-12 >/dev/null 2>&1; then
  echo
  echo "gcc-12/g++-12 are required for CUDA extension builds on Ubuntu 24.04."
  echo "Install them and run this script again:"
  echo
  echo "  sudo apt install -y gcc-12 g++-12"
  echo
  exit 1
fi

NVCC_VERSION="$(nvcc --version | sed -n 's/.*release \([0-9][0-9]*\)\..*/\1/p' | head -1)"
if [[ -z "${GSPLAT_TORCH_PACKAGE:-}" || -z "${GSPLAT_TORCH_INDEX_URL:-}" ]]; then
  if [[ "$NVCC_VERSION" == "12" ]]; then
    PYTORCH_PACKAGE="${GSPLAT_TORCH_PACKAGE:-torch==2.2.2+cu121 torchvision==0.17.2+cu121}"
    PYTORCH_INDEX_URL="${GSPLAT_TORCH_INDEX_URL:-https://download.pytorch.org/whl/cu121}"
  else
    PYTORCH_PACKAGE="${GSPLAT_TORCH_PACKAGE:-torch==2.1.2+cu118 torchvision==0.16.2+cu118}"
    PYTORCH_INDEX_URL="${GSPLAT_TORCH_INDEX_URL:-https://download.pytorch.org/whl/cu118}"
  fi
else
  PYTORCH_PACKAGE="$GSPLAT_TORCH_PACKAGE"
  PYTORCH_INDEX_URL="$GSPLAT_TORCH_INDEX_URL"
fi

echo "Recreating Nerfstudio environment: $VENV_DIR"
rm -rf "$VENV_DIR"
if ! "$PYTHON_BIN" -m venv "$VENV_DIR"; then
  echo
  echo "Python venv is not available on this system."
  echo "Run this command in your terminal, then run npm run setup:gsplat again:"
  echo
  echo "  sudo apt install -y python3-pip python3-venv python3.10-venv python3-dev build-essential git ninja-build"
  echo
  exit 1
fi

PIP_BIN="$VENV_DIR/bin/pip"
PYTHON_VENV_BIN="$VENV_DIR/bin/python"

echo "Upgrading Python packaging tools..."
if ! "$PYTHON_VENV_BIN" -m ensurepip --upgrade; then
  echo "ensurepip is unavailable. Bootstrapping pip with get-pip.py..."
  GET_PIP="$ROOT_DIR/server/tools/get-pip.py"
  mkdir -p "$(dirname "$GET_PIP")"
  "$PYTHON_BIN" - <<'PY' "$GET_PIP"
from pathlib import Path
from urllib.request import urlopen
import sys

target = Path(sys.argv[1])
target.write_bytes(urlopen("https://bootstrap.pypa.io/get-pip.py", timeout=60).read())
PY
  "$PYTHON_VENV_BIN" "$GET_PIP"
fi
"$PIP_BIN" install --upgrade pip "setuptools<81" wheel

echo "Installing PyTorch..."
"$PIP_BIN" install $PYTORCH_PACKAGE --extra-index-url "$PYTORCH_INDEX_URL"

echo "Installing Nerfstudio..."
"$PIP_BIN" install --upgrade "$NERFSTUDIO_PACKAGE"
"$PIP_BIN" install --upgrade "setuptools<81"

echo "Patching PyTorch pybind11 headers for CUDA 12 nvcc compatibility..."
"$PYTHON_VENV_BIN" <<'PY'
from pathlib import Path
import torch

cast_h = Path(torch.__file__).parent / "include" / "pybind11" / "cast.h"
text = cast_h.read_text()
old = """template <typename T>
typename make_caster<T>::template cast_op_type<T> cast_op(make_caster<T> &caster) {
    return caster.operator typename make_caster<T>::template cast_op_type<T>();
}
template <typename T>
typename make_caster<T>::template cast_op_type<typename std::add_rvalue_reference<T>::type>
cast_op(make_caster<T> &&caster) {
    return std::move(caster).operator typename make_caster<T>::
        template cast_op_type<typename std::add_rvalue_reference<T>::type>();
}
"""
new = """template <typename T>
typename make_caster<T>::template cast_op_type<T> cast_op(make_caster<T> &caster) {
    using result_t = typename make_caster<T>::template cast_op_type<T>;
    return caster.operator result_t();
}
template <typename T>
typename make_caster<T>::template cast_op_type<typename std::add_rvalue_reference<T>::type>
cast_op(make_caster<T> &&caster) {
    using result_t =
        typename make_caster<T>::template cast_op_type<typename std::add_rvalue_reference<T>::type>;
    return std::move(caster).operator result_t();
}
"""
if old in text:
    cast_h.write_text(text.replace(old, new))
PY

echo "Precompiling gsplat CUDA backend..."
TORCH_EXTENSIONS_DIR="$ROOT_DIR/server/tools/torch_extensions"
rm -rf "$TORCH_EXTENSIONS_DIR/gsplat_cuda"
mkdir -p "$TORCH_EXTENSIONS_DIR"
export TORCH_EXTENSIONS_DIR
export MAX_JOBS="${MAX_JOBS:-2}"
if command -v gcc-12 >/dev/null 2>&1; then
  export CC="${CC:-/usr/bin/gcc-12}"
fi
if command -v g++-12 >/dev/null 2>&1; then
  export CXX="${CXX:-/usr/bin/g++-12}"
  export CUDAHOSTCXX="${CUDAHOSTCXX:-/usr/bin/g++-12}"
fi
if [[ -z "${TORCH_CUDA_ARCH_LIST:-}" ]] && command -v nvidia-smi >/dev/null 2>&1; then
  TORCH_CUDA_ARCH_LIST="$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader | paste -sd ';' -)"
  export TORCH_CUDA_ARCH_LIST
fi
export TORCH_CUDA_ARCH_LIST="${TORCH_CUDA_ARCH_LIST:-8.6}"
export PYTORCH_CUDA_ALLOC_CONF="${PYTORCH_CUDA_ALLOC_CONF:-expandable_segments:True}"
"$PYTHON_VENV_BIN" - <<'PY'
import importlib

backend = importlib.import_module("gsplat.cuda._backend")
if getattr(backend, "_C", None) is None:
    raise SystemExit("gsplat CUDA backend did not compile")
print("gsplat CUDA backend is ready.")
PY

echo "Checking commands..."
"$VENV_DIR/bin/ns-train" --help >/dev/null
"$VENV_DIR/bin/ns-export" --help >/dev/null

echo "Gaussian Splatting setup is ready."
echo "Venv: $VENV_DIR"
