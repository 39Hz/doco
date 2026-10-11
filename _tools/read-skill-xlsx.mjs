// 读「资源需求文档_魔法技能及道具.xlsx」——找"技能 ID ↔ 技能名"的权威对应
//
// ⚠️ 沙箱禁止用管道抓子进程输出（`execFileSync` 默认 pipe 会 EPERM），
//    所以让 python **把结果写到文件**，Node 再读那个文件。
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const XLSX = path.join(ROOT, '多克多比专区资料素材/魔法道具ICON等/多克多比技能/资源需求文档_魔法技能及道具.xlsx')
if (!fs.existsSync(XLSX)) { console.log('✗ 找不到 xlsx'); process.exit(1) }
console.log(`文件 ${(fs.statSync(XLSX).size / 1024).toFixed(0)} KB`)

const TMP = path.join(ROOT, '_tmp_test_out')
fs.mkdirSync(TMP, { recursive: true })
const PYOUT = path.join(TMP, '_skill_xlsx.json')
const pyPath = path.join(TMP, '_read_skill_xlsx.py')
const PY = `
import openpyxl, json, sys
wb = openpyxl.load_workbook(r"${XLSX.replace(/\\/g, '/')}", data_only=True)
out = {}
for ws in wb.worksheets:
    rows = []
    for r in ws.iter_rows(values_only=True):
        if any(c is not None and str(c).strip() != "" for c in r):
            rows.append(["" if c is None else str(c) for c in r])
    out[ws.title] = rows[:500]
open(r"${PYOUT.replace(/\\/g, '/')}", "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False))
print("ok")
`
fs.writeFileSync(pyPath, PY, 'utf8')

const PYEXE = 'C:/Users/wangbujue/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe'
if (!fs.existsSync(PYEXE)) { console.log('✗ 找不到 python'); process.exit(1) }
if (fs.existsSync(PYOUT)) fs.rmSync(PYOUT)
try {
  // stdio 用 inherit：沙箱下 pipe 会 EPERM
  execFileSync(PYEXE, [pyPath], { stdio: 'inherit' })
} catch (e) {
  console.log(`python 退出异常: ${String(e.message).slice(0, 160)}`)
}
if (!fs.existsSync(PYOUT)) { console.log('✗ python 没有写出结果'); process.exit(1) }

const data = JSON.parse(fs.readFileSync(PYOUT, 'utf8'))
for (const [sheet, rows] of Object.entries(data)) {
  console.log(`\n=== 工作表「${sheet}」 ${rows.length} 行 ===`)
  for (const r of rows.slice(0, 30)) {
    const line = r.slice(0, 10).join(' | ')
    if (line.trim()) console.log('  ' + line.slice(0, 150))
  }
  if (rows.length > 30) console.log(`  …另 ${rows.length - 30} 行`)
}
