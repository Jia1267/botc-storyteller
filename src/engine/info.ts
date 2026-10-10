import { ROLES, isEvilTeam, roleName, rolesOfTeam, type RoleId, type Team } from './roles';
import { balance, type Choice } from './balance';
import {
  aliveCount, aliveNeighbors, circleOrder, deathShield, findRole, isDemonSeat, isEvil, malfunction, mustLie, notInPlay, scriptOf, scriptRolesOf,
  seatLabel, seatOf, seatName, teamOf,
} from './core';
import { pick, type Rng } from './rng';
import type { GameState, Seat } from './types';

/** 洗衣妇/图书管理员/调查员的信息：一个角色 + 两名玩家；role 为 null 表示"场上没有外来者" */
export interface PairInfo {
  role: RoleId | null;
  seats: [number, number] | null;
}

export type PairKind = 'washerwoman' | 'librarian' | 'investigator';
const KIND_TEAM: Record<PairKind, Team> = { washerwoman: 'townsfolk', librarian: 'outsider', investigator: 'minion' };

export type Verdict = 'true' | 'twist' | 'false';

const sorted = (a: number, b: number): [number, number] => (a < b ? [a, b] : [b, a]);

export function pairLabel(p: PairInfo): string {
  if (p.role === null || !p.seats) return '比 0（握拳）：场上没有外来者';
  return `给他看【${roleName(p.role)}】，指向 ${seatName(p.seats[0])} 和 ${seatName(p.seats[1])}`;
}

function others(s: GameState, exclude: number[]): Seat[] {
  return s.seats.filter((x) => !exclude.includes(x.n));
}
const goodOf = (xs: Seat[]) => xs.filter((x) => !isEvil(x));
const evilOf = (xs: Seat[]) => xs.filter((x) => isEvil(x));
const pickOr = <T,>(xs: T[], rng: Rng): T | undefined => (xs.length ? pick(xs, rng) : undefined);

/** 涡流在场：镇民只能拿假信息，只留假选项 */
function vortoxOnly<T>(s: GameState, ability: RoleId, out: Choice<T>[]): Choice<T>[] {
  if (!mustLie(s, ability)) return out;
  return out
    .filter((c) => !c.truth)
    .map((c) => ({ ...c, reason: `涡流在场，镇民只能拿假信息。${c.reason.replace('中毒的标准用法。', '')}` }));
}

/** 判断一条"角色+两人"信息是真、合规的误导、还是假的 */
export function pairVerdict(s: GameState, kind: PairKind, actorN: number, p: PairInfo): Verdict {
  const team = KIND_TEAM[kind];
  if (p.role === null || !p.seats) {
    if (kind !== 'librarian') return 'false';
    return s.seats.some((x) => x.n !== actorN && ROLES[x.role].team === 'outsider') ? 'false' : 'true';
  }
  const [a, b] = p.seats;
  if (a === b || a === actorN || b === actorN) return 'false';
  if (ROLES[p.role].team !== team) return 'false';
  const pair = [seatOf(s, a), seatOf(s, b)];
  if (pair.some((x) => x.role === p.role)) return 'true';
  if (kind !== 'investigator' && pair.some((x) => x.role === 'spy')) return 'twist';
  if (kind === 'investigator' && pair.some((x) => x.role === 'recluse')) return 'twist';
  return 'false';
}

/* ---------------- 洗衣妇 / 图书管理员 / 调查员 ---------------- */

export function pairChoices(s: GameState, kind: PairKind, actorN: number, rng: Rng): Choice<PairInfo>[] {
  const team = KIND_TEAM[kind];
  const healthy = !malfunction(s, actorN) && !mustLie(s, kind);
  const rest = others(s, [actorN]);
  const targets = rest.filter((x) => ROLES[x.role].team === team);
  const out: Choice<PairInfo>[] = [];
  const mk = (key: string, info: PairInfo, lean: number, reason: string, v: Verdict, standard = false): Choice<PairInfo> => ({
    key, label: pairLabel(info), value: info, lean, reason, truth: v !== 'false', twist: v === 'twist', standard,
  });
  const decoyFor = (t: Seat, pool: Seat[]) => pickOr(pool.filter((x) => x.n !== t.n), rng);

  // 真实信息（标准给法：干扰项是善良玩家）
  const truthful = (): PairInfo | null => {
    if (!targets.length) return kind === 'librarian' ? { role: null, seats: null } : null;
    const t = pick(targets, rng);
    const d = decoyFor(t, goodOf(rest)) ?? decoyFor(t, rest);
    return d ? { role: t.role, seats: sorted(t.n, d.n) } : null;
  };

  const spy = rest.find((x) => x.role === 'spy');
  const recluse = rest.find((x) => x.role === 'recluse');
  const fakeRole = (t: Team) =>
    pickOr(notInPlay(s, t, [...s.bluffs, ...(s.drunkFake ? [s.drunkFake] : [])]), rng) ??
    pickOr(notInPlay(s, t), rng) ??
    pickOr(scriptRolesOf(s, t), rng) ??
    pick(rolesOfTeam(t), rng);

  if (healthy) {
    const base = truthful();
    if (base) {
      const zero = base.role === null;
      out.push(mk('std', base, 0, zero ? '场上确实没有外来者。' : '真实信息，干扰项选了一名善良玩家。标准做法。', 'true', true));
    }
    if (targets.length && kind !== 'investigator') {
      const t = pick(targets, rng);
      const d = decoyFor(t, evilOf(rest));
      if (d) out.push(mk('evilDecoy', { role: t.role, seats: sorted(t.n, d.n) }, -1, `干扰项选了邪恶玩家 ${seatName(d.n)}：他会显得像个${kind === 'washerwoman' ? '镇民' : '外来者'}，替他打掩护。`, 'true'));
    }
    if (kind === 'washerwoman' && targets.length) {
      const strong = [...targets].sort((a, b) => ROLES[b.role].weight - ROLES[a.role].weight)[0];
      const d = decoyFor(strong, goodOf(rest));
      if (d && ROLES[strong.role].weight >= 1.5)
        out.push(mk('confirm', { role: strong.role, seats: sorted(strong.n, d.n) }, 1, `帮关键角色【${roleName(strong.role)}】坐实身份，帮善良。`, 'true'));
    }
    if (kind === 'investigator' && targets.length) {
      const t = pick(targets, rng);
      const demon = rest.find((x) => isDemonSeat(s, x.n));
      const otherMinion = decoyFor(t, rest.filter((x) => ROLES[x.role].team === 'minion'));
      if (otherMinion) out.push(mk('twoMinions', { role: t.role, seats: sorted(t.n, otherMinion.n) }, 1, '干扰项也是爪牙：两个人都是邪恶，帮善良。', 'true'));
      if (demon) out.push(mk('demonDecoy', { role: t.role, seats: sorted(t.n, demon.n) }, 2, '干扰项是恶魔：好人几乎直接锁定邪恶，大帮善良。', 'true'));
    }
    if (spy && kind !== 'investigator') {
      const g = pickOr(goodOf(rest), rng);
      if (g) out.push(mk('spy', { role: fakeRole(team), seats: sorted(spy.n, g.n) }, -2, `把间谍（${seatName(spy.n)}）当成${kind === 'washerwoman' ? '镇民' : '外来者'}给出去（规则允许）：间谍拿到一份"清白证明"，大帮邪恶。`, 'twist'));
    }
    if (recluse && kind === 'investigator') {
      const g = pickOr(goodOf(rest).filter((x) => x.n !== recluse.n), rng);
      const minionRole = pickOr(targets.map((x) => x.role), rng) ?? pick(rolesOfTeam('minion'), rng);
      if (g) out.push(mk('recluse', { role: minionRole, seats: sorted(recluse.n, g.n) }, -1, `把陌客（${seatName(recluse.n)}）当成爪牙给出去（规则允许）：好人会去怀疑两个善良玩家，帮邪恶。`, 'twist'));
    }
    return out;
  }

  // 中毒 / 酒鬼：什么都可以给
  const base = truthful();
  if (base) out.push(mk('true', base, 1, '中毒/酒鬼也可以给真信息，等于这次投毒没起作用。帮善良。', pairVerdict(s, kind, actorN, base)));
  const g2 = goodOf(rest);
  if (g2.length >= 2) {
    const a = pick(g2, rng);
    const b = pick(g2.filter((x) => x.n !== a.n), rng);
    const fake = kind === 'investigator' ? pickOr(s.seats.filter((x) => ROLES[x.role].team === 'minion').map((x) => x.role), rng) ?? fakeRole('minion') : fakeRole(team);
    const reason =
      kind === 'investigator'
        ? '假信息：两个好人被冤枉成爪牙嫌疑。中毒的标准用法。'
        : `假信息：给一个不在场的角色，指向两个好人。看起来很正常，不容易被识破。`;
    out.push(mk('fake', { role: fake, seats: sorted(a.n, b.n) }, 0, reason, 'false', true));
  }
  if (kind === 'librarian' && targets.length) {
    out.push(mk('fakeZero', { role: null, seats: null }, -1, '假信息：说场上没有外来者。好人会算错外来者人数。', 'false'));
  }
  const demon = rest.find((x) => isDemonSeat(s, x.n));
  const bluff = s.bluffs.find((r) => ROLES[r].team === team);
  const g = pickOr(goodOf(rest), rng);
  if (kind !== 'investigator' && demon && bluff && g) {
    out.push(mk('bluff', { role: bluff, seats: sorted(demon.n, g.n) }, -2, `把恶魔（${seatName(demon.n)}）和他的伪装角色【${roleName(bluff)}】一起给出去：恶魔的伪装被"证实"，大帮邪恶。`, 'false'));
  } else if (kind !== 'investigator') {
    const e = pickOr(evilOf(rest), rng);
    if (e && g) out.push(mk('frameEvil', { role: fakeRole(team), seats: sorted(e.n, g.n) }, -2, `让邪恶玩家 ${seatName(e.n)} 看起来像${kind === 'washerwoman' ? '镇民' : '外来者'}，大帮邪恶。`, 'false'));
  }
  return vortoxOnly(s, kind, out);
}

