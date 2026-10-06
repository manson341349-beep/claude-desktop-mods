export type Window = { percent: number; resetsAt?: string }

// 缓存命中：读取 ÷（读取 + 写入 + 未走缓存的输入），整个会话累计
export type CacheStat = { rate: number; read: number; write: number; fresh: number; turnRate?: number }

export type Snap = {
  contextPercent?: number
  contextTokens?: number
  contextWindow: number
  session?: Window
  weekly?: Window
  cache?: CacheStat
}

// 上一次和这一次的读数：SVG 从 from 动画到 to
export type Bars = { from: Snap | null; to: Snap | null }

// 会话累计的缓存 token（主循环，不含子代理）
export type CacheTotals = { read: number; write: number; fresh: number; turnRate?: number }

// Clawd 养成（跨会话存在 $.store 的 pet 键里；会话里留一份给信息栏画）
export type Pet = { xp: number; turns: number; streak: number; lastDay?: string; achievements: string[] }

// 本会话战报：开始时间、回合、工具调用、改过的文件、输出 token、新解锁的成就
export type Report = { startedAt: number; turns: number; toolCalls: number; files: string[]; output: number; earned: string[] }

declare module 'claude-code' {
  interface PluginState {
    'usage-pet': { bars: Bars; cache: CacheTotals; expanded: boolean; pinned: boolean; lang: 'zh' | 'en'; pet: Pet; report: Report; ask: number }
  }
}
