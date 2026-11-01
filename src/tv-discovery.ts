import { connect, isIPv4 } from "net";

export interface IPv4Subnet {
  cidr: string;
  first: number;
  last: number;
}

export interface TVConnection {
  ip: string;
  deviceUUID: string;
  socket: WebSocket;
}

export function parseDiscoverySubnet(cidr: string): IPv4Subnet {
  if (typeof cidr !== "string") {
    throw new Error("TV discoverySubnet must be an IPv4 CIDR string");
  }
  const parts = cidr.split("/");
  const [address, prefixText] = parts;
  if (parts.length !== 2 || !isIPv4(address) || !/^\d+$/.test(prefixText)) {
    throw new Error("TV discoverySubnet must use IPv4 CIDR notation");
  }
  const prefix = Number(prefixText);
  if (prefix > 32) {
    throw new Error("TV discoverySubnet prefix must be between 0 and 32");
  }
  const addressNumber = address.split(".").reduce((value, octet) => value * 256 + Number(octet), 0);
  const size = 2 ** (32 - prefix);
  const network = Math.floor(addressNumber / size) * size;
  return {
    cidr,
    first: network + (prefix < 31 ? 1 : 0),
    last: network + size - (prefix < 31 ? 2 : 1),
  };
}

function canConnect(ip: string, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: ip, port: 3001, timeout: 2000 });
    const finish = (reachable: boolean) => {
      signal?.removeEventListener("abort", abort);
      socket.destroy();
      resolve(reachable);
    };
    const abort = () => finish(false);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export async function connectTV(
  ip: string,
  deviceUUID?: string,
  signal?: AbortSignal,
): Promise<TVConnection | null> {
  if (!(await canConnect(ip, signal)) || signal?.aborted) return null;

  return new Promise((resolve) => {
    const socket = new WebSocket(`wss://${ip}:3001`, {
      tls: { rejectUnauthorized: false },
    } as any);
    let settled = false;
    const finish = (connection: TVConnection | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (!connection) socket.close();
      resolve(connection);
    };
    const abort = () => finish(null);
    const timeout = setTimeout(abort, 10000);
    socket.onopen = () => socket.send(JSON.stringify({ type: "hello", id: "hello_0" }));
    socket.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data as string);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        finish(null);
        return;
      }
      const identity = message?.payload;
      if (
        message?.type !== "hello" ||
        identity?.deviceType !== "tv" ||
        identity?.deviceOS !== "webOS" ||
        typeof identity?.deviceUUID !== "string" ||
        !identity.deviceUUID ||
        (deviceUUID && identity.deviceUUID !== deviceUUID)
      ) {
        finish(null);
        return;
      }
      finish({ ip, deviceUUID: identity.deviceUUID, socket });
    };
    socket.onerror = abort;
    socket.onclose = abort;
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export async function discoverTVInSubnet(
  subnet: IPv4Subnet,
  deviceUUID: string,
): Promise<TVConnection | null> {
  const controller = new AbortController();
  let next = subnet.first;
  let found: TVConnection | null = null;

  const search = async () => {
    while (next <= subnet.last && !controller.signal.aborted) {
      const address = next++;
      const ip = [24, 16, 8, 0].map((shift) => (address >>> shift) & 255).join(".");
      const connection = await connectTV(ip, deviceUUID, controller.signal);
      if (connection) {
        if (found) {
          connection.socket.close();
        } else {
          found = connection;
          controller.abort();
        }
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(32, subnet.last - subnet.first + 1) }, search));
  return found;
}
