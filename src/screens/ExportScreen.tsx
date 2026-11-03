// STUB. Owner: P3 (出力). P3 replaces this file's body.
// Contract: default export, no props. Read data with useMission(): mission, settings, sourceFile, whiteboard.
//   Settings writes: useSettings().setBriefingSections / setBriefingPresets (section order and presets).
//   The print document (PrintView) is mounted by the shell when screen === 'export' (print guard stays in AppShell).
//   Print-map readiness: useWorkspace().printMapState.
// Carried over: BriefingPlanner (section chooser, above) and ExportTab({ mission, settings, sourceFile,
//   whiteboard, printMapState }) from src/components/BriefingPlanner.tsx and ExportTab.tsx.
// Removed at integration: ExportTab.tsx, PrintView.tsx, BriefingPlanner.tsx (SPEC 8).
import BriefingPlanner from '../components/BriefingPlanner';
import ExportTab from '../components/ExportTab';
import { useSettings } from '../hooks/useSettings';
import { useMission } from '../shell/MissionContext';
import { useWorkspace } from '../shell/workspace';

export default function ExportScreen() {
  const { mission, settings, sourceFile, whiteboard } = useMission();
  const { setBriefingSections, setBriefingPresets } = useSettings();
  const { printMapState } = useWorkspace();
  return (
    <>
      <BriefingPlanner
        selected={settings.briefingSections}
        presets={settings.briefingPresets}
        onChange={setBriefingSections}
        onPresetsChange={setBriefingPresets}
      />
      <ExportTab
        mission={mission}
        settings={settings}
        sourceFile={sourceFile}
        whiteboard={whiteboard.data}
        printMapState={printMapState}
      />
    </>
  );
}
