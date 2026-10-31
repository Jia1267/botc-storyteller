// 夜里接到玩家手机上：
// - 要选人的步骤：一进这一步就把"选几个人"发到他手机上，他选的人自动填到这一步（说书人可以改），选完才能下一步；
// - 要给信息的步骤：说书人确认后点「发给 N 号」，他点了"看完了"才能下一步；
// - 今晚没有行动的人：在夜里随机某一步收到"今晚你没有行动"，这样谁也看不出谁有行动。天亮要等所有人都点完。
import { useEffect, useRef, useState } from 'react';
import { demonSeat, seatName, wakesAs } from '../../engine/core';
import { minionSeats, pendingActors, shouldRun, slotsFor } from '../../engine/flow';
import { SLOT_TITLE } from '../../engine/scripts';
import type { GameState, SlotId } from '../../engine/types';
import { hashUnit, idleMsgId, isNightMsg, msgStatus, nightMsgId, pickOf, sameBody, type MsgBody } from '../../room/protocol';
import { BottomBar, ConfirmButton, type CardContent } from '../common';
import { useRoom, type HostRoom } from './hostRoom';

/** 已经接到手机上的步骤（先接暗流涌动；"选一个人"那一类步骤是同一个界面，一起接上） */
export const PHONE_SLOTS: SlotId[] = [
  'dusk', 'minionInfo', 'demonInfo', 'dawn',
  'poisoner', 'washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller', 'butler', 'spy', 'monk', 'scarletwoman', 'imp', 'ravenkeeper', 'undertaker',
  'fearmonger', 'bureaucrat', 'thief', 'devilsadvocate', 'exorcist', 'witch', 'acrobat', 'preacher', 'ogre', 'qutler', 'lycanthrope',
];

/** 房间开着、在游戏中：夜里走手机 */
export const phonesOn = (room: HostRoom) => !!room.code && room.meta?.phase === 'game';
/** 这个座位有人拿手机坐着 */
const phoneOf = (room: HostRoom, n: number) => phonesOn(room) && !!room.seats[n];

export function usePhoneOn(n: number | undefined) {
  const room = useRoom();
  return n !== undefined && phoneOf(room, n);
}

type Status = 'none' | 'changed' | 'sent' | 'got' | 'read';

/** 一条消息的状态；给了内容就顺便看发出去的是不是现在这份（说书人改了信息要重发） */
function statusOf(room: HostRoom, n: number, id: string, body?: MsgBody): Status {
  const m = room.msgs[n]?.[id];
  if (!m) return 'none';
  if (body && !sameBody(m, body)) return 'changed';
  return msgStatus(room.acks, n, id) as Status;
}

/** 自动发的消息：同一条正在发的时候不重复发（开发模式下效果会跑两遍） */
const inflight = new Set<string>();
async function sendOnce(room: HostRoom, n: number, id: string, body: MsgBody) {
  const k = `${room.code}/${n}/${id}`;
  if (inflight.has(k)) return;
  inflight.add(k);
  try {
    await room.send(n, id, body);
  } finally {
    inflight.delete(k);
  }
}

const stepId = (s: GameState, n: number, tag: string) => nightMsgId(s.night, s.ns!.slot, n, tag);
const names = (ns: number[]) => [...new Set(ns)].map(seatName).join('、');

/* ---------------- 让他在手机上选人 ---------------- */

/**
 * 一进这一步就把"选几个人"发到 n 号手机上；他选好了调用 onPick（填到说书人的选人格子里，说书人可以改）。
 * wait：还在等他选（下一步按钮要等）。view：放在选人格子上面的状态条。
 */
