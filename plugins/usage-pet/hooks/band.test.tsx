import { expect, mock, test } from 'claude-code/testing'

// 原有用例都按中文界面断言：显式指定 /config 的 language = zh
const ZH = { options: { language: 'zh' } }

const BAND = (isWorking: boolean) => ({
  plugin: 'usage-pet',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking, maxRows: 12, bodyColumns: 140, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  viewport: { columns: 140, rows: 40 },
})

const measure = (ctx: number, session: number, weekly: number) => ({
  context: { window: 200000, tokens: ctx * 2000, percent: ctx },
  rateLimits: [
    { kind: 'five_hour', percentUsed: session, resetsAt: new Date(Date.now() + 50 * 60000).toISOString() },
    { kind: 'seven_day', percentUsed: weekly, resetsAt: new Date(Date.now() + 3 * 86400000).toISOString() },
  ],
  changed: ['context', 'rateLimits'] as ('context' | 'rateLimits')[],
})

const svgOf = async (ui: { findAll: (q: { type: 'Svg' }) => Promise<{ props?: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Svg' }))[0]

test('终端：Client 里数字从 0 缓动到真实值', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(42, 8, 63))

  const ui = await $.ui.mount({ ...BAND(false), surface: 'terminal' })
  await ui.resize({ columns: 120, rows: 2, in: 'stats' })
  const early = await ui.findAll({ type: 'Text', text: /%$/, in: 'stats' })
  expect(early.map(t => t.text)).not.toEqual(['42%', '8%', '63%'])
  await ui.advance(1200)
  const settled = await ui.findAll({ type: 'Text', text: /%$/, in: 'stats' })
  expect(settled.map(t => t.text)).toEqual(['42%', '8%', '63%'])
  expect(await ui.find({ type: 'Text', text: '84k / 200k', in: 'stats' })).toBeDefined()
})

test('桌面：一张显式宽高、自带底色的 SVG；变化时有扫环、滚数字、+N%、Clawd 跳，播完收成静止', ZH, async ($, on) => {
  const clock = mock.clock(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(42, 8, 63))

  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(JSON.stringify(await ui.drawn())).not.toContain('"Client"')
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(1)
  const first = await svgOf(ui)
  expect(first.props?.width).toBe(1068)
  expect(first.props?.height).toBe(64)
  expect(first.props?.isInteractive).toBe(true)
  // 首次出现：圆环从空扫入、依次入场
  expect(String(first.props?.source)).toContain('@keyframes arcc{from{stroke-dashoffset:94.25}')
  expect(String(first.props?.source)).toContain('class="g enter"')

  await clock.advance(1400)
  await ui.redraw()
  const settled = await svgOf(ui)
  expect(settled.props?.alt).toBe('上下文 42%，5 小时额度 8%，每周额度 63%，缓存命中 —；Claude 在休息')
  // 背景透明：不铺底色；配色方案声明成 light dark，小窗口跟着 App 外观走，两边一致就不会垫底
  expect(String(settled.props?.source)).not.toContain('class="bg"')
  expect(String(settled.props?.source)).toContain(':root{color-scheme:light dark;background:transparent}')
  expect(String(settled.props?.source)).toContain('style="color-scheme:light dark;background:transparent"')
  // 浅色外观：文字和轨道有浅色版；分隔线走 class，不能把深色写死在属性里
  expect(String(settled.props?.source)).toMatch(/@media \(prefers-color-scheme:light\)\{\.num\{fill:#1F1E1D\}.*\.track\{stroke:#E8E5DC\}.*\.sep\{stroke:#E5E2D9\}/)
  expect(String(settled.props?.source)).toContain('class="sep"')
  expect(String(settled.props?.source)).not.toContain('stroke="#2A2927"')
  expect(String(settled.props?.source)).not.toContain('@keyframes arc')
  expect(String(settled.props?.source)).toContain('class="hop idle"')

  await $.session.measure(measure(57, 8, 63))
  await ui.redraw()
  const moving = String((await svgOf(ui)).props?.source)
  // 十位 4→5、个位 2→7 滚动；上下文圆环从 42% 扫到 57%；+15% 提示；Clawd 跳一下
  expect(moving).toContain('@keyframes odc0{from{transform:translateY(-56px)}to{transform:translateY(-70px)}}')
  expect(moving).toContain('@keyframes odc1{from{transform:translateY(-28px)}to{transform:translateY(-98px)}}')
  expect(moving).toContain('@keyframes arcc{')
  expect(moving).not.toContain('@keyframes arcs{')
  expect(moving).toContain('>+15%</text>')
  expect(moving).toContain('class="hop once"')

  await clock.advance(1400)
  await ui.redraw()
  const after = String((await svgOf(ui)).props?.source)
  expect(after).not.toContain('@keyframes arc')
  expect(after).not.toContain('@keyframes od')
  expect(after).toContain('class="hop idle"')
  expect(after).not.toContain('+15%')
  expect((await svgOf(ui)).props?.alt).toContain('上下文 57%')
})

test('Clawd：干活时搬出笔记本，额度 ≥90% 冒汗', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  const idle = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  const busy = await $.ui.mount({ ...BAND(true), surface: 'desktop' })
  expect(String((await svgOf(idle)).props?.alt)).toContain('Claude 在休息')
  expect(String((await svgOf(idle)).props?.source)).not.toContain('class="laptop"')
  expect(String((await svgOf(busy)).props?.alt)).toContain('Claude 正在干活')
  expect(String((await svgOf(busy)).props?.source)).toContain('class="laptop"')

  await $.session.measure(measure(30, 92, 50))
  await idle.redraw()
  expect(String((await svgOf(idle)).props?.source)).toContain('class="sweat"')
  expect(String((await svgOf(idle)).props?.source)).toContain('class="clawd stressed"')
})

const turn = (read: number, write: number, fresh: number, agentId?: string) => ({
  answer: 'ok',
  durationMs: 1000,
  isAborted: false,
  turnId: `t${read}`,
  reason: 'answer' as const,
  ...(agentId ? { agentId } : {}),
  usage: { model: 'claude-opus-5-5', input_tokens: fresh, output_tokens: 10, cache_read_input_tokens: read, cache_creation_input_tokens: write },
})

test('缓存命中：按轮累计（读取 ÷ 读取+写入+未走缓存），子代理不算，第四个圆环显示', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })

  // 第一轮 80/(80+10+10)=80%；第二轮 190/(190+0+10)=95%；累计 270/300=90%
  await $.turn.complete(turn(80, 10, 10))
  await $.turn.complete(turn(190, 0, 10))
  // 子代理的轮次不计入
  await $.turn.complete(turn(0, 500, 500, 'agent-1'))
  await ui.redraw()
  const svg = await svgOf(ui)
  expect(String(svg.props?.alt)).toContain('缓存命中 90%')
  expect(String(svg.props?.source)).toContain('缓存命中')
  expect(String(svg.props?.source)).toContain('本轮 95%')
  expect(String(svg.props?.source)).toContain('读取 270')
})

