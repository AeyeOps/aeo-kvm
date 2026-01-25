/**
 * LG TV WebOS control via WebSocket.
 *
 * Simplified implementation - just enough for HDMI switching.
 * Handles client-key storage for persistent pairing.
 * Includes SSDP auto-discovery for dynamic IP detection.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { homedir, networkInterfaces } from "os";
import { createSocket, type RemoteInfo } from "dgram";
import { connect } from "net";
import { log } from "./hidapi-ffi";

// Helper to log to both console and file
function tvLog(msg: string): void {
  console.log(msg);
  log(`[TV] ${msg}`);
}

// Get config directory (cross-platform)
// Windows: same directory as executable
// Linux: ~/.config/aeo-kvm
function getConfigDir(): string {
  if (process.platform === "win32") {
    return dirname(process.execPath);
  }
  return join(homedir(), ".config", "aeo-kvm");
}

// Load TV config (IP and client key)
interface TvConfig {
  ip: string;
  clientKey: string;
}

function loadTvConfig(): TvConfig | null {
  const configDir = getConfigDir();
  const configFile = join(configDir, "tv-keys.json");

  try {
    if (existsSync(configFile)) {
      const config = JSON.parse(readFileSync(configFile, "utf-8"));
      if (config.ip) {
        return {
          ip: config.ip,
          clientKey: config.key || "",
        };
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// Save client key (preserves existing config)
function saveClientKey(ip: string, key: string): void {
  const configDir = getConfigDir();
  const configFile = join(configDir, "tv-keys.json");

  try {
    mkdirSync(configDir, { recursive: true });

    let config: Record<string, string> = {};
    if (existsSync(configFile)) {
      config = JSON.parse(readFileSync(configFile, "utf-8"));
    }

    config.ip = ip;
    config.key = key;
    writeFileSync(configFile, JSON.stringify(config, null, 2));
  } catch (e) {
    tvLog(`  Warning: Could not save TV config: ${e}`);
  }
}

// ============================================================================
// SSDP Discovery for LG WebOS TVs
// ============================================================================

const SSDP_MULTICAST_ADDR = "239.255.255.250";
const SSDP_PORT = 1900;
const SSDP_DISCOVERY_TIMEOUT_MS = 5000;

// LG-specific SSDP search target
const LG_SEARCH_TARGET = "urn:lge-com:service:webos-second-screen:1";

interface DiscoveredTV {
  ip: string;
  server: string;
  location: string;
}

function buildMSearchRequest(): string {
  return [
    "M-SEARCH * HTTP/1.1",
    `HOST: ${SSDP_MULTICAST_ADDR}:${SSDP_PORT}`,
    'MAN: "ssdp:discover"',
    "MX: 3",
    `ST: ${LG_SEARCH_TARGET}`,
    "",
    "",
  ].join("\r\n");
}

function parseSsdpResponse(msg: string, rinfo: RemoteInfo): DiscoveredTV | null {
  const headers: Record<string, string> = {};
  const lines = msg.split("\r\n");

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).toLowerCase().trim();
      const value = line.substring(colonIdx + 1).trim();
      headers[key] = value;
    }
  }

  const server = headers["server"] || "";
  const location = headers["location"] || "";

  // Only accept WebOS responses
  if (!server.toLowerCase().includes("webos")) {
    return null;
  }

  return {
    ip: rinfo.address,
    server,
    location,
  };
}

/**
 * Find the best local IP for SSDP multicast.
 * Prefers private network IPs (10.x, 192.168.x, 172.16-31.x) over VPN/virtual interfaces.
 */
