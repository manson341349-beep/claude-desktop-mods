import type { Bars, Snap } from '../types'
import { type Lang, T, weekday } from './i18n'
import { gearOf } from './pet'

// 桌面端整条（Clawd + 三个圆环）画成一张 SVG。动画全部是 SVG 内的 CSS 动画，浏览器在合成线程上按刷新率播放。
// 桌面端任何状态变化都会重画整条、动画从头播（anthropics/claude-code#99211），
// 所以「一次性」动画（圆环扫过、数字滚动、+N% 提示、Clawd 跳一下）只在 from ≠ to 时才写进去。

export const H = 64
// 收起后的细条高度
export const H_MINI = 30

const U = 4 // Clawd 的一个像素 = 4px
const CLAWD_X = 22 // 左右留白都是这么宽
const CLAWD_W = 16 * 4 // Clawd 16 格宽，一格 4px
const MINI_U = 2
const MINI_X = 14
const MINI_Y = 5
const MINI_W = 16 * MINI_U
const MINI_BAR = 40
const CLAWD_Y = 16
const R = 15
const C = 2 * Math.PI * R
const DIG = 6.2
const LINE = 14
const OUT = 'cubic-bezier(.23,1,.32,1)'
const SPRING = 'cubic-bezier(.34,1.56,.64,1)'
// 背景透明。小窗口的配色方案和 App 不一致时，浏览器会给它垫一块不透明的底，
// 所以声明 color-scheme: light dark：小窗口跟着 App 的外观走（浅色 / 深色 / 跟随系统），
// 两边永远一致；浅色配色在 STYLE 末尾的 prefers-color-scheme:light 里。
// 不铺底色：此前用填色 #232323 去抵消 App 的色彩转换，但转换结果随显示器变，换屏就对不上。

type Tier = 'ok' | 'warn' | 'danger'

// 信息栏上 Clawd 的养成状态：等级决定装扮，title 是鼠标悬停的提示
export type PetView = { level: number; title: string }

const tier = (p: number): Tier => (p >= 95 ? 'danger' : p >= 80 ? 'warn' : 'ok')

export function tokensText(n: number): string {
  if (n >= 1e6) {
    return `${+(n / 1e6).toFixed(2)}M`
  }

  return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`
}

const grouped = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

function resetText(resetsAt: string | undefined, lang: Lang): string {
  if (!resetsAt) {
    return ''
  }
  const at = new Date(resetsAt)
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`

  return at.getTime() - Date.now() < 24 * 3600000 ? T[lang].reset(time) : T[lang].resetDay(weekday(lang, at.getDay()), time)
}

function leftText(resetsAt: string | undefined, lang: Lang): string {
  if (!resetsAt) {
    return ''
  }
  const min = Math.max(0, Math.round((Date.parse(resetsAt) - Date.now()) / 60000))
  if (min < 60) {
    return T[lang].left(min, 'm')
  }
  if (min < 1440) {
    return T[lang].left(Math.floor(min / 60), 'hm', min % 60)
  }

  return T[lang].left(Math.floor(min / 1440), 'dh', Math.floor((min % 1440) / 60))
}

// ───────────────────────── 圆环 ─────────────────────────

// SVG 里量不到文字宽度，按字体规律估（系数按 Chrome 实测 getComputedTextLength 校准，误差 ≤1.5px）：
// 中文 = 字号，数字 0.6，% 接近一个字宽，空格和标点更窄
function textWidth(text: string, size: number): number {
  let w = 0
  for (const ch of text) {
    if (/[\u3000-\u9fff\uff00-\uffef]/.test(ch)) w += size
    else if (ch === '%') w += size
    else if (ch === '—') w += size * 0.9
    else if (ch === ' ') w += size * 0.28
    else if (ch === '/' || ch === '.' || ch === ':') w += size * 0.35
    else if (ch === 'M' || ch === 'W') w += size * 0.85
    else if (/[A-Z]/.test(ch)) w += size * 0.66
    else if (/[0-9]/.test(ch)) w += size * 0.6
    else w += size * 0.58
  }

  return w
}

// 一块内容的实际宽度：圆环（含线宽）+ 间隔 + 标题、副标题、悬停时换上的详情三行里最长的那行
// （只算副标题的话，悬停详情比副标题长就会压到分隔线、或被信息栏右边裁掉）
const contentWidth = (g: Gauge) => 2 * R + 4 + 10 + Math.max(textWidth(g.label, 12), textWidth(g.sub, 10.5), textWidth(g.detail, 10.5))

type Gauge = {
  tier?: Tier
  id: string
  label: string
  sub: string
  detail: string
  title: string
  from?: number
  to?: number
}

const off = (p: number | undefined) => (C * (1 - Math.min(100, Math.max(0, p ?? 0)) / 100)).toFixed(2)

