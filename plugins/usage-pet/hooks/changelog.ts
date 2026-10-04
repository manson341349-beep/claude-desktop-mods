// 更新日志：最新的放最前面。每次发布改动，在这里加一条（中英各一份），用户更新后第一次加载会弹出来。
// version 是给人看的版本号（plugin.json 故意不写 version，安装版本按提交号算）。
import type { Lang } from './i18n'

export type Release = { version: string; notes: Record<Lang, string[]> }

export const CHANGELOG: Release[] = [
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
