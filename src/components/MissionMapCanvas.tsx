import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { MissionData } from '../types/mission';
import { buildMissionMapScene, drawMissionMap, type MissionMapLabels } from '../utils/missionMapRaster';

interface MissionMapCanvasProps {
  mission: MissionData;
  className?: string;
  labels?: MissionMapLabels;
}

export default function MissionMapCanvas({ mission, className = '', labels }: MissionMapCanvasProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawMissionMap(context, buildMissionMapScene(mission), 0, 0, canvas.width, canvas.height, labels ?? {
      empty: t('mapRaster.empty'),
      routes: t('mapRaster.routes'),
      support: t('mapRaster.support'),
      threats: t('mapRaster.threats'),
      zones: t('mapRaster.zones'),
    });
  }, [labels, mission, t]);

  return <canvas ref={canvasRef} className={className} width={1536} height={1024} aria-label={t('mapRaster.label')} />;
}
