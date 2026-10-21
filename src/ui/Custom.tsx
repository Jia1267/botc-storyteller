import { useMemo, useState } from 'react';
import { ROLES, ROLE_LIST, TEAM_NAME, type RoleId, type Team } from '../engine/roles';
import { SCRIPT_LIST } from '../engine/editions';
import { customProblems, jinxLabel, jinxesIn, makeCustom, playableRange } from '../engine/custom';
import { setCustomScript } from '../engine/setup';
import type { Game } from '../store';
import { BottomBar } from './common';
import { Icon } from './icons';

const TEAMS: Team[] = ['townsfolk', 'outsider', 'minion', 'demon'];
const SAVE_KEY = 'botc-custom-boards';

interface Saved {
  name: string;
  roles: RoleId[];
}

function loadSaved(): Saved[] {
  try {
    const xs = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '[]') as Saved[];
    return xs.filter((x) => x && typeof x.name === 'string' && Array.isArray(x.roles)).map((x) => ({ ...x, roles: x.roles.filter((r) => ROLES[r]) }));
  } catch {
    return [];
  }
}

function storeSaved(xs: Saved[]) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(xs));
  } catch {
    // 隐私模式等存不了也不影响开局
  }
}

/**
 * 自由配板：点角色加入/拿掉，凑成一个板子，然后照常走"几个人玩 → 配角色 → 发身份 → 夜晚"。
 * 只列网页已经做好的角色，每个角色的夜晚步骤、提示都和现成剧本一样。
 */
export function CustomBoard({ g, onBack }: { g: Game; onBack: () => void }) {
  const cur = g.s.custom;
  const [roles, setRoles] = useState<RoleId[]>(cur?.roles ?? []);
  const [name, setName] = useState(cur?.name ?? '');
  const [saved, setSaved] = useState<Saved[]>(loadSaved);
  const problems = customProblems(roles);
  const range = playableRange(roles);
  const jinxes = useMemo(() => jinxesIn(roles), [roles]);
  const pool = ROLE_LIST.filter((r) => r.team !== 'traveller');
  const toggle = (r: RoleId) => setRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r]);
  const start = () => {
    const def = makeCustom(name, roles);
    const next = [{ name: def.name, roles: def.roles }, ...saved.filter((x) => x.name !== def.name)].slice(0, 12);
    storeSaved(next);
    g.commit((s) => setCustomScript(s, def));
  };
  const remove = (n: string) => {
    const next = saved.filter((x) => x.name !== n);
    setSaved(next);
    storeSaved(next);
  };

  return (
    <main className="main">
      <div className="stack">
        <div className="step-head">
          <span className="kicker">自由配板</span>
          <h2>挑这个板子上的角色</h2>
        </div>
        <p className="muted">点一下加进板子，再点一下拿掉。夜里叫谁、怎么给信息，网页都照常一步一步带你，和现成剧本一样。</p>

        <div className="card stack" style={{ gap: 8 }}>
          <b>从现成的板子开始改</b>
          <div className="row" style={{ gap: 6 }}>
            {SCRIPT_LIST.map((sc) => (
              <button key={sc.id} className="btn btn-sm btn-outline" onClick={() => { setRoles([...sc.roles]); setName(`${sc.name}（改）`); }}>
                {sc.name}
              </button>
            ))}
            {roles.length > 0 && (
              <button className="btn btn-sm btn-ghost" onClick={() => setRoles([])}>
                清空
              </button>
            )}
          </div>
          {saved.length > 0 && (
            <>
              <b style={{ marginTop: 4 }}>我存过的板子</b>
              <div className="stack" style={{ gap: 6 }}>
                {saved.map((x) => (
                  <div key={x.name} className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                    <button className="btn btn-sm btn-outline grow" style={{ justifyContent: 'flex-start' }} onClick={() => { setRoles(x.roles); setName(x.name); }}>
                      {x.name} · {x.roles.length} 个角色
                    </button>
                    <button className="btn btn-sm btn-ghost" aria-label={`删除${x.name}`} onClick={() => remove(x.name)}>
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {TEAMS.map((t) => {
          const all = pool.filter((r) => r.team === t);
          const n = roles.filter((r) => ROLES[r].team === t).length;
          return (
            <div key={t} className="stack" style={{ gap: 6 }}>
              <h3 style={{ margin: 0, color: t === 'minion' || t === 'demon' ? 'var(--evil)' : 'var(--good)' }}>
                {TEAM_NAME[t]} <span className="dim" style={{ fontSize: 14 }}>已选 {n} / {all.length}</span>
              </h3>
              <div className="role-grid compact">
                {all.map((r) => {
                  const on = roles.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      className={`role-chip${t === 'minion' || t === 'demon' ? ' evil-c' : ''}`}
                      style={on ? { boxShadow: '0 0 0 2px var(--gold) inset', fontWeight: 700 } : { opacity: 0.55 }}
                      aria-pressed={on}
                      onClick={() => toggle(r.id)}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className={`card${problems.length ? ' card-warn' : ''} stack`} style={{ gap: 6 }}>
          {problems.length ? (
            problems.map((p) => <p key={p}>{p}</p>)
          ) : (
            <p>
              <b>可以开局：</b>能玩 {range![0] === range![1] ? range![0] : `${range![0]}–${range![1]}`} 人。
            </p>
          )}
          {jinxes.length > 0 && (
            <>
              <b style={{ marginTop: 4 }}>相克（两个角色同时在场时规则要改）</b>
              {jinxes.map((j) => (
                <p key={`${j.a}-${j.b}`} className={j.handled ? 'dim' : ''}>
                  <b>{jinxLabel(j)}</b>：{j.text}
                  {j.handled ? '（网页已按这条处理）' : '（网页还没做这条：随机配角色时不会让它俩同时上场）'}
                </p>
              ))}
              <p className="dim">开局给玩家讲规则时，记得把这些相克念一遍。</p>
            </>
          )}
        </div>

        <label className="stack" style={{ gap: 6 }}>
          <span className="dim">板子的名字（可以不填）</span>
          <input className="input" value={name} maxLength={16} placeholder="自由配板" onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn btn-outline btn-sm" onClick={onBack}>
          返回选剧本
        </button>
      </div>
      <BottomBar>
        <button className="btn btn-primary btn-block" disabled={problems.length > 0} onClick={start}>
          {problems.length ? '角色还不够' : `用这 ${roles.length} 个角色开局`}
        </button>
      </BottomBar>
    </main>
  );
}

