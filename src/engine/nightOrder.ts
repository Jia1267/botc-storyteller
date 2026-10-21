import type { FabledId, RoleId } from './roles';
import type { SlotId } from './types';

/**
 * 官方夜晚顺序（只列网页做了的步骤）。自由配板和新剧本按它排出整晚流程；
 * 原来的六个剧本保留手写的顺序，测试保证两者的步骤一样多、一样全。
 * 说书人自己的步骤：爪牙互认/恶魔得知爪牙、说书人的投毒者/鹰身女妖能力（紧跟在对应爪牙后面）。
 */
export const FIRST_ORDER: SlotId[] = [
  'dusk', 'kazali', 'apprentice', 'barista', 'bureaucrat', 'thief', 'boffin', 'philosopher', 'alchemist', 'yaggababble', 'minionInfo', 'snitch', 'lunatic', 'summoner', 'demonInfo', 'king',
  'sailor', 'marionette', 'engineer',
  'preacher', 'lilmonsta', 'lleech', 'poisoner', 'widow', 'courtier', 'wizard', 'snakecharmer', 'godfather', 'organgrinder', 'devilsadvocate', 'eviltwin',
  'witch', 'cerenovus', 'fearmonger', 'harpy', 'mezepheles', 'pukka', 'pixie', 'huntsman', 'damsel', 'amnesiac', 'washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller',
  'butler', 'qutler', 'grandmother', 'clockmaker', 'dreamer', 'seamstress', 'steward', 'knight', 'noble', 'balloonist', 'shugenja', 'villageidiot', 'bountyhunter',
  'nightwatchman', 'cultleader', 'spy', 'ogre', 'highpriestess', 'general', 'chambermaid', 'mathematician', 'dawn',
];

export const OTHER_ORDER: SlotId[] = [
  'dusk', 'duchess', 'cacklejack', 'barista', 'bureaucrat', 'thief', 'harlot', 'bonecollector', 'apprentice', 'philosopher', 'poppygrower', 'sailor', 'engineer', 'preacher', 'poisoner', 'stPoisoner', 'courtier',
  'innkeeper', 'wizard', 'gambler', 'acrobat', 'snakecharmer', 'monk', 'organgrinder', 'devilsadvocate', 'witch', 'cerenovus', 'pithag',
  'fearmonger', 'harpy', 'stHarpy', 'mezepheles', 'scarletwoman', 'summoner', 'lunatic', 'exorcist', 'lycanthrope', 'legion', 'imp', 'zombuul', 'pukka', 'shabaloth', 'po', 'fanggu', 'nodashii', 'vortox', 'lordoftyphon',
  'vigormortis', 'ojo', 'alhadikhia', 'lleech', 'lilmonsta', 'yaggababble', 'kazali', 'assassin', 'godfather', 'gossip', 'hatter', 'barber', 'sweetheart', 'plaguedoctor', 'sage', 'professor',
  'choirboy', 'huntsman', 'amnesiac', 'farmer', 'tinker', 'moonchild', 'ravenkeeper', 'empath', 'fortuneteller', 'undertaker', 'dreamer', 'flowergirl',
  'towncrier', 'oracle', 'seamstress', 'juggler', 'balloonist', 'villageidiot', 'king', 'bountyhunter', 'nightwatchman', 'cultleader', 'butler', 'qutler', 'spy', 'highpriestess',
  'general', 'chambermaid', 'mathematician', 'riot', 'dawn',
];

type Nights = { first?: true; other?: true };
const F: Nights = { first: true };
const O: Nights = { other: true };
const FO: Nights = { first: true, other: true };

