#!/bin/bash
# AEO-KVM Build Setup
# Builds self-contained executables for Linux and Windows
#
# Usage: ./build/setup.sh [--linux-only] [--windows-only]
#
# This script will:
# 1. Install build dependencies (requires sudo, if needed)
# 2. Build hidapi from source
# 3. Copy libraries to libs/
# 4. Build executables with bun into platform-specific directories

set -e

# Parse arguments
BUILD_LINUX=1
BUILD_WINDOWS=1
for arg in "$@"; do
    case $arg in
        --linux-only)
            BUILD_WINDOWS=0
            ;;
        --windows-only)
            BUILD_LINUX=0
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LIBS_DIR="$PROJECT_DIR/libs"
BUILD_TMP="/tmp/aeo-kvm-build"

echo "=== AEO-KVM Build Setup ==="
echo ""

# Check for bun
if ! command -v bun &> /dev/null; then
    echo "Error: bun is required but not installed"
    echo "Install with: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Step 1: Check/install build dependencies
echo "[1/4] Checking build dependencies..."

NEED_INSTALL=0
check_pkg() {
    if ! dpkg -s "$1" &>/dev/null; then
        echo "  Missing: $1"
        NEED_INSTALL=1
    fi
}

if command -v dpkg &> /dev/null; then
    check_pkg libudev-dev
    check_pkg libusb-1.0-0-dev
    check_pkg cmake
    check_pkg build-essential
    check_pkg git
    check_pkg unzip

    if [ $NEED_INSTALL -eq 1 ]; then
        echo ""
        echo "Installing missing packages (requires sudo)..."
        sudo apt-get update -qq
        sudo apt-get install -y -qq libudev-dev libusb-1.0-0-dev cmake build-essential git unzip curl
    else
        echo "  All dependencies installed"
    fi
elif command -v dnf &> /dev/null; then
    sudo dnf install -y systemd-devel libusb1-devel cmake gcc gcc-c++ git unzip curl
else
    echo "Warning: Unknown package manager. Please ensure libudev-dev, libusb-1.0-0-dev, cmake, and build tools are installed."
fi

# Step 2: Download/build hidapi
echo "[2/4] Building hidapi..."
mkdir -p "$BUILD_TMP"
cd "$BUILD_TMP"

if [ ! -d "hidapi" ]; then
    git clone --depth 1 https://github.com/libusb/hidapi.git
fi

cd hidapi
mkdir -p build
cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)

# Step 3: Copy libraries
echo "[3/4] Copying libraries..."
mkdir -p "$LIBS_DIR"

# Linux library
cp "$BUILD_TMP/hidapi/build/src/linux/libhidapi-hidraw.so.0" "$LIBS_DIR/"
echo "  Copied libhidapi-hidraw.so.0"

# Windows library - download if not present
if [ ! -f "$LIBS_DIR/hidapi.dll" ]; then
    echo "  Downloading Windows hidapi..."
    cd "$LIBS_DIR"
    curl -sL https://github.com/libusb/hidapi/releases/download/hidapi-0.14.0/hidapi-win.zip -o hidapi-win.zip
    unzip -o -q hidapi-win.zip
    cp x64/hidapi.dll .
    rm -rf hidapi-win.zip include x64 x86
fi
echo "  Windows hidapi.dll ready"

# Step 4: Build executables
echo "[4/4] Building executables..."
cd "$PROJECT_DIR"

# Read version from pyproject.toml (source of truth)
VERSION=$(grep '^version' "$PROJECT_DIR/pyproject.toml" | sed 's/.*= "\(.*\)"/\1/')
echo "  Version: $VERSION"

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    LINUX_TARGET="bun-linux-arm64"
    LINUX_ARCH="arm64"
else
    LINUX_TARGET="bun-linux-x64"
    LINUX_ARCH="x64"
fi

# Create platform-specific directories
LINUX_DIST="$PROJECT_DIR/dist/linux-$LINUX_ARCH"
WIN_DIST="$PROJECT_DIR/dist/windows-x64"

# Build Linux
if [ "$BUILD_LINUX" = "1" ]; then
    echo "  Building Linux executable ($LINUX_TARGET)..."
    mkdir -p "$LINUX_DIST"
    bun build --compile --target=$LINUX_TARGET src/main-ffi.ts --outfile "$LINUX_DIST/aeo-kvm"
    cp "$LIBS_DIR/libhidapi-hidraw.so.0" "$LINUX_DIST/"
    cp "$PROJECT_DIR/scripts/install-linux.sh" "$LINUX_DIST/install.sh"
    cp "$PROJECT_DIR/scripts/uninstall-linux.sh" "$LINUX_DIST/uninstall.sh"
    chmod +x "$LINUX_DIST"/*.sh "$LINUX_DIST/aeo-kvm"
    # Generate checksums
    (cd "$LINUX_DIST" && sha256sum aeo-kvm libhidapi-hidraw.so.0 > SHA256SUMS)
    echo "  Linux package: dist/linux-$LINUX_ARCH/"
fi

# Build Windows (single self-installing exe with embedded DLL)
if [ "$BUILD_WINDOWS" = "1" ]; then
    echo "  Building Windows executable (x64, self-installing)..."
    mkdir -p "$WIN_DIST"
    bun build --compile --target=bun-windows-x64 src/main-ffi.ts --outfile "$WIN_DIST/aeo-kvm-installer.exe"
    # DLL is embedded in exe - no separate files needed!
    # Generate checksum
    (cd "$WIN_DIST" && sha256sum aeo-kvm-installer.exe > SHA256SUMS)
    echo "  Windows package: dist/windows-x64/ (single file!)"
fi

echo ""
echo "=== Build Complete (v$VERSION) ==="
echo ""
echo "Platform packages:"
[ "$BUILD_LINUX" = "1" ] && ls -lh "$LINUX_DIST/"
[ "$BUILD_WINDOWS" = "1" ] && ls -lh "$WIN_DIST/"

# Auto-install to deployment locations
echo ""
echo "[5/5] Installing to deployment locations..."

if [ "$BUILD_LINUX" = "1" ]; then
    mkdir -p /opt/aeo-kvm
    cp "$LINUX_DIST/aeo-kvm" /opt/aeo-kvm/
    cp "$LINUX_DIST/libhidapi-hidraw.so.0" /opt/aeo-kvm/
    echo "  Linux: /opt/aeo-kvm/aeo-kvm"
fi

if [ "$BUILD_WINDOWS" = "1" ]; then
    echo "  Deploying to Windows via SSH..."
    # Get Windows user's download path dynamically
    WIN_DOWNLOADS=$(ssh windows 'echo %USERPROFILE%\Downloads' 2>/dev/null | tr -d '\r')
    if [ -n "$WIN_DOWNLOADS" ] && scp "$WIN_DIST/aeo-kvm-installer.exe" "windows:$WIN_DOWNLOADS\\" 2>/dev/null; then
        echo "  Windows: copied to $WIN_DOWNLOADS"
        echo "  Running installer on Windows..."
        if ssh windows "$WIN_DOWNLOADS\\aeo-kvm-installer.exe" 2>/dev/null; then
            echo "  Windows: installed to %LOCALAPPDATA%\\aeo-kvm\\"
        else
            echo "  Windows: installer failed (run manually)"
        fi
    else
        echo "  Windows: SSH not available, saved to dist/windows-x64/"
    fi
fi

echo ""
echo "=== Deployment Complete ==="
