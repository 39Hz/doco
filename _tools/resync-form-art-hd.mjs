// 把归档**官方高清大图**同步成游戏立绘（目标：有效高度 640px = 屏幕最大显示 320px 的 2 倍）
//
// 【为什么要做】`audit-form-art-2x.mjs` 量出 47 个形态里有 20 个的立绘**源像素不足**
//（有效高度只有目标的 0.44~0.90）—— 屏幕上被放大，所以看起来糊。
// 这次把归档里**确实存在高清版**的形态换成高清源（其余 15 个归档里没有，按 R1 不自己拉大凑数）。
//
// 取景规范（跟现有立绘一致，别自己发明）：
//   · 裁掉透明留白，只留有效内容，高 = 640px；
//   · 面积平均重采样（不是最近邻），避免缩小后出现锯齿；
//   · **alpha 加权**求色，否则透明像素会把边缘拉黑。
//
// 用法: node _tools/resync-form-art-hd.mjs [--dry]
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const OUT = path.join(ROOT, 'assets', 'forms', 'art')
const DRY = process.argv.includes('--dry')
const TARGET_H = 640

// 形态 → 归档高清源
//
// ⚠️ **必须与 `_tools/build-form-art.mjs` 的 MAP 保持一致**（那是"哪个形态用哪张图"的权威依据）。
//    【第 51 轮踩过的坑】第一版这里把「毒多比」写成了 `普伊斯·蛛多比.png` ——
//    可那张图按 MAP 是**蜘蛛多比**的源，等于把毒多比换成了蜘蛛的样子
//    （`check-form-art-dupes.mjs` 的近似色也跟着报了警）。现已移除，毒多比保持原图。
const SEQ = '多克多比专区资料素材/多克多比素材fla/多克多比电广素材/多比形态序列'
const MAP = [
  // 官方动作序列里的「普通姿态」——最接近立绘站姿（发招帧会带动作，不适合当立绘）
  { form: '龙多比', src: `${SEQ}/龙多比形态序列/龙多比普通姿态/龙多比普通姿态0014.png`, why: 'MAP: 龙多比 ← 多比形态素材/龙多比.png(184×343 太小) → 改用官方序列的「普通姿态」高清帧' },
  // 凤凰没有"普通姿态/战斗姿态"目录，只有 发招一/二/三/四、胜利、闪躲、防御 → 取「防御」（站姿最安静）
  { form: '凤凰多比', src: `${SEQ}/凤凰多比形态序列/凤凰多比防御/凤凰多比防御0020.png`, why: '凤凰序列只有发招/胜利/闪躲/防御（无普通姿态）→ 取「防御」中段帧，姿态最接近站立' },
  // 这三张是 MAP 里就有的 1920 官方立绘（已抠好背景），直接用
  { form: '瑞比特兔', src: '多克多比专区资料素材/多比形态素材/1920/瑞比特·兔多比.png', why: 'MAP: 瑞比特·兔 ← 1920/瑞比特·兔多比.png（1920×3092）' },
  { form: '曼陀罗花多比', src: '多克多比专区资料素材/多比形态素材/1920/曼陀罗·花多比.png', why: 'MAP: 曼陀罗·花 ← 1920/曼陀罗·花多比.png（1920×3588）' },
  // 土蝎多比：MAP 指向 425×438 的 JPG（太小），但归档另有 1920×1670 的透明动作序列
  { form: '土蝎多比', src: `${SEQ}/蝎多比形态序列/蝎多比发招一/蝎多比发招一0001.png`, why: 'MAP: 土蝎多比 ＝ 摩撒·蝎多比（归档 JPG 只有 425×438）→ 改用「蝎多比形态序列」1920×1670 透明帧，取动作起始帧（攻击动作的起始就是站姿）' },
]

// 读图：PNG 直接解；JPG 复用 `build-form-art.mjs` 的 GDI+ 转换缓存（同名哈希规则）。
// 【为什么要复用缓存】本机没有 JPEG 解码器（零依赖），而 `build-form-art.mjs` 已经用
//   PowerShell + GDI+ 把归档里的 JPG 批量转成了 PNG，缓存在 `_tools/imgcache/formart/`。
//   缓存名 = 源**相对路径**的 sha1 前 12 位（那个脚本专门用路径哈希命名，
//   就是为了避免"按位置命名 → 改了清单就静默用错图"的坑）。这里照同一规则取，绝不另建一套。
function loadImage(rel) {
  const abs = path.join(ROOT, rel)
  if (/\.png$/i.test(rel)) return decodePng(fs.readFileSync(abs))
  if (/\.jpe?g$/i.test(rel)) {
    const cache = path.join(ROOT, '_tools', 'imgcache', 'formart',
      crypto.createHash('sha1').update(rel).digest('hex').slice(0, 12) + '.png')
    if (!fs.existsSync(cache)) {
      throw new Error(`需要 ${rel} 的 JPG 缓存，但 ${path.relative(ROOT, cache)} 不存在 —— 先跑 node _tools/build-form-art.mjs`)
    }
    return decodePng(fs.readFileSync(cache))
  }
  throw new Error('不支持的图片格式：' + rel)
}

