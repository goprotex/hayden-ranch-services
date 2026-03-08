'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { STAY_TUFF_OPTIONS } from '@/lib/fencing/fence-calculator';
import {
  POST_MATERIALS, BRACE_SPECS, GATE_SPECS, DEFAULT_MATERIAL_PRICES,
  determineBraceType, estimatePainting, calculateVertexAngle,
  type PostMaterial, type BraceType, type GateSize, type GateSpec, type BraceRecommendation,
} from '@/lib/fencing/fence-materials';
import { generateFenceBidPDF, calculateSectionMaterials, type FenceBidSection, type BidGate, type FenceBidData } from '@/lib/fencing/fence-bid-pdf';
import type { DrawnLine, VertexAngle, TerrainSuggestion } from '@/components/fencing/FenceMap';
import type { FenceType, FenceHeight, StayTuffOption } from '@/types';

const FenceMap = dynamic(() => import('@/components/fencing/FenceMap'), {
  ssr: false,
  loading: () => <div className="bg-surface-50 flex items-center justify-center h-[500px] animate-pulse rounded-xl"><p className="text-steel-500 text-sm">Loading satellite map...</p></div>,
});

const FENCE_TYPES: Record<string, string> = {
  stay_tuff_fixed_knot: 'High Tensile Stay-Tuff Fixed Knot',
  stay_tuff_hinge_joint: 'High Tensile Stay-Tuff Hinge Joint',
  field_fence: 'Field Fence',
  barbed_wire: 'Barbed Wire',
  no_climb: 'No-Climb Horse Fence',
  pipe_fence: 'Pipe Fence',
  t_post_wire: 'T-Post & Wire',
};

const TERRAIN_MAP: Record<string, { label: string; mult: number; color: string }> = {
  easy: { label: 'Easy', mult: 1.0, color: 'text-emerald-400' },
  moderate: { label: 'Moderate', mult: 1.15, color: 'text-amber-400' },
  difficult: { label: 'Difficult', mult: 1.35, color: 'text-orange-400' },
  very_difficult: { label: 'Very Difficult', mult: 1.6, color: 'text-red-400' },
};

