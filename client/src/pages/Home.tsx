/*
 * Design: Cartografia de campo — mapa como espaço de decisão, hierarquia operacional,
 * precisão legível e revisão antes da exportação. Barlow Condensed para títulos;
 * DM Sans para dados e controles. Verde rota #0D7C66 indica missão pronta.
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  Download,
  FileDown,
  FolderOpen,
  Layers3,
  LocateFixed,
  MapPinned,
  Minus,
  Navigation,
  PencilRuler,
  Plus,
  RotateCcw,
  Save,
  Satellite,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

const routePoints = [
  [12, 22], [25, 22], [25, 34], [12, 34], [12, 46], [25, 46], [25, 58], [12, 58],
  [12, 70], [25, 70], [25, 82], [39, 82], [39, 70], [52, 70], [52, 82], [66, 82],
  [66, 70], [79, 70], [79, 58], [66, 58], [66, 46], [79, 46], [79, 34], [66, 34],
  [66, 22], [52, 22], [52, 34], [39, 34], [39, 22], [25, 22],
];

const boundary = "12,18 82,18 88,40 78,84 35,88 9,68";
const routePath = routePoints.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ");

function Field({ label, value, suffix, onChange }: { label: string; value: string; suffix?: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="field-input">
        <input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" />
        {suffix && <small>{suffix}</small>}
      </div>
    </label>
  );
}

function StatusPill({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "amber" | "navy" }) {
  return <span className={`status-pill ${tone}`}><span className="status-dot" />{children}</span>;
}

export default function Home() {
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState(6);
  const [routeReady, setRouteReady] = useState(true);
  const [showLayers, setShowLayers] = useState(false);
  const [satellite, setSatellite] = useState(true);
  const [autoBearing, setAutoBearing] = useState(true);
  const [crossHatch, setCrossHatch] = useState(false);
  const [altitude, setAltitude] = useState("60");
  const [speed, setSpeed] = useState("5");
  const [frontOverlap, setFrontOverlap] = useState("80");
  const [sideOverlap, setSideOverlap] = useState("70");
  const [bearing, setBearing] = useState("0");
  const [gimbal, setGimbal] = useState("-90");
  const [maxWaypoints, setMaxWaypoints] = useState("190");

  const photoCount = useMemo(() => Math.max(0, Math.round(Number(altitude || 60) * 0.98)), [altitude]);
  const estimatedMinutes = useMemo(() => Math.max(1, Math.round(photoCount * 1.5 / 60 + 4)), [photoCount]);

  const toggleDrawing = () => {
    setDrawing((current) => !current);
    toast(drawing ? "Modo desenho encerrado" : "Modo desenho ativo: clique no mapa para adicionar pontos");
  };

  const generateMission = () => {
    if (points < 3) {
      toast.error("Desenhe pelo menos 3 vértices antes de gerar a missão");
      return;
    }
    setRouteReady(true);
    toast.success("Plano gerado. Revise a rota antes de exportar.");
  };

  const addPoint = () => {
    if (!drawing) {
      toast("Ative DESENHAR antes de alterar a área");
      return;
    }
    setPoints((value) => value + 1);
    setRouteReady(false);
  };

  const exportMission = () => {
    if (!routeReady) {
      toast.error("Aplique o plano antes de exportar");
      return;
    }
    const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>NV_Mapping_demo</name><description>Prévia de missão — revisar no DJI Fly antes do voo.</description></Document></kml>`;
    const blob = new Blob([kml], { type: "application/vnd.google-earth.kmz" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "NV_Mapping_demo.kmz";
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Arquivo de demonstração baixado");
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark"><img src="/manus-storage/nvdrone-mark_ba7627ba.png" alt="" /></div>
          <div><div className="eyebrow">NV / OPERATIONS</div><div className="brand-name">NV MAPPING</div><div className="brand-subtitle">Drone Mapping</div></div>
        </div>
        <div className="sidebar-rule" />
        <div className="mission-id"><span>MISSÃO ATUAL</span><strong>Levantamento · 01</strong><StatusPill>Em revisão</StatusPill></div>
        <nav className="step-nav" aria-label="Etapas do planejamento">
          <div className="nav-step active"><span className="step-index">01</span><div><b>Área</b><small>Quadro definido</small></div><Check size={15} /></div>
          <div className="nav-step active"><span className="step-index">02</span><div><b>Parâmetros</b><small>Mini 5 Pro · 60 m</small></div><Check size={15} /></div>
          <div className={`nav-step ${routeReady ? "active" : "current"}`}><span className="step-index">03</span><div><b>Revisão</b><small>{routeReady ? "Rota pronta" : "Plano desatualizado"}</small></div>{routeReady ? <Check size={15} /> : <span className="nav-line" />}</div>
          <div className="nav-step"><span className="step-index">04</span><div><b>Exportação</b><small>KMZ para DJI Fly</small></div></div>
        </nav>
        <div className="sidebar-bottom">
          <button className="side-link"><FolderOpen size={17} /> Projetos salvos</button>
          <button className="side-link"><CircleHelp size={17} /> Guia de operação</button>
          <div className="device-card"><div className="device-icon"><Satellite size={18} /></div><div><span>DISPOSITIVO</span><strong>DJI Mini 5 Pro</strong><small>Perfil consumer · WPML</small></div></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div><div className="breadcrumb">PROJETOS / NV MAPPING / <span>LEVANTAMENTO 01</span></div><h1>Planejamento de voo</h1></div><div className="top-actions"><button className="icon-button" title="Desfazer"><RotateCcw size={17} /></button><button className="secondary-button"><Save size={16} /> Salvar</button><button className="primary-button" onClick={exportMission}><Download size={16} /> Exportar KMZ</button></div></header>

        <div className="content-grid">
          <section className="map-column">
            <div className="map-toolbar"><div className="tool-group"><button className={`tool-button ${drawing ? "selected" : ""}`} onClick={toggleDrawing}><PencilRuler size={16} /> {drawing ? "Parar desenho" : "Desenhar área"}</button><button className="tool-button" onClick={() => { setPoints(0); setRouteReady(false); toast("Área limpa"); }}><Trash2 size={16} /> Limpar</button><button className="tool-button"><Upload size={16} /> Importar referência</button></div><div className="tool-group"><button className="icon-button" onClick={() => toast("Centralizado no quadro de voo")}><LocateFixed size={16} /></button><button className="icon-button" onClick={() => setSatellite((value) => !value)}><Satellite size={16} /></button><button className="icon-button" onClick={() => setShowLayers((value) => !value)}><Layers3 size={16} /></button></div></div>
            <div className={`map-card ${satellite ? "satellite" : ""}`} onClick={addPoint} role="application" aria-label="Mapa interativo para desenho da área">
              <div className="map-surface"><img className="map-texture" src="/manus-storage/cartography-texture_167db50c.png" alt="" /><div className="map-grid" /><div className="map-label label-a">SÃO PAULO · BR</div><div className="map-label label-b">E 046° 37′</div><div className="map-label label-c">N 23° 32′</div><svg className="flight-map" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points={boundary} className="boundary-fill" /><polyline points={boundary} className="boundary-line" />{routeReady && <path d={routePath} className="route-line" />}{routeReady && routePoints.filter((_, index) => index % 3 === 0).map(([x, y], index) => <circle key={index} cx={x} cy={y} r="0.9" className="waypoint" />)}<circle cx="12" cy="18" r="1.8" className="start-point" /><circle cx="88" cy="40" r="1.8" className="end-point" /></svg><div className="map-compass"><Compass size={21} /><span>N</span></div><div className="map-scale"><span>0</span><i /><span>50 m</span></div><div className="map-mode"><span className={`mode-dot ${drawing ? "active" : ""}`} />{drawing ? "DESENHO ATIVO" : "VISUALIZAÇÃO"}</div>{showLayers && <div className="layers-popover"><strong>Camadas visíveis</strong><label><input type="checkbox" defaultChecked /> Quadro de voo</label><label><input type="checkbox" defaultChecked /> Rota da missão</label><label><input type="checkbox" defaultChecked /> Pontos de referência</label></div>}</div>
              <div className="map-footer"><span><MapPinned size={15} /> 6 vértices no quadro</span><span><Navigation size={15} /> Rota em sentido alternado</span><span className="map-coords">-23.5505, -46.6333</span></div>
            </div>
            <div className="map-tip"><div className="tip-icon"><PencilRuler size={16} /></div><div><strong>{drawing ? "Modo desenho ativo" : "Área de voo"}</strong><span>{drawing ? "Clique no mapa para adicionar um vértice. Use Limpar para começar de novo." : "Ative Desenhar área para editar o quadro. O mapa fica protegido fora desse modo."}</span></div><button onClick={toggleDrawing}>{drawing ? "Encerrar" : "Ativar"}</button></div>
          </section>

          <aside className="review-panel">
            <div className="panel-heading"><div><div className="eyebrow">CONFIGURAÇÃO</div><h2>Parâmetros da missão</h2></div><button className="icon-button ghost"><Settings2 size={17} /></button></div>
            <div className="device-selector"><div className="device-icon dark"><Satellite size={16} /></div><div><span>PERFIL DO DRONE</span><strong>DJI Mini 5 Pro</strong></div><ChevronDown size={16} /></div>
            <div className="section-label">VOO E COBERTURA <span>Obrigatório</span></div>
            <div className="field-grid"><Field label="Altura" value={altitude} suffix="m" onChange={setAltitude} /><Field label="Velocidade" value={speed} suffix="m/s" onChange={setSpeed} /><Field label="Sobreposição frontal" value={frontOverlap} suffix="%" onChange={setFrontOverlap} /><Field label="Sobreposição lateral" value={sideOverlap} suffix="%" onChange={setSideOverlap} /></div>
            <div className="toggle-list"><label className="toggle-row"><div><strong>Direção automática</strong><small>Escolher o sentido mais eficiente</small></div><button className={`switch ${autoBearing ? "on" : ""}`} onClick={() => setAutoBearing((value) => !value)} aria-label="Direção automática"><span /></button></label><label className="toggle-row"><div><strong>Grade cruzada</strong><small>Segundo passe para cobertura 3D</small></div><button className={`switch ${crossHatch ? "on" : ""}`} onClick={() => setCrossHatch((value) => !value)} aria-label="Grade cruzada"><span /></button></label></div>
            <div className="section-label split">AJUSTE DE ROTA <span>Opcional</span></div>
            <div className="route-tools"><button onClick={() => setBearing((Number(bearing) - 15).toString())}><ArrowDown size={15} /> -15°</button><div className="bearing-value"><Compass size={15} /><strong>{autoBearing ? "AUTO" : `${bearing}°`}</strong></div><button onClick={() => setBearing((Number(bearing) + 15).toString())}>+15° <ArrowUp size={15} /></button></div>
            <div className="advanced-row"><button onClick={() => toast("Opções avançadas disponíveis na versão Android")}><ChevronDown size={15} /> Opções avançadas</button><span>gimbal {gimbal}° · máx. {maxWaypoints} pts</span></div>
            <button className="generate-button" onClick={generateMission}><Navigation size={17} /> Aplicar plano</button>
            <div className={`validation-card ${routeReady ? "ready" : "warning"}`}>{routeReady ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}<div><strong>{routeReady ? "Plano pronto para revisão" : "Plano desatualizado"}</strong><span>{routeReady ? "A rota foi calculada com os parâmetros atuais." : "Aplique o plano para atualizar a rota."}</span></div></div>
          </aside>
        </div>

        <section className="bottom-review"><div className="review-title"><div><div className="eyebrow">FOLHA DE CONFIRMAÇÃO · 04</div><h2>Revisão antes da exportação</h2></div><StatusPill tone={routeReady ? "green" : "amber"}>{routeReady ? "Tudo conferido" : "Revisão necessária"}</StatusPill></div><div className="metrics"><div className="metric"><span>Área coberta</span><strong>2.480 <small>m²</small></strong><em>Quadro de voo</em></div><div className="metric"><span>GSD estimado</span><strong>1,8 <small>cm/px</small></strong><em>Baseado em 60 m</em></div><div className="metric"><span>Fotos previstas</span><strong>{photoCount} <small>pontos</small></strong><em>Captura automática</em></div><div className="metric"><span>Tempo estimado</span><strong>{estimatedMinutes} <small>min</small></strong><em>Sem deslocamento</em></div><div className="metric alert-metric"><span>Retorno e perda de sinal</span><strong><Check size={16} /> RTH · continuar</strong><em>Confira no DJI Fly</em></div></div><div className="review-note"><AlertTriangle size={15} /><span>CHECK OPERACIONAL · O arquivo gerado é uma orientação de missão. Revise altura relativa, sentido, RTH e ações de câmera no DJI Fly antes de autorizar a decolagem.</span><button onClick={() => toast("Guia: crie uma missão Waypoint temporária no DJI Fly e revise o KMZ substituído.")}>Ler guia DJI <ArrowUp size={14} /></button></div></section>
      </section>
    </main>
  );
}
