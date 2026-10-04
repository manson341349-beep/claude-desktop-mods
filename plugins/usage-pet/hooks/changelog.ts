// 更新日志：最新的放最前面。每次发布改动，在这里加一条，用户更新后第一次加载会弹出来。
// version 是给人看的版本号（plugin.json 故意不写 version，安装版本按提交号算）。
export type Release = { version: string; notes: string[] }

export const CHANGELOG: Release[] = [
  {
    version: '1.1.0',
    notes: ['新增更新提示：插件更新后，第一次打开会弹出这次改了什么'],
  },
  {
    version: '1.0.0',
    notes: ['四个圆环：上下文、5 小时、每周、缓存命中', '自动折叠成细条，数据刷新时展开 5 秒', '▲▼ 或 /clawd 切换一直展开'],
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
