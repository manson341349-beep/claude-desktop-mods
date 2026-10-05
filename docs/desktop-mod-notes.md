# Desktop mod notes · 桌面端 mod 踩坑笔记

Things we hit while building `usage-pet` for the Code tab of Claude Desktop (Claude Code 2.1.286, macOS; Windows in §14).
Each item: what you see → why → what to do.

做 `usage-pet` 时在 Claude 桌面 App（Claude Code 2.1.286，macOS）上实际踩到的坑。每条都是：现象 → 原因 → 做法。

---

## 1. `Client` never loads on desktop · 桌面端 `Client` 加载不出来

- **You see**: `Client frame torn down: did not load within 10s (a content security policy may have refused its runtime…)` in `~/Library/Logs/Claude/claude.ai-web.log` (Windows: `%APPDATA%\Claude\logs\`).
- **Why**: on 2.1.286 every desktop `Client` frame times out — a missing CSP nonce ([anthropics/claude-code#99211](https://github.com/anthropics/claude-code/issues/99211)).
- **Do**: draw on desktop with `Svg` (plus CSS/SMIL animation inside it). Keep `Client` for the terminal.
- 桌面端改用 `Svg`，动画写在 SVG 里；`Client` 只给终端用。

## 2. `Svg` shows up as a small white box · `Svg` 变成一个白色小框

- **Why**: without `width`/`height` the frame stays 300 px wide.
- **Do**: pass both. The band is about 8 CSS px per column: `width = e.props.bodyColumns * 8 - 8` (credit: [mod-ferro](https://github.com/Vatroslav/mod-ferro)).
- 一定要显式给宽高；每列约 8 个 CSS 像素。

## 3. Background never matches · 背景总有色差

- **You see**: a visible rectangle behind the SVG; a transparent SVG shows white.
- **Why**: the frame gets an opaque (white) backdrop when its color scheme differs from the app's. And the app color-converts the frame: `#1B1B1B` rendered as `#151515`, `#D97757` as `#CE6145` — the shift depends on the display, so painting a "matching" fill only works on one screen.
- **Do**: paint no background and declare both schemes on the SVG root and `:root`:
  `<svg … style="color-scheme:light dark;background:transparent">`
  The frame then follows the app's appearance (light, dark or match system), so the two always agree and the backdrop stays transparent. Put the light palette in `@media (prefers-color-scheme:light){…}`: inside the frame it reflects the app's appearance, not the OS. No API tells a hook the theme; this is the way. Verified in the app on 2.1.286, both appearances.
- 不要铺底色去「对颜色」（转换结果随显示器变）。在 SVG 上声明 `color-scheme:light dark`：小窗口跟着 App 外观走，两边一致就不会垫底；浅色配色写在 `prefers-color-scheme:light` 里（它反映的是 App 的外观，不是系统的）。插件接口拿不到主题，只能这样。2.1.286 上浅色、深色都实测过。

## 4. Animations restart on every redraw · 每次重画动画都从头播

- **Why**: desktop rebuilds every mod site on any state change (#99211).
- **Do**: put one-shot animations (count-ups, sweeps) in the SVG only when the value actually changed, and a second later write the state back to "settled" so later redraws are static. Loops (breathing, blinking) will restart — keep them subtle.
- 一次性动画只在数值变化时写进去，播完把状态收成静止。

## 5. `$.state` values come back as new objects · `$.state` 取出来是新对象

- **Why**: state is serialized; `from !== to` is always true after a round trip.
- **Do**: compare by content (`JSON.stringify`, or field by field). We shipped this bug once: Clawd hopped on every redraw.
- 用内容比较，别用引用比较。

## 6. The band can't grow on hover · 悬停不能让信息栏变高

- **Why**: only the plugin can change the `Svg` height (a redraw), and it can't see the pointer inside the frame. `Box` `hover` only reveals a `display: none` box, and the reveal is clipped to the band.
- **Do**: expand from the plugin side — on a data change, with a `Button`, or a `/command`.
- 展开 / 收起只能由插件触发：数据变化、按钮或命令。

## 7. Button handlers: read state when pressed · 按钮回调里现读状态

- A value captured while drawing can be stale by the time the user clicks. Read `$.state` inside `onPress`.
- With #99211 a `Button` can miss a click right after a redraw — ship a `/command` that does the same thing.
- 回调里现读状态；另备一个斜杠命令作后备。

## 8. Button glyphs must come from one font · 按钮图标要选同一字体的一对

- `⌃` / `⌄` render at 22×12 vs 14×11 px (different Unicode blocks, different fallback fonts).
- Matched pairs we measured in Chrome: `▲ ▼` (19×20 both), `↑ ↓` (18×23 both).
- 测过才知道：`▲ ▼`、`↑ ↓` 两两等大。

## 9. You can't measure text in an `Svg` · SVG 里量不到文字宽度

- No script runs in the frame, so layout has to estimate. Calibrated against Chrome's `getComputedTextLength` at 10.5–12.5 px (system font + PingFang SC): CJK = 1.0 em, digits 0.6, `%` 1.0, `M`/`W` 0.85, other capitals 0.66, space 0.28, `/ . :` 0.35. Error ≤ 1.5 px.
- 按上面的系数估算，误差在 1.5px 内。

## 10. Small API gotchas · 小坑

- A `Box` `width` in a `Client` tree accepts integer percentages only (`"37%"`, not `"37.4%"`) — otherwise the whole `Client` unmounts.
- A helper that takes `$` must be a top-level function in the hooks module, or the module won't load.
- Use the frame clock (`surface.every` ticks), not `Date.now()`, for `Client` animation time — tests advance the frame clock.

## 11. Loading and updates · 加载与更新

- `CLAUDE_CODE_PLUGIN_DIRS` (in `~/.claude/settings.json` `env`) is read when a session starts; run `/reload-plugins` to pick it up in an open session.
- Third-party marketplaces don't auto-update by default; users enable it in `/plugin` → **Marketplaces**.
- A `"version"` in `plugin.json` pins users to that version until you change the string. Leave it out to version by commit.
- 第三方市场默认不自动更新；`plugin.json` 写死版本号会挡住更新。

## 12. What's-new popups · 更新内容弹窗

- Marketplace auto-update only prints `Plugin updated: <name>`. To show *what* changed, keep a changelog in the plugin, store the last version shown with `$.store` (shared by every session on the machine), and `$.ui.toast` the unseen entries on `session.start`.
- One module can't register the same event twice — put the popup first in the existing `session.start` hook, in its own `try`, so a later failure (the whole hook is skipped) can't swallow it.
- 插件只能对同一事件注册一次：把弹窗放在 `session.start` 最前面并单独 `try`。

## 13. Test stand-ins must answer `{ value }` · 测试替身要返回 `{ value }`

- In `claude plugin test`, a test's `on('command.register' | 'session.usage' | 'ui.toast', …)` stand-in must return `{ value: … }` or `{ deny: … }`. A bare object makes the engine skip the stand-in, the plugin's call then fails with `no implementation for …`, and the plugin's hook is skipped — tests can pass or fail for the wrong reason.
- 测试里冒充 API 调用的 hook 要返回 `{ value }`，否则会被跳过，测试可能「为错误的原因」通过。

## 14. Windows · Windows 上的差异

- **No `process.platform`**: the hooks module has no Node. `$.env.get('OS') === 'Windows_NT'` tells Windows apart (every Windows process has it).
- **Language**: `LANG` is usually unset in a session the desktop app starts. Ask `powershell.exe -NoProfile -Command (Get-UICulture).Name` (the display language, e.g. `zh-CN`) where macOS asks `defaults read -g AppleLanguages`.
- **SVG → PNG**: Windows has no `qlmanage`. Edge ships with Windows 10/11 and screenshots an SVG headless: `msedge --headless --screenshot=out.png --window-size=1200,675 file:///…/card.svg`. Give it its own `--user-data-dir`, or with the user's Edge open the command is handed to that window and returns with no screenshot. Paint the card edge to edge (no rounded corners) so no backdrop shows in the corners.
- **PowerShell scripts**: ship them ASCII only (5.1 reads a `.ps1` without a BOM in the system code page), and hand text over in a file, not stdin (stdin is decoded in the code page too). The clipboard needs `-Sta`. Set `[Console]::OutputEncoding` to UTF-8 before writing a path to stdout, so non-ASCII folder names come back intact.
- **Fonts**: add `"Segoe UI","Microsoft YaHei UI","Microsoft YaHei"` after the Apple fonts. CJK is still 1 em and Segoe UI digits are a bit narrower than SF, so the width estimates in §9 stay on the safe side.
- 插件里没有 `process.platform`，用 `OS=Windows_NT` 判断；语言问 `Get-UICulture`；SVG 转 PNG 用系统自带 Edge 无头截图（要单独的 `--user-data-dir`）；`.ps1` 只写 ASCII，文字走文件不走 stdin；字体补上 Segoe UI / 微软雅黑。
