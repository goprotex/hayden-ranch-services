'use client';

import { useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import HaydenLogo from '@/components/HaydenLogo';
import {
  generateFenceBidPDF,
  calculateSectionMaterials,
  FenceBidSection,
  BidGate,
  FenceBidData,
} from '@/lib/fencing/fence-bid-pdf';
import { STAY_TUFF_OPTIONS } from '@/lib/fencing/fence-calculator';
import type { DrawnLine } from '@/components/fencing/FenceMap';
import type { FenceType, FenceHeight, StayTuffOption } from '@/types';

const FenceMap = dynamic(() => import('@/components/fencing/FenceMap'), {
  ssr: false,
  loading: () => (
    <div className="bg-steel-100 flex items-center justify-center h-[500px] animate-pulse">
      <p className="text-steel-400 text-sm">Loading map...</p>
    </div>
  ),
});

const FENCE_TYPE_LABELS: Record<string, string> = {
  stay_tuff_fixed_knot: 'High Tensile Stay-Tuff Fixed Knot',
  stay_tuff_hinge_joint: 'High Tensile Stay-Tuff Hinge Joint',
  field_fence: 'Field Fence',
  barbed_wire: 'Barbed Wire',
  no_climb: 'No-Climb Horse Fence',
  pipe_fence: 'Pipe Fence',
  t_post_wire: 'T-Post & Wire',
};

const TERRAIN_LABELS: Record<string, string> = {
  easy: 'Easy',
  moderate: 'Moderate',
  difficult: 'Difficult',
  very_difficult: 'Very Difficult',
};

const TERRAIN_MULTIPLIERS: Record<string, number> = {
  easy: 1.0,
  moderate: 1.15,
  difficult: 1.35,
  very_difficult: 1.6,
};

const GATE_PRESETS = [
  { type: "12' Truck Gate", width: 12, defaultCost: 450 },
  { type: "16' Truck Gate", width: 16, defaultCost: 600 },
  { type: "4' Walk Gate", width: 4, defaultCost: 250 },
  { type: "6' Walk Gate", width: 6, defaultCost: 300 },
  { type: "20' Cattle Guard", width: 20, defaultCost: 2500 },
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

export default function FencingPage() {
  const { addFenceBid } = useAppStore();

  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [fenceType, setFenceType] = useState<FenceType>('stay_tuff_fixed_knot');
  const [fenceHeight, setFenceHeight] = useState<FenceHeight>('5ft');
  const [selectedStayTuff, setSelectedStayTuff] = useState<StayTuffOption>(STAY_TUFF_OPTIONS[0]);
  const [baseRate, setBaseRate] = useState(12);
  const [terrain, setTerrain] = useState('moderate');
  const [depositPercent, setDepositPercent] = useState(50);
  const [timelineDays, setTimelineDays] = useState(12);
  const [sections, setSections] = useState<FenceBidSection[]>([
    { id: uid(), name: 'Section 1', linearFeet: 500, ratePerFoot: 0, total: 0, terrain: 'moderate' },
  ]);
  const [gates, setGates] = useState<BidGate[]>([]);
  const [drawnLines, setDrawnLines] = useState<DrawnLine[]>([]);
  const [projectOverview, setProjectOverview] = useState(
    'Professional installation of high tensile fence with drill stem bracing system. All materials are commercial grade with concrete setting for structural posts.'
  );
  const [activeTab, setActiveTab] = useState<'config' | 'preview'>('config');

  const handleFenceLinesChange = useCallback((lines: DrawnLine[]) => {
    setDrawnLines(lines);
    if (lines.length > 0) {
      setSections(lines.map((line, i) => ({
        id: line.id, name: `Line ${i + 1}`, linearFeet: Math.round(line.lengthFeet),
        ratePerFoot: 0, total: 0, terrain: terrain as 'easy' | 'moderate' | 'difficult' | 'very_difficult',
      })));
    }
  }, [terrain]);

  const effectiveRate = useMemo(() =>
    Math.round(baseRate * (TERRAIN_MULTIPLIERS[terrain] || 1) * 100) / 100
  , [baseRate, terrain]);

  const computed = useMemo(() =>
    sections.map((sec) => {
      const rate = sec.ratePerFoot > 0 ? sec.ratePerFoot : effectiveRate;
      return { ...sec, ratePerFoot: rate, total: Math.round(sec.linearFeet * rate * 100) / 100 };
    })
  , [sections, effectiveRate]);

  const totalFeet = useMemo(() => computed.reduce((s, c) => s + c.linearFeet, 0), [computed]);
  const secTotal = useMemo(() => computed.reduce((s, c) => s + c.total, 0), [computed]);
  const gateTotal = useMemo(() => gates.reduce((s, g) => s + g.cost, 0), [gates]);
  const projTotal = secTotal + gateTotal;
  const deposit = Math.round(projTotal * depositPercent / 100 * 100) / 100;
  const balance = Math.round((projTotal - deposit) * 100) / 100;

  const addSection = useCallback(() => {
    setSections(p => [...p, { id: uid(), name: `Section ${p.length + 1}`, linearFeet: 100, ratePerFoot: 0, total: 0, terrain: terrain as 'easy' | 'moderate' | 'difficult' | 'very_difficult' }]);
  }, [terrain]);

  const updSec = useCallback((id: string, u: Partial<FenceBidSection>) => {
    setSections(p => p.map(s => s.id === id ? { ...s, ...u } : s));
  }, []);

  const rmSec = useCallback((id: string) => { setSections(p => p.filter(s => s.id !== id)); }, []);

  const addGate = useCallback((pr: typeof GATE_PRESETS[0]) => {
    setGates(p => [...p, { id: uid(), type: pr.type, width: pr.width, cost: pr.defaultCost }]);
  }, []);

  const updGate = useCallback((id: string, u: Partial<BidGate>) => {
    setGates(p => p.map(g => g.id === id ? { ...g, ...u } : g));
  }, []);

  const rmGate = useCallback((id: string) => { setGates(p => p.filter(g => g.id !== id)); }, []);

  const handleDownloadPDF = useCallback(() => {
    const now = new Date();
    const valid = new Date(now); valid.setDate(valid.getDate() + 30);
    const ftLabel = FENCE_TYPE_LABELS[fenceType] || fenceType;
    const stModel = fenceType.startsWith('stay_tuff') ? selectedStayTuff.model : undefined;
    const secs = computed.map(sec => ({
      ...sec,
      materials: calculateSectionMaterials(sec.linearFeet, ftLabel, fenceHeight, stModel, sec.terrain || terrain),
    }));
    const data: FenceBidData = {
      projectName: projectName || 'Fence Installation', clientName: clientName || 'Customer',
      propertyAddress: address, date: fmtDate(now), validUntil: fmtDate(valid),
      fenceType: ftLabel, fenceHeight, stayTuffModel: stModel,
      stayTuffDescription: stModel ? selectedStayTuff.description : undefined,
      sections: secs, gates, projectTotal: projTotal, depositPercent, depositAmount: deposit,
      balanceAmount: balance, timelineWeeks: Math.ceil(timelineDays / 5), workingDays: timelineDays,
      projectOverview: projectOverview + (address ? ` Site located at ${address}.` : ''),
      terrainDescription: TERRAIN_LABELS[terrain] || terrain,
    };
    generateFenceBidPDF(data);
  }, [computed, gates, projectName, clientName, address, fenceType, fenceHeight, selectedStayTuff, terrain, depositPercent, deposit, balance, projTotal, timelineDays, projectOverview]);

  const handleSaveBid = useCallback(() => {
    addFenceBid({
      id: `fb_${Date.now()}`, projectName: projectName || 'Fence Project', clientName, address,
      fenceLines: [], fenceType, fenceHeight,
      stayTuffOption: fenceType.startsWith('stay_tuff') ? selectedStayTuff : undefined,
      materials: { cornerPosts: { quantity: 0, lengthFeet: 0, type: '' }, linePosts: { quantity: 0, lengthFeet: 0, spacingFeet: 0, type: '' }, tPosts: { quantity: 0, lengthFeet: 0, spacingFeet: 0 }, bracingAssemblies: { quantity: 0, type: '' }, gateAssemblies: [], wire: { rolls: 0, feetPerRoll: 330, totalFeet: totalFeet, type: '' }, barbedWire: { rolls: 0, strands: 0, totalFeet: 0 }, clips: { quantity: 0, type: '' }, staples: { pounds: 0 }, concrete: { bags: 0, poundsPerBag: 80 }, tensioners: { quantity: 0 }, extras: [] },
      laborEstimate: { totalHours: timelineDays * 24, crewSize: 3, days: timelineDays, difficultyMultiplier: TERRAIN_MULTIPLIERS[terrain] || 1, hourlyRate: 45, totalLaborCost: secTotal },
      totalCost: projTotal, createdAt: new Date().toISOString(),
    });
    alert('Bid saved!');
  }, [projectName, clientName, address, fenceType, fenceHeight, selectedStayTuff, totalFeet, timelineDays, terrain, secTotal, projTotal, addFenceBid]);

  return (
    <div className="min-h-screen bg-steel-50">
      <header className="bg-white border-b border-steel-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-steel-400 hover:text-steel-600 transition">&#8592; Back</Link>
            <div className="flex items-center gap-2">
              <HaydenLogo className="w-8 h-8" />
              <h1 className="text-steel-800 font-bold text-lg">Fence Bid Creator</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSaveBid} className="text-sm bg-steel-100 text-steel-700 px-4 py-2 rounded-lg hover:bg-steel-200 transition font-medium">Save Bid</button>
            <button onClick={handleDownloadPDF} className="text-sm bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition font-semibold flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Download Bid PDF
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="grid lg:grid-cols-12 gap-6">
          {/* LEFT Config */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-5">
            <Card title="Project Info">
              <div className="space-y-2.5">
                <Input value={projectName} onChange={setProjectName} placeholder="Project Name" />
                <Input value={clientName} onChange={setClientName} placeholder="Client Name" />
                <Input value={address} onChange={setAddress} placeholder="Property Address" />
              </div>
            </Card>

            <Card title="Fence Type">
              <div className="space-y-3">
                <select title="Fence type" value={fenceType} onChange={e => setFenceType(e.target.value as FenceType)}
                  className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500">
                  {Object.entries(FENCE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <div>
                  <label className="block text-xs font-medium text-steel-500 mb-1">Height</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(['4ft','5ft','6ft','7ft','8ft'] as FenceHeight[]).map(h => (
                      <button key={h} onClick={() => setFenceHeight(h)}
                        className={`py-1.5 rounded-lg text-xs font-semibold transition ${fenceHeight === h ? 'bg-amber-500 text-white' : 'bg-steel-100 text-steel-600 hover:bg-steel-200'}`}>{h}</button>
                    ))}
                  </div>
                </div>
                {fenceType.startsWith('stay_tuff') && (
                  <div>
                    <label className="block text-xs font-medium text-steel-500 mb-1">Stay-Tuff Product</label>
                    <select title="Stay-Tuff product" value={selectedStayTuff.model}
                      onChange={e => { const o = STAY_TUFF_OPTIONS.find(x => x.model === e.target.value); if (o) setSelectedStayTuff(o); }}
                      className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500">
                      {STAY_TUFF_OPTIONS.map(o => <option key={o.model} value={o.model}>{o.model} - {o.description}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </Card>

            <Card title="Pricing Controls">
              <div className="space-y-5">
                <Slider label="Base Rate per Foot" value={baseRate} min={4} max={30} step={0.5}
                  display={`$${baseRate.toFixed(2)}/ft`} onChange={setBaseRate} minLabel="$4" maxLabel="$30" />

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-medium text-steel-500">Terrain Difficulty</label>
                    <span className="text-xs font-semibold text-steel-700">{TERRAIN_MULTIPLIERS[terrain]}x</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(TERRAIN_LABELS).map(([k, l]) => (
                      <button key={k} onClick={() => setTerrain(k)}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition text-left ${terrain === k ? 'bg-amber-100 text-amber-800 border-2 border-amber-400' : 'bg-steel-50 text-steel-600 border border-steel-200 hover:bg-steel-100'}`}>
                        {l}<span className="block text-[9px] opacity-70">{TERRAIN_MULTIPLIERS[k]}x rate</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-amber-700">Effective Rate</span>
                    <span className="text-lg font-bold text-amber-700">${effectiveRate.toFixed(2)}/ft</span>
                  </div>
                  <p className="text-[10px] text-amber-600 mt-1">${baseRate.toFixed(2)} base x {TERRAIN_MULTIPLIERS[terrain]}x terrain</p>
                </div>

                <Slider label="Deposit %" value={depositPercent} min={25} max={75} step={5}
                  display={`${depositPercent}%`} onChange={setDepositPercent} minLabel="25%" maxLabel="75%" />

                <Slider label="Timeline (working days)" value={timelineDays} min={3} max={60} step={1}
                  display={`${timelineDays} days`} onChange={setTimelineDays} minLabel="3" maxLabel="60" />
              </div>
            </Card>

            <Card title="Project Overview Text">
              <textarea value={projectOverview} onChange={e => setProjectOverview(e.target.value)} rows={3}
                className="w-full border border-steel-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500" placeholder="Describe the project scope..." />
            </Card>
          </div>

          {/* RIGHT Map Sections Preview */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-5">
            <div className="flex gap-2">
              <TabBtn active={activeTab === 'config'} onClick={() => setActiveTab('config')}>Sections &amp; Map</TabBtn>
              <TabBtn active={activeTab === 'preview'} onClick={() => setActiveTab('preview')}>Bid Preview</TabBtn>
            </div>

            {activeTab === 'config' && (
              <>
                <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-steel-200">
                    <h2 className="text-steel-800 font-semibold text-sm">Satellite Map</h2>
                    <p className="text-xs text-steel-500">Draw fence lines to auto-populate sections</p>
                  </div>
                  <FenceMap onFenceLinesChange={handleFenceLinesChange} />
                  {drawnLines.length > 0 && (
                    <div className="px-5 py-2 border-t border-steel-200 bg-steel-50 flex gap-4 text-xs text-steel-600">
                      {drawnLines.map((l, i) => <span key={l.id}>Line {i+1}: <strong>{Math.round(l.lengthFeet).toLocaleString()} ft</strong></span>)}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-steel-200 flex items-center justify-between">
                    <h2 className="text-steel-800 font-semibold text-sm">Fence Sections</h2>
                    <button onClick={addSection} className="text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg font-semibold hover:bg-amber-100 transition">+ Add Section</button>
                  </div>
                  <div className="px-5 py-2 bg-steel-50 border-b border-steel-100">
                    <div className="grid grid-cols-12 gap-3 text-[10px] font-semibold text-steel-500 uppercase tracking-wide">
                      <div className="col-span-4">Name</div>
                      <div className="col-span-2 text-right">Linear Feet</div>
                      <div className="col-span-2 text-right">Rate Override</div>
                      <div className="col-span-3 text-right">Total</div>
                      <div className="col-span-1"></div>
                    </div>
                  </div>
                  <div className="divide-y divide-steel-100">
                    {computed.map((sec, idx) => (
                      <div key={sec.id} className="px-5 py-3">
                        <div className="grid grid-cols-12 gap-3 items-center">
                          <div className="col-span-4">
                            <input type="text" value={sec.name} onChange={e => updSec(sec.id, { name: e.target.value })}
                              className="w-full border border-steel-200 rounded px-2.5 py-1.5 text-sm font-medium focus:ring-1 focus:ring-amber-500" placeholder="Section name" />
                          </div>
                          <div className="col-span-2">
                            <div className="relative">
                              <input title="Linear feet" type="number" value={sections[idx]?.linearFeet || 0} onChange={e => updSec(sec.id, { linearFeet: parseInt(e.target.value) || 0 })}
                                className="w-full border border-steel-200 rounded px-2.5 py-1.5 text-sm text-right pr-7 focus:ring-1 focus:ring-amber-500" />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-steel-400">ft</span>
                            </div>
                          </div>
                          <div className="col-span-2">
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-steel-400">$</span>
                              <input type="number" step={0.5} value={sections[idx]?.ratePerFoot || ''} onChange={e => updSec(sec.id, { ratePerFoot: parseFloat(e.target.value) || 0 })}
                                className="w-full border border-steel-200 rounded px-2.5 py-1.5 text-sm text-right pr-7 pl-5 focus:ring-1 focus:ring-amber-500" placeholder={effectiveRate.toFixed(2)} />
                            </div>
                          </div>
                          <div className="col-span-3 text-right">
                            <span className="text-sm font-bold text-steel-800">${fmt(sec.total)}</span>
                          </div>
                          <div className="col-span-1 text-right">
                            {computed.length > 1 && <button onClick={() => rmSec(sec.id)} className="text-steel-400 hover:text-red-500 transition text-lg leading-none">&#215;</button>}
                          </div>
                        </div>
                        <div className="mt-2 flex gap-1.5">
                          {(['easy','moderate','difficult','very_difficult'] as const).map(t => (
                            <button key={t} onClick={() => updSec(sec.id, { terrain: t })}
                              className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition ${sec.terrain === t ? 'bg-amber-100 text-amber-800' : 'bg-steel-50 text-steel-500 hover:bg-steel-100'}`}>
                              {t.replace('_',' ')}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-steel-200 flex items-center justify-between">
                    <h2 className="text-steel-800 font-semibold text-sm">Gates</h2>
                    <div className="flex gap-1.5 flex-wrap">
                      {GATE_PRESETS.map(gp => (
                        <button key={gp.type} onClick={() => addGate(gp)} className="text-[10px] bg-steel-50 text-steel-600 px-2 py-1 rounded font-medium hover:bg-steel-100 transition">+ {gp.type}</button>
                      ))}
                    </div>
                  </div>
                  {gates.length === 0 ? (
                    <div className="px-5 py-4 text-xs text-steel-400 text-center">No gates added yet.</div>
                  ) : (
                    <div className="divide-y divide-steel-100">
                      {gates.map(g => (
                        <div key={g.id} className="px-5 py-2.5 flex items-center gap-3">
                          <input title="Gate type" type="text" value={g.type} onChange={e => updGate(g.id, { type: e.target.value })}
                            className="flex-1 border border-steel-200 rounded px-2.5 py-1.5 text-sm focus:ring-1 focus:ring-amber-500" />
                          <div className="relative w-28">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-steel-400">$</span>
                            <input title="Gate cost" type="number" value={g.cost} onChange={e => updGate(g.id, { cost: parseFloat(e.target.value) || 0 })}
                              className="w-full border border-steel-200 rounded px-2.5 py-1.5 text-sm text-right pl-5 focus:ring-1 focus:ring-amber-500" />
                          </div>
                          <button onClick={() => rmGate(g.id)} className="text-steel-400 hover:text-red-500 transition text-lg leading-none">&#215;</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'preview' && (
              <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-steel-200 bg-steel-800 text-white">
                  <h2 className="text-xl font-bold">HAYDEN RANCH SERVICES</h2>
                  <p className="text-xs text-steel-300 mt-1">5900 Balcones Dr #26922, Austin, TX 78731 &#8226; (830) 777-9111 &#8226; office@haydenclaim.com</p>
                </div>
                <div className="p-6 space-y-6">
                  <div className="text-center">
                    <h3 className="text-lg font-bold text-steel-800 uppercase">{FENCE_TYPE_LABELS[fenceType]} Installation Proposal</h3>
                    <p className="text-sm text-steel-500 mt-1">Prepared for: <strong>{clientName || '___________'}</strong>{address && <span> &#8226; {address}</span>}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-steel-700 mb-2 uppercase tracking-wide">Investment Summary</h4>
                    <table className="w-full text-sm">
                      <thead><tr className="bg-steel-800 text-white">
                        <th className="text-left px-3 py-2 font-medium">Section</th>
                        <th className="text-right px-3 py-2 font-medium">Linear Feet</th>
                        <th className="text-right px-3 py-2 font-medium">Rate</th>
                        <th className="text-right px-3 py-2 font-medium">Total</th>
                      </tr></thead>
                      <tbody>
                        {computed.map((sec, i) => (
                          <tr key={sec.id} className={i % 2 === 0 ? 'bg-steel-50' : ''}>
                            <td className="px-3 py-2">{sec.name}</td>
                            <td className="px-3 py-2 text-right">{sec.linearFeet.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right text-steel-500">${sec.ratePerFoot.toFixed(2)}/ft</td>
                            <td className="px-3 py-2 text-right font-semibold">${fmt(sec.total)}</td>
                          </tr>
                        ))}
                        {gates.map(g => (
                          <tr key={g.id} className="bg-steel-50">
                            <td className="px-3 py-2">{g.type}</td>
                            <td className="px-3 py-2 text-right text-steel-400">&#8212;</td>
                            <td className="px-3 py-2 text-right text-steel-400">&#8212;</td>
                            <td className="px-3 py-2 text-right font-semibold">${fmt(g.cost)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot><tr className="border-t-2 border-steel-300">
                        <td className="px-3 py-2 font-bold">Total: {totalFeet.toLocaleString()} ft</td><td></td>
                        <td className="px-3 py-2 text-right font-bold text-lg" colSpan={2}>${fmt(projTotal)}</td>
                      </tr></tfoot>
                    </table>
                  </div>

                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                    <h4 className="text-sm font-bold text-amber-800 mb-2 uppercase tracking-wide">Payment Schedule</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span>Deposit ({depositPercent}% - due at signing)</span><span className="font-semibold">${fmt(deposit)}</span></div>
                      <div className="flex justify-between"><span>Balance (due at completion)</span><span className="font-semibold">${fmt(balance)}</span></div>
                      <div className="flex justify-between border-t border-amber-300 pt-1 mt-1"><span className="font-bold">Project Total</span><span className="font-bold text-lg">${fmt(projTotal)}</span></div>
                    </div>
                  </div>

                  <div className="text-sm text-steel-600">
                    <strong>Estimated Timeline:</strong> {timelineDays} to {timelineDays + Math.ceil(timelineDays * 0.25)} working days
                  </div>

                  <button onClick={handleDownloadPDF}
                    className="w-full bg-amber-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-amber-700 transition text-sm flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                    Download Complete Bid PDF (with Terms &amp; Signature Block)
                  </button>
                </div>
              </div>
            )}

            <div className="bg-steel-800 rounded-xl p-5 text-white shadow-lg sticky bottom-4">
              <div className="grid grid-cols-5 gap-4 text-center">
                <div><p className="text-[10px] text-steel-400 uppercase tracking-wide">Sections</p><p className="text-lg font-bold">{computed.length}</p></div>
                <div><p className="text-[10px] text-steel-400 uppercase tracking-wide">Total Feet</p><p className="text-lg font-bold">{totalFeet.toLocaleString()}</p></div>
                <div><p className="text-[10px] text-steel-400 uppercase tracking-wide">Eff. Rate</p><p className="text-lg font-bold">${effectiveRate.toFixed(2)}/ft</p></div>
                <div><p className="text-[10px] text-steel-400 uppercase tracking-wide">Gates</p><p className="text-lg font-bold">{gates.length} (${fmt(gateTotal)})</p></div>
                <div><p className="text-[10px] text-amber-400 uppercase tracking-wide font-semibold">Project Total</p><p className="text-2xl font-bold text-amber-400">${fmt(projTotal)}</p></div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Reusable sub-components

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-steel-200 p-5 shadow-sm">
      <h2 className="text-steel-800 font-semibold text-base mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <input type="text" value={value} onChange={e => onChange(e.target.value)}
    className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" placeholder={placeholder} />;
}

function Slider({ label, value, min, max, step, display, onChange, minLabel, maxLabel }: {
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

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${active ? 'bg-amber-600 text-white' : 'bg-white text-steel-600 border border-steel-200 hover:bg-steel-50'}`}>
      {children}
    </button>
  );
}