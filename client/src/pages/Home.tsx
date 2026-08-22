import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MapContainer, Marker, Polygon, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import JSZip from "jszip";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Download,
  FileDown,
  FileUp,
  FolderOpen,
  HelpCircle,
  Layers3,
  LocateFixed,
  MapPinned,
  Navigation,
  Redo2,
  Satellite,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { polygonAreaM2, normalizeBearing180 } from "../domain/geoMath";
import { orientTowardStart, planMission, reverseMission } from "../domain/gridPlanner";
import {
  CAMERA_MINI_5_PRO,
  DEFAULT_SETTINGS,
  type GeoPoint,
  type MissionPlan,
  type MissionSettings,
  type SavedProject,
} from "../domain/models";
import { buildKmzFiles, buildPreviewKml, validateWpmlFiles } from "../dji/kmzExporter";
import {
  dxfPolylineToLatLng,
  importBoundaryFile,
  readDxfPolylines,
  type DxfCrs,
  type DxfPolyline,
} from "../io/importers";
import { deleteProject, loadProjects, saveProject } from "../storage/projectStore";

const DEFAULT_CENTER: GeoPoint = { lat: -26.116, lng: -48.616 };
const vertexIcon = L.divIcon({ className: "nv-vertex-icon", html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] });
const startIcon = L.divIcon({ className: "nv-start-icon", html: '<span>S</span>', iconSize: [28, 28], iconAnchor: [14, 14] });
const routeStartIcon = L.divIcon({ className: "nv-route-start", html: '<span>1</span>', iconSize: [26, 26], iconAnchor: [13, 13] });
const routeEndIcon = L.divIcon({ className: "nv-route-end", html: '<span>F</span>', iconSize: [26, 26], iconAnchor: [13, 13] });

type DrawMode = "idle" | "draw" | "start";

type PendingDxf = {
  polylines: DxfPolyline[];
  fileName: string;
} | null;

