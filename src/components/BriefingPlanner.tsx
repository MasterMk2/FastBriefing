import { useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BRIEFING_SECTIONS,
  DEFAULT_BRIEFING_SECTIONS,
  MAX_BRIEFING_PRESETS,
  moveBriefingSection,
  normalizeBriefingPresetName,
  normalizeBriefingSections,
  type BriefingPreset,
  type BriefingSection,
} from '../utils/briefingSections';

interface BriefingPlannerProps {
  selected: readonly BriefingSection[];
  presets: readonly BriefingPreset[];
  onChange: (sections: BriefingSection[]) => void;
  onPresetsChange: (presets: BriefingPreset[]) => boolean;
}

export default function BriefingPlanner({ selected, presets, onChange, onPresetsChange }: BriefingPlannerProps) {
  const { t } = useTranslation();
  const [presetName, setPresetName] = useState('');
  const [status, setStatus] = useState('');
  const [draggedSection, setDraggedSection] = useState<BriefingSection | null>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const orderedOptions = useMemo(() => [
    ...selected,
    ...BRIEFING_SECTIONS.filter(section => !selectedSet.has(section)),
  ], [selected, selectedSet]);

  const toggleSection = (section: BriefingSection) => {
    const next = selectedSet.has(section)
      ? selected.filter(candidate => candidate !== section)
      : [...selected, section];
    onChange(normalizeBriefingSections(next));
    setStatus('');
  };

  const moveSection = (section: BriefingSection, offset: -1 | 1) => {
    const index = selected.indexOf(section);
    if (index < 0) return;
    onChange(moveBriefingSection(selected, section, index + offset));
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>, target: BriefingSection) => {
    event.preventDefault();
    if (!draggedSection || !selectedSet.has(target)) return;
    onChange(moveBriefingSection(selected, draggedSection, selected.indexOf(target)));
    setDraggedSection(null);
  };

  const savePreset = () => {
    const name = normalizeBriefingPresetName(presetName);
    if (!name) {
      setStatus(t('planner.presetNameRequired'));
      return;
    }
    if (presets.some(preset => preset.name.toLowerCase() === name.toLowerCase())) {
      setStatus(t('planner.presetDuplicate'));
      return;
    }
    if (presets.length >= MAX_BRIEFING_PRESETS) {
      setStatus(t('planner.presetLimit', { count: MAX_BRIEFING_PRESETS }));
      return;
    }
    const persisted = onPresetsChange([...presets, { name, sections: [...selected] }]);
    setPresetName('');
    setStatus(t(persisted ? 'planner.presetSaved' : 'planner.presetMemoryOnly', { name }));
  };

  return (
    <details className="briefing-planner no-print">
      <summary>
        <span>{t('planner.title')}</span>
        <span className="planner-count">{t('planner.selectedCount', {
          count: selected.length,
          total: BRIEFING_SECTIONS.length,
        })}</span>
      </summary>
      <div className="planner-content">
        <p>{t('planner.description')}</p>
        <fieldset className="planner-grid">
          <legend className="visually-hidden">{t('planner.sectionLegend')}</legend>
          {orderedOptions.map(section => {
            const isSelected = selectedSet.has(section);
            const selectedIndex = selected.indexOf(section);
            return (
              <label
                key={section}
                className={`planner-option${isSelected ? ' selected' : ''}${draggedSection === section ? ' dragging' : ''}`}
                draggable={isSelected}
                onDragStart={(event) => {
                  setDraggedSection(section);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', section);
                }}
                onDragEnd={() => setDraggedSection(null)}
                onDragOver={(event) => {
                  if (isSelected && draggedSection) event.preventDefault();
                }}
                onDrop={(event) => handleDrop(event, section)}
              >
                <span className="planner-drag-handle" aria-hidden="true">⋮⋮</span>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSection(section)}
                />
                <span className="planner-option-copy">
                  <strong>{t(`planner.sections.${section}`)}</strong>
                  <small>{t(`planner.sectionHelp.${section}`)}</small>
                </span>
                {isSelected && (
                  <span className="planner-order-controls">
                    <button
                      type="button"
                      className="planner-order-button"
                      disabled={selectedIndex === 0}
                      aria-label={t('planner.moveUp', { section: t(`planner.sections.${section}`) })}
                      onClick={(event) => { event.preventDefault(); moveSection(section, -1); }}
                    >↑</button>
                    <button
                      type="button"
                      className="planner-order-button"
                      disabled={selectedIndex === selected.length - 1}
                      aria-label={t('planner.moveDown', { section: t(`planner.sections.${section}`) })}
                      onClick={(event) => { event.preventDefault(); moveSection(section, 1); }}
                    >↓</button>
                  </span>
                )}
              </label>
            );
          })}
        </fieldset>

        <div className="planner-actions">
          <button type="button" className="btn btn-secondary" onClick={() => onChange([...DEFAULT_BRIEFING_SECTIONS])}>
            {t('planner.selectAll')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onChange([])}>
            {t('planner.clearAll')}
          </button>
          <span className="hint">{t('planner.exportAlwaysAvailable')}</span>
        </div>

        <section className="planner-presets" aria-labelledby="planner-presets-title">
          <h3 id="planner-presets-title">{t('planner.presets')}</h3>
          <div className="planner-preset-save">
            <label>
              <span>{t('planner.presetName')}</span>
              <input
                type="text"
                value={presetName}
                maxLength={40}
                onChange={event => setPresetName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    savePreset();
                  }
                }}
              />
            </label>
            <button type="button" className="btn btn-secondary" onClick={savePreset}>{t('planner.savePreset')}</button>
          </div>
          {presets.length === 0 ? (
            <p className="hint">{t('planner.noPresets')}</p>
          ) : (
            <ul className="planner-preset-list">
              {presets.map(preset => (
                <li key={preset.name}>
                  <button type="button" className="btn btn-secondary" onClick={() => {
                    onChange([...preset.sections]);
                    setStatus(t('planner.presetApplied', { name: preset.name }));
                  }}>{preset.name}</button>
                  <span className="planner-preset-count">{t('planner.presetSectionCount', { count: preset.sections.length })}</span>
                  <button
                    type="button"
                    className="planner-order-button"
                    aria-label={t('planner.deletePreset', { name: preset.name })}
                    onClick={() => {
                      const persisted = onPresetsChange(presets.filter(candidate => candidate.name !== preset.name));
                      setStatus(t(persisted ? 'planner.presetDeleted' : 'planner.presetMemoryOnly', { name: preset.name }));
                    }}
                  >×</button>
                </li>
              ))}
            </ul>
          )}
          {status && <p className="planner-status" role="status">{status}</p>}
        </section>
      </div>
    </details>
  );
}
