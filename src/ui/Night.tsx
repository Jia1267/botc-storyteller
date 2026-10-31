import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ROLES, TEAM_NAME, roleName, type RoleId } from '../engine/roles';
import { balance, recommend } from '../engine/balance';
import {
  aliveNeighbors, believedRole, circleOrder, demonSeat, diedOnDay, seatOf, isDemonSeat, isEvil, isPoisoned, lilMonsta, malfunction, mustLie, scriptOf, seatLabel, seatName,
  teamOf, townsfolkNeighbors,
} from '../engine/core';
import {
  completeSlot, currentSlot, demonKillPreview, effectiveSlot, fangguJumps, goonInformed, goonTriggered, godfatherOutsiders, hadikhiaPreview, minionSeats, notWakingTonight,
  pithagBlock, previewImp, shouldRun, slotActor, slotsFor, type SlotPayload, magicianSeat, poppyActive,
} from '../engine/flow';
import { firstNightOnly } from '../engine/nightOrder';
import { jinxesIn } from '../engine/custom';
import { DISTRIBUTION } from '../engine/setup';
import type { Choice } from '../engine/balance';
import {
  balloonistChoices, bountyChoices, chambermaidChoices, chambermaidCount, chefCount, dreamLabel, dreamerChoices, duchessChoices, duchessCount,
  empathCount, flowergirlChoices, fortuneChoices, generalChoices, grandmotherChoices, innkeeperDrunkChoices, killPreview, legalNumbers, lilKillChoices,
  mayorBounceChoices, numberChoices, sailorDrunkChoices, shabalothReviveChoices, tinkerChoices,
  pairChoices, pairVerdict, pixieChoices, plagueChoices, revealChoices, revealVerdict, seamstressChoices, starpassChoices, stHarpyChoices, stPoisonChoices, sweetheartChoices,
  widowInformChoices, type PairInfo, type PairKind,
  clockmakerChoices, clockmakerCount, jugglerChoices, mathChoices, oracleChoices, pithagNightChoices, sageChoices, towncrierChoices, vigorPoisonChoices,
  SEATS_COUNT, choirboyChoices, farmerChoices, kingChoices, knightChoices, nobleChoices, priestessChoices, seatsVerdict, shugenjaChoices, shugenjaSteps,
  stewardChoices, type SeatsKind, huntsmanBecomeChoices, legionChoices, viChoices,
} from '../engine/info';
import { SLOT_TITLE, dawnLines, librarianZeroLines, phoneDuskLines, slotLines } from '../engine/scripts';
import type { GameState, Seat, SlotId } from '../engine/types';
import { stepRng, type Game } from '../store';
import { BottomBar, ChoicePanel, ConfirmButton, DoBox, SayBox, SeatPicker, Sheet, TableCtx, TwoChoice, drunkWhy, roleCard, seatMarks, usePoint, useUi } from './common';
import { shuffle } from '../engine/rng';
import { GrimoirePanel, spyRows } from './Grimoire';
import { Icon } from './icons';
import { KlutzPrompt, MoonchildPrompt, PixiePrompt, promptPending } from './Prompts';
import { useRoom } from './room/hostRoom';
import { NightPhones, PhoneBar, StepBar, infoTo, phonesOn, useNightUnread, usePhoneAsk, usePhoneOn, usePhoneSend, type PhoneItem } from './room/nightRoom';

interface StepProps {
  g: Game;
  s: GameState;
  actor: Seat;
}

export function NightScreen({ g }: { g: Game }) {
  const s = g.s;
  const slot = currentSlot(s);
  const actor = slotActor(s, slot);
  const { cur, visible, pos } = nightProgress(s);
  const eff = effectiveSlot(s, slot);
  const table = useContext(TableCtx);

  return (
    <main className="main split night">
      <div className="side">
        <GrimoirePanel s={s} awake={awakeSeats(s)} point={table.point} picker={table.picker} />
      </div>
      <div className="stack" key={`${s.night}-${cur}-${actor?.n ?? 0}`}>
        <div className="step-head">
          <span className="kicker">
            第 {s.night} 夜 · 第 {pos} 步 / 共约 {visible.length} 步
          </span>
          <div className="progress">
            {visible.map((x) => (
              <i key={x.i} className={x.i <= cur ? 'on' : ''} />
            ))}
          </div>
          <h2 style={{ marginTop: 6 }}>
            {SLOT_TITLE[slot]}
            {slot === 'amnesiac' && s.amnesiacAbility ? `（像${roleName(s.amnesiacAbility)}）` : ''}
            {slot === 'philosopher' && s.ns!.philoNow ? `：用${roleName(s.ns!.philoNow)}的能力` : ''}
          </h2>
          {actor && !(slot === 'lunatic' && s.night === 1) && slot !== 'farmer' && slot !== 'barista' && !(slot === 'king' && s.night === 1) && <ActorLine s={s} actor={actor} slot={eff} />}
        </div>
        <SlotBody g={g} s={s} slot={eff} actor={actor} />
      </div>
      {s.ns!.goonInform && <GoonInformSheet g={g} />}
      <NightPhones s={s} />
    </main>
  );
}

/** 这一步要叫醒的人：爪牙互认叫所有爪牙，恶魔得知爪牙叫恶魔，其余是本步的角色 */
export function awakeSeats(s: GameState): number[] {
  const slot = currentSlot(s);
  if (slot === 'minionInfo' || slot === 'lilmonsta') return minionSeats(s).filter((x) => x.alive).map((x) => x.n);
  if (slot === 'demonInfo') {
    const d = demonSeat(s);
    return d ? [d.n] : [];
  }
  const a = slotActor(s, slot);
  if (slot === 'eviltwin' && a && s.twin) return [a.n, s.twin];
  if (slot === 'boffin' && a) return [a.n, ...(demonSeat(s) ? [demonSeat(s)!.n] : [])];
  return a ? [a.n] : [];
}

/** 今晚第几步、一共大约几步（跳过不用醒的步骤） */
export function nightProgress(s: GameState) {
  const order = slotsFor(s);
  const cur = s.ns!.slot;
  const ran = s.ns!.ran ?? [];
  const visible = order.map((sl, i) => ({ sl, i })).filter(({ sl, i }) => (i < cur ? ran.includes(i) : i === cur || shouldRun(s, sl)));
  return { cur, visible, pos: visible.findIndex((x) => x.i === cur) + 1 };
}

/** 手机夜里顶栏下面的一排小座位：谁邪恶、谁死了、谁醉/毒，点一下打开完整魔典 */
export function MiniGrimoire({ s, onOpen }: { s: GameState; onOpen: () => void }) {
  const awake = awakeSeats(s);
  const { point } = useContext(TableCtx);
  const { cur, visible } = nightProgress(s);
  const seats = circleOrder(s).map((n) => seatOf(s, n)).filter((x) => !x.left);
  const N = seats.length;
  return (
    <button className="mini" onClick={onOpen} aria-label="迷你魔典，点一下打开完整魔典">
      <span className={`cells${N > 16 ? ' xdense' : N > 12 ? ' dense' : ''}`} style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }}>
        {seats.map((x) => {
          const keys = seatMarks(s, x.n).map((m) => m.key);
          const [st, cls] = !x.alive
            ? ['亡', 'de']
            : keys.includes('poison')
              ? ['毒', 'po']
              : keys.some((k) => k === 'drunk' || k === 'tdrunk' || k === 'swd' || k === 'phd')
                ? ['醉', 'dr']
                : keys.includes('rh')
                  ? ['扰', 'rh']
                  : ['', ''];
          return (
            <span key={x.n} className={`c${isEvil(x) ? ' evil' : ''}${x.alive ? '' : ' dead'}${awake.includes(x.n) ? ' actor' : ''}${point.includes(x.n) ? ' pt' : ''}`}>
              <i>{x.n}</i>
              <em className={cls}>{st}</em>
            </span>
          );
        })}
      </span>
      <span className="prog">
        {visible.map((x) => (
          <i key={x.i} className={x.i <= cur ? 'on' : ''} />
        ))}
      </span>
    </button>
  );
}

function ActorLine({ s, actor, slot }: { s: GameState; actor: Seat; slot: SlotId }) {
  const phones = usePhoneOn(actor.n);
  const flags: ReactNode[] = [];
  if (actor.role === 'drunk') flags.push(<span key="d" className="chip chip-warn">其实是酒鬼：能力无效，可以给假信息</span>);
  if (actor.role === 'marionette') flags.push(<span key="m" className="chip chip-evil">其实是提线木偶：能力无效，可以给假信息</span>);
  if (s.sweetheartDrunk === actor.n) flags.push(<span key="sw" className="chip chip-warn">被心上人弄醉：能力无效，可以给假信息</span>);
  if (s.philoDrunk === actor.n && malfunction(s, actor.n) && !isPoisoned(s, actor.n))
    flags.push(<span key="ph" className="chip chip-warn">哲学家拿了他的能力，他醉酒：能力无效，可以给假信息</span>);
  const td = s.tempDrunk.find((d) => d.seat === actor.n && d.from <= s.night && s.night <= d.to);
  if (td) flags.push(<span key="td" className="chip chip-warn">醉酒（{drunkWhy(td.why)}）：能力无效，可以给假信息</span>);
  if (isPoisoned(s, actor.n)) flags.push(<span key="p" className="chip chip-poison">中毒：能力无效，可以给假信息</span>);
  if (mustLie(s, slot as RoleId) && ROLES[slot as RoleId]) flags.push(<span key="v" className="chip chip-evil">涡流在场：只能给假信息</span>);
  if (!actor.alive && !(actor.role === 'zombuul' && s.zombuulFake))
    flags.push(<span key="x" className="chip">{actor.death?.night === s.night ? '今晚刚死' : '已死（被亡骨魔杀死，能力还在）'}</span>);
  const why =
    actor.role === 'drunk' || actor.role === 'marionette'
      ? `（他以为自己是${roleName(believedRole(s, actor))}）`
      : believedRole(s, actor) === 'alchemist' && slot !== 'alchemist'
        ? `（炼金术士，拥有${roleName(slot as RoleId)}的能力）`
      : actor.role === 'philosopher' && slot !== 'philosopher'
        ? `（哲学家，获得了${roleName(slot as RoleId)}的能力）`
      : actor.role === 'lunatic'
        ? `（疯子，他以为自己是${roleName(believedRole(s, actor))}）`
        : actor.role === 'cannibal'
          ? `（食人族，现在拥有${roleName(slot as RoleId)}的能力）`
          : actor.role === 'pixie' && slot !== 'pixie'
            ? `（小精灵，获得了${roleName(slot as RoleId)}的能力）`
            : actor.role === 'amnesiac'
              ? `（失忆者，他不知道自己的能力）`
              : '';
  return (
    <>
      <div className="who">
        {slot === 'widow' ? '寡妇是' : phones ? '轮到' : '叫醒'} <b>{seatName(actor.n)}</b>
        {!actor.alive && actor.role === 'zombuul' && '（僵怖，假死中）'}
        {why}
        {slot === 'scarletwoman' && '（红唇女郎，白天已接任恶魔）'}
      </div>
      {flags.length > 0 && <div className="chips">{flags}</div>}
    </>
  );
}

const wake = (n: number) => (
  <>
    轻拍 <b>{seatName(n)}</b> 的肩膀，让他睁眼。
  </>
);
const sleep = '让他闭眼。';

/** 给某人看新身份（角色 + 阵营） */
const newRoleCard = (r: RoleId, evil: boolean) => ({ title: '你现在是', big: [roleName(r)], team: ROLES[r].team, alignment: evil ? ('evil' as const) : ('good' as const), ability: ROLES[r].ability });
/** 角色变了：发"你现在是…"，同时把他手机上"看我的角色"换掉 */
const becomes = (n: number, r: RoleId, evil: boolean, lines?: string[]): PhoneItem => infoTo(n, newRoleCard(r, evil), lines, 'info', { ...newRoleCard(r, evil), title: '你的角色' });
/** 角色表上的选项（手机上选角色用） */
const roleOpts = (rs: RoleId[]) => rs.map((r) => ({ id: r, label: roleName(r), evil: teamOf(r) === 'minion' || teamOf(r) === 'demon' }));
/** 手机上"这一步怎么做"：只说要点什么 */
const sendTo = (ns: number[], what: string) => `点「发给 ${ns.map(seatName).join('、')}」：${what}`;
const seatsText = (ns: number[]) => ns.map((n) => `${seatName(n)}`).join('、');

function useDone(g: Game) {
  return (p: SlotPayload) => g.commit((st) => completeSlot(st, p));
}

/** 选完人以后，结果那一段出现在下面：自动滚过去，免得手机上没看到就点了"完成" */
function Reveal({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled) return;
    // 页面在后台时平滑滚动不会播放，直接跳过去
    const instant = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.hidden;
    ref.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'start' });
  }, [enabled]);
  return (
    <div ref={ref} className="stack reveal">
      {children}
    </div>
  );
}

function Tips({ role, drunk }: { role: RoleId; drunk?: boolean }) {
  return (
    <details className="more">
      <summary>
        <Icon name="chevronDown" size={18} /> 这个角色怎么处理（疑难规则）
      </summary>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }} className="muted">
        {drunk && <li>他其实是酒鬼：照常叫醒、照常让他操作，但能力不生效，给他的信息可以是假的。</li>}
        {ROLES[role].tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </details>
  );
}

function CardButton({ onClick, label = '给他看' }: { onClick: () => void; label?: string }) {
  return (
    <button className="btn btn-ghost" onClick={onClick}>
      <Icon name="eye" /> {label}
    </button>
  );
}

function Pending({ text }: { text: string }) {
  return (
    <BottomBar wide>
      <button className="btn btn-primary btn-block" disabled>
        {text}
      </button>
    </BottomBar>
  );
}

function SlotBody({ g, s, slot, actor }: { g: Game; s: GameState; slot: SlotId; actor?: Seat }) {
  switch (slot) {
    case 'dusk':
      return <DuskStep g={g} s={s} />;
    case 'minionInfo':
      return <MinionInfoStep g={g} s={s} />;
    case 'demonInfo':
      return <DemonInfoStep g={g} s={s} />;
    case 'dawn':
      return <DawnStep g={g} s={s} />;
    case 'poisoner':
    case 'monk':
    case 'butler':
    case 'fearmonger':
    case 'bureaucrat':
    case 'thief':
      return <TargetStep g={g} s={s} actor={actor!} slot={slot} />;
    case 'washerwoman':
    case 'librarian':
    case 'investigator':
      return <PairStep g={g} s={s} actor={actor!} kind={slot} />;
    case 'chef':
    case 'empath':
      return <NumberStep g={g} s={s} actor={actor!} kind={slot} />;
    case 'fortuneteller':
      return <FortuneStep g={g} s={s} actor={actor!} />;
    case 'spy':
      return <SpyStep g={g} s={s} actor={actor!} />;
    case 'scarletwoman':
      return <NewDemonStep g={g} s={s} actor={actor!} />;
    case 'imp':
    case 'vortox':
      return <ImpStep g={g} s={s} actor={actor!} slot={slot} />;
    case 'ravenkeeper':
    case 'undertaker':
      return <RevealStep g={g} s={s} actor={actor!} kind={slot} />;
    case 'lunatic':
      return <LunaticStep g={g} s={s} actor={actor!} />;
    case 'lilmonsta':
      return <LilMonstaStep g={g} s={s} />;
    case 'widow':
      return <WidowStep g={g} s={s} actor={actor!} />;
    case 'pixie':
      return <PixieStep g={g} s={s} actor={actor!} />;
    case 'chambermaid':
      return <ChambermaidStep g={g} s={s} actor={actor!} />;
    case 'duchess':
      return <DuchessStep g={g} s={s} />;
    case 'balloonist':
      return <BalloonStep g={g} s={s} actor={actor!} />;
    case 'alchemist':
      return <AlchemistStep g={g} s={s} actor={actor!} />;
    case 'godfather':
      return <GodfatherStep g={g} s={s} actor={actor!} />;
    case 'devilsadvocate':
    case 'exorcist':
      return <TargetStep g={g} s={s} actor={actor!} slot={slot} />;
    case 'zombuul':
      return <KillStep g={g} s={s} actor={actor!} slot="zombuul" />;
    case 'flowergirl':
      return <FlowergirlStep g={g} s={s} actor={actor!} />;
    case 'marionette':
      return <MarionetteStep g={g} s={s} actor={actor!} />;
    case 'harpy':
      return <HarpyStep g={g} s={s} actor={actor!} />;
    case 'stHarpy':
      return <StHarpyStep g={g} s={s} />;
    case 'stPoisoner':
      return <StPoisonStep g={g} s={s} />;
    case 'dreamer':
      return <DreamerStep g={g} s={s} actor={actor!} />;
    case 'seamstress':
      return <SeamstressStep g={g} s={s} actor={actor!} />;
    case 'bountyhunter':
      return <BountyStep g={g} s={s} actor={actor!} />;
    case 'general':
      return <GeneralStep g={g} s={s} actor={actor!} />;
    case 'alhadikhia':
      return <HadikhiaStep g={g} s={s} actor={actor!} />;
    case 'sweetheart':
      return <SweetheartStep g={g} s={s} />;
    case 'barber':
      return <BarberStep g={g} s={s} actor={actor!} />;
    case 'plaguedoctor':
      return <PlagueStep g={g} s={s} />;
    case 'sailor':
      return <SailorStep g={g} s={s} actor={actor!} />;
    case 'innkeeper':
      return <InnkeeperStep g={g} s={s} actor={actor!} />;
    case 'courtier':
      return <CourtierStep g={g} s={s} actor={actor!} />;
    case 'gambler':
      return <GamblerStep g={g} s={s} actor={actor!} />;
    case 'grandmother':
      return <GrandmotherStep g={g} s={s} actor={actor!} />;
    case 'pukka':
      return <PukkaStep g={g} s={s} actor={actor!} />;
    case 'shabaloth':
      return <ShabalothStep g={g} s={s} actor={actor!} />;
    case 'po':
      return <PoStep g={g} s={s} actor={actor!} />;
    case 'assassin':
    case 'professor':
      return <OnceTargetStep g={g} s={s} actor={actor!} slot={slot} />;
    case 'gossip':
      return <GossipStep g={g} s={s} />;
    case 'tinker':
      return <TinkerStep g={g} s={s} />;
    case 'moonchild':
      return <MoonchildStep g={g} s={s} />;
    case 'clockmaker':
      return <ClockmakerStep g={g} s={s} actor={actor!} />;
    case 'mathematician':
      return <MathStep g={g} s={s} actor={actor!} />;
    case 'oracle':
      return <OracleStep g={g} s={s} actor={actor!} />;
    case 'juggler':
      return <JugglerStep g={g} s={s} actor={actor!} />;
    case 'towncrier':
      return <TownCrierStep g={g} s={s} actor={actor!} />;
    case 'sage':
      return <SageStep g={g} s={s} actor={actor!} />;
    case 'snakecharmer':
      return <SnakeStep g={g} s={s} actor={actor!} />;
    case 'philosopher':
      return <PhilosopherStep g={g} s={s} actor={actor!} />;
    case 'eviltwin':
      return <EvilTwinStep g={g} s={s} actor={actor!} />;
    case 'witch':
      return <TargetStep g={g} s={s} actor={actor!} slot="witch" />;
    case 'cerenovus':
      return <CerenovusStep g={g} s={s} actor={actor!} />;
    case 'pithag':
      return <PithagStep g={g} s={s} actor={actor!} />;
    case 'fanggu':
    case 'nodashii':
    case 'vigormortis':
      return <SvDemonStep g={g} s={s} actor={actor!} slot={slot} />;
    case 'steward':
    case 'knight':
    case 'noble':
    case 'highpriestess':
    case 'choirboy':
      return <SeatsInfoStep g={g} s={s} actor={actor!} kind={slot} />;
    case 'shugenja':
      return <ShugenjaStep g={g} s={s} actor={actor!} />;
    case 'king':
      return s.night === 1 ? <KingRevealStep g={g} s={s} /> : <KingStep g={g} s={s} actor={actor!} />;
    case 'nightwatchman':
      return <NightwatchStep g={g} s={s} actor={actor!} />;
    case 'farmer':
      return <FarmerStep g={g} s={s} actor={actor!} />;
    case 'acrobat':
    case 'preacher':
      return <TargetStep g={g} s={s} actor={actor!} slot={slot} />;
    case 'poppygrower':
      return <PoppyStep g={g} s={s} />;
    case 'huntsman':
      return <HuntsmanStep g={g} s={s} actor={actor!} />;
    case 'damsel':
    case 'snitch':
      return <MinionsLearnStep g={g} s={s} kind={slot} />;
    case 'ogre':
    case 'qutler':
      return <TargetStep g={g} s={s} actor={actor!} slot={slot} />;
    case 'hatter':
      return <HatterStep g={g} s={s} />;
    case 'boffin':
      return <BoffinStep g={g} s={s} actor={actor!} />;
    case 'wizard':
      return <WizardStep g={g} s={s} actor={actor!} />;
    case 'organgrinder':
      return <OrganStep g={g} s={s} actor={actor!} />;
    case 'mezepheles':
      return <MezeStep g={g} s={s} actor={actor!} />;
    case 'ojo':
      return <OjoStep g={g} s={s} actor={actor!} />;
    case 'lleech':
      return s.lleechHost ? <SvDemonStep g={g} s={s} actor={actor!} slot="lleech" /> : <LleechHostStep g={g} s={s} actor={actor!} />;
    case 'lordoftyphon':
      return <SvDemonStep g={g} s={s} actor={actor!} slot="lordoftyphon" />;
    case 'kazali':
      return s.night === 1 ? <KazaliStep g={g} s={s} actor={actor!} /> : <SvDemonStep g={g} s={s} actor={actor!} slot="kazali" />;
    case 'yaggababble':
      return <YaggaStep g={g} s={s} />;
    case 'riot':
      return <RiotNightStep g={g} s={s} />;
    case 'villageidiot':
      return <ViStep g={g} s={s} actor={actor!} />;
    case 'engineer':
      return <EngineerStep g={g} s={s} actor={actor!} />;
    case 'lycanthrope':
      return <TargetStep g={g} s={s} actor={actor!} slot="lycanthrope" />;
    case 'cultleader':
      return <CultStep g={g} s={s} actor={actor!} />;
    case 'summoner':
      return <SummonerStep g={g} s={s} actor={actor!} />;
    case 'legion':
      return <LegionStep g={g} s={s} />;
    case 'apprentice':
      return <ApprenticeStep g={g} s={s} actor={actor!} />;
    case 'barista':
      return <BaristaStep g={g} s={s} />;
    case 'harlot':
      return <HarlotStep g={g} s={s} actor={actor!} />;
    case 'bonecollector':
      return <BoneStep g={g} s={s} actor={actor!} />;
    case 'cacklejack':
      return <CackleStep g={g} s={s} />;
    default:
      return <SkipStep g={g} />;
  }
}

/** 兜底：理论上不会出现，出现了也能继续 */
function SkipStep({ g }: { g: Game }) {
  const done = useDone(g);
  return (
    <>
      <p className="dim">这一步没有需要做的事。</p>
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'none' })}>
          下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 入夜 / 互认 / 天亮 ---------------- */

function DuskStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const room = useRoom();
  const phones = phonesOn(room);
  const sleepers = notWakingTonight(s);
  const away = phones ? s.seats.filter((x) => !x.left && !room.seats[x.n]?.online).map((x) => x.n) : [];
  return (
    <>
      <SayBox lines={phones ? phoneDuskLines(s.style) : slotLines('dusk', s.style)} title="对所有人说" />
      <DoBox
        items={[
          ...(phones
            ? ['不用闭眼：每个人看自己的手机。今晚每个人都会收到消息（没有行动的人收到"今晚你没有行动"），看完点"看完了"。', '接下来按网页顺序一步一步走，要选人的会直接发到他手机上。']
            : ['等所有人都闭上眼睛、低下头。', '接下来按网页顺序，一个一个轻拍肩膀叫醒。不要出声叫名字。']),
          s.night === 1 ? '第一晚恶魔不杀人。' : null,
          s.night === 1 && s.fabled.includes('stormcatcher') && s.stormRole
            ? `暴风捕手：叫醒所有邪恶玩家，告诉他们【${roleName(s.stormRole)}】是谁（在场的话指给他们看）。`
            : null,
          s.fabled.includes('toymaker') ? '玩具匠：恶魔今晚可以选择不杀人（整局至少要有一晚不杀）。' : null,
        ]}
      />
      {sleepers.length > 0 && (
        <div className="card stack" style={{ gap: 6 }}>
          <b>今晚不叫醒（按规则，不是漏了）</b>
          {sleepers.map((t) => (
            <p key={t}>{t}</p>
          ))}
        </div>
      )}
      {away.length > 0 && <p className="card card-warn">{seatsText(away)} 的手机现在不在线：让他点亮屏幕、打开网页，会自动接上。</p>}
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'none' })}>
          {phones ? '开始' : '所有人都闭眼了'}
        </button>
      </BottomBar>
    </>
  );
}

function MinionInfoStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const minions = minionSeats(s);
  const ms = seatsText(minions.map((x) => x.n));
  const one = minions.length === 1;
  const d = demonSeat(s)!;
  const mg = magicianSeat(s);
  // 魔术师：爪牙以为他也是恶魔，两人一起指，顺序打乱
  const both = useMemo(() => (mg ? shuffle([d.n, mg.n], stepRng(s, 2)) : [d.n]), [s, d.n, mg]);
  usePoint(both);
  const phone = usePhoneSend(
    s,
    minions.map((x) => ({
      n: x.n,
      tag: 'info',
      body: {
        card: { big: both.map(seatName), note: one ? undefined : `爪牙：${ms}`, lines: slotLines('minionInfo', s.style) },
      },
    })),
  );
  if (phone.on)
    return (
      <>
        <DoBox items={[`点「发给 ${ms}」：爪牙的手机上会显示恶魔是谁${one ? '' : '、其他爪牙是谁'}。`, mg ? `${seatName(mg.n)} 是魔术师：爪牙会看到两个"恶魔"，别说出来。` : null]} />
        <p className="dim">7 人及以上才有这一步。</p>
        <PhoneBar send={phone} onDone={() => done({ kind: 'none' })} />
      </>
    );
  return (
    <>
      <DoBox
        items={[
          <>
            轻拍爪牙 <b>{ms}</b> 的肩膀，让{one ? '他' : '他们'}睁眼。
          </>,
          mg ? (
            <>
              用手依次指向 <b>{seatsText(both)}</b>，告诉他们"这是你们的恶魔"（其中 {seatName(mg.n)} 是魔术师，别说出来）。
            </>
          ) : (
            <>
              用手指向恶魔：<b>{seatName(d.n)}</b>。
            </>
          ),
          one ? '等他看清，再让他闭眼。' : '等他们互相看清彼此，再让他们闭眼。',
        ]}
      />
      <SayBox lines={slotLines('minionInfo', s.style)} title="小声说" />
      <p className="dim">7 人及以上才有这一步。恶魔这时还闭着眼。</p>
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

function DemonInfoStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const ui = useUi();
  const legion = s.seats.filter((x) => x.role === 'legion');
  if (legion.length) return <LegionInfoStep g={g} s={s} />;
  const mg = magicianSeat(s);
  const poppy = poppyActive(s);
  // 魔术师：恶魔以为他也是爪牙；罂粟种植者在场：不指爪牙
  const shown = useMemo(() => (poppy ? [] : shuffle([...minionSeats(s).map((x) => x.n), ...(mg ? [mg.n] : [])], stepRng(s, 3))), [s, mg, poppy]);
  const ms = seatsText(shown);
  const d = demonSeat(s)!;
  usePoint(shown);
  const lines = slotLines('demonInfo', s.style);
  const phone = usePhoneSend(s, [
    ...(ms ? [{ n: d.n, tag: 'info', body: { card: { big: shown.map(seatName), lines: lines.slice(0, 1) } } }] : []),
    { n: d.n, tag: 'info2', body: { card: { big: s.bluffs.map(roleName), lines: lines.slice(1) } } },
  ]);
  if (phone.on)
    return (
      <>
        <DoBox items={[`点「发给 ${seatName(d.n)}」：恶魔的手机上会先显示${ms ? `他的爪牙（${ms}），再显示` : ''}三个伪装角色。`]} />
        {!ms && !poppy && <p className="dim">唯一的爪牙是提线木偶，下一步再单独告诉恶魔。</p>}
        {poppy && <p className="dim">罂粟种植者在场：恶魔不知道爪牙是谁，只给他看三个伪装。</p>}
        {mg && !poppy && <p className="dim">{seatName(mg.n)} 是魔术师：恶魔会以为他也是爪牙，别说出来。</p>}
        <p className="muted">伪装角色：{s.bluffs.map(roleName).join('、') || '没有（板子上的善良角色都在场）'}</p>
        <PhoneBar send={phone} onDone={() => done({ kind: 'none' })} />
      </>
    );
  return (
    <>
      <DoBox
        items={[
          wake(d.n),
          ms ? (
            <>
              用手依次指向爪牙：<b>{ms}</b>。
            </>
          ) : null,
          '点「给他看伪装」，把屏幕举给他看。',
          sleep,
        ]}
      />
      {!ms && !poppy && <p className="dim">唯一的爪牙是提线木偶，下一步再单独告诉恶魔，这一步不用指爪牙。</p>}
      {poppy && <p className="dim">罂粟种植者在场：恶魔不知道爪牙是谁，只给他看三个伪装。罂粟种植者死的那晚网页会带你让他们互认。</p>}
      {mg && !poppy && <p className="dim">{seatName(mg.n)} 是魔术师：恶魔会以为他也是爪牙，一起指，别说出来。</p>}
      {/* 没有爪牙时只念伪装那一句 */}
      <SayBox lines={slotLines('demonInfo', s.style).slice(ms ? 0 : 1)} title="小声说" />
      <p className="muted">伪装角色：{s.bluffs.map(roleName).join('、') || '没有（板子上的善良角色都在场）'}</p>
      <BottomBar wide>
        <CardButton label="给他看伪装" onClick={() => ui.showCard({ title: '这三个角色不在场，你可以伪装成他们', big: s.bluffs.map(roleName) })} />
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

function DawnStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const deaths = s.ns!.deaths;
  const lev = s.seats.some((x) => x.role === 'leviathan' && x.alive);
  const bs = s.bansheeActive ? seatOf(s, s.bansheeActive) : null;
  const banshee = bs?.death?.when === 'night' && bs.death.night === s.night ? bs.n : undefined;
  const fakeZ = s.zombuulFake ? s.seats.find((x) => x.role === 'zombuul' && deaths.includes(x.n)) : undefined;
  // 房间：所有人都点完了手机上的消息才天亮（没收到东西的人这时会收到"今晚你没有行动"）
  const unread = useNightUnread(s);
  const waiting = !s.winner && !!unread?.length;
  return (
    <>
      <SayBox
        lines={dawnLines(deaths, s.style, { fear: s.fearAnnounce, leviathanDay: lev ? s.night : undefined, hadikhia: s.ns!.hadikhia, banshee, revived: s.ns!.revived, phones: !!unread })}
        title="对所有人说"
      />
      <DoBox
        items={[
          banshee ? '报丧女妖被恶魔杀死要公开说（上面的台词已经写了）；其他死讯只说谁死了，不说怎么死的。' : '宣布死讯时只说谁死了，不要说是怎么死的。',
          deaths.length ? '让死去的玩家知道：死人还能说话，但不能提名，整局只剩一次投票。' : null,
          s.fearAnnounce ? '恐惧之灵换了新目标：只宣布"有新目标"，不说是谁。' : null,
          fakeZ ? `${seatName(fakeZ.n)} 是僵怖，这是假死：照常宣布他死了，但他其实还活着（只有你知道）。` : null,
        ]}
      />
      <KlutzPrompt g={g} />
      <MoonchildPrompt g={g} />
      <PixiePrompt g={g} />
      {s.winner && (
        <div className={`card ${s.winner === 'good' ? '' : 'card-evil'}`}>
          <h3>游戏结束</h3>
          <p>
            {s.winner === 'good' ? '善良' : '邪恶'}阵营获胜：{s.winReason}
          </p>
        </div>
      )}
      {unread && <p className="dim">天亮前要等每个人都点完手机上的消息{unread.length ? `：还剩 ${seatsText(unread)}` : '（都点完了）'}。</p>}
      <BottomBar wide>
        {waiting && !promptPending(s) && (
          <ConfirmButton className="btn btn-ghost" label="有人手机不行" confirmLabel="再点一次：不等了，进入白天" onConfirm={() => done({ kind: 'none' })} />
        )}
        <button className="btn btn-primary grow" disabled={(!s.winner && promptPending(s)) || waiting} onClick={() => done({ kind: 'none' })}>
          {s.winner ? '宣布结果' : promptPending(s) ? '先处理上面的提示' : waiting ? `等 ${seatsText(unread!)} 点完手机` : '进入白天'}
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 选一个人：投毒者 / 僧侣 / 管家 / 恐惧之灵 ---------------- */

function TargetStep({
  g, s, actor, slot,
}: StepProps & {
  slot: 'poisoner' | 'monk' | 'butler' | 'fearmonger' | 'bureaucrat' | 'thief' | 'devilsadvocate' | 'exorcist' | 'witch' | 'acrobat' | 'preacher' | 'ogre' | 'qutler' | 'lycanthrope';
}) {
  const done = useDone(g);
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const notSelf = slot === 'monk' || slot === 'butler' || slot === 'bureaucrat' || slot === 'thief' || slot === 'ogre' || slot === 'qutler';
  const bad = malfunction(s, actor.n) || !!goonTriggered(s, actor, t, slot);
  // 魔鬼代言人、驱魔人：不能和上一晚选同一个人
  const last =
    slot === 'devilsadvocate' && s.advocate?.night === s.night - 1 ? s.advocate.seat : slot === 'exorcist' && s.exorcistPick?.night === s.night - 1 ? s.exorcistPick.seat : null;
  const blocked = [
    ...(notSelf ? [actor.n] : []),
    ...(last ? [last] : []),
    ...(slot === 'devilsadvocate' || slot === 'lycanthrope' ? s.seats.filter((x) => !x.alive).map((x) => x.n) : []),
  ];
  const lastNote = last ? `不能再选昨晚的 ${seatName(last)}。` : '';
  const exorcisedDemon = slot === 'exorcist' && t.length > 0 && !bad && isDemonSeat(s, t[0]) ? t[0] : null;
  const preachedMinion = slot === 'preacher' && t.length > 0 && !bad && teamOf(seatOf(s, t[0]).role) === 'minion' ? t[0] : null;
  const note =
    slot === 'lycanthrope'
      ? t.length
        ? bad
          ? '他中毒/醉酒：什么都不会发生。'
          : !isEvil(seatOf(s, t[0])) && s.fauxPaw !== t[0]
            ? `${seatName(t[0])} 是好人：他死亡，恶魔今晚杀不了人。`
            : `${seatName(t[0])} 是邪恶的${s.fauxPaw === t[0] ? '（被当成邪恶）' : ''}：不会死，恶魔照常杀人。`
        : '他选的人是好人就死，恶魔今晚杀不了人；选的是邪恶的什么都不会发生。必须选活人。'
      : slot === 'ogre'
      ? '他选的人是邪恶的，食人魔就变成邪恶（不告诉他）；选的是善良的就还是善良。醉酒中毒也照样生效。'
      : slot === 'qutler'
      ? '明天只有这个"主人"投票时，Q宝才能投票（是他自己要遵守）。'
      : slot === 'acrobat'
      ? `他选的人今晚任何时候醉酒或中毒，天亮前杂技演员就死（网页会自动算）。${bad ? '（他中毒/醉酒：不会因此死亡）' : ''}`
      : slot === 'preacher'
      ? `他选中爪牙的话，那个爪牙从此没有能力。${bad ? '（他中毒/醉酒：照常让他选，但无效）' : ''}`
      : slot === 'witch'
      ? `他选的人明天一提名就会死（白天网页会提醒你）。只剩三人存活时诅咒失效。${bad ? '（他中毒/醉酒：照常让他选，但无效）' : ''}`
      : slot === 'devilsadvocate'
      ? `他选的人如果明天被处决，不会死（处决时网页会提醒你）。${lastNote}${bad ? '（他中毒/醉酒：照常让他选，但无效）' : ''}`
      : slot === 'exorcist'
        ? `他选中恶魔的话，恶魔会得知驱魔人是谁，今晚不会醒。${lastNote}${bad ? '（他中毒/醉酒：照常让他选，但无效）' : ''}`
        : slot === 'poisoner'
      ? '被毒的人今晚和明天白天能力失效，网页会自动提醒你给他假信息。'
      : slot === 'monk'
        ? bad
          ? '他的保护今晚无效（中毒/酒鬼）。照常让他选，别露馅。'
          : '被保护的人今晚不会被恶魔杀死。'
        : slot === 'bureaucrat' || slot === 'thief'
          ? `明天数票时，那个人举手算${slot === 'bureaucrat' ? ' 3 票' : '负 1 票'}，网页会在白天提醒你。${bad ? '（他中毒了：照常让他选，但无效）' : ''}`
          : slot === 'fearmonger'
          ? `现在的目标：${s.fearTarget ? `${seatName(s.fearTarget)}` : '还没有'}。选了新目标，天亮时要公开宣布"恐惧之灵选择了一名新的目标"。`
          : '明天白天提醒自己：只有主人投票时，管家才能投票。';
  const phone = usePhoneAsk(s, actor.n, { count: 1, title: roleName(slot), lines: slotLines(slot, s.style), disabled: blocked }, setT);
  const extra = usePhoneSend(
    s,
    exorcisedDemon
      ? [{ n: exorcisedDemon, tag: 'info', body: { card: { title: `${seatName(actor.n)} 是`, big: ['驱魔人'], note: '他选中了你：今晚你不用醒了。' } } }]
      : preachedMinion
        ? [{ n: preachedMinion, tag: 'info', body: { card: { title: '这个角色选中了你', big: ['传教士'], note: '你失去了能力。' } } }]
        : [],
  );
  return (
    <>
      {phone.on ? phone.view : <DoBox items={[wake(actor.n), `让他用手指向一名玩家${notSelf ? '（不能指自己）' : ''}，你在下面点出同一个人。`, sleep]} />}
      {!phone.on && <SayBox lines={slotLines(slot, s.style)} title="小声说" />}
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={blocked} label={phone.on ? '他选了谁？' : '他指了谁？'} />
      <GoonNote s={s} actor={actor} picks={t} slot={slot} />
      <p className="dim">{note}</p>
      {exorcisedDemon && extra.on && (
        <Reveal key={exorcisedDemon}>
          <DoBox title="他选中了恶魔" items={[`点「发给 ${seatName(exorcisedDemon)}」：恶魔手机上会显示驱魔人是 ${seatName(actor.n)}，今晚他不用醒。`]} />
        </Reveal>
      )}
      {preachedMinion && extra.on && (
        <Reveal key={preachedMinion}>
          <DoBox title="他选中了爪牙" items={[`点「发给 ${seatName(preachedMinion)}」：那个爪牙手机上会显示传教士选中了他，他从现在起没有能力。`]} />
        </Reveal>
      )}
      {exorcisedDemon && !extra.on && (
        <Reveal key={exorcisedDemon}>
          <DoBox
            title="他选中了恶魔：接着叫醒恶魔"
            items={[
              wake(exorcisedDemon),
              <>
                点「给恶魔看」：驱魔人；再用手指向 <b>{seatName(actor.n)}</b>。
              </>,
              '告诉他：今晚你不用醒了。',
              sleep,
            ]}
          />
        </Reveal>
      )}
      {preachedMinion && !extra.on && (
        <Reveal key={preachedMinion}>
          <DoBox title="他选中了爪牙：接着叫醒那个爪牙" items={[wake(preachedMinion), '点「给爪牙看」：传教士选中了你。告诉他从现在起他没有能力了。', sleep]} />
        </Reveal>
      )}
      <Tips role={slot === 'fearmonger' || slot === 'devilsadvocate' || slot === 'witch' ? slot : believedRole(s, actor)} drunk={actor.role === 'drunk'} />
      {phone.on && (extra.on || (!exorcisedDemon && !preachedMinion)) ? (
        <PhoneBar
          send={extra}
          wait={phone.wait}
          ready={t.length > 0}
          doneLabel={t.length ? `确认：${seatName(t[0])}，下一步` : '先点出他选的人'}
          onDone={() => done({ kind: 'target', target: t[0] })}
        />
      ) : (
        <BottomBar wide>
          {exorcisedDemon && <CardButton label="给恶魔看" onClick={() => ui.showCard({ title: '这名玩家是', big: ['驱魔人'] })} />}
          {preachedMinion && <CardButton label="给爪牙看" onClick={() => ui.showCard({ title: '这个角色选中了你', big: ['传教士'], note: '你失去了能力。' })} />}
          <button className="btn btn-primary grow" disabled={!t.length || !!phone.wait} onClick={() => done({ kind: 'target', target: t[0] })}>
            {phone.wait ?? (t.length ? `确认：${seatName(t[0])}，下一步` : '先点出他指的人')}
          </button>
        </BottomBar>
      )}
    </>
  );
}

/* ---------------- 洗衣妇 / 图书管理员 / 调查员 ---------------- */

const KIND_TEAM = { washerwoman: 'townsfolk', librarian: 'outsider', investigator: 'minion' } as const;

function PairStep({ g, s, actor, kind }: StepProps & { kind: PairKind }) {
  const done = useDone(g);
  const ui = useUi();
  const choices = useMemo(() => pairChoices(s, kind, actor.n, stepRng(s)), [s, kind, actor.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const [mRole, setMRole] = useState<RoleId | 'zero' | null>(null);
  const [mSeats, setMSeats] = useState<number[]>([]);
  const lie = mustLie(s, kind);
  const healthy = !malfunction(s, actor.n) && !lie;

  const manualInfo: PairInfo | null =
    mRole === 'zero' ? { role: null, seats: null } : mRole && mSeats.length === 2 ? { role: mRole, seats: [Math.min(...mSeats), Math.max(...mSeats)] as [number, number] } : null;
  const verdict = manualInfo ? pairVerdict(s, kind, actor.n, manualInfo) : null;
  const illegal = sel === -1 && ((healthy && verdict === 'false') || (lie && verdict !== null && verdict !== 'false'));
  const value = sel >= 0 ? choices[sel]?.value : manualInfo;
  const truth = sel >= 0 ? !!choices[sel]?.truth : verdict !== 'false';
  const twist = sel >= 0 ? !!choices[sel]?.twist : verdict === 'twist';
  usePoint(value?.seats ? [...value.seats] : []);

  const teamRoles = scriptOf(s).roles.filter((r) => ROLES[r].team === KIND_TEAM[kind]);
  const manual = (
    <div className="stack" style={{ gap: 10 }}>
      <div className="role-grid">
        {kind === 'librarian' && (
          <button className="role-chip" style={mRole === 'zero' ? { borderColor: 'var(--gold)' } : undefined} onClick={() => setMRole('zero')}>
            比 0（没有外来者）
          </button>
        )}
        {teamRoles.map((r) => (
          <button key={r} className={`role-chip${KIND_TEAM[kind] === 'minion' ? ' evil-c' : ''}`} style={mRole === r ? { boxShadow: '0 0 0 2px var(--gold) inset' } : undefined} onClick={() => setMRole(r)}>
            {roleName(r)}
          </button>
        ))}
      </div>
      {mRole !== 'zero' && <SeatPicker s={s} selected={mSeats} max={2} onChange={setMSeats} disabled={[actor.n]} label="指向哪两个人？" />}
      {illegal && <p className="evil">{lie ? '涡流在场，必须给假信息。这样给是真的。' : '他没有中毒也不是酒鬼，必须给真信息。这样给不合规。'}</p>}
      {verdict === 'false' && !healthy && <p className="dim">这是假信息（他中毒/是酒鬼/涡流在场，可以给）。</p>}
    </div>
  );

  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(
    s,
    value
      ? [
          {
            n: actor.n,
            tag: 'info',
            body: {
              card:
                value.role && value.seats
                  ? { title: `${seatName(value.seats[0])}和${seatName(value.seats[1])}之中有一人是`, big: [roleName(value.role)], lines: slotLines(kind, s.style) }
                  : { title: '场上没有外来者', big: ['0'], lines: librarianZeroLines(s.style) },
            },
          },
        ]
      : [],
  );

  const items: ReactNode[] = [wake(actor.n)];
  if (value && value.role && value.seats) {
    items.push(
      <>
        点「给他看」展示 <b>【{roleName(value.role)}】</b>。
      </>,
      <>
        用手指向 <b>{seatName(value.seats[0])}</b> 和 <b>{seatName(value.seats[1])}</b>。
      </>,
    );
  } else if (value) items.push('比出 0（握拳）：场上没有外来者。');
  items.push(sleep);

  return (
    <>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={setSel} manual={manual} />
      {phoneOn ? (
        <DoBox items={[`确认上面的信息，点「发给 ${seatName(actor.n)}」：他手机上会显示${value?.role ? '这两个座位号和角色' : '"场上没有外来者"'}。`]} />
      ) : (
        <>
          <DoBox items={items} />
          <SayBox lines={value && value.role === null ? librarianZeroLines(s.style) : slotLines(kind, s.style)} title="小声说" />
        </>
      )}
      <Tips role={kind} drunk={actor.role === 'drunk'} />
      {phoneOn ? (
        <PhoneBar send={phone} ready={!!value && !illegal} onDone={() => value && done({ kind: 'pair', info: value, truth, twist })} />
      ) : (
        <BottomBar wide>
          {value?.role && <CardButton onClick={() => ui.showCard(roleCard(value.role!, '这两人中有一人是'))} />}
          <button className="btn btn-primary grow" disabled={!value || illegal} onClick={() => value && done({ kind: 'pair', info: value, truth, twist })}>
            完成，下一步
          </button>
        </BottomBar>
      )}
    </>
  );
}

/* ---------------- 厨师 / 共情者 ---------------- */

function NumberStep({ g, s, actor, kind }: StepProps & { kind: 'chef' | 'empath' }) {
  const done = useDone(g);
  const choices = useMemo(() => numberChoices(s, kind, actor.n), [s, kind, actor.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const [mNum, setMNum] = useState<number | null>(null);
  const lie = mustLie(s, kind);
  const healthy = !malfunction(s, actor.n) && !lie;
  const legal = legalNumbers(s, kind, actor.n);
  const base = kind === 'chef' ? chefCount(s) : empathCount(s, actor.n);
  const value = sel >= 0 ? choices[sel].value : mNum;
  const truth = sel >= 0 ? choices[sel].truth : mNum !== null && legal.includes(mNum);
  const twist = sel >= 0 ? !!choices[sel].twist : truth && mNum !== base;
  const nb = aliveNeighbors(s, actor.n);
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, value !== null && value !== undefined ? [{ n: actor.n, tag: 'info', body: { card: { big: [String(value)], lines: slotLines(kind, s.style) } } }] : []);

  const manual = (
    <div className="big-num-grid">
      {[0, 1, 2, 3, 4].map((n) => (
        <button
          key={n}
          className={`btn ${mNum === n ? 'btn-primary' : 'btn-ghost'}`}
          disabled={healthy ? !legal.includes(n) : lie ? legal.includes(n) : false}
          onClick={() => setMNum(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );

  return (
    <>
      {kind === 'empath' && (
        <p className="muted">
          他两边最近的存活玩家：{nb.map((n) => `${seatName(n)}（${roleName(seatOf(s, n).role)}）`).join('、')}
        </p>
      )}
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={setSel} manual={manual} manualLabel="手动选数字" />
      {phoneOn ? (
        <DoBox items={[`确认上面的数字，点「发给 ${seatName(actor.n)}」：他手机上会显示这个数字。`]} />
      ) : (
        <>
          <DoBox
            items={[
              wake(actor.n),
              value !== null && value !== undefined ? (
                <>
                  伸出 <b>{value}</b> 根手指{value === 0 ? '（握拳）' : ''}。
                </>
              ) : null,
              sleep,
            ]}
          />
          <SayBox lines={slotLines(kind, s.style)} title="小声说" />
        </>
      )}
      <Tips role={kind} drunk={actor.role === 'drunk'} />
      {phoneOn ? (
        <PhoneBar send={phone} ready={value !== null && value !== undefined} onDone={() => done({ kind: 'number', num: value!, truth, twist })} />
      ) : (
        <BottomBar wide>
          <button className="btn btn-primary btn-block" disabled={value === null || value === undefined} onClick={() => done({ kind: 'number', num: value!, truth, twist })}>
            完成，下一步
          </button>
        </BottomBar>
      )}
    </>
  );
}

/* ---------------- 占卜师 ---------------- */

function FortuneStep({ g, s, actor }: StepProps) {
  const [picks, setPicks] = useState<number[]>([]);
  const phone = usePhoneAsk(s, actor.n, { count: 2, title: roleName('fortuneteller'), lines: slotLines('fortuneteller', s.style) }, setPicks);
  return (
    <>
      {phone.on ? (
        phone.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他用手指向两名玩家，你在下面点出这两个人。']} />
          <SayBox lines={slotLines('fortuneteller', s.style)} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={picks} max={2} onChange={setPicks} label={phone.on ? '他选了哪两个人？' : '他指了哪两个人？'} />
      {picks.length === 2 ? (
        <Reveal key={[...picks].sort().join()}>
          <FortuneAnswer g={g} s={s} actor={actor} picks={picks as [number, number]} wait={phone.wait} />
        </Reveal>
      ) : (
        <>
          <Tips role="fortuneteller" drunk={actor.role === 'drunk'} />
          <Pending text={phone.wait ?? '先点出他指的两个人'} />
        </>
      )}
    </>
  );
}

function FortuneAnswer({ g, s, actor, picks, wait }: StepProps & { picks: [number, number]; wait: string | null }) {
  const done = useDone(g);
  const choices = useMemo(() => fortuneChoices(s, actor.n, picks), [s, actor.n, picks]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, picks[0] * 31 + picks[1])), [choices, s, picks]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel];
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, [{ n: actor.n, tag: 'info', body: { card: { title: `${seatName(picks[0])}和${seatName(picks[1])}之中`, big: [c.value ? '有恶魔' : '没有恶魔'] } } }]);
  const finish = () => done({ kind: 'fortune', picks, yes: c.value, truth: c.truth, twist: c.twist });
  return (
    <>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      {phoneOn ? (
        <DoBox items={[<>点「发给 {seatName(actor.n)}」：他手机上会显示<b>{c.value ? '有恶魔' : '没有恶魔'}</b>。</>]} />
      ) : (
        <DoBox items={[c.value ? <><b>点头</b>：有恶魔。</> : <><b>摇头</b>：没有恶魔。</>, sleep]} />
      )}
      <Tips role="fortuneteller" drunk={actor.role === 'drunk'} />
      {phoneOn ? (
        <PhoneBar send={phone} wait={wait} onDone={finish} />
      ) : (
        <BottomBar wide>
          <button className="btn btn-primary btn-block" onClick={finish}>
            完成，下一步
          </button>
        </BottomBar>
      )}
    </>
  );
}

/* ---------------- 间谍 / 新恶魔 ---------------- */

function SpyStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const phone = usePhoneSend(s, [{ n: actor.n, tag: 'info', body: { card: { big: [], rows: spyRows(s), lines: slotLines('spy', s.style) } } }]);
  if (phone.on)
    return (
      <>
        <DoBox items={[`点「发给 ${seatName(actor.n)}」：间谍手机上会显示整本魔典（每个座位的角色和状态、恶魔伪装），他看完点"看完了"。`]} />
        <Tips role="spy" />
        <PhoneBar send={phone} onDone={() => done({ kind: 'none' })} />
      </>
    );
  return (
    <>
      <DoBox items={[wake(actor.n), '点「给间谍看」，把屏幕交给他。', '他看完会点「看完了」，收回屏幕。', sleep]} />
      <SayBox lines={slotLines('spy', s.style)} title="小声说" />
      <p className="dim">间谍看到的是只读魔典：只有座位、角色和状态，没有你的提示，也碰不到任何操作。</p>
      <Tips role="spy" />
      <BottomBar wide>
        <CardButton label="给间谍看" onClick={ui.openSpy} />
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

function NewDemonStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const r = actor.role;
  const phone = usePhoneSend(s, [{ n: actor.n, tag: 'info', body: { card: { ...roleCard(r, '你现在是', true), lines: slotLines('scarletwoman', s.style) } }, role: roleCard(r, '你的角色', true) }]);
  if (phone.on)
    return (
      <>
        <DoBox items={[`点「发给 ${seatName(actor.n)}」：他手机上会显示"你现在是${roleName(r)}"，"看我的角色"也换成${roleName(r)}。`, '下一步就是恶魔这一步（他今晚就可以杀人）。']} />
        <PhoneBar send={phone} onDone={() => done({ kind: 'none' })} />
      </>
    );
  return (
    <>
      <DoBox items={[wake(actor.n), `点「给他看」：你现在是${roleName(r)}。`, '马上进入恶魔这一步（他今晚就可以杀人）。']} />
      <SayBox lines={slotLines('scarletwoman', s.style)} title="小声说" />
      <BottomBar wide>
        <CardButton onClick={() => ui.showCard(roleCard(r, '你现在是', true))} />
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 恶魔杀人：小恶魔 / 涡流 ---------------- */

function ImpStep({ g, s, actor, slot }: StepProps & { slot: 'imp' | 'vortox' }) {
  const [t, setT] = useState<number[]>([]);
  const phone = usePhoneAsk(s, actor.n, { count: 1, title: roleName(slot), lines: slotLines(slot, s.style) }, setT);
  return (
    <>
      {phone.on ? (
        phone.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他用手指向一名玩家（可以指自己），你在下面点出来。']} />
          <SayBox lines={slotLines(slot, s.style)} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={t} max={1} onChange={setT} label="他要杀谁？" />
      {t.length ? (
        <Reveal key={t[0]}>
          <ImpOutcome g={g} s={s} actor={actor} target={t[0]} slot={slot} wait={phone.wait} />
        </Reveal>
      ) : (
        <>
          <Tips role={slot} />
          <Pending text={phone.wait ?? '先点出他指的人'} />
        </>
      )}
    </>
  );
}

function ImpOutcome({ g, s, actor, target, slot, wait }: StepProps & { target: number; slot: 'imp' | 'vortox'; wait: string | null }) {
  const done = useDone(g);
  const ui = useUi();
  const pv = previewImp(s, target);
  const choices = useMemo(
    () => (pv.kind === 'mayor' ? mayorBounceChoices(s, target, stepRng(s, target)) : pv.kind === 'starpass' ? starpassChoices(s, actor.n) : []),
    [s, target, actor.n, pv.kind],
  );
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, target + 1)), [choices, s, target]);
  const [sel, setSel] = useState(rec);
  const picked = choices[sel]?.value;
  const dname = roleName(actor.role);

  const items: ReactNode[] = [sleep];
  if (pv.kind === 'starpass' && picked)
    items.push(
      <>
        轻拍 <b>{seatName(picked)}</b>，让他睁眼。
      </>,
      `点「给他看」：你现在是${dname}。`,
      '让他闭眼。',
    );
  items.push('天亮时再统一宣布死讯。');

  const pay: SlotPayload =
    pv.kind === 'mayor' ? { kind: 'imp', target, bounce: picked } : pv.kind === 'starpass' ? { kind: 'imp', target, starpassTo: picked } : { kind: 'imp', target };
  const passTo = pv.kind === 'starpass' && picked ? picked : null;
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, passTo ? [{ n: passTo, tag: 'info', body: { card: roleCard(actor.role, '你现在是', true) }, role: roleCard(actor.role, '你的角色', true) }] : []);
  const phoneBar = phoneOn && (phone.on || !passTo);

  return (
    <>
      <div className={`card${pv.kind === 'kill' || pv.kind === 'starpass' || pv.kind === 'suicide' ? ' card-evil' : ''}`}>
        <p>{pv.reason}</p>
      </div>
      {choices.length > 0 && (
        <>
          <div className="dim">{pv.kind === 'mayor' ? '谁替镇长死？' : `谁变成新的${dname}？`}</div>
          <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
        </>
      )}
      {phoneBar ? (
        <DoBox items={[passTo ? `点「发给 ${seatName(passTo)}」：他手机上会显示"你现在是${dname}"，"看我的角色"也换成${dname}。` : null, '天亮时再统一宣布死讯。']} />
      ) : (
        <DoBox items={items} />
      )}
      <Tips role={slot} />
      {phoneBar ? (
        <PhoneBar send={phone} wait={wait} onDone={() => done(pay)} />
      ) : (
        <BottomBar wide>
          {pv.kind === 'starpass' && picked && <CardButton onClick={() => ui.showCard(roleCard(actor.role, '你现在是', true))} />}
          <button className="btn btn-primary grow" disabled={!!wait} onClick={() => done(pay)}>
            {wait ?? '完成，下一步'}
          </button>
        </BottomBar>
      )}
    </>
  );
}

/* ---------------- 守鸦人 / 送葬者 ---------------- */

function RevealStep({ g, s, actor, kind }: StepProps & { kind: 'ravenkeeper' | 'undertaker' }) {
  const [pick, setPick] = useState<number[]>(kind === 'undertaker' && s.lastExecution ? [s.lastExecution.seat] : []);
  const subject = pick[0];
  const phone = usePhoneAsk(s, actor.n, { count: 1, title: roleName('ravenkeeper'), lines: slotLines('ravenkeeper', s.style), off: kind !== 'ravenkeeper' }, setPick);
  return (
    <>
      {kind === 'ravenkeeper' ? (
        <>
          {phone.on ? (
            phone.view
          ) : (
            <>
              <DoBox items={[wake(actor.n), '让他用手指向一名玩家，你在下面点出来。']} />
              <SayBox lines={slotLines(kind, s.style)} title="小声说" />
            </>
          )}
          <SeatPicker s={s} selected={pick} max={1} onChange={setPick} label="他想看谁的角色？" />
        </>
      ) : (
        <p className="muted">
          今天被处决的是 <b>{seatName(subject)}</b>（{roleName(seatOf(s, subject).role)}）。
        </p>
      )}
      {subject ? (
        <Reveal key={subject} enabled={kind === 'ravenkeeper'}>
          <RevealAnswer g={g} s={s} actor={actor} kind={kind} subject={subject} wait={phone.wait} />
        </Reveal>
      ) : (
        <Pending text={phone.wait ?? '先点出他指的人'} />
      )}
    </>
  );
}

function RevealAnswer({ g, s, actor, kind, subject, wait }: StepProps & { kind: 'ravenkeeper' | 'undertaker'; subject: number; wait: string | null }) {
  const done = useDone(g);
  const ui = useUi();
  const choices = useMemo(() => revealChoices(s, actor.n, subject, stepRng(s, subject), kind), [s, actor.n, subject, kind]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, subject + 1)), [choices, s, subject]);
  const [sel, setSel] = useState(rec);
  const [mRole, setMRole] = useState<RoleId | null>(null);
  const lie = mustLie(s, kind);
  const healthy = !malfunction(s, actor.n) && !lie;
  const verdict = mRole ? revealVerdict(s, subject, mRole) : null;
  const illegal = sel === -1 && ((healthy && verdict === 'false') || (lie && verdict !== null && verdict !== 'false'));
  const value = sel >= 0 ? choices[sel].value : mRole;
  const truth = sel >= 0 ? choices[sel].truth : verdict !== 'false';
  const twist = sel >= 0 ? !!choices[sel].twist : verdict === 'twist';
  const phoneOn = usePhoneOn(actor.n);
  const title = kind === 'undertaker' ? `今天被处决的 ${seatName(subject)} 是` : `${seatName(subject)} 的角色是`;
  const phone = usePhoneSend(s, value ? [{ n: actor.n, tag: 'info', body: { card: { ...roleCard(value, title), lines: kind === 'undertaker' ? slotLines(kind, s.style) : undefined } } }] : []);
  const finish = () => value && done({ kind: 'reveal', pick: subject, role: value, truth, twist });

  const manual = (
    <div className="stack" style={{ gap: 8 }}>
      {(['townsfolk', 'outsider', 'minion', 'demon'] as const).map((t) => (
        <div key={t}>
          <div className="dim">{TEAM_NAME[t]}</div>
          <div className="role-grid">
            {scriptOf(s)
              .roles.filter((r) => ROLES[r].team === t)
              .map((r) => (
                <button key={r} className={`role-chip${t === 'minion' || t === 'demon' ? ' evil-c' : ''}`} style={mRole === r ? { boxShadow: '0 0 0 2px var(--gold) inset' } : undefined} onClick={() => setMRole(r)}>
                  {roleName(r)}
                </button>
              ))}
          </div>
        </div>
      ))}
      {illegal && <p className="evil">{lie ? '涡流在场，必须给假信息。' : '他没有中毒也不是酒鬼，必须给真信息。这样给不合规。'}</p>}
    </div>
  );

  return (
    <>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={setSel} manual={manual} />
      {phoneOn ? (
        <DoBox items={[`确认上面的角色，点「发给 ${seatName(actor.n)}」：他手机上会显示"${title}……"。`]} />
      ) : (
        <>
          <DoBox items={[kind === 'undertaker' ? wake(actor.n) : null, '点「给他看」展示角色。', sleep]} />
          {kind === 'undertaker' && <SayBox lines={slotLines(kind, s.style)} title="小声说" />}
        </>
      )}
      <Tips role={kind} drunk={actor.role === 'drunk'} />
      {phoneOn ? (
        <PhoneBar send={phone} wait={wait} ready={!!value && !illegal} onDone={finish} />
      ) : (
        <BottomBar wide>
          {value && <CardButton onClick={() => ui.showCard(roleCard(value, kind === 'undertaker' ? '今天被处决的玩家是' : '这名玩家的角色是'))} />}
          <button className="btn btn-primary grow" disabled={!value || illegal || !!wait} onClick={finish}>
            {wait ?? '完成，下一步'}
          </button>
        </BottomBar>
      )}
    </>
  );
}

/* ---------------- 疯子 ---------------- */

function LunaticStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const d = demonSeat(s);
  const fake = s.lunaticFake ? roleName(s.lunaticFake) : '恶魔';
  const fakeLines = s.lunaticFake && slotLines(s.lunaticFake as SlotId, s.style).length ? slotLines(s.lunaticFake as SlotId, s.style) : slotLines('lunatic', s.style);
  const first = s.night === 1;
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: s.lunaticFake ? roleName(s.lunaticFake) : '恶魔', lines: fakeLines, off: first }, setT);
  const tell = d && !lilMonsta(s) && (first || t.length > 0);
  const phone = usePhoneSend(s, tell ? [infoTo(d.n, { title: '这名玩家是疯子', big: [seatName(actor.n)], note: first ? undefined : `今晚他选了 ${seatName(t[0])}` })] : []);
  const phoneOn = usePhoneOn(first ? d?.n : actor.n);

  // 7 人以上：第一晚像真恶魔一样叫醒他，给假的爪牙和伪装
  if (first && s.count >= 7) return <LunaticFirstNight g={g} s={s} actor={actor} />;
  // 5–6 人：第一晚只是告诉真恶魔谁是疯子
  if (first && phoneOn)
    return (
      <>
        <p className="muted">5–6 人局恶魔不知道队友，但疯子的能力让真恶魔知道疯子是谁。疯子本人这一步不用醒。</p>
        <DoBox items={[sendTo([d!.n], `真恶魔手机上会显示 ${seatName(actor.n)} 是疯子。`)]} />
        <StepBar phone send={phone} onDone={() => done({ kind: 'none' })} />
      </>
    );
  if (first) {
    return (
      <>
        <p className="muted">
          5–6 人局恶魔不知道队友，但疯子的能力让真恶魔知道疯子是谁。疯子本人这一步不用醒。
        </p>
        <DoBox
          items={[
            d ? wake(d.n) : '叫醒真恶魔。',
            <>
              用手指向 <b>{seatName(actor.n)}</b>，点「给他看」：这名玩家是疯子。
            </>,
            sleep,
          ]}
        />
        <BottomBar wide>
          <CardButton onClick={() => ui.showCard({ title: '这名玩家是', big: ['疯子'] })} />
          <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
            完成，下一步
          </button>
        </BottomBar>
      </>
    );
  }

  const informed: ReactNode[] = !t.length
    ? []
    : lilMonsta(s)
      ? [`等会儿在"小怪宝"那一步告诉爪牙们：疯子是 ${seatName(actor.n)}，今晚他选了 ${seatName(t[0])}。`]
      : d
        ? [
            wake(d.n),
            <>
              用手指向 <b>{seatName(actor.n)}</b>（疯子），再指向 <b>{seatName(t[0])}</b>（疯子选的人）。
            </>,
            sleep,
          ]
        : [];

  return (
    <>
      {ask.on ? (
        <>
          <p className="muted">他以为自己是{fake}：选人请求已发到他手机上（他选的人不会死）。</p>
          {ask.view}
        </>
      ) : (
        <>
          <DoBox items={[wake(actor.n), `他以为自己是${fake}：让他指一名玩家，你在下面点出来（这个人不会死）。`, sleep]} />
          {/* 按他以为的恶魔念台词（例如普卡是下毒，不是杀人） */}
          <SayBox lines={fakeLines} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={t} max={1} onChange={setT} label="疯子指了谁？" />
      {informed.length > 0 && (
        <Reveal key={t[0]}>
          {phone.on ? <DoBox items={[sendTo([d!.n], `真恶魔手机上会显示疯子是 ${seatName(actor.n)}、他选了 ${seatName(t[0])}。`)]} /> : <DoBox title="然后告诉真恶魔" items={informed} />}
        </Reveal>
      )}
      <Tips role="lunatic" />
      <StepBar phone={ask.on} send={phone} wait={ask.wait} ready={t.length > 0} label={t.length ? '完成，下一步' : '先点出疯子指的人'} onDone={() => done({ kind: 'target', target: t[0] })} />
    </>
  );
}

/** 疯子第一晚（7 人以上）：他以为自己是恶魔，给他看假的爪牙和伪装；再告诉真恶魔谁是疯子 */
function LunaticFirstNight({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const d = demonSeat(s);
  const fake = s.lunaticFake ? roleName(s.lunaticFake) : '恶魔';
  const nMin = minionSeats(s).length;
  // 假爪牙随便指几个人，假伪装随便三个善良角色（不必是不在场的）
  const fakeMinions = useMemo(
    () => shuffle(s.seats.filter((x) => x.n !== actor.n && !x.traveller).map((x) => x.n), stepRng(s, 21)).slice(0, nMin).sort((a, b) => a - b),
    [s, actor.n, nMin],
  );
  const fakeBluffs = useMemo(
    () => shuffle(scriptOf(s).roles.filter((r) => (ROLES[r].team === 'townsfolk' || ROLES[r].team === 'outsider') && r !== 'lunatic' && r !== 'moonchild' && r !== 'drunk'), stepRng(s, 22)).slice(0, 3),
    [s],
  );
  // 他以为的恶魔第一晚就要行动（普卡）：让他选人
  const acts = s.lunaticFake === 'pukka';
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: fake, lines: slotLines('pukka', s.style), off: !acts }, setT);
  const lines = slotLines('demonInfo', s.style);
  const fakeInfo = usePhoneSend(s, [
    ...(nMin > 0 ? [infoTo(actor.n, { big: fakeMinions.map(seatName) }, lines.slice(0, 1))] : []),
    infoTo(actor.n, { big: fakeBluffs.map(roleName) }, lines.slice(1), 'info2'),
  ]);
  const tellDemon = usePhoneSend(s, d && (!acts || t.length) ? [infoTo(d.n, { title: '这名玩家是疯子', big: [seatName(actor.n)], note: acts ? `今晚他选了 ${seatName(t[0])}` : undefined })] : []);
  const phone = usePhoneOn(actor.n) && (!d || tellDemon.on || (acts && !t.length));
  const both: typeof fakeInfo = {
    ...fakeInfo,
    unsent: [...fakeInfo.unsent, ...tellDemon.unsent],
    unread: [...fakeInfo.unread, ...tellDemon.unread],
    away: [...fakeInfo.away, ...tellDemon.away],
    changed: fakeInfo.changed || tellDemon.changed,
    busy: fakeInfo.busy || tellDemon.busy,
    sendAll: async () => {
      await fakeInfo.sendAll();
      await tellDemon.sendAll();
    },
    resend: async () => {
      await fakeInfo.resend();
      await tellDemon.resend();
    },
  };
  if (phone)
    return (
      <>
        <p className="muted">疯子（{seatName(actor.n)}）以为自己是{fake}：他手机上会像真恶魔一样收到假的爪牙和伪装。他选的人什么事都不会有。</p>
        {ask.view}
        {acts && <SeatPicker s={s} selected={t} max={1} onChange={setT} label="疯子选了谁？" />}
        <DoBox
          items={[
            sendTo([actor.n], `他手机上会显示"你的爪牙"${nMin > 0 ? `（${seatsText(fakeMinions)}，随机挑的）` : ''}和三个伪装（${fakeBluffs.map(roleName).join('、')}）。`),
            d ? `同时发给真恶魔 ${seatName(d.n)}：谁是疯子${acts ? '、疯子选了谁' : ''}。` : null,
          ]}
        />
        <Tips role="lunatic" />
        <StepBar phone send={both} wait={ask.wait} ready={!acts || t.length > 0} onDone={() => done(acts ? { kind: 'target', target: t[0] } : { kind: 'none' })} />
      </>
    );
  return (
    <>
      <p className="muted">疯子（{seatName(actor.n)}）以为自己是{fake}：像真恶魔一样叫醒他，给他看假的爪牙和伪装。他选的人什么事都不会有。</p>
      <DoBox
        items={[
          wake(actor.n),
          nMin > 0 ? (
            <>
              用手随便指 {nMin} 个人，告诉他"这些是你的爪牙"（网页随机挑了 <b>{seatsText(fakeMinions)}</b>）。
            </>
          ) : null,
          '点「给疯子看伪装」：这三个角色不在场，你可以伪装成他们。',
          acts ? `他以为自己是${fake}，第一晚就要选人：让他指一名玩家，你在下面点出来。` : null,
          sleep,
        ]}
      />
      <SayBox lines={slotLines('demonInfo', s.style)} title="小声说" />
      <button className="btn btn-ghost btn-block" onClick={() => ui.showCard({ title: '这三个角色不在场，你可以伪装成他们', big: fakeBluffs.map(roleName) })}>
        <Icon name="eye" /> 给疯子看伪装（{fakeBluffs.map(roleName).join('、')}）
      </button>
      {acts && <SeatPicker s={s} selected={t} max={1} onChange={setT} label="疯子指了谁？" />}
      <DoBox
        title="然后告诉真恶魔"
        items={[
          d ? wake(d.n) : '叫醒真恶魔。',
          <>
            用手指向 <b>{seatName(actor.n)}</b>，点「给恶魔看」：这名玩家是疯子{acts && t.length ? <>；再指向 <b>{seatName(t[0])}</b>（疯子选的人）</> : null}。
          </>,
          sleep,
        ]}
      />
      <Tips role="lunatic" />
      <BottomBar wide>
        <CardButton label="给恶魔看" onClick={() => ui.showCard({ title: '这名玩家是', big: ['疯子'] })} />
        <button className="btn btn-primary grow" disabled={acts && !t.length} onClick={() => done(acts ? { kind: 'target', target: t[0] } : { kind: 'none' })}>
          {acts && !t.length ? '先点出疯子指的人' : '完成，下一步'}
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 小怪宝：爪牙选照看者，说书人定谁死 ---------------- */

function LilMonstaStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const minions = s.seats.filter((x) => x.alive && ROLES[x.role].team === 'minion');
  const locked = s.babysitterLocked && s.babysitter ? [s.babysitter] : null;
  // 每晚都要重新问爪牙，不默认填昨晚的人
  const [bs, setBs] = useState<number[]>(locked ?? []);
  const last = s.night > 1 && s.babysitter && !locked ? s.babysitter : null;
  const lunatic = s.seats.find((x) => x.role === 'lunatic' && x.alive);
  const nonMinions = s.seats.filter((x) => !minions.includes(x)).map((x) => x.n);
  // 手机上：由第一个爪牙替大家选照看者；选好后告诉所有爪牙
  const asker = minions[0]?.n;
  const ask = usePhoneAsk(s, asker ?? 0, { count: 1, title: '小怪宝', lines: slotLines('lilmonsta', s.style), disabled: nonMinions, off: !!locked || asker === undefined }, setBs);
  const lunNote = lunatic ? `疯子是 ${seatName(lunatic.n)}${s.ns?.lunaticPick ? `，今晚他选了 ${seatName(s.ns.lunaticPick)}` : ''}。` : undefined;
  const tell = usePhoneSend(s, bs.length ? minions.map((x) => infoTo(x.n, { title: '今晚照看小怪宝的是', big: [seatName(bs[0])], note: lunNote })) : []);
  const phone = usePhoneOn(asker) && (tell.on || !bs.length);
  if (phone)
    return (
      <>
        {ask.view}
        <DoBox items={[locked ? `小怪宝今晚由 ${seatName(locked[0])}（红唇女郎）照看。` : `由 ${seatName(asker)} 在手机上替爪牙们选照看者（只能是爪牙）。`, sendTo(minions.map((x) => x.n), `所有爪牙手机上会显示谁照看小怪宝${lunatic ? '、谁是疯子' : ''}。`)]} />
        {!locked && <SeatPicker s={s} selected={bs} max={1} onChange={setBs} disabled={nonMinions} label="谁照看小怪宝？" />}
        {s.night > 1 && bs.length > 0 ? (
          <LilKill key={bs[0]} g={g} s={s} babysitter={bs[0]} send={tell} />
        ) : (
          <>
            <Tips role="lilmonsta" />
            <StepBar phone send={tell} wait={ask.wait} ready={bs.length > 0} label={bs.length ? '完成，下一步' : '先点出照看者'} onDone={() => done({ kind: 'lilmonsta', babysitter: bs[0] })} />
          </>
        )}
      </>
    );
  return (
    <>
      <DoBox
        items={[
          <>
            轻拍所有爪牙 <b>{seatsText(minions.map((x) => x.n))}</b> 的肩膀，让他们睁眼。
          </>,
          locked ? (
            <>
              告诉他们：小怪宝今晚由 <b>{seatName(locked[0])}</b>（红唇女郎）照看。
            </>
          ) : last ? (
            <>
              今晚要<b>重新问</b>他们由谁照看小怪宝（只能是爪牙，可以换人；昨晚是 {seatName(last)}）。你在下面点出来。
            </>
          ) : (
            '让他们商量，指出由谁照看小怪宝（只能是爪牙）。你在下面点出来。'
          ),
          lunatic ? (
            <>
              指向 <b>{seatName(lunatic.n)}</b>，告诉他们：这名玩家是疯子{s.ns?.lunaticPick ? `，今晚他选了 ${seatName(s.ns.lunaticPick)}` : ''}。
            </>
          ) : null,
          '让他们闭眼。',
        ]}
      />
      <SayBox lines={slotLines('lilmonsta', s.style)} title="小声说" />
      {!locked && <SeatPicker s={s} selected={bs} max={1} onChange={setBs} disabled={nonMinions} label="谁照看小怪宝？" />}
      {s.night > 1 && bs.length > 0 ? (
        <LilKill key={bs[0]} g={g} s={s} babysitter={bs[0]} />
      ) : (
        <>
          <Tips role="lilmonsta" />
          {bs.length ? (
            <BottomBar wide>
              <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'lilmonsta', babysitter: bs[0] })}>
                完成，下一步
              </button>
            </BottomBar>
          ) : (
            <Pending text="先点出照看者" />
          )}
        </>
      )}
    </>
  );
}

function LilKill({ g, s, babysitter, send }: { g: Game; s: GameState; babysitter: number; send?: ReturnType<typeof usePhoneSend> }) {
  const done = useDone(g);
  const view = useMemo(() => ({ ...s, babysitter }), [s, babysitter]);
  const choices = useMemo(() => lilKillChoices(view, stepRng(s, babysitter)), [view, s, babysitter]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, babysitter + 2)), [choices, s, babysitter]);
  const [sel, setSel] = useState(rec);
  const [manual, setManual] = useState<number[]>([]);
  const kill = sel >= 0 ? choices[sel]?.value : manual[0];
  const blocked = s.seats.filter((x) => !x.alive || x.n === babysitter).map((x) => x.n);
  return (
    <>
      <div className="dim">每晚（第一晚除外）由你决定谁死，不能是照看者：</div>
      <ChoicePanel
        s={s}
        choices={choices}
        sel={sel}
        rec={rec}
        onSel={setSel}
        manual={<SeatPicker s={s} selected={manual} max={1} onChange={setManual} disabled={blocked} label="你决定谁死？" />}
        manualLabel="自己选"
      />
      <DoBox items={['不需要叫醒任何人。', '天亮时统一宣布死讯。']} />
      <Tips role="lilmonsta" />
      <StepBar
        phone={!!send}
        send={send}
        ready={!!kill}
        label={kill ? `完成：${seatName(babysitter)} 照看，${seatName(kill)} 死亡` : '先选今晚谁死'}
        onDone={() => kill && done({ kind: 'lilmonsta', babysitter, kill })}
      />
    </>
  );
}

/* ---------------- 寡妇 ---------------- */

/** 寡妇分两屏：先让她看魔典下毒，再单独一屏告诉一名善良玩家"寡妇在场" */
function WidowStep({ g, s, actor }: StepProps) {
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const [inform, setInform] = useState(false);
  const goto = (v: boolean) => {
    setInform(v);
    window.scrollTo(0, 0);
  };
  // 手机上：魔典和选人一起发给她
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: '寡妇', lines: slotLines('widow', s.style), rows: spyRows(s) }, setT);
  if (inform && t.length) return <WidowInform g={g} s={s} actor={actor} target={t[0]} onBack={() => goto(false)} />;
  if (ask.on)
    return (
      <>
        {ask.view}
        <DoBox items={['她手机上会先看到整本魔典，再选一个人下毒（寡妇活着就一直中毒）。', <><b>还没完：</b>下一屏要再告诉一名善良玩家"寡妇在场"。</>]} />
        <SeatPicker s={s} selected={t} max={1} onChange={setT} label="她毒了谁？" />
        <Tips role="widow" />
        <StepBar phone wait={ask.wait} ready={t.length > 0} label={t.length ? '下一步：告诉一名善良玩家' : '先点出她毒的人'} onDone={() => goto(true)} />
      </>
    );
  return (
    <>
      <DoBox
        items={[
          wake(actor.n),
          '点「给寡妇看魔典」，把只读魔典给她看。',
          '她看完后指一名玩家：这个人中毒（寡妇活着就一直中毒）。你在下面点出来。',
          `让寡妇（${seatName(actor.n)}）闭眼。`,
          <>
            <b>还没完：</b>下一屏要再叫醒一名善良玩家，告诉他"寡妇在场"。
          </>,
        ]}
      />
      <SayBox lines={slotLines('widow', s.style)} title="小声说" />
      <button className="btn btn-ghost btn-block" onClick={ui.openSpy}>
        <Icon name="eye" /> 给寡妇看魔典
      </button>
      <SeatPicker s={s} selected={t} max={1} onChange={setT} label="她毒了谁？" />
      <Tips role="widow" />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!t.length} onClick={() => goto(true)}>
          {t.length ? '下一步：告诉一名善良玩家' : '先点出她毒的人'}
        </button>
      </BottomBar>
    </>
  );
}

