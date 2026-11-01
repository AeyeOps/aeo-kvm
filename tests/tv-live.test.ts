import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { connectTV } from "../src/tv-discovery";
import { switchTV } from "../src/tv";

const enabled = process.env.AEO_KVM_LIVE_TV === "1";
const configFile = join(homedir(), ".config", "aeo-kvm", "tv-keys.json");

describe.skipIf(!enabled)("live TV recovery", () => {
  let original: string | undefined;
  let config: Record<string, string>;
  let ip: string;
  let subnet: string;
  let staleIP: string;
  let deviceUUID: string;
  let input: string;

  async function currentInput(): Promise<string> {
    const connection = await connectTV(ip, deviceUUID);
    if (!connection) throw new Error("Could not identify the test TV");
    const ws = connection.socket;
    return new Promise((resolve, reject) => {
      const close = () => {
        clearTimeout(timeout);
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      };
      const fail = () => {
        close();
        reject(new Error("Could not read the test TV's current HDMI input"));
      };
      const timeout = setTimeout(fail, 10000);
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data as string);
        if (message.type === "registered") {
          ws.send(JSON.stringify({
            type: "request",
            id: "foreground",
            uri: "ssap://com.webos.applicationManager/getForegroundAppInfo",
          }));
        } else if (message.id === "foreground") {
          const match = message.payload?.appId?.match(/^com\.webos\.app\.hdmi([1-4])$/);
          if (message.payload?.returnValue !== true || !match) {
            fail();
          } else {
            close();
            resolve(`HDMI_${match[1]}`);
          }
        } else if (message.type === "error") {
          fail();
        }
      };
      ws.onerror = fail;
      ws.onclose = fail;
      ws.send(JSON.stringify({
        type: "register",
        id: "register_0",
        payload: { "client-key": config.key, forcePairing: false },
      }));
    });
  }

  beforeAll(async () => {
    ip = process.env.AEO_KVM_TEST_TV_IP!;
    subnet = process.env.AEO_KVM_TEST_SUBNET!;
    staleIP = process.env.AEO_KVM_TEST_STALE_IP!;
    if (!ip || !subnet || !staleIP || ip === staleIP) {
      throw new Error("Set AEO_KVM_TEST_TV_IP, AEO_KVM_TEST_SUBNET and a different AEO_KVM_TEST_STALE_IP");
    }
    original = readFileSync(configFile, "utf-8");
    config = JSON.parse(original);
    if (!config.key) throw new Error("Live tests need an existing TV pairing key");
    const connection = await connectTV(ip);
    if (!connection) throw new Error("Could not identify the test TV");
    deviceUUID = connection.deviceUUID;
    connection.socket.close();
    input = await currentInput();
  }, 30000);

  afterAll(() => {
    if (original !== undefined) writeFileSync(configFile, original);
  });

  test("learns identity at the current address and preserves the pairing key", async () => {
    const initial: Record<string, string> = { ...config, ip, discoverySubnet: subnet };
    delete initial.deviceUUID;
    writeFileSync(configFile, JSON.stringify(initial));
    expect(await switchTV(input)).toBe(true);
    const saved = JSON.parse(readFileSync(configFile, "utf-8"));
    expect(saved.deviceUUID).toBe(deviceUUID);
    expect(saved.key === config.key).toBe(true);
    expect(saved.discoverySubnet).toBe(subnet);
    expect(await currentInput()).toBe(input);
  }, 30000);

  test("recovers a stale address across the routed network and saves the new address", async () => {
    writeFileSync(configFile, JSON.stringify({ ...config, ip: staleIP, deviceUUID, discoverySubnet: subnet }));
    expect(await switchTV(input)).toBe(true);
    const saved = JSON.parse(readFileSync(configFile, "utf-8"));
    expect(saved.ip).toBe(ip);
    expect(saved.deviceUUID).toBe(deviceUUID);
    expect(saved.key === config.key).toBe(true);
    expect(saved.discoverySubnet).toBe(subnet);
    expect(await currentInput()).toBe(input);
  }, 120000);

  test("rejects a different TV identity without changing the config or input", async () => {
    const unmatched = JSON.stringify({ ...config, ip, deviceUUID: `different-${deviceUUID}`, discoverySubnet: `${ip}/32` });
    writeFileSync(configFile, unmatched);
    expect(await switchTV(input)).toBe(false);
    expect(readFileSync(configFile, "utf-8") === unmatched).toBe(true);
    expect(await currentInput()).toBe(input);
  }, 30000);
});
