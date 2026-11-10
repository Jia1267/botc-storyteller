import { useEffect, useRef, useState } from 'react';
import { ackMsg, answerPick, claimSeat, gotMsg, keepOnline, leaveSeat, roomError, signIn, voteMvp, watchConnected, watchMeta, watchPrivate, watchSeats } from '../../room/api';
import { metaSeats, seatLabel, sortMsgs, type EndInfo, type PickAnswer, type RoomMeta, type RoomMsg, type SeatInfo } from '../../room/protocol';
import { MIN_PAGE_MS, ShowCard, type CardContent } from '../common';
import { AiDay } from './PlayerAi';

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
/** 最后一局的复盘存在本机：房间关了、开了新的一局也还能看 */
const lastEndKey = (code: string) => `botc-room-last-end-${code}`;
interface LastEnd {
  end: EndInfo;
  seat: number;
  seats: Record<string, SeatInfo>;
}
const loadLastEnd = (code: string): LastEnd | null => {
  try {
    return JSON.parse(localStorage.getItem(lastEndKey(code)) ?? 'null');
  } catch {
    return null;
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
  // 刚才还坐着、现在座位没了（说书人点了"空出"）：在选座页说一声
  const was = useRef<number | null>(null);
  if (seat !== null) was.current = seat;
  const kicked = seat === null && stray === null && meta?.phase === 'game' ? was.current : null;

  // 上一局的复盘（本机存的）：房间里已经没有了的时候拿出来
  const last = meta?.phase === 'end' && meta.end ? null : loadLastEnd(code);
  const lastView = last && <EndView code={code} seat={last.seat} end={last.end} seats={last.seats} closed />;

  let body;
  if (err) body = <p className="card card-warn">{err}</p>;
  else if (meta === undefined || !uid) body = <p className="dim">正在连接房间 {code}…</p>;
  else if (meta === null)
    body = last ? (
      <div className="stack">
        <p className="card card-warn">房间 {code} 已经关了。下面是上一局的复盘。</p>
        {lastView}
      </div>
    ) : (
      <p className="card card-warn">房间 {code} 不存在，或者已经关了。找说书人要新的链接。</p>
    );
  else {
    body = seat === null ? <PickSeat code={code} uid={uid} meta={meta} seats={seats} stray={stray} kicked={kicked} /> : <Seated code={code} seat={seat} name={mine![1].name} meta={meta} seats={seats} />;
    // 开新局之前（还在选座、等开始）可以翻一翻上一局
    if (last && meta.phase === 'lobby')
      body = (
        <div className="stack">
          {body}
          <details className="more">
            <summary>上一局的复盘</summary>
            {lastView}
          </details>
        </div>
      );
  }

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

function PickSeat({ code, uid, meta, seats, stray, kicked }: { code: string; uid: string; meta: RoomMeta; seats: Record<string, SeatInfo>; stray: number | null; kicked: number | null }) {
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
      {kicked !== null && (
        <p className="card card-warn">
          说书人把你从 {seatLabel(kicked)}移开了（可能是你的手机断线太久）。如果你还坐 {seatLabel(kicked)}，再点一下它坐回去，你的角色会自动回来。
        </p>
      )}
      <p className="muted">
        {stray !== null
          ? `说书人改了人数，你原来的 ${seatLabel(stray)}这局没有了，重新选一个。`
          : lobby
            ? '先商量好从谁开始是 1 号，然后顺时针数。点你自己的座位。'
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
  // 游戏结束：复盘和 MVP 投票（没看完的夜里消息不用再看了）
  if (meta.phase === 'end' && meta.end) return <EndView code={code} seat={seat} end={meta.end} seats={seats} />;
  if (next?.ask) return <PickCard key={msgKey(next)} m={next} me={seat} seats={seats} onPick={(ans) => finish(next, answerPick(code, seat, next.id, ans))} />;
  if (next)
    return (
      <ShowCard
        key={msgKey(next)}
        c={next.fix ? { ...next.card, lines: ['说书人更正了刚才的信息：以这条为准。', ...(next.card.lines ?? [])] } : next.card}
        onDone={() => finish(next, ackMsg(code, seat, next.id))}
      />
    );
  if (showRole && role) return <ShowCard c={{ ...role, title: '你的角色' }} onDone={() => setShowRole(false)} />;

  return (
    <div className="stack">
      {meta.ai && meta.phase === 'game' && <AiDay code={code} seat={seat} ai={meta.ai} seats={seats} />}
      <h2 style={{ margin: 0 }}>
        你是 {seatLabel(seat)}
        {name ? `（${name}）` : ''}
      </h2>
      <p className="muted">
        {meta.phase === 'lobby' ? '等其他人坐好，说书人开始以后你的角色会自动出现在这里。' : meta.phase === 'end' ? '游戏结束了，复盘马上发过来……' : '有消息会自动弹出来。看完点"看完了"。'}
      </p>
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

/** 点一下选中、再点取消；只能选一个时点别的就换过去 */
const toggle = <T,>(xs: T[], x: T, max: number) => (xs.includes(x) ? xs.filter((y) => y !== x) : max === 1 ? [x] : xs.length < max ? [...xs, x] : xs);

/** 夜里选人（有的还要选角色或是/否）：选够了点确定；一次性能力可以点"不用" */
function PickCard({ m, me, seats, onPick }: { m: RoomMsg; me: number; seats: Record<string, SeatInfo>; onPick: (ans: PickAnswer) => void }) {
  const a = m.ask!;
  const optCount = a.opts?.length ? (a.optCount ?? 1) : 0;
  const optMin = a.opts?.length ? (a.optMin ?? optCount) : 0;
  const [sel, setSel] = useState<number[]>([]);
  const [opts, setOpts] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [ready, setReady] = useState(false);
  // 和看卡片一样：至少停 1 秒，免得上一张"看完了"连点到这里
  useEffect(() => {
    const t = setTimeout(() => setReady(true), MIN_PAGE_MS);
    return () => clearTimeout(t);
  }, []);
  const full = sel.length === a.count && opts.length >= optMin && opts.length <= optCount && (!a.text || !!text.trim());
  const label = (id: string) => a.opts?.find((o) => o.id === id)?.label ?? id;
  const need = [a.count > sel.length ? `选 ${a.count - sel.length} 个人` : '', optMin > opts.length ? `选 ${optMin - opts.length} 项` : '', a.text && !text.trim() ? '写一句话' : '']
    .filter(Boolean)
    .join('、');
  return (
    <div className="showcard pick" role="dialog" aria-label="选人">
      {m.card.lines?.map((l, i) => (
        <div key={i} className="ab say-line">
          {l}
        </div>
      ))}
      {m.card.title && <div className="ttl">{m.card.title}</div>}
      {m.card.ability && <div className="ab">{m.card.ability}</div>}
      {m.card.rows && (
        <div className="rows">
          {m.card.rows.map((r) => (
            <div key={r}>{r}</div>
          ))}
        </div>
      )}
      {a.count > 0 && (
        <div className="pick-grid">
          {a.seats.map((n) => (
            <button key={n} className={`pick-seat${sel.includes(n) ? ' sel' : ''}`} disabled={a.disabled?.includes(n)} aria-pressed={sel.includes(n)} onClick={() => setSel((xs) => toggle(xs, n, a.count))}>
              {a.ordered && sel.includes(n) && <i className="ord">{sel.indexOf(n) + 1}</i>}
              <b>{seatLabel(n)}</b>
              <small>{[n === me ? '你' : seats[n]?.name, a.dead?.includes(n) && '已死', a.disabled?.includes(n) && a.why?.[n]].filter(Boolean).join(' · ')}</small>
            </button>
          ))}
        </div>
      )}
      {a.opts && a.opts.length > 0 && (
        <div className="pick-grid opts">
          {a.opts.map((o) => (
            <button key={o.id} className={`pick-seat${opts.includes(o.id) ? ' sel' : ''}${o.evil ? ' evil' : ''}`} aria-pressed={opts.includes(o.id)} onClick={() => setOpts((xs) => toggle(xs, o.id, optCount))}>
              <b>{o.label}</b>
            </button>
          ))}
        </div>
      )}
      {a.text && <input className="input pick-ok" value={text} maxLength={60} placeholder={a.text} onChange={(e) => setText(e.target.value)} />}
      <button className="btn btn-primary btn-block pick-ok" disabled={!full || !ready} onClick={() => onPick({ seats: sel, opts, text: text.trim() || undefined })}>
        {full ? `确定${sel.length || opts.length ? `：${[...sel.map(seatLabel), ...opts.map(label)].join('、')}` : ''}` : `还要${need}`}
      </button>
      {a.skip && (
        <button className="btn btn-ghost btn-block pick-ok" disabled={!ready} onClick={() => onPick({ skip: true })}>
          {a.skip}
        </button>
      )}
    </div>
  );
}

/** 结束后：胜负、所有人的身份、匿名选 MVP、关键时刻、每晚发生了什么 */
function EndView({ code, seat, end, seats, closed = false }: { code: string; seat: number; end: EndInfo; seats: Record<string, SeatInfo>; closed?: boolean }) {
  // 存一份在本机：说书人关了房间或者开了新的一局，手机上还能看
  useEffect(() => {
    if (closed) return;
    try {
      localStorage.setItem(lastEndKey(code), JSON.stringify({ end, seat, seats } satisfies LastEnd));
    } catch {
      /* 存不了只是房间关了以后看不到 */
    }
  }, [closed, code, end, seat, seats]);
  // 自己投了谁只记在本机（数据库里的票别人看不到，自己也读不回来）
  const key = `botc-room-mvp-${code}-${end.at}`;
  const [vote, setVote] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(key);
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  });
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cast = async (n: number) => {
    setBusy(true);
    try {
      await voteMvp(code, seat, n);
      setVote(n);
      setPick(null);
      try {
        localStorage.setItem(key, String(n));
      } catch {
        /* 存不了只是刷新后要重新投 */
      }
    } catch (e) {
      setErr(roomError(e));
    }
    setBusy(false);
  };
  const name = (n: number) => `${seatLabel(n)}${n === seat ? '（你）' : seats[n]?.name ? `（${seats[n].name}）` : ''}`;
  const ranked = Object.entries(end.mvp ?? {}).sort((a, b) => b[1] - a[1]);
  const evil = end.winner === 'evil';
  return (
    <div className="stack">
      <div className={`card stack${evil ? ' card-evil' : ''}`} style={{ gap: 6, textAlign: 'center' }}>
        <h2 style={{ margin: 0 }} className={evil ? 'evil' : 'good'}>
          {evil ? '邪恶阵营获胜' : '善良阵营获胜'}
        </h2>
        <p>{end.reason}</p>
      </div>
      <div className="card stack" style={{ gap: 4 }}>
        <h3>所有人的身份</h3>
        {end.seats.map((x) => (
          <div key={x.n} className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', gap: 8, borderBottom: '1px solid var(--line)', padding: '6px 0' }}>
            <span>
              <b>{name(x.n)}</b> <span className={x.evil ? 'evil' : 'good'}>{x.role}</span>
              {x.note && <span className="dim">（{x.note}）</span>}
            </span>
            <span className="dim" style={{ flex: 'none' }}>
              {x.fate}
            </span>
          </div>
        ))}
      </div>
      <div className="card stack" style={{ gap: 8 }}>
        <h3>选 MVP（匿名，不能投自己）</h3>
        {closed ? (
          <p className="dim">
            {vote !== null ? `你投给了 ${name(vote)}。` : ''}投票已经结束
            {ranked.length > 0 ? `：${ranked.map(([n, v]) => `${seatLabel(Number(n))} ${v} 票`).join('，')}。` : '。'}
          </p>
        ) : vote !== null && pick === null ? (
          <>
            <p>
              你投给了 <b>{name(vote)}</b>。谁投了谁不会公开，只公开票数。
            </p>
            <p className="dim">
              {end.voters ?? 0} 人已投{ranked.length > 0 && `：${ranked.map(([n, v]) => `${seatLabel(Number(n))} ${v} 票`).join('，')}`}
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => setPick(vote)}>
              改票
            </button>
          </>
        ) : (
          <>
            <div className="role-grid">
              {end.seats
                .filter((x) => x.n !== seat)
                .map((x) => (
                  <button key={x.n} className="role-chip" style={pick === x.n ? { boxShadow: '0 0 0 2px var(--gold) inset' } : undefined} onClick={() => setPick(x.n)}>
                    {seatLabel(x.n)}
                    {seats[x.n]?.name && <small>{seats[x.n].name}</small>}
                  </button>
                ))}
            </div>
            <button className="btn btn-primary btn-block" disabled={pick === null || busy} onClick={() => pick !== null && cast(pick)}>
              {pick === null ? '点一个人' : `投给 ${name(pick)}`}
            </button>
          </>
        )}
        {err && <p className="card card-warn">{err}</p>}
      </div>
      <div className="card">
        <h3>这一局的关键时刻</h3>
        <ul className="moments">
          {end.moments.map((m, i) => (
            <li key={i}>
              <span>{m.when}</span>
              <span>{m.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h3>复盘：每晚发生了什么</h3>
        <p className="dim" style={{ marginBottom: 8 }}>
          红色的是假信息。
        </p>
        <div className="timeline">
          {end.log.map((g, i) => (
            <div key={i}>
              <h4>{g.title}</h4>
              <ul>
                {g.items.map((e, j) => (
                  <li key={j} className={e.f ? 'f' : ''}>
                    {e.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