// 数字滚轮：每位一条 0-9 的竖条，裁成一格高，从旧数字滚到新数字（前导空位记作 10）
function odometer(g: Gauge, i: number, cx: number, cy: number, isChanged: boolean, css: string[]): string {
  if (g.to === undefined) {
    return `<text x="${cx}" y="${cy + 3.8}" text-anchor="middle" class="num dim">—</text>`
  }
  const s = String(Math.round(Math.min(999, Math.max(0, g.to))))
  const f = g.from === undefined ? '' : String(Math.round(Math.min(999, Math.max(0, g.from))))
  const fromDigits = f.padStart(s.length, ' ').slice(-s.length)
  // 三位数（100%）放不进圆环：去掉 %，数字间距收紧
  const isWide = s.length >= 3
  const dig = isWide ? 5.6 : DIG
  const width = s.length * dig + (isWide ? 0 : 7)
  const left = cx - width / 2

  const digits = [...s]
    .map((ch, k) => {
      const d = Number(ch)
      const was = fromDigits[k] === ' ' ? 10 : Number(fromDigits[k])
      const x = left + k * dig
      const name = `od${g.id}${k}`
      if (isChanged && was !== d) {
        css.push(
          `@keyframes ${name}{from{transform:translateY(${-was * LINE}px)}to{transform:translateY(${-d * LINE}px)}}` +
            `.${name}{animation:${name} ${0.75 + k * 0.12}s ${OUT} ${(i * 0.06).toFixed(2)}s both}`,
        )
      }
      const strip = Array.from(
        { length: 10 },
        (_, n) => `<text x="${(x + dig / 2).toFixed(1)}" y="${cy + 3.8 + n * LINE}" text-anchor="middle" class="num${isWide ? ' sm' : ''}">${n}</text>`,
      ).join('')

      return (
        `<clipPath id="c${name}"><rect x="${(x - 1).toFixed(1)}" y="${cy - 5.4}" width="${dig + 2}" height="11"/></clipPath>` +
        `<g clip-path="url(#c${name})"><g class="${name}" style="transform:translateY(${-d * LINE}px)">${strip}</g></g>`
      )
    })
    .join('')

  return digits + (isWide ? '' : `<text x="${(left + s.length * dig + 0.5).toFixed(1)}" y="${cy + 3.8}" class="pct">%</text>`)
}

function gauge(g: Gauge, i: number, x: number, w: number, isChanged: boolean, isFirst: boolean, css: string[]): string {
  const cx = x + R + 2
  const cy = 32
  const t = g.tier ?? tier(g.to ?? 0)
  const visible = (g.to ?? 0) > 0.4
  const arcClass = `arc${g.id}`

  if (isChanged && (g.from ?? 0) !== (g.to ?? 0)) {
    css.push(
      `@keyframes ${arcClass}{from{stroke-dashoffset:${off(g.from)}}to{stroke-dashoffset:${off(g.to)}}}` +
        `.${arcClass}{animation:${arcClass} .95s ${OUT} ${(i * 0.06).toFixed(2)}s both}`,
    )
  }

  // 数值变化时，圆环右上角飘出 +N%
  let chip = ''
  if (isChanged && !isFirst && g.from !== undefined && g.to !== undefined) {
    const delta = Math.round(g.to) - Math.round(g.from)
    if (delta !== 0) {
      chip = `<text x="${cx + R + 10}" y="15" class="chip ${t}">${delta > 0 ? '+' : ''}${delta}%</text>`
    }
  }

  const arc = (cls: string) =>
    `<circle cx="${cx}" cy="${cy}" r="${R}" class="${cls} ${arcClass}" stroke="url(#grad-${t})" ` +
    `stroke-dasharray="${C.toFixed(2)}" style="stroke-dashoffset:${off(g.to)}" opacity="${visible ? 1 : 0}"/>`

  return (
    `<g class="g${isFirst ? ' enter' : ''}" style="animation-delay:${(i * 0.06).toFixed(2)}s">` +
    `<title>${g.title}</title>` +
    `<rect x="${x}" y="6" width="${w.toFixed(1)}" height="52" fill="transparent"/>` +
    `<g class="ring">` +
    `<circle cx="${cx}" cy="${cy}" r="${R}" class="track"/>` +
    `<g transform="rotate(-90 ${cx} ${cy})">${arc(`glow ${t}`)}${arc('arc')}</g>` +
    odometer(g, i, cx, cy, isChanged, css) +
    `</g>` +
    `<text x="${cx + R + 10}" y="29" class="lab">${g.label}</text>` +
    `<text x="${cx + R + 10}" y="43" class="sub">${g.sub}</text>` +
    `<text x="${cx + R + 10}" y="43" class="sub2">${g.detail}</text>` +
    chip +
    `</g>`
  )
}

// ───────────────────────── Clawd ─────────────────────────
// 16×10 的像素网格，外层整体放大 U 倍。动作分层：hop（跳）→ breath（呼吸压扁）→ 部件（眼、钳子、腿）

