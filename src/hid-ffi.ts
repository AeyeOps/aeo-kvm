/**
 * Logitech HID++ implementation using Bun FFI
 * Supports host switching for multi-device keyboards/mice
 */
import { initHidApi, exitHidApi, enumerate, HidDevice, log } from "./hidapi-ffi";

const LOGITECH_VID = 0x046d;
const FEATURE_CHANGE_HOST = 0x1814;
const SW_ID = 0x0a; // Software ID to distinguish our requests from Solaar's

// Device configurations: name pattern -> host index per target (0-indexed)
const DEVICES: Record<string, { linux_host: number; windows_host: number; macbook_host: number }> = {
  K950: { linux_host: 1, windows_host: 0, macbook_host: 2 },
  M750: { linux_host: 1, windows_host: 0, macbook_host: 2 },
};

interface LogitechDevice {
  path: string;
  productString: string;
  usagePage: number;
  usage: number;
  serialNumber: string;
}

function findLogitechDevices(verbose = false): Map<string, LogitechDevice[]> {
  const allDevices = enumerate(LOGITECH_VID, 0);

  // Group by serial number
  const bySerial = new Map<string, LogitechDevice[]>();

  for (const dev of allDevices) {
    const serial = dev.serialNumber || "unknown";
    if (!bySerial.has(serial)) {
      bySerial.set(serial, []);
    }

    // Only include vendor-specific usage pages (HID++ interfaces)
    if (dev.usagePage >= 0xff00) {
      bySerial.get(serial)!.push({
        path: dev.path,
        productString: dev.productString,
        usagePage: dev.usagePage,
        usage: dev.usage,
        serialNumber: serial,
      });
    }
  }

  if (verbose) {
    console.log("[DEBUG] Logitech devices found:");
    for (const [serial, devs] of bySerial) {
      if (devs.length > 0) {
        console.log(`  Serial ${serial}: ${devs[0].productString}`);
        for (const d of devs) {
          console.log(
            `    usage_page=0x${d.usagePage.toString(16).padStart(4, "0")} usage=0x${d.usage.toString(16).padStart(4, "0")}`
          );
        }
      }
    }
  }

  return bySerial;
}

function hidppRequest(
  device: HidDevice,
  featureIndex: number,
  functionId: number,
  params: number[] = [],
  deviceIndex = 0xff,
  useLong = true,
  verbose = false
): Uint8Array | null {
  // Build HID++ message with our SW_ID
  const reportId = useLong ? 0x11 : 0x10;
  const msgLength = useLong ? 20 : 7;

  const msg = new Uint8Array(msgLength);
  msg[0] = reportId;
  msg[1] = deviceIndex;
  msg[2] = featureIndex;
  msg[3] = (functionId << 4) | SW_ID; // Include our SW_ID

  for (let i = 0; i < params.length && i + 4 < msgLength; i++) {
    msg[4 + i] = params[i];
  }

  if (verbose) {
    console.log(`    [TX] ${Array.from(msg).map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ")}`);
  }

  const written = device.write(msg);
  if (verbose) {
    console.log(`    [TX] wrote ${written} bytes`);
  }

  if (written < 0) return null;

  // Read responses until we get one matching our request
  const startTime = Date.now();
  const timeout = 1000;
  let discarded = 0;

  while (Date.now() - startTime < timeout) {
    const remaining = timeout - (Date.now() - startTime);
    const response = device.read(64, remaining);

    if (!response) {
      if (verbose) {
        console.log(`    [RX] timeout/no response (discarded ${discarded} non-matching)`);
      }
      return null;
    }

    // Check if this response matches our request:
    // - Byte 1: device index should match
    // - Byte 2: feature index should match (or 0xFF for error)
    // - Byte 3 lower nibble: SW_ID should match
    const respDevIdx = response[1];
    const respFeatureIdx = response[2];
    const respSwId = response[3] & 0x0f;

    const isError = respFeatureIdx === 0xff;
    const featureMatches = isError ? (response[3] === featureIndex) : (respFeatureIdx === featureIndex);
    const swIdMatches = isError ? true : (respSwId === SW_ID);
    const devIdxMatches = respDevIdx === deviceIndex;

    if (devIdxMatches && featureMatches && swIdMatches) {
      if (verbose) {
        console.log(`    [RX] ${Array.from(response).map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ")} (discarded ${discarded})`);
      }
      return response;
    }

    // Not our response - discard and continue
    discarded++;
    if (verbose) {
      console.log(`    [RX] SKIP (not ours) feat=0x${respFeatureIdx.toString(16)} sw_id=0x${respSwId.toString(16)}`);
    }
  }

  if (verbose) {
    console.log(`    [RX] timeout after discarding ${discarded} non-matching`);
  }
  return null;
}

