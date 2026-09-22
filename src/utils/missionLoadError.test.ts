import { describe, expect, it } from 'vitest';
import { MissionLoadError } from '../core/MissionParser';
import { missionLoadErrorTranslationKey } from './missionLoadError';

describe('missionLoadErrorTranslationKey', () => {
  it.each([
    ['empty-file', 'app.emptyMiz'],
    ['invalid-zip', 'app.corruptMiz'],
    ['archive-too-large', 'app.mizSafetyLimit'],
    ['safety-limit', 'app.mizSafetyLimit'],
    ['invalid-mission', 'app.invalidMissionData'],
    ['parse-failed', 'app.parseErrorDetails'],
  ] as const)('%s を %s へ割り当てる', (code, expected) => {
    expect(missionLoadErrorTranslationKey(new MissionLoadError(code, 'details'))).toBe(expected);
  });

  it('分類不能なエラーは詳細付き汎用表示へフォールバックする', () => {
    expect(missionLoadErrorTranslationKey(new Error('details'))).toBe('app.parseErrorDetails');
  });
});
