// Owner: P4 (概要とブリーフィング). Overview screen (SPEC 1.3, F5 list, F7 TOT).
// Contract: default export, no props. Reads only through useMission() (view, side, viewMode)
// and useUnits(); navigation goes through useWorkspace(). Pilot view never shows the opposing
// side's task text, flights, bullseye or threat screen (D1); the displayed mission is `view`.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { lintMission } from '../analysis/lint';
import { buildTot } from '../analysis/tot';
import { isResolvedLatLon, taskTextFor, weatherConditionPairs, type Translate } from '../briefing/slides';
import { issueText, issueTextList } from '../core/issueText';
import { Notice } from '../shell/Notice';
import { SideMark } from '../shell/SideMark';
import { Unresolved } from '../shell/Unresolved';
import { useMission } from '../shell/MissionContext';
import { useUnits } from '../shell/units';
import { useWorkspace } from '../shell/workspace';
import type { LintFinding } from '../types/lint';
import type { IssueSeverity, MissionData, Side } from '../types/mission';
import { CREATOR_ONLY_SCREENS } from '../types/screen';
import { getMoonInfo, getSunTimes } from '../utils/astro';
import { buildMetar } from '../utils/metar';
import { formatDateYMD, formatUtcOffset, missionLocalDate, missionZuluDate } from '../utils/time';
import { lintRulesReady } from './overviewStatus';

const SEVERITY_ORDER: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };
const SEVERITY_SYMBOL: Record<IssueSeverity, string> = { error: '×', warning: '▲', info: 'i' };
/** Weather values that were filled with defaults; listed with the info items (SPEC 1.3). */
const DEFAULTED_CODES: ReadonlySet<string> = new Set(['weather.qnhDefaulted', 'weather.temperatureDefaulted']);
const TOT_PREVIEW_ROWS = 10;
const MS_PER_DAY = 86400000;

