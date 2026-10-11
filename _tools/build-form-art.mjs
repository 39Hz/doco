// 为 11 个多比形态抽取「官方立绘」，供背包/变身与战斗画面使用。
//
// 背景：用户指出背包里「瑞比特·兔 多比」显示成了龙多比的样子，并要求**所有形态**都对应上官方形象。
// 依据来自 docs/游戏数据/多比名称和描述.xlsx 与 近期多比属性表.xlsx：
//   · 「动作组」列给出官方素材号（克罗=dobi_91001、费尔·凌=dobi_92001、沃特·空=dobi_93001…）
//   · 「描述」列写明了每只的官方设定（德拉科·龙=龙年限定版、艾斯·林=圣诞节限定版、
//     艾隆·垒=由土之力量衍生的钢之力量、瑞比特·兔=元宵节限定版）
//   · 厄斯·垒 / 温德·冽 的动作组原文就是「用未知图案代替」——原版就没给这两只画立绘
//
// 抠背景分两趟：
//   1) 从四边泛洪吃掉与边界色接近的区域（白底）
//   2) 再从已判定为背景的像素继续泛洪，吃掉**中性灰**(RGB 178,178,178 那一圈脚底投影)。
//      判据加了亮度下限 110，所以角色的黑色描边不会被吃穿。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { decodePng, encodePng, makeFramebuffer, PixelCtx } from './pixel-canvas.mjs'

const ROOT = path.resolve('.')
const OUT = path.join(ROOT, 'assets', 'forms', 'art')
const SHEET = path.join(ROOT, 'docs', 'sheets')
const CACHE = path.join(ROOT, '_tools', 'imgcache', 'formart')
fs.mkdirSync(CACHE, { recursive: true })

