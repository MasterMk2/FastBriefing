import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Flight, MissionData, UserNotes } from '../types/mission';
import {
  collectMissionWaypoints,
  DEFAULT_WAYPOINT_SYNC_RADIUS_NM,
  findNearbyWaypoints,
  getSyncGroupMembers,
  leaveWaypointSyncGroup,
  MAX_WAYPOINT_NOTES_LENGTH,
  MAX_WAYPOINT_PURPOSE_LENGTH,
  saveWaypointAnnotation,
  syncWaypointAnnotationGroup,
  waypointAnnotationKey,
  type CoalitionSide,
} from '../utils/waypointAnnotations';

interface WaypointAnnotationEditorProps {
  mission: MissionData;
  side: CoalitionSide;
  flight: Flight;
  routeIndex: number;
  onNotesChange: (notes: UserNotes) => void;
  compact?: boolean;
}

export default function WaypointAnnotationEditor({
  mission,
  side,
  flight,
  routeIndex,
  onNotesChange,
  compact = false,
}: WaypointAnnotationEditorProps) {
  const { t } = useTranslation();
  const key = waypointAnnotationKey(side, flight.groupId, routeIndex);
  const annotation = mission.userNotes.waypoints[key];
  const [purpose, setPurpose] = useState(annotation?.purpose ?? '');
  const [notes, setNotes] = useState(annotation?.notes ?? '');
  const [radiusNm, setRadiusNm] = useState(DEFAULT_WAYPOINT_SYNC_RADIUS_NM);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('');
  const allWaypoints = useMemo(() => collectMissionWaypoints(mission), [mission]);
  const candidates = useMemo(
    () => findNearbyWaypoints(mission, key, radiusNm),
    [key, mission, radiusNm],
  );
  const groupMembers = getSyncGroupMembers(mission.userNotes, key);

  useEffect(() => {
    setPurpose(annotation?.purpose ?? '');
    setNotes(annotation?.notes ?? '');
  }, [annotation?.notes, annotation?.purpose, key]);

  const currentValue = () => ({
    purpose,
    notes,
    ...(annotation?.syncGroupId ? { syncGroupId: annotation.syncGroupId } : {}),
  });

  const save = (applyToGroup: boolean) => {
    const updated = saveWaypointAnnotation(mission.userNotes, key, currentValue(), applyToGroup);
    if (!updated) {
      setStatus(t('waypoints.limitReached'));
      return;
    }
    onNotesChange(updated);
    setStatus(t(applyToGroup && groupMembers.length > 1 ? 'waypoints.savedGroup' : 'waypoints.saved'));
  };

  const createGroup = () => {
    const targetKeys = [...selected];
    const groupId = annotation?.syncGroupId ?? createGroupId();
    const updated = syncWaypointAnnotationGroup(mission.userNotes, key, targetKeys, currentValue(), groupId);
    if (!updated) {
      setStatus(t(targetKeys.length === 0 ? 'waypoints.selectTarget' : 'waypoints.limitReached'));
      return;
    }
    onNotesChange(updated);
    setSelected(new Set());
    setStatus(t('waypoints.groupCreated', { count: targetKeys.length + 1 }));
  };

  const leaveGroup = () => {
    onNotesChange(leaveWaypointSyncGroup(mission.userNotes, key));
    setStatus(t('waypoints.leftGroup'));
  };

  return (
    <div className={`waypoint-editor${compact ? ' compact' : ''}`}>
      <label>
        <span>{t('waypoints.purpose')}</span>
        <input
          value={purpose}
          maxLength={MAX_WAYPOINT_PURPOSE_LENGTH}
          onChange={event => setPurpose(event.target.value)}
          placeholder={t('waypoints.purposePlaceholder')}
        />
      </label>
      <label>
        <span>{t('waypoints.notes')}</span>
        <textarea
          value={notes}
          maxLength={MAX_WAYPOINT_NOTES_LENGTH}
          rows={compact ? 2 : 3}
          onChange={event => setNotes(event.target.value)}
          placeholder={t('waypoints.notesPlaceholder')}
        />
      </label>
      <div className="waypoint-editor-actions">
        <button type="button" className="button-secondary" onClick={() => save(false)}>{t('common.save')}</button>
        {groupMembers.length > 1 && (
          <button type="button" className="button-secondary" onClick={() => save(true)}>
            {t('waypoints.saveGroup', { count: groupMembers.length })}
          </button>
        )}
      </div>
      <details className="waypoint-sync">
        <summary>{t('waypoints.syncNearby')}</summary>
        <p className="hint">{t('waypoints.syncHelp')}</p>
        <label className="waypoint-radius">
          <span>{t('waypoints.radius')}</span>
          <input
            type="number"
            min="0.1"
            max="20"
            step="0.1"
            value={radiusNm}
            onChange={event => setRadiusNm(Number(event.target.value) || DEFAULT_WAYPOINT_SYNC_RADIUS_NM)}
          />
          <span>NM</span>
        </label>
        {candidates.length === 0 ? (
          <p className="hint">{t('waypoints.noCandidates')}</p>
        ) : (
          <div className="waypoint-candidates">
            {candidates.map(candidate => (
              <label key={candidate.key}>
                <input
                  type="checkbox"
                  checked={selected.has(candidate.key)}
                  onChange={event => setSelected(previous => {
                    const next = new Set(previous);
                    if (event.target.checked) next.add(candidate.key); else next.delete(candidate.key);
                    return next;
                  })}
                />
                <span>{formatWaypointLabel(candidate.side, candidate.flight, candidate.routeIndex, mission)} · {candidate.distanceNm.toFixed(2)} NM</span>
              </label>
            ))}
          </div>
        )}
        <button type="button" className="button-secondary" disabled={selected.size === 0} onClick={createGroup}>
          {t('waypoints.createGroup', { count: selected.size + 1 })}
        </button>
        {groupMembers.length > 1 && (
          <div className="waypoint-group-members">
            <strong>{t('waypoints.currentGroup', { count: groupMembers.length })}</strong>
            <ul>
              {groupMembers.map(memberKey => {
                const member = allWaypoints.find(item => item.key === memberKey);
                return <li key={memberKey}>{member ? formatWaypointLabel(member.side, member.flight, member.routeIndex, mission) : memberKey}</li>;
              })}
            </ul>
            <button type="button" className="button-danger-text" onClick={leaveGroup}>{t('waypoints.leaveGroup')}</button>
          </div>
        )}
      </details>
      {status && <p className="waypoint-editor-status" role="status">{status}</p>}
    </div>
  );
}

function formatWaypointLabel(side: CoalitionSide, flight: Flight, routeIndex: number, mission: MissionData): string {
  const waypoint = flight.route[routeIndex];
  const sideName = side === 'blue' ? 'BLUE' : side === 'red' ? 'RED' : 'NEUTRAL';
  const fallback = mission.coalitions[side].flights.includes(flight) ? flight.name : String(flight.groupId);
  return `${sideName} · ${flight.callsign || fallback} · WP${waypoint?.index ?? routeIndex}`;
}

function createGroupId(): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `sync_${Date.now().toString(36)}_${random}`.slice(0, 64);
}
