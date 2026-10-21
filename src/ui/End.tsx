import { isEvil, scriptOf, seatName } from '../engine/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ROLES, TEAM_NAME, TRAVELLER_ROLES, isEvilTeam, roleName, type FabledId, type Team } from '../engine/roles';
import { SCRIPT_LIST, type ScriptDef } from '../engine/editions';
import { endLines } from '../engine/scripts';
import { balance } from '../engine/balance';
import { rulesFor } from '../engine/rulesSpeech';
import type { GameState, LogEntry } from '../engine/types';
import type { Game } from '../store';
import { BottomBar, ConfirmButton, SayBox, useEscape } from './common';
import { GrimoireCircle } from './Grimoire';
import { Icon } from './icons';
import { Emblem } from './Emblem';
import { drawResult, drawScriptSheet, endWhen, keyMoments } from './result';

/** 按"开局 / 第N夜 / 第N天"分组的时间线 */
export function Timeline({ log }: { log: LogEntry[] }) {
  const groups: { title: string; items: LogEntry[] }[] = [];
  for (const e of log) {
    const title = e.phase === 'setup' ? '开局' : e.phase === 'night' ? `第 ${e.night} 夜` : e.phase === 'day' ? `第 ${e.night} 天` : '结束';
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.items.push(e);
    else groups.push({ title, items: [e] });
  }
  if (!groups.length) return <p className="dim">还没有记录。开局以后，每晚谁做了什么、白天谁被提名和处决，都会按顺序记在这里，复盘时可以对着看。</p>;
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

/** 导出本局数据（JSON）：新开一局会清掉这一局，留着复盘或者校准平衡用 */
function exportGame(s: GameState, hist: GameState[]) {
  const timeline: { night: number; phase: string; score: number }[] = [];
  for (const h of [...hist, s]) {
    if (h.phase !== 'night' && h.phase !== 'day') continue;
    const item = { night: h.night, phase: h.phase, score: Math.round(balance(h).score) };
    const last = timeline[timeline.length - 1];
    if (last && last.night === item.night && last.phase === item.phase) timeline[timeline.length - 1] = item;
    else timeline.push(item);
  }
  const date = new Date(s.endedAt ?? Date.now());
  const day = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const data = { app: '钟楼说书人', version: 1, exportedAt: new Date().toISOString(), script: scriptOf(s).name, count: s.count, winner: s.winner, winReason: s.winReason, timeline, game: s };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `钟楼说书人-${scriptOf(s).name}-${day}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function EndScreen({ g }: { g: Game }) {
  const s = g.s;
  const win = s.winner ?? 'good';
  const [result, setResult] = useState(false);
  const w = endWhen(s);
  return (
    <main className={`main endv3${win === 'evil' ? ' win-evil' : ''}`}>
      <div className="endv3-bg" />
      <div className="stack">
        <div className="hero">
          <Emblem team={win} size={96} />
          <div className="winner">{win === 'good' ? '善良阵营获胜' : '邪恶阵营获胜'}</div>
          <p className="why">{s.winReason}</p>
          <div className="facts">
            <div>
              <b>{s.count}</b>
              <small>人局</small>
            </div>
            <div>
              <b>{w.n}</b>
              <small>{w.unit}</small>
            </div>
            <div>
              <b>{s.seats.filter((x) => x.alive && !x.traveller).length}</b>
              <small>人存活</small>
            </div>
          </div>
        </div>
        <SayBox lines={endLines(win, s.style)} title="对所有人说" />
        {(() => {
          const pol = s.seats.find((x) => x.role === 'politician');
          if (!pol || (isEvil(pol) ? 'evil' : 'good') === win) return null;
          return (
            <div className="card card-warn">
              <b>政客（{seatName(pol.n)}）：他的阵营输了</b>
              <p className="dim">如果你判断他是让自己阵营输掉的最大责任人（而且他没中毒醉酒），宣布他改换阵营，也算获胜。</p>
            </div>
          );
        })()}
        <div className="card">
          <h3>复盘：完整魔典</h3>
          <p className="dim" style={{ marginBottom: 8 }}>
            可以把屏幕给大家传着看。
          </p>
          <GrimoireCircle s={s} readOnly hub={<b>{s.count} 人局{s.seats.length > s.count && <small><br />+{s.seats.length - s.count} 旅行者</small>}</b>} />
          <div className="rlegend">
            <span><i className="lg-good" />善良</span>
            <span><i className="lg-evil" />邪恶</span>
            <span><i className="lg-dead" />已死亡</span>
          </div>
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
          <h3>这一局的关键时刻</h3>
          <ul className="moments">
            {keyMoments(s).map((m, i) => (
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
          <Timeline log={s.log} />
        </div>
        <div className="card stack" style={{ gap: 8 }}>
          <h3>本局数据</h3>
          <p className="dim">新开一局会清掉这一局。想留着复盘，或者以后用来校准局势分，先导出一份。</p>
          <button className="btn btn-outline btn-block" onClick={() => exportGame(s, g.hist)}>
            导出本局数据（JSON 文件）
          </button>
        </div>
        <p className="legal">钟楼说书人 · 非官方桌游辅助工具，与任何桌游发行方无关</p>
      </div>
      <BottomBar>
        <button className="btn btn-ghost" onClick={() => setResult(true)}>
          <Icon name="share" size={18} /> 结果图
        </button>
        <ConfirmButton className="btn btn-primary grow" label="新开一局" confirmLabel="再点一次：清空本局，重新开始" onConfirm={g.reset} />
      </BottomBar>
      {result && <ResultImage s={s} onClose={() => setResult(false)} />}
    </main>
  );
}

/** 结果图：发到群里用（图上只有座位号、角色和胜负，写明非官方工具） */
function ResultImage({ s, onClose }: { s: GameState; onClose: () => void }) {
  const [img, setImg] = useState<{ url: string; blob: Blob } | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    drawResult(s).then(setImg, () => setMsg('生成失败，请关掉再试一次。'));
  }, [s]);
  const name = `钟楼说书人-${scriptOf(s).name}-${s.winner === 'evil' ? '邪恶' : '善良'}获胜.png`;
  const share = async () => {
    if (!img) return;
    setMsg('');
    try {
      const file = new File([img.blob], name, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: '这一局的结果' });
      else setMsg('这个浏览器不能直接分享图片：长按上面的图片，选"发送给朋友"或"保存图片"。');
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setMsg('分享失败：长按上面的图片，选"发送给朋友"或"保存图片"。');
    }
  };
  return (
    <Overlay title="结果图" onClose={onClose}>
      {img ? <img className="result-img" src={img.url} alt="这一局的结果图" /> : <p className="dim">正在生成……</p>}
      {/* 图比屏幕高时，分享和保存也一直在底部看得见 */}
      <div className="row sticky-actions">
        <button className="btn btn-primary grow" disabled={!img} onClick={share}>
          分享到群里
        </button>
        <a className="btn btn-outline grow" href={img?.url} download={name}>
          保存图片
        </a>
      </div>
      {msg && <p className="dim" style={{ marginTop: 8 }}>{msg}</p>}
      <p className="dim" style={{ marginTop: 8 }}>在微信里打开时，长按图片就能直接发给朋友或保存。</p>
    </Overlay>
  );
}

/* ---------------- 参考页 ---------------- */

export function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEscape(onClose, box);
  return (
    <div ref={box} tabIndex={-1} className="overlay" role="dialog" aria-modal="true" aria-label={title}>
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

export function RolesRef({ sc, onClose }: { sc: ScriptDef; onClose: () => void }) {
  const teams: Team[] = ['townsfolk', 'outsider', 'minion', 'demon'];
  return (
    <Overlay title={`角色速查 · ${sc.name}`} onClose={onClose}>
      {teams.map((t) => (
        <div key={t} style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 18, color: isEvilTeam(t) ? 'var(--evil)' : 'var(--good)', margin: '8px 0 0' }}>{TEAM_NAME[t]}</h3>
          {sc.roles.map((id) => ROLES[id]).filter((r) => r.team === t).map((r) => (
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

/** 剧本图：给不熟这个剧本的人看，也可以发给玩家。没有现成图片的（梦殒春宵、自由配板）由网页画一张 */
export function ScriptSheet({ sc: start, onClose }: { sc: ScriptDef; onClose: () => void }) {
  const [sc, setSc] = useState<ScriptDef>(start);
  const [msg, setMsg] = useState('');
  const [drawn, setDrawn] = useState<{ id: string; url: string; blob: Blob } | null>(null);
  const tabs = start.id === 'custom' ? [start, ...SCRIPT_LIST] : SCRIPT_LIST;
  useEffect(() => {
    if (sc.image) return;
    let live = true;
    drawScriptSheet(sc).then((r) => live && setDrawn({ id: sc.name, ...r }));
    return () => {
      live = false;
    };
  }, [sc]);
  const gen = !sc.image ? (drawn?.id === sc.name ? drawn : null) : null;
  const src = sc.image ? `${import.meta.env.BASE_URL}scripts/${sc.image}` : (gen?.url ?? '');
  const ext = sc.image ? 'jpg' : 'png';
  const share = async () => {
    setMsg('');
    try {
      const blob = gen ? gen.blob : await (await fetch(src)).blob();
      const file = new File([blob], `${sc.name}.${ext}`, { type: gen ? 'image/png' : 'image/jpeg' });
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
        {tabs.map((x) => (
          <button key={x.id} className={`btn btn-sm ${x.id === sc.id ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setSc(x); setMsg(''); }}>
            {x.name}
          </button>
        ))}
      </div>
      <p className="dim" style={{ marginBottom: 8 }}>
        {sc.min}–{sc.max} 人 · {sc.roles.length} 个角色。双指可以放大看。
      </p>
      {src ? (
        <img src={src} alt={`${sc.name}剧本图`} style={{ width: '100%', borderRadius: 8, display: 'block' }} />
      ) : (
        <p className="dim">正在画剧本图……</p>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary grow" onClick={share}>
          分享给玩家
        </button>
        <a className="btn btn-outline grow" href={src} download={`${sc.name}.${ext}`}>
          保存图片
        </a>
      </div>
      {msg && <p className="dim" style={{ marginTop: 8 }}>{msg}</p>}
      <p className="dim" style={{ marginTop: 8 }}>在微信里打开时，长按图片就能直接发给朋友或保存。</p>
    </Overlay>
  );
}

export function RulesSpeech({ sc, fabled = [], onClose }: { sc: ScriptDef; fabled?: FabledId[]; onClose: () => void }) {
  return (
    <Overlay title="规则讲稿（约 5 分钟）" onClose={onClose}>
      <p className="dim" style={{ marginBottom: 12 }}>
        开局前念给新玩家听。照着读就行。
      </p>
      <div className="stack">
        {rulesFor(sc, fabled).map((sec) => (
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