const px = (x: number, y: number, w: number, h: number, fill: string, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`

const HEART = 'M0 .5C0-.3 1-.4 1.2.3 1.4-.4 2.4-.3 2.4.5 2.4 1.3 1.2 2 1.2 2S0 1.3 0 .5Z'

function spark(cx: number, cy: number, r: number, w: number, color: string): string {
  return [0, 45, 90, 135]
    .map(a => {
      const rad = (a * Math.PI) / 180
      const dx = (Math.cos(rad) * r).toFixed(2)
      const dy = (Math.sin(rad) * r).toFixed(2)

      return `<line x1="${(cx - +dx).toFixed(2)}" y1="${(cy - +dy).toFixed(2)}" x2="${(cx + +dx).toFixed(2)}" y2="${(cy + +dy).toFixed(2)}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`
    })
    .join('')
}

// 养成解锁的装扮（Clawd 的格子坐标，头顶 y<0）。画在 body 里，跟着呼吸、跳、跑一起动
function gearSvg(level: number): string {
  const { head, bowtie } = gearOf(level)
  const hat =
    head === 'sprout'
      ? px(7.75, -1.7, 0.5, 1.7, '#5E9E4B') + px(6.3, -2.3, 1.4, 0.7, '#7BC163') + px(8.3, -2.8, 1.4, 0.7, '#8ED073')
      : head === 'cap'
        ? `<rect x="3.4" y="-1.8" width="9" height="1.9" rx=".8" fill="#3E6FD8"/>` +
          px(4.2, -1.45, 2.2, 0.35, '#7FA3EC') +
          `<rect x="10.6" y="-.45" width="4.4" height=".6" rx=".25" fill="#2B57B3"/>` +
          `<rect x="7.6" y="-2.15" width=".8" height=".45" rx=".2" fill="#2B57B3"/>`
        : head === 'crown'
          ? `<path d="M4.2 0V-2.4L6.1-1.2 8-3 9.9-1.2 11.8-2.4V0Z" fill="#F2C14E"/>` +
            px(4.2, -0.55, 7.6, 0.55, '#D9A23A') +
            px(7.6, -1.5, 0.8, 0.8, '#E5484D') +
            px(5.1, -1, 0.6, 0.6, '#5FB0F0') +
            px(10.3, -1, 0.6, 0.6, '#5FB0F0')
          : ''
  const tie = bowtie
    ? `<path d="M6.4 5.3 7.8 5.85 6.4 6.4Z" fill="#E5484D"/><path d="M9.6 5.3 8.2 5.85 9.6 6.4Z" fill="#E5484D"/>` + px(7.6, 5.55, 0.8, 0.6, '#B83238')
    : ''

  return tie + hat
}

// Clawd 的身子（不含阴影、笔记本、爱心）：信息栏和战报卡共用
export function clawdBody(isStressed: boolean, level = 1): string {
  const eyes =
    `<g class="eyes"><g class="look">` +
    px(4, 2, 1, 2, '#231511', ' class="eye"') +
    px(11, 2, 1, 2, '#231511', ' class="eye"') +
    px(4.1, 2.1, 0.35, 0.35, '#F6E7DC', ' class="eye glint"') +
    px(11.1, 2.1, 0.35, 0.35, '#F6E7DC', ' class="eye glint"') +
    `</g></g>`
  const happy =
    `<g class="happy" fill="none" stroke="#231511" stroke-width=".55" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M3.6 3.3 4.5 2.4 5.4 3.3"/><path d="M10.6 3.3 11.5 2.4 12.4 3.3"/></g>`
  const cheeks = `<g class="cheek">${px(2.6, 4.1, 1.7, 0.7, '#F7909F')}${px(11.7, 4.1, 1.7, 0.7, '#F7909F')}</g>`
  const brows = isStressed
    ? `<g stroke="#231511" stroke-width=".42" stroke-linecap="round"><line x1="3.4" y1="1.55" x2="5.1" y2="1.05"/><line x1="12.6" y1="1.55" x2="10.9" y2="1.05"/></g>`
    : ''

  const body =
    `<g class="legA">${px(3, 7, 1, 2, '#B9644A')}${px(10, 7, 1, 2, '#B9644A')}</g>` +
    `<g class="legB">${px(5, 7, 1, 2, '#B9644A')}${px(12, 7, 1, 2, '#B9644A')}</g>` +
    px(2, 0, 12, 1, '#E99B80') +
    px(2, 1, 12, 5, '#D97757') +
    px(2, 1, 1, 5, '#DE8264') +
    px(2, 6, 12, 1, '#BC6448') +
    `<g class="armL">${px(0, 4, 2, 1, '#D97757')}${px(0, 5, 2, 1, '#BC6448')}</g>` +
    `<g class="armR">${px(14, 4, 2, 1, '#D97757')}${px(14, 5, 2, 1, '#BC6448')}</g>` +
    eyes +
    `<g class="shades"><rect x="2" y="1.85" width="12" height=".45" fill="#141414"/>` +
    `<rect x="2.9" y="1.55" width="3.5" height="2.3" rx=".45" fill="#141414"/>` +
    `<rect x="9.6" y="1.55" width="3.5" height="2.3" rx=".45" fill="#141414"/>` +
    `<rect x="3.4" y="1.95" width="1.2" height=".38" fill="#F6E7DC" opacity=".8"/>` +
    `<rect x="10.1" y="1.95" width="1.2" height=".38" fill="#F6E7DC" opacity=".8"/></g>` +
    happy +
    cheeks +
    brows +
    gearSvg(level)

  return body
}

