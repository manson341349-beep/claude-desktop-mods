# usage-pet

A usage band above the prompt in the **Code tab of Claude Desktop**: context, 5-hour limit, weekly limit and cache hit rate on four animated rings, with Clawd, a pixel pet who keeps you company while Claude works.

![usage-pet in light and dark mode](https://raw.githubusercontent.com/manson341349-beep/claude-desktop-mods/main/assets/usage-pet-preview.png)

> Unofficial fan project. Not affiliated with or endorsed by Anthropic. Clawd is Anthropic's mascot; the pixel version here is fan-made.

## What it does

- **Four meters, one glance**: context window, 5-hour limit, weekly limit (with reset times) and cache hit rate. Hover a ring for exact numbers.
- **Clawd reacts**: he types on a tiny laptop while Claude works, sweats when a limit is above 90%, and puts on sunglasses when the cache hit rate is 90% or more. Hover him for hearts, click him for a flip.
- **Growth**: Clawd earns XP for every reply, levels up (sprout, bow tie, cap, crown) and unlocks 8 achievements. Progress is kept across sessions.
- **Report card**: `/clawd-card` draws a card of the session (duration, turns, tool calls, files edited, tokens, cache hit, level) and saves it as a PNG you can paste anywhere.
- **Halloween** (Oct 25 to Nov 1): witch hat, pumpkin pail, ghost mode while Claude works, and trick-or-treat after each reply. Turn seasonal costumes off with `seasonal` = `off` in `/config`.
- **Collapses out of the way**: a 30px strip most of the time; expands for five seconds when the numbers change. `/clawd` or the ▲▼ button keeps it open.
- English and Chinese, light and dark appearance, macOS and Windows. The terminal shows the numbers only.

## Install

In a Code tab session in Claude Desktop:

```text
/plugin marketplace add manson341349-beep/claude-desktop-mods
/plugin install usage-pet@claude-desktop-mods
```

Then run `/reload-plugins` or start a new session.

## What it runs, stores and sends

**Network: none.** The plugin makes no network requests and has no telemetry.

**Reads**: Claude Code's own usage numbers for the current session (context size, rate limits, token counts) through the plugin API; the `LANG`, `LANGUAGE`, `LC_ALL`, `LC_MESSAGES`, `OS`, `TEMP` and `TMP` environment variables. While a session runs it counts tool calls and keeps the paths of files Claude edits, only in memory, to fill in the report card's "files edited" count. Paths are never written to disk or shown on the card.

**Stores** (in the plugin's local store on your machine): Clawd's XP, level, streak and achievements, and the last release-notes version you have seen.

**Runs**:

- Language detection when `language` is `auto`: `defaults read -g AppleLanguages` on macOS, `powershell.exe -NoProfile -Command (Get-UICulture).Name` on Windows.
- `/clawd-card` on macOS: `/bin/sh` with Quick Look (`qlmanage`) and `sips` to turn the card SVG into a PNG in a temporary folder, `osascript` to put it on the clipboard. It saves the PNG to `~/Pictures/Clawd Reports` and moves cards beyond the newest 20 (only files named `Clawd-report-*.png` in that folder) to the Trash.
- `/clawd-card` on Windows: writes the card SVG to `%TEMP%`, then runs the bundled `hooks/export-card.ps1` with `powershell.exe -ExecutionPolicy Bypass` (so the script runs on machines whose policy blocks unsigned scripts). The script opens the local SVG file in headless Edge, or Chrome when Edge is missing, with its own temporary profile, takes a 1200×675 screenshot, puts it on the clipboard, saves it to `Pictures\Clawd Reports`, sends cards beyond the newest 20 (only `Clawd-report-*.png`) to the Recycle Bin, and deletes its temporary files.

## Settings

In `/config`: `language` (`auto`, `zh`, `en`) and `seasonal` (`auto`, `off`).

## Source and license

[github.com/manson341349-beep/claude-desktop-mods](https://github.com/manson341349-beep/claude-desktop-mods) · MIT