/* ---------------- 厨师 / 共情者（数字） ---------------- */

interface Variant {
  spyEvil: boolean;
  recluseEvil: boolean;
  desc: string;
}

function variants(relevant: Seat[]): Variant[] {
  const hasSpy = relevant.some((x) => x.role === 'spy');
  const hasRec = relevant.some((x) => x.role === 'recluse');
  const out: Variant[] = [];
  for (const spyEvil of hasSpy ? [true, false] : [true])
    for (const recluseEvil of hasRec ? [false, true] : [false]) {
      const d: string[] = [];
      if (!spyEvil) d.push('间谍算作善良');
      if (recluseEvil) d.push('陌客算作邪恶');
      out.push({ spyEvil, recluseEvil, desc: d.join('，') });
    }
  return out;
}

const evilUnder = (x: Seat, v: Variant) => (x.role === 'spy' ? v.spyEvil : x.role === 'recluse' ? v.recluseEvil : isEvil(x));

export function chefCount(s: GameState, v: Variant = { spyEvil: true, recluseEvil: false, desc: '' }): number {
  // 按圆桌顺序数（旅行者坐在中间也算）
  const order = circleOrder(s);
  let c = 0;
  for (let i = 0; i < order.length; i++) {
    const a = seatOf(s, order[i]);
    const b = seatOf(s, order[(i + 1) % order.length]);
    if (evilUnder(a, v) && evilUnder(b, v)) c++;
  }
  return c;
}

export function empathCount(s: GameState, n: number, v: Variant = { spyEvil: true, recluseEvil: false, desc: '' }): number {
  return aliveNeighbors(s, n).filter((m) => evilUnder(seatOf(s, m), v)).length;
}

/** 某个数字是否合规（健康时只能给这些） */
export function legalNumbers(s: GameState, kind: 'chef' | 'empath', actorN: number): number[] {
  const relevant = kind === 'chef' ? s.seats : aliveNeighbors(s, actorN).map((m) => seatOf(s, m));
  const set = new Set(variants(relevant).map((v) => (kind === 'chef' ? chefCount(s, v) : empathCount(s, actorN, v))));
  return [...set].sort((a, b) => a - b);
}

export function numberChoices(s: GameState, kind: 'chef' | 'empath', actorN: number): Choice<number>[] {
  const relevant = kind === 'chef' ? s.seats : aliveNeighbors(s, actorN).map((m) => seatOf(s, m));
  const vs = variants(relevant);
  const count = (v: Variant) => (kind === 'chef' ? chefCount(s, v) : empathCount(s, actorN, v));
  const base = count(vs[0]);
  const lbl = (n: number) => `比 ${n}`;

  if (!malfunction(s, actorN) && !mustLie(s, kind)) {
    const byNum = new Map<number, string[]>();
    for (const v of vs) {
      const c = count(v);
      if (!byNum.has(c)) byNum.set(c, []);
      if (v.desc) byNum.get(c)!.push(v.desc);
    }
    if (byNum.size === 1) return [{ key: `n${base}`, label: lbl(base), value: base, lean: 0, truth: true, standard: true, reason: '真实答案。' }];
    return [...byNum.entries()].map(([n, descs]) =>
      n === base
        ? { key: `n${n}`, label: lbl(n), value: n, lean: 1, truth: true, reason: '按真实阵营算，帮善良。' }
        : { key: `n${n}`, label: lbl(n), value: n, lean: -1, truth: true, twist: true, reason: `${descs[0]}（规则允许），帮邪恶。` },
    );
  }

  const max = kind === 'empath' ? Math.min(2, aliveNeighbors(s, actorN).length) : Math.min(4, Math.max(1, s.seats.filter(isEvil).length));
  const out: Choice<number>[] = [{ key: `n${base}`, label: lbl(base), value: base, lean: 1, truth: true, reason: '中毒/酒鬼也可以给真数字，等于这次没被影响。帮善良。' }];
  for (let n = 0; n <= max; n++) {
    if (n === base) continue;
    const d = Math.abs(n - base);
    if (d === 1 && n > base)
      out.push({ key: `n${n}`, label: lbl(n), value: n, lean: 0, truth: false, standard: true, reason: '多报一个：冤枉一个好人。中毒的标准用法。' });
    else if (d === 1)
      out.push({ key: `n${n}`, label: lbl(n), value: n, lean: -1, truth: false, standard: true, reason: '少报一个：替一个邪恶玩家打掩护，帮邪恶。' });
    else out.push({ key: `n${n}`, label: lbl(n), value: n, lean: -2, truth: false, reason: '和真实差得多，误导很强，大帮邪恶。' });
  }
  return vortoxOnly(s, kind, out);
}

/* ---------------- 占卜师 ---------------- */

