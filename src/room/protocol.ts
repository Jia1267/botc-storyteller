// 房间里存什么（Firebase 实时数据库）：
//   rooms/{code}/host            开房设备的身份（只有它能改房间里的东西）
//   rooms/{code}/meta            房间信息：几个座位、标题、阶段（所有人可读）
//   rooms/{code}/seats/{n}       谁坐了 n 号（玩家自己占座、改名、离开）
//   rooms/{code}/priv/{n}/role   n 号自己的角色卡（只有坐 n 号的人能读）
//   rooms/{code}/priv/{n}/msgs   发给 n 号的消息（只有坐 n 号的人能读）
//   rooms/{code}/acks/{n}/{id}   n 号点了"看完了"（只有坐 n 号的人能写，开房设备读）
//   rooms/{code}/acks/{n}/{id}_got  消息到了 n 号手机上（自动写，说书人能看到"已送达"）
//   rooms/{code}/acks/{n}/{id}_pick 夜里让他选人：他选的座位
//   rooms/{code}/acks/{n}/mvp    结束后他投的 MVP（只有开房设备读得到，公开的只有票数）
//   rooms/{code}/meta/end        结束后的复盘（所有人可读）：胜负、每个人的身份、时间线、MVP 票数
//   rooms/{code}/meta/ai         AI 说书人局：白天进行到哪（倒计时、谁提名、投票、谁举手），所有人可读
//   rooms/{code}/acks/{n}/nom|spoke|hand|nomore|slay  AI 局里玩家在手机上的操作（只有开房设备读）
import type { CardContent } from '../ui/common';

export interface RoomMeta {
  count: number;
  /** 这局有哪些座位（旅行者是 101、102…）；没有就是 1..count */
  seatNs?: number[];
  title: string;
  phase: 'lobby' | 'game' | 'end';
  createdAt: number;
  /** 游戏结束后的复盘 */
  end?: EndInfo;
  /** AI 说书人局：公开的进度 */
  ai?: AiPublic;
}

/** AI 说书人局：所有人都能看到的进度（开房的平板写，手机读） */
export interface AiPublic {
  /** 私聊、公聊、每人投票的秒数 */
  settings: { priv: number; pub: number; vote: number };
  stage: 'wait' | 'night' | 'private' | 'public' | 'nominate' | 'speech1' | 'speech2' | 'vote' | 'result';
  day: number;
  /** 倒计时到什么时候（服务器时间，毫秒） */
  until?: number;
  /** 刚念的话（手机上也显示，听不清的人看字） */
  say?: string;
  alive: number[];
  /** 死了、还剩一票的人（数据库会去掉空数组，可能没有这一项） */
  ghost?: number[];
  /** 死人已经用掉那一票的 */
  spent?: number[];
  /** 今天提名过的人、被提名过的人 */
  nominators?: number[];
  nominees?: number[];
  /** 现在这次提名（i = 今天第几次） */
  nom?: { i: number; by: number; target: number };
  /** 投票：顺序、轮到第几个、谁举了手 */
  vote?: { order: number[]; at: number; hands?: Record<string, boolean>; need: number };
  /** 今天点了"不再提名"的人 */
  noMore?: number[];
  /** 今天宣称猎手开过枪的人 */
  shots?: number[];
  /** 今天每次提名的结果 */
  results?: { by: number; target: number; votes: number; text: string }[];
}

/** AI 局里玩家的操作：都写在自己座位下面（acks/{n}/…），只有开房的平板读得到 */
export interface AiActs {
  nom?: { day: number; target: number; at: number };
  spoke?: { day: number; i: number };
  hand?: { day: number; i: number; up: boolean };
  nomore?: number;
  slay?: { day: number; target: number };
}

/** 结束后发到每个人手机上的复盘（都是写好的文字，手机上不用再算） */
export interface EndInfo {
  /** 这一局结束的时间：用来区分是哪一局的投票 */
  at: number;
  winner: 'good' | 'evil';
  reason: string;
  /** 每个座位：角色（变过的写"A → B"）、阵营、死活 */
  seats: { n: number; role: string; evil: boolean; fate: string; note?: string }[];
  moments: { when: string; text: string }[];
  /** 按"开局 / 第N夜 / 第N天"分好组的记录；f = 假信息 */
  log: { title: string; items: { text: string; f?: boolean }[] }[];
  /** MVP 票数：{ 座位: 票数 }；只公开票数，不公开谁投了谁 */
  mvp?: Record<string, number>;
  voters?: number;
}

export interface SeatInfo {
  uid: string;
  name?: string;
  online?: boolean;
}

/** 夜里让玩家在手机上选人（也可以选角色、选是或否） */
export interface PickAsk {
  /** 要选几个人（0 = 不选人） */
  count: number;
  /** 能看到的座位（按座位顺序） */
  seats: number[];
  dead?: number[];
  /** 按规则不能选的（例如僧侣不能选自己） */
  disabled?: number[];
  /** 选人要分先后（例如鹰身女妖：第一个是要疯狂的人） */
  ordered?: boolean;
  /** 还要选的选项（角色、是或否……），选 optCount 个（默认 1） */
  opts?: { id: string; label: string; evil?: boolean }[];
  optCount?: number;
  /** 选项最少选几个（默认和 optCount 一样） */
  optMin?: number;
  /** 要他写一句话（例如巫师的愿望）：输入框里的提示 */
  text?: string;
  /** 可以不选（例如一次性能力今晚不用）：按钮上的字 */
  skip?: string;
}

