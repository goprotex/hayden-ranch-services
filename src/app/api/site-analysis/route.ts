import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// POST /api/site-analysis
// Generates a unique, professional site analysis narrative
// using Claude (Anthropic) or GPT (OpenAI) based on real
// soil, terrain, and property data.
// ============================================================

interface SiteAnalysisRequest {
  propertyAddress: string;
  soilType: string | null;
  soilComponents: { name: string; percent: number; drainage?: string; hydric?: string }[];
  drainage: string | null;
  hydric: string | null;
  elevationChange: number;
  suggestedDifficulty: string;
  fenceType: string;
  fenceHeight: string;
  totalLinearFeet: number;
  postMaterial: string;
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
}

const SYSTEM_PROMPT = `You are a senior fencing contractor and amateur geologist writing the "Understanding Your Land" narrative for a professional fence installation bid. You work for Hayden Ranch Services, a Texas Hill Country fencing company.

Write in first-person plural ("we", "our") as the contractor speaking directly to the property owner. Your goal is to make the customer FASCINATED by their own property — teach them something about their land they probably did not know. The tone should be:
- Professional but warm and approachable (rural Texas rancher audience)
- Genuinely educational — explain the geology, soil science, and hydrology in accessible terms
- Confidence-inspiring — show the customer you have done real research on THEIR property
- Specific — reference actual soil type, drainage, elevation, bedrock depth, etc. by name
- Tell a STORY about how this soil formed over thousands or millions of years
- Practical — always tie the science back to what it means for their fence

Write 5-8 flowing paragraphs, roughly 500-800 words. Structure your narrative like this:

1. OPENING: Start with the research source and what database you used. Make the customer feel their property has been thoroughly studied. Mention the soil type name prominently.

2. GEOLOGICAL HISTORY: If taxonomy or soil order is provided (e.g., Mollisols, Vertisols, Inceptisols), explain what that tells us about how the soil formed. Was it once an ancient seabed? (Many Hill Country soils are limestone from Cretaceous marine deposits ~100 million years ago.) Was it formed under grassland? Under forest? Paint a picture of geological time.

3. WHAT'S IN THE SOIL: If texture is provided (e.g., "Very cobbly clay"), explain it in plain English. If rock fragment % is given, describe what that looks like ("one out of every two shovelfuls is rock"). If clay % is high (>35%), explain shrink-swell — how the ground literally heaves and cracks with the seasons.

4. WHAT'S BELOW: If bedrock depth is provided, this is CRITICAL. Convert to feet/inches. Explain what it means for post setting (standard post = 30-36" deep). For shallow bedrock (≤18"), explain that hydraulic rock drilling is required for EVERY post. For moderate (18-30"), explain partial rock encounters. Describe what the restriction type is (lithic bedrock, paralithic contact, caliche, etc.).

5. WATER STORY: Drainage, runoff, and hydric indicators. Explain how water moves through and over the soil. If well-drained, great for concrete curing. If poorly drained, explain pooling risks. If hydric, explain what "wetland indicator" means (not a swamp — just seasonal saturation in low areas).

6. pH & METAL: If pH is provided, briefly explain what it means for metal fence post longevity. Alkaline (>7.5) is favorable. Acidic (<5.5) accelerates corrosion.

7. TERRAIN IMPACT: Elevation change and slope. Explain how gravity affects wire tension on slopes. Describe how steep terrain changes installation approach.

8. CONFIDENCE CLOSER: Explain how all material selections, post depths, concrete quantities, and post spacing in the bid are specifically tailored to THESE conditions. Do NOT mention dollar amounts, but convey that nothing is left to chance.

Do NOT use bullet points, headers, markdown, or formatting. Write flowing prose paragraphs only.
Do NOT mention pricing or dollar amounts.
Do NOT make up soil data — only reference what is provided in the input.
If soil data is limited, acknowledge that and explain what on-site assessment will verify.
Be creative with analogies and comparisons to make the science accessible.`;

export async function POST(req: NextRequest) {
  try {
    const body: SiteAnalysisRequest = await req.json();

    // Build the user prompt from actual data
    const userPrompt = buildUserPrompt(body);

    // Try Anthropic (Claude) first, then OpenAI
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (anthropicKey && anthropicKey !== 'your_anthropic_api_key_here') {
      const narrative = await callClaude(anthropicKey, userPrompt);
      return NextResponse.json({ narrative, provider: 'claude' });
    }

    if (openaiKey && openaiKey !== 'your_openai_api_key_here') {
      const narrative = await callOpenAI(openaiKey, userPrompt);
      return NextResponse.json({ narrative, provider: 'openai' });
    }

    // No valid API key — fall back to template narrative
    return NextResponse.json({
      narrative: null,
      provider: 'none',
      message: 'No AI API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.local.',
    });
  } catch (err) {
    console.error('Site analysis error:', err);
    return NextResponse.json(
      { error: 'Failed to generate site analysis', narrative: null },
      { status: 500 },
    );
  }
}

function buildUserPrompt(data: SiteAnalysisRequest): string {
  const parts: string[] = [];
  const totalFeet = Number(data.totalLinearFeet) || 0;
  const elevChange = Number(data.elevationChange) || 0;

  parts.push(`Property: ${data.propertyAddress || 'Texas Hill Country property'}`);
  parts.push(`Fence project: ${totalFeet > 0 ? totalFeet.toLocaleString() : 'TBD'} linear feet of ${data.fenceType || 'fencing'} at ${data.fenceHeight || 'standard'} height`);
  parts.push(`Post material: ${data.postMaterial === 'drill_stem' ? 'Drill stem (2-3/8" OD recycled oilfield pipe)' : '2" square tube'}`);

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
  parts.push(`Terrain difficulty classification: ${data.suggestedDifficulty || 'moderate'}`);

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
      max_tokens: 1800,
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
      max_tokens: 1800,
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