export function usePhoneAsk(s: GameState, n: number, o: { count: number; title: string; lines: string[]; disabled?: number[]; off?: boolean }, onPick: (ns: number[]) => void) {
  const room = useRoom();
  const on = !o.off && phoneOf(room, n);
  const id = stepId(s, n, 'pick');
  const [manual, setManual] = useState(false);
  const st = on ? statusOf(room, n, id) : 'none';
  const pick = on ? pickOf(room.acks, n, id) : undefined;
  const body = (): MsgBody => ({
    card: { title: o.title, big: [], lines: o.lines },
    // 今晚刚死的人天亮才公布：选人的格子上不能先标出来
    ask: { count: o.count, seats: s.seats.filter((x) => !x.left).map((x) => x.n), dead: s.seats.filter((x) => !x.alive && !s.ns!.deaths.includes(x.n)).map((x) => x.n), disabled: o.disabled },
  });
  const latest = useRef({ room, body, onPick });
  latest.current = { room, body, onPick };

  useEffect(() => {
    if (on && room.ready && !manual && st === 'none') sendOnce(latest.current.room, n, id, latest.current.body());
  }, [on, room.ready, manual, st, n, id]);

  const pk = pick?.join(',') ?? '';
  useEffect(() => {
    if (pk) latest.current.onPick(pk.split(',').map(Number));
  }, [pk]);

  const who = seatName(n);
  const text = pick
    ? `${who} 在手机上选了 ${pick.map(seatName).join('、')}（已填到下面，可以改）`
    : manual
      ? `已从 ${who} 手机上收回，你直接在下面点`
      : st === 'got'
        ? `已发到 ${who} 手机上，等他选…`
        : st === 'sent'
          ? `已发出，还没到 ${who} 手机上（他可能锁屏了）`
          : `正在发到 ${who} 手机上…`;
  const view = on && (
    <div className={`card stack${pick ? '' : ' card-warn'}`} style={{ gap: 6 }}>
      <p>{text}</p>
      {!pick && !manual && (
        <div className="row" style={{ gap: 8 }}>
          {(st === 'sent' || st === 'got') && (
            <button className="btn btn-ghost btn-sm" onClick={() => room.send(n, id, body())}>
              重发
            </button>
          )}
          <ConfirmButton
            className="btn btn-ghost btn-sm"
            label="不等了，我来点"
            confirmLabel="再点一次：从他手机上收回"
            onConfirm={() => {
              setManual(true);
              room.unsend(n, id);
            }}
          />
        </div>
      )}
    </div>
  );
  return { on, view, wait: on && !pick && !manual ? `等 ${who} 在手机上选` : null };
}

/* ---------------- 发信息给他 ---------------- */

export interface PhoneItem {
  n: number;
  /** 同一步给同一个人发几条时区分（按字母顺序给他看） */
  tag: string;
  body: MsgBody;
  /** 顺便把他手机上"看我的角色"换成这张 */
  role?: CardContent;
}

export function usePhoneSend(s: GameState, items: PhoneItem[]) {
  const room = useRoom();
  const on = items.length > 0 && items.every((x) => phoneOf(room, x.n));
  const xs = on ? items.map((x) => ({ ...x, id: stepId(s, x.n, x.tag) })) : [];
  const sts = xs.map((x) => statusOf(room, x.n, x.id, x.body));
  const unsent = xs.filter((_, i) => sts[i] === 'none' || sts[i] === 'changed');
  const unread = xs.filter((_, i) => sts[i] !== 'read');
  const [busy, setBusy] = useState(false);
  return {
    on,
    changed: sts.includes('changed'),
    unsent: unsent.map((x) => x.n),
    unread: unread.map((x) => x.n),
    /** 还没送达的（手机锁屏或断网） */
    away: xs.filter((_, i) => sts[i] === 'sent').map((x) => x.n),
    busy,
    sendAll: async () => {
      setBusy(true);
      // 一条一条发：同一个人收到的顺序就是发出的顺序
      for (const x of unsent) {
        await room.send(x.n, x.id, x.body);
        if (x.role) await room.setRole(x.n, x.role);
      }
      setBusy(false);
    },
    resend: async () => {
      for (const x of unread) await room.send(x.n, x.id, x.body);
    },
  };
}

export type PhoneSend = ReturnType<typeof usePhoneSend>;

/**
 * 手机步骤的底部按钮：先等他选 → 发给他 → 等他看完 → 完成，下一步。
 * ready=false 时（还没定下来给什么）按钮显示 doneLabel 但点不了。
 */
