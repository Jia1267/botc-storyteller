import { ROLES, rolesOfTeam, roleName, type RoleId } from './roles';
import { balance, recommend, type Choice } from './balance';
import { findRole, inPlay, isEvil, notInPlay } from './core';
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

export function randomRoles(count: number, rng: Rng): RoleId[] {
  const [t, o, m] = DISTRIBUTION[count];
  const minions = sample(rolesOfTeam('minion'), m, rng);
  const baron = minions.includes('baron') ? 2 : 0;
  const outs = sample(rolesOfTeam('outsider'), o + baron, rng);
  const towns = sample(rolesOfTeam('townsfolk'), t - baron, rng);
  return [...towns, ...outs, ...minions, 'imp'];
}

export const rolesWeight = (roles: RoleId[]) => roles.reduce((a, r) => a + ROLES[r].weight, 0);

const statsCache: Record<number, { mean: number; sd: number }> = {};
function stats(count: number) {
  if (!statsCache[count]) {
    const rng = seeded(1000 + count);
    const xs = Array.from({ length: 800 }, () => rolesWeight(randomRoles(count, rng)));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 1;
    statsCache[count] = { mean, sd };
  }
  return statsCache[count];
}

/** 配板强度标准分：0 = 平均，正数偏善良 */
export function setupZ(roles: RoleId[], count: number): number {
  const { mean, sd } = stats(count);
  return (rolesWeight(roles) - mean) / sd;
}

/** 一键生成：只从均衡的组合里挑 */
export function balancedRoles(count: number, rng: Rng): RoleId[] {
  let best: RoleId[] = randomRoles(count, rng);
  let bestZ = Math.abs(setupZ(best, count));
  for (let i = 0; i < 300 && bestZ > 0.5; i++) {
    const r = randomRoles(count, rng);
    const z = Math.abs(setupZ(r, count));
    if (z < bestZ) {
      best = r;
      bestZ = z;
    }
  }
  return best;
}

/** 配板强度的原因（一两句大白话） */
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
  return out;
}

