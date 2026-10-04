import type { ClientModule } from 'claude-code'

import type { Snap } from '../types'

type Props = { snap: Snap | null }

// 数值缓动：目标一变，从当前显示值滚到新值
const DURATION = 900

type Anim = { from: number; to: number; start: number }
type Box = { anims: Anim[]; paintedAt: number; clock: number }
type State = { box: Box }

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

function shown(a: Anim, now: number): number {
  const t = Math.min(1, (now - a.start) / DURATION)
  return a.from + (a.to - a.from) * easeOut(t)
}

function targets(snap: Snap | null): number[] {
  return [
    snap?.contextPercent ?? 0,
    snap?.contextTokens ?? 0,
    snap?.session?.percent ?? 0,
    snap?.weekly?.percent ?? 0,
  ]
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function resetText(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) {
    return ''
  }
  const at = Date.parse(resetsAt)
  const minutes = Math.max(0, Math.round((at - now) / 60000))
  if (minutes < 60) {
    return `${minutes} 分钟后重置`
  }
  if (minutes < 24 * 60) {
    return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分后重置`
  }
  const d = new Date(at)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')

  return `${WEEKDAYS[d.getDay()]} ${hh}:${mm} 重置`
}

function tokensText(n: number): string {
  if (n >= 1e6) {
    return `${(n / 1e6).toFixed(2)}M`
  }

  return n >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`
}

function barColor(percent: number): string {
  if (percent >= 95) {
    return '#E5484D'
  }

  return percent >= 80 ? '#E8913A' : '#3B7BF0'
}

const Stats: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  let box = surface.state?.box

  if (!box) {
    const fresh: Box = { anims: targets(null).map(() => ({ from: 0, to: 0, start: 0 })), paintedAt: 0, clock: 0 }
    box = fresh
    // 动画时间走帧时钟；只在缓动中按帧重绘，平时每 30 秒刷新一次倒计时
    surface.every(16, () => {
      fresh.clock += 16
      const t = fresh.clock
      const isMoving = fresh.anims.some(a => t - a.start < DURATION + 32)
      if (isMoving || t - fresh.paintedAt > 30000) {
        fresh.paintedAt = t
        surface.setState({ box: fresh })
      }
    })
    surface.setState({ box: fresh })
  }

  const now = box.clock

  targets(props.snap).forEach((to, i) => {
    const a = box.anims[i]
    if (a.to !== to) {
      box.anims[i] = { from: shown(a, now), to, start: now }
    }
  })

  const [ctxPct, ctxTok, sessPct, weekPct] = box.anims.map(a => shown(a, now))
  const isMoving = box.anims.map(a => now - a.start < DURATION)
  const snap = props.snap

  const meter = (
    key: string,
    label: string,
    percent: number,
    hasValue: boolean,
    moving: boolean,
    note: string,
  ) => (
    <Box key={key} flexDirection="column" flexGrow={1} flexShrink={1} minWidth={18}>
      <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
        <Text wrap="truncate">{label}</Text>
        <Box flexDirection="row" columnGap={1}>
          <Text dimColor wrap="truncate">{note}</Text>
          <Text bold={moving} color={moving ? barColor(percent) : undefined}>
            {hasValue ? `${Math.round(percent)}%` : '—'}
          </Text>
        </Box>
      </Box>
      <Box width="100%" height={1} backgroundColor="#80808033">
        <Box width={`${Math.round(Math.min(100, Math.max(0, percent)))}%`} height={1} backgroundColor={barColor(percent)} />
      </Box>
    </Box>
  )

  return (
    <Box flexDirection="row" columnGap={3}>
      {meter(
        'ctx',
        '上下文',
        ctxPct,
        snap?.contextPercent !== undefined,
        isMoving[0],
        snap?.contextTokens !== undefined ? `${tokensText(ctxTok)} / ${tokensText(snap.contextWindow)}` : '',
      )}
      {meter('session', '5 小时额度', sessPct, snap?.session !== undefined, isMoving[2], resetText(snap?.session?.resetsAt, Date.now()))}
      {meter('weekly', '每周额度', weekPct, snap?.weekly !== undefined, isMoving[3], resetText(snap?.weekly?.resetsAt, Date.now()))}
    </Box>
  )
}

export default Stats
