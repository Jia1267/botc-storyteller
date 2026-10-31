// 房间里存什么（Firebase 实时数据库）：
//   rooms/{code}/host            开房设备的身份（只有它能改房间里的东西）
//   rooms/{code}/meta            房间信息：几个座位、标题、阶段（所有人可读）
//   rooms/{code}/seats/{n}       谁坐了 n 号（玩家自己占座、改名、离开）
//   rooms/{code}/priv/{n}/role   n 号自己的角色卡（只有坐 n 号的人能读）
//   rooms/{code}/priv/{n}/msgs   发给 n 号的消息（只有坐 n 号的人能读）
//   rooms/{code}/acks/{n}/{id}   n 号点了"看完了"（只有坐 n 号的人能写，开房设备读）
//   rooms/{code}/acks/{n}/{id}_got  消息到了 n 号手机上（自动写，说书人能看到"已送达"）
import type { CardContent } from '../ui/common';

export interface RoomMeta {
  count: number;
  title: string;
  phase: 'lobby' | 'game' | 'end';
  createdAt: number;
}

export interface SeatInfo {
  uid: string;
  name?: string;
  online?: boolean;
}

export interface RoomMsg {
  id: string;
  card: CardContent;
  sentAt: number;
}

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

/** 按消息发出的先后排：玩家一条一条看 */
export const sortMsgs = (msgs: Record<string, RoomMsg> | null | undefined): RoomMsg[] =>
  Object.values(msgs ?? {}).sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id));
