/**
 * Windows self-installer for AEO-KVM
 *
 * Handles:
 * - install(): Extract embedded DLL + copy self to %LOCALAPPDATA%\aeo-kvm
 * - uninstall(): Remove install directory
 * - Mode detection: install vs normal operation
 */
import { join } from "path";
import { mkdirSync, rmSync, existsSync } from "fs";

// Embedded DLL - bundled into exe at compile time
import hidapiDllPath from "../libs/hidapi.dll" with { type: "file" };

const INSTALL_DIR = join(process.env.LOCALAPPDATA || "", "aeo-kvm");

/**
 * Check if running from the installed location
 */
export function isInstalledLocation(): boolean {
  if (!process.env.LOCALAPPDATA) return false;
  return process.execPath.toLowerCase().startsWith(INSTALL_DIR.toLowerCase());
}

/**
 * Check if we should run in install mode
 */
export function isInstallMode(): boolean {
  // Never reinstall over ourselves
  if (isInstalledLocation()) return false;

  const args = process.argv.slice(2);

  // Explicit install flag
  if (args.includes("--install")) return true;

  // No args = install mode (when not already installed)
  if (args.length === 0) return true;

  return false;
}

/**
 * Check if we should run in uninstall mode
 */
export function isUninstallMode(): boolean {
  return process.argv.slice(2).includes("--uninstall");
}

/**
 * Install AEO-KVM to %LOCALAPPDATA%\aeo-kvm
 */
export async function install(): Promise<void> {
  console.log("[Install] AEO-KVM Windows Setup");
  console.log("");

  // Create install directory
  console.log(`[Create] ${INSTALL_DIR}`);
  mkdirSync(INSTALL_DIR, { recursive: true });

  // Extract embedded DLL
  const dllDest = join(INSTALL_DIR, "hidapi.dll");
  console.log(`[Extract] hidapi.dll`);
  const dllData = await Bun.file(hidapiDllPath).bytes();
  await Bun.write(dllDest, dllData);

  // Copy self to install directory
  const exeDest = join(INSTALL_DIR, "aeo-kvm.exe");
  console.log(`[Copy] aeo-kvm.exe`);
  await Bun.write(exeDest, Bun.file(process.execPath));

  // Create config file with placeholder
  const configFile = join(INSTALL_DIR, "tv-keys.json");
  if (!existsSync(configFile)) {
    console.log(`[Create] tv-keys.json`);
    const defaultConfig = { ip: "192.168.1.XXX", key: "" };
    await Bun.write(configFile, JSON.stringify(defaultConfig, null, 2));
  }

  console.log("");
  console.log("============================================================");
  console.log(" AEO-KVM installed successfully!");
  console.log("============================================================");
  console.log("");
  console.log(` Location: ${INSTALL_DIR}`);
  console.log("");
  console.log(" Step 1: Configure TV connection");
  console.log("");
  console.log(`   Edit: ${configFile}`);
  console.log("   Replace 192.168.1.XXX with your LG TV's IP address.");
  console.log("");
  console.log("   Then run: aeo-kvm.exe switch-to-linux --verbose");
  console.log("   Check your TV for the pairing prompt and accept it.");
  console.log("   The client key will be saved automatically.");
  console.log("");
  console.log(" Step 2: Configure Logi Options+ Smart Actions");
  console.log("");
  console.log("   1. Open Logi Options+ -> Smart Actions");
  console.log("   2. Select your mouse (M750)");
  console.log("   3. Click 'Add Action' -> 'Application-specific Settings'");
  console.log("   4. For Back Button, choose 'Open Application'");
  console.log(`   5. Browse to: ${exeDest}`);
  console.log("   (No argument needed - defaults to switch-to-linux)");
  console.log("");
  console.log("============================================================");
}

/**
 * Uninstall AEO-KVM
 */
export async function uninstall(): Promise<void> {
  console.log("[Uninstall] AEO-KVM Windows");
  console.log("");

  if (existsSync(INSTALL_DIR)) {
    console.log(`[Remove] ${INSTALL_DIR}`);
    rmSync(INSTALL_DIR, { recursive: true, force: true });
    console.log("  Removed");
  } else {
    console.log(`[Skip] ${INSTALL_DIR} not found`);
  }

  console.log("");
  console.log("============================================================");
  console.log(" AEO-KVM uninstalled");
  console.log("============================================================");
  console.log("");
  console.log(" Remember to remove the Logi Options+ Smart Action:");
  console.log("   1. Open Logi Options+ -> Smart Actions");
  console.log("   2. Delete the Back Button action for aeo-kvm");
  console.log("");
  console.log("============================================================");
}

/**
 * Show help for installed exe
 */
export function showHelp(): void {
  console.log("AEO-KVM - Software KVM Switch");
  console.log("");
  console.log("Usage:");
  console.log("  aeo-kvm.exe                    Switch to Linux (default on Windows)");
  console.log("  aeo-kvm.exe switch-to-windows  Switch back to Windows");
  console.log("  aeo-kvm.exe --uninstall        Remove AEO-KVM");
  console.log("");
  console.log("Config:");
  console.log("  Edit tv-keys.json in same directory as exe.");
}
