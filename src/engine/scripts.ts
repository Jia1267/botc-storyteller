import { seatName } from './core';
import type { SlotId } from './types';

/** 一步的台词：simple = 简洁标准，atmo = 氛围旁白 */
type Lines = { simple: string[]; atmo: string[] };

export const SLOT_TITLE: Record<SlotId, string> = {
  dusk: '入夜',
  minionInfo: '爪牙互认',
  demonInfo: '恶魔得知爪牙与伪装',
  poisoner: '投毒者',
  washerwoman: '洗衣妇',
  librarian: '图书管理员',
  investigator: '调查员',
  chef: '厨师',
  empath: '共情者',
  fortuneteller: '占卜师',
  butler: '管家',
  spy: '间谍',
  monk: '僧侣',
  scarletwoman: '红唇女郎接任',
  imp: '小恶魔',
  ravenkeeper: '守鸦人',
  undertaker: '送葬者',
  dawn: '天亮',
  lunatic: '疯子',
  lilmonsta: '小怪宝：爪牙选照看者',
  widow: '寡妇',
  fearmonger: '恐惧之灵',
  pixie: '小精灵',
  chambermaid: '侍女',
  vortox: '涡流',
  duchess: '公爵夫人的拜访者',
  amnesiac: '失忆者',
  balloonist: '气球驾驶员',
  bureaucrat: '官员（旅行者）',
  thief: '窃贼（旅行者）',
};

const SLOT_LINES: Partial<Record<SlotId, Lines>> = {
  dusk: {
    simple: ['天黑请闭眼。'],
    atmo: ['夜幕降临，钟楼敲响了午夜的钟声。', '镇上的居民们，请闭上眼睛，低下头……', '黑暗里，有人醒着。'],
  },
  minionInfo: {
    simple: ['这是你们的恶魔。'],
    atmo: ['看清你们的同伴。', '这一位，就是你们侍奉的恶魔。'],
  },
  demonInfo: {
    simple: ['这些是你的爪牙。', '这三个角色不在场，你可以伪装成他们。'],
    atmo: ['这些，是为你效命的爪牙。', '这三个身份无人认领——你可以借用它们藏身。'],
  },
  poisoner: {
    simple: ['请选择一名玩家下毒。'],
    atmo: ['毒药已经备好。今夜，你要让谁尝一尝？'],
  },
  washerwoman: {
    simple: ['这两人中，有一人是这个角色。'],
    atmo: ['晾衣绳上的衣服，泄露了某人的秘密……', '这两人之中，有一人是——'],
  },
  librarian: {
    simple: ['这两人中，有一人是这个角色。'],
    atmo: ['书架深处，藏着一份名单……', '这两人之中，有一人是——'],
  },
  investigator: {
    simple: ['这两人中，有一人是这个爪牙。'],
    atmo: ['你在暗处跟踪了一整天……', '这两人之中，有一人是——'],
  },
  chef: {
    simple: ['这是相邻而坐的邪恶玩家的对数。'],
    atmo: ['宴席上，你闻到了阴谋的气味。', '相邻而坐的邪恶，有这么多对——'],
  },
  empath: {
    simple: ['这是你两边最近的存活玩家中，邪恶玩家的数量。'],
    atmo: ['你感受着身边人的心跳……', '你两侧最近的人里，邪恶的有——'],
  },
  fortuneteller: {
    simple: ['请选择两名玩家。'],
    atmo: ['水晶球中雾气翻涌……选择两个人吧。'],
  },
  butler: {
    simple: ['请选择你的主人。'],
    atmo: ['选择你明天要侍奉的主人。'],
  },
  spy: {
    simple: ['这是魔典。'],
    atmo: ['魔典就在你眼前。看吧，记住你想记住的。'],
  },
  monk: {
    simple: ['请选择一名玩家，今晚你保护他。'],
    atmo: ['今夜，你要为谁祈祷？'],
  },
  scarletwoman: {
    simple: ['你现在是小恶魔。'],
    atmo: ['你的主人倒下了……从此刻起，你就是恶魔。'],
  },
  imp: {
    simple: ['请选择一名玩家，他会死亡。'],
    atmo: ['恶魔，醒来吧。今夜，谁会死去？'],
  },
  ravenkeeper: {
    simple: ['你今晚死了。请选择一名玩家，你会得知他的角色。'],
    atmo: ['乌鸦在你的尸体旁盘旋……', '选择一个人，看清他的真面目。'],
  },
  undertaker: {
    simple: ['这是今天被处决的玩家的角色。'],
    atmo: ['你为今天的死者收殓……', '他真实的身份是——'],
  },
  lunatic: {
    simple: ['请选择一名玩家，他会死亡。'],
    atmo: ['恶魔，醒来吧。今夜，谁会死去？'],
  },
  lilmonsta: {
    simple: ['爪牙们，请商量由谁来照看小怪宝，指向那个人。'],
    atmo: ['小怪宝在摇篮里哭闹……', '爪牙们，决定今晚由谁来照看它。'],
  },
  widow: {
    simple: ['这是魔典。请选择一名玩家，他会中毒。'],
    atmo: ['你拥有了整个小镇的秘密……', '选一个人，让他今后再也分不清真假。'],
  },
  fearmonger: {
    simple: ['请选择一名玩家。'],
    atmo: ['恐惧在黑暗里蔓延……你要让谁成为你的猎物？'],
  },
  pixie: {
    simple: ['这个镇民角色在场。'],
    atmo: ['林间的小精灵悄悄告诉你——', '这个角色，就在你们中间。'],
  },
  chambermaid: {
    simple: ['请选择除你以外的两名存活玩家。', '他们之中今晚因为自己的能力醒来过的人数是——'],
    atmo: ['你整夜在走廊里巡视……选两扇门。', '今晚，这两间房里有人醒过——'],
  },
  vortox: {
    simple: ['请选择一名玩家，他会死亡。'],
    atmo: ['漩涡在黑暗中旋转……今夜，谁会被卷走？'],
  },
  duchess: {
    simple: ['今天拜访公爵夫人的人里，有这么多个是邪恶的。'],
    atmo: ['公爵夫人送来一封密信——', '今天的客人里，心怀不轨的有——'],
  },
  bureaucrat: {
    simple: ['请选择一名其他玩家，明天他的投票算 3 票。'],
    atmo: ['你手里握着官印……明天，谁的一票会变得格外沉重？'],
  },
  thief: {
    simple: ['请选择一名其他玩家，明天他的投票算负数。'],
    atmo: ['夜色正好下手……明天，你要偷走谁的一票？'],
  },
  balloonist: {
    simple: ['这名玩家的类型和你之前得知的都不同。'],
    atmo: ['热气球在夜空中升起，你看见了——', '这个人。'],
  },
};

