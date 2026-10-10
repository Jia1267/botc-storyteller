import { ROLES, TRAVELLER_ROLES, roleName, type RoleId } from './roles';
import type { Choice } from './balance';
import { TRAVELLER_BASE, addLog, demonSeat, isEvil, isTraveller, kill, lilMonsta, malfunction, seatName, seatOf } from './core';
import { dayDeath } from './flow';
import type { Rng } from './rng';
import type { GameState, Seat } from './types';

export { TRAVELLER_ROLES };

export const travellers = (s: GameState) => s.seats.filter(isTraveller);
export const activeTravellers = (s: GameState) => travellers(s).filter((x) => !x.left);

/** 旅行者阵营：官方建议大约三分之二善良；按局势推荐 */
export function alignmentChoices(rng: Rng): Choice<'good' | 'evil'>[] {
  const evilStd = rng() < 1 / 3;
  return [
    { key: 'good', label: '善良', value: 'good', lean: 1, truth: true, standard: !evilStd, reason: '官方建议大约三分之二的旅行者是善良的。善良旅行者帮善良。' },
    { key: 'evil', label: '邪恶', value: 'evil', lean: -1, truth: true, standard: evilStd, reason: '邪恶旅行者会得知恶魔是谁，帮邪恶。' },
  ];
}

/** 加入一名旅行者：坐在 after 的顺时针下一位，返回他的座位号（101 起） */
export function addTraveller(s: GameState, role: RoleId, after: number, alignment: 'good' | 'evil'): number {
  const n = TRAVELLER_BASE + travellers(s).length + 1;
  s.seats.push({ n, role, startRole: role, alive: true, traveller: { alignment, after } });
  if (s.phase !== 'setup') addLog(s, s.phase === 'night' ? 'night' : 'day', `${seatName(n)} 作为旅行者加入：【${roleName(role)}】，${alignment === 'good' ? '善良' : '邪恶'}，坐在 ${seatName(after)} 旁边`);
  return n;
}

/** 开局前删掉一个旅行者（座位号重新排） */
export function removeTravellerAtSetup(s: GameState, n: number) {
  s.seats = s.seats.filter((x) => x.n !== n);
  let k = 0;
  const remap: Record<number, number> = {};
  for (const x of s.seats) if (x.traveller) remap[x.n] = TRAVELLER_BASE + ++k;
  for (const x of s.seats) {
    if (!x.traveller) continue;
    if (remap[x.traveller.after]) x.traveller.after = remap[x.traveller.after];
    if (x.traveller.after === n) x.traveller.after = s.count;
    x.n = remap[x.n];
  }
}

/** 邪恶旅行者要得知恶魔是谁 */
export function evilTravellerInfo(s: GameState): string {
  if (lilMonsta(s)) {
    const d = demonSeat(s);
    return d ? `现在照看小怪宝的是 ${seatName(d.n)}（算作恶魔）。` : '小怪宝在场，今晚爪牙们才会选出照看者，到时再告诉他。';
  }
  const d = demonSeat(s);
  return d ? `恶魔是 ${seatName(d.n)}。` : '恶魔已经死了。';
}

/** 放逐需要的票数：全体玩家（活人 + 死人，算旅行者，不算已离场的）的一半，向上取整 */
export function exileThreshold(s: GameState): number {
  return Math.ceil(s.seats.filter((x) => !x.left).length / 2);
}

export function exile(s: GameState, n: number) {
  kill(s, n, 'day', '被放逐');
  addLog(s, 'day', `${seatName(n)}（${roleName(seatOf(s, n).role)}）被放逐`);
}

export function leave(s: GameState, n: number) {
  const x = seatOf(s, n);
  x.left = true;
  if (x.alive) {
    x.alive = false;
    x.death = { night: s.night, when: s.phase === 'night' ? 'night' : 'day', cause: '离场' };
  }
  addLog(s, 'day', `${seatName(n)}（旅行者）离场`);
}

/** 枪手：第一次投票后，选一名投过票的人，他死亡 */
export function gunslingerPreview(s: GameState, gunN: number, target: number): { hits: boolean; text: string } {
  const g = seatOf(s, gunN);
  if (s.gunslingerDay === s.night) return { hits: false, text: '枪手今天已经开过枪了。' };
  if (!g.alive) return { hits: false, text: '枪手已经死了。' };
  if (malfunction(s, gunN)) return { hits: false, text: '枪手中毒了：开枪无效，什么都不会发生。' };
  if (!seatOf(s, target).alive) return { hits: false, text: `${seatName(target)} 已经死了。` };
  return { hits: true, text: `${seatName(target)} 死亡。` };
}

export function gunslingerShoot(s: GameState, gunN: number, target: number) {
  const pv = gunslingerPreview(s, gunN, target);
  s.gunslingerDay = s.night;
  addLog(s, 'day', `枪手（${seatName(gunN)}）向 ${seatName(target)} 开枪`);
  if (pv.hits) dayDeath(s, target, '被枪手射杀');
  else addLog(s, 'day', pv.text);
}

/** 乞丐：死人把票给他，他得知那个死人的阵营（乞丐不会中毒） */
export function beggarLearns(s: GameState, beggarN: number, deadN: number): string {
  const x = seatOf(s, deadN);
  const text = `${seatName(deadN)} 是${isEvil(x) ? '邪恶' : '善良'}的`;
  addLog(s, 'day', `${seatName(deadN)} 把投票标记给了乞丐（${seatName(beggarN)}），乞丐得知：${text}`);
  return text;
}

export const travellerName = (x: Seat) => `${seatName(x.n)}（${ROLES[x.role].name}）`;
