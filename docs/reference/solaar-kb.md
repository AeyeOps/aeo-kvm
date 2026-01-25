# Solaar Knowledge Base

## Rule System

### Trigger Mechanism
- Rules ONLY trigger on HID++ notifications
- No polling, timers, or system events trigger rules
- Flow: Device → HID++ notification → listener → notifications module → diversion module → rules

### Conditions (what can trigger/filter)
| Condition | Purpose | Needs HID++ notification? |
|-----------|---------|---------------------------|
| Key | Match diverted key/button press/release | YES |
| Feature | Match notification feature (CROWN, THUMB WHEEL) | YES |
| Report | Match notification report number | YES |
| Test/TestBytes | Low-level notification data check | YES |
| MouseGesture | Match gesture while button held | YES |
| KeyIsDown | Check if diverted key currently held | NO (state check) |
| Modifiers | Check keyboard modifiers (Shift, Ctrl) | NO (state check) |
| Process | Match focused window process | NO (state check) |
| MouseProcess | Match window under cursor | NO (state check) |
| Device | Filter by device | NO (filter) |
| Active | Check if device active | NO (state check) |
| Host | Check hostname | NO (state check) |
| Setting | Check device setting value | NO (state check) |

### Actions (what rules can do)
| Action | Function |
|--------|----------|
| Set | Change device setting (incl. change-host) |
| KeyPress | Simulate keyboard input |
| MouseScroll | Simulate scroll |
| MouseClick | Simulate mouse click |
| Execute | Run external command |
| Later | Delay execution |

## Our Configuration

### Devices
- M750 L mouse: BLE, /dev/hidraw3, HID++ 4.5
- K950 keyboard: BLE, /dev/hidraw2, HID++ 4.5
- No USB receiver

### Validated State (2026-01-10)
- Back Button (0x53) diverted and sends HID++ notifications
- Execute action triggers successfully
- NOTIFICATION FLAGS: False in debug logs is misleading - notifications still work
- Solaar rules work on BLE devices
