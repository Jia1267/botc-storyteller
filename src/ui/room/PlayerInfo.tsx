// 玩家手机上随时能看的公开信息：剧本角色表、谁还活着的圆桌。
import { ROLES, TEAM_NAME, roleName, type Team } from '../../engine/roles';
import { seatLabel, type RoomMeta, type SeatInfo } from '../../room/protocol';
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