test('排布均匀：左右留白相等，Clawd 与四块之间五段间距相等', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  // 故意用长短差很多的文字：上下文副标题短，每周额度副标题长
  await $.session.measure(measure(42, 8, 63))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  const src = String((await svgOf(ui)).props?.source)
  const blocks = [...src.matchAll(/<rect x="([\d.]+)" y="6" width="([\d.]+)" height="52" fill="transparent"\/>/g)].map(m => [Number(m[1]), Number(m[2])])
  expect(blocks).toHaveLength(4)
  const near = (a: number, b: number) => Math.abs(a - b) < 0.6
  const clawdRight = 22 + 64
  const gaps = [blocks[0][0] - clawdRight, ...[1, 2, 3].map(i => blocks[i][0] - (blocks[i - 1][0] + blocks[i - 1][1]))]
  for (const g of gaps) expect(near(g, gaps[0])).toBe(true)
  // 右边留白 = 左边留白（22）
  expect(near(1068 - (blocks[3][0] + blocks[3][1]), 22)).toBe(true)
  // 各块宽度跟着文字走，不再强行等宽（上下文按悬停详情「84,000 tokens」留宽，比 5 小时额度那块宽）
  expect(blocks[0][1] > blocks[1][1]).toBe(true)
})

test('100% 放进圆环：三位数去掉 %、换小字号', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete(turn(500, 0, 0))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  const src = String((await svgOf(ui)).props?.source)
  expect(String((await svgOf(ui)).props?.alt)).toContain('缓存命中 100%')
  // 另外三个两位数以内的圆环各有一个 %，100 的那个没有
  expect(src.match(/class="pct"/g)?.length).toBe(3)
  expect(src).toContain('class="num sm"')
})

