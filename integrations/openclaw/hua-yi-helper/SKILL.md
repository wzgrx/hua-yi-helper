---
name: hua-yi-helper
description: Operate and monitor the local HuaYi Helper Hermes automation, including preflight checks, single-instance supervised startup, annual credit progress, diagnostics, and explicit shutdown. Use when the user asks OpenClaw to check, start, monitor, diagnose, or stop HuaYi Helper/Hermes.
metadata:
  {
    "openclaw":
      {
        "emoji": "📚",
        "requires": { "bins": ["node"] },
      },
  }
---

# HuaYi Helper

Use the bundled deterministic bridge instead of reproducing Hermes commands manually:

```powershell
node "$HOME/.openclaw/skills/hua-yi-helper/scripts/bridge.js" COMMAND --data-dir DATA_DIR
```

## Workflow

1. Run `check` first. Report version, data directory, browser readiness, running PID, and credential-presence booleans; never print credential values.
2. Run `status` before every `start`. If it reports a live PID, monitor that instance rather than starting another one.
3. Start a supervised instance only when requested:

```powershell
node "$HOME/.openclaw/skills/hua-yi-helper/scripts/bridge.js" start --data-dir DATA_DIR --year 2026 --public-target 5 --other-target 20 --card-retry-minutes 5 --headless true --keep-awake true
```

4. Read progress with `status`. Treat `publicEarned` and `otherEarned` as confirmed credits; projected values and pending applications are not yet confirmed.
5. If status is stale, `alive` is false, or diagnostics are present, run `check`, inspect only the listed diagnostic metadata, and report the exact failing phase. Keep screenshots, DOM captures, event logs, cookies, card numbers, and credentials out of chat.
6. Run `stop` only after an explicit stop request. The bridge targets the PID in the selected data directory's supervisor lock.

## Rules

- Reuse the user's existing `HUAYI_DATA_DIR` or explicitly supplied data directory.
- Use environment variables `HUAYI_USERNAME` and `HUAYI_PASSWORD`; do not include their values in a command line or response.
- Keep one Hermes supervisor per data directory. The bridge performs a lock/PID check before launch.
- Let Hermes own the course browser profile. Do not drive the same profile concurrently with OpenClaw's browser tool.
- A completed run requires confirmed targets in `status`, not merely a successful process launch.