// mini：收起状态下的半尺寸 Clawd，不搬笔记本，干活时在细条上来回小跑
function clawd(isWorking: boolean, isStressed: boolean, didChange: boolean, mini = false, isChill = false, pet?: PetView): string {
  const body = clawdBody(isStressed, pet?.level)
  // 头上戴了东西，干活时的小火花挪到头的左边，不跟帽子打架
  const sparkAt = gearOf(pet?.level ?? 1).head ? '-1.2 -1.2' : '8 -2.6'

  const laptop = isWorking && !mini
    ? `<g class="laptop">` +
      `<rect x="3.6" y="4.7" width="8.8" height="4.4" rx=".5" fill="#34332F"/>` +
      `<rect x="3.6" y="4.7" width="8.8" height=".35" rx=".17" fill="#5A5852"/>` +
      `<g class="logo">${spark(8, 6.9, .95, 0.4, '#E98D6E')}</g>` +
      `<rect x="1.4" y="8.9" width="13.2" height=".9" rx=".3" fill="#55534D"/>` +
      `<rect x="1.4" y="8.9" width="13.2" height=".25" rx=".12" fill="#77746C"/>` +
      `</g>` +
      [
        ['{ }', 16.2, '0s'],
        ['&lt;/&gt;', 17.4, '.8s'],
        ['✓', 16.6, '1.6s'],
      ]
        .map(([glyph, x, delay]) => `<text x="${x}" y="4.2" class="glyph" style="animation-delay:${delay}">${glyph}</text>`)
        .join('') +
      `<g transform="translate(${sparkAt})"><g class="spark-pulse"><g class="spark-spin">${spark(0, 0, 1.45, 0.5, '#E98D6E')}</g></g></g>`
    : ''

  const sweat = isStressed
    ? `<path class="sweat" d="M14.9-.4q.75 1.05.75 1.6a.75.75 0 0 1-1.5 0q0-.55.75-1.6z" fill="#8FD0FF"/>`
    : ''

  const hearts = [
    [2.2, -1.2, '0s', -1.2],
    [11.6, -2, '.45s', 1],
    [7, -3.2, '.9s', 0.2],
  ]
    .map(
      ([x, y, delay, dx]) =>
        `<g transform="translate(${x} ${y}) scale(.75)"><path class="heart" d="${HEART}" fill="#FF7A93" style="animation-delay:${delay};--dx:${dx}px"/></g>`,
    )
    .join('')

  // 点一下：原地 360° 空翻 + 一圈火花（SMIL 事件，不需要脚本）
  const burst = Array.from({ length: 8 }, (_, k) => {
    const a = (k / 8) * Math.PI * 2
    const dx = (Math.cos(a) * 8).toFixed(2)
    const dy = (Math.sin(a) * 6).toFixed(2)

    return (
      `<rect x="7.6" y="4.6" width=".8" height=".8" fill="${k % 2 ? '#F3B18F' : '#E98D6E'}" opacity="0">` +
      `<animate attributeName="opacity" values="0;1;0" dur=".7s" begin="hit.click"/>` +
      `<animateTransform attributeName="transform" type="translate" from="0 0" to="${dx} ${dy}" dur=".7s" begin="hit.click" calcMode="spline" keyTimes="0;1" keySplines=".2 .8 .2 1"/>` +
      `</rect>`
    )
  }).join('')

  const hopClass = didChange ? 'hop once' : isWorking ? 'hop' : 'hop idle'

  return (
    `<g class="clawd${isWorking ? ' working' : ''}${isStressed ? ' stressed' : ''}${mini ? ' mini' : ''}${isChill ? ' chill' : ''}" ` +
    `transform="translate(${mini ? MINI_X : CLAWD_X} ${mini ? MINI_Y : CLAWD_Y}) scale(${mini ? MINI_U : U})">` +
    (pet ? `<title>${pet.title}</title>` : '') +
    `<circle cx="8" cy="5" r="9.5" fill="url(#aura)" class="aura"/>` +
    `<g class="pace">` +
    `<ellipse cx="8" cy="9.75" rx="6.3" ry=".55" class="shadow ${didChange ? 'once' : isWorking ? '' : 'idle'}"/>` +
    `<g class="spin"><animateTransform attributeName="transform" type="rotate" from="0 8 4.5" to="360 8 4.5" dur=".7s" begin="hit.click" calcMode="spline" keyTimes="0;1" keySplines=".3 .1 .2 1"/>` +
    `<g class="${hopClass}"><g class="tremble"><g class="breath">${body}</g></g></g>` +
    `</g>` +
    sweat +
    `</g>` +
    laptop +
    hearts +
    burst +
    `<rect id="hit" x="-1.5" y="-4.5" width="19" height="15" fill="transparent"/>` +
    `</g>`
  )
}

