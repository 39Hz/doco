// 场景官方命名（M2-3 / B1 的一部分，第 11 轮用感知比对找回的 8 个）。
//
// 背景：归档 `多克多比专区资料素材\场景\` 下有 12 张**带官方中文名的场景原图**。
// 它们与我们的场景图宽高比一致（1.714）但字节不同，hash 匹配 0 命中；
// 用 `_tools/match-official-scenes.mjs` 做感知比对后，**11 张的距离 0.001~0.211、
// 第二名 0.6~1.0（差 10~20 倍）** → 采信为同一张图，改用官方名，并逐张用眼睛复核过。
// 另 5 张（云中城堡/城堡大厅/燃烧瀑布/幽水宫/邪力宫殿）距离 0.42~0.74 没对上 → **不猜**。
//
// 本测试把这件事锁死：以后谁重新生成 manifest，都不能悄悄把这 8 个官方名弄丢或降级。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { T } from './game-harness.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const t = T
t.load('game/game.js')
await T.settle()   // 等游戏真的离开载入页（不再赌 150 毫秒）

const W = t.get('window')
const DBG = () => W.__DKDbb_DEBUG__
const S = () => DBG().state
let pass = 0, fail = 0
const check = (c, s, extra) => { console.log((c ? '  ✓ ' : '  ✗ ') + s + (!c && extra ? ' → ' + extra : '')); c ? pass++ : fail++ }
const section = (s) => console.log('\n=== ' + s + ' ===')

// 这 8 个是**从归档原图比对出来的官方名**，写死对照
const EXPECT = {
  28: '城堡郊外', 32: '智慧学堂', 33: '布拉德矿坑', 39: '空中蔓步', 42: '图书馆',
  43: '城堡走道', 44: '光暗峡谷', 50: '藤顶风光', 57: '熔岩池',
  85: '征服平原', 87: '黑暗裂缝',
}

section('1) manifest：88 个场景、11 个官方名')
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))
check(man.scenes.length === 93, `场景 ${man.scenes.length} 个（第 62 轮起：原 88 + B14 补的 5 个官方场景）`)
check(man.scenes.every((s) => s.title && s.title.length >= 2), '每个场景都有名字')
{
  const off = man.scenes.filter((s) => s.conf === 'official')
  check(off.length === 16, `标为 official 的场景 ${off.length} 个（原 11 + 第 62 轮新增 5 个官方场景）`)
  for (const [id, name] of Object.entries(EXPECT)) {
    const s = man.scenes.find((x) => x.id === Number(id))
    check(!!s && s.title === name, `#${id} = ${name}`, s ? `实际 ${s.title}` : '找不到该场景')
    check(!!s && s.conf === 'official', `#${id} 的来源等级是 official`, s ? `实际 ${s.conf}` : '')
  }
  const badSrc = off.filter((s) => !/感知比对/.test(s.nameSource || ''))
  check(badSrc.length === 0, '每个 official 都写明了是"感知比对 + 人工复核"', badSrc.map((s) => s.id).join(','))
  const derived = man.scenes.filter((s) => s.conf === 'derived')
  check(derived.length === 77, `其余 ${derived.length} 个如实标 derived`)
}
{
  // 官方名不能和别的场景重名（重名会让玩家分不清是哪张图）
  const seen = new Map(), dups = []
  for (const s of man.scenes) {
    if (seen.has(s.title)) dups.push(`${s.title}(#${seen.get(s.title)}/#${s.id})`)
    else seen.set(s.title, s.id)
  }
  check(dups.length === 0, '93 个名字互不重复', dups.join(' '))
}

section('2) 没对上的 5 张：不许"顶替"，但可以"新增"')
{
  // 这 5 张在感知比对里与**原有的 88 关**距离 0.14~0.55，属于"没对上"。
  // 【第 62 轮更新】第 61 轮把它们做成了候选（图+名都取自归档官方原图），
  //   第 62 轮正式**新增为 89–93 关**。所以这条断言要改成：
  //   **不许把它们套到原有场景上**（顶替）；新增的 89–93 用这 5 个名字是**对的**。
  const NOT_MATCHED = ['云中城堡', '城堡大厅', '燃烧瀑布', '幽水宫', '邪力宫殿']
  const NEW_IDS = [89, 90, 91, 92, 93]
  const usedOnOld = man.scenes.filter((s) => NOT_MATCHED.includes(s.title) && !NEW_IDS.includes(s.id))
  check(usedOnOld.length === 0,
    '没有把这 5 个官方名**套到原有场景上**（不许顶替）',
    usedOnOld.map((s) => `#${s.id} ${s.title}`).join(','))
  // 新增的 5 关：名字、图、来源都得是官方原图
  for (const [id, name] of [[89, '云中城堡'], [90, '城堡大厅'], [91, '燃烧瀑布'], [92, '幽水宫'], [93, '邪力宫殿']]) {
    const s = man.scenes.find((x) => x.id === id)
    check(!!s && s.title === name, `新增场景 #${id} 用官方名「${name}」（实际「${s && s.title}」）`)
    check(!!s && s.conf === 'official', `#${id} 标了 conf=official`)
    check(!!s && /归档原图/.test(s.nameSource || ''), `#${id} 写明了名字来自哪张归档原图`)
    check(!!s && fs.existsSync(path.join(process.cwd(), s.file || '')), `#${id} 的场景图真的存在`)
  }
}

section('3) 端到端：游戏里读到的就是这些名字')
{
  const sc = S().scenes
  check(!!sc, '运行时场景表存在')
  let ok = 0
  for (const [id, name] of Object.entries(EXPECT)) {
    const s = sc[id]
    if (s && s.name === name) ok++
    else check(false, `运行时 #${id} 应为 ${name}`, s ? `实际 ${s.name}` : '场景不存在')
  }
  check(ok === 11, `11 个官方名都从 manifest 传到了运行时（${ok}/11）`)
}

