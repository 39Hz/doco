// 把我们的 52 只形态（官方七维数值 + 元素）注入 `多克多比-2026.2` 的程序集
//
// 【为什么要"内嵌进程序集"】那边的形态数据是 `docoitem : ScriptableObject` —— Unity 资产，
//   存在 `.assets` 里。**本机没有 Unity 编辑器**，造不出新资产。
//   但数值完全可以走代码：反编译出的 `Pokemon` 类里有 `CalculateStatsBasedOnLevel()`，
//   它从 `atkLevels[2]` 这类**数组**插值（Lv1→Lv99）。所以只要在代码里提供这些数组就行。
//
// 产出：`多克多比-2026.2/decompiled/src/DkdbbForms.generated.cs`
// 用法: node _tools/gen-dkdbb-forms-cs.mjs
import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './pixel-canvas.mjs'   // 读头像 PNG（转成裸 RGBA 内嵌）

const ROOT = path.resolve('.')
const FORMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/forms.json'), 'utf8')).forms
const OUT = path.join(ROOT, '多克多比-2026.2/decompiled/src/DkdbbForms.generated.cs')

// 元素名 → 那边的枚举名（他们的 enum ElementType 就是这 8 个）
const EL = { 水: 'Shui', 火: 'Huo', 土: 'Tu', 风: 'Feng', 光: 'Guang', 暗: 'An', 毒: 'Du', 无: 'Wu' }

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d)
// ⚠️ 七维里可能有 null（实测 5 只形态：超级克罗多比 等）——
//    直接生成 `new int[] { null, ... }` 是**非法 C#**，会编译失败。
//    所以必须整体校验：只要有一个不是数字，就当作没有七维（宁可不给，也不给错的）。
const attrsOf = (a) => {
  if (!a) return null
  const ks = ['pow', 'agi', 'vit', 'dex', 'mag', 'luk', 'spi']
  const vals = ks.map((k) => a[k])
  if (!vals.every((v) => typeof v === 'number' && isFinite(v))) return null
  return vals
}

