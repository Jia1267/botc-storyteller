import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ROLES, TEAM_NAME, roleName, type RoleId } from '../engine/roles';
import { balance, recommend } from '../engine/balance';
import {
  aliveNeighbors, believedRole, demonSeat, diedOnDay, seatOf, isDemonSeat, isEvil, isPoisoned, lilMonsta, malfunction, mustLie, scriptOf, seatLabel, seatName,
  teamOf,
} from '../engine/core';
import {
  completeSlot, currentSlot, effectiveSlot, goonTriggered, godfatherOutsiders, hadikhiaPreview, minionSeats, notWakingTonight, previewImp, shouldRun, slotActor,
  slotsFor, type SlotPayload,
} from '../engine/flow';
import {
  balloonistChoices, bountyChoices, chambermaidChoices, chambermaidCount, chefCount, dreamLabel, dreamerChoices, duchessChoices, duchessCount,
  empathCount, flowergirlChoices, fortuneChoices, generalChoices, grandmotherChoices, innkeeperDrunkChoices, killPreview, legalNumbers, lilKillChoices,
  mayorBounceChoices, numberChoices, sailorDrunkChoices, shabalothReviveChoices, tinkerChoices,
  pairChoices, pairVerdict, pixieChoices, plagueChoices, revealChoices, revealVerdict, seamstressChoices, starpassChoices, stHarpyChoices, stPoisonChoices, sweetheartChoices,
  widowInformChoices, type PairInfo, type PairKind,
} from '../engine/info';
import { SLOT_TITLE, dawnLines, librarianZeroLines, slotLines } from '../engine/scripts';
import type { GameState, Seat, SlotId } from '../engine/types';
import { stepRng, type Game } from '../store';
import { BottomBar, ChoicePanel, DoBox, SayBox, SeatPicker, roleCard, useUi } from './common';
import { GrimoirePanel } from './Grimoire';
import { Icon } from './icons';
import { KlutzPrompt, MoonchildPrompt, PixiePrompt, promptPending } from './Prompts';

interface StepProps {
  g: Game;
  s: GameState;
  actor: Seat;
}

export function NightScreen({ g }: { g: Game }) {
  const s = g.s;
  const slot = currentSlot(s);
  const actor = slotActor(s, slot);
  const order = slotsFor(s);
  const cur = s.ns!.slot;
  const ran = s.ns!.ran ?? [];
  const visible = order.map((sl, i) => ({ sl, i })).filter(({ sl, i }) => (i < cur ? ran.includes(i) : i === cur || shouldRun(s, sl)));
  const pos = visible.findIndex((x) => x.i === cur) + 1;
  const eff = effectiveSlot(s, slot);

  return (
    <main className="main split">
      <div className="side">
        <GrimoirePanel s={s} />
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
          </h2>
          {actor && !(slot === 'lunatic' && s.night === 1) && <ActorLine s={s} actor={actor} slot={eff} />}
        </div>
        <SlotBody g={g} s={s} slot={eff} actor={actor} />
      </div>
    </main>
  );
}

