# Solaar Research Notes

*Research notes from 2026-01-10*

---

## Research 1

**Prompt:** Research Solaar (Logitech device manager for Linux) rule editor and how to execute external commands. I need:

1. **Rule Editor**: How to create rules that execute shell commands/scripts
2. **Execute ...

Perfect! Now I have comprehensive information. Let me compile the research results for the user.

## Solaar Rule Editor and External Command Execution - Complete Research

Based on my research of current Solaar documentation and GitHub resources, here's a comprehensive guide to creating rules that execute shell commands/scripts:

### 1. RULE EDITOR & COMMAND EXECUTION

**How to create rules:**
- Open Solaar main window and click the "Rule Editor" button
- Rules can also be manually edited in `~/.config/solaar/rules.yaml`
- Rules consist of conditions, sub-rules, and actions evaluated in sequence

**Execute Action Syntax:**
```yaml
Execute: [program, arg1, arg2, arg3]
```

**Important:** Arguments must be provided as a **list, not a single string**. This is critical.

Examples from real configurations:
```yaml
Execute: [notify-send, Switched to host 2]
Execute: [dbus-send, --session, --type=method_call, --dest=org.gnome.Shell, /org/gnome/Shell, org.gnome.Shell.Eval, string:'Main.shellDBusService.ShowApplications()']
Execute: [/home/user/.local/bin/my-script.sh]
```

### 2. EXECUTE ACTION - SYNTAX & ARGUMENTS

- **Supports arguments:** YES - as separate list items
- **Shell expansion:** NO - does NOT support shell metacharacters, pipes, or globbing
- **Execution model:** Asynchronous (non-blocking)

**Common mistakes (will fail):**
```yaml
# WRONG - single string won't work
Execute: dbus-send --session --type=method_call

# WRONG - shell features don't work
Execute: [notify-send, $(date)]
Execute: [echo, test > /tmp/file.txt]
```

**Correct format:**
```yaml
# RIGHT - separate arguments
Execute: [dbus-send, --session, --type=method_call]

# RIGHT - full path to script for complex operations
Execute: [/path/to/script.sh, arg1, arg2]
```

### 3. ENVIRONMENT & SHELL CONTEXT

**Shell execution:** Solaar uses Python's `subprocess` module with `shell=False` (the default secure mode)

**Environment variables:**
- Regular environment variables ARE available to executed commands
- Commands run in the context of the Solaar process's environment
- PATH variable IS respected - you can use commands in your PATH without full paths

**Example:**
```yaml
Execute: [notify-send, Hello World]  # Works if notify-send is in PATH
Execute: [xflock4]                    # Works if xflock4 is in PATH
```

**Limitations:**
- No shell expansion (no `$VAR`, `~`, `*` globbing)
- No pipes, redirection, or command substitution
- For complex operations, use a script file instead

### 4. BUTTON CONDITIONS - SETUP

**Key condition syntax:**
```yaml
Condition: Key: button_name                    # Simple: triggers on any press
Condition: Key: [button_name, pressed]         # Key down event
Condition: Key: [button_name, released]        # Key up event
```

**Finding button names:**
1. In Solaar GUI: View "Key/Button Diversion" setting
2. Via CLI: Run `solaar show` and check "Reprogrammable keys" section

**Prerequisites:**
- Buttons MUST be diverted first via Solaar settings
- Not all buttons are divertable (e.g., M650L only supports back/forward/middle)

**Complete rule example:**
```yaml
- Condition:
    Key: [Back Button, pressed]
  Action:
    KeyPress: [Control_L, c]
```

### 5. PATH REQUIREMENTS

**Can use relative/command names:** YES
- Commands in system PATH work without full path
- Example: `Execute: [notify-send, test]` works if notify-send is in PATH

**Full paths work:** YES
- Always recommended for custom scripts
- Example: `Execute: [/home/user/bin/my-script.sh]`

**Rules of thumb:**
- For system commands: Can use PATH (e.g., `notify-send`, `xflock4`)
- For custom scripts: Use full paths (e.g., `/home/user/.local/bin/script.sh`)

