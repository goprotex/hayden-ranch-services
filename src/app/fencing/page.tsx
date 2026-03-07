'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import {
  calculateFenceMaterials,
  calculateLaborEstimate,
  STAY_TUFF_OPTIONS,
} from '@/lib/fencing/fence-calculator';
import {
  FenceType,
  FenceHeight,
  FenceLine,
  FenceSegment,
  GeoPoint,
  FenceBid,
  StayTuffOption,
  FenceMaterialList,
  LaborEstimate,
} from '@/types';

const FENCE_TYPES: { value: FenceType; label: string }[] = [
  { value: 'stay_tuff_fixed_knot', label: 'Stay Tuff - Fixed Knot' },
  { value: 'stay_tuff_hinge_joint', label: 'Stay Tuff - Hinge Joint' },
  { value: 'field_fence', label: 'Field Fence' },
  { value: 'barbed_wire', label: 'Barbed Wire' },
  { value: 'no_climb', label: 'No-Climb Horse Fence' },
  { value: 'pipe_fence', label: 'Pipe Fence' },
  { value: 't_post_wire', label: 'T-Post & Wire' },
];

const FENCE_HEIGHTS: FenceHeight[] = ['4ft', '5ft', '6ft', '7ft', '8ft'];

export default function FencingPage() {
  const { addFenceBid } = useAppStore();

  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [fenceType, setFenceType] = useState<FenceType>('stay_tuff_fixed_knot');
  const [fenceHeight, setFenceHeight] = useState<FenceHeight>('5ft');
  const [selectedStayTuff, setSelectedStayTuff] = useState<StayTuffOption>(STAY_TUFF_OPTIONS[0]);
  const [totalLengthInput, setTotalLengthInput] = useState('');
  const [materials, setMaterials] = useState<FenceMaterialList | null>(null);
  const [labor, setLabor] = useState<LaborEstimate | null>(null);

  const handleCalculate = useCallback(() => {
    const totalLength = parseFloat(totalLengthInput) || 1000;

    // Create a simple straight-line fence
    const fenceLine: FenceLine = {
      id: 'fl_1',
      points: [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.001 },
      ],
      totalLengthFeet: totalLength,
      segments: [
        {
          id: 'seg_1',
          start: { lat: 0, lng: 0 },
          end: { lat: 0, lng: 0.001 },
          lengthFeet: totalLength,
          elevationChangeFeet: 0,
          slope: 0,
          terrainDifficulty: 'moderate',
        },
      ],
    };

    const stayTuff = fenceType.startsWith('stay_tuff') ? selectedStayTuff : undefined;
    const mats = calculateFenceMaterials([fenceLine], fenceType, fenceHeight, stayTuff);
    const lab = calculateLaborEstimate([fenceLine], fenceHeight);

    setMaterials(mats);
    setLabor(lab);
  }, [totalLengthInput, fenceType, fenceHeight, selectedStayTuff]);

  const handleSaveBid = useCallback(() => {
    if (!materials || !labor) return;

    const bid: FenceBid = {
      id: `fb_${Date.now()}`,
      projectName: projectName || 'Untitled Fence Project',
      clientName,
      address,
      fenceLines: [],
      fenceType,
      fenceHeight,
      stayTuffOption: fenceType.startsWith('stay_tuff') ? selectedStayTuff : undefined,
      materials,
      laborEstimate: labor,
      totalCost: labor.totalLaborCost, // Will add material costs when pricing is connected
      createdAt: new Date().toISOString(),
    };

    addFenceBid(bid);
    alert('Bid saved!');
  }, [materials, labor, projectName, clientName, address, fenceType, fenceHeight, selectedStayTuff, addFenceBid]);

  return (
    <div className="min-h-screen bg-steel-50">
      <header className="bg-white border-b border-steel-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-steel-400 hover:text-steel-600 transition">
              ← Back
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
                </svg>
              </div>
              <h1 className="text-steel-800 font-bold text-lg">Fencing Bid Tool</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left - Configuration */}
          <div className="space-y-6">
            {/* Project Info */}
            <div className="bg-white rounded-xl border border-steel-200 p-6 shadow-sm">
              <h2 className="text-steel-800 font-semibold text-lg mb-4">Project Info</h2>
              <div className="space-y-3">
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500"
                  placeholder="Project Name"
                />
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500"
                  placeholder="Client Name"
                />
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500"
                  placeholder="Property Address"
                />
              </div>
            </div>

            {/* Fence Type */}
            <div className="bg-white rounded-xl border border-steel-200 p-6 shadow-sm">
              <h2 className="text-steel-800 font-semibold text-lg mb-4">Fence Configuration</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-steel-600 mb-1">
                    Fence Type
                  </label>
                  <select
                    value={fenceType}
                    onChange={(e) => setFenceType(e.target.value as FenceType)}
                    className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500"
                  >
                    {FENCE_TYPES.map((ft) => (
                      <option key={ft.value} value={ft.value}>
                        {ft.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-steel-600 mb-1">
                    Height
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {FENCE_HEIGHTS.map((h) => (
                      <button
                        key={h}
                        onClick={() => setFenceHeight(h)}
                        className={`py-2 rounded-lg text-sm font-medium transition ${
                          fenceHeight === h
                            ? 'bg-amber-500 text-white'
                            : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
                        }`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stay Tuff options */}
                {fenceType.startsWith('stay_tuff') && (
                  <div>
                    <label className="block text-sm font-medium text-steel-600 mb-2">
                      Stay Tuff Product
                    </label>
                    <div className="space-y-2">
                      {STAY_TUFF_OPTIONS.map((opt) => (
                        <label
                          key={opt.model}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                            selectedStayTuff.model === opt.model
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-steel-200 hover:border-steel-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="staytuff"
                            checked={selectedStayTuff.model === opt.model}
                            onChange={() => setSelectedStayTuff(opt)}
                            className="mt-0.5 text-amber-600"
                          />
                          <div>
                            <p className="text-sm font-medium text-steel-700">{opt.model}</p>
                            <p className="text-xs text-steel-500">{opt.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-steel-600 mb-1">
                    Total Fence Length (feet)
                  </label>
                  <input
                    type="number"
                    value={totalLengthInput}
                    onChange={(e) => setTotalLengthInput(e.target.value)}
                    className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500"
                    placeholder="e.g. 2640 (half mile)"
                  />
                  <p className="text-xs text-steel-400 mt-1">
                    Tip: 5280 ft = 1 mile, 2640 ft = ½ mile
                  </p>
                </div>

                <button
                  onClick={handleCalculate}
                  className="w-full bg-amber-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-amber-700 transition"
                >
                  Calculate Materials
                </button>
              </div>
            </div>
          </div>

          {/* Center + Right - Map & Results */}
          <div className="lg:col-span-2 space-y-6">
            {/* Map placeholder */}
            <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-steel-200">
                <h2 className="text-steel-800 font-semibold">Satellite Map</h2>
                <p className="text-sm text-steel-500">
                  Draw fence lines on the map (requires Mapbox token in .env.local)
                </p>
              </div>
              <div className="bg-steel-100 flex items-center justify-center" style={{ height: '400px' }}>
                <div className="text-center">
                  <svg className="w-16 h-16 text-steel-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
                  </svg>
                  <p className="text-steel-400 text-sm font-medium">Satellite Map with Drawing Tools</p>
                  <p className="text-steel-400 text-xs mt-1">
                    Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local to enable
                  </p>
                  <p className="text-steel-400 text-xs mt-1">
                    Features: Draw fence lines, soil overlay, elevation profile
                  </p>
                </div>
              </div>
            </div>

            {/* Material List */}
            {materials && (
              <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-steel-200 flex justify-between items-center">
                  <h2 className="text-steel-800 font-semibold">Material List</h2>
                  <button
                    onClick={handleSaveBid}
                    className="bg-amber-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-amber-700 transition"
                  >
                    Save Bid
                  </button>
                </div>

                <div className="divide-y divide-steel-100">
                  {/* Posts */}
                  <div className="px-6 py-4">
                    <h3 className="text-sm font-semibold text-steel-600 mb-3">Posts</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                      <div className="bg-steel-50 rounded-lg p-3">
                        <p className="text-steel-500 text-xs">Corner Posts</p>
                        <p className="font-bold text-steel-800">{materials.cornerPosts.quantity}</p>
                        <p className="text-steel-400 text-xs">{materials.cornerPosts.lengthFeet}&apos; {materials.cornerPosts.type}</p>
                      </div>
                      <div className="bg-steel-50 rounded-lg p-3">
                        <p className="text-steel-500 text-xs">Line Posts</p>
                        <p className="font-bold text-steel-800">{materials.linePosts.quantity}</p>
                        <p className="text-steel-400 text-xs">{materials.linePosts.lengthFeet}&apos; @ {materials.linePosts.spacingFeet}&apos; spacing</p>
                      </div>
                      <div className="bg-steel-50 rounded-lg p-3">
                        <p className="text-steel-500 text-xs">T-Posts</p>
                        <p className="font-bold text-steel-800">{materials.tPosts.quantity}</p>
                        <p className="text-steel-400 text-xs">{materials.tPosts.lengthFeet}&apos;</p>
                      </div>
                    </div>
                  </div>

                  {/* Bracing & Hardware */}
                  <div className="px-6 py-4">
                    <h3 className="text-sm font-semibold text-steel-600 mb-3">Bracing &amp; Hardware</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div className="bg-steel-50 rounded-lg p-3">
                        <p className="text-steel-500 text-xs">Brace Assemblies</p>
                        <p className="font-bold text-steel-800">{materials.bracingAssemblies.quantity}</p>
                      </div>
                      <div className="bg-steel-50 rounded-lg p-3">
                        <p className="text-steel-500 text-xs">Clips</p>
                        <p className="font-bold text-steel-800">{materials.clips.quantity}</p>
                      </div>
                      <div className="bg-steel-50 rounded-lg p-3">
                        <p className="text-steel-500 text-xs">Tensioners</p>
                        <p className="font-bold text-steel-800">{materials.tensioners.quantity}</p>
                      </div>
                      <div className="bg-steel-50 rounded-lg p-3">
                        <p className="text-steel-500 text-xs">Concrete (80lb bags)</p>
                        <p className="font-bold text-steel-800">{materials.concrete.bags}</p>
                      </div>
                    </div>
                  </div>

                  {/* Wire */}
                  <div className="px-6 py-4">
                    <h3 className="text-sm font-semibold text-steel-600 mb-3">Wire &amp; Fencing</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-steel-50 rounded-lg p-3">
                        <p className="text-steel-500 text-xs">{materials.wire.type}</p>
                        <p className="font-bold text-steel-800">{materials.wire.rolls} rolls</p>
                        <p className="text-steel-400 text-xs">{materials.wire.feetPerRoll}&apos; per roll</p>
                      </div>
                      <div className="bg-steel-50 rounded-lg p-3">
                        <p className="text-steel-500 text-xs">Barbed Wire</p>
                        <p className="font-bold text-steel-800">{materials.barbedWire.rolls} rolls</p>
                        <p className="text-steel-400 text-xs">{materials.barbedWire.strands} strands</p>
                      </div>
                    </div>
                  </div>

                  {/* Staples */}
                  <div className="px-6 py-4">
                    <h3 className="text-sm font-semibold text-steel-600 mb-3">Staples</h3>
                    <p className="text-sm text-steel-700">{materials.staples.pounds} lbs of fence staples</p>
                  </div>
                </div>
              </div>
            )}

            {/* Labor Estimate */}
            {labor && (
              <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-steel-200">
                  <h2 className="text-steel-800 font-semibold">Labor Estimate</h2>
                </div>
                <div className="px-6 py-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-steel-500">Crew Size</p>
                      <p className="font-bold text-steel-800 text-lg">{labor.crewSize}</p>
                    </div>
                    <div>
                      <p className="text-steel-500">Est. Days</p>
                      <p className="font-bold text-steel-800 text-lg">{labor.days}</p>
                    </div>
                    <div>
                      <p className="text-steel-500">Total Hours</p>
                      <p className="font-bold text-steel-800 text-lg">{labor.totalHours}</p>
                    </div>
                    <div>
                      <p className="text-steel-500">Labor Cost</p>
                      <p className="font-bold text-amber-600 text-lg">
                        ${labor.totalLaborCost.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-steel-400 mt-3">
                    Based on ${labor.hourlyRate}/hr × {labor.difficultyMultiplier}x terrain multiplier
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
