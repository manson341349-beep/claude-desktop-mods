import { expect, mock, test } from 'claude-code/testing'

import type { Bars } from '../types'
import { bandSvg } from './band'
import { cardSvg } from './card'
import { CHANGELOG } from './changelog'
import { isHalloween, NEW_PET } from './pet'

const WITCH = '#3B2A55'
const PAIL = '#F28C28'
const SPROUT = '#7BC163'
const BARS: Bars = { from: null, to: { contextPercent: 20, contextTokens: 40000, contextWindow: 200000, session: { percent: 30 }, weekly: { percent: 40 } } }
const pet = (level: number, more: object = {}) => ({ level, title: `Clawd Lv.${level}`, halloween: true, ...more })

// ───────── 纯函数：日期、装扮、讨糖时间线 ─────────

test('万圣节：10 月 25 日到 11 月 1 日', () => {
  const at = (m: number, d: number, h = 12) => new Date(2026, m - 1, d, h)
  expect([at(10, 1), at(10, 24, 23), at(10, 25, 0), at(10, 31), at(11, 1, 23), at(11, 2, 0)].map(isHalloween)).toEqual([false, false, true, true, true, false])
})

test('万圣节装扮：巫师帽替换等级帽子（Lv.2 小芽不画），领结照戴，手里拎南瓜桶', () => {
  const lv3 = bandSvg(BARS, false, 900, false, 'zh', pet(3))
  expect(lv3).toContain(WITCH)
  expect(lv3).toContain('class="hw-pail"')
  expect(lv3).toContain('#B83238') // 领结
  expect(bandSvg(BARS, false, 900, false, 'zh', pet(2))).not.toContain(SPROUT)
  // 平时：还是小芽，没有帽子和桶
  const plain = bandSvg(BARS, false, 900, false, 'zh', { level: 2, title: 'Clawd Lv.2' })
  expect(plain).toContain(SPROUT)
  expect(plain).not.toContain(WITCH)
  expect(plain).not.toContain('class="hw-pail"')
})

test('万圣节 + 干活：披床单变幽灵，飘的是糖果不是 { } </> ✓', () => {
  const working = bandSvg(BARS, true, 900, false, 'zh', pet(1))
  expect(working).toContain('M2.6-.9Q8-2.4 13.4-.9')
  expect(working).not.toContain('>{ }<')
  expect(working.match(/class="glyph"/g)).toHaveLength(3)
  expect(working).toContain('#9B6BDF') // 棒棒糖
  const plain = bandSvg(BARS, true, 900, false, 'zh', { level: 1, title: 'Clawd Lv.1' })
  expect(plain).toContain('>{ }<')
  expect(plain).not.toContain('M2.6-.9Q8-2.4 13.4-.9')
})

test('讨糖：还没开始时按剩余秒数开始；12 秒没点就生气（计时器第二遍才生气，点了就没有第二遍）', () => {
  const soon = bandSvg(BARS, false, 900, false, 'zh', pet(1, { askAgo: -4 }))
  expect(soon).toContain('<animate id="hwtimer" attributeName="x" values="0;0" begin="4.00s" dur="12.00s" repeatCount="2" end="hit.click"/>')
  expect(soon).toContain('begin="hwtimer.repeat(1)"')
  // 已经讨了 5 秒（比如中途重画）：再等 7 秒就生气
  expect(bandSvg(BARS, false, 900, false, 'zh', pet(1, { askAgo: 5 }))).toContain('begin="0.00s" dur="7.00s"')
  // 早就过了 12 秒：马上生气
  expect(bandSvg(BARS, false, 900, false, 'zh', pet(1, { askAgo: 40 }))).toContain('dur="0.05s"')
})

test('讨糖：三层点击区——第一下给糖（开心 3 秒），第二下空翻，第三下跳起来撒糖', () => {
  const svg = bandSvg(BARS, false, 900, false, 'zh', pet(1, { askAgo: 0 }))
  // 叠放顺序：hit3 在最下、hit 在最上；点了的那层藏 1.6 秒，下一下落到下一层
  expect(svg.indexOf('id="hit3"')).toBeLessThan(svg.indexOf('id="hit2"'))
  expect(svg.indexOf('id="hit2"')).toBeLessThan(svg.indexOf('id="hit"'))
  expect(svg).toContain('<set attributeName="visibility" to="hidden" begin="hit.click" dur="1.6s"/>')
  expect(svg).toContain('<set attributeName="visibility" to="hidden" begin="hit2.click" dur="1.6s"/>')
  expect(svg).toContain('<set attributeName="opacity" to="1" begin="hit.click" dur="3s"/>')
  expect(svg).toMatch(/type="rotate"[^>]*begin="hit2\.click"/)
  expect(svg).toMatch(/values="0 0;0 -3;0 0;0 -1\.6;0 0"[^>]*begin="hit3\.click"/)
  expect(svg.match(/begin="hit3\.click" dur="\.9s"/g)).toHaveLength(6)
})