// ---- 头像内嵌 ----
// 为什么要内嵌：游戏里的 `docoitem.itemSprite` 是 Unity 资产引用，没有编辑器就造不出来。
// 而 `Texture2D.LoadRawTextureData` 允许**从原始 RGBA 字节**在运行时造贴图，
// 所以把 96×96 的头像转成裸 RGBA、base64 存进源码，运行时还原成 Sprite。
// 没有官方立绘的形态（artMissing）图标留空 —— 界面会用元素色兜底，绝不借用别的形态的图。
const ICON_DIR = path.join(ROOT, 'assets/forms/art')
const ICON_SIZE = 96
function iconOf(f) {
  // ⚠️ 不能按 `<形态名>_icon.png` 拼路径：图标文件名与形态名并不同名
  //    （磁盘上是 `乔纳华多比_icon.png`，而形态名是 `乔纳·华 多比` —— 去掉了中点和空格）。
  //    第一版这么拼，52 只里只命中 20 只。`forms.json` 的 `artIcon` 才是权威路径。
  const rel = f.artIcon || null
  const p = rel ? path.join(ROOT, rel) : null
  if (!p || !fs.existsSync(p)) return null
  try {
    const img = decodePng(fs.readFileSync(p))
    // 统一缩放到 96×96（最近邻；图标本来就是这个尺寸，通常无需缩放）
    const out = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4)
    for (let y = 0; y < ICON_SIZE; y++) {
      for (let x = 0; x < ICON_SIZE; x++) {
        const sx = Math.min(img.w - 1, Math.floor(x * img.w / ICON_SIZE))
        const sy = Math.min(img.h - 1, Math.floor(y * img.h / ICON_SIZE))
        const s = (sy * img.w + sx) * 4, d = (y * ICON_SIZE + x) * 4
        out[d] = img.data[s]; out[d + 1] = img.data[s + 1]
        out[d + 2] = img.data[s + 2]; out[d + 3] = img.data[s + 3]
      }
    }
    return out.toString('base64')
  } catch (e) {
    console.log(`  ⚠️ 图标读取失败 ${f.name}: ${e.message}`)
    return null
  }
}
const rows = FORMS.map((f) => {
  const s = f.stats || {}
  const el = EL[f.element] || 'Wu'
  return {
    name: f.name,
    element: el,
    hp: num(s['生命'], 100),
    mp: num(s['魔力'], 50),
    atk: num(s['攻击'], 10),
    def: num(s['防御'], 10),
    matk: num(s['魔攻'], 10),
    mdef: num(s['魔防'], 10),
    hit: num(s['命中'], 30),
    eva: num(s['回避'], 30),
    crit: num(s['爆击'], 5),
    spd: num(s['速度'], 100),
    // 官方七维（原表直接给的那套），保留备用；含 null 时整体作废
    attrs: attrsOf(f.attrs),
    desc: (f.desc || '').replace(/"/g, "'").replace(/\s+/g, ' ').slice(0, 80),
    // 头像：内嵌成 base64 的原始 RGBA（运行时造 Texture2D/Sprite）
    icon: iconOf(f),
  }
})

let cs = `// ============================================================================
// 本文件由 _tools/gen-dkdbb-forms-cs.mjs 自动生成，请勿手改。
//
// 内容：把「多克多比单机版」项目里的 52 只形态（元素 + 官方数值）注入本工程。
//   数据源：assets/forms.json（官方策划表提取，含七维 attrs 与换算后的 stats）。
//
// 为什么走代码而不是 ScriptableObject：本机没有 Unity 编辑器，
//   造不出新的 docoitem 资产；而 Pokemon.CalculateStatsBasedOnLevel() 只依赖
//   atkLevels[2] 这类数组，代码里给足即可。
// ============================================================================
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Dkdbb
{
    /// <summary>一只形态的完整数值（用于灌进 Pokemon）。</summary>
    public class FormDef
    {
        public string name;
        public ElementType element;
        public int hp, mp, atk, def, magicAtk, magicDef, hit, evasion, crit, speed;
        public int[] attrs;       // 官方七维（pow/agi/vit/dex/mag/luk/spi），可能为 null
        public string desc;
        /// <summary>头像：96×96 原始 RGBA 的 base64（运行时还原成 Texture2D/Sprite）。
        /// 没有官方立绘的形态这里是 null —— 界面用元素色兜底，绝不借用别的形态的图。</summary>
        public string iconB64;
    }

    /// <summary>形态总表 + 灌数值的入口。</summary>
    public static class DkdbbForms
    {
        public static readonly FormDef[] All = new FormDef[]
        {
${rows.map((r) => `            new FormDef { name = ${JSON.stringify(r.name)}, element = ElementType.${r.element}, hp = ${r.hp}, mp = ${r.mp}, atk = ${r.atk}, def = ${r.def}, magicAtk = ${r.matk}, magicDef = ${r.mdef}, hit = ${r.hit}, evasion = ${r.eva}, crit = ${r.crit}, speed = ${r.spd}${r.attrs ? `, attrs = new int[] { ${r.attrs.join(', ')} }` : ''}, desc = ${JSON.stringify(r.desc)}${r.icon ? `, iconB64 = "${r.icon}"` : ''} },`).join('\n')}
        };

        private static Dictionary<string, FormDef> _byName;

        /// <summary>按名字取形态（忽略空格与「多比」后缀，便于和游戏里的命名对齐）。</summary>
        public static FormDef Get(string name)
        {
            if (string.IsNullOrEmpty(name)) return null;
            if (_byName == null)
            {
                _byName = new Dictionary<string, FormDef>();
                foreach (FormDef f in All)
                {
                    _byName[Normalize(f.name)] = f;
                }
            }
            string k = Normalize(name);
            if (_byName.TryGetValue(k, out FormDef exact)) return exact;
            // 退化匹配：包含关系（游戏里可能叫「水」而我们叫「水多比」）
            foreach (KeyValuePair<string, FormDef> kv in _byName)
            {
                if (k.Length > 0 && (kv.Key.Contains(k) || k.Contains(kv.Key))) return kv.Value;
            }
            return null;
        }

        /// <summary>归一化：去空格、去「多比」、去中点。</summary>
        public static string Normalize(string s)
        {
            if (s == null) return string.Empty;
            return s.Replace(" ", string.Empty).Replace("　", string.Empty)
                    .Replace("多比", string.Empty).Replace("·", string.Empty).Replace("・", string.Empty);
        }

        /// <summary>
        /// 把一只形态的数值灌进任意载体（Pokemon / docoitem）。
        /// Lv1→Lv99 用同一个值（我们的表只有单点数值，没有成长曲线），
        /// 这样 CalculateStatsBasedOnLevel() 插值出来的结果就等于表里的值。
        /// 名字查不到时**返回 false 且不改动任何字段** —— 不猜、不硬套（避免张冠李戴）。
        ///
        /// 为什么用**反射**而不是接口或 dynamic：
        ///   · 接口：本工程的类是**公有字段**，C# 的接口只认属性，字段不自动实现接口 → CS0535
        ///   · dynamic：需要 Microsoft.CSharp 的 RuntimeBinder，而 netstandard2.1 引用面下
        ///     报 CS0656（缺少编译器要求的成员 CSharpArgumentInfo.Create）
        ///   · 反射：没有编译期依赖，按字段名赋值，**缺字段就静默跳过**（不炸）
        /// </summary>
        public static bool Apply(object target, string formName, int level)
        {
            FormDef f = Get(formName);
            if (target == null || f == null) return false;
            Set(target, "pokemonName", f.name);
            Set(target, "pokemonLv", Mathf.Clamp(level, 1, 99));
            Set(target, "atkLevels", Pair(f.atk));
            Set(target, "defLevels", Pair(f.def));
            Set(target, "magicAtkLevels", Pair(f.magicAtk));
            Set(target, "magicDefLevels", Pair(f.magicDef));
            Set(target, "healAmountLevels", Pair(0));
            Set(target, "critRateLevels", PairF(f.crit / 100f));
            Set(target, "hitRateLevels", PairF(f.hit / 100f));
            Set(target, "evasionRateLevels", PairF(f.evasion / 100f));
            Set(target, "speedLevels", Pair(f.speed));
            Set(target, "maxHPLevels", Pair(f.hp));
            Set(target, "maxMagicLevels", Pair(f.mp));
            Set(target, "elementType", f.element);
            MarkApplied(target);
            LogOnce(f.name);
            return true;
        }

        /// <summary>按字段名赋值；字段不存在就静默跳过（兼容不同版本的类结构）。</summary>
        private static void Set(object target, string field, object value)
        {
            if (target == null) return;
            System.Reflection.FieldInfo fi = target.GetType().GetField(field,
                System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance);
            if (fi != null && value != null && fi.FieldType.IsInstanceOfType(value))
            {
                fi.SetValue(target, value);
            }
        }

        private static int[] Pair(int v) { return new int[] { v, v }; }
        private static float[] PairF(float v) { return new float[] { v, v }; }

        /// <summary>
        /// 标量版入口：『docoitem』用的是**单值字段**（atk/def/...），不是 *Levels 数组，
        /// 所以走这个重载。同样用反射绑定字段；名字查不到就返回 false 且不改任何字段。
        /// </summary>
        public static bool ApplyScalar(object target, string formName, int level)
        {
            FormDef f = Get(formName);
            if (target == null || f == null) return false;
            Set(target, "itemName", f.name);
            Set(target, "pokemonLv", Mathf.Clamp(level, 1, 99));
            Set(target, "atk", f.atk);
            Set(target, "def", f.def);
            Set(target, "magicAtk", f.magicAtk);
            Set(target, "magicDef", f.magicDef);
            Set(target, "healAmount", 0);
            Set(target, "critRate", f.crit / 100f);
            Set(target, "hitRate", f.hit / 100f);
            Set(target, "evasionRate", f.evasion / 100f);
            Set(target, "speed", f.speed);
            Set(target, "maxHP", f.hp);
            Set(target, "currentHP", f.hp);
            Set(target, "maxMagic", f.mp);
            Set(target, "currentMagic", f.mp);
            Set(target, "elementType", f.element);
            return true;
        }

        /// <summary>供 UI/日志用：一共注入了几只形态。</summary>
        public static int Count { get { return All.Length; } }

        // ------------------------------------------------------------------
        // 已灌注记录：同一只形态实例不必每次 CalculateStatsBasedOnLevel() 都重灌一遍
        // （反射有开销，战斗里这个方法会被频繁调用）。
        // 用实例 ID 而不是对象引用，避免把 GameObject 一直钉在内存里。
        // ------------------------------------------------------------------
        private static readonly HashSet<int> _applied = new HashSet<int>();
        private static readonly HashSet<string> _logged = new HashSet<string>();

        /// <summary>这个载体是否已经灌过我们的数值。</summary>
        public static bool IsApplied(object target)
        {
            if (target == null) return true;
            UnityEngine.Object uo = target as UnityEngine.Object;
            if (uo != null) return _applied.Contains(uo.GetInstanceID());
            return _applied.Contains(target.GetHashCode());
        }

        private static void MarkApplied(object target)
        {
            if (target == null) return;
            UnityEngine.Object uo = target as UnityEngine.Object;
            _applied.Add(uo != null ? uo.GetInstanceID() : target.GetHashCode());
        }

        /// <summary>首次给某只形态灌注时在 Player 日志里留一条（排查"挂钩有没有生效"用）。</summary>
        private static void LogOnce(string formName)
        {
            if (_logged.Contains(formName)) return;
            _logged.Add(formName);
            FormDef f = Get(formName);
            if (f != null)
            {
                UnityEngine.Debug.Log(string.Format(
                    "[Dkdbb] 已注入形态数值：{0}  元素={1}  HP={2} 攻={3} 防={4} 魔攻={5} 魔防={6} 速={7}",
                    f.name, f.element, f.hp, f.atk, f.def, f.magicAtk, f.magicDef, f.speed));
            }
        }

        /// <summary>
        /// 诊断：记录**每一个**走过数值计算的多比（含对不上的）。
        /// 用途：游戏里的名字与我们表里不同（实测游戏里叫「小黄人」），
        ///   只有把真实名字打出来，才能建立对应关系 —— 靠猜一定会错。
        /// </summary>
        public static void LogSeen(object target, string formName)
        {
            if (target == null) return;
            string key = "[seen]" + (formName == null ? "<null>" : formName);
            if (_logged.Contains(key)) return;
            _logged.Add(key);
            FormDef f = Get(formName);
            string tail = f != null
                ? string.Format("→ 命中我们的表：{0}", f.name)
                : "→ **未命中**我们的表";
            UnityEngine.Debug.Log(string.Format("[Dkdbb][seen] 遇到多比：name=[{0}] 等级={1} HP={2} 攻={3} 速={4}  {5}",
                formName, GetInt(target, "pokemonLv"), GetInt(target, "maxHP"), GetInt(target, "atk"), GetInt(target, "speed"), tail));
        }

        private static object GetFieldRaw(object target, string field)
        {
            if (target == null) return null;
            System.Reflection.FieldInfo fi = target.GetType().GetField(field,
                System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance);
            return fi == null ? null : fi.GetValue(target);
        }

        private static string GetInt(object target, string field)
        {
            object v = GetFieldRaw(target, field);
            return v == null ? "?" : v.ToString();
        }

        // ==================================================================
        // 授予全部多比
        //
        // 挂点：｀InventoryManager.RefreshItem()｀ —— 它每次切背包都会调，且会遍历
        //   ｀docoBag.docoitem｀ 生成格子，所以往那个列表里加东西立刻就能看见。
        //   （之前挂在 ｀CalculateStatsBasedOnLevel()｀ 上是不对的：实测游戏里
        //     多比一直没被装配，那个方法一次都没调用，钩子自然不触发。）
        //
        // 为什么能凭空造道具：｀docoitem｀ / ｀inventory｀ 都是 ｀ScriptableObject｀，
        //   而 ｀ScriptableObject.CreateInstance<T>()｀ 允许**运行时创建**，不需要 Unity 编辑器。
        //   图标则是内嵌的原始 RGBA（见 FormDef.iconB64），运行时用 Texture2D 还原。
        // ==================================================================
        private static bool _granted;

        /// <summary>把 52 只形态全部放进指定背包（只做一次，避免重复刷新时越加越多）。</summary>
        public static int GrantAll(object bag)
        {
            if (bag == null) return 0;
            System.Reflection.FieldInfo listField = bag.GetType().GetField("docoitem",
                System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance);
            if (listField == null) return 0;
            System.Collections.IList list = listField.GetValue(bag) as System.Collections.IList;
            if (list == null) return 0;

            if (_granted) return list.Count;

            // 已存在的名字记下来，避免和游戏原有的道具重名
            HashSet<string> have = new HashSet<string>();
            foreach (object o in list)
            {
                string n = GetFieldRaw(o, "itemName") as string;
                if (n != null) have.Add(n);
            }

            Type docoType = null;
            foreach (FormDef f in All)
            {
                if (have.Contains(f.name)) continue;
                if (docoType == null)
                {
                    // 用现有道具的类型（通常就是 docoitem），比写死类型名稳
                    foreach (object o in list) { docoType = o.GetType(); break; }
                    if (docoType == null)
                    {
                        // 背包是空的：退回按名字找类型
                        docoType = Type.GetType("docoitem, Assembly-CSharp");
                        if (docoType == null) { UnityEngine.Debug.LogWarning("[Dkdbb] 找不到 docoitem 类型，无法授予道具"); return 0; }
                    }
                }
                ScriptableObject so = ScriptableObject.CreateInstance(docoType);
                object item = (object)so;
                ApplyScalar(item, f.name, 1);           // 灌数值（含 itemName）
                SetSprite(item, f);                     // 灌图标
                list.Add(item);
            }
            _granted = true;
            UnityEngine.Debug.Log(string.Format("[Dkdbb] 已授予全部多比：背包现有 {0} 个", list.Count));
            return list.Count;
        }

        /// <summary>按名字找到一只形态（背包里点选时用）。</summary>
        public static FormDef Find(string name) { return Get(name); }

        /// <summary>把内嵌图标还原成 Sprite 并挂到道具上。没有图标就保持原样（界面用元素色兜底）。</summary>
        private static void SetSprite(object item, FormDef f)
        {
            Sprite sp = MakeSprite(f);
            if (sp == null) return;
            Set(item, "itemSprite", sp);
            Set(item, "zero", sp);
        }

        private static readonly Dictionary<string, Sprite> _spriteCache = new Dictionary<string, Sprite>();

        public static Sprite MakeSprite(FormDef f)
        {
            if (f == null || string.IsNullOrEmpty(f.iconB64)) return null;
            if (_spriteCache.ContainsKey(f.name)) return _spriteCache[f.name];
            try
            {
                byte[] raw = Convert.FromBase64String(f.iconB64);
                if (raw.Length != ICON_SIZE * ICON_SIZE * 4) return null;
                Texture2D tex = new Texture2D(ICON_SIZE, ICON_SIZE, TextureFormat.RGBA32, false);
                tex.LoadRawTextureData(raw);
                tex.Apply();
                Sprite sp = Sprite.Create(tex, new Rect(0f, 0f, ICON_SIZE, ICON_SIZE), new Vector2(0.5f, 0.5f));
                _spriteCache[f.name] = sp;
                return sp;
            }
            catch (Exception e)
            {
                UnityEngine.Debug.LogWarning("[Dkdbb] 图标还原失败 " + f.name + "：" + e.Message);
                return null;
            }
        }

        public const int ICON_SIZE = 96;

        /// <summary>把我们的形态名全部列出来（排查"名字对不上"时用）。</summary>
        public static string[] Names()
        {
            string[] n = new string[All.Length];
            for (int i = 0; i < All.Length; i++) n[i] = All[i].name;
            return n;
        }
    }
}
`
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, cs)
console.log(`已写出 ${path.relative(ROOT, OUT)}（${rows.length} 只形态）`)
const byEl = {}
for (const r of rows) byEl[r.element] = (byEl[r.element] || 0) + 1
console.log('元素分布：' + Object.entries(byEl).map(([k, v]) => `${k} ${v}`).join('  '))
console.log('\n前 3 只：')
for (const r of rows.slice(0, 3)) console.log(`  ${r.name}  ${r.element}  HP${r.hp} MP${r.mp} 攻${r.atk} 防${r.def} 魔攻${r.magicAtk} 速${r.speed}`)