// 形态 -> 官方立绘。evidence 会写进 index.json，方便日后核对。
const MAP = [
  ['克罗', '多比形态素材/克罗多比.png', '同名官方立绘 4000×2333 RGBA'],
  // ⚠️ 指向的是 `_cleaned/` 里的副本，不是归档原件 —— 原件脚底有一圈**纯黑投影**，
  //  而共用流程的第二趟泛洪找的是"中性灰 RGB(178,178,178)"（官方立绘常见的投影色），
  //  这一张是纯黑、且角色描边也是纯黑 → 按颜色分不开。
  //  用 `_tools/deshadow-form-art.mjs` 对**这一张**做形态学腐蚀去投影（薄描边消失、厚黑块留下），
  //  产出放到 `多比形态素材/_cleaned/`，**不动共用流程**（另外 46 张都从那套流程过）。
  ['英雄多比', '多比形态素材/_cleaned/依斯特·英雄多比.png', '同名官方立绘 514×1095；原件纯黑脚底投影已用 deshadow 预处理去掉'],
  ['超级克罗', '多比形态素材/超级克罗多比.png', '同名官方立绘 2083×2333 RGBA'],
  // ⚠️ 「德拉科·龙」**故意不挂图**：归档里唯一与之相关的文件是 `龙多比.png` / `龙多比.jpg`，
  // 而这两张**解码后内容完全相同**（sha256 不同但像素一致 —— jpg 是从同一张转的）。
  // 同名映射更硬，所以那张图归「龙多比」（它还是存档的默认初始形态，必须有图）。
  // 硬要给两只挂同一张，就会出现"两只形态长得一模一样"——正是用户报过的那个 bug。
  // ★ 龙多比：存档默认初始形态（engine 默认 form='龙多比'），必须挂上图，
  //   否则主角 spriteDir=null，连待机动作都解析不出来，战斗里没有招式动画。
  ['龙多比', '多比形态素材/龙多比.png', '同名官方立绘（归档）'],
  ['费尔·凌', '多比形态素材/费尔·凌多比.png', '同名官方立绘 1667×2333 RGBA'],
  ['费尔·诺', '多比形态素材/费尔·诺多比.png', '同名官方立绘 495×875 RGBA'],
  ['艾斯·林', '多比形态素材/圣诞多比.png', '官方描述「圣诞节限定版多比」；素材名 圣诞多比'],
  ['沃特·空', '多比形态素材/沃特·空多比.png', '同名官方立绘 1667×2333 RGBA'],
  ['瑞比特·兔', '多比形态素材/1920/瑞比特·兔多比.png', '同名官方立绘 1920×3092 RGBA（用户报错的这只）'],
  // ⚠️ 「温德·冽」**第 31 轮起不再借图**。
  //   原先它借的是 `旋风多比.png`（理由：原表动作组写着「用未知图案代替」，
  //   官方自己没给专属图，而它的描述是「随心所欲的控制旋风」）。
  //   但归档里的 `旋风巨岩多比资料.xlsx` **把「旋风多比」当成一只独立形态在写**
  //   （有自己的昵称、长描述、专属技能与技能描述）—— 那张图理应归它。
  //   两者不能同时成立（会同图双挂 → 两只形态长得一模一样，正是用户最早报的 bug）。
  //   按"文件名归属优先"裁定：图归 旋风多比；温德·冽 如实标"归档里没有官方立绘"。
  //   依据与被撤掉的映射都记在 docs/deviations.md（V54）。
  ['艾隆·垒', '多比形态素材/钢铁多比.png', '官方描述「使用由土之力量衍生而成的钢之力量」；素材名 钢铁多比'],
  ['厄斯·垒', '多比形态素材/艾斯·垒 多比/艾斯·垒 多比.jpg', '原表动作组「用未知图案代替」；归档里名字只差一字的土系金甲立绘 艾斯·垒 多比'],

  // ---------- 第 30 轮新增：归档里一直有、但此前没接进管线的原版立绘 ----------
  // 全部来自官方素材归档 `多克多比专区资料素材\多比形态素材\`。
  // 这些**不是新画的、也不是推算的** —— 就是原版文件，只是以前没人把它接进来
  // （同源问题：嵌套子目录里漏了 6 个小游戏）。
  ['凤凰多比', '多比形态素材/凤凰多比.png', '同名官方立绘（归档）'],
  ['利刃多比', '多比形态素材/利刃多比.png', '同名官方立绘（归档）'],
  ['人鱼多比', '多比形态素材/人鱼多比.PNG', '同名官方立绘（归档）'],
  ['光多比', '多比形态素材/光多比暗多比/光多比/光多比1.png', '同名官方立绘（归档 光多比暗多比/光多比/）'],
  ['暗多比', '多比形态素材/光多比暗多比/暗多比/暗多比1.png', '同名官方立绘（归档 光多比暗多比/暗多比/）'],
  ['兔多比', '多比形态素材/兔多比.png', '同名官方立绘（归档）'],
  // ⚠️ 归档里还有一个 `风多比.png`，但**它不能挂**，两个原因：
  //   ① 形态表里没有「风多比」这只（只有 风狼多比 / 风灵多比），挂上就是孤儿（同 达鲁·龙 那次）；
  //   ② 它其实是个 **BMP 文件改了扩展名**（magic bytes = 42 4D "BM"），PNG 解码器读不了。
  // 全归档扫过一遍：8 个文件的扩展名与实际格式不符，形态素材目录里只有这一个。
  // 现在 build-form-art 会做魔数校验，这类文件会带着路径直接报错，不再出现"bitDepth 0 unsupported"这种无线索的错误。
  // ⚠️ 已知冲突（第 31 轮登记）→ **第 32 轮已裁定**：这张图归「旋风多比」，见文件上方温德·冽 那段注释。
  //   旋风多比本身不是形态表里的形态，所以它走下面的「仅形象」区（只进图鉴、标 missing）。
  ['旋风多比', '多比形态素材/旋风多比.png', '同名官方立绘（归档）；官方另有独立资料页（旋风巨岩多比资料.xlsx：昵称/长描述/专属技能）'],
  ['曼陀罗多比', '多比形态素材/曼陀罗多比/曼陀罗.jpg', '同名官方立绘（归档 曼陀罗多比/，jpg）'],
  ['毒多比', '多比形态素材/正义风火毒/毒多比.jpg', '同名官方立绘（归档 正义风火毒/，jpg）'],
  ['正义多比', '多比形态素材/正义风火毒/正义多比.jpg', '同名官方立绘（归档 正义风火毒/，jpg）'],
  ['悟空多比', '多比形态素材/行者孙吕布等/行者孙多比/悟空1.png', '官方名「行者孙」＝悟空；归档 行者孙多比/ 序列第 1 帧'],
  ['吕布多比', '多比形态素材/行者孙吕布等/吕布&貂蝉/吕布多比.png', '同名官方立绘（归档 吕布&貂蝉/）'],
  ['貂蝉多比', '多比形态素材/行者孙吕布等/吕布&貂蝉/貂蝉多比2.png', '同名官方立绘（归档 吕布&貂蝉/）'],
  ['乔纳·华多比', '多比形态素材/行者孙吕布等/乔纳·华多比.png', '同名官方立绘（归档 行者孙吕布等/）'],
  // ⚠️ 以下两条**故意不挂**（宁可不给图，也不给错图）：
  //   · 机械多比：归档里 `机械.jpg` 与 `艾斯·垒 多比.jpg` **字节完全相同**（同一 hash 05D68A2A…），
  //     是同一张图的副本 —— 挂上去会让「机械多比」显示成「厄斯·垒」的样子。
  //   · 达鲁·龙多比：形态表里**根本没有这只**（是我照名字猜的一条），挂上只会生成孤儿文件。
  // 这一对是脚本自带的查重（输出 png 逐个比 sha256）抓出来的：
  // **"文件名叫什么"不等于"图画的是谁"**，加素材时必须查重、并且拿形态表核对名字。
  // 下面这几只：官方表里的名字与素材文件名不完全一致，但指的是同一只（依据写在 evidence 里，便于日后复核）
  ['天使多比', '多比形态素材/1920/安吉尔多比.png', '官方表名「天使多比」；素材名「安吉尔」（Angel 音译）→ 同一只，1920 官方立绘'],
  ['冰多比', '多比形态素材/弗瑞斯冰多比.png', '官方表名「冰多比」；素材名「弗瑞斯冰多比」（Freeze 音译）→ 同一只'],
  ['蜘蛛多比', '多比形态素材/普伊斯·蛛多比.png', '官方表名「蜘蛛多比」；素材名「普伊斯·蛛多比」→ 同一只'],
  ['土蝎多比', '多比形态素材/蝎多比/摩撒·蝎多比.jpg', '官方表名「土蝎多比」；素材名「摩撒·蝎多比」→ 同一只（jpg）'],
  // ⚠️ 「英雄多比 ← 依斯特·英雄多比.png」**故意不挂**：那张原图脚底带一大片灰色投影，
  // 现阶段的抠图去不掉（test-form-art 报"脚底残留 47%"）。按 R9 宁可标"无立绘"，也不给一张脏图。

  // ================= 「仅形象」区（第 32 轮新增）=================
  // 这批的**名字来自官方素材归档的文件名**（原版美术自己命名的），
  // 但**不在任何官方形态表里** —— 即：形象是官方的、数值没有任何依据。
  // 处置方式（**不推算、不冒充**）：
  //   · 进 `artOnly`，只在图鉴里以「仅形象 · 无官方数值」展示；
  //   · **不进形态表** → 不出现在背包/变身/战斗里，也不会被掉落抽到；
  //   · 将来若在归档里找到它们的官方数值，再升级成真正的形态。
  // 依据：`docs/多比形态扩展清单.md` 与 `docs/deviations.md`（V55）。
  ['威尔鼎多比', '多比形态素材/1920/威尔鼎多比.png', '官方素材归档原版立绘（1920 系列）'],
  ['布莱克暗夜多比', '多比形态素材/1920/布莱克暗夜多比.png', '官方素材归档原版立绘（1920 系列）'],
  ['曼陀罗·花多比', '多比形态素材/1920/曼陀罗·花多比.png', '官方素材归档原版立绘（1920 系列）'],
  ['大时多比', '多比形态素材/dobi_191026_大时多比.png', '官方素材归档原版立绘（文件名带官方动作组号 dobi_191026）'],
  ['夜影·冽 多比', '多比形态素材/夜影多比/夜影·冽 多比/夜影·冽 多比.jpg', '官方素材归档原版立绘（夜影系列）'],
  ['夜影·凌 多比', '多比形态素材/夜影多比/夜影·凌 多比/夜影·凌 多比.jpg', '官方素材归档原版立绘（夜影系列）'],
  ['夜影·空 多比', '多比形态素材/夜影多比/夜影·空 多比/夜影·空 多比.jpg', '官方素材归档原版立绘（夜影系列）'],
  ['夜影·厄斯 多比', '多比形态素材/夜影多比/夜影·厄斯 多比/夜影·厄斯 多比.jpg', '官方素材归档原版立绘（夜影系列）'],
  ['夜影·正义 多比', '多比形态素材/夜影多比/夜影·正义 多比/夜影·正义 多比.jpg', '官方素材归档原版立绘（夜影系列）'],
  ['夜影·博伊斯 多比', '多比形态素材/夜影多比/夜影·博伊斯 多比/夜影·博伊斯 多比.jpg', '官方素材归档原版立绘（夜影系列）'],
  ['斯莱特·刃多比', '多比形态素材/斯莱特·刃多比/斯莱特·刃多比.jpg', '官方素材归档原版立绘'],
  ['斯蒂尔·垲多比', '多比形态素材/斯蒂尔·垲多比.png', '官方素材归档原版立绘'],
  ['斯隆曼·空多比', '多比形态素材/斯隆曼·空多比.png', '官方素材归档原版立绘'],
  ['莱特·凛多比', '多比形态素材/莱特·凛多比.png', '官方素材归档原版立绘'],
  ['哈瑞·肯多比', '多比形态素材/正义风火毒/哈瑞·肯多比.jpg', '官方素材归档原版立绘（正义风火毒系列）'],
  ['费勒姆·炎多比', '多比形态素材/正义风火毒/费勒姆·炎多比.jpg', '官方素材归档原版立绘（正义风火毒系列）'],
  ['克鲁尔·蝶多比', '多比形态素材/行者孙吕布等/克鲁尔·蝶多比.png', '官方素材归档原版立绘（行者孙吕布等系列）'],
  ['布瑞·武多比', '多比形态素材/行者孙吕布等/吕布&貂蝉/布瑞·武多比.png', '官方素材归档原版立绘（吕布&貂蝉系列）'],
  // 近似重复的对（例如 曼陀罗多比 ↔ 毒多比）在这里登记理由，见 ALLOW_SIMILAR。
]

