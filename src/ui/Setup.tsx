import { useMemo, useState } from 'react';
import { FABLED, ROLES, TEAM_NAME, isEvilTeam, roleName, type FabledId, type RoleId, type Team } from '../engine/roles';
import { recommend, setupLabel, balance } from '../engine/balance';
import { actorFor, addLog, inPlay, lilMonsta, notInPlay, scriptOf, seatName } from '../engine/core';
import { SCRIPT_LIST, SCRIPTS } from '../engine/editions';
import { defaultRng } from '../engine/rng';
import {
  DISTRIBUTION, F4, MAX_F4, amnesiacChoices, bluffChoices, drunkFakeChoices, redHerringChoices, replaceDemon,
  replaceRole, rerollRoles, sentinelChoices, setCount, setScript, setSentinelDelta, setupReasons, shuffleSeats,
  startDeal, swapSeats, toggleFabled,
} from '../engine/setup';
import { stepRng, type Game } from '../store';
import { BottomBar, ChoicePanel, Sheet, SeatPicker } from './common';
import { AddTravellerSheet } from './Travellers';
import { removeTravellerAtSetup } from '../engine/travellers';
import { GrimoireCircle } from './Grimoire';
import { Icon } from './icons';

export function SetupScreen({ g, onRules, onRoles }: { g: Game; onRules: () => void; onRoles: () => void }) {
  if (g.s.setupStep === 'script') return <ScriptStep g={g} />;
  if (g.s.setupStep === 'count') return <CountStep g={g} onRules={onRules} onRoles={onRoles} />;
  if (g.s.setupStep === 'roles') return <RolesStep g={g} />;
  return <SeatsStep g={g} onRules={onRules} />;
}

