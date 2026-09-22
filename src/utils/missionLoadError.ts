import { MissionLoadError } from '../core/MissionParser';

export type MissionLoadErrorTranslationKey =
  | 'app.emptyMiz'
  | 'app.corruptMiz'
  | 'app.mizSafetyLimit'
  | 'app.invalidMissionData'
  | 'app.parseError';

export function missionLoadErrorTranslationKey(error: unknown): MissionLoadErrorTranslationKey {
  if (!(error instanceof MissionLoadError)) return 'app.parseError';

  switch (error.code) {
    case 'empty-file':
      return 'app.emptyMiz';
    case 'invalid-zip':
      return 'app.corruptMiz';
    case 'archive-too-large':
    case 'safety-limit':
      return 'app.mizSafetyLimit';
    case 'invalid-mission':
      return 'app.invalidMissionData';
    case 'parse-failed':
      return 'app.parseError';
  }
}
