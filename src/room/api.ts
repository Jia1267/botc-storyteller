import { get, onDisconnect, onValue, push, ref, remove, runTransaction, set } from 'firebase/database';
import type { CardContent } from '../ui/common';
import { db, signIn } from './firebase';
import { gotKey, newRoomCode, pickKey, roomPath, type Acks, type AiActs, type AiPublic, type EndInfo, type MsgBody, type PickAnswer, type RoomMeta, type RoomMsg, type SeatInfo } from './protocol';

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

export async function createRoom(seatNs: number[], title: string): Promise<string> {
  const uid = await signIn();
  for (let i = 0; i < 8; i++) {
    const code = newRoomCode();
    const hostRef = ref(db, roomPath(code, 'host'));
    if ((await get(hostRef)).exists()) continue; // 房间号撞了，换一个
    await set(hostRef, uid);
    const meta: RoomMeta = { count: seatNs.length, seatNs, title, phase: 'lobby', createdAt: Date.now() };
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

/** 人数、旅行者变了：座位跟着变 */
export const setSeats = (code: string, seatNs: number[], title: string) =>
  Promise.all([
    set(ref(db, roomPath(code, 'meta', 'seatNs')), seatNs),
    set(ref(db, roomPath(code, 'meta', 'count')), seatNs.length),
    set(ref(db, roomPath(code, 'meta', 'title')), title),
  ]);

/** 新开一局：收回所有人的角色和没看的消息、上一局的复盘和 MVP 投票（座位保留） */
export async function clearPrivate(code: string) {
  await remove(ref(db, roomPath(code, 'priv')));
  await remove(ref(db, roomPath(code, 'acks')));
  await remove(ref(db, roomPath(code, 'meta', 'end')));
  await remove(ref(db, roomPath(code, 'meta', 'ai')));
}

/** AI 局：更新公开的进度 */
export const setAi = (code: string, ai: AiPublic) => set(ref(db, roomPath(code, 'meta', 'ai')), clean(ai));

/** 游戏结束：把复盘公开给所有人 */
export const setEnd = (code: string, end: EndInfo) => set(ref(db, roomPath(code, 'meta', 'end')), clean(end));

/** 更新公开的 MVP 票数 */
export const setMvp = (code: string, mvp: Record<string, number>, voters: number) =>
  Promise.all([set(ref(db, roomPath(code, 'meta', 'end', 'mvp')), mvp), set(ref(db, roomPath(code, 'meta', 'end', 'voters')), voters)]);

/** 发身份：每个人的角色卡放到他手机上（随时能看），同时弹一条"你的角色"等他点看完了。返回每个座位那条消息的 id */
export async function dealRoles(code: string, cards: Record<number, CardContent>): Promise<Record<number, string>> {
  const ids: Record<number, string> = {};
  await Promise.all(
    Object.entries(cards).map(async ([k, card]) => {
      const n = Number(k);
      await remove(ref(db, roomPath(code, 'priv', n, 'msgs')));
      await setRoleCard(code, n, card);
      ids[n] = (await sendCard(code, n, { ...card, title: '你的角色' })).id;
    }),
  );
  return ids;
}

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

/** 夜里的消息：用固定的 id 发（同一步重发就覆盖原来那条，并清掉他原来的"已看"和选择） */
export async function sendMsg(code: string, n: number, id: string, body: MsgBody, fix = false) {
  await Promise.all([id, gotKey(id), pickKey(id)].map((k) => remove(ref(db, roomPath(code, 'acks', n, k)))));
  const msg: RoomMsg = { id, ...clean(body), sentAt: Date.now(), ...(fix ? { fix: true } : {}) };
  await set(ref(db, roomPath(code, 'priv', n, 'msgs', id)), msg);
}

/** 收回一条消息（例如说书人没等他选就往下走了） */
export const clearMsg = (code: string, n: number, id: string) => remove(ref(db, roomPath(code, 'priv', n, 'msgs', id)));

/** 所有座位的"看好了"：{ 座位: { 消息id: 点的时间 } } */
export const watchAcks = (code: string, cb: (acks: Acks) => void) => onValue(ref(db, roomPath(code, 'acks')), (s) => cb(s.val() ?? {}));

/** 所有座位信箱里的消息：{ 座位: { 消息id: 消息 } }；以及哪些座位手机上有角色卡 */
export const watchMsgs = (code: string, cb: (msgs: Record<string, Record<string, RoomMsg>>, hasRole: Record<string, boolean>) => void) =>
  onValue(ref(db, roomPath(code, 'priv')), (s) => {
    const all: Record<string, { msgs?: Record<string, RoomMsg>; role?: unknown }> = s.val() ?? {};
    cb(Object.fromEntries(Object.entries(all).map(([n, p]) => [n, p.msgs ?? {}])), Object.fromEntries(Object.entries(all).map(([n, p]) => [n, !!p.role])));
  });

/* ---------------- 两边都用 ---------------- */

/** 房间信息；房间不存在时回调 null */
export const watchMeta = (code: string, cb: (m: RoomMeta | null) => void, onErr?: (e: Error) => void) =>
  onValue(ref(db, roomPath(code, 'meta')), (s) => cb(s.val()), onErr);

export const watchSeats = (code: string, cb: (seats: Record<string, SeatInfo>) => void, onErr?: (e: Error) => void) =>
  onValue(ref(db, roomPath(code, 'seats')), (s) => cb(s.val() ?? {}), onErr);

/** 本机时钟和服务器差多少毫秒（倒计时大家按服务器时间算，手机时间不准也不怕） */
export const watchOffset = (cb: (ms: number) => void) => onValue(ref(db, '.info/serverTimeOffset'), (s) => cb(Number(s.val()) || 0));

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

/** AI 局：玩家在手机上提名、发言结束、举手、不再提名、开枪 */
export const aiAct = <K extends keyof AiActs>(code: string, n: number, key: K, value: AiActs[K]) => set(ref(db, roomPath(code, 'acks', n, key)), value);

/** 投 MVP（可以改票；只有开房设备读得到） */
export const voteMvp = (code: string, n: number, target: number) => set(ref(db, roomPath(code, 'acks', n, 'mvp')), target);

/** 夜里选好了：先写回答，再写"看完了" */
export async function answerPick(code: string, n: number, id: string, ans: PickAnswer) {
  await set(ref(db, roomPath(code, 'acks', n, pickKey(id))), clean(ans));
  await ackMsg(code, n, id);
}

/** 消息到手机上了（还没看）：让说书人知道已送达 */
export const gotMsg = (code: string, n: number, id: string) => set(ref(db, roomPath(code, 'acks', n, gotKey(id))), Date.now());