function sortFindings(findings: readonly LintFinding[]): LintFinding[] {
  return [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/**
 * Threat items are creator-only (SPEC 5.1, D1). In pilot view neither their checks nor their
 * issues are shown, so the overview hides them there. A check is a threat check when its screen
 * is creator-only or its rule is L8 (unrecorded threat range, SPEC 5.1 F5), wherever P5 routes it.
 */
const THREAT_LINT_CODES: ReadonlySet<string> = new Set(['L8']);

function isCreatorOnlyIssueCode(code: string): boolean {
  return code.startsWith('threat.');
}

function isCreatorOnlyFinding(finding: LintFinding): boolean {
  return CREATOR_ONLY_SCREENS.includes(finding.screen) || THREAT_LINT_CODES.has(finding.code);
}

interface LoadNotice {
  key: string;
  severity: Exclude<IssueSeverity, 'info'>;
  text: string;
  side: Side | null;
}

/**
 * Warnings and errors of the file as it was read (SPEC 3: issues are the warning kind).
 * Info items and the defaulted weather values are listed in the defaults section instead.
 */
function loadNotices(issues: MissionData['issues'], hideCreatorOnly: boolean): LoadNotice[] {
  const seen = new Set<string>();
  const notices: LoadNotice[] = [];
  for (const issue of issues) {
    if (issue.severity === 'info' || DEFAULTED_CODES.has(issue.code)) continue;
    if (hideCreatorOnly && isCreatorOnlyIssueCode(issue.code)) continue;
    const text = issueText(issue);
    const key = `${issue.severity}|${issue.side ?? ''}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    notices.push({
      key,
      severity: issue.severity,
      text,
      side: issue.side && issue.side !== 'neutral' ? issue.side : null,
    });
  }
  return notices.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Whole days between the reference clock and a point's clock (the TOT date mark, F7). */
function dayShift(date: Date, reference: Date): number {
  return Math.round((Date.parse(formatDateYMD(date)) - Date.parse(formatDateYMD(reference))) / MS_PER_DAY);
}

export default function OverviewScreen() {
  const { t } = useTranslation(['overview', 'shell', 'lint']);
  const { view, side, viewMode, settings } = useMission();
  const { setScreen, setFlightKey } = useWorkspace();
  const units = useUnits();
  const [totExpanded, setTotExpanded] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const { meta, weather, coalitions } = view;
  const localDate = missionLocalDate(meta);
  const zuluDate = missionZuluDate(meta);
  const bullseye = coalitions[side].bullseye;
  // The enemy bullseye arrives with latlonResolved false (SPEC 3): never draw it.
  const bullseyeResolved = isResolvedLatLon(bullseye.latlon, bullseye.latlonResolved);
  const sunTimes = bullseyeResolved ? getSunTimes(zuluDate, bullseye.latlon[0], bullseye.latlon[1]) : null;
  const moonInfo = bullseyeResolved ? getMoonInfo(zuluDate, bullseye.latlon[0], bullseye.latlon[1]) : null;
  const metar = buildMetar(weather, { time: zuluDate });
  const taskText = taskTextFor(meta, side);
  const countSides: readonly Side[] = viewMode === 'creator' ? ['blue', 'red'] : [side];
  const pilot = viewMode === 'pilot';
  const lintReady = lintRulesReady();

  // Pilot view drops the threat checks and threat issues (SPEC 5.1, D1); the rest of the list stays.
  const findings = useMemo(
    () => sortFindings(lintMission(view)).filter(finding => !pilot || !isCreatorOnlyFinding(finding)),
    [view, pilot],
  );
  const tot = useMemo(() => buildTot(view, side), [view, side]);
  const notices = useMemo(() => loadNotices(view.issues, pilot), [view.issues, pilot]);
  const defaultTexts = useMemo(() => issueTextList(
    view.issues.filter(issue => (issue.severity === 'info' || DEFAULTED_CODES.has(issue.code))
      && !(pilot && isCreatorOnlyIssueCode(issue.code))),
  ), [view.issues, pilot]);
  const translate: Translate = (key, values) => String(t(key, values));
  // The TOT clock follows the time display setting: Zulu dates when only Zulu is shown (F7).
  const totReference = settings.timeDisplay === 'zulu' ? zuluDate : localDate;

  const na = t('overview:notAvailable');
  const cloudLabel = weather.clouds.label.trim() || na;
  const timeOf = (date: Date | null | undefined): string => (
    date ? units.time((date.getTime() - zuluDate.getTime()) / 1000) : na
  );
  const rangeOf = (from: Date | null | undefined, to: Date | null | undefined): string => (
    from && to ? t('overview:astro.range', { from: timeOf(from), to: timeOf(to) }) : na
  );

  const visibleTot = totExpanded ? tot.rows : tot.rows.slice(0, TOT_PREVIEW_ROWS);
  const hasNear = tot.rows.some(row => row.near.length > 0);

  function openFinding(finding: LintFinding) {
    if (finding.flightKey) setFlightKey(finding.flightKey);
    setScreen(finding.screen);
  }

  async function copyMetar() {
    try {
      await navigator.clipboard.writeText(metar);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <div className="overview">
      <header className="overview-head">
        <div className="overview-head-text">
          <h2 className="overview-title" title={meta.sortie}>{meta.sortie.trim() || t('overview:untitled')}</h2>
          <p className="overview-meta">
            <span>{t('overview:theatre')}: {meta.theatre || na}</span>
            <span>{formatDateYMD(localDate)} {units.time(0)} ({formatUtcOffset(meta.utcOffset)})</span>
            <span>{t('overview:meVersion')}: {meta.meVersion || na}</span>
          </p>
          <dl className="overview-counts">
            {countSides.map(countSide => (
              <div key={countSide} className="overview-count">
                <dt><SideMark side={countSide} /></dt>
                <dd>{t('overview:flightCount', { count: coalitions[countSide].flights.length })}</dd>
              </div>
            ))}
          </dl>
        </div>
        <nav className="overview-actions" aria-label={t('overview:actions.label')}>
          <button type="button" className="overview-button" onClick={() => setScreen('flights')}>
            {t('overview:actions.flights')}
          </button>
          <button type="button" className="overview-button is-primary" onClick={() => setScreen('briefing')}>
            {t('overview:actions.briefing')}
          </button>
          <button type="button" className="overview-button" onClick={() => setScreen('export')}>
            {t('overview:actions.export')}
          </button>
        </nav>
      </header>

      <section className="overview-section" aria-labelledby="overview-task-title">
        <h3 id="overview-task-title">{t('overview:task.title')}</h3>
        {taskText
          ? <p className="overview-task-text">{taskText}</p>
          : <p className="overview-muted">{t('overview:task.none')}</p>}
      </section>

      <div className="overview-grid">
        <section className="overview-section" aria-labelledby="overview-lint-title">
          <h3 id="overview-lint-title">{t('overview:lint.title')}</h3>
          {findings.length > 0 ? (
            <ul className="overview-list overview-lint-list">
              {findings.map(finding => {
                // A rule without a message yet shows its code, not a raw i18n key (lint is P5's namespace).
                const text = t(`lint:${finding.code}`, { ...finding.params, defaultValue: finding.code });
                return (
                  <li key={finding.id} className="overview-lint-row">
                    <span className="overview-lint-severity" data-severity={finding.severity}>
                      <span aria-hidden="true">{SEVERITY_SYMBOL[finding.severity]}</span>
                      {' '}{t(`overview:lint.severity.${finding.severity}`)}
                    </span>
                    <SideMark side={finding.side} />
                    <span className="overview-lint-text">{text}</span>
                    <button
                      type="button"
                      className="overview-link-button"
                      aria-label={`${t('overview:lint.goto')}（${text}）`}
                      onClick={() => openFinding(finding)}
                    >
                      {t('overview:lint.goto')}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : lintReady ? (
            <Notice tone="success">{t('overview:lint.none', { count: defaultTexts.length })}</Notice>
          ) : (
            // Until the rules exist (P5), "no problems" would be a false all-clear.
            <Notice tone="info">{t('overview:lint.notChecked')}</Notice>
          )}
        </section>

        <section className="overview-section" aria-labelledby="overview-weather-title">
          <h3 id="overview-weather-title">{t('overview:weather.title')}</h3>
          <dl className="overview-pairs">
            <div><dt>{t('overview:weather.temperature')}</dt><dd>{units.temp(weather.temperature)}</dd></div>
            <div><dt>{t('overview:weather.qnh')}</dt><dd>{units.pressure(weather.qnh)}</dd></div>
            <div><dt>{t('overview:weather.visibility')}</dt><dd>{units.distance(weather.visibility)}</dd></div>
            <div>
              <dt>{t('overview:weather.clouds')}</dt>
              <dd>{cloudLabel}（{t('overview:weather.cloudBase', { value: units.alt(weather.clouds.base) })}）</dd>
            </div>
            {weatherConditionPairs(weather, units, translate, 'overview').map(pair => (
              <div key={pair.label}>
                <dt>{pair.label}</dt>
                <dd>{pair.value}</dd>
              </div>
            ))}
          </dl>
          <div className="overview-table-wrap">
            <table className="overview-table">
              <caption className="visually-hidden">{t('overview:weather.wind')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('overview:weather.windLevelHeader')}</th>
                  <th scope="col">{t('overview:weather.windDirection')}</th>
                  <th scope="col" className="num">{t('overview:weather.windSpeed')}</th>
                </tr>
              </thead>
              <tbody>
                {weather.wind.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="overview-muted">{na}</td>
                  </tr>
                ) : weather.wind.map(layer => (
                  <tr key={layer.level}>
                    <th scope="row">{t(`overview:weather.windLevel.${layer.level}`)}</th>
                    <td>{units.wind(layer.to)}</td>
                    <td className="num">{units.speed(layer.speed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overview-metar">
            <p><span className="overview-label">{t('overview:weather.metar')}</span> <code>{metar}</code></p>
            <button type="button" className="overview-button" onClick={copyMetar}>
              {t('overview:weather.copyMetar')}
            </button>
            {copyState === 'copied' && <Notice tone="success">{t('overview:weather.copied')}</Notice>}
            {copyState === 'failed' && <Notice tone="error">{t('overview:weather.copyFailed')}</Notice>}
          </div>
        </section>
      </div>

      <section className="overview-section" aria-labelledby="overview-load-title">
        <h3 id="overview-load-title">{t('overview:load.title')}</h3>
        {notices.length === 0 ? (
          <p className="overview-muted">{t('overview:load.none')}</p>
        ) : (
          <ul className="overview-list overview-load-list">
            {notices.map(notice => (
              <li key={notice.key} className="overview-load-row">
                <span className="overview-lint-severity" data-severity={notice.severity}>
                  <span aria-hidden="true">{SEVERITY_SYMBOL[notice.severity]}</span>
                  {' '}{t(`overview:lint.severity.${notice.severity}`)}
                </span>
                {notice.side && <SideMark side={notice.side} />}
                <span className="overview-lint-text">{notice.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="overview-grid">
        <section className="overview-section" aria-labelledby="overview-astro-title">
          <h3 id="overview-astro-title">{t('overview:astro.title')}</h3>
          <p className="overview-bullseye">
            <span className="overview-label">{t('overview:astro.bullseye')}</span>{' '}
            {bullseyeResolved
              ? units.coord(bullseye.latlon)
              : <Unresolved xy={bullseye.xy} />}
          </p>
          <dl className="overview-pairs">
            <div><dt>{t('overview:astro.sunrise')}</dt><dd>{timeOf(sunTimes?.sunrise)}</dd></div>
            <div><dt>{t('overview:astro.sunset')}</dt><dd>{timeOf(sunTimes?.sunset)}</dd></div>
            <div><dt>{t('overview:astro.civilTwilight')}</dt><dd>{rangeOf(sunTimes?.dawn, sunTimes?.dusk)}</dd></div>
            <div>
              <dt>{t('overview:astro.nauticalTwilight')}</dt>
              <dd>{rangeOf(sunTimes?.nauticalDawn, sunTimes?.nauticalDusk)}</dd>
            </div>
            <div>
              <dt>{t('overview:astro.moonAge')}</dt>
              <dd>{moonInfo ? t('overview:astro.moonAgeValue', { days: moonInfo.ageDays.toFixed(1) }) : na}</dd>
            </div>
          </dl>
        </section>

        <section className="overview-section" aria-labelledby="overview-defaults-title">
          <h3 id="overview-defaults-title">{t('overview:defaults.title')}</h3>
          {defaultTexts.length === 0
            ? <p className="overview-muted">{t('overview:defaults.none')}</p>
            : (
              <ul className="overview-list">
                {defaultTexts.map(text => <li key={text}>{text}</li>)}
              </ul>
            )}
        </section>
      </div>

      <section className="overview-section" aria-labelledby="overview-tot-title">
        <h3 id="overview-tot-title">{t('overview:tot.title')}</h3>
        {tot.rows.length === 0 ? (
          <p className="overview-muted">{t('overview:tot.empty')}</p>
        ) : (
          <>
            <div className="overview-table-wrap">
              <table className="overview-table overview-tot">
                <thead>
                  <tr>
                    <th scope="col">{t('overview:tot.time')}</th>
                    <th scope="col">{t('overview:tot.callsign')}</th>
                    <th scope="col">{t('overview:tot.point')}</th>
                    <th scope="col">{t('overview:tot.position')}</th>
                    <th scope="col">{t('overview:tot.near')}</th>
                    <th scope="col"><span className="visually-hidden">{t('overview:tot.open')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTot.map(row => {
                    const shift = dayShift(
                      settings.timeDisplay === 'zulu' ? row.zuluDate : row.localDate,
                      totReference,
                    );
                    return (
                      <tr key={`${row.flightKey}-${row.pointIndex}`}>
                        <td className="num">
                          {units.time(row.eta)}
                          {shift !== 0 && (
                            <span className="overview-day-shift"> {t('overview:tot.dayShift', { count: shift })}</span>
                          )}
                        </td>
                        <td>{row.callsign}</td>
                        <td>{row.pointName || na}</td>
                        <td>
                          {row.resolved
                            ? units.coord(row.latlon, row.aircraftType)
                            : <Unresolved xy={row.xy} />}
                        </td>
                        <td>
                          {row.near.length > 0 && (
                            <span className="overview-near">
                              <span aria-hidden="true">▲</span> {t('overview:tot.near')}: {row.near.map(item => item.callsign).join(', ')}
                            </span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="overview-link-button"
                            aria-label={`${t('overview:tot.open')}（${row.callsign}）`}
                            onClick={() => {
                              setFlightKey(row.flightKey);
                              setScreen('flights');
                            }}
                          >
                            {t('overview:tot.open')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {hasNear && <p className="overview-muted">{t('overview:tot.nearRule')}</p>}
            {tot.rows.length > TOT_PREVIEW_ROWS && (
              <button type="button" className="overview-button" onClick={() => setTotExpanded(!totExpanded)}>
                {totExpanded ? t('overview:tot.showLess') : t('overview:tot.showAll', { count: tot.rows.length })}
              </button>
            )}
          </>
        )}
        {tot.zeroEtaCount > 0 && (
          <p className="overview-muted">{t('overview:tot.zeroEta', { count: tot.zeroEtaCount })}</p>
        )}
      </section>
    </div>
  );
}
