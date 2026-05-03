import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// POST /api/site-analysis
// Generates structured bid narrative sections using Claude
// (Anthropic) or GPT (OpenAI) based on real soil, terrain,
// property data, AND the user's selected materials/quantities.
// Called at PDF download time so the user can finish configuring.
// ============================================================

interface SiteAnalysisRequest {
  // Project & client context
  clientName?: string;
  projectName?: string;
  projectOverview?: string;
  propertyAddress: string;
  // Soil & terrain
  soilType: string | null;
  soilComponents: { name: string; percent: number; drainage?: string; hydric?: string }[];
  drainage: string | null;
  hydric: string | null;
  elevationChange: number;
  suggestedDifficulty: string;
  // Fence configuration
  fenceType: string;
  fenceHeight: string;
  totalLinearFeet: number;
  postMaterial: string;
  postMaterialLabel?: string;
  squareTubeGauge?: string;
  source: string | null;
  // Enriched SDA data
  bedrockDepthIn?: number | null;
  restrictionType?: string | null;
  slopeRange?: string | null;
  runoff?: string | null;
  taxonomy?: string | null;
  texture?: string | null;
  clayPct?: number | null;
  rockFragmentPct?: number | null;
  pH?: number | null;
  // Pricing & labor context
  projectTotal?: number;
  workingDays?: number;
  enclosedAcreage?: number;
  gateDetails?: { type: string; width: number }[];
  sectionDetails?: { name: string; linearFeet: number; terrain: string }[];
  painting?: { color: string; gallons: number };
  steepFootage?: number;
  // Materials & quantities (passed at PDF download time)
  materials?: {
    linePostCount: number;
    tPostCount: number;
    hBraces: number;
    cornerBraces: number;
    doubleHBraces: number;
    totalBraces: number;
    wireRolls: number;
    concreteBags: number;
    waterGapCount: number;
    gateCount: number;
    postCaps: number;
    tensioners: number;
    springIndicators: number;
    stayTuffModel?: string;
    stayTuffDescription?: string;
    topWireType: string;
    tPostSpacing: number;
    linePostSpacing: number;
    wireHeightInches?: number;
    // Pipe-fence-specific (only populated when fenceType is a pipe fence — supersedes
    // T-post / line-post-spacing fields above, which do not apply to pipe fences).
    pipeFence?: {
      uprightMaterialLabel: string;   // e.g. "2-7/8\" Drill Stem"
      railMaterialLabel: string;      // e.g. "2-3/8\" Drill Stem"
      uprightCount: number;
      railJoints: number;
      railTotalFeet: number;
      postSpacingFeet: number;
      fenceHeightFeet: number;
      railCount: number;
      topRailStyle: 'continuous' | 'caps';
      finish: 'painted' | 'bare';
      paintColor?: string;
      weldsCount: number;
      paintGallons: number;
    };
  };
}

