import type { ReactNode } from 'react';
import { ROLES, ROLE_LIST, TEAM_NAME, isEvilTeam, roleName, type Team } from '../engine/roles';
import { endLines } from '../engine/scripts';
import { RULES_SPEECH } from '../engine/rulesSpeech';
import type { GameState, LogEntry } from '../engine/types';
import type { Game } from '../store';
import { BottomBar, ConfirmButton, SayBox } from './common';
import { GrimoireCircle } from './Grimoire';
import { Icon } from './icons';

/** 按"开局 / 第N夜 / 第N天"分组的时间线 */
export function Timeline({ log }: { log: LogEntry[] }) {
  const groups: { title: string; items: LogEntry[] }[] = [];
  for (const e of log) {
    const title = e.phase === 'setup' ? '开局' : e.phase === 'night' ? `第 ${e.night} 夜` : e.phase === 'day' ? `第 ${e.night} 天` : '结束';
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.items.push(e);
    else groups.push({ title, items: [e] });
  }
  if (!groups.length) return <p className="dim">还没有记录。</p>;
  return (
    <div className="timeline">
      {groups.map((g, i) => (
        <div key={i}>
          <h4>{g.title}</h4>
          <ul>
            {g.items.map((e, j) => (
              <li key={j} className={e.truth === 'false' ? 'f' : ''}>
                {e.text}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function EndScreen({ g }: { g: Game }) {
  const s = g.s;
  const win = s.winner ?? 'good';
  return (
    <main className="main">
      <div className="stack">
        <div className="hero">
          <span className="dim">游戏结束</span>
          <div className={`winner ${win === 'good' ? 'good' : 'evil'}`}>{win === 'good' ? '善良阵营获胜' : '邪恶阵营获胜'}</div>
          <p className="muted">{s.winReason}</p>
        </div>
        <SayBox lines={endLines(win, s.style)} title="对所有人说" />
        <div className="card">
          <h3>复盘：完整魔典</h3>
          <p className="dim" style={{ marginBottom: 8 }}>
            可以把手机给大家传着看。
          </p>
          <GrimoireCircle s={s} readOnly hub={<b>{s.count} 人局</b>} />
          <div className="stack" style={{ gap: 4, marginTop: 12 }}>
            {s.seats.map((x) => (
              <div key={x.n} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)', padding: '6px 0' }}>
                <span>
                  <b>{x.n}号</b>{' '}
                  <span className={isEvilTeam(ROLES[x.role].team) ? 'evil' : 'good'}>
                    {x.startRole !== x.role ? `${roleName(x.startRole)} → ${roleName(x.role)}` : roleName(x.role)}
                  </span>
                  {x.role === 'drunk' && s.drunkFake && <span className="dim">（以为是{roleName(s.drunkFake)}）</span>}
                </span>
                <span className="dim">{x.alive ? '存活' : `第${x.death?.night}${x.death?.when === 'night' ? '夜' : '天'} ${x.death?.cause}`}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>复盘：每晚发生了什么</h3>
          <p className="dim" style={{ marginBottom: 8 }}>
            红色的是假信息。
          </p>
          <Timeline log={s.log} />
        </div>
      </div>
      <BottomBar>
        <ConfirmButton className="btn btn-primary btn-block" label="新开一局" confirmLabel="再点一次：清空本局，重新开始" onConfirm={g.reset} />
      </BottomBar>
    </main>
  );
}

/* ---------------- 参考页 ---------------- */

export function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="overlay" role="dialog" aria-label={title}>
      <div className="obody">
        <div className="ohead">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="关闭" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function RolesRef({ onClose }: { onClose: () => void }) {
  const teams: Team[] = ['townsfolk', 'outsider', 'minion', 'demon'];
  return (
    <Overlay title="角色速查 · 暗流涌动" onClose={onClose}>
      {teams.map((t) => (
        <div key={t} style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 18, color: isEvilTeam(t) ? 'var(--evil)' : 'var(--good)', margin: '8px 0 0' }}>{TEAM_NAME[t]}</h3>
          {ROLE_LIST.filter((r) => r.team === t).map((r) => (
            <div key={r.id} className="ref-role">
              <h3>{r.name}</h3>
              <p>{r.ability}</p>
              <ul>
                {r.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </Overlay>
  );
}

export function RulesSpeech({ onClose }: { onClose: () => void }) {
  return (
    <Overlay title="规则讲稿（约 5 分钟）" onClose={onClose}>
      <p className="dim" style={{ marginBottom: 12 }}>
        开局前念给新玩家听。照着读就行。
      </p>
      <div className="stack">
        {RULES_SPEECH.map((sec) => (
          <div key={sec.title} className="say">
            <div className="lbl">{sec.title}</div>
            {sec.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        ))}
      </div>
    </Overlay>
  );
}

export function LogView({ s, onClose }: { s: GameState; onClose: () => void }) {
  return (
    <Overlay title="本局记录" onClose={onClose}>
      <Timeline log={s.log} />
    </Overlay>
  );
}
