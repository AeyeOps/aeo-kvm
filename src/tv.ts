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
import { log } from "./hidapi-ffi";
import { connectTV, discoverTVInSubnet, parseDiscoverySubnet, type IPv4Subnet } from "./tv-discovery";

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
  deviceUUID?: string;
  discoverySubnet?: IPv4Subnet;
}

function loadTvConfig(): TvConfig | null {
  const configDir = getConfigDir();
  const configFile = join(configDir, "tv-keys.json");

  if (!existsSync(configFile)) return null;
  const config = JSON.parse(readFileSync(configFile, "utf-8"));
  if (config.deviceUUID !== undefined && (typeof config.deviceUUID !== "string" || !config.deviceUUID)) {
    throw new Error("TV deviceUUID must be a nonempty string");
  }
  return {
    ip: config.ip || "",
    clientKey: config.key || "",
    deviceUUID: config.deviceUUID,
    discoverySubnet: config.discoverySubnet === undefined ? undefined : parseDiscoverySubnet(config.discoverySubnet),
  };
}

function saveTvConfig(ip: string, key: string, deviceUUID: string): void {
  const configDir = getConfigDir();
  const configFile = join(configDir, "tv-keys.json");

  mkdirSync(configDir, { recursive: true });

  let config: Record<string, string> = {};
  if (existsSync(configFile)) {
    config = JSON.parse(readFileSync(configFile, "utf-8"));
  }

  config.ip = ip;
  config.key = key;
  config.deviceUUID = deviceUUID;
  writeFileSync(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
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
 * Returns the TVs advertising on the selected interface.
 */
async function discoverTV(): Promise<DiscoveredTV[]> {
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
    return [];
  }

  return new Promise((resolve) => {
    const socket = createSocket({ type: "udp4", reuseAddr: true });
    const found = new Map<string, DiscoveredTV>();

    socket.on("error", (err) => {
      tvLog(`  SSDP socket error: ${err.message}`);
    });

    socket.on("message", (msg, rinfo) => {
      const tv = parseSsdpResponse(msg.toString(), rinfo);
      if (tv && !found.has(tv.ip)) {
        tvLog(`  Found LG WebOS TV: ${tv.ip}`);
        tvLog(`     Server: ${tv.server}`);
        found.set(tv.ip, tv);
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
      if (found.size) {
        tvLog(`  SSDP discovery complete: found ${found.size} TV(s)`);
      } else {
        tvLog("  SSDP discovery complete: no LG TVs found");
      }
      resolve([...found.values()]);
    }, SSDP_DISCOVERY_TIMEOUT_MS);
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

  const config = loadTvConfig();
  const clientKey = config?.clientKey || "";
  tvLog(`  Config file: ${join(getConfigDir(), "tv-keys.json")}`);
  tvLog(`  Cached IP: ${config?.ip || "(none)"}`);
  tvLog(`  Client key: ${clientKey ? "loaded" : "none (will prompt for pairing)"}`);

  let connection = config?.ip ? await connectTV(config.ip, config.deviceUUID) : null;
  if (!connection && config?.discoverySubnet) {
    if (!config.deviceUUID) {
      tvLog("  ERROR: Routed discovery needs a saved TV identity. Set the current TV IP and connect once.");
      return false;
    }
    tvLog(`  Searching ${config.discoverySubnet.cidr} for the saved TV over TCP...`);
    connection = await discoverTVInSubnet(config.discoverySubnet, config.deviceUUID);
  } else if (!connection) {
    for (const discovered of await discoverTV()) {
      connection = await connectTV(discovered.ip, config?.deviceUUID);
      if (connection) break;
    }
  }

  if (!connection) {
    tvLog("  ERROR: The configured LG WebOS TV could not be reached or identified.");
    tvLog("    Check TV power and IP Control. Across a router, configure discoverySubnet and connect once at the current IP.");
    return false;
  }

  const { ip, deviceUUID, socket: ws } = connection;
  tvLog(`  Identified LG WebOS TV at ${ip}`);

  return new Promise((resolve, reject) => {
    let registered = false;
    const close = () => {
      clearTimeout(timeout);
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    };
    const finish = (success: boolean) => {
      close();
      resolve(success);
    };
    const timeout = setTimeout(() => {
      tvLog("  TV command timeout (10s)");
      finish(false);
    }, 10000);

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data as string);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        tvLog("  TV returned invalid JSON");
        finish(false);
        return;
      }
      tvLog(`  Received: ${msg?.type}`);

      if (msg?.type === "registered" && !registered) {
        registered = true;
        const key = msg.payload?.["client-key"] || clientKey;
        try {
          saveTvConfig(ip, key, deviceUUID);
        } catch (error) {
          close();
          reject(error);
          return;
        }
        tvLog(`  Sending switchInput command: ${hdmiInput}`);
        ws.send(JSON.stringify({
          type: "request",
          id: "switch_input",
          uri: "ssap://tv/switchInput",
          payload: { inputId: hdmiInput },
        }));
      }

      if (msg?.type === "response" && msg.id === "switch_input" && registered) {
        const success = msg.payload?.returnValue === true;
        tvLog(success ? `  TV accepted input ${hdmiInput}` : `  TV rejected input ${hdmiInput}`);
        finish(success);
      }

      if (msg?.type === "error") {
        tvLog(`  TV error: ${msg.error || "request failed"}`);
        finish(false);
      }
    };
    ws.onerror = (event: Event | ErrorEvent) => {
      tvLog(`  TV connection failed: ${(event as ErrorEvent).message || "connection closed"}`);
      finish(false);
    };
    ws.onclose = () => {
      tvLog("  TV connection closed before confirming the input command");
      finish(false);
    };
    ws.send(JSON.stringify(createHandshake(clientKey)));
  });
}