test('不讨糖的时候：只有一层点击区，点一下还是空翻；干活时也不讨糖', () => {
  for (const svg of [
    bandSvg(BARS, false, 900, false, 'zh', pet(1)),
    bandSvg(BARS, true, 900, false, 'zh', pet(1, { askAgo: 0 })),
    bandSvg(BARS, false, 900, false, 'zh', { level: 1, title: 'Clawd Lv.1', askAgo: 0 }),
  ]) {
    expect(svg).not.toContain('hwtimer')
    expect(svg).not.toContain('id="hit2"')
    expect(svg).toMatch(/type="rotate"[^>]*begin="hit\.click"/)
  }
})

test('收起的细条上也会讨糖', () => {
  const mini = bandSvg(BARS, false, 900, true, 'zh', pet(1, { askAgo: 0 }))
  expect(mini).toContain('hwtimer')
  expect(mini).toContain(WITCH)
})

test('战报卡：万圣节也戴巫师帽、拎桶', () => {
  const data = { startedAt: 0, now: 60000, turns: 1, toolCalls: 0, files: 0, tokens: 0, pet: NEW_PET, earned: [] }
  expect(cardSvg({ ...data, halloween: true }, 'zh')).toContain(WITCH)
  expect(cardSvg(data, 'zh')).not.toContain(WITCH)
})

// ───────── 接进插件：答完一轮开始讨糖 ─────────

const START = { cwd: '/tmp', surface: 'desktop' as const, isInteractive: true }
const BAND = {
  plugin: 'usage-pet',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 140, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  viewport: { columns: 140, rows: 40 },
  surface: 'desktop' as const,
}
const TURN = {
  answer: 'ok',
  durationMs: 1000,
  isAborted: false,
  turnId: 't1',
  reason: 'answer' as const,
  usage: { model: 'claude-opus-5-5', input_tokens: 50, output_tokens: 40, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 },
}

type Harness = Parameters<Parameters<typeof test>[1]>
// 把插件的时钟拨到指定的本机日期（默认 10 月 26 日下午，万圣节期间）
const OCT_26 = new Date(2026, 9, 26, 14).getTime()
async function bandAfterTurn($: Harness[0], on: Harness[1], turn = TURN, now = OCT_26) {
  mock.store(on, { lastSeenVersion: CHANGELOG[0].version })
  mock.clock(on, { now })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  on('ui.toast', () => ({ value: undefined }))
  await $.session.start(START as never)
  await $.turn.complete(turn)
  const ui = await $.ui.mount(BAND)

  return String((await ui.findAll({ type: 'Svg' }))[0].props?.source)
}

test('答完一轮（10 月 26 日）：等收起后开始讨糖，悬停提示点他给糖', { options: { language: 'zh' } }, async ($, on) => {
  const svg = await bandAfterTurn($, on)
  expect(svg).toContain(WITCH)
  // 刚答完：讨糖在 6 秒后开始（5 秒自动展开收起 + 1 秒）
  expect(svg).toContain('<animate id="hwtimer" attributeName="x" values="0;0" begin="6.00s" dur="12.00s"')
  expect(svg).toContain('<title>Clawd 想要糖果 🍬 点他一下给糖 · Clawd Lv.1')
})

test('不在万圣节（10 月 10 日）：不换装、不讨糖', { options: { language: 'zh' } }, async ($, on) => {
  const svg = await bandAfterTurn($, on, TURN, new Date(2026, 9, 10, 14).getTime())
  expect(svg).not.toContain(WITCH)
  expect(svg).not.toContain('hwtimer')
})

test('答完一轮但被中断：不讨糖', { options: { language: 'zh' } }, async ($, on) => {
  expect(await bandAfterTurn($, on, { ...TURN, isAborted: true })).not.toContain('hwtimer')
})

test('/config 里 seasonal = off：不换装、不讨糖', { options: { language: 'zh', seasonal: 'off' } }, async ($, on) => {
  const svg = await bandAfterTurn($, on)
  expect(svg).not.toContain(WITCH)
  expect(svg).not.toContain('hwtimer')
})

test('seasonal 现在是文本框：手打的 " OFF " 也算关掉', { options: { language: 'zh', seasonal: ' OFF ' } }, async ($, on) => {
  const svg = await bandAfterTurn($, on)
  expect(svg).not.toContain(WITCH)
  expect(svg).not.toContain('hwtimer')
})
