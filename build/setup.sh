#!/bin/bash
# AEO-KVM Build Setup
# Builds self-contained executables for Linux, Windows, and macOS.
#
# Usage: ./build/setup.sh [--linux-only] [--windows-only] [--mac-only]
#
# Builds are environment-conditional: each platform is built only when its
# native hidapi library can be produced on (or already exists for) this host.
#   - Linux   .so    : cmake on a Linux host, OR inside an Apple `container`
#                      Linux VM when on macOS (needs the `container` CLI)
#   - Windows  .dll   : downloaded from hidapi release -> any host with curl
#   - macOS   .dylib : installed via Homebrew         -> macOS host only
# A platform whose native lib cannot be obtained on this host is skipped and
# logged, unless that lib already exists in libs/.

set -e

HOST_OS="$(uname -s)"  # Linux | Darwin

# Parse arguments (an explicit --X-only overrides host auto-detection)
ONLY=""
for arg in "$@"; do
    case $arg in
        --linux-only)   ONLY="linux" ;;
        --windows-only) ONLY="windows" ;;
        --mac-only)     ONLY="mac" ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LIBS_DIR="$PROJECT_DIR/libs"
BUILD_TMP="/tmp/aeo-kvm-build"

# Portable sha256 (sha256sum on Linux, shasum on macOS)
sha256() {
    if command -v sha256sum &>/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}

# macOS-only: build libhidapi-hidraw.so.0 inside an Apple `container` Linux VM.
# Each `container run` is its own lightweight Linux VM (Virtualization.framework),
# so this produces a genuine Linux arm64 .so without a separate Linux host.
build_linux_lib_in_container() {
    echo "[lib] Building Linux libhidapi-hidraw.so.0 in an Apple 'container' VM..."
    # Lifecycle is driven entirely by Apple's `container` CLI (not brew services).
    # We only need it transiently: start it if it isn't already up, and stop it
    # afterward only if we were the ones who started it.
    local started=0
    if ! container system status &>/dev/null; then
        container system start &>/dev/null && started=1
    fi

    local rc=0
    container run --rm -v "$LIBS_DIR:/out" ubuntu:24.04 bash -c '
        set -e
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq pkg-config libudev-dev libusb-1.0-0-dev cmake build-essential git >/dev/null
        git clone --depth 1 https://github.com/libusb/hidapi.git /tmp/hidapi >/dev/null 2>&1
        cd /tmp/hidapi && mkdir -p build && cd build
        cmake .. -DCMAKE_BUILD_TYPE=Release >/dev/null
        make -j"$(nproc)" >/dev/null
        cp src/linux/libhidapi-hidraw.so.0 /out/
    ' || rc=$?

    # Tear down the VM/service if this build started it (transient build use).
    if [ "$started" = "1" ]; then
        echo "  Stopping the container service (started only for this build)..."
        container system stop &>/dev/null || true
    fi

    if [ "$rc" -ne 0 ] || [ ! -f "$LIBS_DIR/libhidapi-hidraw.so.0" ]; then
        echo "Error: container build did not produce libhidapi-hidraw.so.0"; exit 1
    fi
    echo "  Linux libhidapi-hidraw.so.0 ready (built in Apple container VM)"
}

echo "=== AEO-KVM Build Setup ==="
echo "  Host: $HOST_OS"
echo ""

# Check for bun
if ! command -v bun &> /dev/null; then
    echo "Error: bun is required but not installed"
    echo "Install with: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# --- Decide what to build -------------------------------------------------
# A platform is buildable if its native lib can be produced on this host,
# or already exists in libs/.
want() { [ -z "$ONLY" ] || [ "$ONLY" = "$1" ]; }

BUILD_LINUX=0; BUILD_WINDOWS=0; BUILD_MAC=0; LINUX_LIB_VIA_CONTAINER=0

if want linux; then
    if [ "$HOST_OS" = "Linux" ] || [ -f "$LIBS_DIR/libhidapi-hidraw.so.0" ]; then
        BUILD_LINUX=1
    elif [ "$HOST_OS" = "Darwin" ] && command -v container &>/dev/null; then
        # macOS: build the Linux .so inside an Apple `container` Linux VM
        BUILD_LINUX=1; LINUX_LIB_VIA_CONTAINER=1
    else
        echo "  Skip Linux: needs a Linux host, a prebuilt libs/libhidapi-hidraw.so.0,"
        echo "              or the Apple 'container' CLI on macOS (brew install container)"
    fi
fi

if want windows; then
    # The .dll is downloadable on any host with curl, and is embedded into
    # every target (even Linux/macOS) via the windows-installer import.
    if command -v curl &>/dev/null || [ -f "$LIBS_DIR/hidapi.dll" ]; then
        BUILD_WINDOWS=1
    else
        echo "  Skip Windows: curl unavailable and no hidapi.dll in libs/"
    fi
fi

