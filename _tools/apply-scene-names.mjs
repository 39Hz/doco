// 把 88 个场景的中文名写回 manifest。
//
// 命名来源分两级（等级不同，写法也不同）：
//   · **official（11 个）**：归档 `多克多比专区资料素材\场景\` 下有 **12 张带官方中文名的场景原图**
//     （云中城堡/图书馆/城堡大厅/城堡走道/城堡郊外/智慧学堂/熔岩池/燃烧瀑布/空中蔓步/藤顶风光，
//      以及 `多克多比新场景图\` 的 光暗峡谷/布拉德矿坑）。它们是 1600×933 等分辨率，
//     **宽高比与我们的 960×560 完全一致（1.714）**，但字节不同（我们的图被重编码过），
//     所以按内容 hash 匹配是 0 命中。
//     改用 `_tools/match-official-scenes.mjs` 做**感知比对**（32×18 灰度签名，均值/标准差归一化）：
//     其中 11 张的距离 0.001~0.211、第二名 0.35~0.79（**差 1.5~200 倍**）→ 采信为同一张图并改用**官方名**。
//     这些还逐张**用眼睛复核**过（图书馆=环形书架、智慧学堂=魔法阵书桌、光暗峡谷=一半幽暗一半明亮）。
//     ⚠️ 另 5 张（云中城堡/城堡大厅/燃烧瀑布/幽水宫/邪力宫殿）距离 0.42~0.74、且与第二像几乎相同 **没对上** → 不猜，保持派生名。
//   · derived（其余 80 个）：逐张打开 assets/scenes/scene_*.jpg 全分辨率核对后由本项目命名。
//
// 注意 #21 是 2013 台服宣传主视觉（"2013超Q变身对战网游"），不是游戏内场景，
// 但游戏把它当标题背景用，所以名字取「变身海报」。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const manPath = path.join(ROOT, 'assets', 'manifest.json')
const man = JSON.parse(fs.readFileSync(manPath, 'utf8'))

// ---- official：来自归档里带官方名的场景原图（感知比对 + 人工复核）----
// 【第 62 轮新增 89–93】这 5 个是 BLOCKED B14 登记的那 5 个"官方图在、我们 88 张里没有"的场景。
// 它们**不是比对出来的**（d=0 表示"用的就是这张原图本身"）：
// 场景图就是归档那张官方原图，转成 960×560 得到的。所以名字是**直接取自官方文件名**。
const OFFICIAL = {
  33: { name: '布拉德矿坑', src: '多克多比新场景图/布拉德矿坑.jpg', d: 0.211 },
  85: { name: '征服平原', src: '多克多比新场景图/天空裂缝/征服平原.jpg', d: 0.002 },
  87: { name: '黑暗裂缝', src: '多克多比新场景图/天空裂缝/黑暗裂缝.jpg', d: 0.116 },
  28: { name: '城堡郊外', src: '场景/城堡郊外.png', d: 0.043 },
  32: { name: '智慧学堂', src: '场景/智慧学堂.png', d: 0.044 },
  39: { name: '空中蔓步', src: '场景/空中蔓步.png', d: 0.044 },
  42: { name: '图书馆', src: '场景/图书馆.png', d: 0.082 },
  43: { name: '城堡走道', src: '场景/城堡走道.png', d: 0.053 },
  44: { name: '光暗峡谷', src: '多克多比新场景图/光暗峡谷.jpg', d: 0.029 },
  50: { name: '藤顶风光', src: '场景/藤顶风光.png', d: 0.039 },
  57: { name: '熔岩池', src: '场景/熔岩池.png', d: 0.032 },
  // 第 62 轮：B14 的 5 个（场景图 = 官方原图本身，名字 = 官方文件名）
  89: { name: '云中城堡', src: '场景/云中城堡.png', d: 0 },
  90: { name: '城堡大厅', src: '场景/城堡大厅.png', d: 0 },
  91: { name: '燃烧瀑布', src: '场景/燃烧瀑布.png', d: 0 },
  92: { name: '幽水宫', src: '多克多比新场景图/天空裂缝/幽水宫.jpg', d: 0 },
  93: { name: '邪力宫殿', src: '多克多比新场景图/天空裂缝/邪力宫殿.jpg', d: 0 },
}

