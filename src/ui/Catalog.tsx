import { useState } from 'react';
import { CATALOG, type CatalogTeam } from '../engine/catalog';
import { FABLED, ROLES, type FabledId, type RoleId } from '../engine/roles';
import { Overlay } from './End';

const TABS: { team: CatalogTeam; label: string }[] = [
  { team: 'townsfolk', label: '镇民' },
  { team: 'outsider', label: '外来者' },
  { team: 'minion', label: '爪牙' },
  { team: 'demon', label: '恶魔' },
  { team: 'traveller', label: '旅行者' },
  { team: 'fabled', label: '传奇' },
  { team: 'loric', label: 'Loric' },
];
const EDITIONS = ['暗流涌动', '暗月初升', '梦殒春宵', '实验性角色', '—'];

const supported = (id: string) => id in ROLES || id in FABLED || id === 'godofug-ug-mode';
const abilityOf = (id: string, fallback?: string) =>
  id in ROLES ? ROLES[id as RoleId].ability : id in FABLED ? FABLED[id as FabledId].ability : (fallback ?? '');

/** 角色大全：官方全部角色，标出网页已经做好的（能拿来自由配板） */
export function Catalog({ onClose, onCustom }: { onClose: () => void; onCustom: () => void }) {
  const [team, setTeam] = useState<CatalogTeam>('townsfolk');
  const [onlyOk, setOnlyOk] = useState(false);
  const list = CATALOG.filter((x) => x.team === team && (!onlyOk || supported(x.id))).sort(
    (a, b) => Number(supported(b.id)) - Number(supported(a.id)) || EDITIONS.indexOf(a.edition) - EDITIONS.indexOf(b.edition),
  );
  const ok = CATALOG.filter((x) => supported(x.id)).length;
  return (
    <Overlay title="角色大全" onClose={onClose}>
      <p className="dim" style={{ marginBottom: 10 }}>
        官方一共 {CATALOG.length} 个角色，网页已经能带的有 {ok} 个（标"能用"）。能用的角色都可以拿去自由配板。
      </p>
      <button className="btn btn-primary btn-block" style={{ marginBottom: 12 }} onClick={onCustom}>
        用这些角色自由配板
      </button>
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        {TABS.map((t) => (
          <button key={t.team} className={`btn btn-sm ${t.team === team ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTeam(t.team)}>
            {t.label}
          </button>
        ))}
      </div>
      <label className="row" style={{ gap: 8, marginBottom: 4 }}>
        <input type="checkbox" checked={onlyOk} onChange={(e) => setOnlyOk(e.target.checked)} />
        <span>只看网页能用的</span>
      </label>
      {list.map((x) => (
        <div key={x.id} className="ref-role">
          <h3>
            {x.name}
            <small className="dim" style={{ fontSize: 13, fontWeight: 400 }}>
              {x.en}
            </small>
            <span className={`tag ${supported(x.id) ? 'tag-good' : 'tag-mid'}`} style={{ marginLeft: 'auto' }}>
              {supported(x.id) ? '能用' : '还没做'}
            </span>
          </h3>
          <p>{abilityOf(x.id, x.ability)}</p>
          <p className="dim" style={{ fontSize: 13, marginTop: 4 }}>
            {x.edition === '—' ? '' : x.edition}
          </p>
        </div>
      ))}
      <p className="dim" style={{ marginTop: 12 }}>
        "还没做"的角色能力是白话转述，以官方规则为准。
      </p>
    </Overlay>
  );
}
