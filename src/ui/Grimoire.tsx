import { useState, type ReactNode } from 'react';
import { FABLED, ROLES, roleName } from '../engine/roles';
import { aliveCount, seatOf, seatName, circleOrder, isEvil } from '../engine/core';
import { nomResults, voteNeed } from '../engine/flow';
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
  s, onSeat, selected = [], awake = [], hub, readOnly = false,
}: {
  s: GameState;
  onSeat?: (n: number) => void;
  selected?: number[];
  /** 这一步要叫醒的人：圆桌上亮一圈 */
  awake?: number[];
  hub?: ReactNode;
  readOnly?: boolean;
}) {
  // 按圆桌顺序摆（旅行者坐在中间）
  const order = circleOrder(s).map((n) => seatOf(s, n));
  const N = order.length;
  const R = 41;
  const size = Math.min(17, ((2 * Math.PI * R) / N) * 0.86);
  return (
    <div className="grim">
      {order.map((x, i) => {
        const a = (-90 + (i * 360) / N) * (Math.PI / 180);
        const marks = seatMarks(s, x.n);
        const evil = isEvil(x);
        return (
          <button
            key={x.n}
            className={`token${evil ? ' evil-t' : ''}${x.alive ? '' : ' dead'}${selected.includes(x.n) ? ' sel' : ''}${awake.includes(x.n) ? ' awake' : ''}`}
            style={{ left: `${50 + R * Math.cos(a)}%`, top: `${50 + R * Math.sin(a)}%`, width: `${size}%`, height: `${size}%`, cursor: readOnly ? 'default' : 'pointer' }}
            onClick={() => !readOnly && onSeat?.(x.n)}
            tabIndex={readOnly ? -1 : 0}
            aria-label={`${seatName(x.n)} ${roleName(x.role)}${x.alive ? '' : ' 已死亡'}${marks.map((m) => '，' + m.text).join('')}`}
          >
            <span className="tn">{seatName(x.n).replace('号', '')}</span>
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
          <span className="n">{seatName(x.n)}</span>
          <span className={`r ${isEvil(x) ? 'evil' : 'good'}`}>{roleName(x.role)}</span>
          <span className="chips grow" style={{ justifyContent: 'flex-end' }}>
            {!x.alive && <span className="chip">{x.left ? '离场' : '已死亡'}</span>}
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
    <Sheet title={`${seatName(n)} · ${def.name}`} onClose={onClose}>
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
  if (s.phase === 'day') {
    const { block, top } = nomResults(s);
    return (
      <>
        <small>处决至少需要</small>
        <span className="need">
          {voteNeed(s)}
          <small> 票</small>
        </span>
        <small>{block ? `待处决：${seatName(block)}（${top} 票）` : top ? `${top} 票平票，暂无人待处决` : '暂无人待处决'}</small>
      </>
    );
  }
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
export function GrimoirePanel({ s, detail = false, awake = [] }: { s: GameState; detail?: boolean; awake?: number[] }) {
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
      {view === 'circle' ? <GrimoireCircle s={s} onSeat={setSeat} awake={awake} hub={<GrimoireHub s={s} />} /> : <GrimoireList s={s} onSeat={setSeat} />}
      <SetupFacts s={s} />
      <BalanceMeter s={s} detail={detail} expandable />
      <MarkLegend s={s} />
      {seat !== null && <SeatDetail s={s} n={seat} onClose={() => setSeat(null)} />}
    </div>
  );
}

function SetupFacts({ s }: { s: GameState }) {
  return (
    <div className="chips">
      {s.demonChar === 'lilmonsta' && <span className="chip chip-evil">小怪宝：{s.babysitter ? `${seatName(s.babysitter)} 照看` : '还没人照看'}</span>}
      {s.drunkFake && s.seats.some((x) => x.role === 'drunk') && <span className="chip chip-warn">酒鬼以为是：{roleName(s.drunkFake)}</span>}
      {s.lunaticFake && <span className="chip chip-warn">疯子以为是：{roleName(s.lunaticFake)}</span>}
      {s.bluffs.length > 0 && <span className="chip">恶魔伪装：{s.bluffs.map(roleName).join('、')}</span>}
      {s.fabled.map((f) => (
        <span key={f} className="chip">
          传奇：{FABLED[f].name}
        </span>
      ))}
    </div>
  );
}

/** 给间谍看的只读魔典：没有提示、没有按钮，只有「看完了」 */
export function SpyView({ s, onDone }: { s: GameState; onDone: () => void }) {
  return (
    <div className="overlay" style={{ zIndex: 85 }}>
      <div className="obody stack" style={{ paddingBottom: 'calc(120px + var(--safe-b))' }}>
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

/** 标记说明：只列当前魔典上出现的标记 */
const LEGEND: Record<string, string> = {
  trav: '旅行者阵营', vote: '今天投票加减', drunk: '酒鬼', lunatic: '疯子', mario: '提线木偶', align: '阵营和角色不同',
  alch: '炼金术士的能力', zfake: '僵怖假死', swd: '被心上人弄醉', adv: '魔鬼代言人保护', harpy: '鹰身女妖要他疯狂',
  bounty: '赏金猎人盯着', banshee: '报丧女妖', tdrunk: '醉酒到黄昏', gc: '祖母的孙子', inn: '旅店老板保护', po: '珀蓄力',
  poison: '中毒', baby: '照看小怪宝', fear: '恐惧之灵目标', gained: '获得的能力', amn: '失忆者能力', wknow: '知道寡妇在场',
  monk: '僧侣保护', master: '管家主人', rh: '占卜干扰项', used: '能力已用', became: '中途换了角色',
};

function MarkLegend({ s }: { s: GameState }) {
  const seen = new Map<string, string>();
  for (const x of s.seats) for (const m of seatMarks(s, x.n)) if (!seen.has(m.key)) seen.set(m.key, `${m.short}=${LEGEND[m.key] ?? m.text}`);
  if (!seen.size) return null;
  return <div className="dim">标记：{[...seen.values()].join(' ')}</div>;
}
