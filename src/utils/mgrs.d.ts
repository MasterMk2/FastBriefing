declare module 'mgrs' {
  export interface MgrsApi {
    forward(lonLat: [number, number], accuracy?: number): string;
    inverse(reference: string): [number, number, number, number];
    toPoint(reference: string): [number, number];
  }

  const mgrs: MgrsApi;
  export default mgrs;
  export const forward: MgrsApi['forward'];
  export const inverse: MgrsApi['inverse'];
  export const toPoint: MgrsApi['toPoint'];
}
