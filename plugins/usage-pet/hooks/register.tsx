import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Bars, CacheStat, CacheTotals, Pet, Report, Snap } from '../types'
import { bandAlt, bandSvg, type CacheTimer, H, H_MINI, type PetView, tokensText } from './band'
import { CARD_H, CARD_W, type CardData, cardAlt, cardSvg } from './card'
import { CHANGELOG, unseenReleases } from './changelog'
import { type Lang, type LangChoice, langFromTags, parseAppleLanguages, T, weekday } from './i18n'
import { type Achievement, isHalloween, levelOf, NEW_PET, normalize, onTurn, threshold } from './pet'

const barsAtom = atom({ plugin: 'usage-pet', key: 'bars' } as const, { from: null, to: null } as Bars)

const cacheAtom = atom({ plugin: 'usage-pet', key: 'cache' } as const, { read: 0, write: 0, fresh: 0 } as CacheTotals)

// 展开 / 收起：数据刷新时自动展开 EXPAND_MS 后收起；pinned = 用户点了「展开」或 /clawd，一直展开
const expandedAtom = atom({ plugin: 'usage-pet', key: 'expanded' } as const, true)
const pinnedAtom = atom({ plugin: 'usage-pet', key: 'pinned' } as const, false)
// 界面语言：session.start 时定下来（/config 选了就用选的，auto 就跟随系统）
const langAtom = atom({ plugin: 'usage-pet', key: 'lang' } as const, 'en' as Lang)
const EXPAND_MS = 5000
// 养成：跨会话的那份在 $.store 的 PET_KEY；这里留一份给信息栏画
const petAtom = atom({ plugin: 'usage-pet', key: 'pet' } as const, NEW_PET as Pet)
const NEW_REPORT: Report = { startedAt: 0, turns: 0, toolCalls: 0, files: [], output: 0, earned: [] }
const reportAtom = atom({ plugin: 'usage-pet', key: 'report' } as const, NEW_REPORT)
// 万圣节讨糖：最近一次答完的时间（0 = 不讨糖）。等自动展开收起后再开始讨，讨 ASK_WINDOW_MS 内有效
const askAtom = atom({ plugin: 'usage-pet', key: 'ask' } as const, 0)
// 缓存倒计时：主对话最近一次答完的时间（0 = 这个会话还没答过）。
// 有效期：订阅（有 5 小时 / 每周额度读数）约 1 小时，API 密钥 5 分钟；每次请求重新计时。
// 从「答完」算会比真正的过期时间晚一点（有效期从最后一次请求开始算），所以界面上只到分钟
const warmAtom = atom({ plugin: 'usage-pet', key: 'warm' } as const, 0)
const TTL_SUBSCRIPTION_MS = 60 * 60000
const TTL_API_MS = 5 * 60000
const ASK_DELAY_MS = EXPAND_MS + 1000
const ASK_WINDOW_MS = 10 * 60000
const PET_KEY = 'pet'
const CARD_PANE = 'clawd-card'
// 改文件的工具：战报里「改动文件」按它们的路径去重计数
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const MAX_FILES = 500
// 只让最后一次展开的定时器生效，免得早先的定时器提前收起
let expandToken = 0
// 展开 / 收起按钮占的宽度（像素），SVG 让出这一截
const BUTTON_W = 44
// 信息栏最窄：Clawd + 四个圆环挨着放的宽度
const MIN_BAND_W = 270
// 按钮用图标：信息栏往上长，▲ = 往上撑开，▼ = 往下收回。
// 这一对是同一字体里的成对字形，Chrome 实测都是 19×20px、同样居中（⌃⌄ 不是一对，大小差很多）
const ICON_EXPAND = '▲'
const ICON_COLLAPSE = '▼'

const sameSnap = (a: Snap | null, b: Snap | null) => JSON.stringify(a) === JSON.stringify(b)

function toSnap(context: SessionContextUsage, rateLimits: SessionRateLimit[]): Snap {
  const pick = (kind: string) => {
    const w = rateLimits.find(r => r.kind === kind)
    return w ? { percent: w.percentUsed, resetsAt: w.resetsAt } : undefined
  }

  return {
    contextPercent: context.percent,
    contextTokens: context.tokens,
    contextWindow: context.window,
    session: pick('five_hour'),
    weekly: pick('seven_day'),
  }
}

const pct1 = (part: number, total: number) => Math.round((part / total) * 1000) / 10

