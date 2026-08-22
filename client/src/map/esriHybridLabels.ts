import * as L from "leaflet";

const IMAGERY_URL_FRAGMENT = "World_Imagery";
const TRANSPORTATION_URL = "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";
const PLACES_URL = "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const REFERENCE_PANE = "esri-hybrid-reference";

type TileLayerWithUrl = L.TileLayer & { _url?: string };

/**
 * Converts the plain Esri World Imagery layer into the classic Esri hybrid
 * composition while it is active: imagery + transportation/street labels +
 * boundaries/place labels. When the app switches back to OpenStreetMap the
 * reference overlays are removed automatically.
 */
L.Map.addInitHook(function (this: L.Map) {
  const map = this;

  if (!map.getPane(REFERENCE_PANE)) {
    const pane = map.createPane(REFERENCE_PANE);
    pane.style.zIndex = "450";
    pane.style.pointerEvents = "none";
  }

  const transportation = L.tileLayer(TRANSPORTATION_URL, {
    pane: REFERENCE_PANE,
    minZoom: 1,
    maxZoom: 19,
    attribution: "Esri, HERE, Garmin, OpenStreetMap contributors",
  });

  const places = L.tileLayer(PLACES_URL, {
    pane: REFERENCE_PANE,
    minZoom: 1,
    maxZoom: 19,
    attribution: "Esri",
  });

  let syncScheduled = false;

  const syncHybridLayers = () => {
    if (syncScheduled) return;
    syncScheduled = true;

    queueMicrotask(() => {
      let imageryActive = false;

      map.eachLayer((layer) => {
        if (layer === transportation || layer === places || !(layer instanceof L.TileLayer)) return;
        const url = (layer as TileLayerWithUrl)._url ?? "";
        if (url.includes(IMAGERY_URL_FRAGMENT)) imageryActive = true;
      });

      if (imageryActive) {
        if (!map.hasLayer(transportation)) transportation.addTo(map);
        if (!map.hasLayer(places)) places.addTo(map);
      } else {
        if (map.hasLayer(transportation)) transportation.removeFrom(map);
        if (map.hasLayer(places)) places.removeFrom(map);
      }

      syncScheduled = false;
    });
  };

  map.on("layeradd layerremove", syncHybridLayers);
  map.whenReady(syncHybridLayers);
  map.on("unload", () => map.off("layeradd layerremove", syncHybridLayers));
});
