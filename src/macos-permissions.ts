import { dlopen, FFIType } from "bun:ffi";

export function requestInputMonitoring(): void {
  const iokit = dlopen("/System/Library/Frameworks/IOKit.framework/IOKit", {
    IOHIDRequestAccess: {
      args: [FFIType.u32],
      returns: FFIType.bool,
    },
  });
  const listenEvent = 1;
  try {
    const granted = iokit.symbols.IOHIDRequestAccess(listenEvent);
    console.log(
      granted
        ? "[Permissions] Input Monitoring is enabled."
        : "[Permissions] Enable this Switch app in System Settings > Privacy & Security > Input Monitoring."
    );
  } finally {
    iokit.close();
  }
}
