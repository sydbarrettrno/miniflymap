import * as L from "leaflet";

const LABELS_URL = "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png";
const IMAGERY_URL_FRAGMENT = "World_Imagery";

type TileLayerWithUrl = L.TileLayer & { _url?: string };

/**
 * Adds a transparent street/place label overlay while the Esri satellite
 * imagery base layer is active. The overlay is removed automatically when
 * switching to the OpenStreetMap base layer to avoid duplicate labels.
 */
L.Map.addInitHook(function (this: L.Map) {
  const map = this;
  const labels = L.tileLayer(LABELS_URL, {
    attribution: "© OpenStreetMap contributors © CARTO",
    subdomains: "abcd",
    zIndex: 450,
  });

  let syncScheduled = false;

  const syncLabels = () => {
    if (syncScheduled) return;
    syncScheduled = true;

    queueMicrotask(() => {
      let satelliteActive = false;

      map.eachLayer((layer) => {
        if (layer === labels || !(layer instanceof L.TileLayer)) return;
        const url = (layer as TileLayerWithUrl)._url ?? "";
        if (url.includes(IMAGERY_URL_FRAGMENT)) satelliteActive = true;
      });

      if (satelliteActive && !map.hasLayer(labels)) {
        labels.addTo(map);
      } else if (!satelliteActive && map.hasLayer(labels)) {
        labels.removeFrom(map);
      }

      syncScheduled = false;
    });
  };

  map.on("layeradd layerremove", syncLabels);
  map.whenReady(syncLabels);
  map.on("unload", () => map.off("layeradd layerremove", syncLabels));
});
