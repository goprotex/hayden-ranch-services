'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { parseRoofReport, detectReportSource } from '@/lib/roofing/report-parser';
import { isXmlRoofReport, parseXmlRoofReport } from '@/lib/roofing/xml-parser';
import { generateCutList } from '@/lib/roofing/cut-list-engine';
import { generateCutListPDF } from '@/lib/roofing/pdf-export';
import { PANEL_SPECS } from '@/lib/roofing/panel-specs';
import {
  generateRoofBidPDF,
  RoofBidSection,
  RoofBidData,
  RoofMaterialCosts,
  RoofSketchFacet,
} from '@/lib/roofing/roofing-bid-pdf';
import { RoofModel, RoofFacet, PanelProfile, ReportSource, CutList } from '@/types';
import CutListTable from '@/components/roofing/CutListTable';
import TrimTable from '@/components/roofing/TrimTable';
import RoofXmlViewer from '@/components/roofing/RoofXmlViewer';
import HaydenLogo from '@/components/HaydenLogo';

import type { RoofPolygon, CutListPanel } from '@/components/roofing/RoofMap';
import { generatePanelOverlay } from '@/lib/roofing/panel-overlay';
const RoofMap = dynamic(() => import('@/components/roofing/RoofMap'), { ssr: false });

const COMPANY = {
  name: 'HAYDEN RANCH SERVICES',
  address: '5900 Balcones Dr #26922, Austin, TX 78731',
  phone: '(830) 777-9111',
  email: 'office@haydenclaim.com',
};

const ROOF_TYPE_LABELS: Record<string, string> = {
  standing_seam: 'Standing Seam Metal',
  r_panel: 'R-Panel Metal',
  corrugated: 'Corrugated Metal',
  stone_coated: 'Stone-Coated Steel',
  exposed_fastener: 'Exposed Fastener Metal',
};

const PITCH_LABELS = ['Low (2/12-4/12)', 'Medium (5/12-8/12)', 'Steep (9/12-12/12)', 'Very Steep (12/12+)'];
const PITCH_MULTIPLIERS = [1.0, 1.1, 1.3, 1.55];

