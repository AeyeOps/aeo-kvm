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
  const { switchDevices } = await import("./hid-ffi");
  const { switchTV } = await import("./tv");

  // Default: switch to the OTHER platform, unless launched via target-specific wrapper exe.
  const exeName = basename(process.execPath).toLowerCase();
  const defaultCommand =
    process.platform === "win32"
      ? exeName === "switch-to-macbook.exe" ? "switch-to-macbook" : "switch-to-linux"
      : "switch-to-windows";
  const command = args.find((a) => !a.startsWith("-")) || defaultCommand;

  switch (command) {
    case "switch-to-linux":
      console.log("[KVM] Switching to Linux...");
      await switchDevices("linux");
      await switchTV("HDMI_2");
      console.log("[KVM] Done");
      break;
    case "switch-to-windows":
      console.log("[KVM] Switching to Windows...");
      await switchDevices("windows");
      await switchTV("HDMI_3");
      console.log("[KVM] Done");
      break;
    case "switch-to-macbook":
      console.log("[KVM] Switching to MacBook...");
      await switchDevices("macbook");
      await switchTV("HDMI_4");
      console.log("[KVM] Done");
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
