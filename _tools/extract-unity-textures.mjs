// 用 UnityPy 导出 `多克多比-2026.2` Unity 游戏里的全部贴图
//
// 【为什么这条路最靠谱】那个目录是**完整的 Unity 游戏**（509MB 标准资源包），
//   UnityPy 是专门读 Unity 资源的成熟库 —— 比"自己渲染 FLA/SWF"简单、可靠得多。
//
// 产出：_tmp_test_out/unity-textures/（按对象名命名）+ catalog.json（清单）
// 用法: node _tools/extract-unity-textures.mjs [游戏目录] [输出目录] [最小尺寸]
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve('.')
const GAME = path.join(ROOT, process.argv[2] || '多克多比-2026.2')
const OUT = path.join(ROOT, process.argv[3] || '_tmp_test_out/unity-textures')
const MIN = Number(process.argv[4] || 64)
if (!fs.existsSync(GAME)) { console.log(`✗ 找不到游戏目录：${GAME}`); process.exit(1) }

const PY = path.join(ROOT, '_tools', 'py', 'python.exe')
if (!fs.existsSync(PY)) { console.log('✗ 没有便携 python'); process.exit(1) }

fs.mkdirSync(OUT, { recursive: true })
const PYOUT = path.join(ROOT, '_tmp_test_out', 'unity-catalog.json')
const pyPath = path.join(ROOT, '_tmp_test_out', '_unity_extract.py')
const PYSRC = `
import os, sys, json, traceback
import UnityPy

GAME = r"${GAME.replace(/\\/g, '/')}"
OUT = r"${OUT.replace(/\\/g, '/')}"
MIN = ${MIN}

catalog = []
errors = []
files = []
for dirpath, _dirs, names in os.walk(GAME):
    for n in names:
        if n.lower().endswith(('.assets', '.unity3d', '.bundle')) or n == 'globalgamemanagers':
            files.append(os.path.join(dirpath, n))
files.sort()
print("资源文件 %d 个" % len(files))

seen = 0
for f in files:
    try:
        env = UnityPy.load(f)
    except Exception as e:
        errors.append([os.path.basename(f), str(e)[:120]])
        continue
    for obj in env.objects:
        seen += 1
        if obj.type.name not in ("Texture2D", "Sprite"):
            continue
        try:
            data = obj.read()
            name = getattr(data, "m_Name", None) or getattr(data, "name", None) or ("obj_%d" % obj.path_id)
            img = data.image if hasattr(data, "image") else None
            if img is None:
                continue
            w, h = img.size
            if w < MIN or h < MIN:
                continue
            safe = "".join(c if (c.isalnum() or c in "-_.·") else "_" for c in str(name))[:80]
            fn = "%s_%dx%d_%d.png" % (safe, w, h, obj.path_id)
            img.save(os.path.join(OUT, fn))
            catalog.append({"name": str(name), "file": fn, "w": w, "h": h,
                            "type": obj.type.name, "src": os.path.basename(f)})
        except Exception as e:
            errors.append([getattr(obj, "path_id", "?"), str(e)[:120]])

print("扫描对象 %d 个，导出贴图 %d 张" % (seen, len(catalog)))
print("错误 %d 条" % len(errors))
for e in errors[:8]:
    print("   ", e)
with open(r"${PYOUT.replace(/\\/g, '/')}", "w", encoding="utf-8") as fp:
    json.dump({"count": len(catalog), "textures": catalog, "errors": errors[:200]}, fp, ensure_ascii=False)
print("清单已写出")
`
fs.writeFileSync(pyPath, PYSRC, 'utf8')
console.log(`游戏目录 ${path.relative(ROOT, GAME)}`)
console.log(`输出目录 ${path.relative(ROOT, OUT)}（最小尺寸 ${MIN}）\n`)
try {
  execFileSync(PY, [pyPath], { stdio: 'inherit', cwd: ROOT })
} catch (e) {
  console.log(`python 退出异常: ${String(e.message).slice(0, 200)}`)
}
if (fs.existsSync(PYOUT)) {
  const cat = JSON.parse(fs.readFileSync(PYOUT, 'utf8'))
  console.log(`\n目录清单：${cat.count} 张贴图`)
  const big = cat.textures.slice().sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 10)
  console.log('最大的 10 张：')
  for (const t of big) console.log(`  ${t.w}×${t.h}  ${t.name}  (${t.type})`)
} else console.log('\n✗ 没有产出清单')
