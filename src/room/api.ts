import { get, onDisconnect, onValue, push, ref, remove, runTransaction, set } from 'firebase/database';
import type { CardContent } from '../ui/common';
import { db, signIn } from './firebase';
import { newRoomCode, roomPath, type RoomMeta, type RoomMsg, type SeatInfo } from './protocol';

export { signIn };

/** 数据库不收 undefined：发出去之前去掉空字段 */
const clean = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** 没权限多半是 Firebase 的数据库规则还没贴好 */
export function roomError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/permission/i.test(msg)) return '没有权限：Firebase 的数据库规则还没设置好（或你不是这个座位/房间的主人）。';
  if (/auth|identity|api-key|operation-not-allowed/i.test(msg)) return '登录失败：Firebase 里的"匿名登录"可能还没启用。';
  return msg;
}

/* ---------------- 开房设备 ---------------- */

export async function createRoom(count: number, title: string): Promise<string> {
  const uid = await signIn();
  for (let i = 0; i < 8; i++) {
    const code = newRoomCode();
    const hostRef = ref(db, roomPath(code, 'host'));
    if ((await get(hostRef)).exists()) continue; // 房间号撞了，换一个
    await set(hostRef, uid);
    const meta: RoomMeta = { count, title, phase: 'lobby', createdAt: Date.now() };
    await set(ref(db, roomPath(code, 'meta')), meta);
    return code;
  }
  throw new Error('开房失败：房间号一直撞车，再试一次');
}

/** 这台设备是不是这个房间的主人（刷新页面后接着用原来的房间） */
export async function ownsRoom(code: string): Promise<boolean> {
  const uid = await signIn();
  return (await get(ref(db, roomPath(code, 'host')))).val() === uid;
}

export const closeRoom = (code: string) => remove(ref(db, roomPath(code)));

export const setPhase = (code: string, phase: RoomMeta['phase']) => set(ref(db, roomPath(code, 'meta', 'phase')), phase);

/** 让某个座位空出来（玩家换了手机、坐错了） */
export async function freeSeat(code: string, n: number) {
  await remove(ref(db, roomPath(code, 'seats', n)));
  await remove(ref(db, roomPath(code, 'priv', n)));
  await remove(ref(db, roomPath(code, 'acks', n)));
}

/** 设定 n 号自己能随时看的角色卡；null 收回 */
export const setRoleCard = (code: string, n: number, card: CardContent | null) => set(ref(db, roomPath(code, 'priv', n, 'role')), card && clean(card));

/** 发一条消息给 n 号，他点"看好了"之前会一直显示 */
export async function sendCard(code: string, n: number, card: CardContent): Promise<RoomMsg> {
  const r = push(ref(db, roomPath(code, 'priv', n, 'msgs')));
  const msg: RoomMsg = { id: r.key!, card: clean(card), sentAt: Date.now() };
  await set(r, msg);
  return msg;
}

/** 玩家看完了：从他的信箱里删掉 */
export const clearMsg = (code: string, n: number, id: string) => remove(ref(db, roomPath(code, 'priv', n, 'msgs', id)));

/** 所有座位的"看好了"：{ 座位: { 消息id: 点的时间 } } */
export const watchAcks = (code: string, cb: (acks: Record<string, Record<string, number>>) => void) =>
  onValue(ref(db, roomPath(code, 'acks')), (s) => cb(s.val() ?? {}));

/* ---------------- 两边都用 ---------------- */

/** 房间信息；房间不存在时回调 null */
export const watchMeta = (code: string, cb: (m: RoomMeta | null) => void, onErr?: (e: Error) => void) =>
  onValue(ref(db, roomPath(code, 'meta')), (s) => cb(s.val()), onErr);

export const watchSeats = (code: string, cb: (seats: Record<string, SeatInfo>) => void, onErr?: (e: Error) => void) =>
  onValue(ref(db, roomPath(code, 'seats')), (s) => cb(s.val() ?? {}), onErr);

/** 这台设备和数据库连着没有（锁屏回来会自动重连） */
export const watchConnected = (cb: (on: boolean) => void) => onValue(ref(db, '.info/connected'), (s) => cb(s.val() === true));

/* ---------------- 玩家手机 ---------------- */

/** 占座：座位空着才坐得上（两个人同时点同一个座位，只有一个人成功） */
export async function claimSeat(code: string, n: number, uid: string, name: string): Promise<boolean> {
  const res = await runTransaction(ref(db, roomPath(code, 'seats', n)), (cur: SeatInfo | null) => {
    if (cur && cur.uid !== uid) return undefined;
    return { uid, name: name.trim().slice(0, 12), online: true };
  });
  return res.committed;
}

export const leaveSeat = async (code: string, n: number) => {
  await onDisconnect(ref(db, roomPath(code, 'seats', n, 'online'))).cancel();
  await remove(ref(db, roomPath(code, 'seats', n)));
};

/** 坐下以后：在线就亮绿点，断线（锁屏、关网页）自动变灰；重连后再亮 */
export function keepOnline(code: string, n: number): () => void {
  const online = ref(db, roomPath(code, 'seats', n, 'online'));
  return watchConnected((on) => {
    if (on) onDisconnect(online).set(false).then(() => set(online, true)).catch(() => {});
  });
}

/** 自己座位上的角色卡和消息 */
export const watchPrivate = (
  code: string,
  n: number,
  cb: (p: { role?: CardContent; msgs?: Record<string, RoomMsg> }) => void,
  onErr?: (e: Error) => void,
) => onValue(ref(db, roomPath(code, 'priv', n)), (s) => cb(s.val() ?? {}), onErr);

export const ackMsg = (code: string, n: number, id: string) => set(ref(db, roomPath(code, 'acks', n, id)), Date.now());