// 视觉上高度相似、但**确认是两个不同官方文件**的形态对。// 为什么需要这张表：以前用"任意两张图必须差异 ≥ 阈值"这种一刀切规则，
// 一旦官方本身就有配色相近的两只（曼陀罗 / 毒），规则就会误报。
// 现在改成：**不许两张图字节相同**（那是真 bug），而"长得像"必须在这里写明理由才放行。
const ALLOW_SIMILAR = [
  ['曼陀罗多比', '毒多比', '两只都是紫色系且姿势相近，但归档里是两个不同文件（sha256 不同：2032A6B9… / 3BBC2656…），且各自与自己的同名文件对应 —— 属官方设计本身相近'],
]

const SLUG = (n) => n.replace(/[·・\s]/g, '')

// ---------- JPEG -> PNG（本机没有 jpeg 解码器，借 GDI+ 转一道） ----------
// ⚠️ 缓存文件名必须是**源路径的哈希**，不能用序号。
// 第 30 轮踩的坑：原先缓存叫 j0.png / j1.png …… 按 MAP 里的**位置**命名，
// 而转换那一步有 `if (fs.existsSync(dst)) return`（存在就跳过）。
// 于是只要动一下 MAP（加一只形态 / 删一条）→ 位置全变 → 旧缓存被当成新条目的图，
// **A 形态会静默显示成 B 形态的样子**，而且永远不再重转。
// 当时的表现是"曼陀罗多比.png 与 厄斯垒.png 字节完全相同" —— 靠脚本自带的查重才发现。
const cacheName = (rel) => crypto.createHash('sha1').update(rel).digest('hex').slice(0, 12) + '.png'
const jpgJobs = MAP.filter(([, rel]) => /\.jpe?g$/i.test(rel))
if (jpgJobs.length) {
  const lines = ["Add-Type -AssemblyName System.Drawing", "$ErrorActionPreference='Stop'"]
  jpgJobs.forEach(([, rel]) => {
    const src = path.join(ROOT, '多克多比专区资料素材', rel).replace(/'/g, "''")
    const dst = path.join(CACHE, cacheName(rel)).replace(/'/g, "''")
    if (fs.existsSync(dst)) return
    lines.push(`$i=[System.Drawing.Image]::FromFile('${src}');` +
      `$b=New-Object System.Drawing.Bitmap($i.Width,$i.Height);` +
      `$g=[System.Drawing.Graphics]::FromImage($b);$g.DrawImage($i,0,0,$i.Width,$i.Height);$g.Dispose();` +
      `$b.Save('${dst}',[System.Drawing.Imaging.ImageFormat]::Png);$b.Dispose();$i.Dispose()`)
  })
  const psp = path.join(CACHE, 'conv.ps1')
  fs.writeFileSync(psp, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join('\r\n'), 'utf8')]))
  try { execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psp], { stdio: 'inherit' }) } catch (e) { console.log('JPEG 转换失败: ' + e.message) }
}
const jpgSrc = (rel) => path.join(CACHE, cacheName(rel))
// 自检：每个 jpg 源都必须有对应的缓存文件（位图按位置命名时，这条能直接抓出错位）
for (const [, rel] of jpgJobs) {
  if (!fs.existsSync(jpgSrc(rel))) throw new Error(`JPEG 缓存缺失：${rel}（转换没成功，别让后续步骤静默用错图）`)
}

