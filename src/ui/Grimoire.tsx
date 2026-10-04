import { useState, type ReactNode } from 'react';
import { ROLES, isEvilTeam, roleName } from '../engine/roles';
import { aliveCount, seatOf } from '../engine/core';
import type { GameState } from '../engine/types';
import { BalanceMeter, Sheet, TeamChip, seatMarks } from './common';
import { Icon } from './icons';

export function phaseText(s: GameState): string {
  if (s.phase === 'night') return `第 ${s.night} 夜`;
  if (s.phase === 'day') return `第 ${s.night} 天`;
  if (s.phase === 'end') return '游戏结束';
  if (s.phase === 'deal') return '发身份';
  return '开局';
}

export function GrimoireCircle({
  s, onSeat, selected = [], hub, readOnly = false,
}: {
  s: GameState;
  onSeat?: (n: number) => void;
  selected?: number[];
  hub?: ReactNode;
  readOnly?: boolean;
}) {
  const N = s.seats.length;
  const R = 41;
  const size = Math.min(17, ((2 * Math.PI * R) / N) * 0.86);
  return (
    <div className="grim">
      {s.seats.map((x, i) => {
        const a = (-90 + (i * 360) / N) * (Math.PI / 180);
        const marks = seatMarks(s, x.n);
        const evil = isEvilTeam(ROLES[x.role].team);
        return (
          <button
            key={x.n}
            className={`token${evil ? ' evil-t' : ''}${x.alive ? '' : ' dead'}${selected.includes(x.n) ? ' sel' : ''}`}
            style={{ left: `${50 + R * Math.cos(a)}%`, top: `${50 + R * Math.sin(a)}%`, width: `${size}%`, height: `${size}%`, cursor: readOnly ? 'default' : 'pointer' }}
            onClick={() => !readOnly && onSeat?.(x.n)}
            tabIndex={readOnly ? -1 : 0}
            aria-label={`${x.n}号 ${roleName(x.role)}${x.alive ? '' : ' 已死亡'}${marks.map((m) => '，' + m.text).join('')}`}
          >
            <span className="tn">{x.n}</span>
            <span className="tr">{ROLES[x.role].short}</span>
            {marks.length > 0 && (
              <span className="marks">
                {marks.slice(0, 3).map((m) => (
                  <span key={m.key} className={m.cls}>
                    {m.short}
                  </span>
                ))}
              </span>
            )}
          </button>
        );
      })}
      <div className="hub">{hub}</div>
    </div>
  );
}

export function GrimoireList({ s, onSeat }: { s: GameState; onSeat?: (n: number) => void }) {
  return (
    <div className="glist">
      {s.seats.map((x) => (
        <button key={x.n} className={`gi${x.alive ? '' : ' dead'}`} onClick={() => onSeat?.(x.n)} disabled={!onSeat} style={onSeat ? undefined : { cursor: 'default', color: 'inherit' }}>
          <span className="n">{x.n}号</span>
          <span className={`r ${isEvilTeam(ROLES[x.role].team) ? 'evil' : 'good'}`}>{roleName(x.role)}</span>
          <span className="chips grow" style={{ justifyContent: 'flex-end' }}>
            {!x.alive && <span className="chip">已死亡</span>}
            {seatMarks(s, x.n).map((m) => (
              <span key={m.key} className={`chip${m.cls === 'm-poison' ? ' chip-poison' : m.cls === 'm-drunk' ? ' chip-warn' : m.cls === 'm-evil' ? ' chip-evil' : ''}`}>
                {m.short}
              </span>
            ))}
          </span>
        </button>
      ))}
    </div>
  );
}

export function SeatDetail({ s, n, onClose }: { s: GameState; n: number; onClose: () => void }) {
  const x = seatOf(s, n);
  const def = ROLES[x.role];
  const marks = seatMarks(s, n);
  return (
    <Sheet title={`${n}号 · ${def.name}`} onClose={onClose}>
      <div className="stack">
        <div className="chips">
          <TeamChip team={def.team} />
          {!x.alive && (
            <span className="chip">
              已死亡：第 {x.death?.night} {x.death?.when === 'night' ? '夜' : '天'}，{x.death?.cause}
            </span>
          )}
        </div>
        {marks.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {marks.map((m) => (
              <li key={m.key}>{m.text}</li>
            ))}
          </ul>
        )}
        <p>{def.ability}</p>
        <div className="card">
          <h3>说书人要点</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }} className="muted">
            {def.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </Sheet>
  );
}

export function GrimoireHub({ s }: { s: GameState }) {
  return (
    <>
      <b>{phaseText(s)}</b>
      <small>
        存活 {aliveCount(s)} / {s.count}
      </small>
    </>
  );
}

/** 平板侧栏 & 魔典浮层共用 */
export function GrimoirePanel({ s, detail = false }: { s: GameState; detail?: boolean }) {
  const [view, setView] = useState<'circle' | 'list'>('circle');
  const [seat, setSeat] = useState<number | null>(null);
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="seg" role="tablist">
          <button className={view === 'circle' ? 'on' : ''} onClick={() => setView('circle')}>
            <Icon name="circle" size={16} /> 圆桌
          </button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
            <Icon name="list" size={16} /> 列表
          </button>
        </div>
        <span className="dim">点座位看详情</span>
      </div>
      {view === 'circle' ? <GrimoireCircle s={s} onSeat={setSeat} hub={<GrimoireHub s={s} />} /> : <GrimoireList s={s} onSeat={setSeat} />}
      <SetupFacts s={s} />
      <BalanceMeter s={s} detail={detail} />
      <div className="dim">标记：醉=酒鬼 毒=中毒 护=僧侣保护 主=管家主人 扰=占卜干扰项 用=能力已用 变=中途变成恶魔</div>
      {seat !== null && <SeatDetail s={s} n={seat} onClose={() => setSeat(null)} />}
    </div>
  );
}

function SetupFacts({ s }: { s: GameState }) {
  return (
    <div className="chips">
      {s.drunkFake && s.seats.some((x) => x.role === 'drunk') && <span className="chip chip-warn">酒鬼以为是：{roleName(s.drunkFake)}</span>}
      {s.bluffs.length > 0 && <span className="chip">恶魔伪装：{s.bluffs.map(roleName).join('、')}</span>}
    </div>
  );
}

/** 给间谍看的只读魔典：没有提示、没有按钮，只有「看完了」 */
export function SpyView({ s, onDone }: { s: GameState; onDone: () => void }) {
  return (
    <div className="overlay" style={{ zIndex: 85 }}>
      <div className="obody stack" style={{ paddingBottom: 90 }}>
        <h2 className="center" style={{ fontSize: 26, paddingTop: 8 }}>
          魔典
        </h2>
        <GrimoireCircle s={s} readOnly hub={<b>{phaseText(s)}</b>} />
        <GrimoireList s={s} />
        <SetupFacts s={s} />
      </div>
      <div className="bottombar">
        <div className="inner">
          <button className="btn btn-ghost btn-block" onClick={onDone}>
            看完了
          </button>
        </div>
      </div>
    </div>
  );
}