export function newGame(): GameState {
  return {
    v: 1,
    phase: 'setup',
    setupStep: 'count',
    count: 0,
    seats: [],
    drunkFake: null,
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

/** 选好人数后：生成均衡组合、随机落座、填好推荐的特殊设置 */
export function setCount(s: GameState, count: number, rng: Rng) {
  s.count = count;
  s.seats = seatsFrom(shuffle(balancedRoles(count, rng), rng));
  s.setupStep = 'roles';
  refreshSetup(s, rng);
}

export function rerollRoles(s: GameState, rng: Rng) {
  s.seats = seatsFrom(shuffle(balancedRoles(s.count, rng), rng));
  refreshSetup(s, rng);
}

/** 把某个座位换成同阵营的另一个角色；男爵进出时自动调整外来者人数 */
export function replaceRole(s: GameState, n: number, to: RoleId, rng: Rng) {
  const st = s.seats[n - 1];
  const from = st.role;
  if (from === to || inPlay(s, to)) return;
  st.role = st.startRole = to;
  if (to === 'baron') swapTeams(s, 'townsfolk', 'outsider', n, rng);
  if (from === 'baron') swapTeams(s, 'outsider', 'townsfolk', n, rng);
  refreshSetup(s, rng);
}

function swapTeams(s: GameState, fromTeam: 'townsfolk' | 'outsider', toTeam: 'townsfolk' | 'outsider', keep: number, rng: Rng) {
  const victims = sample(s.seats.filter((x) => x.n !== keep && ROLES[x.role].team === fromTeam), 2, rng);
  const fresh = sample(notInPlay(s, toTeam), victims.length, rng);
  victims.forEach((v, i) => (v.role = v.startRole = fresh[i]));
}

/** 交换两个座位上的角色 */
export function swapSeats(s: GameState, a: number, b: number, rng: Rng) {
  const A = s.seats[a - 1];
  const B = s.seats[b - 1];
  [A.role, B.role] = [B.role, A.role];
  A.startRole = A.role;
  B.startRole = B.role;
  refreshRedHerring(s, rng);
}

export function shuffleSeats(s: GameState, rng: Rng) {
  const roles = shuffle(s.seats.map((x) => x.role), rng);
  s.seats = seatsFrom(roles);
  refreshRedHerring(s, rng);
}

/** 角色变了以后重新算配板强度和三项推荐 */
export function refreshSetup(s: GameState, rng: Rng) {
  s.setupZ = setupZ(s.seats.map((x) => x.role), s.count);
  const score = balance(s).score;
  const df = drunkFakeChoices(s);
  s.drunkFake = df.length ? df[recommend(df, score, rng)].value : null;
  const bl = bluffChoices(s, rng);
  s.bluffs = bl.length ? bl[recommend(bl, score, rng)].value : [];
  refreshRedHerring(s, rng);
}

/** 干扰项跟座位走，换座位后只重算它 */
function refreshRedHerring(s: GameState, rng: Rng) {
  const rh = redHerringChoices(s, rng);
  s.redHerring = rh.length ? rh[recommend(rh, balance(s).score, rng)].value : null;
}

/* ---------- 三项特殊设置的推荐 ---------- */

export function drunkFakeChoices(s: GameState): Choice<RoleId>[] {
  if (!inPlay(s, 'drunk')) return [];
  return notInPlay(s, 'townsfolk').map((r) => {
    const def = ROLES[r];
    if (r === 'virgin' || r === 'slayer')
      return { key: r, label: roleName(r), value: r, lean: 1, truth: true, reason: `${def.name}能当众验证，酒鬼身份容易暴露，帮善良。` };
    if (def.info)
      return { key: r, label: roleName(r), value: r, lean: -1, truth: true, reason: `他以为自己是${def.name}，会把假信息带进小镇，帮邪恶。` };
    return { key: r, label: roleName(r), value: r, lean: 0, truth: true, standard: true, reason: `${def.name}是被动型角色，影响适中。` };
  });
}

export function bluffChoices(s: GameState, rng: Rng): Choice<RoleId[]>[] {
  const pool = notInPlay(s, ['townsfolk', 'outsider'], s.drunkFake ? [s.drunkFake, 'drunk'] : ['drunk']);
  if (pool.length < 3) return pool.length ? [{ key: 'all', label: pool.map(roleName).join('、'), value: pool, lean: 0, truth: true, reason: '能用的不在场角色只有这些。' }] : [];
  const byStrength = shuffle(pool, rng).sort((a, b) => ROLES[b].bluff - ROLES[a].bluff);
  const strong = byStrength.slice(0, 3);
  const weak = byStrength.slice(-3);
  const towns = pool.filter((r) => ROLES[r].team === 'townsfolk');
  const outs = pool.filter((r) => ROLES[r].team === 'outsider');
  const normal = outs.length && towns.length >= 2 ? [...sample(towns, 2, rng), pick(outs, rng)] : sample(pool, 3, rng);
  const fmt = (rs: RoleId[]) => rs.map(roleName).join('、');
  return [
    { key: 'strong', label: fmt(strong), value: strong, lean: -1, truth: true, reason: '这几个角色很难被当场拆穿，恶魔好伪装，帮邪恶。' },
    { key: 'normal', label: fmt(normal), value: normal, lean: 0, truth: true, standard: true, reason: '普通搭配：两个镇民加一个外来者，伪装难度适中。' },
    { key: 'weak', label: fmt(weak), value: weak, lean: 1, truth: true, reason: '这几个角色容易被验证或拆穿，恶魔不好装，帮善良。' },
  ];
}

export function redHerringChoices(s: GameState, rng: Rng): Choice<number>[] {
  const ft = findRole(s, 'fortuneteller');
  if (!ft) return [];
  const good = s.seats.filter((x) => !isEvil(x));
  const out: Choice<number>[] = [];
  const plain = good.filter((x) => x.n !== ft.n && ROLES[x.role].team === 'townsfolk');
  if (plain.length) {
    const p = pick(plain, rng);
    out.push({ key: 'plain', label: `${p.n}号（${roleName(p.role)}）`, value: p.n, lean: 0, truth: true, standard: true, reason: '随便一名善良镇民，标准做法。' });
  }
  const saint = good.find((x) => x.role === 'saint');
  if (saint)
    out.push({ key: 'saint', label: `${saint.n}号（圣徒）`, value: saint.n, lean: -2, truth: true, reason: '干扰项放在圣徒身上：好人可能把圣徒当恶魔处决，直接输。大帮邪恶。' });
  out.push({ key: 'self', label: `${ft.n}号（占卜师自己）`, value: ft.n, lean: -1, truth: true, reason: '占卜师自己当干扰项：他查到自己会得到"有"，会怀疑自己。帮邪恶。' });
  const recluse = good.find((x) => x.role === 'recluse');
  if (recluse)
    out.push({ key: 'recluse', label: `${recluse.n}号（陌客）`, value: recluse.n, lean: 1, truth: true, reason: '陌客本来就可能被当成恶魔，干扰集中在一个人身上，帮善良。' });
  return out;
}

export function startDeal(s: GameState) {
  s.phase = 'deal';
  s.dealIndex = 0;
  s.log.push({ night: 0, phase: 'setup', text: `开局：${s.count} 人。${s.seats.map((x) => `${x.n}号${roleName(x.role)}`).join('、')}` });
  if (s.drunkFake) s.log.push({ night: 0, phase: 'setup', text: `酒鬼以为自己是【${roleName(s.drunkFake)}】` });
  if (s.bluffs.length) s.log.push({ night: 0, phase: 'setup', text: `恶魔伪装：${s.bluffs.map(roleName).join('、')}` });
  if (s.redHerring) s.log.push({ night: 0, phase: 'setup', text: `占卜师干扰项：${s.redHerring}号` });
}