// ---------- 抠背景 ----------
// pass1: 与边界色接近的连通区域（白底）
// pass2: 从中性灰（脚底投影）继续连通扩散。亮度下限挡住黑色描边。
function removeBackground(img, { tol = 42, shadow = true, neutralTol = 10, minLum = 118 } = {}) {
  const { w, h, data } = img
  const samples = []
  const stepX = Math.max(1, (w / 96) | 0), stepY = Math.max(1, (h / 96) | 0)
  for (let x = 0; x < w; x += stepX) {
    samples.push([data[x * 4], data[x * 4 + 1], data[x * 4 + 2]])
    samples.push([data[((h - 1) * w + x) * 4], data[((h - 1) * w + x) * 4 + 1], data[((h - 1) * w + x) * 4 + 2]])
  }
  for (let y = 0; y < h; y += stepY) {
    samples.push([data[(y * w) * 4], data[(y * w) * 4 + 1], data[(y * w) * 4 + 2]])
    samples.push([data[(y * w + w - 1) * 4], data[(y * w + w - 1) * 4 + 1], data[(y * w + w - 1) * 4 + 2]])
  }
  const med = (i) => { const a = samples.map((s) => s[i]).sort((p, q) => p - q); return a[a.length >> 1] }
  const bg = [med(0), med(1), med(2)]
  const distBg = (i) => Math.max(Math.abs(data[i] - bg[0]), Math.abs(data[i + 1] - bg[1]), Math.abs(data[i + 2] - bg[2]))

  const isBg = new Uint8Array(w * h)
  const queue = []
  const push = (p) => { if (!isBg[p]) { isBg[p] = 1; queue.push(p) } }
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x) }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1) }
  // 连外围已经透明的像素也一起当种子（源图本来就带 alpha 的情况）
  for (let p = 0; p < w * h; p++) if (data[p * 4 + 3] < 8) push(p)

  let removed = 0
  while (queue.length) {
    const p = queue.pop()
    removed++
    const x = p % w, y = (p / w) | 0
    const nb = []
    if (x > 0) nb.push(p - 1)
    if (x < w - 1) nb.push(p + 1)
    if (y > 0) nb.push(p - w)
    if (y < h - 1) nb.push(p + w)
    for (const q of nb) {
      if (isBg[q]) continue
      const i = q * 4
      const white = distBg(i) <= tol
      let grey = false
      if (shadow) {
        const r = data[i], g = data[i + 1], b = data[i + 2]
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
        grey = (mx - mn) <= neutralTol && (r + g + b) / 3 >= minLum
      }
      if (white || grey) push(q)
    }
  }
  // 写回 alpha；贴着背景的边缘像素按与边界色的距离做渐变，消白边
  const SOFT = 130
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    if (isBg[p]) { data[i + 3] = 0; continue }
    const x = p % w, y = (p / w) | 0
    const near = (x > 0 && isBg[p - 1]) || (x < w - 1 && isBg[p + 1]) ||
      (y > 0 && isBg[p - w]) || (y < h - 1 && isBg[p + w])
    if (!near) continue
    const d = distBg(i)
    if (d < SOFT) data[i + 3] = Math.min(data[i + 3], Math.round(255 * (d - tol) / (SOFT - tol)))
  }
  return { bg, pct: +(100 * removed / (w * h)).toFixed(1) }
}

