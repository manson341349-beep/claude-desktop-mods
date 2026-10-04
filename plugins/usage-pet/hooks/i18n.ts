// 界面语言：/config 里选 auto（默认，跟随系统）/ zh / en
export type Lang = 'zh' | 'en'
export type LangChoice = 'auto' | Lang

// 一组语言标签（如 en-MY、zh-Hans-MY、zh_CN.UTF-8）→ 第一个就是用户首选
export function langFromTags(tags: string[]): Lang | undefined {
  const first = tags.map(t => t.trim()).find(t => t !== '' && t !== 'C' && t !== 'POSIX')
  if (!first) {
    return undefined
  }

  return first.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

// macOS `defaults read -g AppleLanguages` 的输出：( "en-MY", "zh-Hans-MY" )
export function parseAppleLanguages(stdout: string): string[] {
  return [...stdout.matchAll(/"([^"]+)"|\b([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*)\b/g)].map(m => m[1] ?? m[2])
}

const WEEKDAYS = {
  zh: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}

export const T = {
  zh: {
    context: '上下文',
    session: '5 小时额度',
    weekly: '每周额度',
    cache: '缓存命中',
    waitingReply: '等待第一次回复',
    noData: '暂无读数',
    reset: (time: string) => `${time} 重置`,
    resetDay: (day: string, time: string) => `${day} ${time} 重置`,
    left: (n: number, unit: 'm' | 'hm' | 'dh', n2 = 0) =>
      unit === 'm' ? `还剩 ${n} 分钟` : unit === 'hm' ? `还剩 ${n} 小时 ${n2} 分` : `还剩 ${n} 天 ${n2} 小时`,
    tokens: (n: string) => `${n} tokens`,
    cacheRead: (n: string) => `读取 ${n}`,
    cacheTurn: (rate: string, written: string) => `本轮 ${rate} · 写入 ${written}`,
    cacheTitle: (rate: number, read: string, write: string, fresh: string) =>
      `缓存命中 ${rate}%（本会话）· 读取 ${read} · 写入 ${write} · 未走缓存 ${fresh} tokens`,
    working: 'Claude 正在干活',
    resting: 'Claude 在休息',
    whatsNew: (v: string) => `🦀 Clawd 信息栏 ${v}：`,
    pinned: 'Clawd 信息栏：一直展开',
    autoCollapse: 'Clawd 信息栏：自动收起（数据刷新时展开 5 秒）',
  },
  en: {
    context: 'Context',
    session: '5-hour',
    weekly: 'Weekly',
    cache: 'Cache hit',
    waitingReply: 'Waiting for a reply',
    noData: 'No data yet',
    reset: (time: string) => `Resets ${time}`,
    resetDay: (day: string, time: string) => `Resets ${day} ${time}`,
    left: (n: number, unit: 'm' | 'hm' | 'dh', n2 = 0) =>
      unit === 'm' ? `${n} min left` : unit === 'hm' ? `${n} h ${n2} m left` : `${n} d ${n2} h left`,
    tokens: (n: string) => `${n} tokens`,
    cacheRead: (n: string) => `Read ${n}`,
    cacheTurn: (rate: string, written: string) => `This turn ${rate} · wrote ${written}`,
    cacheTitle: (rate: number, read: string, write: string, fresh: string) =>
      `Cache hit ${rate}% (this session) · read ${read} · wrote ${write} · uncached ${fresh} tokens`,
    working: 'Claude is working',
    resting: 'Claude is resting',
    whatsNew: (v: string) => `🦀 Clawd band ${v}: `,
    pinned: 'Clawd band: always expanded',
    autoCollapse: 'Clawd band: auto-collapse (expands for 5 s when usage refreshes)',
  },
}

export const weekday = (lang: Lang, day: number) => WEEKDAYS[lang][day]