function findBestLocalIP(): string | null {
  const interfaces = networkInterfaces();
  const candidates: { name: string; ip: string; priority: number }[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family !== "IPv4" || addr.internal) continue;

      // Skip known VPN/virtual interfaces
      const lowerName = name.toLowerCase();
      if (lowerName.includes("nordlynx") || lowerName.includes("openvpn") || lowerName.includes("tap-") || lowerName.includes("wireguard")) {
        continue;
      }

      // Prioritize private network ranges
      let priority = 0;
      if (addr.address.startsWith("10.") || addr.address.startsWith("192.168.")) {
        priority = 2; // High priority for common private ranges
      } else if (addr.address.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
        priority = 1; // Medium priority for 172.16-31.x
      }

      candidates.push({ name, ip: addr.address, priority });
    }
  }

  // Sort by priority (highest first)
  candidates.sort((a, b) => b.priority - a.priority);

  return candidates.length > 0 ? candidates[0].ip : null;
}

/**
 * Discover LG WebOS TVs on the local network via SSDP.
 * Returns the first TV found, or null if none discovered.
 */
async function discoverTV(): Promise<DiscoveredTV | null> {
  tvLog("Starting SSDP discovery...");

  // Find best local IP for multicast binding
  const localIP = findBestLocalIP();

  // Log network interfaces
  const interfaces = networkInterfaces();
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) {
        const marker = addr.address === localIP ? " <-- binding" : "";
        tvLog(`  Network interface: ${name} (${addr.address})${marker}`);
      }
    }
  }

  if (!localIP) {
    tvLog("  ERROR: No suitable network interface found for SSDP");
    return null;
  }

  return new Promise((resolve) => {
    const socket = createSocket({ type: "udp4", reuseAddr: true });
    let found: DiscoveredTV | null = null;

    socket.on("error", (err) => {
      tvLog(`  SSDP socket error: ${err.message}`);
    });

    socket.on("message", (msg, rinfo) => {
      if (found) return; // Already found one

      const tv = parseSsdpResponse(msg.toString(), rinfo);
      if (tv) {
        tvLog(`  Found LG WebOS TV: ${tv.ip}`);
        tvLog(`     Server: ${tv.server}`);
        found = tv;
      }
    });

    // Bind to specific local IP to ensure multicast goes out correct interface
    // This is critical on Windows with Hyper-V/VPN where multiple interfaces exist
    socket.bind(0, localIP, () => {
      socket.setBroadcast(true);
      socket.setMulticastTTL(4);
      socket.setMulticastInterface(localIP);

      tvLog(`  Bound to ${localIP}, sending M-SEARCH for: ${LG_SEARCH_TARGET}`);
      const request = buildMSearchRequest();
      socket.send(request, SSDP_PORT, SSDP_MULTICAST_ADDR, (err) => {
        if (err) tvLog(`  SSDP send error: ${err.message}`);
      });

      // Send a second request after 1 second for reliability
      setTimeout(() => {
        socket.send(request, SSDP_PORT, SSDP_MULTICAST_ADDR);
      }, 1000);
    });

    // Wait for responses
    setTimeout(() => {
      socket.close();
      if (found) {
        tvLog(`  SSDP discovery complete: found ${found.ip}`);
      } else {
        tvLog("  SSDP discovery complete: no LG TVs found");
      }
      resolve(found);
    }, SSDP_DISCOVERY_TIMEOUT_MS);
  });
}

/**
 * Quick connectivity check to WebOS port 3001.
 */
async function checkTvConnectivity(ip: string, timeoutMs: number = 2000): Promise<boolean> {
  tvLog(`  Checking connectivity to ${ip}:3001...`);

  return new Promise((resolve) => {
    const socket = connect({ host: ip, port: 3001, timeout: timeoutMs });

    socket.on("connect", () => {
      tvLog(`  ${ip}:3001 is reachable`);
      socket.destroy();
      resolve(true);
    });

    socket.on("error", () => {
      tvLog(`  ${ip}:3001 is not reachable`);
      socket.destroy();
      resolve(false);
    });

    socket.on("timeout", () => {
      tvLog(`  ${ip}:3001 connection timeout`);
      socket.destroy();
      resolve(false);
    });
  });
}

// ============================================================================
// LG WebOS Protocol
// ============================================================================