if want mac; then
    if [ "$HOST_OS" = "Darwin" ] || [ -f "$LIBS_DIR/libhidapi.dylib" ]; then
        BUILD_MAC=1
    else
        echo "  Skip macOS: needs a macOS host to install libhidapi.dylib (none in libs/)"
    fi
fi

if [ "$BUILD_LINUX$BUILD_WINDOWS$BUILD_MAC" = "000" ]; then
    echo "Error: nothing to build on this host"
    exit 1
fi
echo "  Building: linux=$BUILD_LINUX windows=$BUILD_WINDOWS mac=$BUILD_MAC"
echo ""

mkdir -p "$LIBS_DIR"

# --- Native libraries -----------------------------------------------------

# Linux .so: cmake on a Linux host, or inside an Apple `container` VM on macOS
if [ "$BUILD_LINUX" = "1" ] && [ ! -f "$LIBS_DIR/libhidapi-hidraw.so.0" ] && [ "$LINUX_LIB_VIA_CONTAINER" = "1" ]; then
    build_linux_lib_in_container
fi

# Linux .so (build from source; Linux host only)
if [ "$BUILD_LINUX" = "1" ] && [ ! -f "$LIBS_DIR/libhidapi-hidraw.so.0" ]; then
    echo "[deps] Checking Linux build dependencies..."
    NEED_INSTALL=0
    check_pkg() { dpkg -s "$1" &>/dev/null || { echo "  Missing: $1"; NEED_INSTALL=1; }; }
    if command -v dpkg &>/dev/null; then
        for p in libudev-dev libusb-1.0-0-dev cmake build-essential git unzip; do check_pkg "$p"; done
        if [ $NEED_INSTALL -eq 1 ]; then
            echo "  Installing missing packages (requires sudo)..."
            sudo apt-get update -qq
            sudo apt-get install -y -qq libudev-dev libusb-1.0-0-dev cmake build-essential git unzip curl
        else
            echo "  All dependencies installed"
        fi
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y systemd-devel libusb1-devel cmake gcc gcc-c++ git unzip curl
    else
        echo "  Warning: unknown package manager; ensure cmake + build tools are present"
    fi

    echo "[lib] Building Linux hidapi from source..."
    mkdir -p "$BUILD_TMP"; cd "$BUILD_TMP"
    [ -d hidapi ] || git clone --depth 1 https://github.com/libusb/hidapi.git
    cd hidapi; mkdir -p build; cd build
    cmake .. -DCMAKE_BUILD_TYPE=Release
    make -j"$(nproc)"
    cp "$BUILD_TMP/hidapi/build/src/linux/libhidapi-hidraw.so.0" "$LIBS_DIR/"
    echo "  Linux libhidapi-hidraw.so.0 ready"
    cd "$PROJECT_DIR"
fi

# macOS .dylib (Homebrew; macOS host only)
if [ "$BUILD_MAC" = "1" ] && [ ! -f "$LIBS_DIR/libhidapi.dylib" ]; then
    echo "[lib] Installing macOS hidapi via Homebrew..."
    if ! command -v brew &>/dev/null; then
        echo "Error: Homebrew required to obtain libhidapi.dylib (https://brew.sh)"
        exit 1
    fi
    brew list hidapi &>/dev/null || brew install hidapi
    cp "$(brew --prefix hidapi)/lib/libhidapi.dylib" "$LIBS_DIR/"
    echo "  macOS libhidapi.dylib ready"
fi

# Windows .dll (download; any host). Always required: it is embedded into
# every build via `import ../libs/hidapi.dll`, including non-Windows targets.
if [ ! -f "$LIBS_DIR/hidapi.dll" ]; then
    echo "[lib] Downloading Windows hidapi.dll..."
    if ! command -v curl &>/dev/null; then
        echo "Error: curl required to download hidapi.dll"
        exit 1
    fi
    cd "$LIBS_DIR"
    curl -sL https://github.com/libusb/hidapi/releases/download/hidapi-0.14.0/hidapi-win.zip -o hidapi-win.zip
    unzip -o -q hidapi-win.zip
    cp x64/hidapi.dll .
    rm -rf hidapi-win.zip include x64 x86
    cd "$PROJECT_DIR"
fi
echo "  Windows hidapi.dll ready"

# --- Executables ----------------------------------------------------------
cd "$PROJECT_DIR"
VERSION=$(grep '^version' "$PROJECT_DIR/pyproject.toml" | sed 's/.*= "\(.*\)"/\1/')
echo ""
echo "[build] Version: $VERSION"

