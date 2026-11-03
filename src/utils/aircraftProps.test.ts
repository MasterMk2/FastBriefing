import { describe, expect, it } from 'vitest';
import enWingman from '../i18n/locales/en/wingman.json';
import jaWingman from '../i18n/locales/ja/wingman.json';
import type { Pylon } from '../types/mission';
import {
  classifyAircraftProps,
  describeAircraftPropValue,
  KNOWN_AIRCRAFT_PROPS,
  sortPylonsByStation,
} from './aircraftProps';

function pylon(station: string): Pylon {
  return { station, clsid: '', name: `weapon ${station}`, count: 1, weight: 0 };
}

describe('KNOWN_AIRCRAFT_PROPS', () => {
  it('lists only the keys seen in real missions, each with a label in both languages', () => {
    expect(Object.keys(KNOWN_AIRCRAFT_PROPS).sort()).toEqual([
      'IFF_M2_CODE',
      'LCFTLaserCode',
      'MountNVG',
      'RCFTLaserCode',
      'STN_L16',
      'SoloFlight',
      'Sta2LaserCode',
      'Sta5LaserCode',
      'Sta8LaserCode',
      'VoiceCallsignNumber',
    ]);

    for (const [key, entry] of Object.entries(KNOWN_AIRCRAFT_PROPS)) {
      expect(entry.labelKey.startsWith('wingman:props.')).toBe(true);
      const path = entry.labelKey.slice('wingman:props.'.length);
      expect(path).toBe(key);
      const ja = (jaWingman.props as Record<string, string>)[path];
      const en = (enWingman.props as Record<string, string>)[path];
      expect(ja, `ja label for ${key}`).toBeTruthy();
      expect(en, `en label for ${key}`).toBeTruthy();
    }
  });
});

describe('classifyAircraftProps', () => {
  it('splits known keys (in the table order) from the rest, which keep their raw key', () => {
    const result = classifyAircraftProps({
      Sta2LaserCode: 1688,
      SomeUnknownKey: { nested: true },
      MountNVG: true,
      MysteryText: 'abc',
    });

    expect(result.known.map(entry => entry.key)).toEqual(['Sta2LaserCode', 'MountNVG']);
    expect(result.known[0]).toEqual({
      key: 'Sta2LaserCode',
      labelKey: 'wingman:props.Sta2LaserCode',
      value: { kind: 'text', text: '1688' },
    });
    expect(result.known[1].value).toEqual({ kind: 'bool', value: true });
    expect(result.other.map(entry => entry.key)).toEqual(['SomeUnknownKey', 'MysteryText']);
    expect(result.other[0].value).toEqual({ kind: 'text', text: '{"nested":true}' });
  });

  it('returns empty lists for missing or non-object properties', () => {
    expect(classifyAircraftProps(undefined)).toEqual({ known: [], other: [] });
    expect(classifyAircraftProps(null)).toEqual({ known: [], other: [] });
    expect(classifyAircraftProps({})).toEqual({ known: [], other: [] });
  });
});

describe('describeAircraftPropValue', () => {
  it('describes primitives, null and objects without throwing', () => {
    expect(describeAircraftPropValue(false)).toEqual({ kind: 'bool', value: false });
    expect(describeAircraftPropValue(0)).toEqual({ kind: 'text', text: '0' });
    expect(describeAircraftPropValue(null)).toEqual({ kind: 'text', text: '—' });
    expect(describeAircraftPropValue(undefined)).toEqual({ kind: 'text', text: '—' });
    expect(describeAircraftPropValue([1, 2])).toEqual({ kind: 'text', text: '[1,2]' });
  });

  it('falls back to a dash for circular values and cuts very long text', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeAircraftPropValue(circular)).toEqual({ kind: 'text', text: '—' });

    const long = describeAircraftPropValue('x'.repeat(500));
    expect(long.kind).toBe('text');
    if (long.kind === 'text') expect(long.text.length).toBeLessThanOrEqual(160);
  });
});

describe('sortPylonsByStation', () => {
  it('orders stations numerically, so station 10 comes after station 2', () => {
    const sorted = sortPylonsByStation([pylon('10'), pylon('2'), pylon('1'), pylon('8')]);
    expect(sorted.map(item => item.station)).toEqual(['1', '2', '8', '10']);
  });

  it('does not change the order of the input array', () => {
    const input = [pylon('3'), pylon('1')];
    sortPylonsByStation(input);
    expect(input.map(item => item.station)).toEqual(['3', '1']);
  });
});
