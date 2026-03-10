'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { STAY_TUFF_CATALOG, WIRE_CATEGORY_LABELS, toStayTuffProduct, type StayTuffOption, type WireCategory } from '@/lib/fencing/fence-calculator';
import {
  POST_MATERIALS, BRACE_SPECS, GATE_SPECS, DEFAULT_MATERIAL_PRICES,
  getGaugeOptions,
  determineBraceType, estimatePainting, calculateVertexAngle,
  recommendedTPostLength, wireRollPriceId, postJointPriceId, calculatePostLength,
  type PostMaterial, type SquareTubeGauge, type BraceType, type GateSize, type GateSpec, type BraceRecommendation,
  type BarbedWireType, type TiePattern,
} from '@/lib/fencing/fence-materials';
import { generateFenceBidPDF, calculateSectionMaterials, calculateLaborEstimate, buildSiteAdjustments, type FenceBidSection, type BidGate, type FenceBidData, type TopWireType } from '@/lib/fencing/fence-bid-pdf';
import type { DrawnLine, VertexAngle, TerrainSuggestion, ElevationSegment } from '@/components/fencing/FenceMap';
import type { FenceType, FenceHeight } from '@/types';

const FenceMap = dynamic(() => import('@/components/fencing/FenceMap'), {
  ssr: false,
  loading: () => <div className="bg-steel-900 flex items-center justify-center h-[500px] animate-pulse rounded-xl"><p className="text-steel-500 text-sm">Loading satellite map...</p></div>,
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
  moderate: { label: 'Moderate', mult: 1.15, color: 'text-white' },
  difficult: { label: 'Difficult', mult: 1.35, color: 'text-steel-300' },
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
  const { addFenceBid, materialPrices, updateMaterialPrice, resetMaterialPrices, priceDatabase, syncReceiptPrices, loadSharedPrices, saveSharedPricesToServer } = useAppStore();

  // Project info
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');

  // Fence config
  const [fenceType, setFenceType] = useState<FenceType>('stay_tuff_fixed_knot');
  const [selectedStayTuff, setSelectedStayTuff] = useState<StayTuffOption>(STAY_TUFF_CATALOG[0]);
  const [wireCategory, setWireCategory] = useState<WireCategory>('cattle');
  const [postMaterial, setPostMaterial] = useState<PostMaterial>('drill_stem_238');
  const [squareTubeGauge, setSquareTubeGauge] = useState<SquareTubeGauge>('14ga');
  // Height for non-Stay-Tuff fences (manual)
  const [manualHeight, setManualHeight] = useState<FenceHeight>('5ft');

  // Top & bottom wire type: smooth HT, barbed, or double barbed top
  const [topWireType, setTopWireType] = useState<TopWireType>('barbed');
  // Barbed wire point type
  const [barbedWireType, setBarbedWireType] = useState<BarbedWireType>('4_point');
  // Tie pattern
  const [tiePattern, setTiePattern] = useState<TiePattern>('every_strand');
  // Accessories
  const [includePostCaps, setIncludePostCaps] = useState(false);
  const [includeTensioners, setIncludeTensioners] = useState(true);
  const [includeSpringIndicators, setIncludeSpringIndicators] = useState(false);
  const [concreteFillPosts, setConcreteFillPosts] = useState(false);

  // Derived: use Stay-Tuff height when applicable, otherwise manual height
  const wireHeightInches = useMemo(() => {
    if (fenceType.startsWith('stay_tuff')) return selectedStayTuff.height;
    const map: Record<FenceHeight, number> = { '4ft': 48, '5ft': 60, '6ft': 72, '7ft': 84, '8ft': 96 };
    return map[manualHeight] || 60;
  }, [fenceType, selectedStayTuff, manualHeight]);

  const fenceHeight: FenceHeight = useMemo(() => heightFromInches(wireHeightInches), [wireHeightInches]);

  // Auto t-post sizing from wire height
  const tPostRec = useMemo(() => recommendedTPostLength(wireHeightInches), [wireHeightInches]);

  // Filtered Stay-Tuff catalog by selected category
  const filteredStayTuff = useMemo(() => STAY_TUFF_CATALOG.filter(p => p.category === wireCategory), [wireCategory]);
  // Gauge options for current post material
  const currentGaugeOptions = useMemo(() => getGaugeOptions(postMaterial), [postMaterial]);

  // Spacing
  const [linePostSpacing, setLinePostSpacing] = useState(50); // ft
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
  // Elevation segment data for steep terrain surcharge
  const [steepFootage, setSteepFootage] = useState(0);

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
    if (analysis.steepFootage != null) setSteepFootage(analysis.steepFootage);
  }, []);

  // Load shared material prices from server on mount
  useEffect(() => {
    loadSharedPrices();
  }, [loadSharedPrices]);

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
    const barbedId = barbedWireType === '2_point' ? 'barbed_wire_2pt' : 'barbed_wire_4pt';
    if (fenceType.startsWith('stay_tuff')) {
      const rollId = wireRollPriceId(selectedStayTuff.id);
      wireCostPerFt = findPrice(rollId) / selectedStayTuff.rollLength;
    } else if (fenceType === 'field_fence') {
      wireCostPerFt = findPrice('field_fence_roll') / 330;
    } else if (fenceType === 'barbed_wire') {
      wireCostPerFt = (findPrice(barbedId) / 1320) * 4;
    } else if (fenceType === 'no_climb') {
      wireCostPerFt = findPrice('no_climb_roll') / 200;
    } else {
      wireCostPerFt = findPrice('field_fence_roll') / 330;
    }
    wireCostPerFt *= 1.10; // 10% overlap

    // Top/bottom wire (smooth HT or barbed, depending on selection)
    let topWireCostPerFt = 0;
    if (fenceType !== 'barbed_wire') {
      const useBarbed = topWireType === 'barbed' || topWireType === 'barbed_double';
      const topStrands = topWireType === 'barbed_double' ? 2 : 1;
      const bottomStrands = wireHeightInches >= 72 ? 1 : 0;
      const totalStrands = topStrands + bottomStrands;
      if (useBarbed) {
        topWireCostPerFt = (findPrice(barbedId) / 1320) * totalStrands;
      } else {
        topWireCostPerFt = (findPrice('ht_smooth') / 4000) * totalStrands;
      }
    }

    // T-Post cost per foot (auto-sized)
    const tPostPrice = findPrice(tPostRec.priceId);
    const tPostCostPerFt = tPostPrice / tPostSpacing;

    // Line post cost per foot (joint-based)
    const postPriceId = postJointPriceId(postMaterial, squareTubeGauge);
    const jointPrice = findPrice(postPriceId);
    const postSpec = POST_MATERIALS.find(p => p.id === postMaterial);
    const jointLen = postSpec?.jointLengthFeet ?? 20;
    const postCalc = calculatePostLength(wireHeightInches);
    const postsPerJoint = postCalc.postsPerJoint(postMaterial);
    const pricePerPost = postsPerJoint > 0 ? jointPrice / postsPerJoint : jointPrice;
    const linePostCostPerFt = pricePerPost / linePostSpacing;

    // Concrete bags per post based on post diameter and burial depth
    // Hole is typically 3× post OD diameter, filled around post
    const buryFt = postCalc.belowGroundFeet;
    const diamStr = postSpec?.diameter ?? '2-3/8" OD';
    let postOdInches = 2.375; // default
    if (diamStr.includes('2-3/8')) postOdInches = 2.375;
    else if (diamStr.includes('2-7/8')) postOdInches = 2.875;
    else if (diamStr.includes('2.5')) postOdInches = 2.5;
    else if (diamStr.includes('2" x 2"')) postOdInches = 2;
    else if (diamStr.includes('3" x 3"')) postOdInches = 3;
    else if (diamStr.includes('4" x 4"')) postOdInches = 4;
    const holeDiamIn = Math.max(postOdInches * 3, 8); // min 8" hole
    const holeRadFt = (holeDiamIn / 2) / 12;
    const postRadFt = (postOdInches / 2) / 12;
    const postArea = postSpec?.shape === 'square' ? (postOdInches / 12) ** 2 : Math.PI * postRadFt ** 2;
    const holeArea = Math.PI * holeRadFt ** 2;
    const concreteCuFtPerPost = (holeArea - postArea) * buryFt;
    // 80-lb bag covers ~0.6 cu ft
    const bagsPerLinePost = Math.ceil(concreteCuFtPerPost / 0.6 * soilMultiplier);
    const bagsPerBracePost = Math.ceil(concreteCuFtPerPost * 1.5 / 0.6 * soilMultiplier); // brace posts get 50% more concrete
    const concreteCostPerFt = (findPrice('concrete_bag') * bagsPerLinePost) / linePostSpacing;

    // Hardware per foot
    const clipsCostPerFt = (findPrice('clips') / 500) * (4 / tPostSpacing);
    // Horizontal strands for tensioner/spring indicator calcs
    const horizStrands = fenceType.startsWith('stay_tuff') ? selectedStayTuff.horizontalWires : 9;
    // Estimated total footage for per-foot normalization
    const estTotalFeet = sections.reduce((s, c) => s + c.linearFeet, 0) || 1000;
    // Brace/termination points: 2 ends + mid-run splices every 660'
    const estBraceCount = 2 + Math.max(0, Math.floor(estTotalFeet / 660) - 1);
    // Tensioners: 1 per horizontal strand per brace/termination point
    const tensionersPerFt = includeTensioners
      ? (findPrice('tensioner') * horizStrands * estBraceCount) / estTotalFeet
      : 0;
    // Spring indicators: 1 per strand per brace point
    const springIndicatorsPerFt = includeSpringIndicators
      ? (findPrice('spring_tension_indicator') * horizStrands * estBraceCount) / estTotalFeet
      : 0;
    // Post caps: 1 per line post
    const postCapsCostPerFt = includePostCaps
      ? findPrice('post_cap') / linePostSpacing
      : 0;
    // Concrete fill (inside tube): only for square tube posts
    const concreteFillCostPerFt = (concreteFillPosts && postSpec?.shape === 'square')
      ? findPrice('concrete_fill_post') / linePostSpacing
      : 0;
    // Brace diagonal pipe cost: each brace uses 1 rail + 1 welded diagonal (10' each), cut from same pipe joints
    const bracePiecesPerJoint = Math.floor(jointLen / 10);
    const bracePipeCostPerFt = bracePiecesPerJoint > 0
      ? (2 * jointPrice / bracePiecesPerJoint) / linePostSpacing
      : 0;
    const hardwareCostPerFt = clipsCostPerFt + tensionersPerFt + bracePipeCostPerFt;
    const accessoryCostPerFt = postCapsCostPerFt + springIndicatorsPerFt + concreteFillCostPerFt;

    // Steep terrain surcharge: additional $2/ft for sections with >15% grade
    const steepSurchargePerFt = steepFootage > 0 ? (steepFootage * 2) / estTotalFeet : 0;

    const total = wireCostPerFt + topWireCostPerFt + tPostCostPerFt + linePostCostPerFt
      + concreteCostPerFt + hardwareCostPerFt + accessoryCostPerFt + steepSurchargePerFt;
    return {
      wire: Math.round(wireCostPerFt * 100) / 100,
      topWire: Math.round(topWireCostPerFt * 100) / 100,
      tPosts: Math.round(tPostCostPerFt * 100) / 100,
      linePosts: Math.round(linePostCostPerFt * 100) / 100,
      concrete: Math.round(concreteCostPerFt * 100) / 100,
      hardware: Math.round(hardwareCostPerFt * 100) / 100,
      accessories: Math.round(accessoryCostPerFt * 100) / 100,
      steepSurcharge: Math.round(steepSurchargePerFt * 100) / 100,
      total: Math.round(total * 100) / 100,
      // Expose per-post concrete bags for materialCalc
      _bagsPerLinePost: bagsPerLinePost,
      _bagsPerBracePost: bagsPerBracePost,
    };
  }, [fenceType, wireHeightInches, selectedStayTuff, tPostRec, tPostSpacing, linePostSpacing, postMaterial, squareTubeGauge, materialPrices, soilMultiplier, topWireType, barbedWireType, includePostCaps, includeTensioners, includeSpringIndicators, concreteFillPosts, steepFootage, sections]);

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
    const wireRolls = Math.ceil((totalFeet * 1.1) / (fenceType.startsWith('stay_tuff') ? selectedStayTuff.rollLength : 330));

    // Concrete bags: diameter-based calculation from materialCostPerFoot
    const concreteBags = (linePostCount * materialCostPerFoot._bagsPerLinePost)
      + (totalBraces * 2 * materialCostPerFoot._bagsPerBracePost); // 2 posts per brace assembly

    // Horizontal wire strands for accessory calcs
    const horizStrands = fenceType.startsWith('stay_tuff') ? selectedStayTuff.horizontalWires : 9;

    // Post caps: 1 per line post + 2 per brace assembly (2 brace posts each)
    const postCapsQty = includePostCaps ? linePostCount + (totalBraces * 2) : 0;

    // Brace/termination points where tensioners & indicators are installed
    const midRunSplices = Math.max(0, Math.floor(totalFeet / 660) - 1);
    const tensionerLocations = totalBraces + midRunSplices;

    // Tensioners: 1 per horizontal strand per brace/termination point
    const tensionersQty = includeTensioners ? horizStrands * tensionerLocations : 0;

    // Spring tension indicators: 1 per horizontal strand per brace point
    const springIndicatorsQty = includeSpringIndicators ? horizStrands * tensionerLocations : 0;

    // Concrete fill (inside tube posts): only for square tube posts
    const postSpec = POST_MATERIALS.find(p => p.id === postMaterial);
    const concreteFillPostsQty = (concreteFillPosts && postSpec?.shape === 'square') ? linePostCount : 0;
    const concreteFillBracesQty = (concreteFillPosts && postSpec?.shape === 'square') ? totalBraces * 2 : 0;

    return {
      linePostCount,
      tPostCount: Math.max(0, tPostCount),
      hBraces, cornerBraces, totalBraces,
      wireRolls, concreteBags,
      postCapsQty, tensionersQty, springIndicatorsQty,
      concreteFillPostsQty, concreteFillBracesQty,
      horizStrands,
    };
  }, [totalFeet, linePostSpacing, tPostSpacing, braceRecommendations, fenceType, selectedStayTuff, materialCostPerFoot, includePostCaps, includeTensioners, includeSpringIndicators, concreteFillPosts, postMaterial]);

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
  /** Build a comprehensive, educational soil/terrain narrative for the PDF bid (fallback when AI is unavailable) */
  const buildSoilNarrative = useCallback((): string | undefined => {
    if (!terrainSuggestion) return undefined;
    const parts: string[] = [];

    // ── Opening: Research source & soil type ──
    if (terrainSuggestion.soilType) {
      parts.push(
        `Before designing your fence, our team conducted thorough property research using the ${terrainSuggestion.source === 'UC_Davis_SoilWeb' ? 'UC Davis SoilWeb database, which draws on USDA Natural Resources Conservation Service (NRCS) data' : 'USDA Natural Resources Conservation Service (NRCS) Web Soil Survey'}. This is the same data used by civil engineers, land developers, and agricultural planners across the country. The primary soil type mapped on your property is "${terrainSuggestion.soilType}." Understanding your soil is not just academic — it directly determines how deep we set posts, how much concrete each hole needs, what equipment we bring, and ultimately how long your fence will last.`,
      );
    }

    // ── Geological history / taxonomy ──
    if (terrainSuggestion.taxonomy) {
      const taxOrder = terrainSuggestion.taxOrder?.toLowerCase() || '';
      const orderStories: Record<string, string> = {
        'mollisols': 'Mollisols are among the most fertile soils on Earth. They formed over thousands of years under native grassland vegetation — in your case, likely the tallgrass and mixed-grass prairies that once blanketed the Texas Hill Country. The thick, dark topsoil layer (called the "A horizon") is rich in organic matter from countless generations of grasses growing, dying, and decomposing. While this makes excellent ranching soil, the organic-rich layer can be soft, which means fence post holes need extra concrete to prevent slow settling over the years.',
        'vertisols': 'Vertisols are fascinating and sometimes frustrating soils. They are extremely high in a type of clay called montmorillonite (also known as "shrink-swell" clay). When it rains, Vertisols absorb water and expand dramatically — you may have noticed the ground feeling spongy after heavy rain. When it dries out in summer, the soil contracts and deep cracks appear — sometimes wide enough to drop a boot into. This seasonal movement literally pushes fence posts out of the ground over time, a process called "frost heave" in northern states but caused purely by clay expansion in Texas. We combat this with deeper post settings and additional concrete.',
        'alfisols': 'Alfisols are moderately fertile soils that formed under hardwood forest cover. In the Hill Country, these often formed under post oak and blackjack oak woodlands. They have a distinctive feature: a clay-enriched subsoil layer (called the "Bt horizon") that forms when clay particles wash down from the surface over centuries. This clay layer actually provides excellent anchorage for fence posts once you bore through the sandier topsoil to reach it.',
        'inceptisols': 'Inceptisols are geologically young soils — they have not had enough time or stable enough conditions to develop the distinct layers that older soils have. In the Hill Country, Inceptisols typically form on moderate to steep slopes where erosion keeps stripping away the surface faster than soil can develop. The practical implication is that there is often not much soil depth to work with — you hit rock or partially weathered limestone relatively quickly when digging.',
        'entisols': 'Entisols are the youngest soils in the classification system — essentially weathered rock with minimal soil development. On your property, this likely means the soil is thin, sitting directly on limestone bedrock or within rocky hillside material. These soils formed where the terrain is too steep or too rocky for deep soil development. Fence post installation in Entisols almost always involves rock drilling, because there simply is not enough loose soil to auger through.',
        'aridisols': 'Aridisols form in dry climates and are common in parts of west-central Texas. A notorious feature of many Aridisols is a cemented calcium carbonate layer called "caliche" — the bane of post hole diggers across Texas. Caliche forms when dissolved calcium from limestone leaches downward and re-precipitates in a rock-hard layer that can be inches to feet thick. Standard auger bits bounce off caliche; it requires our 80-horse tractor with Beltech capable of drilling through concrete to penetrate.',
      };
      const storyKey = Object.keys(orderStories).find(k => taxOrder.includes(k));
      const orderStory = storyKey ? orderStories[storyKey] : null;

      if (orderStory) {
        parts.push(`The USDA classifies your soil under the scientific taxonomy "${terrainSuggestion.taxonomy}." ${orderStory}`);
      } else {
        parts.push(`The USDA classifies your soil under the scientific taxonomy "${terrainSuggestion.taxonomy}." This classification, developed over a century of soil science research, tells us about how your soil formed, what layers exist below the surface, and how it behaves under different conditions — all critical factors for fence installation.`);
      }
    }

    // ── Texture & rock fragments ──
    if (terrainSuggestion.texture) {
      let textureExplain = `The top soil layer (the material our auger hits first) is classified as "${terrainSuggestion.texture}."`;
      if (terrainSuggestion.rockFragmentPct != null && terrainSuggestion.rockFragmentPct >= 25) {
        textureExplain += ` That ${terrainSuggestion.rockFragmentPct}% rock fragment content means that roughly ${terrainSuggestion.rockFragmentPct >= 50 ? 'one out of every two shovelfuls is rock' : 'one in every three to four shovelfuls is rock'}. These are not small pebbles — "coarse fragments" in USDA terminology means cobbles and stones 3 inches and larger mixed throughout the soil matrix. This is the result of millions of years of limestone bedrock slowly weathering and breaking apart, mixing gravel and cobbles into the upper soil. Our crew uses a skid steer mounted auger with heavy-duty carbide-tipped bits rated for this type of material, and we carry backup bits for rocky jobs.`;
      } else if (terrainSuggestion.rockFragmentPct != null && terrainSuggestion.rockFragmentPct > 0) {
        textureExplain += ` The soil contains about ${terrainSuggestion.rockFragmentPct}% rock fragments — moderate for the Hill Country — which our equipment handles well.`;
      }
      parts.push(textureExplain);
    } else if (terrainSuggestion.rockFragmentPct != null && terrainSuggestion.rockFragmentPct >= 20) {
      parts.push(`USDA data indicates your soil contains ${terrainSuggestion.rockFragmentPct}% coarse rock fragments (cobbles and stones in the soil matrix). ${terrainSuggestion.rockFragmentPct >= 50 ? 'The soil is essentially half rocks — every other shovelful will contain significant stone. This is typical of thin Hill Country soils overlying limestone bedrock.' : 'This is a noticeable amount of rock that slows down post hole augering but is well within what our equipment can handle.'}`);
    }

    // ── Bedrock depth (THE most critical finding) ──
    if (terrainSuggestion.bedrockDepthIn != null) {
      const depth = terrainSuggestion.bedrockDepthIn;
      const ft = Math.floor(depth / 12);
      const inches = depth % 12;
      const depthStr = ft > 0 ? `${ft} feet${inches > 0 ? ' ' + inches + ' inches' : ''}` : `${depth} inches`;
      const restrictType = terrainSuggestion.restrictionType || 'bedrock';
      if (depth <= 18) {
        parts.push(`Perhaps the most important finding from our research: USDA subsurface data indicates ${restrictType} at approximately ${depthStr} below the surface. For context, a properly set fence post needs to be buried 30 to 36 inches deep. At ${depthStr}, every single post hole on your property will hit solid rock well before reaching that depth. This is not unusual in the Hill Country — much of this region sits on Cretaceous-era limestone that was deposited as marine sediment roughly 100 million years ago when central Texas was the floor of a shallow sea. Our crew will arrive with an 80-horse tractor with a Beltech that's capable of drilling through concrete and solid limestone. A post anchored into solid bedrock is actually the strongest possible installation — that post is not going anywhere, ever.`);
      } else if (depth <= 30) {
        parts.push(`USDA subsurface data indicates ${restrictType} at approximately ${depthStr} below the surface. Since a standard fence post is set 30 to 36 inches deep, most post holes will encounter rock before reaching ideal depth. This is common in the Texas Hill Country, where limestone bedrock from the Cretaceous period (roughly 100 million years old) lies relatively close to the surface. Our crew will bring our 80-horse tractor with a Beltech capable of drilling through rock to finish these holes and ensure each post reaches maximum achievable depth, anchoring directly into the rock shelf where possible.`);
      } else if (depth <= 48) {
        parts.push(`USDA data indicates ${restrictType} at approximately ${depthStr} below grade. While this is deep enough for most post holes, our corner posts and end posts (which are set deeper for added stability) may encounter rock. We keep our skid steer mounted auger and 80-horse tractor with Beltech on site as standard practice for all Hill Country installations.`);
      }
    } else if (terrainSuggestion.soilType) {
      const soil = terrainSuggestion.soilType.toLowerCase();
      if (soil.includes('rock') || soil.includes('outcrop') || soil.includes('limestone') || soil.includes('caliche')) {
        parts.push('Based on the soil type name, your property contains significant rock or limestone near the surface. Post holes will likely require our 80-horse tractor with Beltech or skid steer mounted auger in some areas, which we have accounted for in our approach.');
      }
    }

    // ── Clay content / shrink-swell ──
    if (terrainSuggestion.clayPct != null && terrainSuggestion.clayPct >= 35) {
      parts.push(`Your soil tests at ${terrainSuggestion.clayPct}% clay content, which puts it firmly in the "expansive" category. Here is what that means in practical terms: clay soils act like a sponge in slow motion. After heavy rain, the clay absorbs water and expands — during the 2024 spring rains, some Texas clay soils swelled enough to lift foundation slabs. In summer droughts, the same soil contracts and cracks. For fence posts, this seasonal push-and-pull can gradually work posts loose over the years if they are not set properly. We compensate by setting posts deeper than standard, using additional concrete per hole, and selecting a concrete mix that bonds well with clay soils.`);
    } else if (terrainSuggestion.soilType && (terrainSuggestion.soilType.toLowerCase().includes('clay') || terrainSuggestion.soilType.toLowerCase().includes('vertisol'))) {
      parts.push('Clay-rich soils expand and contract with moisture changes — a phenomenon called "shrink-swell." We compensate for this by setting posts deeper with additional concrete to prevent seasonal shifting.');
    }

    // ── Drainage & water ──
    if (terrainSuggestion.drainage) {
      const drain = terrainSuggestion.drainage.toLowerCase();
      if (drain.includes('well')) {
        parts.push(`Your soil has "${terrainSuggestion.drainage}" drainage${terrainSuggestion.runoff ? ` with ${terrainSuggestion.runoff.toLowerCase()} surface runoff` : ''}. This is one of the best scenarios for fence installation. Good drainage means water moves through the soil efficiently, so post-hole concrete cures properly and water does not pool around post bases. Standing water around metal posts is the number one cause of premature post failure in Texas — and you do not have to worry about it here.`);
      } else if (drain.includes('poor') || drain.includes('somewhat')) {
        parts.push(`Your soil has "${terrainSuggestion.drainage}" drainage, which means water tends to linger rather than percolate through. This is important for fence longevity — we use rapid-set concrete in areas where water is present in the hole, and we ensure posts are set at maximum depth to anchor below the saturated zone where possible.${terrainSuggestion.runoff ? ` Surface runoff is classified as "${terrainSuggestion.runoff}."` : ''}`);
      } else {
        parts.push(`Soil drainage is classified as "${terrainSuggestion.drainage}"${terrainSuggestion.runoff ? ` with ${terrainSuggestion.runoff.toLowerCase()} surface runoff` : ''} — we have selected concrete and post-setting techniques appropriate for these conditions.`);
      }
    }

    // ── pH ──
    if (terrainSuggestion.pH != null) {
      if (terrainSuggestion.pH >= 7.5) {
        parts.push(`Soil pH measures ${terrainSuggestion.pH} (alkaline), which is common in limestone regions and actually favorable for metal fence post longevity. Alkaline soils are less corrosive to steel than acidic soils, so your drill stem posts should provide decades of reliable service.`);
      } else if (terrainSuggestion.pH <= 5.5) {
        parts.push(`Soil pH measures ${terrainSuggestion.pH} (acidic). Acidic soils can gradually corrode metal fence posts over long periods — typically 15 to 25 years depending on wall thickness. We recommend heavy-wall drill stem (2-3/8" OD, 4.7 lb/ft) for maximum longevity in these conditions, and periodic inspection of post bases every 5-10 years.`);
      } else {
        parts.push(`Soil pH measures ${terrainSuggestion.pH} (near neutral) — right in the sweet spot for metal post longevity. Neither acidic enough to cause corrosion concerns nor alkaline enough to affect concrete curing.`);
      }
    }

    // ── Hydric indicator ──
    if (terrainSuggestion.hydric && terrainSuggestion.hydric.toLowerCase() === 'yes') {
      parts.push('The USDA classifies portions of this soil as "hydric," which is a wetland indicator. This does not mean your property is a swamp — many Hill Country properties have small hydric areas in low-lying draws and seasonal creek bottoms. It means the soil is seasonally saturated long enough to develop certain chemical characteristics. We will identify these areas during our on-site walk-through and use deeper post settings with rapid-set concrete in those zones.');
    }

    // ── Elevation / terrain ──
    if (terrainSuggestion.elevationChange > 0) {
      const elev = Math.round(terrainSuggestion.elevationChange);
      if (elev > 50) {
        parts.push(`Your fence line crosses approximately ${elev} feet of elevation change${terrainSuggestion.slopeRange ? ` (USDA slope range: ${terrainSuggestion.slopeRange})` : ''}. To put that in perspective, that is about the height of a ${Math.round(elev / 10)}-story building. On steep grades, gravity pulls constantly on the wire, creating additional tension that standard flat-ground spacing cannot handle. We use closer post spacing on slopes to prevent wire sag, and every bracing assembly at a grade change is reinforced with a welded pipe diagonal to resist the extra downhill pull.`);
      } else if (elev > 15) {
        parts.push(`Your fence line crosses approximately ${elev} feet of elevation change${terrainSuggestion.slopeRange ? ` (USDA slope range: ${terrainSuggestion.slopeRange})` : ''}. This moderate grade is very common in the Hill Country and manageable with slightly closer post spacing on the sloped sections to maintain even wire tension.`);
      } else {
        parts.push(`Your fence line is relatively level with only about ${elev} feet of elevation change — ideal conditions for efficient installation and consistent wire tension throughout the entire run.`);
      }
    }

    // ── Terrain difficulty summary & confidence closer ──
    const diffLabel = TERRAIN_MAP[terrainSuggestion.suggestedDifficulty]?.label || terrainSuggestion.suggestedDifficulty;
    parts.push(`Based on our comprehensive analysis, we have classified this project as "${diffLabel}" terrain difficulty. Every material quantity, post spacing, concrete calculation, and labor estimate in this proposal has been specifically tailored to the soil, rock, and terrain conditions on YOUR property — not generic industry averages. We bring this level of research to every project because a fence is only as good as the ground it is built in.`);

    return parts.length > 0 ? parts.join('\n\n') : undefined;
  }, [terrainSuggestion]);

  const handleDownloadPDF = useCallback(() => {
    const now = new Date();
    const valid = new Date(now); valid.setDate(valid.getDate() + 30);
    const ftLabel = FENCE_TYPES[fenceType] || fenceType;
    const stModel = fenceType.startsWith('stay_tuff') ? selectedStayTuff.spec : undefined;
    const secs = computed.map(sec => ({
      ...sec, materials: calculateSectionMaterials(
        sec.linearFeet, ftLabel, fenceHeight, stModel,
        sec.terrain || terrain, postMaterial, squareTubeGauge, tPostSpacing, linePostSpacing, topWireType,
      ),
    }));
    // Calculate labor estimate
    const laborEst = calculateLaborEstimate({
      totalLinearFeet: totalFeet,
      linePostCount: materialCalc.linePostCount,
      tPostCount: materialCalc.tPostCount,
      hBraceCount: materialCalc.hBraces,
      cornerBraceCount: materialCalc.cornerBraces,
      gateCount: gates.length,
    });
    const data: FenceBidData = {
      projectName: projectName || 'Fence Installation', clientName: clientName || 'Customer',
      propertyAddress: address, date: fmtDate(now), validUntil: fmtDate(valid),
      fenceType: ftLabel, fenceHeight, stayTuffModel: stModel,
      stayTuffDescription: stModel ? selectedStayTuff.description : undefined,
      wireHeightInches,
      postMaterial, squareTubeGauge, tPostSpacing, linePostSpacing, topWireType,
      sections: secs, gates, projectTotal: projTotal, depositPercent, depositAmount: deposit,
      balanceAmount: balance, timelineWeeks: Math.ceil(timelineDays / 5), workingDays: timelineDays,
      laborEstimate: laborEst,
      projectOverview: projectOverview + (address ? ` Site located at ${address}.` : ''),
      terrainDescription: TERRAIN_MAP[terrain]?.label || terrain,
      soilNarrative: aiNarrative || buildSoilNarrative(),
      siteData: terrainSuggestion ? {
        soilType: terrainSuggestion.soilType,
        components: terrainSuggestion.components || [],
        drainage: terrainSuggestion.drainage,
        hydric: terrainSuggestion.hydric,
        source: terrainSuggestion.source,
        elevationChange: terrainSuggestion.elevationChange,
        suggestedDifficulty: terrainSuggestion.suggestedDifficulty,
        bedrockDepthIn: terrainSuggestion.bedrockDepthIn,
        restrictionType: terrainSuggestion.restrictionType,
        slopeRange: terrainSuggestion.slopeRange,
        slopeLow: terrainSuggestion.slopeLow,
        slopeHigh: terrainSuggestion.slopeHigh,
        runoff: terrainSuggestion.runoff,
        taxonomy: terrainSuggestion.taxonomy,
        taxOrder: terrainSuggestion.taxOrder,
        texture: terrainSuggestion.texture,
        clayPct: terrainSuggestion.clayPct,
        sandPct: terrainSuggestion.sandPct,
        rockFragmentPct: terrainSuggestion.rockFragmentPct,
        pH: terrainSuggestion.pH,
        organicMatter: terrainSuggestion.organicMatter,
      } : undefined,
      siteAdjustments: terrainSuggestion ? buildSiteAdjustments({
        soilType: terrainSuggestion.soilType,
        components: terrainSuggestion.components || [],
        drainage: terrainSuggestion.drainage,
        hydric: terrainSuggestion.hydric,
        source: terrainSuggestion.source,
        elevationChange: terrainSuggestion.elevationChange,
        suggestedDifficulty: terrainSuggestion.suggestedDifficulty,
        bedrockDepthIn: terrainSuggestion.bedrockDepthIn,
        restrictionType: terrainSuggestion.restrictionType,
        slopeRange: terrainSuggestion.slopeRange,
        slopeLow: terrainSuggestion.slopeLow,
        slopeHigh: terrainSuggestion.slopeHigh,
        runoff: terrainSuggestion.runoff,
        taxonomy: terrainSuggestion.taxonomy,
        taxOrder: terrainSuggestion.taxOrder,
        texture: terrainSuggestion.texture,
        clayPct: terrainSuggestion.clayPct,
        sandPct: terrainSuggestion.sandPct,
        rockFragmentPct: terrainSuggestion.rockFragmentPct,
        pH: terrainSuggestion.pH,
        organicMatter: terrainSuggestion.organicMatter,
      }, {
        postMaterial,
        squareTubeGauge,
        fenceType: ftLabel,
      }) : undefined,
      mapImages: mapImages.length > 0 ? mapImages : undefined,
      accessories: {
        postCaps: materialCalc.postCapsQty,
        tensioners: materialCalc.tensionersQty,
        springIndicators: materialCalc.springIndicatorsQty,
        concreteFillPosts: materialCalc.concreteFillPostsQty,
        concreteFillBraces: materialCalc.concreteFillBracesQty,
      },
      steepFootage: steepFootage > 0 ? steepFootage : undefined,
      steepSurchargePerFoot: steepFootage > 0 ? 2 : undefined,
    };
    generateFenceBidPDF(data);
  }, [computed, gates, projectName, clientName, address, fenceType, fenceHeight, selectedStayTuff, terrain, depositPercent, deposit, balance, projTotal, timelineDays, projectOverview, wireHeightInches, buildSoilNarrative, mapImages, postMaterial, squareTubeGauge, tPostSpacing, linePostSpacing, topWireType, aiNarrative, terrainSuggestion, totalFeet, materialCalc]);

  const handleSaveBid = useCallback(() => {
    addFenceBid({
      id: `fb_${Date.now()}`, projectName: projectName || 'Fence Project', clientName, address,
      fenceLines: [], fenceType, fenceHeight,
      stayTuffOption: fenceType.startsWith('stay_tuff') ? toStayTuffProduct(selectedStayTuff) : undefined,
      materials: { cornerPosts: { quantity: 0, lengthFeet: 0, type: '' }, linePosts: { quantity: materialCalc.linePostCount, lengthFeet: 0, spacingFeet: linePostSpacing, type: POST_MATERIALS.find(p => p.id === postMaterial)?.label ?? postMaterial }, tPosts: { quantity: materialCalc.tPostCount, lengthFeet: 0, spacingFeet: tPostSpacing }, bracingAssemblies: { quantity: materialCalc.totalBraces, type: '' }, gateAssemblies: [], wire: { rolls: materialCalc.wireRolls, feetPerRoll: fenceType.startsWith('stay_tuff') ? selectedStayTuff.rollLength : 330, totalFeet: totalFeet, type: '' }, barbedWire: { rolls: 0, strands: 0, totalFeet: 0 }, clips: { quantity: 0, type: '' }, staples: { pounds: 0 }, concrete: { bags: materialCalc.concreteBags, poundsPerBag: 80 }, tensioners: { quantity: materialCalc.tensionersQty }, extras: [
        ...(materialCalc.postCapsQty > 0 ? [{ name: 'Post Caps', quantity: materialCalc.postCapsQty, unit: 'ea' }] : []),
        ...(materialCalc.springIndicatorsQty > 0 ? [{ name: 'Spring Indicators', quantity: materialCalc.springIndicatorsQty, unit: 'ea' }] : []),
        ...(materialCalc.concreteFillPostsQty > 0 ? [{ name: 'Concrete Fill (posts)', quantity: materialCalc.concreteFillPostsQty, unit: 'ea' }] : []),
        ...(materialCalc.concreteFillBracesQty > 0 ? [{ name: 'Concrete Fill (braces)', quantity: materialCalc.concreteFillBracesQty, unit: 'ea' }] : []),
      ] },
      laborEstimate: { totalHours: timelineDays * 24, crewSize: 3, days: timelineDays, difficultyMultiplier: terrainMult, hourlyRate: 45, totalLaborCost: secTotal },
      totalCost: projTotal, createdAt: new Date().toISOString(),
    });
    alert('Bid saved!');
  }, [projectName, clientName, address, fenceType, fenceHeight, selectedStayTuff, totalFeet, timelineDays, terrain, secTotal, projTotal, addFenceBid, materialCalc, linePostSpacing, tPostSpacing, postMaterial, terrainMult]);

  return (
    <div className="min-h-screen bg-black bg-grid">
      <header className="glass border-b border-white/[0.06] sticky top-0 z-50">
        <div className="max-w-[1500px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="hover-line text-steel-400 hover:text-white transition text-xs uppercase tracking-widest">&larr; Back</Link>
            <h1 className="text-white font-bold text-sm uppercase tracking-widest">Fence Bid Creator</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSaveBid} className="text-xs uppercase tracking-wider glass text-steel-300 px-4 py-2 hover:text-white transition font-medium">Save Bid</button>
            {mapImages.length > 0 && (
              <span className="flex items-center gap-1.5 text-[10px]">
                <span className="text-green-400">&#x2713; {mapImages.length} map{mapImages.length > 1 ? 's' : ''} captured</span>
                <button onClick={() => setMapImages([])} className="text-red-400 hover:text-red-300 underline">clear</button>
              </span>
            )}
            <button onClick={handleDownloadPDF} className="text-xs uppercase tracking-wider bg-tan-400 text-black px-5 py-2 hover:bg-tan-300 transition font-semibold flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Download PDF
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-6 py-6">
        {/* MAP FIRST — full width above everything on config tab */}
        {activeTab === 'config' && (
          <div className="mb-6 animate-fade-in">
            <Card title="Draw Your Fence" icon="&#x1f5fa;&#xfe0f;" className="!p-0 overflow-hidden">
              <div className="p-4 pb-2">
                <p className="text-[11px] text-steel-400 mb-2">Click on the map to draw your fence lines. The map will analyze terrain, soil, and elevation automatically.</p>
              </div>
              <FenceMap
                onFenceLinesChange={handleFenceLinesChange}
                onTerrainAnalyzed={handleTerrainAnalyzed}
                onMapCapture={(dataUrl) => { setMapImages(prev => [...prev, dataUrl]); }}
                onAddPointOnLine={(coord, type, lineId) => {
                  if (type === 'h_brace' || type === 'n_brace' || type === 'corner_brace') {
                    const spec = BRACE_SPECS.find(b => b.id === type) || BRACE_SPECS[0];
                    setBraceRecommendations(prev => [...prev, {
                      type: type as 'h_brace' | 'n_brace' | 'corner_brace',
                      label: spec.label,
                      angleDegrees: type === 'corner_brace' ? 90 : 180,
                      spec,
                    }]);
                  }
                }}
              />
            </Card>

            {/* Soil type banner */}
            {terrainSuggestion?.soilType && (
              <div className="mt-4 bg-steel-900/60 rounded-xl p-4 border border-white/[0.08] flex items-center gap-3">
                <span className="text-2xl">&#x1f30d;</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-steel-200">Soil: {terrainSuggestion.soilType}</p>
                  <p className="text-[11px] text-steel-400 mt-0.5">
                    Elevation change: {Math.round(terrainSuggestion.elevationChange)} ft &bull;
                    Avg elevation: {Math.round(terrainSuggestion.avgElevation)} ft &bull;
                    Suggested difficulty: {TERRAIN_MAP[terrainSuggestion.suggestedDifficulty]?.label}
                  </p>
                  {terrainSuggestion.drainage && (
                    <p className="text-[11px] text-steel-500 mt-0.5">
                      Drainage: {terrainSuggestion.drainage}
                      {terrainSuggestion.hydric ? ` \u2022 Hydric: ${terrainSuggestion.hydric}` : ''}
                    </p>
                  )}
                  {terrainSuggestion.components && terrainSuggestion.components.length > 1 && (
                    <p className="text-[10px] text-steel-500 mt-0.5">
                      Components: {terrainSuggestion.components.slice(0, 3).map((c: { name: string; percent: number }) => `${c.name} (${c.percent}%)`).join(', ')}
                    </p>
                  )}
                  <p className="text-[10px] text-steel-500 mt-0.5">
                    Soil affects concrete requirements ({soilMultiplier}x) and labor difficulty.
                    Source: {terrainSuggestion.source === 'UC_Davis_SoilWeb' ? 'UC Davis SoilWeb' : 'USDA NRCS Web Soil Survey'}
                  </p>
                </div>
              </div>
            )}
            {terrainSuggestion && !terrainSuggestion.soilType && (
              <div className="mt-4 bg-black/50 rounded-xl p-3 border border-steel-800 flex items-center gap-3">
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
              <div className="mt-4 bg-purple-900/20 rounded-lg p-3 border border-purple-700/30 flex items-center gap-2">
                <span className="animate-pulse text-purple-400">&#x1f916;</span>
                <p className="text-xs text-purple-300">Generating AI site analysis for this property&hellip;</p>
              </div>
            )}
            {aiNarrative && !generatingNarrative && (
              <div className="mt-4 bg-emerald-900/20 rounded-lg p-3 border border-emerald-700/30">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-emerald-400 text-sm">&#x2713;</span>
                  <p className="text-xs font-semibold text-emerald-300">AI Site Analysis Ready</p>
                  <button onClick={() => setAiNarrative(null)} className="ml-auto text-[10px] text-red-400 hover:text-red-300 underline">clear</button>
                </div>
                <p className="text-[11px] text-steel-300 leading-relaxed line-clamp-4">{aiNarrative}</p>
              </div>
            )}
          </div>
        )}

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
                  className="w-full bg-black border border-steel-800 rounded-lg px-3 py-2 text-sm text-steel-200 focus:ring-2 focus:ring-tan-400/40">
                  {Object.entries(FENCE_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>

                {/* Height selector: only for non-Stay-Tuff fences */}
                {!fenceType.startsWith('stay_tuff') && (
                  <div>
                    <label className="block text-xs font-medium text-steel-400 mb-1.5">Height</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {(['4ft','5ft','6ft','7ft','8ft'] as FenceHeight[]).map(h => (
                        <button key={h} onClick={() => setManualHeight(h)}
                          className={`py-1.5 rounded-lg text-xs font-semibold transition ${manualHeight === h ? 'bg-tan-400 text-black' : 'bg-black text-steel-400 hover:bg-steel-900 hover:text-steel-200'}`}>{h}</button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-steel-400 mb-1.5">Post Material</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {POST_MATERIALS.map(pm => (
                      <button key={pm.id} onClick={() => setPostMaterial(pm.id)}
                        className={`py-2 px-2 rounded-lg text-[11px] font-medium transition text-left ${postMaterial === pm.id ? 'bg-tan-400/10 text-tan-300 border border-tan-400/30' : 'bg-black text-steel-400 border border-white/[0.06] hover:bg-steel-900'}`}>
                        {pm.label}<span className="block text-[9px] opacity-70">{pm.diameter} &mdash; {pm.jointLengthFeet}ft joints</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Square tube gauge selector */}
                {currentGaugeOptions.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-steel-400 mb-1.5">Tube Gauge</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {currentGaugeOptions.map(g => (
                        <button key={g.gauge} onClick={() => setSquareTubeGauge(g.gauge)}
                          className={`py-1.5 px-2 rounded-lg text-[10px] font-medium transition text-center ${squareTubeGauge === g.gauge ? 'bg-tan-400 text-black' : 'bg-black text-steel-400 hover:bg-steel-900 hover:text-steel-200'}`}>
                          {g.gauge}<span className="block text-[9px] opacity-70">{g.wallThickness}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {fenceType.startsWith('stay_tuff') && (
                  <div>
                    <label className="block text-xs font-medium text-steel-400 mb-1">Wire Category</label>
                    <div className="grid grid-cols-2 gap-1.5 mb-2">
                      {(Object.entries(WIRE_CATEGORY_LABELS) as [WireCategory, string][]).map(([cat, label]) => (
                        <button key={cat} onClick={() => { setWireCategory(cat); const first = STAY_TUFF_CATALOG.find(p => p.category === cat); if (first) setSelectedStayTuff(first); }}
                          className={`py-1.5 px-2 rounded-lg text-[10px] font-medium transition text-left ${wireCategory === cat ? 'bg-tan-400/10 text-tan-300 border border-tan-400/30' : 'bg-black text-steel-400 border border-white/[0.06] hover:bg-steel-900'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="block text-xs font-medium text-steel-400 mb-1">Stay-Tuff Product</label>
                    <select title="Stay-Tuff product" value={selectedStayTuff.id}
                      onChange={e => { const o = STAY_TUFF_CATALOG.find(x => x.id === e.target.value); if (o) setSelectedStayTuff(o); }}
                      className="w-full bg-black border border-steel-800 rounded-lg px-3 py-2 text-sm text-steel-200 focus:ring-2 focus:ring-tan-400/40">
                      {filteredStayTuff.map(o => <option key={o.id} value={o.id}>{o.partNo} — {o.spec} ({o.description})</option>)}
                    </select>
                    <p className="text-[10px] text-steel-400 mt-1">
                      Wire height: {selectedStayTuff.height}&quot; &rarr; fence height: {fenceHeight} | {selectedStayTuff.rollLength}&apos; rolls | T-Post: {tPostRec.label}
                      {selectedStayTuff.madeToOrder && <span className="text-steel-300 ml-1">(Made to Order)</span>}
                    </p>
                    <p className="text-[9px] text-steel-500 mt-0.5">{selectedStayTuff.whereUsed}</p>
                  </div>
                )}
              </div>
            </Card>
            <Card title="Post Spacing" icon="&#x1f4cf;">
              <div className="space-y-4">
                <DSlider label="Line Post Spacing" value={linePostSpacing} min={30} max={70} step={1}
                  display={`${linePostSpacing} ft`} onChange={setLinePostSpacing} minLabel="30 ft" maxLabel="70 ft" />
                <DSlider label="T-Post Spacing" value={tPostSpacing} min={7} max={15} step={0.5}
                  display={`${tPostSpacing} ft`} onChange={setTPostSpacing} minLabel="7 ft" maxLabel="15 ft" />
                <div className="bg-black rounded-lg p-3 text-xs text-steel-400">
                  <div className="flex justify-between"><span>Line Posts (est):</span><span className="text-steel-200 font-semibold">{materialCalc.linePostCount}</span></div>
                  <div className="flex justify-between mt-1"><span>T-Posts ({tPostRec.label}):</span><span className="text-steel-200 font-semibold">{materialCalc.tPostCount}</span></div>
                </div>
              </div>
            </Card>

            {/* Top/Bottom Wire — only show for non-barbed-wire fence types */}
            {fenceType !== 'barbed_wire' && (
              <Card title="Top & Bottom Wire" icon="&#x2194;&#xfe0f;">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-steel-400 mb-1">Wire Type (runs above & below field wire)</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {([
                      { value: 'smooth' as TopWireType, label: 'Smooth HT Wire', desc: '12.5 ga smooth, 4,000\' rolls' },
                      { value: 'barbed' as TopWireType, label: 'Barbed Wire (single)', desc: 'Barbed, 1,320\' rolls — top & bottom' },
                      { value: 'barbed_double' as TopWireType, label: 'Double Barbed Top', desc: '2 barbed strands on top + 1 on bottom' },
                    ]).map(opt => (
                      <button key={opt.value} onClick={() => setTopWireType(opt.value)}
                        className={`py-2 px-3 rounded-lg text-left transition ${topWireType === opt.value ? 'bg-tan-400/10 text-tan-300 border border-tan-400/30' : 'bg-black text-steel-400 border border-white/[0.06] hover:bg-steel-900'}`}>
                        <span className="text-[11px] font-medium block">{opt.label}</span>
                        <span className="text-[9px] opacity-60">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                  {(topWireType === 'barbed' || topWireType === 'barbed_double') && (
                    <div className="mt-2">
                      <label className="block text-xs font-medium text-steel-400 mb-1">Barbed Wire Points</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {([
                          { value: '2_point' as BarbedWireType, label: '2-Point Barbed' },
                          { value: '4_point' as BarbedWireType, label: '4-Point Barbed' },
                        ]).map(opt => (
                          <button key={opt.value} onClick={() => setBarbedWireType(opt.value)}
                            className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition ${barbedWireType === opt.value ? 'bg-tan-400 text-black' : 'bg-black text-steel-400 hover:bg-steel-900'}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Barbed Wire only fences — 2pt or 4pt and strand count */}
            {fenceType === 'barbed_wire' && (
              <Card title="Barbed Wire Options" icon="&#x26a0;&#xfe0f;">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-steel-400 mb-1">Point Type</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      { value: '2_point' as BarbedWireType, label: '2-Point' },
                      { value: '4_point' as BarbedWireType, label: '4-Point' },
                    ]).map(opt => (
                      <button key={opt.value} onClick={() => setBarbedWireType(opt.value)}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition ${barbedWireType === opt.value ? 'bg-tan-400 text-black' : 'bg-black text-steel-400 hover:bg-steel-900'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* Wire Tie Pattern */}
            <Card title="Wire Tie Pattern" icon="&#x1f9f5;">
              <div className="grid grid-cols-1 gap-1.5">
                {([
                  { value: 'every_strand' as TiePattern, label: 'Every Strand', desc: 'Tie wire at every horizontal strand per post' },
                  { value: 'every_other' as TiePattern, label: 'Every Other Strand', desc: 'Tie wire at alternating strands' },
                  { value: 'four_per_post' as TiePattern, label: '4 Per Post', desc: '4 ties per post, evenly spaced' },
                ]).map(opt => (
                  <button key={opt.value} onClick={() => setTiePattern(opt.value)}
                    className={`py-2 px-3 rounded-lg text-left transition ${tiePattern === opt.value ? 'bg-tan-400/10 text-tan-300 border border-tan-400/30' : 'bg-black text-steel-400 border border-white/[0.06] hover:bg-steel-900'}`}>
                    <span className="text-[11px] font-medium block">{opt.label}</span>
                    <span className="text-[9px] opacity-60">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </Card>

            {/* Accessories & Upsells */}
            <Card title="Accessories" icon="&#x2699;&#xfe0f;">
              <div className="space-y-2.5">
                {([
                  { get: includePostCaps, set: setIncludePostCaps, label: 'Post Caps', desc: 'Prevents rain intrusion on square tube posts' },
                  { get: includeTensioners, set: setIncludeTensioners, label: 'Inline Tensioners', desc: 'Tensioners at H-braces and every 660\' on long runs' },
                  { get: includeSpringIndicators, set: setIncludeSpringIndicators, label: 'Spring Tension Indicators', desc: 'Visual indicators showing wire tension at each H-brace' },
                  { get: concreteFillPosts, set: setConcreteFillPosts, label: 'Concrete-Filled Posts', desc: 'Fill square tube posts with concrete for maximum rigidity' },
                ]).map(opt => (
                  <label key={opt.label} className="flex items-center gap-3 cursor-pointer group">
                    <div className={`w-10 h-5 rounded-full transition relative ${opt.get ? 'bg-white' : 'bg-black'}`}
                      onClick={() => opt.set(!opt.get)}>
                      <div className={`absolute w-4 h-4 bg-white rounded-full top-0.5 transition-all ${opt.get ? 'left-5' : 'left-0.5'}`} />
                    </div>
                    <div>
                      <span className="text-[11px] text-steel-300 font-medium block group-hover:text-steel-200">{opt.label}</span>
                      <span className="text-[9px] text-steel-500">{opt.desc}</span>
                    </div>
                  </label>
                ))}
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
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition text-left ${preferredHBrace === bt ? 'bg-tan-400/10 text-tan-300 border border-tan-400/30' : 'bg-black text-steel-400 border border-white/[0.06] hover:bg-steel-900'}`}>{spec?.label}</button>;
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-steel-400 mb-1">Corner Brace Style</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['corner_brace', 'n_brace'] as BraceType[]).map(bt => {
                      const spec = BRACE_SPECS.find(b => b.id === bt);
                      return <button key={bt} onClick={() => setPreferredCornerBrace(bt)}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition text-left ${preferredCornerBrace === bt ? 'bg-tan-400/10 text-tan-300 border border-tan-400/30' : 'bg-black text-steel-400 border border-white/[0.06] hover:bg-steel-900'}`}>{spec?.label}</button>;
                    })}
                  </div>
                </div>
                {braceRecommendations.length > 0 && (
                  <div className="bg-black rounded-lg p-3 text-xs space-y-1">
                    <p className="text-steel-400 font-medium">Auto-detected from map:</p>
                    <p className="text-steel-300">H-Braces: <strong className="text-white">{materialCalc.hBraces}</strong> | Corner: <strong className="text-white">{materialCalc.cornerBraces}</strong></p>
                  </div>
                )}
              </div>
            </Card>

            <Card title="Pricing" icon="&#x1f4b0;">
              <div className="space-y-4">
                {/* Material cost breakdown (auto-calculated) */}
                <div className="bg-black/60 rounded-lg p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-steel-400 uppercase tracking-wider mb-2">Material Cost / Ft (auto)</p>
                  {[
                    { label: `Wire (${fenceType.startsWith('stay_tuff') ? selectedStayTuff.height + '"' : FENCE_TYPES[fenceType]?.split(' ').slice(-2).join(' ') || fenceType})`, value: materialCostPerFoot.wire },
                    { label: 'Top Wire (HT smooth)', value: materialCostPerFoot.topWire },
                    { label: `T-Posts (${tPostRec.label} @ ${tPostSpacing}' spacing)`, value: materialCostPerFoot.tPosts },
                    { label: `Line Posts (${POST_MATERIALS.find(p => p.id === postMaterial)?.label ?? postMaterial} @ ${linePostSpacing}')`, value: materialCostPerFoot.linePosts },
                    { label: `Concrete${soilMultiplier > 1 ? ` (${soilMultiplier}x soil adj.)` : ''}`, value: materialCostPerFoot.concrete },
                    { label: 'Hardware (clips, ties)', value: materialCostPerFoot.hardware },
                    ...(materialCostPerFoot.accessories > 0 ? [{ label: 'Accessories (caps, tensioners, indicators)', value: materialCostPerFoot.accessories }] : []),
                    ...(materialCostPerFoot.steepSurcharge > 0 ? [{ label: `Steep Grade Surcharge (${steepFootage}' >15%)`, value: materialCostPerFoot.steepSurcharge }] : []),
                  ].map(row => (
                    <div key={row.label} className="flex justify-between items-center">
                      <span className="text-[10px] text-steel-500">{row.label}</span>
                      <span className="text-[10px] text-steel-300 font-mono">${row.value.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t border-steel-800 pt-1.5 mt-1.5 flex justify-between items-center">
                    <span className="text-xs text-steel-300 font-semibold">Material Total</span>
                    <span className="text-xs text-white font-bold font-mono">${materialCostPerFoot.total.toFixed(2)}/ft</span>
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
                    <div className="mb-2 bg-steel-900/40 border border-white/[0.08] rounded-lg p-2 text-[10px] text-steel-200">
                      <span className="font-semibold">&#x26a1; AI Suggested: {TERRAIN_MAP[terrainSuggestion.suggestedDifficulty]?.label}</span>
                      {terrainSuggestion.soilType && (
                        <>
                          <span className="block text-steel-300 mt-0.5 font-semibold">&#x1f30d; Soil: {terrainSuggestion.soilType}</span>
                          {terrainSuggestion.drainage && (
                            <span className="block text-steel-500">Drainage: {terrainSuggestion.drainage}</span>
                          )}
                          <span className="block text-steel-400">Concrete multiplier: {soilMultiplier}x (based on soil difficulty)</span>
                        </>
                      )}
                      {!terrainSuggestion.soilType && (
                        <span className="block text-steel-500 mt-0.5">&#x26a0;&#xfe0f; Soil data unavailable &mdash; using default difficulty</span>
                      )}
                      <span className="block text-steel-400">Elev change: {Math.round(terrainSuggestion.elevationChange)} ft | Confidence: {Math.round(terrainSuggestion.confidence * 100)}%</span>
                      {steepFootage > 0 && (
                        <span className="block text-red-400 font-semibold mt-0.5">⚠ {steepFootage}' of steep grade (&gt;15%) — $2/ft surcharge applied</span>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(TERRAIN_MAP).map(([k, v]) => (
                      <button key={k} onClick={() => setTerrain(k)}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition text-left ${terrain === k ? 'bg-tan-400/10 text-tan-300 border border-tan-400/30' : 'bg-black text-steel-400 border border-white/[0.06] hover:bg-steel-900'}`}>
                        {v.label}<span className="block text-[9px] opacity-70">{v.mult}x labor rate</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Effective rate summary */}
                <div className="bg-steel-900/60 rounded-lg p-3 border border-white/[0.08] space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-steel-200">Effective Rate</span>
                    <span className="text-lg font-bold text-white">${effectiveRate.toFixed(2)}/ft</span>
                  </div>
                  <div className="text-[10px] text-steel-500 space-y-0.5">
                    <div className="flex justify-between"><span>Material:</span><span>${materialCostPerFoot.total.toFixed(2)}/ft</span></div>
                    <div className="flex justify-between"><span>Labor ({terrainMult}x):</span><span>${(laborRate * terrainMult).toFixed(2)}/ft</span></div>
                    <div className="flex justify-between border-t border-white/[0.08] pt-0.5"><span className="font-semibold">Combined:</span><span className="font-semibold">${effectiveRate.toFixed(2)}/ft</span></div>
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
                  <div className={`w-10 h-5 rounded-full transition relative ${includePainting ? 'bg-white' : 'bg-black'}`}
                    onClick={() => setIncludePainting(!includePainting)}>
                    <div className={`absolute w-4 h-4 bg-white rounded-full top-0.5 transition-all ${includePainting ? 'left-5' : 'left-0.5'}`} />
                  </div>
                  <span className="text-sm text-steel-300">Paint all steel</span>
                </label>
                {includePainting && (
                  <>
                    <DInput value={paintColor} onChange={setPaintColor} placeholder="Paint color" />
                    {paintEst && (
                      <div className="bg-black rounded-lg p-3 text-xs text-steel-400 space-y-1">
                        <div className="flex justify-between"><span>Paint:</span><span className="text-steel-200">{paintEst.gallonsNeeded} gallons</span></div>
                        <div className="flex justify-between"><span>Material:</span><span className="text-steel-200">${fmt(paintEst.materialCost)}</span></div>
                        <div className="flex justify-between"><span>Labor:</span><span className="text-steel-200">${fmt(paintEst.laborCost)}</span></div>
                        <div className="flex justify-between border-t border-steel-800 pt-1 mt-1"><span className="font-medium text-steel-300">Total:</span><span className="font-bold text-white">${fmt(paintEst.totalCost)}</span></div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>

            <Card title="Overview Text" icon="&#x1f4dd;">
              <textarea value={projectOverview} onChange={e => setProjectOverview(e.target.value)} rows={3}
                className="w-full bg-black border border-steel-800 rounded-lg px-3 py-2 text-xs text-steel-300 focus:ring-2 focus:ring-tan-400/40" placeholder="Describe the project scope..." />
            </Card>
          </div>
          {/* RIGHT MAIN AREA */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-5 animate-fade-in">

            <div className="flex gap-2">
              {(['config', 'preview', 'pricing'] as const).map(t => (
                <TabBtn key={t} label={t === 'config' ? 'Sections & Gates' : t === 'preview' ? 'Bid Preview' : 'Material Pricing'} active={activeTab === t} onClick={() => setActiveTab(t)} />
              ))}
            </div>

            {activeTab === 'config' && (
              <div className="space-y-5 animate-fade-in">

                <div className="card-dark overflow-hidden">
                  <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                    <h2 className="text-steel-200 font-semibold text-sm">Fence Sections</h2>
                    <button onClick={addSection} className="text-xs bg-tan-400/10 text-tan-300 px-3 py-1.5 rounded-lg font-semibold hover:bg-white/20 transition">+ Add Section</button>
                  </div>
                  <div className="divide-y divide-steel-700/20">
                    {computed.map((sec, idx) => (
                      <div key={sec.id} className="px-5 py-3">
                        <div className="grid grid-cols-12 gap-3 items-center">
                          <div className="col-span-4"><input type="text" value={sec.name} onChange={e => updSec(sec.id, { name: e.target.value })} className="w-full bg-black border border-steel-800 rounded px-2.5 py-1.5 text-sm text-steel-200 font-medium focus:ring-1 focus:ring-tan-400/40" /></div>
                          <div className="col-span-2"><input title="Linear feet" type="number" value={sections[idx]?.linearFeet || 0} onChange={e => updSec(sec.id, { linearFeet: parseInt(e.target.value) || 0 })} className="w-full bg-black border border-steel-800 rounded px-2.5 py-1.5 text-sm text-right text-steel-200 focus:ring-1 focus:ring-tan-400/40" /></div>
                          <div className="col-span-2"><input type="number" step={0.5} value={sections[idx]?.ratePerFoot || ''} onChange={e => updSec(sec.id, { ratePerFoot: parseFloat(e.target.value) || 0 })} className="w-full bg-black border border-steel-800 rounded px-2.5 py-1.5 text-sm text-right text-steel-200 pl-5 focus:ring-1 focus:ring-tan-400/40" placeholder={effectiveRate.toFixed(2)} /></div>
                          <div className="col-span-3 text-right"><span className="text-sm font-bold text-white">${fmt(sec.total)}</span></div>
                          <div className="col-span-1 text-right">{computed.length > 1 && <button onClick={() => rmSec(sec.id)} className="text-steel-500 hover:text-red-400 transition">&times;</button>}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card-dark overflow-hidden">
                  <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                    <h2 className="text-steel-200 font-semibold text-sm">Gates</h2>
                    <div className="flex gap-1.5 flex-wrap">
                      {GATE_SPECS.map(gs => (
                        <button key={gs.size} onClick={() => addGate(gs)}
                          className="text-[10px] bg-black text-steel-400 px-2 py-1 rounded font-medium hover:bg-steel-900 hover:text-steel-200 transition">+ {gs.label}</button>
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
                              <input title="Gate type" type="text" value={g.type} onChange={e => updGate(g.id, { type: e.target.value })} className="flex-1 bg-black border border-steel-800 rounded px-2.5 py-1.5 text-sm text-steel-200 focus:ring-1 focus:ring-tan-400/40" />
                              <div className="relative w-32">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-steel-500">$</span>
                                <input title="Gate cost" type="number" value={g.cost} onChange={e => updGate(g.id, { cost: parseFloat(e.target.value) || 0 })} className="w-full bg-black border border-steel-800 rounded px-2.5 py-1.5 text-sm text-right text-steel-200 pl-5 focus:ring-1 focus:ring-tan-400/40" />
                              </div>
                              <button onClick={() => rmGate(g.id)} className="text-steel-500 hover:text-red-400 transition">&times;</button>
                            </div>
                            {spec && (
                              <div className="mt-2 bg-black/50 rounded p-2 text-[10px] text-steel-500">
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
                <div className="px-6 py-4 bg-gradient-to-r from-steel-900 to-steel-800 border-b border-steel-800">
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
                          <tr key={sec.id} className={i % 2 === 0 ? 'bg-steel-900/50' : ''}>
                            <td className="px-3 py-2 text-steel-300">{sec.name}</td>
                            <td className="px-3 py-2 text-right text-steel-400">{sec.linearFeet.toLocaleString()} ft @ ${sec.ratePerFoot.toFixed(2)}/ft</td>
                            <td className="px-3 py-2 text-right font-semibold text-steel-200">${fmt(sec.total)}</td>
                          </tr>
                        ))}
                        {gates.map(g => (
                          <tr key={g.id} className="bg-steel-900/30">
                            <td className="px-3 py-2 text-steel-300">{g.type}</td>
                            <td className="px-3 py-2 text-right text-steel-500">incl. hardware &amp; install</td>
                            <td className="px-3 py-2 text-right font-semibold text-steel-200">${fmt(g.cost)}</td>
                          </tr>
                        ))}
                        {includePainting && paintEst && (
                          <tr className="bg-steel-900/30">
                            <td className="px-3 py-2 text-steel-300">Painting ({paintColor})</td>
                            <td className="px-3 py-2 text-right text-steel-500">{paintEst.gallonsNeeded} gal + labor</td>
                            <td className="px-3 py-2 text-right font-semibold text-steel-200">${fmt(paintEst.totalCost)}</td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot><tr className="border-t-2 border-steel-600">
                        <td className="px-3 py-2 font-bold text-steel-200">{totalFeet.toLocaleString()} total ft</td>
                        <td></td>
                        <td className="px-3 py-2 text-right font-bold text-xl text-white">${fmt(projTotal)}</td>
                      </tr></tfoot>
                    </table>
                  </div>

                  <div className="bg-black/50 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-steel-300 mb-2">Material Summary</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                      <div><span className="text-steel-500">Post Material:</span> <span className="text-steel-200">{POST_MATERIALS.find(p => p.id === postMaterial)?.label ?? postMaterial}{currentGaugeOptions.length > 0 ? ` ${squareTubeGauge}` : ''} ({POST_MATERIALS.find(p => p.id === postMaterial)?.jointLengthFeet ?? 20}&apos; joints)</span></div>
                      <div><span className="text-steel-500">Line Posts:</span> <span className="text-steel-200">{materialCalc.linePostCount} @ {linePostSpacing}' spacing</span></div>
                      <div><span className="text-steel-500">T-Posts:</span> <span className="text-steel-200">{materialCalc.tPostCount} ({tPostRec.label}) @ {tPostSpacing}' spacing</span></div>
                      <div><span className="text-steel-500">H-Braces:</span> <span className="text-steel-200">{materialCalc.hBraces}</span></div>
                      <div><span className="text-steel-500">Corner Braces:</span> <span className="text-steel-200">{materialCalc.cornerBraces}</span></div>
                      <div><span className="text-steel-500">Wire Rolls:</span> <span className="text-steel-200">{materialCalc.wireRolls} ({fenceType.startsWith('stay_tuff') ? selectedStayTuff.rollLength : 330}&apos; ea)</span></div>
                      <div><span className="text-steel-500">Concrete:</span> <span className="text-steel-200">{materialCalc.concreteBags} bags (80lb)</span></div>
                      <div><span className="text-steel-500">Gates:</span> <span className="text-steel-200">{gates.length}</span></div>
                      {materialCalc.postCapsQty > 0 && <div><span className="text-steel-500">Post Caps:</span> <span className="text-steel-200">{materialCalc.postCapsQty}</span></div>}
                      {materialCalc.tensionersQty > 0 && <div><span className="text-steel-500">Tensioners:</span> <span className="text-steel-200">{materialCalc.tensionersQty}</span></div>}
                      {materialCalc.springIndicatorsQty > 0 && <div><span className="text-steel-500">Spring Indicators:</span> <span className="text-steel-200">{materialCalc.springIndicatorsQty}</span></div>}
                      {materialCalc.concreteFillPostsQty > 0 && <div><span className="text-steel-500">Concrete Fill (posts):</span> <span className="text-steel-200">{materialCalc.concreteFillPostsQty}</span></div>}
                      {materialCalc.concreteFillBracesQty > 0 && <div><span className="text-steel-500">Concrete Fill (braces):</span> <span className="text-steel-200">{materialCalc.concreteFillBracesQty}</span></div>}
                      {steepFootage > 0 && <div><span className="text-red-400">Steep Grade:</span> <span className="text-red-300">{steepFootage}' (&gt;15%) — surcharge applied</span></div>}
                      {includePainting && <div><span className="text-steel-500">Paint:</span> <span className="text-steel-200">{paintEst?.gallonsNeeded || 0} gallons ({paintColor})</span></div>}
                    </div>
                  </div>

                  <div className="bg-steel-900/50 rounded-lg p-4 border border-white/[0.08]">
                    <h4 className="text-sm font-bold text-steel-200 mb-2 uppercase tracking-wide">Payment Schedule</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between text-steel-300"><span>Deposit ({depositPercent}% - due at signing)</span><span className="font-semibold text-steel-200">${fmt(deposit)}</span></div>
                      <div className="flex justify-between text-steel-300"><span>Balance (due at completion)</span><span className="font-semibold text-steel-200">${fmt(balance)}</span></div>
                      <div className="flex justify-between border-t border-white/[0.08] pt-1 mt-1"><span className="font-bold text-steel-200">Project Total</span><span className="font-bold text-xl text-white">${fmt(projTotal)}</span></div>
                    </div>
                  </div>

                  <p className="text-sm text-steel-400"><strong>Timeline:</strong> {timelineDays} to {timelineDays + Math.ceil(timelineDays * 0.25)} working days</p>

                  <button onClick={handleDownloadPDF}
                    className="w-full bg-tan-400 text-black font-bold py-3 px-4 rounded-lg hover:bg-tan-300 transition text-sm">
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
                        if (result.updated > 0) saveSharedPricesToServer();
                      }} className="text-xs bg-tan-400/10 text-tan-300 px-3 py-1.5 rounded-lg font-semibold hover:bg-white/20 transition">
                        &#x26a1; Sync from Receipts ({priceDatabase.length} prices)
                      </button>
                    </div>
                    <p className="text-[10px] text-steel-500">
                      Update material prices below using your uploaded receipts. Go to
                      <Link href="/pricing" className="text-white hover:text-steel-200 mx-1 underline">Material Pricing</Link>
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
                        <h4 className="text-xs font-bold text-white uppercase tracking-wide mb-2">{cat}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {materialPrices.filter(m => m.category === cat).map(mp => (
                            <div key={mp.id} className="flex items-center gap-2 bg-steel-900/50 rounded px-3 py-2">
                              <span className="flex-1 text-xs text-steel-300 truncate" title={mp.name}>{mp.name}</span>
                              <span className="text-xs text-steel-500">/{mp.unit}</span>
                              <input type="number" step="0.01" min="0"
                                className="w-20 bg-steel-800 text-right text-sm text-steel-200 px-2 py-1 rounded border border-steel-700 focus:border-tan-400/60 focus:outline-none"
                                value={mp.price}
                                onChange={e => {
                                  const v = parseFloat(e.target.value) || 0;
                                  updateMaterialPrice(mp.id, v);
                                }}
                                onBlur={() => saveSharedPricesToServer()}
                              />
                              <button className="text-xs text-steel-600 hover:text-white" title="Reset"
                                onClick={() => { updateMaterialPrice(mp.id, mp.defaultPrice); saveSharedPricesToServer(); }}
                              >?</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                  <button className="mt-2 text-xs text-steel-500 hover:text-white underline"
                    onClick={() => { resetMaterialPrices(); saveSharedPricesToServer(); }}>
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
              <span className="text-steel-500">Eff Rate: <strong className="text-white">${effectiveRate.toFixed(2)}/ft</strong></span>
              <span className="text-steel-500">Gates: <strong className="text-steel-200">{gates.length}</strong></span>
              <span className="text-steel-500">Braces: <strong className="text-steel-200">{materialCalc.hBraces + materialCalc.cornerBraces}</strong></span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-steel-400">Deposit ({depositPercent}%): <strong className="text-steel-200">${fmt(deposit)}</strong></span>
              <span className="text-lg font-bold text-white">${fmt(projTotal)}</span>
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
      {label && <label className="block text-xs text-steel-500 mb-1 uppercase tracking-wider">{label}</label>}
      <div className="flex items-center gap-1">
        <input type={type} value={value} placeholder={placeholder}
          className="w-full bg-black text-sm text-steel-200 px-3 py-2 border border-steel-800 focus:border-tan-400/60 focus:outline-none transition"
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
        <label className="text-xs text-steel-500 uppercase tracking-wider">{label}</label>
        <span className="text-xs font-mono text-white">{display ?? value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        className="w-full"
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
      className={`px-4 py-2 text-xs font-medium uppercase tracking-wider transition ${active ? 'bg-steel-800 text-white border-b border-white' : 'text-steel-500 hover:text-steel-200'}`}>
      {label}
    </button>
  );
}