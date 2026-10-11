// v1.0 符合度清单的新鲜度测试。
//
// 为什么需要它：本仓库已经两次栽在"文档里的数字过期"上 ——
// 保真度报告的表 B 手写过一次、结论句写死过一次（都是后面才发现对不上）。
// v1.0 清单是**给用户验收用的**，它一旦过期，等于拿一份假账去交差。
// 所以这里把清单里的关键数字与**数据源**逐个钉在一起：对不上就红。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { T } from './game-harness.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const D = W.DKDbbData
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }

console.log('== v1.0 符合度清单 新鲜度 ==')
const p = path.join(ROOT, 'docs', 'v1.0符合度清单.md')
check(fs.existsSync(p), '清单文件存在（docs/v1.0符合度清单.md）')
const doc = fs.readFileSync(p, 'utf8')

// ---- 1. 分类计数必须自洽，且与表里的行数一致 ----
{
  const m = doc.match(/\| 对齐 \| (\d+) \| ([\d.]+)% \|/)
  const m2 = doc.match(/\| 推算占位 \| (\d+) \| ([\d.]+)% \|/)
  const m3 = doc.match(/\| 缺依据 \| (\d+) \| ([\d.]+)% \|/)
  check(!!m && !!m2 && !!m3, '就绪度表三行都在')
  if (m && m2 && m3) {
    const a = +m[1], d = +m2[1], s = +m3[1]
    const total = doc.match(/## 1\. 就绪度（共 (\d+) 项）/)?.[1]
    check(a + d + s === +total, `三档之和 = 总项数（${a}+${d}+${s} = ${total}）`)
    // 逐项清单里标了 **对齐** 等的行数必须与就绪度表一致
    // 注意：只数「## 2. 逐项清单」之后的部分 —— 第 0 节的**定义表**里也有这三个词，
    // 一开始没切分，于是三条各多算 1（9/13/6），是这条测试自己把它抓出来的。
    const body = doc.slice(doc.indexOf('## 2.'))
    const inTable = (body.match(/\*\*对齐\*\*/g) || []).length
    const inTable2 = (body.match(/\*\*推算占位\*\*/g) || []).length
    const inTable3 = (body.match(/\*\*缺依据\*\*/g) || []).length
    check(inTable === a && inTable2 === d && inTable3 === s,
      `逐项清单的行数与就绪度表一致（${inTable}/${inTable2}/${inTable3}）`)
  }
}

// ---- 2. 关键数字必须与数据源一致 ----
{
  const n = D.MINIGAMES.length
  check(doc.includes(`${n} 个的名单与规则`), `小游戏条数 ${n} 与运行时一致`,
    doc.match(/(\d+) 个的名单与规则/)?.[1])
  const forms = D.forms().length
  check(doc.includes(`${forms} 只可用`), `多比形态可用数 ${forms} 与运行时一致`)
  const official = MAN.scenes.filter((s) => s.conf === 'official').length
  check(doc.includes(`${official}/88 已官方`), `官方场景名 ${official}/88 与 manifest 一致`,
    doc.match(/(\d+)\/88 已官方/)?.[1])
  const devs = (fs.readFileSync(path.join(ROOT, 'docs', 'deviations.md'), 'utf8').match(/\| V\d+ \|/g) || []).length
  check(doc.includes(`deviations.md 已记 ${devs} 条`), `偏离条数 ${devs} 与 deviations.md 一致`,
    doc.match(/deviations\.md 已记 (\d+) 条/)?.[1])
  const tests = fs.readdirSync(path.join(ROOT, '_tools')).filter((f) => /^test-.*\.mjs$/.test(f)).length
  check(doc.includes(`${tests} 个测试文件`), `测试文件数 ${tests} 与 _tools 一致`,
    doc.match(/(\d+) 个测试文件/)?.[1])
  const status = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'systems-status.json'), 'utf8'))
  const impl = status.systems.filter((s) => s.impl).length
  check(doc.includes(`${impl}/${status.systems.filter((s) => s.rule === 'found' || s.rule === 'not-shipped').length} 个有依据的已实现`),
    `周边系统实现数 ${impl} 与 systems-status.json 一致`)
}

// ---- 3. 「完全符合原版」的定义必须写在清单里（防止有人把它简化成一句口号）----
{
  check(/不许拿推算值冒充原版/.test(doc), '清单写明了"不许拿推算值冒充原版"（R1/R9）')
  check(/离 v1\.0 的距离/.test(doc), '清单给出了"离 v1.0 的距离"')
  check(/D6/.test(doc), '永久缺失的问题被指到决策点（D6）')
}

console.log(`\n结果: 通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