function WidowInform({ g, s, actor, target, onBack }: StepProps & { target: number; onBack: () => void }) {
  const done = useDone(g);
  const ui = useUi();
  const view = useMemo(() => ({ ...s, widowPoison: target }), [s, target]);
  const choices = useMemo(() => widowInformChoices(view, stepRng(s, target)), [view, s, target]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, target + 3)), [choices, s, target]);
  const [sel, setSel] = useState(rec);
  const [manual, setManual] = useState<number[]>([]);
  const who = sel >= 0 ? choices[sel]?.value : manual[0];
  const evilSeats = s.seats.filter((x) => isEvil(x) || !x.alive).map((x) => x.n);
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, who ? [infoTo(who, { title: '这个角色在场', big: ['寡妇'] }, ['寡妇在场。'], 'inform')] : []);
  const viaPhone = phoneOn && (!who || phone.on);
  return (
    <>
      <div className="card card-warn stack" style={{ gap: 6 }}>
        <b style={{ color: 'var(--warn)' }}>寡妇（{seatName(actor.n)}）毒了 {seatName(target)}。现在告诉一名善良玩家：寡妇在场</b>
        <p className="dim">规则要求：寡妇在场时，一定要有一名善良玩家知道。不说他是谁中的毒。</p>
      </div>
      <div className="dim">告诉谁？</div>
      <ChoicePanel
        s={s}
        choices={choices}
        sel={sel}
        rec={rec}
        onSel={setSel}
        manual={<SeatPicker s={s} selected={manual} max={1} onChange={setManual} disabled={evilSeats} label="告诉谁？" />}
        manualLabel="自己选"
      />
      {viaPhone ? (
        <DoBox items={[who ? sendTo([who], '他手机上会显示"寡妇在场"。') : '先选告诉谁。']} />
      ) : (
        <>
          <DoBox
            items={[
              `确认寡妇（${seatName(actor.n)}）已经闭眼。`,
              who ? wake(who) : '叫醒你选的那名善良玩家。',
              '点「给他看」：寡妇在场。',
              sleep,
            ]}
          />
          <SayBox title="小声说" lines={['寡妇在场。']} />
        </>
      )}
      <button className="btn btn-outline btn-sm" onClick={onBack}>
        返回改她毒的人
      </button>
      <Tips role="widow" />
      <StepBar phone={viaPhone} send={phone} ready={!!who} onDone={() => done({ kind: 'widow', target, informed: who ?? null })}>
        <CardButton onClick={() => ui.showCard({ title: '这个角色在场', big: ['寡妇'] })} />
      </StepBar>
    </>
  );
}

/* ---------------- 小精灵 ---------------- */

function PixieStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const choices = useMemo(() => pixieChoices(s, actor.n, stepRng(s)), [s, actor.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel];
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, c ? [infoTo(actor.n, roleCard(c.value, '这个镇民角色在场'), slotLines('pixie', s.style))] : []);
  return (
    <>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      {phoneOn ? (
        <DoBox items={[c ? sendTo([actor.n], `他手机上会显示【${roleName(c.value)}】在场。`) : null]} />
      ) : (
        <>
          <DoBox items={[wake(actor.n), c ? <>点「给他看」：<b>【{roleName(c.value)}】</b>在场。</> : null, sleep]} />
          <SayBox lines={slotLines('pixie', s.style)} title="小声说" />
        </>
      )}
      <Tips role="pixie" />
      <StepBar phone={phoneOn} send={phone} ready={!!c} onDone={() => c && done({ kind: 'role', role: c.value, truth: c.truth })}>
        {c && <CardButton onClick={() => ui.showCard(roleCard(c.value, '这个镇民角色在场'))} />}
      </StepBar>
    </>
  );
}

/* ---------------- 侍女 ---------------- */

function ChambermaidStep({ g, s, actor }: StepProps) {
  const [picks, setPicks] = useState<number[]>([]);
  const blocked = s.seats.filter((x) => !x.alive || x.n === actor.n).map((x) => x.n);
  const ask = usePhoneAsk(s, actor.n, { count: 2, title: roleName('chambermaid'), lines: slotLines('chambermaid', s.style), disabled: blocked }, setPicks);
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让她指两名存活玩家（不能指自己），你在下面点出来。']} />
          <SayBox lines={slotLines('chambermaid', s.style)} title="小声说" />
        </>
      )}
      <p className="dim">今晚因为自己的能力醒来过的人：{s.ns?.woke.length ? seatsText(s.ns.woke) : '还没有'}</p>
      <SeatPicker s={s} selected={picks} max={2} onChange={setPicks} disabled={blocked} label="她指了哪两个人？" collapse="她指了" />
      <GoonNote s={s} actor={actor} picks={picks} slot="chambermaid" />
      {picks.length === 2 ? (
        <Reveal key={[...picks].sort().join()}>
          <ChambermaidAnswer g={g} s={s} actor={actor} picks={picks} wait={ask.wait} />
        </Reveal>
      ) : (
        <>
          <Tips role="chambermaid" />
          <Pending text={ask.wait ?? '先点出她指的两个人'} />
        </>
      )}
    </>
  );
}

function ChambermaidAnswer({ g, s, actor, picks, wait }: StepProps & { picks: number[]; wait: string | null }) {
  const done = useDone(g);
  const sick = !!goonTriggered(s, actor, picks, 'chambermaid');
  const choices = useMemo(() => chambermaidChoices(s, actor.n, picks, sick), [s, actor.n, picks, sick]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, picks[0] * 13 + picks[1])), [choices, s, picks]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel];
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, c ? [infoTo(actor.n, { title: `${seatsText(picks)} 中今晚因自己的能力醒来过的人数`, big: [String(c.value)] })] : []);
  return (
    <>
      <p className="muted">真实答案：{chambermaidCount(s, picks)}</p>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox items={phoneOn ? [c ? sendTo([actor.n], `她手机上会显示数字 ${c.value}。`) : null] : [c ? <>伸出 <b>{c.value}</b> 根手指{c.value === 0 ? '（握拳）' : ''}。</> : null, sleep]} />
      <Tips role="chambermaid" />
      <StepBar phone={phoneOn} send={phone} wait={wait} ready={!!c} onDone={() => c && done({ kind: 'number', num: c.value, truth: c.truth, twist: c.twist, picks })} />
    </>
  );
}

/* ---------------- 公爵夫人的拜访者 ---------------- */

function DuchessStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const choices = useMemo(() => duchessChoices(s, stepRng(s)), [s]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel];
  const real = duchessCount(s);
  const numFor = (n: number) => (c && c.value.falseFor === n ? c.value.falseNum : real);
  const phone = usePhoneSend(s, s.duchessVisitors.map((n) => infoTo(n, { title: '今天拜访公爵夫人的人里，邪恶的有', big: [String(numFor(n))] }, slotLines('duchess', s.style))));
  return (
    <>
      <p className="muted">
        今天的拜访者：{seatsText(s.duchessVisitors)}。其中邪恶的有 <b>{real}</b> 个。每人得知这个数，但其中一人拿到假数字。
      </p>
      {choices.length > 0 && <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />}
      {phone.on ? (
        <DoBox items={[sendTo(s.duchessVisitors, `每人手机上显示一个数字（${s.duchessVisitors.map((n) => `${seatName(n)} 看到 ${numFor(n)}`).join('，')}）。`)]} />
      ) : (
        <>
          <DoBox
            items={s.duchessVisitors.flatMap((n) => [
              <>
                轻拍 <b>{seatName(n)}</b>，伸出 <b>{numFor(n)}</b> 根手指，然后让他闭眼。
              </>,
            ])}
          />
          <SayBox lines={slotLines('duchess', s.style)} title="小声说" />
        </>
      )}
      <StepBar phone={phone.on} send={phone} onDone={() => done(c ? { kind: 'duchess', falseFor: c.value.falseFor, falseNum: c.value.falseNum } : { kind: 'none' })} />
    </>
  );
}

/* ---------------- 气球驾驶员 ---------------- */

function BalloonStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const choices = useMemo(() => balloonistChoices(s, actor.n, stepRng(s)), [s, actor.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel];
  usePoint(c ? [c.value.seat] : []);
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, c ? [infoTo(actor.n, { title: '这名玩家的角色类型和你之前得知的都不同', big: [seatName(c.value.seat)] }, slotLines('balloonist', s.style))] : []);
  return (
    <>
      <p className="dim">
        已经给过的类型：{s.balloonShown.length ? s.balloonShown.map((t) => TEAM_NAME[t]).join('、') : '还没有'}
      </p>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      {phoneOn ? (
        <DoBox items={[c ? sendTo([actor.n], `他手机上会显示 ${seatName(c.value.seat)}。`) : null]} />
      ) : (
        <>
          <DoBox items={[wake(actor.n), c ? <>用手指向 <b>{seatName(c.value.seat)}</b>。</> : null, sleep]} />
          <SayBox lines={slotLines('balloonist', s.style)} title="小声说" />
        </>
      )}
      <Tips role="balloonist" />
      <StepBar phone={phoneOn} send={phone} ready={!!c} onDone={() => c && done({ kind: 'balloon', seat: c.value.seat, team: c.value.team, truth: c.truth })} />
    </>
  );
}


/* ---------------- 残阳高照 ---------------- */

function AlchemistStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const ab = s.alchemistAbility;
  const card = ab ? { title: '你拥有这个爪牙的能力（你仍然是善良的）', big: [roleName(ab)], ability: ROLES[ab].ability } : null;
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, card ? [infoTo(actor.n, card, slotLines('alchemist', s.style))] : []);
  if (phoneOn)
    return (
      <>
        <DoBox items={[ab ? sendTo([actor.n], `他手机上会显示他拥有【${roleName(ab)}】的能力。`) : null, `之后会在${ab ? roleName(ab) : '那个爪牙'}的位置让他在手机上操作。`]} />
        <Tips role="alchemist" drunk={actor.role === 'drunk'} />
        <StepBar phone send={phone} onDone={() => done({ kind: 'none' })} />
      </>
    );
  return (
    <>
      <DoBox
        items={[
          wake(actor.n),
          ab ? (
            <>
              点「给他看」：你拥有<b>【{roleName(ab)}】</b>的能力（你仍然是善良的）。
            </>
          ) : null,
          `之后会在${ab ? roleName(ab) : '那个爪牙'}的位置叫醒他，照爪牙的方式操作。`,
          sleep,
        ]}
      />
      <SayBox lines={slotLines('alchemist', s.style)} title="小声说" />
      <Tips role="alchemist" drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        {ab && <CardButton onClick={() => ui.showCard({ title: '你拥有这个爪牙的能力（你仍然是善良的）', big: [roleName(ab)], ability: ROLES[ab].ability })} />}
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

function GodfatherStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  if (s.night > 1) return <KillStep g={g} s={s} actor={actor} slot="godfather" />;
  const outs = godfatherOutsiders(s);
  const card = outs.length ? { title: '这些外来者在场', big: outs.map(roleName) } : { title: '场上没有外来者', big: ['0'] };
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, [infoTo(actor.n, card, outs.length ? slotLines('godfather', s.style) : undefined)]);
  if (phoneOn)
    return (
      <>
        <DoBox items={[sendTo([actor.n], outs.length ? `他手机上会显示在场的外来者：${outs.map(roleName).join('、')}。` : '他手机上会显示"场上没有外来者"。')]} />
        {malfunction(s, actor.n) && <p className="dim">他其实是酒鬼/中毒：可以给假的（现在网页给的是真的）。</p>}
        <Tips role="godfather" drunk={actor.role === 'drunk'} />
        <StepBar phone send={phone} onDone={() => done({ kind: 'none' })} />
      </>
    );
  return (
    <>
      <DoBox
        items={[
          wake(actor.n),
          outs.length ? (
            <>
              点「给他看」：在场的外来者是 <b>{outs.map(roleName).join('、')}</b>。
            </>
          ) : (
            '比出 0（握拳）：场上没有外来者。'
          ),
          sleep,
        ]}
      />
      <SayBox lines={outs.length ? slotLines('godfather', s.style) : ['场上没有外来者。']} title="小声说" />
      {malfunction(s, actor.n) && <p className="dim">他其实是酒鬼/中毒：可以给假的。</p>}
      <Tips role="godfather" drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        {outs.length > 0 && <CardButton onClick={() => ui.showCard({ title: '这些外来者在场', big: outs.map(roleName) })} />}
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/** 僵怖 / 教父（其他夜晚）：选一个人杀 */
function KillStep({ g, s, actor, slot }: StepProps & { slot: 'zombuul' | 'godfather' }) {
  const done = useDone(g);
  const [t, setT] = useState<number[]>([]);
  const bad = malfunction(s, actor.n) || !!goonTriggered(s, actor, t, slot);
  const pv = t.length ? killPreview(s, t[0]) : null;
  const outs = diedOnDay(s, s.night - 1).filter((x) => teamOf(x.role) === 'outsider');
  const lines = slot === 'godfather' ? ['今天有外来者死了。请选择一名玩家，他会死亡。'] : slotLines('zombuul', s.style);
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: roleName(slot), lines }, setT);
  return (
    <>
      <p className="muted">
        {slot === 'godfather'
          ? `今天白天有外来者死了（${seatsText(outs.map((x) => x.n))}），教父今晚要杀一个人。`
          : '今天白天没有人死，僵怖醒来杀人。'}
      </p>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他用手指向一名玩家，你在下面点出来。', sleep]} />
          <SayBox lines={lines} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={t} max={1} onChange={setT} label="他要杀谁？" />
      <GoonNote s={s} actor={actor} picks={t} slot={slot} />
      {pv && (
        <Reveal key={t[0]}>
          <div className={`card${pv.dies && !bad ? ' card-evil' : ''}`}>
            <p>{bad ? '他中毒/醉酒：杀人无效，没有人会死。' : pv.text}</p>
          </div>
          <DoBox items={['天亮时再统一宣布死讯。']} />
        </Reveal>
      )}
      <Tips role={slot} />
      <StepBar phone={ask.on} wait={ask.wait} ready={t.length > 0} label={t.length ? '完成，下一步' : '先点出他指的人'} onDone={() => done({ kind: 'target', target: t[0] })} />
    </>
  );
}

function FlowergirlStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const choices = useMemo(() => flowergirlChoices(s, actor.n), [s, actor.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  const voted = s.demonVotedDay === s.night - 1;
  const setVoted = (v: boolean) => g.commit((st) => (st.demonVotedDay = v ? st.night - 1 : 0));
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, [infoTo(actor.n, { title: '恶魔今天有没有投票', big: [c.value ? '投过' : '没投'] }, slotLines('flowergirl', s.style))]);
  return (
    <>
      <div className="card stack" style={{ gap: 8 }}>
        <b>今天白天恶魔（{seatName(demonSeat(s)?.n)}）有没有举手投过票？</b>
        <p className="dim">白天记下的是"{voted ? '投过' : '没投'}"。记错了就在这里改。</p>
        <TwoChoice value={voted} onChange={setVoted} yes="投过" no="没投" />
      </div>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      {phoneOn ? (
        <DoBox items={[sendTo([actor.n], `她手机上会显示"${c.value ? '投过' : '没投'}"。`)]} />
      ) : (
        <>
          <DoBox items={[wake(actor.n), c.value ? <><b>点头</b>：恶魔今天投过票。</> : <><b>摇头</b>：恶魔今天没投票。</>, sleep]} />
          <SayBox lines={slotLines('flowergirl', s.style)} title="小声说" />
        </>
      )}
      <Tips role="flowergirl" drunk={actor.role === 'drunk'} />
      <StepBar phone={phoneOn} send={phone} onDone={() => done({ kind: 'yesno', yes: c.value, truth: c.truth })} />
    </>
  );
}

/* ---------------- 王不见王 ---------------- */

function MarionetteStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const m = s.seats.find((x) => x.role === 'marionette')!;
  usePoint([m.n]);
  const phone = usePhoneSend(s, [infoTo(actor.n, { title: '这名玩家是你的提线木偶', big: [seatName(m.n)] }, slotLines('marionette', s.style))]);
  if (phone.on)
    return (
      <>
        <p className="muted">提线木偶（{seatName(m.n)}）以为自己是【{roleName(believedRole(s, m))}】，他不知道自己是邪恶的，爪牙也不认识他。只告诉恶魔。</p>
        <DoBox items={[sendTo([actor.n], `恶魔手机上会显示提线木偶是 ${seatName(m.n)}。`)]} />
        <Tips role="marionette" />
        <StepBar phone send={phone} onDone={() => done({ kind: 'none' })} />
      </>
    );
  return (
    <>
      <p className="muted">
        提线木偶（{seatName(m.n)}）以为自己是【{roleName(believedRole(s, m))}】，他不知道自己是邪恶的，爪牙也不认识他。只告诉恶魔。
      </p>
      <DoBox
        items={[
          wake(actor.n),
          <>
            用手指向 <b>{seatName(m.n)}</b>，点「给他看」：提线木偶。
          </>,
          sleep,
        ]}
      />
      <SayBox lines={slotLines('marionette', s.style)} title="小声说" />
      <Tips role="marionette" />
      <BottomBar wide>
        <CardButton onClick={() => ui.showCard({ title: '这名玩家是你的', big: ['提线木偶'] })} />
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/** 发到被鹰身女妖选中的第一个人手机上 */
const harpyCard = (mad: number, second: number) =>
  infoTo(mad, { title: '鹰身女妖选择了你', big: [seatName(second)], note: `明天你要"疯狂"地证明 ${seatName(second)} 是邪恶的，否则你们之中可能有人死。` });

/** 告诉被鹰身女妖选中的第一个人 */
function HarpyInform({ mad, second }: { mad: number; second: number }) {
  usePoint([second]);
  return (
    <DoBox
      title="然后告诉第一个人"
      items={[
        wake(mad),
        '点「给他看」：鹰身女妖选择了你。',
        <>
          用手指向 <b>{seatName(second)}</b>：明天你要疯狂地证明他是邪恶的，否则你们之中可能有人死。
        </>,
        sleep,
      ]}
    />
  );
}

/** 鹰身女妖：由她自己选两个人，你点出来 */
function HarpyStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const bad = malfunction(s, actor.n);
  const [mad, second] = t;
  const ask = usePhoneAsk(s, actor.n, { count: 2, ordered: true, title: '鹰身女妖（先选要疯狂的人，再选第二个人）', lines: slotLines('harpy', s.style) }, setT);
  const phone = usePhoneSend(s, t.length === 2 ? [harpyCard(mad, second)] : []);
  const viaPhone = ask.on && (t.length < 2 || phone.on);
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让她先指第一个人，再指第二个人。你按顺序点出来。', sleep]} />
          <SayBox lines={slotLines('harpy', s.style)} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={t} max={2} onChange={setT} label="先点第一个人（要疯狂的人），再点第二个人" />
      {t.length === 2 && (
        <Reveal key={t.join()}>
          {viaPhone ? <DoBox items={[sendTo([mad], `他手机上会显示：鹰身女妖选择了你，明天要疯狂地证明 ${seatName(second)} 是邪恶的。`)]} /> : <HarpyInform mad={mad} second={second} />}
          {bad && <p className="dim">她中毒/醉酒：照常走流程，但明天不会有人因此死亡。</p>}
        </Reveal>
      )}
      <Tips role="harpy" />
      <StepBar
        phone={viaPhone}
        send={phone}
        wait={ask.wait}
        ready={t.length === 2}
        label={t.length === 2 ? `完成：${seatName(mad)} 要证明 ${seatName(second)} 是邪恶的` : '先按顺序点出两个人'}
        onDone={() => done({ kind: 'harpy', mad, second })}
      >
        {t.length === 2 && <CardButton onClick={() => ui.showCard({ title: '这个角色选择了你', big: ['鹰身女妖'] })} />}
      </StepBar>
    </>
  );
}

/** 瘟疫医生死后说书人自己的鹰身女妖能力：网页推荐两个人 */
function StHarpyStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const ui = useUi();
  const choices = useMemo(() => stHarpyChoices(s, stepRng(s)), [s]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const [manual, setManual] = useState<number[]>([]);
  const pick = sel >= 0 ? choices[sel]?.value : manual.length === 2 ? { mad: manual[0], second: manual[1] } : undefined;
  const phoneOn = usePhoneOn(pick?.mad);
  const phone = usePhoneSend(s, pick ? [harpyCard(pick.mad, pick.second)] : []);
  return (
    <>
      <p className="muted">瘟疫医生死后你获得了鹰身女妖的能力：由你选两个人，不用叫醒鹰身女妖。</p>
      <ChoicePanel
        s={s}
        choices={choices}
        sel={sel}
        rec={rec}
        onSel={setSel}
        manual={<SeatPicker s={s} selected={manual} max={2} onChange={setManual} label="先点第一个人（要疯狂的人），再点第二个人" />}
        manualLabel="自己选"
        moreLabel="换两个人"
      />
      {pick && (phoneOn ? <DoBox items={[sendTo([pick.mad], `他手机上会显示：鹰身女妖选择了你，明天要疯狂地证明 ${seatName(pick.second)} 是邪恶的。`)]} /> : <HarpyInform mad={pick.mad} second={pick.second} />)}
      <p className="dim">明天白天由你判断第一个人有没有做到，网页会在投票区旁边问你。</p>
      <StepBar
        phone={phoneOn}
        send={phone}
        ready={!!pick}
        label={pick ? `完成：${seatName(pick.mad)} 要证明 ${seatName(pick.second)} 是邪恶的` : '先按顺序点出两个人'}
        onDone={() => pick && done({ kind: 'harpy', mad: pick.mad, second: pick.second })}
      >
        {pick && <CardButton onClick={() => ui.showCard({ title: '这个角色选择了你', big: ['鹰身女妖'] })} />}
      </StepBar>
    </>
  );
}

function StPoisonStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const choices = useMemo(() => stPoisonChoices(s, stepRng(s)), [s]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const [manual, setManual] = useState<number[]>([]);
  const t = sel >= 0 ? choices[sel]?.value : manual[0];
  return (
    <>
      <p className="muted">瘟疫医生死后你获得了投毒者的能力：每晚由你选一个人，他今晚和明天白天中毒。不用叫醒任何人。</p>
      <ChoicePanel
        s={s}
        choices={choices}
        sel={sel}
        rec={rec}
        onSel={setSel}
        manual={<SeatPicker s={s} selected={manual} max={1} onChange={setManual} label="你要毒谁？" />}
        manualLabel="自己选"
        moreLabel="换一个人"
      />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!t} onClick={() => t && done({ kind: 'target', target: t })}>
          {t ? `确认：毒 ${seatName(t)}，下一步` : '先选你要毒的人'}
        </button>
      </BottomBar>
    </>
  );
}

function DreamerStep({ g, s, actor }: StepProps) {
  const [t, setT] = useState<number[]>([]);
  const blocked = [actor.n, ...s.seats.filter((x) => x.traveller).map((x) => x.n)];
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: roleName('dreamer'), lines: slotLines('dreamer', s.style), disabled: blocked }, setT);
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他指一名玩家（不能指自己或旅行者），你在下面点出来。']} />
          <SayBox lines={slotLines('dreamer', s.style)} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={blocked} label="他指了谁？" collapse="他指了" />
      {t.length ? (
        <Reveal key={t[0]}>
          <DreamerAnswer g={g} s={s} actor={actor} target={t[0]} wait={ask.wait} />
        </Reveal>
      ) : (
        <>
          <Tips role="dreamer" drunk={actor.role === 'drunk'} />
          <Pending text={ask.wait ?? '先点出他指的人'} />
        </>
      )}
    </>
  );
}

function DreamerAnswer({ g, s, actor, target, wait }: StepProps & { target: number; wait: string | null }) {
  const done = useDone(g);
  const ui = useUi();
  const choices = useMemo(() => dreamerChoices(s, actor.n, target, stepRng(s, target)), [s, actor.n, target]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, target + 1)), [choices, s, target]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, [infoTo(actor.n, { title: `${seatName(target)} 是这两个角色之一`, big: [roleName(c.value.good), roleName(c.value.evil)] })]);
  return (
    <>
      <p className="muted">
        {seatName(target)} 的真实角色：{roleName(seatOf(s, target).role)}
      </p>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox
        items={
          phoneOn
            ? [sendTo([actor.n], `他手机上会显示：${dreamLabel(c.value)}，他是其中之一。`)]
            : [
                <>
                  点「给他看」：<b>{dreamLabel(c.value)}</b>，他是其中之一。
                </>,
                sleep,
              ]
        }
      />
      <Tips role="dreamer" drunk={actor.role === 'drunk'} />
      <StepBar phone={phoneOn} send={phone} wait={wait} onDone={() => done({ kind: 'dreamer', target, good: c.value.good, evil: c.value.evil, truth: c.truth, twist: c.twist })}>
        <CardButton onClick={() => ui.showCard({ title: '他是这两个角色之一', big: [roleName(c.value.good), roleName(c.value.evil)] })} />
      </StepBar>
    </>
  );
}

function SeamstressStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const [use, setUse] = useState<boolean | null>(null);
  const [picks, setPicks] = useState<number[]>([]);
  const ask = usePhoneAsk(
    s, actor.n, { count: 2, title: roleName('seamstress'), lines: slotLines('seamstress', s.style), disabled: [actor.n], skip: '今晚不用（整局只能用一次）' },
    (ns, a) => {
      setUse(!a.skip);
      setPicks(ns);
    },
  );
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '问她今晚要不要用能力（整局只能用一次）。不用就让她闭眼。']} />
          <SayBox lines={slotLines('seamstress', s.style)} title="小声说" />
        </>
      )}
      <TwoChoice value={use} onChange={setUse} yes="她要用" no="她不用（摇头）" />
      {use && <SeatPicker s={s} selected={picks} max={2} onChange={setPicks} disabled={[actor.n]} label="她指了哪两个人？" collapse="她指了" />}
      {use && picks.length === 2 ? (
        <Reveal key={[...picks].sort().join()}>
          <SeamstressAnswer g={g} s={s} actor={actor} picks={picks as [number, number]} wait={ask.wait} />
        </Reveal>
      ) : (
        <>
          <Tips role="seamstress" drunk={actor.role === 'drunk'} />
          <StepBar
            phone={ask.on}
            wait={ask.wait}
            ready={use === false}
            label={use === false ? '她不用，下一步' : use ? '先点出她指的两个人' : '先问她用不用'}
            onDone={() => done({ kind: 'seamstress', picks: null, same: false, truth: true })}
          />
        </>
      )}
    </>
  );
}

function SeamstressAnswer({ g, s, actor, picks, wait }: StepProps & { picks: [number, number]; wait: string | null }) {
  const done = useDone(g);
  const choices = useMemo(() => seamstressChoices(s, actor.n, picks), [s, actor.n, picks]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, picks[0] * 17 + picks[1])), [choices, s, picks]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, [infoTo(actor.n, { title: `${seatsText(picks)}：`, big: [c.value ? '同一阵营' : '不同阵营'] })]);
  return (
    <>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox items={phoneOn ? [sendTo([actor.n], `她手机上会显示"${c.value ? '同一阵营' : '不同阵营'}"。`)] : [c.value ? <><b>点头</b>：同一阵营。</> : <><b>摇头</b>：不同阵营。</>, sleep]} />
      <Tips role="seamstress" drunk={actor.role === 'drunk'} />
      <StepBar phone={phoneOn} send={phone} wait={wait} label="完成，下一步（她的能力用掉了）" onDone={() => done({ kind: 'seamstress', picks, same: c.value, truth: c.truth, twist: c.twist })} />
    </>
  );
}

function BountyStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const choices = useMemo(() => bountyChoices(s, actor.n, stepRng(s)), [s, actor.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel];
  const last = s.bountyKnown[s.bountyKnown.length - 1];
  usePoint(c ? [c.value] : []);
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, c ? [infoTo(actor.n, { title: '这名玩家是邪恶的', big: [seatName(c.value)] }, slotLines('bountyhunter', s.style))] : []);
  return (
    <>
      {last !== undefined && <p className="muted">他之前得知的 {seatName(last)} 死了，今晚得知另一名邪恶玩家。</p>}
      {choices.length > 0 ? <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} /> : <p className="dim">没有可以给的邪恶玩家了。</p>}
      {phoneOn ? (
        <DoBox items={[c ? sendTo([actor.n], `他手机上会显示 ${seatName(c.value)} 是邪恶的。`) : null]} />
      ) : (
        <>
          <DoBox
            items={[
              wake(actor.n),
              c ? (
                <>
                  用手指向 <b>{seatName(c.value)}</b>，点「给他看」：这个人是邪恶的。
                </>
              ) : null,
              sleep,
            ]}
          />
          <SayBox lines={slotLines('bountyhunter', s.style)} title="小声说" />
        </>
      )}
      <Tips role="bountyhunter" drunk={actor.role === 'drunk'} />
      <StepBar phone={phoneOn} send={phone} onDone={() => done(c ? { kind: 'bounty', seat: c.value, truth: c.truth, twist: c.twist } : { kind: 'none' })}>
        {c && <CardButton onClick={() => ui.showCard({ title: '这名玩家是', big: ['邪恶的'] })} />}
      </StepBar>
    </>
  );
}

function GeneralStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const choices = useMemo(() => generalChoices(s, actor.n), [s, actor.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  const word = c.value === 'good' ? '善良占优' : c.value === 'evil' ? '邪恶占优' : '都不占优';
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, [infoTo(actor.n, { title: '现在的局势', big: [word] }, slotLines('general', s.style))]);
  return (
    <>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      {phoneOn ? (
        <DoBox items={[sendTo([actor.n], `他手机上会显示"${word}"。`)]} />
      ) : (
        <>
          <DoBox items={[wake(actor.n), <b key="a">{c.label}</b>, sleep]} />
          <SayBox lines={slotLines('general', s.style)} title="小声说" />
        </>
      )}
      <Tips role="general" drunk={actor.role === 'drunk'} />
      <StepBar phone={phoneOn} send={phone} onDone={() => done({ kind: 'general', answer: c.value, truth: c.truth })} />
    </>
  );
}

/** 哈迪寂亚：选三个人 → 宣布 → 依次问活还是死 */
function HadikhiaStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const [picks, setPicks] = useState<number[]>([]);
  const [live, setLive] = useState<(boolean | null)[]>([null, null, null]);
  const ready = picks.length === 3 && live.every((x) => x !== null);
  const pv = ready ? hadikhiaPreview(s, picks, live as boolean[]) : null;
  const bad = malfunction(s, actor.n);
  const setOne = (i: number, v: boolean) => setLive((xs) => xs.map((x, j) => (j === i ? v : x)));
  const [skip, setSkip] = useState(false);
  const ask = usePhoneAsk(s, actor.n, { count: 3, ordered: true, title: roleName('alhadikhia'), lines: slotLines('alhadikhia', s.style), skip: '今晚不选' }, (ns, a) => {
    setPicks(ns);
    setLive([null, null, null]);
    setSkip(!!a.skip);
  });
  // 三个人各自在手机上选活还是死（同时问，互相看不到）
  const liveOpts = [{ id: 'live', label: '活' }, { id: 'die', label: '死' }];
  const lifeAsk = (i: number) => ({
    count: 0,
    title: '恶魔选中了你：你选择活还是死？',
    lines: [`恶魔选择了 ${seatsText(picks)}。如果三个人都选"活"，三个人都会死。`],
    opts: liveOpts,
    off: !ask.on || picks.length < 3,
    tag: `life${i}`,
  });
  const a0 = usePhoneAsk(s, picks[0] ?? actor.n, lifeAsk(0), (_, a) => setOne(0, a.opts?.[0] === 'live'));
  const a1 = usePhoneAsk(s, picks[1] ?? actor.n, lifeAsk(1), (_, a) => setOne(1, a.opts?.[0] === 'live'));
  const a2 = usePhoneAsk(s, picks[2] ?? actor.n, lifeAsk(2), (_, a) => setOne(2, a.opts?.[0] === 'live'));
  const lifeWait = [a0, a1, a2].map((a, i) => (a.wait ? picks[i] : null)).filter((x): x is number => x !== null);
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他依次指三名玩家（死人也可以），你按顺序点出来。他也可以不选。', sleep]} />
          <SayBox lines={slotLines('alhadikhia', s.style)} title="小声说" />
        </>
      )}
      <SeatPicker
        s={s}
        selected={picks}
        max={3}
        onChange={(v) => {
          setPicks(v);
          setLive([null, null, null]);
        }}
        label="他按顺序指了谁？"
        ordered
        collapse="他按顺序指了"
      />
      {picks.length === 3 && (
        <Reveal key={picks.join()}>
          <SayBox title={ask.on ? '对所有人说' : '恶魔闭眼后，对所有人说（大家仍然闭眼）'} lines={[`恶魔选择了 ${seatsText(picks)}。`]} />
          <div className="card stack" style={{ gap: 10 }}>
            <b>{ask.on ? `三个人的手机上会同时问"活还是死"，选完自动填到下面${lifeWait.length ? `（还在等 ${seatsText(lifeWait)}）` : ''}。` : '依次轻拍，问"你选择活还是死？"点头 = 活，摇头 = 死；问完让他闭眼，再叫下一个。'}</b>
            {picks.map((n, i) => (
              <div key={n} className="qa-row">
                <span>
                  {i + 1}. {seatName(n)}
                  {seatOf(s, n).alive ? '' : <small className="dim">（已死）</small>}
                </span>
                <TwoChoice value={live[i]} onChange={(v) => setOne(i, v)} yes="点头：活" no="摇头：死" label={`${seatName(n)} 的选择`} />
              </div>
            ))}
          </div>
          {pv && (
            <div className={`card${pv.alive.some((a) => !a) ? ' card-evil' : ''}`}>
              <p>
                {bad
                  ? '哈迪寂亚中毒了：照常走完流程，但没有人会死，也没有人复活。'
                  : pv.allDie
                    ? '三人都选择活：三人都死！'
                    : `结果：${picks.map((n, i) => `${seatName(n)}${pv.alive[i] ? (seatOf(s, n).alive ? '活着' : '复活') : '死亡'}`).join('，')}。`}
              </p>
              <p className="dim">天亮时会宣布这三人谁活着、谁死了。</p>
            </div>
          )}
        </Reveal>
      )}
      <Tips role="alhadikhia" />
      {ask.on ? (
        <StepBar
          phone
          wait={ask.wait ?? (lifeWait.length ? `等 ${seatsText(lifeWait)} 在手机上选` : null)}
          ready={skip || ready}
          label={skip ? '他今晚不选，下一步' : ready ? '完成，下一步' : picks.length < 3 ? '先按顺序点出三个人' : '记下每个人的选择'}
          onDone={() => done(skip ? { kind: 'hadikhia', picks: [], live: [] } : { kind: 'hadikhia', picks, live: live as boolean[] })}
        />
      ) : (
        <BottomBar wide>
          {picks.length === 0 && (
            <ConfirmButton className="btn btn-ghost" label="他今晚不选" confirmLabel="再点一次确认" onConfirm={() => done({ kind: 'hadikhia', picks: [], live: [] })} />
          )}
          <button className="btn btn-primary grow" disabled={!ready} onClick={() => done({ kind: 'hadikhia', picks, live: live as boolean[] })}>
            {ready ? '完成，下一步' : picks.length < 3 ? '先按顺序点出三个人' : '记下每个人的选择'}
          </button>
        </BottomBar>
      )}
    </>
  );
}

function SweetheartStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const sw = s.seats.find((x) => x.role === 'sweetheart')!;
  const choices = useMemo(() => sweetheartChoices(s, stepRng(s)), [s]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const [manual, setManual] = useState<number[]>([]);
  const who = sel >= 0 ? choices[sel]?.value : manual[0];
  return (
    <>
      <p className="muted">心上人（{seatName(sw.n)}）死了：由你选一个人，他从现在起一直醉酒（他自己不知道）。</p>
      <ChoicePanel
        s={s}
        choices={choices}
        sel={sel}
        rec={rec}
        onSel={setSel}
        manual={<SeatPicker s={s} selected={manual} max={1} onChange={setManual} label="谁醉酒？" />}
        manualLabel="自己选"
      />
      <DoBox items={['不需要叫醒任何人。', '之后这个人的能力无效，给他的信息可以是假的，网页会提醒你。']} />
      <Tips role="sweetheart" />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!who} onClick={() => who && done({ kind: 'target', target: who })}>
          {who ? `完成：${seatName(who)} 从此醉酒` : '先选谁醉酒'}
        </button>
      </BottomBar>
    </>
  );
}

function BarberStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const barber = s.seats.find((x) => x.role === 'barber')!;
  const others = s.seats.filter((x) => x.n !== actor.n && teamOf(x.role) === 'demon').map((x) => x.n);
  const after = (i: number) => seatOf(s, t[1 - i]).role;
  const [skip, setSkip] = useState(false);
  const ask = usePhoneAsk(
    s, actor.n,
    { count: 2, title: '理发师死了：你可以选两个人交换角色（可以选自己）', lines: slotLines('barber', s.style), disabled: others, skip: '不换' },
    (ns, a) => {
      setT(ns);
      setSkip(!!a.skip);
    },
  );
  const phone = usePhoneSend(s, t.length === 2 ? t.map((n, i) => becomes(n, after(i), isEvil(seatOf(s, n)))) : []);
  if (ask.on && (t.length < 2 || phone.on))
    return (
      <>
        <p className="muted">理发师（{seatName(barber.n)}）死了：今晚恶魔可以选两个人交换角色（可以选他自己），阵营不变。</p>
        {ask.view}
        <SeatPicker s={s} selected={t} max={2} onChange={setT} disabled={others} label="他选了哪两个人？" />
        {t.length === 2 && <DoBox items={[sendTo(t, `两人手机上会显示各自的新角色（${t.map((n, i) => `${seatName(n)} 变成${roleName(after(i))}`).join('，')}），阵营不变。`)]} />}
        <Tips role="barber" />
        <StepBar
          phone
          send={phone}
          wait={ask.wait}
          ready={skip || t.length === 2}
          label={t.length === 2 ? '完成：交换他们的角色' : skip ? '他不换，下一步' : '先点出两个人'}
          onDone={() => done({ kind: 'barber', swap: t.length === 2 ? [t[0], t[1]] : null })}
        />
      </>
    );
  return (
    <>
      <p className="muted">理发师（{seatName(barber.n)}）死了：今晚恶魔可以选两个人交换角色（可以选他自己），阵营不变。</p>
      <DoBox items={[wake(actor.n), '点「给恶魔看」：理发师。问他要不要换；要换就让他指两个人。']} />
      <SayBox lines={slotLines('barber', s.style)} title="小声说" />
      <SeatPicker s={s} selected={t} max={2} onChange={setT} disabled={others} label="他指了哪两个人？（不换就直接点下面的按钮）" />
      {t.length === 2 && (
        <Reveal key={t.join()}>
          <DoBox
            title="然后"
            items={[
              '让恶魔闭眼。',
              ...t.map((n, i) => (
                <>
                  轻拍 <b>{seatName(n)}</b>，点「给 {seatName(n)} 看」：你现在是<b>【{roleName(after(i))}】</b>，你仍然是
                  {isEvil(seatOf(s, n)) ? '邪恶' : '善良'}阵营。再让他闭眼。
                </>
              )),
            ]}
          />
          <div className="row">
            {t.map((n, i) => (
              <button
                key={n}
                className="btn btn-ghost grow"
                onClick={() =>
                  ui.showCard({
                    title: '你现在是', big: [roleName(after(i))], team: ROLES[after(i)].team, alignment: isEvil(seatOf(s, n)) ? 'evil' : 'good',
                    ability: ROLES[after(i)].ability,
                  })
                }
              >
                <Icon name="eye" /> 给 {seatName(n)} 看
              </button>
            ))}
          </div>
        </Reveal>
      )}
      <Tips role="barber" />
      <BottomBar wide>
        <CardButton label="给恶魔看" onClick={() => ui.showCard({ title: '这个角色死了，你可以让两个人交换角色', big: ['理发师'] })} />
        <button className="btn btn-primary grow" disabled={t.length === 1} onClick={() => done({ kind: 'barber', swap: t.length === 2 ? [t[0], t[1]] : null })}>
          {t.length === 2 ? '完成：交换他们的角色' : '他不换，下一步'}
        </button>
      </BottomBar>
    </>
  );
}

function PlagueStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const ui = useUi();
  const pd = s.seats.find((x) => x.role === 'plaguedoctor')!;
  const choices = useMemo(() => plagueChoices(s, stepRng(s)), [s]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  const { to, baron, marionette } = c.value;
  usePoint(marionette ? [marionette] : []);
  const d = demonSeat(s);
  const items2: PhoneItem[] = to
    ? [infoTo(to, { title: '你获得了这个能力', big: ['间谍'], ability: ROLES.spy.ability })]
    : baron
      ? baron.map((b) => becomes(b.seat, b.role, false))
      : marionette && d
        ? [infoTo(d.n, { title: '这名玩家是你的提线木偶', big: [seatName(marionette)] })]
        : [];
  const phone = usePhoneSend(s, items2);
  const items: ReactNode[] = to
    ? [wake(to), '点「给他看」：你获得了间谍的能力，每晚可以看魔典。', sleep]
    : baron
      ? baron.flatMap((b) => [
          <>
            轻拍 <b>{seatName(b.seat)}</b>，点「给 {seatName(b.seat)} 看」：你现在是<b>【{roleName(b.role)}】</b>（仍然是善良的）。然后让他闭眼。
          </>,
        ])
      : marionette
        ? [
            `${seatName(marionette)} 不会被告知，他以为自己还是${roleName(seatOf(s, marionette).role)}。`,
            d ? wake(d.n) : '叫醒恶魔。',
            <>
              用手指向 <b>{seatName(marionette)}</b>，点「给恶魔看」：提线木偶。
            </>,
            sleep,
          ]
        : ['不需要叫醒任何人。', `从明晚起，网页会在${roleName(c.value.ability)}的位置提醒你自己选人。`];
  return (
    <>
      <p className="muted">瘟疫医生（{seatName(pd.n)}）死了：你（说书人）获得一个爪牙的能力，直到游戏结束。</p>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} moreLabel="换一个能力" />
      <DoBox items={phone.on ? [sendTo(items2.map((x) => x.n), '他们手机上会收到对应的消息。'), marionette ? `${seatName(marionette)} 不会被告知，他以为自己还是${roleName(seatOf(s, marionette).role)}。` : null] : items} />
      {baron && !phone.on && (
        <div className="row">
          {baron.map((b) => (
            <button key={b.seat} className="btn btn-ghost grow" onClick={() => ui.showCard({ title: '你现在是', big: [roleName(b.role)], team: 'outsider', ability: ROLES[b.role].ability })}>
              <Icon name="eye" /> 给 {seatName(b.seat)} 看
            </button>
          ))}
        </div>
      )}
      <Tips role="plaguedoctor" />
      <StepBar phone={phone.on} send={phone} onDone={() => done({ kind: 'plague', ...c.value })}>
        {to && <CardButton onClick={() => ui.showCard({ title: '你获得了这个能力', big: ['间谍'], ability: ROLES.spy.ability })} />}
        {marionette && <CardButton label="给恶魔看" onClick={() => ui.showCard({ title: '这名玩家是你的', big: ['提线木偶'] })} />}
      </StepBar>
    </>
  );
}

