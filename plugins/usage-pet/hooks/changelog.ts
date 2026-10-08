// 更新日志：最新的放最前面。每次发布改动，在这里加一条（中英各一份），用户更新后第一次加载会弹出来。
// version 是给人看的版本号（plugin.json 故意不写 version，安装版本按提交号算）。
import type { Lang } from './i18n'

export type Release = { version: string; notes: Record<Lang, string[]> }

export const CHANGELOG: Release[] = [
  {
    version: '1.8.0',
    notes: {
      zh: ['缓存倒计时：缓存命中旁边显示缓存还热多久（订阅约 1 小时、API 密钥 5 分钟，每次回复重新计时），剩 5 分钟变色，过期显示「已过期」——赶在过期前回复更省额度'],
      en: ['Cache countdown next to Cache hit: how long the cache stays warm (about 1 hour on a subscription, 5 minutes on an API key; every reply restarts it). It turns amber in the last 5 minutes and says "cold" once expired, so you can reply before it does'],
    },
  },
  {
    version: '1.7.0',
    notes: {
      zh: [
        '🎃 万圣节（10 月 25 日到 11 月 1 日）：Clawd 戴巫师帽、拎南瓜桶；Claude 干活时变幽灵，飘的是糖果',
        '每答完一轮 Clawd 会讨糖：点他一下给糖，连点三下跳起来；12 秒不理他会生气（/config 里 seasonal 选 off 可关）',
      ],
      en: [
        '🎃 Halloween (Oct 25 to Nov 1): Clawd wears a witch hat and carries a pumpkin pail; while Claude works he turns into a ghost and candy floats up',
        'After each turn Clawd asks for candy: click him to give some, click three times and he jumps for joy; ignore him for 12 seconds and he gets grumpy (turn off with seasonal = off in /config)',
      ],
    },
  },
  {
    version: '1.6.0',
    notes: {
      zh: [
        '支持 Windows：跟随 Windows 显示语言；/clawd-card 用系统自带的 Edge（没有就用 Chrome）导出图片，复制到剪贴板、存到「图片\\Clawd Reports」，旧的移进回收站；文字用 Segoe UI / 微软雅黑',
      ],
      en: [
        'Windows support: follows the Windows display language; /clawd-card exports the image with Edge (or Chrome), copies it to the clipboard and saves it to Pictures\\Clawd Reports, older cards go to the Recycle Bin; text uses Segoe UI / Microsoft YaHei',
      ],
    },
  },
  {
    version: '1.5.7',
    notes: {
      zh: ['移除「一键压缩」：桌面 App 里插件暂时不能触发压缩（官方接口限制），压缩请直接输入 /compact'],
      en: ['Removed one-click compact: plugins cannot trigger compaction in the desktop app yet (an engine limit). Use /compact'],
    },
  },
  {
    version: '1.4.6',
    notes: {
      zh: ['战报卡改存到「图片/Clawd Reports」，不再堆在桌面；只留最近 20 张，更早的自动移进废纸篓'],
      en: ['Report cards now go to Pictures/Clawd Reports instead of the Desktop; the latest 20 are kept and older ones move to the Trash'],
    },
  },
  {
    version: '1.4.5',
    notes: {
      zh: ['窗口变窄时信息栏跟着收：先去掉副标题，再把标题缩小放到圆环下面，最窄只留圆环；▼ 按钮始终在右边，不再掉到下一行'],
      en: ['Narrow windows: the band now adapts (drops subtitles, then tucks labels under the rings, then rings only) and the ▼ button stays on the right instead of wrapping'],
    },
  },
  {
    version: '1.4.4',
    notes: {
      zh: ['修复：鼠标放到圆环上换出的详情文字会压到分隔线、或被右边裁掉'],
      en: ['Fix: the details shown when hovering a meter could run into the divider or get cut off on the right'],
    },
  },
  {
    version: '1.4.3',
    notes: {
      zh: ['更新内容、升级、成就的提示停留时间加长到 1 分钟（App 允许的上限），鼠标放上去会停住，点一下就关'],
      en: ['Release notes, level-ups and achievements now stay for a full minute (the most the app allows); hover to hold, click to close'],
    },
  },
  {
    version: '1.4.1',
    notes: {
      zh: ['修复：重启 App 后更新提示可能一闪而过没人看到，现在等窗口连上再弹'],
      en: ["Fix: after restarting the app, the what's-new toast could fire before the window was there; it now waits for the window"],
    },
  },
  {
    version: '1.4.0',
    notes: {
      zh: ['Clawd 会成长了：每轮攒经验升级，解锁小芽、领结、棒球帽、皇冠，还有 8 个成就', '新命令 /clawd-card：生成本次会话的战报卡，复制到剪贴板、存到桌面，直接贴到 X'],
      en: ['Clawd grows: earn XP every turn, level up to unlock a sprout, a bow tie, a cap and a crown, plus 8 achievements', 'New /clawd-card: a report card of this session, copied to the clipboard and saved to the Desktop, ready to paste into X'],
    },
  },
  {
    version: '1.3.0',
    notes: {
      zh: ['支持浅色界面：跟着 Claude App 的外观设置走（浅色 / 深色 / 跟随系统），不用另外设置'],
      en: ['Light mode: follows the Claude app appearance (light, dark or match system), nothing to configure'],
    },
  },
  {
    version: '1.2.1',
    notes: {
      zh: ['墨镜不再全程戴着：时不时推到额头上眨眨眼；Claude 干活时把墨镜推到头顶专心敲代码'],
      en: ['Sunglasses come off now and then: Clawd pushes them up to blink, and wears them on his head while Claude works'],
    },
  },
  {
    version: '1.2.0',
    notes: {
      zh: ['新增英文界面：默认跟随系统语言，/config 里可以手动切换', '缓存命中 ≥90% 时 Clawd 戴上墨镜放松（点子来自 @Joshua_WD）'],
      en: ['English UI: follows your system language, switch it in /config', 'Chill mode: cache hit ≥ 90% and Clawd puts on sunglasses (idea by @Joshua_WD)'],
    },
  },
  {
    version: '1.1.0',
    notes: {
      zh: ['新增更新提示：插件更新后，第一次打开会弹出这次改了什么'],
      en: ["What's new: after an update, the first load shows what changed"],
    },
  },
  {
    version: '1.0.0',
    notes: {
      zh: ['四个圆环：上下文、5 小时、每周、缓存命中', '自动折叠成细条，数据刷新时展开 5 秒', '▲▼ 或 /clawd 切换一直展开'],
      en: ['Four meters: context, 5-hour, weekly, cache hit', 'Collapses to a slim strip, expands for 5 s on refresh', '▲▼ or /clawd keeps it expanded'],
    },
  },
]

// 还没给用户看过的版本：从最新一直数到上次看过的那一版（不含）。
// 从没看过（新装）时只介绍最新一版，免得一次弹出全部历史。
export function unseenReleases(lastSeen: unknown): Release[] {
  const seenAt = CHANGELOG.findIndex(r => r.version === lastSeen)
  if (seenAt === -1) {
    return CHANGELOG.slice(0, 1)
  }

  return CHANGELOG.slice(0, seenAt)
}
