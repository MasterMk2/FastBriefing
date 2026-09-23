import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { MissionData } from '../types/mission';
import {
  buildMissionMapScene,
  drawMissionMap,
  hasMissionMapContent,
  type MissionMapLabels,
} from '../utils/missionMapRaster';

interface MissionMapCanvasProps {
  mission: MissionData;
  className?: string;
  labels?: MissionMapLabels;
  onRenderStateChange?: (state: MissionMapRenderState) => void;
}

export type MissionMapRenderState = 'loading' | 'ready' | 'error';

export default function MissionMapCanvas({
  mission,
  className = '',
  labels,
  onRenderStateChange,
}: MissionMapCanvasProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let active = true;
    onRenderStateChange?.('loading');
    context.clearRect(0, 0, canvas.width, canvas.height);
    const renderedCanvas = document.createElement('canvas');
    renderedCanvas.width = canvas.width;
    renderedCanvas.height = canvas.height;
    const renderedContext = renderedCanvas.getContext('2d');
    if (!renderedContext) return;
    const scene = buildMissionMapScene(mission);
    const resolvedLabels = labels ?? {
      empty: t('mapRaster.empty'),
      basemapUnavailable: t('mapRaster.basemapUnavailable'),
      routes: t('mapRaster.routes'),
      support: t('mapRaster.support'),
      threats: t('mapRaster.threats'),
      zones: t('mapRaster.zones'),
    };
    void (async () => {
      let state: MissionMapRenderState = 'error';
      try {
        const rendered = await drawMissionMap(
          renderedContext,
          scene,
          0,
          0,
          canvas.width,
          canvas.height,
          resolvedLabels,
        );
        state = rendered || !hasMissionMapContent(scene) ? 'ready' : 'error';
      } catch {
        drawMapFailure(renderedContext, renderedCanvas, resolvedLabels.basemapUnavailable);
      } finally {
        if (active) {
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(renderedCanvas, 0, 0);
          onRenderStateChange?.(state);
        }
        renderedCanvas.width = 1;
        renderedCanvas.height = 1;
      }
    })();
    return () => {
      active = false;
    };
  }, [labels, mission, onRenderStateChange, t]);

  return <canvas ref={canvasRef} className={className} width={1536} height={1024} aria-label={t('mapRaster.label')} />;
}

function drawMapFailure(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, message: string): void {
  context.fillStyle = '#f5f8fb';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#d0d5dd';
  context.lineWidth = 2;
  context.strokeRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#475467';
  context.font = '28px sans-serif';
  context.fillText(message, 32, 64);
}
