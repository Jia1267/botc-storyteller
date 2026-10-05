import { useEffect, useMemo, useState } from 'react';
import { currentSlot } from './engine/flow';
import { SLOT_TITLE } from './engine/scripts';
import { useGame } from './store';
import { ConfirmButton, Sheet, ShowCard, UiCtx, type CardContent, type Ui } from './ui/common';
import { DayScreen } from './ui/Day';
import { DealScreen } from './ui/Deal';
import { EndScreen, LogView, Overlay, RolesRef, RulesSpeech } from './ui/End';
import { GrimoirePanel, SpyView, phaseText } from './ui/Grimoire';
import { Icon } from './ui/icons';
import { NightScreen } from './ui/Night';
import { SetupScreen } from './ui/Setup';
import { Cover, TimerCtx, useTimerState } from './ui/Timer';

type Panel = 'grimoire' | 'cover' | 'menu' | 'roles' | 'rules' | 'log' | null;

export default function App() {
  const g = useGame();
  const s = g.s;
  const timer = useTimerState();
  const [panel, setPanel] = useState<Panel>(null);
  const [card, setCard] = useState<{ c: CardContent; onDone?: () => void } | null>(null);
  const [spy, setSpy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

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
          ? `${s.dealIndex + 1} / ${s.count}`
          : s.phase === 'setup'
            ? '开局设置'
            : '复盘';
  const hasSeats = s.seats.length > 0 && !(s.phase === 'setup' && s.setupStep === 'count');

  let screen;
  if (s.phase === 'setup') screen = <SetupScreen g={g} onRules={() => setPanel('rules')} onRoles={() => setPanel('roles')} />;
  else if (s.phase === 'deal') screen = <DealScreen g={g} />;
  else if (s.phase === 'night') screen = <NightScreen g={g} />;
  else if (s.phase === 'day') screen = <DayScreen g={g} />;
  else screen = <EndScreen g={g} />;

  return (
    <UiCtx.Provider value={ui}>
      <TimerCtx.Provider value={timer}>
        <div className="app">
          <header className="topbar">
            <div className="title">
              <b>{s.phase === 'setup' ? '钟楼说书人' : phaseText(s)}</b>
              <small>{sub}</small>
            </div>
            <button
              className="icon-btn"
              aria-label="撤销上一步"
              title="撤销上一步"
              disabled={!g.canUndo}
              onClick={() => {
                g.undo();
                setToast('已撤销一步');
              }}
            >
              <Icon name="undo" />
            </button>
            {hasSeats && (
              <button className="icon-btn" aria-label="魔典" title="魔典" onClick={() => setPanel('grimoire')}>
                <Icon name="book" />
              </button>
            )}
            <button className="icon-btn" aria-label="一键盖屏" title="一键盖屏" onClick={() => setPanel('cover')}>
              <Icon name="eyeOff" />
            </button>
            <button className="icon-btn" aria-label="菜单" title="菜单" onClick={() => setPanel('menu')}>
              <Icon name="menu" />
            </button>
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
        {panel === 'menu' && (
          <Sheet title="菜单" onClose={() => setPanel(null)}>
            <div className="stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>台词风格</span>
                <div className="seg">
                  <button className={s.style === 'simple' ? 'on' : ''} onClick={() => g.tweak((st) => (st.style = 'simple'))}>
                    <Icon name="sun" size={16} /> 简洁
                  </button>
                  <button className={s.style === 'atmo' ? 'on' : ''} onClick={() => g.tweak((st) => (st.style = 'atmo'))}>
                    <Icon name="moon" size={16} /> 氛围
                  </button>
                </div>
              </div>
              <button className="btn btn-ghost btn-block" onClick={() => setPanel('log')}>
                本局记录
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
    </UiCtx.Provider>
  );
}
