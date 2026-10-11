// 用便携 Python 装 UnityPy（用于导出 Unity 资源包里的贴图）
//
// 【背景】工作区根目录的 `多克多比-2026.2/` 是一个**完整的 Unity 游戏**（509MB，
//   87 个 .assets + 86 个 .resS）—— 这是美术资源的现成来源，比渲染 FLA 靠谱得多。
//   Unity 的 .assets 是标准格式，UnityPy 能直接读出里面的 Texture2D/Sprite。
//
// 用法: node _tools/setup-unitypy.mjs
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve('.')
const PY = path.join(ROOT, '_tools', 'py', 'python.exe')
if (!fs.existsSync(PY)) { console.log(`✗ 没有便携 python：${PY}（先跑 node _tools/setup-python-pil.mjs）`); process.exit(1) }

const run = (args, label) => {
  console.log(`\n> python ${args.join(' ')}`)
  try {
    execFileSync(PY, args, { stdio: 'inherit', cwd: ROOT })
    console.log(`  ✓ ${label}`)
    return true
  } catch (e) {
    console.log(`  ✗ ${label} 失败: ${String(e.message).slice(0, 200)}`)
    return false
  }
}

// 已装就跳过
try {
  execFileSync(PY, ['-c', 'import UnityPy;print(UnityPy.__version__)'], { stdio: 'inherit' })
  console.log('✓ UnityPy 已就绪')
} catch {
  run(['-m', 'pip', 'install', '--no-warn-script-location', '--disable-pip-version-check', 'UnityPy'], '安装 UnityPy')
}

// 自证：必须能 import 并说出支持的游戏版本
try {
  execFileSync(PY, ['-c', 'import UnityPy;print("UnityPy", UnityPy.__version__)'], { stdio: 'inherit' })
  console.log('\n✓ 自证通过：UnityPy 可用')
} catch {
  console.log('\n✗ UnityPy 仍不可用')
  process.exit(1)
}
