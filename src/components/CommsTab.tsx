import type { MissionData, DisplaySettings, Flight, SupportAsset } from '../types/mission';

/** Frequency comparison tolerance in MHz (1 kHz). */
export const FREQUENCY_MATCH_TOLERANCE_MHZ = 0.001;

/** Common aviation guard channels, kept local until a shared reference source exists. */
const GUARD_FREQUENCIES_MHZ = {
  UHF: 243.000,
  VHF: 121.500,
} as const;

export type CommunicationModulation = 'AM' | 'FM';
export type FrequencyConflictType = 'same-aircraft-preset' | 'different-flight' | 'support';

export interface CommunicationFrequency {
  id: string;
  source: 'flight' | 'support';
  side: 'Blue' | 'Red' | 'Support';
  callsign: string;
  flight?: string;
  flightId?: number;
  unitKey?: string;
  supportKind?: SupportAsset['kind'];
  channel: number;
  frequencyMHz: number;
  modulation: CommunicationModulation;
  name: string;
}

export interface FrequencyConflict {
  key: string;
  frequencyMHz: number;
  modulation: CommunicationModulation;
  users: CommunicationFrequency[];
  types: FrequencyConflictType[];
}

export const FREQUENCY_CONFLICT_LABELS: Record<FrequencyConflictType, string> = {
  'same-aircraft-preset': '同一機体内のプリセット重複',
  'different-flight': '異なる編隊が同じ周波数を使用（意図的な場合もある）',
  support: '支援機（Tanker/AWACS/JTAC）との衝突',
};

interface KeyedItem<T> {
  item: T;
  key: string;
}

interface FrequencyCluster {
  modulation: CommunicationModulation;
  entries: CommunicationFrequency[];
  maximumFrequencyMHz: number;
}

/**
 * Find frequency conflicts while keeping AM and FM on the same nominal
 * frequency separate.  Entries are clustered by adjacent frequency values so
 * that small floating-point differences do not turn into false negatives.
 */
export function detectFrequencyConflicts(
  entries: CommunicationFrequency[],
  toleranceMHz: number = FREQUENCY_MATCH_TOLERANCE_MHZ,
): FrequencyConflict[] {
  const tolerance = Number.isFinite(toleranceMHz) && toleranceMHz >= 0
    ? toleranceMHz
    : FREQUENCY_MATCH_TOLERANCE_MHZ;
  const byModulation = new Map<CommunicationModulation, CommunicationFrequency[]>();

  for (const entry of entries) {
    if (!Number.isFinite(entry.frequencyMHz)) continue;
    const modulationEntries = byModulation.get(entry.modulation) ?? [];
    modulationEntries.push(entry);
    byModulation.set(entry.modulation, modulationEntries);
  }

  const conflicts: FrequencyConflict[] = [];
  for (const [modulation, modulationEntries] of byModulation) {
    const sortedEntries = [...modulationEntries].sort((a, b) => {
      const frequencyDifference = a.frequencyMHz - b.frequencyMHz;
      return frequencyDifference !== 0 ? frequencyDifference : a.id.localeCompare(b.id);
    });
    const clusters: FrequencyCluster[] = [];

    for (const entry of sortedEntries) {
      const current = clusters[clusters.length - 1];
      if (current && entry.frequencyMHz - current.maximumFrequencyMHz <= tolerance) {
        current.entries.push(entry);
        current.maximumFrequencyMHz = entry.frequencyMHz;
      } else {
        clusters.push({
          modulation,
          entries: [entry],
          maximumFrequencyMHz: entry.frequencyMHz,
        });
      }
    }

    for (const cluster of clusters) {
      const types = classifyFrequencyCluster(cluster.entries);
      if (types.length === 0) continue;

      const users = [...cluster.entries].sort((a, b) => a.id.localeCompare(b.id));
      conflicts.push({
        key: `${modulation}:${cluster.entries[0].frequencyMHz.toFixed(6)}:${users.map(user => user.id).join('|')}`,
        frequencyMHz: cluster.entries[0].frequencyMHz,
        modulation,
        users,
        types,
      });
    }
  }

  return conflicts.sort((a, b) => a.frequencyMHz - b.frequencyMHz);
}

