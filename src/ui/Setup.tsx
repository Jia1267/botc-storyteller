import { useMemo, useState } from 'react';
import { ROLES, TEAM_NAME, isEvilTeam, rolesOfTeam, roleName, type RoleId, type Team } from '../engine/roles';
import { recommend, setupLabel, balance } from '../engine/balance';
import { addLog, inPlay, notInPlay } from '../engine/core';
import { defaultRng } from '../engine/rng';
import {
  DISTRIBUTION, F4, MAX_F4, MAX_PLAYERS, MIN_PLAYERS, bluffChoices, drunkFakeChoices, redHerringChoices,
  replaceRole, rerollRoles, setCount, setupReasons, shuffleSeats, startDeal, swapSeats,
} from '../engine/setup';
import { stepRng, type Game } from '../store';
import { BottomBar, ChoicePanel, Sheet, SeatPicker } from './common';
import { GrimoireCircle } from './Grimoire';
import { Icon } from './icons';

export function SetupScreen({ g, onRules, onRoles }: { g: Game; onRules: () => void; onRoles: () => void }) {
  if (g.s.setupStep === 'count') return <CountStep g={g} onRules={onRules} onRoles={onRoles} />;
  if (g.s.setupStep === 'roles') return <RolesStep g={g} />;
  return <SeatsStep g={g} onRules={onRules} />;
}

function CountStep({ g, onRules, onRoles }: { g: Game; onRules: () => void; onRoles: () => void }) {
  const counts = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS);
  return (
    <main className="main">
      <div className="stack">
        <div className="hero">
          <h1>钟楼说书人</h1>
          <p className="sub">暗流涌动 · 一步一屏带你主持一整局</p>
        </div>
        <h2 style={{ fontSize: 22 }}>几个人玩？</h2>
        <p className="dim">不算说书人。选好后网页会自动配一套均衡的角色。</p>
        <div className="count-grid">
          {counts.map((n) => {
            const [t, o, m] = DISTRIBUTION[n];
            return (
              <button key={n} className="btn btn-ghost" onClick={() => g.commit((s) => setCount(s, n, defaultRng))}>
                {n}
                <small>
                  {t}镇 {o}外 {m}爪 1恶
                </small>
              </button>
            );
          })}
        </div>
        <div className="row">
          <button className="btn btn-outline btn-sm grow" onClick={onRules}>
            给新玩家的规则讲稿
          </button>
          <button className="btn btn-outline btn-sm grow" onClick={onRoles}>
            角色速查
          </button>
        </div>
      </div>
    </main>
  );
}

const TEAMS: Team[] = ['townsfolk', 'outsider', 'minion', 'demon'];

