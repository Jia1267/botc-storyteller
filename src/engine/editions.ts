import type { FabledId, RoleId } from './roles';
import type { SlotId } from './types';

export type ScriptId = 'tb' | 'spooky' | 'whispers';

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
  },
};

export const SCRIPT_LIST: ScriptDef[] = [SCRIPTS.tb, SCRIPTS.spooky, SCRIPTS.whispers];
