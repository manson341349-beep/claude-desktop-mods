import { expect, mock, test } from 'claude-code/testing'

import { CHANGELOG } from './changelog'
import { NEW_PET, levelOf, normalize, onTurn, threshold } from './pet'

const ZH = { options: { language: 'zh' } }
const START = { cwd: '/tmp', surface: 'desktop' as const, isInteractive: true }
const BAND = {
  plugin: 'usage-pet',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 140, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  viewport: { columns: 140, rows: 40 },
  surface: 'desktop' as const,
}

const at = (y: number, m: number, d: number, h = 14) => new Date(y, m - 1, d, h, 0, 0)

// ───────── 纯函数：等级、经验、连续天数、成就 ─────────

test('等级门槛：0 / 100 / 300 / 600 / 1000 …，正好到门槛就升级', () => {
  expect([0, 99, 100, 299, 300, 999, 1000, 4499, 4500].map(levelOf)).toEqual([1, 1, 2, 2, 3, 4, 5, 9, 10])
  expect(threshold(10)).toBe(4500)
})

test('经验：每轮 +10，命中 ≥90% 再 +5，每天第一轮再 +20', () => {
  const day1 = onTurn(NEW_PET, { now: at(2026, 10, 5), turnRate: 50, maxLimit: 10 }).pet
  expect(day1.xp).toBe(30)
  const again = onTurn(day1, { now: at(2026, 10, 5, 15), turnRate: 95, maxLimit: 10 }).pet
  expect(again.xp).toBe(45)
  expect(again.turns).toBe(2)
})

test('连续天数：隔天 +1，断一天回到 1，同一天不变', () => {
  const d1 = onTurn(NEW_PET, { now: at(2026, 10, 5), maxLimit: 0 }).pet
  const sameDay = onTurn(d1, { now: at(2026, 10, 5, 23), maxLimit: 0 }).pet
  const d2 = onTurn(sameDay, { now: at(2026, 10, 6), maxLimit: 0 }).pet
  const gap = onTurn(d2, { now: at(2026, 10, 8), maxLimit: 0 }).pet
  expect([d1.streak, sameDay.streak, d2.streak, gap.streak]).toEqual([1, 1, 2, 1])
  // 跨月也算连续
  const endOfMonth = onTurn({ ...NEW_PET, streak: 4, lastDay: '2026-10-31' }, { now: at(2026, 11, 1), maxLimit: 0 }).pet
  expect(endOfMonth.streak).toBe(5)
})

test('成就只解锁一次；升级事件带上这一级解锁的装扮', () => {
  const first = onTurn({ ...NEW_PET, xp: 95 }, { now: at(2026, 10, 5, 2), turnRate: 99.2, maxLimit: 96 })
  expect(first.events).toEqual([
    { kind: 'level', level: 2, gear: 'sprout' },
    { kind: 'achievement', id: 'cache-99' },
    { kind: 'achievement', id: 'night-owl' },
    { kind: 'achievement', id: 'close-call' },
  ])
  const second = onTurn(first.pet, { now: at(2026, 10, 5, 3), turnRate: 99.5, maxLimit: 97 })
  expect(second.events).toEqual([])
})

test('一轮跨过好几级：每一级都报（Lv4 没有装扮）', () => {
  const { events } = onTurn({ ...NEW_PET, xp: 990, lastDay: '2026-10-05' }, { now: at(2026, 10, 5), maxLimit: 0 })
  expect(events).toEqual([{ kind: 'level', level: 5, gear: 'cap' }])
  const jump = onTurn({ ...NEW_PET, xp: 280 }, { now: at(2026, 10, 5), maxLimit: 0 })
  expect(jump.events.filter(e => e.kind === 'level')).toEqual([{ kind: 'level', level: 3, gear: 'bowtie' }])
})

test('store 里读出来的脏数据补齐成完整的 Pet', () => {
  expect(normalize(undefined)).toEqual(NEW_PET)
  expect(normalize({ xp: -5, turns: 'x', streak: 3, achievements: ['a', 1] })).toEqual({ xp: 0, turns: 0, streak: 3, lastDay: undefined, achievements: ['a'] })
})

// ───────── 接进插件：store、提示、信息栏、战报 ─────────