// ───────────────────────── 样式 ─────────────────────────

const STYLE =
  `:root{color-scheme:light dark;background:transparent}text{font-family:-apple-system,"SF Pro Text","PingFang SC",sans-serif}` +
  `.num{font-size:11px;font-weight:700;fill:#F4F2EC;font-variant-numeric:tabular-nums}.num.dim{fill:#6E6C66}.num.sm{font-size:9.5px}` +
  `.pct{font-size:7.5px;font-weight:600;fill:#9C9A93}` +
  `.lab{font-size:12px;font-weight:500;fill:#ECEAE4;letter-spacing:.2px}` +
  `.sub,.sub2{font-size:10.5px;fill:#8C8A84;font-variant-numeric:tabular-nums;transition:opacity .22s ease,filter .22s ease}` +
  `.sub2{opacity:0;filter:blur(2px);fill:#C9C6BE}` +
  `.track{fill:none;stroke:#2C2B29;stroke-width:3}` +
  `.arc,.glow{fill:none;stroke-width:3;stroke-linecap:round}` +
  `.glow{stroke-width:4;filter:url(#blur);opacity:.5}.glow.danger{animation:dpulse 1.6s ease-in-out infinite}` +
  `.ring{transform-box:fill-box;transform-origin:center;transition:transform .4s ${SPRING}}` +
  `.g{transform-box:fill-box}.g.enter{animation:rise .55s ${OUT} both}` +
  `.chip{font-size:9.5px;font-weight:700;opacity:0;animation:chip 1.8s ${OUT} .25s both}` +
  `.chip.ok{fill:#F3B18F}.chip.warn{fill:#FFCB7A}.chip.danger{fill:#FF8F7A}` +
  `@media (hover:hover){.g:hover .ring{transform:scale(1.09)}.g:hover .sub{opacity:0;filter:blur(2px)}.g:hover .sub2{opacity:1;filter:blur(0)}}` +
  // Clawd
  `.clawd *{transform-box:fill-box}` +
  `.hop,.breath,.tremble{transform-origin:50% 100%}` +
  `.breath{animation:breath 3.2s ease-in-out infinite}.working .breath{animation:breath .9s ease-in-out infinite}` +
  `.hop.idle{animation:idlehop 9s ${OUT} 2s infinite}.hop.once{animation:hop .8s ${OUT} both}` +
  `.shadow{fill:#000;opacity:.42;transform-origin:center}.shadow.idle{animation:idleshadow 9s ${OUT} 2s infinite}.shadow.once{animation:shadow .8s ${OUT} both}` +
  `.eye{transform-origin:center;animation:blink 4.6s infinite}.working .eye{animation-duration:3.3s}` +
  `.look{transition:transform .3s ${OUT};animation:look 7s ease-in-out infinite}.working .look{animation:focus 4s ease-in-out infinite}` +
  `.gauges:hover~.clawd .look{animation:none;transform:translate(1px,-.15px)}` +
  `.happy,.cheek{opacity:0;transition:opacity .18s ease}` +
  // 墨镜不全程戴：空闲时 9 秒一轮「戴着 → 推到额头露出眼睛 → 拉回来」；Claude 干活时推到头顶专心敲代码
  `.shades{opacity:0;transition:opacity .18s ease}.chill .shades{opacity:1;animation:shadesCycle 9s ease-in-out infinite}` +
  `.chill .eyes{opacity:0;animation:eyesPeek 9s ease-in-out infinite}` +
  `.chill.working .shades{animation:none;transform:translateY(-1.9px)}.chill.working .eyes{animation:none;opacity:1}` +
  `.chill .breath{animation-duration:5s}.chill .hop.idle{animation-duration:14s}` +
  `.working .armL{animation:tap .24s ease-in-out infinite alternate}.working .armR{animation:tap .24s ease-in-out .12s infinite alternate}` +
  `.working .legA,.working .legB{opacity:0}` +
  `.pace{transform-origin:center}.mini.working .pace{animation:pace 3.2s ease-in-out infinite}` +
  `.mini.working .legA,.mini.working .legB{opacity:1}.mini.working .legA{animation:step .3s ease-in-out infinite alternate}.mini.working .legB{animation:step .3s ease-in-out .15s infinite alternate}` +
  `.mlab{font-size:11px;fill:#8C8A84}.mval{font-size:11.5px;font-weight:700;fill:#ECEAE4;font-variant-numeric:tabular-nums}.mtrack{fill:#2C2B29}.mfill.danger{animation:mpulse 1.6s ease-in-out infinite}` +
  `@keyframes pace{0%{transform:none}46%{transform:translateX(10px)}50%{transform:translateX(10px) scaleX(-1)}96%{transform:scaleX(-1)}100%{transform:none}}` +
  `@keyframes mpulse{0%,100%{opacity:.6}50%{opacity:1}}` +
  `@keyframes step{from{transform:none}to{transform:translateY(-.9px)}}` +
  `.logo{transform-origin:center;animation:glow 2.4s ease-in-out infinite}` +
  `.glyph{font-size:2.3px;font-weight:700;fill:#F0EEE6;opacity:0;animation:float 2.4s ${OUT} infinite}` +
  `.spark-spin{transform-origin:center;animation:spin 2.2s linear infinite}.spark-pulse{transform-origin:center;animation:pulse 1.1s ease-in-out infinite}` +
  `.aura{opacity:0;transform-origin:center}.working .aura{animation:aura 2.4s ease-in-out infinite}` +
  `.stressed .tremble{animation:tremble .16s linear infinite}.sweat{animation:drip 1.5s ease-in infinite}` +
  `.heart{opacity:0;transform-origin:center}` +
  `@media (hover:hover){.clawd:hover .hop{animation:bounce .55s cubic-bezier(.3,.7,.4,1) infinite}` +
  `.clawd:hover .shadow{animation:bshadow .55s cubic-bezier(.3,.7,.4,1) infinite}` +
  `.clawd:hover .eyes,.clawd:hover .shades{opacity:0;animation:none}.clawd:hover .happy{opacity:1}.clawd:hover .cheek{opacity:.9}` +
  `.clawd:hover .heart{animation:heart 1.35s ${OUT} infinite}}` +
  `#hit{cursor:pointer}` +
  // keyframes
  `@keyframes shadesCycle{0%,50%{transform:none}56%,80%{transform:translateY(-1.9px)}86%,100%{transform:none}}` +
  `@keyframes eyesPeek{0%,52%{opacity:0}56%,80%{opacity:1}84%,100%{opacity:0}}` +
  `@keyframes rise{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}` +
  `@keyframes chip{0%{opacity:0;transform:translateY(4px)}18%{opacity:1;transform:none}75%{opacity:1}100%{opacity:0;transform:translateY(-6px)}}` +
  `@keyframes dpulse{0%,100%{opacity:.35}50%{opacity:.9}}` +
  `@keyframes breath{0%,100%{transform:scale(1,1)}50%{transform:scale(1.03,.955)}}` +
  `@keyframes idlehop{0%,86%,100%{transform:none}88%{transform:scale(1.1,.88)}92%{transform:translateY(-3px) scale(.94,1.08)}96%{transform:scale(1.07,.93)}98%{transform:scale(.98,1.02)}}` +
  `@keyframes hop{0%{transform:scale(1.12,.86)}35%{transform:translateY(-3.6px) scale(.93,1.09)}65%{transform:scale(1.08,.92)}82%{transform:scale(.98,1.03)}100%{transform:none}}` +
  `@keyframes idleshadow{0%,86%,100%{transform:none;opacity:.42}92%{transform:scale(.6);opacity:.2}}` +
  `@keyframes shadow{0%{transform:scale(1.1)}35%{transform:scale(.55);opacity:.18}65%{transform:scale(1.08)}100%{transform:none}}` +
  `@keyframes bounce{0%,100%{transform:scale(1.05,.95)}50%{transform:translateY(-2.4px) scale(.97,1.04)}}` +
  `@keyframes bshadow{0%,100%{transform:scale(1.05)}50%{transform:scale(.65);opacity:.22}}` +
  `@keyframes blink{0%,91%,97%,100%{transform:scaleY(1)}94%{transform:scaleY(.12)}}` +
  `@keyframes look{0%,16%{transform:none}22%,40%{transform:translate(.8px,0)}46%,62%{transform:translate(-.8px,0)}68%,100%{transform:none}}` +
  `@keyframes focus{0%,70%{transform:translate(0,.55px)}76%,92%{transform:translate(.5px,-.1px)}100%{transform:translate(0,.55px)}}` +
  `@keyframes tap{from{transform:none}to{transform:translateY(-.8px)}}` +
  `@keyframes glow{0%,100%{opacity:.55;transform:scale(.92)}50%{opacity:1;transform:scale(1.08)}}` +
  `@keyframes float{0%{opacity:0;transform:translate(0,1px) scale(.7)}18%{opacity:.9;transform:translate(.3px,-1px) scale(1)}100%{opacity:0;transform:translate(1.2px,-8px) scale(.9)}}` +
  `@keyframes spin{to{transform:rotate(360deg)}}` +
  `@keyframes pulse{0%,100%{transform:scale(.85)}50%{transform:scale(1.15)}}` +
  `@keyframes aura{0%,100%{opacity:.15;transform:scale(.92)}50%{opacity:.4;transform:scale(1.06)}}` +
  `@keyframes tremble{0%,100%{transform:none}25%{transform:translateX(.14px)}75%{transform:translateX(-.14px)}}` +
  `@keyframes drip{0%{opacity:0;transform:none}20%{opacity:1}100%{opacity:0;transform:translateY(2.4px)}}` +
  `@keyframes heart{0%{opacity:0;transform:scale(.4)}20%{opacity:1;transform:scale(1)}100%{opacity:0;transform:translate(var(--dx),-5px) scale(.8)}}` +
  `@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}` +
  `.sep{stroke:#2A2927}` +
  // 浅色外观：文字换深色、轨道和分隔线换浅灰、阴影变淡；Clawd 本体颜色不变
  `@media (prefers-color-scheme:light){` +
  `.num{fill:#1F1E1D}.num.dim{fill:#B4B1A8}.pct{fill:#8A877E}.lab{fill:#2D2C2A}.sub{fill:#77746C}.sub2{fill:#46443F}` +
  `.track{stroke:#E8E5DC}.mtrack{fill:#E8E5DC}.sep{stroke:#E5E2D9}.mlab{fill:#77746C}.mval{fill:#2D2C2A}` +
  `.glow{opacity:.3}.chip.ok{fill:#C2603F}.chip.warn{fill:#B26E12}.chip.danger{fill:#D2392B}` +
  `.shadow{opacity:.16}@keyframes idleshadow{0%,86%,100%{transform:none;opacity:.16}92%{transform:scale(.6);opacity:.08}}` +
  `.glyph{fill:#6B6862}.sweat{fill:#3D9BE0}` +
  `#grad-ok stop+stop{stop-color:#EC9A78}#grad-warn stop+stop{stop-color:#F2B04E}#grad-danger stop+stop{stop-color:#F2705C}}`