// ---------- 裁到内容边界 ----------
function trim(img) {
  const { w, h, data } = img
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] < 8) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return img
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1
  const out = new Uint8Array(nw * nh * 4)
  for (let y = 0; y < nh; y++) out.set(data.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + nw) * 4), y * nw * 4)
  return { w: nw, h: nh, data: out }
}

// ---------- 缩放（先预乘 alpha，避免边缘发黑） ----------
function resize(img, maxH, maxW = 900) {
  const s = Math.min(1, maxH / img.h, maxW / img.w)
  if (s >= 1) return img
  const nw = Math.max(1, Math.round(img.w * s)), nh = Math.max(1, Math.round(img.h * s))
  const src = new Float32Array(img.w * img.h * 4)
  for (let i = 0; i < img.w * img.h; i++) {
    const a = img.data[i * 4 + 3] / 255
    src[i * 4] = img.data[i * 4] * a
    src[i * 4 + 1] = img.data[i * 4 + 1] * a
    src[i * 4 + 2] = img.data[i * 4 + 2] * a
    src[i * 4 + 3] = a
  }
  const out = new Uint8Array(nw * nh * 4)
  const sx = img.w / nw, sy = img.h / nh
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.min(img.h, Math.ceil((y + 1) * sy))
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.min(img.w, Math.ceil((x + 1) * sx))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * img.w + xx) * 4
        r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; n++
      }
      if (!n) continue
      r /= n; g /= n; b /= n; a /= n
      const o = (y * nw + x) * 4
      if (a > 0.0001) {
        out[o] = Math.round(Math.min(255, r / a)); out[o + 1] = Math.round(Math.min(255, g / a))
        out[o + 2] = Math.round(Math.min(255, b / a))
      }
      out[o + 3] = Math.round(Math.min(255, a * 255))
    }
  }
  return { w: nw, h: nh, data: out }
}

