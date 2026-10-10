import type { FabledId, RoleId } from './roles';
import type { SlotId } from './types';

export type ScriptId = 'tb' | 'alvsal' | 'spooky' | 'whispers' | 'sunset';

/** 一个剧本 = 角色表 + 夜晚顺序 */
export interface ScriptDef {
  id: ScriptId;
  name: string;
  min: number;
  max: number;
  blurb: string;
  roles: RoleId[];
  fabled: FabledId[];
  firstNight: SlotId[];
  otherNights: SlotId[];
  /** 首夜信息位（F4）最多 2 个的限制只对暗流涌动有意义 */
  f4Cap?: boolean;
  /** 剧本图（public/scripts 下的文件名） */
  image: string;
}

export const SCRIPTS: Record<ScriptId, ScriptDef> = {
  tb: {
    id: 'tb',
    name: '暗流涌动',
    min: 5,
    max: 15,
    blurb: '新手本：恶魔是小恶魔，规则最直白，信息角色多。',
    roles: [
      'washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller', 'undertaker', 'monk', 'ravenkeeper',
      'virgin', 'slayer', 'soldier', 'mayor', 'butler', 'drunk', 'recluse', 'saint', 'poisoner', 'spy', 'scarletwoman', 'baron', 'imp',
    ],
    fabled: [],
    firstNight: ['dusk', 'bureaucrat', 'thief', 'minionInfo', 'demonInfo', 'poisoner', 'washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller', 'butler', 'spy', 'dawn'],
    otherNights: ['dusk', 'bureaucrat', 'thief', 'poisoner', 'monk', 'scarletwoman', 'imp', 'ravenkeeper', 'empath', 'fortuneteller', 'undertaker', 'butler', 'spy', 'dawn'],
    f4Cap: true,
    image: 'tb.jpg',
  },
  alvsal: {
    id: 'alvsal',
    name: '王不见王',
    min: 7,
    max: 15,
    blurb: '恶魔哈迪寂亚每晚点三个人，让他们自己决定生死；戏法师猜中全部邪恶就直接获胜。',
    roles: [
      'librarian', 'investigator', 'chef', 'dreamer', 'bountyhunter', 'empath', 'general',
      'balloonist', 'alsaahir', 'savant', 'seamstress', 'fisherman', 'banshee',
      'recluse', 'drunk', 'sweetheart', 'barber', 'plaguedoctor',
      'spy', 'poisoner', 'baron', 'harpy', 'marionette', 'alhadikhia',
    ],
    fabled: [],
    firstNight: [
      'dusk', 'bureaucrat', 'thief', 'minionInfo', 'demonInfo', 'marionette', 'poisoner', 'harpy', 'librarian', 'investigator',
      'chef', 'empath', 'dreamer', 'seamstress', 'balloonist', 'spy', 'bountyhunter', 'general', 'dawn',
    ],
    otherNights: [
      'dusk', 'bureaucrat', 'thief', 'poisoner', 'stPoisoner', 'harpy', 'stHarpy', 'alhadikhia', 'sweetheart', 'barber', 'plaguedoctor',
      'empath', 'dreamer', 'seamstress', 'balloonist', 'general', 'spy', 'bountyhunter', 'dawn',
    ],
    image: 'alvsal.jpg',
  },
  spooky: {
    id: 'spooky',
    name: '幽灵茶会',
    min: 5,
    max: 6,
    blurb: '涡流在场时所有镇民信息都是假的；小怪宝没有恶魔玩家，由爪牙轮流照看。',
    roles: [
      'chef', 'empath', 'chambermaid', 'artist', 'pixie', 'cannibal', 'klutz', 'lunatic',
      'fearmonger', 'widow', 'scarletwoman', 'vortox', 'lilmonsta',
    ],
    fabled: ['sentinel', 'duchess'],
    firstNight: ['dusk', 'bureaucrat', 'thief', 'minionInfo', 'lunatic', 'demonInfo', 'lilmonsta', 'widow', 'fearmonger', 'pixie', 'chef', 'empath', 'chambermaid', 'dawn'],
    otherNights: ['dusk', 'bureaucrat', 'thief', 'duchess', 'fearmonger', 'scarletwoman', 'lunatic', 'vortox', 'lilmonsta', 'empath', 'chambermaid', 'dawn'],
    image: 'spooky.jpg',
  },
  whispers: {
    id: 'whispers',
    name: '窃窃私语',
    min: 5,
    max: 6,
    blurb: '利维坦晚上不杀人：误杀第 2 个好人或撑到第 5 天结束，邪恶就赢。白天找说书人的角色很多。',
    roles: [
      'artist', 'balloonist', 'fisherman', 'savant', 'amnesiac', 'cannibal', 'lunatic', 'mutant', 'widow', 'goblin', 'leviathan',
    ],
    fabled: [],
    firstNight: ['dusk', 'bureaucrat', 'thief', 'amnesiac', 'lunatic', 'widow', 'balloonist', 'dawn'],
    otherNights: ['dusk', 'bureaucrat', 'thief', 'amnesiac', 'lunatic', 'balloonist', 'dawn'],
    image: 'whispers.jpg',
  },
  sunset: {
    id: 'sunset',
    name: '残阳高照',
    min: 5,
    max: 6,
    blurb: '恶魔僵怖第一次死是假死，只在白天没人死的晚上杀人；茶艺师、弄臣让好人很难死。',
    roles: ['alchemist', 'undertaker', 'flowergirl', 'exorcist', 'tealady', 'fool', 'recluse', 'drunk', 'devilsadvocate', 'godfather', 'zombuul'],
    fabled: [],
    firstNight: ['dusk', 'bureaucrat', 'thief', 'alchemist', 'godfather', 'devilsadvocate', 'dawn'],
    otherNights: ['dusk', 'bureaucrat', 'thief', 'devilsadvocate', 'exorcist', 'zombuul', 'godfather', 'undertaker', 'flowergirl', 'dawn'],
    image: 'sunset.jpg',
  },
};

export const SCRIPT_LIST: ScriptDef[] = [SCRIPTS.tb, SCRIPTS.alvsal, SCRIPTS.spooky, SCRIPTS.whispers, SCRIPTS.sunset];
