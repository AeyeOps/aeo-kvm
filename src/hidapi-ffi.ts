/**
 * HID API wrapper using Bun FFI
 * Calls hidapi directly without node-hid native module dependency
 */
import { dlopen, FFIType, ptr, toArrayBuffer, suffix } from "bun:ffi";
import { existsSync, appendFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// Logging to file for debugging
const LOG_PATH =
  process.platform === "win32"
    ? join(dirname(process.execPath), "aeo-kvm.log")
    : "/tmp/aeo-kvm.log";

export function log(msg: string): void {
  const timestamp = new Date().toISOString();
  const line = `${timestamp} ${msg}\n`;
  try {
    appendFileSync(LOG_PATH, line);
  } catch {
    // Ignore log failures
  }
}

log("=== aeo-kvm started ===");

// Find the library path - check multiple locations
function findLibPath(): string {
  // bun:ffi `suffix` is dll (Windows), dylib (macOS), so (Linux)
  const libName =
    suffix === "dll"
      ? "hidapi.dll"
      : suffix === "dylib"
        ? "libhidapi.dylib"
        : "libhidapi-hidraw.so.0";

  // Possible locations to check
  const candidates = [
    // Same directory as executable
    join(dirname(process.execPath), libName),
    join(dirname(process.execPath), "libs", libName),
    // Development paths
    join(dirname(import.meta.dir), "libs", libName),
    join(import.meta.dir, "..", "libs", libName),
    // System paths (macOS Homebrew)
    `/opt/homebrew/lib/${libName}`,
    // System paths (Linux)
    `/usr/lib/x86_64-linux-gnu/${libName}`,
    `/usr/local/lib/${libName}`,
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      return path;
    }
  }

  throw new Error(`Could not find ${libName}. Searched: ${candidates.join(", ")}`);
}

// hidapi function signatures
const HIDAPI_SYMBOLS = {
  hid_init: {
    args: [] as const,
    returns: FFIType.i32,
  },
  hid_exit: {
    args: [] as const,
    returns: FFIType.i32,
  },
  hid_enumerate: {
    args: [FFIType.u16, FFIType.u16] as const,
    returns: FFIType.ptr,
  },
  hid_free_enumeration: {
    args: [FFIType.ptr] as const,
    returns: FFIType.void,
  },
  hid_open_path: {
    args: [FFIType.ptr] as const,
    returns: FFIType.ptr,
  },
  hid_close: {
    args: [FFIType.ptr] as const,
    returns: FFIType.void,
  },
  hid_write: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.u64] as const,
    returns: FFIType.i32,
  },
  hid_read_timeout: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.u64, FFIType.i32] as const,
    returns: FFIType.i32,
  },
  hid_error: {
    args: [FFIType.ptr] as const,
    returns: FFIType.ptr,
  },
};

interface HidDeviceInfo {
  path: string;
  vendorId: number;
  productId: number;
  serialNumber: string;
  releaseNumber: number;
  manufacturerString: string;
  productString: string;
  usagePage: number;
  usage: number;
  interfaceNumber: number;
}

let hidapi: ReturnType<typeof dlopen<typeof HIDAPI_SYMBOLS>> | null = null;

export async function initHidApi(): Promise<boolean> {
  if (hidapi) return true;

  try {
    const libPath = findLibPath();
    log(`initHidApi: loading from ${libPath}`);
    console.log(`[DEBUG] Loading hidapi from: ${libPath}`);
    hidapi = dlopen(libPath, HIDAPI_SYMBOLS);
    const result = hidapi.symbols.hid_init();
    log(`initHidApi: hid_init returned ${result}`);
    return result === 0;
  } catch (e) {
    log(`initHidApi: FAILED ${e}`);
    console.error("Failed to load hidapi:", e);
    return false;
  }
}

export function hidError(): string {
  if (!hidapi) return "(hidapi not initialized)";
  try {
    const p = hidapi.symbols.hid_error(0);
    return p ? readWideString(Number(p)) : "(no error string)";
  } catch (e) {
    return `(hid_error threw: ${e})`;
  }
}

export function exitHidApi(): void {
  if (hidapi) {
    hidapi.symbols.hid_exit();
    hidapi = null;
  }
}

function readCString(ptrVal: number, maxLen = 256): string {
  if (!ptrVal) return "";
  const view = new DataView(toArrayBuffer(ptrVal, 0, maxLen));
  let str = "";
  for (let i = 0; i < maxLen; i++) {
    const byte = view.getUint8(i);
    if (byte === 0) break;
    str += String.fromCharCode(byte);
  }
  return str;
}

