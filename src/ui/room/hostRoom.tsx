// 说书人这边的房间：开房、看谁入座、把身份发到每个人手机上。
// Firebase 只在开过房间时才加载（import('../../room/api')），不开房的人主页面不变大。
import { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { metaSeats, msgStatus, roomLink, seatLabel, tallyMvp, type Acks, type AiPublic, type EndInfo, type MsgBody, type RoomMeta, type RoomMsg, type SeatInfo } from '../../room/protocol';
import type { CardContent } from '../common';
import { BottomBar, ConfirmButton, Sheet } from '../common';

/** 递二维码之前先说清楚座位号怎么数：错了的话所有"邻座"信息都会错 */
const SEAT_TIP = '递二维码之前先告诉大家：从谁开始是 1 号，然后顺时针 2 号、3 号……坐错号的话，和邻座有关的信息都会错。';

// 二维码也是打开房间面板时才加载
const Qr = lazy(() => import('./Qr').then((m) => ({ default: m.Qr })));

const loadApi = () => import('../../room/api');
const KEY = 'botc-room-st';

interface Saved {
  code: string;
  /** 每个座位的"你的角色"消息 id（刷新后还能看到谁看完了） */
  dealt?: Record<string, string>;
}

const loadSaved = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
};
const store = (x: Saved | null) => {
  try {
    if (x) localStorage.setItem(KEY, JSON.stringify(x));
    else localStorage.removeItem(KEY);
  } catch {
    /* 存不了只是刷新后要重开房间 */
  }
};

export interface HostRoom {
  code: string | null;
  meta: RoomMeta | null;
  seats: Record<string, SeatInfo>;
  acks: Acks;
  /** 每个座位信箱里的消息 */
  msgs: Record<string, Record<string, RoomMsg>>;
  /** 信箱和"已看"都读到了（读到之前不自动发消息，免得把发过的再发一遍） */
  ready: boolean;
  online: boolean;
  err: string | null;
  busy: boolean;
  dealt: Record<string, string>;
  open(): Promise<void>;
  close(): Promise<void>;
  free(n: number): Promise<void>;
  /** 把每个人的身份发到手机上；成功返回 true */
  deal(cards: Record<number, CardContent>): Promise<boolean>;
  /** 夜里发一条消息（同一个 id 再发就是覆盖）；fix = 改了他看过的信息又重发 */
  send(n: number, id: string, body: MsgBody, fix?: boolean): Promise<void>;
  /** 这一步改成当面处理的座位（他手机不行）：换一步自动清空 */
  offline: number[];
  setOffline(ns: number[]): void;
  unsend(n: number, id: string): Promise<void>;
  /** 他手机上"看我的角色"换成新角色（红唇女郎接任、小恶魔传刀） */
  setRole(n: number, card: CardContent): Promise<void>;
  /** 游戏结束：复盘发到每个人手机上 */
  publishEnd(end: EndInfo): Promise<void>;
  /** AI 说书人局：更新公开的进度 */
  setAi(ai: AiPublic): Promise<void>;
}

const RoomCtx = createContext<HostRoom | null>(null);
export const useRoom = () => useContext(RoomCtx)!;

type GamePhase = 'setup' | 'deal' | 'night' | 'day' | 'end';
const roomPhase = (p: GamePhase): RoomMeta['phase'] => (p === 'setup' ? 'lobby' : p === 'end' ? 'end' : 'game');

