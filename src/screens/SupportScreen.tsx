// Support screen (SPEC 1.3 support): tanker, AWACS, carrier and JTAC, one section per kind.
// Owner: P5. Default export, no props. The displayed side comes first; the opposing side is shown
// only in creator view (SPEC 1.3). Hidden support assets are already removed by applyViewMode (G11).
import { useTranslation } from 'react-i18next';
import { toMHz } from '../analysis/frequencyConflicts';
import { isPositionResolved } from '../analysis/position';
import { EmptyState } from '../shell/EmptyState';
import { SideMark } from '../shell/SideMark';
import { Unresolved } from '../shell/Unresolved';
import { useMission } from '../shell/MissionContext';
import { useUnits } from '../shell/units';
import { useWorkspace } from '../shell/workspace';
import type { Side, SupportAsset } from '../types/mission';

const KINDS: readonly SupportAsset['kind'][] = ['tanker', 'awacs', 'carrier', 'jtac'];

export default function SupportScreen() {
  const { t } = useTranslation();
  const { view, side, viewMode } = useMission();
  const opposing: Side = side === 'blue' ? 'red' : 'blue';
  const ownAssets = view.coalitions[side].support;
  const opposingAssets = viewMode === 'creator' ? view.coalitions[opposing].support : [];

  if (ownAssets.length === 0 && opposingAssets.length === 0) {
    return <EmptyState title={t('support:empty.title')} body={t('support:empty.body')} />;
  }

  return (
    <div className="support-screen">
      <SupportSide side={side} assets={ownAssets} />
      {opposingAssets.length > 0 && (
        <details className="support-opposing">
          <summary>{t('support:opposing', { count: opposingAssets.length })}</summary>
          <SupportSide side={opposing} assets={opposingAssets} />
        </details>
      )}
    </div>
  );
}

function SupportSide({ side, assets }: { side: Side; assets: SupportAsset[] }) {
  const { t } = useTranslation();
  return (
    <section className="support-side" aria-label={t(`shell:side.${side}`)}>
      <h2 className="support-heading"><SideMark side={side} /></h2>
      {assets.length === 0 && <p className="support-muted">{t('support:none')}</p>}
      {KINDS.map(kind => {
        const items = assets
          .map((asset, index) => ({ asset, index }))
          .filter(item => item.asset.kind === kind);
        if (items.length === 0) return null;
        const headingId = `support-${side}-${kind}`;
        return (
          <section key={kind} className="support-kind" aria-labelledby={headingId}>
            <h3 id={headingId} className="support-subheading">{t(`support:kinds.${kind}`)}</h3>
            <ul className="support-list">
              {items.map(item => (
                <SupportItem
                  key={`${side}:${item.index}`}
                  side={side}
                  asset={item.asset}
                  anchor={`support:${side}:${item.index}`}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}

function SupportItem({ side, asset, anchor }: { side: Side; asset: SupportAsset; anchor: string }) {
  const { t } = useTranslation();
  const units = useUnits();
  const { setScreen } = useWorkspace();

  // data-anchor is the target of a lint finding's "この箇所へ" (LintFinding.anchor, see lint.ts).
  return (
    <li className="support-item" data-anchor={anchor}>
      <p className="support-callsign"><SideMark side={side} /> <strong>{asset.callsign}</strong></p>
      <dl className="support-dl">
        <div className="support-dl-row">
          <dt>{t('support:field.frequency')}</dt>
          <dd>
            {asset.frequency ? (
              <button
                type="button"
                className="support-link comms-num"
                title={t('support:toComms')}
                onClick={() => setScreen('comms')}
              >
                {toMHz(asset.frequency).toFixed(3)} MHz
              </button>
            ) : '—'}
          </dd>
        </div>
        <div className="support-dl-row">
          <dt>{t('support:field.tacan')}</dt>
          <dd className="comms-num">{asset.tacan ? `${asset.tacan.channel} ${asset.tacan.mode}` : '—'}</dd>
        </div>
        {asset.icls && (
          <div className="support-dl-row">
            <dt>{t('support:field.icls')}</dt>
            <dd className="comms-num">{String(asset.icls.channel)}</dd>
          </div>
        )}
        {asset.orbit && (
          <>
            <div className="support-dl-row">
              <dt>{t('support:field.altitude')}</dt>
              <dd className="comms-num">{units.alt(asset.orbit.altitude)}</dd>
            </div>
            <div className="support-dl-row">
              <dt>{t('support:field.speed')}</dt>
              <dd className="comms-num">{units.speed(asset.orbit.speed)}</dd>
            </div>
          </>
        )}
        <div className="support-dl-row">
          <dt>{t('support:field.position')}</dt>
          <dd>
            {isPositionResolved(asset)
              ? units.coord(asset.latlon)
              : <Unresolved xy={asset.position} />}
          </dd>
        </div>
      </dl>
    </li>
  );
}
