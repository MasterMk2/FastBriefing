import { MissionLoadError } from '../core/MissionParser';

export type MissionLoadErrorTranslationKey =
  | 'app.emptyMiz'
  | 'app.corruptMiz'
  | 'app.mizSafetyLimit'
  | 'app.invalidMissionData'
  | 'app.parseErrorDetails';

export function missionLoadErrorTranslationKey(error: unknown): MissionLoadErrorTranslationKey {
  if (!(error instanceof MissionLoadError)) return 'app.parseErrorDetails';

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
      return 'app.parseErrorDetails';
  }
}