const DEFS =
  `<defs>` +
  `<linearGradient id="grad-ok" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D97757"/><stop offset="1" stop-color="#F5BC98"/></linearGradient>` +
  `<linearGradient id="grad-warn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E9963F"/><stop offset="1" stop-color="#FFD58A"/></linearGradient>` +
  `<linearGradient id="grad-danger" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E5484D"/><stop offset="1" stop-color="#FF9A82"/></linearGradient>` +
  `<radialGradient id="aura"><stop offset="0" stop-color="#D97757" stop-opacity=".22"/><stop offset="1" stop-color="#D97757" stop-opacity="0"/></radialGradient>` +
  `<filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>` +
  `</defs>`

// ───────────────────────── 整条 ─────────────────────────

// 收起后的细条：小 Clawd + 四个「标签 细进度条 百分比」，同样左右留白相等、间距相等；不画分隔线，靠间距分组
function miniSvg(gauges: Gauge[], isWorking: boolean, isStressed: boolean, width: number, isChill: boolean, pet?: PetView): string {
  const items = gauges.map(g => {
    const value = g.to === undefined ? '—' : `${Math.round(g.to)}%`
    const labelW = textWidth(g.label, 11)

    return { g, value, labelW, w: labelW + 8 + MINI_BAR + 8 + textWidth(value, 11.5) * 1.05 }
  })
  // 间距至少 24px：Clawd 干活时会往右跑 20px，不能撞上第一项
  const gap = Math.max(24, (width - 2 * MINI_X - MINI_W - items.reduce((a, b) => a + b.w, 0)) / items.length)
  let x = MINI_X + MINI_W + gap
  const parts: string[] = []
  items.forEach(({ g, value, labelW, w }) => {
    const t = g.tier ?? tier(g.to ?? 0)
    const barX = x + labelW + 8
    const fill = ((Math.min(100, Math.max(0, g.to ?? 0)) / 100) * MINI_BAR).toFixed(1)
    parts.push(
      `<g><title>${g.title}</title>` +
        `<rect x="${x.toFixed(1)}" y="2" width="${w.toFixed(1)}" height="26" fill="transparent"/>` +
        `<text x="${x.toFixed(1)}" y="19" class="mlab">${g.label}</text>` +
        `<rect x="${barX.toFixed(1)}" y="13.5" width="${MINI_BAR}" height="3" rx="1.5" class="mtrack"/>` +
        ((g.to ?? 0) > 0.4
          ? `<rect x="${barX.toFixed(1)}" y="13.5" width="${fill}" height="3" rx="1.5" fill="url(#grad-${t})" class="mfill ${t}"/>`
          : '') +
        `<text x="${(barX + MINI_BAR + 8).toFixed(1)}" y="19" class="mval">${value}</text>` +
        `</g>`,
    )
    x += w + gap
  })

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${H_MINI}" width="${width}" height="${H_MINI}" style="color-scheme:light dark;background:transparent">` +
    `<style>${STYLE}</style>` +
    DEFS +
    `<g class="gauges">${parts.join('')}</g>` +
    clawd(isWorking, isStressed, false, true, isChill, pet) +
    `</svg>`
  )
}

