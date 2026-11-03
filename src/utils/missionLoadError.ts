import { MissionLoadError } from '../core/MissionParser';

export type MissionLoadErrorTranslationKey =
  | 'shell:app.emptyMiz'
  | 'shell:app.corruptMiz'
  | 'shell:app.mizSafetyLimit'
  | 'shell:app.invalidMissionData'
  | 'shell:app.parseError';

export function missionLoadErrorTranslationKey(error: unknown): MissionLoadErrorTranslationKey {
  if (!(error instanceof MissionLoadError)) return 'shell:app.parseError';

  switch (error.code) {
    case 'empty-file':
      return 'shell:app.emptyMiz';
    case 'invalid-zip':
      return 'shell:app.corruptMiz';
    case 'archive-too-large':
    case 'safety-limit':
      return 'shell:app.mizSafetyLimit';
    case 'invalid-mission':
      return 'shell:app.invalidMissionData';
    case 'parse-failed':
      return 'shell:app.parseError';
  }
}
