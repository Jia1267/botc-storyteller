import { useEffect, useRef, useState } from 'react';
import { clearMsg, closeRoom, createRoom, freeSeat, ownsRoom, roomError, sendCard, setPhase, setRoleCard, watchAcks, watchConnected, watchMeta, watchSeats } from '../../room/api';
import { gotKey, isRoomCode, roomLink, type RoomMeta, type SeatInfo } from '../../room/protocol';
import { ROLES } from '../../engine/roles';
import { Qr } from './Qr';

const HOST_KEY = 'botc-room-host';

/**
 * 第 0 步小样：开一个测试房间，看手机能不能进、锁屏回来能不能接上、消息多快到。
 * 打开方式：网址后面加 ?roomtest
 */
export default function HostTest() {
  const [code, setCode] = useState<string | null>(null);
  const [count, setCount] = useState(8);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 刷新页面后接着用原来的房间
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(HOST_KEY);
    } catch {
      /* 读不到就开新房间 */
    }
    if (isRoomCode(saved)) ownsRoom(saved).then((ok) => ok && setCode(saved), () => {});
  }, []);

  const open = async () => {
    setBusy(true);
    setErr(null);
    try {
      const c = await createRoom(count, '测试房间');
      try {
        localStorage.setItem(HOST_KEY, c);
      } catch {
        /* 存不了只是刷新后要重开 */
      }
      setCode(c);
    } catch (e) {
      setErr(roomError(e));
    }
    setBusy(false);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="title">
          <b>房间小样</b>
          <small>{code ? `房间 ${code}` : '测试开房、进房、锁屏重连、消息延迟'}</small>
        </div>
      </header>
      <main className="main">
        {code ? (
          <Room code={code} onClosed={() => setCode(null)} />
        ) : (
          <div className="stack">
            <label className="stack" style={{ gap: 6 }}>
              <span className="dim">几个座位</span>
              <input className="input" type="number" min={5} max={15} value={count} onChange={(e) => setCount(Math.max(5, Math.min(15, Number(e.target.value) || 5)))} />
            </label>
            <button className="btn btn-primary btn-block" disabled={busy} onClick={open}>
              开测试房间
            </button>
            {err && <p className="card card-warn">{err}</p>}
          </div>
        )}
      </main>
    </div>
  );
}

interface Sent {
  n: number;
  id: string;
  at: number;
  got?: boolean;
}

interface Times {
  /** 发出 → 到手机上（网络延迟） */
  got: number[];
  /** 发出 → 点"看完了"（含人看的时间） */
  read: number[];
}

