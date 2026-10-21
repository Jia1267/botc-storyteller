import { useMemo, useState, type ReactNode } from 'react';
import { FABLED, ROLES, roleName, type RoleId } from '../engine/roles';
import { balance, recommend, type Choice } from '../engine/balance';
import {
  actorFor, aliveCount, aliveVoters, demonSeat, hasAbility, isDemonSeat, isEvil, isTraveller, lilMonsta, malfunction, scriptOf, seatOf, teamOf,
  vortoxActive, seatName, seatLabel, townsfolkNeighbors, philoDrunk,
} from '../engine/core';
import {
  LEVIATHAN_DAYS, advocateSaves, alsaahirCorrect, alsaahirGuess, execute, pacifistCanSave, setGossip, tinkerDies, fearPreview, fearmongerAsk, fearmongerNominates, finishDay, goblinAsk,
  harpyPunish, nominateVirgin, previewSlayer, previewVirgin, setCannibalFake, setDemonVoted, savantVisit, scapegoatFor, setDuchessVisitors,
  slayerShoot, markUsed, nomResults, voteNeed, type NomResult, type NomRow,
  cereVerdict, jugglerCanGuess, jugglerCount, jugglerGuess, setMinionNominated, twinsBlock, witchActive, witchStrikes,
  damselGuess, golemNominates, puzzleGuess,
} from '../engine/flow';
import { activeTravellers, beggarLearns, exile, gunslingerPreview, gunslingerShoot, leave } from '../engine/travellers';
import { clone } from '../engine/core';
import { harpyPunishChoices, killPreview, pacifistChoices, puzzleShowChoices, scarletCanTakeOver } from '../engine/info';
import { AMNESIAC_ANSWERS, artistMode, fishermanChoices, savantChoices } from '../engine/daytime';
import type { GameState, Seat } from '../engine/types';
import { dayStartLines, endLines, executionLines, nominationLines } from '../engine/scripts';
import { stepRng, type Game } from '../store';
import { BottomBar, ChoicePanel, ConfirmButton, DoBox, SayBox, SeatPicker, Sheet, TwoChoice, drunkWhy, useUi } from './common';
import { GrimoireCircle, GrimoirePanel } from './Grimoire';
import { KlutzPrompt, MoonchildPrompt, PixiePrompt, promptPending } from './Prompts';
import { TimerDisplay } from './Timer';
import { Icon } from './icons';
import { AddTravellerSheet, ExileSheet } from './Travellers';


/** 红唇女郎白天接任后，一直挂在白天页面最上面 */
function SwNotice({ s }: { s: GameState }) {
  const lil = lilMonsta(s) && s.babysitterLocked && s.babysitter;
  if (s.pendingNewDemon === null && !lil) return null;
  const old = s.seats.find(
    (x) => !x.alive && x.death?.when === 'day' && x.death.night === s.night && (ROLES[x.role].team === 'demon' || (lilMonsta(s) && ROLES[x.role].team === 'minion')),
  );
  const said = old ? `${seatName(old.n)} ${s.executed === old.n ? '被处决了' : '死了'}` : '';
  const sw = lil ? s.babysitter! : s.pendingNewDemon!;
  return (
    <div className="card card-warn stack" style={{ gap: 6 }}>
      <b style={{ color: 'var(--warn)' }}>
        红唇女郎（{seatName(sw)}）{lil ? '接手照看小怪宝' : '接任恶魔'}，游戏继续
      </b>
      {said && <p>公开只说「{said}」。</p>}
      <p>
        不要宣布游戏结束，也不要提红唇女郎。
        {lil ? '今晚爪牙们醒来时，告诉他们由她照看。' : `今晚会叫醒她，告诉她现在是${roleName(seatOf(s, sw).role)}。`}
      </p>
    </div>
  );
}

/** 处决/射杀恶魔前的提醒：红唇女郎会不会接任 */
function demonDeathWarning(s: GameState, n: number, verb: '被处决了' | '死了') {
  if (!isDemonSeat(s, n)) return null;
  // 不会真的死（魔鬼代言人、茶艺师、弄臣）或僵怖第一次假死：另有提示
  const x = seatOf(s, n);
  if ((verb === '被处决了' && advocateSaves(s, n)) || !killPreview(s, n).dies || (x.role === 'zombuul' && !s.zombuulFake && !x.used && !malfunction(s, n))) return null;
  const sw = scarletCanTakeOver(s);
  const who = lilMonsta(s) ? '照看小怪宝的人' : '恶魔';
  if (!sw) return <div className="card"><p>{seatName(n)} 是{who}：他死后善良获胜。</p></div>;
  return (
    <div className="card card-warn stack" style={{ gap: 6 }}>
      <b style={{ color: 'var(--warn)' }}>
        红唇女郎（{seatName(sw.n)}）会{lilMonsta(s) ? '接手照看小怪宝' : '接任恶魔'}，游戏继续
      </b>
      <p>公开只说「{seatName(n)} {verb}」。不要宣布游戏结束，也不要提红唇女郎。</p>
    </div>
  );
}

type Panel = 'nom' | 'virgin' | 'slayer' | 'exec' | 'artist' | 'fisherman' | 'savant' | 'amnesiac' | 'mutant' | 'duchess' | 'fear' | 'alsaahir' | 'gossip' | 'tinker' | 'juggler' | 'golem' | 'damsel' | 'puzzle' | null;

export function DayScreen({ g }: { g: Game }) {
  const s = g.s;
  const [panel, setPanel] = useState<Panel>(null);
  // 贞洁者被提名、能力没触发时，接着记这次投票：提名面板里预先选好他
  const [nomFor, setNomFor] = useState<number | undefined>(undefined);
  if (s.executed !== undefined || s.winner) return <DayResult g={g} />;

  const alive = aliveVoters(s);
  const tAlive = alive - aliveCount(s);
  const need = Math.ceil(alive / 2);
  const butler = s.seats.find((x) => x.role === 'butler' && x.alive);
  const virgin = actorFor(s, 'virgin');
  const lev = s.seats.find((x) => x.role === 'leviathan' && x.alive);
  const fm = s.seats.find((x) => x.role === 'fearmonger' && x.alive);
  const close = () => setPanel(null);

  return (
    <main className="main split">
      <div className="side">
        <GrimoirePanel s={s} />
      </div>
      <div className="stack">
        <div className="step-head">
          <span className="kicker">白天</span>
          <h2>第 {s.night} 天</h2>
        </div>
        <SwNotice s={s} />
        <KlutzPrompt g={g} />
        <MoonchildPrompt g={g} />
        <PixiePrompt g={g} />
        <CannibalNotice g={g} />
        <SecretNotices s={s} />
        {lev && (
          <div className="card card-warn">
            <p>
              <b>利维坦在场</b>：今天是第 {s.night} 天，第 {LEVIATHAN_DAYS} 天结束时邪恶获胜。已处决善良玩家 {s.goodExecutions} 人，再处决{' '}
              {Math.max(0, 2 - s.goodExecutions)} 个善良玩家邪恶就获胜。
            </p>
          </div>
        )}
        {vortoxActive(s) && (
          <div className="card card-evil">
            <p>
              <b>涡流在场</b>：今天必须处决一个人，否则邪恶直接获胜（只有你知道，别说出来）。
            </p>
          </div>
        )}
        {fm && s.fearTarget && <p className="dim">恐惧之灵（{seatName(fm.n)}）现在的目标：{seatName(s.fearTarget)}。只有你知道。</p>}
        <SayBox lines={dayStartLines(s.night, s.style)} title="对所有人说" />
        <div className="card">
          <h3>讨论计时</h3>
          <TimerDisplay />
        </div>
        <DayAbilities s={s} open={setPanel} />
        <TravellerDay g={g} />
        <SayBox lines={nominationLines(s.style)} title="讨论结束后说" />
        <HarpyCard g={g} />
        <WitchCard g={g} />
        <CereCard g={g} />
        <VoteMods s={s} />
        {butler && s.butlerMaster && (
          <div className="card card-warn">
            <p>
              管家 {seatName(butler.n)} 只有在主人 <b>{seatName(s.butlerMaster)}</b> 举手时才能举手投票。
            </p>
          </div>
        )}
        <div className="card stack" style={{ gap: 10 }}>
          <h3>投票（你来数票）</h3>
          <p>
            现在存活 <b>{alive}</b> 人{tAlive > 0 && `（含旅行者 ${tAlive} 人）`} → 处决至少需要 <b className="answer" style={{ fontSize: 22 }}>{need}</b> 票
          </p>
          <NomList g={g} />
          <details className="more">
            <summary>
              <Icon name="chevronDown" size={18} /> 投票规则（{tAlive > 0 ? 7 : 6} 条）
            </summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }} className="muted">
            <li>从被提名者开始，顺时针一个一个数举手的人。</li>
            <li>票数 ≥ {need}，而且比今天之前的最高票还多，他就成为"待处决"的人。</li>
            <li>和最高票打平：两个人都不处决。</li>
            <li>每人每天只能提名一次、只能被提名一次。死人不能提名。</li>
            <li>死人整局只剩一次投票，用掉就不能再投。</li>
            <li>所有提名结束后，"待处决"的人被处决。也可以一个都不处决。</li>
            {tAlive > 0 && <li>旅行者可以提名、投票，但不能被提名处决，只能放逐（见上面"旅行者"）。</li>}
          </ul>
          </details>
          {/* 结束今天放在投票卡最后，不和底部的"记一次提名"挨着 */}
          <button className="btn btn-outline btn-block" onClick={() => setPanel('exec')}>
            提名都结束了，录入今天的处决结果
          </button>
        </div>
        <FlowergirlCard g={g} />
        <TownCrierCard g={g} />
        <PrincessCard g={g} />
      </div>
      {panel === 'virgin' && virgin && (
        <VirginSheet
          g={g}
          virginN={virgin.n}
          onClose={close}
          onVote={() => {
            setNomFor(virgin.n);
            setPanel('nom');
          }}
        />
      )}
      {panel === 'slayer' && <SlayerSheet g={g} onClose={close} />}
      {panel === 'exec' && <ExecSheet g={g} onClose={close} />}
      {panel === 'artist' && <ArtistSheet g={g} onClose={close} />}
      {panel === 'fisherman' && <FishermanSheet g={g} onClose={close} />}
      {panel === 'savant' && <SavantSheet g={g} onClose={close} />}
      {panel === 'amnesiac' && <AmnesiacSheet g={g} onClose={close} />}
      {panel === 'mutant' && <MutantSheet g={g} onClose={close} />}
      {panel === 'duchess' && <DuchessSheet g={g} onClose={close} />}
      {panel === 'fear' && <FearSheet g={g} onClose={close} />}
      {panel === 'alsaahir' && <AlsaahirSheet g={g} onClose={close} />}
      {panel === 'gossip' && <GossipSheet g={g} onClose={close} />}
      {panel === 'tinker' && <TinkerSheet g={g} onClose={close} />}
      {panel === 'juggler' && <JugglerSheet g={g} onClose={close} />}
      {panel === 'golem' && <GolemSheet g={g} onClose={close} />}
      {panel === 'damsel' && <DamselSheet g={g} onClose={close} />}
      {panel === 'puzzle' && <PuzzleSheet g={g} onClose={close} />}
      {panel === 'nom' && (
        <NomSheet
          g={g}
          initial={nomFor}
          onClose={() => {
            setNomFor(undefined);
            close();
          }}
        />
      )}
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => setPanel('nom')}>
          <Icon name="plus" size={18} /> 记一次提名
        </button>
      </BottomBar>
    </main>
  );
}

