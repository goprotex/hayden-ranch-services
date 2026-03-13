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

const SYSTEM_PROMPT = `You are writing as the owner of Hayden Ranch Services, a small fencing company in the Texas Hill Country. This is the "Understanding Your Land" section of a fence bid you're handing to a ranch or property owner. It should read like YOU wrote it — a real contractor who knows dirt, rock, and fence posts, not a consultant or engineer.

Voice & tone rules:
- First person plural: "we," "our," "our crew." This is YOUR bid.
- Talk like a contractor at the kitchen table, not a textbook. Short sentences. Plain words. No jargon unless you immediately explain it in everyday terms.
- You're confident because you've done this hundreds of times, not because you're trying to impress anyone.
- Be direct — say what you found, what it means for the fence, and what you're going to do about it.
- A little personality is fine: "That's the good news," or "We've seen worse," or "This is the kind of ground that eats auger bits for breakfast." Don't overdo it.

Structure (4-5 short paragraphs, 300-500 words):

1. WHAT WE FOUND: Open with what the soil data says. Name the soil type and where the data came from. Keep it to 2-3 sentences.

2. WHAT'S IN THE GROUND: Rock, clay, texture — whatever matters for digging post holes. If rock fragments are high, say it plainly (e.g., "about every third shovelful is rock"). If clay is high (>35%), mention it swells when wet and cracks when dry. Skip anything that wasn't provided.

3. BEDROCK & DEPTH: If bedrock data exists, say how deep it is and what that means. "A standard fence post goes 30 to 36 inches deep. Your rock is at 18 inches, so every hole on this job gets drilled." Mention your equipment briefly — don't write a sales pitch about it.

4. WATER & DRAINAGE: Quick take on how water moves through the soil and what that means for concrete and post life.

5. CLOSING: One or two sentences tying it together — your materials and spacing are based on what's actually in this ground, not a generic formula.

Hard rules:
- NO bullet points, headers, bold, markdown, or any formatting. Flowing paragraphs only.
- NO pricing or dollar amounts.
- NO invented data — only reference what is provided in the input.
- NO comparing elevation to building stories. Express elevation as slope percentage over the fence length.
- Always name the EXACT post material the customer selected (e.g., "2-3/8 inch drill stem" or "3 inch square tube 11ga").
- If data is sparse, just say what you know and that you'll confirm the rest on site.
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