export function PhoneBar({ send, wait, ready = true, doneLabel = '完成，下一步', onDone }: { send?: PhoneSend; wait?: string | null; ready?: boolean; doneLabel?: string; onDone: () => void }) {
  const btn = (label: string, onClick?: () => void, disabled = !onClick) => (
    <button className="btn btn-primary btn-block" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
  return (
    <BottomBar wide>
      {wait
        ? btn(wait)
        : !ready
          ? btn(doneLabel)
          : send?.on && send.unsent.length
            ? btn(`${send.changed ? '改了：重新发给' : '发给'} ${names(send.unsent)}`, send.sendAll, send.busy)
            : send?.on && send.unread.length
              ? btn(`等 ${names(send.unread)} 看完${send.away.length ? `（${names(send.away)} 还没收到）` : ''}`)
              : btn(doneLabel, onDone)}
      {send?.on && !send.unsent.length && send.unread.length > 0 && (
        <button className="btn btn-ghost" onClick={send.resend}>
          重发
        </button>
      )}
    </BottomBar>
  );
}

/* ---------------- 今晚没有行动 ---------------- */

/** 今晚从第 from 步起，n 号还可能被叫醒吗（爪牙互认、恶魔得知、守鸦人被杀……） */
function mayWakeFrom(s: GameState, n: number, from: number): boolean {
  const order = slotsFor(s);
  for (let j = Math.max(from, 0); j < order.length; j++) if (wakers(s, order[j]).includes(n)) return true;
  return false;
}

function wakers(s: GameState, slot: SlotId): number[] {
  if (slot === 'dusk' || slot === 'dawn') return [];
  if (slot === 'minionInfo' || slot === 'lilmonsta') return shouldRun(s, slot) ? minionSeats(s).filter((x) => x.alive).map((x) => x.n) : [];
  if (slot === 'demonInfo') return shouldRun(s, slot) ? [demonSeat(s)?.n ?? 0] : [];
  // 守鸦人今晚被杀才醒：恶魔行动前不知道他会不会醒
  if (slot === 'ravenkeeper') return s.seats.filter((x) => (x.alive || s.ns!.deaths.includes(x.n)) && wakesAs(s, x, 'ravenkeeper')).map((x) => x.n);
  return shouldRun(s, slot) ? pendingActors(s, slot).map((x) => x.n) : [];
}

const hasNightMsg = (room: HostRoom, s: GameState, n: number) => Object.keys(room.msgs[n] ?? {}).some((id) => isNightMsg(id, s.night));

/** 今晚还有谁没点完（天亮前要等他们） */
export function useNightUnread(s: GameState): number[] | null {
  const room = useRoom();
  if (!phonesOn(room)) return null;
  return s.seats
    .filter((x) => !x.left && room.seats[x.n])
    .map((x) => x.n)
    .filter((n) => {
      const ids = Object.keys(room.msgs[n] ?? {}).filter((id) => isNightMsg(id, s.night));
      // 还没收到任何东西、也没被当面叫醒过的：马上会收到"今晚你没有行动"
      if (!ids.length) return !s.ns!.woke.includes(n);
      return ids.some((id) => !room.acks[n]?.[id]);
    });
}

/**
 * 夜里一直挂着：
 * - 走到某人随机分到的那一步、并且他今晚已经不可能被叫醒了，就发"今晚你没有行动"；天亮时还没收到任何东西的人全部补发；
 * - 前面步骤里没选完就被跳过的选人请求，从手机上收回。
 */
export function NightPhones({ s }: { s: GameState }) {
  const room = useRoom();
  const live = phonesOn(room) && room.ready;
  const cur = s.ns!.slot;
  const latest = useRef(room);
  latest.current = room;
  useEffect(() => {
    if (!live) return;
    const r = latest.current;
    const order = slotsFor(s);
    for (const [k, box] of Object.entries(r.msgs))
      for (const id of Object.keys(box)) {
        const m = /^N(\d+)-(\d+)-\d+-pick$/.exec(id);
        if (m && Number(m[1]) === s.night && Number(m[2]) < cur && !r.acks[k]?.[id]) r.unsend(Number(k), id);
      }
    const dawn = order[cur] === 'dawn';
    // 今晚走过的和还要走的步骤（不算入夜、天亮），每人随机分到其中一步
    const ran = s.ns!.ran ?? [];
    const steps = order.map((sl, i) => ({ sl, i })).filter(({ sl, i }) => sl !== 'dusk' && sl !== 'dawn' && (i < cur ? ran.includes(i) : shouldRun(s, sl))).map(({ i }) => i);
    const game = s.seats.map((x) => x.startRole).join();
    for (const x of s.seats) {
      const n = x.n;
      if (x.left || !r.seats[n] || hasNightMsg(r, s, n) || s.ns!.woke.includes(n)) continue;
      if (!dawn) {
        const at = steps.length ? steps[Math.floor(hashUnit(`${r.code}|${s.night}|${n}|${game}`) * steps.length)] : cur;
        if (cur < at || mayWakeFrom(s, n, cur)) continue;
      }
      sendOnce(r, n, idleMsgId(s.night, n), { card: { title: `第 ${s.night} 夜`, big: ['今晚你没有行动'] } });
    }
  }, [live, s, cur, room.msgs, room.acks, room.seats]);
  return null;
}

/** 这一步还没接到手机上（其他剧本的角色）：提醒说书人照旧当面处理 */
export function PhoneMissing({ slot, actor }: { slot: SlotId; actor?: number }) {
  const room = useRoom();
  if (!phonesOn(room) || PHONE_SLOTS.includes(slot) || actor === undefined) return null;
  return (
    <p className="card card-warn">
      {SLOT_TITLE[slot]}这一步还没接到手机上：照旧用你自己的屏幕给 {seatName(actor)} 看（把他叫到一边）。
    </p>
  );
}