# Linux
if [ "$BUILD_LINUX" = "1" ]; then
    ARCH=$(uname -m)
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
        LINUX_TARGET="bun-linux-arm64"; LINUX_ARCH="arm64"
    else
        LINUX_TARGET="bun-linux-x64"; LINUX_ARCH="x64"
    fi
    LINUX_DIST="$PROJECT_DIR/dist/linux-$LINUX_ARCH"
    echo "  Building Linux executable ($LINUX_TARGET)..."
    mkdir -p "$LINUX_DIST"
    bun build --compile --target=$LINUX_TARGET src/main-ffi.ts --outfile "$LINUX_DIST/aeo-kvm"
    cp "$LIBS_DIR/libhidapi-hidraw.so.0" "$LINUX_DIST/"
    cp "$PROJECT_DIR/scripts/install-linux.sh" "$LINUX_DIST/install.sh"
    cp "$PROJECT_DIR/scripts/uninstall-linux.sh" "$LINUX_DIST/uninstall.sh"
    chmod +x "$LINUX_DIST"/*.sh "$LINUX_DIST/aeo-kvm"
    (cd "$LINUX_DIST" && sha256 aeo-kvm libhidapi-hidraw.so.0 > SHA256SUMS)
    echo "  Linux package: dist/linux-$LINUX_ARCH/"
fi

# macOS
if [ "$BUILD_MAC" = "1" ]; then
    MAC_ARCH=$(uname -m)  # arm64 | x86_64
    if [ "$HOST_OS" = "Darwin" ] && [ "$MAC_ARCH" = "x86_64" ]; then
        MAC_TARGET="bun-darwin-x64"; MAC_ARCHN="x64"
    else
        MAC_TARGET="bun-darwin-arm64"; MAC_ARCHN="arm64"
    fi
    MAC_DIST="$PROJECT_DIR/dist/macos-$MAC_ARCHN"
    echo "  Building macOS executable ($MAC_TARGET)..."
    mkdir -p "$MAC_DIST"
    bun build --compile --target=$MAC_TARGET src/main-ffi.ts --outfile "$MAC_DIST/aeo-kvm"
    # Prebundle arg-free per-target executables (Logi Options+ Smart Actions can
    # only launch an app with no arguments). The binary picks its target from its
    # own filename, so each copy is a ready-to-bind switch button.
    cp "$MAC_DIST/aeo-kvm" "$MAC_DIST/switch-to-windows"
    cp "$MAC_DIST/aeo-kvm" "$MAC_DIST/switch-to-linux"
    cp "$LIBS_DIR/libhidapi.dylib" "$MAC_DIST/"
    cp "$PROJECT_DIR/scripts/install-macos.sh" "$MAC_DIST/install.sh"
    chmod +x "$MAC_DIST"/*.sh "$MAC_DIST/aeo-kvm" "$MAC_DIST/switch-to-windows" "$MAC_DIST/switch-to-linux"
    (cd "$MAC_DIST" && sha256 aeo-kvm switch-to-windows switch-to-linux libhidapi.dylib > SHA256SUMS)
    echo "  macOS package: dist/macos-$MAC_ARCHN/"
fi

# Windows (single self-installing exe with embedded DLL)
if [ "$BUILD_WINDOWS" = "1" ]; then
    WIN_DIST="$PROJECT_DIR/dist/windows-x64"
    echo "  Building Windows executable (x64, self-installing)..."
    mkdir -p "$WIN_DIST"
    bun build --compile --target=bun-windows-x64 src/main-ffi.ts --outfile "$WIN_DIST/aeo-kvm-installer.exe"
    (cd "$WIN_DIST" && sha256 aeo-kvm-installer.exe > SHA256SUMS)
    echo "  Windows package: dist/windows-x64/ (single file!)"
fi

echo ""
echo "=== Build Complete (v$VERSION) ==="

# --- Deploy to this host's location ---------------------------------------
echo ""
echo "[install] Local deployment..."

if [ "$BUILD_LINUX" = "1" ] && [ "$HOST_OS" = "Linux" ]; then
    mkdir -p /opt/aeo-kvm
    cp "$PROJECT_DIR/dist/linux-$LINUX_ARCH/aeo-kvm" /opt/aeo-kvm/
    cp "$PROJECT_DIR/dist/linux-$LINUX_ARCH/libhidapi-hidraw.so.0" /opt/aeo-kvm/
    echo "  Linux: /opt/aeo-kvm/aeo-kvm"
fi

if [ "$BUILD_MAC" = "1" ] && [ "$HOST_OS" = "Darwin" ]; then
    echo "  macOS package built. Install (then wire buttons in Logi Options+) with:"
    echo "    bash dist/macos-$MAC_ARCHN/install.sh   (no sudo; or run 'make macos' for the full lifecycle)"
fi

if [ "$BUILD_WINDOWS" = "1" ]; then
    echo "  Deploying to Windows via SSH..."
    WIN_DOWNLOADS=$(ssh windows 'echo %USERPROFILE%\Downloads' 2>/dev/null | tr -d '\r')
    if [ -n "$WIN_DOWNLOADS" ] && scp "$PROJECT_DIR/dist/windows-x64/aeo-kvm-installer.exe" "windows:$WIN_DOWNLOADS\\" 2>/dev/null; then
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
