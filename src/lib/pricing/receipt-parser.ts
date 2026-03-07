import { Receipt, ReceiptItem, PriceEntry, MaterialCategory } from '@/types';

/**
 * Parse raw text (from OCR or PDF) into a structured Receipt.
 * This handles common receipt formats from metal building suppliers.
 */
export function parseReceiptText(rawText: string, supplier?: string): Receipt {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

  const receipt: Receipt = {
    id: `rcpt_${Date.now()}`,
    supplier: supplier || extractSupplier(lines),
    date: extractDate(lines),
    items: [],
    subtotal: 0,
    tax: 0,
    total: 0,
    rawText,
  };

  // Extract line items
  receipt.items = extractLineItems(lines);

  // Extract totals
  const totals = extractTotals(lines);
  receipt.subtotal = totals.subtotal;
  receipt.tax = totals.tax;
  receipt.total = totals.total;

  // If no total found, sum the items
  if (receipt.total === 0) {
    receipt.subtotal = receipt.items.reduce((sum, item) => sum + item.totalPrice, 0);
    receipt.total = receipt.subtotal;
  }

  return receipt;
}

/**
 * Convert receipt items to price database entries.
 */
export function receiptToPriceEntries(receipt: Receipt): PriceEntry[] {
  return receipt.items.map((item) => ({
    id: `price_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    description: item.description,
    sku: item.sku,
    category: item.category,
    unitPrice: item.unitPrice,
    unit: item.unit,
    supplier: receipt.supplier,
    date: receipt.date,
    receiptId: receipt.id,
  }));
}

/**
 * Find the best matching price for a material description.
 */
export function findBestPrice(
  description: string,
  category: MaterialCategory,
  priceDatabase: PriceEntry[]
): PriceEntry | null {
  // Filter by category first
  const categoryPrices = priceDatabase.filter((p) => p.category === category);

  if (categoryPrices.length === 0) {
    // Fall back to all entries
    return findClosestMatch(description, priceDatabase);
  }

  return findClosestMatch(description, categoryPrices);
}

/**
 * Simple fuzzy text matching to find the closest price entry.
 */
function findClosestMatch(query: string, entries: PriceEntry[]): PriceEntry | null {
  if (entries.length === 0) return null;

  const queryWords = query.toLowerCase().split(/\s+/);
  let bestScore = 0;
  let bestEntry: PriceEntry | null = null;

  for (const entry of entries) {
    const entryWords = entry.description.toLowerCase().split(/\s+/);
    let matchCount = 0;

    for (const qWord of queryWords) {
      if (entryWords.some((eWord) => eWord.includes(qWord) || qWord.includes(eWord))) {
        matchCount++;
      }
    }

    const score = matchCount / Math.max(queryWords.length, entryWords.length);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  return bestScore > 0.3 ? bestEntry : null;
}

// ---- Internal parsing helpers ----

function extractSupplier(lines: string[]): string {
  // Common metal building suppliers
  const suppliers = [
    'mueller', 'metal mart', 'metalmart', 'abc supply', 'srs distribution',
    'beacon', 'allied steel', 'metal sales', 'metal depot',
    'ranch supply', 'tractor supply', 'stockade', 'priefert',
  ];

  for (const line of lines.slice(0, 5)) {
    for (const supplier of suppliers) {
      if (line.toLowerCase().includes(supplier)) {
        return line;
      }
    }
  }

  // Return first non-empty line as supplier name
  return lines[0] || 'Unknown Supplier';
}

function extractDate(lines: string[]): string {
  const datePatterns = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,     // MM/DD/YYYY or MM-DD-YYYY
    /(\w+)\s+(\d{1,2}),?\s+(\d{4})/,                  // Month DD, YYYY
    /(\d{4})-(\d{2})-(\d{2})/,                         // YYYY-MM-DD
  ];

  for (const line of lines) {
    for (const pattern of datePatterns) {
      const match = line.match(pattern);
      if (match) {
        return match[0];
      }
    }
  }

  return new Date().toISOString().split('T')[0];
}

function extractLineItems(lines: string[]): ReceiptItem[] {
  const items: ReceiptItem[] = [];
  // Pattern: quantity  description  unit_price  total
  const itemPattern = /^(\d+)\s+(.+?)\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)$/;
  // Alternative: description  quantity  @ price  = total
  const altPattern = /^(.+?)\s+(\d+)\s*[@x]\s*\$?([\d,]+\.?\d*)\s*=?\s*\$?([\d,]+\.?\d*)$/;

  for (const line of lines) {
    let match = line.match(itemPattern) || line.match(altPattern);
    if (match) {
      const qty = parseInt(match[1], 10) || parseInt(match[2], 10) || 1;
      const desc = (match[2] || match[1]).trim();
      const unitPrice = parseFloat((match[3] || '0').replace(/,/g, ''));
      const totalPrice = parseFloat((match[4] || '0').replace(/,/g, ''));

      items.push({
        description: desc,
        quantity: qty,
        unit: guessUnit(desc),
        unitPrice: unitPrice || (totalPrice / qty),
        totalPrice: totalPrice || (unitPrice * qty),
        category: categorizeItem(desc),
      });
    }
  }

  return items;
}

function extractTotals(lines: string[]): { subtotal: number; tax: number; total: number } {
  let subtotal = 0;
  let tax = 0;
  let total = 0;

  for (const line of lines) {
    const subtotalMatch = line.match(/sub\s*total\s*:?\s*\$?([\d,]+\.?\d*)/i);
    if (subtotalMatch) subtotal = parseFloat(subtotalMatch[1].replace(/,/g, ''));

    const taxMatch = line.match(/tax\s*:?\s*\$?([\d,]+\.?\d*)/i);
    if (taxMatch) tax = parseFloat(taxMatch[1].replace(/,/g, ''));

    const totalMatch = line.match(/(?:^|\s)total\s*:?\s*\$?([\d,]+\.?\d*)/i);
    if (totalMatch && !line.match(/sub/i)) {
      total = parseFloat(totalMatch[1].replace(/,/g, ''));
    }
  }

  return { subtotal, tax, total };
}

function guessUnit(description: string): string {
  const desc = description.toLowerCase();
  if (desc.includes('ft') || desc.includes('foot') || desc.includes("'")) return 'lf';
  if (desc.includes('roll')) return 'roll';
  if (desc.includes('box')) return 'box';
  if (desc.includes('bag')) return 'bag';
  if (desc.includes('gal')) return 'gallon';
  if (desc.includes('tube')) return 'tube';
  if (desc.includes('sq') || desc.includes('square')) return 'square';
  return 'each';
}

function categorizeItem(description: string): MaterialCategory {
  const desc = description.toLowerCase();

  if (desc.match(/panel|sheet|6v|r-panel|standing\s*seam|snap\s*lock|crimp/))
    return 'panel';
  if (desc.match(/trim|ridge|hip|rake|eave|drip|gable|j[\s-]?channel/))
    return 'trim';
  if (desc.match(/screw|fastener|nail|clip|anchor/))
    return 'fastener';
  if (desc.match(/sealant|caulk|silicone|butyl|tape/))
    return 'sealant';
  if (desc.match(/underlay|felt|synthetic|peel|stick/))
    return 'underlayment';
  if (desc.match(/closure|foam|strip/))
    return 'closure';
  if (desc.match(/flash|valley|step|counter/))
    return 'flashing';
  if (desc.match(/wire|fence|woven|barb/))
    return 'fence_wire';
  if (desc.match(/post|t[\s-]?post/))
    return 'fence_post';
  if (desc.match(/brace|tensioner|gate|hinge|latch/))
    return 'fence_hardware';

  return 'other';
}
