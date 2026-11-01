// 夜里接到玩家手机上：
// - 要选人的步骤：一进这一步就把"选几个人"（或选角色、是否、写一句话）发到他手机上，他选的人自动填到这一步（说书人可以改），选完才能下一步；
// - 要给信息的步骤：说书人确认后点「发给 N 号」，他点了"看完了"才能下一步；
// - 今晚没有行动的人：在夜里随机某一步收到"今晚你没有行动"，这样谁也看不出谁有行动。天亮要等所有人都点完。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { demonSeat, seatName, teamOf, wakesAs } from '../../engine/core';
import { currentSlot, minionSeats, pendingActors, shouldRun, slotActor, slotsFor } from '../../engine/flow';
import type { GameState, SlotId } from '../../engine/types';
import { answerOf, hashUnit, idleMsgId, isNightMsg, msgStatus, nightMsgId, sameBody, type MsgBody, type PickAnswer, type PickAsk } from '../../room/protocol';
import { BottomBar, ConfirmButton, type CardContent } from '../common';
import { useRoom, type HostRoom } from './hostRoom';

/** 房间开着、在游戏中：夜里走手机 */
export const phonesOn = (room: HostRoom) => !!room.code && room.meta?.phase === 'game';
/** 这个座位有人拿手机坐着 */
const phoneOf = (room: HostRoom, n: number) => phonesOn(room) && !!room.seats[n] && !room.offline.includes(n);

/** 说书人改成当面处理时，告诉他的手机一声（不算夜里要点完的消息，不挡天亮） */
const inPersonNote = (s: GameState, n: number): [string, MsgBody] => [
  `H${s.night}-${s.ns!.slot}-${n}`,
  { card: { title: '这一步说书人会当面处理', big: [], lines: ['你不用在手机上操作了，看说书人。'] } },
];

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

export interface AskOpts extends Pick<PickAsk, 'count' | 'disabled' | 'ordered' | 'opts' | 'optCount' | 'optMin' | 'text' | 'skip'> {
  title: string;
  lines: string[];
  /** 卡片上附带的一段说明（例如他现在拥有什么能力） */
  ability?: string;
  /** 卡片上附带的魔典（寡妇先看魔典再选人） */
  rows?: string[];
  /** 这一步不问他（例如送葬者不用选人） */
  off?: boolean;
  /** 同一步问他第二件事时区分 */
  tag?: string;
}

/** 他的回答念给说书人听：选了谁、选了什么、还是不用 */
const answerText = (o: AskOpts, a: PickAnswer) =>
  a.skip
    ? `点了"${o.skip ?? '不用'}"`
    : `选了 ${[...(a.seats ?? []).map(seatName), ...(a.opts ?? []).map((id) => o.opts?.find((x) => x.id === id)?.label ?? id), ...(a.text ? [`"${a.text}"`] : [])].join('、')}`;

/**
 * 一进这一步就把"选几个人"（或选角色、是否）发到 n 号手机上；他选好了调用 onPick（填到说书人这一步，说书人可以改）。
 * wait：还在等他选（下一步按钮要等）。view：放在选人格子上面的状态条。
 */
