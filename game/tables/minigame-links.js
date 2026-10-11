/* 官方 NPC ↔ 小游戏 的关联表（第 37 轮）
 *
 * ⚠️ 这一整张表都是 **derived（推算）**，不是官方原文。
 *
 * 依据只有两条：
 *   ① 官方 NPC 表（归档 `npc大全\NPC.xlsx`）里那位 NPC 的**台词原文**；
 *   ② 归档 `小游戏截图\` 里那些小游戏的**官方名字**。
 * 台词的主题与某个小游戏的名字/玩法主题对得上 → 我们让这位 NPC 开启它。
 *
 * **原文并没有说"由这位 NPC 开启这个小游戏"** —— 官方原文（7k7k/167013）只说
 * 「多克多比游戏中有个**专门介绍这些游戏的 npc** 哦~」（连名字都没给）。
 * 所以：
 *   · 界面上这条菜单的提示语直接写「推算关联 · 台词里提到过」；
 *   · 每一条都带 `why`（对上了什么）与 `conf`，便于日后有人拿着原文来纠正；
 *   · **名字对不上的绝不硬连**（例如「开拓者」讲考古日志、「光之使者」讲智慧大比拼，
 *     找不到同名小游戏 → 不连）。
 *
 * 另外还有一个总入口：NPC「小游戏向导」（V52，名字是本项目起的）+ 键盘 Y 键。
 */
(() => {
  'use strict'
  const D = window.DKDbbData = window.DKDbbData || {}

  // NPC 的官方 id（来自 NPC.xlsx）→ 小游戏 id（来自 game/tables/minigames.js）
  const LINKS = [
    {
      npcId: 'NPC_01_05', npc: '多比奶奶', minigame: 'memoryCrystal',
      why: '台词「看看这些水晶，他们是可以唤醒你记忆的潜力」——**水晶** + **记忆** 与小游戏名「记忆水晶」同词',
    },
    {
      npcId: 'NPC_01_04', npc: '智慧多比', minigame: 'thinkBlocks',
      why: '台词「我是这里有一套训练思维的方法，想试试吗？锻炼思维能力可以让你变得更聪明」——**训练思维**与小游戏名「思维方块」同题',
    },
    {
      npcId: 'NPC-02-01', npc: '冰激凌女孩', minigame: 'crazyIce',
      why: '台词「我做的冰激凌绝对不含防腐剂哟！」——**冰激凌**与小游戏名「疯狂冰激凌」同词',
    },
    {
      npcId: 'NPC_02_02', npc: '人事小多克', minigame: 'richman',
      why: '台词「理财就是花钱的智慧，你有这种智慧吗？」——**理财**与小游戏名「多克大富翁」同题',
    },
    {
      npcId: 'NPC_01_15', npc: '图书管理员', minigame: 'saveBook',
      why: '台词「讨厌的火精灵，赶都赶不走。他们喜欢把书当食物」——**书**被吃掉与小游戏名「拯救多比古书」同题',
    },
    {
      npcId: 'NPC_01_07', npc: '飞行员多比', minigame: 'aceDogfight',
      why: '台词「我不喜欢魔法飞行，我喜欢驾驶飞行器，。飞行是需要高度的反应力的」——**驾驶飞行器**与小游戏名「王牌大空战」同题',
    },
  ]

  for (const l of LINKS) {
    l.conf = 'derived'
    l.note = '台词主题与小游戏名/玩法相符，但**原文没有说由这位 NPC 开启** —— 这是本项目的推算关联'
  }

  D.NPC_MINIGAME_LINKS = LINKS
  D.npcMinigameLink = (npcId) => LINKS.find((l) => l.npcId === npcId) || null
})()