function turnRate(u: ModelUsage): number | undefined {
  const total = u.cache_read_input_tokens + u.cache_creation_input_tokens + u.input_tokens

  return total > 0 ? pct1(u.cache_read_input_tokens, total) : undefined
}

function cacheStat(c: CacheTotals): CacheStat | undefined {
  const total = c.read + c.write + c.fresh

  return total > 0 ? { rate: pct1(c.read, total), read: c.read, write: c.write, fresh: c.fresh, turnRate: c.turnRate } : undefined
}

// 桌面端每列约 8 CSS 像素（mod-ferro 实测），用来把 SVG 的宽度对齐信息栏
const PX_PER_COLUMN = 8

// 桌面端任何状态变化都会重画整条、SVG 动画从头播（anthropics/claude-code#99211），
// 所以滚动播完后把 from 收成 to，之后的重画就是静止的最终值，不会重播滚动。
// 更新提示：$.store 跨会话保存「上次给用户看过的版本」，有没看过的就弹 toast，看过就不再弹
const SEEN_KEY = 'lastSeenVersion'
// 提示（更新内容、升级、成就）停到上限 60 秒：toast 只能设停留时长（App 限定 1–60000 ms，超出整条丢弃），
// 位置由 App 定（对话区右上角）；鼠标放上去会停住，点一下就关
const STICKY_MS = 60000

// 插件跑在独立环境里，没有 process.platform；Windows 一定有 OS=Windows_NT
async function isWindows($: EngineInterface): Promise<boolean> {
  return (await $.env.get('OS')) === 'Windows_NT'
}

// Windows 的 PowerShell 5.1（系统自带，不用另装）。-Sta：剪贴板要求单线程套间
const POWERSHELL = ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Sta']

// 跟随系统语言：环境变量 → 系统语言（macOS 读 AppleLanguages，Windows 读显示语言）→ JS 运行时默认语言 → 英文
// （桌面 App 启动的会话里 LANG 往往是空的，所以要去问系统）
async function detectLang($: EngineInterface): Promise<Lang> {
  // 引擎要求变量名写成字面量（validate 才能列出插件读了哪些环境变量）
  const values = [await $.env.get('LC_ALL'), await $.env.get('LC_MESSAGES'), await $.env.get('LANG'), await $.env.get('LANGUAGE')]
  for (const value of values) {
    const lang = value ? langFromTags(value.split(':')) : undefined
    if (lang) {
      return lang
    }
  }
  try {
    if (await isWindows($)) {
      // Windows 显示语言，如 zh-CN、en-US
      const { exitCode, stdout } = await $.process.run([...POWERSHELL, '-Command', '(Get-UICulture).Name'], { timeoutMs: 5000 })
      const lang = exitCode === 0 ? langFromTags([stdout]) : undefined
      if (lang) {
        return lang
      }
    } else {
      const { exitCode, stdout } = await $.process.run(['defaults', 'read', '-g', 'AppleLanguages'], { timeoutMs: 3000 })
      const lang = exitCode === 0 ? langFromTags(parseAppleLanguages(stdout)) : undefined
      if (lang) {
        return lang
      }
    }
  } catch {
    // 问不到系统（不是 macOS / Windows，或命令起不来）：往下走
  }
  try {
    return langFromTags([Intl.DateTimeFormat().resolvedOptions().locale]) ?? 'en'
  } catch {
    return 'en'
  }
}

// /config 指定了语言就直接用（切换立刻生效）；auto 才用 session.start 探测到的
async function langOf($: EngineInterface, choice: LangChoice): Promise<Lang> {
  return choice === 'zh' || choice === 'en' ? choice : read($, langAtom)
}

// 只在有界面连着的时候弹，弹了才记「看过」：App 重启时会话先启动、窗口后连上，
// 那时弹的提示没人看得到，却会被记成看过（1.4.0 就这样被吞了）。没连上就等 session.attach 再弹
async function showWhatsNew($: EngineInterface, lang: Lang) {
  const latest = CHANGELOG[0].version
  const lastSeen = await $.store.get(SEEN_KEY)
  if (lastSeen === latest || (await $.session.surfaces()).length === 0) {
    return
  }
  // 旧的先弹、新的后弹，最新的那条落在最上面；只在最新这条末尾请大家点个 star（装了的人多，点 star 的少）
  const releases = unseenReleases(lastSeen).reverse()
  releases.forEach((release, i) => {
    const notes = release.notes[lang].join(' · ')
    $.ui.toast(T[lang].whatsNew(release.version) + notes + (i === releases.length - 1 ? `\n${T[lang].starNudge}` : ''), { timeoutMs: STICKY_MS })
  })
  await $.store.set(SEEN_KEY, latest)
}

