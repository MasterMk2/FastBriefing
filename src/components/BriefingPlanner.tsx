import { useTranslation } from 'react-i18next';
import {
  BRIEFING_SECTIONS,
  DEFAULT_BRIEFING_SECTIONS,
  normalizeBriefingSections,
  type BriefingSection,
} from '../utils/briefingSections';

interface BriefingPlannerProps {
  selected: readonly BriefingSection[];
  onChange: (sections: BriefingSection[]) => void;
}

export default function BriefingPlanner({ selected, onChange }: BriefingPlannerProps) {
  const { t } = useTranslation();
  const selectedSet = new Set(selected);

  const toggleSection = (section: BriefingSection) => {
    const next = new Set(selected);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    onChange(normalizeBriefingSections([...next]));
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
          {BRIEFING_SECTIONS.map(section => (
            <label key={section} className="planner-option">
              <input
                type="checkbox"
                checked={selectedSet.has(section)}
                onChange={() => toggleSection(section)}
              />
              <span>
                <strong>{t(`planner.sections.${section}`)}</strong>
                <small>{t(`planner.sectionHelp.${section}`)}</small>
              </span>
            </label>
          ))}
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
      </div>
    </details>
  );
}