type Harness = Parameters<Parameters<typeof test>[1]>
// 测试里的「核心」应答都要在第一次调用 $ 之前注册：beneath 传进来
async function start($: Harness[0], on: Harness[1], stored: Record<string, unknown>, beneath?: (on: Harness[1]) => void) {
  const store = { lastSeenVersion: CHANGELOG[0].version, ...stored }
  mock.store(on, store)
  mock.clock(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  const toasts: string[] = []
  const timeouts: (number | undefined)[] = []
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    timeouts.push(e.timeoutMs)
    return { value: undefined }
  })
  beneath?.(on)
  await $.session.start(START as never)

  return { store, toasts, timeouts }
}

const turn = (read: number, write: number, fresh: number) => ({
  answer: 'ok',
  durationMs: 1000,
  isAborted: false,
  turnId: `t${read}`,
  reason: 'answer' as const,
  usage: { model: 'claude-opus-5-5', input_tokens: fresh, output_tokens: 40, cache_read_input_tokens: read, cache_creation_input_tokens: write },
})

test('答完一轮：经验写回 store，升级弹提示，信息栏上的 Clawd 戴上小芽、悬停显示等级', ZH, async ($, on) => {
  const { toasts, timeouts } = await start($, on, { pet: { xp: 95, turns: 9, streak: 1, lastDay: '2000-01-01', achievements: [] } })
  await $.turn.complete(turn(50, 0, 50))

  // mock.store 存的是副本：经验和回合数看信息栏上的悬停提示（经验 95 + 10 + 每天第一轮 20 = 125）
  expect(toasts.some(t => t.includes('Clawd 升到 Lv.2') && t.includes('头顶小芽'))).toBe(true)
  // 升级 / 成就提示也停到上限 60 秒
  expect(timeouts.length).toBeGreaterThan(0)
  expect(timeouts.every(ms => ms === 60000)).toBe(true)

  const ui = await $.ui.mount(BAND)
  const src = String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
  expect(src).toContain('#7BC163')
  expect(src).toContain('<title>Clawd Lv.2 · 经验 125 / 300')
})

test('子代理的回合不涨经验', ZH, async ($, on) => {
  const { toasts } = await start($, on, { pet: { xp: 95, turns: 0, streak: 0, achievements: [] } })
  await $.turn.complete({ ...turn(50, 0, 50), agentId: 'sub-1' })
  expect(toasts.filter(t => t.includes('升到'))).toEqual([])
  const ui = await $.ui.mount(BAND)
  expect(String((await ui.findAll({ type: 'Svg' }))[0].props?.source)).toContain('<title>Clawd Lv.1 · 经验 95 / 100')
})

test('战报：工具调用计数，改过的文件按路径去重，被拦下的不算；/clawd-card 导出图片', ZH, async ($, on) => {
  const runs: { argv: string[]; stdin?: string }[] = []
  await start($, on, {}, on => {
    mock.env(on, { HOME: '/Users/me' })
    // 测试里的「核心」：Edit / Write 照常完成，Bash rm 被拦
    on('tool.call', ($, e) => (e.tool === 'Bash' ? { deny: 'blocked' } : { result: {} as never }))
    on('process.run', ($, e) => {
      runs.push({ argv: [...e.argv], stdin: e.init?.stdin })
      const out = `/Users/me/Pictures/Clawd Reports/${e.argv[4]}`
      return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('ui.open', () => ({ value: { isPlaced: true } }))
  })
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'a', new_string: 'b' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'b', new_string: 'c' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/p/b.ts', content: 'x' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/p/c.ts' } as never)
  await $.tool.call({ tool: 'Bash', command: 'rm -rf /' } as never)
  await $.turn.complete(turn(900, 50, 50))

  const res = await $.command.run({ command: 'clawd-card', args: '' } as never)
  expect(String((res as { text?: string }).text)).toContain('Clawd 战报已复制到剪贴板')
  expect(runs).toHaveLength(1)
  expect(runs[0].argv.slice(0, 2)).toEqual(['/bin/sh', '-c'])
  expect(runs[0].argv[4]).toMatch(/^Clawd-report-\d{8}-\d{6}\.png$/)
  // 存到「图片/Clawd Reports」而不是桌面；只留最近 20 张，更早的进废纸篓（只动 Clawd-report-*.png）
  expect(runs[0].argv[2]).toContain('dir="$HOME/Pictures/Clawd Reports"')
  expect(runs[0].argv[2]).not.toContain('Desktop')
  expect(runs[0].argv[2]).toContain('ls -t "$dir"/Clawd-report-*.png | tail -n +21')
  expect(runs[0].argv[2]).toContain('mv "$old" "$HOME/.Trash/"')
  // 导出的是正方形画布（qlmanage 只出正方形），数字对得上：4 次工具调用、2 个文件、1 回合、命中 90%
  const svg = String(runs[0].stdin)
  expect(svg).toContain('width="1200" height="1200"')
  expect(svg).toMatch(/>4<\/text><text[^>]*>工具调用/)
  expect(svg).toMatch(/>2<\/text><text[^>]*>改动文件/)
  expect(svg).toMatch(/>1<\/text><text[^>]*>回合/)
  expect(svg).toMatch(/>90%<\/text><text[^>]*>缓存命中/)

  // 面板里画的是同一张卡（16:9，不是正方形）
  const pane = await $.ui.mount({ plugin: 'usage-pet', component: 'Pane', requestId: 'clawd-card', props: {}, viewport: { columns: 100, rows: 40 }, surface: 'desktop' } as never)
  const card = (await pane.findAll({ type: 'Svg' }))[0]
  expect(card.props?.width).toBe(640)
  expect(card.props?.height).toBe(360)
})

