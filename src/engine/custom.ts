import { ROLES, roleName, type RoleId } from './roles';
import type { ScriptDef } from './editions';
import { nightsFor } from './nightOrder';
import { DISTRIBUTION, MAX_PLAYERS, MIN_PLAYERS } from './setup';

/**
 * 相克（官方 jinx）：两个角色同时在场时规则要改。网页按改过的规则做了的标 handled；
 * 没做的，自由配板随机抽角色时不让它们同时上场，并提醒说书人。能力说明是白话转述。
 */
export interface Jinx {
  a: RoleId;
  b: RoleId;
  text: string;
  handled: boolean;
}

export const JINXES: Jinx[] = [
  { a: 'alchemist', b: 'marionette', handled: false, text: '炼金术士拿不到提线木偶的能力；提线木偶一定在场。' },
  { a: 'alchemist', b: 'mastermind', handled: false, text: '炼金术士拿不到主谋的能力；主谋一定不在场。' },
  { a: 'alchemist', b: 'spy', handled: false, text: '炼金术士拿不到间谍的能力，间谍一定在场；每次处决后他可以公开猜谁是间谍，猜中当晚恶魔必须选间谍。' },
  { a: 'alchemist', b: 'widow', handled: false, text: '炼金术士拿不到寡妇的能力，寡妇一定在场；每次处决后他可以公开猜谁是寡妇，猜中当晚恶魔必须选寡妇。' },
  { a: 'alhadikhia', b: 'mastermind', handled: false, text: '哈迪寂亚被处决而主谋活着：当晚哈迪寂亚选三名善良玩家，三人都选活则邪恶赢，否则善良赢。' },
  { a: 'bountyhunter', b: 'philosopher', handled: false, text: '哲学家拿到赏金猎人的能力时，可能有一名镇民变成邪恶。' },
  { a: 'cannibal', b: 'butler', handled: false, text: '食人族拿到管家的能力时，他会被告知。' },
  { a: 'cannibal', b: 'juggler', handled: false, text: '杂耍艺人第一天猜完后被处决死亡：当晚活着的食人族得知他猜对了几个。' },
  { a: 'cerenovus', b: 'goblin', handled: false, text: '洗脑师可以让人疯狂地证明自己是哥布林。' },
  { a: 'leviathan', b: 'banshee', handled: false, text: '每晚利维坦选一名没选过的活着的善良玩家：选中报丧女妖时她死亡并获得能力。' },
  { a: 'leviathan', b: 'exorcist', handled: false, text: '利维坦提名并处决了驱魔人选中的人：善良获胜。' },
  { a: 'leviathan', b: 'grandmother', handled: false, text: '利维坦在场时孙子被处决死亡：邪恶获胜。' },
  { a: 'leviathan', b: 'innkeeper', handled: false, text: '利维坦提名并处决了旅店老板保护的人：善良获胜。' },
  { a: 'leviathan', b: 'mayor', handled: false, text: '第 5 天利维坦和镇长都活着且没人被处决：善良获胜。' },
  { a: 'leviathan', b: 'monk', handled: false, text: '利维坦提名并处决了僧侣保护的人：善良获胜。' },
  { a: 'leviathan', b: 'pithag', handled: false, text: '第 5 天之后利维坦不能再进场。' },
  { a: 'leviathan', b: 'ravenkeeper', handled: false, text: '每晚利维坦选一名没选过的活人：选中守鸦人时他用能力但不死。' },
  { a: 'leviathan', b: 'sage', handled: false, text: '每晚利维坦选一名没选过的活着的善良玩家：选中贤者时他用能力但不死。' },
  { a: 'leviathan', b: 'soldier', handled: false, text: '利维坦提名并处决了士兵：善良获胜。' },
  { a: 'lilmonsta', b: 'scarletwoman', handled: true, text: '小怪宝在 5 人及以上存活时死亡：红唇女郎从此一直照看小怪宝。' },
  { a: 'marionette', b: 'balloonist', handled: true, text: '提线木偶以为自己是气球驾驶员时，开局可能多加了一个外来者。（网页不给提线木偶这个假身份）' },
  { a: 'marionette', b: 'lilmonsta', handled: false, text: '提线木偶要在恶魔之后进场，并且坐在恶魔旁边。' },
  { a: 'mastermind', b: 'vigormortis', handled: false, text: '有能力的主谋在亡骨魔死后仍保留能力。' },
  { a: 'mathematician', b: 'chambermaid', handled: true, text: '侍女能查到数学家今晚会不会醒。' },
  { a: 'mathematician', b: 'drunk', handled: true, text: '数学家能数到酒鬼的能力给了假信息或没生效。' },
  { a: 'mathematician', b: 'lunatic', handled: false, text: '疯子攻击的人和真恶魔攻击的人不同时，数学家能数到。' },
  { a: 'mathematician', b: 'marionette', handled: true, text: '数学家能数到提线木偶的能力给了假信息或没生效。' },
  { a: 'pithag', b: 'goon', handled: false, text: '麻脸巫婆把邪恶玩家变成莽夫时，他不会因为自己的能力变成善良。' },
  { a: 'plaguedoctor', b: 'baron', handled: true, text: '说书人本该获得男爵的能力时，改为至多两名玩家变成外来者。' },
  { a: 'plaguedoctor', b: 'eviltwin', handled: false, text: '说书人本该获得镜像双子的能力时，改为一名玩家变成镜像双子。' },
  { a: 'plaguedoctor', b: 'fearmonger', handled: false, text: '说书人本该获得恐惧之灵的能力时，改为一名爪牙获得它并被告知。' },
  { a: 'plaguedoctor', b: 'goblin', handled: false, text: '说书人本该获得哥布林的能力时，改为一名爪牙获得它并被告知。' },
  { a: 'plaguedoctor', b: 'marionette', handled: true, text: '说书人本该获得提线木偶的能力时，改为恶魔的一名善良邻座变成提线木偶。' },
  { a: 'plaguedoctor', b: 'scarletwoman', handled: false, text: '说书人本该获得红唇女郎的能力时，改为一名爪牙获得它并被告知。' },
  { a: 'plaguedoctor', b: 'spy', handled: true, text: '说书人本该获得间谍的能力时，改为一名爪牙获得它并被告知。' },
  { a: 'recluse', b: 'sage', handled: false, text: '陌客可能被贤者当成恶魔。' },
  { a: 'scarletwoman', b: 'alhadikhia', handled: false, text: '会出现两个恶魔、其中一个原本是红唇女郎时，她变回红唇女郎。' },
  { a: 'scarletwoman', b: 'fanggu', handled: false, text: '会出现两个恶魔、其中一个原本是红唇女郎时，她仍然是红唇女郎。' },
  { a: 'vortox', b: 'banshee', handled: false, text: '涡流杀死报丧女妖时，所有人得知报丧女妖死了。' },
];