/** 每个角色晚上带来的步骤（步骤名和角色名相同）。不在这里的角色晚上不醒（被动能力、白天能力、死后由别的步骤处理） */
const ROLE_NIGHTS: Partial<Record<RoleId, Nights>> = {
  washerwoman: F, librarian: F, investigator: F, chef: F, empath: FO, fortuneteller: FO, undertaker: O, monk: O, ravenkeeper: O,
  butler: FO, poisoner: FO, spy: FO, scarletwoman: O, imp: O,
  chambermaid: FO, pixie: F, balloonist: FO, amnesiac: FO, lunatic: FO, widow: F, fearmonger: FO, vortox: O, lilmonsta: FO,
  alchemist: F, godfather: FO, devilsadvocate: FO, exorcist: O, zombuul: O, flowergirl: O,
  dreamer: FO, seamstress: FO, bountyhunter: FO, general: FO, sweetheart: O, barber: O, plaguedoctor: O, harpy: FO, marionette: F, alhadikhia: O,
  sailor: FO, courtier: FO, grandmother: F, innkeeper: O, gambler: O, gossip: O, professor: O, tinker: O, moonchild: O, assassin: O,
  pukka: FO, shabaloth: O, po: O,
  clockmaker: F, snakecharmer: FO, mathematician: FO, towncrier: O, oracle: O, philosopher: FO, juggler: O, sage: O,
  eviltwin: F, witch: FO, cerenovus: FO, pithag: O, fanggu: O, nodashii: O, vigormortis: O,
  steward: F, knight: F, noble: F, shugenja: F, highpriestess: FO, king: FO, choirboy: O, nightwatchman: FO, farmer: O, acrobat: O,
  preacher: FO, poppygrower: O, huntsman: FO, damsel: F, snitch: F, ogre: F, hatter: O, qutler: FO,
  boffin: F, wizard: FO, organgrinder: FO, mezepheles: FO,
  ojo: O, lleech: FO, yaggababble: FO, lordoftyphon: O, kazali: FO, riot: O,
  legion: O, summoner: FO, villageidiot: FO, engineer: FO, lycanthrope: O, cultleader: FO,
};

/** 只在第一晚醒的能力（哲学家后来的夜晚获得它们时，当晚马上用） */
export const firstNightOnly = (r: RoleId) => !!ROLE_NIGHTS[r]?.first && !ROLE_NIGHTS[r]?.other;

/** 这个角色在不在夜里醒（哲学家、失忆者能选的能力要用） */
export const wakesAtNight = (r: RoleId) => !!ROLE_NIGHTS[r];

/** 旅行者随时可能加入：他们的步骤每个剧本都有（没人当这个旅行者就自动跳过） */
export const TRAVELLER_FIRST: SlotId[] = ['apprentice', 'barista', 'bureaucrat', 'thief'];
export const TRAVELLER_OTHER: SlotId[] = ['cacklejack', 'barista', 'bureaucrat', 'thief', 'harlot', 'bonecollector', 'apprentice'];

/** 手写的夜晚顺序补上旅行者的步骤（按全局顺序插进去） */
export function withTravellerSlots(order: SlotId[], first: boolean): SlotId[] {
  const all = first ? FIRST_ORDER : OTHER_ORDER;
  const add = (first ? TRAVELLER_FIRST : TRAVELLER_OTHER).filter((x) => !order.includes(x));
  const out = [...order];
  for (const x of add) {
    // 插在全局顺序里它前面最近的那个已有步骤后面
    const before = all.slice(0, all.indexOf(x)).reverse().find((y) => out.includes(y));
    out.splice(before ? out.indexOf(before) + 1 : 1, 0, x);
  }
  return out;
}

/** 按角色表排出第一晚和其他夜晚的步骤（爪牙互认、恶魔得知爪牙总在，5–6 人局到时自动跳过） */
export function nightsFor(roles: RoleId[], fabled: FabledId[] = []): { firstNight: SlotId[]; otherNights: SlotId[] } {
  const first = new Set<SlotId>(['dusk', ...TRAVELLER_FIRST, 'minionInfo', 'demonInfo', 'dawn']);
  const other = new Set<SlotId>(['dusk', ...TRAVELLER_OTHER, 'dawn']);
  for (const r of roles) {
    const n = ROLE_NIGHTS[r];
    if (n?.first) first.add(r as SlotId);
    if (n?.other) other.add(r as SlotId);
  }
  // 瘟疫医生死后，说书人可能获得投毒者/鹰身女妖的能力
  if (roles.includes('plaguedoctor')) {
    if (roles.includes('poisoner')) other.add('stPoisoner');
    if (roles.includes('harpy')) other.add('stHarpy');
  }
  if (fabled.includes('duchess')) other.add('duchess');
  return { firstNight: FIRST_ORDER.filter((x) => first.has(x)), otherNights: OTHER_ORDER.filter((x) => other.has(x)) };
}