function ScriptStep({ g }: { g: Game }) {
  return (
    <main className="main">
      <div className="stack">
        <div className="hero">
          <h1>钟楼说书人</h1>
          <p className="sub">一步一屏带你主持一整局</p>
        </div>
        <h2 style={{ fontSize: 22 }}>玩哪个剧本？</h2>
        <div className="choices">
          {SCRIPT_LIST.map((sc) => (
            <button key={sc.id} className="choice" style={{ padding: '14px 16px' }} onClick={() => g.commit((s) => setScript(s, sc.id))}>
              <div className="top">
                <span className="lab" style={{ fontFamily: 'var(--serif)', fontSize: 22 }}>
                  {sc.name}
                </span>
                <span className="tag tag-mid">
                  {sc.min === sc.max ? sc.min : `${sc.min}–${sc.max}`} 人
                </span>
              </div>
              <span className="why">{sc.blurb}</span>
              <span className="dim" style={{ fontSize: 13 }}>
                {sc.roles.length} 个角色{sc.fabled.length ? ` · 传奇角色：${sc.fabled.map((f) => FABLED[f].name).join('、')}` : ''}
              </span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

function CountStep({ g, onRules, onRoles }: { g: Game; onRules: () => void; onRoles: () => void }) {
  const sc = scriptOf(g.s);
  const counts = Array.from({ length: sc.max - sc.min + 1 }, (_, i) => i + sc.min);
  return (
    <main className="main">
      <div className="stack">
        <div className="step-head">
          <span className="kicker">
            剧本：{sc.name}（{sc.min}–{sc.max} 人）
          </span>
          <h2>几个人玩？</h2>
        </div>
        <p className="dim">不算说书人。选好后网页会自动配一套均衡的角色。超过 {sc.max} 人就选 {sc.max}，多出来的人下一步加成旅行者。</p>
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
        <button className="btn btn-outline btn-sm" onClick={() => g.commit((s) => (s.setupStep = 'script'))}>
          换剧本
        </button>
      </div>
    </main>
  );
}

const TEAMS: Team[] = ['townsfolk', 'outsider', 'minion', 'demon'];

function RolesStep({ g }: { g: Game }) {
  const s = g.s;
  const sc = scriptOf(s);
  const [edit, setEdit] = useState<number | 'demon' | null>(null);
  const roles = s.seats.map((x) => x.role);
  const reasons = setupReasons(s.demonChar ? [...roles, s.demonChar] : roles);
  const label = setupLabel(s.setupZ);
  const demons = sc.roles.filter((r) => ROLES[r].team === 'demon');
  const editRole = edit === 'demon' ? s.demonChar! : edit !== null ? s.seats[edit - 1].role : null;
  return (
    <main className="main">
      <div className="stack">
        <div className="step-head">
          <span className="kicker">
            {sc.name} · 开局设置 · 第 1 步 / 共 2 步
          </span>
          <h2>{s.count} 人的角色</h2>
        </div>
        <div className={`card${label === '均衡' ? '' : ' card-warn'}`}>
          <b>配板强度：{label}</b>
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
          const lil = t === 'demon' && lilMonsta(s);
          if (!xs.length && !lil) return null;
          const canEdit = t !== 'demon' || demons.length > 1;
          return (
            <div key={t} className="stack" style={{ gap: 8 }}>
              <div className="dim">
                {TEAM_NAME[t]}（{lil ? '无人扮演' : xs.length}）{canEdit && ' · 点角色可以换'}
              </div>
              <div className="role-grid">
                {lil && (
                  <button className="role-chip evil-c" onClick={() => setEdit('demon')}>
                    小怪宝 <small>没有玩家扮演，多一个爪牙</small>
                  </button>
                )}
                {xs.map((x) => (
                  <button key={x.n} className={`role-chip${isEvilTeam(t) ? ' evil-c' : ''}`} onClick={() => canEdit && setEdit(t === 'demon' ? 'demon' : x.n)}>
                    {roleName(x.role)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {sc.fabled.length > 0 && <FabledCard g={g} />}
        <button className="btn btn-outline btn-sm" onClick={() => g.commit((st) => (st.setupStep = 'count'))}>
          改人数
        </button>
      </div>
      {editRole && (
        <RolePicker
          team={ROLES[editRole].team}
          current={editRole}
          taken={s.demonChar ? [...roles, s.demonChar] : roles}
          pool={sc.roles}
          onPick={(r) => {
            g.commit((st) => (edit === 'demon' ? replaceDemon(st, r, defaultRng) : replaceRole(st, edit as number, r, defaultRng)));
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

/** 传奇角色：开局时勾选，默认不加 */
function FabledCard({ g }: { g: Game }) {
  const s = g.s;
  const on = (f: FabledId) => s.fabled.includes(f);
  return (
    <div className="card stack" style={{ gap: 10 }}>
      <h3 style={{ margin: 0 }}>传奇角色（说书人用，默认不加）</h3>
      {scriptOf(s).fabled.map((f) => (
        <div key={f} className="stack" style={{ gap: 6 }}>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <b>{FABLED[f].name}</b>
            <button className={`btn btn-sm ${on(f) ? 'btn-primary' : 'btn-outline'}`} onClick={() => g.commit((st) => toggleFabled(st, f, !on(f), defaultRng))}>
              {on(f) ? '已加入' : '加入'}
            </button>
          </div>
          <p className="dim">{FABLED[f].ability}</p>
          {f === 'sentinel' && on(f) && <SentinelPick g={g} />}
        </div>
      ))}
    </div>
  );
}

function SentinelPick({ g }: { g: Game }) {
  const s = g.s;
  const choices = useMemo(() => sentinelChoices(s), [s]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 3)), [choices, s]);
  const sel = choices.findIndex((c) => c.value === s.sentinelDelta);
  return (
    <ChoicePanel
      s={s}
      choices={choices}
      sel={sel}
      rec={rec}
      moreLabel="外来者人数"
      onSel={(i) => i >= 0 && g.commit((st) => setSentinelDelta(st, choices[i].value, defaultRng))}
    />
  );
}

function RolePicker({
  team, current, taken, pool, onPick, onClose,
}: {
  team: Team;
  current: RoleId;
  taken: RoleId[];
  pool: RoleId[];
  onPick: (r: RoleId) => void;
  onClose: () => void;
}) {
  const opts = pool.filter((r) => ROLES[r].team === team && r !== current && !taken.includes(r));
  const f4Others = taken.filter((r) => r !== current && F4.includes(r)).length;
  const note = (r: RoleId) => {
    if (r === 'baron' || current === 'baron') return '男爵会让外来者 +2、镇民 −2，网页会自动调整。';
    if (r === 'balloonist' || current === 'balloonist') return '气球驾驶员会让外来者 +1、镇民 −1，网页会自动调整。';
    if (r === 'lilmonsta') return '小怪宝没有玩家扮演：原来的恶魔座位会变成一个爪牙。';
    if (current === 'lilmonsta') return '换掉小怪宝：会有一个爪牙座位变成这个恶魔。';
    return '';
  };
  return (
    <Sheet title={`把【${roleName(current)}】换成`} onClose={onClose}>
      <div className="choices">
        {opts.length === 0 && <p className="dim">这个阵营的角色都已经在场了。</p>}
        {opts.map((r) => (
          <button key={r} className="choice" onClick={() => onPick(r)}>
            <span className="lab">{roleName(r)}</span>
            <span className="why">{ROLES[r].ability}</span>
            {note(r) && <span className="why" style={{ color: 'var(--warn)' }}>{note(r)}</span>}
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

type Edit = 'drunk' | 'bluffs' | 'rh' | 'lunatic' | 'amnesiac' | 'traveller' | null;

function SeatsStep({ g, onRules }: { g: Game; onRules: () => void }) {
  const s = g.s;
  const [first, setFirst] = useState<number | null>(null);
  const [edit, setEdit] = useState<Edit>(null);
  const drunk = s.seats.find((x) => x.role === 'drunk');
  const lunatic = s.seats.find((x) => x.role === 'lunatic');
  const amnesiac = s.seats.find((x) => x.role === 'amnesiac');
  const ft = actorFor(s, 'fortuneteller');

  const tapSeat = (n: number) => {
    // 旅行者的位置由"坐在谁旁边"决定，不参与交换
    if (s.seats.find((x) => x.n === n)?.traveller) return;
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
          <span className="kicker">{scriptOf(s).name} · 开局设置 · 第 2 步 / 共 2 步</span>
          <h2>座位与特殊设置</h2>
        </div>
        <p className="muted">
          玩家按顺时针坐成一圈，1 号开始。角色已随机分好。想调换：先点一个座位，再点另一个。
        </p>
        <GrimoireCircle
          s={s}
          onSeat={tapSeat}
          selected={first ? [first] : []}
          hub={first ? <b>再点一个座位交换</b> : <small>{s.count} 人{lilMonsta(s) ? ' · 小怪宝' : ''}</small>}
        />
        <button className="btn btn-ghost btn-sm" onClick={() => g.commit((st) => shuffleSeats(st, defaultRng))}>
          <Icon name="shuffle" size={18} /> 重新随机座位
        </button>

        <TravellersCard g={g} onAdd={() => setEdit('traveller')} />

        {drunk && s.drunkFake && (
          <div className="card">
            <h3>酒鬼</h3>
            <p>
              {seatName(drunk.n)} 是酒鬼，他会以为自己是 <b className="good">【{roleName(s.drunkFake)}】</b>
            </p>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={() => setEdit('drunk')}>
              更换假身份
            </button>
          </div>
        )}
        {lunatic && s.lunaticFake && (
          <div className="card">
            <h3>疯子</h3>
            <p>
              {seatName(lunatic.n)} 是疯子，他会以为自己是恶魔 <b className="evil">【{roleName(s.lunaticFake)}】</b>
            </p>
            {lilMonsta(s) && <p className="dim">小怪宝在场，按你们的规矩给疯子看涡流。</p>}
            <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={() => setEdit('lunatic')}>
              更换
            </button>
          </div>
        )}
        {amnesiac && s.amnesiacAbility && (
          <div className="card">
            <h3>失忆者</h3>
            <p>
              {seatName(amnesiac.n)} 是失忆者，你偷偷给他的能力：<b className="good">像{roleName(s.amnesiacAbility)}一样</b>
            </p>
            <p className="dim">{ROLES[s.amnesiacAbility].ability}</p>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={() => setEdit('amnesiac')}>
              看理由 / 更换
            </button>
          </div>
        )}
        {s.count >= 7 ? (
          <div className="card">
            <h3>恶魔的 3 个伪装</h3>
            <p>{s.bluffs.map(roleName).join('、') || '（无）'}</p>
            <p className="dim">这些角色不在场，第一晚告诉恶魔，他可以假装成这些角色。</p>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={() => setEdit('bluffs')}>
              看理由 / 更换
            </button>
          </div>
        ) : (
          <p className="dim">5–6 人局：邪恶方互相不认识，恶魔没有伪装角色。</p>
        )}
        {ft && s.redHerring && (
          <div className="card">
            <h3>占卜的干扰项</h3>
            <p>
              {seatName(s.redHerring)}（{roleName(s.seats[s.redHerring - 1].role)}）：查到他也会得到"有恶魔"。
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
      {edit === 'lunatic' && <LunaticEdit g={g} onClose={() => setEdit(null)} />}
      {edit === 'amnesiac' && <AmnesiacEdit g={g} onClose={() => setEdit(null)} />}
      {edit === 'traveller' && <AddTravellerSheet g={g} onClose={() => setEdit(null)} />}
      <BottomBar>
        <button className="btn btn-primary btn-block" onClick={() => g.commit((st) => startDeal(st))}>
          开始发身份
        </button>
      </BottomBar>
    </main>
  );
}

/** 开局时加旅行者：剧本人数上限之外的人、或者知道要早退的人 */
function TravellersCard({ g, onAdd }: { g: Game; onAdd: () => void }) {
  const s = g.s;
  const ts = s.seats.filter((x) => x.traveller);
  const sc = scriptOf(s);
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <h3 style={{ margin: 0 }}>旅行者</h3>
      <p className="dim">
        人数超过剧本上限（这个剧本最多 {sc.max} 人），或者有人知道要早退，可以当旅行者。旅行者不占配板人数。
      </p>
      {ts.map((t) => (
        <div key={t.n} className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <span>
            <b>{seatName(t.n)}</b>：{roleName(t.role)}（
            <span className={t.traveller!.alignment === 'evil' ? 'evil' : 'good'}>{t.traveller!.alignment === 'evil' ? '邪恶' : '善良'}</span>），坐在 {seatName(t.traveller!.after)} 旁边
          </span>
          <button className="btn btn-outline btn-sm" onClick={() => g.commit((st) => removeTravellerAtSetup(st, t.n))}>
            删除
          </button>
        </div>
      ))}
      <button className="btn btn-outline btn-sm" onClick={onAdd}>
        加一名旅行者
      </button>
    </div>
  );
}

/** 疯子以为自己是哪个恶魔 */
export function LunaticEdit({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const demons = SCRIPTS[s.script].roles.filter((r) => ROLES[r].team === 'demon');
  return (
    <Sheet title="疯子以为自己是" onClose={onClose}>
      <div className="choices">
        {demons.map((r) => (
          <button
            key={r}
            className={`choice${s.lunaticFake === r ? ' sel' : ''}`}
            onClick={() =>
              g.commit((st) => {
                st.lunaticFake = r;
                if (st.phase === 'deal') addLog(st, 'setup', `疯子的假身份改为【${roleName(r)}】`);
              })
            }
          >
            <span className="lab">{roleName(r)}</span>
            <span className="why">{ROLES[r].ability}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function AmnesiacEdit({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const choices = useMemo(() => amnesiacChoices(s), [s]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 5)), [choices, s]);
  const sel = choices.findIndex((c) => c.value === s.amnesiacAbility);
  return (
    <Sheet title="失忆者的能力" onClose={onClose}>
      <p className="dim" style={{ marginBottom: 10 }}>
        他自己不知道。需要夜里醒的能力，网页会在失忆者那一步叫醒他。
      </p>
      <ChoicePanel
        s={s}
        choices={choices}
        sel={sel}
        rec={rec}
        defaultOpen
        moreLabel="全部能力"
        onSel={(i) => {
          if (i < 0) return;
          g.commit((st) => {
            st.amnesiacAbility = choices[i].value;
            if (choices[i].value === 'fortuneteller' && !st.redHerring) {
              const rh = redHerringChoices(st, stepRng(st, 6));
              st.redHerring = rh.length ? rh[0].value : null;
            }
          });
        }}
      />
    </Sheet>
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
    <Sheet title="占卜的干扰项" onClose={onClose}>
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
      {!inPlay(s, 'fortuneteller') && !actorFor(s, 'fortuneteller') && <p className="dim">场上没有占卜的人。</p>}
    </Sheet>
  );
}
