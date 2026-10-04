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
    // 写入量在悬停提示（cacheTitle）里，这里只放本轮命中，免得这一块被撑宽
    cacheTurn: (rate: string) => `本轮 ${rate}`,
    cacheTitle: (rate: number, read: string, write: string, fresh: string) =>
      `缓存命中 ${rate}%（本会话）· 读取 ${read} · 写入 ${write} · 未走缓存 ${fresh} tokens`,
    working: 'Claude 正在干活',
    resting: 'Claude 在休息',
    whatsNew: (v: string) => `🦀 Clawd 信息栏 ${v}：`,
    pinned: 'Clawd 信息栏：一直展开',
    autoCollapse: 'Clawd 信息栏：自动收起（数据刷新时展开 5 秒）',
    // 养成
    gear: { sprout: '头顶小芽', bowtie: '红领结', cap: '棒球帽', crown: '小皇冠' },
    achievement: {
      'cache-99': ['缓存大师', '单轮缓存命中 99%'],
      'streak-3': ['三天打鱼', '连续 3 天写代码'],
      'streak-7': ['一周不停', '连续 7 天写代码'],
      'streak-30': ['月度全勤', '连续 30 天写代码'],
      'turns-100': ['百轮老友', '累计 100 轮'],
      'turns-1000': ['千轮战友', '累计 1000 轮'],
      'night-owl': ['夜猫子', '凌晨 0–5 点还在写代码'],
      'close-call': ['极限操作', '额度 95% 了还在冲'],
    },
    levelUp: (level: number, gear?: string) => `⬆️ Clawd 升到 Lv.${level}！${gear ? `解锁：${gear}` : ''}`,
    unlocked: (name: string, how: string) => `🏅 成就解锁：${name}（${how}）`,
    petTitle: (level: number, xp: number, next: number, streak: number) => `Clawd Lv.${level} · 经验 ${xp} / ${next} · 连续 ${streak} 天`,
    // 战报卡
    card: {
      title: 'Clawd 战报',
      duration: '时长',
      turns: '回合',
      tools: '工具调用',
      files: '改动文件',
      tokens: 'Tokens',
      cache: '缓存命中',
      streak: (n: number) => `连续 ${n} 天`,
      xp: (xp: number, next: number) => `经验 ${xp} / ${next}`,
      earned: '本次解锁',
      none: '暂无',
      hm: (h: number, m: number) => (h > 0 ? `${h} 小时 ${m} 分` : `${m} 分钟`),
    },
    cardCommand: 'Clawd 战报：生成本次会话的战报卡，复制到剪贴板并存到桌面',
    cardSaved: (path: string) => `Clawd 战报已复制到剪贴板（可以直接粘贴到 X），也存到了：${path}`,
    cardOnlyShown: (why: string) => `Clawd 战报已在面板里打开，但没能导出图片：${why}`,
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
    cacheTurn: (rate: string) => `This turn ${rate}`,
    cacheTitle: (rate: number, read: string, write: string, fresh: string) =>
      `Cache hit ${rate}% (this session) · read ${read} · wrote ${write} · uncached ${fresh} tokens`,
    working: 'Claude is working',
    resting: 'Claude is resting',
    whatsNew: (v: string) => `🦀 Clawd band ${v}: `,
    pinned: 'Clawd band: always expanded',
    autoCollapse: 'Clawd band: auto-collapse (expands for 5 s when usage refreshes)',
    gear: { sprout: 'a sprout', bowtie: 'a red bow tie', cap: 'a baseball cap', crown: 'a tiny crown' },
    achievement: {
      'cache-99': ['Cache master', '99% cache hit in one turn'],
      'streak-3': ['Warming up', '3 days in a row'],
      'streak-7': ['Full week', '7 days in a row'],
      'streak-30': ['Perfect month', '30 days in a row'],
      'turns-100': ['Old friends', '100 turns together'],
      'turns-1000': ['Comrades', '1,000 turns together'],
      'night-owl': ['Night owl', 'Coding between midnight and 5 am'],
      'close-call': ['Close call', 'Still going at 95% of a limit'],
    },
    levelUp: (level: number, gear?: string) => `⬆️ Clawd reached Lv.${level}!${gear ? ` Unlocked: ${gear}` : ''}`,
    unlocked: (name: string, how: string) => `🏅 Achievement unlocked: ${name} (${how})`,
    petTitle: (level: number, xp: number, next: number, streak: number) => `Clawd Lv.${level} · XP ${xp} / ${next} · ${streak}-day streak`,
    card: {
      title: 'Clawd session report',
      duration: 'Duration',
      turns: 'Turns',
      tools: 'Tool calls',
      files: 'Files edited',
      tokens: 'Tokens',
      cache: 'Cache hit',
      streak: (n: number) => `${n}-day streak`,
      xp: (xp: number, next: number) => `XP ${xp} / ${next}`,
      earned: 'Unlocked',
      none: 'None yet',
      hm: (h: number, m: number) => (h > 0 ? `${h} h ${m} m` : `${m} min`),
    },
    cardCommand: 'Clawd report: a card of this session, copied to the clipboard and saved to the Desktop',
    cardSaved: (path: string) => `Clawd report copied to the clipboard (paste it straight into X) and saved to ${path}`,
    cardOnlyShown: (why: string) => `Clawd report opened in a pane, but the image could not be exported: ${why}`,
  },
}

export const weekday = (lang: Lang, day: number) => WEEKDAYS[lang][day]