export function bandSvg(bars: Bars, isWorking: boolean, width: number, mini = false, lang: Lang = 'zh', pet?: PetView): string {
  const { from, to } = bars
  // $.state 存取会序列化，from/to 永远是两个对象，必须比内容
  const isChanged = JSON.stringify(from) !== JSON.stringify(to)
  const isFirst = from === null
  const isStressed = Math.max(to?.session?.percent ?? 0, to?.weekly?.percent ?? 0) >= 90
  // 放松模式（@Joshua_WD 的点子）：缓存命中 ≥90% 且额度没告急 → 戴墨镜、呼吸变慢
  const isChill = !isStressed && (to?.cache?.rate ?? 0) >= 90
  const css: string[] = []

  const t = T[lang]
  const pct = (v: number | undefined) => (v === undefined ? '—' : `${Math.round(v)}%`)
  const gauges: Gauge[] = [
    {
      id: 'c',
      label: t.context,
      sub: to?.contextTokens !== undefined ? `${tokensText(to.contextTokens)} / ${tokensText(to.contextWindow)}` : t.waitingReply,
      detail: to?.contextTokens !== undefined ? t.tokens(grouped(to.contextTokens)) : t.waitingReply,
      title: to?.contextTokens !== undefined ? `${t.context} ${pct(to.contextPercent)} · ${grouped(to.contextTokens)} / ${grouped(to.contextWindow)} tokens` : `${t.context}: ${t.waitingReply}`,
      from: from?.contextPercent,
      to: to?.contextPercent,
    },
    {
      id: 's',
      label: t.session,
      sub: resetText(to?.session?.resetsAt, lang) || t.noData,
      detail: leftText(to?.session?.resetsAt, lang) || t.noData,
      title: to?.session ? `${t.session} ${to.session.percent}% · ${resetText(to.session.resetsAt, lang)}` : `${t.session}: ${t.noData}`,
      from: from?.session?.percent,
      to: to?.session?.percent,
    },
    {
      id: 'w',
      label: t.weekly,
      sub: resetText(to?.weekly?.resetsAt, lang) || t.noData,
      detail: leftText(to?.weekly?.resetsAt, lang) || t.noData,
      title: to?.weekly ? `${t.weekly} ${to.weekly.percent}% · ${resetText(to.weekly.resetsAt, lang)}` : `${t.weekly}: ${t.noData}`,
      from: from?.weekly?.percent,
      to: to?.weekly?.percent,
    },
    {
      id: 'k',
      // 命中越高越好：低于 50% 才提醒
      tier: (to?.cache?.rate ?? 100) < 50 ? 'warn' : 'ok',
      label: t.cache,
      sub: to?.cache ? t.cacheRead(tokensText(to.cache.read)) : t.waitingReply,
      detail: to?.cache ? t.cacheTurn(pct(to.cache.turnRate)) : t.waitingReply,
      title: to?.cache ? t.cacheTitle(to.cache.rate, grouped(to.cache.read), grouped(to.cache.write), grouped(to.cache.fresh)) : `${t.cache}: ${t.waitingReply}`,
      from: from?.cache?.rate,
      to: to?.cache?.rate,
    },
  ]

  if (mini) {
    return miniSvg(gauges, isWorking, isStressed, width, isChill, pet)
  }

  // 按内容实际宽度排：左右留白相等（都是 CLAWD_X），Clawd 与四块之间的五段间距相等
  const widths = gauges.map(contentWidth)
  const gap = Math.max(14, (width - 2 * CLAWD_X - CLAWD_W - widths.reduce((a, b) => a + b, 0)) / gauges.length)
  const xs: number[] = []
  widths.reduce((x, w) => (xs.push(x), x + w + gap), CLAWD_X + CLAWD_W + gap)
  const blocks = gauges.map((g, i) => gauge(g, i, xs[i], widths[i], isChanged, isFirst, css)).join('')
  // 分隔线放在两块之间那段间距的正中间
  const seps = [1, 2, 3]
    .map(i => {
      const mid = (xs[i] - gap / 2).toFixed(1)

      return `<line x1="${mid}" y1="18" x2="${mid}" y2="46" class="sep"/>`
    })
    .join('')

  const clawdChanged = isChanged && !isFirst

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${H}" width="${width}" height="${H}" style="color-scheme:light dark;background:transparent">` +
    `<style>${STYLE}${css.join('')}</style>` +
    DEFS +
    `<g class="gauges">${seps}${blocks}</g>` +
    clawd(isWorking, isStressed, clawdChanged, false, isChill, pet) +
    `</svg>`
  )
}

export function bandAlt(to: Snap | null, isWorking: boolean, lang: Lang = 'zh'): string {
  const t = T[lang]
  const pct = (v: number | undefined) => (v === undefined ? '—' : `${Math.round(v)}%`)
  const sep = lang === 'zh' ? '，' : ', '

  return (
    [`${t.context} ${pct(to?.contextPercent)}`, `${t.session} ${pct(to?.session?.percent)}`, `${t.weekly} ${pct(to?.weekly?.percent)}`, `${t.cache} ${pct(to?.cache?.rate)}`].join(sep) +
    (lang === 'zh' ? '；' : '; ') +
    (isWorking ? t.working : t.resting)
  )
}