const NAMES = {
  1: '珊瑚浅滩', 2: '水晶喷泉', 3: '熔岩晶簇', 4: '圣殿庭园', 5: '游乐园街', 6: '蘑菇树屋',
  7: '荧光洞窟', 8: '瀑布林间', 9: '彩石小镇', 10: '奇幻嘉年华', 11: '王座正殿', 12: '魔法药屋',
  13: '金晶矿洞', 14: '糖果工坊', 15: '毒沼营地', 16: '皇家卧房', 17: '机械车间', 18: '王座大殿',
  19: '晶石加工厂', 20: '地下宝库', 21: '变身海报', 22: '荒废祭坛', 23: '纪念庭园', 24: '仙境山门',
  25: '元素之门', 26: '白石圣殿', 27: '丛林石梯', 28: '城堡郊外', 29: '石镇喷泉', 30: '紫叶晶坛',
  31: '勇者竞技场', 32: '智慧学堂', 33: '布拉德矿坑', 34: '星光玩偶屋', 35: '星旗赛场', 36: '巨叶浮岛',
  37: '蓝晶洞窟', 38: '金币兑换所', 39: '空中蔓步', 40: '巫师药屋', 41: '空间实验舱', 42: '图书馆',
  43: '城堡走道', 44: '光暗峡谷', 45: '城堡宴会厅', 46: '五行裁缝铺', 47: '熔岩晶窟', 48: '云海星道',
  49: '飞船驾驶舱', 50: '藤顶风光', 51: '星辰祭坛', 52: '露天剧场', 53: '岩窟古道', 54: '南山石径',
  55: '生物实验室', 56: '熔岩索道', 57: '熔岩池', 58: '菌菇密林', 59: '烈焰书斋', 60: '落日沼泽',
  61: '晶石矿洞', 62: '浮空群岛图', 63: '图腾石洞', 64: '星舰走廊', 65: '莲叶湿地', 66: '琥珀矿洞',
  67: '齿轮浮岛', 68: '矿道岔口', 69: '月夜农庄', 70: '石阵广场', 71: '黏液工坊', 72: '藏书馆',
  73: '月牙晶窟', 74: '补给营地', 75: '篝火营地', 76: '彩虹浮岛', 77: '糖果雪原', 78: '月夜村舍',
  79: '爪印集市', 80: '烽火哨台', 81: '圣诞雪村', 82: '海底遗迹', 83: '幽蓝晶洞', 84: '金杯竞技场',
  85: '征服平原', 86: '王城广场', 87: '黑暗裂缝', 88: '地穴培育舱',
  // 第 62 轮：BLOCKED B14 的 5 个官方场景（图与名都直接来自归档官方原图）
  89: '云中城堡', 90: '城堡大厅', 91: '燃烧瀑布', 92: '幽水宫', 93: '邪力宫殿',
}

// 自检：official 表的编号必须真的存在，且名字与 NAMES 一致（避免只改一处）
for (const [id, o] of Object.entries(OFFICIAL)) {
  if (NAMES[id] !== o.name) {
    console.error(`★ official 表与 NAMES 不一致：#${id} official=${o.name} 但 NAMES=${NAMES[id]}`)
    process.exit(1)
  }
  if (!man.scenes.some((s) => s.id === Number(id))) {
    console.error(`★ official 表引用了不存在的场景 #${id}`)
    process.exit(1)
  }
}
console.log(`official 命名 ${Object.keys(OFFICIAL).length} 个（来自归档里的官方命名原图）`)

