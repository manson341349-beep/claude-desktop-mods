# Desktop mod notes · 桌面端 mod 踩坑笔记

Things we hit while building `usage-pet` for the Code tab of Claude Desktop (Claude Code 2.1.286, macOS).
Each item: what you see → why → what to do.

做 `usage-pet` 时在 Claude 桌面 App（Claude Code 2.1.286，macOS）上实际踩到的坑。每条都是：现象 → 原因 → 做法。

---

## 1. `Client` never loads on desktop · 桌面端 `Client` 加载不出来

- **You see**: `Client frame torn down: did not load within 10s (a content security policy may have refused its runtime…)` in `~/Library/Logs/Claude/claude.ai-web.log`.
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
- **Do**: paint no background and declare dark on the SVG root:
  `<svg … style="color-scheme:dark;background:transparent">`
- 不要铺底色去「对颜色」（转换结果随显示器变），在 SVG 上声明 `color-scheme:dark`，背景就是透明的。

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
