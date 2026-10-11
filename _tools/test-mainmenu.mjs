// 主菜单 + 三存档槽。
//
// 用户反馈：「加载进入的主页面重新做一下不太行，然后进去可以加载存档什么的」
// 原来标题页只有一张背景图 + 一行"按空格开始新的冒险"，按下去直接开新局，读不了档。
// 本测试验证新的主菜单与存档槽真的能用，而不只是画出来了。
import { T } from './game-harness.mjs'

const t = T
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
const save = W.DKDbb.save
let pass = 0, fail = 0
const check = (c, s) => { console.log((c ? '  ✓ ' : '  ✗ ') + s); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

// ---------- 1) 主菜单存在且有内容 ----------
section('1) 主菜单结构')
S().mode = 'title'
t.step(2)
const items = DBG().titleItems()
check(items.length >= 5, `主菜单 ${items.length} 项：${items.map((i) => i.label).join(' / ')}`)
check(items.some((i) => i.id === 'continue'), '有「继续/开始冒险」')
check(items.some((i) => i.id === 'load'), '有「读取存档」')
check(items.some((i) => i.id === 'new'), '有「新的冒险」')
check(items.some((i) => i.id === 'help'), '有「操作说明」')
check(items.some((i) => i.id === 'about'), '有「关于本作」')
const menu = DBG().titleMenu
check(menu && menu.view === 'main', `初始视图 = ${menu ? menu.view : '-'}`)
check(Array.isArray(menu.mainRects) && menu.mainRects.length === items.length,
  `菜单项矩形已生成 ${menu.mainRects ? menu.mainRects.length : 0} 个（鼠标点击要靠它）`)

// ---------- 2) 键盘导航 ----------
section('2) 键盘导航与返回')
const sel0 = menu.sel
t.key('ArrowDown'); t.step(1)
check(DBG().titleMenu.sel !== sel0 || items.length === 1, `方向键改变选中项（${sel0} → ${DBG().titleMenu.sel}）`)
t.key('ArrowUp'); t.step(1)
check(DBG().titleMenu.sel === sel0, `再按上键回到原项（${DBG().titleMenu.sel}）`)
// 进入操作说明再 Esc 返回
await DBG().titleAction('help')
t.step(1)
check(DBG().titleMenu.view === 'help', `进入操作说明（view=${DBG().titleMenu.view}）`)

// ---- 操作说明不许画到屏幕外（第 43 轮加的守卫）----
// 起因：这个面板原来是一列、行高写死 28。功能一路加，到 18 行时
// 132 + 17×28 = 608 > 画面高 560 —— **最后 4 行（杂货铺/结印/全屏/返回）根本看不见**，
// 而且没有任何测试发现（文字不是"面板"，遮挡检查扫不到）。加"难度"那行时才注意到。
{
  const L = DBG().helpLayout()
  const rows = DBG().helpRows()
  const lastRow = L.top + (L.perCol - 1) * L.lineH
  check(rows.length === L.rows, `版式里的行数 ${L.rows} 与实际行数 ${rows.length} 一致`)
  check(L.perCol * 2 >= L.rows, `${L.rows} 行分两列，每列 ${L.perCol} 行，够放`)
  check(lastRow < L.bottom, `最后一行的基线 ${lastRow.toFixed(0)} 在页脚安全线 ${L.bottom} 以上`)
  check(lastRow < 560 - 60, `最后一行的基线 ${lastRow.toFixed(0)} 在画面内（高 560）`)
  // 每一行的**标签**不能宽到压住同一行的值（标签区宽度就是 labelW）
  const wideLabel = rows.filter(([k]) => k.length * L.size > L.labelW)
  check(wideLabel.length === 0,
    `没有标签挤到值那一栏（labelW=${L.labelW}；超宽的：${wideLabel.map((r) => r[0]).join('、') || '无'}）`)
  // 值不能超出它那一列（列宽 colW，从 labelW 起画）
  const wideVal = rows.filter(([, v]) => v.length * L.size > L.colW - L.labelW)
  check(wideVal.length === 0,
    `没有值超出列宽（可用 ${L.colW - L.labelW}px；超出的：${wideVal.map((r) => r[1]).join('、') || '无'}）`)
  // 列表里必须有"难度"这条（第 43 轮的功能，玩家要能找到它）
  check(rows.some((r) => /难度/.test(r[0]) && /N/.test(r[1])),
    `操作说明里有难度切换（${(rows.find((r) => /难度/.test(r[0])) || []).join(' → ')}）`)
}

t.key('Escape'); t.step(1)
check(DBG().titleMenu.view === 'main', `Esc 返回主菜单（view=${DBG().titleMenu.view}）`)

// ---------- 3) 存档槽：写入 / 列举 / 读取 / 删除 ----------
section('3) 三个存档槽')
const slots0 = await DBG().listSlots()
check(slots0.length === save.SLOTS, `存档槽数量 ${slots0.length}（SLOTS=${save.SLOTS}）`)
check(slots0.every((s) => 'slot' in s && 'info' in s), '每槽都带 slot 与 info 字段')

// summarize：全新存档（没有进度）应当算空槽
const fresh = JSON.parse(JSON.stringify(save.defaults))
check(save.summarize(fresh) === null, '全新存档被判定为空槽（不会把默认值当成有进度）')
const prog = Object.assign({}, fresh, { started: true, level: 7, gold: 321, visited: ['a', 'b', 'c'], form: '费尔·凌 多比' })
const sum = save.summarize(prog)
check(!!sum && sum.level === 7 && sum.gold === 321 && sum.visited === 3,
  `有进度的存档摘要正确（Lv.${sum ? sum.level : '-'} 金币 ${sum ? sum.gold : '-'} 探索 ${sum ? sum.visited : '-'}）`)

// 写入槽 2
save.data.level = 7
save.data.gold = 321
save.data.visited = ['a', 'b', 'c']
save.data.started = true
await DBG().saveToSlot(2)
let slots = await DBG().listSlots()
const s2 = slots.find((s) => s.slot === 2)
check(!!s2.info && s2.info.level === 7, `槽 2 已写入并可读回（Lv.${s2.info ? s2.info.level : '-'}）`)
check(s2.info && s2.info.gold === 321, `槽 2 金币正确 ${s2.info ? s2.info.gold : '-'}`)

// 改掉内存里的值，再读回槽 1（应当恢复写档前的样子）
save.data.level = 99
save.data.gold = 0
await DBG().saveToSlot(1)
save.data.level = 55
await DBG().useSlot(1)
check(save.data.level === 99, `读回槽 1 覆盖了内存里的改动（99 → ${save.data.level}）`)
await DBG().useSlot(2)
check(save.data.level === 7, `读回槽 2 得到它自己的进度（Lv.${save.data.level}）`)

// 新档
await DBG().newGame(3)
check(save.data.level === 1, `「新的冒险」把等级重置为 ${save.data.level}`)
check(save.data.started === true, '新档标记为已开局')
slots = await DBG().listSlots()
check(!!slots.find((s) => s.slot === 3).info, '槽 3 现在有存档')
check(DBG().currentSlot() === 3, `当前槽切到 ${DBG().currentSlot()}`)

// 删除
await DBG().deleteSlot(3)
slots = await DBG().listSlots()
check(!slots.find((s) => s.slot === 3).info, '槽 3 已删除（回到空槽）')

// ---------- 4) 读档后运行时状态要跟着变 ----------
section('4) 读档后形态/血量等运行时状态同步')
const forms = W.DKDbbData.FORMS
const other = forms.find((f) => f.name !== save.data.form) || forms[0]
await DBG().useSlot(1)
save.data.form = other.name
save.data.level = 12
DBG().applySave()
check(S().form && S().form.name === other.name, `读档后形态跟着换（${S().form ? S().form.name : '-'}）`)
check(save.data.maxHp > 0, `读档后血量上限被重新推导（maxHp=${save.data.maxHp}）`)
check(save.data.level === 12, `等级为存档里的 ${save.data.level}`)

// ---------- 5) 从主菜单进游戏 ----------
section('5) 从主菜单进入游戏')
S().mode = 'title'
t.step(2)
t.key(' '); t.step(4)
check(S().mode === 'worldmap', `主菜单按空格进入世界（mode=${S().mode}）`)
check(save.data.started === true, '进入世界后存档标记为已开局')

// 回到主菜单，确认"继续冒险"能再进一次
S().mode = 'title'
t.step(2)
const menu2 = DBG().titleMenu
check(menu2.view === 'main', '回到主菜单')
await DBG().titleAction('continue')
check(S().mode === 'worldmap', `「继续冒险」进入世界（mode=${S().mode}）`)

console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} 项，失败 ${fail} 项`)
if (fail) process.exit(1)