test('折叠：数据刷新展开 5 秒后收成细条；按钮和 /clawd 切换「一直展开」', ZH, async ($, on) => {
  const clock = mock.clock(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(42, 8, 63))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })

  // 刚刷新：展开
  expect((await svgOf(ui)).props?.height).toBe(64)
  expect((await ui.find({ key: 'toggle' }))?.props?.label).toBe('▼')

  // 4.9 秒还展开着，5 秒后收成细条
  await clock.advance(4900)
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(64)
  await clock.advance(200)
  await ui.redraw()
  const mini = await svgOf(ui)
  expect(mini.props?.height).toBe(30)
  expect(String(mini.props?.source)).toContain(' mini"')
  expect(String(mini.props?.source)).toContain('class="mlab">缓存命中')
  // 细条也跟着 App 外观走
  expect(String(mini.props?.source)).toContain('style="color-scheme:light dark;background:transparent"')
  expect(String(mini.props?.source)).toContain('.mtrack{fill:#E8E5DC}')
  expect((await ui.find({ key: 'toggle' }))?.props?.label).toBe('▲')

  // 按「展开」→ 一直展开，再等多久都不收
  await ui.press({ key: 'toggle' })
  await clock.advance(20000)
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(64)

  // 按「收起」→ 立刻收起
  await ui.press({ key: 'toggle' })
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(30)

  // 新数据来了：自动展开，5 秒后又收
  await $.session.measure(measure(57, 8, 63))
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(64)
  await clock.advance(5100)
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(30)

  // /clawd：切到一直展开，再切回来
  await $.command.run({ command: 'clawd', args: '' } as never)
  await clock.advance(20000)
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(64)
  await $.command.run({ command: 'clawd', args: '' } as never)
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(30)
})

test('细条排布均匀：左右留白相等、Clawd 与四项之间间距相等', ZH, async ($, on) => {
  const clock = mock.clock(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(42, 8, 63))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  await clock.advance(5100)
  await ui.redraw()
  const src = String((await svgOf(ui)).props?.source)
  const items = [...src.matchAll(/<rect x="([\d.]+)" y="2" width="([\d.]+)" height="26" fill="transparent"\/>/g)].map(m => [Number(m[1]), Number(m[2])])
  expect(items).toHaveLength(4)
  const near = (a: number, b: number) => Math.abs(a - b) < 0.6
  const gaps = [items[0][0] - (14 + 32), ...[1, 2, 3].map(i => items[i][0] - (items[i - 1][0] + items[i - 1][1]))]
  for (const g of gaps) expect(near(g, gaps[0])).toBe(true)
  expect(near(1068 - (items[3][0] + items[3][1]), 14)).toBe(true)
})

test('连续刷新：只认最后一次的 5 秒，早先的定时器不会提前收起', ZH, async ($, on) => {
  const clock = mock.clock(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(42, 8, 63))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  await clock.advance(3000)
  await $.session.measure(measure(50, 9, 63))
  // 第一次刷新的定时器在第 5 秒到期；第二次在第 8 秒。第 5.5 秒应该还展开着
  await clock.advance(2500)
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(64)
  await clock.advance(2600)
  await ui.redraw()
  expect((await svgOf(ui)).props?.height).toBe(30)
})

// ───────── 更新提示 ─────────
import { CHANGELOG } from './changelog'

const START = { cwd: '/tmp', surface: 'desktop' as const, isInteractive: true }

async function startWith($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1], stored: Record<string, unknown>) {
  mock.store(on, stored)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  // 测试里没有真实会话：补上「会话开始」和「读用量」的底层应答
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  // 桌面窗口已连上（/reload-plugins 的情形）
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  const toasts: { text: string; timeoutMs?: number }[] = []
  on('ui.toast', ($, e) => {
    toasts.push(e)
    return { value: undefined }
  })
  await $.session.start(START as never)

  return toasts
}

