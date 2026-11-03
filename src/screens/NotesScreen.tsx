// STUB. Owner: P6 (記入・改版・ファイル操作・初回画面). P6 replaces this file's body.
// Contract: default export, no props. Notes: useMission().notes and setNotes (writes go through
//   the parent's save path). Whiteboard: useMission().whiteboard (P6 may merge it into this screen).
// Carried over: NotesTab({ mission, settings, onNotesChange, storageFailed }) and
//   WhiteboardTab({...whiteboard props}) from src/components/NotesTab.tsx and WhiteboardTab.tsx.
// Removed at integration: NotesTab.tsx and WhiteboardTab.tsx (SPEC 8).
import NotesTab from '../components/NotesTab';
import WhiteboardTab from '../components/WhiteboardTab';
import { useMission } from '../shell/MissionContext';

export default function NotesScreen() {
  const { mission, settings, setNotes, storageFailed, whiteboard } = useMission();
  return (
    <>
      <NotesTab mission={mission} settings={settings} onNotesChange={setNotes} storageFailed={storageFailed} />
      <WhiteboardTab
        sourceFingerprint={mission.sourceFingerprint}
        data={whiteboard.data}
        persistenceStatus={whiteboard.persistenceStatus}
        canUndo={whiteboard.canUndo}
        onNotesChange={whiteboard.setNotes}
        onAddStroke={whiteboard.addStroke}
        onUndoStroke={whiteboard.undoStroke}
        onClearDrawing={whiteboard.clearDrawing}
        onReplaceData={whiteboard.replaceData}
      />
    </>
  );
}
