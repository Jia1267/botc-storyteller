import { useEffect, useRef, useState } from 'react';
import { ackMsg, answerPick, claimSeat, gotMsg, keepOnline, leaveSeat, roomError, signIn, watchConnected, watchMeta, watchPrivate, watchSeats } from '../../room/api';
import { metaSeats, seatLabel, sortMsgs, type RoomMeta, type RoomMsg, type SeatInfo } from '../../room/protocol';
import { MIN_PAGE_MS, ShowCard, type CardContent } from '../common';

const NAME_KEY = 'botc-room-name';
/** 看过的消息记在本机：刷新页面不会把看过的再弹一遍（重发的消息发出时间不同，会再弹） */
const seenKey = (code: string, seat: number) => `botc-room-seen-${code}-${seat}`;
const msgKey = (m: RoomMsg) => `${m.id}@${m.sentAt}`;
const loadSeen = (code: string, seat: number): string[] => {
  try {
    return JSON.parse(localStorage.getItem(seenKey(code, seat)) ?? '[]');
  } catch {
    return [];
  }
};
const loadName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
};

/** 玩家手机：选座位 → 等说书人 → 收到消息就弹出来，点"看完了"就消失；自己的角色随时能看 */
export default function PlayerApp({ code }: { code: string }) {
  const [uid, setUid] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [meta, setMeta] = useState<RoomMeta | null | undefined>(undefined);
  const [seats, setSeats] = useState<Record<string, SeatInfo>>({});
  const [online, setOnline] = useState(true);

  useEffect(() => {
    signIn().then(setUid, (e) => setErr(roomError(e)));
  }, []);
  useEffect(() => {
    if (!uid) return;
    const fail = (e: Error) => setErr(roomError(e));
    const offs = [watchMeta(code, setMeta, fail), watchSeats(code, setSeats, fail), watchConnected(setOnline)];
    return () => offs.forEach((off) => off());
  }, [uid, code]);

  // 说书人改了人数，原来的座位可能不在这局里了：要重新选
  const list = meta ? metaSeats(meta) : [];
  const claimed = uid ? Object.entries(seats).filter(([, x]) => x.uid === uid).map(([k, x]) => [Number(k), x] as const) : [];
  const mine = claimed.find(([n]) => list.includes(n));
  const seat = mine ? mine[0] : null;
  const stray = claimed.find(([n]) => !list.includes(n))?.[0] ?? null;

  let body;
  if (err) body = <p className="card card-warn">{err}</p>;
  else if (meta === undefined || !uid) body = <p className="dim">正在连接房间 {code}…</p>;
  else if (meta === null) body = <p className="card card-warn">房间 {code} 不存在，或者已经关了。找说书人要新的链接。</p>;
  else if (seat === null) body = <PickSeat code={code} uid={uid} meta={meta} seats={seats} stray={stray} />;
  else body = <Seated code={code} seat={seat} name={mine![1].name} meta={meta} seats={seats} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="title">
          <b>{meta?.title || '钟楼说书人'}</b>
          <small>
            房间 {code}
            {seat !== null && ` · 你是 ${seatLabel(seat)}`}
            {!online && ' · 断线了，正在重连…'}
          </small>
        </div>
      </header>
      <main className="main">{body}</main>
    </div>
  );
}

