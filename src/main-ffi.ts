#!/usr/bin/env bun
/**
 * AEO-KVM: Switch keyboard, video, and mouse between hosts
 *
 * Usage:
 *   aeo-kvm                   Switch to Linux (default on Windows)
 *   aeo-kvm switch-to-linux   Switch to Linux (Host 2, HDMI_2)
 *   aeo-kvm switch-to-windows Switch to Windows (Host 1, HDMI_3)
 *   aeo-kvm switch-to-macbook Switch to MacBook (Host 3, HDMI_4)
 */

// Windows installer - imported early but doesn't load hidapi
import { basename } from "path";
import {
  isInstallMode,
  isUninstallMode,
  install,
  uninstall,
  showHelp,
} from "./windows-installer";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Windows: Handle install/uninstall BEFORE loading HID modules
  if (process.platform === "win32") {
    if (isUninstallMode()) {
      await uninstall();
      return;
    }

    if (isInstallMode()) {
      await install();
      return;
    }

    // If running installed exe with --help, show help
    if (args.includes("--help") || args.includes("-h")) {
      showHelp();
      return;
    }
    // Otherwise, no args from installed location = switch-to-linux (Options+ default)
  }

  // Now safe to load HID modules (DLL is in place)
  const { switchDevices, probeDevices } = await import("./hid-ffi");
  const { switchTV } = await import("./tv");

  // Logi Options+ / Solaar Smart Actions launch an executable with NO arguments,
  // so the switch target is derived from the binary's own filename. Ship copies
  // named switch-to-linux / switch-to-windows / switch-to-macbook and bind each
  // to a mouse button. An explicit CLI arg still wins for manual/testing use.
  const exeName = basename(process.execPath).toLowerCase().replace(/\.exe$/, "");
  const byFilename: Record<string, string> = {
    "switch-to-linux": "switch-to-linux",
    "switch-to-windows": "switch-to-windows",
    "switch-to-macbook": "switch-to-macbook",
  };
  const defaultCommand =
    byFilename[exeName] ?? (process.platform === "win32" ? "switch-to-linux" : "switch-to-windows");
  const command = args.find((a) => !a.startsWith("-")) || defaultCommand;

  const TV_INPUT: Record<string, string> = {
    linux: "HDMI_2",
    windows: "HDMI_3",
    macbook: "HDMI_4",
  };

  // macOS walls off keyboard (K950) HID behind root, even with Input Monitoring
  // (kIOReturnNotPrivileged). The user-space .app switches mouse + TV, then hands
  // the keyboard setHost to a tiny root-owned helper via passwordless sudo.
  // Mouse (M750) and TV need no privilege, so they stay in this process.
  const KBD_HELPER = "/usr/local/libexec/aeo-kvm/aeo-kvm-kbd";

  async function switchKeyboardViaRoot(target: string): Promise<void> {
    const proc = Bun.spawn(["/usr/bin/sudo", "-n", KBD_HELPER, `keyboard-to-${target}`], {
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await proc.exited;
    if (code !== 0) {
      // Fail loudly - a silent keyboard no-op is exactly the confusing partial
      // state we want to avoid. Mouse + TV already switched at this point.
      console.error(
        `[KVM] Keyboard switch FAILED (sudo helper exit ${code}). ` +
          `Install the root helper: scripts/macos-install-kbd-helper.sh`
      );
    }
  }

  async function doSwitch(target: "linux" | "windows" | "macbook"): Promise<void> {
    console.log(`[KVM] Switching to ${target}...`);
    if (process.platform === "darwin") {
      await switchDevices(target, "M750"); // mouse only; keyboard is root-gated
      await switchTV(TV_INPUT[target]);
      await switchKeyboardViaRoot(target);
    } else {
      await switchDevices(target); // Linux/Windows: no privilege split needed
      await switchTV(TV_INPUT[target]);
    }
    console.log("[KVM] Done");
  }

  switch (command) {
    case "probe":
      // Non-destructive: report HID open access (no switch). For verifying
      // Input Monitoring / root access on macOS. Results also go to the log file.
      await probeDevices();
      break;
    // Root-helper commands: keyboard (K950) only, no mouse, no TV. Invoked as
    // `sudo aeo-kvm-kbd keyboard-to-<target>` by the user-space app on macOS.
    case "keyboard-to-linux":
      await switchDevices("linux", "K950");
      break;
    case "keyboard-to-windows":
      await switchDevices("windows", "K950");
      break;
    case "keyboard-to-macbook":
      await switchDevices("macbook", "K950");
      break;
    case "switch-to-linux":
      await doSwitch("linux");
      break;
    case "switch-to-windows":
      await doSwitch("windows");
      break;
    case "switch-to-macbook":
      await doSwitch("macbook");
      break;
    default:
      console.log(`Unknown command: ${command}`);
      console.log("Usage: aeo-kvm [switch-to-linux|switch-to-windows|switch-to-macbook]");
      process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