const SYSTEM_PROMPT = `You are writing as the owner of Hayden Ranch Services, a small fencing company in the Texas Hill Country. You are writing 5 sections of a fence bid proposal that you're handing to a ranch or property owner. It should read like YOU wrote it — a real contractor who knows dirt, rock, and fence posts.

Voice & tone rules:
- First person plural: "we," "our," "our crew." This is YOUR bid.
- Talk like a contractor at the kitchen table, not a textbook. Short sentences. Plain words. No jargon unless you immediately explain it in everyday terms.
- You're confident because you've done this hundreds of times, not because you're trying to impress anyone.
- Be direct — say what you found, what it means for the fence, and what you're going to do about it.
- A little personality is fine: "That's the good news," or "We've seen worse," or "This is the kind of ground that eats auger bits for breakfast." Don't overdo it.

You MUST return valid JSON with exactly these 5 keys. Each value is a string of flowing paragraphs (NO bullet points, headers, bold, markdown, or any formatting). Separate paragraphs with \\n\\n.

{
  "understandingYourLand": "2-3 paragraphs, 150-250 words. Open with what the soil survey says — name the soil type, where the data came from, what it means plain and simple. Explain how understanding the ground drives every decision in the build. Reference your equipment (80-horse tractor with Beltech, skid steer auger) if relevant.",
  "soilProfile": "2-3 paragraphs, 150-250 words. Scientific classification in human terms. If taxonomy data exists, explain what the soil order means for fence posts (Mollisols = rich grassland soil, settling risk; Vertisols = shrink-swell clay; Alfisols = clay subsoil anchoring; etc). Describe soil components and percentages. Skip if no taxonomy data — write 'null' as the value.",
  "belowTheSurface": "2-3 paragraphs, 150-250 words. Bedrock depth vs. the 30-36 inch post requirement. Rock fragment percentages and what that means for augering. Equipment you'll bring. If bedrock is shallow (<24\\"), explain every hole gets drilled and that rock-anchored posts are actually the strongest installation. Skip if no bedrock data — write 'null'.",
  "terrainDrainageWater": "1-2 paragraphs, 100-200 words. Elevation change expressed as slope percentage over the fence length. Drainage classification and what it means for concrete curing and post longevity. Hydric indicators if present. Runoff class. Skip if minimal data — write 'null'.",
  "materialSelection": "2-3 paragraphs, 200-300 words. THIS IS THE KEY SECTION. You have the exact materials and quantities being used. Name every material: the specific post type and diameter, the wire model, the spacing, number of braces, concrete bags, accessories. Explain WHY each was chosen for THIS property's soil and terrain — tie each material decision back to a specific finding from the soil/terrain data. End with a confidence statement that this is not a generic bid. IF the build is a WELDED PIPE FENCE (uprights + horizontal rails, no T-posts, no woven wire), describe uprights, rail count/style, post spacing, welds, and finish — never mention T-posts, line-post spacing, woven wire, or wire rolls."
}

Hard rules:
- Return ONLY the JSON object. No text before or after.
- NO pricing or dollar amounts anywhere.
- NO invented data — only reference what is provided in the input.
- NO comparing elevation to building stories. Express elevation as slope percentage.
- Always name the EXACT post material (e.g., "2-3/8 inch drill stem" not "steel posts").
- Always reference EXACT quantities from the materials data when available.
- If a section has insufficient data, set its value to null.
- The materialSelection section should ALWAYS be written if materials data is provided.`;

export async function POST(req: NextRequest) {
  try {
    const body: SiteAnalysisRequest = await req.json();
    const userPrompt = buildUserPrompt(body);

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    let raw: string | null = null;
    let provider: 'claude' | 'openai' | 'none' = 'none';

    if (anthropicKey && anthropicKey !== 'your_anthropic_api_key_here') {
      raw = await callClaude(anthropicKey, userPrompt);
      provider = 'claude';
    } else if (openaiKey && openaiKey !== 'your_openai_api_key_here') {
      raw = await callOpenAI(openaiKey, userPrompt);
      provider = 'openai';
    }

    if (!raw) {
      return NextResponse.json({ sections: null, narrative: null, provider: 'none' });
    }

    // Parse structured JSON from the AI response
    try {
      // Strip markdown code fences if present
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const sections = JSON.parse(cleaned);
      // Build a combined narrative for backward compat
      const narrative = [
        sections.understandingYourLand,
        sections.soilProfile,
        sections.belowTheSurface,
        sections.terrainDrainageWater,
        sections.materialSelection,
      ].filter(Boolean).join('\n\n');
      return NextResponse.json({ sections, narrative, provider });
    } catch {
      // AI didn't return valid JSON — treat entire response as the old single-narrative format
      return NextResponse.json({ sections: null, narrative: raw, provider });
    }
  } catch (err) {
    console.error('Site analysis error:', err);
    return NextResponse.json(
      { error: 'Failed to generate site analysis', sections: null, narrative: null },
      { status: 500 },
    );
  }
}

