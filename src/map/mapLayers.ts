import type { DisplaySettings } from '../types/mission';

type ViewMode = DisplaySettings['viewMode'];

export type LayerId =
  | 'flights'
  | 'navpoints'
  | 'airbases'
  | 'bullseye'
  | 'support'
  | 'threats'
  | 'detection'
  | 'enemies'
  | 'zones'
  | 'drawings'
  | 'annotations';

export type LayerGroupId = 'route' | 'units' | 'drawing';

interface LayerDef {
  group: LayerGroupId;
  /** Used when MapUi.layers has no entry for the id. */
  defaultOn: boolean;
  /** Creator view only. Threat, detection, enemy and zone data never reach pilot view (D1). */
  creatorOnly: boolean;
}

export const LAYER_DEFS: Record<LayerId, LayerDef> = {
  flights: { group: 'route', defaultOn: true, creatorOnly: false },
  navpoints: { group: 'route', defaultOn: true, creatorOnly: false },
  airbases: { group: 'route', defaultOn: true, creatorOnly: false },
  bullseye: { group: 'route', defaultOn: true, creatorOnly: false },
  support: { group: 'units', defaultOn: true, creatorOnly: false },
  threats: { group: 'units', defaultOn: true, creatorOnly: true },
  detection: { group: 'units', defaultOn: false, creatorOnly: true },
  enemies: { group: 'units', defaultOn: true, creatorOnly: true },
  zones: { group: 'drawing', defaultOn: true, creatorOnly: true },
  drawings: { group: 'drawing', defaultOn: true, creatorOnly: false },
  annotations: { group: 'drawing', defaultOn: true, creatorOnly: false },
};

/** The three groups of the layer panel, in display order. */
export const LAYER_GROUPS: readonly { id: LayerGroupId; layers: readonly LayerId[] }[] = [
  { id: 'route', layers: ['flights', 'navpoints', 'airbases', 'bullseye'] },
  { id: 'units', layers: ['support', 'threats', 'detection', 'enemies'] },
  { id: 'drawing', layers: ['zones', 'drawings', 'annotations'] },
];

/** A layer is on unless the stored state says otherwise. Missing ids use the default, so MapUi keeps its type. */
export function isLayerOn(layers: Readonly<Record<string, boolean>>, id: LayerId): boolean {
  return layers[id] ?? LAYER_DEFS[id].defaultOn;
}

export function isLayerAvailable(id: LayerId, viewMode: ViewMode): boolean {
  return viewMode === 'creator' || !LAYER_DEFS[id].creatorOnly;
}

/** Layers the current view offers, grouped in display order. */
export function layerGroupsFor(viewMode: ViewMode): readonly { id: LayerGroupId; layers: LayerId[] }[] {
  return LAYER_GROUPS
    .map(group => ({ id: group.id, layers: group.layers.filter(id => isLayerAvailable(id, viewMode)) }))
    .filter(group => group.layers.length > 0);
}
