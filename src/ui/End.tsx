import { isEvil, seatName } from '../engine/core';
import { useState, type ReactNode } from 'react';
import { ROLES, TEAM_NAME, TRAVELLER_ROLES, isEvilTeam, roleName, type Team } from '../engine/roles';
import { SCRIPTS, SCRIPT_LIST, type ScriptId } from '../engine/editions';
import { endLines } from '../engine/scripts';
import { rulesFor } from '../engine/rulesSpeech';
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
          <GrimoireCircle s={s} readOnly hub={<b>{s.count} 人局{s.seats.length > s.count && <small><br />+{s.seats.length - s.count} 旅行者</small>}</b>} />
          <div className="stack" style={{ gap: 4, marginTop: 12 }}>
            {s.seats.map((x) => (
              <div key={x.n} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)', padding: '6px 0' }}>
                <span>
                  <b>{seatName(x.n)}</b>{' '}
                  <span className={isEvil(x) ? 'evil' : 'good'}>
                    {x.startRole !== x.role ? `${roleName(x.startRole)} → ${roleName(x.role)}` : roleName(x.role)}
                  </span>
                  {x.role === 'drunk' && s.drunkFake && <span className="dim">（以为是{roleName(s.drunkFake)}）</span>}
                  {x.role === 'lunatic' && s.lunaticFake && <span className="dim">（以为是{roleName(s.lunaticFake)}）</span>}
                  {x.role === 'marionette' && s.marionetteFake && <span className="dim">（以为是{roleName(s.marionetteFake)}）</span>}
                  {!x.traveller && x.alignment && <span className="dim">（{x.alignment === 'evil' ? '邪恶' : '善良'}阵营）</span>}
                  {x.traveller && <span className="dim">（旅行者，{x.traveller.alignment === 'evil' ? '邪恶' : '善良'}）</span>}
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

export function RolesRef({ script, onClose }: { script: ScriptId; onClose: () => void }) {
  const teams: Team[] = ['townsfolk', 'outsider', 'minion', 'demon'];
  return (
    <Overlay title={`角色速查 · ${SCRIPTS[script].name}`} onClose={onClose}>
      {teams.map((t) => (
        <div key={t} style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 18, color: isEvilTeam(t) ? 'var(--evil)' : 'var(--good)', margin: '8px 0 0' }}>{TEAM_NAME[t]}</h3>
          {SCRIPTS[script].roles.map((id) => ROLES[id]).filter((r) => r.team === t).map((r) => (
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
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ fontSize: 18, color: 'var(--gold)', margin: '8px 0 0' }}>{TEAM_NAME.traveller}（人多或有人早退时用）</h3>
        {TRAVELLER_ROLES.map((id) => ROLES[id]).map((r) => (
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
    </Overlay>
  );
}

/** 剧本图：给不熟这个剧本的人看，也可以发给玩家 */
export function ScriptSheet({ script, onClose }: { script: ScriptId; onClose: () => void }) {
  const [id, setId] = useState<ScriptId>(script);
  const [msg, setMsg] = useState('');
  const sc = SCRIPTS[id];
  const src = `${import.meta.env.BASE_URL}scripts/${sc.image}`;
  const share = async () => {
    setMsg('');
    try {
      const blob = await (await fetch(src)).blob();
      const file = new File([blob], `${sc.name}.jpg`, { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `血染钟楼剧本：${sc.name}` });
      else setMsg('这个浏览器不能直接分享图片：长按上面的图片，选"发送给朋友"或"保存图片"。');
    } catch (e) {
      // 用户自己取消分享不算出错
      if ((e as Error)?.name !== 'AbortError') setMsg('分享失败：长按上面的图片，选"发送给朋友"或"保存图片"。');
    }
  };
  return (
    <Overlay title={`剧本图 · ${sc.name}`} onClose={onClose}>
      <div className="row" style={{ gap: 6, marginBottom: 10 }}>
        {SCRIPT_LIST.map((x) => (
          <button key={x.id} className={`btn btn-sm ${x.id === id ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setId(x.id); setMsg(''); }}>
            {x.name}
          </button>
        ))}
      </div>
      <p className="dim" style={{ marginBottom: 8 }}>
        {sc.min}–{sc.max} 人 · {sc.roles.length} 个角色。双指可以放大看。
      </p>
      <img src={src} alt={`${sc.name}剧本图`} style={{ width: '100%', borderRadius: 8, display: 'block' }} />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary grow" onClick={share}>
          分享给玩家
        </button>
        <a className="btn btn-outline grow" href={src} download={`${sc.name}.jpg`}>
          保存图片
        </a>
      </div>
      {msg && <p className="dim" style={{ marginTop: 8 }}>{msg}</p>}
      <p className="dim" style={{ marginTop: 8 }}>在微信里打开时，长按图片就能直接发给朋友或保存。</p>
    </Overlay>
  );
}

export function RulesSpeech({ script, onClose }: { script: ScriptId; onClose: () => void }) {
  return (
    <Overlay title="规则讲稿（约 5 分钟）" onClose={onClose}>
      <p className="dim" style={{ marginBottom: 12 }}>
        开局前念给新玩家听。照着读就行。
      </p>
      <div className="stack">
        {rulesFor(script).map((sec) => (
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
