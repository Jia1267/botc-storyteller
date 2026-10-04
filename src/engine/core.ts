import { ROLES, isEvilTeam, roleName, type RoleId, type Team } from './roles';
import type { GameState, LogEntry, Seat } from './types';

export const seatOf = (s: GameState, n: number): Seat => s.seats[n - 1];
export const teamOf = (r: RoleId): Team => ROLES[r].team;
export const isEvil = (st: Seat) => isEvilTeam(teamOf(st.role));
export const aliveSeats = (s: GameState) => s.seats.filter((x) => x.alive);
export const aliveCount = (s: GameState) => aliveSeats(s).length;
export const findRole = (s: GameState, r: RoleId) => s.seats.find((x) => x.role === r);
export const inPlay = (s: GameState, r: RoleId) => s.seats.some((x) => x.role === r);
export const demonSeat = (s: GameState) => s.seats.find((x) => x.role === 'imp' && x.alive);

export const poisonerAlive = (s: GameState) => s.seats.some((x) => x.alive && x.role === 'poisoner');

export function isPoisoned(s: GameState, n: number): boolean {
  return !!s.poison && s.poison.seat === n && s.poison.night === s.night && poisonerAlive(s);
}

/** 能力失灵：酒鬼，或正在中毒 */
export function malfunction(s: GameState, n: number): boolean {
  return seatOf(s, n).role === 'drunk' || isPoisoned(s, n);
}

/** 以某个角色身份行动的人：真角色，或以为自己是它的酒鬼 */
export function actorFor(s: GameState, r: RoleId): Seat | undefined {
  const real = findRole(s, r);
  if (real) return real;
  if (s.drunkFake === r) return findRole(s, 'drunk');
  return undefined;
}

/** 这个人以为自己是什么 */
export function believedRole(s: GameState, st: Seat): RoleId {
  return st.role === 'drunk' && s.drunkFake ? s.drunkFake : st.role;
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

/** 在场但不在 exclude 里的角色 */
export function notInPlay(s: GameState, team: Team | Team[], exclude: RoleId[] = []): RoleId[] {
  const teams = Array.isArray(team) ? team : [team];
  return (Object.keys(ROLES) as RoleId[]).filter(
    (r) => teams.includes(ROLES[r].team) && !inPlay(s, r) && !exclude.includes(r),
  );
}

export function clone<T>(x: T): T {
  return structuredClone(x);
}