// 校验：数量、重复、长度
const ids = Object.keys(NAMES).map(Number).sort((a, b) => a - b)
console.log('命名条数: ' + ids.length)
const missing = man.scenes.map((s) => s.id).filter((id) => !NAMES[id])
if (missing.length) console.log('★ 缺命名: ' + missing.join(', '))
const seen = new Map()
const dups = []
for (const [id, n] of Object.entries(NAMES)) {
  if (seen.has(n)) dups.push(n + '（#' + seen.get(n) + ' 与 #' + id + '）')
  seen.set(n, id)
}
if (dups.length) console.log('★ 重名: ' + dups.join('；'))
else console.log('无重名 ✓')
const badLen = Object.entries(NAMES).filter(([, n]) => n.length < 2 || n.length > 6)
if (badLen.length) console.log('★ 长度不合规: ' + badLen.map(([i, n]) => '#' + i + '=' + n).join(' '))
else console.log('长度 2~6 字 ✓')

// 写回 manifest（保留原字段，只改 title；desc 也顺手补一句更有用的）
// 同时**把来源等级落到数据里**：official 的 8 个标 conf=official 并写明比对的是哪张原图，
// 其余标 derived —— 这样"哪几个有官方名"是能被程序读出来的，而不是只存在于本脚本里。
let changed = 0
let officialStamped = 0
for (const s of man.scenes) {
  const n = NAMES[s.id]
  if (!n) continue
  const old = s.title
  s.title = n
  if (OFFICIAL[s.id]) {
    s.conf = 'official'
    s.nameSource = `归档原图 ${OFFICIAL[s.id].src}（感知比对 d=${OFFICIAL[s.id].d}，人工复核）`
    officialStamped++
  } else {
    s.conf = 'derived'
    s.nameSource = '按画面内容人工命名'
  }
  if (/待补充/.test(s.desc || '')) {
    s.desc = ''
  }
  if (old !== n) changed++
}
if (officialStamped !== Object.keys(OFFICIAL).length) {
  console.error(`★ 自检失败：应给 ${Object.keys(OFFICIAL).length} 个场景标 official，实际只标了 ${officialStamped}`)
  process.exit(1)
}
man.generated = new Date().toISOString()
man.note = (man.note ? man.note + ' ' : '') +
  `场景中文名已补齐（88 个），其中 ${Object.keys(OFFICIAL).length} 个是 official（取自归档里带官方名的场景原图）。`
fs.writeFileSync(manPath, JSON.stringify(man, null, 1), 'utf8')
console.log(`已写 manifest.json，改了 ${changed} 个标题，标了 ${officialStamped} 个 official`)

// 同步生成 .js 版本（游戏实际加载的是 assets/manifest.js）
const jsPath = path.join(ROOT, 'assets', 'manifest.js')
fs.writeFileSync(jsPath, 'window.__DKDbb_MANIFEST__ = ' + JSON.stringify(man) + ';\n', 'utf8')
console.log('已同步 assets/manifest.js')

// 顺便把场景命名对照表更新掉，方便用户核对与改名
const tbl = ['# 场景命名对照表', '',
  '由脚本按画面内容自动命名（每张场景图都人工核对过）。要改名字，直接改 `assets/manifest.json` 里对应场景的 `title` 字段，',
  '或在游戏内点击场景标题改名（改动存在浏览器本地）。', '',
  '| 编号 | 名称 | 原文件名 | 尺寸 |', '|---|---|---|---|']
for (const s of man.scenes) {
  const orig = (s.file || '').split('/').pop()
  tbl.push('| ' + s.id + ' | ' + s.title + ' | ' + orig + ' | ' + (s.w || '?') + 'x' + (s.h || '?') + ' |')
}
fs.writeFileSync(path.join(ROOT, '场景命名对照表.md'), tbl.join('\n') + '\n', 'utf8')
console.log('已更新 场景命名对照表.md')
