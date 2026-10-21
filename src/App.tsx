import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { currentSlot, slotActor } from './engine/flow';
import { SLOT_TITLE } from './engine/scripts';
import { useGame } from './store';
import type { GameState } from './engine/types';
import { ConfirmButton, Sheet, ShowCard, TableCtx, UiCtx, useTableState, type CardContent, type Ui } from './ui/common';
import { DayScreen } from './ui/Day';
import { DealScreen } from './ui/Deal';
import { EndScreen, LogView, Overlay, RolesRef, RulesSpeech, ScriptSheet } from './ui/End';
import { GrimoirePanel, SpyView, phaseText } from './ui/Grimoire';
import { Icon } from './ui/icons';
import { MiniGrimoire, NightScreen, nightProgress } from './ui/Night';
import { SetupScreen } from './ui/Setup';
import { Cover, TimerCtx, useTimerState } from './ui/Timer';

type Panel = 'grimoire' | 'cover' | 'menu' | 'roles' | 'rules' | 'log' | 'sheet' | null;

export default function App() {
  const g = useGame();
  const s = g.s;
  const timer = useTimerState();
  const [panel, setPanel] = useState<Panel>(null);
  const [card, setCard] = useState<{ c: CardContent; onDone?: () => void } | null>(null);
  const [spy, setSpy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const lastUndo = useRef(0);
  const table = useTableState();

  // 翻到新的一步（夜里换步骤、天亮、处决之后、发下一张身份……）就回到页面顶部，标题和关键提醒一打开就在眼前
  const screenKey = [
    s.phase, s.setupStep, s.dealIndex, s.night, s.ns?.slot ?? '',
    s.phase === 'night' && s.ns ? slotActor(s, currentSlot(s))?.n ?? '' : '',
    s.executed === undefined ? '' : 'x', s.winner ?? '',
  ].join('|');
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [screenKey]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // 每个白天的讨论计时都从头开始（新开一局、入夜时也清零）
  useEffect(() => timer.syncDay(s.phase === 'day' ? s.night : 0), [s.phase, s.night]); // eslint-disable-line react-hooks/exhaustive-deps

  const ui = useMemo<Ui>(
    () => ({
      showCard: (c, onDone) => setCard({ c, onDone }),
      openSpy: () => setSpy(true),
      toast: setToast,
    }),
    [],
  );

  const sub =
    s.phase === 'night'
      ? SLOT_TITLE[currentSlot(s)]
      : s.phase === 'day'
        ? '白天'
        : s.phase === 'deal'
          ? `${s.dealIndex + 1} / ${s.seats.length}`
          : s.phase === 'setup'
            ? '开局设置'
            : '复盘';
  // 手机上夜晚的步数写在顶栏（页面里那一行让给迷你魔典）
  const prog = s.phase === 'night' && s.ns ? nightProgress(s) : null;
  const hasSeats = s.seats.length > 0 && !(s.phase === 'setup' && s.setupStep === 'count');
  // 首页（选剧本）没有可撤销、可计时的东西
  const home = s.phase === 'setup' && s.setupStep === 'script';

  let screen;
  if (s.phase === 'setup') screen = <SetupScreen g={g} onRules={() => setPanel('rules')} onRoles={() => setPanel('roles')} onSheet={() => setPanel('sheet')} />;
  else if (s.phase === 'deal') screen = <DealScreen g={g} />;
  else if (s.phase === 'night') screen = <NightScreen g={g} />;
  else if (s.phase === 'day') screen = <DayScreen g={g} />;
  else screen = <EndScreen g={g} />;

  return (
    <UiCtx.Provider value={ui}>
      <TableCtx.Provider value={table}>
      <TimerCtx.Provider value={timer}>
        <div className="app">
          <header className="topbar">
            <div className="title">
              <b>{s.phase === 'setup' ? '钟楼说书人' : phaseText(s)}</b>
              <small>
                {sub}
                {prog && <span className="phone-only">{` · 第 ${prog.pos} 步 / 共约 ${prog.visible.length} 步`}</span>}
              </small>
            </div>
            {!home && <button
              className="icon-btn"
              aria-label="撤销上一步"
              title="撤销上一步"
              disabled={!g.canUndo}
              onClick={() => {
                // 防连点：快速点两下只撤销一步
                const now = Date.now();
                if (now - lastUndo.current < 700) return;
                lastUndo.current = now;
                const back = g.prev;
                g.undo();
                setToast(back ? `已撤销，回到：${whereText(back)}` : '已撤销一步');
              }}
            >
              <Icon name="undo" />
            </button>}
            {hasSeats && (
              <button className="icon-btn" aria-label="魔典" title="魔典" onClick={() => setPanel('grimoire')}>
                <Icon name="book" />
              </button>
            )}
            {!home && (
              <button className="icon-btn" aria-label="一键盖屏，只显示计时器" title="一键盖屏，只显示计时器" onClick={() => setPanel('cover')}>
                <Icon name="timer" />
              </button>
            )}
            <button className="icon-btn" aria-label="菜单" title="菜单" onClick={() => setPanel('menu')}>
              <Icon name="menu" />
            </button>
            {prog && <MiniGrimoire s={s} onOpen={() => setPanel('grimoire')} />}
          </header>
          {screen}
        </div>

        {panel === 'grimoire' && (
          <Overlay title="魔典" onClose={() => setPanel(null)}>
            <GrimoirePanel s={s} detail />
          </Overlay>
        )}
        {panel === 'roles' && <RolesRef script={s.script} onClose={() => setPanel(null)} />}
        {panel === 'rules' && <RulesSpeech script={s.script} onClose={() => setPanel(null)} />}
        {panel === 'log' && <LogView s={s} onClose={() => setPanel(null)} />}
        {panel === 'sheet' && <ScriptSheet script={s.script} onClose={() => setPanel(null)} />}
        {panel === 'menu' && (
          <Sheet title="菜单" onClose={() => setPanel(null)}>
            <div className="stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>台词风格</span>
                <div className="seg">
                  <button className={s.style === 'simple' ? 'on' : ''} onClick={() => g.tweak((st) => (st.style = 'simple'))}>
                    简洁
                  </button>
                  <button className={s.style === 'atmo' ? 'on' : ''} onClick={() => g.tweak((st) => (st.style = 'atmo'))}>
                    氛围
                  </button>
                </div>
              </div>
              <button className="btn btn-ghost btn-block" onClick={() => setPanel('log')}>
                本局记录
              </button>
              <button className="btn btn-ghost btn-block" onClick={() => setPanel('sheet')}>
                剧本图（可以发给玩家）
              </button>
              <button className="btn btn-ghost btn-block" onClick={() => setPanel('roles')}>
                角色速查
              </button>
              <button className="btn btn-ghost btn-block" onClick={() => setPanel('rules')}>
                规则讲稿
              </button>
              <ConfirmButton
                label="新开一局"
                confirmLabel="再点一次：清空本局，重新开始"
                onConfirm={() => {
                  g.reset();
                  setPanel(null);
                }}
              />
            </div>
          </Sheet>
        )}
        {panel === 'cover' && <Cover onBack={() => setPanel(null)} />}
        {spy && <SpyView s={s} onDone={() => setSpy(false)} />}
        {card && (
          <ShowCard
            c={card.c}
            onDone={() => {
              const f = card.onDone;
              setCard(null);
              f?.();
            }}
          />
        )}
        {toast && <div className="toast" role="status">{toast}</div>}
      </TimerCtx.Provider>
      </TableCtx.Provider>
    </UiCtx.Provider>
  );
}

/** 撤销提示里说回到了哪一步 */
function whereText(s: GameState): string {
  if (s.phase === 'night') return `${phaseText(s)} · ${SLOT_TITLE[currentSlot(s)]}`;
  if (s.phase === 'deal') return `发身份（${s.dealIndex + 1} / ${s.seats.length}）`;
  if (s.phase === 'setup') return '开局设置';
  return phaseText(s);
}