/** 玩家的回答 */
export interface PickAnswer {
  seats?: number[];
  opts?: string[];
  text?: string;
  /** 点了"不用" */
  skip?: boolean;
}

export interface RoomMsg {
  id: string;
  /** 给他看的卡片；选人时卡片上是角色名和"小声说"的话 */
  card: CardContent;
  ask?: PickAsk;
  sentAt: number;
}

/** 说书人这边一条消息的内容（id 和发出时间由发送时定） */
export type MsgBody = Pick<RoomMsg, 'card' | 'ask'>;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** 房间号：4 个大写字母（去掉容易看混的 I、O） */
export function newRoomCode(rng: () => number = Math.random): string {
  return Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(rng() * CODE_CHARS.length)]).join('');
}

export const isRoomCode = (x: string | null): x is string => !!x && /^[A-Z]{4}$/.test(x);

export const roomPath = (code: string, ...rest: (string | number)[]) => ['rooms', code, ...rest].join('/');

/** 发给玩家的链接：当前网页地址 + ?room=房间号 */
export const roomLink = (code: string, loc: { origin: string; pathname: string } = location) => `${loc.origin}${loc.pathname}?room=${code}`;

export const gotKey = (id: string) => `${id}_got`;
export const pickKey = (id: string) => `${id}_pick`;

/** 夜里的消息 id：第几夜、第几步、发给谁、哪一条。同一步重发用同一个 id（覆盖原来那条） */
export const nightMsgId = (night: number, step: number, n: number, tag: string) => `N${night}-${step}-${n}-${tag}`;
/** "今晚你没有行动" */
export const idleMsgId = (night: number, n: number) => `N${night}-idle-${n}`;
export const isNightMsg = (id: string, night: number) => id.startsWith(`N${night}-`);

export type Acks = Record<string, Record<string, number | number[] | PickAnswer>>;

/** 房间里的座位号 */
export const metaSeats = (m: RoomMeta): number[] => m.seatNs ?? Array.from({ length: m.count }, (_, i) => i + 1);

/** 座位怎么叫：旅行者是"旅1"（和说书人那边的 seatName 一致） */
export const seatLabel = (n: number) => (n > 100 ? `旅${n - 100}` : `${n} 号`);

/** n 号的身份卡现在什么状态：没发 / 已发出 / 已送达 / 已看 */
export function msgStatus(acks: Acks, n: number, id: string | undefined): 'none' | 'sent' | 'got' | 'read' {
  if (!id) return 'none';
  const a = acks[n] ?? {};
  return a[id] ? 'read' : a[gotKey(id)] ? 'got' : 'sent';
}

/** 他在手机上的回答（还没选是 undefined）。数据库会去掉空数组，缺的当成空的 */
export function answerOf(acks: Acks, n: number, id: string): PickAnswer | undefined {
  const v = acks[n]?.[pickKey(id)];
  if (Array.isArray(v)) return { seats: v.map(Number), opts: [] };
  if (v && typeof v === 'object') return { seats: (v.seats ?? []).map(Number), opts: v.opts ?? [], text: v.text, skip: !!v.skip };
  return undefined;
}

/** 他在手机上选的座位（还没选是 undefined） */
export const pickOf = (acks: Acks, n: number, id: string): number[] | undefined => answerOf(acks, n, id)?.seats;

/** 比较两条消息内容是否一样：数据库会去掉空数组、空字段，键的顺序也可能变 */
export function sameBody(a: MsgBody | undefined, b: MsgBody | undefined): boolean {
  return !!a && !!b && stable({ card: a.card, ask: a.ask }) === stable({ card: b.card, ask: b.ask });
}
const stable = (x: unknown): string => {
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`;
  if (x && typeof x === 'object')
    return `{${Object.keys(x)
      .filter((k) => !empty((x as Record<string, unknown>)[k]))
      .sort()
      .map((k) => `${k}:${stable((x as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(x);
};
const empty = (v: unknown) => v === undefined || v === null || (Array.isArray(v) && v.length === 0);

/** 0..1 的随机数，由一串字算出来（同一局同一晚同一人每次算都一样，刷新页面不会变） */
export function hashUnit(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/** 数 MVP 票：每人一票，投自己、投不存在的座位都不算 */
export function tallyMvp(acks: Acks, seatNs: number[]): { mvp: Record<string, number>; voters: number } {
  const mvp: Record<string, number> = {};
  let voters = 0;
  for (const n of seatNs) {
    const v = acks[n]?.mvp;
    if (typeof v !== 'number' || v === n || !seatNs.includes(v)) continue;
    mvp[v] = (mvp[v] ?? 0) + 1;
    voters++;
  }
  return { mvp, voters };
}

/** 按消息发出的先后排：玩家一条一条看 */
export const sortMsgs = (msgs: Record<string, RoomMsg> | null | undefined): RoomMsg[] =>
  Object.values(msgs ?? {}).sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id));