export function fortuneTruth(s: GameState, picks: number[]): boolean {
  return picks.some((n) => isDemonSeat(s, n) || n === s.redHerring);
}

export function fortuneChoices(s: GameState, actorN: number, picks: number[]): Choice<boolean>[] {
  const yes = fortuneTruth(s, picks);
  const demonIn = picks.some((n) => isDemonSeat(s, n));
  const rec = picks.find((n) => seatOf(s, n).role === 'recluse');
  const Y = (lean: number, reason: string, truth: boolean, extra: Partial<Choice<boolean>> = {}): Choice<boolean> => ({ key: 'yes', label: '点头：有恶魔', value: true, lean, reason, truth, ...extra });
  const N = (lean: number, reason: string, truth: boolean, extra: Partial<Choice<boolean>> = {}): Choice<boolean> => ({ key: 'no', label: '摇头：没有恶魔', value: false, lean, reason, truth, ...extra });

  if (!malfunction(s, actorN) && !mustLie(s, 'fortuneteller')) {
    if (yes) return [Y(0, demonIn ? '恶魔就在这两人里。' : `${seatName(s.redHerring)}是干扰项，所以也是"有"。`, true, { standard: true })];
    if (rec) return [N(1, '按真实情况：两人都不是恶魔。帮善良。', true), Y(-1, `把陌客（${seatName(rec)}）当成恶魔（规则允许），帮邪恶。`, true, { twist: true })];
    return [N(0, '两人都不是恶魔。', true, { standard: true })];
  }
  if (yes) {
    const t = Y(1, '中毒/酒鬼也可以给真答案。帮善良。', true);
    const f = demonIn
      ? N(-1, '假答案：替恶魔打掩护。中毒的标准用法。', false, { standard: true })
      : N(0, '假答案：干扰项不起作用。', false, { standard: true });
    return vortoxOnly(s, 'fortuneteller', [t, f]);
  }
  return vortoxOnly(s, 'fortuneteller', [N(1, '中毒/酒鬼也可以给真答案。帮善良。', true), Y(0, '假答案：冤枉这两人之一。中毒的标准用法。', false, { standard: true })]);
}

/* ---------------- 送葬者 / 守鸦人（看角色） ---------------- */

export function revealVerdict(s: GameState, subjectN: number, r: RoleId): Verdict {
  const sub = seatOf(s, subjectN);
  if (sub.role === r) return 'true';
  const t = ROLES[r].team;
  if (sub.role === 'spy' && (t === 'townsfolk' || t === 'outsider')) return 'twist';
  if (sub.role === 'recluse' && (t === 'minion' || t === 'demon')) return 'twist';
  return 'false';
}

export function revealChoices(
  s: GameState, actorN: number, subjectN: number, rng: Rng, ability: 'undertaker' | 'ravenkeeper' = 'undertaker',
): Choice<RoleId>[] {
  const sub = seatOf(s, subjectN);
  const r = sub.role;
  const mk = (role: RoleId, lean: number, reason: string, v: Verdict, standard = false): Choice<RoleId> => ({
    key: role, label: `给他看【${roleName(role)}】`, value: role, lean, reason, truth: v !== 'false', twist: v === 'twist', standard,
  });
  const goodFake = () =>
    pickOr(notInPlay(s, 'townsfolk', [...s.bluffs, ...(s.drunkFake ? [s.drunkFake] : [])]), rng) ?? pickOr(scriptRolesOf(s, 'townsfolk'), rng) ?? pick(rolesOfTeam('townsfolk'), rng);
  const minionFake = () => pickOr(s.seats.filter((x) => ROLES[x.role].team === 'minion').map((x) => x.role), rng) ?? pickOr(scriptRolesOf(s, 'minion'), rng) ?? pick(rolesOfTeam('minion'), rng);

  if (!malfunction(s, actorN) && !mustLie(s, ability)) {
    if (r === 'spy') return [mk('spy', 1, '按真实身份给，帮善良。', 'true'), mk(goodFake(), -1, '把间谍当成善良角色给出去（规则允许），帮邪恶。', 'twist')];
    if (r === 'recluse') return [mk('recluse', 1, '按真实身份给，帮善良。', 'true'), mk(minionFake(), -1, '把陌客当成爪牙给出去（规则允许），帮邪恶。', 'twist')];
    return [mk(r, 0, r === 'drunk' ? '他就是酒鬼，直接给看"酒鬼"。' : '真实角色。', 'true', true)];
  }
  const out = [mk(r, 1, '中毒/酒鬼也可以给真角色。帮善良。', 'true')];
  if (isEvil(sub)) out.push(mk(goodFake(), -1, '假信息：把邪恶玩家说成善良角色，替他洗白。', 'false', true));
  else out.push(mk(minionFake(), 0, '假信息：把好人说成爪牙。中毒的标准用法。', 'false', true));
  return vortoxOnly(s, ability, out);
}

/* ---------------- 小恶魔相关 ---------------- */

/** 红唇女郎此刻能否接任（恶魔死亡前存活 ≥ 5 且她健康） */
export function scarletCanTakeOver(s: GameState): Seat | undefined {
  const sw = findRole(s, 'scarletwoman');
  if (!sw || !sw.alive || malfunction(s, sw.n)) return undefined;
  return aliveCount(s) >= 5 ? sw : undefined;
}

export function mayorBounceChoices(s: GameState, mayorN: number, rng: Rng): Choice<number>[] {
  const monk = s.ns?.monk ?? null;
  const ok = (x: Seat) =>
    x.alive && x.n !== mayorN && !isDemonSeat(s, x.n) && x.n !== monk && !(x.role === 'soldier' && !malfunction(s, x.n));
  const good = s.seats.filter((x) => ok(x) && !isEvil(x));
  const minions = s.seats.filter((x) => ok(x) && ROLES[x.role].team === 'minion');
  const out: Choice<number>[] = [
    { key: 'mayor', label: `就让镇长（${seatName(mayorN)}）死`, value: mayorN, lean: -1, truth: true, reason: '镇长死了，善良少了一条胜利路线，帮邪恶。' },
  ];
  const g = pickOr(good, rng);
  if (g) out.push({ key: 'good', label: `改成 ${seatName(g.n)}（${roleName(g.role)}）替他死`, value: g.n, lean: 1, truth: true, reason: '镇长活下来，好人会更信任他，帮善良。' });
  const m = pickOr(minions, rng);
  if (m) out.push({ key: 'minion', label: `改成 ${seatName(m.n)}（${roleName(m.role)}）替他死`, value: m.n, lean: 2, truth: true, reason: '等于帮好人除掉一个爪牙，大帮善良。' });
  return out;
}