test('导出失败（不是 macOS）：面板照样打开，告诉用户为什么没图', ZH, async ($, on) => {
  await start($, on, {}, on => {
    mock.env(on, {})
    on('process.run', () => ({ value: { exitCode: 127, stdout: '', stderr: 'qlmanage: not found', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
  })
  const res = await $.command.run({ command: 'clawd-card', args: '' } as never)
  expect(String((res as { text?: string }).text)).toContain('没能导出图片：qlmanage: not found')
})

// ───────── Windows ─────────
const WIN_ENV = { OS: 'Windows_NT', TEMP: 'C:\\Users\\me\\AppData\\Local\\Temp' }

test('Windows：/clawd-card 交给 PowerShell 脚本导出（Edge 截图 1200×675），SVG 先写进临时文件', ZH, async ($, on) => {
  const runs: string[][] = []
  const writes: { path: string; text: string }[] = []
  await start($, on, {}, on => {
    mock.env(on, WIN_ENV)
    on('fs.write', ($, e) => {
      writes.push({ path: e.path, text: e.text })
      return { value: undefined }
    })
    on('process.run', ($, e) => {
      runs.push([...e.argv])
      const name = e.argv[e.argv.indexOf('-Name') + 1]
      return { value: { exitCode: 0, stdout: `C:\\Users\\me\\Pictures\\Clawd Reports\\${name}`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('ui.open', () => ({ value: { isPlaced: true } }))
  })
  await $.turn.complete(turn(900, 50, 50))

  const res = await $.command.run({ command: 'clawd-card', args: '' } as never)
  expect(String((res as { text?: string }).text)).toContain('Clawd 战报已复制到剪贴板')
  expect(String((res as { text?: string }).text)).toContain('Pictures\\Clawd Reports\\Clawd-report-')
  expect(runs).toHaveLength(1)
  const argv = runs[0]
  expect(argv[0]).toBe('powershell.exe')
  expect(argv).toContain('-Sta')
  expect(argv[argv.indexOf('-File') + 1]).toMatch(/\\hooks\\export-card\.ps1$/)
  expect(argv[argv.indexOf('-Keep') + 1]).toBe('20')
  expect(argv[argv.indexOf('-Name') + 1]).toMatch(/^Clawd-report-\d{8}-\d{6}\.png$/)
  // 写到 TEMP 下的 SVG 就是交给脚本的那个；画布直接是 1200×675、直角
  // 在 macOS 上跑测试时，引擎把 C:\… 当相对路径、前面拼上当前目录，所以写入路径只比结尾
  expect(writes).toHaveLength(1)
  const svgPath = argv[argv.indexOf('-Svg') + 1]
  expect(svgPath.startsWith(`${WIN_ENV.TEMP}\\Clawd-report-`)).toBe(true)
  expect(writes[0].path.endsWith(svgPath)).toBe(true)
  expect(writes[0].text).toContain('width="1200" height="675"')
  expect(writes[0].text).toContain('rx="0" fill="#1C1B1A"')
  expect(writes[0].text).toContain('Microsoft YaHei')
  expect(writes[0].text).toMatch(/>1<\/text><text[^>]*>回合/)
})

test('Windows：导出失败（找不到 Edge / Chrome）时面板照样打开，告诉用户原因', ZH, async ($, on) => {
  await start($, on, {}, on => {
    mock.env(on, WIN_ENV)
    on('fs.write', () => ({ value: undefined }))
    on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'Microsoft Edge or Google Chrome not found', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
  })
  const res = await $.command.run({ command: 'clawd-card', args: '' } as never)
  expect(String((res as { text?: string }).text)).toContain('没能导出图片：Microsoft Edge or Google Chrome not found')
})