/* ---------------- 暗月初升 ---------------- */

/** 莽夫变了阵营：先叫醒他告知，确认后才能继续 */
function GoonInformSheet({ g }: { g: Game }) {
  const s = g.s;
  const gi = s.ns!.goonInform!;
  const ok = () => g.commit((st) => goonInformed(st));
  const phone = usePhoneSend(s, [infoTo(gi.seat, { title: '你的阵营变了，你现在是', big: [gi.evil ? '邪恶阵营' : '善良阵营'] }, undefined, 'goon')]);
  if (phone.on)
    return (
      <Sheet title="莽夫变了阵营：发到他手机上" onClose={() => !phone.unread.length && ok()}>
        <div className="stack">
          <DoBox items={[sendTo([gi.seat], `他手机上会显示"你现在是${gi.evil ? '邪恶' : '善良'}阵营"。`)]} />
          <button
            className="btn btn-primary btn-block"
            disabled={phone.busy || (!phone.unsent.length && phone.unread.length > 0)}
            onClick={() => (phone.unsent.length ? phone.sendAll() : ok())}
          >
            {phone.unsent.length ? `发给 ${seatName(gi.seat)}` : phone.unread.length ? `等 ${seatName(gi.seat)} 看完` : '他看完了，继续'}
          </button>
        </div>
      </Sheet>
    );
  return (
    <Sheet title="莽夫变了阵营：现在叫醒他" onClose={ok}>
      <div className="stack">
        <DoBox
          items={[
            wake(gi.seat),
            <>
              大拇指<b>{gi.evil ? '向下' : '向上'}</b>：告诉他"你现在是{gi.evil ? '邪恶' : '善良'}阵营"。
            </>,
            sleep,
          ]}
        />
        <button className="btn btn-primary btn-block" onClick={ok}>
          已经告诉他了，继续
        </button>
      </div>
    </Sheet>
  );
}

/** 莽夫：今晚第一个用能力选他的人醉酒（这次能力无效），莽夫变成他的阵营 */
function GoonNote({ s, actor, picks, slot }: { s: GameState; actor?: Seat; picks: number[]; slot: SlotId }) {
  const goon = goonTriggered(s, actor, picks, slot);
  if (!goon || !actor) return null;
  const flip = isEvil(goon) !== isEvil(actor);
  return (
    <div className="card card-warn stack" style={{ gap: 6 }}>
      <b style={{ color: 'var(--warn)' }}>{seatName(goon.n)} 是莽夫：{seatName(actor.n)} 今晚第一个选了他</b>
      <p>{seatName(actor.n)} 当场醉酒到明天黄昏，这次能力无效（照常走流程，别露馅）。</p>
      {flip && (
        <p>
          莽夫变成<b>{isEvil(actor) ? '邪恶' : '善良'}</b>阵营：这一步结束后轻拍 {seatName(goon.n)}，大拇指{isEvil(actor) ? '向下' : '向上'}告诉他现在的阵营。
        </p>
      )}
    </div>
  );
}

function SailorStep({ g, s, actor }: StepProps) {
  const [t, setT] = useState<number[]>([]);
  const blocked = s.seats.filter((x) => !x.alive).map((x) => x.n);
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: roleName('sailor'), lines: slotLines('sailor', s.style), disabled: blocked }, setT);
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他指一名存活玩家，你在下面点出来。', sleep]} />
          <SayBox lines={slotLines('sailor', s.style)} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={blocked} label="他指了谁？" />
      <GoonNote s={s} actor={actor} picks={t} slot="sailor" />
      {t.length ? (
        <Reveal key={t[0]}>
          <SailorAnswer g={g} s={s} actor={actor} target={t[0]} wait={ask.wait} />
        </Reveal>
      ) : (
        <>
          <Tips role="sailor" drunk={actor.role === 'drunk'} />
          <Pending text={ask.wait ?? '先点出他指的人'} />
        </>
      )}
    </>
  );
}

function SailorAnswer({ g, s, actor, target, wait }: StepProps & { target: number; wait: string | null }) {
  const done = useDone(g);
  const choices = useMemo(() => sailorDrunkChoices(s, actor.n, target), [s, actor.n, target]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, target)), [choices, s, target]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  const bad = malfunction(s, actor.n) || !!goonTriggered(s, actor, [target], 'sailor');
  return (
    <>
      {bad ? (
        <p className="dim">水手中毒/醉酒（或被莽夫灌醉）：照常走流程，但没有人会因为水手醉酒。</p>
      ) : (
        <>
          <div className="dim">谁醉酒到明天黄昏？（不告诉任何人）</div>
          <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
        </>
      )}
      <Tips role="sailor" drunk={actor.role === 'drunk'} />
      <StepBar phone={false} wait={wait} label={bad ? '完成，下一步（水手这次无效）' : `完成：${seatName(c.value)} 醉酒，下一步`} onDone={() => done({ kind: 'sailor', target, drunk: c.value })} />
    </>
  );
}

function InnkeeperStep({ g, s, actor }: StepProps) {
  const [t, setT] = useState<number[]>([]);
  const ask = usePhoneAsk(s, actor.n, { count: 2, title: roleName('innkeeper'), lines: slotLines('innkeeper', s.style) }, setT);
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他指两名玩家，你在下面点出来。', sleep]} />
          <SayBox lines={slotLines('innkeeper', s.style)} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={t} max={2} onChange={setT} label="他指了哪两个人？" />
      <GoonNote s={s} actor={actor} picks={t} slot="innkeeper" />
      {t.length === 2 ? (
        <Reveal key={[...t].sort().join()}>
          <InnkeeperAnswer g={g} s={s} actor={actor} picks={t as [number, number]} wait={ask.wait} />
        </Reveal>
      ) : (
        <>
          <Tips role="innkeeper" drunk={actor.role === 'drunk'} />
          <Pending text={ask.wait ?? '先点出他指的两个人'} />
        </>
      )}
    </>
  );
}

function InnkeeperAnswer({ g, s, actor, picks, wait }: StepProps & { picks: [number, number]; wait: string | null }) {
  const done = useDone(g);
  const choices = useMemo(() => innkeeperDrunkChoices(s, picks), [s, picks]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, picks[0] * 7 + picks[1])), [choices, s, picks]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  return (
    <>
      <p className="muted">{seatsText(picks)} 今晚都不会死（任何原因）。其中一人醉酒到明天黄昏：</p>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      {(malfunction(s, actor.n) || !!goonTriggered(s, actor, picks, 'innkeeper')) && <p className="dim">旅店老板中毒/醉酒（或被莽夫灌醉）：保护无效，也没有人会醉酒。</p>}
      <Tips role="innkeeper" drunk={actor.role === 'drunk'} />
      <StepBar phone={false} wait={wait} label={`完成：保护 ${seatsText(picks)}，${seatName(c.value)} 醉酒`} onDone={() => done({ kind: 'innkeeper', picks, drunk: c.value })} />
    </>
  );
}

/** 角色表：按类型分组点选一个角色 */
function RolePick({ s, value, onPick, compact = false }: { s: GameState; value: RoleId | null; onPick: (r: RoleId) => void; compact?: boolean }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {(['townsfolk', 'outsider', 'minion', 'demon'] as const).map((t) => (
        <div key={t}>
          <div className="dim">{TEAM_NAME[t]}</div>
          <div className={`role-grid${compact ? ' compact' : ''}`}>
            {scriptOf(s)
              .roles.filter((r) => ROLES[r].team === t)
              .map((r) => (
                <button key={r} className={`role-chip${t === 'minion' || t === 'demon' ? ' evil-c' : ''}`} style={value === r ? { boxShadow: '0 0 0 2px var(--gold) inset' } : undefined} onClick={() => onPick(r)}>
                  {roleName(r)}
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CourtierStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const [use, setUse] = useState<boolean | null>(null);
  const [role, setRole] = useState<RoleId | null>(null);
  const target = role ? s.seats.find((x) => x.role === role) : undefined;
  const ask = usePhoneAsk(s, actor.n, { count: 0, title: roleName('courtier'), lines: slotLines('courtier', s.style), opts: roleOpts(scriptOf(s).roles), skip: '今晚不用（整局一次）' }, (_, a) => {
    setUse(!a.skip);
    setRole((a.opts?.[0] as RoleId) ?? null);
  });
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '问他今晚要不要用能力（整局一次）。要用就让他在角色表上指一个角色。', sleep]} />
          <SayBox lines={slotLines('courtier', s.style)} title="小声说" />
        </>
      )}
      <TwoChoice value={use} onChange={setUse} yes="他要用" no="他不用（摇头）" />
      {use && <RolePick s={s} value={role} onPick={setRole} compact />}
      {use && role && (
        <div className="card">
          <p>
            {malfunction(s, actor.n)
              ? '他中毒/醉酒：照常走流程，但没有效果（能力用掉了）。'
              : target
                ? `${seatName(target.n)}（${roleName(role)}）从今晚起醉酒三个夜晚、三个白天。`
                : `【${roleName(role)}】不在场：什么都不会发生，能力用掉了。`}
          </p>
        </div>
      )}
      <Tips role="courtier" drunk={actor.role === 'drunk'} />
      <StepBar
        phone={ask.on}
        wait={ask.wait}
        ready={use === false || (!!use && !!role)}
        label={use === false ? '他不用，下一步' : use && role ? '完成，下一步' : use ? '先点出他指的角色' : '先问他用不用'}
        onDone={() => done({ kind: 'courtier', role: use ? role : null })}
      />
    </>
  );
}

function GamblerStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const [t, setT] = useState<number[]>([]);
  const [role, setRole] = useState<RoleId | null>(null);
  const right = t.length && role ? seatOf(s, t[0]).role === role : null;
  const bad = malfunction(s, actor.n) || !!goonTriggered(s, actor, t, 'gambler');
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: '赌徒：选一名玩家，再猜他的角色', lines: slotLines('gambler', s.style), disabled: [actor.n], opts: roleOpts(scriptOf(s).roles) }, (ns, a) => {
    setT(ns);
    setRole((a.opts?.[0] as RoleId) ?? null);
  });
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他指一名玩家，再在角色表上指一个角色。你在下面点出来。', sleep]} />
          <SayBox lines={slotLines('gambler', s.style)} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={[actor.n]} label="他指了谁？" collapse="他指了" />
      <GoonNote s={s} actor={actor} picks={t} slot="gambler" />
      {t.length > 0 && (
        <Reveal key={t[0]}>
          <RolePick s={s} value={role} onPick={setRole} compact />
        </Reveal>
      )}
      {right !== null && (
        <Reveal key={`${t[0]}-${role}`}>
          <div className={`card${right ? '' : ' card-evil'}`}>
            <p>
              {right
                ? `猜对了：${seatName(t[0])} 就是${roleName(role!)}，什么都不会发生。`
                : bad
                  ? `猜错了（他其实是${roleName(seatOf(s, t[0]).role)}），但赌徒中毒/醉酒：他不会死。`
                  : `猜错了（他其实是${roleName(seatOf(s, t[0]).role)}）：赌徒今晚死亡。`}
            </p>
            <p className="dim">不要告诉他猜得对不对，天亮宣布死讯就好。</p>
          </div>
        </Reveal>
      )}
      <Tips role="gambler" drunk={actor.role === 'drunk'} />
      <StepBar phone={ask.on} wait={ask.wait} ready={right !== null} label={right === null ? '先点出他指的人和角色' : '完成，下一步'} onDone={() => role && done({ kind: 'gambler', target: t[0], role })} />
    </>
  );
}

function GrandmotherStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const choices = useMemo(() => grandmotherChoices(s, actor.n, stepRng(s)), [s, actor.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  usePoint(c ? [c.value.seat] : []);
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, c ? [infoTo(actor.n, { title: `你的孙子是 ${seatName(c.value.seat)}，他的角色是`, big: [roleName(c.value.role)] }, slotLines('grandmother', s.style))] : []);
  if (phoneOn)
    return (
      <>
        <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
        <DoBox items={[c ? sendTo([actor.n], `她手机上会显示孙子是 ${seatName(c.value.seat)}（${roleName(c.value.role)}）。`) : null]} />
        <Tips role="grandmother" drunk={actor.role === 'drunk'} />
        <StepBar phone send={phone} ready={!!c} onDone={() => c && done({ kind: 'grandmother', seat: c.value.seat, role: c.value.role, truth: c.truth })} />
      </>
    );
  return (
    <>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox
        items={[
          wake(actor.n),
          c ? (
            <>
              用手指向 <b>{seatName(c.value.seat)}</b>，点「给他看」：<b>【{roleName(c.value.role)}】</b>。这是她的孙子。
            </>
          ) : null,
          sleep,
        ]}
      />
      <SayBox lines={slotLines('grandmother', s.style)} title="小声说" />
      <Tips role="grandmother" drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        {c && <CardButton onClick={() => ui.showCard(roleCard(c.value.role, '你的孙子是这个角色'))} />}
        <button className="btn btn-primary grow" disabled={!c} onClick={() => c && done({ kind: 'grandmother', seat: c.value.seat, role: c.value.role, truth: c.truth })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

function PukkaStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const [t, setT] = useState<number[]>([]);
  const prev = s.night > 1 ? s.pukkaPoison : null;
  const bad = malfunction(s, actor.n) || !!goonTriggered(s, actor, t, 'pukka');
  const pv = prev !== null ? killPreview(s, prev) : null;
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: roleName('pukka'), lines: slotLines('pukka', s.style) }, setT);
  return (
    <>
      {prev !== null && pv && (
        <div className={`card${pv.dies && !bad ? ' card-evil' : ''}`}>
          <b>上一个被普卡毒的 {seatName(prev)}：</b>
          <p>{bad ? '普卡今晚中毒/醉酒：他不会死，也不会有新的人中毒。' : pv.text}</p>
        </div>
      )}
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他指一名玩家（这个人中毒，下一晚死）。你在下面点出来。', sleep]} />
          <SayBox lines={slotLines('pukka', s.style)} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={t} max={1} onChange={setT} label="他指了谁？" />
      <GoonNote s={s} actor={actor} picks={t} slot="pukka" />
      {s.night === 1 && <p className="dim">第一晚只下毒，没有人会死。</p>}
      <Tips role="pukka" />
      <StepBar
        phone={ask.on}
        wait={ask.wait}
        ready={t.length > 0}
        label={t.length ? (bad ? `确认：他指了 ${seatName(t[0])}（今晚无效），下一步` : `确认：${seatName(t[0])} 中毒，下一步`) : '先点出他指的人'}
        onDone={() => done({ kind: 'target', target: t[0] })}
      />
    </>
  );
}

function ShabalothStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const [t, setT] = useState<number[]>([]);
  const bad = malfunction(s, actor.n) || !!goonTriggered(s, actor, t, 'shabaloth');
  const choices = useMemo(() => shabalothReviveChoices(s), [s]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 3)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const revive = choices[sel]?.value ?? null;
  const ask = usePhoneAsk(s, actor.n, { count: 2, title: roleName('shabaloth'), lines: slotLines('shabaloth', s.style) }, setT);
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他指两名玩家，你在下面点出来。', sleep]} />
          <SayBox lines={slotLines('shabaloth', s.style)} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={t} max={2} onChange={setT} label="他要杀哪两个人？" />
      <GoonNote s={s} actor={actor} picks={t} slot="shabaloth" />
      {t.length === 2 && (
        <Reveal key={[...t].sort().join()}>
          <div className={`card${bad ? '' : ' card-evil'}`}>
            {bad ? <p>沙巴洛斯中毒/醉酒：没有人会死。</p> : t.map((n) => <p key={n}>{killPreview(s, n).text}</p>)}
          </div>
        </Reveal>
      )}
      {choices.length > 0 && (
        <>
          <div className="dim">上一晚他吃掉的人里，要不要吐出一个复活？</div>
          <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} moreLabel="要不要复活" />
        </>
      )}
      <Tips role="shabaloth" />
      <StepBar
        phone={ask.on}
        wait={ask.wait}
        ready={t.length === 2}
        label={t.length < 2 ? '先点出他指的两个人' : `完成${revive ? `：${seatName(revive)} 复活` : ''}，下一步`}
        onDone={() => done({ kind: 'shabaloth', picks: t, revive })}
      />
    </>
  );
}

function PoStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const [t, setT] = useState<number[]>([]);
  const need = s.poCharged ? 3 : 1;
  const bad = malfunction(s, actor.n) || !!goonTriggered(s, actor, t, 'po');
  const poLines = s.poCharged ? (s.style === 'simple' ? ['请选择三名玩家，他们会死亡。'] : ['珀积蓄了一整晚的力量……选出三个人吧。']) : slotLines('po', s.style);
  const [skip, setSkip] = useState(false);
  const ask = usePhoneAsk(s, actor.n, { count: need, title: roleName('po'), lines: poLines, skip: s.poCharged ? undefined : '今晚不选（下一晚可以选三个）' }, (ns, a) => {
    setT(ns);
    setSkip(!!a.skip);
  });
  return (
    <>
      {s.poCharged && (
        <div className="card card-evil">
          <b>他上次没有选人：今晚要选三名玩家，他们都会死。</b>
        </div>
      )}
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), s.poCharged ? '让他指三名玩家，你在下面点出来。' : '让他指一名玩家；他也可以不选（下一晚就能选三个）。', sleep]} />
          <SayBox lines={poLines} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={t} max={need} onChange={setT} label={s.poCharged ? '他要杀哪三个人？' : '他要杀谁？'} />
      <GoonNote s={s} actor={actor} picks={t} slot="po" />
      {t.length === need && (
        <Reveal key={[...t].sort().join()}>
          <div className={`card${bad ? '' : ' card-evil'}`}>{bad ? <p>珀中毒/醉酒：没有人会死。</p> : t.map((n) => <p key={n}>{killPreview(s, n).text}</p>)}</div>
        </Reveal>
      )}
      <Tips role="po" />
      {ask.on ? (
        <StepBar
          phone
          wait={ask.wait}
          ready={skip || t.length === need}
          label={skip ? '他今晚不选，下一步' : t.length === need ? '完成，下一步' : `先点出他指的${need === 3 ? '三个' : ''}人`}
          onDone={() => done({ kind: 'po', picks: skip ? [] : t })}
        />
      ) : (
      <BottomBar wide>
        {!s.poCharged && t.length === 0 && (
          <ConfirmButton className="btn btn-ghost" label="他今晚不选" confirmLabel="再点一次确认" onConfirm={() => done({ kind: 'po', picks: [] })} />
        )}
        <button className="btn btn-primary grow" disabled={t.length !== need} onClick={() => done({ kind: 'po', picks: t })}>
          {t.length === need ? '完成，下一步' : `先点出他指的${need === 3 ? '三个' : ''}人`}
        </button>
      </BottomBar>
      )}
    </>
  );
}

/** 刺客 / 教授：整局一次，先问用不用 */
function OnceTargetStep({ g, s, actor, slot }: StepProps & { slot: 'assassin' | 'professor' }) {
  const done = useDone(g);
  const [use, setUse] = useState<boolean | null>(null);
  const [t, setT] = useState<number[]>([]);
  const prof = slot === 'professor';
  const blocked = prof ? s.seats.filter((x) => x.alive).map((x) => x.n) : [];
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: roleName(slot), lines: slotLines(slot, s.style), disabled: blocked, skip: '今晚不用（整局一次）' }, (ns, a) => {
    setUse(!a.skip);
    setT(ns);
  });
  const bad = malfunction(s, actor.n) || !!goonTriggered(s, actor, t, slot);
  const x = t.length ? seatOf(s, t[0]) : null;
  const result = !x
    ? null
    : bad
      ? '他中毒/醉酒：照常走流程，但没有效果（能力用掉了）。'
      : prof
        ? teamOf(x.role) === 'townsfolk'
          ? `${seatName(x.n)}（${roleName(x.role)}）是镇民：他复活了！天亮宣布。`
          : `${seatName(x.n)} 不是镇民：什么都不会发生，能力用掉了。`
        : x.alive
          ? `${seatLabel(s, x.n)} 死亡（刺客无视一切保护）。`
          : `${seatName(x.n)} 已经死了，什么都不会发生，能力用掉了。`;
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), `问他今晚要不要用能力（整局一次）。要用就让他指${prof ? '一名死去的玩家' : '一名玩家'}。`, sleep]} />
          <SayBox lines={slotLines(slot, s.style)} title="小声说" />
        </>
      )}
      <TwoChoice value={use} onChange={setUse} yes="他要用" no="他不用（摇头）" />
      {use && <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={blocked} label={prof ? '他指了哪个死人？' : '他指了谁？'} />}
      {use && <GoonNote s={s} actor={actor} picks={t} slot={slot} />}
      {use && result && (
        <div className={`card${!prof && x?.alive && !bad ? ' card-evil' : ''}`}>
          <p>{result}</p>
        </div>
      )}
      <Tips role={slot} />
      <StepBar
        phone={ask.on}
        wait={ask.wait}
        ready={use === false || (!!use && t.length > 0)}
        label={use === false ? '他不用，下一步' : use && t.length ? '完成，下一步（能力用掉了）' : use ? '先点出他指的人' : '先问他用不用'}
        onDone={() => done(use ? { kind: 'target', target: t[0] } : { kind: 'none' })}
      />
    </>
  );
}

function GossipStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const choices = useMemo(() => lilKillChoices(s, stepRng(s, 5)), [s]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 6)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const [manual, setManual] = useState<number[]>([]);
  const who = sel >= 0 ? choices[sel]?.value : manual[0];
  const pv = who ? killPreview(s, who) : null;
  return (
    <>
      <p className="muted">造谣者今天白天的声明是真的：今晚由你决定一名玩家死亡。不用叫醒任何人。</p>
      <ChoicePanel
        s={s}
        choices={choices}
        sel={sel}
        rec={rec}
        onSel={setSel}
        manual={<SeatPicker s={s} selected={manual} max={1} onChange={setManual} disabled={s.seats.filter((x) => !x.alive).map((x) => x.n)} label="你决定谁死？" />}
        manualLabel="自己选"
      />
      {pv && !pv.dies && <p className="dim">{pv.text}</p>}
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!who} onClick={() => who && done({ kind: 'target', target: who })}>
          {who ? (pv && !pv.dies ? `完成：${seatName(who)} 死不了，今晚没人死` : `完成：${seatName(who)} 死亡`) : '先选谁死'}
        </button>
      </BottomBar>
    </>
  );
}

function TinkerStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const t = s.seats.find((x) => x.role === 'tinker' && x.alive)!;
  const choices = useMemo(() => tinkerChoices(s), [s]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 7)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  return (
    <>
      <p className="muted">修补匠（{seatName(t.n)}）随时可能死：由你决定今晚要不要让他死。不用叫醒任何人。</p>
      {!killPreview(s, t.n).dies && <p className="dim">{killPreview(s, t.n).text}</p>}
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} moreLabel="换一个决定" />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'yesno', yes: c.value, truth: true })}>
          {c.value ? `完成：${seatName(t.n)} 今晚死亡` : '完成：他今晚不死'}
        </button>
      </BottomBar>
    </>
  );
}

function MoonchildStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const mc = s.seats.find((x) => x.role === 'moonchild');
  const pick = s.moonchildPick!;
  const x = seatOf(s, pick);
  const dies = !!mc && !malfunction(s, mc.n) && x.alive && !isEvil(x);
  const pv = dies ? killPreview(s, pick) : null;
  return (
    <>
      <p className="muted">
        月之子（{seatName(mc?.n)}）白天选了 {seatLabel(s, pick)}。
      </p>
      <div className={`card${dies && pv?.dies ? ' card-evil' : ''}`}>
        <p>
          {dies ? (pv?.dies ? `${seatName(pick)} 是善良的：今晚死亡。` : pv?.text) : isEvil(x) ? `${seatName(pick)} 是邪恶的：什么都不会发生。` : '月之子中毒/醉酒，或那人已经死了：什么都不会发生。'}
        </p>
      </div>
      <DoBox items={['不需要叫醒任何人。', '天亮时统一宣布死讯。']} />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 梦殒春宵 ---------------- */

/** 只列这些角色的角色表（可以给某些角色写上为什么不能选） */
function RoleGrid({ roles, value, onPick, why }: { roles: RoleId[]; value: RoleId | null; onPick: (r: RoleId) => void; why?: (r: RoleId) => string | null }) {
  return (
    <div className="role-grid compact">
      {roles.map((r) => {
        const no = why?.(r) ?? null;
        return (
          <button
            key={r}
            className={`role-chip${teamOf(r) === 'minion' || teamOf(r) === 'demon' ? ' evil-c' : ''}`}
            style={{ ...(value === r ? { boxShadow: '0 0 0 2px var(--gold) inset' } : {}), ...(no ? { opacity: 0.45 } : {}) }}
            onClick={() => onPick(r)}
          >
            {roleName(r)}
          </button>
        );
      })}
    </div>
  );
}

const goodRolesOf = (s: GameState, not: RoleId[] = []) =>
  scriptOf(s).roles.filter((r) => (teamOf(r) === 'townsfolk' || teamOf(r) === 'outsider') && !not.includes(r));

/** 比数字的步骤：钟表匠 / 数学家 / 神谕者 / 杂耍艺人。truths = 健康时可以给的数字；strict = 手动时按它限制 */
function CountStep({
  g, s, actor, kind, choices, truths, strict = true, context,
}: StepProps & { kind: 'clockmaker' | 'mathematician' | 'oracle' | 'juggler'; choices: Choice<number>[]; truths: number[]; strict?: boolean; context?: ReactNode }) {
  const done = useDone(g);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const [mNum, setMNum] = useState<number | null>(null);
  const lie = mustLie(s, kind);
  const healthy = !malfunction(s, actor.n) && !lie;
  const value = sel >= 0 ? choices[sel]?.value : mNum;
  const truth = sel >= 0 ? !!choices[sel]?.truth : mNum !== null && truths.includes(mNum);
  const twist = sel >= 0 ? !!choices[sel]?.twist : false;
  const top = Math.max(7, ...choices.map((c) => c.value), ...truths);
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, value !== null && value !== undefined ? [infoTo(actor.n, { big: [String(value)] }, slotLines(kind, s.style))] : []);
  const manual = (
    <div className="big-num-grid">
      {Array.from({ length: top + 1 }, (_, n) => (
        <button
          key={n}
          className={`btn ${mNum === n ? 'btn-primary' : 'btn-ghost'}`}
          disabled={strict && (healthy ? !truths.includes(n) : lie ? truths.includes(n) : false)}
          onClick={() => setMNum(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
  return (
    <>
      {context}
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={setSel} manual={manual} manualLabel="手动选数字" />
      {phoneOn ? (
        <DoBox items={[sendTo([actor.n], '他手机上会显示这个数字。')]} />
      ) : (
        <>
          <DoBox
            items={[
              wake(actor.n),
              value !== null && value !== undefined ? (
                <>
                  伸出 <b>{value}</b> 根手指{value === 0 ? '（握拳）' : ''}。
                </>
              ) : null,
              sleep,
            ]}
          />
          <SayBox lines={slotLines(kind, s.style)} title="小声说" />
        </>
      )}
      <Tips role={kind} drunk={actor.role === 'drunk'} />
      <StepBar phone={phoneOn} send={phone} ready={value !== null && value !== undefined} onDone={() => done({ kind: 'number', num: value!, truth, twist })} />
    </>
  );
}

function ClockmakerStep({ g, s, actor }: StepProps) {
  const choices = useMemo(() => clockmakerChoices(s, actor.n), [s, actor.n]);
  const d = demonSeat(s);
  const minions = s.seats.filter((x) => !x.traveller && teamOf(x.role) === 'minion');
  const base = clockmakerCount(s);
  const truths = choices.filter((c) => c.truth).map((c) => c.value);
  usePoint(d ? [d.n] : []);
  return (
    <CountStep
      g={g} s={s} actor={actor} kind="clockmaker" choices={choices} truths={truths.length ? truths : [base]}
      context={
        <p className="muted">
          恶魔 {seatName(d?.n)}，爪牙 {minions.map((x) => seatName(x.n)).join('、') || '无'}：最近的隔 <b>{base}</b> 步（挨着坐算 1）。
        </p>
      }
    />
  );
}

function MathStep({ g, s, actor }: StepProps) {
  const choices = useMemo(() => mathChoices(s, actor.n), [s, actor.n]);
  const list = s.abnormal.filter((a) => a.seat !== actor.n);
  const base = new Set(list.map((a) => a.seat)).size;
  return (
    <CountStep
      g={g} s={s} actor={actor} kind="mathematician" choices={choices} truths={[base]} strict={false}
      context={
        <div className="card stack" style={{ gap: 6 }}>
          <b>从今天天亮到现在，网页记到 {base} 人的能力没正常生效</b>
          {list.length ? list.map((a) => <p key={`${a.seat}-${a.why}`} className="dim">· {a.why}</p>) : <p className="dim">没有记到。</p>}
          <p className="dim">白天的能力（例如中毒的人开枪、被诅咒的人没死）网页可能记不全：想起来漏了，就点"手动选数字"自己给。</p>
        </div>
      }
    />
  );
}

function OracleStep({ g, s, actor }: StepProps) {
  const choices = useMemo(() => oracleChoices(s, actor.n), [s, actor.n]);
  const dead = s.seats.filter((x) => !x.alive && !x.left);
  const truths = choices.filter((c) => c.truth).map((c) => c.value);
  return (
    <CountStep
      g={g} s={s} actor={actor} kind="oracle" choices={choices} truths={truths.length ? truths : [dead.filter(isEvil).length]}
      context={
        <p className="muted">
          死去的玩家：{dead.length ? dead.map((x) => `${seatName(x.n)}（${isEvil(x) ? '邪恶' : '善良'}）`).join('、') : '还没有'}。
        </p>
      }
    />
  );
}

function JugglerStep({ g, s, actor }: StepProps) {
  const choices = useMemo(() => jugglerChoices(s, actor.n), [s, actor.n]);
  const j = s.juggler;
  return (
    <CountStep
      g={g} s={s} actor={actor} kind="juggler" choices={choices} truths={[j?.correct ?? 0]}
      context={
        <p className="muted">
          今天他公开猜了：{j?.guesses?.map((x) => `${seatName(x.seat)}是${roleName(x.role)}${seatOf(s, x.seat).role === x.role ? '✓' : '✗'}`).join('，') || '没有猜'}。网页记的是猜对 {j?.correct ?? 0} 个。
        </p>
      }
    />
  );
}

function TownCrierStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const choices = useMemo(() => towncrierChoices(s, actor.n), [s, actor.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  const yes = s.minionNominatedDay === s.night - 1;
  const set = (v: boolean) => g.commit((st) => (st.minionNominatedDay = v ? st.night - 1 : 0));
  const minions = s.seats.filter((x) => !x.traveller && teamOf(x.role) === 'minion');
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, [infoTo(actor.n, { title: '今天有没有爪牙提名过', big: [c.value ? '有' : '没有'] }, slotLines('towncrier', s.style))]);
  return (
    <>
      <div className="card stack" style={{ gap: 8 }}>
        <b>今天白天有没有爪牙提名过？（爪牙：{minions.map((x) => seatName(x.n)).join('、') || '无'}）</b>
        <p className="dim">白天记下的是"{yes ? '有' : '没有'}"。记错了就在这里改。</p>
        <TwoChoice value={yes} onChange={set} yes="有" no="没有" />
      </div>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      {phoneOn ? (
        <DoBox items={[sendTo([actor.n], `他手机上会显示"${c.value ? '有' : '没有'}"。`)]} />
      ) : (
        <>
          <DoBox items={[wake(actor.n), c.value ? <><b>点头</b>：今天有爪牙提名过。</> : <><b>摇头</b>：今天没有爪牙提名。</>, sleep]} />
          <SayBox lines={slotLines('towncrier', s.style)} title="小声说" />
        </>
      )}
      <Tips role="towncrier" drunk={actor.role === 'drunk'} />
      <StepBar phone={phoneOn} send={phone} onDone={() => done({ kind: 'yesno', yes: c.value, truth: c.truth })} />
    </>
  );
}

function SageStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const choices = useMemo(() => sageChoices(s, actor.n, stepRng(s)), [s, actor.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const [man, setMan] = useState<number[]>([]);
  const d = demonSeat(s);
  const healthy = !malfunction(s, actor.n) && !mustLie(s, 'sage');
  const picks: [number, number] | null = sel >= 0 ? (choices[sel]?.value ?? null) : man.length === 2 ? [Math.min(...man), Math.max(...man)] : null;
  const truth = sel >= 0 ? !!choices[sel]?.truth : !!picks && !!d && picks.includes(d.n);
  const illegal = sel === -1 && !!picks && (healthy ? !truth : mustLie(s, 'sage') && truth);
  usePoint(picks ?? []);
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, picks ? [infoTo(actor.n, { title: '这两人之中有一个是恶魔', big: picks.map(seatName) }, slotLines('sage', s.style))] : []);
  return (
    <>
      <p className="muted">贤者（{seatName(actor.n)}）今晚被恶魔杀死：叫醒他，指两个人，其中一个是恶魔（{seatName(d?.n)}）。</p>
      <ChoicePanel
        s={s} choices={choices} sel={sel} rec={rec} onSel={setSel}
        manual={
          <div className="stack" style={{ gap: 8 }}>
            <SeatPicker s={s} selected={man} max={2} onChange={setMan} disabled={[actor.n]} label="指哪两个人？" />
            {illegal && <p className="evil">{healthy ? '他没有中毒也不是酒鬼：两个人里必须有恶魔。' : '涡流在场，必须给假信息。'}</p>}
          </div>
        }
      />
      {phoneOn ? (
        <DoBox items={[picks ? sendTo([actor.n], `他手机上会显示 ${seatsText(picks)}。`) : null]} />
      ) : (
        <>
          <DoBox
            items={[
              wake(actor.n),
              picks ? (
                <>
                  用手指向 <b>{seatName(picks[0])}</b> 和 <b>{seatName(picks[1])}</b>。
                </>
              ) : null,
              sleep,
            ]}
          />
          <SayBox lines={slotLines('sage', s.style)} title="小声说" />
        </>
      )}
      <Tips role="sage" drunk={actor.role === 'drunk'} />
      <StepBar phone={phoneOn} send={phone} ready={!!picks && !illegal} onDone={() => picks && done({ kind: 'sage', picks, truth })} />
    </>
  );
}


function SnakeStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const x = t.length ? seatOf(s, t[0]) : null;
  const bad = malfunction(s, actor.n) || !!goonTriggered(s, actor, t, 'snakecharmer');
  const isDemon = !!x && teamOf(x.role) === 'demon';
  const hit = isDemon && !bad;
  const dead = s.seats.filter((y) => !y.alive).map((y) => y.n);
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: roleName('snakecharmer'), lines: slotLines('snakecharmer', s.style), disabled: dead }, setT);
  const phone = usePhoneSend(s, hit && x ? [becomes(actor.n, x.role, true), becomes(x.n, 'snakecharmer', false)] : []);
  const viaPhone = ask.on && (!hit || phone.on);
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他用手指向一名活着的玩家，你在下面点出来。']} />
          <SayBox lines={slotLines('snakecharmer', s.style)} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={dead} label="他指了谁？" />
      <GoonNote s={s} actor={actor} picks={t} slot="snakecharmer" />
      {x && (
        <Reveal key={x.n}>
          <div className={`card${hit ? ' card-evil' : ''}`}>
            <p>
              {hit
                ? `${seatName(x.n)} 是恶魔（${roleName(x.role)}）！两人交换角色和阵营：${seatName(actor.n)} 变成邪恶的${roleName(x.role)}，${seatName(x.n)} 变成善良的舞蛇人并一直中毒。`
                : isDemon
                  ? `${seatName(x.n)} 是恶魔，但舞蛇人中毒/醉酒：什么都不会发生。`
                  : `${seatName(x.n)} 不是恶魔：什么都不会发生。`}
            </p>
          </div>
          <DoBox
            title="然后"
            items={
              viaPhone
                ? hit
                  ? [sendTo([actor.n, x.n], `${seatName(actor.n)} 手机上显示"你现在是${roleName(x.role)}（邪恶）"，${seatName(x.n)} 显示"你现在是舞蛇人（善良）"（不告诉他中毒）。`)]
                  : ['什么都不用告诉他。']
                : hit
                ? [
                    <>点「给 {seatName(actor.n)} 看」：你现在是<b>【{roleName(x.role)}】</b>，邪恶阵营。让他闭眼。</>,
                    <>轻拍 <b>{seatName(x.n)}</b>，点「给 {seatName(x.n)} 看」：你现在是<b>【舞蛇人】</b>，善良阵营（不要告诉他中毒）。让他闭眼。</>,
                    s.night === 1 ? '第一晚恶魔不杀人。' : '新恶魔今晚照常杀人（到恶魔那一步网页会叫醒他）。',
                  ]
                : [sleep]
            }
          />
          {hit && !viaPhone && (
            <div className="row">
              <button className="btn btn-ghost grow" onClick={() => ui.showCard(newRoleCard(x.role, true))}>
                <Icon name="eye" /> 给 {seatName(actor.n)} 看
              </button>
              <button className="btn btn-ghost grow" onClick={() => ui.showCard(newRoleCard('snakecharmer', false))}>
                <Icon name="eye" /> 给 {seatName(x.n)} 看
              </button>
            </div>
          )}
        </Reveal>
      )}
      <Tips role="snakecharmer" drunk={actor.role === 'drunk'} />
      <StepBar phone={viaPhone} send={phone} wait={ask.wait} ready={t.length > 0} label={t.length ? '完成，下一步' : '先点出他指的人'} onDone={() => done({ kind: 'target', target: t[0] })} />
    </>
  );
}

function PhilosopherStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const [use, setUse] = useState<boolean | null>(null);
  const [role, setRole] = useState<RoleId | null>(null);
  const goods = goodRolesOf(s, ['philosopher']);
  const holder = role ? s.seats.find((x) => x.role === role && x.n !== actor.n) : undefined;
  const now = !!role && s.night > 1 && firstNightOnly(role);
  const bad = malfunction(s, actor.n);
  const ask = usePhoneAsk(s, actor.n, { count: 0, title: roleName('philosopher'), lines: slotLines('philosopher', s.style), opts: roleOpts(goods), skip: '今晚不用（整局一次）' }, (_, a) => {
    setUse(!a.skip);
    setRole((a.opts?.[0] as RoleId) ?? null);
  });
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '问他今晚要不要用能力（整局一次）。要用就让他在角色表上指一个善良角色。', now ? null : sleep]} />
          <SayBox lines={slotLines('philosopher', s.style)} title="小声说" />
        </>
      )}
      <TwoChoice value={use} onChange={setUse} yes="他要用" no="他不用（摇头）" />
      {use && <RoleGrid roles={goods} value={role} onPick={setRole} />}
      {use && role && (
        <Reveal key={role}>
          <div className="card">
            <p>
              {bad
                ? `他中毒/醉酒：照常让他以为获得了【${roleName(role)}】，但能力其实没有（之后醒来都给假信息）。`
                : holder
                  ? `他获得【${roleName(role)}】的能力；${seatName(holder.n)}（${roleName(role)}）从现在起醉酒，直到哲学家死亡。`
                  : `他获得【${roleName(role)}】的能力（这个角色不在场）。`}
            </p>
            {now && !bad && <p className="dim">这是只在第一晚用的能力：点下面的按钮后，他今晚马上用（网页接着带你走这一步）。</p>}
            {!now && <p className="dim">之后他在{roleName(role)}的位置醒来使用这个能力（白天能力白天用）。</p>}
          </div>
        </Reveal>
      )}
      <Tips role="philosopher" drunk={actor.role === 'drunk'} />
      <StepBar
        phone={ask.on}
        wait={ask.wait}
        ready={use === false || (!!use && !!role)}
        label={use === false ? '他不用，下一步' : use && role ? (now && !bad ? '确认，接着让他用这个能力' : '完成，下一步') : use ? '先点出他指的角色' : '先问他用不用'}
        onDone={() => done({ kind: 'philo', role: use ? role : null })}
      />
    </>
  );
}

function EvilTwinStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const good = seatOf(s, s.twin!);
  const phone = usePhoneSend(s, [
    infoTo(good.n, { title: '你的双子是镜像双子（邪恶）', big: [seatName(actor.n)] }),
    infoTo(actor.n, { title: `你的善良双子是 ${seatName(good.n)}，他的角色是`, big: [roleName(good.role)] }),
  ]);
  if (phone.on)
    return (
      <>
        <DoBox items={[sendTo([actor.n, good.n], `${seatName(good.n)} 手机上显示镜像双子是 ${seatName(actor.n)}；${seatName(actor.n)} 手机上显示双子 ${seatName(good.n)} 的角色【${roleName(good.role)}】。`)]} />
        <p className="dim">{seatName(good.n)} 是善良的双子：他被处决邪恶直接获胜；两人都活着时善良赢不了。</p>
        <Tips role="eviltwin" />
        <StepBar phone send={phone} label="完成" onDone={() => done({ kind: 'none' })} />
      </>
    );
  return (
    <>
      <DoBox
        items={[
          <>
            轻拍 <b>{seatName(actor.n)}</b> 和 <b>{seatName(good.n)}</b> 的肩膀，让两人睁眼互相看一眼。
          </>,
          <>
            指着 {seatName(actor.n)}，点「给 {seatName(good.n)} 看」：<b>镜像双子</b>。
          </>,
          <>
            指着 {seatName(good.n)}，点「给 {seatName(actor.n)} 看」：他的角色<b>【{roleName(good.role)}】</b>。
          </>,
          '让两人闭眼。',
        ]}
      />
      <SayBox lines={slotLines('eviltwin', s.style)} title="小声说" />
      <p className="dim">{seatName(good.n)} 是善良的双子：他被处决邪恶直接获胜；两人都活着时善良赢不了。</p>
      <Tips role="eviltwin" />
      <BottomBar wide>
        <CardButton label={`给 ${seatName(good.n)} 看`} onClick={() => ui.showCard({ title: '这名玩家是', big: ['镜像双子'], team: 'minion' })} />
        <CardButton label={`给 ${seatName(actor.n)} 看`} onClick={() => ui.showCard(roleCard(good.role, '这名玩家是'))} />
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
          完成
        </button>
      </BottomBar>
    </>
  );
}

function CerenovusStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const [role, setRole] = useState<RoleId | null>(null);
  const bad = malfunction(s, actor.n) || !!goonTriggered(s, actor, t, 'cerenovus');
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: '洗脑师：选一名玩家，再选一个善良角色', lines: slotLines('cerenovus', s.style), opts: roleOpts(goodRolesOf(s)) }, (ns, a) => {
    setT(ns);
    setRole((a.opts?.[0] as RoleId) ?? null);
  });
  const madCard = (r: RoleId) => ({ title: '洗脑师选中了你', big: [roleName(r)], note: '明天你要"疯狂"地证明自己是这个角色，否则可能被处决。' });
  const phone = usePhoneSend(s, t.length && role ? [infoTo(t[0], madCard(role), undefined, 'mad')] : []);
  const viaPhone = ask.on && (!t.length || !role || phone.on);
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他指一名玩家，再在角色表上指一个善良角色。你在下面点出来。', sleep]} />
          <SayBox lines={slotLines('cerenovus', s.style)} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={t} max={1} onChange={setT} label="他指了谁？" collapse="他指了" />
      <GoonNote s={s} actor={actor} picks={t} slot="cerenovus" />
      {t.length > 0 && (
        <Reveal key={t[0]}>
          <div className="dim">他指了哪个角色？</div>
          <RoleGrid roles={goodRolesOf(s)} value={role} onPick={setRole} />
        </Reveal>
      )}
      {t.length > 0 && role && (
        <Reveal key={`${t[0]}-${role}`}>
          {viaPhone ? (
            <DoBox items={[sendTo([t[0]], `他手机上会显示：洗脑师选中了你，明天要疯狂地证明自己是【${roleName(role)}】。`)]} />
          ) : (
            <DoBox
              title="然后叫醒被选中的人"
              items={[wake(t[0]), <>点「给他看」：洗脑师选中了你，明天你要疯狂地证明自己是<b>【{roleName(role)}】</b>。</>, sleep]}
            />
          )}
          {bad && <p className="dim">洗脑师中毒/醉酒：照常叫醒告诉他（别露馅），但明天他不用受罚。</p>}
        </Reveal>
      )}
      <Tips role="cerenovus" />
      <StepBar
        phone={viaPhone}
        send={phone}
        wait={ask.wait}
        ready={t.length > 0 && !!role}
        label={!t.length || !role ? '先点出他指的人和角色' : '完成，下一步'}
        onDone={() => role && done({ kind: 'cere', target: t[0], role })}
      >
        {t.length > 0 && role && <CardButton onClick={() => ui.showCard(madCard(role))} />}
      </StepBar>
    </>
  );
}

function PithagStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const [role, setRole] = useState<RoleId | null>(null);
  const x = t.length ? seatOf(s, t[0]) : null;
  const bad = malfunction(s, actor.n) || !!goonTriggered(s, actor, t, 'pithag');
  const block = x && role ? pithagBlock(s, x.n, role) : null;
  const makesDemon = !!x && !!role && !bad && !block && teamOf(role) === 'demon';
  const choices = useMemo(() => (makesDemon && x ? pithagNightChoices(s, x.n) : []), [s, makesDemon, x]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 3)), [choices, s]);
  const [sel, setSel] = useState<number | null>(null);
  const night = choices[sel ?? rec]?.value;
  const old = demonSeat(s);
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: '麻脸巫婆：选一名玩家，再选一个角色', lines: slotLines('pithag', s.style), opts: roleOpts(scriptOf(s).roles) }, (ns, a) => {
    setT(ns);
    setRole((a.opts?.[0] as RoleId) ?? null);
    setSel(null);
  });
  const changes = !!x && !!role && !bad && !block;
  const phone = usePhoneSend(s, changes ? [becomes(x!.n, role!, isEvil(x!))] : []);
  const viaPhone = ask.on && (!changes || phone.on);
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他指一名玩家（可以是自己、死人），再在角色表上指一个角色。你在下面点出来。', sleep]} />
          <SayBox lines={slotLines('pithag', s.style)} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={t} max={1} onChange={(v) => { setT(v); setSel(null); }} label="他指了谁？" collapse="他指了" />
      <GoonNote s={s} actor={actor} picks={t} slot="pithag" />
      {x && (
        <Reveal key={x.n}>
          <div className="dim">他指了哪个角色？（灰的是已经在场的，或网页暂不支持的）</div>
          <RoleGrid roles={scriptOf(s).roles} value={role} onPick={(r) => { setRole(r); setSel(null); }} why={(r) => pithagBlock(s, x.n, r)} />
        </Reveal>
      )}
      {x && role && (
        <Reveal key={`${x.n}-${role}`}>
          <div className={`card${makesDemon ? ' card-evil' : ''}`}>
            <p>
              {bad
                ? '麻脸巫婆中毒/醉酒：什么都不会发生。'
                : block
                  ? block
                  : `${seatName(x.n)} 从${roleName(x.role)}变成${roleName(role)}，仍是${isEvil(x) ? '邪恶' : '善良'}阵营。`}
            </p>
            {makesDemon && !isDemonSeat(s, x.n) && old && <p>原来的恶魔 {seatName(old.n)}（{roleName(old.role)}）今晚死亡。</p>}
          </div>
          {makesDemon && (
            <>
              <div className="dim">造出了恶魔：今晚怎么死人由你决定</div>
              <ChoicePanel s={s} choices={choices} sel={sel ?? rec} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
            </>
          )}
          {changes &&
            (viaPhone ? (
              <DoBox items={[sendTo([x.n], `他手机上会显示"你现在是${roleName(role)}"，仍是${isEvil(x) ? '邪恶' : '善良'}阵营。`)]} />
            ) : (
              <DoBox title="然后叫醒他" items={[wake(x.n), <>点「给他看」：你现在是<b>【{roleName(role)}】</b>，你仍然是{isEvil(x) ? '邪恶' : '善良'}阵营。</>, sleep]} />
            ))}
        </Reveal>
      )}
      <Tips role="pithag" />
      <StepBar
        phone={viaPhone}
        send={phone}
        wait={ask.wait}
        ready={!!x && !!role}
        label={!x || !role ? '先点出他指的人和角色' : '完成，下一步'}
        onDone={() => x && role && done({ kind: 'pithag', target: x.n, role, deaths: [], noKill: makesDemon && !!night?.noKill })}
      >
        {changes && <CardButton onClick={() => ui.showCard(newRoleCard(role!, isEvil(x!)))} />}
      </StepBar>
    </>
  );
}

/** 梦殒春宵的恶魔：方古 / 诺-达鲺 / 亡骨魔 */
function SvDemonStep({ g, s, actor, slot }: StepProps & { slot: 'fanggu' | 'nodashii' | 'vigormortis' | 'lleech' | 'lordoftyphon' | 'kazali' }) {
  const done = useDone(g);
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const target = t.length ? seatOf(s, t[0]) : null;
  const bad = malfunction(s, actor.n) || !!goonTriggered(s, actor, t, slot);
  const pv = target ? demonKillPreview(s, target.n) : null;
  const jump = slot === 'fanggu' && !!target && !bad && fangguJumps(s, target.n);
  const vigorMinion = slot === 'vigormortis' && !!target && !bad && !!pv?.dies && teamOf(target.role) === 'minion';
  const poisonChoices = useMemo(() => (vigorMinion && target ? vigorPoisonChoices(s, target.n) : []), [s, vigorMinion, target]);
  const pRec = useMemo(() => recommend(poisonChoices, balance(s).score, stepRng(s, 4)), [poisonChoices, s]);
  const [pSel, setPSel] = useState<number | null>(null);
  const poison = poisonChoices[pSel ?? pRec]?.value ?? null;
  const nd = slot === 'nodashii' ? townsfolkNeighbors(s, actor.n) : [];
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: roleName(slot), lines: slotLines(slot, s.style) }, (v) => {
    setT(v);
    setPSel(null);
  });
  const phone = usePhoneSend(s, jump && target ? [becomes(target.n, 'fanggu', true)] : []);
  const viaPhone = ask.on && (!jump || phone.on);
  return (
    <>
      {slot === 'nodashii' && <p className="muted">他左右最近的镇民 {nd.map((n) => seatName(n)).join('、') || '—'} 一直中毒（网页已经标出）。</p>}
      {slot === 'fanggu' && !s.fangguJumped && <p className="muted">方古还没跳过：他第一次杀死外来者时，外来者变成新方古，他代替那人死。</p>}
      {slot === 'lleech' && s.lleechHost && <p className="muted">宿主是 {seatName(s.lleechHost)}（整局中毒）：宿主活着痢蛭就死不了，宿主一死痢蛭跟着死。</p>}
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他用手指向一名玩家，你在下面点出来。']} />
          <SayBox lines={slotLines(slot, s.style)} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={t} max={1} onChange={(v) => { setT(v); setPSel(null); }} label="他要杀谁？" />
      <GoonNote s={s} actor={actor} picks={t} slot={slot} />
      {target && pv && (
        <Reveal key={target.n}>
          <div className={`card${(pv.dies && !bad) || jump ? ' card-evil' : ''}`}>
            <p>
              {bad
                ? '他中毒/醉酒：杀人无效，没有人会死。'
                : jump
                  ? `${seatName(target.n)}（${roleName(target.role)}）是外来者：他变成邪恶的方古，原来的方古 ${seatName(actor.n)} 代替他死亡。`
                  : pv.text}
            </p>
            {vigorMinion && <p>他杀死的是爪牙：爪牙保留能力，再从他左右最近的镇民里选一个中毒。</p>}
          </div>
          {vigorMinion && poisonChoices.length > 0 && (
            <ChoicePanel s={s} choices={poisonChoices} sel={pSel ?? pRec} rec={pRec} onSel={(i) => i >= 0 && setPSel(i)} moreLabel="换一个人中毒" />
          )}
          <DoBox
            items={
              viaPhone
                ? [jump ? sendTo([target.n], '他手机上会显示"你现在是方古（邪恶）"。') : null, jump ? '天亮时宣布原来的方古死了。' : '天亮时再统一宣布死讯。']
                : jump
                  ? [sleep, wake(target.n), <>点「给他看」：你现在是<b>【方古】</b>，邪恶阵营。</>, sleep, '天亮时宣布原来的方古死了。']
                  : [sleep, '天亮时再统一宣布死讯。']
            }
          />
        </Reveal>
      )}
      <Tips role={slot} />
      <StepBar
        phone={viaPhone}
        send={phone}
        wait={ask.wait}
        ready={t.length > 0}
        label={t.length ? '完成，下一步' : '先点出他指的人'}
        onDone={() => done(slot === 'vigormortis' ? { kind: 'vigor', target: t[0], poison: vigorMinion ? poison : null } : { kind: 'target', target: t[0] })}
      >
        {jump && <CardButton onClick={() => ui.showCard(newRoleCard('fanggu', true))} />}
      </StepBar>
    </>
  );
}

/* ---------------- 实验性角色：镇民 ---------------- */

const SEATS_TITLE: Record<SeatsKind, string> = {
  steward: '这名玩家是善良的',
  knight: '这两人都不是恶魔',
  noble: '这三人之中恰好一个是邪恶的',
  highpriestess: '你最该去找这名玩家聊',
  choirboy: '杀死国王的恶魔是',
};

const SEATS_DO: Record<SeatsKind, (ns: string) => string> = {
  steward: (ns) => `用手指向 ${ns}：他是善良的。`,
  knight: (ns) => `用手依次指向 ${ns}：他们都不是恶魔。`,
  noble: (ns) => `用手依次指向 ${ns}：其中恰好一人是邪恶的。`,
  highpriestess: (ns) => `用手指向 ${ns}：你觉得他最该去找这个人聊。`,
  choirboy: (ns) => `用手指向 ${ns}：他就是杀死国王的恶魔。`,
};

/** 指几个人的信息：事务官 / 骑士 / 贵族 / 女祭司 / 唱诗男孩 */
function SeatsInfoStep({ g, s, actor, kind }: StepProps & { kind: SeatsKind }) {
  const done = useDone(g);
  const choices = useMemo(() => {
    const rng = stepRng(s);
    return kind === 'steward'
      ? stewardChoices(s, actor.n, rng)
      : kind === 'knight'
        ? knightChoices(s, actor.n, rng)
        : kind === 'noble'
          ? nobleChoices(s, actor.n, rng)
          : kind === 'highpriestess'
            ? priestessChoices(s, actor.n, rng)
            : choirboyChoices(s, actor.n, rng);
  }, [s, actor.n, kind]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const [man, setMan] = useState<number[]>([]);
  const need = SEATS_COUNT[kind];
  const lie = mustLie(s, kind);
  const healthy = !malfunction(s, actor.n) && !lie;
  const verdict = man.length === need ? seatsVerdict(s, kind, man) : null;
  const illegal = sel === -1 && verdict !== null && kind !== 'highpriestess' && ((healthy && verdict === 'false') || (lie && verdict !== 'false'));
  const picks = sel >= 0 ? (choices[sel]?.value ?? null) : man.length === need ? [...man].sort((a, b) => a - b) : null;
  const truth = sel >= 0 ? !!choices[sel]?.truth : verdict !== 'false';
  const twist = sel >= 0 ? !!choices[sel]?.twist : verdict === 'twist';
  usePoint(picks ?? []);
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, picks ? [infoTo(actor.n, { title: SEATS_TITLE[kind], big: picks.map(seatName) }, slotLines(kind, s.style))] : []);
  return (
    <>
      {kind === 'choirboy' && <p className="muted">国王今晚被恶魔杀死了：叫醒唱诗男孩，指向恶魔。</p>}
      <ChoicePanel
        s={s} choices={choices} sel={sel} rec={rec} onSel={setSel}
        manual={
          <div className="stack" style={{ gap: 8 }}>
            <SeatPicker s={s} selected={man} max={need} onChange={setMan} disabled={[actor.n]} label={`指哪${need === 1 ? '个' : ` ${need} 个`}人？`} />
            {illegal && <p className="evil">{lie ? '涡流在场，必须给假信息。' : '他没有中毒也不是酒鬼，必须给真信息。这样给不合规。'}</p>}
            {verdict === 'false' && !healthy && <p className="dim">这是假信息（他中毒/醉酒，可以给）。</p>}
          </div>
        }
      />
      {phoneOn ? (
        <DoBox items={[picks ? sendTo([actor.n], `他手机上会显示"${SEATS_TITLE[kind]}：${seatsText(picks)}"。`) : null]} />
      ) : (
        <>
          <DoBox items={[wake(actor.n), picks ? SEATS_DO[kind](seatsText(picks)) : null, sleep]} />
          <SayBox lines={slotLines(kind, s.style)} title="小声说" />
        </>
      )}
      <Tips role={kind} drunk={actor.role === 'drunk'} />
      <StepBar phone={phoneOn} send={phone} ready={!!picks && !illegal} onDone={() => picks && done({ kind: 'seats', seats: picks, truth, twist })} />
    </>
  );
}

function ShugenjaStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const choices = useMemo(() => shugenjaChoices(s, actor.n), [s, actor.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  const { cw, ccw } = shugenjaSteps(s, actor.n);
  const order = circleOrder(s);
  const i = order.indexOf(actor.n);
  const next = order[(i + 1) % order.length];
  const prev = order[(i - 1 + order.length) % order.length];
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, [
    infoTo(actor.n, { title: '离你最近的邪恶玩家在', big: [c.value ? '顺时针方向' : '逆时针方向'], note: `往 ${seatName(c.value ? next : prev)} 那一边` }, slotLines('shugenja', s.style)),
  ]);
  return (
    <>
      <p className="muted">
        顺时针（往 {seatName(next)} 那边）最近的邪恶玩家隔 {cw} 步；逆时针（往 {seatName(prev)} 那边）隔 {ccw} 步。
      </p>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i2) => i2 >= 0 && setSel(i2)} />
      {phoneOn ? (
        <DoBox items={[sendTo([actor.n], `他手机上会显示"${c.value ? '顺时针' : '逆时针'}方向（往 ${seatName(c.value ? next : prev)} 那一边）"。`)]} />
      ) : (
        <>
          <DoBox items={[wake(actor.n), <>用手水平指向 <b>{c.value ? `${seatName(next)} 那一侧（顺时针）` : `${seatName(prev)} 那一侧（逆时针）`}</b>。</>, sleep]} />
          <SayBox lines={slotLines('shugenja', s.style)} title="小声说" />
        </>
      )}
      <Tips role="shugenja" drunk={actor.role === 'drunk'} />
      <StepBar phone={phoneOn} send={phone} onDone={() => done({ kind: 'direction', cw: c.value, truth: c.truth, twist: c.twist })} />
    </>
  );
}

