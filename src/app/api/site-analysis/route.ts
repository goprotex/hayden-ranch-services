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
}

const SYSTEM_PROMPT = `You are a senior fencing contractor writing the "Property Research & Site Analysis" section of a professional fence installation bid for a Texas Hill Country fencing company called Hayden Ranch Services. 

Write in first-person plural ("we", "our") as the contractor speaking directly to the property owner. The tone should be:
- Professional but warm and approachable (rural Texas rancher audience)
- Technically knowledgeable without being condescending
- Confidence-inspiring — show the customer you've done real research on THEIR property
- Specific — reference the actual soil type, drainage, elevation, etc. by name
- Practical — explain what each finding means for their fence installation specifically

The section should be 2-4 paragraphs, roughly 150-250 words. Cover:
1. What soil database you researched and what you found (soil type name, composition)
2. What that soil means for post setting (depth, concrete needs, potential rock issues)
3. Drainage and water table considerations if relevant
4. Elevation/terrain impact on post spacing and wire tensioning
5. A brief confidence-building closer about how your material selections are tailored to these conditions

Do NOT use bullet points, headers, or markdown formatting. Write flowing prose paragraphs only.
Do NOT mention pricing or dollar amounts.
Do NOT make up soil data — only reference what is provided in the input.
If soil data is limited, acknowledge that and explain what on-site assessment will verify.`;

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
  if (elevChange > 0) parts.push(`Elevation change across fence line: approximately ${Math.round(elevChange)} feet`);
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
      max_tokens: 600,
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
      max_tokens: 600,
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
