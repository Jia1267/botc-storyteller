import type { FabledId, RoleId, Team } from './roles';
import type { ScriptId } from './editions';

export interface Seat {
  /** 座位号，从 1 开始，顺时针 */
  n: number;
  role: RoleId;
  /** 开局时的角色（红唇女郎/爪牙变成恶魔后，复盘要用） */
  startRole: RoleId;
  alive: boolean;
  death?: { night: number; when: 'night' | 'day'; cause: string };
  /** 一次性能力已用（贞洁者、猎手、艺术家、渔夫） */
  used?: boolean;
}

export type Phase = 'setup' | 'deal' | 'night' | 'day' | 'end';
export type SetupStep = 'script' | 'count' | 'roles' | 'seats';

export type SlotId =
  | 'dusk' | 'minionInfo' | 'demonInfo' | 'poisoner' | 'washerwoman' | 'librarian' | 'investigator'
  | 'chef' | 'empath' | 'fortuneteller' | 'butler' | 'spy' | 'monk' | 'scarletwoman' | 'imp'
  | 'ravenkeeper' | 'undertaker' | 'dawn'
  | 'lunatic' | 'lilmonsta' | 'widow' | 'fearmonger' | 'pixie' | 'chambermaid' | 'vortox'
  | 'duchess' | 'amnesiac' | 'balloonist';

export interface NightState {
  /** 当前所在的夜晚顺序位置 */
  slot: number;
  /** 当前这一步里已经处理完的人（同一个能力可能有两个人，例如食人族） */
  doneActors: number[];
  /** 今晚死亡的座位 */
  deaths: number[];
  /** 今晚僧侣的有效保护（僧侣中毒/酒鬼时为 null） */
  monk: number | null;
  /** 今晚因为自己的能力醒来过的座位（侍女用） */
  woke: number[];
  /** 疯子今晚选的人 */
  lunaticPick: number | null;
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
  script: ScriptId;
  phase: Phase;
  setupStep: SetupStep;
  count: number;
  seats: Seat[];
  /** 在场的恶魔角色（小怪宝时没有座位扮演它） */
  demonChar: RoleId | null;
  /** 启用的传奇角色 */
  fabled: FabledId[];
  /** 哨兵：外来者 -1 / 0 / +1 */
  sentinelDelta: number;
  /** 酒鬼以为自己是的镇民 */
  drunkFake: RoleId | null;
  /** 疯子以为自己是的恶魔 */
  lunaticFake: RoleId | null;
  /** 失忆者被偷偷定下的能力 */
  amnesiacAbility: RoleId | null;
  /** 中途获得的能力：食人族吃到的、小精灵疯狂成功后得到的 */
  gained: Record<number, RoleId>;
  /** 食人族吃到邪恶而中毒，直到善良被处决死亡 */
  cannibalPoisoned: boolean;
  /** 小精灵第一晚看到的镇民 */
  pixieRole: RoleId | null;
  pixieResolved: boolean;
  /** 寡妇下的毒（寡妇活着一直有效） */
  widowPoison: number | null;
  widowInformed: number | null;
  /** 恐惧之灵的目标；换了新目标天亮要宣布 */
  fearTarget: number | null;
  fearAnnounce: boolean;
  /** 小怪宝的照看者 */
  babysitter: number | null;
  /** 红唇女郎接手照看，今晚爪牙不能改 */
  babysitterLocked: boolean;
  /** 气球驾驶员已经得知过的类型 */
  balloonShown: Team[];
  klutzResolved: boolean;
  /** 博学者最近一次来访是第几天 */
  savantDay: number;
  /** 公爵夫人今天的拜访者 */
  duchessVisitors: number[];
  /** 被处决的善良玩家数（利维坦） */
  goodExecutions: number;
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
  /** 最近一次处决死亡（给送葬者、食人族） */
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