export function RoomProvider({ seatNs, title, phase, roleCards, script, table, children }: {
  seatNs: number[];
  title: string;
  phase: GamePhase;
  /** 游戏中每个座位现在的角色卡：有人被"空出"后坐回来，自动把角色还给他 */
  roleCards?: Record<number, CardContent>;
  /** 剧本角色表（公开） */
  script?: RoomMeta['script'];
  /** 圆桌（座位顺序、存活）：只在白天、发身份、结束时给（夜里死的人天亮才公布） */
  table?: RoomMeta['table'];
  children: ReactNode;
}) {
  const [saved, setSaved] = useState<Saved | null>(loadSaved);
  const code = saved?.code ?? null;
  const [meta, setMeta] = useState<RoomMeta | null>(null);
  const [seats, setSeats] = useState<Record<string, SeatInfo>>({});
  const [acks, setAcks] = useState<Acks | null>(null);
  const [msgs, setMsgs] = useState<Record<string, Record<string, RoomMsg>> | null>(null);
  const [hasRole, setHasRole] = useState<Record<string, boolean>>({});
  const [offline, setOffline] = useState<number[]>([]);
  const [online, setOnline] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = useCallback((x: Saved | null) => {
    store(x);
    setSaved(x);
  }, []);

  // 打开网页时接着用原来的房间；房间被关了就忘掉
  useEffect(() => {
    if (!code) return;
    let offs: (() => void)[] = [];
    let alive = true;
    loadApi().then(async (api) => {
      if (!(await api.ownsRoom(code).catch(() => false))) {
        if (alive) save(null);
        return;
      }
      if (!alive) return;
      const fail = (e: Error) => setErr(api.roomError(e));
      offs = [
        api.watchMeta(code, (m) => (m ? setMeta(m) : save(null)), fail),
        api.watchSeats(code, setSeats, fail),
        api.watchAcks(code, setAcks),
        api.watchMsgs(code, (m, r) => {
          setMsgs(m);
          setHasRole(r);
        }),
        api.watchConnected(setOnline),
      ];
    });
    return () => {
      alive = false;
      offs.forEach((off) => off());
      setMeta(null);
      setSeats({});
      setAcks(null);
      setMsgs(null);
    };
  }, [code, save]);

  // 人数、旅行者、剧本变了：房间里的座位跟着变
  const nsKey = seatNs.join(',');
  useEffect(() => {
    if (!code || !meta || !nsKey) return;
    if (metaSeats(meta).join(',') === nsKey && meta.title === title) return;
    loadApi().then((api) => api.setSeats(code, nsKey ? nsKey.split(',').map(Number) : [], title).catch((e) => setErr(api.roomError(e))));
  }, [code, meta, nsKey, title]);

  // 游戏阶段：开局设置时玩家可以换座位；新开一局时收回上一局的角色
  const want = roomPhase(phase);
  useEffect(() => {
    if (!code || !meta || meta.phase === want) return;
    loadApi().then(async (api) => {
      try {
        if (want === 'lobby') {
          await api.clearPrivate(code);
          save({ code });
        }
        await api.setPhase(code, want);
      } catch (e) {
        setErr(api.roomError(e));
      }
    });
  }, [code, meta, want, save]);

  // 白天还是夜晚：手机上跟着显示
  const time = phase === 'night' ? 'night' : phase === 'day' ? 'day' : null;
  useEffect(() => {
    if (!code || !meta || !time || meta.time === time) return;
    loadApi().then((api) => api.setMetaKey(code, 'time', time).catch((e) => setErr(api.roomError(e))));
  }, [code, meta, time]);

  // 剧本角色表、圆桌：手机上看（数据库读回来的字段顺序会变、空数组会没有，所以用拼起来的字符串比）
  const scriptKey = script && `${script.roles.join()}|${(script.missing ?? []).join()}`;
  useEffect(() => {
    if (!code || !meta || !script || (meta.script && `${(meta.script.roles ?? []).join()}|${(meta.script.missing ?? []).join()}`) === scriptKey) return;
    loadApi().then((api) => api.setMetaKey(code, 'script', script).catch((e) => setErr(api.roomError(e))));
  }, [code, meta, scriptKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const tableKey = table && `${table.order.join()}|${table.alive.join()}`;
  useEffect(() => {
    if (!code || !meta || !table || (meta.table && `${(meta.table.order ?? []).join()}|${(meta.table.alive ?? []).join()}`) === tableKey) return;
    loadApi().then((api) => api.setMetaKey(code, 'table', table).catch((e) => setErr(api.roomError(e))));
  }, [code, meta, tableKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 有人被"空出"后又坐回来（或者换了一个人坐）：角色卡自动补上
  const latestCards = useRef(roleCards);
  latestCards.current = roleCards;
  useEffect(() => {
    const cards = latestCards.current;
    if (!code || !msgs || meta?.phase !== 'game' || !cards) return;
    const missing = Object.keys(seats).filter((n) => !hasRole[n] && cards[Number(n)]);
    if (!missing.length) return;
    loadApi().then((api) => Promise.all(missing.map((n) => api.setRoleCard(code, Number(n), cards[Number(n)]))).catch(() => {}));
  }, [code, msgs, hasRole, seats, meta?.phase]);

  // 结束后：数 MVP 票，只公开票数
  useEffect(() => {
    if (!code || meta?.phase !== 'end' || !meta.end || !acks) return;
    const { mvp, voters } = tallyMvp(acks, metaSeats(meta));
    if (JSON.stringify(mvp) === JSON.stringify(meta.end.mvp ?? {}) && voters === (meta.end.voters ?? 0)) return;
    loadApi().then((api) => api.setMvp(code, mvp, voters).catch((e) => setErr(api.roomError(e))));
  }, [code, meta, acks]);

  const value = useMemo<HostRoom>(
    () => ({
      code,
      meta,
      seats,
      acks: acks ?? {},
      msgs: msgs ?? {},
      ready: !!acks && !!msgs,
      online,
      err,
      busy,
      dealt: saved?.dealt ?? {},
      offline,
      setOffline,
      open: async () => {
        setBusy(true);
        setErr(null);
        const api = await loadApi();
        try {
          save({ code: await api.createRoom(seatNs, title) });
        } catch (e) {
          setErr(api.roomError(e));
        }
        setBusy(false);
      },
      close: async () => {
        if (!code) return;
        const api = await loadApi();
        await api.closeRoom(code).catch(() => {});
        save(null);
      },
      free: async (n) => {
        if (!code) return;
        const api = await loadApi();
        await api.freeSeat(code, n).catch((e) => setErr(api.roomError(e)));
      },
      deal: async (cards) => {
        if (!code) return false;
        setBusy(true);
        setErr(null);
        const api = await loadApi();
        try {
          // 房间阶段不在这里改：等游戏进入发身份阶段，由上面的同步统一改成"游戏中"
          const ids = await api.dealRoles(code, cards);
          // 只重发给部分人时，其他人的记录保留
          save({ code, dealt: { ...(saved?.dealt ?? {}), ...Object.fromEntries(Object.entries(ids).map(([n, id]) => [n, id])) } });
          setBusy(false);
          return true;
        } catch (e) {
          setErr(api.roomError(e));
          setBusy(false);
          return false;
        }
      },
      send: async (n, id, body, fix) => {
        if (!code) return;
        const api = await loadApi();
        await api.sendMsg(code, n, id, body, fix).catch((e) => setErr(api.roomError(e)));
      },
      unsend: async (n, id) => {
        if (!code) return;
        const api = await loadApi();
        await api.clearMsg(code, n, id).catch(() => {});
      },
      setRole: async (n, card) => {
        if (!code) return;
        const api = await loadApi();
        await api.setRoleCard(code, n, card).catch((e) => setErr(api.roomError(e)));
      },
      publishEnd: async (end) => {
        if (!code) return;
        const api = await loadApi();
        await api.setEnd(code, end).catch((e) => setErr(api.roomError(e)));
      },
      setAi: async (ai) => {
        if (!code) return;
        const api = await loadApi();
        await api.setAi(code, ai).catch((e) => setErr(api.roomError(e)));
      },
    }),
    [code, meta, seats, acks, msgs, online, err, busy, saved, seatNs, title, save, offline],
  );
  return <RoomCtx.Provider value={value}>{children}</RoomCtx.Provider>;
}

/** 开局设置页上的房间卡片：没开房时问要不要开；开了显示入座情况 */
export function RoomCard({ seatNs }: { seatNs: number[] }) {
  const room = useRoom();
  const [sheet, setSheet] = useState(false);
  // 刚开好房间：直接把二维码弹出来
  const opened = useRef(false);
  useEffect(() => {
    if (room.code && opened.current) {
      opened.current = false;
      setSheet(true);
    }
  }, [room.code]);
  if (!room.code)
    return (
      <div className="card stack" style={{ gap: 8 }}>
        <b>玩家用自己的手机看身份？</b>
        <p className="dim">开一个房间，大家扫码选好自己的座位。发身份时每个人的角色直接出现在自己手机上，不用传手机。</p>
        <button
          className="btn btn-outline btn-block"
          disabled={room.busy}
          onClick={() => {
            opened.current = true;
            room.open();
          }}
        >
          开房间（扫码入座）
        </button>
        {room.err && <p className="card card-warn">{room.err}</p>}
      </div>
    );
  const sat = seatNs.filter((n) => room.seats[n]);
  return (
    <div className={`card stack${sat.length < seatNs.length ? ' card-warn' : ''}`} style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <b>
          房间 {room.code} · 已入座 {sat.length} / {seatNs.length}
        </b>
        <button className="btn btn-sm btn-outline" onClick={() => setSheet(true)}>
          二维码和座位
        </button>
      </div>
      {sat.length < seatNs.length && <p className="dim">还没入座：{seatNs.filter((n) => !room.seats[n]).map(seatLabel).join('、')}。让他们扫码选座。</p>}
      {sat.length < seatNs.length && <p className="dim">{SEAT_TIP}</p>}
      {!room.online && <p className="dim">这台设备断线了，正在重连…</p>}
      {room.err && <p className="card card-warn">{room.err}</p>}
      {sheet && <RoomSheet seatNs={seatNs} onClose={() => setSheet(false)} />}
    </div>
  );
}

/** 扫码入座：二维码、链接、每个座位谁坐了（AI 局的平板直接摆在桌上给大家扫） */
export function RoomJoin({ seatNs }: { seatNs: number[] }) {
  const room = useRoom();
  if (!room.code) return null;
  const link = roomLink(room.code);
  return (
    <div className="stack">
      <div className="stack" style={{ alignItems: 'center', gap: 8 }}>
        <Suspense fallback={<div style={{ width: 220, height: 220 }} />}>
          <Qr text={link} />
        </Suspense>
        <b style={{ fontSize: 22, letterSpacing: '0.1em' }}>房间 {room.code}</b>
        <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
        {/^(localhost|127\.)/.test(location.hostname) && <p className="card card-warn">这台设备是用 localhost 打开的，手机扫码进不来。</p>}
      </div>
      <p className="card card-warn">{SEAT_TIP}</p>
      <SeatList seatNs={seatNs} />
    </div>
  );
}

/** 二维码、每个座位谁在线、空出座位、关房间 */
export function RoomSheet({ seatNs, onClose }: { seatNs: number[]; onClose: () => void }) {
  const room = useRoom();
  if (!room.code) return null;
  // 首页还没定人数：显示房间里上一局的座位
  const list = seatNs.length ? seatNs : room.meta ? metaSeats(room.meta) : [];
  const link = roomLink(room.code);
  return (
    <Sheet title={`房间 ${room.code}`} onClose={onClose}>
      <div className="stack">
        <div className="stack" style={{ alignItems: 'center', gap: 8 }}>
          <Suspense fallback={<div style={{ width: 220, height: 220 }} />}>
            <Qr text={link} />
          </Suspense>
          <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
          {/^(localhost|127\.)/.test(location.hostname) && <p className="card card-warn">这台设备是用 localhost 打开的，手机扫码进不来。</p>}
        </div>
        <p className="dim">{SEAT_TIP}</p>
        <SeatList seatNs={list} />
        <ConfirmButton label="关闭房间" confirmLabel="再点一次：关闭房间，所有玩家退出" onConfirm={() => room.close().then(onClose)} />
      </div>
    </Sheet>
  );
}

function SeatList({ seatNs, status }: { seatNs: number[]; status?: (n: number) => ReactNode }) {
  const room = useRoom();
  return (
    <div className="stack" style={{ gap: 6 }}>
      {seatNs.map((n) => {
        const x = room.seats[n];
        return (
          <div key={n} className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, flex: 'none', background: x ? (x.online ? 'var(--good)' : 'var(--text-3)') : 'transparent', border: '1px solid var(--text-3)' }} />
            <span className="grow">
              {seatLabel(n)} {x ? x.name || '' : <span className="dim">没人</span>}
              {x && !x.online && <span className="dim"> · 断线</span>}
            </span>
            {status?.(n)}
            {x && !status &&
              (room.meta?.phase === 'game' ? (
                <ConfirmButton className="btn btn-ghost btn-sm" label="空出" confirmLabel="再点一次：让他离座" onConfirm={() => room.free(n)} />
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => room.free(n)}>
                  空出
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
}

const STATUS_TEXT = { none: '没发出', sent: '发出了，还没到', got: '已送达，还没看', read: '已看' } as const;

/** 房间发身份：所有人同时在自己手机上看，全部看完才入夜 */
export function RoomDealScreen({ seatNs, fakes, onResend, onDone }: {
  seatNs: number[];
  fakes: { n: number; role: string; shown: string }[];
  onResend: () => void;
  onDone: () => void;
}) {
  const room = useRoom();
  const st = (n: number) => msgStatus(room.acks, n, room.dealt[n]);
  const left = seatNs.filter((n) => st(n) !== 'read');
  return (
    <main className="main">
      <div className="stack">
        <div className="step-head">
          <span className="kicker">发身份 · 房间 {room.code}</span>
          <h2>{left.length ? `等大家看身份（还剩 ${left.length} 人）` : '大家都看完了'}</h2>
        </div>
        <p className="muted">每个人的角色已经发到自己手机上。看完点"看完了"，这里会变成"已看"。之后他们随时能在手机上再看自己的角色。</p>
        {fakes.length > 0 && (
          <div className="card card-warn stack" style={{ gap: 4 }}>
            <b>这些人手机上看到的不是真实身份，别说漏：</b>
            {fakes.map((f) => (
              <p key={f.n}>
                {seatLabel(f.n)} 是{f.role}，看到的是【{f.shown}】
              </p>
            ))}
          </div>
        )}
        <div className="card">
          <SeatList seatNs={seatNs} status={(n) => <span className={st(n) === 'read' ? 'good' : 'dim'}>{STATUS_TEXT[st(n)]}</span>} />
        </div>
        {room.err && <p className="card card-warn">{room.err}</p>}
        {left.length > 0 && (
          <ConfirmButton className="btn btn-outline btn-block" label="有人没收到？重发给还没看的人" confirmLabel={`再点一次：重新发给 ${left.map(seatLabel).join('、')}`} onConfirm={onResend} />
        )}
      </div>
      <BottomBar>
        <button className="btn btn-primary btn-block" disabled={left.length > 0} onClick={onDone}>
          {left.length ? `还有 ${left.map(seatLabel).join('、')} 没看完` : '入夜'}
        </button>
      </BottomBar>
    </main>
  );
}