function getFeatureIndex(
  device: HidDevice,
  featureId: number,
  deviceIndex = 0xff,
  useLong = true,
  verbose = false
): number | null {
  const params = [(featureId >> 8) & 0xff, featureId & 0xff];

  if (verbose) {
    console.log(`    Getting feature index for 0x${featureId.toString(16).padStart(4, "0")} (dev_idx=0x${deviceIndex.toString(16).padStart(2, "0")})`);
  }

  const response = hidppRequest(device, 0x00, 0x00, params, deviceIndex, useLong, verbose);

  if (response && response.length >= 5) {
    const idx = response[4];
    if (verbose) {
      console.log(`    Feature 0x${featureId.toString(16).padStart(4, "0")} -> index ${idx}`);
    }
    return idx;
  }

  if (verbose) {
    console.log(`    Feature 0x${featureId.toString(16).padStart(4, "0")} -> NOT FOUND`);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function switchHostWithRetry(
  device: HidDevice,
  hostIndex: number,
  useLong = true,
  verbose = false,
  maxRetries = 3
): Promise<boolean> {
  // Try device index 0xFF first (standard for BLE mice), then 0x00 (for some keyboards)
  for (const devIdx of [0xff, 0x00]) {
    log(`switchHostWithRetry: trying devIdx=0x${devIdx.toString(16)} hostIndex=${hostIndex}`);
    if (verbose && devIdx !== 0xff) {
      console.log(`    Trying device index 0x${devIdx.toString(16).padStart(2, "0")}`);
    }

    const featureIdx = getFeatureIndex(device, FEATURE_CHANGE_HOST, devIdx, useLong, verbose);
    log(`switchHostWithRetry: getFeatureIndex returned ${featureIdx}`);
    if (featureIdx !== null) {
      // Retry loop for intermittent failures
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        log(`switchHostWithRetry: attempt ${attempt}/${maxRetries} setHost(${hostIndex}) featureIdx=${featureIdx}`);
        if (verbose) {
          console.log(`    Attempt ${attempt}/${maxRetries}: setHost(${hostIndex}) to feature index ${featureIdx}`);
        }

        // Send the switch command
        const response = hidppRequest(device, featureIdx, 0x01, [hostIndex], devIdx, useLong, verbose);

        // Check for success: either we get a response (acknowledgment) or write succeeded
        // Note: device may disconnect immediately on success, so no response is also OK
        if (response !== null) {
          // Got a response - check if it's an error
          if (response[2] === 0xff) {
            // Error response
            log(`switchHostWithRetry: error response, will retry`);
            if (verbose) {
              console.log(`    Error response, retrying...`);
            }
            if (attempt < maxRetries) {
              await sleep(1000);
              continue;
            }
          } else {
            // Success response
            log(`switchHostWithRetry: SUCCESS (acknowledged)`);
            if (verbose) {
              console.log(`    Command acknowledged`);
            }
            return true;
          }
        } else {
          // No response - could be success (device disconnected) or failure
          // On first attempt with no response, assume success
          // On retry, we're here because previous attempt may have failed
          if (attempt === 1) {
            log(`switchHostWithRetry: SUCCESS (no response, device likely switched)`);
            if (verbose) {
              console.log(`    No response (device may have switched)`);
            }
            return true;
          }
        }

        if (attempt < maxRetries) {
          if (verbose) {
            console.log(`    Waiting 1s before retry...`);
          }
          await sleep(1000);
        }
      }

      // All retries exhausted
      log(`switchHostWithRetry: FAILED after ${maxRetries} attempts`);
      if (verbose) {
        console.log(`    Failed after ${maxRetries} attempts`);
      }
      return false;
    }
  }

  log(`switchHostWithRetry: FAILED - no CHANGE_HOST feature found`);
  if (verbose) {
    console.log(`    Device does not support CHANGE_HOST feature on this interface`);
  }
  return false;
}

export async function switchDevices(target: "linux" | "windows" | "macbook"): Promise<boolean> {
  const hostKey = `${target}_host` as "linux_host" | "windows_host" | "macbook_host";
  const verbose = true; // Always verbose for better UX

  log(`switchDevices: target=${target}`);
  console.log(`[HID] Switching devices to host: ${target}...`);

  if (!(await initHidApi())) {
    log(`switchDevices: FAILED to init hidapi`);
    console.error("  Failed to initialize hidapi");
    return false;
  }

  try {
    const devicesBySerial = findLogitechDevices(verbose);
    log(`switchDevices: found ${devicesBySerial.size} device groups`);
    let anySuccess = false;

    for (const [serial, interfaces] of devicesBySerial) {
      if (interfaces.length === 0) continue;

      const product = interfaces[0].productString;
      log(`switchDevices: processing ${product} (serial=${serial}, ${interfaces.length} interfaces)`);

      // Check if this is a device we care about
      let deviceConfig: { linux_host: number; windows_host: number; macbook_host: number } | null = null;
      for (const [name, config] of Object.entries(DEVICES)) {
        if (product.includes(name)) {
          deviceConfig = config;
          break;
        }
      }

      if (!deviceConfig) {
        log(`switchDevices: SKIP ${product} (not in DEVICES config)`);
        if (verbose) {
          console.log(`  [DEBUG] Skipping ${product} (not in DEVICES config)`);
        }
        continue;
      }

      const hostIndex = deviceConfig[hostKey];
      log(`switchDevices: ${product} -> hostIndex=${hostIndex}`);
      console.log(`  ${product}: switching to host ${hostIndex + 1}`);

      // Sort interfaces: prefer 0xFF43 (long reports) first, then others
      interfaces.sort((a, b) => (a.usagePage === 0xff43 ? 0 : 1) - (b.usagePage === 0xff43 ? 0 : 1));

      let switched = false;
      for (const iface of interfaces) {
        const useLong = iface.usagePage === 0xff43;
        const reportType = useLong ? "long" : "short";

        log(`switchDevices: trying interface usagePage=0x${iface.usagePage.toString(16)} path=${iface.path}`);
        if (verbose) {
          console.log(`    [DEBUG] Trying 0x${iface.usagePage.toString(16).padStart(4, "0")} (${reportType}) at ${iface.path}`);
        }

        const device = new HidDevice(iface.path);
        if (!device.open()) {
          log(`switchDevices: FAILED to open ${iface.path}`);
          if (verbose) {
            console.log(`    [DEBUG] Failed to open device`);
          }
          continue;
        }

        if (await switchHostWithRetry(device, hostIndex, useLong, verbose)) {
          switched = true;
          anySuccess = true;
          log(`switchDevices: ${product} SWITCHED successfully`);
        } else {
          log(`switchDevices: ${product} switch FAILED on this interface`);
        }

        device.close();

        if (switched) break;
      }

      if (!switched) {
        log(`switchDevices: ${product} FAILED on all interfaces`);
        console.log(`  ${product}: failed to switch on any interface`);
      }
    }

    log(`switchDevices: complete, anySuccess=${anySuccess}`);
    return anySuccess;
  } finally {
    exitHidApi();
  }
}