function ActorLine({ s, actor, slot }: { s: GameState; actor: Seat; slot: SlotId }) {
  const flags: ReactNode[] = [];
  if (actor.role === 'drunk') flags.push(<span key="d" className="chip chip-warn">其实是酒鬼：能力无效，可以给假信息</span>);
  if (actor.role === 'marionette') flags.push(<span key="m" className="chip chip-evil">其实是提线木偶：能力无效，可以给假信息</span>);
  if (s.sweetheartDrunk === actor.n) flags.push(<span key="sw" className="chip chip-warn">被心上人弄醉：能力无效，可以给假信息</span>);
  if (isPoisoned(s, actor.n)) flags.push(<span key="p" className="chip chip-poison">中毒：能力无效，可以给假信息</span>);
  if (mustLie(s, slot as RoleId) && ROLES[slot as RoleId]) flags.push(<span key="v" className="chip chip-evil">涡流在场：只能给假信息</span>);
  if (!actor.alive && !(actor.role === 'zombuul' && s.zombuulFake)) flags.push(<span key="x" className="chip">今晚刚死</span>);
  const why =
    actor.role === 'drunk' || actor.role === 'marionette'
      ? `（他以为自己是${roleName(believedRole(s, actor))}）`
      : believedRole(s, actor) === 'alchemist' && slot !== 'alchemist'
        ? `（炼金术士，拥有${roleName(slot as RoleId)}的能力）`
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
        {slot === 'widow' ? '寡妇是' : '叫醒'} <b>{seatName(actor.n)}</b>
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
    <div ref={ref} className="stack" style={{ scrollMarginTop: 72 }}>
      {children}
    </div>
  );
}
const toggleStyle = (g: Game) => () => g.tweak((st) => (st.style = st.style === 'simple' ? 'atmo' : 'simple'));

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
  const sleepers = notWakingTonight(s);
  return (
    <>
      <SayBox lines={slotLines('dusk', s.style)} title="对所有人说" s={s} onStyle={toggleStyle(g)} />
      <DoBox
        items={[
          '等所有人都闭上眼睛、低下头。',
          '接下来按网页顺序，一个一个轻拍肩膀叫醒。不要出声叫名字。',
          s.night === 1 ? '第一晚恶魔不杀人。' : null,
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
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'none' })}>
          所有人都闭眼了
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
  return (
    <>
      <DoBox
        items={[
          <>
            轻拍爪牙 <b>{ms}</b> 的肩膀，让{one ? '他' : '他们'}睁眼。
          </>,
          <>
            用手指向恶魔：<b>{seatName(d.n)}</b>。
          </>,
          one ? '等他看清，再让他闭眼。' : '等他们互相看清彼此，再让他们闭眼。',
        ]}
      />
      <SayBox lines={slotLines('minionInfo', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
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
  const ms = seatsText(minionSeats(s).map((x) => x.n));
  const d = demonSeat(s)!;
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
          '点「给他看伪装」，把手机举给他看。',
          sleep,
        ]}
      />
      {!ms && <p className="dim">唯一的爪牙是提线木偶，下一步再单独告诉恶魔，这一步不用指爪牙。</p>}
      {/* 没有爪牙时只念伪装那一句 */}
      <SayBox lines={slotLines('demonInfo', s.style).slice(ms ? 0 : 1)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <p className="muted">伪装角色：{s.bluffs.map(roleName).join('、')}</p>
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
  return (
    <>
      <SayBox
        lines={dawnLines(deaths, s.style, { fear: s.fearAnnounce, leviathanDay: lev ? s.night : undefined, hadikhia: s.ns!.hadikhia, banshee, revived: s.ns!.revived })}
        title="对所有人说"
        s={s}
        onStyle={toggleStyle(g)}
      />
      <DoBox
        items={[
          '宣布死讯时只说谁死了，不要说是怎么死的。',
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
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!s.winner && promptPending(s)} onClick={() => done({ kind: 'none' })}>
          {s.winner ? '宣布结果' : promptPending(s) ? '先处理上面的提示' : '进入白天'}
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 选一个人：投毒者 / 僧侣 / 管家 / 恐惧之灵 ---------------- */

function TargetStep({
  g, s, actor, slot,
}: StepProps & { slot: 'poisoner' | 'monk' | 'butler' | 'fearmonger' | 'bureaucrat' | 'thief' | 'devilsadvocate' | 'exorcist' }) {
  const done = useDone(g);
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const notSelf = slot === 'monk' || slot === 'butler' || slot === 'bureaucrat' || slot === 'thief';
  const bad = malfunction(s, actor.n) || !!goonTriggered(s, actor, t, slot);
  // 魔鬼代言人、驱魔人：不能和上一晚选同一个人
  const last =
    slot === 'devilsadvocate' && s.advocate?.night === s.night - 1 ? s.advocate.seat : slot === 'exorcist' && s.exorcistPick?.night === s.night - 1 ? s.exorcistPick.seat : null;
  const blocked = [
    ...(notSelf ? [actor.n] : []),
    ...(last ? [last] : []),
    ...(slot === 'devilsadvocate' ? s.seats.filter((x) => !x.alive).map((x) => x.n) : []),
  ];
  const lastNote = last ? `不能再选昨晚的 ${seatName(last)}。` : '';
  const exorcisedDemon = slot === 'exorcist' && t.length > 0 && !bad && isDemonSeat(s, t[0]) ? t[0] : null;
  const note =
    slot === 'devilsadvocate'
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
  return (
    <>
      <DoBox items={[wake(actor.n), `让他用手指向一名玩家${notSelf ? '（不能指自己）' : ''}，你在下面点出同一个人。`, sleep]} />
      <SayBox lines={slotLines(slot, s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={blocked} label="他指了谁？" />
      <GoonNote s={s} actor={actor} picks={t} slot={slot} />
      <p className="dim">{note}</p>
      {exorcisedDemon && (
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
      <Tips role={slot === 'fearmonger' || slot === 'devilsadvocate' ? slot : believedRole(s, actor)} drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        {exorcisedDemon && <CardButton label="给恶魔看" onClick={() => ui.showCard({ title: '这名玩家是', big: ['驱魔人'] })} />}
        <button className="btn btn-primary grow" disabled={!t.length} onClick={() => done({ kind: 'target', target: t[0] })}>
          {t.length ? `确认：${seatName(t[0])}，下一步` : '先点出他指的人'}
        </button>
      </BottomBar>
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
  const truth = sel >= 0 ? choices[sel].truth : verdict !== 'false';
  const twist = sel >= 0 ? !!choices[sel].twist : verdict === 'twist';

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
      <DoBox items={items} />
      <SayBox lines={value && value.role === null ? librarianZeroLines(s.style) : slotLines(kind, s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <Tips role={kind} drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        {value?.role && <CardButton onClick={() => ui.showCard(roleCard(value.role!, '这两人中有一人是'))} />}
        <button className="btn btn-primary grow" disabled={!value || illegal} onClick={() => value && done({ kind: 'pair', info: value, truth, twist })}>
          完成，下一步
        </button>
      </BottomBar>
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
      <SayBox lines={slotLines(kind, s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <Tips role={kind} drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={value === null || value === undefined} onClick={() => done({ kind: 'number', num: value!, truth, twist })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 占卜师 ---------------- */

function FortuneStep({ g, s, actor }: StepProps) {
  const [picks, setPicks] = useState<number[]>([]);
  return (
    <>
      <DoBox items={[wake(actor.n), '让他用手指向两名玩家，你在下面点出这两个人。']} />
      <SayBox lines={slotLines('fortuneteller', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker s={s} selected={picks} max={2} onChange={setPicks} label="他指了哪两个人？" />
      {picks.length === 2 ? (
        <Reveal key={[...picks].sort().join()}>
          <FortuneAnswer g={g} s={s} actor={actor} picks={picks as [number, number]} />
        </Reveal>
      ) : (
        <>
          <Tips role="fortuneteller" drunk={actor.role === 'drunk'} />
          <Pending text="先点出他指的两个人" />
        </>
      )}
    </>
  );
}

function FortuneAnswer({ g, s, actor, picks }: StepProps & { picks: [number, number] }) {
  const done = useDone(g);
  const choices = useMemo(() => fortuneChoices(s, actor.n, picks), [s, actor.n, picks]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, picks[0] * 31 + picks[1])), [choices, s, picks]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel];
  return (
    <>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox items={[c.value ? <><b>点头</b>：有恶魔。</> : <><b>摇头</b>：没有恶魔。</>, sleep]} />
      <Tips role="fortuneteller" drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'fortune', picks, yes: c.value, truth: c.truth, twist: c.twist })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 间谍 / 新恶魔 ---------------- */

function SpyStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  return (
    <>
      <DoBox items={[wake(actor.n), '点「给间谍看」，把手机交给他。', '他看完会点「看完了」，收回手机。', sleep]} />
      <SayBox lines={slotLines('spy', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
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
  return (
    <>
      <DoBox items={[wake(actor.n), `点「给他看」：你现在是${roleName(r)}。`, '马上进入恶魔这一步（他今晚就可以杀人）。']} />
      <SayBox lines={slotLines('scarletwoman', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
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
  return (
    <>
      <DoBox items={[wake(actor.n), '让他用手指向一名玩家（可以指自己），你在下面点出来。']} />
      <SayBox lines={slotLines(slot, s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker s={s} selected={t} max={1} onChange={setT} label="他要杀谁？" />
      {t.length ? (
        <Reveal key={t[0]}>
          <ImpOutcome g={g} s={s} actor={actor} target={t[0]} slot={slot} />
        </Reveal>
      ) : (
        <>
          <Tips role={slot} />
          <Pending text="先点出他指的人" />
        </>
      )}
    </>
  );
}

function ImpOutcome({ g, s, actor, target, slot }: StepProps & { target: number; slot: 'imp' | 'vortox' }) {
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
      <DoBox items={items} />
      <Tips role={slot} />
      <BottomBar wide>
        {pv.kind === 'starpass' && picked && <CardButton onClick={() => ui.showCard(roleCard(actor.role, '你现在是', true))} />}
        <button className="btn btn-primary grow" onClick={() => done(pay)}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 守鸦人 / 送葬者 ---------------- */

function RevealStep({ g, s, actor, kind }: StepProps & { kind: 'ravenkeeper' | 'undertaker' }) {
  const [pick, setPick] = useState<number[]>(kind === 'undertaker' && s.lastExecution ? [s.lastExecution.seat] : []);
  const subject = pick[0];
  return (
    <>
      {kind === 'ravenkeeper' ? (
        <>
          <DoBox items={[wake(actor.n), '让他用手指向一名玩家，你在下面点出来。']} />
          <SayBox lines={slotLines(kind, s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
          <SeatPicker s={s} selected={pick} max={1} onChange={setPick} label="他想看谁的角色？" />
        </>
      ) : (
        <p className="muted">
          今天被处决的是 <b>{seatName(subject)}</b>（{roleName(seatOf(s, subject).role)}）。
        </p>
      )}
      {subject ? (
        <Reveal key={subject} enabled={kind === 'ravenkeeper'}>
          <RevealAnswer g={g} s={s} actor={actor} kind={kind} subject={subject} />
        </Reveal>
      ) : (
        <Pending text="先点出他指的人" />
      )}
    </>
  );
}

function RevealAnswer({ g, s, actor, kind, subject }: StepProps & { kind: 'ravenkeeper' | 'undertaker'; subject: number }) {
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
      <DoBox items={[kind === 'undertaker' ? wake(actor.n) : null, '点「给他看」展示角色。', sleep]} />
      {kind === 'undertaker' && <SayBox lines={slotLines(kind, s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />}
      <Tips role={kind} drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        {value && <CardButton onClick={() => ui.showCard(roleCard(value, kind === 'undertaker' ? '今天被处决的玩家是' : '这名玩家的角色是'))} />}
        <button className="btn btn-primary grow" disabled={!value || illegal} onClick={() => value && done({ kind: 'reveal', pick: subject, role: value, truth, twist })}>
          完成，下一步
        </button>
      </BottomBar>
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

  // 第一晚：只是告诉真恶魔谁是疯子
  if (s.night === 1) {
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
      <DoBox items={[wake(actor.n), `他以为自己是${fake}：让他指一名玩家，你在下面点出来（这个人不会死）。`, sleep]} />
      <SayBox lines={slotLines('lunatic', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker s={s} selected={t} max={1} onChange={setT} label="疯子指了谁？" />
      {informed.length > 0 && (
        <Reveal key={t[0]}>
          <DoBox title="然后告诉真恶魔" items={informed} />
        </Reveal>
      )}
      <Tips role="lunatic" />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!t.length} onClick={() => done({ kind: 'target', target: t[0] })}>
          {t.length ? '完成，下一步' : '先点出疯子指的人'}
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
      <SayBox lines={slotLines('lilmonsta', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
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

function LilKill({ g, s, babysitter }: { g: Game; s: GameState; babysitter: number }) {
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
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!kill} onClick={() => kill && done({ kind: 'lilmonsta', babysitter, kill })}>
          {kill ? `完成：${seatName(babysitter)} 照看，${seatName(kill)} 死亡` : '先选今晚谁死'}
        </button>
      </BottomBar>
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
  if (inform && t.length) return <WidowInform g={g} s={s} actor={actor} target={t[0]} onBack={() => goto(false)} />;
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
      <SayBox lines={slotLines('widow', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
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
      <DoBox
        items={[
          `确认寡妇（${seatName(actor.n)}）已经闭眼。`,
          who ? wake(who) : '叫醒你选的那名善良玩家。',
          '点「给他看」：寡妇在场。',
          sleep,
        ]}
      />
      <SayBox title="小声说" lines={['寡妇在场。']} />
      <button className="btn btn-outline btn-sm" onClick={onBack}>
        返回改她毒的人
      </button>
      <Tips role="widow" />
      <BottomBar wide>
        <CardButton onClick={() => ui.showCard({ title: '这个角色在场', big: ['寡妇'] })} />
        <button className="btn btn-primary grow" disabled={!who} onClick={() => done({ kind: 'widow', target, informed: who ?? null })}>
          完成，下一步
        </button>
      </BottomBar>
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
  return (
    <>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox items={[wake(actor.n), c ? <>点「给他看」：<b>【{roleName(c.value)}】</b>在场。</> : null, sleep]} />
      <SayBox lines={slotLines('pixie', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <Tips role="pixie" />
      <BottomBar wide>
        {c && <CardButton onClick={() => ui.showCard(roleCard(c.value, '这个镇民角色在场'))} />}
        <button className="btn btn-primary grow" disabled={!c} onClick={() => c && done({ kind: 'role', role: c.value, truth: c.truth })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 侍女 ---------------- */

function ChambermaidStep({ g, s, actor }: StepProps) {
  const [picks, setPicks] = useState<number[]>([]);
  const blocked = s.seats.filter((x) => !x.alive || x.n === actor.n).map((x) => x.n);
  return (
    <>
      <DoBox items={[wake(actor.n), '让她指两名存活玩家（不能指自己），你在下面点出来。']} />
      <SayBox lines={slotLines('chambermaid', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <p className="dim">今晚因为自己的能力醒来过的人：{s.ns?.woke.length ? seatsText(s.ns.woke) : '还没有'}</p>
      <SeatPicker s={s} selected={picks} max={2} onChange={setPicks} disabled={blocked} label="她指了哪两个人？" />
      <GoonNote s={s} actor={actor} picks={picks} slot="chambermaid" />
      {picks.length === 2 ? (
        <Reveal key={[...picks].sort().join()}>
          <ChambermaidAnswer g={g} s={s} actor={actor} picks={picks} />
        </Reveal>
      ) : (
        <>
          <Tips role="chambermaid" />
          <Pending text="先点出她指的两个人" />
        </>
      )}
    </>
  );
}

function ChambermaidAnswer({ g, s, actor, picks }: StepProps & { picks: number[] }) {
  const done = useDone(g);
  const choices = useMemo(() => chambermaidChoices(s, actor.n, picks), [s, actor.n, picks]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, picks[0] * 13 + picks[1])), [choices, s, picks]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel];
  return (
    <>
      <p className="muted">真实答案：{chambermaidCount(s, picks)}</p>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox items={[c ? <>伸出 <b>{c.value}</b> 根手指{c.value === 0 ? '（握拳）' : ''}。</> : null, sleep]} />
      <Tips role="chambermaid" />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!c} onClick={() => c && done({ kind: 'number', num: c.value, truth: c.truth, twist: c.twist, picks })}>
          完成，下一步
        </button>
      </BottomBar>
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
  return (
    <>
      <p className="muted">
        今天的拜访者：{seatsText(s.duchessVisitors)}。其中邪恶的有 <b>{real}</b> 个。每人得知这个数，但其中一人拿到假数字。
      </p>
      {choices.length > 0 && <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />}
      <DoBox
        items={s.duchessVisitors.flatMap((n) => [
          <>
            轻拍 <b>{seatName(n)}</b>，伸出 <b>{c && c.value.falseFor === n ? c.value.falseNum : real}</b> 根手指，然后让他闭眼。
          </>,
        ])}
      />
      <SayBox lines={slotLines('duchess', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done(c ? { kind: 'duchess', falseFor: c.value.falseFor, falseNum: c.value.falseNum } : { kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
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
  return (
    <>
      <p className="dim">
        已经给过的类型：{s.balloonShown.length ? s.balloonShown.map((t) => TEAM_NAME[t]).join('、') : '还没有'}
      </p>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox items={[wake(actor.n), c ? <>用手指向 <b>{seatName(c.value.seat)}</b>。</> : null, sleep]} />
      <SayBox lines={slotLines('balloonist', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <Tips role="balloonist" />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!c} onClick={() => c && done({ kind: 'balloon', seat: c.value.seat, team: c.value.team, truth: c.truth })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}


/* ---------------- 残阳高照 ---------------- */

function AlchemistStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const ab = s.alchemistAbility;
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
      <SayBox lines={slotLines('alchemist', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
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
      <SayBox lines={outs.length ? slotLines('godfather', s.style) : ['场上没有外来者。']} title="小声说" s={s} onStyle={toggleStyle(g)} />
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
  return (
    <>
      <p className="muted">
        {slot === 'godfather'
          ? `今天白天有外来者死了（${seatsText(outs.map((x) => x.n))}），教父今晚要杀一个人。`
          : '今天白天没有人死，僵怖醒来杀人。'}
      </p>
      <DoBox items={[wake(actor.n), '让他用手指向一名玩家，你在下面点出来。', sleep]} />
      <SayBox lines={slot === 'godfather' ? ['今天有外来者死了。请选择一名玩家，他会死亡。'] : slotLines('zombuul', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
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
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!t.length} onClick={() => done({ kind: 'target', target: t[0] })}>
          {t.length ? '完成，下一步' : '先点出他指的人'}
        </button>
      </BottomBar>
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
  return (
    <>
      <div className="card stack" style={{ gap: 8 }}>
        <b>今天白天恶魔（{seatName(demonSeat(s)?.n)}）有没有举手投过票？</b>
        <p className="dim">白天记下的是"{voted ? '投过' : '没投'}"。记错了就在这里改。</p>
        <div className="seg" role="radiogroup">
          <button className={voted ? 'on' : ''} onClick={() => setVoted(true)} aria-pressed={voted}>
            投过
          </button>
          <button className={!voted ? 'on' : ''} onClick={() => setVoted(false)} aria-pressed={!voted}>
            没投
          </button>
        </div>
      </div>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox items={[wake(actor.n), c.value ? <><b>点头</b>：恶魔今天投过票。</> : <><b>摇头</b>：恶魔今天没投票。</>, sleep]} />
      <SayBox lines={slotLines('flowergirl', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <Tips role="flowergirl" drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'yesno', yes: c.value, truth: c.truth })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 王不见王 ---------------- */

function MarionetteStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const m = s.seats.find((x) => x.role === 'marionette')!;
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
      <SayBox lines={slotLines('marionette', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
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

/** 告诉被鹰身女妖选中的第一个人 */
function HarpyInform({ mad, second }: { mad: number; second: number }) {
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
  return (
    <>
      <DoBox items={[wake(actor.n), '让她先指第一个人，再指第二个人。你按顺序点出来。', sleep]} />
      <SayBox lines={slotLines('harpy', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker s={s} selected={t} max={2} onChange={setT} label="先点第一个人（要疯狂的人），再点第二个人" />
      {t.length === 2 && (
        <Reveal key={t.join()}>
          <HarpyInform mad={mad} second={second} />
          {bad && <p className="dim">她中毒/醉酒：照常走流程，但明天不会有人因此死亡。</p>}
        </Reveal>
      )}
      <Tips role="harpy" />
      <BottomBar wide>
        {t.length === 2 && <CardButton onClick={() => ui.showCard({ title: '这个角色选择了你', big: ['鹰身女妖'] })} />}
        <button className="btn btn-primary grow" disabled={t.length < 2} onClick={() => done({ kind: 'harpy', mad, second })}>
          {t.length === 2 ? `完成：${seatName(mad)} 要证明 ${seatName(second)} 是邪恶的` : '先按顺序点出两个人'}
        </button>
      </BottomBar>
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
      {pick && <HarpyInform mad={pick.mad} second={pick.second} />}
      <p className="dim">明天白天由你判断第一个人有没有做到，网页会在投票区旁边问你。</p>
      <BottomBar wide>
        {pick && <CardButton onClick={() => ui.showCard({ title: '这个角色选择了你', big: ['鹰身女妖'] })} />}
        <button className="btn btn-primary grow" disabled={!pick} onClick={() => pick && done({ kind: 'harpy', mad: pick.mad, second: pick.second })}>
          {pick ? `完成：${seatName(pick.mad)} 要证明 ${seatName(pick.second)} 是邪恶的` : '先按顺序点出两个人'}
        </button>
      </BottomBar>
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
  return (
    <>
      <DoBox items={[wake(actor.n), '让他指一名玩家（不能指自己或旅行者），你在下面点出来。']} />
      <SayBox lines={slotLines('dreamer', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={blocked} label="他指了谁？" />
      {t.length ? (
        <Reveal key={t[0]}>
          <DreamerAnswer g={g} s={s} actor={actor} target={t[0]} />
        </Reveal>
      ) : (
        <>
          <Tips role="dreamer" drunk={actor.role === 'drunk'} />
          <Pending text="先点出他指的人" />
        </>
      )}
    </>
  );
}

function DreamerAnswer({ g, s, actor, target }: StepProps & { target: number }) {
  const done = useDone(g);
  const ui = useUi();
  const choices = useMemo(() => dreamerChoices(s, actor.n, target, stepRng(s, target)), [s, actor.n, target]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, target + 1)), [choices, s, target]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  return (
    <>
      <p className="muted">
        {seatName(target)} 的真实角色：{roleName(seatOf(s, target).role)}
      </p>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox
        items={[
          <>
            点「给他看」：<b>{dreamLabel(c.value)}</b>，他是其中之一。
          </>,
          sleep,
        ]}
      />
      <Tips role="dreamer" drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        <CardButton onClick={() => ui.showCard({ title: '他是这两个角色之一', big: [roleName(c.value.good), roleName(c.value.evil)] })} />
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'dreamer', target, good: c.value.good, evil: c.value.evil, truth: c.truth, twist: c.twist })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

function SeamstressStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const [use, setUse] = useState<boolean | null>(null);
  const [picks, setPicks] = useState<number[]>([]);
  return (
    <>
      <DoBox items={[wake(actor.n), '问她今晚要不要用能力（整局只能用一次）。不用就让她闭眼。']} />
      <SayBox lines={slotLines('seamstress', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <div className="seg" role="radiogroup">
        <button className={use === true ? 'on' : ''} onClick={() => setUse(true)} aria-pressed={use === true}>
          她要用
        </button>
        <button className={use === false ? 'on' : ''} onClick={() => setUse(false)} aria-pressed={use === false}>
          她不用（摇头）
        </button>
      </div>
      {use && <SeatPicker s={s} selected={picks} max={2} onChange={setPicks} disabled={[actor.n]} label="她指了哪两个人？" />}
      {use && picks.length === 2 ? (
        <Reveal key={[...picks].sort().join()}>
          <SeamstressAnswer g={g} s={s} actor={actor} picks={picks as [number, number]} />
        </Reveal>
      ) : (
        <>
          <Tips role="seamstress" drunk={actor.role === 'drunk'} />
          <BottomBar wide>
            <button
              className="btn btn-primary btn-block"
              disabled={use !== false}
              onClick={() => done({ kind: 'seamstress', picks: null, same: false, truth: true })}
            >
              {use === false ? '她不用，下一步' : use ? '先点出她指的两个人' : '先问她用不用'}
            </button>
          </BottomBar>
        </>
      )}
    </>
  );
}

function SeamstressAnswer({ g, s, actor, picks }: StepProps & { picks: [number, number] }) {
  const done = useDone(g);
  const choices = useMemo(() => seamstressChoices(s, actor.n, picks), [s, actor.n, picks]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, picks[0] * 17 + picks[1])), [choices, s, picks]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  return (
    <>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox items={[c.value ? <><b>点头</b>：同一阵营。</> : <><b>摇头</b>：不同阵营。</>, sleep]} />
      <Tips role="seamstress" drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'seamstress', picks, same: c.value, truth: c.truth, twist: c.twist })}>
          完成，下一步（她的能力用掉了）
        </button>
      </BottomBar>
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
  return (
    <>
      {last !== undefined && <p className="muted">他之前得知的 {seatName(last)} 死了，今晚得知另一名邪恶玩家。</p>}
      {choices.length > 0 ? <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} /> : <p className="dim">没有可以给的邪恶玩家了。</p>}
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
      <SayBox lines={slotLines('bountyhunter', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <Tips role="bountyhunter" drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        {c && <CardButton onClick={() => ui.showCard({ title: '这名玩家是', big: ['邪恶的'] })} />}
        <button className="btn btn-primary grow" onClick={() => done(c ? { kind: 'bounty', seat: c.value, truth: c.truth, twist: c.twist } : { kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

function GeneralStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const choices = useMemo(() => generalChoices(s, actor.n), [s, actor.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel] ?? choices[0];
  return (
    <>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox items={[wake(actor.n), <b key="a">{c.label}</b>, sleep]} />
      <SayBox lines={slotLines('general', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <Tips role="general" drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'general', answer: c.value, truth: c.truth })}>
          完成，下一步
        </button>
      </BottomBar>
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
  return (
    <>
      <DoBox items={[wake(actor.n), '让他依次指三名玩家（死人也可以），你按顺序点出来。他也可以不选。', sleep]} />
      <SayBox lines={slotLines('alhadikhia', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker
        s={s}
        selected={picks}
        max={3}
        onChange={(v) => {
          setPicks(v);
          setLive([null, null, null]);
        }}
        label="他按顺序指了谁？"
      />
      {picks.length === 3 && (
        <Reveal key={picks.join()}>
          <SayBox title="恶魔闭眼后，对所有人说（大家仍然闭眼）" lines={[`恶魔选择了 ${seatsText(picks)}。`]} />
          {picks.map((n, i) => (
            <div key={n} className="card stack" style={{ gap: 8 }}>
              <b>
                第 {i + 1} 个：轻拍 {seatName(n)}
                {seatOf(s, n).alive ? '' : '（已死亡）'}，问他：你选择活还是死？点头 = 活，摇头 = 死。
              </b>
              <div className="seg" role="radiogroup">
                <button className={live[i] === true ? 'on' : ''} onClick={() => setOne(i, true)} aria-pressed={live[i] === true}>
                  点头：活
                </button>
                <button className={live[i] === false ? 'on' : ''} onClick={() => setOne(i, false)} aria-pressed={live[i] === false}>
                  摇头：死
                </button>
              </div>
              <p className="dim">让他闭眼，再叫下一个。</p>
            </div>
          ))}
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
      <BottomBar wide>
        {picks.length === 0 && (
          <button className="btn btn-ghost" onClick={() => done({ kind: 'hadikhia', picks: [], live: [] })}>
            他今晚不选
          </button>
        )}
        <button className="btn btn-primary grow" disabled={!ready} onClick={() => done({ kind: 'hadikhia', picks, live: live as boolean[] })}>
          {ready ? '完成，下一步' : picks.length < 3 ? '先按顺序点出三个人' : '记下每个人的选择'}
        </button>
      </BottomBar>
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
  return (
    <>
      <p className="muted">理发师（{seatName(barber.n)}）死了：今晚恶魔可以选两个人交换角色（可以选他自己），阵营不变。</p>
      <DoBox items={[wake(actor.n), '点「给恶魔看」：理发师。问他要不要换；要换就让他指两个人。']} />
      <SayBox lines={slotLines('barber', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
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
  const to = c.value.to;
  return (
    <>
      <p className="muted">瘟疫医生（{seatName(pd.n)}）死了：你（说书人）获得一个爪牙的能力，直到游戏结束。</p>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} moreLabel="换一个能力" />
      <DoBox
        items={
          to
            ? [wake(to), '点「给他看」：你获得了间谍的能力，每晚可以看魔典。', sleep]
            : ['不需要叫醒任何人。', `从明晚起，网页会在${roleName(c.value.ability)}的位置提醒你自己选人。`]
        }
      />
      <Tips role="plaguedoctor" />
      <BottomBar wide>
        {to && <CardButton onClick={() => ui.showCard({ title: '你获得了这个能力', big: ['间谍'], ability: ROLES.spy.ability })} />}
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'plague', ability: c.value.ability, to })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 暗月初升 ---------------- */

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
  return (
    <>
      <DoBox items={[wake(actor.n), '让他指一名存活玩家，你在下面点出来。', sleep]} />
      <SayBox lines={slotLines('sailor', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={blocked} label="他指了谁？" />
      <GoonNote s={s} actor={actor} picks={t} slot="sailor" />
      {t.length ? (
        <Reveal key={t[0]}>
          <SailorAnswer g={g} s={s} actor={actor} target={t[0]} />
        </Reveal>
      ) : (
        <>
          <Tips role="sailor" drunk={actor.role === 'drunk'} />
          <Pending text="先点出他指的人" />
        </>
      )}
    </>
  );
}

function SailorAnswer({ g, s, actor, target }: StepProps & { target: number }) {
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
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'sailor', target, drunk: c.value })}>
          完成：{seatName(c.value)} 醉酒，下一步
        </button>
      </BottomBar>
    </>
  );
}

function InnkeeperStep({ g, s, actor }: StepProps) {
  const [t, setT] = useState<number[]>([]);
  return (
    <>
      <DoBox items={[wake(actor.n), '让他指两名玩家，你在下面点出来。', sleep]} />
      <SayBox lines={slotLines('innkeeper', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker s={s} selected={t} max={2} onChange={setT} label="他指了哪两个人？" />
      <GoonNote s={s} actor={actor} picks={t} slot="innkeeper" />
      {t.length === 2 ? (
        <Reveal key={[...t].sort().join()}>
          <InnkeeperAnswer g={g} s={s} actor={actor} picks={t as [number, number]} />
        </Reveal>
      ) : (
        <>
          <Tips role="innkeeper" drunk={actor.role === 'drunk'} />
          <Pending text="先点出他指的两个人" />
        </>
      )}
    </>
  );
}

function InnkeeperAnswer({ g, s, actor, picks }: StepProps & { picks: [number, number] }) {
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
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'innkeeper', picks, drunk: c.value })}>
          完成：保护 {seatsText(picks)}，{seatName(c.value)} 醉酒
        </button>
      </BottomBar>
    </>
  );
}

/** 角色表：按类型分组点选一个角色 */
function RolePick({ s, value, onPick }: { s: GameState; value: RoleId | null; onPick: (r: RoleId) => void }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {(['townsfolk', 'outsider', 'minion', 'demon'] as const).map((t) => (
        <div key={t}>
          <div className="dim">{TEAM_NAME[t]}</div>
          <div className="role-grid">
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
  return (
    <>
      <DoBox items={[wake(actor.n), '问他今晚要不要用能力（整局一次）。要用就让他在角色表上指一个角色。', sleep]} />
      <SayBox lines={slotLines('courtier', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <div className="seg" role="radiogroup">
        <button className={use === true ? 'on' : ''} onClick={() => setUse(true)} aria-pressed={use === true}>
          他要用
        </button>
        <button className={use === false ? 'on' : ''} onClick={() => setUse(false)} aria-pressed={use === false}>
          他不用（摇头）
        </button>
      </div>
      {use && <RolePick s={s} value={role} onPick={setRole} />}
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
      <BottomBar wide>
        <button
          className="btn btn-primary btn-block"
          disabled={use === null || (use && !role)}
          onClick={() => done({ kind: 'courtier', role: use ? role : null })}
        >
          {use === false ? '他不用，下一步' : use && role ? '完成，下一步' : use ? '先点出他指的角色' : '先问他用不用'}
        </button>
      </BottomBar>
    </>
  );
}

function GamblerStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const [t, setT] = useState<number[]>([]);
  const [role, setRole] = useState<RoleId | null>(null);
  const right = t.length && role ? seatOf(s, t[0]).role === role : null;
  const bad = malfunction(s, actor.n) || !!goonTriggered(s, actor, t, 'gambler');
  return (
    <>
      <DoBox items={[wake(actor.n), '让他指一名玩家，再在角色表上指一个角色。你在下面点出来。', sleep]} />
      <SayBox lines={slotLines('gambler', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={[actor.n]} label="他指了谁？" />
      <GoonNote s={s} actor={actor} picks={t} slot="gambler" />
      {t.length > 0 && <RolePick s={s} value={role} onPick={setRole} />}
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
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={right === null} onClick={() => role && done({ kind: 'gambler', target: t[0], role })}>
          {right === null ? '先点出他指的人和角色' : '完成，下一步'}
        </button>
      </BottomBar>
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
  return (
    <>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox
        items={[
          wake(actor.n),
          c ? (
            <>
              用手指向 <b>{seatName(c.value.seat)}</b>，点「给她看」：<b>【{roleName(c.value.role)}】</b>。这是她的孙子。
            </>
          ) : null,
          sleep,
        ]}
      />
      <SayBox lines={slotLines('grandmother', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
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
  return (
    <>
      {prev !== null && pv && (
        <div className={`card${pv.dies && !bad ? ' card-evil' : ''}`}>
          <b>上一个被普卡毒的 {seatName(prev)}：</b>
          <p>{bad ? '普卡今晚中毒/醉酒：他不会死，也不会有新的人中毒。' : pv.text}</p>
        </div>
      )}
      <DoBox items={[wake(actor.n), '让他指一名玩家（这个人中毒，下一晚死）。你在下面点出来。', sleep]} />
      <SayBox lines={slotLines('pukka', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker s={s} selected={t} max={1} onChange={setT} label="他指了谁？" />
      <GoonNote s={s} actor={actor} picks={t} slot="pukka" />
      {s.night === 1 && <p className="dim">第一晚只下毒，没有人会死。</p>}
      <Tips role="pukka" />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!t.length} onClick={() => done({ kind: 'target', target: t[0] })}>
          {t.length ? `确认：${seatName(t[0])} 中毒，下一步` : '先点出他指的人'}
        </button>
      </BottomBar>
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
  return (
    <>
      <DoBox items={[wake(actor.n), '让他指两名玩家，你在下面点出来。', sleep]} />
      <SayBox lines={slotLines('shabaloth', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
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
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={t.length < 2} onClick={() => done({ kind: 'shabaloth', picks: t, revive })}>
          {t.length < 2 ? '先点出他指的两个人' : `完成${revive ? `：${seatName(revive)} 复活` : ''}，下一步`}
        </button>
      </BottomBar>
    </>
  );
}

function PoStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const [t, setT] = useState<number[]>([]);
  const need = s.poCharged ? 3 : 1;
  const bad = malfunction(s, actor.n) || !!goonTriggered(s, actor, t, 'po');
  return (
    <>
      {s.poCharged && (
        <div className="card card-evil">
          <b>他上次没有选人：今晚要选三名玩家，他们都会死。</b>
        </div>
      )}
      <DoBox items={[wake(actor.n), s.poCharged ? '让他指三名玩家，你在下面点出来。' : '让他指一名玩家；他也可以不选（下一晚就能选三个）。', sleep]} />
      <SayBox lines={slotLines('po', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker s={s} selected={t} max={need} onChange={setT} label={s.poCharged ? '他要杀哪三个人？' : '他要杀谁？'} />
      <GoonNote s={s} actor={actor} picks={t} slot="po" />
      {t.length === need && (
        <Reveal key={[...t].sort().join()}>
          <div className={`card${bad ? '' : ' card-evil'}`}>{bad ? <p>珀中毒/醉酒：没有人会死。</p> : t.map((n) => <p key={n}>{killPreview(s, n).text}</p>)}</div>
        </Reveal>
      )}
      <Tips role="po" />
      <BottomBar wide>
        {!s.poCharged && t.length === 0 && (
          <button className="btn btn-ghost" onClick={() => done({ kind: 'po', picks: [] })}>
            他今晚不选
          </button>
        )}
        <button className="btn btn-primary grow" disabled={t.length !== need} onClick={() => done({ kind: 'po', picks: t })}>
          {t.length === need ? '完成，下一步' : `先点出他指的${need === 3 ? '三个' : ''}人`}
        </button>
      </BottomBar>
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
      <DoBox items={[wake(actor.n), `问他今晚要不要用能力（整局一次）。要用就让他指${prof ? '一名死去的玩家' : '一名玩家'}。`, sleep]} />
      <SayBox lines={slotLines(slot, s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <div className="seg" role="radiogroup">
        <button className={use === true ? 'on' : ''} onClick={() => setUse(true)} aria-pressed={use === true}>
          他要用
        </button>
        <button className={use === false ? 'on' : ''} onClick={() => setUse(false)} aria-pressed={use === false}>
          他不用（摇头）
        </button>
      </div>
      {use && <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={blocked} label={prof ? '他指了哪个死人？' : '他指了谁？'} />}
      {use && <GoonNote s={s} actor={actor} picks={t} slot={slot} />}
      {use && result && (
        <div className={`card${!prof && x?.alive && !bad ? ' card-evil' : ''}`}>
          <p>{result}</p>
        </div>
      )}
      <Tips role={slot} />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={use === null || (use && !t.length)} onClick={() => done(use ? { kind: 'target', target: t[0] } : { kind: 'none' })}>
          {use === false ? '他不用，下一步' : use && t.length ? '完成，下一步（能力用掉了）' : use ? '先点出他指的人' : '先问他用不用'}
        </button>
      </BottomBar>
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
          {who ? `完成：${seatName(who)} 死亡` : '先选谁死'}
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
