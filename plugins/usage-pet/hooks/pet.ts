// Clawd 养成：经验、等级、连续天数、成就。纯函数，存取在 register.tsx（$.store，跨会话）。
// 经验：主循环每答完一轮 +10；这一轮缓存命中 ≥90% 再 +5；每天第一轮 +20。
// 升级门槛 50·L·(L−1)：Lv2 100、Lv3 300、Lv5 1000、Lv10 4500（一天几十轮，大约一个多月满 10 级）。

import type { Pet } from '../types'

export type { Pet }

export const NEW_PET: Pet = { xp: 0, turns: 0, streak: 0, achievements: [] }

export type Head = 'sprout' | 'cap' | 'crown'
export type Gear = Head | 'bowtie'

// 解锁表：头上的东西后来的换掉先来的，领结一直戴着
export const UNLOCKS: { level: number; gear: Gear }[] = [
  { level: 2, gear: 'sprout' },
  { level: 3, gear: 'bowtie' },
  { level: 5, gear: 'cap' },
  { level: 10, gear: 'crown' },
]

export const ACHIEVEMENTS = ['cache-99', 'streak-3', 'streak-7', 'streak-30', 'turns-100', 'turns-1000', 'night-owl', 'close-call'] as const
export type Achievement = (typeof ACHIEVEMENTS)[number]

export type PetEvent = { kind: 'level'; level: number; gear?: Gear } | { kind: 'achievement'; id: Achievement }

export const XP_TURN = 10
export const XP_CACHE_BONUS = 5
export const XP_DAILY = 20

export const threshold = (level: number) => 50 * level * (level - 1)

// 万圣节装扮：10 月 25 日到 11 月 1 日（本机日期）
export function isHalloween(at: Date): boolean {
  return (at.getMonth() === 9 && at.getDate() >= 25) || (at.getMonth() === 10 && at.getDate() === 1)
}

export function levelOf(xp: number): number {
  let level = 1
  while (xp >= threshold(level + 1)) {
    level++
  }

  return level
}

export function gearOf(level: number): { head?: Head; bowtie: boolean } {
  const head = level >= 10 ? 'crown' : level >= 5 ? 'cap' : level >= 2 ? 'sprout' : undefined

  return { head, bowtie: level >= 3 }
}

// 本地日期 YYYY-MM-DD（插件环境的 Date 用的是本机时区，重置时间也是这么显示的）
export function dayKey(at: Date): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}

export type TurnFacts = {
  now: Date
  // 这一轮的缓存命中（%）；没有用量时为 undefined
  turnRate?: number
  // 5 小时 / 每周额度里较高的那个（%）
  maxLimit: number
}

// 从 store 里读出来的东西可能缺字段（旧版本、手改过）：补齐成一只完整的 Pet
export function normalize(raw: unknown): Pet {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<Pet>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)

  return {
    xp: num(p.xp),
    turns: num(p.turns),
    streak: num(p.streak),
    lastDay: typeof p.lastDay === 'string' ? p.lastDay : undefined,
    achievements: Array.isArray(p.achievements) ? p.achievements.filter((a): a is string => typeof a === 'string') : [],
  }
}

export function onTurn(before: Pet, facts: TurnFacts): { pet: Pet; events: PetEvent[] } {
  const today = dayKey(facts.now)
  const yesterday = dayKey(new Date(facts.now.getFullYear(), facts.now.getMonth(), facts.now.getDate() - 1))
  const isNewDay = before.lastDay !== today
  const streak = !isNewDay ? Math.max(1, before.streak) : before.lastDay === yesterday ? before.streak + 1 : 1
  const gain = XP_TURN + ((facts.turnRate ?? 0) >= 90 ? XP_CACHE_BONUS : 0) + (isNewDay ? XP_DAILY : 0)
  const pet: Pet = { ...before, xp: before.xp + gain, turns: before.turns + 1, streak, lastDay: today, achievements: [...before.achievements] }
  const events: PetEvent[] = []

  const was = levelOf(before.xp)
  const now = levelOf(pet.xp)
  for (let level = was + 1; level <= now; level++) {
    events.push({ kind: 'level', level, gear: UNLOCKS.find(u => u.level === level)?.gear })
  }

  const hour = facts.now.getHours()
  const earned: [Achievement, boolean][] = [
    ['cache-99', (facts.turnRate ?? 0) >= 99],
    ['streak-3', streak >= 3],
    ['streak-7', streak >= 7],
    ['streak-30', streak >= 30],
    ['turns-100', pet.turns >= 100],
    ['turns-1000', pet.turns >= 1000],
    ['night-owl', hour < 5],
    ['close-call', facts.maxLimit >= 95],
  ]
  for (const [id, isEarned] of earned) {
    if (isEarned && !pet.achievements.includes(id)) {
      pet.achievements.push(id)
      events.push({ kind: 'achievement', id })
    }
  }

  return { pet, events }
}
