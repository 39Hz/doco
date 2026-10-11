// 为什么 12 只怪被跳过？逐个打印判定过程。
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const png = decodePng(fs.readFileSync(path.join(ROOT, '多克多比专区资料素材', 'npc大全', '怪物图鉴.png')))
const { w: PW, data: PD } = png
const pairs = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools', '_pairs.json'), 'utf8'))

// slice 脚本里用的两张表（复制过来，保持一致）
const ATLAS_TO_NAME = {
  110002: '绿毒史莱姆', 110003: '绿毒粘液兽', 110005: '粘壳虫', 110006: '空灵树妖',
  110007: '晶石树妖', 110009: '阴孩', 110010: '吞噬魔', 110011: '克里奥佩特拉',
  110012: '堕落天使', 110013: '莲蓬童子', 110014: '怨灵', 110015: '鲤鱼将军',
  110016: '熔岩怪', 110017: '火球怪', 110018: '妮可鼠', 110019: '八爪鱼', 110020: '大蘑菇',
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
const PAIR_ATLAS = {
  0: 110001, 1: 110004, 2: 110008, 3: 110002, 4: 110003, 5: 110005,
  6: 110006, 7: 110007, 8: 110009, 9: 110010, 10: 110011, 11: 110013,
  12: 110015, 13: 110018, 14: 110019, 15: 110020, 16: 110021, 17: 110022,
  18: 110023, 19: 110024, 20: 110025, 21: 110026, 22: 110030, 23: 119002,
  24: 119003, 25: 119004, 26: 119005, 27: 119006, 28: 119007, 29: 119008,
  30: 119012, 31: 119017, 32: 119018, 33: 119020, 34: 119021, 35: 119022,
  36: 119023, 37: 119024,
}
const gd = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'gamedata.json'), 'utf8'))
const idByName = new Map(gd.monsters.map((m) => [m.name, Number(m.id)]))

function fillOf(a) {
  let n = 0
  for (let y = a.y; y < a.y + a.h; y++) {
    for (let x = a.x; x < a.x + a.w; x++) if (PD[(y * PW + x) * 4 + 3] >= 24) n++
  }
  return n / (a.w * a.h)
}

console.log('k | 图鉴号 | 名字 | 填充率 | 游戏ID | 判定')
for (const [kStr, atlasId] of Object.entries(PAIR_ATLAS)) {
  const k = Number(kStr)
  const p = pairs[k]
  if (!p) { console.log(k + ' | ' + atlasId + ' | - | - | - | pairs[' + k + '] 不存在'); continue }
  const name = ATLAS_TO_NAME[atlasId]
  const f = fillOf(p.art)
  const gid = name ? idByName.get(name) : undefined
  let verdict = '写入'
  if (!name) verdict = '★ ATLAS_TO_NAME 里没有这个编号'
  else if (name.startsWith('（')) verdict = '跳过（游戏未用）'
  else if (f < 0.2) verdict = '跳过（空占位格）'
  else if (!gid) verdict = '★ 怪兽表里没有「' + name + '」'
  console.log(k + ' | ' + atlasId + ' | ' + (name || '?') + ' | ' + f.toFixed(2) + ' | ' + (gid || '-') + ' | ' + verdict)
}