/** 白天随时可能有人来找你：按剧本和场上角色列出按钮 */
function DayAbilities({ s, open }: { s: GameState; open: (p: Panel) => void }) {
  const items: ReactNode[] = [];
  const btn = (key: Panel, label: string) => (
    <button key={key} className="btn btn-ghost btn-block" onClick={() => open(key)}>
      {label}
    </button>
  );
  const holder = (r: Parameters<typeof actorFor>[1]) => s.seats.find((x) => x.alive && hasAbility(s, x, r));
  const fm = s.seats.find((x) => x.alive && x.role === 'fearmonger');
  if (fm) items.push(btn('fear', s.fearNominated ? `恐惧之灵（${seatName(fm.n)}）今天提名了 ${seatName(s.fearNominated)}（改）` : `恐惧之灵（${seatName(fm.n)}）提名了一名玩家`));
  const virgin = actorFor(s, 'virgin');
  if (virgin && virgin.alive && !virgin.used) items.push(btn('virgin', `有人提名了 ${seatName(virgin.n)}（${virgin.role === 'virgin' ? '贞洁者' : `有贞洁者能力的${roleName(virgin.role)}`}）`));
  if (s.script === 'tb' || holder('slayer')) items.push(btn('slayer', '有人宣称自己是猎手并开枪'));
  const artist = holder('artist');
  if (artist && !artist.used) items.push(btn('artist', `艺术家（${seatName(artist.n)}）来问是非题`));
  const fisher = holder('fisherman');
  if (fisher && !fisher.used) items.push(btn('fisherman', `渔夫（${seatName(fisher.n)}）来要建议`));
  const savant = holder('savant');
  if (savant && s.savantDay !== s.night) items.push(btn('savant', `博学者（${seatName(savant.n)}）来要今天的两条信息`));
  const amn = s.seats.find((x) => x.alive && x.role === 'amnesiac');
  if (amn) items.push(btn('amnesiac', `失忆者（${seatName(amn.n)}）来猜自己的能力`));
  const jug = holder('juggler');
  if (jug && (jugglerCanGuess(s, jug.n) || (s.juggler?.seat === jug.n && s.juggler.day === s.night)))
    items.push(btn('juggler', s.juggler?.day === s.night ? `杂耍艺人（${seatName(jug.n)}）今天猜对 ${s.juggler.correct} 个（改）` : `杂耍艺人（${seatName(jug.n)}）要公开猜角色`));
  const golem = holder('golem');
  if (golem && !golem.used) items.push(btn('golem', `魔像（${seatName(golem.n)}）提名了一个人`));
  const damsel = s.seats.find((x) => x.role === 'damsel');
  if (damsel && !s.damselGuessed) items.push(btn('damsel', '有爪牙公开猜谁是落难少女'));
  const puzzle = holder('puzzlemaster');
  if (puzzle && !s.puzzleGuessed && s.puzzleDrunk) items.push(btn('puzzle', `解谜大师（${seatName(puzzle.n)}）来猜谁醉酒`));
  const als = holder('alsaahir');
  if (als && s.alsaahirDay !== s.night) items.push(btn('alsaahir', `戏法师（${seatName(als.n)}）要公开猜谁是爪牙和恶魔`));
  const gossip = s.seats.find((x) => x.alive && x.role === 'gossip');
  if (gossip) items.push(btn('gossip', s.gossipTrueDay === s.night ? `造谣者（${seatName(gossip.n)}）今天的声明：已记为真（改）` : `造谣者（${seatName(gossip.n)}）公开说了一句话`));
  const tinker = s.seats.find((x) => x.alive && x.role === 'tinker');
  if (tinker) items.push(btn('tinker', `让修补匠（${seatName(tinker.n)}）现在死亡`));
  const mutant = s.seats.find((x) => x.alive && x.role === 'mutant');
  if (mutant) items.push(btn('mutant', `畸形秀演员（${seatName(mutant.n)}）说自己是外来者了`));
  if (s.fabled.includes('duchess')) items.push(btn('duchess', s.duchessVisitors.length ? `公爵夫人的拜访者：${s.duchessVisitors.map((n) => `${seatName(n)}`).join('、')}（改）` : '有人来拜访公爵夫人'));
  if (!items.length) return null;
  return (
    <div className="card">
      <h3>白天有人来找你 / 突发情况</h3>
      <div className="stack" style={{ gap: 8 }}>
        {items}
      </div>
    </div>
  );
}

/** 替罪羊代替同阵营的人被处决：照常处决不算干预（中立），换人才有倾向 */
function scapegoatChoices(s: GameState, n: number, sg: number): Choice<boolean>[] {
  const evil = isEvil(seatOf(s, n));
  const demon = evil && isDemonSeat(s, n);
  return [
    { key: 'no', label: `照常处决 ${seatName(n)}`, value: false, lean: 0, truth: true, standard: true, reason: '按正常流程走，不额外干预。' },
    {
      key: 'sg', label: `让替罪羊（${seatName(sg)}）代替他被处决`, value: true, lean: evil ? (demon ? -2 : -1) : 1, truth: true,
      reason: evil ? (demon ? '恶魔逃过一劫，大帮邪恶。' : '邪恶玩家逃过一劫，帮邪恶。') : '有能力的善良玩家活下来，死的是旅行者，帮善良。',
    },
  ];
}

function ExecSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  // 按提名记录预选待处决的人
  const noms = useMemo(() => nomResults(s), [s]);
  const [t, setT] = useState<number[]>(() => (noms.block ? [noms.block] : []));
  const [fear, setFear] = useState(false);
  const [goblin, setGoblin] = useState(false);
  const [sgSel, setSgSel] = useState<number | null>(null);
  const [pcSel, setPcSel] = useState<number | null>(null);
  const n = t[0];
  const sg = n ? scapegoatFor(s, n) : undefined;
  const sgChoices = useMemo(() => (n && sg ? scapegoatChoices(s, n, sg.n) : null), [s, n, sg]);
  const sgRec = useMemo(() => (sgChoices ? recommend(sgChoices, balance(s).score, stepRng(s, 71)) : 0), [sgChoices, s]);
  const subst = sgChoices ? sgChoices[sgSel ?? sgRec].value : false;
  // 真正被处决的人（替罪羊顶替时是他）
  const e = subst && sg ? sg.n : n;
  const st = e ? seatOf(s, e) : undefined;
  const lev = s.seats.find((x) => x.role === 'leviathan' && x.alive && !malfunction(s, x.n));
  const reset = () => { setFear(false); setGoblin(false); setPcSel(null); };
  // 和平主义者：被处决的善良玩家可以不死（按局势推荐）
  const pcChoices = useMemo(() => (e && st?.alive && pacifistCanSave(s, e) ? pacifistChoices(s, e) : null), [s, e, st]);
  const pcRec = useMemo(() => (pcChoices ? recommend(pcChoices, balance(s).score, stepRng(s, 91)) : 0), [pcChoices, s]);
  const pacifist = pcChoices ? pcChoices[pcSel ?? pcRec].value : false;
  const mmDay = !!s.mastermindDay && s.night === s.mastermindDay;
  // 先在副本上试一下：这一下会不会直接结束游戏
  const ending = useMemo(() => {
    if (!n) return null;
    const c = clone(s);
    execute(c, n, '被处决', { fearmongerNominated: c.fearNominated === e || fear, goblinClaimed: goblin, scapegoat: subst, pacifist });
    return c.winner ? `${c.winner === 'good' ? '善良' : '邪恶'}立即获胜` : null;
  }, [s, n, e, fear, goblin, subst, pacifist]);
  const noneEnding = useMemo(() => {
    const c = clone(s);
    execute(c, null);
    return c.winner ? `${c.winner === 'good' ? '善良' : '邪恶'}立即获胜` : null;
  }, [s]);
  return (
    <Sheet title="今天的处决结果" onClose={onClose}>
      <div className="stack">
        {noms.rows.length > 0 && (
          <p className="dim">
            {noms.block
              ? `按提名记录，待处决的是 ${seatName(noms.block)}（${noms.top} 票），已帮你选好。`
              : noms.top
                ? `按提名记录：${noms.top} 票平票，今天没人待处决。`
                : '按提名记录：没人够票，今天没人待处决。'}
          </p>
        )}
        <SeatPicker
          s={s}
          selected={t}
          max={1}
          onChange={(v) => { setT(v); setSgSel(null); reset(); }}
          disabled={s.seats.filter(isTraveller).map((x) => x.n)}
          label="谁被处决了？"
        />
        {s.seats.some((x) => isTraveller(x) && !x.left) && <p className="dim">旅行者不能被处决，只能放逐。</p>}
        {mmDay && (
          <div className="card card-evil">
            <b>主谋的额外一天：处决了谁，谁的阵营就输（处决善良玩家邪恶赢；处决邪恶玩家或没人被处决，善良赢）。</b>
          </div>
        )}
        {pcChoices && !mmDay && (
          <div className="card card-warn stack" style={{ gap: 8 }}>
            <b>和平主义者在场：{seatName(e)} 是善良的，你可以让他被处决但不死</b>
            <p className="dim">和平主义者就是给你用来平衡的：局势偏邪恶、好人快撑不住时，可以让他不死。</p>
            <ChoicePanel s={s} choices={pcChoices} sel={pcSel ?? pcRec} rec={pcRec} onSel={(i) => i >= 0 && setPcSel(i)} moreLabel="看另一个选择" />
          </div>
        )}
        {sgChoices && (
          <div className="card card-warn stack" style={{ gap: 8 }}>
            <b>替罪羊（{seatName(sg!.n)}）和 {seatName(n)} 同阵营：你可以让替罪羊代替他被处决</b>
            <ChoicePanel s={s} choices={sgChoices} sel={sgSel ?? sgRec} rec={sgRec} onSel={(i) => { if (i >= 0) { setSgSel(i); reset(); } }} moreLabel="看另一个选择" />
          </div>
        )}
        {st?.role === 'saint' && <p className="evil">注意：{seatName(e)} 是圣徒。</p>}
        {st && e && <ExecGuard s={s} n={e} />}
        {st?.alive && demonDeathWarning(s, e, '被处决了')}
        {st && lev && !isEvil(st) && (
          <p className="evil">利维坦在场：这是第 {s.goodExecutions + 1} 个被处决的善良玩家{s.goodExecutions + 1 >= 2 ? '，处决后邪恶直接获胜！' : '。'}</p>
        )}
        {e && fearmongerAsk(s, e) && s.fearNominated === e && (
          <div className="card card-evil">
            <b>{seatName(e)} 是恐惧之灵提名的、也是他的目标：处决后{isEvil(seatOf(s, e)) ? '邪恶' : '善良'}阵营直接落败。</b>
          </div>
        )}
        {e && fearmongerAsk(s, e) && s.fearNominated !== e && (
          <Toggle
            on={fear}
            set={setFear}
            label={`${seatName(e)} 是恐惧之灵的目标，但你没记下今天恐惧之灵提名了谁：是恐惧之灵提名的他吗？`}
            hint={`是的话，${seatName(e)} 所在的阵营直接落败。`}
          />
        )}
        {e && goblinAsk(s, e) && (
          <Toggle on={goblin} set={setGoblin} label={`${seatName(e)} 是哥布林：他被提名时公开说了自己是哥布林吗？`} hint="说了的话，邪恶直接获胜。" />
        )}
        <button
          className={`btn btn-block ${ending ? 'btn-danger' : 'btn-primary'}`}
          disabled={!n}
          onClick={() => g.commit((x) => execute(x, n, '被处决', { fearmongerNominated: x.fearNominated === e || fear, goblinClaimed: goblin, scapegoat: subst, pacifist }))}
        >
          {!n ? '先点出被处决的人' : ending ? `处决 ${seatName(e)}（${roleName(seatOf(s, e).role)}）→ ${ending}` : `处决 ${seatName(e)}`}
        </button>
        {vortoxActive(s) && <p className="evil">涡流在场：今天没人被处决的话，邪恶直接获胜。</p>}
        <button className={`btn btn-block ${noneEnding ? 'btn-danger' : 'btn-outline'}`} onClick={() => g.commit((x) => execute(x, null))}>
          {noneEnding ? `今天没人被处决 → ${noneEnding}` : '今天没人被处决'}
        </button>
      </div>
    </Sheet>
  );
}

function Toggle({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint: string }) {
  return (
    <div className="card card-warn stack" style={{ gap: 8 }}>
      <b>{label}</b>
      <p className="dim">{hint}</p>
      <TwoChoice value={on} onChange={set} yes="是" no="不是" label={label} />
    </div>
  );
}

function DayResult({ g }: { g: Game }) {
  const s = g.s;
  return (
    <main className="main split">
      <div className="side">
        <GrimoirePanel s={s} />
      </div>
      <div className="stack">
        <div className="step-head">
          <span className="kicker">第 {s.night} 天 · 结束</span>
          <h2>{s.winner ? '游戏结束' : '白天结束'}</h2>
        </div>
        <SwNotice s={s} />
        {s.executed !== undefined && (
          <SayBox lines={executionLines(s.executed, s.style, s.executed !== null && seatOf(s, s.executed).alive)} title="对所有人说" />
        )}
        {s.tempDrunk.some((d) => d.why === '吟游诗人' && d.from === s.night) && (
          <div className="card card-warn">
            <b>吟游诗人：爪牙被处决死亡，从现在到明天黄昏，除吟游诗人外所有人都醉酒。</b>
            <p className="dim">今晚和明天所有人的能力都无效，给的信息可以是假的（网页会提醒你）。不要公开说。</p>
          </div>
        )}
        {!s.winner && s.mastermindDay === s.night + 1 && (
          <div className="card card-evil">
            <b>恶魔被处决了，但主谋在场：不要宣布游戏结束，照常入夜。</b>
            <p>明天是额外的一天：处决了谁，谁的阵营就输；没人被处决善良赢（只有你知道）。</p>
          </div>
        )}
        {s.executed && s.zombuulFake && seatOf(s, s.executed).role === 'zombuul' && (
          <p className="dim">{seatName(s.executed)} 是僵怖，这是假死：照常宣布他死了，但他其实还活着（只有你知道）。</p>
        )}
        {!s.winner && <CannibalNotice g={g} />}
        <KlutzPrompt g={g} />
        <MoonchildPrompt g={g} />
        <PixiePrompt g={g} />
        {s.winner ? (
          <>
            <div className={`card ${s.winner === 'good' ? '' : 'card-evil'}`}>
              <h3>{s.winner === 'good' ? '善良' : '邪恶'}阵营获胜</h3>
              <p>{s.winReason}</p>
            </div>
            <SayBox lines={endLines(s.winner, s.style)} title="对所有人说" />
          </>
        ) : (
          <DoBox items={['宣布完处决结果，准备入夜。']} />
        )}
      </div>
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!s.winner && promptPending(s)} onClick={() => g.commit((st) => finishDay(st))}>
          {s.winner ? '宣布结果，查看复盘' : promptPending(s) ? '先处理上面的提示' : '入夜'}
        </button>
      </BottomBar>
    </main>
  );
}

/* ---------------- 白天的私下拜访 ---------------- */

function holderOf(s: GameState, r: Parameters<typeof actorFor>[1]): Seat | undefined {
  return s.seats.find((x) => x.alive && hasAbility(s, x, r));
}

function ArtistSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const a = holderOf(s, 'artist')!;
  const m = artistMode(s, a.n);
  return (
    <Sheet title={`艺术家（${seatName(a.n)}）的是非题`} onClose={onClose}>
      <div className="stack">
        <p>他私下问你一个能用"是/否"回答的问题。整局只能问一次。</p>
        <div className={`card ${m.mode === 'truth' ? '' : 'card-warn'}`}>
          <b>{m.text}</b>
        </div>
        <p className="dim">不确定答案就点右上角的书本图标看魔典。</p>
        <button className="btn btn-primary btn-block" onClick={() => { g.commit((st) => markUsed(st, a.n, `艺术家（${seatName(a.n)}）问了是非题（${m.mode === 'truth' ? '如实回答' : m.mode === 'lie' ? '涡流：回答假的' : '中毒：可真可假'}）`)); onClose(); }}>
          我回答完了（记下他已经用过）
        </button>
      </div>
    </Sheet>
  );
}

function FishermanSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const f = holderOf(s, 'fisherman')!;
  const choices = useMemo(() => fishermanChoices(s, f.n, stepRng(s, 41)), [s, f.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 42)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel];
  return (
    <Sheet title={`渔夫（${seatName(f.n)}）的建议`} onClose={onClose}>
      <div className="stack">
        <p className="dim">整局一次。私下告诉他一条帮他获胜的建议。</p>
        {choices.length > 0 && <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />}
        {c && <SayBox title="小声说" lines={[c.label]} />}
        <button className="btn btn-primary btn-block" onClick={() => { g.commit((st) => markUsed(st, f.n, `渔夫（${seatName(f.n)}）得到建议：${c?.label ?? '（说书人自己说的）'}`)); onClose(); }}>
          说完了（记下他已经用过）
        </button>
      </div>
    </Sheet>
  );
}

function SavantSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const v = holderOf(s, 'savant')!;
  const choices = useMemo(() => savantChoices(s, v.n, stepRng(s, 51)), [s, v.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 52)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel];
  return (
    <Sheet title={`博学者（${seatName(v.n)}）今天的两条信息`} onClose={onClose}>
      <div className="stack">
        <p className="dim">每天一次。两条一真一假，不告诉他哪条是真的。</p>
        <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
        {c && <SayBox title="小声说" lines={[`第一条：${c.value[0]}。`, `第二条：${c.value[1]}。`]} />}
        <button className="btn btn-primary btn-block" disabled={!c} onClick={() => { g.commit((st) => savantVisit(st, v.n, c!.value)); onClose(); }}>
          说完了
        </button>
      </div>
    </Sheet>
  );
}

function AmnesiacSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const a = s.seats.find((x) => x.alive && x.role === 'amnesiac')!;
  const ab = s.amnesiacAbility;
  const [ans, setAns] = useState<string | null>(null);
  return (
    <Sheet title={`失忆者（${seatName(a.n)}）来猜能力`} onClose={onClose}>
      <div className="stack">
        <div className="card">
          <b>他真正的能力：{ab ? `像${roleName(ab)}一样` : '（没定）'}</b>
          {ab && <p className="dim">{ROLES[ab].ability}</p>}
        </div>
        <p>听他猜完，按接近程度回答他：</p>
        <div className="role-grid">
          {AMNESIAC_ANSWERS.map((x) => (
            <button key={x} className="role-chip" style={ans === x ? { boxShadow: '0 0 0 2px var(--gold) inset' } : undefined} onClick={() => setAns(x)}>
              {x}
            </button>
          ))}
        </div>
        {malfunction(s, a.n) && <p className="dim">他中毒了：可以随便回答。</p>}
        <button className="btn btn-primary btn-block" disabled={!ans} onClick={() => { g.commit((st) => logDay(st, `失忆者（${seatName(a.n)}）猜能力，回答：${ans}`)); onClose(); }}>
          说完了
        </button>
      </div>
    </Sheet>
  );
}

const logDay = (s: GameState, text: string) => s.log.push({ night: s.night, phase: 'day', text });

function MutantSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const m = s.seats.find((x) => x.alive && x.role === 'mutant')!;
  return (
    <Sheet title={`畸形秀演员（${seatName(m.n)}）疯狂了`} onClose={onClose}>
      <div className="stack">
        <p>他公开说自己是外来者，就算"疯狂"了。你可以现在处决他（算今天的处决，今天的提名到此结束），也可以放过他。</p>
        {malfunction(s, m.n) && <p className="dim">他中毒了：能力无效，建议放过。</p>}
        <SayBox title="如果处决，公开宣布" lines={[`${seatName(m.n)} 被处决了。`]} />
        <button className="btn btn-danger btn-block" onClick={() => { g.commit((st) => execute(st, m.n, '疯狂地说自己是外来者，被处决')); onClose(); }}>
          处决他
        </button>
        <button className="btn btn-outline btn-block" onClick={onClose}>
          放过他
        </button>
      </div>
    </Sheet>
  );
}

function DuchessSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const [v, setV] = useState<number[]>(s.duchessVisitors);
  return (
    <Sheet title={FABLED.duchess.name} onClose={onClose}>
      <div className="stack">
        <p className="dim">{FABLED.duchess.ability}</p>
        <SeatPicker s={s} selected={v} max={3} onChange={setV} label="今天谁来拜访了（最多 3 人）？" />
        <button className="btn btn-primary btn-block" disabled={!v.length} onClick={() => { g.commit((st) => setDuchessVisitors(st, v)); onClose(); }}>
          记下拜访者（今晚会告诉他们）
        </button>
      </div>
    </Sheet>
  );
}

/** 恐惧之灵提名了某人：当场告诉你是不是他的目标 */
function FearSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const fm = s.seats.find((x) => x.alive && x.role === 'fearmonger')!;
  const [t, setT] = useState<number[]>(s.fearNominated ? [s.fearNominated] : []);
  const pv = t.length ? fearPreview(s, t[0]) : null;
  return (
    <Sheet title={`恐惧之灵（${seatName(fm.n)}）提名了谁？`} onClose={onClose}>
      <div className="stack">
        <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={[fm.n]} label="被提名的人" />
        {pv && (
          <div className={`card ${pv.lethal ? 'card-evil' : ''}`}>
            <b>{pv.text}</b>
          </div>
        )}
        {pv?.lethal && <p className="dim">记下来以后，处决时网页会自动结算，不用再问你。</p>}
        <button
          className="btn btn-primary btn-block"
          disabled={!t.length}
          onClick={() => {
            g.commit((st) => fearmongerNominates(st, t[0]));
            onClose();
          }}
        >
          记下来，继续投票
        </button>
      </div>
    </Sheet>
  );
}

