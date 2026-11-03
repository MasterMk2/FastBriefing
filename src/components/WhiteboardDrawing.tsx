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
  // The paper and its grid keep these fixed colours in every theme, on purpose. The board is a writing surface whose
  // ink colours are stored as data, and the print document draws it too, so the paper must stay light in a dark
  // theme. tokens.css has no paper token; a theme-independent paper token would replace these two values.

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
          <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#e5e7eb" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={WHITEBOARD_WIDTH} height={WHITEBOARD_HEIGHT} fill="#ffffff" />
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
