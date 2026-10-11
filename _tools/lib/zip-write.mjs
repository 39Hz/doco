// 零依赖 ZIP **写出**器（从 `_tools/make-release.mjs` 抽出来的，第 68 轮）
//
// 【为什么要抽】发布包和源码包都要压 zip，逻辑一模一样。复制一份的话，
//   下面那个"偏移必须写之前记"的坑就会**只在一边被修**，另一边继续产出坏包。
//
// 【为什么不用 Compress-Archive】
//   ① 它写**反斜杠**条目名（本项目踩过，导致统计假警报）；
//   ② 它是外部 PowerShell 命令，失败时不一定有人看；
//   ③ 走 SDK 的 ZipFile 在本机沙箱里加载不稳定。
//   自己写反而最短：本地头 + 数据 + 中央目录 + EOCD，全部用 node:zlib 压。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

export function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function dosTime(d) {
  const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xFFFF
  const date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF
  return { time, date }
}

// 收集条目（文件 + 目录）。目录也要有条目，解压时才会创建空目录。
// `filter(relPath, dirent)` 返回 false 就跳过；对目录返回 false 表示整棵子树都不进。
export function collectEntries(dir, filter) {
  const entries = []
  ;(function walk(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, e.name)
      const name = rel ? rel + '/' + e.name : e.name
      if (filter && filter(name, e) === false) continue
      if (e.isDirectory()) { entries.push({ name: name + '/', dir: true }); walk(full, name) }
      else entries.push({ name, full })
    }
  })(dir, '')
  return entries
}

/**
 * 把一个目录打成 zip。
 * @param {string} srcDir      源目录
 * @param {string} outPath     输出 zip 路径（已存在会先删，绝不留下新旧混合或 0 字节残包）
 * @param {object} [opts]
 * @param {function} [opts.filter]  (relPath, dirent) => boolean
 * @param {string}   [opts.prefix]  给所有条目加一层目录（例如 `多克多比v0.8-源码包/`）
 * @param {Array<{name:string, text:string}>} [opts.extraFiles] 额外塞进包里的文本文件（相对 prefix）
 * @param {function} [opts.onProgress] (done, total) => void
 * @returns {{entries:number, bytes:number}}
 */
export function zipEntries(entries, outPath, opts = {}) {
  if (fs.existsSync(outPath)) fs.rmSync(outPath)
  const out = fs.openSync(outPath, 'w')
  const central = []
  let offset = 0
  const { time: dTime, date: dDate } = dosTime(new Date())
  const writeBuf = (b) => { fs.writeSync(out, b); offset += b.length }

  let done = 0
  for (const ent of entries) {
    // ⚠️⚠️ **必须在写任何字节之前**记下本条目本地头的偏移（第 55 轮修的真 bug）⚠️⚠️
    //   原来这行写在 `writeBuf(comp)` **之后**，于是中央目录里记的偏移指向了
    //   "本条目写完之后"的位置 = **下一个条目的本地头**。后果：
    //     · 解压器按这个偏移去找本地头，读到的是下一个条目 → 长度全串位；
    //       `a.bin(20000)` 解出 9000、`b.bin(9000)` 解出 3000；
    //     · 最后一个条目直接报「本地文件头已损坏」（偏移越过了中央目录）。
    //   实测代价：v0.7 包 **5123 个条目里 3603 个解不开（70%）**，用户报"文件被损坏解压不了"。
    //   所以这一行**不许挪到下面去**。
    const localHeaderOffset = offset
    const nameBuf = Buffer.from(ent.name, 'utf8')
    const raw = ent.dir ? Buffer.alloc(0) : (ent.buf != null ? ent.buf : fs.readFileSync(ent.full))
    const method = ent.dir ? 0 : 8
    const comp = ent.dir ? raw : zlib.deflateRawSync(raw, { level: 6 })
    const crc = ent.dir ? 0 : crc32(raw)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)              // version needed
    local.writeUInt16LE(0x0800, 6)          // flag: UTF-8 文件名（中文名必须）
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(dTime, 10)
    local.writeUInt16LE(dDate, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comp.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)              // extra len
    writeBuf(local)
    writeBuf(nameBuf)
    if (comp.length) writeBuf(comp)

    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(20, 4)                // version made by
    cen.writeUInt16LE(20, 6)                // version needed
    cen.writeUInt16LE(0x0800, 8)
    cen.writeUInt16LE(method, 10)
    cen.writeUInt16LE(dTime, 12)
    cen.writeUInt16LE(dDate, 14)
    cen.writeUInt32LE(crc, 16)
    cen.writeUInt32LE(comp.length, 20)
    cen.writeUInt32LE(raw.length, 24)
    cen.writeUInt16LE(nameBuf.length, 28)
    cen.writeUInt16LE(0, 30)                // extra
    cen.writeUInt16LE(0, 32)                // comment
    cen.writeUInt16LE(0, 34)                // disk
    cen.writeUInt16LE(0, 36)                // internal attrs
    cen.writeUInt32LE(ent.dir ? 0x10 : 0x20, 38)   // external attrs: 目录位
    cen.writeUInt32LE(localHeaderOffset, 42)   // local header offset（用**写之前**记下的值，别用 offset）
    central.push(Buffer.concat([cen, nameBuf]))
    if (opts.onProgress && ++done % 500 === 0) opts.onProgress(done, entries.length)
  }
  const cenStart = offset
  for (const c of central) writeBuf(c)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(offset - cenStart, 12)
  eocd.writeUInt32LE(cenStart, 16)
  eocd.writeUInt16LE(0, 20)
  writeBuf(eocd)
  fs.closeSync(out)
  return { entries: entries.length, bytes: fs.statSync(outPath).size }
}

/**
 * 把一个目录打成 zip（`zipEntries` 的常用包装）。
 * @param {string} srcDir      源目录
 * @param {string} outPath     输出 zip 路径（已存在会先删，绝不留下新旧混合或 0 字节残包）
 * @param {object} [opts]
 * @param {function} [opts.filter]  (relPath, dirent) => boolean
 * @param {string}   [opts.prefix]  给所有条目加一层目录（例如 `多克多比v0.8-源码包/`）
 * @param {Array<{name:string, text:string}>} [opts.extraFiles] 额外塞进包里的文本文件（相对 prefix）
 * @param {function} [opts.onProgress] (done, total) => void
 * @returns {{entries:number, bytes:number}}
 */
export function zipDir(srcDir, outPath, opts = {}) {
  return zipEntries(stageDir(srcDir, opts), outPath, opts)
}

/**
 * 把一个目录**收集成条目**（带 prefix / extraFiles），供 `zipEntries` 组合多个来源。
 * 交接包（游戏 + 源码 + 文档装一个 zip）就是靠它把几棵树拼到一起的。
 */
export function stageDir(srcDir, opts = {}) {
  const pre = opts.prefix ? String(opts.prefix).replace(/\/*$/, '/') : ''
  const entries = collectEntries(srcDir, opts.filter)
  if (pre) {
    entries.unshift({ name: pre, dir: true })      // 顶层目录自己也要有条目
    for (const e of entries) if (e.name !== pre) e.name = pre + e.name
  }
  for (const x of opts.extraFiles || []) {
    entries.push({ name: pre + x.name, buf: Buffer.from(x.text, 'utf8') })
  }
  return entries
}
