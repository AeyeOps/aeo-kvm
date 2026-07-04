#!/usr/bin/env python3
"""Bind the M750 Back/Forward buttons to the aeo-kvm switch .app wrappers by
editing Logi Options+' config directly (no UI).

Logi Options+ stores its profile as a JSON blob in settings.db (table `data`,
single row, BLOB column `file`). A button assignment is
  {card, cardId, slotId, tags:["UI_PAGE_BUTTONS"]}
and the native "Open application" action is the shipped preset
card_global_presets_open_application: macro.type=OPEN_FILE_FOLDER with
open_file_folder.path pointing at a .app (taskId 65540 runs the open).

We bind:
  M750 Back  (slot *_c83) -> Switch to Windows.app
  M750 Fwd   (slot *_c86) -> Switch to Linux.app

The Opti+ agent (launchd com.logi.cp-dev-mgr, KeepAlive only on crash) and the UI
are stopped first so they cannot clobber the write, then restarted. Everything is
backed up first and the run is idempotent.
"""
import json, os, sqlite3, subprocess, sys, time, shutil

HOME = os.path.expanduser("~")
INSTALL_DIR = f"{HOME}/.local/share/aeo-kvm"
SUPPORT = f"{HOME}/Library/Application Support/LogiOptionsPlus"
SETTINGS_DB = f"{SUPPORT}/settings.db"
MACROS_DB = f"{SUPPORT}/macros.db"
UID = os.getuid()
AGENT_LABEL = "com.logi.cp-dev-mgr"
AGENT_PLIST = "/Library/LaunchAgents/com.logi.optionsplus.plist"

# M750 control IDs: c83 = Back button (0x53), c86 = Forward button (0x56).
BINDINGS = {
    "_c83": ("Switch to Windows.app", "Switch to Windows"),
    "_c86": ("Switch to Linux.app", "Switch to Linux"),
}


def open_app_card(app_path: str, pretty: str) -> dict:
    return {
        "attribute": "MACRO_PLAYBACK",
        "category": "ASSIGNMENT_CATEGORY_NAVIGATE_COMPUTER",
        "icons": {"uri": "pipeline://system_actions/", "icons": ["OpenApp.png", "OpenApp.svg"]},
        "id": "card_global_presets_open_application",
        "macro": {
            "type": "OPEN_FILE_FOLDER",
            "open_file_folder": {"path": app_path, "isFolderMode": False},
            "onboardable": False,
            "actionName": "open_file_folder_app",
            "icon": "",
        },
        "name": pretty,
        "readOnly": False,
        "tags": ["PRESET_TAG_KEY_OR_BUTTON", "PRESET_COMPUTER_FUNCTIONS"],
        "taskId": 65540,
    }


def sh(*args, check=True):
    return subprocess.run(args, check=check, capture_output=True, text=True)


def stop_optionsplus():
    # Quit the UI (it rewrites settings on close), then bootout the agent.
    sh("pkill", "-f", "/Applications/logioptionsplus.app", check=False)
    sh("launchctl", "bootout", f"gui/{UID}/{AGENT_LABEL}", check=False)
    time.sleep(2)


def start_optionsplus():
    # bootstrap can fail transiently right after bootout while the old
    # instance is still exiting; a silent failure leaves no button listener.
    for attempt in range(5):
        r = sh("launchctl", "bootstrap", f"gui/{UID}", AGENT_PLIST, check=False)
        time.sleep(2)
        if subprocess.run(["pgrep", "-f", "logioptionsplus_agent.app/Contents/MacOS"],
                          capture_output=True).returncode == 0:
            return
        print(f"[retry] agent not up after bootstrap (rc={r.returncode}): {r.stderr.strip()}")
    sys.exit("[ERROR] Options+ agent failed to start; run: "
             f"launchctl bootstrap gui/{UID} {AGENT_PLIST}")


def read_blob(db: str) -> dict:
    con = sqlite3.connect(db)
    try:
        con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        row = con.execute("SELECT _id, file FROM data ORDER BY _id DESC LIMIT 1").fetchone()
    finally:
        con.close()
    return {"id": row[0], "obj": json.loads(row[1])}


def write_blob(db: str, row_id: int, obj: dict):
    blob = json.dumps(obj, indent=2).encode()
    con = sqlite3.connect(db)
    try:
        con.execute("UPDATE data SET file=? WHERE _id=?", (blob, row_id))
        con.commit()
        con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    finally:
        con.close()


def main():
    for _, (app, _) in BINDINGS.items():
        if not os.path.isdir(f"{INSTALL_DIR}/{app}"):
            sys.exit(f"[ERROR] missing wrapper {INSTALL_DIR}/{app} (run scripts/macos-make-apps.sh)")

    backup = f"{INSTALL_DIR}/optionsplus-backup-{time.strftime('%Y%m%d-%H%M%S')}"
    os.makedirs(backup, exist_ok=True)
    for db in (SETTINGS_DB, MACROS_DB):
        for suf in ("", "-wal", "-shm"):
            src = db + suf
            if os.path.exists(src):
                shutil.copy2(src, os.path.join(backup, os.path.basename(src)))
    print(f"[backup] {backup}")

    stop_optionsplus()

    settings = read_blob(SETTINGS_DB)
    obj = settings["obj"]
    profile_key = next(k for k in obj if k.startswith("profile-"))
    assignments = obj[profile_key]["assignments"]

    bound = []
    for a in assignments:
        slot = a.get("slotId", "")
        for suffix, (app, pretty) in BINDINGS.items():
            if "m750" in slot and slot.endswith(suffix):
                a["card"] = open_app_card(f"{INSTALL_DIR}/{app}", pretty)
                a["cardId"] = "card_global_presets_open_application"
                a["tags"] = ["UI_PAGE_BUTTONS"]
                bound.append(f"{slot} -> {app}")
    if len(bound) != len(BINDINGS):
        start_optionsplus()
        sys.exit(f"[ERROR] expected {len(BINDINGS)} M750 button slots, bound {len(bound)}: {bound}")

    write_blob(SETTINGS_DB, settings["id"], obj)

    # Remove the earlier half-made Smart Action so no broken macro lingers.
    macros = read_blob(MACROS_DB)
    write_blob(MACROS_DB, macros["id"], {"macros_settings_transferred": True})

    start_optionsplus()
    print("[bound]")
    for b in bound:
        print("  " + b)
    print("[done] Opti+ restarted. Open it to confirm the buttons show 'Open application'.")


if __name__ == "__main__":
    main()