/** 第一晚：恶魔得知谁是国王 */
function KingRevealStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const ui = useUi();
  const d = demonSeat(s)!;
  const k = s.seats.find((x) => x.role === 'king')!;
  usePoint([k.n]);
  const phone = usePhoneSend(s, [infoTo(d.n, { title: '这名玩家是国王', big: [seatName(k.n)] })]);
  if (phone.on)
    return (
      <>
        <DoBox items={[sendTo([d.n], `恶魔手机上会显示国王是 ${seatName(k.n)}。`)]} />
        <Tips role="king" />
        <StepBar phone send={phone} onDone={() => done({ kind: 'none' })} />
      </>
    );
  return (
    <>
      <DoBox items={[wake(d.n), <>点「给恶魔看」：国王；再用手指向 <b>{seatName(k.n)}</b>。</>, sleep]} />
      <SayBox lines={['这名玩家是国王。']} title="小声说" />
      <Tips role="king" />
      <BottomBar wide>
        <CardButton label="给恶魔看" onClick={() => ui.showCard({ title: '这名玩家是', big: ['国王'], team: 'townsfolk' })} />
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

function KingStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const choices = useMemo(() => kingChoices(s, actor.n, stepRng(s)), [s, actor.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  const dead = s.seats.filter((x) => !x.alive).length;
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, c ? [infoTo(actor.n, roleCard(c.value, '这个角色还活着'), slotLines('king', s.style))] : []);
  return (
    <>
      <p className="muted">死了 {dead} 人、活着 {s.seats.length - dead} 人：死人不少于活人，国王每晚得知一个还活着的角色。</p>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      {phoneOn ? (
        <DoBox items={[c ? sendTo([actor.n], `他手机上会显示【${roleName(c.value)}】还活着。`) : null]} />
      ) : (
        <>
          <DoBox items={[wake(actor.n), c ? <>点「给他看」：<b>【{roleName(c.value)}】</b>还活着。</> : null, sleep]} />
          <SayBox lines={slotLines('king', s.style)} title="小声说" />
        </>
      )}
      <Tips role="king" drunk={actor.role === 'drunk'} />
      <StepBar phone={phoneOn} send={phone} ready={!!c} onDone={() => c && done({ kind: 'role', role: c.value, truth: c.truth })}>
        {c && <CardButton onClick={() => ui.showCard(roleCard(c.value, '这个角色还活着'))} />}
      </StepBar>
    </>
  );
}

function NightwatchStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const [use, setUse] = useState<boolean | null>(null);
  const [t, setT] = useState<number[]>([]);
  const bad = malfunction(s, actor.n) || !!goonTriggered(s, actor, t, 'nightwatchman');
  const lie = mustLie(s, 'nightwatchman');
  // 涡流在场：被选的人得到的是假信息（指向别人）
  const fake = lie && t.length ? s.seats.find((x) => x.alive && x.n !== actor.n && x.n !== t[0])?.n : undefined;
  const shown = fake ?? actor.n;
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: roleName('nightwatchman'), lines: slotLines('nightwatchman', s.style), disabled: [actor.n], skip: '今晚不用（整局一次）' }, (ns, a) => {
    setUse(!a.skip);
    setT(ns);
  });
  const phone = usePhoneSend(s, use && t.length && !bad ? [infoTo(t[0], { title: '守夜人选择了你，守夜人是', big: [seatName(shown)] }, undefined, 'nw')] : []);
  const viaPhone = ask.on && (!use || !t.length || bad || phone.on);
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '问他今晚要不要用能力（整局一次）。要用就让他指一名玩家。', sleep]} />
          <SayBox lines={slotLines('nightwatchman', s.style)} title="小声说" />
        </>
      )}
      <TwoChoice value={use} onChange={setUse} yes="他要用" no="他不用（摇头）" />
      {use && <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={[actor.n]} label="他指了谁？" />}
      {use && t.length > 0 && (
        <Reveal key={t[0]}>
          {bad ? (
            <div className="card">
              <p>守夜人中毒/醉酒：{seatName(t[0])} 不会被叫醒（能力用掉了）。</p>
            </div>
          ) : viaPhone ? (
            <DoBox items={[sendTo([t[0]], `他手机上会显示守夜人是 ${seatName(shown)}${fake ? '（涡流在场，给的是别人）' : ''}。`)]} />
          ) : (
            <DoBox
              title="然后叫醒被选的人"
              items={[wake(t[0]), <>点「给他看」：守夜人；再用手指向 <b>{seatName(shown)}</b>{fake ? '（涡流在场，指一个别人）' : ''}。</>, sleep]}
            />
          )}
        </Reveal>
      )}
      <Tips role="nightwatchman" drunk={actor.role === 'drunk'} />
      <StepBar
        phone={viaPhone}
        send={phone}
        wait={ask.wait}
        ready={use === false || (!!use && t.length > 0)}
        label={use === false ? '他不用，下一步' : use && t.length ? '完成，下一步' : use ? '先点出他指的人' : '先问他用不用'}
        onDone={() => done({ kind: 'nightwatch', target: use ? t[0] : null })}
      >
        {use && t.length > 0 && !bad && <CardButton onClick={() => ui.showCard({ title: '这名玩家是', big: ['守夜人'], team: 'townsfolk' })} />}
      </StepBar>
    </>
  );
}

function FarmerStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const choices = useMemo(() => farmerChoices(s, stepRng(s)), [s]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  usePoint(c ? [c.value] : []);
  const phone = usePhoneSend(s, c ? [becomes(c.value, 'farmer', false)] : []);
  return (
    <>
      <p className="muted">农夫（{seatName(actor.n)}）今晚死了：一名活着的善良玩家变成农夫，他原来的能力没有了。</p>
      {choices.length ? (
        <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} moreLabel="换一个人" />
      ) : (
        <p className="dim">没有活着的善良玩家可以变成农夫。</p>
      )}
      {c && <DoBox items={phone.on ? [sendTo([c.value], '他手机上会显示"你现在是农夫"。')] : [wake(c.value), '点「给他看」：你现在是农夫。', sleep]} />}
      <Tips role="farmer" />
      <StepBar phone={phone.on} send={phone} onDone={() => (c ? done({ kind: 'farmer', to: c.value }) : done({ kind: 'none' }))}>
        {c && <CardButton onClick={() => ui.showCard(roleCard('farmer', '你现在是', true))} />}
      </StepBar>
    </>
  );
}

/** 罂粟种植者死后：邪恶互认 */
function PoppyStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const minions = minionSeats(s).filter((x) => x.alive);
  const d = demonSeat(s)!;
  const phone = usePhoneSend(s, [
    ...minions.map((x) => infoTo(x.n, { big: [seatName(d.n)] }, ['这是你们的恶魔。'])),
    infoTo(d.n, minions.length ? { big: minions.map((x) => seatName(x.n)) } : { title: '你没有活着的爪牙', big: [] }, minions.length ? ['这些是你的爪牙。'] : undefined),
  ]);
  if (phone.on)
    return (
      <>
        <p className="muted">罂粟种植者死了：今晚爪牙和恶魔互相认识。</p>
        <DoBox items={[sendTo([...minions.map((x) => x.n), d.n], '爪牙手机上显示恶魔是谁，恶魔手机上显示爪牙是谁。')]} />
        <StepBar phone send={phone} onDone={() => done({ kind: 'none' })} />
      </>
    );
  return (
    <>
      <p className="muted">罂粟种植者死了：今晚爪牙和恶魔互相认识。</p>
      <DoBox
        items={[
          minions.length ? <>轻拍爪牙 <b>{seatsText(minions.map((x) => x.n))}</b>，让他们睁眼，用手指向恶魔 <b>{seatName(d.n)}</b>。让他们闭眼。</> : null,
          wake(d.n),
          minions.length ? <>用手依次指向爪牙 <b>{seatsText(minions.map((x) => x.n))}</b>。</> : '告诉他没有活着的爪牙。',
          sleep,
        ]}
      />
      <SayBox lines={['这是你们的恶魔。', '这些是你的爪牙。']} title="小声说" />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

function HuntsmanStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const [use, setUse] = useState<boolean | null>(null);
  const [t, setT] = useState<number[]>([]);
  const x = t.length ? seatOf(s, t[0]) : null;
  const bad = malfunction(s, actor.n) || !!goonTriggered(s, actor, t, 'huntsman');
  const hit = !!x && !bad && x.role === 'damsel';
  const choices = useMemo(() => (hit ? huntsmanBecomeChoices(s, stepRng(s)) : []), [s, hit]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState<number | null>(null);
  const become = choices[sel ?? rec]?.value;
  const dead = s.seats.filter((y) => !y.alive).map((y) => y.n);
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: roleName('huntsman'), lines: slotLines('huntsman', s.style), disabled: [actor.n, ...dead], skip: '今晚不用（整局一次）' }, (ns, a) => {
    setUse(!a.skip);
    setT(ns);
    setSel(null);
  });
  const phone = usePhoneSend(s, hit && become && x ? [becomes(x.n, become, false)] : []);
  const viaPhone = ask.on && (!hit || !become || phone.on);
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '问他今晚要不要用能力（整局一次）。要用就让他指一名活着的玩家。', sleep]} />
          <SayBox lines={slotLines('huntsman', s.style)} title="小声说" />
        </>
      )}
      <TwoChoice value={use} onChange={setUse} yes="他要用" no="他不用（摇头）" />
      {use && <SeatPicker s={s} selected={t} max={1} onChange={(v) => { setT(v); setSel(null); }} disabled={[actor.n, ...dead]} label="他指了谁？" />}
      {use && x && (
        <Reveal key={x.n}>
          <div className={`card${hit ? ' card-warn' : ''}`}>
            <p>{hit ? `${seatName(x.n)} 是落难少女：她变成一个不在场的镇民。` : bad && x.role === 'damsel' ? '他选中了落难少女，但巡山人中毒/醉酒：什么都不会发生。' : `${seatName(x.n)} 不是落难少女：什么都不会发生。`}</p>
          </div>
          {hit && (
            <>
              <ChoicePanel s={s} choices={choices} sel={sel ?? rec} rec={rec} onSel={(i) => i >= 0 && setSel(i)} moreLabel="换一个角色" />
              {become && (viaPhone ? <DoBox items={[sendTo([x.n], `她手机上会显示"你现在是${roleName(become)}"。`)]} /> : <DoBox title="然后叫醒她" items={[wake(x.n), <>点「给她看」：你现在是<b>【{roleName(become)}】</b>。</>, sleep]} />)}
            </>
          )}
        </Reveal>
      )}
      <Tips role="huntsman" drunk={actor.role === 'drunk'} />
      <StepBar
        phone={viaPhone}
        send={phone}
        wait={ask.wait}
        ready={use === false || (!!use && t.length > 0)}
        label={use === false ? '他不用，下一步' : use && t.length ? '完成，下一步' : use ? '先点出他指的人' : '先问他用不用'}
        onDone={() => done({ kind: 'huntsman', target: use ? t[0] : null, become: hit ? become : undefined })}
      >
        {hit && become && <CardButton label="给她看" onClick={() => ui.showCard(roleCard(become, '你现在是', true))} />}
      </StepBar>
    </>
  );
}

/** 第一晚叫醒爪牙：落难少女在场 / 告密者给的伪装 */
function MinionsLearnStep({ g, s, kind }: { g: Game; s: GameState; kind: 'damsel' | 'snitch' }) {
  const done = useDone(g);
  const ui = useUi();
  const minions = minionSeats(s).filter((x) => x.alive);
  const ms = seatsText(minions.map((x) => x.n));
  const card = kind === 'damsel' ? { title: '这个角色在场', big: ['落难少女'], team: 'outsider' as const } : { title: '这三个角色不在场，你可以伪装成他们', big: s.bluffs.map(roleName) };
  const phone = usePhoneSend(s, minions.map((x) => infoTo(x.n, card, slotLines(kind, s.style))));
  if (phone.on)
    return (
      <>
        <DoBox items={[sendTo(minions.map((x) => x.n), kind === 'damsel' ? '爪牙手机上会显示"落难少女在场"。' : `爪牙手机上会显示三个不在场的角色（${s.bluffs.map(roleName).join('、') || '没有'}）。`)]} />
        <Tips role={kind} />
        <StepBar phone send={phone} onDone={() => done({ kind: 'none' })} />
      </>
    );
  return (
    <>
      <DoBox
        items={[
          <>轻拍爪牙 <b>{ms}</b>{minions.length > 1 ? '，一个一个来' : ''}，让他睁眼。</>,
          kind === 'damsel' ? '点「给爪牙看」：落难少女在场。' : <>点「给爪牙看」：三个不在场的角色 <b>{s.bluffs.map(roleName).join('、') || '（没有）'}</b>。</>,
          sleep,
        ]}
      />
      <SayBox lines={slotLines(kind, s.style)} title="小声说" />
      {kind === 'snitch' && <p className="dim">网页给的是和恶魔一样的伪装（规则允许每个爪牙不同，你也可以换着给）。</p>}
      <Tips role={kind} />
      <BottomBar wide>
        <CardButton
          label="给爪牙看"
          onClick={() => ui.showCard(kind === 'damsel' ? { title: '这个角色在场', big: ['落难少女'], team: 'outsider' } : { title: '这三个角色不在场，你可以伪装成他们', big: s.bluffs.map(roleName) })}
        />
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/** 帽匠死后：每个爪牙和恶魔可以换成同类型的角色 */
function HatterStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const ui = useUi();
  const evil = s.seats.filter((x) => x.alive && isEvil(x) && (teamOf(x.role) === 'minion' || teamOf(x.role) === 'demon'));
  const [ch, setCh] = useState<Record<number, RoleId | null>>({});
  const taken = (r: RoleId, n: number) => s.seats.some((x) => x.role === r && x.n !== n && ch[x.n] === undefined) || Object.entries(ch).some(([k, v]) => v === r && +k !== n);
  const changes = Object.entries(ch).filter(([, v]) => v).map(([k, v]) => ({ seat: +k, role: v as RoleId }));
  // 手机上：每个邪恶玩家自己选换不换（每人一个小组件，各自问各自的）
  const [waiting, setWaiting] = useState<number[]>([]);
  const room = useRoom();
  const phoneOn = evil.length > 0 && phonesOn(room) && evil.every((x) => !!room.seats[x.n]);
  const phone = usePhoneSend(s, changes.map((c) => becomes(c.seat, c.role, true)));
  if (phoneOn)
    return (
      <>
        <p className="muted">帽匠死了：每个爪牙和恶魔的手机上会问他换不换角色（只能换同类型、没人在用的）。</p>
        {evil.map((x) => (
          <HatterAsk
            key={x.n}
            s={s}
            seat={x.n}
            roles={scriptOf(s).roles.filter((r) => teamOf(r) === teamOf(x.role) && r !== x.role)}
            value={ch[x.n] ?? null}
            onPick={(r) => setCh((c) => ({ ...c, [x.n]: r }))}
            onWait={(w) => setWaiting((ws) => (w ? [...new Set([...ws, x.n])] : ws.filter((n) => n !== x.n)))}
          />
        ))}
        {changes.some((c) => taken(c.role, c.seat)) && <p className="card card-warn">有两个人选了同一个角色，或选了已经有人在用的角色：在上面改掉一个。</p>}
        <Tips role="hatter" />
        <StepBar
          phone
          send={phone}
          wait={waiting.length ? `等 ${seatsText(waiting)} 在手机上选` : null}
          ready={!changes.some((c) => taken(c.role, c.seat))}
          label={changes.length ? `完成：${changes.length} 人换角色` : '都不换，下一步'}
          onDone={() => done({ kind: 'hatter', changes })}
        />
      </>
    );
  return (
    <>
      <p className="muted">帽匠死了：叫醒所有爪牙和恶魔（给他们看"帽匠"）。每人可以摇头不换，或在角色表上指一个同类型、没人在用的角色。</p>
      <SayBox lines={slotLines('hatter', s.style)} title="小声说" />
      {evil.map((x) => (
        <div key={x.n} className="card stack" style={{ gap: 6 }}>
          <b>
            {seatName(x.n)}（{roleName(x.role)}）{ch[x.n] ? ` → ${roleName(ch[x.n]!)}` : '：不换'}
          </b>
          <RoleGrid
            roles={scriptOf(s).roles.filter((r) => teamOf(r) === teamOf(x.role) && r !== x.role)}
            value={ch[x.n] ?? null}
            onPick={(r) => !taken(r, x.n) && setCh({ ...ch, [x.n]: ch[x.n] === r ? null : r })}
            why={(r) => (taken(r, x.n) ? '已经有人是这个角色' : null)}
          />
        </div>
      ))}
      <Tips role="hatter" />
      <BottomBar wide>
        <CardButton label="给他们看" onClick={() => ui.showCard({ title: '这个角色选中了你们', big: ['帽匠'] })} />
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'hatter', changes })}>
          {changes.length ? `完成：${changes.length} 人换角色` : '都不换，下一步'}
        </button>
      </BottomBar>
    </>
  );
}

/** 帽匠：问一个邪恶玩家换不换、换成什么 */
function HatterAsk({ s, seat, roles, value, onPick, onWait }: { s: GameState; seat: number; roles: RoleId[]; value: RoleId | null; onPick: (r: RoleId | null) => void; onWait: (w: boolean) => void }) {
  const ask = usePhoneAsk(s, seat, { count: 0, title: '帽匠死了：你可以换成同类型的另一个角色', lines: slotLines('hatter', s.style), opts: roleOpts(roles), skip: '不换' }, (_, a) =>
    onPick(a.skip ? null : ((a.opts?.[0] as RoleId) ?? null)),
  );
  const w = !!ask.wait;
  useEffect(() => onWait(w), [w]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="card stack" style={{ gap: 6 }}>
      <b>
        {seatName(seat)}（{roleName(seatOf(s, seat).role)}）{value ? ` → ${roleName(value)}` : '：不换'}
      </b>
      {ask.view}
      <RoleGrid roles={roles} value={value} onPick={(r) => onPick(value === r ? null : r)} />
    </div>
  );
}

/* ---------------- 实验性角色：爪牙 ---------------- */

function BoffinStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const d = demonSeat(s);
  const r = s.boffinAbility!;
  const card = roleCard(r, '恶魔拥有这个角色的能力', true);
  const phone = usePhoneSend(s, [actor.n, ...(d ? [d.n] : [])].map((n) => infoTo(n, card, slotLines('boffin', s.style))));
  if (phone.on)
    return (
      <>
        <DoBox items={[sendTo([actor.n, ...(d ? [d.n] : [])], `两人手机上会显示：恶魔拥有【${roleName(r)}】的能力。`)]} />
        <p className="dim">恶魔之后会在{roleName(r)}的位置用这个能力（网页会叫你）。</p>
        <Tips role="boffin" />
        <StepBar phone send={phone} onDone={() => done({ kind: 'none' })} />
      </>
    );
  return (
    <>
      <DoBox items={[<>轻拍 <b>{seatName(actor.n)}</b> 和恶魔 <b>{seatName(d?.n)}</b>，让两人睁眼（也可以分开叫）。</>, <>点「给他们看」：科学怪人选中了你们，恶魔拥有<b>【{roleName(r)}】</b>的能力。</>, '让他们闭眼。']} />
      <SayBox lines={slotLines('boffin', s.style)} title="小声说" />
      <p className="dim">恶魔之后会在{roleName(r)}的位置醒来用这个能力（网页会叫你）。</p>
      <Tips role="boffin" />
      <BottomBar wide>
        <CardButton label="给他们看" onClick={() => ui.showCard({ ...roleCard(r, '恶魔拥有这个角色的能力', true) })} />
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

function WizardStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const [use, setUse] = useState<boolean | null>(null);
  const [text, setText] = useState('');
  const ask = usePhoneAsk(s, actor.n, { count: 0, title: roleName('wizard'), lines: slotLines('wizard', s.style), text: '写下你的愿望', skip: '今晚不许愿（整局一次）' }, (_, a) => {
    setUse(!a.skip);
    setText(a.text ?? '');
  });
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '问他今晚要不要许愿（整局一次）。他可以写在手机上给你看。', sleep]} />
          <SayBox lines={slotLines('wizard', s.style)} title="小声说" />
        </>
      )}
      <TwoChoice value={use} onChange={setUse} yes="他许愿了" no="他不许（摇头）" />
      {use && (
        <div className="stack" style={{ gap: 8 }}>
          <label className="stack" style={{ gap: 6 }}>
            <span className="dim">他的愿望（记下来，进本局记录）</span>
            <input className="input" value={text} maxLength={60} placeholder="例如：我想看一眼魔典" onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="card stack" style={{ gap: 6 }}>
            <b>你来决定：答应、拒绝，或让他换一个</b>
            <p className="dim">答应了也要让好人还有机会赢：可以加一个代价（改变规则或打折扣），或者之后公开说"巫师许了个愿"并给好人一个线索。太离谱、没法平衡就拒绝。</p>
            {malfunction(s, actor.n) && <p className="dim">他中毒/醉酒：照常听他说，但愿望不会实现。</p>}
          </div>
        </div>
      )}
      <Tips role="wizard" />
      <StepBar
        phone={ask.on}
        wait={ask.wait}
        ready={use === false || (!!use && !!text.trim())}
        label={use === false ? '他不许，下一步' : use ? (text.trim() ? '记下愿望，下一步' : '先记下他的愿望') : '先问他许不许'}
        onDone={() => done({ kind: 'wish', text: use ? text.trim() : null })}
      />
    </>
  );
}

function OrganStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const [yes, setYes] = useState<boolean | null>(null);
  const ask = usePhoneAsk(s, actor.n, { count: 0, title: '今晚要不要醉酒？', lines: slotLines('organgrinder', s.style), opts: [{ id: 'yes', label: '醉酒' }, { id: 'no', label: '清醒' }] }, (_, a) =>
    setYes(a.opts?.[0] === 'yes'),
  );
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '问他今晚要不要醉酒（点头/摇头）。', sleep]} />
          <SayBox lines={slotLines('organgrinder', s.style)} title="小声说" />
        </>
      )}
      <TwoChoice value={yes} onChange={setYes} yes="点头：醉酒" no="摇头：清醒" />
      <p className="dim">醉酒的话明天投票照常睁眼；清醒的话明天每次投票都要闭眼、票数保密。</p>
      <Tips role="organgrinder" />
      <StepBar phone={ask.on} wait={ask.wait} ready={yes !== null} onDone={() => done({ kind: 'yesno', yes: !!yes, truth: true })} />
    </>
  );
}

function MezeStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const word = usePhoneSend(s, s.night === 1 ? [infoTo(actor.n, { title: '你的秘密词', big: [s.mezeWord] }, slotLines('mezepheles', s.style))] : []);
  const turned = s.night > 1 && s.mezeTarget && !malfunction(s, actor.n) ? s.mezeTarget : null;
  const turn = usePhoneSend(s, turned ? [infoTo(turned, { title: '你现在是', big: ['邪恶阵营'], note: '你的角色不变，但你现在和邪恶一伙。' })] : []);
  if (s.night === 1 && word.on)
    return (
      <>
        <DoBox items={[sendTo([actor.n], `他手机上会显示秘密词「${s.mezeWord}」。`)]} />
        <Tips role="mezepheles" />
        <StepBar phone send={word} onDone={() => done({ kind: 'none' })} />
      </>
    );
  if (turned && turn.on)
    return (
      <>
        <p className="muted">{seatName(turned)} 今天说出了秘密词「{s.mezeWord}」。灵言师本人不用醒。</p>
        <DoBox items={[sendTo([turned], '他手机上会显示"你现在是邪恶阵营"。')]} />
        <StepBar phone send={turn} onDone={() => done({ kind: 'none' })} />
      </>
    );
  if (s.night === 1)
    return (
      <>
        <DoBox items={[wake(actor.n), <>点「给他看」：秘密词<b>「{s.mezeWord}」</b>。</>, sleep]} />
        <SayBox lines={slotLines('mezepheles', s.style)} title="小声说" />
        <Tips role="mezepheles" />
        <BottomBar wide>
          <CardButton onClick={() => ui.showCard({ title: '你的秘密词', big: [s.mezeWord] })} />
          <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
            完成，下一步
          </button>
        </BottomBar>
      </>
    );
  const t = s.mezeTarget!;
  const bad = malfunction(s, actor.n);
  return (
    <>
      <p className="muted">
        {seatName(t)} 今天说出了秘密词「{s.mezeWord}」。灵言师本人不用醒。
      </p>
      {bad ? (
        <div className="card"><p>灵言师中毒/醉酒：{seatName(t)} 不会变邪恶，灵言师的能力用掉了。不用叫醒任何人。</p></div>
      ) : (
        <DoBox items={[wake(t), '点「给他看」：你现在是邪恶阵营（拇指向下）。', sleep]} />
      )}
      <BottomBar wide>
        {!bad && <CardButton onClick={() => ui.showCard({ title: '你现在是', big: ['邪恶阵营'], note: '你的角色不变，但你现在和邪恶一伙。' })} />}
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 实验性角色：恶魔 ---------------- */

function OjoStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const [role, setRole] = useState<RoleId | null>(null);
  const [pick, setPick] = useState<number[]>([]);
  const bad = malfunction(s, actor.n);
  const holder = role ? s.seats.find((x) => x.role === role && x.alive) : undefined;
  const target = holder ? holder.n : pick[0] ?? null;
  const pv = target ? demonKillPreview(s, target) : null;
  const ask = usePhoneAsk(s, actor.n, { count: 0, title: roleName('ojo'), lines: slotLines('ojo', s.style), opts: roleOpts(scriptOf(s).roles) }, (_, a) => {
    setRole((a.opts?.[0] as RoleId) ?? null);
    setPick([]);
  });
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他在角色表上指一个角色（不是指人），你在下面点出来。', sleep]} />
          <SayBox lines={slotLines('ojo', s.style)} title="小声说" />
        </>
      )}
      <RoleGrid roles={scriptOf(s).roles} value={role} onPick={(r) => { setRole(r); setPick([]); }} />
      {role && (
        <Reveal key={role}>
          {holder ? (
            <p className="muted">【{roleName(role)}】是 {seatName(holder.n)}。</p>
          ) : (
            <>
              <p className="muted">【{roleName(role)}】不在场（或已经死了）：由你选一个人死，一般选活着的好人。</p>
              <SeatPicker s={s} selected={pick} max={1} onChange={setPick} disabled={s.seats.filter((x) => !x.alive).map((x) => x.n)} label="你让谁死？" />
            </>
          )}
          {pv && (
            <div className={`card${pv.dies && !bad ? ' card-evil' : ''}`}>
              <p>{bad ? '奥赫中毒/醉酒：没有人会死。' : pv.text}</p>
            </div>
          )}
          <DoBox items={['天亮时再统一宣布死讯。']} />
        </Reveal>
      )}
      <Tips role="ojo" />
      <StepBar phone={ask.on} wait={ask.wait} ready={!!role && !!target} label={!role ? '先点出他指的角色' : !target ? '先选谁死' : '完成，下一步'} onDone={() => role && done({ kind: 'ojo', role, target })} />
    </>
  );
}

/** 痢蛭第一晚（或刚变成痢蛭的那晚）：选宿主 */
function LleechHostStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const [t, setT] = useState<number[]>([]);
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: '痢蛭：选你的宿主', lines: ['请选择一名玩家。'], disabled: s.seats.filter((x) => !x.alive).map((x) => x.n) }, setT);
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他指一名活着的玩家，你在下面点出来：这是他的宿主。', sleep]} />
          <SayBox lines={['请选择一名玩家。']} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={s.seats.filter((x) => !x.alive).map((x) => x.n)} label="他选了谁当宿主？" />
      {t.length > 0 && <p className="dim">{seatName(t[0])} 整局中毒（网页会一直标着）。宿主活着痢蛭就死不了，宿主一死痢蛭跟着死。</p>}
      <Tips role="lleech" />
      <StepBar phone={ask.on} wait={ask.wait} ready={t.length > 0} label={t.length ? '完成，下一步' : '先点出他选的人'} onDone={() => done({ kind: 'target', target: t[0] })} />
    </>
  );
}

/** 卡扎力第一晚：指定谁是哪个爪牙 */
function KazaliStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const need = DISTRIBUTION[s.count]?.[2] ?? 1;
  const [picks, setPicks] = useState<{ seat: number; role: RoleId }[]>([]);
  const [seat, setSeat] = useState<number[]>([]);
  const minions = scriptOf(s).roles.filter((r) => teamOf(r) === 'minion' && !picks.some((p) => p.role === r));
  // 手机上：按顺序选 need 个人、再按同样顺序选 need 个爪牙角色
  const ask = usePhoneAsk(
    s, actor.n,
    { count: need, ordered: true, title: `卡扎力：按顺序选 ${need} 个人，再按同样顺序选 ${need} 个爪牙`, lines: [], disabled: [actor.n], opts: roleOpts(scriptOf(s).roles.filter((r) => teamOf(r) === 'minion')), optCount: need },
    (ns, a) => setPicks(ns.map((n, i) => ({ seat: n, role: a.opts?.[i] as RoleId })).filter((p) => p.role)),
  );
  const phone = usePhoneSend(s, picks.length === need ? picks.map((c) => becomes(c.seat, c.role, true)) : []);
  if (ask.on && (picks.length < need || phone.on))
    return (
      <>
        <p className="muted">开局没有爪牙：卡扎力现在指定 {need} 个爪牙。</p>
        {ask.view}
        {picks.map((c) => (
          <p key={c.seat}>
            · {seatName(c.seat)} → <b>{roleName(c.role)}</b>
          </p>
        ))}
        {picks.length === need && <DoBox items={[sendTo(picks.map((c) => c.seat), '每个新爪牙手机上会显示"你现在是…（邪恶）"。')]} />}
        <Tips role="kazali" />
        <StepBar phone send={phone} wait={ask.wait} ready={picks.length === need} label={picks.length < need ? `还差 ${need - picks.length} 个爪牙` : '完成，接着爪牙互认'} onDone={() => done({ kind: 'kazali', picks })} />
      </>
    );
  return (
    <>
      <p className="muted">开局没有爪牙：卡扎力现在指定 {need} 个爪牙。每次让他先指一个人，再在角色表上指一个爪牙。</p>
      <DoBox items={[wake(actor.n), '让他指人、再指爪牙角色，你在下面点出来。', sleep]} />
      {picks.map((c) => (
        <p key={c.seat}>
          · {seatName(c.seat)} → <b>{roleName(c.role)}</b>
        </p>
      ))}
      {picks.length < need && (
        <>
          <SeatPicker s={s} selected={seat} max={1} onChange={setSeat} disabled={[actor.n, ...picks.map((c) => c.seat)]} label={`第 ${picks.length + 1} 个：他指了谁？`} />
          {seat.length > 0 && <RoleGrid roles={minions} value={null} onPick={(r) => { setPicks([...picks, { seat: seat[0], role: r }]); setSeat([]); }} />}
        </>
      )}
      {picks.length === need && (
        <Reveal>
          <DoBox
            title="然后一个一个叫醒新爪牙"
            items={picks.map((c) => (
              <>
                轻拍 <b>{seatName(c.seat)}</b>，点「给 {seatName(c.seat)} 看」：你现在是<b>【{roleName(c.role)}】</b>，邪恶阵营。让他闭眼。
              </>
            ))}
          />
          <div className="row">
            {picks.map((c) => (
              <button key={c.seat} className="btn btn-ghost grow" onClick={() => ui.showCard(newRoleCard(c.role, true))}>
                <Icon name="eye" /> 给 {seatName(c.seat)} 看
              </button>
            ))}
          </div>
        </Reveal>
      )}
      <Tips role="kazali" />
      <BottomBar wide>
        {picks.length > 0 && picks.length < need && <button className="btn btn-ghost" onClick={() => setPicks(picks.slice(0, -1))}>撤回一个</button>}
        <button className="btn btn-primary grow" disabled={picks.length < need} onClick={() => done({ kind: 'kazali', picks })}>
          {picks.length < need ? `还差 ${need - picks.length} 个爪牙` : '完成，接着爪牙互认'}
        </button>
      </BottomBar>
    </>
  );
}

