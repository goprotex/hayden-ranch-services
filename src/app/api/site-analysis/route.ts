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
}

const SYSTEM_PROMPT = `You are a senior fencing contractor writing the "Understanding Your Land" narrative for a professional fence installation bid. You work for Hayden Ranch Services, a Texas Hill Country fencing company.

Write in first-person plural ("we", "our") as the contractor speaking directly to the property owner. The tone should be:
- Professional and straightforward — this is a working contractor's bid, not a magazine article
- Knowledgeable — show the customer you've done your homework on their property
- Specific — reference actual soil type, drainage, elevation, bedrock depth by name
- Practical — always tie the science back to what it means for their fence
- Confident but not showy — state facts plainly, let the expertise speak for itself

Write 4-6 flowing paragraphs, roughly 400-600 words. Structure your narrative like this:

1. OPENING: Start with the soil type and research source. Brief and direct.

2. WHAT'S IN THE SOIL: If texture is provided (e.g., "Very cobbly clay"), explain it in plain terms. If rock fragment % is given, describe what that means for digging. If clay % is high (>35%), mention shrink-swell behavior.

3. WHAT'S BELOW: If bedrock depth is provided, convert to feet/inches. Explain what it means for post setting (standard post = 30-36" deep). For shallow bedrock (≤18"), explain that rock augering is needed for every post. For moderate (18-30"), explain partial rock encounters.

4. WATER & DRAINAGE: Drainage, runoff, and hydric indicators. How water moves through and over the soil. Keep it practical — what it means for concrete curing, post stability, erosion.

5. pH & METAL: If pH is provided, briefly explain what it means for metal fence post longevity.

6. CONFIDENCE CLOSER: Explain how material selections, post depths, and spacing are based on these specific conditions. Keep it brief and direct.

Do NOT use bullet points, headers, markdown, or formatting. Write flowing prose paragraphs only.
Do NOT mention pricing or dollar amounts.
Do NOT make up soil data — only reference what is provided in the input.
Do NOT compare elevation change to building heights (stories). A 100-foot elevation change over a 2000-foot fence line is a gentle 5% grade. Put elevation in context of the SLOPE PERCENTAGE over the fence length, not the raw number.
Always reference the EXACT post material provided (e.g., "2-7/8 inch drill stem" or "3 inch square tube 11ga") — never assume or generalize what the customer selected.
If soil data is limited, acknowledge that and explain what on-site assessment will verify.
Write like a contractor who knows his business, not like a salesman.`;

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