function bbox(img) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.data[(y * img.w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x
        if (y < y0) y0 = y; if (y > y1) y1 = y
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 }
}

// 面积平均 + alpha 加权：裁外框 → 缩到目标高
function resample(img, box, dstH) {
  const sw = box.x1 - box.x0 + 1, sh = box.y1 - box.y0 + 1
  const scale = dstH / sh
  const dw = Math.max(1, Math.round(sw * scale)), dh = dstH
  const out = new Uint8ClampedArray(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const sy0 = box.y0 + Math.floor(y / scale)
    const sy1 = Math.max(sy0 + 1, box.y0 + Math.floor((y + 1) / scale))
    for (let x = 0; x < dw; x++) {
      const sx0 = box.x0 + Math.floor(x / scale)
      const sx1 = Math.max(sx0 + 1, box.x0 + Math.floor((x + 1) / scale))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let sy = sy0; sy < sy1 && sy <= box.y1; sy++) {
        for (let sx = sx0; sx < sx1 && sx <= box.x1; sx++) {
          const i = (sy * img.w + sx) * 4
          const al = img.data[i + 3] / 255
          r += img.data[i] * al; g += img.data[i + 1] * al; b += img.data[i + 2] * al
          a += img.data[i + 3]; n++
        }
      }
      if (!n) continue
      const ws = a / 255 || 1
      const o = (y * dw + x) * 4
      out[o] = r / ws; out[o + 1] = g / ws; out[o + 2] = b / ws; out[o + 3] = a / n
    }
  }
  return { w: dw, h: dh, data: out }
}

// 回退：指定的"战斗姿态"不存在时，用同形态下的第一个动作目录
function resolveSrc(s) {
  if (fs.existsSync(path.join(ROOT, s.src))) return s.src
  const seqDir = path.dirname(path.dirname(path.join(ROOT, s.src)))
  if (!fs.existsSync(seqDir)) return null
  const dirs = fs.readdirSync(seqDir, { withFileTypes: true }).filter((e) => e.isDirectory())
  for (const d of dirs) {
    const p = path.join(seqDir, d.name)
    const frames = fs.readdirSync(p).filter((f) => /\.png$/i.test(f)).sort()
    if (frames.length) {
      const pick = frames[Math.floor(frames.length / 2)]
      const rel = path.relative(ROOT, path.join(p, pick)).replace(/\\/g, '/')
      console.log(`  （回退）${s.src} 不存在 → 用 ${rel}`)
      return rel
    }
  }
  return null
}

const t0 = Date.now()
console.log(`同步官方高清立绘 → 目标有效高度 ${TARGET_H}px\n`)
let done = 0
for (const m of MAP) {
  const rel = resolveSrc(m)
  const dst = path.join(OUT, m.form + '.png')
  if (!rel) { console.log(`✗ ${m.form}：找不到高清源，跳过`); continue }
  const abs = path.join(ROOT, rel)
  const before = fs.existsSync(dst) ? fs.statSync(dst).size : 0
  const img = loadImage(rel)
  const box = bbox(img)
  if (!box) { console.log(`✗ ${m.form}：源图全透明，跳过`); continue }
  const ch = box.y1 - box.y0 + 1
  const out = resample(img, box, TARGET_H)
  const png = encodePng(out.w, out.h, out.data)
  // 自证：写出的字节必须能被读回，且尺寸/有效高度符合预期
  const back = decodePng(png)
  const bb = bbox(back)
  const okH = bb && (bb.y1 - bb.y0 + 1) === TARGET_H
  const okW = back.w === out.w && back.h === out.h
  if (!okH || !okW) {
    console.log(`✗ ${m.form}：自证失败（读回 ${back.w}×${back.h}，有效高 ${bb ? bb.y1 - bb.y0 + 1 : 0}）—— 不写盘`)
    continue
  }
  if (!DRY) fs.writeFileSync(dst, png)
  done++
  console.log(`✓ ${m.form}  ${img.w}×${img.h}（有效高 ${ch}）→ ${out.w}×${out.h}  ` +
    `${Math.round(before / 1024)}KB → ${Math.round(png.length / 1024)}KB  ${DRY ? '[dry]' : ''}`)
  console.log(`    源：${rel}`)
  console.log(`    依据：${m.why}`)
}
console.log(`\n完成 ${done}/${MAP.length} 个，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
if (DRY) console.log('（--dry：没有写盘）')
