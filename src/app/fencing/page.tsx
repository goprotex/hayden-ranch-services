'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { STAY_TUFF_OPTIONS } from '@/lib/fencing/fence-calculator';
import {
  POST_MATERIALS, BRACE_SPECS, GATE_SPECS, DEFAULT_MATERIAL_PRICES,
  SQUARE_TUBE_GAUGES,
  determineBraceType, estimatePainting, calculateVertexAngle,
  recommendedTPostLength, wireRollPriceId, postJointPriceId, calculatePostLength,
  type PostMaterial, type SquareTubeGauge, type BraceType, type GateSize, type GateSpec, type BraceRecommendation,
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

/** Derive FenceHeight string from wire height inches (for backward compat) */
function heightFromInches(inches: number): FenceHeight {
  const ft = Math.round(inches / 12);
  if (ft <= 4) return '4ft';
  if (ft <= 5) return '5ft';
  if (ft <= 6) return '6ft';
  if (ft <= 7) return '7ft';
  return '8ft';
}

export default function FencingPage() {
  const { addFenceBid, materialPrices, updateMaterialPrice, resetMaterialPrices, priceDatabase, syncReceiptPrices } = useAppStore();

  // Project info
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');

  // Fence config
  const [fenceType, setFenceType] = useState<FenceType>('stay_tuff_fixed_knot');
  const [selectedStayTuff, setSelectedStayTuff] = useState<StayTuffOption>(STAY_TUFF_OPTIONS[0]);
  const [postMaterial, setPostMaterial] = useState<PostMaterial>('drill_stem');
  const [squareTubeGauge, setSquareTubeGauge] = useState<SquareTubeGauge>('14ga');
  // Height for non-Stay-Tuff fences (manual)
  const [manualHeight, setManualHeight] = useState<FenceHeight>('5ft');

  // Derived: use Stay-Tuff height when applicable, otherwise manual height
  const wireHeightInches = useMemo(() => {
    if (fenceType.startsWith('stay_tuff')) return selectedStayTuff.height;
    const map: Record<FenceHeight, number> = { '4ft': 48, '5ft': 60, '6ft': 72, '7ft': 84, '8ft': 96 };
    return map[manualHeight] || 60;
  }, [fenceType, selectedStayTuff, manualHeight]);

  const fenceHeight: FenceHeight = useMemo(() => heightFromInches(wireHeightInches), [wireHeightInches]);

  // Auto t-post sizing from wire height
  const tPostRec = useMemo(() => recommendedTPostLength(wireHeightInches), [wireHeightInches]);

  // Spacing
  const [linePostSpacing, setLinePostSpacing] = useState(66); // ft
  const [tPostSpacing, setTPostSpacing] = useState(10); // ft

  // Bracing preferences
  const [preferredHBrace, setPreferredHBrace] = useState<BraceType>('h_brace');
  const [preferredCornerBrace, setPreferredCornerBrace] = useState<BraceType>('corner_brace');

  // Pricing
  const [laborRate, setLaborRate] = useState(6); // $/ft labor only
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

  // AI-generated site analysis narrative (Claude/GPT)
  const [aiNarrative, setAiNarrative] = useState<string | null>(null);
  const [generatingNarrative, setGeneratingNarrative] = useState(false);

  // Map captures for PDF (supports multiple screenshots)
  const [mapImages, setMapImages] = useState<string[]>([]);

  // UI
  const [activeTab, setActiveTab] = useState<'config' | 'preview' | 'pricing'>('config');
  const [receiptSyncResult, setReceiptSyncResult] = useState<{ matched: number; updated: number } | null>(null);
  const [projectOverview, setProjectOverview] = useState(
    'Professional installation of high tensile fence with drill stem bracing system. All materials are commercial grade with concrete setting for structural posts.'
  );
  const handleFenceLinesChange = useCallback((lines: DrawnLine[]) => {
    setDrawnLines(lines);
    const allAngles = lines.flatMap(l => l.vertexAngles);
    setVertexAngles(allAngles);
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
    if (analysis.confidence > 0.4) setTerrain(analysis.suggestedDifficulty);
  }, []);

  // Generate AI site analysis when terrain data arrives
  useEffect(() => {
    if (!terrainSuggestion?.soilType) return;
    let cancelled = false;
    setGeneratingNarrative(true);
    (async () => {
      try {
        const res = await fetch('/api/site-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            propertyAddress: address,
            soilType: terrainSuggestion.soilType,
            soilComponents: terrainSuggestion.components || [],
            drainage: terrainSuggestion.drainage,
            hydric: terrainSuggestion.hydric,
            elevationChange: terrainSuggestion.elevationChange,
            suggestedDifficulty: terrainSuggestion.suggestedDifficulty,
            fenceType: FENCE_TYPES[fenceType] || fenceType,
            fenceHeight,
            totalLinearFeet: sections.reduce((s, c) => s + c.linearFeet, 0) || 1000,
            postMaterial,
            source: terrainSuggestion.source,
            // Enriched SDA data
            bedrockDepthIn: terrainSuggestion.bedrockDepthIn,
            restrictionType: terrainSuggestion.restrictionType,
            slopeRange: terrainSuggestion.slopeRange,
            runoff: terrainSuggestion.runoff,
            taxonomy: terrainSuggestion.taxonomy,
            texture: terrainSuggestion.texture,
            clayPct: terrainSuggestion.clayPct,
            rockFragmentPct: terrainSuggestion.rockFragmentPct,
            pH: terrainSuggestion.pH,
          }),
        });
        const data = await res.json();
        if (!cancelled && data.narrative) {
          setAiNarrative(data.narrative);
        }
      } catch (err) {
        console.error('AI narrative error:', err);
      } finally {
        if (!cancelled) setGeneratingNarrative(false);
      }
    })();
    return () => { cancelled = true; };
    // Only regenerate when terrain analysis changes (not on every keystroke)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrainSuggestion]);

  const terrainMult = TERRAIN_MAP[terrain]?.mult || 1;

  // === Material cost per foot ===
  // Soil difficulty affects concrete requirements and hardware costs
  const soilMultiplier = useMemo(() => {
    if (!terrainSuggestion?.soilType) return 1.0;
    const difficulty = terrainSuggestion.suggestedDifficulty;
    // Harder soil = more concrete per hole, potential augering costs
    if (difficulty === 'very_difficult') return 1.5;
    if (difficulty === 'difficult') return 1.25;
    if (difficulty === 'moderate') return 1.1;
    return 1.0;
  }, [terrainSuggestion]);

  const materialCostPerFoot = useMemo(() => {
    const findPrice = (id: string) => materialPrices.find(m => m.id === id)?.price ?? 0;

    // Wire cost per foot (varies by product height for Stay-Tuff)
    let wireCostPerFt = 0;
    if (fenceType.startsWith('stay_tuff')) {
      const rollId = wireRollPriceId(selectedStayTuff.height);
      wireCostPerFt = findPrice(rollId) / 330;
    } else if (fenceType === 'field_fence') {
      wireCostPerFt = findPrice('field_fence_roll') / 330;
    } else if (fenceType === 'barbed_wire') {
      wireCostPerFt = (findPrice('barbed_wire') / 1320) * 4;
    } else if (fenceType === 'no_climb') {
      wireCostPerFt = findPrice('no_climb_roll') / 200;
    } else {
      wireCostPerFt = findPrice('field_fence_roll') / 330;
    }
    wireCostPerFt *= 1.10; // 10% overlap

    // Top wire
    let topWireCostPerFt = 0;
    if (fenceType !== 'barbed_wire') {
      const strands = wireHeightInches >= 72 ? 2 : 1;
      topWireCostPerFt = (findPrice('ht_smooth') / 4000) * strands;
    }

    // T-Post cost per foot (auto-sized)
    const tPostPrice = findPrice(tPostRec.priceId);
    const tPostCostPerFt = tPostPrice / tPostSpacing;

    // Line post cost per foot (joint-based)
    const postPriceId = postJointPriceId(postMaterial, squareTubeGauge);
    const jointPrice = findPrice(postPriceId);
    const jointLen = postMaterial === 'drill_stem' ? 31 : 20;
    const postCalc = calculatePostLength(wireHeightInches);
    const postsPerJoint = postMaterial === 'drill_stem' ? postCalc.postsPerDrillStemJoint : postCalc.postsPerSquareTubeJoint;
    const pricePerPost = postsPerJoint > 0 ? jointPrice / postsPerJoint : jointPrice;
    const linePostCostPerFt = pricePerPost / linePostSpacing;

    // Concrete per foot (2 bags per line post, adjusted for soil difficulty)
    const concreteCostPerFt = (findPrice('concrete_bag') * 2 * soilMultiplier) / linePostSpacing;

    // Hardware per foot
    const clipsCostPerFt = (findPrice('clips') / 500) * (4 / tPostSpacing);
    const tensionerCostPerFt = findPrice('tensioner') / 330;
    const braceWireCostPerFt = findPrice('brace_wire') / 200;
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
  }, [fenceType, wireHeightInches, selectedStayTuff, tPostRec, tPostSpacing, linePostSpacing, postMaterial, squareTubeGauge, materialPrices, soilMultiplier]);

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
    setGates(p => [...p, {
      id: uid(), type: spec.label, width: spec.widthFeet,
      cost: spec.defaultPrice + spec.defaultInstallCost,
    }]);
  }, []);
  const updGate = useCallback((id: string, u: Partial<BidGate>) => { setGates(p => p.map(g => g.id === id ? { ...g, ...u } : g)); }, []);
  const rmGate = useCallback((id: string) => { setGates(p => p.filter(g => g.id !== id)); }, []);
  /** Build a layman-friendly soil/terrain narrative for the PDF bid */
  const buildSoilNarrative = useCallback((): string | undefined => {
    if (!terrainSuggestion) return undefined;
    const parts: string[] = [];

    // Soil explanation
    if (terrainSuggestion.soilType) {
      parts.push(
        `Our research of your property using the ${terrainSuggestion.source === 'UC_Davis_SoilWeb' ? 'UC Davis SoilWeb database (USDA NRCS data)' : 'USDA Natural Resources Conservation Service (NRCS) Web Soil Survey'} identified the primary soil type on your property as "${terrainSuggestion.soilType}."`,
      );

      // Texture + rock fragment data (most useful for customers)
      if (terrainSuggestion.texture) {
        parts.push(`The top soil horizon is classified as "${terrainSuggestion.texture}"${terrainSuggestion.rockFragmentPct ? `, with approximately ${terrainSuggestion.rockFragmentPct}% coarse rock fragments (cobbles and stones) in the soil matrix` : ''}.`);
      }

      // Bedrock depth — THE most critical finding for fencing
      if (terrainSuggestion.bedrockDepthIn != null) {
        const depth = terrainSuggestion.bedrockDepthIn;
        const ft = Math.floor(depth / 12);
        const inches = depth % 12;
        const depthStr = ft > 0 ? `${ft}' ${inches > 0 ? inches + '"' : ''}` : `${depth}"`;
        if (depth <= 18) {
          parts.push(`USDA data indicates ${terrainSuggestion.restrictionType || 'bedrock'} at approximately ${depthStr} below grade. This is extremely shallow — a standard fence post is set 30-36 inches deep. Our crew will bring hydraulic rock drilling equipment to bore into bedrock for every post hole, ensuring each post is anchored securely into the rock shelf itself.`);
        } else if (depth <= 30) {
          parts.push(`USDA data indicates ${terrainSuggestion.restrictionType || 'bedrock'} at approximately ${depthStr} below grade. This is shallow for fence post installation (standard depth is 30-36"). Many post holes will bottom out on rock, requiring our crew to bring rock drilling equipment. We have accounted for this in our pricing and timeline.`);
        } else if (depth <= 48) {
          parts.push(`USDA data indicates ${terrainSuggestion.restrictionType || 'bedrock'} at approximately ${depthStr} below grade. Some deeper post holes may encounter rock, and our crew will have drilling equipment on-site as a precaution.`);
        }
      }

      // Explain what the soil means in plain English
      const soil = terrainSuggestion.soilType.toLowerCase();
      if (!terrainSuggestion.bedrockDepthIn && (soil.includes('rock') || soil.includes('outcrop') || soil.includes('limestone') || soil.includes('caliche'))) {
        parts.push('This soil type contains significant rock or limestone. Post holes will require a hydraulic breaker or core drill in some areas, which we have accounted for in our pricing.');
      } else if (terrainSuggestion.clayPct != null && terrainSuggestion.clayPct >= 35) {
        parts.push(`With ${terrainSuggestion.clayPct}% clay content, this soil will expand and contract with moisture changes. We compensate by setting posts deeper with additional concrete to prevent seasonal shifting.`);
      } else if (soil.includes('clay') || soil.includes('vertisol')) {
        parts.push('Clay soils expand and contract with moisture changes. We compensate for this by setting posts deeper with additional concrete to prevent frost heave and shifting.');
      } else if (soil.includes('sand') || soil.includes('loam')) {
        parts.push('Sandy or loam soils provide good drainage but require deeper post settings and more concrete per post to ensure structural stability.');
      } else if (!terrainSuggestion.texture) {
        parts.push('We have selected post depths and concrete quantities appropriate for your soil conditions to ensure a long-lasting, stable installation.');
      }
    }

    // Drainage info
    if (terrainSuggestion.drainage) {
      const drain = terrainSuggestion.drainage.toLowerCase();
      if (drain.includes('well')) {
        parts.push(`Your soil has "${terrainSuggestion.drainage}" drainage${terrainSuggestion.runoff ? ` with ${terrainSuggestion.runoff.toLowerCase()} surface runoff` : ''}. This is favorable for concrete curing and long-term post stability.`);
      } else if (drain.includes('poor') || drain.includes('somewhat')) {
        parts.push(`Your soil has "${terrainSuggestion.drainage}" drainage. We account for wet-area conditions in post settings, using additional concrete and deeper depths where needed.`);
      }
    }

    // pH
    if (terrainSuggestion.pH != null) {
      if (terrainSuggestion.pH >= 7.5) {
        parts.push(`Soil pH is ${terrainSuggestion.pH} (alkaline), which is favorable for the longevity of metal fence posts.`);
      } else if (terrainSuggestion.pH <= 5.5) {
        parts.push(`Soil pH is ${terrainSuggestion.pH} (acidic). We recommend monitoring post condition over time, as acidic soils can gradually affect metal posts over many years.`);
      }
    }

    // Hydric indicator
    if (terrainSuggestion.hydric && terrainSuggestion.hydric.toLowerCase() === 'yes') {
      parts.push('Note: Portions of the property contain hydric (wetland-indicator) soils. We may need to adjust post locations in low-lying areas to avoid standing water and ensure structural integrity.');
    }

    // Elevation / terrain
    if (terrainSuggestion.elevationChange > 0) {
      const elev = Math.round(terrainSuggestion.elevationChange);
      if (elev > 50) {
        parts.push(`The fence line crosses approximately ${elev} feet of elevation change${terrainSuggestion.slopeRange ? ` (USDA slope range: ${terrainSuggestion.slopeRange})` : ''}. Steep terrain requires closer post spacing to maintain proper wire tension on slopes. Bracing assemblies are reinforced at grade changes to handle the additional pull of gravity on the wire.`);
      } else if (elev > 15) {
        parts.push(`The fence line crosses approximately ${elev} feet of elevation change${terrainSuggestion.slopeRange ? ` (USDA slope range: ${terrainSuggestion.slopeRange})` : ''}. We have incorporated slightly closer post spacing to maintain wire tension.`);
      } else {
        parts.push(`Your fence line is relatively level with only about ${elev} feet of elevation change, which is ideal for efficient installation and consistent wire tension.`);
      }
    }

    // Terrain difficulty summary
    const diffLabel = TERRAIN_MAP[terrainSuggestion.suggestedDifficulty]?.label || terrainSuggestion.suggestedDifficulty;
    parts.push(`Based on our analysis, we have classified this project as "${diffLabel}" terrain difficulty. All material quantities, post spacing, concrete requirements, and labor estimates in this proposal reflect this assessment.`);

    return parts.length > 0 ? parts.join(' ') : undefined;
  }, [terrainSuggestion]);

  const handleDownloadPDF = useCallback(() => {
    const now = new Date();
    const valid = new Date(now); valid.setDate(valid.getDate() + 30);
    const ftLabel = FENCE_TYPES[fenceType] || fenceType;
    const stModel = fenceType.startsWith('stay_tuff') ? selectedStayTuff.model : undefined;
    const secs = computed.map(sec => ({
      ...sec, materials: calculateSectionMaterials(
        sec.linearFeet, ftLabel, fenceHeight, stModel,
        sec.terrain || terrain, postMaterial, squareTubeGauge, tPostSpacing, linePostSpacing,
      ),
    }));
    const data: FenceBidData = {
      projectName: projectName || 'Fence Installation', clientName: clientName || 'Customer',
      propertyAddress: address, date: fmtDate(now), validUntil: fmtDate(valid),
      fenceType: ftLabel, fenceHeight, stayTuffModel: stModel,
      stayTuffDescription: stModel ? selectedStayTuff.description : undefined,
      wireHeightInches,
      postMaterial, squareTubeGauge, tPostSpacing, linePostSpacing,
      sections: secs, gates, projectTotal: projTotal, depositPercent, depositAmount: deposit,
      balanceAmount: balance, timelineWeeks: Math.ceil(timelineDays / 5), workingDays: timelineDays,
      projectOverview: projectOverview + (address ? ` Site located at ${address}.` : ''),
      terrainDescription: TERRAIN_MAP[terrain]?.label || terrain,
      soilNarrative: aiNarrative || buildSoilNarrative(),
      mapImages: mapImages.length > 0 ? mapImages : undefined,
    };
    generateFenceBidPDF(data);
  }, [computed, gates, projectName, clientName, address, fenceType, fenceHeight, selectedStayTuff, terrain, depositPercent, deposit, balance, projTotal, timelineDays, projectOverview, wireHeightInches, buildSoilNarrative, mapImages, postMaterial, squareTubeGauge, tPostSpacing, linePostSpacing, aiNarrative]);

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
            <Link href="/" className="text-steel-400 hover:text-amber-400 transition text-sm">&larr; Back</Link>
            <h1 className="text-steel-100 font-bold text-lg">&#x26a1; Fence Bid Creator</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSaveBid} className="text-sm glass text-steel-300 px-4 py-2 rounded-lg hover:text-white transition font-medium">Save Bid</button>
            {mapImages.length > 0 && (
              <span className="flex items-center gap-1.5 text-[10px]">
                <span className="text-green-400">&#x2713; {mapImages.length} map{mapImages.length > 1 ? 's' : ''} captured</span>
                <button onClick={() => setMapImages([])} className="text-red-400 hover:text-red-300 underline">clear</button>
              </span>
            )}
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

            <Card title="Project Info" icon="&#x1f4dd;">
              <div className="space-y-2.5">
                <DInput value={projectName} onChange={setProjectName} placeholder="Project Name" />
                <DInput value={clientName} onChange={setClientName} placeholder="Client Name" />
                <DInput value={address} onChange={setAddress} placeholder="Property Address" />
              </div>
            </Card>

            <Card title="Fence Type" icon="&#x1f9f1;">
              <div className="space-y-3">
                <select title="Fence type" value={fenceType} onChange={e => setFenceType(e.target.value as FenceType)}
                  className="w-full bg-surface-200 border border-steel-700/30 rounded-lg px-3 py-2 text-sm text-steel-200 focus:ring-2 focus:ring-amber-500/50">
                  {Object.entries(FENCE_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>

                {/* Height selector: only for non-Stay-Tuff fences */}
                {!fenceType.startsWith('stay_tuff') && (
                  <div>
                    <label className="block text-xs font-medium text-steel-400 mb-1.5">Height</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {(['4ft','5ft','6ft','7ft','8ft'] as FenceHeight[]).map(h => (
                        <button key={h} onClick={() => setManualHeight(h)}
                          className={`py-1.5 rounded-lg text-xs font-semibold transition ${manualHeight === h ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30' : 'bg-surface-200 text-steel-400 hover:bg-surface-50 hover:text-steel-200'}`}>{h}</button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-steel-400 mb-1.5">Post Material</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {POST_MATERIALS.map(pm => (
                      <button key={pm.id} onClick={() => setPostMaterial(pm.id)}
                        className={`py-2 px-2 rounded-lg text-[11px] font-medium transition text-left ${postMaterial === pm.id ? 'bg-amber-600/20 text-amber-300 border border-amber-500/50' : 'bg-surface-200 text-steel-400 border border-steel-700/20 hover:bg-surface-50'}`}>
                        {pm.label}<span className="block text-[9px] opacity-70">{pm.diameter} &mdash; {pm.jointLengthFeet}ft joints</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Square tube gauge selector */}
                {postMaterial === 'square_tube' && (
                  <div>
                    <label className="block text-xs font-medium text-steel-400 mb-1.5">Tube Gauge</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {SQUARE_TUBE_GAUGES.map(g => (
                        <button key={g.gauge} onClick={() => setSquareTubeGauge(g.gauge)}
                          className={`py-1.5 px-2 rounded-lg text-[10px] font-medium transition text-center ${squareTubeGauge === g.gauge ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30' : 'bg-surface-200 text-steel-400 hover:bg-surface-50 hover:text-steel-200'}`}>
                          {g.gauge}<span className="block text-[9px] opacity-70">${g.pricePerJoint}/joint</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {fenceType.startsWith('stay_tuff') && (
                  <div>
                    <label className="block text-xs font-medium text-steel-400 mb-1">Stay-Tuff Product</label>
                    <select title="Stay-Tuff product" value={selectedStayTuff.model}
                      onChange={e => { const o = STAY_TUFF_OPTIONS.find(x => x.model === e.target.value); if (o) setSelectedStayTuff(o); }}
                      className="w-full bg-surface-200 border border-steel-700/30 rounded-lg px-3 py-2 text-sm text-steel-200 focus:ring-2 focus:ring-amber-500/50">
                      {STAY_TUFF_OPTIONS.map(o => <option key={o.model} value={o.model}>{o.model} - {o.description}</option>)}
                    </select>
                    <p className="text-[10px] text-amber-400/70 mt-1">Wire height: {selectedStayTuff.height}" &rarr; fence height: {fenceHeight} | T-Post: {tPostRec.label}</p>
                  </div>
                )}
              </div>
            </Card>
            <Card title="Post Spacing" icon="&#x1f4cf;">
              <div className="space-y-4">
                <DSlider label="Line Post Spacing" value={linePostSpacing} min={50} max={100} step={1}
                  display={`${linePostSpacing} ft`} onChange={setLinePostSpacing} minLabel="50 ft" maxLabel="100 ft" />
                <DSlider label="T-Post Spacing" value={tPostSpacing} min={7} max={15} step={0.5}
                  display={`${tPostSpacing} ft`} onChange={setTPostSpacing} minLabel="7 ft" maxLabel="15 ft" />
                <div className="bg-surface-200 rounded-lg p-3 text-xs text-steel-400">
                  <div className="flex justify-between"><span>Line Posts (est):</span><span className="text-steel-200 font-semibold">{materialCalc.linePostCount}</span></div>
                  <div className="flex justify-between mt-1"><span>T-Posts ({tPostRec.label}):</span><span className="text-steel-200 font-semibold">{materialCalc.tPostCount}</span></div>
                </div>
              </div>
            </Card>

            <Card title="Bracing" icon="&#x1f527;">
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

            <Card title="Pricing" icon="&#x1f4b0;">
              <div className="space-y-4">
                {/* Material cost breakdown (auto-calculated) */}
                <div className="bg-surface-200/60 rounded-lg p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-steel-400 uppercase tracking-wider mb-2">Material Cost / Ft (auto)</p>
                  {[
                    { label: `Wire (${fenceType.startsWith('stay_tuff') ? selectedStayTuff.height + '"' : FENCE_TYPES[fenceType]?.split(' ').slice(-2).join(' ') || fenceType})`, value: materialCostPerFoot.wire },
                    { label: 'Top Wire (HT smooth)', value: materialCostPerFoot.topWire },
                    { label: `T-Posts (${tPostRec.label} @ ${tPostSpacing}' spacing)`, value: materialCostPerFoot.tPosts },
                    { label: `Line Posts (${postMaterial === 'drill_stem' ? 'Drill Stem 31\'' : `Sq Tube ${squareTubeGauge} 20'`} @ ${linePostSpacing}')`, value: materialCostPerFoot.linePosts },
                    { label: `Concrete${soilMultiplier > 1 ? ` (${soilMultiplier}x soil adj.)` : ''}`, value: materialCostPerFoot.concrete },
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
                      <span className="font-semibold">&#x26a1; AI Suggested: {TERRAIN_MAP[terrainSuggestion.suggestedDifficulty]?.label}</span>
                      {terrainSuggestion.soilType && (
                        <>
                          <span className="block text-amber-400/80 mt-0.5 font-semibold">&#x1f30d; Soil: {terrainSuggestion.soilType}</span>
                          {terrainSuggestion.drainage && (
                            <span className="block text-amber-400/60">Drainage: {terrainSuggestion.drainage}</span>
                          )}
                          <span className="block text-amber-400/70">Concrete multiplier: {soilMultiplier}x (based on soil difficulty)</span>
                        </>
                      )}
                      {!terrainSuggestion.soilType && (
                        <span className="block text-steel-500 mt-0.5">&#x26a0;&#xfe0f; Soil data unavailable &mdash; using default difficulty</span>
                      )}
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

            <Card title="Painting" icon="&#x1f3a8;">
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

            <Card title="Overview Text" icon="&#x1f4dd;">
              <textarea value={projectOverview} onChange={e => setProjectOverview(e.target.value)} rows={3}
                className="w-full bg-surface-200 border border-steel-700/30 rounded-lg px-3 py-2 text-xs text-steel-300 focus:ring-2 focus:ring-amber-500/50" placeholder="Describe the project scope..." />
            </Card>
          </div>
          {/* RIGHT MAIN AREA */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-5 animate-fade-in">

            <div className="flex gap-2">
              {(['config', 'preview', 'pricing'] as const).map(t => (
                <TabBtn key={t} label={t === 'config' ? 'Sections & Map' : t === 'preview' ? 'Bid Preview' : 'Material Pricing'} active={activeTab === t} onClick={() => setActiveTab(t)} />
              ))}
            </div>

            {activeTab === 'config' && (
              <div className="space-y-5 animate-fade-in">
                <FenceMap
                  onFenceLinesChange={handleFenceLinesChange}
                  onTerrainAnalyzed={handleTerrainAnalyzed}
                  onMapCapture={(dataUrl) => { setMapImages(prev => [...prev, dataUrl]); }}
                />

                {/* Soil type banner */}
                {terrainSuggestion?.soilType && (
                  <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 rounded-xl p-4 border border-amber-700/30 flex items-center gap-3">
                    <span className="text-2xl">&#x1f30d;</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-amber-300">Soil: {terrainSuggestion.soilType}</p>
                      <p className="text-[11px] text-amber-400/70 mt-0.5">
                        Elevation change: {Math.round(terrainSuggestion.elevationChange)} ft &bull;
                        Avg elevation: {Math.round(terrainSuggestion.avgElevation)} ft &bull;
                        Suggested difficulty: {TERRAIN_MAP[terrainSuggestion.suggestedDifficulty]?.label}
                      </p>
                      {terrainSuggestion.drainage && (
                        <p className="text-[11px] text-amber-400/60 mt-0.5">
                          Drainage: {terrainSuggestion.drainage}
                          {terrainSuggestion.hydric ? ` \u2022 Hydric: ${terrainSuggestion.hydric}` : ''}
                        </p>
                      )}
                      {terrainSuggestion.components && terrainSuggestion.components.length > 1 && (
                        <p className="text-[10px] text-amber-400/50 mt-0.5">
                          Components: {terrainSuggestion.components.slice(0, 3).map((c: { name: string; percent: number }) => `${c.name} (${c.percent}%)`).join(', ')}
                        </p>
                      )}
                      <p className="text-[10px] text-amber-400/50 mt-0.5">
                        Soil affects concrete requirements ({soilMultiplier}x) and labor difficulty.
                        Source: {terrainSuggestion.source === 'UC_Davis_SoilWeb' ? 'UC Davis SoilWeb' : 'USDA NRCS Web Soil Survey'}
                      </p>
                    </div>
                  </div>
                )}
                {terrainSuggestion && !terrainSuggestion.soilType && (
                  <div className="bg-surface-200/50 rounded-xl p-3 border border-steel-700/30 flex items-center gap-3">
                    <span className="text-xl">&#x26a0;&#xfe0f;</span>
                    <div>
                      <p className="text-xs text-steel-400">Soil data unavailable for this location</p>
                      <p className="text-[10px] text-steel-500">
                        Elevation: {Math.round(terrainSuggestion.avgElevation)} ft &bull;
                        Change: {Math.round(terrainSuggestion.elevationChange)} ft &bull;
                        Using terrain-based difficulty estimate
                      </p>
                    </div>
                  </div>
                )}

                {/* AI site analysis status */}
                {generatingNarrative && (
                  <div className="bg-purple-900/20 rounded-lg p-3 border border-purple-700/30 flex items-center gap-2">
                    <span className="animate-pulse text-purple-400">&#x1f916;</span>
                    <p className="text-xs text-purple-300">Generating AI site analysis for this property&hellip;</p>
                  </div>
                )}
                {aiNarrative && !generatingNarrative && (
                  <div className="bg-emerald-900/20 rounded-lg p-3 border border-emerald-700/30">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-emerald-400 text-sm">&#x2713;</span>
                      <p className="text-xs font-semibold text-emerald-300">AI Site Analysis Ready</p>
                      <button onClick={() => setAiNarrative(null)} className="ml-auto text-[10px] text-red-400 hover:text-red-300 underline">clear</button>
                    </div>
                    <p className="text-[11px] text-steel-300 leading-relaxed line-clamp-4">{aiNarrative}</p>
                  </div>
                )}

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
                          <div className="col-span-2"><input type="number" step={0.5} value={sections[idx]?.ratePerFoot || ''} onChange={e => updSec(sec.id, { ratePerFoot: parseFloat(e.target.value) || 0 })} className="w-full bg-surface-200 border border-steel-700/30 rounded px-2.5 py-1.5 text-sm text-right text-steel-200 pl-5 focus:ring-1 focus:ring-amber-500/50" placeholder={effectiveRate.toFixed(2)} /></div>
                          <div className="col-span-3 text-right"><span className="text-sm font-bold text-amber-400">${fmt(sec.total)}</span></div>
                          <div className="col-span-1 text-right">{computed.length > 1 && <button onClick={() => rmSec(sec.id)} className="text-steel-500 hover:text-red-400 transition">&times;</button>}</div>
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
                              <button onClick={() => rmGate(g.id)} className="text-steel-500 hover:text-red-400 transition">&times;</button>
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
                  <p className="text-xs text-steel-400 mt-1">5900 Balcones Dr #26922, Austin, TX 78731 &bull; (830) 777-9111 &bull; office@haydenclaim.com</p>
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
                            <td className="px-3 py-2 text-right text-steel-500">incl. hardware &amp; install</td>
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
                      <div><span className="text-steel-500">Post Material:</span> <span className="text-steel-200">{postMaterial === 'drill_stem' ? 'Drill Stem (31\' joints)' : `2" Square Tube ${squareTubeGauge} (20' joints)`}</span></div>
                      <div><span className="text-steel-500">Line Posts:</span> <span className="text-steel-200">{materialCalc.linePostCount} @ {linePostSpacing}' spacing</span></div>
                      <div><span className="text-steel-500">T-Posts:</span> <span className="text-steel-200">{materialCalc.tPostCount} ({tPostRec.label}) @ {tPostSpacing}' spacing</span></div>
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
                    Download Complete Bid PDF (with Terms &amp; Signature Block)
                  </button>
                </div>
              </div>
            )}
            {activeTab === 'pricing' && (
              <div className="space-y-4 animate-fade-in">
                {/* Receipt sync section */}
                {priceDatabase.length > 0 && (
                  <div className="card-dark p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">&#x1f4cb;</span>
                        <h3 className="text-sm font-bold text-steel-200">Receipt Price Sync</h3>
                      </div>
                      <button onClick={() => {
                        const result = syncReceiptPrices();
                        setReceiptSyncResult(result);
                      }} className="text-xs bg-amber-600/20 text-amber-400 px-3 py-1.5 rounded-lg font-semibold hover:bg-amber-600/30 transition">
                        &#x26a1; Sync from Receipts ({priceDatabase.length} prices)
                      </button>
                    </div>
                    <p className="text-[10px] text-steel-500">
                      Update material prices below using your uploaded receipts. Go to
                      <Link href="/pricing" className="text-amber-400 hover:text-amber-300 mx-1 underline">Material Pricing</Link>
                      to upload more receipts.
                    </p>
                    {receiptSyncResult && (
                      <div className="mt-2 bg-emerald-900/20 border border-emerald-700/30 rounded-lg p-2 text-[10px] text-emerald-300 flex items-center justify-between">
                        <span>&#x2705; {receiptSyncResult.matched} items matched, {receiptSyncResult.updated} prices updated from receipts</span>
                        <button onClick={() => setReceiptSyncResult(null)} className="text-emerald-400/50 hover:text-emerald-300">&times;</button>
                      </div>
                    )}
                  </div>
                )}
                <div className="card-dark p-4">
                  <h3 className="text-sm font-bold text-steel-200 mb-3">Custom Material Pricing</h3>
                  <p className="text-xs text-steel-500 mb-4">Adjust unit prices for each material. Changes recalculate costs automatically.</p>
                  {(() => {
                    const cats = Array.from(new Set(materialPrices.map(m => m.category)));
                    return cats.map(cat => (
                      <div key={cat} className="mb-4">
                        <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wide mb-2">{cat}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {materialPrices.filter(m => m.category === cat).map(mp => (
                            <div key={mp.id} className="flex items-center gap-2 bg-surface-100/50 rounded px-3 py-2">
                              <span className="flex-1 text-xs text-steel-300 truncate" title={mp.name}>{mp.name}</span>
                              <span className="text-xs text-steel-500">/{mp.unit}</span>
                              <input type="number" step="0.01" min="0"
                                className="w-20 bg-steel-800 text-right text-sm text-steel-200 px-2 py-1 rounded border border-steel-700 focus:border-amber-500 focus:outline-none"
                                value={mp.price}
                                onChange={e => {
                                  const v = parseFloat(e.target.value) || 0;
                                  updateMaterialPrice(mp.id, v);
                                }}
                              />
                              <button className="text-xs text-steel-600 hover:text-amber-400" title="Reset"
                                onClick={() => updateMaterialPrice(mp.id, mp.defaultPrice)}
                              >?</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                  <button className="mt-2 text-xs text-steel-500 hover:text-amber-400 underline"
                    onClick={() => resetMaterialPrices()}>
                    Reset All to Defaults
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Summary Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-steel-900/95 backdrop-blur-xl border-t border-steel-700/40 px-4 py-2 z-50">
          <div className="max-w-screen-2xl mx-auto flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <span className="text-steel-500">Sections: <strong className="text-steel-200">{sections.length}</strong></span>
              <span className="text-steel-500">Total: <strong className="text-steel-200">{totalFeet.toLocaleString()} ft</strong></span>
              <span className="text-steel-500">Eff Rate: <strong className="text-amber-400">${effectiveRate.toFixed(2)}/ft</strong></span>
              <span className="text-steel-500">Gates: <strong className="text-steel-200">{gates.length}</strong></span>
              <span className="text-steel-500">Braces: <strong className="text-steel-200">{materialCalc.hBraces + materialCalc.cornerBraces}</strong></span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-steel-400">Deposit ({depositPercent}%): <strong className="text-steel-200">${fmt(deposit)}</strong></span>
              <span className="text-lg font-bold text-amber-400">${fmt(projTotal)}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* -- Helper Components -- */
function Card({ title, icon, children, className = '' }: { title?: string; icon?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card-dark p-4 ${className}`}>
      {title && <h3 className="text-sm font-bold text-steel-200 mb-3">{icon ? <span className="mr-1">{icon}</span> : null}{title}</h3>}
      {children}
    </div>
  );
}

function DInput({ label, value, onChange, type = 'text', placeholder, suffix }: {
  label?: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string; suffix?: string;
}) {
  return (
    <div>
      {label && <label className="block text-xs text-steel-400 mb-1">{label}</label>}
      <div className="flex items-center gap-1">
        <input type={type} value={value} placeholder={placeholder}
          className="w-full bg-steel-800 text-sm text-steel-200 px-3 py-2 rounded-lg border border-steel-700 focus:border-amber-500 focus:outline-none transition"
          onChange={e => onChange(e.target.value)} />
        {suffix && <span className="text-xs text-steel-500 whitespace-nowrap">{suffix}</span>}
      </div>
    </div>
  );
}

function DSlider({ label, value, onChange, min, max, step = 1, display, minLabel, maxLabel }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; display?: string; minLabel?: string; maxLabel?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-steel-400">{label}</label>
        <span className="text-xs font-mono text-amber-400">{display ?? value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        className="w-full accent-amber-500"
        onChange={e => onChange(Number(e.target.value))} />
      {(minLabel || maxLabel) && (
        <div className="flex justify-between mt-0.5">
          <span className="text-[9px] text-steel-600">{minLabel}</span>
          <span className="text-[9px] text-steel-600">{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${active ? 'bg-steel-800 text-amber-400 border-b-2 border-amber-500' : 'text-steel-400 hover:text-steel-200'}`}>
      {label}
    </button>
  );
}