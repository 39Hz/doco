// 给文本文件加/去 UTF-8 BOM。为什么需要它见 STATE.md 环境注意事项：
//   PowerShell 5.1 读**无 BOM** 的 UTF-8 `.ps1` 会按 ANSI（本机 GBK）解，中文全乱、语法直接崩。
// 本项目生成 `.ps1` 的规矩：**必须带 BOM**。用这个脚本，别手敲 Set-Content（那会二次编码）。
// 用法: node _tools/with-bom.mjs <file> [--strip]
import fs from 'node:fs'
const [file, flag] = process.argv.slice(2)
if (!file) { console.error('用法: node _tools/with-bom.mjs <file> [--strip]'); process.exit(2) }
let buf = fs.readFileSync(file)
const has = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF
const want = flag !== '--strip'
if (has && !want) {
  fs.writeFileSync(file, buf.subarray(3))
  console.log(`✓ 已去掉 BOM: ${file}`)
} else if (!has && want) {
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), buf]))
  console.log(`✓ 已加上 BOM: ${file}`)
} else {
  console.log(`= 无需改动（${has ? '已有' : '本就无'} BOM）: ${file}`)
}
