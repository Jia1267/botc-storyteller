import { ROLES, isEvilTeam, roleName, type RoleId, type Team } from './roles';
import { SCRIPTS, type ScriptDef } from './editions';
import type { GameState, LogEntry, Seat } from './types';

export const scriptOf = (s: GameState): ScriptDef => SCRIPTS[s.script];
export const seatOf = (s: GameState, n: number): Seat => s.seats[n - 1];
export const teamOf = (r: RoleId): Team => ROLES[r].team;
export const isEvil = (st: Seat) => isEvilTeam(teamOf(st.role));
export const aliveSeats = (s: GameState) => s.seats.filter((x) => x.alive);
export const aliveCount = (s: GameState) => aliveSeats(s).length;
export const findRole = (s: GameState, r: RoleId) => s.seats.find((x) => x.role === r);
export const inPlay = (s: GameState, r: RoleId) => s.seats.some((x) => x.role === r) || s.demonChar === r;

/** 小怪宝在场：没有人扮演恶魔，照看者"是恶魔" */
export const lilMonsta = (s: GameState) => s.demonChar === 'lilmonsta';

/** 这个座位现在算不算恶魔 */
export function isDemonSeat(s: GameState, n: number): boolean {
  if (lilMonsta(s)) return s.babysitter === n;
  return teamOf(seatOf(s, n).role) === 'demon';
}

/** 活着的恶魔（小怪宝时是照看者） */
export function demonSeat(s: GameState): Seat | undefined {
  if (lilMonsta(s)) return s.babysitter ? s.seats.find((x) => x.n === s.babysitter && x.alive) : undefined;
  return s.seats.find((x) => x.alive && teamOf(x.role) === 'demon');
}

export const poisonerAlive = (s: GameState) => s.seats.some((x) => x.alive && x.role === 'poisoner');
const widowAlive = (s: GameState) => s.seats.some((x) => x.alive && x.role === 'widow');

export function isPoisoned(s: GameState, n: number): boolean {
  if (s.poison && s.poison.seat === n && s.poison.night === s.night && poisonerAlive(s)) return true;
  if (s.widowPoison === n && widowAlive(s)) return true;
  if (s.cannibalPoisoned && seatOf(s, n).role === 'cannibal') return true;
  return false;
}

/** 能力失灵：酒鬼，或正在中毒 */
export function malfunction(s: GameState, n: number): boolean {
  return seatOf(s, n).role === 'drunk' || isPoisoned(s, n);
}

/** 涡流活着且没中毒：镇民能力只给假信息 */
export function vortoxActive(s: GameState): boolean {
  const v = s.seats.find((x) => x.alive && x.role === 'vortox');
  return !!v && !isPoisoned(s, v.n);
}

/** 这条信息必须是假的：涡流在场，且这是镇民能力 */
export const mustLie = (s: GameState, ability: RoleId) => vortoxActive(s) && teamOf(ability) === 'townsfolk';

/**
 * 这个人在夜里按某个能力的位置被叫醒吗：
 * 真角色、以为自己是它的酒鬼、食人族/小精灵获得了它
 */
export function wakesAs(s: GameState, st: Seat, r: RoleId): boolean {
  if (st.role === r) return true;
  if (st.role === 'drunk' && s.drunkFake === r) return true;
  return s.gained[st.n] === r;
}

/** 白天能力也算上失忆者被定下的能力 */
export function hasAbility(s: GameState, st: Seat, r: RoleId): boolean {
  return wakesAs(s, st, r) || (st.role === 'amnesiac' && s.amnesiacAbility === r);
}

/** 以某个能力行动的人（第一个） */
export function actorFor(s: GameState, r: RoleId): Seat | undefined {
  return s.seats.find((x) => hasAbility(s, x, r));
}

/** 这个人以为自己是什么 */
export function believedRole(s: GameState, st: Seat): RoleId {
  if (st.role === 'drunk' && s.drunkFake) return s.drunkFake;
  if (st.role === 'lunatic' && s.lunaticFake) return s.lunaticFake;
  return st.role;
}

/** 左右两边最近的存活玩家（不含自己） */
export function aliveNeighbors(s: GameState, n: number): number[] {
  const N = s.count;
  const out: number[] = [];
  for (const dir of [-1, 1]) {
    for (let k = 1; k < N; k++) {
      const m = ((n - 1 + dir * k + N * 2) % N) + 1;
      if (m === n) break;
      if (seatOf(s, m).alive) {
        if (!out.includes(m)) out.push(m);
        break;
      }
    }
  }
  return out;
}

export const seatLabel = (s: GameState, n: number) => `${n}号（${roleName(seatOf(s, n).role)}）`;

export function addLog(s: GameState, phase: LogEntry['phase'], text: string, truth?: boolean) {
  s.log.push({ night: s.night, phase, text, truth: truth === undefined ? undefined : truth ? 'true' : 'false' });
}

export function kill(s: GameState, n: number, when: 'night' | 'day', cause: string) {
  const st = seatOf(s, n);
  if (!st.alive) return;
  st.alive = false;
  st.death = { night: s.night, when, cause };
  if (when === 'night' && s.ns) s.ns.deaths.push(n);
}

/** 本剧本里不在场的角色 */
export function notInPlay(s: GameState, team: Team | Team[], exclude: RoleId[] = []): RoleId[] {
  const teams = Array.isArray(team) ? team : [team];
  return scriptOf(s).roles.filter((r) => teams.includes(ROLES[r].team) && !inPlay(s, r) && !exclude.includes(r));
}

/** 本剧本里某个阵营的全部角色 */
export const scriptRolesOf = (s: GameState, team: Team): RoleId[] => scriptOf(s).roles.filter((r) => ROLES[r].team === team);

export function clone<T>(x: T): T {
  return structuredClone(x);
}