const EXTRA_PRESETS = [
  { name: 'Tear-Off (1 layer)', defaultCost: 1500 },
  { name: 'Tear-Off (2 layers)', defaultCost: 2500 },
  { name: 'Synthetic Underlayment', defaultCost: 800 },
  { name: 'Ice & Water Shield', defaultCost: 600 },
  { name: 'Ridge Vent Installation', defaultCost: 450 },
  { name: 'Skylight Flashing', defaultCost: 350 },
  { name: 'Chimney Flashing', defaultCost: 400 },
  { name: 'Gutter Replacement', defaultCost: 1200 },
  { name: 'Fascia/Soffit Repair', defaultCost: 800 },
  { name: 'Drip Edge', defaultCost: 350 },
];

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function RoofingPage() {
  const {
    roofModels, cutLists, addRoofModel, addCutList,
    selectedPanelProfile, selectedGauge, setSelectedPanelProfile, setSelectedGauge,
  } = useAppStore();

  // Cut list state
  const [reportText, setReportText] = useState('');
  const [reportSource, setReportSource] = useState<ReportSource>('eagleview');
  const [projectName, setProjectName] = useState('');
  const [projectAddress, setProjectAddress] = useState('');
  const [activeModel, setActiveModel] = useState<RoofModel | null>(null);
  const [activeCutList, setActiveCutList] = useState<CutList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [manualFacets, setManualFacets] = useState<RoofFacet[]>([]);
  const [mode, setMode] = useState<'import' | 'bid'>('bid');

  // Bid creator state
  const [bidClientName, setBidClientName] = useState('');
  const [bidAddress, setBidAddress] = useState('');
  const [bidProjectName, setBidProjectName] = useState('');
  const [roofType, setRoofType] = useState('standing_seam');
  const [pitchIdx, setPitchIdx] = useState(1);
  const [bidDepositPercent, setBidDepositPercent] = useState(50);
  const [bidTimelineDays, setBidTimelineDays] = useState(8);
  const [includesTearOff, setIncludesTearOff] = useState(true);
  const [roofLayers, setRoofLayers] = useState(1);
  const [warrantyYears, setWarrantyYears] = useState(2);
  const [bidOverview, setBidOverview] = useState(
    'Complete tear-off and replacement with new metal roofing system. Includes removal of existing materials, inspection of decking, installation of synthetic underlayment, and professional panel installation with all required flashing and trim.'
  );
  const [bidSections, setBidSections] = useState<RoofBidSection[]>([
    { id: uid(), name: 'Main Roof', areaSqFt: 2000, ratePerSqFt: 0, total: 0, pitch: 'Medium' },
  ]);
  const [bidExtras, setBidExtras] = useState<{ id: string; name: string; cost: number }[]>([]);
  const [bidView, setBidView] = useState<'map' | 'sections' | 'preview'>('map');

  // Material / Pricing controls
  const [panelCost, setPanelCost] = useState(1.85);
  const [underlaymentCost, setUnderlaymentCost] = useState(0.35);
  const [trimCost, setTrimCost] = useState(0.45);
  const [fastenerCost, setFastenerCost] = useState(0.15);
  const [laborCost, setLaborCost] = useState(1.50);
  const [profitMargin, setProfitMargin] = useState(25);
  const [overheadPct, setOverheadPct] = useState(10);

  // Map polygons
  const [mapPolygons, setMapPolygons] = useState<RoofPolygon[]>([]);
  const [cutListPanels, setCutListPanels] = useState<CutListPanel[]>([]);

  // Auto-calculate effective rate from material costs
  const materialCostPerSqFt = useMemo(() =>
    panelCost + underlaymentCost + trimCost + fastenerCost, [panelCost, underlaymentCost, trimCost, fastenerCost]);

  const costPlusLabor = useMemo(() => materialCostPerSqFt + laborCost, [materialCostPerSqFt, laborCost]);

  const effectiveRate = useMemo(() => {
    const withOverhead = costPlusLabor * (1 + overheadPct / 100);
    const withProfit = withOverhead * (1 + profitMargin / 100);
    return Math.round(withProfit * PITCH_MULTIPLIERS[pitchIdx] * 100) / 100;
  }, [costPlusLabor, overheadPct, profitMargin, pitchIdx]);

  // Sync map polygons to bid sections
  const syncMapToBid = useCallback(() => {
    if (mapPolygons.length === 0) return;
    setBidSections(mapPolygons.map(p => ({
      id: p.id,
      name: p.name,
      areaSqFt: p.areaSqFt,
      ratePerSqFt: 0,
      total: 0,
      pitch: p.pitch,
    })));
  }, [mapPolygons]);

  // Auto-sync when polygons change
  useEffect(() => {
    if (mapPolygons.length > 0) syncMapToBid();
  }, [mapPolygons, syncMapToBid]);

  // Cut List Handlers
  const handleImportReport = useCallback(() => {
    if (!reportText.trim()) return;
    setUploadError('');
    const model = parseRoofReport(reportText, reportSource, projectName || undefined);
    addRoofModel(model);
    setActiveModel(model);
    setManualFacets(model.facets);
    setReportText('');
  }, [reportText, reportSource, projectName, addRoofModel]);

  const handleBuildFromSketch = useCallback(() => {
    if (manualFacets.length === 0) return;
    const totalArea = manualFacets.reduce((s, f) => s + f.areaSquareFeet, 0);
    const model: RoofModel = {
      id: `rm_${Date.now()}`, projectName: projectName || 'Imported Model',
      address: projectAddress || '', source: 'manual', totalAreaSqFt: totalArea,
      facets: manualFacets, createdAt: new Date().toISOString(),
    };
    addRoofModel(model);
    setActiveModel(model);
  }, [manualFacets, projectName, projectAddress, addRoofModel]);

  const handleGenerateCutList = useCallback(() => {
    if (!activeModel) return;
    const modelToUse: RoofModel = manualFacets.length > 0
      ? { ...activeModel, facets: manualFacets, totalAreaSqFt: manualFacets.reduce((s, f) => s + f.areaSquareFeet, 0) }
      : activeModel;
    const cutList = generateCutList(modelToUse, selectedPanelProfile, selectedGauge);
    addCutList(cutList);
    setActiveCutList(cutList);
  }, [activeModel, manualFacets, selectedPanelProfile, selectedGauge, addCutList]);

  const handleDownloadCutListPDF = useCallback(() => {
    if (!activeCutList || !activeModel) return;
    const modelToUse: RoofModel = manualFacets.length > 0
      ? { ...activeModel, facets: manualFacets, totalAreaSqFt: manualFacets.reduce((s, f) => s + f.areaSquareFeet, 0) }
      : activeModel;
    generateCutListPDF(activeCutList, modelToUse);
  }, [activeCutList, activeModel, manualFacets]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    const fileName = file.name.replace(/\.\w+$/, '');
    setProjectName(fileName);

    // XML files – parse directly into a RoofModel (no text-extract step needed)
    if (file.name.toLowerCase().endsWith('.xml') || file.type === 'text/xml' || file.type === 'application/xml') {
      setUploading(true);
      try {
        const xmlText = await file.text();
        if (!isXmlRoofReport(xmlText)) {
          throw new Error('This XML file does not appear to contain roof measurement data.');
        }
        const model = parseXmlRoofReport(xmlText, fileName);
        addRoofModel(model);
        setActiveModel(model);
        setManualFacets(model.facets);
        setReportText(xmlText);
        setReportSource(model.source);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Failed to parse XML');
      } finally { setUploading(false); }
      return;
    }

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/parse-pdf', { method: 'POST', body: formData });
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'PDF parsing failed'); }
        const { text } = await res.json();
        if (!text || text.trim().length < 10) throw new Error('PDF contained no extractable text.');
        setReportText(text);
        const detected = detectReportSource(text);
        if (detected !== 'manual') setReportSource(detected);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Failed to parse PDF');
      } finally { setUploading(false); }
    } else {
      const text = await file.text();
      // Check if the text file is actually XML content
      if (isXmlRoofReport(text)) {
        try {
          const model = parseXmlRoofReport(text, fileName);
          addRoofModel(model);
          setActiveModel(model);
          setManualFacets(model.facets);
          setReportText(text);
          setReportSource(model.source);
          return;
        } catch { /* fall through to normal text parsing */ }
      }
      setReportText(text);
      const detected = detectReportSource(text);
      if (detected !== 'manual') setReportSource(detected);
    }
  }, [addRoofModel]);

  // Bid Computed Values
  const bidComputed = useMemo(() =>
    bidSections.map(sec => {
      const rate = sec.ratePerSqFt > 0 ? sec.ratePerSqFt : effectiveRate;
      return { ...sec, ratePerSqFt: rate, total: Math.round(sec.areaSqFt * rate * 100) / 100 };
    }), [bidSections, effectiveRate]);

  const bidSecTotal = useMemo(() => bidComputed.reduce((s, c) => s + c.total, 0), [bidComputed]);
  const bidExtraTotal = useMemo(() => bidExtras.reduce((s, e) => s + e.cost, 0), [bidExtras]);
  const bidProjTotal = bidSecTotal + bidExtraTotal;
  const bidDeposit = Math.round(bidProjTotal * bidDepositPercent / 100 * 100) / 100;
  const bidBalance = Math.round((bidProjTotal - bidDeposit) * 100) / 100;
  const bidTotalSqFt = useMemo(() => bidComputed.reduce((s, c) => s + c.areaSqFt, 0), [bidComputed]);

  // Profitability metrics
  const totalMaterialCost = materialCostPerSqFt * bidTotalSqFt;
  const totalLaborCost = laborCost * bidTotalSqFt;
  const totalCost = totalMaterialCost + totalLaborCost;
  const grossProfit = bidProjTotal - totalCost;
  const grossMarginPct = bidProjTotal > 0 ? (grossProfit / bidProjTotal * 100) : 0;

  // Bid Handlers
  const addBidSection = useCallback(() => {
    setBidSections(p => [...p, { id: uid(), name: `Section ${p.length + 1}`, areaSqFt: 500, ratePerSqFt: 0, total: 0 }]);
  }, []);

  const updBidSec = useCallback((id: string, u: Partial<RoofBidSection>) => {
    setBidSections(p => p.map(s => s.id === id ? { ...s, ...u } : s));
  }, []);

  const rmBidSec = useCallback((id: string) => { setBidSections(p => p.filter(s => s.id !== id)); }, []);

  const addBidExtra = useCallback((preset: typeof EXTRA_PRESETS[0]) => {
    setBidExtras(p => [...p, { id: uid(), name: preset.name, cost: preset.defaultCost }]);
  }, []);

  const updBidExtra = useCallback((id: string, u: Partial<{ name: string; cost: number }>) => {
    setBidExtras(p => p.map(e => e.id === id ? { ...e, ...u } : e));
  }, []);

  const rmBidExtra = useCallback((id: string) => { setBidExtras(p => p.filter(e => e.id !== id)); }, []);

  const handleDownloadBidPDF = useCallback(() => {
    const now = new Date();
    const valid = new Date(now); valid.setDate(valid.getDate() + 30);

    // Build sketch facets from map polygons (normalized coords)
    let sketchFacets: RoofSketchFacet[] = [];
    if (mapPolygons.length > 0) {
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      for (const p of mapPolygons) {
        for (const [lng, lat] of p.coordinates) {
          minLng = Math.min(minLng, lng); minLat = Math.min(minLat, lat);
          maxLng = Math.max(maxLng, lng); maxLat = Math.max(maxLat, lat);
        }
      }
      const rangeLng = maxLng - minLng || 0.001;
      const rangeLat = maxLat - minLat || 0.001;
      sketchFacets = mapPolygons.map(p => ({
        name: p.name,
        areaSqFt: p.areaSqFt,
        pitch: p.pitch,
        color: p.color,
        vertices: p.coordinates.map(([lng, lat]) => [
          (lng - minLng) / rangeLng,
          (lat - minLat) / rangeLat,
        ] as [number, number]),
      }));
    }

    // Try to capture map image
    let mapImage: string | undefined;
    try {
      const cap = (window as unknown as Record<string, unknown>).__roofMapCapture;
      if (typeof cap === 'function') {
        mapImage = cap() || undefined;
      }
    } catch { /* skip */ }

    const matCosts: RoofMaterialCosts = {
      panelCostPerSqFt: panelCost,
      underlaymentCostPerSqFt: underlaymentCost,
      trimAndFlashingPerSqFt: trimCost,
      fastenersCostPerSqFt: fastenerCost,
      laborCostPerSqFt: laborCost,
      profitMarginPercent: profitMargin,
      overheadPercent: overheadPct,
    };

    const data: RoofBidData = {
      projectName: bidProjectName || 'Roofing Project',
      clientName: bidClientName || 'Customer',
      propertyAddress: bidAddress,
      date: fmtDate(now), validUntil: fmtDate(valid),
      roofType: ROOF_TYPE_LABELS[roofType] || roofType,
      panelProfile: selectedPanelProfile ? (PANEL_SPECS[selectedPanelProfile]?.name || selectedPanelProfile) : 'TBD',
      gauge: selectedGauge || 26,
      sections: bidComputed.map(s => ({ ...s, pitch: s.pitch || PITCH_LABELS[pitchIdx] })),
      extras: bidExtras.map(e => ({ name: e.name, cost: e.cost })),
      projectTotal: bidProjTotal,
      depositPercent: bidDepositPercent,
      depositAmount: bidDeposit,
      balanceAmount: bidBalance,
      timelineWeeks: Math.ceil(bidTimelineDays / 5),
      workingDays: bidTimelineDays,
      projectOverview: bidOverview + (bidAddress ? ` Property located at ${bidAddress}.` : ''),
      includesTearOff, roofLayers, warrantyYears,
      materialCosts: matCosts,
      sketchFacets: sketchFacets.length > 0 ? sketchFacets : undefined,
      mapImage,
    };
    generateRoofBidPDF(data);
  }, [bidComputed, bidExtras, bidProjectName, bidClientName, bidAddress, roofType, selectedPanelProfile, selectedGauge, pitchIdx, bidProjTotal, bidDepositPercent, bidDeposit, bidBalance, bidTimelineDays, bidOverview, includesTearOff, roofLayers, warrantyYears, panelCost, underlaymentCost, trimCost, fastenerCost, laborCost, profitMargin, overheadPct, mapPolygons]);

  // Render
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] bg-mesh">
      {/* Header */}
      <header className="glass border-b border-steel-700/30 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-steel-400 hover:text-amber-400 transition">\u2190 Back</Link>
            <div className="flex items-center gap-2">
              <HaydenLogo className="w-8 h-8" dark />
              <h1 className="text-steel-100 font-bold text-lg">{mode === 'bid' ? 'Roofing Bid Creator' : 'Metal Roofing Cut Lists'}</h1>
            </div>
          </div>
          {mode === 'bid' && (
            <button onClick={handleDownloadBidPDF} className="text-sm bg-gradient-to-r from-amber-600 to-amber-500 text-white px-5 py-2.5 rounded-xl hover:from-amber-500 hover:to-amber-400 transition font-semibold flex items-center gap-2 glow-amber shadow-lg">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Download Bid PDF
            </button>
          )}
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6">
        {/* Mode Tabs */}
        <div className="flex gap-2 mb-6 animate-fade-in">
          {([['import', '\ud83d\udcc4 Import Report'], ['bid', '\ud83d\udcb0 Bid Creator']] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m as typeof mode)}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${mode === m ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-white glow-amber shadow-lg' : 'glass text-steel-300 hover:text-steel-100 hover:border-steel-600 card-dark-hover'}`}>{label}</button>
          ))}
        </div>

        {/* BID MODE */}
        {mode === 'bid' && (
          <div className="grid lg:grid-cols-12 gap-6 animate-fade-in-up">
            {/* LEFT SIDEBAR */}
            <div className="lg:col-span-4 xl:col-span-3 space-y-4 stagger-children">
              {/* Project Info */}
              <Card title="\ud83d\udccb Project Info">
                <div className="space-y-2.5">
                  <DInput value={bidProjectName} onChange={setBidProjectName} placeholder="Project Name" />
                  <DInput value={bidClientName} onChange={setBidClientName} placeholder="Client Name" />
                  <DInput value={bidAddress} onChange={setBidAddress} placeholder="Property Address" />
                </div>
              </Card>

              {/* Roof Type */}
              <Card title="\ud83c\udfe0 Roof Type">
                <div className="space-y-3">
                  <select title="Roof type" value={roofType} onChange={e => setRoofType(e.target.value)}
                    className="w-full bg-surface-200 border border-steel-700/30 rounded-xl px-3 py-2.5 text-sm text-steel-200 focus:ring-2 focus:ring-amber-500/50">
                    {Object.entries(ROOF_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <div>
                    <label className="block text-xs font-medium text-steel-400 mb-1">Panel Profile</label>
                    <select title="Panel profile" value={selectedPanelProfile} onChange={e => setSelectedPanelProfile(e.target.value as PanelProfile)}
                      className="w-full bg-surface-200 border border-steel-700/30 rounded-xl px-3 py-2.5 text-sm text-steel-200 focus:ring-2 focus:ring-amber-500/50">
                      {Object.values(PANEL_SPECS).map(s => <option key={s.id} value={s.id}>{s.name} ({s.widthInches}" coverage)</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-steel-400 mb-1">Gauge</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[26,24,22].map(g => (
                        <button key={g} onClick={() => setSelectedGauge(g)}
                          className={`py-2 rounded-xl text-xs font-semibold transition-all ${selectedGauge === g ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50 glow-amber' : 'bg-surface-200 text-steel-400 border border-steel-700/30 hover:border-steel-600'}`}>{g} ga</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={includesTearOff} onChange={e => setIncludesTearOff(e.target.checked)} className="rounded accent-amber-500" />
                      <span className="text-xs text-steel-400">Includes Tear-Off</span>
                    </label>
                    {includesTearOff && (
                      <select title="Roof layers" value={roofLayers} onChange={e => setRoofLayers(parseInt(e.target.value))}
                        className="bg-surface-200 border border-steel-700/30 rounded-lg px-2 py-1 text-xs text-steel-300">
                        <option value={1}>1 layer</option><option value={2}>2 layers</option><option value={3}>3 layers</option>
                      </select>
                    )}
                  </div>
                </div>
              </Card>

              {/* Material Costs */}
              <Card title="\ud83e\uddf1 Material Costs (per sq ft)">
                <div className="space-y-4">
                  <DSlider label="Panels" value={panelCost} min={0.5} max={5} step={0.05}
                    display={`$${panelCost.toFixed(2)}`} onChange={setPanelCost} minLabel="$0.50" maxLabel="$5.00" />
                  <DSlider label="Underlayment" value={underlaymentCost} min={0.1} max={1.5} step={0.05}
                    display={`$${underlaymentCost.toFixed(2)}`} onChange={setUnderlaymentCost} minLabel="$0.10" maxLabel="$1.50" />
                  <DSlider label="Trim & Flashing" value={trimCost} min={0.1} max={2} step={0.05}
                    display={`$${trimCost.toFixed(2)}`} onChange={setTrimCost} minLabel="$0.10" maxLabel="$2.00" />
                  <DSlider label="Fasteners" value={fastenerCost} min={0.05} max={0.5} step={0.01}
                    display={`$${fastenerCost.toFixed(2)}`} onChange={setFastenerCost} minLabel="$0.05" maxLabel="$0.50" />

                  <div className="bg-surface-200/50 rounded-xl p-3 border border-steel-700/20">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-steel-400">Total Materials</span>
                      <span className="text-sm font-bold text-amber-400">${materialCostPerSqFt.toFixed(2)}/sqft</span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Labor & Profit */}
              <Card title="\ud83d\udcb0 Labor, Overhead & Profit">
                <div className="space-y-4">
                  <DSlider label="Labor Rate" value={laborCost} min={0.5} max={5} step={0.1}
                    display={`$${laborCost.toFixed(2)}/sqft`} onChange={setLaborCost} minLabel="$0.50" maxLabel="$5.00" />
                  <DSlider label="Overhead %" value={overheadPct} min={0} max={30} step={1}
                    display={`${overheadPct}%`} onChange={setOverheadPct} minLabel="0%" maxLabel="30%" />
                  <DSlider label="Profit Margin %" value={profitMargin} min={0} max={60} step={1}
                    display={`${profitMargin}%`} onChange={setProfitMargin} minLabel="0%" maxLabel="60%" />
                </div>
              </Card>

              {/* Pitch */}
              <Card title="\u2b06 Roof Pitch">
                <div className="grid grid-cols-2 gap-1.5">
                  {PITCH_LABELS.map((l, i) => (
                    <button key={i} onClick={() => setPitchIdx(i)}
                      className={`py-2 px-2 rounded-xl text-[11px] font-medium transition-all text-left ${pitchIdx === i ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50' : 'bg-surface-200 text-steel-400 border border-steel-700/30 hover:border-steel-600'}`}>
                      {l}<span className="block text-[9px] opacity-60">{PITCH_MULTIPLIERS[i]}x rate</span>
                    </button>
                  ))}
                </div>
              </Card>

              {/* Effective Rate Box */}
              <div className="card-dark p-4 glow-amber animate-glow-pulse">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium text-amber-400">Effective Rate (to customer)</span>
                  <span className="text-2xl font-bold gradient-text">${effectiveRate.toFixed(2)}/sqft</span>
                </div>
                <div className="text-[10px] text-steel-500 space-y-0.5">
                  <div className="flex justify-between"><span>Materials</span><span>${materialCostPerSqFt.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Labor</span><span>${laborCost.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>+ Overhead ({overheadPct}%)</span><span>${(costPlusLabor * overheadPct / 100).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>+ Profit ({profitMargin}%)</span><span>${((costPlusLabor * (1 + overheadPct / 100)) * profitMargin / 100).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>x Pitch ({PITCH_MULTIPLIERS[pitchIdx]}x)</span><span></span></div>
                </div>
              </div>

              {/* Remaining controls */}
              <Card title="\u2699 Project Settings">
                <div className="space-y-4">
                  <DSlider label="Deposit %" value={bidDepositPercent} min={25} max={75} step={5}
                    display={`${bidDepositPercent}%`} onChange={setBidDepositPercent} minLabel="25%" maxLabel="75%" />
                  <DSlider label="Timeline (days)" value={bidTimelineDays} min={3} max={45} step={1}
                    display={`${bidTimelineDays} days`} onChange={setBidTimelineDays} minLabel="3" maxLabel="45" />
                  <DSlider label="Warranty (years)" value={warrantyYears} min={1} max={10} step={1}
                    display={`${warrantyYears} yr`} onChange={setWarrantyYears} minLabel="1" maxLabel="10" />
                </div>
              </Card>

              <Card title="\ud83d\udcdd Project Overview">
                <textarea value={bidOverview} onChange={e => setBidOverview(e.target.value)} rows={3}
                  className="w-full bg-surface-200 border border-steel-700/30 rounded-xl px-3 py-2 text-xs text-steel-300 focus:ring-2 focus:ring-amber-500/50" placeholder="Describe the project scope..." />
              </Card>
            </div>

            {/* RIGHT MAIN AREA */}
            <div className="lg:col-span-8 xl:col-span-9 space-y-4">
              {/* View tabs */}
              <div className="flex gap-2 animate-fade-in">
                {([['map', '\ud83d\uddfa Map & Sketch'], ['sections', '\ud83d\udccb Sections & Extras'], ['preview', '\ud83d\udc41 Bid Preview']] as [string, string][]).map(([v, label]) => (
                  <button key={v} onClick={() => setBidView(v as typeof bidView)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${bidView === v ? 'bg-amber-600/20 text-amber-400 border border-amber-500/50' : 'glass text-steel-400 hover:text-steel-200'}`}>{label}</button>
                ))}
              </div>

              {/* MAP VIEW */}
              {bidView === 'map' && (
                <div className="space-y-4 animate-fade-in-up">
                  <div className="card-dark p-4">
                    <h3 className="text-steel-200 font-semibold text-sm mb-3 flex items-center gap-2">
                      <span className="text-amber-400">\ud83d\uddfa</span> Satellite Map - Draw Roof Facets
                    </h3>
                    <p className="text-xs text-steel-500 mb-3">Search for the property address, then use the polygon tool to trace roof sections. Each polygon becomes a bid section with real-world area calculations.</p>
                    <RoofMap onPolygonsChange={setMapPolygons} cutListPanels={cutListPanels} />
                  </div>

                  {mapPolygons.length > 0 && (
                    <div className="card-dark p-4 animate-fade-in">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-steel-200 font-semibold text-sm">Mapped Roof Sections</h3>
                        <span className="text-xs text-amber-400 font-semibold">{mapPolygons.reduce((s, p) => s + p.areaSqFt, 0).toLocaleString()} sq ft total</span>
                      </div>
                      <div className="text-xs text-steel-500">
                        {mapPolygons.length} polygon(s) auto-synced to bid sections. Switch to "Sections & Extras" to adjust.
                      </div>
                      <button
                        onClick={() => {
                          if (cutListPanels.length > 0) { setCutListPanels([]); return; }
                          const panels = generatePanelOverlay(mapPolygons, PANEL_SPECS[selectedPanelProfile]?.widthInches ?? 16);
                          setCutListPanels(panels);
                        }}
                        className="mt-3 w-full bg-blue-600/20 border border-blue-500/30 text-blue-400 text-xs font-medium px-3 py-2 rounded-lg hover:bg-blue-600/30 transition"
                      >
                        {cutListPanels.length > 0 ? '\u2715 Hide Panel Overlay' : '\ud83d\udcca Show Cut List Overlay'}
                      </button>
                    </div>
                  )}

                </div>
              )}

              {/* SECTIONS VIEW */}
              {bidView === 'sections' && (
                <div className="space-y-4 animate-fade-in-up">
                  {/* Roof Sections */}
                  <div className="card-dark overflow-hidden">
                    <div className="px-5 py-3 border-b border-steel-700/30 flex items-center justify-between">
                      <h2 className="text-steel-200 font-semibold text-sm">Roof Sections</h2>
                      <button onClick={addBidSection} className="text-xs bg-amber-600/20 text-amber-400 px-3 py-1.5 rounded-lg font-semibold hover:bg-amber-600/30 transition border border-amber-500/30">+ Add Section</button>
                    </div>
                    <div className="px-5 py-2 bg-surface-200/50 border-b border-steel-700/20">
                      <div className="grid grid-cols-12 gap-3 text-[10px] font-semibold text-steel-500 uppercase tracking-wide">
                        <div className="col-span-4">Name</div>
                        <div className="col-span-2 text-right">Area (sq ft)</div>
                        <div className="col-span-2 text-right">Rate Override</div>
                        <div className="col-span-3 text-right">Total</div>
                        <div className="col-span-1"></div>
                      </div>
                    </div>
                    <div className="divide-y divide-steel-700/20">
                      {bidComputed.map((sec, idx) => (
                        <div key={sec.id} className="px-5 py-3">
                          <div className="grid grid-cols-12 gap-3 items-center">
                            <div className="col-span-4">
                              <input type="text" value={sec.name} onChange={e => updBidSec(sec.id, { name: e.target.value })}
                                className="w-full bg-surface-200 border border-steel-700/30 rounded-lg px-2.5 py-1.5 text-sm text-steel-200 font-medium focus:ring-1 focus:ring-amber-500/50" placeholder="Section name" />
                            </div>
                            <div className="col-span-2">
                              <input title="Area" type="number" value={bidSections[idx]?.areaSqFt || 0} onChange={e => updBidSec(sec.id, { areaSqFt: parseInt(e.target.value) || 0 })}
                                className="w-full bg-surface-200 border border-steel-700/30 rounded-lg px-2.5 py-1.5 text-sm text-steel-300 text-right focus:ring-1 focus:ring-amber-500/50" />
                            </div>
                            <div className="col-span-2">
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-steel-500">$</span>
                                <input title="Rate override" type="number" step={0.25} value={bidSections[idx]?.ratePerSqFt || ''} onChange={e => updBidSec(sec.id, { ratePerSqFt: parseFloat(e.target.value) || 0 })}
                                  className="w-full bg-surface-200 border border-steel-700/30 rounded-lg px-2.5 py-1.5 text-sm text-steel-300 text-right pl-5 focus:ring-1 focus:ring-amber-500/50" placeholder={effectiveRate.toFixed(2)} />
                              </div>
                            </div>
                            <div className="col-span-3 text-right">
                              <span className="text-sm font-bold text-amber-400">${fmt(sec.total)}</span>
                            </div>
                            <div className="col-span-1 text-right">
                              {bidComputed.length > 1 && <button onClick={() => rmBidSec(sec.id)} className="text-steel-500 hover:text-red-400 transition text-lg">\u00d7</button>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Extras */}
                  <div className="card-dark overflow-hidden">
                    <div className="px-5 py-3 border-b border-steel-700/30 flex items-center justify-between">
                      <h2 className="text-steel-200 font-semibold text-sm">Add-Ons & Extras</h2>
                    </div>
                    <div className="px-5 py-3 border-b border-steel-700/20 flex gap-1.5 flex-wrap">
                      {EXTRA_PRESETS.map(ep => (
                        <button key={ep.name} onClick={() => addBidExtra(ep)} className="text-[10px] bg-surface-200 text-steel-400 px-2 py-1 rounded font-medium hover:bg-surface-50 hover:text-steel-200 transition border border-steel-700/20">+ {ep.name}</button>
                      ))}
                    </div>
                    {bidExtras.length === 0 ? (
                      <div className="px-5 py-4 text-xs text-steel-600 text-center">No extras added yet.</div>
                    ) : (
                      <div className="divide-y divide-steel-700/20">
                        {bidExtras.map(ex => (
                          <div key={ex.id} className="px-5 py-2.5 flex items-center gap-3">
                            <input title="Extra name" type="text" value={ex.name} onChange={e => updBidExtra(ex.id, { name: e.target.value })}
                              className="flex-1 bg-surface-200 border border-steel-700/30 rounded-lg px-2.5 py-1.5 text-sm text-steel-300 focus:ring-1 focus:ring-amber-500/50" />
                            <div className="relative w-28">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-steel-500">$</span>
                              <input title="Extra cost" type="number" value={ex.cost} onChange={e => updBidExtra(ex.id, { cost: parseFloat(e.target.value) || 0 })}
                                className="w-full bg-surface-200 border border-steel-700/30 rounded-lg px-2.5 py-1.5 text-sm text-steel-300 text-right pl-5 focus:ring-1 focus:ring-amber-500/50" />
                            </div>
                            <button onClick={() => rmBidExtra(ex.id)} className="text-steel-500 hover:text-red-400 transition text-lg">\u00d7</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* BID PREVIEW */}
              {bidView === 'preview' && (
                <div className="card-dark overflow-hidden animate-fade-in-up">
                  <div className="px-6 py-4 border-b border-steel-700/30 bg-surface-50">
                    <h2 className="text-xl font-bold text-steel-100">{COMPANY.name}</h2>
                    <p className="text-xs text-steel-500 mt-1">{COMPANY.address} \u2022 {COMPANY.phone} \u2022 {COMPANY.email}</p>
                  </div>
                  <div className="p-6 space-y-6">
                    <div className="text-center">
                      <h3 className="text-lg font-bold text-steel-100 uppercase">{ROOF_TYPE_LABELS[roofType]} Roofing Installation Proposal</h3>
                      <p className="text-sm text-steel-400 mt-1">Prepared for: <strong className="text-steel-200">{bidClientName || '___________'}</strong>{bidAddress && <span> \u2022 {bidAddress}</span>}</p>
                    </div>

                    {/* Investment Summary */}
                    <div>
                      <h4 className="text-sm font-bold text-steel-300 mb-2 uppercase tracking-wide">Investment Summary</h4>
                      <table className="w-full text-sm">
                        <thead><tr className="bg-surface-200">
                          <th className="text-left px-3 py-2 font-medium text-steel-300">Section</th>
                          <th className="text-right px-3 py-2 font-medium text-steel-300">Area (sq ft)</th>
                          <th className="text-right px-3 py-2 font-medium text-steel-300">Rate</th>
                          <th className="text-right px-3 py-2 font-medium text-steel-300">Total</th>
                        </tr></thead>
                        <tbody>
                          {bidComputed.map((sec, i) => (
                            <tr key={sec.id} className={i % 2 === 0 ? 'bg-surface-100/50' : ''}>
                              <td className="px-3 py-2 text-steel-300">{sec.name}</td>
                              <td className="px-3 py-2 text-right text-steel-400">{sec.areaSqFt.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right text-steel-500">${sec.ratePerSqFt.toFixed(2)}/sqft</td>
                              <td className="px-3 py-2 text-right font-semibold text-steel-200">${fmt(sec.total)}</td>
                            </tr>
                          ))}
                          {bidExtras.map(ex => (
                            <tr key={ex.id} className="bg-surface-100/30">
                              <td className="px-3 py-2 text-steel-400">{ex.name}</td>
                              <td className="px-3 py-2 text-right text-steel-600">\u2014</td>
                              <td className="px-3 py-2 text-right text-steel-600">\u2014</td>
                              <td className="px-3 py-2 text-right font-semibold text-steel-200">${fmt(ex.cost)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot><tr className="border-t border-steel-600">
                          <td className="px-3 py-2 font-bold text-steel-200">Total: {bidTotalSqFt.toLocaleString()} sq ft</td><td></td>
                          <td className="px-3 py-2 text-right font-bold text-lg text-amber-400" colSpan={2}>${fmt(bidProjTotal)}</td>
                        </tr></tfoot>
                      </table>
                    </div>

                    {/* Payment schedule */}
                    <div className="bg-amber-950/30 rounded-xl p-4 border border-amber-700/30">
                      <h4 className="text-sm font-bold text-amber-400 mb-2 uppercase tracking-wide">Payment Schedule</h4>
                      <div className="space-y-1 text-sm text-steel-300">
                        <div className="flex justify-between"><span>Deposit ({bidDepositPercent}% - due at signing)</span><span className="font-semibold text-steel-200">${fmt(bidDeposit)}</span></div>
                        <div className="flex justify-between"><span>Balance (due at completion)</span><span className="font-semibold text-steel-200">${fmt(bidBalance)}</span></div>
                        <div className="flex justify-between border-t border-amber-700/30 pt-1 mt-1"><span className="font-bold text-amber-400">Project Total</span><span className="font-bold text-lg text-amber-400">${fmt(bidProjTotal)}</span></div>
                      </div>
                    </div>

                    <div className="text-sm text-steel-400">
                      <strong className="text-steel-300">Estimated Timeline:</strong> {bidTimelineDays} to {bidTimelineDays + Math.ceil(bidTimelineDays * 0.25)} working days
                    </div>

                    <button onClick={handleDownloadBidPDF}
                      className="w-full bg-gradient-to-r from-amber-600 to-amber-500 text-white font-bold py-3.5 px-4 rounded-xl hover:from-amber-500 hover:to-amber-400 transition text-sm flex items-center justify-center gap-2 glow-amber shadow-lg">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                      Download Complete Bid PDF (with Terms & Signature Block)
                    </button>
                  </div>
                </div>
              )}

              {/* Live Totals - sticky bottom */}
              <div className="glass glow-amber rounded-xl p-5 shadow-2xl sticky bottom-4 animate-fade-in">
                <div className="grid grid-cols-6 gap-4 text-center">
                  <div><p className="text-[10px] text-steel-500 uppercase tracking-wide">Sections</p><p className="text-lg font-bold text-steel-200">{bidComputed.length}</p></div>
                  <div><p className="text-[10px] text-steel-500 uppercase tracking-wide">Total Area</p><p className="text-lg font-bold text-steel-200">{bidTotalSqFt.toLocaleString()} sqft</p></div>
                  <div><p className="text-[10px] text-steel-500 uppercase tracking-wide">Eff. Rate</p><p className="text-lg font-bold text-steel-200">${effectiveRate.toFixed(2)}/sqft</p></div>
                  <div><p className="text-[10px] text-steel-500 uppercase tracking-wide">Cost</p><p className="text-lg font-bold text-steel-300">${fmt(totalCost)}</p></div>
                  <div><p className="text-[10px] text-steel-500 uppercase tracking-wide">Gross Margin</p><p className={`text-lg font-bold ${grossMarginPct >= 20 ? 'text-green-400' : grossMarginPct >= 10 ? 'text-amber-400' : 'text-red-400'}`}>{grossMarginPct.toFixed(1)}%</p></div>
                  <div><p className="text-[10px] text-amber-400 uppercase tracking-wide font-semibold">Project Total</p><p className="text-2xl font-bold gradient-text">${fmt(bidProjTotal)}</p></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CUT LIST MODES (manual/import) */}
        {mode !== 'bid' && (
          <div className="grid lg:grid-cols-3 gap-8 animate-fade-in-up">
            <div className="space-y-6">
              <Card title="\ud83d\udcc1 Project Details">
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-steel-400 mb-1">Project Name</label>
                    <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)}
                      className="w-full bg-surface-200 border border-steel-700/30 rounded-xl px-3 py-2 text-sm text-steel-200 focus:ring-2 focus:ring-amber-500/50" placeholder="e.g. Smith Residence" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-steel-400 mb-1">Address</label>
                    <input type="text" value={projectAddress} onChange={e => setProjectAddress(e.target.value)}
                      className="w-full bg-surface-200 border border-steel-700/30 rounded-xl px-3 py-2 text-sm text-steel-200 focus:ring-2 focus:ring-amber-500/50" placeholder="e.g. 123 Main St, Buda TX" />
                  </div>
                </div>
              </Card>

              {mode === 'import' && (
                <Card title="\ud83d\udcc4 Import Roof Report">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-steel-400 mb-1">Report Source</label>
                      <select title="Report source" value={reportSource} onChange={e => setReportSource(e.target.value as ReportSource)}
                        className="w-full bg-surface-200 border border-steel-700/30 rounded-xl px-3 py-2 text-sm text-steel-200 focus:ring-2 focus:ring-amber-500/50">
                        <option value="roofr">Roofr</option>
                        <option value="eagleview">EagleView</option>
                        <option value="gaf_quickmeasure">GAF QuickMeasure</option>
                        <option value="roofgraf">RoofGraf</option>
                        <option value="manual">Manual Entry</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-steel-400 mb-1">Upload Report (PDF/XML/TXT)</label>
                      <input title="Upload report" type="file" accept=".txt,.csv,.pdf,.json,.xml" onChange={handleFileUpload} disabled={uploading}
                        className="w-full text-sm text-steel-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-amber-600/20 file:text-amber-400 hover:file:bg-amber-600/30 disabled:opacity-50" />
                      {uploading && <p className="text-xs text-amber-400 mt-1 animate-pulse">Extracting text from PDF...</p>}
                      {uploadError && <p className="text-xs text-red-400 mt-1">{uploadError}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-steel-400 mb-1">Or paste report text</label>
                      <textarea value={reportText} onChange={e => setReportText(e.target.value)} rows={6}
                        className="w-full bg-surface-200 border border-steel-700/30 rounded-xl px-3 py-2 text-sm font-mono text-steel-300 focus:ring-2 focus:ring-amber-500/50" placeholder="Paste your report data here..." />
                    </div>
                    <button onClick={handleImportReport} disabled={!reportText.trim()}
                      className="w-full bg-amber-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition">
                      Import & Parse Report
                    </button>
                  </div>
                </Card>
              )}

              <Card title="\ud83d\udee0 Panel Selection">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-steel-400 mb-2">Panel Profile</label>
                    <div className="space-y-2">
                      {Object.values(PANEL_SPECS).map(spec => (
                        <label key={spec.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${selectedPanelProfile === spec.id ? 'border-amber-500/50 bg-amber-500/10' : 'border-steel-700/30 hover:border-steel-600'}`}>
                          <input type="radio" name="panel" value={spec.id} checked={selectedPanelProfile === spec.id}
                            onChange={e => setSelectedPanelProfile(e.target.value as PanelProfile)} className="accent-amber-500" />
                          <div>
                            <p className="text-sm font-medium text-steel-200">{spec.name}</p>
                            <p className="text-xs text-steel-500">{spec.widthInches}" coverage \u2022 up to {spec.maxLengthFeet}ft</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-steel-400 mb-1">Gauge</label>
                    <select title="Gauge" value={selectedGauge} onChange={e => setSelectedGauge(parseInt(e.target.value, 10))}
                      className="w-full bg-surface-200 border border-steel-700/30 rounded-xl px-3 py-2 text-sm text-steel-200 focus:ring-2 focus:ring-amber-500/50">
                      <option value={26}>26 Gauge</option><option value={24}>24 Gauge</option><option value={22}>22 Gauge</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <button onClick={handleGenerateCutList} disabled={!activeModel && manualFacets.length === 0}
                      className="w-full bg-blue-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition">Generate Cut List</button>
                    {activeCutList && (
                      <button onClick={handleDownloadCutListPDF}
                        className="w-full bg-green-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-green-500 transition flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                        Download Cut List PDF
                      </button>
                    )}
                  </div>
                </div>
              </Card>

              {roofModels.length > 0 && (
                <Card title="\ud83d\udcbe Saved Models">
                  <div className="space-y-2">
                    {roofModels.map(model => (
                      <button key={model.id} onClick={() => {
                        setActiveModel(model); setManualFacets(model.facets);
                        setProjectName(model.projectName); setProjectAddress(model.address);
                        const cl = cutLists.find(c => c.roofModelId === model.id);
                        setActiveCutList(cl || null);
                      }}
                        className={`w-full text-left p-3 rounded-xl border text-sm transition ${activeModel?.id === model.id ? 'border-amber-500/50 bg-amber-500/10' : 'border-steel-700/30 hover:border-steel-600'}`}>
                        <p className="font-medium text-steel-200">{model.projectName}</p>
                        <p className="text-steel-500 text-xs">{model.totalAreaSqFt.toLocaleString()} sq ft \u2022 {new Date(model.createdAt).toLocaleDateString()}</p>
                      </button>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            <div className="lg:col-span-2 space-y-6">
              {/* XML / Roof Viewer – shown whenever a model is loaded */}
              {activeModel && activeModel.facets.length > 0 && (
                <RoofXmlViewer
                  model={activeModel}
                  cutList={activeCutList}
                  xmlSource={reportText.trim().startsWith('<') ? reportText : undefined}
                />
              )}

              {activeCutList && (
                <>
                  <div className="card-dark overflow-hidden">
                    <div className="px-6 py-4 border-b border-steel-700/30 flex items-center justify-between">
                      <h2 className="text-steel-200 font-semibold">Panel Cut List - {PANEL_SPECS[activeCutList.panelProfile].name}</h2>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-steel-400">{activeCutList.panels.length} panels \u2022 {Math.round(activeCutList.totalPanelSqFt).toLocaleString()} sq ft</span>
                        <button onClick={handleDownloadCutListPDF} className="text-sm bg-green-500/20 text-green-400 px-3 py-1 rounded-lg font-medium hover:bg-green-500/30 transition">PDF</button>
                      </div>
                    </div>
                    <CutListTable cutList={activeCutList} />
                  </div>
                  <div className="card-dark overflow-hidden">
                    <div className="px-6 py-4 border-b border-steel-700/30">
                      <h2 className="text-steel-200 font-semibold">Trim & Accessories</h2>
                    </div>
                    <TrimTable cutList={activeCutList} />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Reusable Sub-Components (dark theme)

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-dark p-5 animate-scale-in">
      <h2 className="text-steel-200 font-semibold text-base mb-3">{title}</h2>
      {children}
    </div>
  );
}

function DInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <input type="text" value={value} onChange={e => onChange(e.target.value)}
    className="w-full bg-surface-200 border border-steel-700/30 rounded-xl px-3 py-2.5 text-sm text-steel-200 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 placeholder-steel-600" placeholder={placeholder} />;
}

function DSlider({ label, value, min, max, step, display, onChange, minLabel, maxLabel }: {
  label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void; minLabel: string; maxLabel: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs font-medium text-steel-400">{label}</label>
        <span className="text-sm font-bold text-amber-400">{display}</span>
      </div>
      <input title={label} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-surface-200 rounded-full appearance-none cursor-pointer" />
      <div className="flex justify-between text-[10px] text-steel-600 mt-0.5"><span>{minLabel}</span><span>{maxLabel}</span></div>
    </div>
  );
}
