export interface WhiteboardPoint {
  x: number;
  y: number;
}

export interface WhiteboardStroke {
  id: string;
  color: string;
  width: number;
  points: WhiteboardPoint[];
}

export interface WhiteboardData {
  notes: string;
  strokes: WhiteboardStroke[];
}
