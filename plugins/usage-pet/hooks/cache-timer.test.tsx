import { expect, mock, test } from 'claude-code/testing'

import type { Bars } from '../types'
import { bandSvg } from './band'
import { CHANGELOG } from './changelog'

const BARS: Bars = {
  from: null,
  to: { contextPercent: 20, contextTokens: 40000, contextWindow: 200000, session: { percent: 30 }, weekly: { percent: 40 }, cache: { rate: 92, read: 900, write: 50, fresh: 50 } },
}
const HOUR = 3600000
const visibleFrom = (svg: string, label: string) => svg.match(new RegExp(`<set attributeName="opacity" to="1" begin="([\\d.]+)s" end="([\\d.]+)s"/>${label}<`))

// ───────── 纯函数：怎么画 ─────────

test('缓存倒计时：标题右边按分钟轮流显示，剩 5 分钟内变色，最后换成「cold」', () => {
  const svg = bandSvg(BARS, false, 1100, false, 'en', undefined, { remainMs: 50 * 60000, ttlMs: HOUR })
  // 50m 从一开始就显示，到第 60 秒换成 49m
  expect(visibleFrom(svg, '50m')?.slice(1)).toEqual(['0.00', '60.00'])
  expect(visibleFrom(svg, '49m')?.slice(1)).toEqual(['60.00', '120.00'])
  // 最后一分钟：橙黄，2940–3000 秒
  expect(svg).toMatch(/class="tm warn"[^>]*opacity="0"><set attributeName="opacity" to="1" begin="2940.00s" end="3000.00s"\/>1m</)
  expect(svg).not.toMatch(/class="tm warn"[^>]*>[^<]*<set[^>]*\/>6m</)
  expect(svg).toContain('<set attributeName="opacity" to="1" begin="3000.00s" fill="freeze"/>cold<')
  expect(svg).toContain('The cache stays warm for about 1 hour')
})

test('缓存倒计时：中文、收起的细条上也有，已过期直接显示', () => {
  const zh = bandSvg(BARS, false, 1100, true, 'zh', undefined, { remainMs: 3 * 60000 + 1, ttlMs: 5 * 60000 })
  expect(visibleFrom(zh, '4分')?.[1]).toBe('0.00')
  expect(zh).toContain('缓存从上次回复起保持约 5 分钟')
  const cold = bandSvg(BARS, false, 1100, false, 'zh', undefined, { remainMs: -1000, ttlMs: HOUR })
  expect(cold).toContain('class="tm cold" style="font-size:9px">已过期</text>')
})

test('缓存倒计时：Claude 干活时、还没答过时不显示', () => {
  expect(bandSvg(BARS, true, 1100, false, 'en', undefined, { remainMs: HOUR, ttlMs: HOUR })).not.toContain('class="tm')
  expect(bandSvg(BARS, false, 1100, false, 'en')).not.toContain('class="tm')
})

test('缓存倒计时：这一块按「标题 + 倒计时」留宽，不压到后面的分隔线', () => {
  const svg = bandSvg(BARS, false, 1100, false, 'en', undefined, { remainMs: HOUR, ttlMs: HOUR })
  // 倒计时文字的 x 在缓存那一块里（块是最后一块，后面没有分隔线，检查不出右边界）
  // 字比标题小，按中线对齐：底线比标题（y=29）高 (12-9)×0.36 = 1.08px
  const x = Number(svg.match(/<text x="([\d.]+)" y="27.92" class="tm/)?.[1])
  const lab = Number(svg.match(/<text x="([\d.]+)" y="29" class="lab">Cache hit</)?.[1])
  expect(x).toBeGreaterThan(lab + 40)
  // 最宽的一档是「cold」：4 个小写字母 × 0.58 × 9px ≈ 20.9px；右边要留出和左边一样的 22px
  expect(x + 4 * 0.58 * 9).toBeLessThanOrEqual(1100 - 22)
  expect(svg).toContain('style="font-size:9px"')
})

// ───────── 接进插件：答完一轮开始倒计时 ─────────

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
  usage: { model: 'claude-opus-5-5', input_tokens: 50, output_tokens: 40, cache_read_input_tokens: 900, cache_creation_input_tokens: 50 },
}
const measure = {
  context: { window: 200000, tokens: 40000, percent: 20 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 30, resetsAt: new Date(Date.now() + 50 * 60000).toISOString() },
    { kind: 'seven_day', percentUsed: 40, resetsAt: new Date(Date.now() + 3 * 86400000).toISOString() },
  ],
  changed: ['context', 'rateLimits'] as ('context' | 'rateLimits')[],
}

type Harness = Parameters<Parameters<typeof test>[1]>
const NOW = new Date(2026, 9, 10, 14).getTime()
async function setup($: Harness[0], on: Harness[1], withLimits: boolean) {
  mock.store(on, { lastSeenVersion: CHANGELOG[0].version })
  const clock = mock.clock(on, { now: NOW })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.complete', ($, e) => ({ text: '', usage: e.usage }))
  on('ui.toast', () => ({ value: undefined }))
  await $.session.start(START as never)
  if (withLimits) {
    await $.session.measure(measure)
  }

  return clock
}
const bandSource = async ($: Harness[0]) => String((await (await $.ui.mount(BAND)).findAll({ type: 'Svg' }))[0].props?.source)

test('订阅（有额度读数）：答完一轮后按 1 小时倒计时；过 20 分钟重画，从 40 分钟接着倒', { options: { language: 'en' } }, async ($, on) => {
  const clock = await setup($, on, true)
  expect(await bandSource($)).not.toContain('class="tm')
  await $.turn.complete(TURN)
  const fresh = await bandSource($)
  expect(visibleFrom(fresh, '60m')?.[1]).toBe('0.00')
  expect(fresh).toContain('begin="3600.00s" fill="freeze"/>cold<')
  await clock.advance(20 * 60000)
  const later = await bandSource($)
  expect(visibleFrom(later, '40m')?.[1]).toBe('0.00')
  expect(later).toContain('begin="2400.00s" fill="freeze"/>cold<')
})

test('API 密钥（没有额度读数）：只有 5 分钟', { options: { language: 'en' } }, async ($, on) => {
  await setup($, on, false)
  await $.turn.complete(TURN)
  const svg = await bandSource($)
  expect(visibleFrom(svg, '5m')?.[1]).toBe('0.00')
  expect(svg).toContain('begin="300.00s" fill="freeze"/>cold<')
})

test('子代理的回合不重置倒计时（它们的缓存和主对话分开）', { options: { language: 'en' } }, async ($, on) => {
  const clock = await setup($, on, true)
  await $.turn.complete(TURN)
  await clock.advance(30 * 60000)
  await $.turn.complete({ ...TURN, agentId: 'sub-1' })
  expect(visibleFrom(await bandSource($), '30m')?.[1]).toBe('0.00')
})
