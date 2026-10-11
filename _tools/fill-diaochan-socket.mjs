// 把貂蝉多比**右眼窝**（脸右侧那块纯黑 `(0,0,0)` 区域）填成**脸部浅紫** `(254,232,255)`
//
// 【用户的原话】「不要把原图的另外一个空的地方补上白色就行了」
//   → 读作：**把另一个空着的地方补上（脸）白色**（不是"不要补"）。
//     因为左眼窝原本就是白的、右眼窝是纯黑的，两边不对称正是用户报的"缺一个眼"。
//
// 【事实基础（都实测过）】
//   · 官方 4 张貂蝉立绘**都没有眼睛**（脸纯白、只有两个眼形轮廓）；
//   · 左眼窝 = 纯白 `(255,255,255)`，已被我上一版填成红眼（本次一并还原）；
//   · 右眼窝 = 纯黑 `(0,0,0)`，x≈188..256 / y≈234..306（横向采样 y=250/270 逐点确认），
//     左侧紧邻脸部浅紫 `(254,232,255)`，右侧是褐色头发。
//   → 填成 `(254,232,255)` 即与脸部一致，两个"空的地方"都成为正常的空白眼窝。
//
// 【可一键还原】原图备份在 `_tmp_test_out/art-before-eyes.png`。
// 用法: node _tools/fill-diaochan-socket.mjs [--dry]
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const SRC = path.join(ROOT, 'assets/forms/art/貂蝉多比.png')
const BAK = path.join(ROOT, '_tmp_test_out/art-before-eyes.png')
const DRY = process.argv.includes('--dry')

// 先还原到官方原图（去掉上一版的红色实验），再动手
if (!DRY) {
  if (!fs.existsSync(BAK)) { console.error('✗ 找不到备份，拒绝在实验版上继续改（先还原）'); process.exit(1) }
  fs.copyFileSync(BAK, SRC)
  console.log('已还原到官方原图（备份 → 正式文件）')
}

const img = decodePng(fs.readFileSync(SRC))
const { w: W, h: H, data } = img
const FACE = [254, 232, 255]          // 脸部浅紫（实测值）

// 从脸部中心向右扫，找"第一段纯黑"的边界 —— 不写死坐标，靠扫描定位
const isPureBlack = (x, y) => {
  const i = (y * W + x) * 4
  return data[i + 3] > 200 && data[i] < 14 && data[i + 1] < 14 && data[i + 2] < 14
}
// 找种子：在脸高度区间里找一段纯黑
let seed = null
for (const y of [250, 258, 266, 274, 282, 290]) {
  for (let x = 150; x < 320; x++) if (isPureBlack(x, y)) { seed = [x, y]; break }
  if (seed) break
}
if (!seed) { console.log('✗ 没找到纯黑眼窝，退出'); process.exit(1) }
console.log(`纯黑眼窝种子 @(${seed[0]},${seed[1]})`)

// 洪水填充：只吃"纯黑"，且限制在脸部范围内（避免吃到头发的大片黑）
const seen = new Uint8Array(W * H)
const q = [seed[1] * W + seed[0]]
seen[q[0]] = 1
const cells = []
while (q.length) {
  const c = q.pop(), cx = c % W, cy = (c / W) | 0
  cells.push(c)
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = cx + dx, ny = cy + dy
    if (nx < 100 || nx >= 300 || ny < 205 || ny >= 335) continue   // 脸部窗口
    const np = ny * W + nx
    if (!seen[np] && isPureBlack(nx, ny)) { seen[np] = 1; q.push(np) }
  }
}
console.log(`眼窝连通块 ${cells.length} 像素`)
let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1
for (const c of cells) { const cx = c % W, cy = (c / W) | 0; if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy }
console.log(`  范围 x ${x0}..${x1}  y ${y0}..${y1}  (${x1 - x0 + 1}×${y1 - y0 + 1})`)

let painted = 0
for (const c of cells) {
  const i = c * 4
  data[i] = FACE[0]; data[i + 1] = FACE[1]; data[i + 2] = FACE[2]
  painted++
}
console.log(`已填成脸白 rgb(${FACE.join(',')})：${painted} 像素`)
if (!DRY) { fs.writeFileSync(SRC, encodePng(W, H, data)); console.log(`已写回 ${path.relative(ROOT, SRC)}`) }
else console.log('（--dry，未写盘）')
