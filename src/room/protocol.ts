// 房间里存什么（Firebase 实时数据库）：
//   rooms/{code}/host            开房设备的身份（只有它能改房间里的东西）
//   rooms/{code}/meta            房间信息：几个座位、标题、阶段（所有人可读）
//   rooms/{code}/seats/{n}       谁坐了 n 号（玩家自己占座、改名、离开）
//   rooms/{code}/priv/{n}/role   n 号自己的角色卡（只有坐 n 号的人能读）
//   rooms/{code}/priv/{n}/msgs   发给 n 号的消息（只有坐 n 号的人能读）
//   rooms/{code}/acks/{n}/{id}   n 号点了"看完了"（只有坐 n 号的人能写，开房设备读）
//   rooms/{code}/acks/{n}/{id}_got  消息到了 n 号手机上（自动写，说书人能看到"已送达"）
//   rooms/{code}/acks/{n}/{id}_pick 夜里让他选人：他选的座位
import type { CardContent } from '../ui/common';

export interface RoomMeta {
  count: number;
  /** 这局有哪些座位（旅行者是 101、102…）；没有就是 1..count */
  seatNs?: number[];
  title: string;
  phase: 'lobby' | 'game' | 'end';
  createdAt: number;
}

export interface SeatInfo {
  uid: string;
  name?: string;
  online?: boolean;
}

/** 夜里让玩家在手机上选人 */
export interface PickAsk {
  /** 要选几个人 */
  count: number;
  /** 能看到的座位（按座位顺序） */
  seats: number[];
  dead?: number[];
  /** 按规则不能选的（例如僧侣不能选自己） */
  disabled?: number[];
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

export type Acks = Record<string, Record<string, number | number[]>>;

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

/** 他在手机上选的座位（还没选是 undefined） */
export function pickOf(acks: Acks, n: number, id: string): number[] | undefined {
  const v = acks[n]?.[pickKey(id)];
  return Array.isArray(v) ? v.map(Number) : undefined;
}

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

/** 按消息发出的先后排：玩家一条一条看 */
export const sortMsgs = (msgs: Record<string, RoomMsg> | null | undefined): RoomMsg[] =>
  Object.values(msgs ?? {}).sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id));
