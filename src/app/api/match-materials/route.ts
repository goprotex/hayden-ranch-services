import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// POST /api/match-materials
// Uses Claude to match receipt line items to fencing material
// price IDs from the catalog.
// ============================================================

interface ReceiptItem {
  id: string;
  description: string;
  unitPrice: number;
}

interface CatalogItem {
  id: string;
  name: string;
  unit: string;
  category: string;
}

interface MatchResult {
  entryId: string;
  materialId: string;
  unitPrice: number;
  confidence: number;
}

const SYSTEM_PROMPT = `You are a fencing supply receipt matcher. Given a list of receipt line items and a catalog of fencing materials, match each receipt item to the most likely catalog material.

Rules:
- Match based on the product description, not the price.
- "Drill stem" is pipe used for fence posts. Match by OD (outside diameter): 2-3/8" or 2-7/8".
- "Square tube" posts: match by size (2", 3", 4") AND gauge (11ga, 14ga, 16ga). "Sq tube" = "square tube."
- Stay-Tuff wire uses a model number like "2096-6-330" meaning 96" tall, 6" stay spacing, 330' roll. The catalog ID is "st_2096_6_330". Match by the model number digits.
- Xtreme wire is the "SZA" or "SZAB" (black) product line. Same model number pattern.
- T-posts: match by length (6', 7', 8', 10').
- Barbed wire: match 2-point vs 4-point.
- Concrete: any 80lb bag of concrete mix → "concrete_bag".
- If a receipt item clearly doesn't match ANY catalog material (e.g., fuel, lunch, tools), skip it — do not force a match.
- confidence: 0.95 for exact model/spec matches, 0.8 for close matches (right product, some specs inferred), 0.5 for vague matches.

Respond with ONLY a JSON array of matches. No markdown, no explanation:
[{"entryId": "receipt_item_id", "materialId": "catalog_id", "confidence": 0.95}]

If nothing matches, return an empty array: []`;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
      return NextResponse.json({ matches: [], error: 'No API key configured' });
    }

    const { items, catalog } = (await req.json()) as {
      items: ReceiptItem[];
      catalog: CatalogItem[];
    };

    if (!items?.length || !catalog?.length) {
      return NextResponse.json({ matches: [] });
    }

    // Build compact prompt
    const catalogStr = catalog
      .map(c => `${c.id}: ${c.name} (${c.unit}, ${c.category})`)
      .join('\n');

    const itemsStr = items
      .map(i => `[${i.id}] "${i.description}" — $${i.unitPrice}/unit`)
      .join('\n');

    const userPrompt = `CATALOG:\n${catalogStr}\n\nRECEIPT ITEMS:\n${itemsStr}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Claude match-materials error:', res.status, errText);
      return NextResponse.json({ matches: [], error: `API error ${res.status}` });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '[]';
    let clean = text.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const rawMatches: { entryId: string; materialId: string; confidence: number }[] = JSON.parse(clean);

    // Validate and merge with prices
    const catalogIds = new Set(catalog.map(c => c.id));
    const itemMap = new Map(items.map(i => [i.id, i]));
    const matches: MatchResult[] = [];

    for (const m of rawMatches) {
      if (!catalogIds.has(m.materialId)) continue;
      const item = itemMap.get(m.entryId);
      if (!item || item.unitPrice <= 0) continue;
      matches.push({
        entryId: m.entryId,
        materialId: m.materialId,
        unitPrice: Math.round(item.unitPrice * 100) / 100,
        confidence: Math.min(Math.max(m.confidence || 0.5, 0), 1),
      });
    }

    return NextResponse.json({ matches });
  } catch (err) {
    console.error('match-materials error:', err);
    return NextResponse.json({ matches: [], error: 'Failed to match materials' });
  }
}