section('4) 比对工具本身可复跑（不依赖本次结果）')
{
  const tool = path.join(ROOT, '_tools', 'match-official-scenes.mjs')
  check(fs.existsSync(tool), '感知比对工具存在（_tools/match-official-scenes.mjs）')
  const rep = path.join(ROOT, 'docs', '官方场景名比对.md')
  check(fs.existsSync(rep), '比对报告落盘（docs/官方场景名比对.md）')
  if (fs.existsSync(rep)) {
    const txt = fs.readFileSync(rep, 'utf8')
    check(/很可能同一张/.test(txt), '报告里给出了判读结论')
    // 【第 33 轮改】原先是"报告里『很可能同一张』正好 11 条"。
    // 现在归档里**两个互不相干的目录**都有带官方名的场景图（jpg 与 png），
    // 同一个官方名会比两次 → 条数不再是 11。改成语义更强的三条：
    //   ① **不同的官方名**判定为同图的正好 11 个（这才是"我们采信了 11 个"的意思）；
    //   ② 多张原图一致指认同一张场景的那几个，必须真的指向同一个 scene 文件（交叉验证）；
    //   ③ 归档里有图、我们却没有对应场景的官方名，必须被显式列出来（覆盖缺口）。
    const mConcl = txt.match(/判定为"很可能同图"的官方名：(\d+) 个/)
    check(!!mConcl, '报告结论段里有"很可能同图的官方名"计数')
    check(mConcl && Number(mConcl[1]) === 11, `判定为同图的**不同官方名**正好 11 个`, mConcl && mConcl[1])
    const mAgree = txt.match(/(\d+) 个多张原图一致指认到同一张场景/)
    check(!!mAgree && Number(mAgree[1]) >= 7,
      `跨来源交叉验证 ≥7 个（实际 ${mAgree && mAgree[1]}）：同一个官方名在两个目录里各自指认到同一张场景`)
    const mGap = txt.match(/找不到对应的官方名：(\d+) 个\*\* → ([^\n]+)/)
    check(!!mGap, '报告里列出了"归档有图、我们没有对应场景"的官方名')
    if (mGap) {
      const gapNames = mGap[2].split('、').map((s) => s.trim())
      check(gapNames.length === Number(mGap[1]), `覆盖缺口计数与名单一致（${mGap[1]} 个）`)
      for (const must of ['云中城堡', '城堡大厅', '燃烧瀑布']) {
        check(gapNames.includes(must), `覆盖缺口里包含「${must}」`)
      }
      // 【第 62 轮更新】这 5 个名字原先**绝不能**出现在任何场景上（防"看起来像"的顶替）。
      // 现在它们**正式成为 89–93 关**（图与名都直接取自归档官方原图），
      // 所以判据改成：只许出现在 89–93 上，**不许出现在原有场景上**。
      const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'))
      const NEW_IDS = [89, 90, 91, 92, 93]
      const leaked = man.scenes.filter((s) => gapNames.includes(s.title) && !NEW_IDS.includes(s.id))
      check(leaked.length === 0, '这 5 个名字**只**用在新增的 89–93 上，没有被套到原有场景上（不许顶替）',
        leaked.map((s) => s.id + ':' + s.title).join('、'))
      const onNew = man.scenes.filter((s) => gapNames.includes(s.title) && NEW_IDS.includes(s.id))
      check(onNew.length === gapNames.length,
        `覆盖缺口里的 ${gapNames.length} 个已全部作为新场景落地（实际 ${onNew.length} 个）`)
    }
  }
  // 原始场景原图要在归档里能找到（否则结论无法复核）
  const dir = path.join(ROOT, '多克多比专区资料素材', '场景')
  check(fs.existsSync(dir), '归档里的场景原图目录还在（结论可复核）')

  // 保真度报告里的"场景官方命名"一行必须与 manifest 对得上。
  // 这条是**事后补的**：报告曾经读了一个根本不存在的全局（window.__DKDbb_SCENE_NAMES__），
  // 于是恒等于 0、把 77 个 derived 场景名错记成 missing（官方占比被低估 2 个百分点）。
  // 报告与清单各说一套是查不出来的，除非有一条断言把两边钉在一起。
  const rep2 = path.join(ROOT, 'docs', '保真度报告.md')
  check(fs.existsSync(rep2), '保真度报告落盘（docs/保真度报告.md）')
  if (fs.existsSync(rep2)) {
    const txt = fs.readFileSync(rep2, 'utf8')
    const officialInMan = man.scenes.filter((s) => s.conf === 'official').length
    const derivedInMan = man.scenes.filter((s) => s.conf === 'derived').length
    const row = txt.split(/\r?\n/).find((l) => l.includes('场景官方命名'))
    check(!!row, '报告里有「场景官方命名」一行')
    if (row) {
      const nums = (row.match(/\d+/g) || []).map(Number)
      check(nums[0] === officialInMan,
        `报告里该行 official=${nums[0]} 与 manifest 的 ${officialInMan} 一致`)
      check(nums[1] === derivedInMan,
        `报告里该行 derived=${nums[1]} 与 manifest 的 ${derivedInMan} 一致`)
    }
    check(!/场景官方命名（88 个全缺）/.test(txt), '报告结论句不再是写死的"88 个全缺"')
  }
}

console.log(`\n结果: 通过 ${pass} 项，失败 ${fail} 项`)
process.exit(fail ? 1 : 0)