// LG signed app signature (from bscpylgtv)
const SIGNATURE =
  "eyJhbGdvcml0aG0iOiJSU0EtU0hBMjU2Iiwia2V5SWQiOiJ0ZXN0LXNpZ25pbm" +
  "ctY2VydCIsInNpZ25hdHVyZVZlcnNpb24iOjF9.hrVRgjCwXVvE2OOSpDZ58hR" +
  "+59aFNwYDyjQgKk3auukd7pcegmE2CzPCa0bJ0ZsRAcKkCTJrWo5iDzNhMBWRy" +
  "aMOv5zWSrthlf7G128qvIlpMT0YNY+n/FaOHE73uLrS/g7swl3/qH/BGFG2Hu4" +
  "RlL48eb3lLKqTt2xKHdCs6Cd4RMfJPYnzgvI4BNrFUKsjkcu+WD4OO2A27Pq1n" +
  "50cMchmcaXadJhGrOqH5YmHdOCj5NSHzJYrsW0HPlpuAx/ECMeIZYDh6RMqaFM" +
  "2DXzdKX9NmmyqzJ3o/0lkk/N97gfVRLW5hA29yeAwaCViZNCP8iC9aO0q9fQoj" +
  "oa7NQnAtw==";

function createHandshake(clientKey: string) {
  return {
    type: "register",
    id: "register_0",
    payload: {
      "client-key": clientKey,
      forcePairing: false,
      pairingType: "PROMPT",
      manifest: {
        appVersion: "1.1",
        manifestVersion: 1,
        permissions: [
          "LAUNCH",
          "LAUNCH_WEBAPP",
          "APP_TO_APP",
          "CLOSE",
          "TEST_OPEN",
          "TEST_PROTECTED",
          "CONTROL_AUDIO",
          "CONTROL_DISPLAY",
          "CONTROL_INPUT_JOYSTICK",
          "CONTROL_INPUT_MEDIA_RECORDING",
          "CONTROL_INPUT_MEDIA_PLAYBACK",
          "CONTROL_INPUT_TV",
          "CONTROL_POWER",
          "CONTROL_TV_SCREEN",
          "READ_APP_STATUS",
          "READ_CURRENT_CHANNEL",
          "READ_INPUT_DEVICE_LIST",
          "READ_NETWORK_STATE",
          "READ_RUNNING_APPS",
          "READ_TV_CHANNEL_LIST",
          "WRITE_NOTIFICATION_TOAST",
          "READ_POWER_STATE",
          "READ_COUNTRY_INFO",
          "CONTROL_INPUT_TEXT",
          "CONTROL_MOUSE_AND_KEYBOARD",
          "READ_INSTALLED_APPS",
          "READ_SETTINGS",
          "READ_STORAGE_DEVICE_LIST",
        ],
        signatures: [{ signature: SIGNATURE, signatureVersion: 1 }],
        signed: {
          appId: "com.lge.test",
          created: "20140509",
          localizedAppNames: {
            "": "LG Remote App",
            "ko-KR": "리모컨 앱",
            "zxx-XX": "ЛГ Rэмotэ AПП",
          },
          localizedVendorNames: { "": "LG Electronics" },
          permissions: [
            "TEST_SECURE",
            "CONTROL_INPUT_TEXT",
            "CONTROL_MOUSE_AND_KEYBOARD",
            "READ_INSTALLED_APPS",
            "READ_LGE_SDX",
            "READ_NOTIFICATIONS",
            "SEARCH",
            "WRITE_SETTINGS",
            "WRITE_NOTIFICATION_ALERT",
            "CONTROL_POWER",
            "READ_CURRENT_CHANNEL",
            "READ_RUNNING_APPS",
            "READ_UPDATE_INFO",
            "UPDATE_FROM_REMOTE_APP",
            "READ_LGE_TV_INPUT_EVENTS",
            "READ_TV_CURRENT_TIME",
          ],
          serial: "2f930e2d2cfe083771f68e4fe7bb07",
          vendorId: "com.lge",
        },
      },
    },
  };
}