async function expandForAWhile($: EngineInterface) {
  const token = ++expandToken
  await update($, expandedAtom, () => true)
  $.clock.after(EXPAND_MS, () => {
    if (token === expandToken) {
      void update($, expandedAtom, () => false)
    }
  })
}

async function record($: EngineInterface, snap: Snap) {
  const full: Snap = { ...snap, cache: cacheStat(await read($, cacheAtom)) }
  const isChanged = !sameSnap((await read($, barsAtom)).to, full)
  await update($, barsAtom, bars => (sameSnap(bars.to, full) ? bars : { from: bars.to, to: full }))
  if (isChanged) {
    await expandForAWhile($)
  }
  $.clock.after(1300, () => void update($, barsAtom, bars => (sameSnap(bars.from, bars.to) ? bars : { from: bars.to, to: bars.to })))
}

// 缓存还热多久：没答过就不显示
function cacheTimer(warmAt: number, bars: Bars, now: number): CacheTimer | undefined {
  if (warmAt <= 0) {
    return undefined
  }
  const ttlMs = bars.to?.session || bars.to?.weekly ? TTL_SUBSCRIPTION_MS : TTL_API_MS

  return { remainMs: Math.min(ttlMs, warmAt + ttlMs - now), ttlMs }
}

// 终端读数：进度条颜色、重置时间（24 小时内写剩余多久，否则写周几几点）
function termBarColor(percent: number): string {
  return percent >= 95 ? '#E5484D' : percent >= 80 ? '#E8913A' : '#3B7BF0'
}

