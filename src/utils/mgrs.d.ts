declare module 'mgrs' {
  export function forward(lonLat: [number, number], accuracy?: number): string;
  export function inverse(reference: string): [number, number, number, number];
  export function toPoint(reference: string): [number, number];
  export function getLetterDesignator(latitude: number): string;
}
