import type { WhiteboardStroke } from '../types/whiteboard';
import { WHITEBOARD_HEIGHT, WHITEBOARD_WIDTH } from '../hooks/useWhiteboard';

interface WhiteboardDrawingProps {
  strokes: readonly WhiteboardStroke[];
  draft?: WhiteboardStroke | null;
  label: string;
  className?: string;
}

export default function WhiteboardDrawing({ strokes, draft, label, className = '' }: WhiteboardDrawingProps) {
  const displayedStrokes = draft ? [...strokes, draft] : strokes;
  // The paper and its grid use the theme-independent tokens --whiteboard-paper and --whiteboard-grid (tokens.css):
  // the ink colours are stored as data and the print document draws the board too, so the paper stays light in a
  // dark theme. SVG presentation attributes do not resolve var(), so the colours are set through style.

  return (
    <svg
      className={`whiteboard-canvas ${className}`.trim()}
      viewBox={`0 0 ${WHITEBOARD_WIDTH} ${WHITEBOARD_HEIGHT}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern id="whiteboard-grid" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M 30 0 L 0 0 0 30" fill="none" style={{ stroke: 'var(--whiteboard-grid)' }} strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={WHITEBOARD_WIDTH} height={WHITEBOARD_HEIGHT} style={{ fill: 'var(--whiteboard-paper)' }} />
      <rect width={WHITEBOARD_WIDTH} height={WHITEBOARD_HEIGHT} fill="url(#whiteboard-grid)" />
      {displayedStrokes.map(stroke => (
        <polyline
          key={stroke.id}
          points={stroke.points.map(point => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
