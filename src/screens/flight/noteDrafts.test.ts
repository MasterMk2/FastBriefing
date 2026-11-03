import { describe, expect, it } from 'vitest';
import { clearNoteDrafts, readNoteDrafts, writeNoteDraft } from './noteDrafts';

describe('note drafts when the mission is closed (W5)', () => {
  it('drops every draft, so opening the same file again starts with none', () => {
    writeNoteDraft('same-file', 'blue:1', { joker: '12' });
    expect(readNoteDrafts('same-file')).toEqual({ 'blue:1': { joker: '12' } });
    clearNoteDrafts();
    expect(readNoteDrafts('same-file')).toEqual({});
  });
});
