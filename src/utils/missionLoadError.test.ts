import { describe, expect, it } from 'vitest';
import { MissionLoadError } from '../core/MissionParser';
import { missionLoadErrorTranslationKey } from './missionLoadError';

describe('missionLoadErrorTranslationKey', () => {
  it.each([
    ['empty-file', 'shell:app.emptyMiz'],
    ['invalid-zip', 'shell:app.corruptMiz'],
    ['archive-too-large', 'shell:app.mizSafetyLimit'],
    ['safety-limit', 'shell:app.mizSafetyLimit'],
    ['invalid-mission', 'shell:app.invalidMissionData'],
    ['parse-failed', 'shell:app.parseError'],
  ] as const)('%s を %s へ割り当てる', (code, expected) => {
    expect(missionLoadErrorTranslationKey(new MissionLoadError(code, 'details'))).toBe(expected);
  });

  it('分類不能なエラーは詳細付き汎用表示へフォールバックする', () => {
    expect(missionLoadErrorTranslationKey(new Error('details'))).toBe('shell:app.parseError');
  });
});