export async function switchTV(hdmiInput: string): Promise<boolean> {
  tvLog(`Setting input to ${hdmiInput}...`);

  // Load TV config (may have cached IP)
  let config = loadTvConfig();
  let ip: string | null = config?.ip || null;
  let clientKey = config?.clientKey || "";

  tvLog(`  Config file: ${join(getConfigDir(), "tv-keys.json")}`);
  tvLog(`  Cached IP: ${ip || "(none)"}`);
  tvLog(`  Client key: ${clientKey ? "loaded" : "none (will prompt for pairing)"}`);

  // Step 1: Try cached IP if we have one
  if (ip) {
    const reachable = await checkTvConnectivity(ip);
    if (!reachable) {
      tvLog(`  Cached IP ${ip} is not reachable, will discover...`);
      ip = null;
    }
  }

  // Step 2: Discover TV if no cached IP or cached IP is stale
  if (!ip) {
    const discovered = await discoverTV();
    if (discovered) {
      ip = discovered.ip;
      tvLog(`  Updating config with discovered IP: ${ip}`);
      saveClientKey(ip, clientKey);
    } else {
      tvLog(`  ERROR: No LG WebOS TV found on network.`);
      tvLog(`  Troubleshooting:`);
      tvLog(`    - Make sure TV is powered ON (not just standby)`);
      tvLog(`    - Enable 'LG Connect Apps' in TV settings`);
      tvLog(`    - Verify TV and this computer are on the same network`);
      return false;
    }
  }

  // Step 3: Connect via WebSocket
  tvLog(`  Connecting to wss://${ip}:3001...`);

  return new Promise((resolve) => {
    // Use secure WebSocket on port 3001 (LG WebOS default)
    // tls: rejectUnauthorized=false because TV uses self-signed cert
    const ws = new WebSocket(`wss://${ip}:3001`, {
      tls: { rejectUnauthorized: false },
    } as any);
    let registered = false;
    let commandId = 1;

    const timeout = setTimeout(() => {
      tvLog("  TV connection timeout (10s)");
      tvLog("  Hint: Make sure TV is on and 'IP Control' is enabled in settings");
      ws.close();
      resolve(false);
    }, 10000);

    ws.onopen = () => {
      tvLog("  Connected, sending handshake...");
      const handshake = createHandshake(clientKey);
      ws.send(JSON.stringify(handshake));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string);
      tvLog(`  Received: ${msg.type}`);

      if (msg.type === "registered") {
        registered = true;

        // Save the client key for future use
        if (msg.payload && msg.payload["client-key"]) {
          const newKey = msg.payload["client-key"];
          if (newKey !== clientKey) {
            tvLog("  Saving new client key...");
            saveClientKey(ip!, newKey);
          }
        }

        // Send set input command
        tvLog(`  Sending switchInput command: ${hdmiInput}`);
        const cmd = {
          type: "request",
          id: `cmd_${commandId++}`,
          uri: "ssap://tv/switchInput",
          payload: { inputId: hdmiInput },
        };
        ws.send(JSON.stringify(cmd));
      }

      if (msg.type === "response" && registered) {
        clearTimeout(timeout);
        tvLog(`  TV switched to ${hdmiInput}`);
        ws.close();
        resolve(true);
      }

      if (msg.type === "error") {
        clearTimeout(timeout);
        tvLog(`  TV error: ${msg.error || JSON.stringify(msg)}`);
        ws.close();
        resolve(false);
      }
    };

    ws.onerror = (err: Event | ErrorEvent) => {
      clearTimeout(timeout);
      const message = (err as ErrorEvent).message || "connection failed";
      tvLog(`  TV connection error: ${message}`);
      if (message.includes("Connection ended")) {
        tvLog("  Hint: TV may be off, or first-time pairing needed (check TV for prompt)");
      }
      resolve(false);
    };

    ws.onclose = () => {
      clearTimeout(timeout);
    };
  });
}
