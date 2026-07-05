# Per-Bot Prefix Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each bot in multi-bot mode to have its own command prefix, configured via comma-separated values in `.env`.

**Architecture:** Parse a `MAIN_PREFIX` env var that supports comma-separated values (like `DISCORD_TOKEN` already does). Export a `mainPrefixes[]` array alongside `discordTokens[]`. Each `Rawon` instance gets its own prefix via a new `mainPrefix` instance property, initialized from the index-matched prefix (or falling back to the shared default). The `MessageCreateListener` reads the instance prefix instead of the module-level one.

**Tech Stack:** TypeScript, Sapphire Framework, discord.js, dotenv

---

## File Structure

| File | Change |
|------|--------|
| `.env` | Update `MAIN_PREFIX` comment + example to show comma-separated format |
| `.env.example` | Same comment update |
| `src/config/env.ts` | Add `mainPrefixes: string[]` export; keep `mainPrefix` as fallback |
| `src/config/index.ts` | Export `mainPrefixes` alongside existing exports |
| `src/structures/Rawon.ts` | Add `mainPrefix` instance property; accept optional prefix override in `build()` |
| `src/utils/structures/MultiBotLauncher.ts` | Pass per-bot prefix to `createBotInstance()` |
| `src/listeners/MessageCreateListener.ts` | Use `client.mainPrefix` instead of `this.container.config.mainPrefix` |

---

## Task 1: Update env parsing for multi-prefix support

**Files:**
- Modify: `src/config/env.ts:69`

- [ ] **Step 1: Add `mainPrefixes` array parsing in `env.ts`**

After the existing `mainPrefix` export (line 69), add:

```typescript
// Per-bot prefix support: comma-separated mirrors DISCORD_TOKEN
const rawPrefixes = process.env.MAIN_PREFIX ?? "";
const prefixArray = rawPrefixes.includes(",")
    ? rawPrefixes
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p.length > 0)
    : rawPrefixes.trim().length > 0
      ? [rawPrefixes.trim()]
      : [];
export const mainPrefixes: string[] = prefixArray;
```

Keep the existing `mainPrefix` export unchanged — it serves as the global default/fallback.

- [ ] **Step 2: Verify the export doesn't break existing imports**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/config/env.ts
git commit -m "feat: add mainPrefixes array for per-bot prefix support"
```

---

## Task 2: Export `mainPrefixes` from config index

**Files:**
- Modify: `src/config/index.ts:13`

- [ ] **Step 1: Add `mainPrefixes` to the import from `env.js`**

Change line 13 from:

```typescript
import { enablePrefix, enableSlashCommand, lang, mainPrefix } from "./env.js";
```

to:

```typescript
import { enablePrefix, enableSlashCommand, lang, mainPrefix, mainPrefixes } from "./env.js";
```

- [ ] **Step 2: Verify export is available**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/config/index.ts
git commit -m "feat: export mainPrefixes from config"
```

---

## Task 3: Add `mainPrefix` instance property to `Rawon`

**Files:**
- Modify: `src/structures/Rawon.ts:205-208`

- [ ] **Step 1: Add `mainPrefix` instance property to `Rawon` class**

After line 207 (`public readonly config = config;`), add:

```typescript
public mainPrefix: string = config.mainPrefix;
```

This defaults to the shared `mainPrefix` for single-bot mode and backward compatibility. In multi-bot mode, it will be overridden per-instance.

- [ ] **Step 2: Verify type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/structures/Rawon.ts
git commit -m "feat: add mainPrefix instance property to Rawon"
```

---

## Task 4: Update `MultiBotLauncher` to pass per-bot prefix

**Files:**
- Modify: `src/utils/structures/MultiBotLauncher.ts:3`
- Modify: `src/utils/structures/MultiBotLauncher.ts:93-128`

- [ ] **Step 1: Import `mainPrefixes` in `MultiBotLauncher`**

Change line 3 from:

```typescript
import { clientOptions, discordTokens, isMultiBot, isProd } from "../../config/index.js";
```

to:

```typescript
import { clientOptions, discordTokens, isMultiBot, isProd, mainPrefixes } from "../../config/index.js";
```

- [ ] **Step 2: Override `mainPrefix` on each bot instance in `createBotInstance`**

In `createBotInstance()` (line 93-128), after `await client.build(token);` (line 119) and before the `if (client.user)` block (line 120), add:

```typescript
// Per-bot prefix: use index-matched prefix if available, else fall back to global default
if (mainPrefixes.length > tokenIndex) {
    client.mainPrefix = mainPrefixes[tokenIndex];
} else if (mainPrefixes.length > 0) {
    // Fallback to last prefix if fewer prefixes than tokens
    client.mainPrefix = mainPrefixes[mainPrefixes.length - 1];
}
```

- [ ] **Step 3: Add a log line for the assigned prefix**

After setting the prefix, add:

```typescript
log.info(
    `[MultiBot] Bot #${tokenIndex} prefix set to: "${client.mainPrefix}"`,
);
```

- [ ] **Step 4: Verify type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/utils/structures/MultiBotLauncher.ts
git commit -m "feat: assign per-bot prefix in MultiBotLauncher"
```

---

## Task 5: Update `MessageCreateListener` to use instance prefix

**Files:**
- Modify: `src/listeners/MessageCreateListener.ts:106`

- [ ] **Step 1: Change prefix resolution to use client instance prefix**

Change line 106 from:

```typescript
prefixList.push(this.container.config.mainPrefix);
```

to:

```typescript
prefixList.push((client as Rawon).mainPrefix);
```

The `client` variable is already typed as `Rawon` in the listener (imported at line 14), so this is a safe access.

- [ ] **Step 2: Verify type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/listeners/MessageCreateListener.ts
git commit -m "feat: use instance prefix in MessageCreateListener"
```

---

## Task 6: Update `.env` and `.env.example` documentation

**Files:**
- Modify: `.env:19-21`
- Modify: `.env.example:19-21`

- [ ] **Step 1: Update `.env` prefix comment**

Change lines 19-21 from:

```
# Main command prefix
# Default: !
MAIN_PREFIX="?"
```

to:

```
# Main command prefix
# Supports comma-separated values for multi-bot mode (must match DISCORD_TOKEN count)
# Example: MAIN_PREFIX="!,#" assigns "!" to first bot, "#" to second bot
# Default: !
MAIN_PREFIX="?"
```

- [ ] **Step 2: Update `.env.example` prefix comment**

Change lines 19-21 from:

```
# Main command prefix
# Default: !
MAIN_PREFIX=""
```

to:

```
# Main command prefix
# Supports comma-separated values for multi-bot mode (must match DISCORD_TOKEN count)
# Example: MAIN_PREFIX="!,#" assigns "!" to first bot, "#" to second bot
# Default: !
MAIN_PREFIX=""
```

- [ ] **Step 3: Commit**

```bash
git add .env .env.example
git commit -m "docs: document per-bot prefix support in env files"
```

---

## Verification

After all tasks are complete:

1. **Type check:** `npx tsc --noEmit` — should pass with no errors
2. **Build:** `npm run build` — should compile successfully
3. **Single-bot mode:** Set `MAIN_PREFIX="!"` (no comma) — all bots should use `!`
4. **Multi-bot mode:** Set `DISCORD_TOKEN="token1,token2"` and `MAIN_PREFIX="!,#"` — first bot uses `!`, second uses `#`
5. **Fallback:** Set `DISCORD_TOKEN="token1,token2"` and `MAIN_PREFIX="!"` — both bots use `!` (last prefix reused)
6. **Per-guild prefix:** The `prefix set` command should still override the bot's default prefix per guild
