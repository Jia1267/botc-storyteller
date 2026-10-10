import { ROLES, roleName, type FabledId, type RoleId } from './roles';
import { balance, recommend, type Choice } from './balance';
import { actorFor, inPlay, isEvil, lilMonsta, notInPlay, scriptOf, scriptRolesOf, seatName } from './core';
import { SCRIPTS, type ScriptId } from './editions';
import { pick, sample, seeded, shuffle, type Rng } from './rng';
import type { GameState, Seat } from './types';

/** 官方人数表：镇民 / 外来者 / 爪牙 / 恶魔 */
export const DISTRIBUTION: Record<number, [number, number, number, number]> = {
  5: [3, 0, 1, 1],
  6: [3, 1, 1, 1],
  7: [5, 0, 1, 1],
  8: [5, 1, 1, 1],
  9: [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
};

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;

/** 首夜信息位（F4）：只在第一晚拿信息，之后没事做 */
export const F4: RoleId[] = ['washerwoman', 'librarian', 'investigator', 'chef'];
/** 随机配板时 F4 最多几个（至少留两个不在场，给邪恶假跳） */
export const MAX_F4 = 2;

/** 从候选镇民里挑 n 个，F4 不超过上限（已在场的 F4 也算） */
function pickTownsfolk(pool: RoleId[], n: number, f4Already: number, rng: Rng, cap = true): RoleId[] {
  const out: RoleId[] = [];
  let f = f4Already;
  for (const r of shuffle(pool, rng)) {
    if (out.length === n) break;
    if (cap && F4.includes(r)) {
      if (f >= MAX_F4) continue;
      f++;
    }
    out.push(r);
  }
  return out;
}

/** 会改外来者人数的镇民：配板增删镇民时不动它们，免得人数又变 */
const SETUP_TOWNS: RoleId[] = ['balloonist', 'alchemist'];

/** 炼金术士拿到的爪牙能力：剧本里不在场的爪牙 */
export function alchemistAbilityFor(script: ScriptId, roles: RoleId[]): RoleId | null {
  if (!roles.includes('alchemist')) return null;
  return SCRIPTS[script].roles.find((r) => ROLES[r].team === 'minion' && !roles.includes(r)) ?? null;
}

/** 教父的能力在场（教父本人，或拿到教父能力的炼金术士）：外来者 ±1。alch = 说书人手动给炼金术士定的能力 */
export const godfatherMod = (script: ScriptId, roles: RoleId[], alch?: RoleId | null) =>
  roles.includes('godfather') || (roles.includes('alchemist') && (alch !== undefined ? alch : alchemistAbilityFor(script, roles)) === 'godfather');

/** 按当前局面（含说书人手动换的炼金术士能力）判断教父的能力在不在场 */
export const godfatherModFor = (s: GameState) => godfatherMod(s.script, s.seats.map((x) => x.role), s.alchemistPicked ? s.alchemistAbility : undefined);

/** 外来者人数的修正：男爵 +2、气球驾驶员 +1、哨兵 ±1、教父 ±1 */
const outsiderDelta = (roles: RoleId[], sentinelDelta: number, script: ScriptId = 'tb', godfatherDelta = 1, alch?: RoleId | null) =>
  (roles.includes('baron') ? 2 : 0) + (roles.includes('balloonist') ? 1 : 0) + sentinelDelta + (godfatherMod(script, roles, alch) ? godfatherDelta : 0);

export interface RandomSetup {
  /** 每个座位的角色（小怪宝时没有恶魔座位） */
  roles: RoleId[];
  demonChar: RoleId;
  /** 教父：外来者 +1 / −1 */
  godfatherDelta?: number;
}

export function randomSetup(script: ScriptId, count: number, rng: Rng, sentinelDelta = 0): RandomSetup {
  const sc = SCRIPTS[script];
  const of = (t: string) => sc.roles.filter((r) => ROLES[r].team === t);
  const [t, o, m] = DISTRIBUTION[count];
  for (let tries = 0; ; tries++) {
    const demon = pick(of('demon'), rng);
    const lil = demon === 'lilmonsta';
    const minions = sample(of('minion'), m + (lil ? 1 : 0), rng);
    let towns = pickTownsfolk(of('townsfolk'), t, 0, rng, !!sc.f4Cap);
    const outs = of('outsider');
    // 教父：本来没有外来者就只能 +1
    const gfd = o === 0 || rng() < 0.5 ? 1 : -1;
    const outCount = Math.max(0, Math.min(outs.length, o + outsiderDelta([...towns, ...minions], sentinelDelta, script, gfd)));
    const tFinal = count - minions.length - (lil ? 0 : 1) - outCount;
    if (tFinal < 1 && tries < 50) continue;
    // 多了就去掉几个（保留气球驾驶员/炼金术士），少了就补（不再补它们，免得外来者人数又变）
    while (towns.length > tFinal) {
      const drop = pick(towns.filter((r) => !SETUP_TOWNS.includes(r)), rng);
      towns = towns.filter((r) => r !== drop);
    }
    if (towns.length < tFinal) {
      const f4 = towns.filter((r) => F4.includes(r)).length;
      const more = pickTownsfolk(of('townsfolk').filter((r) => !towns.includes(r) && !SETUP_TOWNS.includes(r)), tFinal - towns.length, f4, rng, !!sc.f4Cap);
      towns = [...towns, ...more];
    }
    const roles = [...towns, ...sample(outs, outCount, rng), ...minions, ...(lil ? [] : [demon])];
    if (roles.length === count || tries >= 50) return { roles, demonChar: demon, godfatherDelta: gfd };
  }
}

/** 暗流涌动的旧接口：只要角色列表 */
export const randomRoles = (count: number, rng: Rng) => randomSetup('tb', count, rng).roles;

export const rolesWeight = (roles: RoleId[]) => roles.reduce((a, r) => a + ROLES[r].weight, 0);

const setupWeight = (x: RandomSetup) => rolesWeight(x.roles) + (x.roles.includes(x.demonChar) ? 0 : ROLES[x.demonChar].weight);

const statsCache: Record<string, { mean: number; sd: number }> = {};
function stats(script: ScriptId, count: number) {
  const key = `${script}:${count}`;
  if (!statsCache[key]) {
    const rng = seeded(1000 + count + script.length * 97);
    const xs = Array.from({ length: 800 }, () => setupWeight(randomSetup(script, count, rng)));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 1;
    statsCache[key] = { mean, sd };
  }
  return statsCache[key];
}

/** 配板强度标准分：0 = 平均，正数偏善良 */
export function setupZ(roles: RoleId[], count: number, script: ScriptId = 'tb', demonChar: RoleId = 'imp'): number {
  const { mean, sd } = stats(script, count);
  return (setupWeight({ roles, demonChar }) - mean) / sd;
}

/**
 * 一键生成：先随机定一个"这次一定出场"的角色，再在含它的组合里挑最均衡的。
 * 这样剧本上每个角色都有机会出场（像教父、男爵这种怎么配都不太均衡的角色，也会偶尔出现，配板会标"偏X"）。
 */
export function balancedSetup(script: ScriptId, count: number, rng: Rng, sentinelDelta = 0): RandomSetup {
  const z = (x: RandomSetup) => Math.abs(setupZ(x.roles, count, script, x.demonChar));
  const anchor = pick(SCRIPTS[script].roles, rng);
  const has = (x: RandomSetup) => x.roles.includes(anchor) || x.demonChar === anchor;
  let best: RandomSetup | null = null;
  let bestZ = Infinity;
  for (let i = 0; i < 600 && bestZ > 0.5; i++) {
    const r = randomSetup(script, count, rng, sentinelDelta);
    if (!has(r)) continue;
    const rz = z(r);
    if (rz < bestZ) {
      best = r;
      bestZ = rz;
    }
  }
  // 含这个角色怎么配都不均衡（例如 5 人局的男爵）：一半机会照样用，一半换回最均衡的，免得太常见
  if (best && (bestZ < 0.8 || rng() < 0.5)) return best;
  // 这个人数下放不进这个角色：不指定角色，直接挑最均衡的
  best = randomSetup(script, count, rng, sentinelDelta);
  bestZ = z(best);
  for (let i = 0; i < 300 && bestZ > 0.5; i++) {
    const r = randomSetup(script, count, rng, sentinelDelta);
    const rz = z(r);
    if (rz < bestZ) {
      best = r;
      bestZ = rz;
    }
  }
  return best;
}

export const balancedRoles = (count: number, rng: Rng) => balancedSetup('tb', count, rng).roles;

/** 配板强度的原因（一两句大白话）。roles 里包含恶魔角色 */
export function setupReasons(roles: RoleId[]): string[] {
  const out: string[] = [];
  const has = (r: RoleId) => roles.includes(r);
  if (has('poisoner') && has('drunk')) out.push('投毒者 + 酒鬼：信息会很乱，偏邪恶');
  else if (has('poisoner')) out.push('有投毒者：信息可能被污染');
  else if (has('drunk')) out.push('有酒鬼：有一个镇民的信息是假的');
  if (has('spy')) out.push('有间谍：邪恶方能看到全部身份');
  if (has('scarletwoman')) out.push('有红唇女郎：恶魔死了可能还能接任');
  if (has('empath') && has('fortuneteller')) out.push('共情者 + 占卜师：好人每晚都有信息，偏善良');
  if (has('monk') && has('soldier')) out.push('僧侣 + 士兵：恶魔不好杀人，偏善良');
  if (has('saint')) out.push('有圣徒：误杀他好人直接输');
  if (has('vortox')) out.push('有涡流：所有镇民的信息都是假的，而且每天必须处决人');
  if (has('lilmonsta')) out.push('小怪宝：没人扮演恶魔，邪恶多一个爪牙，每晚由你定谁死');
  if (has('leviathan')) out.push('利维坦：晚上不杀人，但好人最多只能误杀一次，撑到第 5 天结束也算邪恶赢');
  if (has('widow')) out.push('有寡妇：开局就有一人一直中毒');
  if (has('savant') && has('balloonist')) out.push('博学者 + 气球驾驶员：好人每天都有信息，偏善良');
  if (has('zombuul')) out.push('僵怖：第一次死是假死，白天有人死的晚上不杀人');
  if (has('tealady') && has('fool')) out.push('茶艺师 + 弄臣：好人很难死，偏善良');
  if (has('godfather')) out.push('有教父：外来者死亡当晚他会杀人');
  if (has('alhadikhia')) out.push('哈迪寂亚：每晚点三个人自己决定生死，死人也可能复活');
  if (has('marionette')) out.push('有提线木偶：坐在恶魔旁边的"好人"其实是爪牙');
  if (has('bountyhunter')) out.push('有赏金猎人：有一名镇民是邪恶的');
  if (has('harpy')) out.push('有鹰身女妖：每天逼一个人疯狂指认别人，做不到可能死');
  if (has('shabaloth')) out.push('沙巴洛斯：每晚杀两个人，但可能吐出一个复活');
  if (has('po')) out.push('珀：可以一晚不杀人，下一晚杀三个');
  if (has('pukka')) out.push('普卡：每晚下毒，被毒的人第二晚才死');
  if (has('mastermind')) out.push('有主谋：恶魔被处决后还要再玩一天');
  if (has('sailor') && has('innkeeper')) out.push('水手 + 旅店老板：好人很难被杀，偏善良');
  if (has('goon')) out.push('有莽夫：谁先用能力选他，谁就醉酒，他还会变成那人的阵营');
  const f4 = roles.filter((r) => F4.includes(r)).length;
  if (f4 > MAX_F4) out.push(`首夜信息位（洗衣妇/图书管理员/调查员/厨师）有 ${f4} 个：第一晚过后这几个人没事做，邪恶也少了可以假跳的身份`);
  return out;
}

export function newGame(): GameState {
  return {
    v: 1,
    script: 'tb',
    phase: 'setup',
    setupStep: 'script',
    count: 0,
    seats: [],
    demonChar: null,
    fabled: [],
    sentinelDelta: 0,
    drunkFake: null,
    lunaticFake: null,
    amnesiacAbility: null,
    gained: {},
    cannibalPoisoned: false,
    pixieRole: null,
    pixieResolved: false,
    widowPoison: null,
    widowInformed: null,
    fearTarget: null,
    fearAnnounce: false,
    fearNominated: null,
    babysitter: null,
    babysitterLocked: false,
    balloonShown: [],
    klutzResolved: false,
    savantDay: 0,
    duchessVisitors: [],
    goodExecutions: 0,
    voteMods: {},
    gunslingerDay: 0,
    alchemistAbility: null,
    alchemistPicked: false,
    godfatherDelta: 1,
    zombuulFake: false,
    advocate: null,
    exorcistPick: null,
    demonVotedDay: 0,
    marionetteFake: null,
    harpy: null,
    bountyKnown: [],
    sweetheartDrunk: null,
    sweetheartResolved: false,
    barberResolved: false,
    stAbility: null,
    plagueResolved: false,
    stPoison: null,
    bansheeActive: null,
    alsaahirDay: 0,
    tempDrunk: [],
    grandchild: null,
    pukkaPoison: null,
    shabalothLast: [],
    shabalothNight: 0,
    poCharged: false,
    gossipTrueDay: 0,
    moonchildPick: null,
    moonchildResolved: false,
    mastermindDay: 0,
    bluffs: [],
    redHerring: null,
    setupZ: 0,
    dealIndex: 0,
    night: 0,
    ns: null,
    poison: null,
    butlerMaster: null,
    pendingNewDemon: null,
    executed: undefined,
    lastExecution: null,
    winner: null,
    winReason: '',
    exposure: {},
    infoTrue: 0,
    infoFalse: 0,
    log: [],
    style: 'simple',
  };
}

function seatsFrom(roles: RoleId[]): Seat[] {
  return roles.map((r, i) => ({ n: i + 1, role: r, startRole: r, alive: true }));
}

export function setScript(s: GameState, script: ScriptId) {
  s.script = script;
  s.fabled = [];
  s.sentinelDelta = 0;
  s.setupStep = 'count';
}

/** 重新配板时保留已经加进来的旅行者 */
function withTravellers(s: GameState, seats: Seat[]): Seat[] {
  const tr = s.seats.filter((x) => x.traveller);
  for (const t of tr) if (t.traveller!.after <= 100 && t.traveller!.after > seats.length) t.traveller!.after = seats.length;
  return [...seats, ...tr];
}

function applySetup(s: GameState, x: RandomSetup, rng: Rng) {
  s.seats = withTravellers(s, seatsFrom(shuffle(x.roles, rng)));
  s.demonChar = x.demonChar;
  s.godfatherDelta = x.godfatherDelta ?? 1;
  s.alchemistPicked = false;
  refreshSetup(s, rng);
}

/** 说书人给炼金术士换一个爪牙能力（默认是不在场的那个） */
export function setAlchemistAbility(s: GameState, r: RoleId, rng: Rng) {
  s.alchemistAbility = r;
  s.alchemistPicked = true;
  normalize(s, rng);
  refreshSetup(s, rng);
}

export function alchemistChoices(s: GameState): Choice<RoleId>[] {
  const roles = s.seats.map((x) => x.role);
  const auto = alchemistAbilityFor(s.script, roles.includes('alchemist') ? roles : [...roles, 'alchemist']);
  return scriptRolesOf(s, 'minion').map((r): Choice<RoleId> =>
    r === auto
      ? { key: r, label: roleName(r), value: r, lean: 0, truth: true, standard: true, reason: `标准做法：剧本里不在场的爪牙。${ROLES[r].ability}` }
      : { key: r, label: roleName(r), value: r, lean: 1, truth: true, reason: `和在场的爪牙重复：好人也拥有这个能力，帮善良。${ROLES[r].ability}` },
  );
}

/** 选好人数后：生成均衡组合、随机落座、填好推荐的特殊设置 */
export function setCount(s: GameState, count: number, rng: Rng) {
  s.count = count;
  s.setupStep = 'roles';
  applySetup(s, balancedSetup(s.script, count, rng, s.sentinelDelta), rng);
}

export function rerollRoles(s: GameState, rng: Rng) {
  applySetup(s, balancedSetup(s.script, s.count, rng, s.sentinelDelta), rng);
}

/** 把某个座位换成同阵营的另一个角色；人数修正（男爵、气球驾驶员）自动调整 */
export function replaceRole(s: GameState, n: number, to: RoleId, rng: Rng) {
  const st = s.seats[n - 1];
  if (st.role === to || inPlay(s, to)) return;
  st.role = st.startRole = to;
  if (ROLES[to].team === 'demon') s.demonChar = to;
  normalize(s, rng, n);
  refreshSetup(s, rng);
}

/** 换恶魔：小怪宝没有座位，要在恶魔座位和爪牙座位之间转换 */
export function replaceDemon(s: GameState, to: RoleId, rng: Rng) {
  const from = s.demonChar;
  if (!from || from === to) return;
  if (from === 'lilmonsta') {
    const m = pick(s.seats.filter((x) => ROLES[x.role].team === 'minion'), rng);
    m.role = m.startRole = to;
  } else {
    const d = s.seats.find((x) => x.role === from)!;
    const r = to === 'lilmonsta' ? pick(notInPlay(s, 'minion'), rng) : to;
    d.role = d.startRole = r;
  }
  s.demonChar = to;
  normalize(s, rng);
  refreshSetup(s, rng);
}

/** 让外来者人数符合人数表 + 修正（男爵、气球驾驶员、哨兵） */
function normalize(s: GameState, rng: Rng, keep?: number) {
  const sc = scriptOf(s);
  const [, o] = DISTRIBUTION[s.count];
  const roles = s.seats.map((x) => x.role);
  // 本来没有外来者时教父只能 +1
  if (o === 0) s.godfatherDelta = 1;
  const alch = s.alchemistPicked ? s.alchemistAbility : undefined;
  const target = Math.max(0, Math.min(scriptRolesOf(s, 'outsider').length, o + outsiderDelta(roles, s.sentinelDelta, s.script, s.godfatherDelta, alch)));
  const team = (x: Seat) => ROLES[x.role].team;
  for (let guard = 0; guard < 6; guard++) {
    const outs = s.seats.filter((x) => team(x) === 'outsider');
    if (outs.length > target) {
      const v = pick(outs.filter((x) => x.n !== keep), rng);
      const f4 = s.seats.filter((x) => F4.includes(x.role)).length;
      const r = pickTownsfolk(notInPlay(s, 'townsfolk').filter((x) => !SETUP_TOWNS.includes(x)), 1, f4, rng, !!sc.f4Cap)[0];
      if (!v || !r) break;
      v.role = v.startRole = r;
    } else if (outs.length < target) {
      const v = pick(s.seats.filter((x) => team(x) === 'townsfolk' && x.n !== keep && !SETUP_TOWNS.includes(x.role)), rng);
      const r = pick(notInPlay(s, 'outsider'), rng);
      if (!v || !r) break;
      v.role = v.startRole = r;
    } else break;
  }
}

export function toggleFabled(s: GameState, f: FabledId, on: boolean, rng: Rng) {
  s.fabled = on ? [...new Set([...s.fabled, f])] : s.fabled.filter((x) => x !== f);
  if (f === 'sentinel') {
    const cs = sentinelChoices(s);
    s.sentinelDelta = on ? cs[recommend(cs, balance(s).score, rng)].value : 0;
    normalize(s, rng);
    refreshSetup(s, rng);
  }
}

export function setSentinelDelta(s: GameState, d: number, rng: Rng) {
  s.sentinelDelta = d;
  normalize(s, rng);
  refreshSetup(s, rng);
}

export function setGodfatherDelta(s: GameState, d: number, rng: Rng) {
  s.godfatherDelta = d;
  normalize(s, rng);
  refreshSetup(s, rng);
}

/** 教父：外来者 +1 / −1（本来没有外来者时只能 +1） */
export function godfatherChoices(s: GameState): Choice<number>[] {
  const out: Choice<number>[] = [{ key: 'plus', label: '外来者 +1', value: 1, lean: -1, truth: true, standard: true, reason: '多一个外来者、少一个镇民，外来者死了教父才能杀人，帮邪恶。' }];
  if (DISTRIBUTION[s.count][1] > 0)
    out.push({ key: 'minus', label: '外来者 −1', value: -1, lean: 1, truth: true, reason: '少一个外来者、多一个镇民，教父更难杀人，帮善良。' });
  return out;
}

/** 交换两个座位上的角色 */
export function swapSeats(s: GameState, a: number, b: number, rng: Rng) {
  const A = s.seats[a - 1];
  const B = s.seats[b - 1];
  [A.role, B.role] = [B.role, A.role];
  A.startRole = A.role;
  B.startRole = B.role;
  refreshSeating(s, rng);
}

export function shuffleSeats(s: GameState, rng: Rng) {
  const roles = shuffle(s.seats.filter((x) => !x.traveller).map((x) => x.role), rng);
  s.seats = withTravellers(s, seatsFrom(roles));
  refreshSeating(s, rng);
}

/** 提线木偶必须和恶魔相邻：不相邻就和恶魔下一位换角色 */
export function fixMarionette(s: GameState) {
  const m = s.seats.find((x) => x.role === 'marionette');
  const d = s.seats.find((x) => !x.traveller && ROLES[x.role].team === 'demon');
  if (!m || !d) return;
  const N = s.count;
  if ((m.n - d.n + N) % N === 1 || (d.n - m.n + N) % N === 1) return;
  const next = s.seats[d.n % N];
  [m.role, next.role] = [next.role, m.role];
  m.startRole = m.role;
  next.startRole = next.role;
}

/** 座位变了：提线木偶归位、重选邪恶镇民和占卜干扰项 */
function refreshSeating(s: GameState, rng: Rng) {
  fixMarionette(s);
  refreshEvilTownsfolk(s, rng);
  refreshRedHerring(s, rng);
}

/** 角色变了以后重新算配板强度和各项推荐 */
export function refreshSetup(s: GameState, rng: Rng) {
  fixMarionette(s);
  s.setupZ = setupZ(s.seats.map((x) => x.role), s.count, s.script, s.demonChar ?? 'imp');
  const score = balance(s).score;
  const df = drunkFakeChoices(s);
  s.drunkFake = df.length ? df[recommend(df, score, rng)].value : null;
  const mf = marionetteFakeChoices(s);
  s.marionetteFake = mf.length ? mf[recommend(mf, score, rng)].value : null;
  // 以为自己是炼金术士的酒鬼也会被告知一个爪牙能力
  const roles = s.seats.map((x) => x.role);
  // 说书人手动换过且炼金术士还在场，就保留他的选择
  const hasAlch = roles.includes('alchemist') || s.drunkFake === 'alchemist';
  if (!s.alchemistPicked || !hasAlch) {
    s.alchemistPicked = false;
    s.alchemistAbility = alchemistAbilityFor(s.script, s.drunkFake === 'alchemist' ? [...roles, 'alchemist'] : roles);
  }
  // 疯子看到在场的恶魔；小怪宝时给他看涡流
  s.lunaticFake = inPlay(s, 'lunatic') ? (lilMonsta(s) ? 'vortox' : s.demonChar) : null;
  const am = amnesiacChoices(s);
  s.amnesiacAbility = am.length ? am[recommend(am, score, rng)].value : null;
  // 5–6 人局官方规则：恶魔没有伪装
  const bl = s.count >= 7 ? bluffChoices(s, rng) : [];
  s.bluffs = bl.length ? bl[recommend(bl, score, rng)].value : [];
  refreshEvilTownsfolk(s, rng);
  refreshRedHerring(s, rng);
}

/** 赏金猎人在场：选一名镇民变成邪恶 */
function refreshEvilTownsfolk(s: GameState, rng: Rng) {
  for (const x of s.seats) if (!x.traveller) delete x.alignment;
  const cs = evilTownsfolkChoices(s, rng);
  if (cs.length) setEvilTownsfolk(s, cs[recommend(cs, balance(s).score, rng)].value);
}

export function setEvilTownsfolk(s: GameState, n: number) {
  for (const x of s.seats) if (!x.traveller) delete x.alignment;
  s.seats[n - 1].alignment = 'evil';
}

export function evilTownsfolkChoices(s: GameState, rng: Rng): Choice<number>[] {
  if (!inPlay(s, 'bountyhunter')) return [];
  const towns = s.seats.filter((x) => !x.traveller && ROLES[x.role].team === 'townsfolk' && x.role !== 'bountyhunter');
  if (!towns.length) return [];
  const byWeight = [...towns].sort((a, b) => ROLES[b.role].weight - ROLES[a.role].weight);
  const strong = byWeight[0];
  const weak = byWeight[byWeight.length - 1];
  const mid = pick(towns, rng);
  const lbl = (x: Seat) => `${seatName(x.n)}（${roleName(x.role)}）`;
  const out: Choice<number>[] = [
    { key: 'mid', label: lbl(mid), value: mid.n, lean: 0, truth: true, standard: true, reason: '随便一名镇民变成邪恶，标准做法。' },
  ];
  if (strong.n !== mid.n) out.push({ key: 'strong', label: lbl(strong), value: strong.n, lean: -1, truth: true, reason: `${roleName(strong.role)}能力强，他变成邪恶，好人少了一个得力的人，帮邪恶。` });
  if (weak.n !== mid.n && weak.n !== strong.n) out.push({ key: 'weak', label: lbl(weak), value: weak.n, lean: 1, truth: true, reason: `${roleName(weak.role)}能力弱，他变成邪恶影响小，帮善良。` });
  return out;
}

/** 提线木偶以为自己是的善良角色（不在场；不给气球驾驶员，免得牵扯外来者人数） */
export function marionetteFakeChoices(s: GameState): Choice<RoleId>[] {
  if (!inPlay(s, 'marionette')) return [];
  const pool = notInPlay(s, 'townsfolk', ['balloonist', ...(s.drunkFake ? [s.drunkFake] : [])]);
  return pool.map((r): Choice<RoleId> => {
    const def = ROLES[r];
    if (def.info) return { key: r, label: roleName(r), value: r, lean: -1, truth: true, reason: `他以为自己是${def.name}，会拿着假信息替邪恶说话，帮邪恶。` };
    return { key: r, label: roleName(r), value: r, lean: 0, truth: true, standard: true, reason: `${def.name}没有夜间信息，他不容易发现自己不对劲，影响适中。` };
  });
}

/** 干扰项跟座位走，换座位后只重算它 */
function refreshRedHerring(s: GameState, rng: Rng) {
  const rh = redHerringChoices(s, rng);
  s.redHerring = rh.length ? rh[recommend(rh, balance(s).score, rng)].value : null;
}

/* ---------- 特殊设置的推荐 ---------- */

export function drunkFakeChoices(s: GameState): Choice<RoleId>[] {
  if (!inPlay(s, 'drunk')) return [];
  return notInPlay(s, 'townsfolk').map((r): Choice<RoleId> => {
    const def = ROLES[r];
    const clash = s.bluffs.includes(r) ? '注意：这个角色也在恶魔的伪装里，两人可能撞身份。' : '';
    if (r === 'virgin' || r === 'slayer')
      return { key: r, label: roleName(r), value: r, lean: 1, truth: true, reason: `${clash}${def.name}能当众验证，酒鬼身份容易暴露，帮善良。` };
    if (def.info)
      return { key: r, label: roleName(r), value: r, lean: -1, truth: true, reason: `${clash}他以为自己是${def.name}，会把假信息带进小镇，帮邪恶。` };
    return { key: r, label: roleName(r), value: r, lean: 0, truth: true, standard: true, reason: `${clash}${def.name}是被动型角色，影响适中。` };
  });
}

/** 失忆者能力清单：每个能力网页都会算 */
export const AMNESIAC_ABILITIES: RoleId[] = ['empath', 'fortuneteller', 'washerwoman', 'investigator', 'chef', 'undertaker', 'virgin', 'slayer'];

export function amnesiacChoices(s: GameState): Choice<RoleId>[] {
  if (!inPlay(s, 'amnesiac')) return [];
  return AMNESIAC_ABILITIES.map((r): Choice<RoleId> => {
    const name = roleName(r);
    const base = { key: r, label: `像${name}一样`, value: r, truth: true };
    if (r === 'empath' || r === 'fortuneteller') return { ...base, lean: 1, reason: `每晚都有信息（${ROLES[r].ability}），帮善良。` };
    if (r === 'virgin' || r === 'slayer') return { ...base, lean: -1, reason: `被动/白天能力，他不知道自己有，很难用上，帮邪恶。（${ROLES[r].ability}）` };
    return { ...base, lean: 0, standard: true, reason: `${ROLES[r].ability}` };
  });
}

/** 哨兵：外来者 -1 / 0 / +1 */
export function sentinelChoices(s: GameState): Choice<number>[] {
  void s;
  return [
    { key: 'plus', label: '外来者 +1', value: 1, lean: -1, truth: true, reason: '多一个外来者、少一个镇民，帮邪恶。' },
    { key: 'zero', label: '不变', value: 0, lean: 0, truth: true, standard: true, reason: '按人数表，标准做法。' },
    { key: 'minus', label: '外来者 −1', value: -1, lean: 1, truth: true, reason: '少一个外来者、多一个镇民，帮善良。' },
  ];
}

export function bluffChoices(s: GameState, rng: Rng): Choice<RoleId[]>[] {
  const pool = notInPlay(s, ['townsfolk', 'outsider'], ['drunk', ...(s.drunkFake ? [s.drunkFake] : []), ...(s.marionetteFake ? [s.marionetteFake] : [])]);
  if (pool.length < 3) return pool.length ? [{ key: 'all', label: pool.map(roleName).join('、'), value: pool, lean: 0, truth: true, reason: '能用的不在场角色只有这些。' }] : [];
  const byStrength = shuffle(pool, rng).sort((a, b) => ROLES[b].bluff - ROLES[a].bluff);
  const strong = byStrength.slice(0, 3);
  const weak = byStrength.slice(-3);
  const towns = pool.filter((r) => ROLES[r].team === 'townsfolk');
  const outs = pool.filter((r) => ROLES[r].team === 'outsider');
  const f4Free = towns.filter((r) => F4.includes(r));
  const otherTowns = towns.filter((r) => !F4.includes(r));
  // 标准搭配里放一个不在场的首夜信息位，邪恶最好假跳；外来者都在场时第三个用镇民补
  const withF4 = f4Free.length > 0 && otherTowns.length > 0;
  let normal: RoleId[];
  if (withF4) {
    const a = pick(f4Free, rng);
    const b = pick(otherTowns, rng);
    normal = [a, b, pick(outs.length ? outs : pool.filter((r) => r !== a && r !== b), rng)];
  } else normal = outs.length && towns.length >= 2 ? [...sample(towns, 2, rng), pick(outs, rng)] : sample(pool, 3, rng);
  const fmt = (rs: RoleId[]) => rs.map(roleName).join('、');
  return [
    { key: 'strong', label: fmt(strong), value: strong, lean: -1, truth: true, reason: '这几个角色很难被当场拆穿，恶魔好伪装，帮邪恶。' },
    {
      key: 'normal', label: fmt(normal), value: normal, lean: 0, truth: true, standard: true,
      reason: withF4 ? '标准搭配：含一个不在场的首夜信息位（邪恶最好假跳），伪装难度适中。' : '普通搭配：两个镇民加一个外来者，伪装难度适中。',
    },
    { key: 'weak', label: fmt(weak), value: weak, lean: 1, truth: true, reason: '这几个角色容易被验证或拆穿，恶魔不好装，帮善良。' },
  ];
}

export function redHerringChoices(s: GameState, rng: Rng): Choice<number>[] {
  const ft = actorFor(s, 'fortuneteller');
  if (!ft || ft.role === 'drunk') return [];
  const good = s.seats.filter((x) => !isEvil(x));
  const out: Choice<number>[] = [];
  const plain = good.filter((x) => x.n !== ft.n && ROLES[x.role].team === 'townsfolk');
  if (plain.length) {
    const p = pick(plain, rng);
    out.push({ key: 'plain', label: `${seatName(p.n)}（${roleName(p.role)}）`, value: p.n, lean: 0, truth: true, standard: true, reason: '随便一名善良镇民，标准做法。' });
  }
  const saint = good.find((x) => x.role === 'saint');
  if (saint)
    out.push({ key: 'saint', label: `${seatName(saint.n)}（圣徒）`, value: saint.n, lean: -2, truth: true, reason: '干扰项放在圣徒身上：好人可能把圣徒当恶魔处决，直接输。大帮邪恶。' });
  out.push({ key: 'self', label: `${seatName(ft.n)}（${roleName(ft.role)}自己）`, value: ft.n, lean: -1, truth: true, reason: '占卜的人自己当干扰项：他查到自己会得到"有"，会怀疑自己。帮邪恶。' });
  const recluse = good.find((x) => x.role === 'recluse');
  if (recluse)
    out.push({ key: 'recluse', label: `${seatName(recluse.n)}（陌客）`, value: recluse.n, lean: 1, truth: true, reason: '陌客本来就可能被当成恶魔，干扰集中在一个人身上，帮善良。' });
  return out;
}

export function startDeal(s: GameState) {
  s.phase = 'deal';
  s.dealIndex = 0;
  const lines = [`开局：${scriptOf(s).name}，${s.count} 人。${s.seats.map((x) => `${seatName(x.n)}${roleName(x.role)}`).join('、')}`];
  if (lilMonsta(s)) lines.push('恶魔是小怪宝（无人扮演，每晚由爪牙照看）');
  if (s.drunkFake && inPlay(s, 'drunk')) lines.push(`酒鬼以为自己是【${roleName(s.drunkFake)}】`);
  if (s.lunaticFake) lines.push(`疯子以为自己是【${roleName(s.lunaticFake)}】`);
  if (s.marionetteFake) lines.push(`提线木偶以为自己是【${roleName(s.marionetteFake)}】`);
  if (s.alchemistAbility) lines.push(`炼金术士拥有【${roleName(s.alchemistAbility)}】的能力`);
  if (godfatherModFor(s)) lines.push(`教父：外来者 ${s.godfatherDelta > 0 ? '+1' : '−1'}`);
  const etf = s.seats.find((x) => x.alignment === 'evil');
  if (etf) lines.push(`邪恶镇民（赏金猎人）：${seatName(etf.n)}${roleName(etf.role)}`);
  if (s.amnesiacAbility) lines.push(`失忆者的能力：像${roleName(s.amnesiacAbility)}一样`);
  if (s.bluffs.length) lines.push(`恶魔伪装：${s.bluffs.map(roleName).join('、')}`);
  if (s.redHerring) lines.push(`占卜干扰项：${seatName(s.redHerring)}`);
  if (s.fabled.includes('sentinel')) lines.push(`传奇角色哨兵：外来者 ${s.sentinelDelta > 0 ? '+1' : s.sentinelDelta < 0 ? '−1' : '不变'}`);
  if (s.fabled.includes('duchess')) lines.push('传奇角色：公爵夫人');
  for (const text of lines) s.log.push({ night: 0, phase: 'setup', text });
}
