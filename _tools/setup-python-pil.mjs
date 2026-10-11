// 搭一个便携 Python（embeddable）+ Pillow，用来跑 `_tools/gen-form-walk.mjs`（它内嵌 Python 且要 PIL）
//
// 【为什么需要】走路帧生成器是**内嵌 Python** 的脚本，而本机 `python` 是 Windows 应用商店的占位
//   （`python --version` 无输出）、也没有 PIL —— 所以那 184 张走路帧**改不了**。
//   embeddable zip 只有约 11 MB，解压即用、不写注册表，放 `_tools/py/`（不进发布包）。
//
// ⚠️ embeddable 版默认**不读 site-packages、不带 pip**，所以要三步：
//   ① 解开 `python311._pth` 里 `import site` 的注释；② 装 pip；③ 装 Pillow。
//
// 用法: node _tools/setup-python-pil.mjs [--force]
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve('.')
const AI = path.join(ROOT, '_tools')
const PYDIR = path.join(AI, 'py')
const FORCE = process.argv.includes('--force')
const PYVER = '3.11.9'
const ZIP = path.join(AI, `py-embed-${PYVER}.zip`)

// 华为云镜像比 python.org 快 4 倍（实测 1605 vs 373 KB/s），失败再回退官方
const ZIP_URLS = [
  `https://mirrors.huaweicloud.com/python/${PYVER}/python-${PYVER}-embed-amd64.zip`,
  `https://www.python.org/ftp/python/${PYVER}/python-${PYVER}-embed-amd64.zip`,
]
const GETPIP = 'https://bootstrap.pypa.io/get-pip.py'

function fetch(url, dst, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 4) return reject(new Error('跳转过多'))
    https.get(url, { headers: { 'User-Agent': 'node' }, timeout: 180000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return resolve(fetch(new global.URL(res.headers.location, url).href, dst, depth + 1))
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)) }
      const out = fs.createWriteStream(dst)
      res.pipe(out)
      out.on('finish', () => out.close(() => resolve(fs.statSync(dst).size)))
      out.on('error', reject)
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('超时')) })
  })
}

const PY = path.join(PYDIR, 'python.exe')
if (fs.existsSync(PY) && !FORCE) {
  console.log(`已存在便携 Python：${path.relative(ROOT, PY)}（要重装加 --force）`)
} else {
  if (!fs.existsSync(ZIP)) {
    let ok = false
    for (const u of ZIP_URLS) {
      try {
        const n = await fetch(u, ZIP)
        console.log(`✓ 下载 embeddable zip ${(n / 1048576).toFixed(1)} MB ← ${new global.URL(u).host}`)
        ok = true
        break
      } catch (e) { console.log(`  该源失败（${e.message}），换下一个…`) }
    }
    if (!ok) { console.log('✗ 三个源都失败'); process.exit(1) }
  }
  fs.rmSync(PYDIR, { recursive: true, force: true })
  fs.mkdirSync(PYDIR, { recursive: true })
  // 用 PowerShell 解压（Node 无内置 zip 解压，且本机无 unzip）
  execFileSync('powershell', ['-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${ZIP}' -DestinationPath '${PYDIR}' -Force`], { stdio: 'inherit' })
  console.log('✓ 已解压')
  // ① 打开 site-packages
  const pth = fs.readdirSync(PYDIR).find((f) => /^python\d+\._pth$/.test(f))
  if (!pth) { console.log('✗ 找不到 ._pth 文件'); process.exit(1) }
  const pthPath = path.join(PYDIR, pth)
  let txt = fs.readFileSync(pthPath, 'utf8')
  txt = txt.replace(/^#\s*import site/m, 'import site')
  if (!/^import site/m.test(txt)) txt += '\nimport site\n'
  // 让 pip 装到本地 Lib/site-packages
  if (!/Lib\\site-packages/.test(txt)) txt = txt.replace(/(\r?\n)?$/, `\nLib\\site-packages\n`)
  fs.writeFileSync(pthPath, txt)
  console.log(`✓ 已启用 site-packages（${pth}）`)
}

// ② 装 pip
const hasPip = (() => {
  try { execFileSync(PY, ['-m', 'pip', '--version'], { stdio: 'ignore' }); return true } catch { return false }
})()
if (!hasPip) {
  const gp = path.join(AI, 'get-pip.py')
  if (!fs.existsSync(gp)) {
    const n = await fetch(GETPIP, gp)
    console.log(`✓ get-pip.py ${(n / 1024).toFixed(0)} KB`)
  }
  execFileSync(PY, [gp, '--no-warn-script-location'], { stdio: 'inherit' })
} else console.log('✓ pip 已就绪')

// ③ 装 Pillow
try {
  execFileSync(PY, ['-c', 'import PIL, PIL.Image; print("PIL", PIL.__version__)'], { stdio: 'inherit' })
  console.log('✓ Pillow 已就绪')
} catch {
  execFileSync(PY, ['-m', 'pip', 'install', '--no-warn-script-location',
    '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple', 'pillow'], { stdio: 'inherit' })
}
// 自证：必须能 import PIL（否则后面生成走路帧还会失败）
const out = execFileSync(PY, ['-c', 'import PIL;print(PIL.__version__)'], { encoding: 'utf8' }).trim()
console.log(`✓ 自证通过：${path.relative(ROOT, PY)} → Pillow ${out}`)
console.log(`\n生成器要用它：把环境变量 PY 指过来即可`)
console.log(`  $env:PY = "${PY}"`)
console.log(`  或直接跑: node _tools/gen-form-walk.mjs`)