// ---------- 自检：数一数还剩多少「中性灰」像素（脚底投影的残留） ----------
function grayResidue(img) {
  const { w, h, data } = img
  let n = 0, total = 0
  const y0 = Math.floor(h * 0.7)
  for (let y = y0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    if (data[i + 3] < 40) continue
    total++
    const r = data[i], g = data[i + 1], b = data[i + 2]
    if (Math.max(r, g, b) - Math.min(r, g, b) <= 12 && (r + g + b) / 3 >= 130) n++
  }
  return total ? +(100 * n / total).toFixed(1) : 0
}

// ---------- 头像方图（背包格子 / 底部徽章用） ----------
// 全身立绘直接缩到 46px 会糊成一团，所以单独裁一张「头肩」方图。
function makeIcon(img, size = 96) {
  const { w, h, data } = img
  const band = Math.max(1, Math.round(h * 0.55))      // 先粗裁到上 55%（头 + 肩）
  const crop = { w, h: band, data: new Uint8Array(w * band * 4) }
  crop.data.set(data.subarray(0, w * band * 4))
  const t = trim(crop)                                 // 再按内容收紧，保证脑袋占满
  const side = Math.max(t.w, t.h)
  const sq = { w: side, h: side, data: new Uint8Array(side * side * 4) }
  // 水平居中、垂直贴顶（脑袋在上）
  const ox = (side - t.w) >> 1
  for (let y = 0; y < t.h; y++) sq.data.set(t.data.subarray(y * t.w * 4, (y + 1) * t.w * 4), (y * side + ox) * 4)
  return resize(sq, size, size)
}

