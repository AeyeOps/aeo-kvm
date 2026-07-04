/**
 * Non-destructive HID open probe (macOS keyboard-access diagnosis).
 *
 * Enumerates the Logitech HID++ vendor interfaces and tries to OPEN each one.
 * It never writes a CHANGE_HOST report, so it switches nothing. Use it to test
 * whether the process (or its TCC-responsible app) is allowed to open the K950
 * keyboard after granting Input Monitoring, without firing a real switch.
 *
 *   bun run scripts/macos-hid-diag.ts
 */
import { initHidApi, exitHidApi, enumerate, HidDevice, hidError } from "../src/hidapi-ffi";

const LOGITECH_VID = 0x046d;

if (!(await initHidApi())) {
  console.error("Failed to init hidapi");
  process.exit(1);
}

try {
  const devs = enumerate(LOGITECH_VID, 0).filter((d) => d.usagePage >= 0xff00);
  const byProduct = new Map<string, typeof devs>();
  for (const d of devs) {
    const k = d.productString || "unknown";
    if (!byProduct.has(k)) byProduct.set(k, []);
    byProduct.get(k)!.push(d);
  }

  for (const [product, ifaces] of byProduct) {
    console.log(`\n${product}`);
    for (const d of ifaces) {
      const dev = new HidDevice(d.path);
      const ok = dev.open();
      const err = ok ? "" : `  reason="${hidError()}"`;
      console.log(
        `  usage_page=0x${d.usagePage.toString(16).padStart(4, "0")}  open=${ok ? "OK" : "DENIED"}${err}  path=${d.path}`
      );
      if (ok) dev.close();
    }
  }
  console.log("\n(open=DENIED on the keyboard = macOS blocking the HID open; grant Input Monitoring to the responsible app)");
} finally {
  exitHidApi();
}
