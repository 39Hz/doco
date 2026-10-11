// 源码包 / 交接包共用的**收录与排除规则**（第 69 轮）
//
// 【为什么抽出来】源码包和"多克多比制作"交接包要收的东西几乎一样。
//   规则各写一份的话，改了一边忘了另一边 → 某个包里悄悄多带 1.8 GB，
//   或者悄悄少带一个关键目录。规则只留一份，两边都 import。
import fs from 'node:fs'
import path from 'node:path'

// ── 目录名（任意层级直接跳过）──────────────────────────────
export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist',
  // 中转 / 历史 / 与本次交付无关
  '_tmp_test_out', '_unity_tex', '_apk', '_extracted', '_recovery', '_rar_extracted', '_web',
  '多克多比-2026.2',
  // 归档本体（8.8 GB）—— 只有"重新生成美术素材"才需要
  '多克多比专区资料素材',
  // 可重建的缓存 / 模型 / 审阅拼图
  'imgcache', 'ai', 'sheets',
])

// ── 具体路径前缀（相对仓库根，用 / 分隔）────────────────────
//   ⚠️ 前缀判断必须在"目录分支"**之前**做，否则目录只过 SKIP_DIRS、走不到这里
export const SKIP_PATHS = [
  'assets/sprites',                        // 1860 MB 原版全分辨率帧，运行时不用
  '_tools/glyphs/atlas_48_regular.rgba',   // 字形图集中间产物
  '_tools/glyphs/atlas_48_bold.rgba',
]

// ── 文件名（任意层级）──────────────────────────────────────
export const SKIP_FILE_RE = [
  /^多克多比v[\d.]+单机版\.zip$/,   // 发布包不进源码包 / 交接包
  /^多克多比.*源码包\.zip$/,
  /^多克多比制作\.zip$/,
  /\.rgba$/,
  /^_r\d+\.txt$/, /^_all\d*\.txt$/, /^_sh\.txt$/, /^_rel\.txt$/, /^_vz\.txt$/, /^_sm\.txt$/, /^_src\.txt$/, /^_sb\.txt$/,
]

// ── 单文件体积上限（MB）────────────────────────────────────
//   黑名单逐个拉是拉不干净的：原版归档 `多克多比专区资料素材.7z` 就在仓库根目录，
//   4.17 GB —— 不设上限会直接把 zip 写出器撞出 `ERR_FS_FILE_TOO_LARGE`。
//   超限的文件**跳过并明确报出来**（不静默跳过：万一是真需要的文件，得让人看见）。
export const MAX_FILE_MB = 64

/** 生成给 `collectEntries` 用的过滤函数。 */
export function makeFilter() {
  return (rel, dirent) => {
    for (const p of SKIP_PATHS) if (rel === p || rel.startsWith(p + '/')) return false
    const base = rel.split('/').pop()
    if (dirent.isDirectory()) return !SKIP_DIRS.has(base)
    for (const re of SKIP_FILE_RE) if (re.test(base)) return false
    return true
  }
}

/** 扫一遍，列出会被体积上限挡掉的文件（返回 [{rel, mb}]）。 */
export function listOversize(root, entries) {
  const out = []
  for (const e of entries) {
    if (e.dir || e.full == null) continue
    const mb = fs.statSync(e.full).size / 1048576
    if (mb > MAX_FILE_MB) out.push({ rel: e.name, mb })
  }
  return out
}

export const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)
export const mbOf = (bytes) => (bytes / 1048576).toFixed(1)
export { path }