test('更新提示：从上一版升上来，弹出新版本改了什么，记住已看过', ZH, async ($, on) => {
  const toasts = await startWith($, on, { lastSeenVersion: CHANGELOG[1].version })
  expect(toasts).toHaveLength(1)
  expect(toasts[0].text).toContain(`Clawd 信息栏 ${CHANGELOG[0].version}`)
  expect(toasts[0].text).toContain(CHANGELOG[0].notes.zh[0])
  // 停到 App 允许的上限 60 秒（超过 60000 整条会被丢掉）
  expect(toasts[0].timeoutMs).toBe(60000)

  // 已记下看过：再加载一次（比如 /reload-plugins）不再弹
  await $.session.start(START as never)
  expect(toasts).toHaveLength(1)
})

test('更新提示：已经看过最新版，不弹', ZH, async ($, on) => {
  const toasts = await startWith($, on, { lastSeenVersion: CHANGELOG[0].version })
  expect(toasts).toHaveLength(0)
})

test('更新提示：新装（从没看过）只介绍最新一版', ZH, async ($, on) => {
  const toasts = await startWith($, on, {})
  expect(toasts).toHaveLength(1)
  expect(toasts[0].text).toContain(CHANGELOG[0].version)
  expect(toasts[0].text).not.toContain(CHANGELOG[1].version)
  await $.session.start(START as never)
  expect(toasts).toHaveLength(1)
})

test('更新提示：后面的步骤出错（注册命令失败）也不影响弹窗', ZH, async ($, on) => {
  mock.store(on, { lastSeenVersion: CHANGELOG[1].version })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  // 桌面窗口已连上（/reload-plugins 的情形）
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('command.register', () => {
    throw new Error('注册失败')
  })
  const toasts: { text: string }[] = []
  on('ui.toast', ($, e) => {
    toasts.push(e)
    return { value: undefined }
  })
  await $.session.start(START as never)
  expect(toasts).toHaveLength(1)
})

// ───────── 语言 / 放松模式 ─────────
const EN = { options: { language: 'en' } }
const AUTO = { options: { language: 'auto' } }