### 6. ERROR HANDLING & LOGGING

**What happens if command fails:**
- Command failures are silent by default
- Process runs asynchronously, errors don't stop rule processing
- No return status checking in rules

**Debugging:**
- Run Solaar with debug flags: `solaar -dd` or `solaar -ddd`
- Look for subprocess execution in debug output
- Check syslog/journal for external command errors

**Important caveats:**
- Rule processing REQUIRES key/button diversion
- Full functionality only on X11; Wayland has significant limitations
- Process conditions don't work on Wayland without X11 libraries

### PRACTICAL WORKING EXAMPLES

```yaml
# Notify on button press
- Condition:
    Key: [Forward Button, pressed]
  Action:
    Execute: [notify-send, "Forward button pressed"]

# Execute script with arguments
- Condition:
    Key: [Gesture Button, pressed]
  Action:
    Execute: [/path/to/my-script.sh, arg1, arg2]

# Complex dbus-send with proper argument separation
- Condition:
    Key: [Special Button, pressed]
  Action:
    Execute: [dbus-send, --session, --type=method_call, --dest=org.gnome.Shell, /org/gnome/Shell, org.gnome.Shell.Eval, string:'print(123)']
```

---

**Sources:**
- [Rules - Solaar Documentation](https://pwr-solaar.github.io/Solaar/rules/)
- [GitHub - pwr-Solaar/Solaar](https://github.com/pwr-Solaar/Solaar)
- [Mouse gesture rules do not execute commands with dbus-send - Issue #1467](https://github.com/pwr-Solaar/Solaar/issues/1467)
- [Help for edit rule configuration - Issue #2217](https://github.com/pwr-Solaar/Solaar/issues/2217)
- [Correct rules.yaml for Logitech MX Master 3S - Issue #2020](https://github.com/pwr-Solaar/Solaar/issues/2020)
- [Implementation - Solaar Documentation](https://pwr-solaar.github.io/Solaar/implementation/)
- [Usage - Solaar Documentation](https://pwr-solaar.github.io/Solaar/usage/)

---

## Research 2

**Prompt:** Research Solaar (Logitech device manager for Linux) from their GitHub repository and documentation. I need detailed information on:

1. **Rules YAML format**: The EXACT correct syntax for rules.yaml -...

Perfect! Now I have comprehensive information. Let me compile the detailed research report for you.

## Comprehensive Solaar Research Report

Based on my research of the Solaar GitHub repository, documentation, and GitHub issues, here's the detailed information you requested:

---

### 1. RULES YAML FORMAT - EXACT CORRECT SYNTAX

**File Location:** `~/.config/solaar/rules.yaml`

**Basic Structure:**
```yaml
%YAML 1.3
---
# First rule
- Key: [M2, pressed]
- Set: [198E3EB8, dpi, 3000]
- Execute: [notify-send, "Speed increased"]
...
---
# Second rule
- Feature: CROWN
- Process: music_app
- Rule:
  - Test: crown_right_ratchet
  - KeyPress: XF86_AudioRaiseVolume
...
```

**Key Structure Points:**
- Rules are YAML documents separated by `---`
- Each rule is a **sequence of conditions and/or actions** (not nested dictionaries)
- Rules process in order; **if a condition fails, rule stops**
- If the last thing executed is an action, no more rules process for that notification

**Flat vs. Nested:** The structure is essentially **flat within a single rule**, with conditions evaluated sequentially, then actions executed.

---

### 2. EXECUTE ACTION - CORRECT SYNTAX

**Syntax Format:**
```yaml
- Execute: [program_name, arg1, arg2, arg3]
```

**Examples:**
```yaml
# Simple notification
- Execute: [notify-send, "Message text"]

# With multiple arguments
- Execute: [notify-send, "Title", "Body text"]

# Complex command with flags
- Execute: [flatpak, run, menu.kando.Kando, --menu, "Browser Menu"]

# Shell script execution
- Execute: [/path/to/script.sh, argument1]
```

**Important Details:**
- **Full paths are recommended** for scripts (e.g., `/usr/local/bin/script.sh` vs just `script`), though system PATH is searched
- **Arguments are separated as list elements**, not as a single quoted string
- Execution is **asynchronous** (non-blocking)
- Each argument is a separate list element, preserving spaces within arguments
- No special quoting needed for spaces in individual arguments

**CRITICAL FOR YOUR ISSUE:** The Execute action must be in a rule that has proper conditions matching your diverted button.

---

### 3. KEY/BUTTON CONDITIONS - EXACT FORMAT

**Basic Key Condition:**
```yaml
- Key: Button_Name
```

**With Press/Release Action:**
```yaml
- Key: [Back, pressed]    # When back button is pressed down
- Key: [Back, released]   # When back button is released
```

**Checking Current State:**
```yaml
- KeyIsDown: Back         # True if currently held down
```

**Working Examples:**
```yaml
---
- Key: [Back, pressed]
- Execute: [notify-send, "Back button pressed"]
...
---
- Key: [Forward, released]
- KeyPress: Alt_L+Left
...
```

**How to Find Correct Key Names:**
1. Run `solaar show` in terminal - shows Reprogrammable Keys section
2. Check Solaar GUI → Key/Button Diversion setting
3. Exact names match what Solaar displays

---

### 4. DIVERT-KEYS PERSISTENCE - HOW TO MAKE IT STICK

**Storage Locations:**
- **Divert-keys settings:** Stored in `~/.config/solaar/config.yaml`
- **Rules:** Stored in `~/.config/solaar/rules.yaml`

**Configuration Structure:**
These are **separate but related:**
- `config.yaml` = Device settings (includes divert-keys setting values)
- `rules.yaml` = The rules that respond to those diverted keys

**Persistence on Restart:**
According to the documentation: "When Solaar starts, it restores on-line devices to their previously-known state." However, there are known issues:

**KNOWN PERSISTENCE BUG:** Issue #2352 reported that diverted keys stop working after reboot until manually re-locked. This was caused by a settings validation error that delayed device initialization by 8 seconds. **The fix was merged in PR #2353**, so update Solaar to the latest version.

**To Ensure Persistence:**
1. Set your divert-keys in Solaar GUI (Key/Button Diversion setting)
2. Create your rules in `~/.config/solaar/rules.yaml` or via GUI Rule Editor
3. Restart Solaar or reboot to verify they persist
4. If they don't persist, ensure you're using Solaar 1.1.4+ (for proper rule support)

---

### 5. RULE RELOAD - AUTO-RELOAD BEHAVIOR

**Current Behavior:** NO automatic file watching or reload.

**How Rules Load:**
- Rules are loaded from `~/.config/solaar/rules.yaml` **when Solaar starts**
- Editing the file while Solaar is running **does not automatically reload** the rules
- **Solution:** You must **restart Solaar** for rule changes to take effect

**Recommended Workflow:**
1. Edit `~/.config/solaar/rules.yaml` 
2. Close Solaar completely
3. Restart Solaar
4. Test your rules

**GUI Alternative:** Use the Rule Editor button in Solaar's main window for changes that apply immediately.

---

### 6. COMMON ISSUES WITH RULES NOT EXECUTING - DEBUGGING GUIDE

**Most Common Cause - NOT DIVERTED:**
```
If the back button (or any key/button) is not diverted by setting the 
appropriate setting then NO HID++ notification is generated and rules 
will NOT be triggered.
```

**Diagnostic Checklist:**

1. **Verify Button is Divertable:**
   ```bash
   solaar show
   ```
   Look for "Back" in Reprogrammable Keys section with "divertable" capability listed.

2. **Verify Diversion is Enabled:**
   - Open Solaar GUI → select device → Key/Button Diversion setting
   - Set "Back Button" to **"Diverted"** (not "Regular")
   - Check `~/.config/solaar/config.yaml` - verify the setting is saved

3. **Verify Rule Syntax:**
   ```yaml
   ---
   - Key: [Back, pressed]
   - Execute: [notify-send, "Back pressed"]
   ...
   ```
   Common errors:
   - Using hyphens instead of underscores: `Control-L` ❌ should be `Control_L` ✓
   - Not formatting key names correctly in arrays
   - Improper Execute list formatting

4. **Debug with Verbose Logging:**
   ```bash
   solaar -ddd
   ```
   Press your back button and watch the output. You should see HID++ notifications like:
   ```
   Feature: FEATURE_NAME, Report: XX, Data: [...]
   ```
   If you see nothing, the button is not properly diverted.

5. **Check for Keyboard Layout Issues:**
   - Issue #2794 reported that rules stop working when switching keyboard layouts
   - Linux input system requires keycodes, which change with layout
   - Use `Execute` actions (like `notify-send`) which are layout-agnostic instead of `KeyPress` with letters

6. **Verify Device-Specific Support:**
   - Not all Logitech mice support back button diversion
   - MX Master 3S supports basic back/forward but NOT short/long press variants
   - Check GitHub issues for your specific device model

7. **Wayland Limitations:**
   - If using Wayland, some rule actions don't work (process conditions, some input simulations)
   - Use GNOME Solaar extension if on GNOME + Wayland
   - Prefer X11 for full rule support

**For Your Specific Issue (Diverted Back Button + Execute):**

Troubleshooting steps:
```bash
# 1. Check if button is divertable
solaar show | grep -i "back\|divert"

# 2. Watch for notifications when pressing back button
solaar -ddd
# (Press back button and note the output)

# 3. Verify your rules.yaml syntax
cat ~/.config/solaar/rules.yaml

# 4. Check config.yaml for divert-keys setting
grep -A5 "divert-keys" ~/.config/solaar/config.yaml

# 5. Restart Solaar to reload rules
# (Close GUI and restart)
```

**If Back Button Generates NO Notifications:**
- The button may not support diversion on your device
- Try a different key that shows "divertable" in `solaar show`
- Verify in Solaar GUI that it's set to "Diverted" not "Regular"

---

### WORKING EXAMPLE FOR YOUR USE CASE

Based on the wiki example for diverted keys:

```yaml
%YAML 1.3
---
# When Back button is pressed, show notification
- Key: [Back, pressed]
- Execute: [notify-send, "Back button activated"]
...
---
# When Back button is released
- Key: [Back, released]
- Execute: [notify-send, "Back button released"]
...
```

**Config.yaml relevant section:**
```yaml
device_name:
  Key/Button Diversion:
    - - Back Button
      - Diverted
    - - Forward Button
      - Diverted
```

---

## Key Resources Consulted

- [Solaar Rules Documentation](https://pwr-solaar.github.io/Solaar/rules/)
- [Solaar GitHub Repository](https://github.com/pwr-Solaar/Solaar)
- [Issue #2282: Keys must be divertable](https://github.com/pwr-Solaar/Solaar/issues/2282)
- [Issue #2352: Diverted key not working after reboot](https://github.com/pwr-Solaar/Solaar/issues/2352)
- [Issue #2569: Thumb wheel divert rules](https://github.com/pwr-Solaar/Solaar/issues/2569)
- [Issue #2794: Rules stop working with layout change](https://github.com/pwr-Solaar/Solaar/issues/2794)
- [Issue #3046: MX Master 4 back button](https://github.com/pwr-Solaar/Solaar/issues/3046)
- [Issue #1660: Back/Forward buttons not working](https://github.com/pwr-Solaar/Solaar/issues/1660)
- [Example: Diverted Host Switch Channel keys](https://github.com/pwr-Solaar/Solaar/wiki/Example:-Diverted-%22Host-Switch-Channel%22-keys-for-common-devices)

The most likely cause of your Execute action not firing is that the Back Button isn't properly diverted or hasn't been set to "Diverted" in the Key/Button Diversion setting. Start by running `solaar -ddd` and pressing the back button to see if any HID++ notifications appear.

