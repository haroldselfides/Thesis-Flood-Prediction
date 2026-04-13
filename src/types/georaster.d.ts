// src/types/georaster.d.ts
declare module 'georaster' {
  const GeoRaster: any;
  export default GeoRaster;
}

declare module 'georaster-layer-for-leaflet' {
  const GeoRasterLayer: any;
  export default GeoRasterLayer;
}

// Add this with your other ref declarations
const layerGroupsRef = useRef<{ [key: string]: any }>({});

const hazardLayerRef = useRef<any>(null);