function classifyFrequencyCluster(entries: CommunicationFrequency[]): FrequencyConflictType[] {
  if (entries.length < 2) return [];

  const flightEntries = entries.filter(entry => entry.source === 'flight');
  const supportEntries = entries.filter(entry => entry.source === 'support');
  const types: FrequencyConflictType[] = [];

  const entriesByUnit = new Map<string, number>();
  for (const entry of flightEntries) {
    const unitKey = entry.unitKey ?? entry.id;
    entriesByUnit.set(unitKey, (entriesByUnit.get(unitKey) ?? 0) + 1);
  }
  if ([...entriesByUnit.values()].some(count => count > 1)) {
    types.push('same-aircraft-preset');
  }

  const flightIds = new Set(flightEntries.map(entry => `${entry.side}:${entry.flightId ?? entry.id}`));
  if (flightIds.size > 1) {
    types.push('different-flight');
  }

  if (supportEntries.length > 0 && (flightEntries.length > 0 || supportEntries.length > 1)) {
    types.push('support');
  }

  return types;
}

export default function CommsTab({ mission, settings }: CommsTabProps) {
  void settings;
  const allFlights = [...mission.coalitions.blue.flights, ...mission.coalitions.red.flights];
  const allSupport = [...mission.coalitions.blue.support, ...mission.coalitions.red.support];
  const flightRows = createStableKeys(
    allFlights,
    'flight',
    flight => `${getFlightSide(mission, flight)}|${flight.groupId}|${flight.name}|${flight.callsign}|${flight.type}`,
  );
  const supportRows = createStableKeys(
    allSupport,
    'support',
    support => `${support.kind}|${support.callsign}|${support.frequency}|${support.position.join(',')}|${support.tacan?.channel ?? ''}`,
  );
  const frequencyConflicts = detectFrequencyConflicts(collectFrequencyEntries(mission));

  return (
    <div className="tab-panel comms">
      {frequencyConflicts.length > 0 && (
        <section className="section warning">
          <h3>⚠️ 周波数重複</h3>
          <p>同一変調（AM/FM）で、0.001 MHz（1 kHz）以内を同一周波数として判定しています。変調が異なる場合は衝突扱いしません。</p>
          <table className="data-table">
            <thead>
              <tr>
                <th>周波数</th>
                <th>分類</th>
                <th>使用者</th>
              </tr>
            </thead>
            <tbody>
              {frequencyConflicts.map(conflict => (
                <tr key={conflict.key}>
                  <td>{formatFrequencyMHz(conflict.frequencyMHz)} ({conflict.modulation})</td>
                  <td>
                    {conflict.types.map(type => (
                      <div key={type}>{FREQUENCY_CONFLICT_LABELS[type]}</div>
                    ))}
                  </td>
                  <td>{conflict.users.map(formatFrequencyUser).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="section">
        <h3>フライト通信計画</h3>
        {flightRows.map(({ item: flight, key: flightKey }) => {
          const side = getFlightSide(mission, flight);
          const leadUnit = flight.units[0];
          const radioRows = leadUnit
            ? createStableKeys(leadUnit.radios, `radio-${flightKey}`, radio => `${radio.channel}|${radio.frequency}|${radio.modulation}|${radio.name}`)
            : [];

          return (
            <div key={flightKey} className="flight-comms">
              <h4>
                <span className={`side-badge ${side.toLowerCase()}`}>
                  {side}
                </span>
                {flight.callsign} - {flight.name} ({flight.type})
              </h4>
              <p>グループ周波数: {formatFrequencyMHz(toMHz(flight.frequency))} ({formatModulation(flight.modulation)})</p>
              <table className="data-table small">
                <thead>
                  <tr>
                    <th>CH</th>
                    <th>周波数 (MHz)</th>
                    <th>変調</th>
                    <th>名称</th>
                  </tr>
                </thead>
                <tbody>
                  {radioRows.map(({ item: radio, key: radioKey }) => (
                    <tr key={radioKey}>
                      <td>{radio.channel}</td>
                      <td>{radio.frequency.toFixed(3)}</td>
                      <td>{formatModulation(radio.modulation)}</td>
                      <td>{radio.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </section>

      <section className="section">
        <h3>支援機周波数</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>種類</th>
              <th>コールサイン</th>
              <th>周波数 (MHz)</th>
              <th>TACAN</th>
            </tr>
          </thead>
          <tbody>
            {supportRows.map(({ item: support, key: supportKey }) => (
              <tr key={supportKey}>
                <td>{support.kind}</td>
                <td>{support.callsign}</td>
                <td>{support.frequency ? formatFrequencyMHz(toMHz(support.frequency)) : '-'}</td>
                <td>{support.tacan?.channel || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="section">
        <h3>共通周波数</h3>
        <dl className="info-grid">
          <dt>Guard (UHF)</dt>
          <dd>{formatFrequencyMHz(GUARD_FREQUENCIES_MHZ.UHF)} (AM)</dd>
          <dt>Guard (VHF)</dt>
          <dd>{formatFrequencyMHz(GUARD_FREQUENCIES_MHZ.VHF)} (AM)</dd>
        </dl>
      </section>
    </div>
  );
}

interface CommsTabProps {
  mission: MissionData;
  settings: DisplaySettings;
}

function collectFrequencyEntries(mission: MissionData): CommunicationFrequency[] {
  const allFlights = [...mission.coalitions.blue.flights, ...mission.coalitions.red.flights];
  const allSupport = [...mission.coalitions.blue.support, ...mission.coalitions.red.support];
  const flightEntries = allFlights.flatMap(flight => {
    const side = getFlightSide(mission, flight);
    return flight.units.flatMap((unit, unitIndex) => {
      const unitKey = `${side}:${flight.groupId}:${unit.unitId}:${unitIndex}`;
      const radioRows = createStableKeys(unit.radios, `radio-${unitKey}`, radio => `${radio.channel}|${radio.frequency}|${radio.modulation}|${radio.name}`);
      return radioRows.map(({ item: radio, key }) => ({
        id: `${unitKey}:${key}`,
        source: 'flight' as const,
        side,
        callsign: flight.callsign,
        flight: flight.name,
        flightId: flight.groupId,
        unitKey,
        channel: radio.channel,
        frequencyMHz: toMHz(radio.frequency),
        modulation: formatModulation(radio.modulation),
        name: radio.name,
      }));
    });
  });

  const supportEntries = createStableKeys(
    allSupport,
    'support',
    support => `${support.kind}|${support.callsign}|${support.frequency}|${support.position.join(',')}|${support.tacan?.channel ?? ''}`,
  ).flatMap(({ item: support, key }) => {
    if (!support.frequency || !Number.isFinite(support.frequency)) return [];
    return [{
      id: key,
      source: 'support' as const,
      side: 'Support' as const,
      callsign: support.callsign,
      flight: support.kind,
      supportKind: support.kind,
      channel: 0,
      frequencyMHz: toMHz(support.frequency),
      modulation: 'AM' as const,
      name: support.kind,
    }];
  });

  return [...flightEntries, ...supportEntries];
}

function createStableKeys<T>(items: T[], prefix: string, signature: (item: T) => string): KeyedItem<T>[] {
  const occurrences = new Map<string, number>();
  return items.map(item => {
    const baseKey = `${prefix}:${signature(item)}`;
    const occurrence = occurrences.get(baseKey) ?? 0;
    occurrences.set(baseKey, occurrence + 1);
    return {
      item,
      key: occurrence === 0 ? baseKey : `${baseKey}:${occurrence}`,
    };
  });
}

function getFlightSide(mission: MissionData, flight: Flight): 'Blue' | 'Red' {
  return mission.coalitions.blue.flights.includes(flight) ? 'Blue' : 'Red';
}

function toMHz(frequency: number): number {
  return Math.abs(frequency) >= 1000 ? frequency / 1000000 : frequency;
}

function formatFrequencyMHz(frequencyMHz: number): string {
  return `${frequencyMHz.toFixed(3)} MHz`;
}

function formatModulation(modulation: number): CommunicationModulation {
  return modulation === 0 ? 'AM' : 'FM';
}

function formatFrequencyUser(user: CommunicationFrequency): string {
  const source = user.source === 'support' ? user.supportKind?.toUpperCase() ?? 'Support' : user.side;
  return `${source} ${user.callsign} (CH${user.channel}: ${user.name})`;
}