export function starpassChoices(s: GameState, impN: number): Choice<number>[] {
  const sw = scarletCanTakeOver(s);
  if (sw) return [{ key: 'sw', label: `${seatName(sw.n)}（红唇女郎）`, value: sw.n, lean: 0, truth: true, standard: true, reason: '红唇女郎的能力：存活 ≥ 5 人时由她接任，规则规定。' }];
  const minions = s.seats.filter((x) => x.alive && x.n !== impN && ROLES[x.role].team === 'minion');
  if (!minions.length) return [];
  // 对善良有多大好处 = 他被信息指向的次数 + 他变成恶魔后邪恶失去的爪牙能力
  const LOSS: Partial<Record<RoleId, number>> = { poisoner: 2, spy: 1.5, scarletwoman: 1, baron: 0 };
  const why = (x: Seat) => {
    const e = s.exposure[x.n] ?? 0;
    const parts = [e ? `被信息指向过 ${e} 次` : '没被信息指向过'];
    parts.push((LOSS[x.role] ?? 0) > 0 ? `变成恶魔后邪恶会失去${roleName(x.role)}的能力` : `${roleName(x.role)}变成恶魔，邪恶不损失任何能力`);
    return parts.join('；');
  };
  const v = (x: Seat) => (s.exposure[x.n] ?? 0) + (LOSS[x.role] ?? 0);
  const lo = Math.min(...minions.map(v));
  const hi = Math.max(...minions.map(v));
  return minions.map((x) => {
    const base = { key: `m${x.n}`, label: `${seatName(x.n)}（${roleName(x.role)}）`, value: x.n, truth: true };
    if (lo === hi) return { ...base, lean: 0, reason: `${why(x)}。几个爪牙差不多，随便选。` };
    if (v(x) === lo) return { ...base, lean: -1, reason: `${why(x)}。新恶魔更安全，帮邪恶。` };
    if (v(x) === hi) return { ...base, lean: 1, reason: `${why(x)}。好人更容易抓到新恶魔，帮善良。` };
    return { ...base, lean: 0, reason: `${why(x)}。` };
  });
}

/* ---------------- 幽灵茶会 / 窃窃私语 ---------------- */

/** 通用的"比数字"选项：健康给真数字；中毒/酒鬼/涡流给假数字 */
function countChoices(s: GameState, ability: RoleId, actorN: number, base: number, max: number): Choice<number>[] {
  const lbl = (n: number) => `比 ${n}`;
  if (!malfunction(s, actorN) && !mustLie(s, ability))
    return [{ key: `n${base}`, label: lbl(base), value: base, lean: 0, truth: true, standard: true, reason: '真实答案。' }];
  const out: Choice<number>[] = [{ key: `n${base}`, label: lbl(base), value: base, lean: 1, truth: true, reason: '中毒/醉酒也可以给真数字。帮善良。' }];
  for (let n = 0; n <= max; n++) {
    if (n === base) continue;
    if (n === base + 1) out.push({ key: `n${n}`, label: lbl(n), value: n, lean: 0, truth: false, standard: true, reason: '多报一个：看起来正常的假信息。' });
    else if (n === base - 1) out.push({ key: `n${n}`, label: lbl(n), value: n, lean: -1, truth: false, standard: true, reason: '少报一个：帮邪恶藏一下。' });
    else out.push({ key: `n${n}`, label: lbl(n), value: n, lean: -2, truth: false, reason: '和真实差得多，误导很强，大帮邪恶。' });
  }
  return vortoxOnly(s, ability, out);
}

/** 侍女：她选的两人今晚有几个因为自己的能力醒过 */
export const chambermaidCount = (s: GameState, picks: number[]) => picks.filter((n) => s.ns?.woke.includes(n)).length;

export function chambermaidChoices(s: GameState, actorN: number, picks: number[]): Choice<number>[] {
  return countChoices(s, 'chambermaid', actorN, chambermaidCount(s, picks), 2);
}

/** 小精灵：第一晚给他看一个在场的镇民 */
export function pixieChoices(s: GameState, actorN: number, rng: Rng): Choice<RoleId>[] {
  const mk = (r: RoleId, lean: number, reason: string, truth: boolean, standard = false): Choice<RoleId> => ({
    key: r, label: `给他看【${roleName(r)}】`, value: r, lean, reason, truth, standard,
  });
  const inPlayTowns = s.seats.filter((x) => x.n !== actorN && ROLES[x.role].team === 'townsfolk').map((x) => x.role);
  const fakes = notInPlay(s, 'townsfolk').filter((r) => r !== 'pixie');
  if (!malfunction(s, actorN) && !mustLie(s, 'pixie')) {
    return inPlayTowns.map((r) => mk(r, 0, `${roleName(r)}在场，真实信息。`, true, true));
  }
  const out = inPlayTowns.slice(0, 1).map((r) => mk(r, 1, '中毒也可以给真信息。帮善良。', true));
  const f = pickOr(fakes, rng);
  if (f) out.push(mk(f, 0, '假信息：这个角色其实不在场，他会去冒充一个不存在的身份。', false, true));
  return vortoxOnly(s, 'pixie', out);
}

/** 气球驾驶员：每晚一名玩家，类型和之前给过的都不同 */
export interface BalloonInfo {
  seat: number;
  team: Team;
}
export const BALLOON_TYPES: Team[] = ['townsfolk', 'outsider', 'minion', 'demon'];

/** 场上存在、还没给过的类型 */
export function balloonRemaining(s: GameState, actorN: number): Team[] {
  const typeOf = (x: Seat): Team => (isDemonSeat(s, x.n) ? 'demon' : ROLES[x.role].team);
  const present = new Set(s.seats.filter((x) => x.n !== actorN).map(typeOf));
  return BALLOON_TYPES.filter((t) => present.has(t) && !s.balloonShown.includes(t));
}

