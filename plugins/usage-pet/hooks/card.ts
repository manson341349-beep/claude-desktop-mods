// Clawd 战报卡：一张 640×360（16:9）的 SVG，面板里直接画，也导出成 PNG 发 X。
// 固定深色：它是一张「图片」，不是界面的一部分，浅色外观下也是同一张卡。
import { clawdBody, tokensText } from './band'
import { type Lang, T } from './i18n'
import { type Achievement, levelOf, type Pet, threshold } from './pet'

export const CARD_W = 640
export const CARD_H = 360
export const REPO = 'github.com/manson341349-beep/claude-desktop-mods'

export type CardData = {
  startedAt: number
  now: number
  turns: number
  toolCalls: number
  files: number
  tokens: number
  cacheRate?: number
  pet: Pet
  // 这个会话里新解锁的成就
  earned: Achievement[]
}

const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const pad = (n: number) => String(n).padStart(2, '0')

function stamp(at: number): string {
  const d = new Date(at)

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const STYLE =
  `text{font-family:-apple-system,"SF Pro Text","PingFang SC","Segoe UI","Microsoft YaHei UI","Microsoft YaHei",sans-serif}` +
  `.v{font-size:26px;font-weight:700;fill:#F4F2EC;font-variant-numeric:tabular-nums}` +
  `.l{font-size:12px;fill:#8C8A84}.u{font-size:16px;font-weight:600;fill:#B5B2AA}` +
  `.h{font-size:20px;font-weight:700;fill:#F4F2EC}` +
  `.d{font-size:12px;fill:#8C8A84;font-variant-numeric:tabular-nums}` +
  `.lv{font-size:24px;font-weight:800;fill:#F4F2EC}` +
  `.s{font-size:11.5px;fill:#B5B2AA;font-variant-numeric:tabular-nums}` +
  `.chip{font-size:11.5px;font-weight:600;fill:#F3B18F}` +
  `.f{font-size:10.5px;fill:#6E6C66}` +
  // 卡上的 Clawd 是静止的：笑脸、腮红不画；命中高就戴墨镜
  `.happy,.cheek,.shades{opacity:0}.chill .shades{opacity:1}.chill .eyes{opacity:0}`

// canvas：pane = 面板里画的 640×360；
// square = macOS 导出用：qlmanage 只出正方形缩略图（多余处补白），所以把卡放在正方形画布正中，四周铺同色，导出后再从正中裁出 16:9；
// wide = Windows 导出用：浏览器按窗口大小截图，直接给 1200×675 的画布
export type CardCanvas = 'pane' | 'square' | 'wide'

export function cardSvg(data: CardData, lang: Lang, canvas: CardCanvas = 'pane'): string {
  const t = T[lang].card
  const level = levelOf(data.pet.xp)
  const from = threshold(level)
  const next = threshold(level + 1)
  const progress = Math.min(1, Math.max(0, (data.pet.xp - from) / (next - from)))
  const minutes = Math.max(0, Math.round((data.now - data.startedAt) / 60000))
  const isChill = (data.cacheRate ?? 0) >= 90

  // 时长写成「2h 14m」，单位用小一号的字：中文「2 小时 14 分」放大字号会挤进隔壁一格
  const h = Math.floor(minutes / 60)
  const duration = h > 0 ? `${h}<tspan class="u">h</tspan> ${minutes % 60}<tspan class="u">m</tspan>` : `${minutes}<tspan class="u">m</tspan>`
  const stats: [string, string][] = [
    [duration, t.duration],
    [String(data.turns), t.turns],
    [String(data.toolCalls), t.tools],
    [String(data.files), t.files],
    [tokensText(data.tokens), t.tokens],
    [data.cacheRate === undefined ? '—' : `${Math.round(data.cacheRate)}%`, t.cache],
  ]
  const grid = stats
    .map(([value, label], i) => {
      const x = 268 + (i % 3) * 120
      const y = 128 + Math.floor(i / 3) * 78

      return `<text x="${x}" y="${y}" class="v">${i === 0 ? value : esc(value)}</text><text x="${x}" y="${y + 20}" class="l">${esc(label)}</text>`
    })
    .join('')

  const names = data.earned.map(id => T[lang].achievement[id][0])
  const earned = names.length > 0 ? names.map(esc).join('  ·  ') : t.none

  const card =
    `<rect width="${CARD_W}" height="${CARD_H}" rx="${canvas === 'pane' ? 20 : 0}" fill="#1C1B1A"/>` +
    `<rect x="24" y="24" width="208" height="312" rx="16" fill="#262624"/>` +
    // Clawd：一格 10px，头顶留 3 格给装扮
    `<ellipse cx="128" cy="196" rx="62" ry="5" fill="#000" opacity=".35"/>` +
    `<g class="clawd${isChill ? ' chill' : ''}" transform="translate(48 100) scale(10)">${clawdBody(false, level)}</g>` +
    `<text x="44" y="252" class="lv">Lv.${level}</text>` +
    `<rect x="44" y="266" width="168" height="6" rx="3" fill="#3A3936"/>` +
    `<rect x="44" y="266" width="${Math.max(6, 168 * progress).toFixed(1)}" height="6" rx="3" fill="#D97757"/>` +
    `<text x="44" y="292" class="s">${esc(t.xp(data.pet.xp, next))}</text>` +
    `<text x="44" y="312" class="s">${esc(t.streak(data.pet.streak))}</text>` +
    `<text x="268" y="56" class="h">${esc(t.title)}</text>` +
    `<text x="268" y="76" class="d">${stamp(data.now)}</text>` +
    grid +
    `<text x="268" y="292" class="l">${esc(t.earned)}</text>` +
    `<text x="268" y="312" class="chip">${earned}</text>` +
    `<text x="616" y="336" text-anchor="end" class="f">usage-pet · ${REPO}</text>`

  if (canvas === 'square') {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 ${CARD_W} ${CARD_W}">` +
      `<style>${STYLE}</style><rect width="${CARD_W}" height="${CARD_W}" fill="#1C1B1A"/>` +
      `<g transform="translate(0 ${(CARD_W - CARD_H) / 2})">${card}</g></svg>`
    )
  }

  // wide 是直角（上面 rx = 0）：圆角留下的四个角会被截成白色
  const [width, height] = canvas === 'wide' ? [1200, 675] : [CARD_W, CARD_H]

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}" width="${width}" height="${height}"><style>${STYLE}</style>${card}</svg>`
}

export function cardAlt(data: CardData, lang: Lang): string {
  const t = T[lang].card
  const minutes = Math.max(0, Math.round((data.now - data.startedAt) / 60000))

  return [
    `${t.title} · Lv.${levelOf(data.pet.xp)}`,
    `${t.duration} ${t.hm(Math.floor(minutes / 60), minutes % 60)}`,
    `${t.turns} ${data.turns}`,
    `${t.tools} ${data.toolCalls}`,
    `${t.files} ${data.files}`,
    `${t.tokens} ${tokensText(data.tokens)}`,
    `${t.cache} ${data.cacheRate === undefined ? '—' : `${Math.round(data.cacheRate)}%`}`,
  ].join(' · ')
}
