// 读 `docs/游戏数据/多比技能列表.xlsx` —— 看技能表的 icon 列真实内容
// （游戏用 name → icon 找图标，所以要在这里改，或加一层映射）
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve('.')
const XLSX = path.join(ROOT, 'docs/游戏数据/多比技能列表.xlsx')
const PY = path.join(ROOT, '_tools', 'py', 'python.exe')
const TMP = path.join(ROOT, '_tmp_test_out')
fs.mkdirSync(TMP, { recursive: true })
const OUT = path.join(TMP, 'skill-namelist.json')
const SCR = path.join(TMP, '_read_namelist.py')

fs.writeFileSync(SCR, `
import openpyxl, json
wb = openpyxl.load_workbook(r"${XLSX.replace(/\\/g, '/')}", data_only=True)
out = {}
for ws in wb.worksheets:
    rows = []
    for r in ws.iter_rows(values_only=True):
        rows.append(["" if c is None else str(c) for c in r])
    out[ws.title] = rows[:400]
open(r"${OUT.replace(/\\/g, '/')}", "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False))
print("ok")
`, 'utf8')

try { execFileSync(PY, [SCR], { stdio: 'inherit', cwd: ROOT, env: { ...process.env, TMP, TEMP: TMP } }) }
catch (e) { console.log(`python 失败：${String(e.message).slice(0, 160)}`); process.exit(1) }

const data = JSON.parse(fs.readFileSync(OUT, 'utf8'))
for (const [sheet, rows] of Object.entries(data)) {
  console.log(`\n=== 工作表「${sheet}」 ${rows.length} 行 ===`)
  for (const r of rows.slice(0, 12)) {
    console.log('  ' + r.slice(0, 9).map((c, i) => `[${i}]${String(c).slice(0, 20)}`).join(' '))
  }
  // icon 列（第 4 列，0-based）的全部取值
  const icons = rows.slice(3).map((r) => (r[4] || '').trim()).filter(Boolean)
  const uniq = [...new Set(icons)]
  console.log(`\n  icon 列（索引 4）：非空 ${icons.length} 个，去重 ${uniq.length} 个`)
  console.log(`  样本：${uniq.slice(0, 20).join('、')}`)
  const names = rows.slice(3).map((r) => (r[2] || '').trim()).filter(Boolean)
  console.log(`  技能名：非空 ${names.length} 个，去重 ${new Set(names).size} 个`)
  console.log(`  样本：${[...new Set(names)].slice(0, 20).join('、')}`)
}