function RolesStep({ g }: { g: Game }) {
  const s = g.s;
  const [edit, setEdit] = useState<number | null>(null);
  const roles = s.seats.map((x) => x.role);
  const reasons = setupReasons(roles);
  const label = setupLabel(s.setupZ);
  return (
    <main className="main">
      <div className="stack">
        <div className="step-head">
          <span className="kicker">开局设置 · 第 1 步 / 共 2 步</span>
          <h2>{s.count} 人的角色</h2>
        </div>
        <div className={`card${label === '均衡' ? '' : ' card-warn'}`}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>配板强度：{label}</b>
            <span className="dim">{s.setupZ > 0 ? '+' : ''}{s.setupZ.toFixed(1)}</span>
          </div>
          {reasons.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }} className="muted">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {label !== '均衡' && <p className="dim" style={{ marginTop: 6 }}>新手建议点「换一套」，选到"均衡"再开。</p>}
        </div>
        {TEAMS.map((t) => {
          const xs = s.seats.filter((x) => ROLES[x.role].team === t);
          if (!xs.length) return null;
          return (
            <div key={t} className="stack" style={{ gap: 8 }}>
              <div className="dim">
                {TEAM_NAME[t]}（{xs.length}）{t !== 'demon' && ' · 点角色可以换'}
              </div>
              <div className="role-grid">
                {xs.map((x) => (
                  <button key={x.n} className={`role-chip${isEvilTeam(t) ? ' evil-c' : ''}`} onClick={() => t !== 'demon' && setEdit(x.n)}>
                    {roleName(x.role)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <button className="btn btn-outline btn-sm" onClick={() => g.commit((st) => (st.setupStep = 'count'))}>
          改人数
        </button>
      </div>
      {edit !== null && (
        <RolePicker
          team={ROLES[s.seats[edit - 1].role].team}
          current={s.seats[edit - 1].role}
          taken={roles}
          onPick={(r) => {
            g.commit((st) => replaceRole(st, edit, r, defaultRng));
            setEdit(null);
          }}
          onClose={() => setEdit(null)}
        />
      )}
      <BottomBar>
        <button className="btn btn-ghost" onClick={() => g.commit((st) => rerollRoles(st, defaultRng))}>
          <Icon name="shuffle" size={18} /> 换一套
        </button>
        <button className="btn btn-primary grow" onClick={() => g.commit((st) => (st.setupStep = 'seats'))}>
          下一步：排座位
        </button>
      </BottomBar>
    </main>
  );
}

function RolePicker({ team, current, taken, onPick, onClose }: { team: Team; current: RoleId; taken: RoleId[]; onPick: (r: RoleId) => void; onClose: () => void }) {
  const opts = rolesOfTeam(team).filter((r) => r !== current && !taken.includes(r));
  const f4Others = taken.filter((r) => r !== current && F4.includes(r)).length;
  return (
    <Sheet title={`把【${roleName(current)}】换成`} onClose={onClose}>
      <div className="choices">
        {opts.length === 0 && <p className="dim">这个阵营的角色都已经在场了。</p>}
        {opts.map((r) => (
          <button key={r} className="choice" onClick={() => onPick(r)}>
            <span className="lab">{roleName(r)}</span>
            <span className="why">{ROLES[r].ability}</span>
            {(r === 'baron' || current === 'baron') && <span className="why" style={{ color: 'var(--warn)' }}>男爵会让外来者 +2、镇民 −2，网页会自动调整。</span>}
            {F4.includes(r) && f4Others >= MAX_F4 && (
              <span className="why" style={{ color: 'var(--warn)' }}>
                场上已有 {f4Others} 个首夜信息位，换上它就是第 {f4Others + 1} 个（可以，但这几个人第一晚后没事做）。
              </span>
            )}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

type Edit = 'drunk' | 'bluffs' | 'rh' | null;

function SeatsStep({ g, onRules }: { g: Game; onRules: () => void }) {
  const s = g.s;
  const [first, setFirst] = useState<number | null>(null);
  const [edit, setEdit] = useState<Edit>(null);
  const drunk = s.seats.find((x) => x.role === 'drunk');
  const ft = s.seats.find((x) => x.role === 'fortuneteller');

  const tapSeat = (n: number) => {
    if (first === null) setFirst(n);
    else {
      if (first !== n) g.commit((st) => swapSeats(st, first, n, defaultRng));
      setFirst(null);
    }
  };

  return (
    <main className="main">
      <div className="stack">
        <div className="step-head">
          <span className="kicker">开局设置 · 第 2 步 / 共 2 步</span>
          <h2>座位与特殊设置</h2>
        </div>
        <p className="muted">
          玩家按顺时针坐成一圈，1 号开始。角色已随机分好。想调换：先点一个座位，再点另一个。
        </p>
        <GrimoireCircle
          s={s}
          onSeat={tapSeat}
          selected={first ? [first] : []}
          hub={first ? <b>再点一个座位交换</b> : <small>{s.count} 人</small>}
        />
        <button className="btn btn-ghost btn-sm" onClick={() => g.commit((st) => shuffleSeats(st, defaultRng))}>
          <Icon name="shuffle" size={18} /> 重新随机座位
        </button>

        {drunk && s.drunkFake && (
          <div className="card">
            <h3>酒鬼</h3>
            <p>
              {drunk.n}号 是酒鬼，他会以为自己是 <b className="good">【{roleName(s.drunkFake)}】</b>
            </p>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={() => setEdit('drunk')}>
              更换假身份
            </button>
          </div>
        )}
        <div className="card">
          <h3>恶魔的 3 个伪装</h3>
          <p>{s.bluffs.map(roleName).join('、') || '（无）'}</p>
          <p className="dim">这些角色不在场，第一晚告诉恶魔，他可以假装成这些角色。</p>
          <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={() => setEdit('bluffs')}>
            看理由 / 更换
          </button>
        </div>
        {ft && s.redHerring && (
          <div className="card">
            <h3>占卜师的干扰项</h3>
            <p>
              {s.redHerring}号（{roleName(s.seats[s.redHerring - 1].role)}）：占卜师查到他也会得到"有恶魔"。
            </p>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={() => setEdit('rh')}>
              看理由 / 更换
            </button>
          </div>
        )}
        <div className="row">
          <button className="btn btn-outline btn-sm grow" onClick={() => g.commit((st) => (st.setupStep = 'roles'))}>
            返回改角色
          </button>
          <button className="btn btn-outline btn-sm grow" onClick={onRules}>
            给新玩家讲规则
          </button>
        </div>
      </div>
      {edit === 'drunk' && <DrunkEdit g={g} onClose={() => setEdit(null)} />}
      {edit === 'bluffs' && <BluffEdit g={g} onClose={() => setEdit(null)} />}
      {edit === 'rh' && <RedHerringEdit g={g} onClose={() => setEdit(null)} />}
      <BottomBar>
        <button className="btn btn-primary btn-block" onClick={() => g.commit((st) => startDeal(st))}>
          开始发身份
        </button>
      </BottomBar>
    </main>
  );
}

/** 选酒鬼的假身份：所有不在场的镇民都列出来，直接点 */
export function DrunkEdit({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const choices = useMemo(() => drunkFakeChoices(s), [s]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(() => choices.findIndex((c) => c.value === s.drunkFake));
  return (
    <Sheet title="酒鬼以为自己是" onClose={onClose}>
      <p className="dim" style={{ marginBottom: 10 }}>
        只能选不在场的镇民。点一个就换好了。
      </p>
      <ChoicePanel
        s={s}
        choices={choices}
        sel={sel}
        rec={rec}
        defaultOpen
        moreLabel="所有可选的假身份"
        onSel={(i) => {
          if (i < 0) return;
          setSel(i);
          g.commit((st) => {
            st.drunkFake = choices[i].value;
            if (st.phase === 'deal') addLog(st, 'setup', `酒鬼假身份改为【${roleName(choices[i].value)}】`);
          });
        }}
      />
    </Sheet>
  );
}

function BluffEdit({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const choices = useMemo(() => bluffChoices(s, stepRng(s)), [s]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const key = (rs: RoleId[]) => [...rs].sort().join();
  const [sel, setSel] = useState(() => choices.findIndex((c) => key(c.value) === key(s.bluffs)));
  const pool = notInPlay(s, ['townsfolk', 'outsider'], s.drunkFake ? [s.drunkFake, 'drunk'] : ['drunk']);
  const [manual, setManual] = useState<RoleId[]>(s.bluffs);
  return (
    <Sheet title="恶魔的 3 个伪装" onClose={onClose}>
      <ChoicePanel
        s={s}
        choices={choices}
        sel={sel}
        rec={rec}
        onSel={(i) => {
          setSel(i);
          if (i >= 0) g.commit((st) => (st.bluffs = choices[i].value));
        }}
        manual={
          <div className="stack" style={{ gap: 8 }}>
            <p className="dim">点选 3 个不在场的善良角色（已选 {manual.length}/3）</p>
            <div className="role-grid">
              {pool.map((r) => (
                <button
                  key={r}
                  className="role-chip"
                  style={manual.includes(r) ? { borderColor: 'var(--gold)', background: 'rgba(209,173,102,.18)' } : undefined}
                  onClick={() => setManual((m) => (m.includes(r) ? m.filter((x) => x !== r) : m.length < 3 ? [...m, r] : m))}
                >
                  {roleName(r)}
                </button>
              ))}
            </div>
            <button className="btn btn-primary btn-sm" disabled={manual.length !== 3} onClick={() => g.commit((st) => (st.bluffs = manual))}>
              用这 3 个
            </button>
          </div>
        }
        manualLabel="自己挑 3 个"
      />
      <p className="dim" style={{ marginTop: 8 }}>当前：{s.bluffs.map(roleName).join('、')}</p>
    </Sheet>
  );
}

function RedHerringEdit({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const choices = useMemo(() => redHerringChoices(s, stepRng(s)), [s]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(() => choices.findIndex((c) => c.value === s.redHerring));
  const evilSeats = s.seats.filter((x) => isEvilTeam(ROLES[x.role].team)).map((x) => x.n);
  return (
    <Sheet title="占卜师的干扰项" onClose={onClose}>
      <ChoicePanel
        s={s}
        choices={choices}
        sel={sel}
        rec={rec}
        onSel={(i) => {
          setSel(i);
          if (i >= 0) g.commit((st) => (st.redHerring = choices[i].value));
        }}
        manual={
          <SeatPicker s={s} selected={s.redHerring ? [s.redHerring] : []} max={1} disabled={evilSeats} label="点一名善良玩家" onChange={(v) => v[0] && g.commit((st) => (st.redHerring = v[0]))} />
        }
        manualLabel="自己选一名善良玩家"
      />
      {!inPlay(s, 'fortuneteller') && <p className="dim">场上没有占卜师。</p>}
    </Sheet>
  );
}