export function usePhoneAsk(s: GameState, n: number, o: AskOpts, onPick: (seats: number[], ans: PickAnswer) => void) {
  const room = useRoom();
  const on = !o.off && phoneOf(room, n);
  const id = stepId(s, n, o.tag ?? 'pick');
  const st = on ? statusOf(room, n, id) : 'none';
  const pick = on ? answerOf(room.acks, n, id) : undefined;
  const body = (): MsgBody => ({
    card: { title: o.title, big: [], lines: o.lines, ability: o.ability, rows: o.rows },
    ask: {
      count: o.count,
      seats: s.seats.filter((x) => !x.left).map((x) => x.n),
      // 今晚刚死的人天亮才公布：选人的格子上不能先标出来
      dead: s.seats.filter((x) => !x.alive && !s.ns!.deaths.includes(x.n)).map((x) => x.n),
      // 同理：不能因为今晚刚死的人选不了，就让他猜到谁死了
      disabled: o.disabled?.filter((n) => !s.ns!.deaths.includes(n)),
      ordered: o.ordered,
      opts: o.opts,
      optCount: o.optCount,
      optMin: o.optMin,
      text: o.text,
      skip: o.skip,
    },
  });
  const latest = useRef({ room, body, onPick });
  latest.current = { room, body, onPick };

  useEffect(() => {
    if (on && room.ready && st === 'none') sendOnce(latest.current.room, n, id, latest.current.body());
  }, [on, room.ready, st, n, id]);

  const pk = pick ? JSON.stringify(pick) : '';
  useEffect(() => {
    if (!pk) return;
    const a: PickAnswer = JSON.parse(pk);
    latest.current.onPick(a.seats ?? [], a);
  }, [pk]);

  const who = seatName(n);
  const text = pick
    ? `${who} 在手机上${answerText(o, pick)}（已填到下面，可以改）`
    : st === 'got'
        ? `已发到 ${who} 手机上，等他选…`
        : st === 'sent'
          ? `已发出，还没到 ${who} 手机上（他可能锁屏了）`
          : `正在发到 ${who} 手机上…`;
  const view = on && (
    <div className={`card stack${pick ? '' : ' card-warn'}`} style={{ gap: 6 }}>
      <p>{text}</p>
      {!pick && (
        <div className="row" style={{ gap: 8 }}>
          {(st === 'sent' || st === 'got') && (
            <button className="btn btn-ghost btn-sm" onClick={() => room.send(n, id, body())}>
              重发
            </button>
          )}
          <ConfirmButton
            className="btn btn-ghost btn-sm"
            label="不等了，这一步当面处理"
            confirmLabel="再点一次：从他手机上收回"
            onConfirm={() => {
              room.unsend(n, id);
              room.send(n, ...inPersonNote(s, n));
              room.setOffline([...room.offline, n]);
            }}
          />
        </div>
      )}
    </div>
  );
  return { on, view, ans: pick, wait: on && !pick ? `等 ${who} 在手机上选` : null };
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
      // 一条一条发：同一个人收到的顺序就是发出的顺序；他看过旧的、现在改了，手机上标"以这条为准"
      for (const x of unsent) {
        await room.send(x.n, x.id, x.body, !!room.acks[x.n]?.[x.id]);
        if (x.role) await room.setRole(x.n, x.role);
      }
      setBusy(false);
    },
    resend: async () => {
      for (const x of unread) await room.send(x.n, x.id, x.body);
    },
    /** 他手机不行：收回没看的，这一步改成当面给他看 */
    inPerson: () => {
      for (const x of unread) {
        room.unsend(x.n, x.id);
        room.send(x.n, ...inPersonNote(s, x.n));
      }
      room.setOffline([...room.offline, ...unread.map((x) => x.n)]);
    },
  };
}

export type PhoneSend = ReturnType<typeof usePhoneSend>;

/** 发给 n 号的一张卡（附带"小声说"的话） */
export const infoTo = (n: number, card: CardContent, lines?: string[], tag = 'info', role?: CardContent): PhoneItem => ({
  n,
  tag,
  body: { card: lines?.length ? { ...card, lines } : card },
  role,
});

/**
 * 步骤底部的主按钮：手机模式走 PhoneBar（等他选 → 发给他 → 等他看完 → 完成）；
 * 当面模式照旧，children 放"给他看"之类的按钮。
 */
export function StepBar({ phone, send, wait, ready = true, label = '完成，下一步', onDone, children }: {
  phone: boolean;
  send?: PhoneSend;
  wait?: string | null;
  ready?: boolean;
  label?: string;
  onDone: () => void;
  children?: ReactNode;
}) {
  if (phone) return <PhoneBar send={send} wait={wait} ready={ready} doneLabel={label} onDone={onDone} />;
  return (
    <BottomBar wide>
      {children}
      <button className="btn btn-primary grow" disabled={!ready || !!wait} onClick={onDone}>
        {wait ?? label}
      </button>
    </BottomBar>
  );
}

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
        <>
          <button className="btn btn-ghost" onClick={send.resend}>
            重发
          </button>
          <ConfirmButton className="btn btn-ghost" label="他手机不行" confirmLabel="再点一次：改成当面给他看" onConfirm={send.inPerson} />
        </>
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
  if (slot === 'demonInfo') {
    if (!shouldRun(s, slot)) return [];
    const legion = s.seats.filter((x) => x.role === 'legion').map((x) => x.n);
    return legion.length ? legion : [demonSeat(s)?.n ?? 0];
  }
  // 一次叫醒好几个人的步骤
  if (!shouldRun(s, slot)) return slot === 'ravenkeeper' ? ravens(s) : [];
  const evil = s.seats.filter((x) => x.alive && (teamOf(x.role) === 'minion' || teamOf(x.role) === 'demon')).map((x) => x.n);
  if (slot === 'duchess') return s.duchessVisitors;
  // 哈迪寂亚可能选中任何人（死人也行）：这一步过了才发"今晚你没有行动"
  if (slot === 'alhadikhia') return s.seats.filter((x) => !x.left).map((x) => x.n);
  if (slot === 'damsel' || slot === 'snitch' || slot === 'riot') return minionSeats(s).filter((x) => x.alive).map((x) => x.n);
  if (slot === 'poppygrower' || slot === 'hatter') return evil;
  if (slot === 'eviltwin') return [...pendingActors(s, slot).map((x) => x.n), ...(s.twin ? [s.twin] : [])];
  if (slot === 'boffin' || slot === 'king' || slot === 'marionette') return [...pendingActors(s, slot).map((x) => x.n), demonSeat(s)?.n ?? 0];
  return pendingActors(s, slot).map((x) => x.n);
}