function readWideString(ptrVal: number, maxLen = 256): string {
  if (!ptrVal) return "";
  // Linux wchar_t is 4 bytes (UTF-32), Windows is 2 bytes (UTF-16)
  const charSize = process.platform === "win32" ? 2 : 4;
  const view = new DataView(toArrayBuffer(ptrVal, 0, maxLen * charSize));
  let str = "";
  for (let i = 0; i < maxLen; i++) {
    const char =
      charSize === 2
        ? view.getUint16(i * 2, true)
        : view.getUint32(i * 4, true);
    if (char === 0) break;
    str += String.fromCharCode(char);
  }
  return str;
}

export function enumerate(vendorId = 0, productId = 0): HidDeviceInfo[] {
  if (!hidapi) throw new Error("hidapi not initialized");

  const devices: HidDeviceInfo[] = [];
  const enumPtr = hidapi.symbols.hid_enumerate(vendorId, productId);

  if (!enumPtr) return devices;

  let currentPtr = Number(enumPtr);

  while (currentPtr) {
    const view = new DataView(toArrayBuffer(currentPtr, 0, 128));

    // hid_device_info struct offsets (64-bit Linux):
    const pathPtr = Number(view.getBigUint64(0, true));
    const vendorIdVal = view.getUint16(8, true);
    const productIdVal = view.getUint16(10, true);
    const serialPtr = Number(view.getBigUint64(16, true));
    const releaseNumber = view.getUint16(24, true);
    const mfgPtr = Number(view.getBigUint64(32, true));
    const productPtr = Number(view.getBigUint64(40, true));
    const usagePage = view.getUint16(48, true);
    const usage = view.getUint16(50, true);
    const interfaceNumber = view.getInt32(52, true);
    const nextPtr = Number(view.getBigUint64(56, true));

    devices.push({
      path: readCString(pathPtr),
      vendorId: vendorIdVal,
      productId: productIdVal,
      serialNumber: readWideString(serialPtr),
      releaseNumber,
      manufacturerString: readWideString(mfgPtr),
      productString: readWideString(productPtr),
      usagePage,
      usage,
      interfaceNumber,
    });

    currentPtr = nextPtr;
  }

  hidapi.symbols.hid_free_enumeration(enumPtr);
  return devices;
}

export class HidDevice {
  private handle: number | null = null;

  constructor(private path: string) {}

  open(): boolean {
    if (!hidapi) throw new Error("hidapi not initialized");

    const pathBuffer = Buffer.from(this.path + "\0", "utf-8");
    const pathPtr = ptr(pathBuffer);

    this.handle = Number(hidapi.symbols.hid_open_path(pathPtr));
    const success = this.handle !== 0;
    log(`open: path=${this.path} success=${success}`);
    return success;
  }

  close(): void {
    if (hidapi && this.handle) {
      hidapi.symbols.hid_close(this.handle);
      this.handle = null;
    }
  }

  write(data: Uint8Array): number {
    if (!hidapi || !this.handle) {
      log(`write: no handle`);
      return -1;
    }

    const dataPtr = ptr(data);
    const result = hidapi.symbols.hid_write(this.handle, dataPtr, data.length);
    const hex = Array.from(data.slice(0, 8))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    log(`write: bytes=${result} data=${hex}...`);
    return result;
  }

  read(length: number, timeoutMs: number): Uint8Array | null {
    if (!hidapi || !this.handle) {
      log(`read: no handle`);
      return null;
    }

    const buffer = new Uint8Array(length);
    const bufferPtr = ptr(buffer);
    const startTime = Date.now();
    let discardCount = 0;

    // Loop until we get a HID++ report or timeout
    // Discards non-HID++ data (mouse movements, etc.) that may be queued
    while (Date.now() - startTime < timeoutMs) {
      const remaining = Math.max(100, timeoutMs - (Date.now() - startTime));
      const bytesRead = hidapi.symbols.hid_read_timeout(
        this.handle,
        bufferPtr,
        length,
        remaining
      );

      if (bytesRead <= 0) {
        log(`read: timeout/error after ${Date.now() - startTime}ms, discarded=${discardCount}`);
        return null;
      }

      const reportId = buffer[0];
      const hex = Array.from(buffer.slice(0, Math.min(bytesRead, 8)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");

      // Check for valid HID++ report ID (0x10 short, 0x11 long)
      if (reportId === 0x10 || reportId === 0x11) {
        log(`read: OK reportId=0x${reportId.toString(16)} bytes=${bytesRead} discarded=${discardCount} data=${hex}`);
        return buffer.slice(0, bytesRead);
      }

      // Discard non-HID++ data
      discardCount++;
      log(`read: DISCARD reportId=0x${reportId.toString(16)} bytes=${bytesRead} data=${hex}`);
    }

    log(`read: TIMEOUT discarded=${discardCount}`);
    return null;
  }
}
