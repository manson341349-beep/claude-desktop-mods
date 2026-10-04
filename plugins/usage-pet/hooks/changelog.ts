// 更新日志：最新的放最前面。每次发布改动，在这里加一条（中英各一份），用户更新后第一次加载会弹出来。
// version 是给人看的版本号（plugin.json 故意不写 version，安装版本按提交号算）。
import type { Lang } from './i18n'

export type Release = { version: string; notes: Record<Lang, string[]> }

export const CHANGELOG: Release[] = [
  {
    version: '1.5.6',
    notes: {
      zh: ['点「压缩上下文」胶囊也能压缩了（之前只能点 Clawd）：点胶囊或 Clawd 一下，3 秒内再点就压缩'],
      en: ['The Compact pill is clickable too (before only Clawd was): click it or Clawd once, again within 3 s to compact'],
    },
  },
  {
    version: '1.5.5',
    notes: {
      zh: ['修复：上下文到 60% 时信息栏被挤成没有副标题的窄排法；「点 Clawd」提示现在按剩余空间选长短'],
      en: ['Fix: at 60% context the band dropped to its narrow layout; the "Click Clawd" hint now picks a length that fits'],
    },
  },
  {
    version: '1.5.4',
    notes: {
      zh: ['一键压缩改成点 Clawd：上下文到 60% 时 Clawd 身后亮起光晕、上下文那块提示「点 Clawd 压缩」，点 Clawd 两下就压缩'],
      en: ['Compact is now on Clawd: at 60% context he glows and the Context block says "Click Clawd to compact"; click him twice'],
    },
  },
  {
    version: '1.5.3',
    notes: {
      zh: ['修复：展开时点「压缩上下文」胶囊没反应（点击区域中间有缝）'],
      en: ['Fix: clicking the Compact pill in the expanded band did nothing (gaps in the click area)'],
    },
  },
  {
    version: '1.5.2',
    notes: {
      zh: ['修复：窄窗口时点圆环右上角的橙点压缩不了；现在点上下文那一块的任何位置都可以'],
      en: ['Fix: in narrow windows the orange dot on the Context ring could not be clicked; the whole Context block now responds'],
    },
  },
  {
    version: '1.5.1',
    notes: {
      zh: ['压缩按钮挪进上下文那一块：副标题换成橙色「压缩上下文」，点这一块两下就压缩；收起时是上下文百分比旁的橙色 ↓'],
      en: ['Compact moved into the Context block: an orange "Compact" pill replaces its subtitle; click the block twice to compact. Collapsed, it is an orange ↓ beside the context %'],
    },
  },
  {
    version: '1.5.0',
    notes: {
      zh: ['一键压缩上下文：上下文到 60% 时 ▼ 旁边出现「压缩」，点两下就压缩（和 /compact 一样），Claude 干活时不显示'],
      en: ['One-click compact: at 60% context a Compact button appears next to ▼; click it twice to compact (same as /compact). Hidden while Claude works'],
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