function Room({ code, onClosed }: { code: string; onClosed: () => void }) {
  const [meta, setMeta] = useState<RoomMeta | null>(null);
  const [seats, setSeats] = useState<Record<string, SeatInfo>>({});
  const [acks, setAcks] = useState<Record<string, Record<string, number>>>({});
  const [online, setOnline] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const sent = useRef<Sent[]>([]);
  const [times, setTimes] = useState<Record<number, Times>>({});
  const [k, setK] = useState(1);
  const link = roomLink(code);

  useEffect(() => {
    const fail = (e: Error) => setErr(roomError(e));
    const offs = [watchMeta(code, setMeta, fail), watchSeats(code, setSeats, fail), watchAcks(code, setAcks), watchConnected(setOnline)];
    return () => offs.forEach((off) => off());
  }, [code]);

  // 到手机上、点了"看完了"：各记一次用了多久；看完的从他的信箱里删掉
  useEffect(() => {
    const now = Date.now();
    const add: { n: number; k: keyof Times; ms: number }[] = [];
    for (const x of sent.current) {
      if (!x.got && acks[x.n]?.[gotKey(x.id)]) {
        x.got = true;
        add.push({ n: x.n, k: 'got', ms: now - x.at });
      }
      if (acks[x.n]?.[x.id]) add.push({ n: x.n, k: 'read', ms: now - x.at });
    }
    const done = sent.current.filter((x) => acks[x.n]?.[x.id]);
    sent.current = sent.current.filter((x) => !done.includes(x));
    for (const x of done) clearMsg(code, x.n, x.id).catch(() => {});
    if (!add.length) return;
    setTimes((t) => {
      const out = { ...t };
      for (const a of add) {
        const cur = out[a.n] ?? { got: [], read: [] };
        out[a.n] = { ...cur, [a.k]: [...cur[a.k], a.ms] };
      }
      return out;
    });
  }, [acks, code]);

  const seated = Object.keys(seats).map(Number).sort((a, b) => a - b);
  const sendAll = async () => {
    const n0 = k;
    setK(k + 1);
    for (const n of seated) {
      try {
        const m = await sendCard(code, n, { title: `测试消息 ${n0}`, big: [`${n} 号`], ability: '看到这张卡就点"看完了"，说书人那边会记下用了多久。' });
        sent.current.push({ n, id: m.id, at: m.sentAt });
      } catch (e) {
        setErr(roomError(e));
      }
    }
  };
  const giveRoles = async () => {
    const pool = (['washerwoman', 'empath', 'chef', 'monk', 'soldier', 'butler', 'poisoner', 'imp'] as const).filter((r) => r in ROLES);
    for (const [i, n] of seated.entries()) {
      const r = pool[i % pool.length];
      await setRoleCard(code, n, { title: '你的角色', big: [ROLES[r].name], team: ROLES[r].team, ability: ROLES[r].ability }).catch((e) => setErr(roomError(e)));
    }
  };
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

  return (
    <div className="stack">
      {!online && <p className="card card-warn">这台设备断线了，正在重连…</p>}
      <div className="card stack" style={{ alignItems: 'center', gap: 10 }}>
        <Qr text={link} />
        <b style={{ fontSize: 28, letterSpacing: 4 }}>{code}</b>
        <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
        {/^(localhost|127\.)/.test(location.hostname) && <p className="card card-warn">这台电脑是用 localhost 打开的，手机扫这个码进不来；请用局域网地址打开本页。</p>}
      </div>
      <div className="card stack" style={{ gap: 6 }}>
        <b>
          座位（{seated.length} / {meta?.count ?? '?'}）· {meta?.phase === 'lobby' ? '等人入座' : '已开始'}
        </b>
        {Array.from({ length: meta?.count ?? 0 }, (_, i) => i + 1).map((n) => {
          const x = seats[n];
          const t = times[n];
          return (
            <div key={n} className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: x ? (x.online ? 'var(--good)' : 'var(--text-3)') : 'transparent', border: '1px solid var(--text-3)' }} />
              <span className="grow">
                {n} 号 {x ? x.name || '（没填名字）' : <span className="dim">空</span>}
                {x && !x.online && <span className="dim"> · 断线</span>}
              </span>
              {t && t.got.length > 0 && (
                <span className="dim">
                  送达 {avg(t.got)}ms（{t.got.length} 条）{t.read.length > 0 && ` · 看完 ${(avg(t.read) / 1000).toFixed(1)}s`}
                </span>
              )}
              {x && (
                <button className="btn btn-ghost btn-sm" onClick={() => freeSeat(code, n).catch((e) => setErr(roomError(e)))}>
                  空出
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button className="btn btn-primary btn-block" disabled={!seated.length} onClick={sendAll}>
        给所有坐下的人发一条测试消息
      </button>
      <button className="btn btn-outline btn-block" disabled={!seated.length} onClick={giveRoles}>
        给每个人发一个测试角色（随时能看）
      </button>
      <button className="btn btn-outline btn-block" onClick={() => setPhase(code, meta?.phase === 'lobby' ? 'game' : 'lobby').catch((e) => setErr(roomError(e)))}>
        {meta?.phase === 'lobby' ? '切到"已开始"（玩家不能再换座位）' : '切回"等人入座"'}
      </button>
      {err && <p className="card card-warn">{err}</p>}
      <button
        className="btn btn-ghost btn-sm"
        onClick={() =>
          closeRoom(code).then(() => {
            try {
              localStorage.removeItem(HOST_KEY);
            } catch {
              /* 无所谓 */
            }
            onClosed();
          }, (e) => setErr(roomError(e)))
        }
      >
        关闭房间
      </button>
    </div>
  );
}
