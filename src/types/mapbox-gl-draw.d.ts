declare module '@mapbox/mapbox-gl-draw' {
  import type { IControl } from 'mapbox-gl';

  interface DrawOptions {
    displayControlsDefault?: boolean;
    controls?: {
      point?: boolean;
      line_string?: boolean;
      polygon?: boolean;
      trash?: boolean;
      combine_features?: boolean;
      uncombine_features?: boolean;
    };
    defaultMode?: string;
    modes?: Record<string, unknown>;
    styles?: Array<Record<string, unknown>>;
  }

  class MapboxDraw implements IControl {
    constructor(options?: DrawOptions);
    onAdd(map: mapboxgl.Map): HTMLElement;
    onRemove(map: mapboxgl.Map): void;
    getAll(): GeoJSON.FeatureCollection;
    add(geojson: GeoJSON.Feature | GeoJSON.FeatureCollection): string[];
    get(featureId: string): GeoJSON.Feature | undefined;
    delete(ids: string | string[]): MapboxDraw;
    deleteAll(): MapboxDraw;
    set(featureCollection: GeoJSON.FeatureCollection): string[];
    trash(): MapboxDraw;
    combineFeatures(): MapboxDraw;
    uncombineFeatures(): MapboxDraw;
    getSelectedIds(): string[];
    getSelected(): GeoJSON.FeatureCollection;
    getSelectedPoints(): GeoJSON.FeatureCollection;
    changeMode(mode: string, options?: Record<string, unknown>): MapboxDraw;
    getMode(): string;
    setFeatureProperty(featureId: string, property: string, value: unknown): MapboxDraw;
  }

  export default MapboxDraw;
}

declare module '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css' {
  const content: string;
  export default content;
}