export function balloonistChoices(s: GameState, actorN: number, rng: Rng): Choice<BalloonInfo>[] {
  const typeOf = (x: Seat): Team => (isDemonSeat(s, x.n) ? 'demon' : ROLES[x.role].team);
  const rest = s.seats.filter((x) => x.n !== actorN);
  const NAME: Record<Team, string> = { townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔', traveller: '旅行者' };
  const out: Choice<BalloonInfo>[] = [];
  for (const t of balloonRemaining(s, actorN)) {
    const x = pick(rest.filter((y) => typeOf(y) === t), rng);
    out.push({
      key: t, label: `指向 ${seatName(x.n)}（${NAME[t]}）`, value: { seat: x.n, team: t }, truth: true,
      lean: t === 'demon' ? 1 : 0, standard: t !== 'demon',
      reason: t === 'demon' ? '直接把恶魔指给他，帮善良。' : `给他一个${NAME[t]}，标准做法。`,
    });
  }
  if (malfunction(s, actorN)) {
    const shown = s.balloonShown.length ? s.balloonShown : (['townsfolk'] as Team[]);
    const x = pickOr(rest.filter((y) => shown.includes(typeOf(y))), rng);
    if (x) out.push({ key: 'fake', label: `指向 ${seatName(x.n)}（${NAME[typeOf(x)]}，其实是之前给过的类型）`, value: { seat: x.n, team: typeOf(x) }, truth: false, lean: 0, standard: true, reason: '假信息：类型和之前重复了，他会推错。' });
    for (const c of out)
      if (c.truth) {
        c.lean = 1;
        c.standard = false;
      }
  }
  return out;
}

/** 小怪宝：每晚（第一晚除外）由说书人决定谁死 */
export function lilKillChoices(s: GameState, rng: Rng): Choice<number>[] {
  const cands = s.seats.filter((x) => x.alive && x.n !== s.babysitter);
  const good = cands.filter((x) => !isEvil(x)).sort((a, b) => ROLES[b.role].weight - ROLES[a.role].weight);
  if (!good.length) return cands.map((x) => ({ key: `k${x.n}`, label: `${seatName(x.n)}（${roleName(x.role)}）`, value: x.n, lean: 0, truth: true, reason: '只剩这些人可选。' }));
  const strong = good[0];
  const weak = good[good.length - 1];
  const mid = pick(good, rng);
  const lbl = (x: Seat) => `${seatName(x.n)}（${roleName(x.role)}）死亡`;
  const out: Choice<number>[] = [
    { key: 'strong', label: lbl(strong), value: strong.n, lean: -1, truth: true, reason: `${roleName(strong.role)}对善良最有用，杀他帮邪恶。` },
    { key: 'mid', label: lbl(mid), value: mid.n, lean: 0, truth: true, standard: true, reason: '随便一名善良玩家，标准做法。' },
  ];
  if (weak.n !== strong.n) out.push({ key: 'weak', label: lbl(weak), value: weak.n, lean: 1, truth: true, reason: `${roleName(weak.role)}对善良用处最小，杀他帮善良。` });
  return out;
}

/** 寡妇：告诉一名善良玩家"寡妇在场" */
export function widowInformChoices(s: GameState, rng: Rng): Choice<number>[] {
  const good = s.seats.filter((x) => x.alive && !isEvil(x));
  const out: Choice<number>[] = [];
  const victim = good.find((x) => x.n === s.widowPoison);
  const others = good.filter((x) => x.n !== s.widowPoison);
  const r = pickOr(others, rng);
  if (r) out.push({ key: 'rand', label: `告诉 ${seatName(r.n)}（${roleName(r.role)}）`, value: r.n, lean: 0, truth: true, standard: true, reason: '随便一名善良玩家，标准做法。' });
  if (victim) out.push({ key: 'victim', label: `告诉 ${seatName(victim.n)}（被毒的人）`, value: victim.n, lean: 1, truth: true, reason: '被毒的人知道寡妇在场，会怀疑自己的信息，帮善良。' });
  return out;
}

/** 公爵夫人：拜访者中几个邪恶，其中一人拿到假数字 */
export interface DuchessInfo {
  falseFor: number;
  falseNum: number;
}
export const duchessCount = (s: GameState) => s.duchessVisitors.filter((n) => isEvil(seatOf(s, n))).length;

export function duchessChoices(s: GameState, rng: Rng): Choice<DuchessInfo>[] {
  const vs = s.duchessVisitors;
  if (!vs.length) return [];
  const c = duchessCount(s);
  const out: Choice<DuchessInfo>[] = [];
  const who = pick(vs, rng);
  if (c + 1 <= vs.length) out.push({ key: 'up', label: `${seatName(who)} 拿到假数字 ${c + 1}`, value: { falseFor: who, falseNum: c + 1 }, lean: 0, truth: false, standard: true, reason: '多报一个：冤枉一名拜访者，标准做法。' });
  if (c - 1 >= 0) out.push({ key: 'down', label: `${seatName(who)} 拿到假数字 ${c - 1}`, value: { falseFor: who, falseNum: c - 1 }, lean: -1, truth: false, reason: '少报一个：替邪恶拜访者打掩护，帮邪恶。' });
  const evilVisitor = vs.find((n) => isEvil(seatOf(s, n)));
  if (evilVisitor && c + 1 <= vs.length)
    out.push({ key: 'evil', label: `${seatName(evilVisitor)} 拿到假数字 ${c + 1}`, value: { falseFor: evilVisitor, falseNum: c + 1 }, lean: 1, truth: false, reason: '假数字给邪恶玩家：真话都在好人手里，帮善良。' });
  return out;
}

/* ---------------- 残阳高照 ---------------- */

/** 某人被杀会怎样：死人、茶艺师/弄臣挡下、僵怖假死 */
export function killPreview(s: GameState, n: number): { dies: boolean; text: string } {
  const x = seatOf(s, n);
  if (!x.alive && !(x.role === 'zombuul' && s.zombuulFake)) return { dies: false, text: `${seatName(n)} 已经死了，什么都不会发生。` };
  const sh = deathShield(s, n);
  if (sh) return { dies: false, text: `${seatName(n)} ${sh}。天亮时没有人因此死亡。` };
  if (x.role === 'zombuul' && !s.zombuulFake && !x.used && !malfunction(s, n))
    return { dies: true, text: `${seatName(n)} 是僵怖：第一次死亡是假死。公开宣布他死了，但他其实还活着。` };
  if (x.role === 'zombuul' && s.zombuulFake) return { dies: true, text: `${seatName(n)} 是假死的僵怖：这次是真的死了，善良获胜。` };
  return { dies: true, text: `${seatLabel(s, n)} 死亡。` };
}

/** 卖花女孩：今天恶魔有没有投过票 */
export function flowergirlChoices(s: GameState, actorN: number): Choice<boolean>[] {
  const voted = s.demonVotedDay === s.night - 1;
  const yes = (lean: number, reason: string, truth: boolean, standard = false): Choice<boolean> => ({ key: 'yes', label: '点头：恶魔投过票', value: true, lean, reason, truth, standard });
  const no = (lean: number, reason: string, truth: boolean, standard = false): Choice<boolean> => ({ key: 'no', label: '摇头：恶魔没投票', value: false, lean, reason, truth, standard });
  if (!malfunction(s, actorN)) return [voted ? yes(0, '恶魔今天举手投过票。', true, true) : no(0, '恶魔今天没有投票。', true, true)];
  return voted
    ? [yes(1, '中毒/醉酒也可以给真答案。帮善良。', true), no(-1, '假答案：替恶魔打掩护。', false, true)]
    : [no(1, '中毒/醉酒也可以给真答案。帮善良。', true), yes(0, '假答案：让他去怀疑今天投过票的人。', false, true)];
}

/* ---------------- 王不见王 ---------------- */

export interface DreamInfo {
  good: RoleId;
  evil: RoleId;
}
export const dreamLabel = (d: DreamInfo) => `【${roleName(d.good)}】和【${roleName(d.evil)}】`;

/** 筑梦师：一个善良角色 + 一个邪恶角色，其中一个是他的真实角色 */
export function dreamerChoices(s: GameState, actorN: number, target: number, rng: Rng): Choice<DreamInfo>[] {
  const real = seatOf(s, target).role;
  const goods = scriptOf(s).roles.filter((r) => !isEvilTeam(ROLES[r].team));
  const evils = scriptOf(s).roles.filter((r) => isEvilTeam(ROLES[r].team));
  const otherGood = (not: RoleId[] = []) => pickOr(goods.filter((r) => r !== real && !not.includes(r)), rng) ?? goods[0];
  const otherEvil = (not: RoleId[] = []) => pickOr(evils.filter((r) => r !== real && !not.includes(r)), rng) ?? evils[0];
  const realGood = !isEvilTeam(teamOf(real));
  const truthful: DreamInfo = realGood ? { good: real, evil: otherEvil() } : { good: otherGood(), evil: real };
  const mk = (key: string, d: DreamInfo, lean: number, reason: string, truth: boolean, extra: Partial<Choice<DreamInfo>> = {}): Choice<DreamInfo> => ({
    key, label: dreamLabel(d), value: d, lean, reason, truth, ...extra,
  });
  if (!malfunction(s, actorN) && !mustLie(s, 'dreamer')) {
    const out = [mk('std', truthful, 0, realGood ? `他真实角色是善良的【${roleName(real)}】。` : `他真实角色是邪恶的【${roleName(real)}】。`, true, { standard: true })];
    if (real === 'spy') out.push(mk('spy', { good: otherGood(), evil: otherEvil(['spy']) }, -1, '把间谍当成善良角色（规则允许）：两个角色都不是间谍，替他打掩护，帮邪恶。', true, { twist: true }));
    if (real === 'recluse') out.push(mk('recluse', { good: otherGood(['recluse']), evil: otherEvil() }, -1, '把陌客当成邪恶角色（规则允许）：好人会怀疑他，帮邪恶。', true, { twist: true }));
    return out;
  }
  const out = [mk('true', truthful, 1, '中毒/醉酒也可以给真信息。帮善良。', true)];
  out.push(mk('fake', { good: otherGood(), evil: otherEvil() }, 0, '假信息：两个角色都不是他。中毒的标准用法。', false, { standard: true }));
  return vortoxOnly(s, 'dreamer', out);
}

/** 女裁缝：两人是不是同一阵营 */
export function seamstressChoices(s: GameState, actorN: number, picks: [number, number]): Choice<boolean>[] {
  const [a, b] = picks.map((n) => seatOf(s, n));
  const same = isEvil(a) === isEvil(b);
  const twistable = [a, b].some((x) => x.role === 'spy' || x.role === 'recluse');
  const Y = (lean: number, reason: string, truth: boolean, extra: Partial<Choice<boolean>> = {}): Choice<boolean> => ({ key: 'same', label: '点头：同一阵营', value: true, lean, reason, truth, ...extra });
  const N = (lean: number, reason: string, truth: boolean, extra: Partial<Choice<boolean>> = {}): Choice<boolean> => ({ key: 'diff', label: '摇头：不同阵营', value: false, lean, reason, truth, ...extra });
  if (!malfunction(s, actorN) && !mustLie(s, 'seamstress')) {
    const t = same ? Y(twistable ? 1 : 0, '真实答案。', true, { standard: !twistable }) : N(twistable ? 1 : 0, '真实答案。', true, { standard: !twistable });
    if (!twistable) return [t];
    const f = same
      ? N(-1, '间谍/陌客可以被当成另一阵营（规则允许），帮邪恶。', true, { twist: true })
      : Y(-1, '间谍/陌客可以被当成另一阵营（规则允许），帮邪恶。', true, { twist: true });
    return [t, f];
  }
  const t = same ? Y(1, '中毒/醉酒也可以给真答案。帮善良。', true) : N(1, '中毒/醉酒也可以给真答案。帮善良。', true);
  const f = same ? N(0, '假答案。中毒的标准用法。', false, { standard: true }) : Y(-1, '假答案：把邪恶说成和好人一伙，帮邪恶。', false, { standard: true });
  return vortoxOnly(s, 'seamstress', [t, f]);
}

/** 赏金猎人：指出一名（还没给过的）邪恶玩家 */
export function bountyChoices(s: GameState, actorN: number, rng: Rng): Choice<number>[] {
  const pool = s.seats.filter((x) => x.alive && x.n !== actorN && isEvil(x) && !s.bountyKnown.includes(x.n));
  const lbl = (x: Seat) => `指向 ${seatName(x.n)}（${roleName(x.role)}）`;
  const out: Choice<number>[] = [];
  const minion = pickOr(pool.filter((x) => ROLES[x.role].team === 'minion'), rng);
  const demon = pool.find((x) => isDemonSeat(s, x.n));
  const etf = pool.find((x) => ROLES[x.role].team === 'townsfolk');
  const recluse = s.seats.find((x) => x.alive && x.role === 'recluse' && x.n !== actorN && !s.bountyKnown.includes(x.n));
  if (!malfunction(s, actorN) && !mustLie(s, 'bountyhunter')) {
    if (minion) out.push({ key: 'minion', label: lbl(minion), value: minion.n, lean: 0, truth: true, standard: true, reason: '一名爪牙，标准做法。' });
    if (etf) out.push({ key: 'etf', label: lbl(etf), value: etf.n, lean: minion ? -1 : 0, truth: true, standard: !minion, reason: '邪恶镇民：他有真能力，好人不容易相信他是邪恶的。' });
    if (demon) out.push({ key: 'demon', label: lbl(demon), value: demon.n, lean: 2, truth: true, reason: '直接指出恶魔，大帮善良。' });
    if (recluse) out.push({ key: 'recluse', label: lbl(recluse), value: recluse.n, lean: -1, truth: true, twist: true, reason: '把陌客当成邪恶（规则允许）：好人会冤枉他，帮邪恶。' });
    if (!out.length) out.push(...pool.map((x) => ({ key: `e${x.n}`, label: lbl(x), value: x.n, lean: 0, truth: true, reason: '只剩这些人。' })));
    return out;
  }
  const good = pickOr(s.seats.filter((x) => x.alive && x.n !== actorN && !isEvil(x) && !s.bountyKnown.includes(x.n)), rng);
  if (good) out.push({ key: 'good', label: lbl(good), value: good.n, lean: 0, truth: false, standard: true, reason: '假信息：指向一名好人。他死了以后赏金猎人才会得到下一个人。' });
  const t = minion ?? demon ?? etf;
  if (t) out.push({ key: 'true', label: lbl(t), value: t.n, lean: 1, truth: true, reason: '中毒/醉酒也可以给真信息。帮善良。' });
  return vortoxOnly(s, 'bountyhunter', out);
}

export type GeneralAnswer = 'good' | 'evil' | 'neither';
const GENERAL_LABEL: Record<GeneralAnswer, string> = { good: '拇指向上：善良占优', evil: '拇指向下：邪恶占优', neither: '拇指横着：都不占优' };

/** 将军：说书人认为哪边占优，按局势条判断 */
export function generalTruth(s: GameState): GeneralAnswer {
  const score = balance(s).score;
  return score >= 12 ? 'good' : score <= -12 ? 'evil' : 'neither';
}

export function generalChoices(s: GameState, actorN: number): Choice<GeneralAnswer>[] {
  const t = generalTruth(s);
  const mk = (a: GeneralAnswer, lean: number, reason: string, truth: boolean, standard = false): Choice<GeneralAnswer> => ({ key: a, label: GENERAL_LABEL[a], value: a, lean, reason, truth, standard });
  if (!malfunction(s, actorN) && !mustLie(s, 'general')) return [mk(t, 0, `局势条现在是 ${balance(s).score}，按它回答。`, true, true)];
  const others = (['good', 'evil', 'neither'] as GeneralAnswer[]).filter((a) => a !== t);
  return vortoxOnly(s, 'general', [
    mk(t, 1, '中毒/醉酒也可以给真答案。帮善良。', true),
    ...others.map((a) => mk(a, a === 'good' ? -1 : 0, a === 'good' ? '假装善良占优，让好人放松警惕，帮邪恶。' : '假答案。', false, a !== 'good')),
  ]);
}

/** 心上人死了：选一名玩家从此醉酒 */
export function sweetheartChoices(s: GameState, rng: Rng): Choice<number>[] {
  const alive = s.seats.filter((x) => x.alive);
  const good = alive.filter((x) => !isEvil(x)).sort((a, b) => ROLES[b.role].weight - ROLES[a.role].weight);
  const minion = pickOr(alive.filter((x) => isEvil(x) && !isDemonSeat(s, x.n)), rng);
  const lbl = (x: Seat) => `${seatName(x.n)}（${roleName(x.role)}）醉酒`;
  const out: Choice<number>[] = [];
  const mid = pickOr(good, rng);
  if (mid) out.push({ key: 'mid', label: lbl(mid), value: mid.n, lean: 0, truth: true, standard: true, reason: '随便一名善良玩家，标准做法。' });
  if (good[0] && good[0].n !== mid?.n) out.push({ key: 'strong', label: lbl(good[0]), value: good[0].n, lean: -1, truth: true, reason: `${roleName(good[0].role)}对善良最有用，让他醉酒帮邪恶。` });
  if (minion) out.push({ key: 'minion', label: lbl(minion), value: minion.n, lean: 1, truth: true, reason: '让爪牙醉酒，他的能力失效，帮善良。' });
  return out;
}

/** 瘟疫医生死了：说书人拿哪个爪牙能力（间谍按相克规则给一名活着的爪牙） */
export interface PlagueInfo {
  ability: RoleId;
  to?: number;
}
export function plagueChoices(s: GameState, rng: Rng): Choice<PlagueInfo>[] {
  const minion = pickOr(s.seats.filter((x) => x.alive && ROLES[x.role].team === 'minion' && x.role !== 'marionette'), rng);
  const out: Choice<PlagueInfo>[] = [];
  if (minion)
    out.push({ key: 'spy', label: `间谍能力给 ${seatName(minion.n)}（${roleName(minion.role)}）`, value: { ability: 'spy', to: minion.n }, lean: 0, truth: true, standard: true, reason: '相克规则：由一名活着的爪牙获得间谍能力，每晚看魔典。影响适中。' });
  out.push({ key: 'harpy', label: '说书人获得鹰身女妖的能力', value: { ability: 'harpy' }, lean: -1, truth: true, standard: !minion, reason: '每晚由你选两个人，逼第一个人疯狂指认第二个人，帮邪恶。' });
  out.push({ key: 'poisoner', label: '说书人获得投毒者的能力', value: { ability: 'poisoner' }, lean: -2, truth: true, reason: '每晚由你毒一个人，信息会被污染，大帮邪恶。' });
  return out;
}

/** 瘟疫医生死后，说书人用投毒者能力毒谁（今晚和明天白天） */
export function stPoisonChoices(s: GameState, rng: Rng): Choice<number>[] {
  const alive = s.seats.filter((x) => x.alive);
  const lbl = (x: Seat) => `毒 ${seatName(x.n)}（${roleName(x.role)}）`;
  const good = alive.filter((x) => !isEvil(x));
  const strong = [...good].filter((x) => ROLES[x.role].info).sort((a, b) => ROLES[b.role].weight - ROLES[a.role].weight)[0];
  const mid = pickOr(good.filter((x) => x.n !== strong?.n), rng) ?? strong;
  const minion = pickOr(alive.filter((x) => isEvil(x) && !isDemonSeat(s, x.n)), rng);
  const demon = alive.find((x) => isDemonSeat(s, x.n));
  const out: Choice<number>[] = [];
  if (mid) out.push({ key: 'mid', label: lbl(mid), value: mid.n, lean: 0, truth: true, standard: true, reason: '随便毒一名善良玩家，标准做法。' });
  if (strong && strong.n !== mid?.n)
    out.push({ key: 'strong', label: lbl(strong), value: strong.n, lean: -1, truth: true, reason: `${roleName(strong.role)}拿信息最有用，毒他今晚的信息会变成假的，帮邪恶。` });
  if (minion) out.push({ key: 'minion', label: lbl(minion), value: minion.n, lean: 1, truth: true, reason: '毒爪牙：他今晚和明天的能力失效，帮善良。' });
  if (demon) out.push({ key: 'demon', label: lbl(demon), value: demon.n, lean: 2, truth: true, reason: '毒恶魔：今晚恶魔的能力无效，大帮善良。' });
  return out;
}

/** 瘟疫医生死后，说书人用鹰身女妖能力选两个人：第一个人要疯狂地证明第二个人是邪恶的 */
export interface HarpyPick {
  mad: number;
  second: number;
}
export function stHarpyChoices(s: GameState, rng: Rng): Choice<HarpyPick>[] {
  const alive = s.seats.filter((x) => x.alive);
  const good = alive.filter((x) => !isEvil(x));
  const lbl = (p: HarpyPick) => `${seatName(p.mad)} 要证明 ${seatName(p.second)} 是邪恶的`;
  const out: Choice<HarpyPick>[] = [];
  const mad = pickOr(good, rng);
  if (!mad) return out;
  const others = alive.filter((x) => x.n !== mad.n);
  const anyone = pickOr(others, rng);
  if (anyone)
    out.push({ key: 'mid', label: lbl({ mad: mad.n, second: anyone.n }), value: { mad: mad.n, second: anyone.n }, lean: 0, truth: true, standard: true, reason: '随便两个人，标准做法。' });
  // 拿信息最有用的好人去指认另一个好人：要么冤枉好人，要么自己可能死
  const strong = [...good].sort((a, b) => ROLES[b.role].weight - ROLES[a.role].weight)[0];
  const victim = pickOr(good.filter((x) => x.n !== strong.n), rng);
  if (victim)
    out.push({
      key: 'frame', label: lbl({ mad: strong.n, second: victim.n }), value: { mad: strong.n, second: victim.n }, lean: -1, truth: true,
      reason: `${roleName(strong.role)}被逼着指认好人 ${seatName(victim.n)}：要么冤枉好人，要么自己可能死，帮邪恶。`,
    });
  const minion = pickOr(others.filter((x) => isEvil(x) && !isDemonSeat(s, x.n)), rng);
  if (minion)
    out.push({ key: 'minion', label: lbl({ mad: mad.n, second: minion.n }), value: { mad: mad.n, second: minion.n }, lean: 1, truth: true, reason: `${seatName(minion.n)} 真的是爪牙：等于逼好人去指认真凶，帮善良。` });
  const demon = others.find((x) => isDemonSeat(s, x.n));
  if (demon)
    out.push({ key: 'demon', label: lbl({ mad: mad.n, second: demon.n }), value: { mad: mad.n, second: demon.n }, lean: 2, truth: true, reason: `${seatName(demon.n)} 就是恶魔：等于逼好人去指认恶魔，大帮善良。` });
  return out;
}

/**
 * 鹰身女妖：第一个人没做到疯狂，谁死。
 * 标准做法是只罚要疯狂的那个人；两人都死是重罚，算帮邪恶。
 */
export function harpyPunishChoices(s: GameState): Choice<number[]>[] {
  const h = s.harpy!;
  const alive = (n: number) => seatOf(s, n).alive;
  const side = (n: number) => `${seatLabel(s, n)}${isEvil(seatOf(s, n)) ? '是邪恶的' : '是善良的'}`;
  const evil = (n: number) => isEvil(seatOf(s, n));
  const out: Choice<number[]>[] = [];
  if (alive(h.mad))
    out.push({ key: 'mad', label: `${seatName(h.mad)} 死亡`, value: [h.mad], lean: 0, truth: true, standard: true, reason: `标准做法：谁没做到疯狂就罚谁。${side(h.mad)}。` });
  if (alive(h.second))
    out.push({
      key: 'second', label: `${seatName(h.second)} 死亡`, value: [h.second], lean: evil(h.second) ? 1 : -1, truth: true, standard: !alive(h.mad),
      reason: `${side(h.second)}，${evil(h.second) ? '罚他帮善良' : '罚他帮邪恶'}。`,
    });
  if (alive(h.mad) && alive(h.second)) {
    const bothEvil = evil(h.mad) && evil(h.second);
    out.push({
      key: 'both', label: `${seatName(h.mad)} 和 ${seatName(h.second)} 都死亡`, value: [h.mad, h.second], lean: bothEvil ? 2 : -1, truth: true,
      reason: bothEvil ? '两人都是邪恶的，一下少两个邪恶玩家，大帮善良。' : `一天死两个人是重罚，小镇人数掉得快，帮邪恶。${side(h.mad)}；${side(h.second)}。`,
    });
  }
  out.push({
    key: 'none', label: '算了，谁都不死', value: [], lean: alive(h.mad) ? (evil(h.mad) ? -1 : 1) : 0, truth: true, standard: !out.length,
    reason: alive(h.mad) ? `放他一马。${side(h.mad)}，${evil(h.mad) ? '放过他帮邪恶' : '放过他帮善良'}。` : '放他一马。',
  });
  return out;
}

/* ---------------- 暗月初升 ---------------- */

/** 祖母：第一晚得知一名善良玩家（孙子）和他的角色 */
export interface GrandchildInfo {
  seat: number;
  role: RoleId;
}
export function grandmotherChoices(s: GameState, actorN: number, rng: Rng): Choice<GrandchildInfo>[] {
  const good = s.seats.filter((x) => x.n !== actorN && !x.traveller && !isEvil(x));
  const lbl = (g: GrandchildInfo) => `指向 ${seatName(g.seat)}，给她看【${roleName(g.role)}】`;
  const out: Choice<GrandchildInfo>[] = [];
  const mid = pickOr(good, rng);
  if (!malfunction(s, actorN) && !mustLie(s, 'grandmother')) {
    if (mid) out.push({ key: 'mid', label: lbl({ seat: mid.n, role: mid.role }), value: { seat: mid.n, role: mid.role }, lean: 0, truth: true, standard: true, reason: '随便一名善良玩家，标准做法。' });
    const strong = [...good].sort((a, b) => ROLES[b.role].weight - ROLES[a.role].weight)[0];
    if (strong && strong.n !== mid?.n)
      out.push({ key: 'strong', label: lbl({ seat: strong.n, role: strong.role }), value: { seat: strong.n, role: strong.role }, lean: 1, truth: true, reason: `${roleName(strong.role)}是关键角色，被祖母"认证"后好人更信任他，帮善良。` });
    const weak = [...good].sort((a, b) => ROLES[a.role].weight - ROLES[b.role].weight)[0];
    if (weak && weak.n !== mid?.n && weak.n !== strong?.n)
      out.push({ key: 'weak', label: lbl({ seat: weak.n, role: weak.role }), value: { seat: weak.n, role: weak.role }, lean: -1, truth: true, reason: `${roleName(weak.role)}能力弱，认证他用处不大，帮邪恶。` });
    return out;
  }
  if (mid) out.push({ key: 'true', label: lbl({ seat: mid.n, role: mid.role }), value: { seat: mid.n, role: mid.role }, lean: 1, truth: true, reason: '中毒/醉酒也可以给真信息。帮善良。' });
  const g2 = pickOr(good.filter((x) => x.n !== mid?.n), rng);
  const wrong = pickOr(scriptRolesOf(s, 'townsfolk').filter((r) => r !== g2?.role && r !== 'grandmother'), rng);
  if (g2 && wrong) out.push({ key: 'wrongRole', label: lbl({ seat: g2.n, role: wrong }), value: { seat: g2.n, role: wrong }, lean: 0, truth: false, standard: true, reason: '假信息：人是好人，但角色说错了。中毒的标准用法。' });
  const evil = pickOr(s.seats.filter((x) => x.n !== actorN && isEvil(x)), rng);
  const fake = pickOr(notInPlay(s, 'townsfolk'), rng);
  if (evil && fake) out.push({ key: 'evil', label: lbl({ seat: evil.n, role: fake }), value: { seat: evil.n, role: fake }, lean: -2, truth: false, reason: `把邪恶玩家 ${seatName(evil.n)} 当成好人给她，替他洗白，大帮邪恶。` });
  return vortoxOnly(s, 'grandmother', out);
}

/** 让某人醉酒的推荐：醉的是邪恶玩家帮善良，醉的是善良玩家帮邪恶 */
function drunkChoice(s: GameState, n: number, extra = ''): Choice<number> {
  const x = seatOf(s, n);
  const evil = isEvil(x);
  return {
    key: `d${n}`, label: `${seatName(n)}（${roleName(x.role)}）醉酒`, value: n, lean: evil ? 1 : -1, truth: true,
    reason: `${extra}${evil ? '邪恶玩家的能力今晚失效，帮善良。' : `${roleName(x.role)}的能力失效到明天黄昏，帮邪恶。`}`,
  };
}

/** 水手：他或他选的人醉酒（标准做法：选的人醉） */
export function sailorDrunkChoices(s: GameState, sailorN: number, target: number): Choice<number>[] {
  if (target === sailorN) return [{ ...drunkChoice(s, sailorN), standard: true, reason: '他选了自己：只能是他自己醉酒。' }];
  const t = drunkChoice(s, target);
  const self: Choice<number> = { key: 'self', label: `水手自己（${seatName(sailorN)}）醉酒`, value: sailorN, lean: -1, truth: true, reason: '水手醉酒后失去保护，今晚可能被杀，帮邪恶。' };
  return [{ ...t, lean: isEvil(seatOf(s, target)) ? 1 : 0, standard: true, reason: `标准做法：他选的人醉。${t.reason}` }, self];
}

/** 旅店老板：保护的两人中谁醉酒 */
export function innkeeperDrunkChoices(s: GameState, picks: number[]): Choice<number>[] {
  const cs = picks.map((n) => drunkChoice(s, n));
  // 两个都一样时第一个当标准
  if (cs.length === 2 && cs[0].lean === cs[1].lean) cs[0] = { ...cs[0], lean: 0, standard: true };
  return cs;
}

/** 沙巴洛斯：上一晚选的人里死了的，要不要吐出一个复活 */
export function shabalothReviveChoices(s: GameState): Choice<number | null>[] {
  if (s.shabalothNight !== s.night - 1) return [];
  const dead = s.shabalothLast.map((n) => seatOf(s, n)).filter((x) => !x.alive);
  if (!dead.length) return [];
  const out: Choice<number | null>[] = [{ key: 'none', label: '不复活任何人', value: null, lean: 0, truth: true, standard: true, reason: '标准做法：吃掉的就吃掉了。' }];
  for (const x of dead)
    out.push({
      key: `r${x.n}`, label: `让 ${seatName(x.n)}（${roleName(x.role)}）复活`, value: x.n, lean: isEvil(x) ? -1 : 1, truth: true,
      reason: isEvil(x) ? '邪恶玩家回来了，帮邪恶。' : '好人回来了，帮善良。',
    });
  return out;
}

/** 修补匠：今晚要不要让他死 */
export function tinkerChoices(s: GameState): Choice<boolean>[] {
  void s;
  return [
    { key: 'live', label: '不死', value: false, lean: 0, truth: true, standard: true, reason: '标准做法：大多数晚上不动他。' },
    { key: 'die', label: '让修补匠今晚死亡', value: true, lean: -1, truth: true, reason: '好人少一个，帮邪恶。' },
  ];
}

/** 和平主义者：被处决的善良玩家要不要不死 */
export function pacifistChoices(s: GameState, n: number): Choice<boolean>[] {
  return [
    { key: 'die', label: `照常：${seatName(n)} 死亡`, value: false, lean: 0, truth: true, standard: true, reason: '按正常流程走。' },
    { key: 'save', label: `和平主义者：${seatName(n)} 不死`, value: true, lean: 1, truth: true, reason: `${seatLabel(s, n)}是善良的，留住他帮善良。` },
  ];
}