function fmt(n: number) { return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d: Date) { return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); }
function uid() { return `${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }

export default function FencingPage() {
  const { addFenceBid, materialPrices, updateMaterialPrice, resetMaterialPrices } = useAppStore();

  // Project info
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');

  // Fence config
  const [fenceType, setFenceType] = useState<FenceType>('stay_tuff_fixed_knot');
  const [fenceHeight, setFenceHeight] = useState<FenceHeight>('5ft');
  const [selectedStayTuff, setSelectedStayTuff] = useState<StayTuffOption>(STAY_TUFF_OPTIONS[0]);
  const [postMaterial, setPostMaterial] = useState<PostMaterial>('drill_stem');

  // Spacing
  const [linePostSpacing, setLinePostSpacing] = useState(66); // ft
  const [tPostSpacing, setTPostSpacing] = useState(10); // ft

  // Bracing preferences
  const [preferredHBrace, setPreferredHBrace] = useState<BraceType>('h_brace');
  const [preferredCornerBrace, setPreferredCornerBrace] = useState<BraceType>('corner_brace');

  // Pricing
  const [laborRate, setLaborRate] = useState(6); // $/ft labor only
  const [tPostHeight, setTPostHeight] = useState<'6ft' | '7ft' | '8ft'>('7ft');
  const [terrain, setTerrain] = useState('moderate');
  const [depositPercent, setDepositPercent] = useState(50);
  const [timelineDays, setTimelineDays] = useState(12);

  // Painting
  const [includePainting, setIncludePainting] = useState(false);
  const [paintColor, setPaintColor] = useState('Black');

  // Sections & Gates
  const [sections, setSections] = useState<FenceBidSection[]>([
    { id: uid(), name: 'Section 1', linearFeet: 500, ratePerFoot: 0, total: 0, terrain: 'moderate' },
  ]);
  const [gates, setGates] = useState<BidGate[]>([]);
  const [drawnLines, setDrawnLines] = useState<DrawnLine[]>([]);
  const [vertexAngles, setVertexAngles] = useState<VertexAngle[]>([]);
  const [braceRecommendations, setBraceRecommendations] = useState<BraceRecommendation[]>([]);

  // Terrain analysis
  const [terrainSuggestion, setTerrainSuggestion] = useState<TerrainSuggestion | null>(null);

  // UI
  const [activeTab, setActiveTab] = useState<'config' | 'preview' | 'pricing'>('config');
  const [projectOverview, setProjectOverview] = useState(
    'Professional installation of high tensile fence with drill stem bracing system. All materials are commercial grade with concrete setting for structural posts.'
  );

  const handleFenceLinesChange = useCallback((lines: DrawnLine[]) => {
    setDrawnLines(lines);
    // Collect all vertex angles
    const allAngles = lines.flatMap(l => l.vertexAngles);
    setVertexAngles(allAngles);

    // Calculate brace recommendations for each vertex
    const braces = allAngles
      .map(a => determineBraceType(a.angleDegrees, preferredCornerBrace, preferredHBrace))
      .filter((b): b is BraceRecommendation => b !== null);
    setBraceRecommendations(braces);

    if (lines.length > 0) {
      setSections(lines.map((line, i) => ({
        id: line.id, name: `Line ${i + 1}`, linearFeet: Math.round(line.lengthFeet),
        ratePerFoot: 0, total: 0, terrain: terrain as 'easy' | 'moderate' | 'difficult' | 'very_difficult',
      })));
    }
  }, [terrain, preferredCornerBrace, preferredHBrace]);

  const handleTerrainAnalyzed = useCallback((analysis: TerrainSuggestion) => {
    setTerrainSuggestion(analysis);
    // Auto-apply suggested difficulty
    if (analysis.confidence > 0.4) {
      setTerrain(analysis.suggestedDifficulty);
    }
  }, []);

  const terrainMult = TERRAIN_MAP[terrain]?.mult || 1;

  // === Material cost per foot calculation ===
  const materialCostPerFoot = useMemo(() => {
    // Find prices from store (falls back to defaults)
    const findPrice = (id: string) => materialPrices.find(m => m.id === id)?.price ?? 0;

    // -- Wire cost per foot --
    let wireCostPerFt = 0;
    if (fenceType.startsWith('stay_tuff')) {
      wireCostPerFt = findPrice('stay_tuff_roll') / 330;          // ~$1.17/ft
    } else if (fenceType === 'field_fence') {
      wireCostPerFt = findPrice('field_fence_roll') / 330;        // ~$0.56/ft
    } else if (fenceType === 'barbed_wire') {
      // Barbed wire: 4 strands
      wireCostPerFt = (findPrice('barbed_wire') / 1320) * 4;     // ~$0.29/ft
    } else if (fenceType === 'no_climb') {
      wireCostPerFt = findPrice('no_climb_roll') / 200;           // ~$1.40/ft
    } else if (fenceType === 't_post_wire') {
      wireCostPerFt = findPrice('field_fence_roll') / 330;
    } else {
      wireCostPerFt = findPrice('field_fence_roll') / 330;
    }
    // Add 10% overlap factor
    wireCostPerFt *= 1.10;

    // Top wire (barbed or HT smooth) unless it IS barbed wire fence
    let topWireCostPerFt = 0;
    if (fenceType !== 'barbed_wire') {
      const strands = fenceHeight >= '6ft' ? 2 : 1;
      topWireCostPerFt = (findPrice('ht_smooth') / 4000) * strands;
    }

    // -- T-Post cost per foot --
    const tPostPriceMap: Record<string, string> = { '6ft': 't_post_6', '7ft': 't_post_7', '8ft': 't_post_8' };
    const tPostPrice = findPrice(tPostPriceMap[tPostHeight] || 't_post_7');
    const tPostCostPerFt = tPostPrice / tPostSpacing;

    // -- Line post (drill stem / square tube) cost per foot --
    const heightNeedsLong = fenceHeight >= '7ft';
    let linePostPrice = 0;
    if (postMaterial === 'drill_stem') {
      linePostPrice = findPrice(heightNeedsLong ? 'drill_stem_10' : 'drill_stem_8');
    } else {
      linePostPrice = findPrice(heightNeedsLong ? 'square_tube_10' : 'square_tube_8');
    }
    const linePostCostPerFt = linePostPrice / linePostSpacing;

    // -- Concrete per foot (2 bags per line post) --
    const concreteCostPerFt = (findPrice('concrete_80') * 2) / linePostSpacing;

    // -- Hardware per foot (clips, tensioners, brace wire) --
    const clipsCostPerFt = (findPrice('clips_100') / 100) * (4 / tPostSpacing); // ~4 clips per post
    const tensionerCostPerFt = findPrice('tensioner') / 330; // roughly 1 per roll length
    const braceWireCostPerFt = findPrice('brace_wire') / 200; // avg spread

    const hardwareCostPerFt = clipsCostPerFt + tensionerCostPerFt + braceWireCostPerFt;

    const total = wireCostPerFt + topWireCostPerFt + tPostCostPerFt + linePostCostPerFt + concreteCostPerFt + hardwareCostPerFt;
    return {
      wire: Math.round(wireCostPerFt * 100) / 100,
      topWire: Math.round(topWireCostPerFt * 100) / 100,
      tPosts: Math.round(tPostCostPerFt * 100) / 100,
      linePosts: Math.round(linePostCostPerFt * 100) / 100,
      concrete: Math.round(concreteCostPerFt * 100) / 100,
      hardware: Math.round(hardwareCostPerFt * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }, [fenceType, fenceHeight, tPostHeight, tPostSpacing, linePostSpacing, postMaterial, materialPrices]);

  const baseRate = materialCostPerFoot.total + laborRate;
  const effectiveRate = useMemo(() => Math.round((materialCostPerFoot.total + laborRate * terrainMult) * 100) / 100, [materialCostPerFoot.total, laborRate, terrainMult]);

  const computed = useMemo(() => sections.map(sec => {
    const rate = sec.ratePerFoot > 0 ? sec.ratePerFoot : effectiveRate;
    return { ...sec, ratePerFoot: rate, total: Math.round(sec.linearFeet * rate * 100) / 100 };
  }), [sections, effectiveRate]);

  const totalFeet = useMemo(() => computed.reduce((s, c) => s + c.linearFeet, 0), [computed]);
  const secTotal = useMemo(() => computed.reduce((s, c) => s + c.total, 0), [computed]);
  const gateTotal = useMemo(() => gates.reduce((s, g) => s + g.cost, 0), [gates]);

  const materialCalc = useMemo(() => {
    const linePostCount = Math.max(2, Math.ceil(totalFeet / linePostSpacing));
    const tPostCount = Math.ceil(totalFeet / tPostSpacing) - linePostCount;
    const hBraces = braceRecommendations.filter(b => b.type === 'h_brace' || b.type === 'n_brace').length + 2;
    const cornerBraces = braceRecommendations.filter(b => b.type === 'corner_brace').length;
    const totalBraces = hBraces + cornerBraces;
    const wireRolls = Math.ceil((totalFeet * 1.1) / 330);
    const concreteBags = (linePostCount * 2) + (totalBraces * 4);
    return { linePostCount, tPostCount: Math.max(0, tPostCount), hBraces, cornerBraces, totalBraces, wireRolls, concreteBags };
  }, [totalFeet, linePostSpacing, tPostSpacing, braceRecommendations]);

  const paintEst = useMemo(() => {
    if (!includePainting) return null;
    return estimatePainting(materialCalc.linePostCount, materialCalc.totalBraces, gates.length);
  }, [includePainting, materialCalc, gates.length]);

  const paintCost = paintEst?.totalCost || 0;
  const projTotal = secTotal + gateTotal + paintCost;
  const deposit = Math.round(projTotal * depositPercent / 100 * 100) / 100;
  const balance = Math.round((projTotal - deposit) * 100) / 100;

  const addSection = useCallback(() => {
    setSections(p => [...p, { id: uid(), name: `Section ${p.length + 1}`, linearFeet: 100, ratePerFoot: 0, total: 0, terrain: terrain as 'easy' | 'moderate' | 'difficult' | 'very_difficult' }]);
  }, [terrain]);
  const updSec = useCallback((id: string, u: Partial<FenceBidSection>) => { setSections(p => p.map(s => s.id === id ? { ...s, ...u } : s)); }, []);
  const rmSec = useCallback((id: string) => { setSections(p => p.filter(s => s.id !== id)); }, []);

  const addGate = useCallback((spec: GateSpec) => {
    const totalHardware = spec.hardware.reduce((s, h) => s + h.quantity * h.defaultUnitPrice, 0);
    setGates(p => [...p, {
      id: uid(), type: spec.label, width: spec.widthFeet,
      cost: spec.defaultPrice + spec.defaultInstallCost,
    }]);
  }, []);
  const updGate = useCallback((id: string, u: Partial<BidGate>) => { setGates(p => p.map(g => g.id === id ? { ...g, ...u } : g)); }, []);
  const rmGate = useCallback((id: string) => { setGates(p => p.filter(g => g.id !== id)); }, []);

  const handleDownloadPDF = useCallback(() => {
    const now = new Date();
    const valid = new Date(now); valid.setDate(valid.getDate() + 30);
    const ftLabel = FENCE_TYPES[fenceType] || fenceType;
    const stModel = fenceType.startsWith('stay_tuff') ? selectedStayTuff.model : undefined;
    const secs = computed.map(sec => ({
      ...sec, materials: calculateSectionMaterials(sec.linearFeet, ftLabel, fenceHeight, stModel, sec.terrain || terrain),
    }));
    const data: FenceBidData = {
      projectName: projectName || 'Fence Installation', clientName: clientName || 'Customer',
      propertyAddress: address, date: fmtDate(now), validUntil: fmtDate(valid),
      fenceType: ftLabel, fenceHeight, stayTuffModel: stModel,
      stayTuffDescription: stModel ? selectedStayTuff.description : undefined,
      sections: secs, gates, projectTotal: projTotal, depositPercent, depositAmount: deposit,
      balanceAmount: balance, timelineWeeks: Math.ceil(timelineDays / 5), workingDays: timelineDays,
      projectOverview: projectOverview + (address ? ` Site located at ${address}.` : ''),
      terrainDescription: TERRAIN_MAP[terrain]?.label || terrain,
    };
    generateFenceBidPDF(data);
  }, [computed, gates, projectName, clientName, address, fenceType, fenceHeight, selectedStayTuff, terrain, depositPercent, deposit, balance, projTotal, timelineDays, projectOverview]);

  const handleSaveBid = useCallback(() => {
    addFenceBid({
      id: `fb_${Date.now()}`, projectName: projectName || 'Fence Project', clientName, address,
      fenceLines: [], fenceType, fenceHeight,
      stayTuffOption: fenceType.startsWith('stay_tuff') ? selectedStayTuff : undefined,
      materials: { cornerPosts: { quantity: 0, lengthFeet: 0, type: '' }, linePosts: { quantity: materialCalc.linePostCount, lengthFeet: 0, spacingFeet: linePostSpacing, type: postMaterial === 'drill_stem' ? 'Drill Stem' : '2" Square Tube' }, tPosts: { quantity: materialCalc.tPostCount, lengthFeet: 0, spacingFeet: tPostSpacing }, bracingAssemblies: { quantity: materialCalc.totalBraces, type: '' }, gateAssemblies: [], wire: { rolls: materialCalc.wireRolls, feetPerRoll: 330, totalFeet: totalFeet, type: '' }, barbedWire: { rolls: 0, strands: 0, totalFeet: 0 }, clips: { quantity: 0, type: '' }, staples: { pounds: 0 }, concrete: { bags: materialCalc.concreteBags, poundsPerBag: 80 }, tensioners: { quantity: 0 }, extras: [] },
      laborEstimate: { totalHours: timelineDays * 24, crewSize: 3, days: timelineDays, difficultyMultiplier: terrainMult, hourlyRate: 45, totalLaborCost: secTotal },
      totalCost: projTotal, createdAt: new Date().toISOString(),
    });
    alert('Bid saved!');
  }, [projectName, clientName, address, fenceType, fenceHeight, selectedStayTuff, totalFeet, timelineDays, terrain, secTotal, projTotal, addFenceBid, materialCalc, linePostSpacing, tPostSpacing, postMaterial, terrainMult]);

  return (
    <div className="min-h-screen bg-surface-400 bg-mesh">
      <header className="glass border-b border-steel-700/20 sticky top-0 z-50">
        <div className="max-w-[1500px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-steel-400 hover:text-amber-400 transition text-sm">\u2190 Back</Link>
            <h1 className="text-steel-100 font-bold text-lg">\u26a1 Fence Bid Creator</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSaveBid} className="text-sm glass text-steel-300 px-4 py-2 rounded-lg hover:text-white transition font-medium">Save Bid</button>
            <button onClick={handleDownloadPDF} className="text-sm bg-gradient-to-r from-amber-600 to-orange-600 text-white px-5 py-2 rounded-lg hover:from-amber-500 hover:to-orange-500 transition font-semibold shadow-lg shadow-amber-900/30 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Download PDF
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-6 py-6">
        <div className="grid lg:grid-cols-12 gap-6">

          {/* LEFT CONFIG SIDEBAR */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-4 animate-slide-in-left">

            <Card title="Project Info" icon="\ud83d\udcdd">
              <div className="space-y-2.5">
                <DInput value={projectName} onChange={setProjectName} placeholder="Project Name" />
                <DInput value={clientName} onChange={setClientName} placeholder="Client Name" />
                <DInput value={address} onChange={setAddress} placeholder="Property Address" />
              </div>
            </Card>

            <Card title="Fence Type" icon="\ud83e\uddf1">
              <div className="space-y-3">
                <select title="Fence type" value={fenceType} onChange={e => setFenceType(e.target.value as FenceType)}
                  className="w-full bg-surface-200 border border-steel-700/30 rounded-lg px-3 py-2 text-sm text-steel-200 focus:ring-2 focus:ring-amber-500/50">
                  {Object.entries(FENCE_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>

                <div>
                  <label className="block text-xs font-medium text-steel-400 mb-1.5">Height</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(['4ft','5ft','6ft','7ft','8ft'] as FenceHeight[]).map(h => (
                      <button key={h} onClick={() => setFenceHeight(h)}
                        className={`py-1.5 rounded-lg text-xs font-semibold transition ${fenceHeight === h ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30' : 'bg-surface-200 text-steel-400 hover:bg-surface-50 hover:text-steel-200'}`}>{h}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-steel-400 mb-1.5">Post Material</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {POST_MATERIALS.map(pm => (
                      <button key={pm.id} onClick={() => setPostMaterial(pm.id)}
                        className={`py-2 px-2 rounded-lg text-[11px] font-medium transition text-left ${postMaterial === pm.id ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50' : 'bg-surface-200 text-steel-400 border border-steel-700/20 hover:bg-surface-50'}`}>
                        {pm.label}<span className="block text-[9px] opacity-70">{pm.diameter}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {fenceType.startsWith('stay_tuff') && (
                  <div>
                    <label className="block text-xs font-medium text-steel-400 mb-1">Stay-Tuff Product</label>
                    <select title="Stay-Tuff product" value={selectedStayTuff.model}
                      onChange={e => { const o = STAY_TUFF_OPTIONS.find(x => x.model === e.target.value); if (o) setSelectedStayTuff(o); }}
                      className="w-full bg-surface-200 border border-steel-700/30 rounded-lg px-3 py-2 text-sm text-steel-200 focus:ring-2 focus:ring-amber-500/50">
                      {STAY_TUFF_OPTIONS.map(o => <option key={o.model} value={o.model}>{o.model} - {o.description}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </Card>

            <Card title="Post Spacing" icon="\ud83d\udccf">
              <div className="space-y-4">
                <DSlider label="Line Post Spacing" value={linePostSpacing} min={50} max={100} step={1}
                  display={`${linePostSpacing} ft`} onChange={setLinePostSpacing} minLabel="50 ft" maxLabel="100 ft" />
                <DSlider label="T-Post Spacing" value={tPostSpacing} min={7} max={15} step={0.5}
                  display={`${tPostSpacing} ft`} onChange={setTPostSpacing} minLabel="7 ft" maxLabel="15 ft" />
                <div className="bg-surface-200 rounded-lg p-3 text-xs text-steel-400">
                  <div className="flex justify-between"><span>Line Posts (est):</span><span className="text-steel-200 font-semibold">{materialCalc.linePostCount}</span></div>
                  <div className="flex justify-between mt-1"><span>T-Posts (est):</span><span className="text-steel-200 font-semibold">{materialCalc.tPostCount}</span></div>
                </div>
              </div>
            </Card>

            <Card title="Bracing" icon="\ud83d\udd27">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-steel-400 mb-1">H-Brace Style</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['h_brace', 'double_h'] as BraceType[]).map(bt => {
                      const spec = BRACE_SPECS.find(b => b.id === bt);
                      return <button key={bt} onClick={() => setPreferredHBrace(bt)}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition text-left ${preferredHBrace === bt ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50' : 'bg-surface-200 text-steel-400 border border-steel-700/20 hover:bg-surface-50'}`}>{spec?.label}</button>;
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-steel-400 mb-1">Corner Brace Style</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['corner_brace', 'n_brace'] as BraceType[]).map(bt => {
                      const spec = BRACE_SPECS.find(b => b.id === bt);
                      return <button key={bt} onClick={() => setPreferredCornerBrace(bt)}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition text-left ${preferredCornerBrace === bt ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50' : 'bg-surface-200 text-steel-400 border border-steel-700/20 hover:bg-surface-50'}`}>{spec?.label}</button>;
                    })}
                  </div>
                </div>
                {braceRecommendations.length > 0 && (
                  <div className="bg-surface-200 rounded-lg p-3 text-xs space-y-1">
                    <p className="text-steel-400 font-medium">Auto-detected from map:</p>
                    <p className="text-steel-300">H-Braces: <strong className="text-amber-400">{materialCalc.hBraces}</strong> | Corner: <strong className="text-amber-400">{materialCalc.cornerBraces}</strong></p>
                  </div>
                )}
              </div>
            </Card>

            <Card title="Pricing" icon="💰">
              <div className="space-y-4">
                {/* T-Post Height selector */}
                <div>
                  <label className="block text-xs font-medium text-steel-400 mb-1.5">T-Post Height</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['6ft', '7ft', '8ft'] as const).map(h => (
                      <button key={h} onClick={() => setTPostHeight(h)}
                        className={`py-1.5 rounded-lg text-xs font-semibold transition ${tPostHeight === h ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30' : 'bg-surface-200 text-steel-400 hover:bg-surface-50 hover:text-steel-200'}`}>{h}</button>
                    ))}
                  </div>
                </div>

                {/* Material cost breakdown (auto-calculated) */}
                <div className="bg-surface-200/60 rounded-lg p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-steel-400 uppercase tracking-wider mb-2">Material Cost / Ft (auto)</p>
                  {[
                    { label: `Wire (${FENCE_TYPES[fenceType]?.split(' ').slice(-2).join(' ') || fenceType})`, value: materialCostPerFoot.wire },
                    { label: 'Top Wire (HT smooth)', value: materialCostPerFoot.topWire },
                    { label: `T-Posts (${tPostHeight} @ ${tPostSpacing}' spacing)`, value: materialCostPerFoot.tPosts },
                    { label: `Line Posts (${postMaterial === 'drill_stem' ? 'Drill Stem' : 'Sq Tube'} @ ${linePostSpacing}')`, value: materialCostPerFoot.linePosts },
                    { label: 'Concrete', value: materialCostPerFoot.concrete },
                    { label: 'Hardware (clips, tensioners, etc.)', value: materialCostPerFoot.hardware },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between items-center">
                      <span className="text-[10px] text-steel-500">{row.label}</span>
                      <span className="text-[10px] text-steel-300 font-mono">${row.value.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t border-steel-700/30 pt-1.5 mt-1.5 flex justify-between items-center">
                    <span className="text-xs text-steel-300 font-semibold">Material Total</span>
                    <span className="text-xs text-amber-400 font-bold font-mono">${materialCostPerFoot.total.toFixed(2)}/ft</span>
                  </div>
                </div>

                {/* Labor rate slider */}
                <DSlider label="Labor Rate per Foot" value={laborRate} min={2} max={20} step={0.5}
                  display={`$${laborRate.toFixed(2)}/ft`} onChange={setLaborRate} minLabel="$2" maxLabel="$20" />

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-medium text-steel-400">Terrain Difficulty</label>
                    <span className={`text-xs font-bold ${TERRAIN_MAP[terrain]?.color || 'text-steel-300'}`}>{terrainMult}x labor</span>
                  </div>
                  {terrainSuggestion && (
                    <div className="mb-2 bg-amber-900/20 border border-amber-700/30 rounded-lg p-2 text-[10px] text-amber-300">
                      <span className="font-semibold">⚡ AI Suggested: {TERRAIN_MAP[terrainSuggestion.suggestedDifficulty]?.label}</span>
                      {terrainSuggestion.soilType && <span className="block text-amber-400/70 mt-0.5">Soil: {terrainSuggestion.soilType}</span>}
                      <span className="block text-amber-400/70">Elev change: {Math.round(terrainSuggestion.elevationChange)} ft | Confidence: {Math.round(terrainSuggestion.confidence * 100)}%</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(TERRAIN_MAP).map(([k, v]) => (
                      <button key={k} onClick={() => setTerrain(k)}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition text-left ${terrain === k ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50' : 'bg-surface-200 text-steel-400 border border-steel-700/20 hover:bg-surface-50'}`}>
                        {v.label}<span className="block text-[9px] opacity-70">{v.mult}x labor rate</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Effective rate summary */}
                <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 rounded-lg p-3 border border-amber-700/30 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-amber-300">Effective Rate</span>
                    <span className="text-lg font-bold text-amber-400">${effectiveRate.toFixed(2)}/ft</span>
                  </div>
                  <div className="text-[10px] text-amber-400/60 space-y-0.5">
                    <div className="flex justify-between"><span>Material:</span><span>${materialCostPerFoot.total.toFixed(2)}/ft</span></div>
                    <div className="flex justify-between"><span>Labor ({terrainMult}x):</span><span>${(laborRate * terrainMult).toFixed(2)}/ft</span></div>
                    <div className="flex justify-between border-t border-amber-700/30 pt-0.5"><span className="font-semibold">Combined:</span><span className="font-semibold">${effectiveRate.toFixed(2)}/ft</span></div>
                  </div>
                </div>

                <DSlider label="Deposit %" value={depositPercent} min={25} max={75} step={5}
                  display={`${depositPercent}%`} onChange={setDepositPercent} minLabel="25%" maxLabel="75%" />
                <DSlider label="Timeline (working days)" value={timelineDays} min={3} max={60} step={1}
                  display={`${timelineDays} days`} onChange={setTimelineDays} minLabel="3" maxLabel="60" />
              </div>
            </Card>

            <Card title="Painting" icon="\ud83c\udfa8">
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className={`w-10 h-5 rounded-full transition relative ${includePainting ? 'bg-amber-600' : 'bg-surface-200'}`}
                    onClick={() => setIncludePainting(!includePainting)}>
                    <div className={`absolute w-4 h-4 bg-white rounded-full top-0.5 transition-all ${includePainting ? 'left-5' : 'left-0.5'}`} />
                  </div>
                  <span className="text-sm text-steel-300">Paint all steel</span>
                </label>
                {includePainting && (
                  <>
                    <DInput value={paintColor} onChange={setPaintColor} placeholder="Paint color" />
                    {paintEst && (
                      <div className="bg-surface-200 rounded-lg p-3 text-xs text-steel-400 space-y-1">
                        <div className="flex justify-between"><span>Paint:</span><span className="text-steel-200">{paintEst.gallonsNeeded} gallons</span></div>
                        <div className="flex justify-between"><span>Material:</span><span className="text-steel-200">${fmt(paintEst.materialCost)}</span></div>
                        <div className="flex justify-between"><span>Labor:</span><span className="text-steel-200">${fmt(paintEst.laborCost)}</span></div>
                        <div className="flex justify-between border-t border-steel-700/30 pt-1 mt-1"><span className="font-medium text-steel-300">Total:</span><span className="font-bold text-amber-400">${fmt(paintEst.totalCost)}</span></div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>

            <Card title="Overview Text" icon="\ud83d\udcdd">
              <textarea value={projectOverview} onChange={e => setProjectOverview(e.target.value)} rows={3}
                className="w-full bg-surface-200 border border-steel-700/30 rounded-lg px-3 py-2 text-xs text-steel-300 focus:ring-2 focus:ring-amber-500/50" placeholder="Describe the project scope..." />
            </Card>
          </div>

          {/* RIGHT MAIN AREA */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-5 animate-fade-in">

            <div className="flex gap-2">
              {(['config', 'preview', 'pricing'] as const).map(t => (
                <TabBtn key={t} active={activeTab === t} onClick={() => setActiveTab(t)}>
                  {t === 'config' ? 'Sections & Map' : t === 'preview' ? 'Bid Preview' : 'Material Pricing'}
                </TabBtn>
              ))}
            </div>

            {activeTab === 'config' && (
              <div className="space-y-5 animate-fade-in">
                <FenceMap onFenceLinesChange={handleFenceLinesChange} onTerrainAnalyzed={handleTerrainAnalyzed} />

                <div className="card-dark overflow-hidden">
                  <div className="px-5 py-3 border-b border-steel-700/20 flex items-center justify-between">
                    <h2 className="text-steel-200 font-semibold text-sm">Fence Sections</h2>
                    <button onClick={addSection} className="text-xs bg-amber-600/20 text-amber-400 px-3 py-1.5 rounded-lg font-semibold hover:bg-amber-600/30 transition">+ Add Section</button>
                  </div>
                  <div className="divide-y divide-steel-700/20">
                    {computed.map((sec, idx) => (
                      <div key={sec.id} className="px-5 py-3">
                        <div className="grid grid-cols-12 gap-3 items-center">
                          <div className="col-span-4"><input type="text" value={sec.name} onChange={e => updSec(sec.id, { name: e.target.value })} className="w-full bg-surface-200 border border-steel-700/30 rounded px-2.5 py-1.5 text-sm text-steel-200 font-medium focus:ring-1 focus:ring-amber-500/50" /></div>
                          <div className="col-span-2"><input title="Linear feet" type="number" value={sections[idx]?.linearFeet || 0} onChange={e => updSec(sec.id, { linearFeet: parseInt(e.target.value) || 0 })} className="w-full bg-surface-200 border border-steel-700/30 rounded px-2.5 py-1.5 text-sm text-right text-steel-200 focus:ring-1 focus:ring-amber-500/50" /></div>
                          <div className="col-span-2"><input type="number" step={0.5} value={sections[idx]?.ratePerFoot || ''} onChange={e => updSec(sec.id, { ratePerFoot: parseFloat(e.target.value) || 0 })} className="w-full bg-surface-200 border border-steel-700/30 rounded px-2.5 py-1.5 text-sm text-right text-steel-200 focus:ring-1 focus:ring-amber-500/50" placeholder={effectiveRate.toFixed(2)} /></div>
                          <div className="col-span-3 text-right"><span className="text-sm font-bold text-amber-400">${fmt(sec.total)}</span></div>
                          <div className="col-span-1 text-right">{computed.length > 1 && <button onClick={() => rmSec(sec.id)} className="text-steel-500 hover:text-red-400 transition">\u00d7</button>}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card-dark overflow-hidden">
                  <div className="px-5 py-3 border-b border-steel-700/20 flex items-center justify-between">
                    <h2 className="text-steel-200 font-semibold text-sm">Gates</h2>
                    <div className="flex gap-1.5 flex-wrap">
                      {GATE_SPECS.map(gs => (
                        <button key={gs.size} onClick={() => addGate(gs)}
                          className="text-[10px] bg-surface-200 text-steel-400 px-2 py-1 rounded font-medium hover:bg-surface-50 hover:text-steel-200 transition">+ {gs.label}</button>
                      ))}
                    </div>
                  </div>
                  {gates.length === 0 ? (
                    <div className="px-5 py-4 text-xs text-steel-500 text-center">No gates added. Click a gate size above to add.</div>
                  ) : (
                    <div className="divide-y divide-steel-700/20">
                      {gates.map(g => {
                        const spec = GATE_SPECS.find(gs => gs.label === g.type);
                        return (
                          <div key={g.id} className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <input title="Gate type" type="text" value={g.type} onChange={e => updGate(g.id, { type: e.target.value })} className="flex-1 bg-surface-200 border border-steel-700/30 rounded px-2.5 py-1.5 text-sm text-steel-200 focus:ring-1 focus:ring-amber-500/50" />
                              <div className="relative w-32">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-steel-500">$</span>
                                <input title="Gate cost" type="number" value={g.cost} onChange={e => updGate(g.id, { cost: parseFloat(e.target.value) || 0 })} className="w-full bg-surface-200 border border-steel-700/30 rounded px-2.5 py-1.5 text-sm text-right text-steel-200 pl-5 focus:ring-1 focus:ring-amber-500/50" />
                              </div>
                              <button onClick={() => rmGate(g.id)} className="text-steel-500 hover:text-red-400 transition">\u00d7</button>
                            </div>
                            {spec && (
                              <div className="mt-2 bg-surface-200/50 rounded p-2 text-[10px] text-steel-500">
                                <p className="font-medium text-steel-400 mb-1">Included hardware:</p>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                                  {spec.hardware.map((h, i) => <span key={i}>{h.quantity}x {h.name}</span>)}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'preview' && (
              <div className="card-dark overflow-hidden animate-fade-in">
                <div className="px-6 py-4 bg-gradient-to-r from-steel-900 to-steel-800 border-b border-steel-700/30">
                  <h2 className="text-xl font-bold text-white">HAYDEN RANCH SERVICES</h2>
                  <p className="text-xs text-steel-400 mt-1">5900 Balcones Dr #26922, Austin, TX 78731 \u2022 (830) 777-9111 \u2022 office@haydenclaim.com</p>
                </div>
                <div className="p-6 space-y-6">
                  <div className="text-center">
                    <h3 className="text-lg font-bold text-steel-100 uppercase">{FENCE_TYPES[fenceType]} Installation Proposal</h3>
                    <p className="text-sm text-steel-400 mt-1">Prepared for: <strong className="text-steel-200">{clientName || '___________'}</strong></p>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-steel-300 mb-2 uppercase tracking-wide">Investment Summary</h4>
                    <table className="w-full text-sm">
                      <thead><tr className="bg-steel-800">
                        <th className="text-left px-3 py-2 text-steel-300 font-medium">Item</th>
                        <th className="text-right px-3 py-2 text-steel-300 font-medium">Details</th>
                        <th className="text-right px-3 py-2 text-steel-300 font-medium">Total</th>
                      </tr></thead>
                      <tbody>
                        {computed.map((sec, i) => (
                          <tr key={sec.id} className={i % 2 === 0 ? 'bg-surface-50/50' : ''}>
                            <td className="px-3 py-2 text-steel-300">{sec.name}</td>
                            <td className="px-3 py-2 text-right text-steel-400">{sec.linearFeet.toLocaleString()} ft @ ${sec.ratePerFoot.toFixed(2)}/ft</td>
                            <td className="px-3 py-2 text-right font-semibold text-steel-200">${fmt(sec.total)}</td>
                          </tr>
                        ))}
                        {gates.map(g => (
                          <tr key={g.id} className="bg-surface-50/30">
                            <td className="px-3 py-2 text-steel-300">{g.type}</td>
                            <td className="px-3 py-2 text-right text-steel-500">incl. hardware & install</td>
                            <td className="px-3 py-2 text-right font-semibold text-steel-200">${fmt(g.cost)}</td>
                          </tr>
                        ))}
                        {includePainting && paintEst && (
                          <tr className="bg-surface-50/30">
                            <td className="px-3 py-2 text-steel-300">Painting ({paintColor})</td>
                            <td className="px-3 py-2 text-right text-steel-500">{paintEst.gallonsNeeded} gal + labor</td>
                            <td className="px-3 py-2 text-right font-semibold text-steel-200">${fmt(paintEst.totalCost)}</td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot><tr className="border-t-2 border-steel-600">
                        <td className="px-3 py-2 font-bold text-steel-200">{totalFeet.toLocaleString()} total ft</td>
                        <td></td>
                        <td className="px-3 py-2 text-right font-bold text-xl text-amber-400">${fmt(projTotal)}</td>
                      </tr></tfoot>
                    </table>
                  </div>

                  <div className="bg-surface-200/50 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-steel-300 mb-2">Material Summary</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                      <div><span className="text-steel-500">Post Material:</span> <span className="text-steel-200">{postMaterial === 'drill_stem' ? 'Drill Stem' : '2" Square Tube'}</span></div>
                      <div><span className="text-steel-500">Line Posts:</span> <span className="text-steel-200">{materialCalc.linePostCount} @ {linePostSpacing}' spacing</span></div>
                      <div><span className="text-steel-500">T-Posts:</span> <span className="text-steel-200">{materialCalc.tPostCount} @ {tPostSpacing}' spacing</span></div>
                      <div><span className="text-steel-500">H-Braces:</span> <span className="text-steel-200">{materialCalc.hBraces}</span></div>
                      <div><span className="text-steel-500">Corner Braces:</span> <span className="text-steel-200">{materialCalc.cornerBraces}</span></div>
                      <div><span className="text-steel-500">Wire Rolls:</span> <span className="text-steel-200">{materialCalc.wireRolls} (330' ea)</span></div>
                      <div><span className="text-steel-500">Concrete:</span> <span className="text-steel-200">{materialCalc.concreteBags} bags (80lb)</span></div>
                      <div><span className="text-steel-500">Gates:</span> <span className="text-steel-200">{gates.length}</span></div>
                      {includePainting && <div><span className="text-steel-500">Paint:</span> <span className="text-steel-200">{paintEst?.gallonsNeeded || 0} gallons ({paintColor})</span></div>}
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 rounded-lg p-4 border border-amber-700/30">
                    <h4 className="text-sm font-bold text-amber-300 mb-2 uppercase tracking-wide">Payment Schedule</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between text-steel-300"><span>Deposit ({depositPercent}% - due at signing)</span><span className="font-semibold text-steel-200">${fmt(deposit)}</span></div>
                      <div className="flex justify-between text-steel-300"><span>Balance (due at completion)</span><span className="font-semibold text-steel-200">${fmt(balance)}</span></div>
                      <div className="flex justify-between border-t border-amber-700/30 pt-1 mt-1"><span className="font-bold text-amber-300">Project Total</span><span className="font-bold text-xl text-amber-400">${fmt(projTotal)}</span></div>
                    </div>
                  </div>

                  <p className="text-sm text-steel-400"><strong>Timeline:</strong> {timelineDays} to {timelineDays + Math.ceil(timelineDays * 0.25)} working days</p>

                  <button onClick={handleDownloadPDF}
                    className="w-full bg-gradient-to-r from-amber-600 to-orange-600 text-white font-bold py-3 px-4 rounded-lg hover:from-amber-500 hover:to-orange-500 transition text-sm shadow-lg shadow-amber-900/30">
                    Download Complete Bid PDF (with Terms & Signature Block)
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'pricing' && (
              <div className="card-dark overflow-hidden animate-fade-in">
                <div className="px-5 py-3 border-b border-steel-700/20 flex items-center justify-between">
                  <h2 className="text-steel-200 font-semibold text-sm">Custom Material Pricing</h2>
                  <button onClick={resetMaterialPrices} className="text-xs text-steel-400 hover:text-amber-400 transition">Reset to Defaults</button>
                </div>
                <div className="p-5">
                  <p className="text-xs text-steel-500 mb-4">Set custom prices for all materials used in bid calculations. These prices persist across sessions.</p>
                  {Object.entries(materialPrices.reduce((acc, m) => { if (!acc[m.category]) acc[m.category] = []; acc[m.category].push(m); return acc; }, {} as Record<string, typeof materialPrices>)).map(([cat, items]) => (
                    <div key={cat} className="mb-6">
                      <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">{cat}</h3>
                      <div className="space-y-1.5">
                        {items.map(item => (
                          <div key={item.id} className="flex items-center justify-between gap-3 bg-surface-200/50 rounded-lg px-3 py-2">
                            <span className="text-xs text-steel-300 flex-1">{item.name}</span>
                            <span className="text-[10px] text-steel-500">/{item.unit}</span>
                            <div className="relative w-24">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-steel-500">$</span>
                              <input type="number" step={0.01} value={item.price} onChange={e => updateMaterialPrice(item.id, parseFloat(e.target.value) || 0)}
                                className="w-full bg-surface-300 border border-steel-700/30 rounded px-2 py-1 text-xs text-right text-steel-200 pl-5 focus:ring-1 focus:ring-amber-500/50" />
                            </div>
                            {item.price !== item.defaultPrice && <span className="text-[9px] text-amber-400">\u2022</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-gradient-to-r from-steel-900 via-steel-800 to-steel-900 rounded-xl p-5 text-white shadow-xl border border-steel-700/30 sticky bottom-4 glow-amber">
              <div className="grid grid-cols-6 gap-4 text-center">
                <div><p className="text-[10px] text-steel-400 uppercase tracking-wide">Sections</p><p className="text-lg font-bold">{computed.length}</p></div>
                <div><p className="text-[10px] text-steel-400 uppercase tracking-wide">Total Feet</p><p className="text-lg font-bold">{totalFeet.toLocaleString()}</p></div>
                <div><p className="text-[10px] text-steel-400 uppercase tracking-wide">Eff. Rate</p><p className="text-lg font-bold">${effectiveRate.toFixed(2)}/ft</p></div>
                <div><p className="text-[10px] text-steel-400 uppercase tracking-wide">Gates</p><p className="text-lg font-bold">{gates.length}</p></div>
                <div><p className="text-[10px] text-steel-400 uppercase tracking-wide">Braces</p><p className="text-lg font-bold">{materialCalc.totalBraces}</p></div>
                <div><p className="text-[10px] text-amber-400 uppercase tracking-wide font-semibold">Total</p><p className="text-2xl font-bold text-amber-400">${fmt(projTotal)}</p></div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <div className="card-dark p-4 animate-scale-in">
      <h2 className="text-steel-200 font-semibold text-sm mb-3 flex items-center gap-2">
        {icon && <span>{icon}</span>}{title}
      </h2>
      {children}
    </div>
  );
}

function DInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <input type="text" value={value} onChange={e => onChange(e.target.value)}
    className="w-full bg-surface-200 border border-steel-700/30 rounded-lg px-3 py-2 text-sm text-steel-200 placeholder-steel-500 focus:ring-2 focus:ring-amber-500/50" placeholder={placeholder} />;
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
        className="w-full" />
      <div className="flex justify-between text-[10px] text-steel-500 mt-0.5"><span>{minLabel}</span><span>{maxLabel}</span></div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${active ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30' : 'glass text-steel-400 hover:text-steel-200'}`}>
      {children}
    </button>
  );
}