// 自证：encodePng / decodePng 的往返是否保真（R5：工具必须能自证）
import { encodePng, decodePng, makeFramebuffer } from './pixel-canvas.mjs'

const W = 4, H = 3
const fb = makeFramebuffer(W, H)
// 给每个像素一个可识别的颜色（最后一字节都不同，便于发现"逐字节错位"）
const want = []
let k = 0
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4
  fb[i] = 10 + k * 7; fb[i + 1] = 20 + k * 5; fb[i + 2] = 30 + k * 3; fb[i + 3] = 255
  want.push([fb[i], fb[i + 1], fb[i + 2], fb[i + 3]])
  k++
}
const png = encodePng(W, H, fb)
const back = decodePng(png)
let bad = 0
for (let n = 0; n < want.length; n++) {
  const i = n * 4
  const got = [back.data[i], back.data[i + 1], back.data[i + 2], back.data[i + 3]]
  const ok = got.every((v, j) => v === want[n][j])
  if (!ok) { bad++; if (bad <= 3) console.log(`  ✗ 像素 ${n}: 期望 ${want[n]}  实际 ${got}`) }
}
console.log(bad === 0
  ? `✅ encodePng/decodePng 往返保真（${want.length} 个像素全部一致）`
  : `❌ 往返不保真：${bad}/${want.length} 个像素不一致`)
// 【第 52 轮补】回归跑手 `run-all-tests.mjs` 靠**固定格式的汇总行**统计断言数
//（"通过 N 项，失败 M 项"），没有这行它会把整个文件当成"无汇总 → 失败"。
// 这个文件是**另一个会话**建的（像素画布/高清立绘那条线），这里只补汇总行、不改它的判定逻辑。
console.log(`通过 ${want.length - bad} 项，失败 ${bad} 项`)
process.exit(bad === 0 ? 0 : 1)