export function slotLines(slot: SlotId, style: 'simple' | 'atmo'): string[] {
  return SLOT_LINES[slot]?.[style] ?? [];
}

export function librarianZeroLines(style: 'simple' | 'atmo'): string[] {
  return style === 'simple' ? ['场上没有外来者。'] : ['书架深处的名单上……一个外来者也没有。'];
}

export function dawnLines(deaths: number[], style: 'simple' | 'atmo', extra: { fear?: boolean; leviathanDay?: number } = {}): string[] {
  const list = deaths.map((n) => `${seatName(n)}`).join('、');
  const out =
    style === 'simple'
      ? ['天亮了，大家请睁眼。', deaths.length ? `昨晚，${list} 死了。` : '昨晚是平安夜，没有人死亡。']
      : ['晨光刺破了黑夜，大家请睁开眼睛。', deaths.length ? `可惜，昨夜 ${list} 再也没有醒来……` : '昨夜，钟楼小镇平安无事。'];
  if (extra.fear) out.push('恐惧之灵选择了一名新的目标。');
  if (extra.leviathanDay === 1) out.push('另外：利维坦在场。');
  else if (extra.leviathanDay) out.push(`今天是第 ${extra.leviathanDay} 天，利维坦仍在场。`);
  return out;
}

export function dayStartLines(day: number, style: 'simple' | 'atmo'): string[] {
  if (style === 'simple') return [`现在是第 ${day} 天。大家可以自由讨论，也可以私聊。`];
  return [`第 ${day} 天。镇民们聚在广场上，交换着彼此的秘密……`, '有人说了真话，有人没有。'];
}

export function nominationLines(style: 'simple' | 'atmo'): string[] {
  if (style === 'simple')
    return [
      '讨论时间到。现在开始提名：每人每天只能提名一次，每人每天只能被提名一次。',
      '被提名的人可以辩护，然后从被提名者开始，按顺时针依次举手投票。',
    ];
  return [
    '钟声响起，审判开始。',
    '谁有怀疑的对象，现在可以提名。每人每天只能提名一次，也只能被提名一次。',
    '被提名者可以为自己辩护，然后从他开始，顺时针依次举手。',
  ];
}

export function executionLines(n: number | null, style: 'simple' | 'atmo'): string[] {
  if (n === null) return style === 'simple' ? ['今天没有人被处决。'] : ['今天，绞刑架空着。没有人被处决。'];
  return style === 'simple' ? [`${seatName(n)} 被处决了。`] : ['绞索收紧……', `${seatName(n)} 被处决了。`];
}

export function endLines(winner: 'good' | 'evil', style: 'simple' | 'atmo'): string[] {
  if (winner === 'good')
    return style === 'simple' ? ['游戏结束：善良阵营获胜！'] : ['恶魔的力量消散了，钟楼重归宁静。', '善良阵营获胜！'];
  return style === 'simple' ? ['游戏结束：邪恶阵营获胜！'] : ['黑暗吞没了整个小镇……', '邪恶阵营获胜！'];
}