/** 牙噶巴卜：第一晚看短语；之后按他白天说的次数决定谁死 */
function YaggaStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const ui = useUi();
  const d = demonSeat(s)!;
  const [t, setT] = useState<number[]>([]);
  const phrase = usePhoneSend(s, s.night === 1 ? [infoTo(d.n, { title: '你的秘密短语', big: [s.yaggaPhrase] }, slotLines('yaggababble', s.style))] : []);
  if (s.night === 1 && phrase.on)
    return (
      <>
        <DoBox items={[sendTo([d.n], `恶魔手机上会显示秘密短语「${s.yaggaPhrase}」。`)]} />
        <Tips role="yaggababble" />
        <StepBar phone send={phrase} onDone={() => done({ kind: 'none' })} />
      </>
    );
  if (s.night === 1)
    return (
      <>
        <DoBox items={[wake(d.n), <>点「给他看」：秘密短语<b>「{s.yaggaPhrase}」</b>。</>, sleep]} />
        <SayBox lines={slotLines('yaggababble', s.style)} title="小声说" />
        <Tips role="yaggababble" />
        <BottomBar wide>
          <CardButton onClick={() => ui.showCard({ title: '你的秘密短语', big: [s.yaggaPhrase] })} />
          <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
            完成，下一步
          </button>
        </BottomBar>
      </>
    );
  const n = s.yaggaSaid.count;
  const bad = malfunction(s, d.n);
  return (
    <>
      <p className="muted">
        牙噶巴卜（{seatName(d.n)}）今天公开说了 <b>{n}</b> 次「{s.yaggaPhrase}」：你可以让最多 {n} 个人死（可以少于这个数）。恶魔不用醒。
      </p>
      {bad ? (
        <div className="card"><p>牙噶巴卜中毒/醉酒：今晚没有人因此死亡。</p></div>
      ) : (
        <SeatPicker s={s} selected={t} max={n} onChange={setT} disabled={s.seats.filter((x) => !x.alive).map((x) => x.n)} label="你让谁死？（不选就是没人死）" />
      )}
      <Tips role="yaggababble" />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'yagga', picks: bad ? [] : t })}>
          {t.length && !bad ? `${t.map((x) => seatName(x)).join('、')} 死亡，下一步` : '没人死，下一步'}
        </button>
      </BottomBar>
    </>
  );
}

/** 第三晚：爪牙变成暴乱 */
function RiotNightStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const ui = useUi();
  const ms = s.seats.filter((x) => x.alive && teamOf(x.role) === 'minion');
  const phone = usePhoneSend(s, ms.map((x) => becomes(x.n, 'riot', true, slotLines('riot', s.style))));
  if (phone.on)
    return (
      <>
        <p className="muted">明天是第三天：所有爪牙变成暴乱。明天每次有人被提名就当场死亡，他要马上再提名一个活人。</p>
        <DoBox items={[sendTo(ms.map((x) => x.n), '爪牙手机上会显示"你现在是暴乱"。')]} />
        <Tips role="riot" />
        <StepBar phone send={phone} onDone={() => done({ kind: 'none' })} />
      </>
    );
  return (
    <>
      <p className="muted">明天是第三天：所有爪牙变成暴乱。明天每次有人被提名就当场死亡，他要马上再提名一个活人。</p>
      <DoBox items={[<>轻拍爪牙 <b>{seatsText(ms.map((x) => x.n))}</b>，让他们睁眼。</>, '点「给他们看」：你们现在是暴乱。', '让他们闭眼。']} />
      <SayBox lines={slotLines('riot', s.style)} title="小声说" />
      <Tips role="riot" />
      <BottomBar wide>
        <CardButton label="给他们看" onClick={() => ui.showCard(newRoleCard('riot', true))} />
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 实验性角色：其他 ---------------- */

function ViStep({ g, s, actor }: StepProps) {
  const [t, setT] = useState<number[]>([]);
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: roleName('villageidiot'), lines: slotLines('villageidiot', s.style), disabled: [actor.n] }, setT);
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他用手指向一名玩家，你在下面点出来。']} />
          <SayBox lines={slotLines('villageidiot', s.style)} title="小声说" />
        </>
      )}
      {s.viDrunk === actor.n && <p className="dim">这是整局醉酒的那个村夫：可以给假的。</p>}
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={[actor.n]} label="他指了谁？" />
      {t.length ? (
        <Reveal key={t[0]}>
          <ViAnswer g={g} s={s} actor={actor} target={t[0]} wait={ask.wait} />
        </Reveal>
      ) : (
        <Pending text={ask.wait ?? '先点出他指的人'} />
      )}
    </>
  );
}

function ViAnswer({ g, s, actor, target, wait }: StepProps & { target: number; wait: string | null }) {
  const done = useDone(g);
  const choices = useMemo(() => viChoices(s, actor.n, target), [s, actor.n, target]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, target)), [choices, s, target]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, [infoTo(actor.n, { title: `${seatName(target)} 是`, big: [c.value ? '邪恶的' : '善良的'] })]);
  return (
    <>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox items={phoneOn ? [sendTo([actor.n], `他手机上会显示 ${seatName(target)} 是${c.value ? '邪恶' : '善良'}的。`)] : [<><b>{c.value ? '拇指向下' : '拇指向上'}</b>：{seatName(target)} 是{c.value ? '邪恶' : '善良'}的。</>, sleep]} />
      <Tips role="villageidiot" drunk={actor.role === 'drunk'} />
      <StepBar phone={phoneOn} send={phone} wait={wait} onDone={() => done({ kind: 'yesno', yes: c.value, truth: c.truth })} />
    </>
  );
}

function EngineerStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const [use, setUse] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'demon' | 'minion' | null>(null);
  const [demon, setDemon] = useState<RoleId | null>(null);
  const evilMinions = s.seats.filter((x) => x.alive && teamOf(x.role) === 'minion');
  const [mins, setMins] = useState<RoleId[]>([]);
  const d = demonSeat(s);
  // 选到的爪牙按座位顺序分给现在的爪牙：已经在场的角色留给原来那个人
  const assign = useMemo(() => {
    const keep = evilMinions.filter((x) => mins.includes(x.role));
    const rest = evilMinions.filter((x) => !mins.includes(x.role));
    const newRoles = mins.filter((r) => !keep.some((x) => x.role === r));
    return rest.slice(0, newRoles.length).map((x, i) => ({ seat: x.n, role: newRoles[i] }));
  }, [evilMinions, mins]);
  const ready = use === false || (use && ((mode === 'demon' && demon) || (mode === 'minion' && mins.length === evilMinions.length)));
  // 手机上：选一个恶魔，或者选和现在爪牙一样多的爪牙
  const evilRoles = scriptOf(s).roles.filter((r) => teamOf(r) === 'demon' || teamOf(r) === 'minion');
  const ask = usePhoneAsk(
    s, actor.n,
    {
      count: 0, title: `工程师：选 1 个恶魔，或者选 ${evilMinions.length} 个爪牙`, lines: slotLines('engineer', s.style), opts: roleOpts(evilRoles),
      optMin: 1, optCount: Math.max(1, evilMinions.length), skip: '今晚不用（整局一次）',
    },
    (_, a) => {
      setUse(!a.skip);
      const picked = (a.opts ?? []) as RoleId[];
      const dm = picked.find((r) => teamOf(r) === 'demon');
      if (dm) {
        setMode('demon');
        setDemon(dm);
      } else if (picked.length) {
        setMode('minion');
        setMins(picked);
      }
    },
  );
  const phone = usePhoneSend(
    s,
    use && mode === 'demon' && demon && d && d.role !== demon
      ? [becomes(d.n, demon, true)]
      : use && mode === 'minion' && mins.length === evilMinions.length
        ? assign.map((c) => becomes(c.seat, c.role, true))
        : [],
  );
  const viaPhone = ask.on && (!ready || !use || phone.on || (mode === 'minion' && !assign.length) || (mode === 'demon' && d?.role === demon));
  return (
    <>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '问他今晚要不要用能力（整局一次）。要用就让他在角色表上指一个恶魔，或者指几个爪牙。', sleep]} />
          <SayBox lines={slotLines('engineer', s.style)} title="小声说" />
        </>
      )}
      <TwoChoice value={use} onChange={setUse} yes="他要用" no="他不用（摇头）" />
      {use && <TwoChoice value={mode === null ? null : mode === 'demon'} onChange={(v) => setMode(v ? 'demon' : 'minion')} yes="他指恶魔" no="他指爪牙" />}
      {use && mode === 'demon' && <RoleGrid roles={scriptOf(s).roles.filter((r) => teamOf(r) === 'demon')} value={demon} onPick={setDemon} />}
      {use && mode === 'minion' && (
        <>
          <p className="dim">现在有 {evilMinions.length} 个爪牙：让他指 {evilMinions.length} 个爪牙角色（已选 {mins.length}）。</p>
          <RoleGrid
            roles={scriptOf(s).roles.filter((r) => teamOf(r) === 'minion')}
            value={null}
            onPick={(r) => setMins(mins.includes(r) ? mins.filter((x) => x !== r) : mins.length < evilMinions.length ? [...mins, r] : mins)}
            why={(r) => (mins.includes(r) ? null : mins.length >= evilMinions.length ? '已经够了' : null)}
          />
          {mins.length > 0 && <p>他选了：{mins.map(roleName).join('、')}</p>}
        </>
      )}
      {use && mode === 'demon' && demon && d && (
        <Reveal key={demon}>
          {d.role === demon ? (
            <div className="card"><p>【{roleName(demon)}】已经在场：什么都不变（能力用掉了）。</p></div>
          ) : (
            <DoBox title="然后叫醒恶魔" items={[wake(d.n), <>点「给他看」：你现在是<b>【{roleName(demon)}】</b>。</>, sleep]} />
          )}
        </Reveal>
      )}
      {use && mode === 'minion' && mins.length === evilMinions.length && (
        <Reveal>
          {assign.length ? (
            <DoBox
              title="然后叫醒换了角色的爪牙"
              items={assign.map((c) => <>轻拍 <b>{seatName(c.seat)}</b>，告诉他：你现在是<b>【{roleName(c.role)}】</b>。让他闭眼。</>)}
            />
          ) : (
            <div className="card"><p>选的爪牙都已经在场：什么都不变（能力用掉了）。</p></div>
          )}
        </Reveal>
      )}
      {malfunction(s, actor.n) && use && <p className="dim">他中毒/醉酒：照常走流程，但什么都不会变（能力用掉了）。</p>}
      {viaPhone && phone.on && <DoBox items={[sendTo(phone.unread.length ? phone.unread : phone.unsent, '换了角色的人手机上会显示新角色。')]} />}
      <Tips role="engineer" drunk={actor.role === 'drunk'} />
      <StepBar
        phone={viaPhone}
        send={phone}
        wait={ask.wait}
        ready={!!ready}
        label={use === false ? '他不用，下一步' : ready ? '完成，下一步' : '先点出他选的角色'}
        onDone={() => done({ kind: 'engineer', demon: use && mode === 'demon' ? (demon ?? undefined) : undefined, minions: use && mode === 'minion' ? assign : undefined })}
      >
        {use && mode === 'demon' && demon && d && d.role !== demon && <CardButton onClick={() => ui.showCard(newRoleCard(demon, true))} />}
      </StepBar>
    </>
  );
}

/** 异教领袖：天亮前变成活着的邻座的阵营 */
function CultStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const nb = aliveNeighbors(s, actor.n).map((n) => seatOf(s, n));
  const evilN = nb.filter((x) => isEvil(x)).length;
  const forced = evilN === nb.length ? true : evilN === 0 ? false : null;
  const [pick, setPick] = useState<boolean | null>(forced);
  const now = isEvil(actor);
  const next = pick ?? now;
  const bad = malfunction(s, actor.n);
  const changes = !bad && next !== now;
  const phone = usePhoneSend(s, changes ? [infoTo(actor.n, { title: '你现在是', big: [next ? '邪恶阵营' : '善良阵营'] }, slotLines('cultleader', s.style))] : []);
  return (
    <>
      <p className="muted">
        他两边最近的活人：{nb.map((x) => `${seatName(x.n)}（${isEvil(x) ? '邪恶' : '善良'}）`).join('、')}。他现在是{now ? '邪恶' : '善良'}的。
      </p>
      {forced === null && !bad && (
        <>
          <p className="dim">一好一坏：由你决定他变成哪边。</p>
          <TwoChoice value={pick === null ? null : !pick} onChange={(v) => setPick(!v)} yes="善良" no="邪恶" />
        </>
      )}
      {bad ? (
        <div className="card"><p>他中毒/醉酒：阵营不变，不用叫醒他。</p></div>
      ) : changes ? (
        phone.on ? (
          <DoBox items={[sendTo([actor.n], `他手机上会显示"你现在是${next ? '邪恶' : '善良'}阵营"。`)]} />
        ) : (
          <DoBox items={[wake(actor.n), <>拇指{next ? '向下' : '向上'}：你现在是<b>{next ? '邪恶' : '善良'}</b>阵营。</>, sleep]} />
        )
      ) : (
        <p className="dim">阵营没变：不用叫醒他。</p>
      )}
      <Tips role="cultleader" />
      <StepBar phone={phone.on} send={phone} ready={pick !== null || bad} onDone={() => done({ kind: 'cult', evil: next })} />
    </>
  );
}

function SummonerStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const [role, setRole] = useState<RoleId | null>(null);
  const first = s.night === 1;
  const bluffs = usePhoneSend(s, first ? [infoTo(actor.n, { title: '这三个角色不在场，你可以伪装成他们', big: s.bluffs.map(roleName) })] : []);
  const demons = scriptOf(s).roles.filter((r) => teamOf(r) === 'demon');
  const ask = usePhoneAsk(
    s, actor.n,
    { count: 1, title: '召唤师：选一名玩家（可以是自己），再选一个恶魔', lines: slotLines('summoner', s.style), disabled: s.seats.filter((x) => !x.alive).map((x) => x.n), opts: roleOpts(demons), off: first },
    (ns, a) => {
      setT(ns);
      setRole((a.opts?.[0] as RoleId) ?? null);
    },
  );
  const summoned = !first && t.length > 0 && !!role && !malfunction(s, actor.n);
  const phone = usePhoneSend(s, summoned ? [becomes(t[0], role!, true)] : []);
  if (first && bluffs.on)
    return (
      <>
        <p className="muted">开局没有恶魔：召唤师第三晚会召唤一个。现在先给他三个伪装角色。</p>
        <DoBox items={[sendTo([actor.n], `他手机上会显示三个不在场的角色（${s.bluffs.map(roleName).join('、')}）。`)]} />
        <Tips role="summoner" />
        <StepBar phone send={bluffs} onDone={() => done({ kind: 'none' })} />
      </>
    );
  if (first)
    return (
      <>
        <p className="muted">开局没有恶魔：召唤师第三晚会召唤一个。现在先给他三个伪装角色。</p>
        <DoBox items={[wake(actor.n), <>点「给他看」：这三个角色不在场 <b>{s.bluffs.map(roleName).join('、')}</b>。</>, sleep]} />
        <Tips role="summoner" />
        <BottomBar wide>
          <CardButton onClick={() => ui.showCard({ title: '这三个角色不在场，你可以伪装成他们', big: s.bluffs.map(roleName) })} />
          <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
            完成，下一步
          </button>
        </BottomBar>
      </>
    );
  const bad = malfunction(s, actor.n);
  const viaPhone = ask.on && (!summoned || phone.on);
  return (
    <>
      <p className="muted">第三晚：召唤师选一个人（可以是自己）、再在角色表上指一个恶魔，那人变成邪恶的这个恶魔，今晚就能杀人。</p>
      {ask.on ? (
        ask.view
      ) : (
        <>
          <DoBox items={[wake(actor.n), '让他指人、再指恶魔，你在下面点出来。', sleep]} />
          <SayBox lines={slotLines('summoner', s.style)} title="小声说" />
        </>
      )}
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={s.seats.filter((x) => !x.alive).map((x) => x.n)} label="他指了谁？" collapse="他指了" />
      {t.length > 0 && <RoleGrid roles={scriptOf(s).roles.filter((r) => teamOf(r) === 'demon')} value={role} onPick={setRole} />}
      {t.length > 0 && role && (
        <Reveal key={`${t[0]}-${role}`}>
          {jinxesIn(['summoner', role]).filter((j) => !j.handled).map((j) => (
            <div key={j.b} className="card card-warn"><p><b>相克（网页没做，要你自己处理）</b>：{j.text}</p></div>
          ))}
          {bad ? (
            <div className="card card-warn"><p>召唤师中毒/醉酒：召唤失败，天亮时善良获胜。</p></div>
          ) : viaPhone ? (
            <DoBox items={[sendTo([t[0]], `他手机上会显示"你现在是${roleName(role)}（邪恶）"。`), '新恶魔今晚就会醒来杀人（网页会叫你）。']} />
          ) : (
            <DoBox title="然后叫醒新恶魔" items={[wake(t[0]), <>点「给他看」：你现在是<b>【{roleName(role)}】</b>，邪恶阵营。</>, sleep, '新恶魔今晚就会醒来杀人（网页会叫你）。']} />
          )}
        </Reveal>
      )}
      <Tips role="summoner" />
      <StepBar
        phone={viaPhone}
        send={phone}
        wait={ask.wait}
        ready={t.length > 0 && !!role}
        label={!t.length || !role ? '先点出他指的人和恶魔' : '完成，下一步'}
        onDone={() => role && done({ kind: 'summon', target: t[0], role })}
      >
        {t.length > 0 && role && !bad && <CardButton onClick={() => ui.showCard(newRoleCard(role, true))} />}
      </StepBar>
    </>
  );
}

/** 第一晚：所有军团互相认识 */
function LegionInfoStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const ui = useUi();
  const lg = s.seats.filter((x) => x.role === 'legion').map((x) => x.n);
  const good = s.seats.filter((x) => !x.traveller && x.role !== 'legion').map((x) => x.n);
  usePoint(good);
  const phone = usePhoneSend(s, [
    ...lg.map((n) => infoTo(n, { title: '你们都是军团', big: lg.map(seatName) }, ['你们都是军团。'])),
    ...(s.bluffs.length ? lg.map((n) => infoTo(n, { title: '这三个角色不在场，你可以伪装成他们', big: s.bluffs.map(roleName) }, undefined, 'info2')) : []),
  ]);
  if (phone.on)
    return (
      <>
        <DoBox items={[sendTo(lg, `每个军团手机上会显示所有军团是谁${s.bluffs.length ? '，再显示三个伪装' : ''}。`)]} />
        <Tips role="legion" />
        <StepBar phone send={phone} onDone={() => done({ kind: 'none' })} />
      </>
    );
  return (
    <>
      <DoBox
        items={[
          <>轻拍所有军团 <b>{seatsText(lg)}</b>，让他们睁眼互相看清。</>,
          <>可以用手指向不是军团的人 <b>{seatsText(good)}</b>。</>,
          s.bluffs.length ? '要给伪装的话点「给他们看伪装」（军团可以不给伪装）。' : null,
          '让他们闭眼。',
        ]}
      />
      <SayBox lines={['你们都是军团。']} title="小声说" />
      <Tips role="legion" />
      <BottomBar wide>
        {s.bluffs.length > 0 && <CardButton label="给他们看伪装" onClick={() => ui.showCard({ title: '这三个角色不在场，你可以伪装成他们', big: s.bluffs.map(roleName) })} />}
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/** 军团：今晚由你决定死不死人 */
function LegionStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const choices = useMemo(() => legionChoices(s, stepRng(s)), [s]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  usePoint(c?.value ? [c.value] : []);
  return (
    <>
      <p className="muted">军团晚上不用醒：今晚死不死人、死谁由你决定。目标是最后剩三个人（两个好人和一个军团）。</p>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <Tips role="legion" />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done(c?.value ? { kind: 'target', target: c.value } : { kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 旅行者 ---------------- */

function ApprenticeStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const evil = isEvil(actor);
  const pool = scriptOf(s).roles.filter((r) => teamOf(r) === (evil ? 'minion' : 'townsfolk'));
  const [role, setRole] = useState<RoleId | null>(null);
  const now = !!role && s.night > 1 && firstNightOnly(role);
  const phoneOn = usePhoneOn(actor.n);
  const phone = usePhoneSend(s, role ? [infoTo(actor.n, roleCard(role, '你获得这个角色的能力（你还是学徒）', true))] : []);
  return (
    <>
      <p className="muted">学徒加入后的第一晚：他是{evil ? '邪恶的，获得一个爪牙' : '善良的，获得一个镇民'}的能力。一般给一个不在场的角色。</p>
      <RoleGrid roles={pool} value={role} onPick={setRole} why={(r) => (s.seats.some((x) => x.role === r) ? '在场' : null)} />
      {role && <DoBox items={phoneOn ? [sendTo([actor.n], `他手机上会显示他获得【${roleName(role)}】的能力。`)] : [wake(actor.n), <>点「给他看」：你获得<b>【{roleName(role)}】</b>的能力（你还是学徒）。</>, now ? null : sleep]} />}
      {now && <p className="dim">这是只在第一晚用的能力：确认后他当晚马上用（网页接着带你）。</p>}
      <Tips role="apprentice" />
      <StepBar phone={phoneOn} send={phone} ready={!!role} label={role ? (now ? '确认，接着让他用这个能力' : '完成，下一步') : '先选一个能力'} onDone={() => role && done({ kind: 'philo', role })}>
        {role && <CardButton onClick={() => ui.showCard(roleCard(role, '你获得这个角色的能力', true))} />}
      </StepBar>
    </>
  );
}

/** 咖啡师：说书人选一个人和一种效果，咖啡师本人不醒 */
function BaristaStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const [twice, setTwice] = useState<boolean | null>(null);
  const card = { title: '这个角色选中了你', big: ['咖啡师'], note: twice ? '你的能力今晚到明天黄昏生效两次。' : '你今晚到明天黄昏清醒健康，信息都是真的。' };
  const phone = usePhoneSend(s, t.length && twice !== null ? [infoTo(t[0], card)] : []);
  return (
    <>
      <p className="muted">咖啡师在场：你选一个人，让他到明天黄昏"清醒健康、得到真信息"或"能力生效两次"。咖啡师本人不醒。</p>
      <SeatPicker s={s} selected={t} max={1} onChange={setT} label="选谁？" collapse="选了" />
      <TwoChoice value={twice} onChange={setTwice} yes="能力生效两次" no="清醒健康" />
      {t.length > 0 && twice !== null && (
        <Reveal key={`${t[0]}-${twice}`}>
          <DoBox items={phone.on ? [sendTo([t[0]], `他手机上会显示"咖啡师选中了你：${twice ? '能力生效两次' : '清醒健康'}"。`)] : [wake(t[0]), <>点「给他看」：咖啡师选中了你；再比 <b>{twice ? '2' : '1'}</b> 根手指。</>, sleep]} />
          {twice && <p className="dim">他今晚和明天白天能力生效两次：网页只记一次，第二次你照着同一步再做一遍（夜里先让他闭眼再叫醒）。</p>}
        </Reveal>
      )}
      <Tips role="barista" />
      <StepBar phone={phone.on} send={phone} ready={t.length > 0 && twice !== null} onDone={() => done({ kind: 'barista', seat: t[0], mode: twice ? 'twice' : 'sober' })}>
        {t.length > 0 && twice !== null && <CardButton onClick={() => ui.showCard({ title: '这个角色选中了你', big: ['咖啡师'], note: twice ? '比 2：你的能力今晚到明天黄昏生效两次。' : '比 1：你今晚到明天黄昏清醒健康，信息都是真的。' })} />}
      </StepBar>
    </>
  );
}

function HarlotStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const [agreed, setAgreed] = useState<boolean | null>(null);
  const [killBoth, setKillBoth] = useState<boolean | null>(null);
  const x = t.length ? seatOf(s, t[0]) : null;
  const blocked = [actor.n, ...s.seats.filter((y) => !y.alive).map((y) => y.n)];
  const ask = usePhoneAsk(s, actor.n, { count: 1, title: roleName('harlot'), lines: slotLines('harlot', s.style), disabled: blocked }, setT);
  // 被选中的人在自己手机上决定同不同意
  const consent = usePhoneAsk(
    s, x?.n ?? actor.n,
    { count: 0, title: '流莺选中了你：愿意让流莺知道你的角色吗？', lines: [], opts: [{ id: 'yes', label: '愿意' }, { id: 'no', label: '不愿意' }], off: !ask.on || !x, tag: 'consent' },
    (_, a) => setAgreed(a.opts?.[0] === 'yes'),
  );
  const phone = usePhoneSend(s, x && agreed ? [infoTo(actor.n, roleCard(x.role, `${seatName(x.n)} 的角色是`), undefined, 'reveal')] : []);
  const viaPhone = ask.on && (!agreed || phone.on);
  return (
    <>
      {ask.on ? ask.view : <DoBox items={[wake(actor.n), '让他指一名活着的玩家，你在下面点出来。', sleep]} />}
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={blocked} label="他指了谁？" collapse="他指了" />
      {x && (
        <Reveal key={x.n}>
          {consent.on ? consent.view : <DoBox items={[wake(x.n), '给他看"流莺选中了你"，问他愿不愿意让流莺知道他的角色（点头/摇头）。', sleep]} />}
          <TwoChoice value={agreed} onChange={setAgreed} yes="他点头同意" no="他摇头" />
          {agreed && (
            <>
              <DoBox items={viaPhone ? [sendTo([actor.n], `流莺手机上会显示 ${seatName(x.n)} 的角色【${roleName(x.role)}】。`)] : [wake(actor.n), <>点「给流莺看」：他的角色是<b>【{roleName(x.role)}】</b>。</>, sleep]} />
              <p className="dim">你可以决定两个人今晚都死（恶魔同意时别因此结束游戏）。</p>
              <TwoChoice value={killBoth} onChange={setKillBoth} yes="两人都死" no="都不死" />
            </>
          )}
        </Reveal>
      )}
      <Tips role="harlot" />
      <StepBar
        phone={viaPhone}
        send={phone}
        wait={ask.wait ?? consent.wait}
        ready={!!x && agreed !== null && !(agreed && killBoth === null)}
        onDone={() => x && done({ kind: 'harlot', target: x.n, agreed: !!agreed, kill: !!killBoth })}
      >
        {x && agreed && <CardButton label="给流莺看" onClick={() => ui.showCard(roleCard(x.role, '这名玩家的角色是'))} />}
      </StepBar>
    </>
  );
}

function BoneStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const [use, setUse] = useState<boolean | null>(null);
  const [t, setT] = useState<number[]>([]);
  const dead = s.seats.filter((x) => !x.alive && !x.traveller).map((x) => x.n);
  const ask = usePhoneAsk(
    s, actor.n,
    { count: 1, title: roleName('bonecollector'), lines: slotLines('bonecollector', s.style), disabled: s.seats.filter((x) => !dead.includes(x.n)).map((x) => x.n), skip: '今晚不用（整局一次）' },
    (ns, a) => {
      setUse(!a.skip);
      setT(ns);
    },
  );
  return (
    <>
      {ask.on ? ask.view : <DoBox items={[wake(actor.n), '问他今晚要不要用能力（整局一次）。要用就让他指一名死去的玩家。', sleep]} />}
      <TwoChoice value={use} onChange={setUse} yes="他要用" no="他不用（摇头）" />
      {use && <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={s.seats.filter((x) => !dead.includes(x.n)).map((x) => x.n)} label="他指了哪个死人？" />}
      {use && t.length > 0 && <p className="dim">{seatLabel(s, t[0])} 今晚到明天黄昏重新有能力：夜里轮到他的角色时网页会叫醒他。</p>}
      <Tips role="bonecollector" />
      <StepBar phone={ask.on} wait={ask.wait} ready={use === false || (!!use && t.length > 0)} label={use === false ? '他不用，下一步' : '完成，下一步'} onDone={() => done(use ? { kind: 'target', target: t[0] } : { kind: 'none' })} />
    </>
  );
}

/** 笑匠：今晚由你给一个人换角色（不能是笑匠白天点的人） */
function CackleStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const ui = useUi();
  const safe = s.cackleSafe?.day === s.night - 1 ? s.cackleSafe.seat : null;
  const [t, setT] = useState<number[]>([]);
  const [role, setRole] = useState<RoleId | null>(null);
  const x = t.length ? seatOf(s, t[0]) : null;
  const phone = usePhoneSend(s, x && role ? [becomes(x.n, role, isEvil(x))] : []);
  return (
    <>
      <p className="muted">笑匠在场：今晚你给一个人换成任意角色（可以是在场的）{safe ? `，但不能是笑匠白天点的 ${seatName(safe)}` : ''}。换了就叫醒他告诉他。</p>
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={safe ? [safe] : []} label="你换谁？" collapse="换" />
      {x && <RoleGrid roles={scriptOf(s).roles} value={role} onPick={setRole} />}
      {x && role && (
        <Reveal key={`${x.n}-${role}`}>
          <DoBox items={phone.on ? [sendTo([x.n], `他手机上会显示"你现在是${roleName(role)}"（阵营不变）。`)] : [wake(x.n), <>点「给他看」：你现在是<b>【{roleName(role)}】</b>（阵营不变）。</>, sleep]} />
          {firstNightOnly(role) && <p className="dim">这是第一晚就有的信息：网页不会自动补，你当场按这个角色给他信息。</p>}
        </Reveal>
      )}
      <Tips role="cacklejack" />
      {phone.on ? (
        <StepBar phone send={phone} onDone={() => x && role && done({ kind: 'cackle', target: x.n, role })} />
      ) : (
        <BottomBar wide>
          {x && role && <CardButton onClick={() => ui.showCard(newRoleCard(role, isEvil(x)))} />}
          <button className="btn btn-ghost" onClick={() => done({ kind: 'none' })}>
            今晚不换
          </button>
          <button className="btn btn-primary grow" disabled={!x || !role} onClick={() => x && role && done({ kind: 'cackle', target: x.n, role })}>
            完成，下一步
          </button>
        </BottomBar>
      )}
    </>
  );
}
