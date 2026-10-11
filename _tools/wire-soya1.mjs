// 把「索亚」系统接进游戏。
//   1) game.html 加载 assets/soya.js
//   2) data.js 加 D.SOYA / D.soya()（惰性，和 FORMS 同一套写法）
//   3) 存档加 soya（已拥有）与 soyaActive（出战的那只）
//   4) 新增索亚面板（P 键）：左边立绘+官方设定，右边 3×2 格子选出战
//   5) 战斗：索亚站在主人旁边，每回合按自己的机制起作用
import fs from 'node:fs'

let n = 0
const rep = (file, a, b, label) => {
  let s = fs.readFileSync(file, 'utf8')
  if (!s.includes(a)) { console.log('✗ ' + label); return }
  fs.writeFileSync(file, s.replace(a, b), 'utf8'); n++; console.log('✓ ' + label)
}

// ---- 1) 加载 ----
rep('game.html',
  '<script src="assets/items.js"></script>',
  '<script src="assets/items.js"></script>\n<script src="assets/soya.js"></script>',
  'game.html 加载 soya.js')

// ---- 2) 数据层 ----
rep('game/tables/data.js',
  "  // ================= 道具 =================",
  [
    '  // ================= 索亚（陪伴宠物）=================',
    '  // 编号与官方名来自图鉴4.3的索亚区，设定文案来自 docs/游戏数据/索亚介绍.xlsx，',
    '  // 立绘来自 多克多比专区资料素材/索亚/。同样惰性解析（soya.js 排在 data.js 之后）。',
    "  let _soyaCache = null",
    '  D.soya = function () {',
    '    if (_soyaCache) return _soyaCache',
    "    const src = (typeof globalThis !== 'undefined' && globalThis.__DKDbb_SOYA__) ||",
    "      (typeof window !== 'undefined' && window.__DKDbb_SOYA__)",
    '    _soyaCache = (src && src.soya) || []',
    '    return _soyaCache',
    '  }',
    "  Object.defineProperty(D, 'SOYA', { get: () => D.soya() })",
    '  D.soyaById = (id) => D.soya().find((s) => s.id === Number(id)) || null',
    '',
    '  // ================= 道具 =================',
  ].join('\n'),
  'data.js 加 D.SOYA')

// ---- 3) 存档字段 ----
rep('game/engine/engine.js',
  '      items: {},\n      gold: 0,',
  '      items: {},\n      soya: [],          // 已拥有的索亚编号\n      soyaActive: null,  // 出战的索亚编号\n      gold: 0,',
  'engine.js 存档加 soya 字段')

console.log(`\n共改 ${n} 处`)
