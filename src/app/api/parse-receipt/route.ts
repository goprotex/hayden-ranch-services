import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are a receipt/invoice data extraction specialist for a metal roofing and fencing supply company called Hayden Ranch Services. 

Extract ALL data from the receipt image or text into the following JSON structure. Be extremely precise with numbers and prices.

Rules:
- Extract EVERY line item visible, including partial ones
- For unit prices: if you see a line total and quantity, calculate unit price = total / qty
- Categories must be one of: panel, trim, fastener, sealant, underlayment, closure, flashing, fence_wire, fence_post, fence_hardware, accessory, other
- Panel types include: R-Panel, 6V Crimp, Standing Seam, Snap Lock, PBR, AG Panel, 5V Crimp, corrugated
- Trim includes: ridge cap, hip cap, eave drip, rake trim, J-channel, Z-flashing, gable trim, headwall, sidewall, valley, transition
- Fasteners include: screws, nails, clips, anchors, rivets
- Units should be: lf (linear feet), each, roll, box, bag, gallon, tube, square, sheet, piece, bundle
- For panels: note the gauge (26ga, 24ga, 29ga), length, and color in the description
- Supplier name is usually at the top of the receipt
- Look for invoice number, PO number, order number
- Parse the date in YYYY-MM-DD format

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "supplier": "string",
  "date": "YYYY-MM-DD",
  "invoiceNumber": "string or null",
  "items": [
    {
      "description": "full item description including specs",
      "sku": "SKU/item number or null",
      "quantity": number,
      "unit": "string",
      "unitPrice": number,
      "totalPrice": number,
      "category": "string"
    }
  ],
  "subtotal": number,
  "tax": number,  
  "total": number
}`;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured. Add it to your .env.local file.' },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const contentType = request.headers.get('content-type') || '';
    let userContent: Anthropic.MessageCreateParams['messages'][0]['content'];

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload (image or PDF)
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|tiff?)$/i.test(file.name) ||
                      file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        // Extract text from PDF first, then send to AI
        try {
          const pdfParse = (await import('pdf-parse')).default;
          const pdfData = await pdfParse(buffer);
          const pdfText = pdfData.text;

          if (pdfText && pdfText.trim().length > 20) {
            // PDF has extractable text — send as text
            userContent = `Extract all receipt/invoice data from this text:\n\n${pdfText}`;
          } else {
            // PDF is scanned — send as document to Claude
            const base64 = buffer.toString('base64');
            userContent = [
              {
                type: 'document' as const,
                source: {
                  type: 'base64' as const,
                  media_type: 'application/pdf' as const,
                  data: base64,
                },
              },
              {
                type: 'text' as const,
                text: 'Extract all receipt/invoice data from this scanned receipt PDF.',
              },
            ];
          }
        } catch {
          // PDF parse failed — send the raw PDF to Claude
          const base64 = buffer.toString('base64');
          userContent = [
            {
              type: 'document' as const,
              source: {
                type: 'base64' as const,
                media_type: 'application/pdf' as const,
                data: base64,
              },
            },
            {
              type: 'text' as const,
              text: 'Extract all receipt/invoice data from this document.',
            },
          ];
        }
      } else if (isImage) {
        // Image file — send directly to Claude vision
        const base64 = buffer.toString('base64');
        const mimeType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

        userContent = [
          {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: mimeType,
              data: base64,
            },
          },
          {
            type: 'text' as const,
            text: 'Extract all receipt/invoice data from this scanned receipt image.',
          },
        ];
      } else {
        // Text file — read as text
        const text = new TextDecoder().decode(buffer);
        userContent = `Extract all receipt/invoice data from this text:\n\n${text}`;
      }
    } else {
      // JSON body with pasted text
      const body = await request.json();
      const { text } = body;
      if (!text) {
        return NextResponse.json({ error: 'No text provided' }, { status: 400 });
      }

      userContent = `Extract all receipt/invoice data from this text:\n\n${text}`;
    }

    // Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userContent,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    const content = textBlock && 'text' in textBlock ? textBlock.text : null;
    if (!content) {
      return NextResponse.json({ error: 'AI returned empty response' }, { status: 500 });
    }

    // Parse the JSON response — strip markdown code fences if present
    let cleanJson = content.trim();
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    try {
      const parsed = JSON.parse(cleanJson);

      // Validate and sanitize the parsed data
      const result = {
        supplier: parsed.supplier || 'Unknown Supplier',
        date: parsed.date || new Date().toISOString().split('T')[0],
        invoiceNumber: parsed.invoiceNumber || null,
        items: Array.isArray(parsed.items)
          ? parsed.items.map((item: Record<string, unknown>) => ({
              description: String(item.description || ''),
              sku: item.sku ? String(item.sku) : undefined,
              quantity: Number(item.quantity) || 1,
              unit: String(item.unit || 'each'),
              unitPrice: Number(item.unitPrice) || 0,
              totalPrice: Number(item.totalPrice) || 0,
              category: String(item.category || 'other'),
            }))
          : [],
        subtotal: Number(parsed.subtotal) || 0,
        tax: Number(parsed.tax) || 0,
        total: Number(parsed.total) || 0,
      };

      // Fixups: calculate missing totals
      if (result.total === 0 && result.items.length > 0) {
        result.subtotal = result.items.reduce(
          (s: number, i: { totalPrice: number }) => s + i.totalPrice,
          0
        );
        result.total = result.subtotal + result.tax;
      }

      return NextResponse.json(result);
    } catch {
      // AI returned non-JSON — return the raw text for fallback parsing
      return NextResponse.json({
        error: 'AI response was not valid JSON',
        rawText: content,
      }, { status: 422 });
    }
  } catch (error: unknown) {
    console.error('Receipt parsing error:', error);
    const message = error instanceof Error ? error.message : 'Failed to parse receipt';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
