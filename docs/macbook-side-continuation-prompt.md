# MacBook Side Continuation Prompt

Use this prompt when starting the MacBook-side return-switching work:

```text
We are continuing work on the aeo-kvm repo.

Current Windows-side state:
- Windows can switch the Logitech K950, Logitech M750, and LG TV to the portable MacBook.
- MacBook target mapping is Logitech host slot 3 / zero-based host index 2 and LG TV input HDMI_4.
- Existing targets are Windows on Logitech host slot 1 / HDMI_3 and Linux on Logitech host slot 2 / HDMI_2.
- Logi Options+ cannot reliably launch a command with arguments, so Windows uses two executable entrypoints:
  - `aeo-kvm.exe` defaults to Linux.
  - `switch-to-macbook.exe` defaults to MacBook.
- Linux can pass command arguments through Solaar, so it uses one executable:
  - Back Button runs `/opt/aeo-kvm/aeo-kvm switch-to-windows`.
  - Forward Button runs `/opt/aeo-kvm/aeo-kvm switch-to-macbook`.

Goal for this session:
Add the MacBook-side return path so that, while on the MacBook, I can trigger switching back to the main Windows/Linux KVM setup.

Constraints:
- Do not redesign the whole repo.
- Reuse the existing aeo-kvm command structure and installer patterns where possible.
- Keep the change minimal and hardware-focused.
- Preserve the working Windows and Linux behavior.
- Assume the Logitech devices are already paired to all relevant slots.
- Do not add test automation scaffolding unless explicitly asked.
- Keep any Mac implementation close to the existing command shape: `switch-to-windows` and `switch-to-linux`.

First inspect the repo and current Mac support assumptions, then recommend the smallest workable Mac-side path.
```

Validation still needed after Linux install:
- Confirm Solaar recognizes `Forward Button` as the right physical button name on the M750.
- Confirm Back Button on Linux switches to Windows.
- Confirm Forward Button on Linux switches to MacBook.
- Confirm the MacBook-side implementation can switch to Windows and Linux without breaking the existing Windows/Linux paths.
