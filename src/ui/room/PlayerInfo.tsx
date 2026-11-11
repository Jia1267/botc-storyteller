// 玩家手机上随时能看的公开信息：剧本角色表、谁还活着的圆桌；入座后确认左右邻座。
import { useState } from 'react';
import { ROLES, TEAM_NAME, roleName, type Team } from '../../engine/roles';
import { roomError, setSeatOk } from '../../room/api';
import { metaSeats, seatLabel, seatNeighbors, type RoomMeta, type SeatInfo } from '../../room/protocol';
import { Sheet } from '../common';

const TEAMS: Team[] = ['townsfolk', 'outsider', 'minion', 'demon'];

/** 剧本角色表：按镇民、外来者、爪牙、恶魔分组，每个角色的能力（AI 局标出一定不会出现的） */
export function ScriptRoles({ script, title, onClose }: { script: NonNullable<RoomMeta['script']>; title: string; onClose: () => void }) {
  const roles = script.roles.filter((r) => ROLES[r]);
  return (
    <Sheet title={`${title} · 角色表`} onClose={onClose}>
      {TEAMS.map((t) => {
        const rs = roles.filter((r) => ROLES[r].team === t);
        if (!rs.length) return null;
        return (
          <div key={t} className="stack" style={{ gap: 8, marginBottom: 14 }}>
            <h3 className={t === 'minion' || t === 'demon' ? 'evil' : 'good'}>
              {TEAM_NAME[t]}（{rs.length}）
            </h3>
            {rs.map((r) => (
              <div key={r}>
                <b>{roleName(r)}</b>
                {script.missing?.includes(r) && <span className="dim">（这局一定不会出现）</span>}
                <p className="dim" style={{ margin: '2px 0 0' }}>
                  {ROLES[r].ability}
                </p>
              </div>
            ))}
          </div>
        );
      })}
    </Sheet>
  );
}

/** 圆桌：1 号在最上面，顺时针排；死了的虚线变暗，你自己金色框 */
export function SeatRing({ order: seatNs, alive, ghost = [], me, seats }: { order: number[]; alive: number[]; ghost?: number[]; me: number; seats: Record<string, SeatInfo> }) {
  const N = seatNs.length;
  // 座位方块的边长跟着人数变：人越多方块越小，斜着排的地方也不会压在一起
  const size = `${Math.min(18, 57 * Math.sin(Math.PI / N))}%`;
  return (
    <div className={`seat-ring${N > 12 ? ' tight' : ''}${N > 16 ? ' tighter' : ''}`} role="list" aria-label="座位：谁还活着">
      <div className="seat-ring-mid">
        存活 {seatNs.filter((n) => alive.includes(n)).length} / {N}
      </div>
      {seatNs.map((n, i) => {
        const a = (i / N) * 2 * Math.PI - Math.PI / 2;
        const dead = !alive.includes(n);
        const name = n === me ? '你' : (seats[n]?.name ?? '');
        return (
          <div
            key={n}
            role="listitem"
            className={`ring-seat${dead ? ' dead' : ''}${n === me ? ' me' : ''}`}
            style={{ left: `${50 + 41 * Math.cos(a)}%`, top: `${50 + 41 * Math.sin(a)}%`, width: size }}
            aria-label={`${seatLabel(n)}${name ? ` ${name}` : ''}${dead ? '，已死' : ''}`}
          >
            <b>{N > 16 && n < 100 ? n : seatLabel(n)}</b>
            <small>{dead ? (ghost.includes(n) ? '已死·有票' : '已死') : name}</small>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 入座后确认左右邻座：座位按顺时针数，你后面一个号坐在你左手边。
 * 坐错了号，共情者、厨师这些和邻座有关的信息整局都会错，所以开局前每个人自己对一遍；有人说不对就不能开始。
 */
export function NeighborCheck({ code, seat, meta, seats }: { code: string; seat: number; meta: RoomMeta; seats: Record<string, SeatInfo> }) {
  const [err, setErr] = useState<string | null>(null);
  const nb = seatNeighbors(metaSeats(meta), seat);
  if (!nb) return null;
  const { left, right } = nb;
  const who = (n: number) => `${seatLabel(n)}${seats[n] ? (seats[n].name ? `（${seats[n].name}）` : '') : '（还没人坐）'}`;
  const ready = !!seats[left] && !!seats[right];
  const ok = seats[seat]?.ok;
  const answer = (v: boolean) => setSeatOk(code, seat, v).catch((e) => setErr(roomError(e)));
  return (
    <div className={`card stack${ok === false ? ' card-warn' : ''}`} style={{ gap: 8 }}>
      <b>对一下左右邻座</b>
      <p style={{ margin: 0 }}>
        你左手边应该是 {who(left)}，右手边是 {who(right)}。
      </p>
      {!ready ? (
        <p className="dim" style={{ margin: 0 }}>
          等左右两边的人都坐好再确认。
        </p>
      ) : ok === undefined ? (
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary grow" onClick={() => answer(true)}>
            对
          </button>
          <button className="btn btn-outline grow" onClick={() => answer(false)}>
            不对
          </button>
        </div>
      ) : ok ? (
        <div className="row" style={{ gap: 8, justifyContent: 'space-between' }}>
          <span className="dim">你确认过了：邻座对。</span>
          <button className="btn btn-ghost btn-sm" onClick={() => answer(false)}>
            其实不对
          </button>
        </div>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          <span>你说邻座不对：说书人那边会看到，换好座位以前不能开始。</span>
          <button className="btn btn-outline btn-sm" onClick={() => answer(true)}>
            现在对了
          </button>
        </div>
      )}
      {err && <p className="card card-warn">{err}</p>}
    </div>
  );
}
