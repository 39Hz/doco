// 生成"缺立绘形态"的寻图清单（给用户去网上找图用）
// 输出：docs/缺立绘形态清单.md —— 含每只的元素/官方编号/搜索关键词建议
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')
const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/forms.json'), 'utf8'))
const forms = f.forms || []
const artDir = path.join(ROOT, 'assets/forms/art')

const missing = forms.filter((fm) => !fm.art || !fs.existsSync(path.join(ROOT, fm.art)))

// 元素中文名（原表可能是"无"= 没给）
const el = (e) => e || '（原表未标）'
// 搜索建议：名字 + 多克多比；去掉多余空格便于搜索
const kw = (n) => {
  const clean = String(n).replace(/\s+/g, '')
  const base = clean.replace(/多比$/, '')
  return clean === base ? `多克多比 ${clean}` : `多克多比 ${clean}`
}

let md = `# 缺立绘形态清单（需要找图）

> 生成：\`node _tools/audit-form-art-missing.mjs\` / 本文件由 \`_tools/gen-missing-art-list.mjs\` 生成
>
> **背景**：游戏里 52 只可玩形态中有 **${missing.length} 只没有立绘** —— 归档素材里确实没有它们的图
> （按名搜遍归档 4933 张图，命中的全是"大禹治水壁纸""乌卡农场草料房"这类**同名误命中**）。
> 没有立绘的形态在游戏里会显示占位形象（而不是空白）。
>
> **要找的图**：官方立绘 / 图鉴截图 / 攻略站截图都可以，**越清楚越好**。

## 一、需要找图的形态（${missing.length} 只）

| # | 形态名 | 元素 | 官方编号 | 建议搜索词 | 已有线索 |
|---|---|---|---|---|---|
`
missing.forEach((fm, i) => {
  const hint = []
  if (fm.officialId) hint.push(`官方 id ${fm.officialId}`)
  if (fm.spriteDir) hint.push(`素材目录 ${fm.spriteDir}`)
  if (fm.desc) hint.push('有描述')
  md += `| ${i + 1} | **${fm.name}** | ${el(fm.element)} | ${fm.officialId || '—'} | \`${kw(fm.name)}\` | ${hint.join('；') || '—'} |\n`
})

md += `
## 二、已经有立绘的形态（不用找，${forms.length - missing.length} 只）

供你对照，避免重复找：

`
const have = forms.filter((fm) => fm.art && fs.existsSync(path.join(ROOT, fm.art)))
md += have.map((fm) => fm.name).join('、') + '\n'

md += `
## 三、找图时请注意（能省很多来回）

1. **别只要小图标**：游戏里立绘最长要显示到 **320px 高**（高清化目标是 640px 高）。
   拿到 **640px 高以上**的图最好；低于 300px 高的会明显发糊。
2. **背景最好干净**（纯色/白底）—— 抠图是自动做的，复杂背景容易抠脏。
3. **能看出是谁**：站姿、全身、正面或 3/4 侧面最合适；发招/特效糊脸的不太好用。
4. **命名**：存成 \`<形态名>.png\`（例：\`草多比.png\`、\`修罗·岚 多比.png\`）最好，
   名字对不上我会按内容核对 —— 这一点项目里踩过坑：
   第一版曾把 \`普伊斯·蛛多比.png\` 当 \`毒多比\` 用，等于**把毒多比换成了蜘蛛的样子**，
   所以**文件名叫什么不等于图画的是谁**，我会逐张核对。
5. **一次给一批也没关系**，放到一个文件夹里告诉我路径就行。

## 四、附加线索（归档里找到的、可能用得上的零散素材）

这些是归档里**确实存在**但还没接进游戏的图（可能是别的用途或低清版本）：

| 文件 | 说明 |
|---|---|
| \`多比形态素材/机械.jpg\` | 名字对得上「机械多比」，59KB，需确认是否立绘 |
| \`多比形态素材/阴阳多比资料/琉阳多比.jpg\` | 可能是「阳多比」，44KB |
| \`多比形态素材/阴阳多比资料/璃阴多比.jpg\` | 可能是「阴多比」，57KB |
| \`assets/forms/art/温德冽.png\` | **孤儿图**：磁盘上有、但没有任何形态引用它。形态表里叫「温德·冽 多比」，可能是它 |
`
fs.writeFileSync(path.join(ROOT, 'docs/缺立绘形态清单.md'), md)
console.log(`已写出 docs/缺立绘形态清单.md（${missing.length} 只需要找图）`)
console.log('\n清单：')
missing.forEach((fm, i) => console.log(`  ${String(i + 1).padStart(2)}. ${fm.name}  [元素 ${el(fm.element)}]`))