function buildUserPrompt(data: SiteAnalysisRequest): string {
  const parts: string[] = [];
  const totalFeet = Number(data.totalLinearFeet) || 0;
  const elevChange = Number(data.elevationChange) || 0;

  // ── Client & project context ──
  if (data.clientName) parts.push(`Customer: ${data.clientName}`);
  if (data.projectName) parts.push(`Project name: ${data.projectName}`);
  parts.push(`Property location: ${data.propertyAddress || 'Texas Hill Country property'}`);
  parts.push(`Fence project: ${totalFeet > 0 ? totalFeet.toLocaleString() : 'TBD'} linear feet of ${data.fenceType || 'fencing'} at ${data.fenceHeight || 'standard'} height`);
  if (data.enclosedAcreage) parts.push(`Estimated enclosed area: ~${data.enclosedAcreage} acres`);
  if (data.workingDays) parts.push(`Estimated timeline: ${data.workingDays} working days`);
  if (data.projectOverview) parts.push(`Project scope: ${data.projectOverview}`);
  // Describe the actual selected post material
  let postDesc = data.postMaterialLabel || data.postMaterial;
  if (data.squareTubeGauge) postDesc += ` ${data.squareTubeGauge}`;
  parts.push(`Post material selected by customer: ${postDesc}`);

  if (data.soilType) {
    parts.push(`\nSoil survey source: ${data.source === 'UC_Davis_SoilWeb' ? 'UC Davis SoilWeb database (USDA NRCS data)' : 'USDA NRCS Web Soil Survey'}`);
    parts.push(`Primary soil type: "${data.soilType}"`);
  }

  if (data.soilComponents && data.soilComponents.length > 0) {
    const compList = data.soilComponents
      .map(c => `${c.name} (${c.percent}%${c.drainage ? ', ' + c.drainage + ' drainage' : ''}${c.hydric === 'Yes' ? ', hydric' : ''})`)
      .join('; ');
    parts.push(`Soil components: ${compList}`);
  }

  if (data.drainage) parts.push(`Drainage classification: ${data.drainage}`);
  if (data.hydric) parts.push(`Hydric (wetland) indicator: ${data.hydric}`);

  // ── Enriched USDA SDA data ──
  if (data.bedrockDepthIn != null) {
    const ft = Math.floor(data.bedrockDepthIn / 12);
    const inches = data.bedrockDepthIn % 12;
    const depthStr = ft > 0 ? `${ft} feet ${inches > 0 ? inches + ' inches' : ''}` : `${data.bedrockDepthIn} inches`;
    parts.push(`\nDepth to bedrock: ${depthStr} (${data.restrictionType || 'bedrock'})`);
    parts.push(`IMPORTANT: A standard fence post is set 2.5-3 feet deep. Bedrock at ${depthStr} means ${data.bedrockDepthIn <= 24 ? 'rock drilling equipment will be required for every post hole' : data.bedrockDepthIn <= 36 ? 'many post holes will bottom out on rock' : 'deeper posts may encounter rock in some areas'}.`);
  }

  if (data.texture) parts.push(`Soil texture (top horizon): ${data.texture}`);
  if (data.rockFragmentPct != null && data.rockFragmentPct > 0) {
    parts.push(`Rock fragment content: ${data.rockFragmentPct}% coarse fragments (cobbles and stones in the soil matrix)`);
  }
  if (data.clayPct != null) parts.push(`Clay content: ${data.clayPct}%${data.clayPct >= 35 ? ' (high — expect swelling/shrinking with moisture changes)' : ''}`);
  if (data.pH != null) parts.push(`Soil pH: ${data.pH}${data.pH >= 7.5 ? ' (alkaline — favorable for metal post longevity)' : data.pH <= 5.5 ? ' (acidic — may accelerate metal corrosion over decades)' : ' (near neutral)'}`);
  if (data.slopeRange) parts.push(`USDA slope range: ${data.slopeRange}`);
  if (data.runoff) parts.push(`Surface runoff class: ${data.runoff}`);
  if (data.taxonomy) parts.push(`Soil taxonomy: ${data.taxonomy}`);

  if (elevChange > 0) parts.push(`\nElevation change across fence line: approximately ${Math.round(elevChange)} feet`);
  if (data.steepFootage && data.steepFootage > 0) parts.push(`Steep grade footage (>15% slope): ${data.steepFootage} feet`);
  parts.push(`Terrain difficulty classification: ${data.suggestedDifficulty || 'moderate'}`);

  // ── Fence line sections ──
  if (data.sectionDetails && data.sectionDetails.length > 0) {
    parts.push('\n=== FENCE LINE SECTIONS ===');
    for (const sec of data.sectionDetails) {
      parts.push(`${sec.name}: ${sec.linearFeet.toLocaleString()} linear feet (${sec.terrain} terrain)`);
    }
  }

  // ── Gates ──
  if (data.gateDetails && data.gateDetails.length > 0) {
    parts.push('\n=== GATES ===');
    for (const g of data.gateDetails) {
      parts.push(`${g.type} (${g.width}' wide)`);
    }
  }

  // ── Painting ──
  if (data.painting) {
    parts.push(`\nPost painting: ${data.painting.color}, ${data.painting.gallons} gallons`);
  }

  // ── Materials & quantities (from user selections) ──
  if (data.materials) {
    const m = data.materials;
    parts.push('\n=== SELECTED MATERIALS & QUANTITIES ===');
    if (m.pipeFence) {
      // Pipe-fence builds use uprights + horizontal rails (no T-posts, no woven
      // wire). Tell the AI explicitly so the narrative doesn't reference
      // T-post spacing or line-post spacing — those concepts don't exist here.
      const pf = m.pipeFence;
      parts.push(`Fence style: WELDED PIPE FENCE — uprights + horizontal rails (NO T-posts, NO woven wire, NO line-post spacing concept).`);
      parts.push(`Uprights: ${pf.uprightCount} × ${pf.uprightMaterialLabel}, set every ${pf.postSpacingFeet}' along the fence line.`);
      parts.push(`Fence height: ${pf.fenceHeightFeet}' tall with ${pf.railCount} horizontal rail${pf.railCount > 1 ? 's' : ''}.`);
      parts.push(`Rails: ${pf.railJoints} joints of ${pf.railMaterialLabel} (${pf.railTotalFeet.toLocaleString()} ft total).`);
      parts.push(`Top rail style: ${pf.topRailStyle === 'continuous' ? 'continuous top rail welded across post tops' : 'rails butt-welded between posts with post caps'}.`);
      parts.push(`Total rail-to-post welds: ${pf.weldsCount.toLocaleString()}.`);
      parts.push(`Finish: ${pf.finish === 'painted' ? `painted ${pf.paintColor || ''} (${pf.paintGallons} gallons)` : 'bare steel (will rust naturally)'}`);
      parts.push(`H-brace assemblies: ${m.hBraces}`);
      parts.push(`Corner brace assemblies: ${m.cornerBraces}`);
      if (m.doubleHBraces > 0) parts.push(`Double H-brace assemblies: ${m.doubleHBraces}`);
      parts.push(`Total brace assemblies: ${m.totalBraces}`);
      parts.push(`Concrete bags (80 lb): ${m.concreteBags}`);
      if (m.gateCount > 0) parts.push(`Gates: ${m.gateCount}`);
      parts.push(`IMPORTANT: Do NOT mention T-posts, line-post spacing, woven wire, wire rolls, or top-wire selections — none apply to a pipe fence. Reference uprights, rails, welds, and (where relevant) paint instead.`);
    } else {
      parts.push(`Wire: ${m.stayTuffModel ? `Stay-Tuff ${m.stayTuffModel}` : data.fenceType}${m.stayTuffDescription ? ` — ${m.stayTuffDescription}` : ''}`);
      if (m.wireHeightInches) parts.push(`Wire height: ${m.wireHeightInches}" (${(m.wireHeightInches / 12).toFixed(1)} ft)`);
      parts.push(`Wire rolls needed: ${m.wireRolls}`);
      parts.push(`Top wire: ${m.topWireType === 'barbed_double' ? 'double barbed wire' : m.topWireType === 'barbed' ? 'single barbed wire' : 'smooth high-tensile wire'}`);
      let postDesc2 = data.postMaterialLabel || data.postMaterial;
      if (data.squareTubeGauge) postDesc2 += ` ${data.squareTubeGauge}`;
      parts.push(`Line posts: ${m.linePostCount} × ${postDesc2} (spaced every ${m.linePostSpacing}')`);
      parts.push(`T-posts: ${m.tPostCount} (spaced every ${m.tPostSpacing}' between line posts)`);
      parts.push(`H-brace assemblies: ${m.hBraces}`);
      parts.push(`Corner brace assemblies: ${m.cornerBraces}`);
      if (m.doubleHBraces > 0) parts.push(`Double H-brace assemblies: ${m.doubleHBraces}`);
      parts.push(`Total brace assemblies: ${m.totalBraces}`);
      parts.push(`Concrete bags (80 lb): ${m.concreteBags}`);
      if (m.gateCount > 0) parts.push(`Gates: ${m.gateCount}`);
      if (m.waterGapCount > 0) parts.push(`Water gap cable kits: ${m.waterGapCount}`);
      if (m.postCaps > 0) parts.push(`Post caps: ${m.postCaps}`);
      if (m.tensioners > 0) parts.push(`Inline tensioners: ${m.tensioners}`);
      if (m.springIndicators > 0) parts.push(`Spring tension indicators: ${m.springIndicators}`);
    }
  }

  return parts.join('\n');
}

async function callClaude(apiKey: string, userPrompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function callOpenAI(apiKey: string, userPrompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
