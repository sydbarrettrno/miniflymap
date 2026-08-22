import * as L from "leaflet";

const IMAGERY_URL_FRAGMENT = "World_Imagery";
const GOOGLE_MAP_TILES_SESSION_URL = "https://tile.googleapis.com/v1/createSession";
const GOOGLE_MAP_TILES_URL = "https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}";
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();

type TileLayerWithUrl = L.TileLayer & { _url?: string };

type GoogleTileSession = {
  session: string;
  expiry: string;
  tileWidth: number;
  tileHeight: number;
  imageFormat: string;
};

async function createGoogleStreetOverlay(): Promise<L.TileLayer | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn(
      "MiniFlyMap: VITE_GOOGLE_MAPS_API_KEY não configurada; os rótulos oficiais do Google não serão exibidos.",
    );
    return null;
  }

  const response = await fetch(
    `${GOOGLE_MAP_TILES_SESSION_URL}?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mapType: "satellite",
        language: "pt-BR",
        region: "BR",
        layerTypes: ["layerRoadmap"],
        overlay: true,
        scale: "scaleFactor1x",
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Google Map Tiles session falhou (${response.status}).`);
  }

  const session = (await response.json()) as GoogleTileSession;
  if (!session.session) throw new Error("Google Map Tiles não retornou token de sessão.");

  const tileUrl = `${GOOGLE_MAP_TILES_URL}?session=${encodeURIComponent(session.session)}&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;

  return L.tileLayer(tileUrl, {
    attribution: "© Google",
    tileSize: session.tileWidth || 256,
    maxZoom: 22,
    zIndex: 450,
  });
}

/**
 * Adds Google's own transparent roadmap overlay while the Esri satellite
 * imagery base layer is active. This keeps the exact Google Maps street
 * nomenclature (including numbered road names where Google publishes them)
 * without replacing the Leaflet mission-planning map.
 */
L.Map.addInitHook(function (this: L.Map) {
  const map = this;
  let labels: L.TileLayer | null = null;
  let labelsPromise: Promise<L.TileLayer | null> | null = null;
  let syncScheduled = false;
  let satelliteActive = false;

  const ensureLabels = () => {
    labelsPromise ??= createGoogleStreetOverlay()
      .then((layer) => {
        labels = layer;
        return layer;
      })
      .catch((error) => {
        console.error("MiniFlyMap: falha ao carregar rótulos do Google.", error);
        return null;
      });
    return labelsPromise;
  };

  const syncLabels = () => {
    if (syncScheduled) return;
    syncScheduled = true;

    queueMicrotask(async () => {
      try {
        satelliteActive = false;

        map.eachLayer((layer) => {
          if (layer === labels || !(layer instanceof L.TileLayer)) return;
          const url = (layer as TileLayerWithUrl)._url ?? "";
          if (url.includes(IMAGERY_URL_FRAGMENT)) satelliteActive = true;
        });

        if (satelliteActive) {
          const overlay = await ensureLabels();
          if (overlay && satelliteActive && !map.hasLayer(overlay)) overlay.addTo(map);
        } else if (labels && map.hasLayer(labels)) {
          labels.removeFrom(map);
        }
      } finally {
        syncScheduled = false;
      }
    });
  };

  map.on("layeradd layerremove", syncLabels);
  map.whenReady(syncLabels);
  map.on("unload", () => map.off("layeradd layerremove", syncLabels));
});