function termReset(resetsAt: string | undefined, lang: Lang): string {
  if (!resetsAt) {
    return ''
  }
  const at = Date.parse(resetsAt)
  const minutes = Math.max(0, Math.round((at - Date.now()) / 60000))
  if (minutes < 24 * 60) {
    return T[lang].left(minutes < 60 ? minutes : Math.floor(minutes / 60), minutes < 60 ? 'm' : 'hm', minutes % 60)
  }
  const d = new Date(at)

  return T[lang].resetDay(weekday(lang, d.getDay()), `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
}

// 万圣节的日期和讨糖计时读插件时钟：测试用 mock.clock 把日期拨到万圣节前后。
// 测试里没装时钟时退回系统时间（正式运行时时钟一直在）
async function clockNow($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

// now 来自 $.clock.now()：测试里能把日期拨到万圣节前后
function petView(pet: Pet, lang: Lang, halloween = false, askSince = 0, now = 0): PetView {
  const level = levelOf(pet.xp)
  const since = now - askSince - ASK_DELAY_MS
  const askAgo = halloween && askSince > 0 && since < ASK_WINDOW_MS ? since / 1000 : undefined
  const title = T[lang].petTitle(level, pet.xp, threshold(level + 1), pet.streak)

  return { level, title: askAgo === undefined ? title : `${T[lang].askCandy} · ${title}`, halloween, askAgo }
}

// 每答完一轮：从 store 读最新的（别的会话可能也在涨经验），算完写回，升级 / 成就弹提示
async function growPet($: EngineInterface, rate: number | undefined, lang: Lang) {
  const bars = await read($, barsAtom)
  const maxLimit = Math.max(bars.to?.session?.percent ?? 0, bars.to?.weekly?.percent ?? 0)
  const { pet, events } = onTurn(normalize(await $.store.get(PET_KEY)), { now: new Date(), turnRate: rate, maxLimit })
  await $.store.set(PET_KEY, pet)
  await update($, petAtom, () => pet)
  const t = T[lang]
  for (const ev of events) {
    if (ev.kind === 'level') {
      $.ui.toast(t.levelUp(ev.level, ev.gear ? t.gear[ev.gear] : undefined), { timeoutMs: STICKY_MS })
    } else {
      const [name, how] = t.achievement[ev.id]
      $.ui.toast(t.unlocked(name, how), { timeoutMs: STICKY_MS })
      await update($, reportAtom, r => ({ ...r, earned: [...r.earned, ev.id] }))
    }
  }
}

async function cardData($: EngineInterface, seasonal: boolean): Promise<CardData> {
  const r = await read($, reportAtom)
  const c = await read($, cacheAtom)

  return {
    startedAt: r.startedAt || Date.now(),
    now: Date.now(),
    turns: r.turns,
    toolCalls: r.toolCalls,
    files: r.files.length,
    tokens: c.read + c.write + c.fresh + r.output,
    cacheRate: cacheStat(c)?.rate,
    pet: await read($, petAtom),
    earned: r.earned as Achievement[],
    halloween: seasonal && isHalloween(new Date(await clockNow($))),
  }
}

// 导出 PNG（macOS）：qlmanage 把正方形 SVG 渲染成 1200×1200，sips 从正中裁出 1200×675，
// 存到「图片/Clawd Reports」，再用 osascript 放进剪贴板（桌面端的 $.ui.copy 还不支持远程界面，而且只能放文字）。
// 不放桌面：每生成一张就多一个文件，桌面很快乱掉（用户自己会一张张删）。
// 文件夹里只留最近 KEEP_CARDS 张，更早的移进废纸篓（可找回，不直接删），只动本插件命名的文件
const KEEP_CARDS = 20
const EXPORT_SH =
  'set -e; d=$(mktemp -d); trap \'rm -r "$d"\' EXIT; cat > "$d/card.svg"; ' +
  'qlmanage -t -s 1200 -o "$d" "$d/card.svg" >/dev/null 2>&1; ' +
  'dir="$HOME/Pictures/Clawd Reports"; mkdir -p "$dir"; out="$dir/$1"; ' +
  'sips -c 675 1200 "$d/card.svg.png" --out "$out" >/dev/null; ' +
  'osascript -e "set the clipboard to (read (POSIX file \\"$out\\") as «class PNGf»)" >/dev/null; ' +
  `ls -t "$dir"/Clawd-report-*.png | tail -n +${KEEP_CARDS + 1} | while IFS= read -r old; do mv "$old" "$HOME/.Trash/" || true; done; ` +
  'printf %s "$out"'

// 导出 PNG（Windows）：hooks/export-card.ps1 用 Edge（没有就用 Chrome）无头模式把 SVG 截成 1200×675，
// 存到「图片\Clawd Reports」、放进剪贴板，只留最近 KEEP_CARDS 张，更早的移进回收站。
// SVG 先写到临时文件再交给脚本：经 stdin 传给 PowerShell 会按系统代码页解码，中文会乱
async function runWindowsExport($: EngineInterface, svg: string, name: string) {
  const temp = (await $.env.get('TEMP')) ?? (await $.env.get('TMP'))
  if (!temp) {
    throw new Error('TEMP is not set')
  }
  const svgPath = `${temp}\\${name.replace(/\.png$/, '.svg')}`
  await $.fs.write(svgPath, svg)

  return $.process.run(
    [...POWERSHELL, '-File', `${$.plugin.root}\\hooks\\export-card.ps1`, '-Svg', svgPath, '-Name', name, '-Keep', String(KEEP_CARDS)],
    { timeoutMs: 45000 },
  )
}

async function exportCard($: EngineInterface, data: CardData, lang: Lang): Promise<{ path: string } | { error: string }> {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const name = `Clawd-report-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`
  try {
    const { exitCode, stdout, stderr } = (await isWindows($))
      ? await runWindowsExport($, cardSvg(data, lang, 'wide'), name)
      : await $.process.run(['/bin/sh', '-c', EXPORT_SH, 'sh', name], { stdin: cardSvg(data, lang, 'square'), timeoutMs: 30000 })
    if (exitCode !== 0 || !stdout.endsWith(name)) {
      return { error: (stderr || `exit ${exitCode}`).trim().slice(0, 200) }
    }

    return { path: stdout }
  } catch (err) {
    return { error: String(err).slice(0, 200) }
  }
}

export const register: Register = (on, options) => {
  const choice = (options?.language ?? 'auto') as LangChoice
  // 节日装扮：/config 里 seasonal 填 off 就不换（不分大小写、去掉首尾空格；以前是下拉，现在是文本框）
  const seasonal = String(options?.seasonal ?? 'auto').trim().toLowerCase() !== 'off'

  on('session.start', async ($, e, next) => {
    // 先定语言（更新提示要用）；读不出来就英文
    let lang: Lang = 'en'
    try {
      lang = choice === 'zh' || choice === 'en' ? choice : await detectLang($)
    } catch (err) {
      $.ui.log(`usage-pet: language detection failed: ${String(err)}`, { to: 'debug' })
    }
    await update($, langAtom, () => lang)
    // 养成数据从 store 读进来；战报从这个会话第一次加载开始计时（重载插件不重置）
    try {
      const pet = normalize(await $.store.get(PET_KEY))
      await update($, petAtom, () => pet)
    } catch (err) {
      $.ui.log(`usage-pet: 读养成数据失败：${String(err)}`, { to: 'debug' })
    }
    await update($, reportAtom, r => (r.startedAt ? r : { ...r, startedAt: Date.now() }))
    // 更新提示放最前：后面注册命令、读用量出错（整个 hook 会被跳过）也不会吞掉它；
    // 它自己出错只记调试日志，不拦后面的步骤
    try {
      await showWhatsNew($, lang)
    } catch (err) {
      $.ui.log(`usage-pet: 更新提示失败：${String(err)}`, { to: 'debug' })
    }
    await $.command.register({
      name: 'clawd',
      description: 'Clawd band: toggle always-expanded / auto-collapse · 在「一直展开」和「自动收起」之间切换',
      immediate: true,
    })
    await $.command.register({ name: 'clawd-card', description: `${T.en.cardCommand} · ${T.zh.cardCommand}` })
    // summary：本地估算，不发请求；只用它的 apiUsage（上一次回复的用量）给还没读数的缓存垫底
    const u = await $.session.usage({ breakdown: 'summary' })
    const last = u.context.breakdown?.apiUsage
    const totals = await read($, cacheAtom)
    if (last && totals.read + totals.write + totals.fresh === 0) {
      await update($, cacheAtom, () => ({
        read: last.cache_read_input_tokens,
        write: last.cache_creation_input_tokens,
        fresh: last.input_tokens,
        turnRate: turnRate(last),
      }))
    }
    await record($, toSnap(u.context, u.rateLimits))

    return next(e)
  })

  // 窗口连上（App 重启后窗口晚于会话启动）：补弹更新提示
  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    try {
      await showWhatsNew($, await langOf($, choice))
    } catch (err) {
      $.ui.log(`usage-pet: 更新提示失败：${String(err)}`, { to: 'debug' })
    }

    return attached
  })

  // 每轮结束累计缓存 token（只算主循环，子代理有自己的缓存）
  on('turn.complete', async ($, e, next) => {
    const u = e.usage
    if (e.agentId === undefined && u) {
      await update($, cacheAtom, c => ({
        read: c.read + u.cache_read_input_tokens,
        write: c.write + u.cache_creation_input_tokens,
        fresh: c.fresh + u.input_tokens,
        turnRate: turnRate(u) ?? c.turnRate,
      }))
      const bars = await read($, barsAtom)
      if (bars.to) {
        await record($, bars.to)
      }
    }
    if (e.agentId === undefined) {
      const doneAt = await clockNow($)
      await update($, warmAtom, () => doneAt)
      await update($, reportAtom, r => ({ ...r, turns: r.turns + 1, output: r.output + (u?.output_tokens ?? 0) }))
      const now = await clockNow($)
      if (seasonal && isHalloween(new Date(now)) && !e.isAborted) {
        await update($, askAtom, () => now)
      }
      try {
        await growPet($, u ? turnRate(u) : undefined, await langOf($, choice))
      } catch (err) {
        $.ui.log(`usage-pet: 养成更新失败：${String(err)}`, { to: 'debug' })
      }
    }

    return next(e)
  })

  // 战报：工具调用次数（含子代理），改过的文件按路径去重；被拦下的不算
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (!('deny' in ran && ran.deny !== undefined)) {
      const input = e as unknown as { file_path?: unknown; notebook_path?: unknown }
      const path = EDIT_TOOLS.has(e.tool) ? (input.file_path ?? input.notebook_path) : undefined
      await update($, reportAtom, r => ({
        ...r,
        toolCalls: r.toolCalls + 1,
        files: typeof path === 'string' && !r.files.includes(path) && r.files.length < MAX_FILES ? [...r.files, path] : r.files,
      }))
    }

    return ran
  })

  on('command.run', { command: 'clawd-card' }, async $ => {
    const lang = await langOf($, choice)
    await $.ui.open({ id: CARD_PANE, title: T[lang].card.title })
    const out = await exportCard($, await cardData($, seasonal), lang)

    return { text: 'path' in out ? T[lang].cardSaved(out.path) : T[lang].cardOnlyShown(out.error) }
  })

  on('ui.render', { component: 'Pane', requestId: CARD_PANE }, async ($, e) => {
    const lang = await langOf($, choice)
    const data = await cardData($, seasonal)
    if (e.surface === 'terminal') {
      const { Text } = $.ui.resolve(e)

      return <Text>{cardAlt(data, lang)}</Text>
    }
    const { Svg } = $.ui.resolve(e)
    const width = Math.min(CARD_W, Math.max(320, (e.viewport?.columns ?? 80) * PX_PER_COLUMN - 24))

    return <Svg source={cardSvg(data, lang)} alt={cardAlt(data, lang)} width={width} height={Math.round((width * CARD_H) / CARD_W)} />
  })

  on('command.run', { command: 'clawd' }, async $ => {
    const pinned = !(await read($, pinnedAtom))
    await update($, pinnedAtom, () => pinned)
    await update($, expandedAtom, () => pinned)

    const t = T[await langOf($, choice)]

    return { text: pinned ? t.pinned : t.autoCollapse }
  })

  on('session.measure', async ($, e, next) => {
    await record($, toSnap(e.context, e.rateLimits))

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const bars = await read($, barsAtom)
    const lang = await langOf($, choice)
    const now = await clockNow($)
    const pet = petView(await read($, petAtom), lang, seasonal && isHalloween(new Date(now)), await read($, askAtom), now)

    // 桌面端的 Client 在 2.1.286 上一律 10 秒超时（缺 CSP nonce，同见 #99211），所以桌面只用 Svg
    if (e.surface === 'desktop') {
      const { Box, Button, Svg } = $.ui.resolve(e)
      // 不设大下限：以前最少 560px，窗口窄时信息栏比可用宽度还宽，按钮就被挤到下一行。
      // 窄了由 bandSvg 自己逐级收（去副标题 → 只剩圆环），按钮始终在同一行右侧
      const width = Math.max(MIN_BAND_W, e.props.bodyColumns * PX_PER_COLUMN - 8 - BUTTON_W)
      const pinned = await read($, pinnedAtom)
      const isMini = !pinned && !(await read($, expandedAtom))
      // 收起时按「展开」= 一直展开；展开时按「收起」= 立刻收起并回到自动模式
      // 按的那一刻再读状态，不用画的时候记下的 isMini（中间可能已经重画过）
      const toggle = async () => {
        expandToken++
        const nowMini = !(await read($, pinnedAtom)) && !(await read($, expandedAtom))
        await update($, pinnedAtom, () => nowMini)
        await update($, expandedAtom, () => nowMini)
      }

      return (
        <Box flexDirection="row" alignItems="center" flexWrap="nowrap">
          <Svg
            source={bandSvg(bars, e.props.isWorking, width, isMini, lang, pet, cacheTimer(await read($, warmAtom), bars, now))}
            alt={bandAlt(bars.to, e.props.isWorking, lang)}
            width={width}
            height={isMini ? H_MINI : H}
            isInteractive
          />
          <Button key="toggle" label={isMini ? ICON_EXPAND : ICON_COLLAPSE} plain onPress={() => void toggle()} />
        </Box>
      )
    }

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      const snap = bars.to
      const t = T[lang]
      // 终端只画三个读数：标签、右侧注释和百分比，下面一条进度条。
      // 以前用 Client 加载 stats.tsx 做数字滚动，但 Anthropic 插件目录的扫描器认不出它的路径、拦下提交，所以改成直接画
      const meter = (key: string, label: string, percent: number | undefined, note: string) => {
        const p = Math.min(100, Math.max(0, percent ?? 0))

        return (
          <Box key={key} flexDirection="column" flexGrow={1} flexShrink={1} minWidth={18}>
            <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
              <Text wrap="truncate">{label}</Text>
              <Box flexDirection="row" columnGap={1}>
                <Text dimColor wrap="truncate">
                  {note}
                </Text>
                <Text>{percent === undefined ? '—' : `${Math.round(percent)}%`}</Text>
              </Box>
            </Box>
            <Box width="100%" height={1} backgroundColor="#80808033">
              <Box width={`${Math.round(p)}%`} height={1} backgroundColor={termBarColor(p)} />
            </Box>
          </Box>
        )
      }
      const ctxNote = snap?.contextTokens !== undefined ? `${tokensText(snap.contextTokens)} / ${tokensText(snap.contextWindow)}` : ''

      return (
        <Box paddingX={1} flexDirection="row" columnGap={3}>
          {meter('ctx', t.context, snap?.contextPercent, ctxNote)}
          {meter('session', t.session, snap?.session?.percent, termReset(snap?.session?.resetsAt, lang))}
          {meter('weekly', t.weekly, snap?.weekly?.percent, termReset(snap?.weekly?.resetsAt, lang))}
        </Box>
      )
    }

    return next(e)
  })
}