function MapClickController({ mode, onPoint }: { mode: DrawMode; onPoint: (point: GeoPoint) => void }) {
  useMapEvents({
    click(event) {
      if (mode !== "idle") onPoint({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

function MapFit({ points, request }: { points: GeoPoint[]; request: number }) {
  const map = useMap();
  useEffect(() => {
    if (request <= 0 || points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 18);
      return;
    }
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [32, 32] });
  }, [map, points, request]);
  return null;
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className={`modal-card ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Fechar">×</button></header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

function HelpTip({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      tabIndex={0}
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: 15,
        height: 15,
        marginLeft: 4,
        border: "1px solid #a8b5b1",
        borderRadius: "50%",
        color: "#52666d",
        background: "#f7f9f6",
        fontSize: 9,
        fontWeight: 800,
        lineHeight: 1,
        cursor: "help",
        verticalAlign: "middle",
      }}
    >
      ?
    </span>
  );
}

function NumberField({ label, help, value, unit, min, max, step = 1, disabled, onChange }: {
  label: string;
  help?: string;
  value: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}{help && <HelpTip text={help} />}</span>
      <div><input type="number" value={value} min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />{unit && <small>{unit}</small>}</div>
    </label>
  );
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [boundary, setBoundary] = useState<GeoPoint[]>([]);
  const [referenceBoundary, setReferenceBoundary] = useState<GeoPoint[]>([]);
  const [preferredStart, setPreferredStart] = useState<GeoPoint | null>(null);
  const [plan, setPlan] = useState<MissionPlan | null>(null);
  const [settings, setSettings] = useState<MissionSettings>({ ...DEFAULT_SETTINGS });
  const [mode, setMode] = useState<DrawMode>("idle");
  const [satellite, setSatellite] = useState(false);
  const [showReference, setShowReference] = useState(true);
  const [showBoundary, setShowBoundary] = useState(true);
  const [showRoute, setShowRoute] = useState(true);
  const [fitRequest, setFitRequest] = useState(0);
  const [fitPoints, setFitPoints] = useState<GeoPoint[]>([]);
  const [projects, setProjects] = useState<SavedProject[]>(() => loadProjects());
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [dxfOpen, setDxfOpen] = useState(false);
  const [pendingDxf, setPendingDxf] = useState<PendingDxf>(null);
  const [dxfCrs, setDxfCrs] = useState<DxfCrs>("SIRGAS_2000_UTM_22S");
  const areaM2 = useMemo(() => polygonAreaM2(boundary), [boundary]);

  const invalidatePlan = () => setPlan(null);

  const updateSettings = <K extends keyof MissionSettings>(key: K, value: MissionSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    invalidatePlan();
  };

  const fitTo = (points: GeoPoint[]) => {
    if (points.length === 0) return;
    setFitPoints(points.map((p) => ({ ...p })));
    setFitRequest((value) => value + 1);
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Este navegador não oferece geolocalização.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = { lat: coords.latitude, lng: coords.longitude };
        setCenter(point);
        fitTo([point]);
        toast.success("Mapa centralizado na sua localização.");
      },
      () => toast.error("Não foi possível obter sua localização. Verifique a permissão do navegador."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  useEffect(() => {
    const timer = window.setTimeout(requestLocation, 500);
    return () => window.clearTimeout(timer);
  }, []);

  const handleMapPoint = (point: GeoPoint) => {
    if (mode === "start") {
      setPreferredStart(point);
      setMode("idle");
      if (plan) {
        try {
          setPlan(orientTowardStart(planMission(boundary, settings), point));
        } catch (error) {
          toast.error(messageOf(error));
        }
      }
      toast.success("Ponto inicial preferido definido.");
      return;
    }
    if (mode === "draw") {
      setBoundary((current) => [...current, point]);
      invalidatePlan();
    }
  };

  const moveVertex = (index: number, point: GeoPoint) => {
    setBoundary((current) => current.map((item, itemIndex) => itemIndex === index ? point : item));
    invalidatePlan();
  };

  const generate = (overrideSettings = settings) => {
    try {
      const generated = orientTowardStart(planMission(boundary, overrideSettings, CAMERA_MINI_5_PRO), preferredStart);
      setPlan(generated);
      setMode("idle");
      toast.success(`Plano gerado: ${generated.stats.photoCount} waypoints em ${generated.parts.length} parte(s).`);
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  const rotate = (delta: number) => {
    if (boundary.length < 3) {
      toast.error("Desenhe o quadro de voo antes de rotacionar as linhas.");
      return;
    }
    const currentBearing = plan?.stats.effectiveBearingDeg ?? settings.bearingDeg;
    const nextSettings = { ...settings, autoBearing: false, bearingDeg: normalizeBearing180(currentBearing + delta) };
    setSettings(nextSettings);
    generate(nextSettings);
  };

  const invert = () => {
    if (!plan) return toast.error("Gere o plano antes de inverter a missão.");
    setPlan(reverseMission(plan));
    toast.success("Sentido da missão invertido.");
  };

  const preset2d = () => {
    setSettings({ ...settings, altitudeM: 60, speedMs: 5, frontOverlapPct: 80, sideOverlapPct: 70, gimbalPitchDeg: -90, autoBearing: true, crossHatch: false });
    invalidatePlan();
    toast.success("Preset 2D AUTO aplicado.");
  };

  const presetCross = () => {
    setSettings({ ...settings, altitudeM: 60, speedMs: 4, frontOverlapPct: 80, sideOverlapPct: 75, gimbalPitchDeg: -90, autoBearing: true, crossHatch: true });
    invalidatePlan();
    toast.success("Preset CRUZADO AUTO aplicado.");
  };

  const clearBoundary = () => {
    if (boundary.length > 0 && !window.confirm("Limpar o quadro de voo e o plano atual?")) return;
    setBoundary([]);
    setPreferredStart(null);
    setPlan(null);
    setMode("idle");
  };

  const useReferenceAsBoundary = () => {
    if (referenceBoundary.length < 3) return toast.error("Importe primeiro uma referência válida.");
    setBoundary(referenceBoundary.map((p) => ({ ...p })));
    setPlan(null);
    fitTo(referenceBoundary);
    toast.success("Referência copiada para o quadro de voo. Revise os vértices antes de gerar a missão.");
  };

  const onImportFile = async (file: File) => {
    try {
      if (file.name.toLocaleLowerCase().endsWith(".dxf")) {
        const polylines = readDxfPolylines(await file.text());
        if (polylines.length === 0) throw new Error("DXF sem polilinha utilizável.");
        setPendingDxf({ polylines, fileName: file.name });
        setDxfOpen(true);
        return;
      }
      const points = await importBoundaryFile(file, dxfCrs);
      setReferenceBoundary(points);
      setShowReference(true);
      fitTo(points);
      toast.success(`Referência importada: ${points.length} vértices.`);
    } catch (error) {
      toast.error(`Falha ao importar: ${messageOf(error)}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const chooseDxfPolyline = (polyline: DxfPolyline) => {
    try {
      const points = dxfPolylineToLatLng(polyline, dxfCrs);
      setReferenceBoundary(points);
      setShowReference(true);
      setDxfOpen(false);
      setPendingDxf(null);
      fitTo(points);
      toast.success(`DXF importado: camada ${polyline.layer}, ${points.length} vértices.`);
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  const openSave = () => {
    if (boundary.length < 3) return toast.error("Desenhe o quadro de voo antes de salvar.");
    const date = new Date();
    setSaveName(`Mapeamento ${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
    setSaveOpen(true);
  };

  const confirmSave = () => {
    const name = saveName.trim();
    if (!name) return toast.error("Informe o nome do projeto.");
    const saved: SavedProject = {
      name,
      boundary: boundary.map((p) => ({ ...p })),
      settings: { ...settings },
      savedAtMs: Date.now(),
      referenceBoundary: referenceBoundary.map((p) => ({ ...p })),
      preferredStart: preferredStart ? { ...preferredStart } : null,
      plan: plan ? structuredClone(plan) : null,
    };
    const next = saveProject(saved);
    setProjects(next);
    setSaveOpen(false);
    toast.success("Projeto salvo neste dispositivo.");
  };

  const loadProject = (project: SavedProject) => {
    setBoundary(project.boundary.map((p) => ({ ...p })));
    setReferenceBoundary(project.referenceBoundary.map((p) => ({ ...p })));
    setPreferredStart(project.preferredStart ? { ...project.preferredStart } : null);
    setSettings({ ...project.settings });
    setPlan(project.plan ? structuredClone(project.plan) : null);
    setProjectsOpen(false);
    fitTo(project.boundary.length ? project.boundary : project.referenceBoundary);
    toast.success("Projeto carregado.");
  };

  const removeProject = (project: SavedProject) => {
    if (!window.confirm(`Excluir o projeto “${project.name}”?`)) return;
    setProjects(deleteProject(project.name));
  };

  const downloadPart = async (partIndex: number) => {
    if (!plan) return;
    try {
      const files = buildKmzFiles(plan, partIndex, "MiniFlyMap");
      const errors = validateWpmlFiles(files, plan.parts[partIndex].length);
      if (errors.length) throw new Error(errors.join(" "));
      const zip = new JSZip();
      zip.file("wpmz/template.kml", files.templateKml);
      zip.file("wpmz/waylines.wpml", files.waylinesWpml);
      const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.google-earth.kmz", compression: "DEFLATE" });
      downloadBlob(blob, files.fileName);
      toast.success(`KMZ ${partIndex + 1}/${plan.parts.length} validado e gerado.`);
    } catch (error) {
      toast.error(`Exportação bloqueada: ${messageOf(error)}`);
    }
  };

  const downloadAllParts = async () => {
    if (!plan) return;
    try {
      const packageZip = new JSZip();
      for (let index = 0; index < plan.parts.length; index += 1) {
        const files = buildKmzFiles(plan, index, "MiniFlyMap");
        const errors = validateWpmlFiles(files, plan.parts[index].length);
        if (errors.length) throw new Error(`Parte ${index + 1}: ${errors.join(" ")}`);
        const kmz = new JSZip();
        kmz.file("wpmz/template.kml", files.templateKml);
        kmz.file("wpmz/waylines.wpml", files.waylinesWpml);
        const kmzBytes = await kmz.generateAsync({ type: "uint8array", compression: "DEFLATE" });
        packageZip.file(files.fileName, kmzBytes);
      }
      packageZip.file("LEIA-ME.txt", "Extraia este ZIP. Cada arquivo .kmz é uma parte independente da missão e deve ser usado individualmente no DJI Fly. Revise rota, altura, RTH, gimbal e ações de foto antes do voo.");
      downloadBlob(await packageZip.generateAsync({ type: "blob", compression: "DEFLATE" }), "MiniFlyMap_todas_as_partes.zip");
      toast.success("Pacote com todas as partes gerado.");
    } catch (error) {
      toast.error(`Exportação bloqueada: ${messageOf(error)}`);
    }
  };

  const downloadPreview = () => {
    if (!plan) return toast.error("Gere o plano antes de exportar a prévia.");
    downloadBlob(new Blob([buildPreviewKml(plan)], { type: "application/vnd.google-earth.kml+xml" }), "MiniFlyMap_preview.kml");
  };

  const route = plan?.waypoints ?? [];
  const mapFocus = boundary.length ? boundary : referenceBoundary.length ? referenceBoundary : [center];

  return (
    <main className="nv-app">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">MF</span><div><strong>MiniFlyMap</strong><small>Planejamento fotogramétrico · DJI Mini 5 Pro</small></div></div>
        <div className="top-actions">
          <button className="btn secondary" onClick={() => setProjectsOpen(true)}><FolderOpen size={16} /> Projetos</button>
          <button className="btn secondary" onClick={openSave}><Save size={16} /> Salvar</button>
          <button className="btn primary" disabled={!plan} onClick={() => setExportOpen(true)}><Download size={16} /> Exportar DJI</button>
        </div>
      </header>

      <section className="workspace">
        <div className="map-pane">
          <div className="map-toolbar">
            <div className="toolbar-group">
              <button className={`btn ${mode === "draw" ? "active" : "secondary"}`} onClick={() => setMode(mode === "draw" ? "idle" : "draw")}><MapPinned size={16} /> {mode === "draw" ? "Encerrar desenho" : "Desenhar quadro"}</button>
              <button className="icon-btn" title="Desfazer último vértice" onClick={() => { setBoundary((current) => current.slice(0, -1)); invalidatePlan(); }}><Undo2 size={17} /></button>
              <button className="icon-btn danger" title="Limpar quadro" onClick={clearBoundary}><Trash2 size={17} /></button>
            </div>
            <div className="toolbar-group">
              <input ref={fileInputRef} className="hidden-file" type="file" accept=".kml,.kmz,.dxf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onImportFile(file); }} />
              <button className="btn secondary" onClick={() => fileInputRef.current?.click()}><FileUp size={16} /> Importar</button>
              <button className="icon-btn" title="Minha localização" onClick={requestLocation}><LocateFixed size={17} /></button>
              <button className="icon-btn" aria-pressed={satellite} title={satellite ? "Desligar satélite e usar OpenStreetMap" : "Ligar imagem de satélite Esri"} onClick={() => setSatellite((value) => !value)}><Satellite size={17} /></button>
              <button className="icon-btn" title="Camadas" onClick={() => setLayersOpen(true)}><Layers3 size={17} /></button>
              <button className="icon-btn" title="Ajustar mapa" onClick={() => fitTo(mapFocus)}><Crosshair size={17} /></button>
            </div>
          </div>

          <div className="map-card">
            <MapContainer center={[center.lat, center.lng]} zoom={17} scrollWheelZoom className={`leaflet-map ${mode !== "idle" ? "capture-mode" : ""}`}>
              <TileLayer
                attribution={satellite ? "Tiles © Esri" : "© OpenStreetMap contributors"}
                url={satellite ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
              />
              <MapClickController mode={mode} onPoint={handleMapPoint} />
              <MapFit points={fitPoints} request={fitRequest} />
              {showReference && referenceBoundary.length >= 3 && <Polygon positions={referenceBoundary.map(toTuple)} pathOptions={{ color: "#1976d2", fillOpacity: 0.04, weight: 3 }} />}
              {showBoundary && boundary.length >= 3 && <Polygon positions={boundary.map(toTuple)} pathOptions={{ color: "#f57c00", fillColor: "#ff9800", fillOpacity: 0.08, weight: 3 }} />}
              {showBoundary && boundary.map((point, index) => (
                <Marker key={`vertex-${index}`} position={toTuple(point)} draggable icon={vertexIcon} eventHandlers={{ dragend: (event) => { const ll = (event.target as L.Marker).getLatLng(); moveVertex(index, { lat: ll.lat, lng: ll.lng }); } }} />
              ))}
              {showRoute && route.length > 1 && <Polyline positions={route.map(toTuple)} pathOptions={{ color: "#0d7c66", weight: 3 }} />}
              {showRoute && route.length > 0 && <Marker position={toTuple(route[0])} icon={routeStartIcon} />}
              {showRoute && route.length > 1 && <Marker position={toTuple(route[route.length - 1])} icon={routeEndIcon} />}
              {preferredStart && <Marker position={toTuple(preferredStart)} icon={startIcon} />}
            </MapContainer>
            <div className="map-status"><span>{mode === "draw" ? "DESENHO ATIVO · clique para adicionar vértices" : mode === "start" ? "DEFINA O INÍCIO · clique no mapa" : "MAPA OPERACIONAL"}</span><span>{boundary.length} vértices · {formatArea(areaM2)}</span></div>
          </div>

          {referenceBoundary.length >= 3 && (
            <div className="reference-banner"><div><strong>Referência importada</strong><span>{referenceBoundary.length} vértices · azul no mapa</span></div><button className="btn secondary" onClick={useReferenceAsBoundary}>Usar como quadro</button></div>
          )}

          <div className="mission-controls">
            <button className="btn secondary" onClick={() => { if (boundary.length < 3) return toast.error("Desenhe o quadro primeiro."); setMode("start"); }}><Navigation size={16} /> Definir início</button>
            <button className="btn secondary" onClick={() => rotate(-15)}><ChevronLeft size={16} /> −15°</button>
            <button className="btn secondary" onClick={() => rotate(15)}>+15° <ChevronRight size={16} /></button>
            <button className="btn secondary" disabled={!plan} onClick={invert}><Redo2 size={16} /> Inverter rota</button>
            <button className="btn secondary" disabled={!plan} onClick={downloadPreview}><FileDown size={16} /> Prévia KML</button>
            <button className="btn secondary" onClick={() => setGuideOpen(true)}><HelpCircle size={16} /> Guia DJI</button>
          </div>
        </div>

        <aside className="config-pane">
          <section className="panel">
            <div className="panel-title"><div><small>PERFIL</small><h2>DJI Mini 5 Pro</h2></div><span className={`status ${plan ? "ready" : "draft"}`}>{plan ? "Plano aplicado" : "Não aplicado"}</span></div>
            <div className="preset-row"><button className="btn preset" onClick={preset2d}>2D AUTO</button><button className="btn preset" onClick={presetCross}>CRUZADO AUTO</button></div>
            <div className="field-grid">
              <NumberField label="Altura" help="Altura planejada da aeronave em relação ao ponto de decolagem/início usado pela missão. Não é altitude em relação ao nível do mar; em terrenos com variação de cota, a distância real ao solo também varia." value={settings.altitudeM} unit="m" min={10} max={500} step={1} onChange={(value) => updateSettings("altitudeM", value)} />
              <NumberField label="Velocidade" help="Velocidade planejada de deslocamento entre os waypoints. Valores maiores reduzem o tempo de voo, mas exigem atenção à qualidade das imagens, iluminação e vento." value={settings.speedMs} unit="m/s" min={0.5} max={15} step={0.5} onChange={(value) => updateSettings("speedMs", value)} />
              <NumberField label="Overlap frontal" help="Sobreposição entre fotografias consecutivas na direção do voo. Aumentar este valor gera mais fotos e maior redundância longitudinal." value={settings.frontOverlapPct} unit="%" min={10} max={95} onChange={(value) => updateSettings("frontOverlapPct", value)} />
              <NumberField label="Overlap lateral" help="Sobreposição entre faixas de voo adjacentes. Aumentar este valor aproxima as linhas e aumenta a cobertura lateral e a quantidade de imagens." value={settings.sideOverlapPct} unit="%" min={10} max={95} onChange={(value) => updateSettings("sideOverlapPct", value)} />
            </div>
            <div className="switch-row">
              <label><input type="checkbox" checked={settings.autoBearing} onChange={(event) => updateSettings("autoBearing", event.target.checked)} /> Direção automática otimizada <HelpTip text="Calcula automaticamente a orientação das linhas de voo buscando uma rota mais eficiente para o polígono desenhado." /></label>
              <label><input type="checkbox" checked={settings.crossHatch} onChange={(event) => updateSettings("crossHatch", event.target.checked)} /> Varredura cruzada +90° <HelpTip text="Adiciona uma segunda grade de voo perpendicular à primeira. Aumenta a cobertura, o número de fotos e o tempo de missão." /></label>
            </div>
            <div className="field-grid advanced-grid">
              <NumberField label="Direção" help="Ângulo das linhas de voo, entre 0° e 180°. Este campo fica bloqueado quando a direção automática está ativada." value={settings.bearingDeg} unit="°" min={0} max={179.9} step={5} disabled={settings.autoBearing} onChange={(value) => updateSettings("bearingDeg", value)} />
              <NumberField label="Gimbal" help="Inclinação vertical da câmera. -90° aponta a câmera diretamente para baixo (nadir), configuração típica para mapeamento 2D." value={settings.gimbalPitchDeg} unit="°" min={-135} max={80} step={1} onChange={(value) => updateSettings("gimbalPitchDeg", value)} />
              <NumberField label="Máx. waypoints" help="Quantidade máxima de waypoints por arquivo de missão. Se o plano ultrapassar esse limite, o MiniFlyMap divide a missão automaticamente em partes." value={settings.maxWaypointsPerMission} min={20} max={200} step={1} onChange={(value) => updateSettings("maxWaypointsPerMission", Math.round(value))} />
              <NumberField label="DJI drone enum" help="Identificador interno do modelo de aeronave gravado no WPML/KMZ. O valor 68 está configurado para o Mini 5 Pro e deve ser conferido no DJI Fly antes do voo." value={settings.droneEnumValue} min={1} step={1} onChange={(value) => updateSettings("droneEnumValue", Math.round(value))} />
            </div>
            <div className="select-grid">
              <label><span>Fim da missão <HelpTip text="Define a ação solicitada depois do último waypoint: retornar ao ponto inicial, permanecer, pousar ou voltar ao primeiro waypoint." /></span><select value={settings.finishAction} onChange={(event) => updateSettings("finishAction", event.target.value as MissionSettings["finishAction"])}><option value="goHome">Retornar para casa (RTH)</option><option value="noAction">Sem ação</option><option value="autoLand">Pousar</option><option value="gotoFirstWaypoint">Voltar ao primeiro waypoint</option></select></label>
              <label><span>Perda de sinal <HelpTip text="Define o comportamento solicitado à aeronave se a comunicação com o controle for perdida durante a missão. Sempre confirme esta configuração no DJI Fly antes de decolar." /></span><select value={settings.rcLostAction} onChange={(event) => updateSettings("rcLostAction", event.target.value as MissionSettings["rcLostAction"])}><option value="goBack">Retornar (RTH)</option><option value="landing">Pousar</option><option value="hover">Pairar</option><option value="goContinue">Continuar missão</option></select></label>
            </div>
            <div className="compat-note"><AlertTriangle size={16} /><span>Perfil Mini 5 Pro usa <b>droneEnumValue 68</b>, configurável. A compatibilidade final deve ser validada no DJI Fly antes do voo.</span></div>
            <button className="btn primary generate" onClick={() => generate()}><Navigation size={17} /> APLICAR PLANO</button>
          </section>

          <section className="panel stats-panel">
            <div className="panel-title"><div><small>REVISÃO</small><h2>Estatísticas calculadas</h2></div>{plan ? <CheckCircle2 className="ok-icon" size={20} /> : <AlertTriangle className="warn-icon" size={20} />}</div>
            <div className="stats-grid">
              <Stat label="Área" value={plan ? formatArea(plan.stats.areaM2) : formatArea(areaM2)} />
              <Stat label="GSD" value={plan ? `${plan.stats.gsdCmPx.toFixed(2)} cm/px` : "—"} />
              <Stat label="Fotos/waypoints" value={plan ? String(plan.stats.photoCount) : "—"} />
              <Stat label="Linhas de voo" value={plan ? String(plan.stats.flightLineCount) : "—"} />
              <Stat label="Espaço linhas" value={plan ? `${plan.stats.lineSpacingM.toFixed(1)} m` : "—"} />
              <Stat label="Espaço fotos" value={plan ? `${plan.stats.photoSpacingM.toFixed(1)} m` : "—"} />
              <Stat label="Rota" value={plan ? formatDistance(plan.stats.routeDistanceM) : "—"} />
              <Stat label="Tempo estimado" value={plan ? `~${Math.ceil(plan.stats.estimatedFlightSeconds / 60)} min` : "—"} />
              <Stat label="Bearing efetivo" value={plan ? `${plan.stats.effectiveBearingDeg.toFixed(0)}°` : "—"} />
              <Stat label="Partes DJI" value={plan ? String(plan.parts.length) : "—"} />
            </div>
            {plan && plan.parts.length > 1 && <div className="split-warning"><AlertTriangle size={16} /> Missão dividida automaticamente para respeitar o limite de {settings.maxWaypointsPerMission} waypoints por arquivo.</div>}
          </section>
        </aside>
      </section>

      {saveOpen && <Modal title="Salvar projeto" onClose={() => setSaveOpen(false)}><label className="modal-field"><span>Nome</span><input autoFocus value={saveName} onChange={(event) => setSaveName(event.target.value)} /></label><div className="modal-actions"><button className="btn secondary" onClick={() => setSaveOpen(false)}>Cancelar</button><button className="btn primary" onClick={confirmSave}>Salvar</button></div></Modal>}

      {projectsOpen && <Modal title="Projetos salvos" onClose={() => setProjectsOpen(false)} wide><div className="project-list">{projects.length === 0 ? <p className="empty">Nenhum projeto salvo neste navegador.</p> : projects.map((project) => <article key={`${project.name}-${project.savedAtMs}`}><div><strong>{project.name}</strong><span>{new Date(project.savedAtMs).toLocaleString("pt-BR")}</span><small>{project.boundary.length} vértices · {project.plan ? `${project.plan.stats.photoCount} waypoints` : "sem plano aplicado"}</small></div><div><button className="btn secondary" onClick={() => loadProject(project)}>Abrir</button><button className="icon-btn danger" onClick={() => removeProject(project)}><Trash2 size={16} /></button></div></article>)}</div></Modal>}

      {guideOpen && <Modal title="Levar a missão ao DJI Fly" onClose={() => setGuideOpen(false)} wide><ol className="guide"><li>Desenhe ou importe uma referência e defina o quadro real de voo.</li><li>Gere o plano e confira no mapa a direção, início/fim, altura e cobertura.</li><li>Exporte a prévia KML e, se desejar, faça uma conferência adicional no Google Earth.</li><li>Exporte o KMZ DJI. Se houver mais de 190 waypoints, use cada parte separadamente.</li><li>No DJI Fly, crie e salve uma missão Waypoint temporária.</li><li>No armazenamento do celular/controle, localize o KMZ dessa missão e substitua-o pelo KMZ correspondente gerado pelo MiniFlyMap. A pasta varia conforme Android, controle e versão do DJI Fly.</li><li>Reabra a missão no DJI Fly e confira visualmente todos os waypoints, altura relativa, RTH, perda de sinal, gimbal e ações de foto.</li><li>O primeiro voo deve ser em área aberta e pequena. A posição de decolagem deve ter cota semelhante à usada no planejamento porque a altura da missão é relativa ao ponto inicial.</li></ol><div className="guide-warning"><AlertTriangle size={18} /><span>O DJI Fly não oferece uma função oficial genérica de “Importar KMZ”. Este fluxo utiliza o arquivo de missão salvo pelo próprio DJI Fly e deve ser validado no aplicativo antes da decolagem.</span></div></Modal>}

      {layersOpen && <Modal title="Camadas do mapa" onClose={() => setLayersOpen(false)}><div className="layer-options"><label><input type="checkbox" checked={satellite} onChange={(e) => setSatellite(e.target.checked)} /> Usar imagem de satélite (Esri)</label><small style={{ color: "#74858b", fontSize: 10, marginTop: -5 }}>{satellite ? "Ligado: imagem de satélite Esri." : "Desligado: OpenStreetMap com nomes e numeração das vias."}</small><label><input type="checkbox" checked={showReference} onChange={(e) => setShowReference(e.target.checked)} /> Referência importada</label><label><input type="checkbox" checked={showBoundary} onChange={(e) => setShowBoundary(e.target.checked)} /> Quadro de voo e vértices</label><label><input type="checkbox" checked={showRoute} onChange={(e) => setShowRoute(e.target.checked)} /> Rota e início/fim</label></div></Modal>}

      {exportOpen && plan && <Modal title="Exportar missão DJI" onClose={() => setExportOpen(false)} wide><div className="export-summary"><Stat label="Altura" value={`${plan.settings.altitudeM} m`} /><Stat label="Velocidade" value={`${plan.settings.speedMs} m/s`} /><Stat label="Overlap" value={`${plan.settings.frontOverlapPct}/${plan.settings.sideOverlapPct}%`} /><Stat label="Fotos" value={String(plan.stats.photoCount)} /><Stat label="Rota" value={formatDistance(plan.stats.routeDistanceM)} /><Stat label="Partes" value={String(plan.parts.length)} /></div><div className="export-list">{plan.parts.map((part, index) => <article key={index}><div><strong>Parte {index + 1}/{plan.parts.length}</strong><span>{part.length} waypoints</span></div><button className="btn primary" onClick={() => void downloadPart(index)}><Download size={15} /> Baixar KMZ</button></article>)}</div>{plan.parts.length > 1 && <button className="btn secondary full" onClick={() => void downloadAllParts()}><FileDown size={16} /> Baixar todas as partes em ZIP</button>}<div className="guide-warning"><AlertTriangle size={17} /><span>Antes de voar: abra a missão no DJI Fly e confira rota, altura relativa, RTH, perda de sinal, gimbal e ação de foto em todos os waypoints.</span></div></Modal>}

      {dxfOpen && pendingDxf && <Modal title={`Importar DXF · ${pendingDxf.fileName}`} onClose={() => { setDxfOpen(false); setPendingDxf(null); }} wide><label className="modal-field"><span>Sistema de coordenadas</span><select value={dxfCrs} onChange={(event) => setDxfCrs(event.target.value as DxfCrs)}><option value="SIRGAS_2000_UTM_22S">SIRGAS 2000 / UTM 22S</option><option value="SIRGAS_2000_UTM_23S">SIRGAS 2000 / UTM 23S</option><option value="LAT_LON">Latitude / Longitude</option></select></label><div className="project-list dxf-list">{pendingDxf.polylines.map((polyline, index) => <article key={`${polyline.name}-${index}`}><div><strong>{polyline.name}</strong><span>Layer: {polyline.layer}</span><small>{polyline.points.length} vértices · {polyline.closed ? "fechada" : "aberta"}</small></div><button className="btn primary" onClick={() => chooseDxfPolyline(polyline)}>Usar</button></article>)}</div></Modal>}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}

function toTuple(point: GeoPoint): [number, number] {
  return [point.lat, point.lng];
}

function formatArea(areaM2: number): string {
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return "0 m²";
  return `${Math.round(areaM2).toLocaleString("pt-BR")} m²`;
}

function formatDistance(distanceM: number): string {
  return distanceM >= 1000 ? `${(distanceM / 1000).toFixed(2)} km` : `${distanceM.toFixed(0)} m`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}