import { ROLES, roleName, rolesOfTeam, type RoleId, type Team } from './roles';
import type { Choice } from './balance';
import { aliveCount, aliveNeighbors, findRole, isEvil, malfunction, notInPlay, seatOf } from './core';
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
  return `给他看【${roleName(p.role)}】，指向 ${p.seats[0]}号 和 ${p.seats[1]}号`;
}

function others(s: GameState, exclude: number[]): Seat[] {
  return s.seats.filter((x) => !exclude.includes(x.n));
}
const goodOf = (xs: Seat[]) => xs.filter((x) => !isEvil(x));
const evilOf = (xs: Seat[]) => xs.filter((x) => isEvil(x));
const pickOr = <T,>(xs: T[], rng: Rng): T | undefined => (xs.length ? pick(xs, rng) : undefined);

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
  const healthy = !malfunction(s, actorN);
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
      if (d) out.push(mk('evilDecoy', { role: t.role, seats: sorted(t.n, d.n) }, -1, `干扰项选了邪恶玩家 ${d.n}号：他会显得像个${kind === 'washerwoman' ? '镇民' : '外来者'}，替他打掩护。`, 'true'));
    }
    if (kind === 'washerwoman' && targets.length) {
      const strong = [...targets].sort((a, b) => ROLES[b.role].weight - ROLES[a.role].weight)[0];
      const d = decoyFor(strong, goodOf(rest));
      if (d && ROLES[strong.role].weight >= 1.5)
        out.push(mk('confirm', { role: strong.role, seats: sorted(strong.n, d.n) }, 1, `帮关键角色【${roleName(strong.role)}】坐实身份，帮善良。`, 'true'));
    }
    if (kind === 'investigator' && targets.length) {
      const t = pick(targets, rng);
      const demon = rest.find((x) => x.role === 'imp');
      const otherMinion = decoyFor(t, rest.filter((x) => ROLES[x.role].team === 'minion'));
      if (otherMinion) out.push(mk('twoMinions', { role: t.role, seats: sorted(t.n, otherMinion.n) }, 1, '干扰项也是爪牙：两个人都是邪恶，帮善良。', 'true'));
      if (demon) out.push(mk('demonDecoy', { role: t.role, seats: sorted(t.n, demon.n) }, 2, '干扰项是恶魔：好人几乎直接锁定邪恶，大帮善良。', 'true'));
    }
    if (spy && kind !== 'investigator') {
      const g = pickOr(goodOf(rest), rng);
      if (g) out.push(mk('spy', { role: fakeRole(team), seats: sorted(spy.n, g.n) }, -2, `把间谍（${spy.n}号）当成${kind === 'washerwoman' ? '镇民' : '外来者'}给出去（规则允许）：间谍拿到一份"清白证明"，大帮邪恶。`, 'twist'));
    }
    if (recluse && kind === 'investigator') {
      const g = pickOr(goodOf(rest).filter((x) => x.n !== recluse.n), rng);
      const minionRole = pickOr(targets.map((x) => x.role), rng) ?? pick(rolesOfTeam('minion'), rng);
      if (g) out.push(mk('recluse', { role: minionRole, seats: sorted(recluse.n, g.n) }, -1, `把陌客（${recluse.n}号）当成爪牙给出去（规则允许）：好人会去怀疑两个善良玩家，帮邪恶。`, 'twist'));
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
  const demon = rest.find((x) => x.role === 'imp');
  const bluff = s.bluffs.find((r) => ROLES[r].team === team);
  const g = pickOr(goodOf(rest), rng);
  if (kind !== 'investigator' && demon && bluff && g) {
    out.push(mk('bluff', { role: bluff, seats: sorted(demon.n, g.n) }, -2, `把恶魔（${demon.n}号）和他的伪装角色【${roleName(bluff)}】一起给出去：恶魔的伪装被"证实"，大帮邪恶。`, 'false'));
  } else if (kind !== 'investigator') {
    const e = pickOr(evilOf(rest), rng);
    if (e && g) out.push(mk('frameEvil', { role: fakeRole(team), seats: sorted(e.n, g.n) }, -2, `让邪恶玩家 ${e.n}号 看起来像${kind === 'washerwoman' ? '镇民' : '外来者'}，大帮邪恶。`, 'false'));
  }
  return out;
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
  let c = 0;
  for (let i = 0; i < s.count; i++) {
    const a = s.seats[i];
    const b = s.seats[(i + 1) % s.count];
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

  if (!malfunction(s, actorN)) {
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
  return out;
}

/* ---------------- 占卜师 ---------------- */

export function fortuneTruth(s: GameState, picks: number[]): boolean {
  return picks.some((n) => seatOf(s, n).role === 'imp' || n === s.redHerring);
}

export function fortuneChoices(s: GameState, actorN: number, picks: number[]): Choice<boolean>[] {
  const yes = fortuneTruth(s, picks);
  const demonIn = picks.some((n) => seatOf(s, n).role === 'imp');
  const rec = picks.find((n) => seatOf(s, n).role === 'recluse');
  const Y = (lean: number, reason: string, truth: boolean, extra: Partial<Choice<boolean>> = {}): Choice<boolean> => ({ key: 'yes', label: '点头：有恶魔', value: true, lean, reason, truth, ...extra });
  const N = (lean: number, reason: string, truth: boolean, extra: Partial<Choice<boolean>> = {}): Choice<boolean> => ({ key: 'no', label: '摇头：没有恶魔', value: false, lean, reason, truth, ...extra });

  if (!malfunction(s, actorN)) {
    if (yes) return [Y(0, demonIn ? '恶魔就在这两人里。' : `${s.redHerring}号是干扰项，所以也是"有"。`, true, { standard: true })];
    if (rec) return [N(1, '按真实情况：两人都不是恶魔。帮善良。', true), Y(-1, `把陌客（${rec}号）当成恶魔（规则允许），帮邪恶。`, true, { twist: true })];
    return [N(0, '两人都不是恶魔。', true, { standard: true })];
  }
  if (yes) {
    const t = Y(1, '中毒/酒鬼也可以给真答案。帮善良。', true);
    const f = demonIn
      ? N(-1, '假答案：替恶魔打掩护。中毒的标准用法。', false, { standard: true })
      : N(0, '假答案：干扰项不起作用。', false, { standard: true });
    return [t, f];
  }
  return [N(1, '中毒/酒鬼也可以给真答案。帮善良。', true), Y(0, '假答案：冤枉这两人之一。中毒的标准用法。', false, { standard: true })];
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

export function revealChoices(s: GameState, actorN: number, subjectN: number, rng: Rng): Choice<RoleId>[] {
  const sub = seatOf(s, subjectN);
  const r = sub.role;
  const mk = (role: RoleId, lean: number, reason: string, v: Verdict, standard = false): Choice<RoleId> => ({
    key: role, label: `给他看【${roleName(role)}】`, value: role, lean, reason, truth: v !== 'false', twist: v === 'twist', standard,
  });
  const goodFake = () =>
    pickOr(notInPlay(s, 'townsfolk', [...s.bluffs, ...(s.drunkFake ? [s.drunkFake] : [])]), rng) ?? pick(rolesOfTeam('townsfolk'), rng);
  const minionFake = () => pickOr(s.seats.filter((x) => ROLES[x.role].team === 'minion').map((x) => x.role), rng) ?? pick(rolesOfTeam('minion'), rng);

  if (!malfunction(s, actorN)) {
    if (r === 'spy') return [mk('spy', 1, '按真实身份给，帮善良。', 'true'), mk(goodFake(), -1, '把间谍当成善良角色给出去（规则允许），帮邪恶。', 'twist')];
    if (r === 'recluse') return [mk('recluse', 1, '按真实身份给，帮善良。', 'true'), mk(minionFake(), -1, '把陌客当成爪牙给出去（规则允许），帮邪恶。', 'twist')];
    return [mk(r, 0, r === 'drunk' ? '他就是酒鬼，直接给看"酒鬼"。' : '真实角色。', 'true', true)];
  }
  const out = [mk(r, 1, '中毒/酒鬼也可以给真角色。帮善良。', 'true')];
  if (isEvil(sub)) out.push(mk(goodFake(), -1, '假信息：把邪恶玩家说成善良角色，替他洗白。', 'false', true));
  else out.push(mk(minionFake(), 0, '假信息：把好人说成爪牙。中毒的标准用法。', 'false', true));
  return out;
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
    x.alive && x.n !== mayorN && x.role !== 'imp' && x.n !== monk && !(x.role === 'soldier' && !malfunction(s, x.n));
  const good = s.seats.filter((x) => ok(x) && !isEvil(x));
  const minions = s.seats.filter((x) => ok(x) && ROLES[x.role].team === 'minion');
  const out: Choice<number>[] = [
    { key: 'mayor', label: `就让镇长（${mayorN}号）死`, value: mayorN, lean: -1, truth: true, reason: '镇长死了，善良少了一条胜利路线，帮邪恶。' },
  ];
  const g = pickOr(good, rng);
  if (g) out.push({ key: 'good', label: `改成 ${g.n}号（${roleName(g.role)}）替他死`, value: g.n, lean: 1, truth: true, reason: '镇长活下来，好人会更信任他，帮善良。' });
  const m = pickOr(minions, rng);
  if (m) out.push({ key: 'minion', label: `改成 ${m.n}号（${roleName(m.role)}）替他死`, value: m.n, lean: 2, truth: true, reason: '等于帮好人除掉一个爪牙，大帮善良。' });
  return out;
}

export function starpassChoices(s: GameState, impN: number): Choice<number>[] {
  const sw = scarletCanTakeOver(s);
  if (sw) return [{ key: 'sw', label: `${sw.n}号（红唇女郎）`, value: sw.n, lean: 0, truth: true, standard: true, reason: '红唇女郎的能力：存活 ≥ 5 人时由她接任，规则规定。' }];
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
    const base = { key: `m${x.n}`, label: `${x.n}号（${roleName(x.role)}）`, value: x.n, truth: true };
    if (lo === hi) return { ...base, lean: 0, reason: `${why(x)}。几个爪牙差不多，随便选。` };
    if (v(x) === lo) return { ...base, lean: -1, reason: `${why(x)}。新恶魔更安全，帮邪恶。` };
    if (v(x) === hi) return { ...base, lean: 1, reason: `${why(x)}。好人更容易抓到新恶魔，帮善良。` };
    return { ...base, lean: 0, reason: `${why(x)}。` };
  });
}