/** 食人族今天换了能力：吃到邪恶时显示网页给的假能力，可以手动换 */
function CannibalNotice({ g }: { g: Game }) {
  const s = g.s;
  const [open, setOpen] = useState(false);
  const c = s.seats.find((x) => x.alive && x.role === 'cannibal');
  const ate = s.lastExecution && s.lastExecution.night === s.night ? seatOf(s, s.lastExecution.seat) : null;
  if (!c || !s.gained[c.n] || (!ate && !s.cannibalPoisoned)) return null;
  const cur = s.gained[c.n];
  const night = new Set<string>(scriptOf(s).otherNights);
  const firstOnly = new Set<string>(scriptOf(s).firstNight.filter((x) => !night.has(x)));
  const options = scriptOf(s).roles.filter((r) => ROLES[r].team === 'townsfolk' && r !== 'cannibal');
  return (
    <div className={`card ${s.cannibalPoisoned ? 'card-warn' : ''} stack`} style={{ gap: 8 }}>
      {s.cannibalPoisoned ? (
        <>
          <b>食人族（{seatName(c.n)}）吃到了邪恶玩家：他中毒了</b>
          <p>
            网页给他的假能力：<b className="good">【{roleName(cur)}】</b>。之后按这个能力叫醒他，给的信息可以是假的，直到下一个善良玩家被处决死亡。
          </p>
          <button className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>
            换一个假能力
          </button>
        </>
      ) : (
        <p>
          食人族（{seatName(c.n)}）现在拥有<b className="good">【{roleName(cur)}】</b>的能力（他自己不会被告知）。
        </p>
      )}
      {open && (
        <Sheet title="食人族的假能力" onClose={() => setOpen(false)}>
          <div className="choices">
            {options.map((r) => (
              <button
                key={r}
                className={`choice${r === cur ? ' sel' : ''}`}
                onClick={() => {
                  g.commit((st) => setCannibalFake(st, r));
                  setOpen(false);
                }}
              >
                <span className="lab">{roleName(r)}</span>
                <span className="why">
                  {night.has(r)
                    ? '之后每晚会按这个能力叫醒他，给假信息。'
                    : firstOnly.has(r)
                      ? '只在第一晚行动：之后不会再叫醒他，他会以为自己没事做。'
                      : '白天能力：他来找你时，按中毒给假信息。'}
                </span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

/* ---------------- 贞洁者 / 猎手 ---------------- */

function twistChoices(kind: 'spyTownsfolk' | 'recluseDemon'): Choice<boolean>[] {
  if (kind === 'spyTownsfolk')
    return [
      { key: 'yes', label: '把间谍当成镇民：他被处决', value: true, lean: 1, truth: true, twist: true, reason: '邪恶少一个爪牙，帮善良。' },
      { key: 'no', label: '不当成镇民：什么都不发生', value: false, lean: -1, truth: true, reason: '间谍活下来，帮邪恶。' },
    ];
  return [
    { key: 'yes', label: '把陌客当成恶魔：陌客死亡', value: true, lean: -1, truth: true, twist: true, reason: '好人白白少一个人，帮邪恶。' },
    { key: 'no', label: '不当成恶魔：什么都不发生', value: false, lean: 1, truth: true, reason: '陌客活下来，帮善良。' },
  ];
}

function TwistPick({ g, kind, onValue }: { g: Game; kind: 'spyTownsfolk' | 'recluseDemon'; onValue: (v: boolean) => void }) {
  const s = g.s;
  const choices = useMemo(() => twistChoices(kind), [kind]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 7)), [choices, s]);
  const [sel, setSel] = useState(rec);
  return (
    <ChoicePanel
      s={s}
      choices={choices}
      sel={sel}
      rec={rec}
      onSel={(i) => {
        if (i < 0) return;
        setSel(i);
        onValue(choices[i].value);
      }}
    />
  );
}

function VirginSheet({ g, virginN, onClose, onVote }: { g: Game; virginN: number; onClose: () => void; onVote?: () => void }) {
  const s = g.s;
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const pv = t.length ? previewVirgin(s, virginN, t[0]) : null;
  const [twist, setTwist] = useState<boolean | null>(null);
  const twistVal = twist ?? (pv?.askTwist ? twistChoices(pv.askTwist)[recommend(twistChoices(pv.askTwist), balance(s).score, stepRng(s, 7))].value : false);
  const fires = pv ? pv.applies || (!!pv.askTwist && twistVal) : false;
  return (
    <Sheet title={`${seatName(virginN)} 被提名了`} onClose={onClose}>
      <div className="stack">
        <SeatPicker s={s} selected={t} max={1} onChange={(v) => { setT(v); setTwist(null); }} disabled={[virginN]} label="是谁提名的？" />
        {pv && <div className="card"><p>{pv.reason}</p></div>}
        {pv?.askTwist && <TwistPick key={t[0]} g={g} kind={pv.askTwist} onValue={setTwist} />}
        {pv && <SayBox title="公开宣布" lines={fires ? [`${seatName(t[0])} 被处决了。`] : ['提名有效，继续进行投票。']} />}
        <button
          className="btn btn-primary btn-block"
          disabled={!pv}
          onClick={() => {
            g.commit((st) => nominateVirgin(st, virginN, t[0], twistVal));
            ui.toast(fires ? `${seatName(t[0])} 被立刻处决` : '贞洁者能力未触发，继续投票');
            if (!fires && onVote) onVote();
            else onClose();
          }}
        >
          {pv && !fires && onVote ? '确认，接着记这次投票的票数' : '确认'}
        </button>
      </div>
    </Sheet>
  );
}

function SlayerSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const ui = useUi();
  const [shooter, setShooter] = useState<number[]>([]);
  const [target, setTarget] = useState<number[]>([]);
  const pv = shooter.length && target.length ? previewSlayer(s, shooter[0], target[0]) : null;
  const [twist, setTwist] = useState<boolean | null>(null);
  const twistVal = twist ?? (pv?.askTwist ? twistChoices(pv.askTwist)[recommend(twistChoices(pv.askTwist), balance(s).score, stepRng(s, 7))].value : false);
  const hit = pv ? pv.applies || (!!pv.askTwist && twistVal) : false;
  return (
    <Sheet title="猎手开枪" onClose={onClose}>
      <div className="stack">
        <SeatPicker s={s} selected={shooter} max={1} onChange={(v) => { setShooter(v); setTwist(null); }} label="谁开的枪？" />
        <SeatPicker s={s} selected={target} max={1} onChange={(v) => { setTarget(v); setTwist(null); }} label="他向谁开枪？" />
        {pv && <div className="card"><p>{pv.reason}</p></div>}
        {pv?.swTakeover && demonDeathWarning(s, target[0], '死了')}
        {pv?.askTwist && <TwistPick key={`${shooter[0]}-${target[0]}`} g={g} kind={pv.askTwist} onValue={setTwist} />}
        {pv && <SayBox title="公开宣布" lines={hit ? [`${seatName(target[0])} 死了。`] : ['什么都没有发生。']} />}
        <button
          className="btn btn-primary btn-block"
          disabled={!pv}
          onClick={() => {
            g.commit((st) => slayerShoot(st, shooter[0], target[0], twistVal));
            ui.toast(!hit ? '什么都没有发生' : pv?.swTakeover ? `${seatName(target[0])} 死亡，红唇女郎接任，游戏继续` : `${seatName(target[0])} 死亡`);
            onClose();
          }}
        >
          确认
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- 旅行者 ---------------- */

/** 官员/窃贼昨晚选的人：今天数票时加减 */
function VoteMods({ s }: { s: GameState }) {
  const xs = Object.entries(s.voteMods);
  if (!xs.length) return null;
  return (
    <div className="card card-warn">
      <p>
        <b>今天数票时注意（只有你知道）：</b>
        {xs.map(([n, v]) => `${seatName(+n)} 举手算${v < 0 ? `负 ${-v}` : ` ${v} `}票`).join('；')}。
      </p>
    </div>
  );
}

type TPanel = 'join' | 'exile' | 'leave' | 'gun' | 'beggar' | null;

/** 白天的旅行者：中途加入、放逐、离场、枪手、乞丐 */
function TravellerDay({ g }: { g: Game }) {
  const s = g.s;
  const ui = useUi();
  const [p, setP] = useState<TPanel>(null);
  const close = () => setP(null);
  const ts = activeTravellers(s);
  const alive = ts.filter((x) => x.alive);
  const gun = alive.find((x) => x.role === 'gunslinger');
  const beggar = alive.find((x) => x.role === 'beggar');
  const btn = (key: TPanel, label: string) => (
    <button key={key} className="btn btn-ghost btn-block" onClick={() => setP(key)}>
      {label}
    </button>
  );
  return (
    <div className="card">
      <h3>旅行者</h3>
      {ts.length > 0 && (
        <p className="dim" style={{ marginBottom: 8 }}>
          {ts.map((x) => `${seatName(x.n)} ${roleName(x.role)}（${x.traveller!.alignment === 'evil' ? '邪恶' : '善良'}${x.alive ? '' : '，已死'}）`).join('；')}
        </p>
      )}
      <div className="stack" style={{ gap: 8 }}>
        {btn('join', '有人中途加入（当旅行者）')}
        {alive.length > 0 && btn('exile', '有人提议放逐旅行者')}
        {gun && s.gunslingerDay !== s.night && btn('gun', `枪手（${seatName(gun.n)}）在第一次投票后开枪`)}
        {beggar && btn('beggar', `有死人把投票标记给了乞丐（${seatName(beggar.n)}）`)}
        {ts.length > 0 && btn('leave', '旅行者要提前离开')}
      </div>
      {p === 'join' && <AddTravellerSheet g={g} onClose={close} />}
      {p === 'exile' && (
        <ExileSheet
          g={g}
          onClose={close}
          onExile={(n) => {
            g.commit((st) => exile(st, n));
            ui.toast(`${seatName(n)} 被放逐`);
            close();
          }}
        />
      )}
      {p === 'gun' && gun && <GunSheet g={g} gunN={gun.n} onClose={close} />}
      {p === 'beggar' && beggar && <BeggarSheet g={g} beggarN={beggar.n} onClose={close} />}
      {p === 'leave' && <LeaveSheet g={g} onClose={close} />}
    </div>
  );
}

function GunSheet({ g, gunN, onClose }: { g: Game; gunN: number; onClose: () => void }) {
  const s = g.s;
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const pv = t.length ? gunslingerPreview(s, gunN, t[0]) : null;
  return (
    <Sheet title={`枪手（${seatName(gunN)}）开枪`} onClose={onClose}>
      <div className="stack">
        <p className="dim">每天一次：今天第一次投票数完票后，他可以选一名刚才举手投了票的人，那个人死亡。</p>
        <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={[gunN]} label="他向谁开枪？（必须是刚才投了票的人）" />
        {pv && <div className="card"><p>{pv.text}</p></div>}
        {pv?.hits && demonDeathWarning(s, t[0], '死了')}
        {pv && <SayBox title="公开宣布" lines={pv.hits ? [`${seatName(t[0])} 死了。`] : ['什么都没有发生。']} />}
        <button
          className="btn btn-primary btn-block"
          disabled={!pv}
          onClick={() => {
            g.commit((st) => gunslingerShoot(st, gunN, t[0]));
            ui.toast(pv!.hits ? `${seatName(t[0])} 死亡` : '什么都没有发生');
            onClose();
          }}
        >
          确认
        </button>
      </div>
    </Sheet>
  );
}

function BeggarSheet({ g, beggarN, onClose }: { g: Game; beggarN: number; onClose: () => void }) {
  const s = g.s;
  const [t, setT] = useState<number[]>([]);
  const d = t.length ? seatOf(s, t[0]) : null;
  const twist = d && (d.role === 'spy' || d.role === 'recluse');
  return (
    <Sheet title={`乞丐（${seatName(beggarN)}）拿到了投票标记`} onClose={onClose}>
      <div className="stack">
        <p className="dim">乞丐只能用别人给的投票标记投票。死人把自己的投票标记给他，就用掉了自己最后一票；乞丐会私下得知这个死人的阵营。</p>
        <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={s.seats.filter((x) => x.alive).map((x) => x.n)} label="哪个死人给的？" />
        {d && <SayBox title="小声告诉乞丐" lines={[`${seatName(d.n)} 是${isEvil(d) ? '邪恶' : '善良'}的。`]} />}
        {twist && <p className="dim">他是{roleName(d!.role)}：也可以说成另一个阵营。</p>}
        <button className="btn btn-primary btn-block" disabled={!d} onClick={() => { g.commit((st) => { beggarLearns(st, beggarN, d!.n); }); onClose(); }}>
          说完了
        </button>
      </div>
    </Sheet>
  );
}

function LeaveSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  return (
    <Sheet title="旅行者提前离开" onClose={onClose}>
      <div className="stack">
        <p className="dim">旅行者随时可以走，不影响游戏。他离开后不再参与投票，放逐所需票数也会少算他一个。</p>
        <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={s.seats.filter((x) => !x.traveller).map((x) => x.n)} label="谁要走？" />
        {t.length > 0 && <SayBox title="公开宣布" lines={[`${seatName(t[0])} 离开了游戏。`]} />}
        <button
          className="btn btn-primary btn-block"
          disabled={!t.length}
          onClick={() => {
            g.commit((st) => leave(st, t[0]));
            ui.toast(`${seatName(t[0])} 已离开`);
            onClose();
          }}
        >
          确认离开
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- 残阳高照 / 王不见王 ---------------- */

/** 处决某人前：他会不会真的死（魔鬼代言人、茶艺师、弄臣、僵怖） */
function ExecGuard({ s, n }: { s: GameState; n: number }) {
  const x = seatOf(s, n);
  if (advocateSaves(s, n))
    return (
      <div className="card card-warn">
        <b>{seatName(n)} 昨晚受魔鬼代言人保护：被处决但不会死。</b>
        <p className="dim">公开只说「{seatName(n)} 被处决了，但他没有死」。</p>
      </div>
    );
  if (!x.alive && !(x.role === 'zombuul' && s.zombuulFake)) return null;
  const pv = killPreview(s, n);
  if (pv.dies && x.role !== 'zombuul') return null;
  return (
    <div className="card card-warn">
      <p>{pv.text}</p>
    </div>
  );
}

/** 只有说书人知道的提醒：魔鬼代言人保护、僵怖假死、报丧女妖 */
function SecretNotices({ s }: { s: GameState }) {
  const out: ReactNode[] = [];
  const adv = s.advocate;
  if (adv && adv.ok && adv.night === s.night && advocateSaves(s, adv.seat))
    out.push(<p key="adv">魔鬼代言人昨晚保护了 <b>{seatName(adv.seat)}</b>：今天处决他不会死（只有你知道）。</p>);
  const z = s.zombuulFake ? s.seats.find((x) => x.role === 'zombuul') : undefined;
  if (z) out.push(<p key="z">僵怖（<b>{seatName(z.n)}</b>）在假死：大家以为他死了，其实还活着。他不能提名，只剩一次投票。</p>);
  if (s.bansheeActive)
    out.push(<p key="b">报丧女妖（<b>{seatName(s.bansheeActive)}</b>）能力生效：每天可以提名两次（死了也行），每次投票举双手算两票。</p>);
  if (s.sweetheartDrunk) out.push(<p key="sw">{seatName(s.sweetheartDrunk)} 被心上人弄醉了：他的能力无效。</p>);
  if (s.philoDrunk && philoDrunk(s, s.philoDrunk)) out.push(<p key="ph">{seatName(s.philoDrunk)} 被哲学家拿了能力，正在醉酒：他的能力无效。</p>);
  const nd = s.seats.find((x) => x.role === 'nodashii' && x.alive);
  if (nd && !malfunction(s, nd.n)) out.push(<p key="nd">诺-达鲺（{seatName(nd.n)}）左右最近的镇民 {townsfolkNeighbors(s, nd.n).map((n) => seatName(n)).join('、')} 一直中毒。</p>);
  const vg = s.vigor.filter((v) => !seatOf(s, v.minion).alive && teamOf(seatOf(s, v.minion).role) === 'minion');
  if (vg.length && s.seats.some((x) => x.role === 'vigormortis' && x.alive))
    out.push(<p key="vg">被亡骨魔杀死的爪牙 {vg.map((v) => seatName(v.minion)).join('、')} 能力还在{vg.some((v) => v.poisoned) ? `；${vg.filter((v) => v.poisoned).map((v) => seatName(v.poisoned)).join('、')} 因此中毒` : ''}。</p>);
  const zealot = s.seats.find((x) => x.alive && x.role === 'zealot');
  if (zealot && aliveVoters(s) >= 5) out.push(<p key="ze">狂热者（{seatName(zealot.n)}）：存活 5 人以上，每次投票他都必须举手。</p>);
  const qt = s.seats.find((x) => x.alive && x.role === 'qutler');
  if (qt && s.qutlerMaster) out.push(<p key="qt">Q宝（{seatName(qt.n)}）只有主人 {seatName(s.qutlerMaster)} 投票时才能投票。</p>);
  if (s.puzzleDrunk && s.seats.some((x) => x.role === 'puzzlemaster')) out.push(<p key="pz">{seatName(s.puzzleDrunk)} 整局醉酒（解谜大师）。</p>);
  const preached = s.preached.filter((n) => malfunction(s, n) && seatOf(s, n).alive);
  if (preached.length) out.push(<p key="pr">被传教士选中的爪牙 {preached.map((n) => seatName(n)).join('、')} 没有能力。</p>);
  if (s.snakePoisoned.length) out.push(<p key="sn">{s.snakePoisoned.map((n) => seatName(n)).join('、')} 被舞蛇人换下来，一直中毒。</p>);
  if (s.twin && s.seats.some((x) => x.role === 'eviltwin')) {
    const e = s.seats.find((x) => x.role === 'eviltwin')!;
    out.push(<p key="tw">镜像双子 {seatName(e.n)}，善良的双子 {seatName(s.twin)}：处决 {seatName(s.twin)} 邪恶直接获胜{twinsBlock(s) ? '；两人都活着时善良赢不了' : ''}。</p>);
  }
  const h = s.harpy;
  if (h && !h.done && h.night === s.night)
    out.push(
      <p key="harpy">
        鹰身女妖：今天留意 <b>{seatName(h.mad)}</b> 有没有努力证明 {seatName(h.second)} 是邪恶的。提名结束前，在下面投票区旁边判断。
      </p>,
    );
  if (s.mastermindDay && s.night === s.mastermindDay)
    out.push(<p key="mm">恶魔已经被处决，但主谋在场：今天是额外的一天（不要宣布游戏结束）。今天处决了谁，谁的阵营就输。</p>);
  // 今天醉酒的活人：同一个人只列一次；吟游诗人触发时合并成一句
  const drunk = s.tempDrunk.filter((d) => d.from <= s.night && s.night <= d.to && seatOf(s, d.seat).alive);
  const minstrel = drunk.some((d) => d.why === '吟游诗人') ? s.seats.find((x) => x.role === 'minstrel') : undefined;
  const single = [...new Map(drunk.filter((d) => !minstrel || d.seat === minstrel.n).map((d) => [d.seat, d])).values()];
  if (minstrel)
    out.push(<p key="mdrunk">今天除吟游诗人（{seatName(minstrel.n)}）外，所有活着的人都醉酒（爪牙被处决）：能力无效，信息可以是假的。</p>);
  if (single.length)
    out.push(
      <p key="drunk">
        今天醉酒（能力无效、信息可以是假的）：{single.map((d) => `${seatName(d.seat)}（${drunkWhy(d.why)}）`).join('、')}。
      </p>,
    );
  if (!out.length) return null;
  return <div className="card stack" style={{ gap: 6 }}>{out}</div>;
}

/** 造谣者：白天公开说了一句话，由说书人判断真假 */
function GossipSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const gs = s.seats.find((x) => x.alive && x.role === 'gossip')!;
  const set = (v: boolean) => {
    g.commit((st) => setGossip(st, gs.n, v));
    onClose();
  };
  return (
    <Sheet title={`造谣者（${seatName(gs.n)}）的声明`} onClose={onClose}>
      <div className="stack">
        <p>他公开说了一句话。按魔典判断这句话是真是假（点右上角书本图标看魔典）。</p>
        <p className="dim">是真的：今晚由你决定一名玩家死亡（网页晚上会提醒你）。{malfunction(s, gs.n) ? '他现在中毒/醉酒：真的也不会有人死。' : ''}</p>
        <div className="row">
          <button className="btn btn-primary grow" onClick={() => set(true)}>
            是真的
          </button>
          <button className="btn btn-outline grow" onClick={() => set(false)}>
            是假的
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** 修补匠：说书人决定他现在死 */
function TinkerSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const t = s.seats.find((x) => x.alive && x.role === 'tinker')!;
  return (
    <Sheet title={`修补匠（${seatName(t.n)}）`} onClose={onClose}>
      <div className="stack">
        <p>修补匠随时可能死。你决定让他现在死吗？</p>
        <p className="dim">好人少一个，帮邪恶。通常不用急，每晚网页也会问你一次。</p>
        <SayBox title="公开宣布" lines={[`${seatName(t.n)} 死了。`]} />
        <button
          className="btn btn-danger btn-block"
          onClick={() => {
            g.commit((st) => tinkerDies(st));
            onClose();
          }}
        >
          让他现在死亡
        </button>
        <button className="btn btn-outline btn-block" onClick={onClose}>
          算了
        </button>
      </div>
    </Sheet>
  );
}

/** 卖花女孩：白天记下恶魔有没有投票，晚上要告诉她 */
function FlowergirlCard({ g }: { g: Game }) {
  const s = g.s;
  const fg = s.seats.find((x) => x.alive && hasAbility(s, x, 'flowergirl'));
  const d = demonSeat(s);
  if (!fg || !d) return null;
  const voted = s.demonVotedDay === s.night;
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <p>
        <b>卖花女孩在场</b>：投票时留意恶魔（{seatName(d.n)}）有没有举手，今晚要告诉她。
      </p>
      <button className={`btn btn-block ${voted ? 'btn-primary' : 'btn-outline'}`} onClick={() => g.commit((st) => setDemonVoted(st, !voted))}>
        {voted ? '已记下：恶魔今天投过票（点一下取消）' : '恶魔投票了，点这里记一下'}
      </button>
    </div>
  );
}

/** 鹰身女妖：今天由说书人判断第一个人有没有做到疯狂 */
function HarpyCard({ g }: { g: Game }) {
  const s = g.s;
  const h = s.harpy;
  const [fail, setFail] = useState(false);
  const choices = useMemo(() => (h && !h.done ? harpyPunishChoices(s) : []), [s, h]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 81)), [choices, s]);
  const [sel, setSel] = useState<number | null>(null);
  if (!h || h.night !== s.night || h.done || s.winner) return null;
  const c = choices[sel ?? rec];
  return (
    <div className="card card-warn stack" style={{ gap: 8 }}>
      <b style={{ color: 'var(--warn)' }}>
        鹰身女妖：{seatName(h.mad)} 今天要疯狂地证明 {seatName(h.second)} 是邪恶的
      </b>
      <p className="dim">
        <b>提名结束前再判断</b>：讨论和提名时看他有没有努力让大家相信。没做到的话，你可以让他们之中一人或两人死亡（当场公开宣布）。
      </p>
      {!fail ? (
        <div className="row">
          <button className="btn btn-outline grow" onClick={() => g.commit((st) => harpyPunish(st, []))}>
            他做到了
          </button>
          <button className="btn btn-primary grow" onClick={() => setFail(true)}>
            他没做到
          </button>
        </div>
      ) : (
        <>
          <ChoicePanel s={s} choices={choices} sel={sel ?? rec} rec={rec} onSel={(i) => i >= 0 && setSel(i)} moreLabel="换一种处罚" />
          {c && <SayBox title="公开宣布" lines={c.value.length ? [`${c.value.map((n) => seatName(n)).join('、')} 死了。`] : ['什么都没有发生。']} />}
          {c && c.value.some((n) => isDemonSeat(s, n)) && demonDeathWarning(s, c.value.find((n) => isDemonSeat(s, n))!, '死了')}
          <button className="btn btn-primary btn-block" disabled={!c} onClick={() => c && g.commit((st) => harpyPunish(st, c.value))}>
            确认
          </button>
        </>
      )}
    </div>
  );
}

/** 戏法师：公开猜所有爪牙和恶魔 */
function AlsaahirSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const a = holderOf(s, 'alsaahir')!;
  const [m, setM] = useState<number[]>([]);
  const [d, setD] = useState<number[]>([]);
  const [override, setOverride] = useState<boolean | null>(null);
  const correct = alsaahirCorrect(s, m, d);
  const verdict = override ?? correct;
  const bad = malfunction(s, a.n);
  const real = (t: 'minion' | 'demon') => s.seats.filter((x) => !x.traveller && teamOf(x.role) === t).map((x) => seatName(x.n)).join('、') || '无';
  const twist = s.seats.some((x) => x.role === 'spy' || x.role === 'recluse');
  return (
    <Sheet title={`戏法师（${seatName(a.n)}）公开猜测`} onClose={onClose}>
      <div className="stack">
        <p className="dim">每天一次。他要说出所有爪牙和恶魔（死了的也算）。全部说对，善良直接获胜；说错什么都不会发生。</p>
        <SeatPicker s={s} selected={m} max={4} onChange={(v) => { setM(v); setOverride(null); }} label="他说哪些人是爪牙？" />
        <SeatPicker s={s} selected={d} max={1} onChange={(v) => { setD(v); setOverride(null); }} label="他说谁是恶魔？" />
        <div className={`card${verdict ? ' card-warn' : ''}`}>
          <p>
            真实情况：爪牙 {real('minion')}；恶魔 {real('demon')}。
          </p>
          <b>{d.length ? (correct ? '他全部说对了。' : '他没有全部说对。') : '先点出他说的人。'}</b>
        </div>
        {twist && d.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <p className="dim">场上有间谍/陌客：间谍可以不算爪牙，陌客可以被当成爪牙或恶魔。你可以改判：</p>
            <TwoChoice value={verdict} onChange={setOverride} yes="算他猜对" no="算他猜错" />
          </div>
        )}
        {bad && <p className="dim">他中毒/醉酒：猜对也没用。</p>}
        {d.length > 0 && <SayBox title="公开宣布" lines={verdict && !bad ? ['戏法师猜对了！善良阵营获胜！'] : ['什么都没有发生。']} />}
        <button
          className="btn btn-primary btn-block"
          disabled={!d.length}
          onClick={() => {
            g.commit((st) => alsaahirGuess(st, a.n, m, d, verdict));
            onClose();
          }}
        >
          确认
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- 提名记录 ---------------- */

const NOM_TEXT: Record<NomResult, (r: NomRow) => string> = {
  short: (r) => `不够 ${r.need} 票`,
  lower: () => '够票，但没超过之前的最高票',
  block: () => '待处决',
  beaten: () => '被后面的人超过',
  tie: () => '平票，都不处决',
};

/** 今天的提名：每一条的结果，记错了可以删 */
function NomList({ g }: { g: Game }) {
  const s = g.s;
  const { rows, block, top } = nomResults(s);
  if (!rows.length) return <p className="dim">每次数完票点"记一次提名"填进来，网页帮你判断谁待处决、有没有平票。</p>;
  return (
    <div className="noms">
      {rows.map((r) => (
        <div key={r.i} className={`nom ${r.result}`}>
          <span className="who">{seatName(r.seat)}</span>
          <span className="v">{r.votes} 票</span>
          <span className="res">{NOM_TEXT[r.result](r)}</span>
          <button className="icon-btn" aria-label={`删掉这条：${seatName(r.seat)} ${r.votes} 票`} onClick={() => g.commit((x) => void x.noms.splice(r.i, 1))}>
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
      <p className="nom-sum">
        {block ? (
          <>
            现在待处决：<b>{seatName(block)}</b>（{top} 票）
          </>
        ) : top ? (
          `${top} 票平票：现在没人待处决，之后要超过 ${top} 票才行`
        ) : (
          '现在没人待处决'
        )}
      </p>
    </div>
  );
}

/** 记一次提名：选被提名的人，填数好的票数 */
const PICKER_KEY = 'botc-nom-picker';

function NomSheet({ g, onClose, initial }: { g: Game; onClose: () => void; initial?: number }) {
  const s = g.s;
  const ui = useUi();
  const [mode, setMode] = useState<'circle' | 'grid'>(() => {
    try {
      return localStorage.getItem(PICKER_KEY) === 'grid' ? 'grid' : 'circle';
    } catch {
      return 'circle';
    }
  });
  const choose = (m: 'circle' | 'grid') => {
    setMode(m);
    try {
      localStorage.setItem(PICKER_KEY, m);
    } catch {
      /* 记不住也没关系 */
    }
  };
  const need = voteNeed(s);
  const [t, setT] = useState<number[]>(initial ? [initial] : []);
  const [votes, setVotes] = useState<number | null>(null);
  const { top, block } = nomResults(s);
  const n = t[0];
  const again = n !== undefined && s.noms.some((x) => x.day === s.night && x.seat === n);
  // 从空开始按"＋"就是 1 票
  const step = (d: number) => setVotes((v) => Math.max(0, (v ?? 0) + d));
  // 最多能有多少票：所有玩家（死人和旅行者也能投）+ 算 3 票的人多出来的
  const maxVotes = s.seats.filter((x) => !x.left).length + Object.values(s.voteMods).reduce((a, v) => a + Math.max(0, v - 1), 0);
  const tooMany = votes !== null && votes > maxVotes;
  const verdict =
    votes === null
      ? null
      : tooMany
        ? `${votes} 票比能投票的人（最多 ${maxVotes} 票）还多：是不是多打了一位？`
        : votes < need
        ? `${votes} 票，不够 ${need} 票：不上处决台。`
        : votes > top
          ? `${votes} 票 → 成为待处决${block && block !== n ? `（换下 ${seatName(block)}）` : ''}。`
          : votes === top
            ? `和今天最高的 ${top} 票打平 → 都不处决。`
            : `够票，但没超过今天最高的 ${top} 票：不上处决台。`;
  return (
    <Sheet title="记一次提名" onClose={onClose}>
      <div className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="dim">谁被提名了？</span>
          <div className="seg" role="tablist" aria-label="怎么选人">
            <button role="tab" aria-selected={mode === 'circle'} className={mode === 'circle' ? 'on' : ''} onClick={() => choose('circle')}>
              点圆桌
            </button>
            <button role="tab" aria-selected={mode === 'grid'} className={mode === 'grid' ? 'on' : ''} onClick={() => choose('grid')}>
              点号码
            </button>
          </div>
        </div>
        {mode === 'circle' ? (
          <GrimoireCircle
            s={s}
            selected={t}
            onSeat={(x) => (isTraveller(seatOf(s, x)) ? ui.toast('旅行者不能被提名处决，只能放逐') : setT([x]))}
            hub={<small>{n !== undefined ? `${seatName(n)} 被提名` : '点被提名的人'}</small>}
          />
        ) : (
          <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={s.seats.filter(isTraveller).map((x) => x.n)} />
        )}
        <div className="dim">举手的票数（数完填进来；算 3 票、负票的人按实际算）</div>
        <div className="stepper">
          <button className="btn btn-ghost" aria-label="少一票" onClick={() => step(-1)}>
            <Icon name="minus" />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={votes ?? ''}
            placeholder="票数"
            aria-label="票数"
            onChange={(e) => setVotes(e.target.value === '' ? null : Math.max(0, Math.floor(+e.target.value || 0)))}
          />
          <button className="btn btn-ghost" aria-label="多一票" onClick={() => step(1)}>
            <Icon name="plus" />
          </button>
        </div>
        {/* 判定区一开始就占好位置：出现结果时上面的"＋/−"不会被顶走 */}
        <div className={`card nom-verdict${tooMany ? ' card-evil' : votes !== null && votes >= need && votes > top ? ' card-warn' : ''}`}>
          {again && <p className="dim">{seatName(n)} 今天已经被提名过（每人每天只能被提名一次）。</p>}
          <p className={verdict ? '' : 'dim'}>{verdict ?? '填好票数后，这里显示这次提名的结果。'}</p>
        </div>
        {tooMany ? (
          <ConfirmButton
            className="btn btn-primary btn-block"
            label={`记下 ${votes} 票`}
            confirmLabel="票数比人还多，再点一次确认"
            onConfirm={() => {
              g.commit((x) => void x.noms.push({ day: x.night, seat: n, votes: votes!, need }));
              onClose();
            }}
          />
        ) : (
          <button
            className="btn btn-primary btn-block"
            disabled={n === undefined || votes === null}
            onClick={() => {
              g.commit((x) => void x.noms.push({ day: x.night, seat: n, votes: votes!, need }));
              onClose();
            }}
          >
            {n === undefined ? '先点出被提名的人' : votes === null ? '再填票数' : '记下'}
          </button>
        )}
      </div>
    </Sheet>
  );
}

/* ---------------- 梦殒春宵 ---------------- */

/** 女巫：被诅咒的人今天一提名就死 */
function WitchCard({ g }: { g: Game }) {
  const s = g.s;
  const c = s.witchCurse;
  if (!c || c.night !== s.night || !witchActive(s) || s.winner || !seatOf(s, c.seat).alive) return null;
  return (
    <div className="card card-warn stack" style={{ gap: 8 }}>
      <b style={{ color: 'var(--warn)' }}>女巫诅咒了 {seatName(c.seat)}：他今天一提名就会死</b>
      <p className="dim">他提名时立刻公开宣布他死亡，他的提名照常投票。只有你知道诅咒，别提前说。</p>
      <ConfirmButton className="btn btn-primary btn-block" label={`${seatName(c.seat)} 提名了：宣布他死亡`} confirmLabel="再点一次，确认他死亡" onConfirm={() => g.commit((st) => witchStrikes(st))} />
    </div>
  );
}

/** 洗脑师：被洗脑的人今天要疯狂地装成某个角色 */
function CereCard({ g }: { g: Game }) {
  const s = g.s;
  const m = s.cereMad;
  if (!m || m.night !== s.night || s.winner || s.executed !== undefined) return null;
  return (
    <div className="card card-warn stack" style={{ gap: 8 }}>
      <b style={{ color: 'var(--warn)' }}>
        洗脑师：{seatName(m.seat)} 今天要疯狂地证明自己是{roleName(m.role)}
      </b>
      <p className="dim">
        <b>提名结束前再判断</b>：他没有认真装，你可以公开宣布处决他（算今天的处决，今天就结束）。被洗脑的是邪恶玩家时可以不处决。
      </p>
      <div className="row">
        <button className="btn btn-outline grow" onClick={() => g.commit((st) => cereVerdict(st, false))}>
          他做到了 / 不处决
        </button>
        <ConfirmButton className="btn btn-danger grow" label="他没做到：处决他" confirmLabel="再点一次确认处决" onConfirm={() => g.commit((st) => cereVerdict(st, true))} />
      </div>
    </div>
  );
}

/** 城镇公告员：爪牙提名时点一下 */
function TownCrierCard({ g }: { g: Game }) {
  const s = g.s;
  const tc = s.seats.find((x) => x.alive && hasAbility(s, x, 'towncrier'));
  if (!tc) return null;
  const yes = s.minionNominatedDay === s.night;
  const minions = s.seats.filter((x) => !x.traveller && teamOf(x.role) === 'minion');
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <p>
        <b>城镇公告员在场</b>：留意爪牙（{minions.map((x) => seatName(x.n)).join('、') || '无'}）有没有提名，今晚要告诉他。
      </p>
      <button className={`btn btn-block ${yes ? 'btn-primary' : 'btn-outline'}`} onClick={() => g.commit((st) => setMinionNominated(st, !yes))}>
        {yes ? '已记下：今天有爪牙提名过（点一下取消）' : '有爪牙提名了，点这里记一下'}
      </button>
    </div>
  );
}

/** 杂耍艺人：第一个白天公开猜最多五个人的角色 */
function JugglerSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const j = holderOf(s, 'juggler')!;
  const prev = s.juggler?.day === s.night ? (s.juggler.guesses ?? []) : [];
  const [guesses, setGuesses] = useState<{ seat: number; role: RoleId }[]>(prev);
  const [seat, setSeat] = useState<number[]>([]);
  const real = jugglerCount(s, guesses);
  const [override, setOverride] = useState<number | null>(null);
  const correct = override ?? real;
  const twist = guesses.some((x) => ['spy', 'recluse'].includes(seatOf(s, x.seat).role));
  const add = (r: RoleId) => {
    if (!seat.length || guesses.length >= 5) return;
    setGuesses([...guesses, { seat: seat[0], role: r }]);
    setSeat([]);
    setOverride(null);
  };
  return (
    <Sheet title={`杂耍艺人（${seatName(j.n)}）公开猜角色`} onClose={onClose}>
      <div className="stack">
        <p className="dim">他成为杂耍艺人后的第一个白天，可以公开猜最多五次"某人是某角色"。每猜一次：先点那个人，再点角色。当晚他会得知猜对了几个。</p>
        {guesses.length > 0 && (
          <div className="card stack" style={{ gap: 4 }}>
            {guesses.map((x, i) => (
              <div key={i} className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <span>
                  {i + 1}. {seatName(x.seat)} 是{roleName(x.role)}{' '}
                  <span className={seatOf(s, x.seat).role === x.role ? 'good' : 'dim'}>{seatOf(s, x.seat).role === x.role ? '✓ 对' : '✗ 错'}</span>
                </span>
                <button className="btn btn-outline btn-sm" onClick={() => { setGuesses(guesses.filter((_, k) => k !== i)); setOverride(null); }}>
                  删掉
                </button>
              </div>
            ))}
          </div>
        )}
        {guesses.length < 5 && (
          <>
            <SeatPicker s={s} selected={seat} max={1} onChange={setSeat} label={`第 ${guesses.length + 1} 个猜测：他说谁？`} />
            {seat.length > 0 && (
              <div className="role-grid compact">
                {scriptOf(s).roles.map((r) => (
                  <button key={r} className={`role-chip${teamOf(r) === 'minion' || teamOf(r) === 'demon' ? ' evil-c' : ''}`} onClick={() => add(r)}>
                    {roleName(r)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <div className="card">
          <b>猜对 {correct} 个</b>
          {twist && (
            <div className="stack" style={{ gap: 6, marginTop: 8 }}>
              <p className="dim">他猜到了间谍/陌客：他们可以被当成别的角色，你可以改判猜对的个数。</p>
              <div className="row">
                {Array.from({ length: guesses.length + 1 }, (_, n) => (
                  <button key={n} className={`btn btn-sm ${n === correct ? 'btn-primary' : 'btn-outline'}`} onClick={() => setOverride(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="dim">只记下来，现在不用对他说什么；今晚网页会叫醒他告诉他。</p>
        <button
          className="btn btn-primary btn-block"
          onClick={() => {
            g.commit((st) => jugglerGuess(st, j.n, guesses, correct));
            onClose();
          }}
        >
          记下他的猜测
        </button>
      </div>
    </Sheet>
  );
}

/** 公主：她第一个白天提名的人被处决，当晚恶魔不杀人 */
function PrincessCard({ g }: { g: Game }) {
  const s = g.s;
  const pr = s.seats.find((x) => x.alive && x.role === 'princess');
  if (!pr || (s.roleSince[pr.n] ?? 1) !== s.night) return null;
  const on = s.princessNight === s.night + 1;
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <p>
        <b>公主（{seatName(pr.n)}）的第一个白天</b>：她提名的人如果被处决，今晚恶魔不杀人（只有你知道）。
      </p>
      <button
        className={`btn btn-block ${on ? 'btn-primary' : 'btn-outline'}`}
        onClick={() =>
          g.commit((st) => {
            st.princessNight = on ? 0 : st.night + 1;
            logDay(st, on ? '改为：公主提名的人没有被处决' : `公主（${seatName(pr.n)}）提名的人被处决了：今晚恶魔不杀人`);
          })
        }
      >
        {on ? '已记下（点一下取消）' : '她提名的人被处决了：记一下'}
      </button>
    </div>
  );
}

/** 魔像提名：不是恶魔就当场死 */
function GolemSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const gm = holderOf(s, 'golem')!;
  const [t, setT] = useState<number[]>([]);
  const [rec, setRec] = useState(false);
  const x = t.length ? seatOf(s, t[0]) : null;
  const bad = malfunction(s, gm.n);
  const demon = !!x && (isDemonSeat(s, x.n) || (x.role === 'recluse' && rec));
  return (
    <Sheet title={`魔像（${seatName(gm.n)}）提名`} onClose={onClose}>
      <div className="stack">
        <p className="dim">魔像整局只能提名一次。被提名的不是恶魔就当场死亡，投票照常进行。</p>
        <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={[gm.n]} label="他提名了谁？" />
        {x?.role === 'recluse' && !bad && <TwoChoice value={rec} onChange={setRec} yes="陌客算恶魔（不死）" no="陌客不算恶魔（死）" />}
        {x && (
          <div className={`card${!bad && !demon ? ' card-evil' : ''}`}>
            <p>{bad ? '魔像中毒/醉酒：什么都不会发生（他的提名用掉了）。' : demon ? `${seatName(x.n)} 是恶魔：什么都不说，照常投票。` : `${seatLabel(s, x.n)} 不是恶魔：当场死亡。`}</p>
          </div>
        )}
        {x && <SayBox title="公开宣布" lines={!bad && !demon ? [`${seatName(x.n)} 死了。`, '投票照常进行。'] : ['开始投票。']} />}
        {x && !bad && !demon && isDemonSeat(s, x.n) && demonDeathWarning(s, x.n, '死了')}
        <button className="btn btn-primary btn-block" disabled={!x} onClick={() => { g.commit((st) => golemNominates(st, gm.n, t[0], rec)); onClose(); }}>
          确认
        </button>
      </div>
    </Sheet>
  );
}

/** 爪牙公开猜落难少女 */
function DamselSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const [m, setM] = useState<number[]>([]);
  const [t, setT] = useState<number[]>([]);
  const d = s.seats.find((x) => x.role === 'damsel');
  const minion = m.length ? teamOf(seatOf(s, m[0]).role) === 'minion' : false;
  const right = !!d && t[0] === d.n && d.alive && !malfunction(s, d.n) && minion;
  return (
    <Sheet title="爪牙公开猜落难少女" onClose={onClose}>
      <div className="stack">
        <p className="dim">整局只算一次：爪牙猜中，邪恶直接获胜；猜错就用掉了，之后谁猜都没用。不是爪牙的人猜不算。</p>
        <SeatPicker s={s} selected={m} max={1} onChange={setM} label="谁在猜？" />
        <SeatPicker s={s} selected={t} max={1} onChange={setT} label="他说谁是落难少女？" />
        {m.length > 0 && t.length > 0 && (
          <>
            <div className={`card${right ? ' card-evil' : ''}`}>
              <p>
                {right
                  ? `猜中了：${seatName(t[0])} 就是落难少女，邪恶获胜。`
                  : !minion
                    ? `${seatName(m[0])} 不是爪牙：什么都不会发生（不算用掉）。`
                    : '没猜中（或落难少女已死/中毒）：什么都不会发生，猜测机会用掉了。'}
              </p>
            </div>
            <SayBox title="公开宣布" lines={right ? ['猜中了！邪恶阵营获胜！'] : ['什么都没有发生。']} />
          </>
        )}
        <button
          className="btn btn-primary btn-block"
          disabled={!m.length || !t.length}
          onClick={() => {
            if (minion) g.commit((st) => damselGuess(st, m[0], t[0]));
            onClose();
          }}
        >
          确认
        </button>
      </div>
    </Sheet>
  );
}

/** 解谜大师猜谁醉酒 */
function PuzzleSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const pz = holderOf(s, 'puzzlemaster')!;
  const [t, setT] = useState<number[]>([]);
  const choices = useMemo(() => (t.length ? puzzleShowChoices(s, pz.n, t[0], stepRng(s, 61)) : []), [s, pz.n, t]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 62)), [choices, s]);
  const [sel, setSel] = useState<number | null>(null);
  const c = choices[sel ?? rec];
  const right = t[0] === s.puzzleDrunk;
  return (
    <Sheet title={`解谜大师（${seatName(pz.n)}）猜谁醉酒`} onClose={onClose}>
      <div className="stack">
        <p className="dim">整局一次。醉酒的是 {seatName(s.puzzleDrunk)}（只有你知道）。他猜对了，你私下告诉他恶魔是谁；猜错了，告诉他另一个人（假信息）。</p>
        <SeatPicker s={s} selected={t} max={1} onChange={(v) => { setT(v); setSel(null); }} disabled={[pz.n]} label="他猜谁醉酒？" />
        {t.length > 0 && (
          <>
            <div className="card">
              <p>{right ? '他猜对了。' : '他猜错了。'}{malfunction(s, pz.n) ? '（他中毒/醉酒：给假信息）' : ''}</p>
            </div>
            <ChoicePanel s={s} choices={choices} sel={sel ?? rec} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
            {c && <SayBox title="私下告诉他" lines={[`${seatName(c.value)}。`]} />}
          </>
        )}
        <button className="btn btn-primary btn-block" disabled={!c} onClick={() => { if (c) g.commit((st) => puzzleGuess(st, pz.n, t[0], c.value)); onClose(); }}>
          我告诉他了
        </button>
      </div>
    </Sheet>
  );
}
