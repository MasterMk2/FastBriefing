import { describe, expect, it } from 'vitest';
import { clearNoteDrafts, pruneNoteDrafts, readNoteDrafts, subscribeNoteDrafts, writeNoteDraft } from './noteDrafts';

const NOTE = { jokerFuel: null, bingoFuel: null, tot: '', pilotName: '', customNotes: '' };

describe('note drafts that the saved notes catch up with (W1)', () => {
  it('drops only the fields that equal the saved value, and the draft when none is left', () => {
    clearNoteDrafts();
    writeNoteDraft('prune', 'blue:1', { joker: '12', pilotName: 'Ace' });
    writeNoteDraft('prune', 'blue:2', { tot: '12:00' });
    let calls = 0;
    const unsubscribe = subscribeNoteDrafts(() => { calls += 1; });

    pruneNoteDrafts('prune', { 'blue:1': { ...NOTE, jokerFuel: 12 }, 'blue:2': { ...NOTE, tot: '12:00' } });
    expect(readNoteDrafts('prune')).toEqual({ 'blue:1': { pilotName: 'Ace' } });
    expect(calls).toBe(1);

    // Nothing equal: the drafts stay the same object and no listener is called.
    const before = readNoteDrafts('prune');
    pruneNoteDrafts('prune', { 'blue:1': { ...NOTE, pilotName: 'Other' } });
    expect(readNoteDrafts('prune')).toBe(before);
    expect(calls).toBe(1);
    unsubscribe();
  });
});

describe('note drafts when the mission is closed (W5)', () => {
  it('drops every draft, so opening the same file again starts with none', () => {
    writeNoteDraft('same-file', 'blue:1', { joker: '12' });
    expect(readNoteDrafts('same-file')).toEqual({ 'blue:1': { joker: '12' } });
    clearNoteDrafts();
    expect(readNoteDrafts('same-file')).toEqual({});
  });
});
