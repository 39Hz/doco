// 从 7k7k 语料里解析「多克多比技能——X」详情页，产出结构化技能表。
//
// 页面格式（实测确认）是一张字段表，标签行与值行交替：
//   技能图标 / 技能名称 石枪阵 / 技能属性 土系 / 技能范围 全体
//   技能消耗 0MP / 技能冷却 5 / 技能说明 召唤出许多石枪攻击面前的所有敌人
//   掉落场景 / 掉落怪物
//
// 输出： _web/skills.json
//   [{id, name, element, range, mp, cooldown, desc, dropScene, dropMonster, src}]
//
// 用法： node _tools/parse-skills.mjs
import fs from 'node:fs'
import path from 'node:path'

const SRC = '_web/7k7k/txt'
const OUT = '_web/skills.json'
const LABELS = [
  '技能图标', '技能名称', '技能属性', '技能范围', '技能消耗', '技能冷却',
  '技能说明', '掉落场景', '掉落怪物', '学习等级', '技能类型', '技能品质',
  '获得方式', '适合多比',
]
const LABEL_SET = new Set(LABELS)

// 元素名归一化：原文有「土系」「火属性」等写法
const ELEM = [
  [/火/, '火'], [/水|冰/, '水'], [/土|岩|地/, '土'], [/风|雷|电/, '风'],
  [/光|圣/, '光'], [/暗|影|魔/, '暗'], [/毒/, '毒'], [/物理|力量/, '物理'],
]
function normElem(s) {
  if (!s) return ''
  for (const [re, v] of ELEM) if (re.test(s)) return v
  return s.trim()
}
function num(s) {
  if (s == null) return null
  const m = String(s).match(/-?\d+/)
  return m ? Number(m[0]) : null
}

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.txt'))
const skills = []
const problems = []

for (const f of files) {
  const raw = fs.readFileSync(path.join(SRC, f), 'utf8')
  const first = raw.split('\n', 1)[0]
  const tm = first.match(/^【多克多比技能[—\-－]{1,2}(.+?)】/)
  if (!tm) continue
  const titleName = tm[1].trim()

  // 归一成「非空行」数组
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  // 找到字段区起点（'技能图标' 或 '技能名称' 第一次出现的位置，取靠后的那次以跳过标题）
  let start = -1
  for (let i = 0; i < lines.length; i++) if (lines[i] === '技能图标' || lines[i] === '技能名称') start = i
  if (start < 0) { problems.push({ f, why: '无字段区' }); continue }

  // 标签 → 值（值 = 到下一个标签前的所有行）
  const fields = {}
  let cur = null
  for (let i = start; i < lines.length; i++) {
    const l = lines[i]
    if (LABEL_SET.has(l)) { cur = l; fields[cur] = []; continue }
    if (cur) {
      // 正文结束后会跟一堆导航；遇到明显噪声就停
      if (/^(上一篇|下一篇|分享到|相关专题|小游戏|版权声明|热门专题)/.test(l)) break
      fields[cur].push(l)
    }
  }
  const val = (k) => (fields[k] ? fields[k].join(' ').trim() : '')
  const name = val('技能名称') || titleName
  const s = {
    id: Number(f.replace('.txt', '')),
    name,
    element: normElem(val('技能属性')),
    elementRaw: val('技能属性'),
    range: val('技能范围'),
    mp: num(val('技能消耗')),
    cooldown: num(val('技能冷却')),
    desc: val('技能说明'),
    dropScene: val('掉落场景'),
    dropMonster: val('掉落怪物'),
    src: `7k7k/${f}`,
  }
  if (!s.name) { problems.push({ f, why: '无名称' }); continue }
  skills.push(s)
}

skills.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(skills, null, 1), 'utf8')

// ---------- 自检与报表 ----------
console.log(`扫描 ${files.length} 篇 → 解析出技能 ${skills.length} 个（问题 ${problems.length}）`)
if (problems.length) console.log('  问题样本: ' + JSON.stringify(problems.slice(0, 5)))
if (skills.length < 30) { console.error('!! 技能数过少，格式可能变了'); process.exit(1) }

const withElem = skills.filter((s) => s.element).length
const withMp = skills.filter((s) => s.mp !== null).length
const withCd = skills.filter((s) => s.cooldown !== null).length
const withDesc = skills.filter((s) => s.desc).length
const withDrop = skills.filter((s) => s.dropMonster || s.dropScene).length
console.log(`字段完整度: 属性 ${withElem}  消耗 ${withMp}  冷却 ${withCd}  说明 ${withDesc}  掉落 ${withDrop}`)
if (withDesc / skills.length < 0.6) { console.error('!! 说明字段缺失过多'); process.exit(1) }

const byElem = {}
for (const s of skills) byElem[s.element || '?'] = (byElem[s.element || '?'] || 0) + 1
console.log('元素分布: ' + JSON.stringify(byElem))
const byRange = {}
for (const s of skills) byRange[s.range || '?'] = (byRange[s.range || '?'] || 0) + 1
console.log('范围分布: ' + JSON.stringify(byRange))
const mps = skills.filter((s) => s.mp !== null).map((s) => s.mp)
console.log(`消耗区间: ${Math.min(...mps)} ~ ${Math.max(...mps)} MP`)
const cds = skills.filter((s) => s.cooldown !== null).map((s) => s.cooldown)
console.log(`冷却区间: ${Math.min(...cds)} ~ ${Math.max(...cds)} 回合`)

console.log('\n样本（前 25 个）:')
for (const s of skills.slice(0, 25)) {
  console.log(`  ${s.name.padEnd(7, '　')} ${(s.elementRaw || '-').padEnd(5, '　')} ${(s.range || '-').padEnd(4, '　')} ${String(s.mp ?? '-').padStart(4)}MP CD${String(s.cooldown ?? '-').padStart(2)}  ${s.desc.slice(0, 30)}`)
}
const none = skills.filter((s) => !s.desc)
if (none.length) console.log(`\n无说明 ${none.length} 个: ` + none.slice(0, 10).map((s) => s.name).join('、'))
