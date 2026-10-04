import type { RoleId } from './roles';

export interface Seat {
  /** 座位号，从 1 开始，顺时针 */
  n: number;
  role: RoleId;
  /** 开局时的角色（红唇女郎/爪牙变成小恶魔后，复盘要用） */
  startRole: RoleId;
  alive: boolean;
  death?: { night: number; when: 'night' | 'day'; cause: string };
  /** 一次性能力已用（贞洁者、猎手） */
  used?: boolean;
}

export type Phase = 'setup' | 'deal' | 'night' | 'day' | 'end';
export type SetupStep = 'count' | 'roles' | 'seats';

export type SlotId =
  | 'dusk' | 'minionInfo' | 'demonInfo' | 'poisoner' | 'washerwoman' | 'librarian' | 'investigator'
  | 'chef' | 'empath' | 'fortuneteller' | 'butler' | 'spy' | 'monk' | 'scarletwoman' | 'imp'
  | 'ravenkeeper' | 'undertaker' | 'dawn';

export interface NightState {
  /** 当前所在的夜晚顺序位置 */
  slot: number;
  /** 今晚死亡的座位 */
  deaths: number[];
  /** 今晚僧侣的有效保护（僧侣中毒/酒鬼时为 null） */
  monk: number | null;
}

export interface LogEntry {
  night: number;
  phase: 'setup' | 'night' | 'day' | 'end';
  text: string;
  /** 给出去的信息是真是假（复盘时标出来） */
  truth?: 'true' | 'false';
}

export interface GameState {
  v: 1;
  phase: Phase;
  setupStep: SetupStep;
  count: number;
  seats: Seat[];
  /** 酒鬼以为自己是的镇民 */
  drunkFake: RoleId | null;
  /** 恶魔的 3 个伪装 */
  bluffs: RoleId[];
  /** 占卜师干扰项 */
  redHerring: number | null;
  /** 配板强度（标准分，正数偏善良） */
  setupZ: number;
  dealIndex: number;
  /** 当前/最近一夜的编号；第 N 天跟在第 N 夜后面 */
  night: number;
  ns: NightState | null;
  poison: { seat: number; night: number } | null;
  butlerMaster: number | null;
  /** 白天变成恶魔、当晚需要被告知的座位（红唇女郎接任） */
  pendingNewDemon: number | null;
  /** 今天：undefined = 还没定，null = 没人被处决，数字 = 被处决的座位 */
  executed: number | null | undefined;
  /** 最近一次处决死亡（给送葬者） */
  lastExecution: { night: number; seat: number } | null;
  winner: 'good' | 'evil' | null;
  winReason: string;
  /** 真实信息指向某个座位的次数（平衡用） */
  exposure: Record<number, number>;
  infoTrue: number;
  infoFalse: number;
  log: LogEntry[];
  style: 'simple' | 'atmo';
}