function PickSeat({ code, uid, meta, seats, stray }: { code: string; uid: string; meta: RoomMeta; seats: Record<string, SeatInfo>; stray: number | null }) {
  const [name, setName] = useState(loadName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const take = async (n: number) => {
    setBusy(true);
    setMsg(null);
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {
      /* 存不了名字也不影响坐下 */
    }
    try {
      if (stray !== null) await leaveSeat(code, stray);
      if (!(await claimSeat(code, n, uid, name))) setMsg(`${seatLabel(n)}刚被别人坐了，换一个。`);
    } catch (e) {
      setMsg(roomError(e));
    }
    setBusy(false);
  };
  const lobby = meta.phase === 'lobby';
  return (
    <div className="stack">
      <h2 style={{ margin: 0 }}>你坐在几号？</h2>
      <p className="muted">
        {stray !== null
          ? `说书人改了人数，你原来的 ${seatLabel(stray)}这局没有了，重新选一个。`
          : lobby
            ? '说书人会告诉大家从哪里开始数 1 号。点你自己的座位。'
            : '游戏已经开始了，只能坐空着的座位（比如说书人给你空出来的、新加的旅行者座位）。'}
      </p>
      <label className="stack" style={{ gap: 6 }}>
        <span className="dim">你的名字（可以不填）</span>
        <input className="input" value={name} maxLength={12} placeholder="比如：小王" onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="role-grid">
        {metaSeats(meta).map((n) => {
          const x = seats[n];
          return (
            <button key={n} className="role-chip" disabled={busy || !!x} style={x ? { opacity: 0.45 } : undefined} onClick={() => take(n)}>
              {seatLabel(n)}
              {x && <small>{x.name || '有人了'}</small>}
            </button>
          );
        })}
      </div>
      {msg && <p className="card card-warn">{msg}</p>}
    </div>
  );
}

function Seated({ code, seat, name, meta, seats }: { code: string; seat: number; name?: string; meta: RoomMeta; seats: Record<string, SeatInfo> }) {
  const [role, setRole] = useState<CardContent | undefined>();
  const [msgs, setMsgs] = useState<RoomMsg[]>([]);
  const [seen, setSeen] = useState<string[]>(() => loadSeen(code, seat));
  const [showRole, setShowRole] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const got = useRef(new Set<string>());

  useEffect(() => keepOnline(code, seat), [code, seat]);
  useEffect(
    () =>
      watchPrivate(
        code,
        seat,
        (p) => {
          setRole(p.role);
          const ms = sortMsgs(p.msgs);
          setMsgs(ms);
          // 收到就回一声"已送达"（每条只回一次；重发的算新的一条）
          for (const m of ms)
            if (!got.current.has(msgKey(m))) {
              got.current.add(msgKey(m));
              gotMsg(code, seat, m.id).catch(() => got.current.delete(msgKey(m)));
            }
        },
        (e) => setErr(roomError(e)),
      ),
    [code, seat],
  );

  // 一条一条看：看完的在本机藏起来（记在本机，刷新也不再弹）
  const next = msgs.find((m) => !seen.includes(msgKey(m)));
  const finish = (m: RoomMsg, send: Promise<unknown>) => {
    setSeen((xs) => {
      const ys = [...xs, msgKey(m)].slice(-300);
      try {
        localStorage.setItem(seenKey(code, seat), JSON.stringify(ys));
      } catch {
        /* 存不了只是刷新后会再弹一遍 */
      }
      return ys;
    });
    send.catch((e) => setErr(roomError(e)));
  };
  if (next?.ask) return <PickCard key={msgKey(next)} m={next} me={seat} seats={seats} onPick={(ns) => finish(next, answerPick(code, seat, next.id, ns))} />;
  if (next) return <ShowCard key={msgKey(next)} c={next.card} onDone={() => finish(next, ackMsg(code, seat, next.id))} />;
  if (showRole && role) return <ShowCard c={{ ...role, title: '你的角色' }} onDone={() => setShowRole(false)} />;

  return (
    <div className="stack">
      <h2 style={{ margin: 0 }}>
        你是 {seatLabel(seat)}
        {name ? `（${name}）` : ''}
      </h2>
      <p className="muted">{meta.phase === 'lobby' ? '等其他人坐好，说书人开始以后你的角色会自动出现在这里。' : '有消息会自动弹出来。看完点"看完了"。'}</p>
      {role && (
        <button className="btn btn-primary btn-block" onClick={() => setShowRole(true)}>
          看我的角色
        </button>
      )}
      {err && <p className="card card-warn">{err}</p>}
      {meta.phase === 'lobby' && (
        <button className="btn btn-outline btn-sm" onClick={() => leaveSeat(code, seat).catch((e) => setErr(roomError(e)))}>
          坐错了，换座位
        </button>
      )}
    </div>
  );
}

/** 夜里选人：点座位，选够了点确定 */
function PickCard({ m, me, seats, onPick }: { m: RoomMsg; me: number; seats: Record<string, SeatInfo>; onPick: (ns: number[]) => void }) {
  const a = m.ask!;
  const [sel, setSel] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  // 和看卡片一样：至少停 1 秒，免得上一张"看完了"连点到这里
  useEffect(() => {
    const t = setTimeout(() => setReady(true), MIN_PAGE_MS);
    return () => clearTimeout(t);
  }, []);
  const tap = (n: number) => setSel((xs) => (xs.includes(n) ? xs.filter((x) => x !== n) : a.count === 1 ? [n] : xs.length < a.count ? [...xs, n] : xs));
  const full = sel.length === a.count;
  return (
    <div className="showcard pick" role="dialog" aria-label="选人">
      {m.card.lines?.map((l, i) => (
        <div key={i} className="ab say-line">
          {l}
        </div>
      ))}
      {m.card.title && <div className="ttl">{m.card.title}</div>}
      <div className="pick-grid">
        {a.seats.map((n) => (
          <button key={n} className={`pick-seat${sel.includes(n) ? ' sel' : ''}`} disabled={a.disabled?.includes(n)} aria-pressed={sel.includes(n)} onClick={() => tap(n)}>
            <b>{seatLabel(n)}</b>
            <small>{[n === me ? '你' : seats[n]?.name, a.dead?.includes(n) && '已死'].filter(Boolean).join(' · ')}</small>
          </button>
        ))}
      </div>
      <button className="btn btn-primary btn-block pick-ok" disabled={!full || !ready} onClick={() => onPick(sel)}>
        {full ? `确定：${sel.map(seatLabel).join('、')}` : `选 ${a.count} 个人${sel.length ? `（还差 ${a.count - sel.length} 个）` : ''}`}
      </button>
    </div>
  );
}
