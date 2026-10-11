// 按画面物体为**全部场景**分配归属岛，并自动校验覆盖完整性
// 用法: node bind-scenes.mjs <项目根>
//
// 分配依据：逐张查看每个场景的实际画面，按画面中的主要物体归类。
// 每个场景必须恰好归属一个岛，脚本会强制校验。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.argv[2] || '.')

// 分组：岛 id -> 场景编号数组
// 编号依据是逐张看图后的物体归类，注释里写的是判断依据
const GROUPS = {
  // 蓝顶石堡/水晶尖塔岛：大厅、内殿、图书馆、金库、居住区等建筑内部
  castle: [12, 18, 19, 26, 42, 68, 90],
  // 风化砂岩/干裂台地岛：遗迹、峡谷通道、矿工营地
  desert: [33, 44, 54, 65, 74, 75, 85],
  // 天使与猫形石像/黄星纹章岛：云端天空与星纹广场
  angel: [4, 25, 28, 35, 51, 84, 89],
  // 木质摊位/货箱/遮阳篷/齿轮建筑岛：集市、商店、工坊、厨房
  market: [10, 11, 14, 29, 32, 34, 36, 45, 46, 52, 53, 55, 72, 79],
  // 大片绿地/石板小径/灌木石堆岛：草原、树林、花园、野外小径
  wilds: [5, 6, 8, 9, 23, 30, 43, 49, 50, 62, 70, 76, 77, 82, 87],
  // 深红黑岩体/熔岩裂缝岛：火山、熔岩洞窟、锻造坊
  volcano: [13, 15, 39, 47, 56, 57, 59, 61, 63, 66, 80, 88, 91],
  // 珊瑚状岩层/贝壳形地貌岛：海底、水域、珊瑚、瀑布水池
  coral: [1, 3, 7, 16, 20, 22, 37, 40, 78, 92],
  // 蓝紫齿轮建筑岛：实验室、机械机关、蒸汽动力设施
  factory: [17, 41, 48, 58, 64, 69, 83],
  // 裸露灰岩台：地牢、废墟、幽暗岩窟、机关暗道
  rock: [21, 24, 27, 31, 60, 71, 81, 93],
  // 深绿树林/红瓦小屋岛：森林、丛林、树妖、木屋
  forest: [38, 67, 86],
  // 灰白岩块覆霜：冰霜、雪原、冻土、霜晶洞窟
  islet: [2, 73],
}

// ---------- 校验 ----------
const seen = new Map()
let dup = []
for (const [island, ids] of Object.entries(GROUPS)) {
  for (const id of ids) {
    if (seen.has(id)) dup.push(`scene_${id}: ${seen.get(id)} 与 ${island}`)
    else seen.set(id, island)
  }
}
const SCENE_MAX = Object.values(GROUPS).flat().reduce((m, n) => Math.max(m, n), 0)   // 不再写死 88
const all = Array.from({ length: SCENE_MAX }, (_, i) => i + 1)
const missing = all.filter((id) => !seen.has(id))
const outOfRange = [...seen.keys()].filter((id) => id < 1 || id > SCENE_MAX)

console.log('=== 校验 ===')
console.log(`  已分配: ${seen.size} / ${SCENE_MAX}`)
console.log(`  重复  : ${dup.length ? dup.join('  ') : '无 ✓'}`)
console.log(`  遗漏  : ${missing.length ? missing.join(', ') : '无 ✓'}`)
console.log(`  越界  : ${outOfRange.length ? outOfRange.join(', ') : '无 ✓'}`)
if (dup.length || missing.length || outOfRange.length) {
  console.error('\n✗ 分配不完整，未写入 world.js')
  process.exit(1)
}

// ---------- 写回 world.js ----------
const f = path.join(ROOT, 'world.js')
let src = fs.readFileSync(f, 'utf8')
let replaced = 0
for (const [island, ids] of Object.entries(GROUPS)) {
  // 匹配该岛的 scenes: [...] （在它自己的 id 之后的第一个 scenes 行）
  const re = new RegExp(`(id: '${island}'[\\s\\S]*?scenes: )\\[[^\\]]*\\]`)
  if (!re.test(src)) { console.error(`✗ 在 world.js 里找不到岛 ${island} 的 scenes 字段`); process.exit(1) }
  src = src.replace(re, `$1[${ids.join(', ')}]`)
  replaced++
}
fs.writeFileSync(f, src)

console.log(`\n=== 已写入 world.js（${replaced} 个岛）===`)
for (const [island, ids] of Object.entries(GROUPS)) {
  console.log(`  ${island.padEnd(9)} ${String(ids.length).padStart(2)} 个: ${ids.join(', ')}`)
}
