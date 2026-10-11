// 从 SWF 抽"带 alpha 的完整动作帧"（DefineBitsJPEG3 = JPEG + zlib(alpha)）
//
// 【为什么之前抽的不能用】`extract-swf-frames.mjs` 只拿了 JPEG 部分，
//   而 `DefineBitsJPEG3` 的**透明度存在 JPEG 之后的一段 zlib 数据里** ——
//   丢掉它 → 背景变纯黑，当立绘用不了（实测 alpha 全 255）。
//
// 做法：JPEG 写出临时文件 → 用 Pillow 解码 → 把解出的 alpha 合成上去 → 存 PNG。
//   （项目里没有 JPEG 解码器，Pillow 是最省事的路；走"python 写文件"的老套路）
//
// 用法: node _tools/extract-swf-frames-alpha.mjs <swf|目录> <输出目录> [最小尺寸]
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve('.')
const SRC = process.argv[2]
const OUT = path.join(ROOT, process.argv[3] || '_tmp_test_out/swf-frames-alpha')
const MIN = Number(process.argv[4] || 64)
if (!SRC) { console.log('用法: node _tools/extract-swf-frames-alpha.mjs <swf|目录> <输出目录> [最小尺寸]'); process.exit(1) }

const PY = path.join(ROOT, '_tools', 'py', 'python.exe')
const TMP = path.join(ROOT, '_tmp_test_out', '_swfalpha')
fs.mkdirSync(TMP, { recursive: true })
fs.mkdirSync(OUT, { recursive: true })

function body(buf) {
  const sig = buf.toString('ascii', 0, 3)
  if (sig === 'FWS') return buf.subarray(8)
  if (sig === 'CWS') return zlib.inflateSync(buf.subarray(8))
  throw new Error('未知签名 ' + sig)
}
function readRect(b, p) {
  const nbits = b[p] >> 3
  const bytes = Math.ceil((5 + nbits * 4) / 8)
  let bits = ''
  for (let i = 0; i < bytes; i++) bits += b[p + i].toString(2).padStart(8, '0')
  const rd = (o) => parseInt(bits.slice(o, o + nbits), 2)
  return { next: p + bytes }
}
function jpegSize(buf) {
  let i = 2
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) { i++; continue }
    const m = buf[i + 1]
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  return null
}

const files = []
const st = fs.statSync(SRC)
if (st.isDirectory()) {
  for (const e of fs.readdirSync(SRC, { withFileTypes: true })) {
    if (e.isFile() && /\.swf$/i.test(e.name)) files.push(path.join(SRC, e.name))
  }
} else files.push(SRC)

// 先把所有帧的 JPEG 与 alpha 落盘，再交给 python 批量合成
const jobs = []
for (const file of files) {
  const base = path.basename(file, path.extname(file))
  let b
  try { b = body(fs.readFileSync(file)) } catch (e) { console.log(`✗ ${base}: ${e.message}`); continue }
  let p = readRect(b, 8).next + 4
  let n = 0
  while (p + 2 <= b.length) {
    const tagLen = b.readUInt16LE(p); p += 2
    const code = tagLen >> 6
    let len = tagLen & 0x3f
    if (len === 0x3f) { len = b.readUInt32LE(p); p += 4 }
    if (code === 0) break
    if (code === 35 && len > 8) {
      const payload = b.subarray(p, p + len)
      const alphaOff = payload.readUInt32LE(2)
      const jpeg = payload.subarray(6, 6 + alphaOff)
      const alphaZ = payload.subarray(6 + alphaOff)
      const sz = jpeg[0] === 0xFF && jpeg[1] === 0xD8 ? jpegSize(jpeg) : null
      if (sz && sz.w >= MIN && sz.h >= MIN) {
        n++
        const stem = `${base}_${String(n).padStart(3, '0')}`
        fs.writeFileSync(path.join(TMP, stem + '.jpg'), jpeg)
        if (alphaZ.length > 8) fs.writeFileSync(path.join(TMP, stem + '.z'), alphaZ)
        jobs.push({ stem, w: sz.w, h: sz.h, hasAlpha: alphaZ.length > 8 })
      }
    }
    p += len
    if (p > b.length) break
  }
  console.log(`${base}: 待合成 ${n} 帧`)
}
console.log(`\n合计 ${jobs.length} 帧 → 交给 Pillow 合成 alpha`)

const manifest = path.join(TMP, 'manifest.json')
fs.writeFileSync(manifest, JSON.stringify({ tmp: TMP.replace(/\\/g, '/'), out: OUT.replace(/\\/g, '/'), jobs }, null, 1))
const pyPath = path.join(TMP, 'compose.py')
fs.writeFileSync(pyPath, `
import json, os, zlib, struct
from PIL import Image
import numpy as np

m = json.load(open(r"${manifest.replace(/\\\\/g, '/')}", encoding="utf-8"))
ok = 0
for j in m["jobs"]:
    stem = j["stem"]
    jp = os.path.join(m["tmp"], stem + ".jpg")
    zp = os.path.join(m["tmp"], stem + ".z")
    try:
        im = Image.open(jp).convert("RGBA")
    except Exception:
        continue
    if os.path.exists(zp) and j["hasAlpha"]:
        try:
            raw = zlib.decompress(open(zp, "rb").read())
            # SWF 的 alpha 位图：zlib 解出后是 PGM 风格（格式字节 + w + h + 数据），
            # 但 DefineBitsJPEG3 的 alpha 是**裸 zlib 压缩的 w*h 字节**
            if len(raw) == j["w"] * j["h"]:
                al = np.frombuffer(raw, dtype=np.uint8).reshape(j["h"], j["w"])
                arr = np.asarray(im).copy()
                arr[:, :, 3] = al
                im = Image.fromarray(arr, "RGBA")
            else:
                # 有些是 5 字节头（fmt + w + h）
                if len(raw) >= 5:
                    w2 = struct.unpack(">H", raw[1:3])[0]
                    h2 = struct.unpack(">H", raw[3:5])[0]
                    dat = raw[5:]
                    if w2 * h2 <= len(dat):
                        al = np.frombuffer(dat[: w2 * h2], dtype=np.uint8).reshape(h2, w2)
                        if (w2, h2) != (j["w"], j["h"]):
                            al = np.asarray(Image.fromarray(al, "L").resize((j["w"], j["h"])))
                        arr = np.asarray(im).copy()
                        arr[:, :, 3] = al
                        im = Image.fromarray(arr, "RGBA")
        except Exception as e:
            pass
    out = os.path.join(m["out"], stem + ".png")
    im.save(out)
    ok += 1
print("合成 %d / %d" % (ok, len(m["jobs"])))
`, 'utf8')

const env = { ...process.env, TMP, TEMP: TMP }
execFileSync(PY, [pyPath], { stdio: 'inherit', cwd: ROOT, env })
console.log(`\n输出目录 ${path.relative(ROOT, OUT)}`)