// 跑一次 session.start，环境变量和 macOS 系统语言列表都由测试给定
async function startAuto(
  $: Parameters<Parameters<typeof test>[2]>[0],
  on: Parameters<Parameters<typeof test>[2]>[1],
  env: Record<string, string>,
  appleLanguages: string | null,
) {
  mock.store(on, { lastSeenVersion: CHANGELOG[0].version })
  mock.env(on, env)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  // 桌面窗口已连上（/reload-plugins 的情形）
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  const asked: string[][] = []
  on('process.run', ($, e) => {
    asked.push([...e.argv])
    if (appleLanguages === null) {
      return { deny: 'no defaults command (not macOS)' }
    }

    return { value: { exitCode: 0, stdout: appleLanguages, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  await $.session.start(START as never)

  return asked
}

test('英文界面：language = en 时标签、重置时间、读屏描述都是英文', EN, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(42, 8, 63))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  const svg = await svgOf(ui)
  const src = String(svg.props?.source)
  expect(svg.props?.alt).toBe('Context 42%, 5-hour 8%, Weekly 63%, Cache hit —; Claude is resting')
  expect(src).toContain('class="lab">Context<')
  expect(src).toContain('class="lab">Cache hit<')
  expect(src).toContain('Resets ')
  expect(src).not.toContain('重置')
  expect(src).not.toContain('上下文')
})

test('英文界面：四块仍然左右留白相等、间距相等', EN, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure(measure(42, 8, 63))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  const src = String((await svgOf(ui)).props?.source)
  const blocks = [...src.matchAll(/<rect x="([\d.]+)" y="6" width="([\d.]+)" height="52" fill="transparent"\/>/g)].map(m => [Number(m[1]), Number(m[2])])
  const near = (a: number, b: number) => Math.abs(a - b) < 0.6
  const gaps = [blocks[0][0] - (22 + 64), ...[1, 2, 3].map(i => blocks[i][0] - (blocks[i - 1][0] + blocks[i - 1][1]))]
  for (const g of gaps) expect(near(g, gaps[0])).toBe(true)
  expect(near(1068 - (blocks[3][0] + blocks[3][1]), 22)).toBe(true)
})

test('英文界面：更新提示也是英文', EN, async ($, on) => {
  mock.store(on, { lastSeenVersion: CHANGELOG[1].version })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  // 桌面窗口已连上（/reload-plugins 的情形）
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  const toasts: { text: string }[] = []
  on('ui.toast', ($, e) => {
    toasts.push(e)
    return { value: undefined }
  })
  await $.session.start(START as never)
  expect(toasts).toHaveLength(1)
  expect(toasts[0].text).toContain(`Clawd band ${CHANGELOG[0].version}: `)
  expect(toasts[0].text).toContain(CHANGELOG[0].notes.en[0])
})

test('跟随系统：环境变量是中文 → 中文，不去问 macOS', AUTO, async ($, on) => {
  const asked = await startAuto($, on, { LANG: 'zh_CN.UTF-8' }, '("en-US")')
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(String((await svgOf(ui)).props?.alt)).toContain('上下文')
  expect(asked).toHaveLength(0)
})

test('跟随系统：环境变量为空、macOS 首选英文（en-MY, zh-Hans-MY）→ 英文', AUTO, async ($, on) => {
  const asked = await startAuto($, on, {}, '(\n    "en-MY",\n    "zh-Hans-MY"\n)\n')
  expect(asked[0]).toEqual(['defaults', 'read', '-g', 'AppleLanguages'])
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(String((await svgOf(ui)).props?.alt)).toContain('Context')
})

test('跟随系统：环境变量为空、macOS 首选中文（zh-Hans-CN）→ 中文', AUTO, async ($, on) => {
  await startAuto($, on, {}, '(\n    "zh-Hans-CN",\n    en\n)\n')
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(String((await svgOf(ui)).props?.alt)).toContain('上下文')
})

test('跟随系统：不是 macOS（没有 defaults 命令）也能正常显示', AUTO, async ($, on) => {
  await startAuto($, on, {}, null)
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(String((await svgOf(ui)).props?.alt)).toMatch(/上下文|Context/)
})

test('放松模式：缓存命中 ≥90% 戴墨镜；同时额度告急则只冒汗不戴墨镜', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete(turn(95, 0, 5))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(String((await svgOf(ui)).props?.source)).toMatch(/class="clawd[^"]* chill"/)

  // 额度告急：冒汗优先
  await $.session.measure(measure(42, 93, 63))
  await ui.redraw()
  const src = String((await svgOf(ui)).props?.source)
  expect(src).toMatch(/class="clawd[^"]* stressed/)
  expect(src).not.toMatch(/class="clawd[^"]* chill"/)
})

test('放松模式：缓存命中低于 90% 不戴墨镜', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete(turn(80, 10, 10))
  const ui = await $.ui.mount({ ...BAND(false), surface: 'desktop' })
  expect(String((await svgOf(ui)).props?.source)).not.toMatch(/class="clawd[^"]* chill"/)
})

test('放松模式 + 干活：墨镜和干活两种状态同时挂在 Clawd 上（干活时墨镜推到头顶）', ZH, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete(turn(95, 0, 5))
  const ui = await $.ui.mount({ ...BAND(true), surface: 'desktop' })
  const src = String((await svgOf(ui)).props?.source)
  expect(src).toMatch(/class="clawd working[^"]* chill"/)
  expect(src).toContain('.chill.working .shades{animation:none;transform:translateY(-1.9px)}')
})

test('更新提示：App 重启时会话先启动、窗口还没连上，先不弹也不记「看过」；窗口连上再弹', ZH, async ($, on) => {
  const stored: Record<string, unknown> = { lastSeenVersion: CHANGELOG[1].version }
  mock.store(on, stored)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  let surfaces: string[] = []
  on('session.surfaces', () => ({ value: surfaces }))
  on('session.attach', ($, e) => ({ clientId: e.clientId }))
  const toasts: string[] = []
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  await $.session.start(START as never)
  expect(toasts).toHaveLength(0)

  surfaces = ['desktop']
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain(`Clawd 信息栏 ${CHANGELOG[0].version}`)
  // 弹过才记看过：再连一次不重复弹
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:2' })
  expect(toasts).toHaveLength(1)
})