// ---------- 主流程 ----------
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(SHEET, { recursive: true })
const index = [], processed = []

// 魔数校验：归档里存在"扩展名撒谎"的文件（实测 8 个；形态素材目录里 `风多比.png` 其实是 BMP）。
// 不做这一步，错误会是 `bitDepth 0 unsupported` —— **连是哪个文件都不说**，
// 查起来要多跑好几趟。这里提前拦下并报出路径与真实格式。
function assertImageFormat(p) {
  const fd = fs.openSync(p, 'r')
  const b = Buffer.alloc(4)
  try { fs.readSync(fd, b, 0, 4, 0) } finally { fs.closeSync(fd) }
  const ext = path.extname(p).toLowerCase()
  const real = (b[0] === 0x89 && b[1] === 0x50) ? 'png'
    : (b[0] === 0xFF && b[1] === 0xD8) ? 'jpg'
      : (b[0] === 0x42 && b[1] === 0x4D) ? 'bmp'
        : (b[0] === 0x47 && b[1] === 0x49) ? 'gif' : '未知'
  const want = ext === '.jpeg' ? 'jpg' : ext.slice(1)
  if (real !== want) throw new Error(`素材格式与扩展名不符：${path.relative(ROOT, p)} 扩展名 ${ext}，实际是 ${real}`)
}

