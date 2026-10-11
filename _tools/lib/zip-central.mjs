// zip 中央目录读取 + 写入（零依赖，只用 node:zlib）
//
// 【为什么要共享】
// verify-zip.mjs 早就会**读** zip 中央目录（不依赖 PowerShell、不解压，因为它们踩过
// "Compress-Archive 写反斜杠导致 -like '*a/b/*' 匹配到 0 = 假警报"这个坑）。
// 第 46 轮加 make-release.mjs 时，如果它自己再写一份读法，就会出现这个仓库反复记过的
// 「同一个逻辑复制成两份，就一定会分叉」。所以抽到这里，两边 import 同一份。
//
// 用法:
//   import { listZip, checkZip } from './lib/zip-central.mjs'
//   const names = listZip(path)            // string[]，`\` 已统一成 `/`
//   const r = checkZip(path, rules)        // { pass, fail, names } —— 带正例自证
import fs from 'node:fs'
import zlib from 'node:zlib'

/** 找 EOCD（End of Central Directory）。有注释的 zip 会把 EOCD 顶到后面，所以要往回扫 64 KB。 */
function findEocd(buf) {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i
  }
  return -1
}

/** 读出全部条目名（`\` 统一成 `/`）。读不出就抛，绝不返回"空数组"当成功。 */
export function listZip(zipPath) {
  const buf = fs.readFileSync(zipPath)
  const eocd = findEocd(buf)
  if (eocd < 0) throw new Error('不是有效的 zip（找不到 EOCD）: ' + zipPath)
  const count = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  const names = []
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error(`第 ${i} 条中央目录头损坏: ${zipPath}`)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    names.push(buf.toString('utf8', off + 46, off + 46 + nameLen).replace(/\\/g, '/'))
    off += 46 + nameLen + extraLen + commentLen
  }
  if (names.length !== count) throw new Error(`条目数与中央目录不一致（${names.length} vs ${count}）`)
  return names
}

/** 从 zip 里取一个文本文件的内容（不开子进程、不解压到磁盘）。 */
export function readZipText(zipPath, entryName) {
  const buf = fs.readFileSync(zipPath)
  const want = entryName.replace(/\\/g, '/')
  const eocd = findEocd(buf)
  if (eocd < 0) throw new Error('不是有效的 zip: ' + zipPath)
  const count = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    const localOff = buf.readUInt32LE(off + 42)
    const method = buf.readUInt16LE(off + 10)
    const compSize = buf.readUInt32LE(off + 20)
    const nm = buf.toString('utf8', off + 46, off + 46 + nameLen).replace(/\\/g, '/')
    if (nm === want) {
      // 本地头：30 字节固定 + 文件名 + 扩展区（本地头的长度字段可能与中央目录不同，必须读本地的）
      const lNameLen = buf.readUInt16LE(localOff + 26)
      const lExtraLen = buf.readUInt16LE(localOff + 28)
      const dataAt = localOff + 30 + lNameLen + lExtraLen
      const raw = buf.subarray(dataAt, dataAt + compSize)
      return (method === 0 ? raw : zlib.inflateRawSync(raw)).toString('utf8')
    }
    off += 46 + nameLen + extraLen + commentLen
  }
  return null
}

/**
 * 按规则核对一个 zip。
 * rules: { 'web/game.html': 1, 'web/assets/scenes/': 80 } —— 值是最小条目数（子串匹配）。
 * 返回 { pass, fail, checks, names }；**必做正例自证**：exe 必须在包内（R5）。
 */
export function checkZip(zipPath, rules = {}) {
  const st = fs.statSync(zipPath)
  const names = listZip(zipPath)
  const checks = []
  const ok = (c, msg, extra) => { checks.push({ ok: !!c, msg, extra }); return !!c }
  ok(st.size > 0, 'zip 非空（字节数 > 0）', st.size + ' 字节')
  ok(names.length > 0, '条目数 > 0', names.length + ' 条目')
  ok(names.some((n) => n.endsWith('多克多比.exe')), '正例自证：启动器 exe 在包内')
  for (const [pat, min] of Object.entries(rules)) {
    const c = names.filter((n) => n.includes(pat)).length
    ok(c >= min, `${pat} 至少 ${min} 项`, `实际 ${c}`)
  }
  const pass = checks.filter((c) => c.ok).length
  return { pass, fail: checks.length - pass, checks, names, bytes: st.size }
}
