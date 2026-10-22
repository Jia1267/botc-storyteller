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
  { a: 'alchemist', b: 'boffin', handled: false, text: '炼金术士拿到科学怪人的能力时，他不会得知恶魔获得了哪个能力。' },
  { a: 'alchemist', b: 'organgrinder', handled: false, text: '炼金术士拿到风琴手的能力时，风琴手一定在场；两人都清醒的话两人都醉酒。' },
  { a: 'alchemist', b: 'summoner', handled: false, text: '炼金术士拿到召唤师的能力：他没有伪装，只决定是哪种恶魔、不决定是谁；召唤前他死了，邪恶获胜。[没有恶魔]' },
  { a: 'alchemist', b: 'wraith', handled: false, text: '炼金术士拿不到亡魂的能力，亡魂一定在场；每次处决后他可以公开猜谁是亡魂，猜中当晚恶魔必须选亡魂。' },
  { a: 'alhadikhia', b: 'princess', handled: false, text: '公主第一天提名并处决了人：当晚没有人因哈迪寂亚而死。' },
  { a: 'boffin', b: 'cultleader', handled: false, text: '恶魔拿到异教领袖的能力时，不会因此变成善良。' },
  { a: 'boffin', b: 'drunk', handled: true, text: '恶魔不能拿到酒鬼的能力。（网页不会给）' },
  { a: 'boffin', b: 'goon', handled: false, text: '恶魔拿到莽夫的能力时，不会因此变成善良。' },
  { a: 'boffin', b: 'heretic', handled: true, text: '恶魔不能拿到异端分子的能力。（网页不会给）' },
  { a: 'boffin', b: 'ogre', handled: true, text: '恶魔不能拿到食人魔的能力。（网页不会给）' },
  { a: 'boffin', b: 'politician', handled: true, text: '恶魔不能拿到政客的能力。（网页不会给）' },
  { a: 'boffin', b: 'villageidiot', handled: false, text: '有多余的村夫标记时，科学怪人可以让恶魔拿到村夫的能力。' },
  { a: 'bountyhunter', b: 'kazali', handled: false, text: '卡扎力把赏金猎人变成爪牙时，不再产生邪恶的镇民。' },
  { a: 'butler', b: 'organgrinder', handled: false, text: '闭眼投票时管家可以举手，但只有主人也投了票，他的票才算。' },
  { a: 'cannibal', b: 'princess', handled: false, text: '食人族提名、处决并杀死了公主：当晚恶魔不杀人。' },
  { a: 'cannibal', b: 'zealot', handled: false, text: '食人族拿到狂热者的能力时，他会被告知。' },
  { a: 'heretic', b: 'baron', handled: false, text: '这两个角色只能有一个在场。' },
  { a: 'heretic', b: 'godfather', handled: false, text: '这两个角色只能有一个在场。' },
  { a: 'heretic', b: 'lleech', handled: false, text: '这两个角色只能有一个在场。' },
  { a: 'heretic', b: 'pithag', handled: false, text: '这两个角色只能有一个在场。' },
  { a: 'heretic', b: 'spy', handled: false, text: '这两个角色只能有一个在场。' },
  { a: 'heretic', b: 'widow', handled: false, text: '这两个角色只能有一个在场。' },
  { a: 'legion', b: 'engineer', handled: false, text: '造出军团时所有邪恶玩家都变成军团；军团在场时工程师开局得知这一点，但没有能力。' },
  { a: 'legion', b: 'hatter', handled: false, text: '造出军团时所有邪恶玩家都变成军团；军团在场时帽匠没有能力。' },
  { a: 'legion', b: 'minstrel', handled: false, text: '军团今天被处决死亡：军团保留能力，但吟游诗人可能得知他们是军团。' },
  { a: 'legion', b: 'politician', handled: false, text: '政客可能被军团当成邪恶。' },
  { a: 'legion', b: 'preacher', handled: false, text: '传教士选中军团：军团保留能力，但传教士可能得知他是军团。' },
  { a: 'legion', b: 'summoner', handled: false, text: '召唤出军团时，所有邪恶玩家都变成军团。' },
  { a: 'legion', b: 'zealot', handled: false, text: '狂热者可能被军团当成邪恶。' },
  { a: 'leviathan', b: 'farmer', handled: false, text: '每晚利维坦选一名没选过的活着的善良玩家：选中农夫时他用能力但不死。' },
  { a: 'leviathan', b: 'hatter', handled: false, text: '第 5 天之后利维坦不能再进场。' },
  { a: 'leviathan', b: 'king', handled: false, text: '利维坦在场且至少死了一个人：国王每晚得知一个活着的角色。' },
  { a: 'lilmonsta', b: 'hatter', handled: false, text: '帽匠死后恶魔选小怪宝时，他还要再选一个爪牙当。' },
  { a: 'lilmonsta', b: 'magician', handled: false, text: '魔术师活着时，由说书人决定哪个爪牙照看小怪宝。' },
  { a: 'lilmonsta', b: 'poppygrower', handled: false, text: '小怪宝和罂粟种植者都在时，爪牙一个一个醒来，直到有人选择照看小怪宝。' },
  { a: 'lilmonsta', b: 'psychopath', handled: false, text: '照看小怪宝的精神病患者被处决就会死。' },
  { a: 'lilmonsta', b: 'vizier', handled: false, text: '照看小怪宝的维齐尔被处决就会死。' },
  { a: 'lleech', b: 'mastermind', handled: false, text: '主谋活着时宿主被处决死亡：痢蛭不死，但失去能力。' },
  { a: 'lleech', b: 'slayer', handled: false, text: '猎手射中痢蛭的宿主：宿主死亡。' },
  { a: 'magician', b: 'legion', handled: false, text: '魔术师在场：恶魔得知爪牙那一步军团分几批醒，每批知道谁是好人，但不知道魔术师。' },
  { a: 'magician', b: 'marionette', handled: false, text: '魔术师活着时，恶魔不知道哪个邻座是提线木偶。' },
  { a: 'magician', b: 'spy', handled: false, text: '间谍看魔典时，恶魔和魔术师的角色标记要拿掉。' },
  { a: 'magician', b: 'vizier', handled: false, text: '维齐尔在场时魔术师没有能力，但不受维齐尔能力影响。' },
  { a: 'magician', b: 'widow', handled: false, text: '寡妇看魔典时，恶魔和魔术师的角色标记要拿掉。' },
  { a: 'magician', b: 'wraith', handled: false, text: '每次处决后活着的魔术师可以公开猜谁是亡魂，猜中当晚恶魔必须选亡魂。' },
  { a: 'marionette', b: 'huntsman', handled: true, text: '提线木偶以为自己是巡山人时，开局要加上落难少女。（网页不给提线木偶这个假身份）' },
  { a: 'marionette', b: 'kazali', handled: false, text: '会有提线木偶时，他在恶魔之后进场，并且坐在恶魔旁边。' },
  { a: 'marionette', b: 'summoner', handled: false, text: '会有提线木偶时，他在恶魔之后进场，并且坐在恶魔旁边。' },
  { a: 'pithag', b: 'cultleader', handled: false, text: '麻脸巫婆把邪恶玩家变成异教领袖时，他不会因此变成善良。' },
  { a: 'pithag', b: 'damsel', handled: false, text: '麻脸巫婆造出落难少女时，由说书人决定是哪个玩家。' },
  { a: 'pithag', b: 'ogre', handled: false, text: '麻脸巫婆把邪恶玩家变成食人魔时，他不会因此变成善良。' },
  { a: 'pithag', b: 'politician', handled: false, text: '麻脸巫婆把邪恶玩家变成政客时，他不会因此变成善良。' },
  { a: 'pithag', b: 'villageidiot', handled: false, text: '有多余的村夫标记时，麻脸巫婆可以多造一个村夫，醉酒的村夫可能会变。' },
  { a: 'plaguedoctor', b: 'boomdandy', handled: false, text: '说书人本该获得炸弹人的能力时，改为一名玩家变成炸弹人。' },
  { a: 'plaguedoctor', b: 'wraith', handled: false, text: '说书人本该获得亡魂的能力时，改为一名爪牙获得它并被告知。' },
  { a: 'recluse', b: 'ogre', handled: false, text: '陌客被食人魔当成邪恶时，食人魔会得知自己是邪恶的。' },
  { a: 'riot', b: 'atheist', handled: false, text: '暴乱时如果说书人被提名，大家投票：说书人"即将被处决"游戏就结束；不然由说书人接着提名下一个人。' },
  { a: 'riot', b: 'banshee', handled: false, text: '每晚暴乱选一名没选过的活着的善良玩家：选中报丧女妖时她死亡并获得能力。' },
  { a: 'riot', b: 'exorcist', handled: false, text: '暴乱提名并处决了驱魔人选中的人：善良获胜。' },
  { a: 'riot', b: 'farmer', handled: false, text: '每晚暴乱选一名没选过的活着的善良玩家：选中农夫时他用能力但不死。' },
  { a: 'riot', b: 'grandmother', handled: false, text: '暴乱在场时孙子被处决死亡：邪恶获胜。' },
  { a: 'riot', b: 'innkeeper', handled: false, text: '暴乱提名并处决了旅店老板保护的人：善良获胜。' },
  { a: 'riot', b: 'king', handled: false, text: '暴乱在场且至少死了一个人：国王每晚得知一个活着的角色。' },
  { a: 'riot', b: 'mayor', handled: false, text: '镇长可以叫停暴乱：只剩一个暴乱活着时叫停善良获胜，否则邪恶获胜。' },
  { a: 'riot', b: 'monk', handled: false, text: '暴乱提名并处决了僧侣保护的人：善良获胜。' },
  { a: 'riot', b: 'ravenkeeper', handled: false, text: '每晚暴乱选一名没选过的活着的善良玩家：选中守鸦人时他用能力但不死。' },
  { a: 'riot', b: 'sage', handled: false, text: '每晚暴乱选一名没选过的活着的善良玩家：选中贤者时他用能力但不死。' },
  { a: 'riot', b: 'soldier', handled: false, text: '暴乱提名并处决了士兵：善良获胜。' },
  { a: 'spy', b: 'damsel', handled: false, text: '间谍在场（或曾经在场）时，落难少女中毒。' },
  { a: 'spy', b: 'ogre', handled: true, text: '间谍被食人魔当成邪恶。（网页按邪恶算）' },
  { a: 'spy', b: 'poppygrower', handled: false, text: '罂粟种植者有能力时，间谍不能看魔典。' },
  { a: 'summoner', b: 'clockmaker', handled: false, text: '召唤师被钟表匠当成恶魔。' },
  { a: 'summoner', b: 'courtier', handled: false, text: '活着的召唤师没有能力时，由说书人拥有召唤师的能力。' },
  { a: 'summoner', b: 'engineer', handled: false, text: '活着的召唤师离场时，由说书人拥有召唤师的能力。' },
  { a: 'summoner', b: 'hatter', handled: false, text: '召唤师造出第二个活着的恶魔时，当晚谁死由说书人决定。' },
  { a: 'summoner', b: 'kazali', handled: false, text: '召唤师造出第二个活着的恶魔时，当晚谁死由说书人决定。' },
  { a: 'summoner', b: 'lordoftyphon', handled: false, text: '召唤出堤丰之首时，他要挨着一个爪牙，另一边的邻座变成邪恶的爪牙。' },
  { a: 'summoner', b: 'pithag', handled: false, text: '召唤师造出第二个活着的恶魔时，当晚谁死由说书人决定。' },
  { a: 'summoner', b: 'poppygrower', handled: false, text: '罂粟种植者第三晚还活着时，召唤师只决定是哪种恶魔、不决定是谁。' },
  { a: 'summoner', b: 'preacher', handled: false, text: '活着的召唤师没有能力时，由说书人拥有召唤师的能力。' },
  { a: 'summoner', b: 'pukka', handled: false, text: '召唤师可以在第二晚就召唤普卡。' },
  { a: 'summoner', b: 'zombuul', handled: false, text: '召唤师把死人召唤成僵怖时，这个僵怖算已经死过一次。' },
  { a: 'vizier', b: 'alsaahir', handled: false, text: '说书人不公开宣布维齐尔在场。' },
  { a: 'vizier', b: 'courtier', handled: false, text: '维齐尔失去能力时他会得知，而且白天照样死不了。' },
  { a: 'vizier', b: 'fearmonger', handled: false, text: '维齐尔和恐惧之灵一起醒，得知恐惧之灵选了谁，并且不能立即处决那个人。' },
  { a: 'vizier', b: 'investigator', handled: false, text: '说书人不公开宣布维齐尔在场。' },
  { a: 'vizier', b: 'politician', handled: false, text: '政客可能被维齐尔当成邪恶。' },
  { a: 'vizier', b: 'preacher', handled: false, text: '维齐尔失去能力时他会得知，而且白天照样死不了。' },
  { a: 'vizier', b: 'zealot', handled: false, text: '狂热者可能被维齐尔当成邪恶。' },
  { a: 'widow', b: 'damsel', handled: false, text: '寡妇在场（或曾经在场）时，落难少女中毒。' },
  { a: 'widow', b: 'poppygrower', handled: false, text: '罂粟种植者有能力时，寡妇不能看魔典。' },
  { a: 'yaggababble', b: 'exorcist', handled: false, text: '驱魔人选中牙噶巴卜：今晚牙噶巴卜不杀人。' },
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