/** 守鸦人今晚被杀才醒：恶魔行动前不知道他会不会醒 */
const ravens = (s: GameState) => s.seats.filter((x) => (x.alive || s.ns!.deaths.includes(x.n)) && wakesAs(s, x, 'ravenkeeper')).map((x) => x.n);

const hasNightMsg = (room: Pick<HostRoom, 'msgs'>, s: GameState, n: number) => Object.keys(room.msgs[n] ?? {}).some((id) => isNightMsg(id, s.night));

/** 今晚还有谁没点完（天亮前要等他们） */
export function useNightUnread(s: GameState): number[] | null {
  const room = useRoom();
  return phonesOn(room) ? nightUnread(s, room) : null;
}

/** 今晚还有谁没点完（不用 React，AI 说书人和测试也用） */
export function nightUnread(s: GameState, room: Pick<HostRoom, 'seats' | 'msgs' | 'acks'>): number[] {
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
  const step = `${s.night}-${cur}-${slotActor(s, currentSlot(s))?.n ?? ''}`;
  useEffect(() => {
    if (latest.current.offline.length) latest.current.setOffline([]);
  }, [step]);
  useEffect(() => {
    if (!live) return;
    const r = latest.current;
    for (const [n, id] of stalePicks(s, r)) r.unsend(n, id);
    for (const n of idleDue(s, r)) sendOnce(r, n, idleMsgId(s.night, n), IDLE_BODY(s));
  }, [live, s, cur, room.msgs, room.acks, room.seats]);
  return null;
}

export const IDLE_BODY = (s: GameState): MsgBody => ({ card: { title: `第 ${s.night} 夜：今晚你`, big: ['没有行动'] } });

/** 前面步骤里没选完就被跳过的选人请求：[座位, 消息 id] */
export function stalePicks(s: GameState, r: Pick<HostRoom, 'msgs' | 'acks'>): [number, string][] {
  const out: [number, string][] = [];
  for (const [k, box] of Object.entries(r.msgs))
    for (const id of Object.keys(box)) {
      // 选人请求，以及哈迪寂亚之后三个人的"活还是死"
      const m = /^N(\d+)-(\d+)-\d+-(pick|life\d)$/.exec(id);
      if (m && Number(m[1]) === s.night && Number(m[2]) < s.ns!.slot && !r.acks[k]?.[id]) out.push([Number(k), id]);
    }
  return out;
}

/** 现在该收到"今晚你没有行动"的人 */
export function idleDue(s: GameState, r: Pick<HostRoom, 'code' | 'seats' | 'msgs'>): number[] {
  const order = slotsFor(s);
  const cur = s.ns!.slot;
  const dawn = order[cur] === 'dawn';
  // 今晚走过的和还要走的步骤（不算入夜、天亮），每人随机分到其中一步
  const ran = s.ns!.ran ?? [];
  const steps = order.map((sl, i) => ({ sl, i })).filter(({ sl, i }) => sl !== 'dusk' && sl !== 'dawn' && (i < cur ? ran.includes(i) : shouldRun(s, sl))).map(({ i }) => i);
  const game = s.seats.map((x) => x.startRole).join();
  return s.seats
    .filter((x) => {
      const n = x.n;
      if (x.left || !r.seats[n] || hasNightMsg(r, s, n) || s.ns!.woke.includes(n)) return false;
      if (dawn) return true;
      const at = steps.length ? steps[Math.floor(hashUnit(`${r.code}|${s.night}|${n}|${game}`) * steps.length)] : cur;
      return cur >= at && !mayWakeFrom(s, n, cur);
    })
    .map((x) => x.n);
}
