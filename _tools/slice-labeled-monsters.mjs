// 定稿怪物立绘映射。
//
// 依据：docs/sheets/_pairs_readable.png —— 38 组「图鉴编号 + 立绘」配对图，
// 编号清晰可读、立绘清楚。我把每只怪的立绘按外观识别出来，得到图鉴编号 → 怪兽表 ID。
//
// 关键认知（前面几轮一直错在这里）：
//   图鉴里 110001/110004/110008 等**格子是空的**（画着只有两只眼睛的淡影 + 一个"?"），
//   因为那些怪被官方"取消/暂缓制作"。真正有立绘的怪，编号是跳着的。
//   所以不能假设"第 n 个格子就是 11000n"，必须按图上的编号取。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng, encodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const png = decodePng(fs.readFileSync(path.join(ROOT, '多克多比专区资料素材', 'npc大全', '怪物图鉴.png')))
const { w: PW, data: PD } = png

const pairs = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', '_pairs.json'), 'utf8'))

// 从 _pairs_readable.png 上读出的「图鉴编号 → 我识别的怪物名」。
// 读法：图上每个格子有 #序号 + 编号 + 立绘；序号对应 pairs 数组下标。
const ATLAS_TO_NAME = {
  // 普通区（有立绘的）
  110002: '绿毒史莱姆', 110003: '绿毒粘液兽', 110005: '粘壳虫', 110006: '空灵树妖',
  110007: '晶石树妖', 110009: '阴孩', 110010: '吞噬魔', 110011: '克里奥佩特拉',
  110012: '堕落天使', 110013: '莲蓬童子', 110014: '怨灵', 110015: '鲤鱼将军',
  110016: '熔岩怪', 110018: '妮可鼠', 110019: '八爪鱼', 110020: '大蘑菇',
  110021: '赛贝猪', 110022: '赛罗特', 110023: '托米拉',
  110024: '（拼装采矿机）', 110025: '（武装采矿机）',
  119001: '雷暴鲁巴', 119002: '大幽灵', 119003: '猎犬酥皮', 119004: '螳螂阿力',
  119005: '贪食花', 119006: '卢比兽', 119007: '翼纹喵', 119008: '拉乌比I型',
  119009: '蛇面蝙蝠', 119010: '魔化多比', 119011: '魔化河伯', 119012: '魔龙',
  119013: '莎恩',
  119017: '（游戏未用）', 119018: '（游戏未用）', 119020: '（游戏未用）',
  119021: '（游戏未用）', 119022: '（游戏未用）', 119023: '（游戏未用）',
  119024: '（游戏未用）', 110030: '（游戏未用）',
}
// 用 pairs 的序号 → 编号（我按 _pairs_readable.png 逐格读出的编号）
const PAIR_ATLAS = {
  0: 110001, 1: 110004, 2: 110008, 3: 110002, 4: 110003, 5: 110005,
  6: 110006, 7: 110007, 8: 110009, 9: 110010, 10: 110011, 11: 110013,
  12: 110015, 13: 110018, 14: 110019, 15: 110020, 16: 110021, 17: 110022,
  18: 110023, 19: 110024, 20: 110025, 21: 110026, 22: 110030, 23: 119002,
  24: 119003, 25: 119004, 26: 119005, 27: 119006, 28: 119007, 29: 119008,
  30: 119012, 31: 119017, 32: 119018, 33: 119020, 34: 119021, 35: 119022,
  36: 119023, 37: 119024,
}

// 怪兽表：名字 → ID
const gd = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'gamedata.json'), 'utf8'))
const idByName = new Map(gd.monsters.map((m) => [m.name, Number(m.id)]))

// 图鉴里哪些编号的格子是空的（只有淡影 + "?"）
function fillOf(a) {
  let n = 0
  for (let y = a.y; y < a.y + a.h; y++) {
    for (let x = a.x; x < a.x + a.w; x++) if (PD[(y * PW + x) * 4 + 3] >= 24) n++
  }
  return n / (a.w * a.h)
}

const OUT = path.join(ROOT, 'assets', 'monsters', 'labeled')
fs.mkdirSync(OUT, { recursive: true })
const index = {}
let ok = 0, empty = 0
console.log('=== 按图鉴编号取名 ===')
for (const [kStr, atlasId] of Object.entries(PAIR_ATLAS)) {
  const k = Number(kStr)
  const p = pairs[k]
  if (!p) continue
  const name = ATLAS_TO_NAME[atlasId]
  const f = fillOf(p.art)
  if (!name || name.startsWith('（')) { continue }      // 游戏没用到的怪
  if (f < 0.2) { console.log('  跳过 图鉴' + atlasId + '：空占位格（填充率 ' + f.toFixed(2) + '）'); empty++; continue }
  const gid = idByName.get(name)
  if (!gid) { console.log('  ★ 图鉴' + atlasId + ' 名字「' + name + '」在怪兽表里找不到'); continue }
  const a = p.art
  const out = new Uint8Array(a.w * a.h * 4)
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      const s = ((a.y + y) * PW + (a.x + x)) * 4
      const d = (y * a.w + x) * 4
      out[d] = PD[s]; out[d + 1] = PD[s + 1]; out[d + 2] = PD[s + 2]; out[d + 3] = PD[s + 3]
    }
  }
  const file = 'assets/monsters/labeled/mon_' + gid + '.png'
  fs.writeFileSync(path.join(ROOT, file), encodePng(a.w, a.h, out))
  index[gid] = { name, element: (gd.monsters.find((m) => Number(m.id) === gid) || {}).element || '无', atlasId, file, w: a.w, h: a.h, fill: Number(f.toFixed(2)) }
  ok++
  console.log('  ' + String(gid).padEnd(6) + name.padEnd(11) + '← 图鉴' + atlasId + '  ' + a.w + '×' + a.h + '  填充率' + f.toFixed(2))
}
console.log('\n写出 ' + ok + ' 只，跳过空占位 ' + empty + ' 个')
const missing = gd.monsters.map((m) => Number(m.id)).filter((id) => !index[id])
if (missing.length) {
  console.log('未切到 ' + missing.length + ' 只: ' + missing.map((id) => id + '(' + (gd.monsters.find((m) => Number(m.id) === id) || {}).name + ')').join('、'))
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1), 'utf8')
