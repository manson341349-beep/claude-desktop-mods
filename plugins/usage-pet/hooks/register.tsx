import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Bars, CacheStat, CacheTotals, Snap } from '../types'
import { bandAlt, bandSvg, H, H_MINI } from './band'
import { CHANGELOG, unseenReleases } from './changelog'

const barsAtom = atom({ plugin: 'usage-pet', key: 'bars' } as const, { from: null, to: null } as Bars)

const cacheAtom = atom({ plugin: 'usage-pet', key: 'cache' } as const, { read: 0, write: 0, fresh: 0 } as CacheTotals)

// 展开 / 收起：数据刷新时自动展开 EXPAND_MS 后收起；pinned = 用户点了「展开」或 /clawd，一直展开
const expandedAtom = atom({ plugin: 'usage-pet', key: 'expanded' } as const, true)
const pinnedAtom = atom({ plugin: 'usage-pet', key: 'pinned' } as const, false)
const EXPAND_MS = 5000
// 只让最后一次展开的定时器生效，免得早先的定时器提前收起
let expandToken = 0
// 展开 / 收起按钮占的宽度（像素），SVG 让出这一截
const BUTTON_W = 44
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
const WHATS_NEW_MS = 15000

async function showWhatsNew($: EngineInterface) {
  const latest = CHANGELOG[0].version
  const lastSeen = await $.store.get(SEEN_KEY)
  if (lastSeen === latest) {
    return
  }
  // 旧的先弹、新的后弹，最新的那条落在最上面
  for (const release of unseenReleases(lastSeen).reverse()) {
    $.ui.toast(`🦀 Clawd 信息栏 ${release.version}：${release.notes.join(' · ')}`, { timeoutMs: WHATS_NEW_MS })
  }
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // 更新提示放最前：后面注册命令、读用量出错（整个 hook 会被跳过）也不会吞掉它；
    // 它自己出错只记调试日志，不拦后面的步骤
    try {
      await showWhatsNew($)
    } catch (err) {
      $.ui.log(`usage-pet: 更新提示失败：${String(err)}`, { to: 'debug' })
    }
    await $.command.register({
      name: 'clawd',
      description: 'Clawd 信息栏：在「一直展开」和「自动收起」之间切换',
      immediate: true,
    })
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

    return next(e)
  })

  on('command.run', { command: 'clawd' }, async $ => {
    const pinned = !(await read($, pinnedAtom))
    await update($, pinnedAtom, () => pinned)
    await update($, expandedAtom, () => pinned)

    return { text: pinned ? 'Clawd 信息栏：一直展开' : 'Clawd 信息栏：自动收起（数据刷新时展开 5 秒）' }
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

    // 桌面端的 Client 在 2.1.286 上一律 10 秒超时（缺 CSP nonce，同见 #99211），所以桌面只用 Svg
    if (e.surface === 'desktop') {
      const { Box, Button, Svg } = $.ui.resolve(e)
      const width = Math.max(560, e.props.bodyColumns * PX_PER_COLUMN - 8 - BUTTON_W)
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
        <Box flexDirection="row" alignItems="center">
          <Svg
            source={bandSvg(bars, e.props.isWorking, width, isMini)}
            alt={bandAlt(bars.to, e.props.isWorking)}
            width={width}
            height={isMini ? H_MINI : H}
            isInteractive
          />
          <Button key="toggle" label={isMini ? ICON_EXPAND : ICON_COLLAPSE} plain onPress={() => void toggle()} />
        </Box>
      )
    }

    if (e.surface === 'terminal') {
      const { Box, Client } = $.ui.resolve(e)

      return (
        <Box paddingX={1}>
          <Client key="stats" module="./stats.tsx" props={{ snap: bars.to }} flexGrow={1} />
        </Box>
      )
    }

    return next(e)
  })
}