for (const [name, rel, evidence] of MAP) {
  const src = /\.jpe?g$/i.test(rel) ? jpgSrc(rel) : path.join(ROOT, '多克多比专区资料素材', rel)
  if (!fs.existsSync(src)) { console.log(`★ 缺素材 ${name} <- ${rel}`); continue }
  assertImageFormat(src)
  const img = decodePng(fs.readFileSync(src))
  const before = `${img.w}x${img.h}`
  const r = removeBackground(img, { tol: /\.jpe?g$/i.test(rel) ? 56 : 42, neutralTol: /\.jpe?g$/i.test(rel) ? 16 : 10 })
  const t = trim(img)
  const sized = resize(t, 640, 900)
  const res = grayResidue(sized)
  const file = SLUG(name) + '.png'
  fs.writeFileSync(path.join(OUT, file), encodePng(sized.w, sized.h, sized.data))
  const icon = makeIcon(sized, 96)
  const iconFile = SLUG(name) + '_icon.png'
  fs.writeFileSync(path.join(OUT, iconFile), encodePng(icon.w, icon.h, icon.data))
  const kb = Math.round(fs.statSync(path.join(OUT, file)).size / 1024)
  index.push({
    name, file: 'assets/forms/art/' + file, icon: 'assets/forms/art/' + iconFile,
    w: sized.w, h: sized.h,
    src: rel, evidence,
    bg: `底色 ${r.bg.join(',')}，抠掉 ${r.pct}%`,
  })
  processed.push({ name, img: sized, icon })
  console.log(`  ${name.padEnd(10)} <- ${rel.padEnd(38)} ${before.padEnd(11)} -> ${String(sized.w).padStart(3)}x${String(sized.h).padEnd(3)} ` +
    `${String(kb).padStart(4)}KB  抠掉${String(r.pct).padStart(5)}%  残留灰 ${String(res).padStart(4)}%${res > 6 ? '  ★偏高' : ''}`)
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ generated: new Date().toISOString(), forms: index }, null, 2))
console.log(`\n已写出 ${index.length} 张立绘 + ${index.length} 张头像到 assets/forms/art/`)

// ---------- 对照总表（人工肉眼核对用） ----------
const COLS = 4, CELL = 240, PAD = 10
const rows = Math.ceil(processed.length / COLS)
const W = COLS * (CELL + PAD) + PAD, H = rows * (CELL + PAD) + PAD
const canvas = { width: W, height: H, _fb: makeFramebuffer(W, H), style: {} }
const ctx = new PixelCtx(canvas)
ctx.fillStyle = '#1b2430'; ctx.fillRect(0, 0, W, H)
processed.forEach((p, i) => {
  const cx = PAD + (i % COLS) * (CELL + PAD), cy = PAD + ((i / COLS) | 0) * (CELL + PAD)
  ctx.fillStyle = '#33465c'; ctx.fillRect(cx, cy, CELL, CELL)
  const s = Math.min(CELL / p.img.w, CELL / p.img.h)
  const dw = Math.round(p.img.w * s), dh = Math.round(p.img.h * s)
  ctx.drawImage({ _pixels: p.img }, cx + ((CELL - dw) >> 1), cy + ((CELL - dh) >> 1), dw, dh)
  ctx.drawImage({ _pixels: p.icon }, cx + 4, cy + 4, 44, 44)      // 左上角贴头像，顺便核对裁切
})
fs.writeFileSync(path.join(SHEET, '_formart.png'), encodePng(W, H, canvas._fb))
console.log('\n对照总表 -> docs/sheets/_formart.png')
processed.forEach((p, i) => console.log(`  第${((i / COLS) | 0) + 1}行 第${(i % COLS) + 1}列  ${p.name}`))

// 头像单独放大排一行，方便核对裁切位置
{
  const IC = 128, IPAD = 8
  const iw = processed.length * (IC + IPAD) + IPAD
  const ic = { width: iw, height: IC + IPAD * 2, _fb: makeFramebuffer(iw, IC + IPAD * 2), style: {} }
  const ictx = new PixelCtx(ic)
  ictx.fillStyle = '#1b2430'; ictx.fillRect(0, 0, iw, IC + IPAD * 2)
  processed.forEach((p, i) => {
    const x = IPAD + i * (IC + IPAD)
    ictx.fillStyle = '#33465c'; ictx.fillRect(x, IPAD, IC, IC)
    ictx.drawImage({ _pixels: p.icon }, x, IPAD, IC, IC)
  })
  fs.writeFileSync(path.join(SHEET, '_formicon.png'), encodePng(iw, IC + IPAD * 2, ic._fb))
  console.log('头像总表 -> docs/sheets/_formicon.png（从左到右同上面的顺序）')
}