/** 角色表里出现的相克 */
export const jinxesIn = (roles: RoleId[]) => JINXES.filter((j) => roles.includes(j.a) && roles.includes(j.b));

/** 这组上场角色里有网页没做的相克：随机抽角色时避开 */
export const unhandledClash = (roles: RoleId[]) => jinxesIn(roles).some((j) => !j.handled);

/** 这个角色表能玩几个人（每个人数都要有足够的角色）；一个都不行返回 null */
export function playableRange(roles: RoleId[]): [number, number] | null {
  const n = (t: string) => roles.filter((r) => ROLES[r].team === t).length;
  const [towns, outs, minions, demons] = [n('townsfolk'), n('outsider'), n('minion'), n('demon')];
  if (!demons) return null;
  const ok: number[] = [];
  for (let c = MIN_PLAYERS; c <= MAX_PLAYERS; c++) {
    const [t, o, m] = DISTRIBUTION[c];
    // 外来者不够时由镇民补
    if (minions >= m && towns >= t + Math.max(0, o - outs)) ok.push(c);
  }
  return ok.length ? [ok[0], ok[ok.length - 1]] : null;
}

/** 配板还差什么（大白话） */
export function customProblems(roles: RoleId[]): string[] {
  const n = (t: string) => roles.filter((r) => ROLES[r].team === t).length;
  const out: string[] = [];
  if (!n('demon')) out.push('至少要一个恶魔。');
  if (!n('minion')) out.push('至少要一个爪牙。');
  if (n('townsfolk') < 3) out.push(`镇民至少要 3 个（现在 ${n('townsfolk')} 个）。`);
  if (!out.length && !playableRange(roles)) out.push('角色太少，凑不齐任何人数的配置：多加几个镇民或爪牙。');
  return out;
}

/** 用说书人挑的角色做一个剧本 */
export function makeCustom(name: string, roles: RoleId[]): ScriptDef {
  const r = playableRange(roles) ?? [MIN_PLAYERS, MAX_PLAYERS];
  const order: RoleId[] = [...roles].sort((a, b) => TEAM_ORDER.indexOf(ROLES[a].team) - TEAM_ORDER.indexOf(ROLES[b].team));
  return {
    id: 'custom',
    name: name.trim() || '自由配板',
    min: r[0],
    max: r[1],
    blurb: `说书人自己配的板子：${order.length} 个角色。`,
    roles: order,
    fabled: [],
    ...nightsFor(order),
  };
}

const TEAM_ORDER = ['townsfolk', 'outsider', 'minion', 'demon'];

export const jinxLabel = (j: Jinx) => `${roleName(j.a)} × ${roleName(j.b)}`;