test('悬停换上的详情（如「84,000 tokens」）比副标题长时，这一块按详情留宽，不压分隔线、不出右边界', EN, async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete(turn(990000, 140000, 5000))
  const src = String((await svgOf(await $.ui.mount({ ...BAND(false), surface: 'desktop' }))).props?.source)
  const blocks = [...src.matchAll(/<rect x="([\d.]+)" y="6" width="([\d.]+)" height="52" fill="transparent"\/>/g)].map(m => [Number(m[1]), Number(m[2])])
  const details = [...src.matchAll(/class="sub2">([^<]*)</g)].map(m => m[1])
  expect(blocks).toHaveLength(4)
  expect(details).toHaveLength(4)
  expect(details[0]).toBe('84,000 tokens')
  // 文字区 = 块宽 − 圆环和间隔（2R + 4 + 10 = 44）；下限按每字 0.5 个字号估（与插件的测宽函数无关）
  details.forEach((d, i) => expect(blocks[i][1] - 44).toBeGreaterThanOrEqual(d.length * 10.5 * 0.5))
  // 最后一块的右边不超过信息栏宽度（右边留白 22）
  expect(blocks[3][0] + blocks[3][1]).toBeLessThanOrEqual(1068 - 22 + 0.6)
})

test('窗口变窄：信息栏宽度跟着收，加上右边按钮也不超过可用宽度（按钮不会被挤到下一行）；内容逐级收，不出右边界', EN, async ($, on) => {
  const clock = mock.clock(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  await $.session.measure(measure(42, 8, 63))
  await $.turn.complete(turn(990000, 140000, 5000))
  const seen = new Set<string>()
  for (const cols of [140, 80, 70, 58, 45, 40]) {
    const band = { ...BAND(false), props: { ...BAND(false).props, bodyColumns: cols }, viewport: { columns: cols, rows: 40 }, surface: 'desktop' as const }
    const svg = await svgOf(await $.ui.mount(band))
    const width = Number(svg.props?.width)
    // 可用宽度 ≈ 每列 8px；SVG + 按钮（44）不超过它（最窄 270 的下限只在极窄时才起作用）
    if (cols * 8 - 8 >= 270 + 44) expect(width + 44).toBeLessThanOrEqual(cols * 8 - 8)
    const src = String(svg.props?.source)
    const blocks = [...src.matchAll(/<rect x="([\d.]+)" y="6" width="([\d.]+)" height="52" fill="transparent"\/>/g)].map(m => Number(m[1]) + Number(m[2]))
    expect(blocks).toHaveLength(4)
    expect(Math.max(...blocks)).toBeLessThanOrEqual(width - 22 + 0.6)
    // 收掉的文字还在悬停提示里
    expect(src).toContain('<title>Context 42% · 84,000 / 200,000 tokens</title>')
    seen.add(src.includes('class="sub"') ? 'full' : src.includes('class="lab stk"') ? 'stacked' : src.includes('class="lab"') ? 'compact' : 'rings')
  }
  // 这组宽度把四种排法都走到了
  expect([...seen].sort()).toEqual(['compact', 'full', 'rings', 'stacked'])

  // 收起的细条同样不出右边界
  await clock.advance(5100)
  for (const cols of [140, 70, 58, 45]) {
    const band = { ...BAND(false), props: { ...BAND(false).props, bodyColumns: cols }, viewport: { columns: cols, rows: 40 }, surface: 'desktop' as const }
    const svg = await svgOf(await $.ui.mount(band))
    const width = Number(svg.props?.width)
    const items = [...String(svg.props?.source).matchAll(/<rect x="([\d.]+)" y="2" width="([\d.]+)" height="26" fill="transparent"\/>/g)].map(m => Number(m[1]) + Number(m[2]))
    expect(items).toHaveLength(4)
    expect(Math.max(...items)).toBeLessThanOrEqual(width - 14 + 0.6)
  }
})
