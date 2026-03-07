'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { parseRoofReport, detectReportSource } from '@/lib/roofing/report-parser';
import { generateCutList } from '@/lib/roofing/cut-list-engine';
import { generateCutListPDF } from '@/lib/roofing/pdf-export';
import { PANEL_SPECS } from '@/lib/roofing/panel-specs';
import { generateRoofBidPDF, RoofBidSection, RoofBidData } from '@/lib/roofing/roofing-bid-pdf';
import { RoofModel, RoofFacet, PanelProfile, ReportSource, CutList } from '@/types';
import RoofSketchBuilder from '@/components/roofing/RoofSketchBuilder';
import CutListTable from '@/components/roofing/CutListTable';
import TrimTable from '@/components/roofing/TrimTable';
import HaydenLogo from '@/components/HaydenLogo';

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
  const [selectedFacetId, setSelectedFacetId] = useState<string | null>(null);
  const [mode, setMode] = useState<'manual' | 'import' | 'bid'>('manual');

  // Bid creator state
  const [bidClientName, setBidClientName] = useState('');
  const [bidAddress, setBidAddress] = useState('');
  const [bidProjectName, setBidProjectName] = useState('');
  const [roofType, setRoofType] = useState('standing_seam');
  const [baseRateSqFt, setBaseRateSqFt] = useState(4.5);
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
  const [bidPreview, setBidPreview] = useState(false);

  // ── Cut List Handlers ──
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
      id: `rm_${Date.now()}`, projectName: projectName || 'Manual Sketch',
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
      setReportText(text);
      const detected = detectReportSource(text);
      if (detected !== 'manual') setReportSource(detected);
    }
  }, []);

  // ── Bid Computed Values ──
  const bidEffRate = useMemo(() => Math.round(baseRateSqFt * PITCH_MULTIPLIERS[pitchIdx] * 100) / 100, [baseRateSqFt, pitchIdx]);

  const bidComputed = useMemo(() =>
    bidSections.map(sec => {
      const rate = sec.ratePerSqFt > 0 ? sec.ratePerSqFt : bidEffRate;
      return { ...sec, ratePerSqFt: rate, total: Math.round(sec.areaSqFt * rate * 100) / 100 };
    }), [bidSections, bidEffRate]);

  const bidSecTotal = useMemo(() => bidComputed.reduce((s, c) => s + c.total, 0), [bidComputed]);
  const bidExtraTotal = useMemo(() => bidExtras.reduce((s, e) => s + e.cost, 0), [bidExtras]);
  const bidProjTotal = bidSecTotal + bidExtraTotal;
  const bidDeposit = Math.round(bidProjTotal * bidDepositPercent / 100 * 100) / 100;
  const bidBalance = Math.round((bidProjTotal - bidDeposit) * 100) / 100;
  const bidTotalSqFt = useMemo(() => bidComputed.reduce((s, c) => s + c.areaSqFt, 0), [bidComputed]);

  // ── Bid Handlers ──
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
    const data: RoofBidData = {
      projectName: bidProjectName || 'Roofing Project',
      clientName: bidClientName || 'Customer',
      propertyAddress: bidAddress,
      date: fmtDate(now), validUntil: fmtDate(valid),
      roofType: ROOF_TYPE_LABELS[roofType] || roofType,
      panelProfile: selectedPanelProfile ? (PANEL_SPECS[selectedPanelProfile]?.name || selectedPanelProfile) : 'TBD',
      gauge: selectedGauge || 26,
      sections: bidComputed.map(s => ({ ...s, pitch: PITCH_LABELS[pitchIdx] })),
      extras: bidExtras.map(e => ({ name: e.name, cost: e.cost })),
      projectTotal: bidProjTotal,
      depositPercent: bidDepositPercent,
      depositAmount: bidDeposit,
      balanceAmount: bidBalance,
      timelineWeeks: Math.ceil(bidTimelineDays / 5),
      workingDays: bidTimelineDays,
      projectOverview: bidOverview + (bidAddress ? ` Property located at ${bidAddress}.` : ''),
      includesTearOff, roofLayers, warrantyYears,
    };
    generateRoofBidPDF(data);
  }, [bidComputed, bidExtras, bidProjectName, bidClientName, bidAddress, roofType, selectedPanelProfile, selectedGauge, pitchIdx, bidProjTotal, bidDepositPercent, bidDeposit, bidBalance, bidTimelineDays, bidOverview, includesTearOff, roofLayers, warrantyYears]);

  // ── Render ──
  return (
    <div className="min-h-screen bg-steel-50">
      <header className="bg-white border-b border-steel-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-steel-400 hover:text-steel-600 transition">&#8592; Back</Link>
            <div className="flex items-center gap-2">
              <HaydenLogo className="w-8 h-8" />
              <h1 className="text-steel-800 font-bold text-lg">{mode === 'bid' ? 'Roofing Bid Creator' : 'Metal Roofing Cut Lists'}</h1>
            </div>
          </div>
          {mode === 'bid' && (
            <button onClick={handleDownloadBidPDF} className="text-sm bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition font-semibold flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Download Bid PDF
            </button>
          )}
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Mode Tabs */}
        <div className="flex gap-2 mb-6">
          {([['manual', 'Build Manually'], ['import', 'Import Report'], ['bid', 'Bid Creator']] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m as typeof mode)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${mode === m ? 'bg-blue-600 text-white' : 'bg-white text-steel-600 border border-steel-200 hover:bg-steel-50'}`}>{label}</button>
          ))}
        </div>

        {/* ── BID MODE ── */}
        {mode === 'bid' && (
          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 xl:col-span-3 space-y-5">
              <Card title="Project Info">
                <div className="space-y-2.5">
                  <SInput value={bidProjectName} onChange={setBidProjectName} placeholder="Project Name" />
                  <SInput value={bidClientName} onChange={setBidClientName} placeholder="Client Name" />
                  <SInput value={bidAddress} onChange={setBidAddress} placeholder="Property Address" />
                </div>
              </Card>

              <Card title="Roof Type">
                <div className="space-y-3">
                  <select title="Roof type" value={roofType} onChange={e => setRoofType(e.target.value)}
                    className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500">
                    {Object.entries(ROOF_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <div>
                    <label className="block text-xs font-medium text-steel-500 mb-1">Panel Profile</label>
                    <select title="Panel profile" value={selectedPanelProfile} onChange={e => setSelectedPanelProfile(e.target.value as PanelProfile)}
                      className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500">
                      {Object.values(PANEL_SPECS).map(s => <option key={s.id} value={s.id}>{s.name} ({s.widthInches}" coverage)</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-steel-500 mb-1">Gauge</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[26,24,22].map(g => (
                        <button key={g} onClick={() => setSelectedGauge(g)}
                          className={`py-1.5 rounded-lg text-xs font-semibold transition ${selectedGauge === g ? 'bg-amber-500 text-white' : 'bg-steel-100 text-steel-600 hover:bg-steel-200'}`}>{g} ga</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={includesTearOff} onChange={e => setIncludesTearOff(e.target.checked)} className="rounded" />
                      <span className="text-xs text-steel-600">Includes Tear-Off</span>
                    </label>
                    {includesTearOff && (
                      <select title="Roof layers" value={roofLayers} onChange={e => setRoofLayers(parseInt(e.target.value))}
                        className="border border-steel-300 rounded px-2 py-1 text-xs">
                        <option value={1}>1 layer</option>
                        <option value={2}>2 layers</option>
                        <option value={3}>3 layers</option>
                      </select>
                    )}
                  </div>
                </div>
              </Card>

              <Card title="Pricing Controls">
                <div className="space-y-5">
                  <SSlider label="Base Rate per Sq Ft" value={baseRateSqFt} min={2} max={15} step={0.25}
                    display={`$${baseRateSqFt.toFixed(2)}/sqft`} onChange={setBaseRateSqFt} minLabel="$2" maxLabel="$15" />

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-medium text-steel-500">Roof Pitch</label>
                      <span className="text-xs font-semibold text-steel-700">{PITCH_MULTIPLIERS[pitchIdx]}x</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {PITCH_LABELS.map((l, i) => (
                        <button key={i} onClick={() => setPitchIdx(i)}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition text-left ${pitchIdx === i ? 'bg-amber-100 text-amber-800 border-2 border-amber-400' : 'bg-steel-50 text-steel-600 border border-steel-200 hover:bg-steel-100'}`}>
                          {l}<span className="block text-[9px] opacity-70">{PITCH_MULTIPLIERS[i]}x rate</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-amber-700">Effective Rate</span>
                      <span className="text-lg font-bold text-amber-700">${bidEffRate.toFixed(2)}/sqft</span>
                    </div>
                    <p className="text-[10px] text-amber-600 mt-1">${baseRateSqFt.toFixed(2)} base x {PITCH_MULTIPLIERS[pitchIdx]}x pitch</p>
                  </div>

                  <SSlider label="Deposit %" value={bidDepositPercent} min={25} max={75} step={5}
                    display={`${bidDepositPercent}%`} onChange={setBidDepositPercent} minLabel="25%" maxLabel="75%" />

                  <SSlider label="Timeline (working days)" value={bidTimelineDays} min={3} max={45} step={1}
                    display={`${bidTimelineDays} days`} onChange={setBidTimelineDays} minLabel="3" maxLabel="45" />

                  <SSlider label="Warranty (years)" value={warrantyYears} min={1} max={10} step={1}
                    display={`${warrantyYears} yr`} onChange={setWarrantyYears} minLabel="1" maxLabel="10" />
                </div>
              </Card>

              <Card title="Project Overview Text">
                <textarea value={bidOverview} onChange={e => setBidOverview(e.target.value)} rows={3}
                  className="w-full border border-steel-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500" placeholder="Describe the project scope..." />
              </Card>
            </div>

            <div className="lg:col-span-8 xl:col-span-9 space-y-5">
              <div className="flex gap-2">
                <button onClick={() => setBidPreview(false)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${!bidPreview ? 'bg-amber-600 text-white' : 'bg-white text-steel-600 border border-steel-200 hover:bg-steel-50'}`}>Sections &amp; Extras</button>
                <button onClick={() => setBidPreview(true)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${bidPreview ? 'bg-amber-600 text-white' : 'bg-white text-steel-600 border border-steel-200 hover:bg-steel-50'}`}>Bid Preview</button>
              </div>

              {!bidPreview && (
                <>
                  {/* Roof Sections */}
                  <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-steel-200 flex items-center justify-between">
                      <h2 className="text-steel-800 font-semibold text-sm">Roof Sections</h2>
                      <button onClick={addBidSection} className="text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg font-semibold hover:bg-amber-100 transition">+ Add Section</button>
                    </div>
                    <div className="px-5 py-2 bg-steel-50 border-b border-steel-100">
                      <div className="grid grid-cols-12 gap-3 text-[10px] font-semibold text-steel-500 uppercase tracking-wide">
                        <div className="col-span-4">Name</div>
                        <div className="col-span-2 text-right">Area (sq ft)</div>
                        <div className="col-span-2 text-right">Rate Override</div>
                        <div className="col-span-3 text-right">Total</div>
                        <div className="col-span-1"></div>
                      </div>
                    </div>
                    <div className="divide-y divide-steel-100">
                      {bidComputed.map((sec, idx) => (
                        <div key={sec.id} className="px-5 py-3">
                          <div className="grid grid-cols-12 gap-3 items-center">
                            <div className="col-span-4">
                              <input type="text" value={sec.name} onChange={e => updBidSec(sec.id, { name: e.target.value })}
                                className="w-full border border-steel-200 rounded px-2.5 py-1.5 text-sm font-medium focus:ring-1 focus:ring-amber-500" placeholder="Section name" />
                            </div>
                            <div className="col-span-2">
                              <input title="Area" type="number" value={bidSections[idx]?.areaSqFt || 0} onChange={e => updBidSec(sec.id, { areaSqFt: parseInt(e.target.value) || 0 })}
                                className="w-full border border-steel-200 rounded px-2.5 py-1.5 text-sm text-right focus:ring-1 focus:ring-amber-500" />
                            </div>
                            <div className="col-span-2">
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-steel-400">$</span>
                                <input title="Rate override" type="number" step={0.25} value={bidSections[idx]?.ratePerSqFt || ''} onChange={e => updBidSec(sec.id, { ratePerSqFt: parseFloat(e.target.value) || 0 })}
                                  className="w-full border border-steel-200 rounded px-2.5 py-1.5 text-sm text-right pl-5 focus:ring-1 focus:ring-amber-500" placeholder={bidEffRate.toFixed(2)} />
                              </div>
                            </div>
                            <div className="col-span-3 text-right">
                              <span className="text-sm font-bold text-steel-800">${fmt(sec.total)}</span>
                            </div>
                            <div className="col-span-1 text-right">
                              {bidComputed.length > 1 && <button onClick={() => rmBidSec(sec.id)} className="text-steel-400 hover:text-red-500 transition text-lg">&#215;</button>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Extras */}
                  <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-steel-200 flex items-center justify-between">
                      <h2 className="text-steel-800 font-semibold text-sm">Add-Ons &amp; Extras</h2>
                    </div>
                    <div className="px-5 py-3 border-b border-steel-100 flex gap-1.5 flex-wrap">
                      {EXTRA_PRESETS.map(ep => (
                        <button key={ep.name} onClick={() => addBidExtra(ep)} className="text-[10px] bg-steel-50 text-steel-600 px-2 py-1 rounded font-medium hover:bg-steel-100 transition">+ {ep.name}</button>
                      ))}
                    </div>
                    {bidExtras.length === 0 ? (
                      <div className="px-5 py-4 text-xs text-steel-400 text-center">No extras added.</div>
                    ) : (
                      <div className="divide-y divide-steel-100">
                        {bidExtras.map(ex => (
                          <div key={ex.id} className="px-5 py-2.5 flex items-center gap-3">
                            <input title="Extra name" type="text" value={ex.name} onChange={e => updBidExtra(ex.id, { name: e.target.value })}
                              className="flex-1 border border-steel-200 rounded px-2.5 py-1.5 text-sm focus:ring-1 focus:ring-amber-500" />
                            <div className="relative w-28">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-steel-400">$</span>
                              <input title="Extra cost" type="number" value={ex.cost} onChange={e => updBidExtra(ex.id, { cost: parseFloat(e.target.value) || 0 })}
                                className="w-full border border-steel-200 rounded px-2.5 py-1.5 text-sm text-right pl-5 focus:ring-1 focus:ring-amber-500" />
                            </div>
                            <button onClick={() => rmBidExtra(ex.id)} className="text-steel-400 hover:text-red-500 transition text-lg">&#215;</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Bid Preview */}
              {bidPreview && (
                <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-steel-200 bg-steel-800 text-white">
                    <h2 className="text-xl font-bold">HAYDEN RANCH SERVICES</h2>
                    <p className="text-xs text-steel-300 mt-1">5900 Balcones Dr #26922, Austin, TX 78731 &#8226; (830) 777-9111 &#8226; office@haydenclaim.com</p>
                  </div>
                  <div className="p-6 space-y-6">
                    <div className="text-center">
                      <h3 className="text-lg font-bold text-steel-800 uppercase">{ROOF_TYPE_LABELS[roofType]} Roofing Installation Proposal</h3>
                      <p className="text-sm text-steel-500 mt-1">Prepared for: <strong>{bidClientName || '___________'}</strong>{bidAddress && <span> &#8226; {bidAddress}</span>}</p>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-steel-700 mb-2 uppercase tracking-wide">Investment Summary</h4>
                      <table className="w-full text-sm">
                        <thead><tr className="bg-steel-800 text-white">
                          <th className="text-left px-3 py-2 font-medium">Section</th>
                          <th className="text-right px-3 py-2 font-medium">Area (sq ft)</th>
                          <th className="text-right px-3 py-2 font-medium">Rate</th>
                          <th className="text-right px-3 py-2 font-medium">Total</th>
                        </tr></thead>
                        <tbody>
                          {bidComputed.map((sec, i) => (
                            <tr key={sec.id} className={i % 2 === 0 ? 'bg-steel-50' : ''}>
                              <td className="px-3 py-2">{sec.name}</td>
                              <td className="px-3 py-2 text-right">{sec.areaSqFt.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right text-steel-500">${sec.ratePerSqFt.toFixed(2)}/sqft</td>
                              <td className="px-3 py-2 text-right font-semibold">${fmt(sec.total)}</td>
                            </tr>
                          ))}
                          {bidExtras.map(ex => (
                            <tr key={ex.id} className="bg-steel-50">
                              <td className="px-3 py-2">{ex.name}</td>
                              <td className="px-3 py-2 text-right text-steel-400">&#8212;</td>
                              <td className="px-3 py-2 text-right text-steel-400">&#8212;</td>
                              <td className="px-3 py-2 text-right font-semibold">${fmt(ex.cost)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot><tr className="border-t-2 border-steel-300">
                          <td className="px-3 py-2 font-bold">Total: {bidTotalSqFt.toLocaleString()} sq ft</td><td></td>
                          <td className="px-3 py-2 text-right font-bold text-lg" colSpan={2}>${fmt(bidProjTotal)}</td>
                        </tr></tfoot>
                      </table>
                    </div>

                    <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                      <h4 className="text-sm font-bold text-amber-800 mb-2 uppercase tracking-wide">Payment Schedule</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><span>Deposit ({bidDepositPercent}% - due at signing)</span><span className="font-semibold">${fmt(bidDeposit)}</span></div>
                        <div className="flex justify-between"><span>Balance (due at completion)</span><span className="font-semibold">${fmt(bidBalance)}</span></div>
                        <div className="flex justify-between border-t border-amber-300 pt-1 mt-1"><span className="font-bold">Project Total</span><span className="font-bold text-lg">${fmt(bidProjTotal)}</span></div>
                      </div>
                    </div>

                    <div className="text-sm text-steel-600">
                      <strong>Estimated Timeline:</strong> {bidTimelineDays} to {bidTimelineDays + Math.ceil(bidTimelineDays * 0.25)} working days
                    </div>

                    <button onClick={handleDownloadBidPDF}
                      className="w-full bg-amber-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-amber-700 transition text-sm flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                      Download Complete Bid PDF (with Terms &amp; Signature Block)
                    </button>
                  </div>
                </div>
              )}

              {/* Live Totals */}
              <div className="bg-steel-800 rounded-xl p-5 text-white shadow-lg sticky bottom-4">
                <div className="grid grid-cols-5 gap-4 text-center">
                  <div><p className="text-[10px] text-steel-400 uppercase tracking-wide">Sections</p><p className="text-lg font-bold">{bidComputed.length}</p></div>
                  <div><p className="text-[10px] text-steel-400 uppercase tracking-wide">Total Area</p><p className="text-lg font-bold">{bidTotalSqFt.toLocaleString()} sqft</p></div>
                  <div><p className="text-[10px] text-steel-400 uppercase tracking-wide">Eff. Rate</p><p className="text-lg font-bold">${bidEffRate.toFixed(2)}/sqft</p></div>
                  <div><p className="text-[10px] text-steel-400 uppercase tracking-wide">Extras</p><p className="text-lg font-bold">{bidExtras.length} (${fmt(bidExtraTotal)})</p></div>
                  <div><p className="text-[10px] text-amber-400 uppercase tracking-wide font-semibold">Project Total</p><p className="text-2xl font-bold text-amber-400">${fmt(bidProjTotal)}</p></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── CUT LIST MODES (manual/import) ── */}
        {mode !== 'bid' && (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-steel-200 p-6 shadow-sm">
                <h2 className="text-steel-800 font-semibold text-lg mb-4">Project Details</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-steel-600 mb-1">Project Name</label>
                    <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)}
                      className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="e.g. Smith Residence" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-steel-600 mb-1">Address</label>
                    <input type="text" value={projectAddress} onChange={e => setProjectAddress(e.target.value)}
                      className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="e.g. 123 Main St, Buda TX" />
                  </div>
                </div>
              </div>

              {mode === 'import' && (
                <div className="bg-white rounded-xl border border-steel-200 p-6 shadow-sm">
                  <h2 className="text-steel-800 font-semibold text-lg mb-4">Import Roof Report</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-steel-600 mb-1">Report Source</label>
                      <select title="Report source" value={reportSource} onChange={e => setReportSource(e.target.value as ReportSource)}
                        className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                        <option value="roofr">Roofr</option>
                        <option value="eagleview">EagleView</option>
                        <option value="gaf_quickmeasure">GAF QuickMeasure</option>
                        <option value="roofgraf">RoofGraf</option>
                        <option value="manual">Manual Entry</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-steel-600 mb-1">Upload Report (PDF/TXT)</label>
                      <input title="Upload report" type="file" accept=".txt,.csv,.pdf,.json,.xml" onChange={handleFileUpload} disabled={uploading}
                        className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50" />
                      {uploading && <p className="text-xs text-blue-600 mt-1 animate-pulse">Extracting text from PDF...</p>}
                      {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-steel-600 mb-1">Or paste report text</label>
                      <textarea value={reportText} onChange={e => setReportText(e.target.value)} rows={6}
                        className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500" placeholder="Paste your report data here..." />
                    </div>
                    <button onClick={handleImportReport} disabled={!reportText.trim()}
                      className="w-full bg-blue-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                      Import &amp; Parse Report
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl border border-steel-200 p-6 shadow-sm">
                <h2 className="text-steel-800 font-semibold text-lg mb-4">Panel Selection</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-steel-600 mb-2">Panel Profile</label>
                    <div className="space-y-2">
                      {Object.values(PANEL_SPECS).map(spec => (
                        <label key={spec.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${selectedPanelProfile === spec.id ? 'border-blue-500 bg-blue-50' : 'border-steel-200 hover:border-steel-300'}`}>
                          <input type="radio" name="panel" value={spec.id} checked={selectedPanelProfile === spec.id}
                            onChange={e => setSelectedPanelProfile(e.target.value as PanelProfile)} className="text-blue-600" />
                          <div>
                            <p className="text-sm font-medium text-steel-700">{spec.name}</p>
                            <p className="text-xs text-steel-500">{spec.widthInches}" coverage &#8226; up to {spec.maxLengthFeet}ft</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-steel-600 mb-1">Gauge</label>
                    <select title="Gauge" value={selectedGauge} onChange={e => setSelectedGauge(parseInt(e.target.value, 10))}
                      className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                      <option value={26}>26 Gauge</option>
                      <option value={24}>24 Gauge</option>
                      <option value={22}>22 Gauge</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    {mode === 'manual' && !activeModel && (
                      <button onClick={handleBuildFromSketch} disabled={manualFacets.length === 0}
                        className="w-full bg-blue-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition">Save Roof Model</button>
                    )}
                    <button onClick={handleGenerateCutList} disabled={!activeModel && manualFacets.length === 0}
                      className="w-full bg-brand-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition">Generate Cut List</button>
                    {activeCutList && (
                      <button onClick={handleDownloadCutListPDF}
                        className="w-full bg-green-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                        Download Cut List PDF
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {roofModels.length > 0 && (
                <div className="bg-white rounded-xl border border-steel-200 p-6 shadow-sm">
                  <h2 className="text-steel-800 font-semibold text-lg mb-4">Saved Models</h2>
                  <div className="space-y-2">
                    {roofModels.map(model => (
                      <button key={model.id} onClick={() => {
                        setActiveModel(model); setManualFacets(model.facets);
                        setProjectName(model.projectName); setProjectAddress(model.address);
                        const cl = cutLists.find(c => c.roofModelId === model.id);
                        setActiveCutList(cl || null);
                      }}
                        className={`w-full text-left p-3 rounded-lg border text-sm transition ${activeModel?.id === model.id ? 'border-blue-500 bg-blue-50' : 'border-steel-200 hover:border-steel-300'}`}>
                        <p className="font-medium text-steel-700">{model.projectName}</p>
                        <p className="text-steel-500 text-xs">{model.totalAreaSqFt.toLocaleString()} sq ft &#8226; {new Date(model.createdAt).toLocaleDateString()}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-steel-200 flex items-center justify-between">
                  <h2 className="text-steel-800 font-semibold">Roof Sketch Builder</h2>
                  {manualFacets.length > 0 && (
                    <span className="text-sm text-steel-500">
                      {manualFacets.length} facet(s) &#8226; {manualFacets.reduce((s, f) => s + f.areaSquareFeet, 0).toLocaleString()} sq ft
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <RoofSketchBuilder facets={manualFacets} onFacetsChange={setManualFacets} selectedFacetId={selectedFacetId} onSelectFacet={setSelectedFacetId} />
                </div>
              </div>

              {activeCutList && (
                <>
                  <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-steel-200 flex items-center justify-between">
                      <h2 className="text-steel-800 font-semibold">Panel Cut List - {PANEL_SPECS[activeCutList.panelProfile].name}</h2>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-steel-500">{activeCutList.panels.length} panels &#8226; {Math.round(activeCutList.totalPanelSqFt).toLocaleString()} sq ft</span>
                        <button onClick={handleDownloadCutListPDF} className="text-sm bg-green-50 text-green-700 px-3 py-1 rounded-lg font-medium hover:bg-green-100 transition">PDF</button>
                      </div>
                    </div>
                    <CutListTable cutList={activeCutList} />
                  </div>
                  <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-steel-200">
                      <h2 className="text-steel-800 font-semibold">Trim &amp; Accessories</h2>
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

// ── Reusable Sub-Components ──

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-steel-200 p-5 shadow-sm">
      <h2 className="text-steel-800 font-semibold text-base mb-3">{title}</h2>
      {children}
    </div>
  );
}

function SInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <input type="text" value={value} onChange={e => onChange(e.target.value)}
    className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" placeholder={placeholder} />;
}

function SSlider({ label, value, min, max, step, display, onChange, minLabel, maxLabel }: {
  label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void; minLabel: string; maxLabel: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs font-medium text-steel-500">{label}</label>
        <span className="text-sm font-bold text-amber-600">{display}</span>
      </div>
      <input title={label} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-steel-200 rounded-full appearance-none cursor-pointer accent-amber-500" />
      <div className="flex justify-between text-[10px] text-steel-400 mt-0.5"><span>{minLabel}</span><span>{maxLabel}</span></div>
    </div>
  );
}