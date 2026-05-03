import jsPDF from 'jspdf';
import {
  recommendedTPostLength,
  calculatePostLength,
  POST_MATERIALS,
  getGaugeOptions,
  calculatePipeFenceMaterials,
  postOdInches,
  type PostMaterial,
  type SquareTubeGauge,
  type PipeFenceConfig,
  type PipeFenceMaterials,
} from './fence-materials';

// ============================================================
// Types for fence bid PDF
// ============================================================

/** Top & bottom wire option: smooth HT wire, single barbed, or double barbed top */
export type TopWireType = 'smooth' | 'barbed' | 'barbed_double';

export interface LaborEstimate {
  drillingHours: number;       // time to drill all post holes
  postSettingHours: number;    // time to set posts in concrete
  tPostHours: number;          // time to drive T-posts
  wireHours: number;           // wire unrolling & tensioning time (0 for pipe fence)
  clippingHours: number;       // time to clip/tie wire to every post (0 for pipe fence)
  braceAssemblyHours: number;  // time to build H-brace & corner brace assemblies
  gateHours: number;           // gate installation
  // ── Pipe-fence-specific (0 for non-pipe fences) ──
  pipeRailHandlingHours?: number; // cut & position rail pipe between posts
  pipeWeldingHours?: number;      // welding rails to posts
  pipePaintHours?: number;        // painting the assembled fence
  totalHours: number;
  workDayHours: number;        // hours per work day (9-10)
  workDays: number;            // total work days
  breakdown: { task: string; hours: number; detail: string }[];
}

export interface FenceBidSection {
  id: string;
  name: string;
  linearFeet: number;
  ratePerFoot: number; // can override global
  total: number;
  terrain: 'easy' | 'moderate' | 'difficult' | 'very_difficult';
  fenceTypeOverride?: string;  // per-section fence type (overrides global when set)
  materials?: SectionMaterial[];
  gates?: BidGate[];
}

export interface SectionMaterial {
  name: string;
  quantity: string;
}

export interface BidGate {
  id: string;
  type: string; // "12' truck gate", "4' walk gate", etc.
  width: number;
  cost: number;
}

export interface FenceBidData {
  // Project info
  projectName: string;
  clientName: string;
  propertyAddress: string;
  date: string;          // "January 24, 2026"
  validUntil: string;    // "February 23, 2026"

  // Fence config
  fenceType: string;     // "High Tensile Stay-Tuff Fixed Knot"
  fenceHeight: string;
  stayTuffModel?: string;
  stayTuffDescription?: string;
  wireHeightInches?: number; // actual wire height for proper material sizing

  // Material selections (from UI)
  postMaterial: PostMaterial;
  squareTubeGauge?: SquareTubeGauge;
  tPostSpacing: number;              // user-configured, e.g. 10
  linePostSpacing: number;           // user-configured, e.g. 66
  topWireType: TopWireType;          // 'smooth' | 'barbed' | 'barbed_double'
  barbedStrandCount?: number;        // for fenceType === 'barbed_wire'; default 4
  barbedPointType?: '2_point' | '4_point';
  premiumGalvanized?: boolean;       // upgrade: galvanized line posts, t-posts & caps

  // Pipe fence design (only used when fenceType === 'Pipe Fence' / 'pipe_fence').
  // Drives the per-section materials calculation AND the auto-generated PDF
  // section diagram so the customer can see exactly what they're getting.
  pipeFenceConfig?: PipeFenceConfig;

  // Sections
  sections: FenceBidSection[];

  // Gates (separate line items)
  gates: BidGate[];

  // Pricing
  projectTotal: number;
  depositPercent: number; // e.g. 50
  depositAmount: number;
  balanceAmount: number;

  // Timeline
  timelineWeeks: number;
  workingDays: number;

  // Calculated labor estimate
  laborEstimate?: LaborEstimate;

  // Custom project overview text
  projectOverview: string;

  // Terrain description
  terrainDescription: string;

  // Property research / soil narrative for the customer
  soilNarrative?: string;

  // Structured soil/terrain data for rich PDF rendering
  siteData?: {
    soilType: string | null;
    components: { name: string; percent: number; drainage?: string; hydric?: string }[];
    drainage: string | null;
    hydric: string | null;
    source: string | null;
    elevationChange: number;
    suggestedDifficulty: string;
    // USDA SDA enrichment
    bedrockDepthIn: number | null;
    restrictionType: string | null;
    slopeRange: string | null;
    slopeLow: number | null;
    slopeHigh: number | null;
    runoff: string | null;
    taxonomy: string | null;
    taxOrder: string | null;
    texture: string | null;
    clayPct: number | null;
    sandPct: number | null;
    rockFragmentPct: number | null;
    pH: number | null;
    organicMatter: number | null;
  };

  // Site-specific pricing adjustments driven by soil data
  siteAdjustments?: SiteAdjustment[];

  // Map screenshot data URLs (base64 PNGs) — supports multiple captures
  mapImages?: string[];

  // Accessory quantities for PDF rendering
  accessories?: {
    postCaps: number;
    tensioners: number;
    springIndicators: number;
    concreteFillPosts: number;
    concreteFillBraces: number;
  };

  // Painting estimate (optional add-on)
  painting?: {
    color: string;
    gallons: number;
    materialCost: number;
    laborCost: number;
    totalCost: number;
  };

  // Steep grade info
  steepFootage?: number;
  steepSurchargePerFoot?: number;

  // Terms (use default if empty)
  customTerms?: string[];

  // Wire category for product photos
  wireCategory?: string;

  // Pre-loaded product images as base64 data URLs
  productImages?: { label: string; dataUrl: string }[];

  // ── New bid enhancements ──

  // Cost-per-year comparison (long-term value framing)
  fenceLifespanYears?: number;           // e.g. 25
  alternativeCostPerFoot?: number;       // e.g. 6 (cheap barbed)
  alternativeLifespanYears?: number;     // e.g. 8
  alternativeLabel?: string;             // e.g. 'STANDARD BARBED WIRE' or 'TYPICAL WIRE FENCE' (pipe fences)
  alternativeSavingsLabel?: string;      // e.g. 'a standard barbed wire installation' (used in the savings sentence)

  // Acreage framing (anchors customer on enclosed area, not price)
  enclosedAcreage?: number;              // e.g. 12.4

  // Permit / HOA check
  permitInfo?: {
    hoaFound: boolean;
    hoaName?: string;
    permitRequired: boolean;
    permitNote?: string;                 // e.g. "No county permit required for agricultural fencing in Kerr County"
    deedRestrictions?: string;
  };

  // Insurance & license badges
  credentials?: {
    txAdjusterLicense?: string;          // e.g. "TX PA #3378204"
    liabilityInsurance?: string;         // e.g. "$1M General Liability"
    workersComp?: string;                // e.g. "Full Coverage"
    bondAmount?: string;                 // e.g. "$50,000 Surety Bond"
    otherBadges?: string[];              // e.g. ["BBB Accredited", "NFBA Member"]
  };

  // Annual maintenance plan
  maintenancePlan?: {
    annualPrice: number;                 // e.g. 250
    services: string[];                  // e.g. ["Re-tensioning", "Clip inspection", ...]
  };

  // Neighbor referral discount
  referralDiscount?: number;             // percent, e.g. 5

  // Seasonal pricing deadline
  seasonalPricingDeadline?: string;      // e.g. "April 15, 2026"

  // Good / Better / Best pricing tiers
  bidTiers?: {
    good: { label: string; price: number; description: string };
    better: { label: string; price: number; description: string };
    best: { label: string; price: number; description: string };
  };

  // Competitor comparison section
  competitorComparison?: { name: string; pricePerFoot: number; notes: string }[];

  // Digital acceptance link (e.g., DocuSign, SignNow, or custom URL)
  acceptanceLink?: string;
  acceptanceLinkLabel?: string;          // e.g. "Sign & Accept This Proposal"
}

// ============================================================
// Site pricing adjustment (soil-data-driven)
// ============================================================

export interface SiteAdjustment {
  label: string;        // e.g. "Rock Drilling Surcharge"
  reason: string;       // e.g. "Bedrock at 11″ below grade"
  dataPoint: string;    // the raw data that triggered it
  impact: string;       // e.g. "Hydraulic rock drill required for every post hole"
  costNote?: string;    // optional cost text
}

/**
 * Analyse structured soil data and return site-specific adjustments
 * that explain WHY pricing may be higher/lower than a typical install.
 * Optionally references the user's actual material selections.
 */
export function buildSiteAdjustments(
  site: FenceBidData['siteData'],
  materials?: { postMaterial?: PostMaterial; squareTubeGauge?: SquareTubeGauge; fenceType?: string },
): SiteAdjustment[] {
  if (!site) return [];
  const adj: SiteAdjustment[] = [];

  // 1 — Shallow bedrock
  if (site.bedrockDepthIn != null && site.bedrockDepthIn <= 36) {
    const ft = Math.floor(site.bedrockDepthIn / 12);
    const inches = site.bedrockDepthIn % 12;
    const depthStr = ft > 0 ? `${ft}' ${inches > 0 ? inches + '"' : ''}`.trim() : `${site.bedrockDepthIn}"`;
    if (site.bedrockDepthIn <= 18) {
      adj.push({
        label: 'Shallow Bedrock — Rock Augering Required',
        reason: `USDA data shows ${site.restrictionType || 'bedrock'} at ${depthStr} below grade`,
        dataPoint: `Bedrock depth: ${depthStr}`,
        impact: 'Rock auger required for every post hole. Standard auger cannot penetrate this depth. Each post must be anchored directly into the rock shelf.',
        costNote: 'Rock augering included in project pricing — no surprise charges',
      });
    } else if (site.bedrockDepthIn <= 30) {
      adj.push({
        label: 'Moderate Bedrock — Partial Rock Augering',
        reason: `${site.restrictionType || 'Bedrock'} at ${depthStr} — standard post depth is 30-36"`,
        dataPoint: `Bedrock depth: ${depthStr}`,
        impact: 'Many post holes will bottom out on rock. Crew will arrive with rock auger and skid steer, setting posts at maximum achievable depth with epoxy anchoring where needed.',
        costNote: 'Rock augering equipment mobilization included in pricing',
      });
    } else {
      adj.push({
        label: 'Subsurface Rock Possible',
        reason: `${site.restrictionType || 'Bedrock'} detected at ${depthStr} depth`,
        dataPoint: `Bedrock depth: ${depthStr}`,
        impact: 'Some deeper posts may encounter rock. Rock auger will be on-site as a precaution.',
      });
    }
  }

  // 2 — High rock fragment content
  if (site.rockFragmentPct != null && site.rockFragmentPct >= 25) {
    if (site.rockFragmentPct >= 50) {
      adj.push({
        label: 'Heavy Rock Fragment Soil',
        reason: `Soil matrix is ${site.rockFragmentPct}% coarse rock fragments`,
        dataPoint: `Rock fragments: ${site.rockFragmentPct}%`,
        impact: 'Post holes will encounter heavy cobbles and stones throughout. Skid steer mounted auger bits wear rapidly; backup bits and hand-finishing of holes required.',
        costNote: 'Auger wear and extended dig time factored into pricing',
      });
    } else {
      adj.push({
        label: 'Rocky Soil Conditions',
        reason: `${site.rockFragmentPct}% rock fragments in the soil profile`,
        dataPoint: `Rock fragments: ${site.rockFragmentPct}%`,
        impact: 'Post hole digging will be slower than normal. We carry carbide-tipped skid steer auger bits rated for this soil type.',
      });
    }
  }

  // 3 — High clay content (shrink-swell)
  if (site.clayPct != null && site.clayPct >= 35) {
    adj.push({
      label: 'High-Clay Expansive Soil',
      reason: `Clay content is ${site.clayPct}% — soils with >35% clay expand and contract significantly`,
      dataPoint: `Clay content: ${site.clayPct}%`,
      impact: 'Seasonal moisture changes will push and pull on posts. We set posts deeper and use additional concrete to counteract heave. All brace assemblies are reinforced.',
      costNote: 'Additional concrete and deeper post settings included',
    });
  }

  // 4 — Steep slope
  if (site.slopeHigh != null && site.slopeHigh >= 20) {
    adj.push({
      label: 'Steep Terrain',
      reason: `USDA slope range: ${site.slopeRange || site.slopeHigh + '%'}`,
      dataPoint: `Max slope: ${site.slopeHigh}%`,
      impact: 'Steep terrain requires closer post spacing, reinforced bracing at grade changes, and additional labor for equipment staging. Wire tension is higher on slopes due to gravity.',
      costNote: 'Slope-adjusted post spacing included in material counts',
    });
  }

  // 5 — Hydric/wetland conditions
  if (site.hydric && site.hydric.toLowerCase() === 'yes') {
    adj.push({
      label: 'Wetland / Hydric Soil Present',
      reason: 'USDA classifies portions of this soil as hydric (wetland indicator)',
      dataPoint: `Hydric indicator: Yes`,
      impact: 'Standing water or saturated soils may be present seasonally. Posts in wet areas require deeper settings and rapid-set concrete to cure before water infiltration.',
      costNote: 'Rapid-set concrete for wet areas included',
    });
  }

  // 6 — Poor drainage
  if (site.drainage) {
    const d = site.drainage.toLowerCase();
    if (d.includes('poorly') || d.includes('very poorly')) {
      adj.push({
        label: 'Poor Drainage Conditions',
        reason: `Soil drainage classified as "${site.drainage}"`,
        dataPoint: `Drainage: ${site.drainage}`,
        impact: 'Saturated soils reduce post-hole wall stability and slow concrete curing. We may need to dewater holes before setting posts and use fast-set concrete.',
      });
    }
  }

  // 7 — Acidic soil (metal corrosion risk)
  if (site.pH != null && site.pH <= 5.5) {
    const postNote = materials?.postMaterial?.startsWith('drill_stem')
      ? 'Your drill stem posts (0.190" wall thickness) provide excellent corrosion resistance — far superior to standard pipe.'
      : materials?.postMaterial?.startsWith('square')
        ? 'We recommend galvanized square tube or periodic inspection of post bases in acidic soil.'
        : 'We recommend heavy-wall drill stem or galvanized posts for maximum longevity in these conditions.';
    adj.push({
      label: 'Acidic Soil — Corrosion Consideration',
      reason: `Soil pH of ${site.pH} is acidic (below 5.5)`,
      dataPoint: `pH: ${site.pH}`,
      impact: `Acidic soils can accelerate corrosion of metal fence posts over time. ${postNote}`,
    });
  }

  return adj;
}

// ============================================================
// Company constants
// ============================================================

const COMPANY = {
  name: 'HAYDEN RANCH SERVICES',
  address: '5900 Balcones Dr #26922, Austin, TX 78731',
  phone: '(830) 777-9111',
  email: 'office@haydenclaim.com',
};

// ============================================================
// Default terms and conditions (from the real bid)
// ============================================================

const DEFAULT_TERMS: string[] = [
  `Scope of Work: Installation includes ${'{fenceType}'} fence with ${'{postMaterial}'} corner posts, H-braces, and line posts with concrete setting. All hardware, clips, and professional installation included. Any work not explicitly listed in this proposal is excluded.`,
  `Payment Terms: ${'{depositPercent}'}% non-refundable deposit ($${'{depositAmount}'}) required to schedule work and order materials. Deposit is earned upon receipt and covers material ordering, scheduling, and opportunity costs. Balance ($${'{balanceAmount}'}) due in full upon completion before contractor leaves property. Payment accepted by check, cash, or bank transfer. Returned checks subject to $50 fee plus any bank charges. No work begins without cleared deposit.`,
  `Cancellation Policy: Customer may cancel within 3 business days of signing with full deposit refund. After 3 business days, deposit is non-refundable and earned.`,
  `Site Access and Conditions: Customer warrants they have legal right to authorize work on the property. Customer is responsible for marking all underground utilities by calling 811 at least 3 business days before work begins. Customer grants contractor access to property and right to cross property as needed to complete work. Customer is responsible for securing all animals during work. Contractor is not liable for livestock escape due to temporary fence access during installation.`,
  `Material Pricing: Material costs subject to change if proposal not accepted within 30 days. If material costs increase more than 10% before work begins, contractor reserves right to adjust pricing or cancel contract with deposit refunded. All materials ordered are non-returnable. Customer is responsible for deposit even if customer cancels after materials are ordered.`,
  `Rock and Subsurface Conditions: Pricing assumes standard rock conditions manageable with our auger equipment. If solid limestone, caliche, or bedrock requiring specialized equipment is encountered on more than 10% of posts, additional work will be billed at $15 per post not to exceed $750 without written customer approval. If subsurface conditions prevent post installation at specified locations, contractor may relocate posts up to 10 feet to achieve proper installation. Customer will be notified of significant subsurface issues before additional charges are incurred.`,
  `Timeline and Delays: Work begins within 2 weeks of deposit receipt and material delivery, weather permitting. Estimated completion is ${'{workingDays}'} working days. Timeline is an estimate only and not guaranteed. Delays due to weather, material availability, equipment failure, labor shortage, or subsurface conditions do not constitute breach of contract. Contractor will provide reasonable notice of delays. Customer may not withhold payment due to timeline delays.`,
  `Weather and Seasonal Conditions: Concrete work cannot proceed in freezing temperatures (below 32°F), during rain, or when ground is frozen. High tensile fence installation requires dry conditions for proper tensioning. Weather delays do not constitute contractor default. Work may be suspended without penalty during unsuitable conditions. Customer remains responsible for full payment regardless of weather delays.`,
  `Warranty and Limitations: Contractor provides one year warranty on workmanship defects only. Warranty covers structural failure of fence due to installation error. Warranty does not cover damage from livestock, vehicle impact, falling trees, fire, flood, vandalism, or Acts of God. Warranty does not cover fence movement due to soil settling, frost heave, or erosion. Customer must notify contractor in writing within 60 days of discovering defect. Contractor's sole obligation is repair or replacement of defective work. Contractor is not liable for consequential damages including livestock loss, property damage, or lost use.`,
  `Exclusions and Customer Responsibilities: Price does not include: removal of existing fence, tree removal beyond cedar clearing necessary for fence line, grading or earthwork, repair of underground utilities damaged during installation, concrete removal or disposal, gate operators or automation, paint or stain on fence materials, or repairs to driveways, landscaping, or structures damaged by equipment access. Customer is responsible for: calling 811 for utility location, obtaining permits if required, providing access to water and electricity if needed, marking property boundaries, removing or securing livestock during installation, and providing safe vehicle access to work areas.`,
  `Property Damage and Liability: Contractor will use reasonable care to avoid property damage but is not liable for damage to landscaping, sprinkler systems, invisible dog fences, unmarked utilities, or underground tanks not marked by 811. Contractor is not liable for damage to driveways, roads, or paths from equipment access. Contractor carries general liability insurance but customer is responsible for damage to property improvements not directly part of fence installation. Customer is responsible for damage to fence caused by livestock within 30 days of installation.`,
  `Change Orders: Any changes to scope of work must be in writing and signed by both parties. Verbal change orders are not binding. Additional work will be billed at $75 per hour labor plus materials at cost plus 40%. Customer may not withhold payment for original scope due to disputes over change orders.`,
  `Permits and Compliance: Customer is solely responsible for determining permit requirements and obtaining all necessary permits. Most rural fence projects in Kerr County do not require permits but customer should verify with local jurisdiction. Contractor is not responsible for permit compliance. Customer warrants that fence installation complies with all deed restrictions, easements, and HOA requirements. Contractor is not liable for violations of restrictions unknown to contractor.`,
  `Dispute Resolution and Attorney Fees: Any dispute arising from this agreement shall be resolved in Kerr County, Texas. Customer agrees to venue and jurisdiction in Kerr County. In any legal action to enforce this agreement, prevailing party is entitled to reasonable attorney fees and costs. Customer waives right to jury trial.`,
  `Limitation of Liability: Contractor's total liability under this agreement is limited to the total contract price paid. Contractor is not liable for consequential, incidental, or punitive damages under any circumstances. This limitation applies regardless of the form of action whether in contract, tort, negligence, strict liability, or otherwise.`,
  `Lien Rights: Contractor reserves all lien rights under Texas Property Code Chapter 53. Contractor may file a mechanic's lien for unpaid amounts. Customer is responsible for contractor's attorney fees incurred to collect unpaid amounts.`,
  `Entire Agreement: This proposal constitutes the entire agreement between parties. No verbal agreements or representations are binding. This agreement may only be modified in writing signed by both parties. Customer acknowledges reading and understanding all terms before signing.`,
  `Severability: If any provision of this agreement is found unenforceable, remaining provisions remain in full effect.`,
  `Assignment: Customer may not assign this agreement without contractor's written consent. Contractor may assign this agreement or subcontract work without customer consent.`,
  `Acceptance and Authority: Person signing this proposal warrants they have authority to bind property owner and agrees to personal liability if authority is disputed.`,
];

// ============================================================
// Helper: page break check
// ============================================================

function ensureSpace(doc: jsPDF, y: number, needed: number, marginTop: number = 25): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - 20) {
    doc.addPage();
    return marginTop;
  }
  return y;
}

// ============================================================
// Helper to load logo image as data URL for PDF embedding
// Re-encodes via canvas to avoid jsPDF PNG parser issues (alpha, interlacing)
async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const resp = await fetch('/images/hayden-logo.png');
    if (!resp.ok) { console.warn('Logo fetch failed:', resp.status); return null; }
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    // Invert to white for dark banner background
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (e) { console.warn('Logo load error:', e); return null; }
}

// Register Michroma font with jsPDF (matches website branding)
async function registerMichromaFont(doc: jsPDF): Promise<boolean> {
  try {
    const resp = await fetch('/fonts/Michroma-Regular.ttf');
    if (!resp.ok) return false;
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    doc.addFileToVFS('Michroma-Regular.ttf', base64);
    doc.addFont('Michroma-Regular.ttf', 'Michroma', 'normal');
    doc.addFont('Michroma-Regular.ttf', 'Michroma', 'bold');
    doc.addFont('Michroma-Regular.ttf', 'Michroma', 'italic');
    return true;
  } catch { return false; }
}

// Main PDF generator
// ============================================================

export async function generateFenceBidPDF(data: FenceBidData): Promise<void> {
  const doc = new jsPDF('p', 'mm', 'letter');
  const pw = doc.internal.pageSize.getWidth();  // 215.9
  const mx = 18; // margins
  const cw = pw - mx * 2; // content width

  let y = 18;

  // Load logo
  const logoDataUrl = await loadLogoDataUrl();

  // Register brand font (falls back to helvetica if unavailable)
  const hasMichroma = await registerMichromaFont(doc);
  const brandFont = hasMichroma ? 'Michroma' : 'helvetica';
  // Michroma is ~30% wider than Helvetica — scale font sizes down to prevent overflow
  const sz = (s: number) => { doc.setFontSize(hasMichroma ? s * 0.78 : s); };

  // ── Page 1: Header ──
  // Dark navy banner
  doc.setFillColor(27, 38, 54);
  doc.rect(0, 0, pw, 44, 'F');

  // Logo (white, full width of left half) — ratio ~3.43:1
  if (logoDataUrl) {
    const logoH = 16; // mm tall
    const logoW = logoH * 3.43; // ~55mm wide
    try { doc.addImage(logoDataUrl, 'PNG', mx, 6, logoW, logoH); } catch (e) { console.warn('Logo addImage error:', e); }
    // Contact info below logo
    sz(7);
    doc.setFont(brandFont, 'normal');
    doc.setTextColor(200, 210, 220);
    doc.text(COMPANY.address, mx, 28);
    doc.text(`${COMPANY.phone}  •  ${COMPANY.email}`, mx, 33);
  } else {
    // Fallback: company name as text
    doc.setTextColor(255, 255, 255);
    sz(22);
    doc.setFont(brandFont, 'bold');
    doc.text(COMPANY.name, mx, y + 3);
    sz(8);
    doc.setFont(brandFont, 'normal');
    doc.setTextColor(200, 210, 220);
    doc.text(COMPANY.address, mx, y + 11);
    doc.text(`${COMPANY.phone}  •  ${COMPANY.email}`, mx, y + 16);
  }

  // Proposal dates (right side)
  sz(8);
  doc.setTextColor(200, 210, 220);
  doc.text(`Proposal Date: ${data.date}`, pw - mx, 28, { align: 'right' });
  doc.text(`Valid Through: ${data.validUntil}`, pw - mx, 33, { align: 'right' });

  // Thin accent line at bottom of header
  doc.setFillColor(196, 164, 105); // coyote tan accent
  doc.rect(0, 44, pw, 1.2, 'F');

  y = 52;

  // ── Title ──
  doc.setTextColor(27, 38, 54);
  sz(15);
  doc.setFont(brandFont, 'bold');
  const title = data.fenceType.toUpperCase() + ' INSTALLATION PROPOSAL';
  doc.text(title, pw / 2, y, { align: 'center' });
  y += 10;

  // ── Prepared For block ──
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(mx, y, cw, 22, 2, 2, 'F');
  doc.setDrawColor(220, 225, 230);
  doc.setLineWidth(0.3);
  doc.roundedRect(mx, y, cw, 22, 2, 2, 'S');

  // Left column: Prepared For
  sz(7);
  doc.setFont(brandFont, 'bold');
  doc.setTextColor(150, 150, 150);
  doc.text('PREPARED FOR', mx + 5, y + 5);

  sz(11);
  doc.setFont(brandFont, 'bold');
  doc.setTextColor(27, 38, 54);
  doc.text(data.clientName || 'Customer', mx + 5, y + 12);

  if (data.propertyAddress) {
    sz(8);
    doc.setFont(brandFont, 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(data.propertyAddress, mx + 5, y + 17);
  }

  // Right column: Project Name
  sz(7);
  doc.setFont(brandFont, 'bold');
  doc.setTextColor(150, 150, 150);
  doc.text('PROJECT', mx + cw / 2 + 5, y + 5);

  sz(10);
  doc.setFont(brandFont, 'bold');
  doc.setTextColor(27, 38, 54);
  doc.text(data.projectName || 'Fence Installation', mx + cw / 2 + 5, y + 12);

  sz(8);
  doc.setFont(brandFont, 'normal');
  doc.setTextColor(80, 80, 80);
  const specLine = [data.fenceHeight, data.stayTuffModel].filter(Boolean).join(' — ');
  if (specLine) doc.text(specLine, mx + cw / 2 + 5, y + 17);

  y += 30;

  // ── Investment Summary ──
  y = ensureSpace(doc, y, 60);
  doc.setTextColor(27, 38, 54);
  sz(12);
  doc.setFont(brandFont, 'bold');
  doc.text('INVESTMENT SUMMARY', mx, y);
  y += 8;

  // Table header
  doc.setFillColor(27, 38, 54);
  doc.rect(mx, y - 4, cw, 8, 'F');
  doc.setTextColor(255, 255, 255);
  sz(9);
  doc.setFont(brandFont, 'bold');
  doc.text('Section', mx + 3, y);
  doc.text('Linear Feet', mx + cw * 0.55, y);
  doc.text('Total', mx + cw - 3, y, { align: 'right' });
  y += 7;

  // Section rows
  let totalLinearFeetPricing = 0;
  doc.setTextColor(50, 50, 50);
  doc.setFont(brandFont, 'normal');

  for (let i = 0; i < data.sections.length; i++) {
    const sec = data.sections[i];
    y = ensureSpace(doc, y, 7);

    if (i % 2 === 0) {
      doc.setFillColor(245, 247, 250);
      doc.rect(mx, y - 4, cw, 7, 'F');
    }

    sz(9);
    const secLabel = sec.fenceTypeOverride
      ? `${sec.name} (${sec.fenceTypeOverride.replace(/_/g, ' ')})`
      : sec.name;
    doc.text(secLabel, mx + 3, y);
    doc.text(sec.linearFeet.toLocaleString(), mx + cw * 0.55, y);
    doc.text(`$${sec.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, mx + cw - 3, y, { align: 'right' });
    totalLinearFeetPricing += sec.linearFeet;
    y += 7;
  }

  // Gates (if any)
  for (const gate of data.gates) {
    y = ensureSpace(doc, y, 7);
    sz(9);
    doc.text(gate.type, mx + 3, y);
    doc.text('—', mx + cw * 0.55, y);
    doc.text(`$${gate.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, mx + cw - 3, y, { align: 'right' });
    y += 7;
  }

  // Total linear feet row
  y = ensureSpace(doc, y, 8);
  doc.setFillColor(230, 235, 240);
  doc.rect(mx, y - 4, cw, 8, 'F');
  doc.setFont(brandFont, 'bold');
  sz(9);
  doc.setTextColor(27, 38, 54);
  doc.text(`Total Linear Feet: ${totalLinearFeetPricing.toLocaleString()}`, mx + 3, y);
  y += 10;

  // Accessories breakdown (if any)
  if (data.accessories) {
    const acc = data.accessories;
    const accRows: [string, number][] = [];
    if (acc.postCaps > 0) accRows.push([`Post Caps (${acc.postCaps})`, acc.postCaps * 3.5]);
    if (acc.tensioners > 0) accRows.push([`Inline Tensioners (${acc.tensioners})`, acc.tensioners * 12]);
    if (acc.springIndicators > 0) accRows.push([`Spring Tension Indicators (${acc.springIndicators})`, acc.springIndicators * 18]);
    if (acc.concreteFillPosts > 0) accRows.push([`Concrete Fill — Posts (${acc.concreteFillPosts})`, acc.concreteFillPosts * 8]);
    if (acc.concreteFillBraces > 0) accRows.push([`Concrete Fill — Braces (${acc.concreteFillBraces})`, acc.concreteFillBraces * 12]);
    if (accRows.length > 0) {
      y = ensureSpace(doc, y, 8 + accRows.length * 7);
      doc.setFont(brandFont, 'bold');
      sz(9);
      doc.setTextColor(27, 38, 54);
      doc.text('Accessories', mx + 3, y);
      y += 7;
      for (const [label, cost] of accRows) {
        y = ensureSpace(doc, y, 7);
        doc.setFont(brandFont, 'normal');
        sz(8);
        doc.setTextColor(80, 80, 80);
        doc.text(`  ${label}`, mx + 3, y);
        doc.text(`$${cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, mx + cw - 3, y, { align: 'right' });
        y += 7;
      }
    }
  }

  // Painting add-on (if selected)
  if (data.painting) {
    y = ensureSpace(doc, y, 22);
    doc.setFont(brandFont, 'bold');
    sz(9);
    doc.setTextColor(27, 38, 54);
    doc.text('Painting', mx + 3, y);
    y += 7;
    const paintLines: [string, string][] = [
      [`${data.painting.color} — ${data.painting.gallons} gal paint`, `$${data.painting.materialCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
      ['Paint labor', `$${data.painting.laborCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
    ];
    for (const [label, cost] of paintLines) {
      y = ensureSpace(doc, y, 7);
      doc.setFont(brandFont, 'normal');
      sz(8);
      doc.setTextColor(80, 80, 80);
      doc.text(`  ${label}`, mx + 3, y);
      doc.text(cost, mx + cw - 3, y, { align: 'right' });
      y += 7;
    }
  }

  // Steep grade surcharge (if any)
  if (data.steepFootage && data.steepSurchargePerFoot) {
    y = ensureSpace(doc, y, 10);
    doc.setFillColor(255, 240, 240);
    doc.rect(mx, y - 4, cw, 8, 'F');
    doc.setFont(brandFont, 'bold');
    sz(9);
    doc.setTextColor(180, 40, 40);
    const steepTotal = data.steepFootage * data.steepSurchargePerFoot;
    doc.text(`Steep Grade Surcharge (${data.steepFootage}' @ $${data.steepSurchargePerFoot}/ft)`, mx + 3, y);
    doc.text(`$${steepTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, mx + cw - 3, y, { align: 'right' });
    y += 10;
  }

  // Project total
  doc.setFillColor(27, 38, 54);
  doc.rect(mx, y - 4, cw, 10, 'F');
  doc.setTextColor(255, 255, 255);
  sz(12);
  doc.setFont(brandFont, 'bold');
  doc.text('PROJECT TOTAL', mx + 3, y + 1);
  doc.text(`$${data.projectTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, mx + cw - 3, y + 1, { align: 'right' });
  y += 12;

  // ── Cost-Per-Year Value Comparison ──
  {
    const totalLinFt = data.sections.reduce((s, sec) => s + sec.linearFeet, 0);
    const costPerFt = totalLinFt > 0 ? data.projectTotal / totalLinFt : 0;
    const lifespan = data.fenceLifespanYears ?? 25;
    const costPerFtPerYear = lifespan > 0 ? costPerFt / lifespan : 0;

    const altCostPerFt = data.alternativeCostPerFoot ?? 6;
    const altLifespan = data.alternativeLifespanYears ?? 8;
    const altCostPerFtPerYear = altLifespan > 0 ? altCostPerFt / altLifespan : 0;

    y = ensureSpace(doc, y, 32);

    // Two-column comparison boxes
    const boxW = (cw - 6) / 2;
    const boxH = 24;

    // Left box — This fence
    doc.setFillColor(240, 250, 245);
    doc.roundedRect(mx, y, boxW, boxH, 2, 2, 'F');
    doc.setFillColor(34, 139, 84);
    doc.rect(mx, y, boxW, 2.5, 'F');

    sz(7);
    doc.setFont(brandFont, 'bold');
    doc.setTextColor(34, 139, 84);
    doc.text('THIS FENCE', mx + 4, y + 7);

    sz(14);
    doc.setTextColor(27, 38, 54);
    doc.text(`$${costPerFtPerYear.toFixed(2)}/ft/yr`, mx + 4, y + 14);

    sz(7);
    doc.setFont(brandFont, 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`$${costPerFt.toFixed(2)}/ft  ×  ${lifespan} year lifespan`, mx + 4, y + 19);

    // Right box — Standard barbed alternative
    const rx = mx + boxW + 6;
    doc.setFillColor(255, 245, 245);
    doc.roundedRect(rx, y, boxW, boxH, 2, 2, 'F');
    doc.setFillColor(180, 60, 40);
    doc.rect(rx, y, boxW, 2.5, 'F');

    sz(7);
    doc.setFont(brandFont, 'bold');
    doc.setTextColor(180, 60, 40);
    doc.text(data.alternativeLabel || 'STANDARD BARBED WIRE', rx + 4, y + 7);

    sz(14);
    doc.setTextColor(27, 38, 54);
    doc.text(`$${altCostPerFtPerYear.toFixed(2)}/ft/yr`, rx + 4, y + 14);

    sz(7);
    doc.setFont(brandFont, 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`$${altCostPerFt.toFixed(2)}/ft  ×  ${altLifespan} year lifespan`, rx + 4, y + 19);

    y += boxH + 4;

    // Savings note
    if (costPerFtPerYear < altCostPerFtPerYear) {
      const savings = altCostPerFtPerYear - costPerFtPerYear;
      const pctSavings = Math.round((savings / altCostPerFtPerYear) * 100);
      sz(7.5);
      doc.setFont(brandFont, 'bold');
      doc.setTextColor(34, 139, 84);
      doc.text(`Your fence costs ${pctSavings}% less per year than ${data.alternativeSavingsLabel || 'a standard barbed wire installation'} that needs replacing in ${altLifespan} years.`, mx, y);
      y += 5;
    }

    // Acreage framing (if provided)
    if (data.enclosedAcreage && data.enclosedAcreage > 0) {
      const costPerAcre = data.projectTotal / data.enclosedAcreage;
      sz(7.5);
      doc.setFont(brandFont, 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(`Enclosing ${data.enclosedAcreage.toFixed(1)} acres  —  $${costPerAcre.toLocaleString(undefined, { maximumFractionDigits: 0 })}/acre  —  $${(costPerAcre / lifespan).toFixed(0)}/acre/year over the fence lifetime.`, mx, y);
      y += 5;
    }

    y += 4;
  }

  // ── Seasonal Pricing Indicator ──
  if (data.seasonalPricingDeadline) {
    y = ensureSpace(doc, y, 14);

    doc.setFillColor(255, 251, 235);
    doc.roundedRect(mx, y - 2, cw, 12, 2, 2, 'F');
    doc.setDrawColor(217, 170, 56);
    doc.setLineWidth(0.4);
    doc.roundedRect(mx, y - 2, cw, 12, 2, 2, 'S');

    sz(8.5);
    doc.setFont(brandFont, 'bold');
    doc.setTextColor(130, 90, 10);
    doc.text(`Book before ${data.seasonalPricingDeadline} and lock in current material pricing.`, mx + 5, y + 4);

    sz(7);
    doc.setFont(brandFont, 'normal');
    doc.setTextColor(100, 80, 30);
    doc.text('Material costs are subject to change after this date. See Terms & Conditions for details.', mx + 5, y + 8);

    y += 16;
  }

  // ── Payment Schedule ──
  y = ensureSpace(doc, y, 40);
  doc.setTextColor(27, 38, 54);
  sz(12);
  doc.setFont(brandFont, 'bold');
  doc.text('PAYMENT SCHEDULE', mx, y);
  y += 8;

  // Payment table
  const payRows = [
    [`Deposit (${data.depositPercent}% — due at signing)`, `$${data.depositAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
    ['Balance (due at completion)', `$${data.balanceAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
  ];

  for (let i = 0; i < payRows.length; i++) {
    y = ensureSpace(doc, y, 7);
    if (i % 2 === 0) {
      doc.setFillColor(245, 247, 250);
      doc.rect(mx, y - 4, cw, 7, 'F');
    }
    doc.setFont(brandFont, 'normal');
    sz(9);
    doc.setTextColor(50, 50, 50);
    doc.text(payRows[i][0], mx + 3, y);
    doc.text(payRows[i][1], mx + cw - 3, y, { align: 'right' });
    y += 7;
  }

  // Total row
  doc.setFillColor(27, 38, 54);
  doc.rect(mx, y - 4, cw, 8, 'F');
  doc.setTextColor(255, 255, 255);
  sz(10);
  doc.setFont(brandFont, 'bold');
  doc.text('PROJECT TOTAL', mx + 3, y);
  doc.text(`$${data.projectTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, mx + cw - 3, y, { align: 'right' });
  y += 14;

  // ── Project Overview ──
  sz(12);
  doc.setFont(brandFont, 'bold');
  doc.text('PROJECT OVERVIEW', mx, y);
  y += 6;

  sz(9);
  doc.setFont(brandFont, 'normal');
  doc.setTextColor(60, 60, 60);
  const overviewLines = doc.splitTextToSize(data.projectOverview, cw);
  doc.text(overviewLines, mx, y);
  y += overviewLines.length * 4 + 6;

  // ── Site Map (if captured) ──
  if (data.mapImages && data.mapImages.length > 0) {
    const imgWidth = cw;

    for (let mi = 0; mi < data.mapImages.length; mi++) {
      try {
        // Compute actual aspect ratio from the base64 image
        let imgHeight = imgWidth * 0.55; // fallback ~16:9
        try {
          const imgProps = doc.getImageProperties(data.mapImages[mi]);
          imgHeight = imgWidth * (imgProps.height / imgProps.width);
        } catch { /* use fallback */ }

        y = ensureSpace(doc, y, imgHeight + 18);

        doc.setTextColor(27, 38, 54);
        sz(11);
        doc.setFont(brandFont, 'bold');
        if (mi === 0) {
          doc.text(data.mapImages.length === 1 ? 'SITE MAP & FENCE LAYOUT' : `SITE MAP & FENCE LAYOUT (${mi + 1} of ${data.mapImages.length})`, mx, y);
        } else {
          doc.text(`SITE MAP — VIEW ${mi + 1} of ${data.mapImages.length}`, mx, y);
        }
        y += 6;

        doc.addImage(data.mapImages[mi], 'PNG', mx, y, imgWidth, imgHeight);
        y += imgHeight + 2;

        // Legend on first image only
        if (mi === 0) {
          sz(7);
          doc.setFont(brandFont, 'italic');
          doc.setTextColor(100, 100, 100);
          let legend = 'Satellite view showing fence line placement, gate locations, and brace positions. Orange = fence line, Red = end posts, Blue = corner braces, Green = H-braces, Yellow = gates.';
          if (data.enclosedAcreage && data.enclosedAcreage > 0) {
            legend += ` Enclosed area: approximately ${data.enclosedAcreage.toFixed(1)} acres.`;
          }
          doc.text(legend, mx, y);
          y += 8;
        } else {
          y += 4;
        }
      } catch {
        // Skip image if it fails
      }
    }
  }

  // ── Stay-Tuff Warranty (if applicable) ──
  if (data.stayTuffModel) {
    y = ensureSpace(doc, y, 25);
    doc.setTextColor(27, 38, 54);
    sz(11);
    doc.setFont(brandFont, 'bold');
    doc.text('STAY-TUFF 20 YEAR LIMITED WARRANTY', mx, y);
    y += 5;

    sz(8.5);
    doc.setFont(brandFont, 'normal');
    doc.setTextColor(60, 60, 60);
    const warrantyText = `Stay-Tuff field fence is Made in USA and comes with a 20 Year Limited Warranty against manufacturing defects. This warranty covers the fence wire against rust-through, wire breakage due to manufacturing defects, and loss of structural integrity under normal agricultural use. The Stay-Tuff warranty is transferable to subsequent property owners. Complete warranty details available at staytuff.com/warranty-pdf.`;
    const wLines = doc.splitTextToSize(warrantyText, cw);
    doc.text(wLines, mx, y);
    y += wLines.length * 3.5 + 8;
  }

  // ── Product Photos Page ──
  if (data.productImages && data.productImages.length > 0) {
    doc.addPage();
    y = 20;

    // Section header with accent bar
    doc.setFillColor(27, 38, 54);
    doc.rect(mx, y - 3, cw, 9, 'F');
    doc.setTextColor(255, 255, 255);
    sz(12);
    doc.setFont(brandFont, 'bold');
    doc.text('YOUR FENCE MATERIALS', mx + 4, y + 3);
    y += 14;

    doc.setTextColor(60, 60, 60);
    sz(8.5);
    doc.setFont(brandFont, 'italic');
    const introText = `Below are the actual Stay-Tuff products specified for your ${data.fenceType} installation. All wire is Made in USA with a 20 Year Limited Warranty.`;
    const introLines = doc.splitTextToSize(introText, cw);
    doc.text(introLines, mx, y);
    y += introLines.length * 3.5 + 6;

    // Layout photos in a grid — 2 columns
    const colW = (cw - 6) / 2;
    const photos = data.productImages;

    for (let i = 0; i < photos.length; i++) {
      const col = i % 2;
      const isNewRow = col === 0;

      if (isNewRow && i > 0) {
        y += 4; // gap between rows
      }

      // Check if we need a new page (estimate ~80mm per image row)
      if (isNewRow) {
        y = ensureSpace(doc, y, 85);
      }

      const imgX = mx + col * (colW + 6);

      // Compute actual aspect ratio for correct rendering
      let imgH = colW * 0.75; // fallback 4:3
      try {
        const imgProps = doc.getImageProperties(photos[i].dataUrl);
        imgH = (colW - 1) * (imgProps.height / imgProps.width);
      } catch { /* use fallback */ }

      try {
        // Photo border
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.3);
        doc.rect(imgX, y, colW, imgH);

        // Image
        const fmt = photos[i].dataUrl.includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(photos[i].dataUrl, fmt, imgX + 0.5, y + 0.5, colW - 1, imgH - 1);

        // Label below photo
        sz(7);
        doc.setFont(brandFont, 'bold');
        doc.setTextColor(27, 38, 54);
        const labelLines = doc.splitTextToSize(photos[i].label, colW);
        doc.text(labelLines, imgX + colW / 2, y + imgH + 3, { align: 'center' });

        // Only advance y after the second column (or last image)
        if (col === 1 || i === photos.length - 1) {
          y += imgH + labelLines.length * 3 + 4;
        }
      } catch {
        // Skip failed images
        if (col === 1 || i === photos.length - 1) {
          y += 10;
        }
      }
    }
  }

  // ── Property Research & Site Analysis (comprehensive) ──
  if (data.soilNarrative || data.siteData) {
    y = ensureSpace(doc, y, 40);

    // ─── Section header with accent bar ───
    doc.setFillColor(27, 38, 54);
    doc.rect(mx, y - 3, cw, 9, 'F');
    doc.setTextColor(255, 255, 255);
    sz(12);
    doc.setFont(brandFont, 'bold');
    doc.text('PROPERTY RESEARCH & SITE ANALYSIS', mx + 4, y + 3);
    y += 12;

    doc.setTextColor(60, 60, 60);
    sz(8.5);
    doc.setFont(brandFont, 'italic');
    doc.text('Before designing your fence, our team researched your property using the USDA National Resources Conservation Service', mx, y);
    y += 3.5;
    doc.text('(NRCS) Web Soil Survey and supplemental USDA Soil Data Access databases. Here is what we found:', mx, y);
    y += 7;

    // ─── Quick Data Callout Boxes (if we have structured data) ───
    const site = data.siteData;
    if (site) {
      const boxes: { label: string; value: string; note: string }[] = [];

      if (site.soilType) boxes.push({ label: 'Primary Soil', value: site.soilType.length > 30 ? site.soilType.slice(0, 28) + '…' : site.soilType, note: 'USDA NRCS' });
      if (site.bedrockDepthIn != null) {
        const ft = Math.floor(site.bedrockDepthIn / 12);
        const inches = site.bedrockDepthIn % 12;
        boxes.push({ label: 'Bedrock Depth', value: ft > 0 ? `${ft}' ${inches > 0 ? inches + '"' : ''}`.trim() : `${site.bedrockDepthIn}"`, note: site.restrictionType || 'bedrock' });
      }
      if (site.texture) boxes.push({ label: 'Soil Texture', value: site.texture.length > 22 ? site.texture.slice(0, 20) + '…' : site.texture, note: 'top horizon' });
      if (site.pH != null) boxes.push({ label: 'Soil pH', value: site.pH.toFixed(1), note: site.pH >= 7.5 ? 'alkaline' : site.pH <= 5.5 ? 'acidic' : 'near-neutral' });
      if (site.rockFragmentPct != null && site.rockFragmentPct > 0) boxes.push({ label: 'Rock Content', value: `${site.rockFragmentPct}%`, note: 'coarse fragments' });
      if (site.clayPct != null) boxes.push({ label: 'Clay Content', value: `${site.clayPct}%`, note: site.clayPct >= 35 ? 'expansive' : 'normal range' });
      if (site.slopeRange) boxes.push({ label: 'Slope Range', value: site.slopeRange, note: 'USDA survey' });
      if (site.drainage) boxes.push({ label: 'Drainage', value: site.drainage, note: site.runoff ? `${site.runoff} runoff` : '' });

      if (boxes.length > 0) {
        // Draw data boxes (up to 4 per row)
        const boxesPerRow = Math.min(4, boxes.length);
        const boxW = (cw - (boxesPerRow - 1) * 3) / boxesPerRow;
        const boxH = 18;

        for (let i = 0; i < boxes.length; i++) {
          if (i > 0 && i % boxesPerRow === 0) {
            y += boxH + 3;
            y = ensureSpace(doc, y, boxH + 3);
          }
          const col = i % boxesPerRow;
          const bx = mx + col * (boxW + 3);

          // Box background
          doc.setFillColor(244, 247, 252);
          doc.roundedRect(bx, y, boxW, boxH, 2, 2, 'F');

          // Accent line
          doc.setFillColor(59, 130, 246);
          doc.rect(bx, y, boxW, 2.5, 'F');

          // Label
          sz(6.5);
          doc.setFont(brandFont, 'bold');
          doc.setTextColor(100, 110, 130);
          doc.text(boxes[i].label.toUpperCase(), bx + 3, y + 6);

          // Value
          sz(9);
          doc.setFont(brandFont, 'bold');
          doc.setTextColor(27, 38, 54);
          doc.text(boxes[i].value, bx + 3, y + 11.5);

          // Note
          if (boxes[i].note) {
            sz(6);
            doc.setFont(brandFont, 'italic');
            doc.setTextColor(130, 130, 150);
            doc.text(boxes[i].note, bx + 3, y + 15);
          }
        }
        y += boxH + 8;
      }
    }

    // ─── AI / Template Narrative ───
    if (data.soilNarrative) {
      y = ensureSpace(doc, y, 20);
      doc.setTextColor(27, 38, 54);
      sz(10);
      doc.setFont(brandFont, 'bold');
      doc.text('Understanding Your Land', mx, y);
      y += 5;

      sz(8.5);
      doc.setFont(brandFont, 'normal');
      doc.setTextColor(55, 55, 60);
      const soilLines = doc.splitTextToSize(data.soilNarrative, cw);
      for (let i = 0; i < soilLines.length; i++) {
        y = ensureSpace(doc, y, 4);
        doc.text(soilLines[i], mx, y);
        y += 3.5;
      }
      y += 5;
    }

    // ─── Soil Profile Detail (if we have structured taxonomy) ───
    if (site && (site.taxonomy || site.components?.length > 0)) {
      y = ensureSpace(doc, y, 25);
      doc.setTextColor(27, 38, 54);
      sz(10);
      doc.setFont(brandFont, 'bold');
      doc.text('Soil Profile', mx, y);
      y += 5;

      sz(8.5);
      doc.setFont(brandFont, 'normal');
      doc.setTextColor(55, 55, 60);

      if (site.taxonomy) {
        const taxParts: string[] = [];
        taxParts.push(`Your property sits on soil classified by the USDA as "${site.taxonomy}." This scientific classification tells us a great deal about how this soil formed over thousands of years and how it behaves.`);

        if (site.taxOrder) {
          const orderDescriptions: Record<string, string> = {
            'mollisols': 'Mollisols are among the most fertile soils in the world, formed under grassland vegetation. They are characterized by a thick, dark surface horizon rich in organic matter — excellent for ranching but the high organic content means post holes may need extra concrete to prevent settling.',
            'vertisols': 'Vertisols are heavy clay soils that shrink dramatically when dry and swell when wet, forming deep cracks in summer. This "shrink-swell" action can literally push fence posts out of the ground over time. We combat this with deeper post settings and extra concrete.',
            'alfisols': 'Alfisols are moderately fertile soils with a distinct clay layer at depth. They form under hardwood forests and are common throughout the Hill Country. The clay subsoil provides good anchor for fence posts once you get below the topsoil.',
            'inceptisols': 'Inceptisols are young soils that have just begun to develop distinct layers. In the Hill Country, these often form on steep slopes where erosion prevents deep soil development — which means you may hit rock relatively quickly when digging.',
            'entisols': 'Entisols are very young soils with minimal development — essentially weathered rock. These are common on steep slopes, floodplains, and rocky ridgelines in the Hill Country. Post installation in Entisols often requires rock augering because there simply is not much soil depth to work with.',
            'aridisols': 'Aridisols form in dry climates and often contain calcium carbonate (caliche) layers that are extremely hard. Caliche layers are notorious in Texas for destroying auger bits and requiring specialized augering equipment.',
          };
          const orderKey = site.taxOrder.toLowerCase();
          const orderDesc = orderDescriptions[orderKey];
          if (orderDesc) taxParts.push(orderDesc);
        }

        const taxText = taxParts.join(' ');
        const taxLines = doc.splitTextToSize(taxText, cw);
        for (let i = 0; i < taxLines.length; i++) {
          y = ensureSpace(doc, y, 4);
          doc.text(taxLines[i], mx, y);
          y += 3.5;
        }
        y += 3;
      }

      // Soil components breakdown
      if (site.components && site.components.length > 0) {
        y = ensureSpace(doc, y, 10);
        sz(8.5);
        doc.setFont(brandFont, 'normal');
        const compIntro = `The soil survey divides your property's soil map unit into ${site.components.length} component${site.components.length > 1 ? 's' : ''}:`;
        doc.text(compIntro, mx, y);
        y += 4.5;

        for (const comp of site.components) {
          y = ensureSpace(doc, y, 5);
          doc.setFont(brandFont, 'bold');
          sz(8);
          doc.text(`• ${comp.name}`, mx + 3, y);
          doc.setFont(brandFont, 'normal');
          const compDetail = ` — ${comp.percent}% of area${comp.drainage ? ', ' + comp.drainage + ' drainage' : ''}${comp.hydric === 'Yes' ? ', hydric (wetland)' : ''}`;
          doc.text(compDetail, mx + 3 + doc.getTextWidth(`• ${comp.name}`), y);
          y += 4;
        }
        y += 3;
      }
    }

    // ─── Subsurface & Rock Conditions ───
    if (site && (site.bedrockDepthIn != null || (site.rockFragmentPct != null && site.rockFragmentPct > 10))) {
      y = ensureSpace(doc, y, 25);
      doc.setTextColor(27, 38, 54);
      sz(10);
      doc.setFont(brandFont, 'bold');
      doc.text('What\'s Below the Surface', mx, y);
      y += 5;

      // ─── Bedrock depth cross-section visual ───
      if (site.bedrockDepthIn != null) {
        const vizH = 62; // total height of the visual
        y = ensureSpace(doc, y, vizH + 8);

        const depth = site.bedrockDepthIn;
        const ft = Math.floor(depth / 12);
        const inches = depth % 12;
        const depthLabel = ft > 0 ? `${ft}' ${inches > 0 ? inches + '"' : ''}`.trim() : `${depth}"`;

        const rockAnchorIn = 12; // always set at least 1' into bedrock
        const minPostDepthIn = 36; // every post must be at least 3' deep
        const totalPostDepthIn = Math.max(minPostDepthIn, depth + rockAnchorIn); // at least 3' deep AND 1' into bedrock
        const actualRockPenetration = totalPostDepthIn - depth; // how far post goes into bedrock

        // Scale: map 0 to max depth to the visual height
        const maxScaleIn = Math.max(60, totalPostDepthIn + 6);
        const soilZoneH = Math.min((depth / maxScaleIn) * (vizH - 8), vizH - 18);
        const bedrockY = y + 4 + soilZoneH;

        // Dimensions
        const vizX = mx + 10;
        const vizW = cw - 20;
        const postW = 5;
        const postX = vizX + vizW * 0.35;
        const postSoilH = soilZoneH; // post through entire soil zone
        const postRockH = (actualRockPenetration / maxScaleIn) * (vizH - 8); // actual penetration into bedrock
        const postTotalH = postSoilH + postRockH;
        const postAboveH = 12; // above-ground portion

        // ── Ground surface line ──
        const groundY = y + 4;
        // Sky / air above ground
        doc.setFillColor(232, 243, 255);
        doc.rect(vizX, groundY - 3, vizW, 3, 'F');

        // ── Soil zone ──
        doc.setFillColor(194, 163, 120); // warm tan (soil)
        doc.rect(vizX, groundY, vizW, soilZoneH, 'F');

        // Soil texture — scattered dots for rock fragments
        if (site.rockFragmentPct != null && site.rockFragmentPct > 10) {
          doc.setFillColor(160, 140, 110);
          const numDots = Math.min(Math.round(site.rockFragmentPct / 3), 20);
          for (let d = 0; d < numDots; d++) {
            const dx = vizX + 4 + ((d * 37 + 13) % (Math.round(vizW) - 8));
            const dy = groundY + 2 + ((d * 23 + 7) % Math.max(1, Math.round(soilZoneH - 4)));
            const r = 0.6 + (d % 3) * 0.3;
            doc.circle(dx, dy, r, 'F');
          }
        }

        // ── Bedrock zone ──
        const bedrockZoneH = vizH - 8 - soilZoneH;
        doc.setFillColor(140, 140, 150); // grey rock
        doc.rect(vizX, bedrockY, vizW, bedrockZoneH, 'F');
        // Rock texture — horizontal cracks
        doc.setDrawColor(120, 120, 130);
        doc.setLineWidth(0.2);
        for (let c = 0; c < 4; c++) {
          const cy = bedrockY + 2 + c * (bedrockZoneH / 4.5);
          if (cy < bedrockY + bedrockZoneH - 1) {
            const cx1 = vizX + 3 + (c * 19) % (vizW * 0.3);
            const cx2 = cx1 + 15 + (c * 11) % 25;
            doc.line(cx1, cy, Math.min(cx2, vizX + vizW - 3), cy);
          }
        }

        // ── Bedrock boundary line (thick colored line) ──
        doc.setDrawColor(180, 60, 40);
        doc.setLineWidth(0.6);
        doc.line(vizX, bedrockY, vizX + vizW, bedrockY);

        // ── Fence post — extends through soil AND into bedrock ──
        // Soil portion of post
        doc.setFillColor(90, 90, 90);
        doc.rect(postX, groundY, postW, postSoilH, 'F');
        // Bedrock-anchored portion of post (slightly lighter to show rock contact)
        doc.setFillColor(75, 75, 80);
        doc.rect(postX, bedrockY, postW, postRockH, 'F');
        // Concrete collar around post in bedrock (wider band)
        doc.setFillColor(180, 180, 175);
        doc.rect(postX - 1.5, bedrockY, postW + 3, postRockH * 0.6, 'F');
        // Re-draw post over concrete
        doc.setFillColor(75, 75, 80);
        doc.rect(postX, bedrockY, postW, postRockH, 'F');
        // Above-ground portion
        doc.setFillColor(70, 70, 70);
        doc.rect(postX, groundY - postAboveH, postW, postAboveH, 'F');
        // Post cap
        doc.setFillColor(50, 50, 50);
        doc.rect(postX - 0.5, groundY - postAboveH - 1.2, postW + 1, 1.2, 'F');

        // ── Rock anchor indicator bracket (left side of post) ──
        const bracketX = postX - 4;
        doc.setDrawColor(220, 180, 50); // gold/amber bracket
        doc.setLineWidth(0.4);
        doc.line(bracketX, bedrockY, bracketX, bedrockY + postRockH); // vertical
        doc.line(bracketX, bedrockY, bracketX + 1.5, bedrockY); // top tick
        doc.line(bracketX, bedrockY + postRockH, bracketX + 1.5, bedrockY + postRockH); // bottom tick
        // "X' INTO ROCK" label — reflects actual penetration
        sz(5.5);
        doc.setFont(brandFont, 'bold');
        doc.setTextColor(220, 180, 50);
        const rockMid = bedrockY + postRockH / 2 + 1.5;
        const rpFt = Math.floor(actualRockPenetration / 12);
        const rpIn = actualRockPenetration % 12;
        const rpLabel = rpFt > 0 ? `${rpFt}'${rpIn > 0 ? ` ${rpIn}"` : ''} ROCK SET` : `${actualRockPenetration}" ROCK SET`;
        // Rotate label vertically alongside bracket
        doc.text(rpLabel, bracketX - 1.5, rockMid, { angle: 90 });

        // ── Ground surface accent ──
        doc.setDrawColor(80, 120, 50); // green grass line
        doc.setLineWidth(0.8);
        doc.line(vizX, groundY, vizX + vizW, groundY);

        // ── Bedrock depth callout arrow (right side) ──
        const arrowX = vizX + vizW + 4;
        doc.setDrawColor(27, 38, 54);
        doc.setLineWidth(0.4);
        doc.line(arrowX, groundY, arrowX, bedrockY);
        doc.line(arrowX - 1.5, groundY, arrowX + 1.5, groundY);
        doc.line(arrowX - 1.5, bedrockY, arrowX + 1.5, bedrockY);
        doc.setFillColor(27, 38, 54);
        doc.triangle(arrowX - 1, bedrockY - 1.5, arrowX + 1, bedrockY - 1.5, arrowX, bedrockY, 'F');
        doc.triangle(arrowX - 1, groundY + 1.5, arrowX + 1, groundY + 1.5, arrowX, groundY, 'F');

        sz(8);
        doc.setFont(brandFont, 'bold');
        doc.setTextColor(180, 60, 40);
        const midArrow = (groundY + bedrockY) / 2;
        doc.text(depthLabel, arrowX + 3, midArrow + 1);

        // ── Total post depth callout arrow (far right) ──
        const arrow2X = arrowX + 14;
        const postBottomY = bedrockY + postRockH;
        doc.setDrawColor(70, 70, 70);
        doc.setLineWidth(0.3);
        doc.line(arrow2X, groundY, arrow2X, postBottomY);
        doc.line(arrow2X - 1.5, groundY, arrow2X + 1.5, groundY);
        doc.line(arrow2X - 1.5, postBottomY, arrow2X + 1.5, postBottomY);
        doc.setFillColor(70, 70, 70);
        doc.triangle(arrow2X - 0.8, postBottomY - 1.2, arrow2X + 0.8, postBottomY - 1.2, arrow2X, postBottomY, 'F');
        doc.triangle(arrow2X - 0.8, groundY + 1.2, arrow2X + 0.8, groundY + 1.2, arrow2X, groundY, 'F');

        const totalFt = Math.floor(totalPostDepthIn / 12);
        const totalIn = totalPostDepthIn % 12;
        const totalLabel = totalFt > 0 ? `${totalFt}' ${totalIn > 0 ? totalIn + '"' : ''}`.trim() : `${totalPostDepthIn}"`;
        sz(7);
        doc.setFont(brandFont, 'bold');
        doc.setTextColor(70, 70, 70);
        const mid2 = (groundY + postBottomY) / 2;
        doc.text(`${totalLabel} total`, arrow2X + 3, mid2 - 1);
        sz(6);
        doc.setFont(brandFont, 'normal');
        doc.text('post depth', arrow2X + 3, mid2 + 2.5);

        // ── Labels ──
        sz(7);
        doc.setFont(brandFont, 'bold');

        // "GROUND LEVEL"
        doc.setTextColor(80, 120, 50);
        doc.text('GROUND LEVEL', vizX + vizW * 0.65, groundY - 1);

        // "SOIL"
        doc.setTextColor(120, 90, 50);
        const soilMidY = groundY + soilZoneH / 2 + 2;
        doc.text('SOIL', vizX + 3, soilMidY);

        // "BEDROCK"
        doc.setTextColor(255, 255, 255);
        const rockMidY = bedrockY + bedrockZoneH / 2 + 2;
        doc.text(site.restrictionType ? site.restrictionType.toUpperCase() : 'BEDROCK', vizX + 3, rockMidY);

        // "FENCE POST" label
        doc.setTextColor(50, 50, 50);
        sz(6);
        doc.text('FENCE POST', postX + postW + 2, groundY + postSoilH * 0.35);

        // "ANCHORED IN ROCK" label near the rock portion
        doc.setTextColor(220, 180, 50);
        sz(5.5);
        doc.setFont(brandFont, 'bold');
        doc.text('ANCHORED IN ROCK', postX + postW + 2, bedrockY + postRockH / 2 + 1);

        // ── Severity indicator badge ──
        const severity = depth <= 18 ? 'ROCK AUGERING REQUIRED' : depth <= 30 ? 'PARTIAL ROCK AUGERING' : 'POSSIBLE ROCK';
        const badgeColor: [number, number, number] = depth <= 18 ? [180, 50, 40] : depth <= 30 ? [200, 140, 40] : [80, 140, 80];
        const badgeW = doc.getTextWidth(severity) + 6;
        doc.setFillColor(...badgeColor);
        const badgeX = vizX;
        const badgeY = y + vizH - 3;
        doc.roundedRect(badgeX, badgeY, badgeW + 2, 5, 1, 1, 'F');
        sz(6.5);
        doc.setFont(brandFont, 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(severity, badgeX + 1 + badgeW / 2, badgeY + 3.5, { align: 'center' });

        // Standard post depth reference
        sz(6);
        doc.setFont(brandFont, 'italic');
        doc.setTextColor(120, 120, 120);
        doc.text('Standard post depth: 30–36"', vizX + vizW - 2, badgeY + 3.5, { align: 'right' });

        y += vizH + 6;
      }

      sz(8.5);
      doc.setFont(brandFont, 'normal');
      doc.setTextColor(55, 55, 60);

      const subParts: string[] = [];
      if (site.bedrockDepthIn != null) {
        const depth = site.bedrockDepthIn;
        const ft = Math.floor(depth / 12);
        const inches = depth % 12;
        const depthStr = ft > 0 ? `${ft} feet${inches > 0 ? ' ' + inches + ' inches' : ''}` : `${depth} inches`;
        subParts.push(`According to USDA subsurface data, ${site.restrictionType || 'bedrock'} exists at approximately ${depthStr} below the surface on your property. Every fence post must be set at least 3 feet deep and anchored at least 1 foot into bedrock — whichever requires the deeper hole. ${depth <= 18 ? `At this depth, every single post hole will hit solid rock well before 3 feet. We use a rock auger to bore through the bedrock and set each post at least ${Math.ceil((36 - depth + 12) / 12)} feet into solid rock. This is actually the strongest possible installation — a post anchored in solid rock is not going anywhere.` : depth <= 30 ? 'At this depth, most post holes will encounter rock before reaching the 3-foot minimum. We bring rock augering equipment to finish these holes and ensure each post reaches full depth with proper rock anchorage.' : 'At this depth, our deeper post holes (particularly corner and end posts) may encounter rock. We keep augering equipment on-site as standard practice for Hill Country installations.'}`);
      }
      if (site.rockFragmentPct != null && site.rockFragmentPct > 10) {
        if (site.rockFragmentPct >= 50) {
          subParts.push(`The soil itself contains ${site.rockFragmentPct}% coarse rock fragments — cobbles and stones mixed throughout the soil matrix. In practical terms, this means the soil is essentially half rocks. Digging post holes in this material is significantly harder than in clean soil. Standard auger bits wear out quickly; we use heavy-duty carbide-tipped bits rated for rocky soil, and we carry backup bits for jobs like this.`);
        } else if (site.rockFragmentPct >= 25) {
          subParts.push(`With ${site.rockFragmentPct}% coarse rock fragments in the soil, post hole digging will encounter frequent cobbles and stones. This is common in the Texas Hill Country where limestone bedrock has been weathering for millions of years, mixing gravel and cobbles into the upper soil layers. Our auger equipment is rated for this type of soil.`);
        } else {
          subParts.push(`The soil contains about ${site.rockFragmentPct}% rock fragments — a moderate amount typical of Hill Country soils. Our equipment handles this easily, though digging may be slightly slower than in rock-free soil.`);
        }
      }

      const subText = subParts.join(' ');
      const subLines = doc.splitTextToSize(subText, cw);
      for (let i = 0; i < subLines.length; i++) {
        y = ensureSpace(doc, y, 4);
        doc.text(subLines[i], mx, y);
        y += 3.5;
      }
      y += 5;
    }

    // ─── Terrain, Drainage & Water ───
    if (site && (site.elevationChange > 5 || site.drainage || site.runoff || (site.hydric && site.hydric.toLowerCase() === 'yes'))) {
      y = ensureSpace(doc, y, 25);
      doc.setTextColor(27, 38, 54);
      sz(10);
      doc.setFont(brandFont, 'bold');
      doc.text('Terrain, Drainage & Water', mx, y);
      y += 5;

      sz(8.5);
      doc.setFont(brandFont, 'normal');
      doc.setTextColor(55, 55, 60);

      const tdParts: string[] = [];

      if (site.elevationChange > 5) {
        const elev = Math.round(site.elevationChange);
        if (elev > 50) {
          tdParts.push(`Your fence line crosses approximately ${elev} feet of elevation change${site.slopeRange ? ` (USDA slope range: ${site.slopeRange})` : ''}. That is significant — imagine a ${Math.round(elev / 3)}-story building. On steep grades, gravity pulls constantly on the wire, which means we need closer post spacing to prevent sagging and reinforced bracing at every grade change. Wire tension must be carefully balanced: too tight and the wire will snap in cold weather when it contracts; too loose and livestock can push through.`);
        } else if (elev > 15) {
          tdParts.push(`Your fence line crosses about ${elev} feet of elevation change${site.slopeRange ? ` (USDA slope range: ${site.slopeRange})` : ''}. This moderate grade requires attention to post spacing and wire tension — we have adjusted our material plan to use slightly closer post spacing on the sloped sections.`);
        } else {
          tdParts.push(`Your fence line is relatively level with only about ${elev} feet of elevation change — ideal conditions for efficient installation and even wire tension throughout.`);
        }
      }

      if (site.drainage) {
        const d = site.drainage.toLowerCase();
        if (d.includes('well')) {
          tdParts.push(`Your soil has "${site.drainage}" drainage, which is favorable for fence installation. Good drainage means post-hole concrete will cure properly and water won't pool around post bases, which is the number one cause of premature post failure.${site.runoff ? ` Surface runoff is classified as "${site.runoff}" — this tells us how quickly rainwater moves across the surface, which helps us plan for erosion protection around corner posts.` : ''}`);
        } else if (d.includes('poor') || d.includes('somewhat')) {
          tdParts.push(`Your soil has "${site.drainage}" drainage, which means water tends to linger in the soil. This is important for fence longevity — we use rapid-set concrete in areas where water is present and ensure posts are set at maximum depth to get below the saturated zone where possible.${site.runoff ? ` Surface runoff is classified as "${site.runoff}."` : ''}`);
        } else {
          tdParts.push(`Soil drainage is classified as "${site.drainage}."${site.runoff ? ` Surface runoff is ${site.runoff.toLowerCase()}.` : ''}`);
        }
      }

      if (site.hydric && site.hydric.toLowerCase() === 'yes') {
        tdParts.push('The USDA classifies portions of this soil as hydric, which means it shows indicators of seasonal wetland conditions. This does not mean your property is a swamp — many Hill Country properties have small hydric areas in low-lying draws and creek bottoms. We will identify these areas on-site and use appropriate techniques (deeper posts, rapid-set concrete) in those zones.');
      }

      if (tdParts.length > 0) {
        const tdText = tdParts.join(' ');
        const tdLines = doc.splitTextToSize(tdText, cw);
        for (let i = 0; i < tdLines.length; i++) {
          y = ensureSpace(doc, y, 4);
          doc.text(tdLines[i], mx, y);
          y += 3.5;
        }
        y += 5;
      }
    }

    // ─── Site-Specific Pricing Adjustments ───
    if (data.siteAdjustments && data.siteAdjustments.length > 0) {
      y = ensureSpace(doc, y, 30);
      doc.setTextColor(27, 38, 54);
      sz(10);
      doc.setFont(brandFont, 'bold');
      doc.text('What This Means for Your Fence & Pricing', mx, y);
      y += 5;

      sz(8.5);
      doc.setFont(brandFont, 'normal');
      doc.setTextColor(55, 55, 60);
      const introText = 'Based on our property research, we identified the following site conditions that directly affect installation approach and pricing. We believe in transparent pricing — you should know exactly WHY your bid is what it is.';
      const introLines = doc.splitTextToSize(introText, cw);
      for (let i = 0; i < introLines.length; i++) {
        y = ensureSpace(doc, y, 4);
        doc.text(introLines[i], mx, y);
        y += 3.5;
      }
      y += 4;

      for (const adj of data.siteAdjustments) {
        y = ensureSpace(doc, y, 24);

        // Adjustment card
        doc.setFillColor(254, 249, 243);
        const cardText = `${adj.impact}${adj.costNote ? ' ' + adj.costNote + '.' : ''}`;
        const cardLines = doc.splitTextToSize(cardText, cw - 16);
        const cardH = 14 + cardLines.length * 3.5;
        doc.roundedRect(mx + 2, y - 2, cw - 4, cardH, 1.5, 1.5, 'F');

        // Orange accent
        doc.setFillColor(234, 138, 45);
        doc.rect(mx + 2, y - 2, 2.5, cardH, 'F');

        // Title
        sz(8.5);
        doc.setFont(brandFont, 'bold');
        doc.setTextColor(27, 38, 54);
        doc.text(adj.label, mx + 8, y + 2);

        // Data point badge
        sz(7);
        doc.setFont(brandFont, 'normal');
        doc.setTextColor(140, 90, 30);
        doc.text(adj.dataPoint, mx + 8, y + 6);

        // Impact text
        sz(8);
        doc.setFont(brandFont, 'normal');
        doc.setTextColor(60, 60, 65);
        for (let i = 0; i < cardLines.length; i++) {
          doc.text(cardLines[i], mx + 8, y + 10 + i * 3.5);
        }
        y += cardH + 3;
      }
      y += 3;
    }

    // ─── Confidence Closer — ties soil findings to actual material selections ───
    if (site) {
      const isPipeFence = data.fenceType.toLowerCase().includes('pipe');
      const cfg = data.pipeFenceConfig;

      // For pipe fence, describe the upright/rail design instead of the wire-fence
      // line-post-and-T-post pair (T-posts and line-post spacing are not used).
      let isDrillStem: boolean;
      let postSelectionSentence: string;

      if (isPipeFence && cfg) {
        const uprightSpec = POST_MATERIALS.find(p => p.id === cfg.uprightMaterial);
        const railSpec = POST_MATERIALS.find(p => p.id === cfg.railMaterial);
        const upLabel = uprightSpec
          ? `${uprightSpec.label} (${uprightSpec.diameter}, ${uprightSpec.weightPerFoot} lb/ft)`
          : cfg.uprightMaterial;
        const railLabel = railSpec ? railSpec.label : cfg.railMaterial;
        isDrillStem = cfg.uprightMaterial.startsWith('drill_stem');
        postSelectionSentence = `We selected ${upLabel} for your uprights — set every ${cfg.postSpacingFeet}' along the ${cfg.fenceHeightFeet}' tall, ${cfg.railCount}-rail pipe fence — with ${railLabel} horizontal rails, specifically for the conditions on YOUR property.`;
      } else {
        const postSpec = POST_MATERIALS.find(p => p.id === data.postMaterial);
        const matPostLabel = postSpec
          ? `${postSpec.label} (${postSpec.diameter}, ${postSpec.weightPerFoot} lb/ft)`
          : data.postMaterial;
        isDrillStem = data.postMaterial.startsWith('drill_stem');
        postSelectionSentence = `We selected ${matPostLabel} for your line posts (spaced every ${data.linePostSpacing}') and T-posts every ${data.tPostSpacing}' specifically for the conditions on YOUR property.`;
      }

      const matReasons: string[] = [];
      if (site.bedrockDepthIn != null && site.bedrockDepthIn <= 30) {
        matReasons.push(isDrillStem
          ? 'drill stem\'s superior strength is ideal for rock-anchored installations'
          : 'posts will be welded to base plates for rock anchoring');
      }
      if (site.pH != null && site.pH <= 5.5) {
        matReasons.push(isDrillStem
          ? 'drill stem\'s heavy wall thickness (0.190") provides decades of corrosion resistance in your acidic soil'
          : 'we recommend monitoring galvanized coatings in your acidic soil conditions');
      }
      if (site.clayPct != null && site.clayPct >= 35) {
        matReasons.push(`posts set ${isDrillStem ? '3\' deep' : 'to full depth'} with extra concrete to combat clay heave`);
      }

      const closerParts: string[] = [postSelectionSentence];
      if (matReasons.length > 0) {
        closerParts.push(`Why: ${matReasons.join('; ')}.`);
      }
      closerParts.push(`Every material quantity, concrete calculation, and spacing in this ${data.fenceType} proposal is tailored to your soil, rock, and terrain — not generic averages.`);
      const closerText = closerParts.join(' ');

      const closerLines = doc.splitTextToSize(closerText, cw - 8);
      const closerH = Math.max(18, 8 + closerLines.length * 3.5);
      y = ensureSpace(doc, y, closerH + 2);
      doc.setFillColor(240, 250, 245);
      doc.roundedRect(mx, y, cw, closerH, 2, 2, 'F');
      doc.setFillColor(34, 139, 84);
      doc.rect(mx, y, cw, 2.5, 'F');

      sz(8.5);
      doc.setFont(brandFont, 'bold');
      doc.setTextColor(27, 38, 54);
      doc.text('Our Material Selection — Tailored to Your Property', mx + 4, y + 7);

      doc.setFont(brandFont, 'normal');
      sz(8);
      doc.setTextColor(50, 60, 55);
      doc.text(closerLines, mx + 4, y + 11);
      y += closerH + 2;
    }

    y += 6;
  }

  // ── Material Specifications Summary ──
  if (data.wireHeightInches) {
    y = ensureSpace(doc, y, 40);
    doc.setTextColor(27, 38, 54);
    sz(12);
    doc.setFont(brandFont, 'bold');
    doc.text('MATERIAL SPECIFICATIONS', mx, y);
    y += 6;

    const tSpec = recommendedTPostLength(data.wireHeightInches);
    const pCalc = calculatePostLength(data.wireHeightInches);
    const matSpec = POST_MATERIALS.find(p => p.id === data.postMaterial) || POST_MATERIALS[0];

    const specLines = [
      `Wire Height: ${data.wireHeightInches}" (${(data.wireHeightInches / 12).toFixed(1)} ft)${data.stayTuffModel ? ` — Stay-Tuff model ${data.stayTuffModel}` : ''}`,
      `T-Post Size: ${tSpec.label} — required to support ${data.wireHeightInches}" wire height with proper above-ground clearance`,
      `Corner/End Post: ${pCalc.totalLengthFeet}' ${matSpec.label} (${matSpec.diameter}) — ${pCalc.aboveGroundFeet.toFixed(1)}' above ground, ${pCalc.belowGroundFeet}' below ground for stability`,
      `Post Material: ${matSpec.label} cut from ${matSpec.jointLengthFeet}' joints (${pCalc.postsPerJoint(data.postMaterial)} posts per joint)${matSpec.shape === 'round' ? ' — superior strength vs. standard pipe' : ''}`,
      `Concrete Setting: ${data.wireHeightInches >= 72 ? '3' : '2'} bags (80 lb) per corner/end post — ${pCalc.belowGroundFeet}' depth setting ensures wind and livestock resistance`,
    ];

    sz(8.5);
    doc.setFont(brandFont, 'normal');
    doc.setTextColor(60, 60, 60);
    for (const line of specLines) {
      y = ensureSpace(doc, y, 5);
      doc.text(`• ${line}`, mx + 2, y);
      y += 4.5;
    }
    y += 6;
  }

  // ── Project Timeline ──
  if (data.laborEstimate) {
    const le = data.laborEstimate;
    y = ensureSpace(doc, y, 90);

    // Section header bar
    doc.setFillColor(27, 38, 54);
    doc.rect(mx, y - 3, cw, 9, 'F');
    doc.setTextColor(255, 255, 255);
    sz(12);
    doc.setFont(brandFont, 'bold');
    doc.text('PROJECT TIMELINE', mx + 4, y + 3);
    y += 14;

    // Summary line
    sz(9);
    doc.setFont(brandFont, 'normal');
    doc.setTextColor(60, 60, 60);
    const rangeHigh = le.workDays + Math.ceil(le.workDays * 0.25);
    doc.text(`Estimated Duration: ${le.workDays} to ${rangeHigh} working days  •  ${le.workDayHours}-hour work days  •  ${Math.round(le.totalHours * 10) / 10} total crew-hours`, mx, y);
    y += 8;

    // Group breakdown into project phases
    const phases: { name: string; icon: string; hours: number; items: string[] }[] = [];

    // Phase 1: Site Preparation (augering + post setting)
    const augerItems = le.breakdown.filter(b => b.task.toLowerCase().includes('auger'));
    const setItems = le.breakdown.filter(b => b.task.toLowerCase().includes('set') && !b.task.toLowerCase().includes('assembly'));
    const prepHrs = augerItems.reduce((s, b) => s + b.hours, 0) + setItems.reduce((s, b) => s + b.hours, 0);
    if (prepHrs > 0) {
      phases.push({
        name: 'Site Preparation & Post Setting',
        icon: '1',
        hours: Math.round(prepHrs * 10) / 10,
        items: [...augerItems.map(b => b.detail), ...setItems.map(b => b.detail)],
      });
    }

    // Phase 2: Structural (braces, assemblies)
    const braceItems = le.breakdown.filter(b => b.task.toLowerCase().includes('brace') || b.task.toLowerCase().includes('assembly'));
    const braceHrs = braceItems.reduce((s, b) => s + b.hours, 0);
    if (braceHrs > 0) {
      phases.push({
        name: 'Bracing & Structural Assembly',
        icon: '2',
        hours: Math.round(braceHrs * 10) / 10,
        items: braceItems.map(b => b.detail),
      });
    }

    // Phase 3: T-Posts
    const tPostItems = le.breakdown.filter(b => b.task.toLowerCase().includes('t-post'));
    const tPostHrs = tPostItems.reduce((s, b) => s + b.hours, 0);
    if (tPostHrs > 0) {
      phases.push({
        name: 'T-Post Installation',
        icon: String(phases.length + 1),
        hours: Math.round(tPostHrs * 10) / 10,
        items: tPostItems.map(b => b.detail),
      });
    }

    // Phase 4: Wire stringing
    const wireItems = le.breakdown.filter(b => b.task.toLowerCase().includes('wire') || b.task.toLowerCase().includes('string'));
    const wireHrs = wireItems.reduce((s, b) => s + b.hours, 0);
    if (wireHrs > 0) {
      phases.push({
        name: 'Wire Stringing & Tensioning',
        icon: String(phases.length + 1),
        hours: Math.round(wireHrs * 10) / 10,
        items: wireItems.map(b => b.detail),
      });
    }

    // Phase 4b: Pipe-fence rail handling + welding (only present for pipe fence)
    const pipeBuildItems = le.breakdown.filter(b => {
      const t = b.task.toLowerCase();
      return t.includes('rail pipe') || t.includes('weld');
    });
    const pipeBuildHrs = pipeBuildItems.reduce((s, b) => s + b.hours, 0);
    if (pipeBuildHrs > 0) {
      phases.push({
        name: 'Rail Cutting & Welding',
        icon: String(phases.length + 1),
        hours: Math.round(pipeBuildHrs * 10) / 10,
        items: pipeBuildItems.map(b => b.detail),
      });
    }

    // Phase 4c: Pipe fence painting (only if applicable)
    const pipePaintItems = le.breakdown.filter(b => b.task.toLowerCase().includes('paint'));
    const pipePaintHrs = pipePaintItems.reduce((s, b) => s + b.hours, 0);
    if (pipePaintHrs > 0) {
      phases.push({
        name: 'Painting',
        icon: String(phases.length + 1),
        hours: Math.round(pipePaintHrs * 10) / 10,
        items: pipePaintItems.map(b => b.detail),
      });
    }

    // Phase 5: Gates & Finishing
    const gateItems = le.breakdown.filter(b => b.task.toLowerCase().includes('gate'));
    const gateHrs = gateItems.reduce((s, b) => s + b.hours, 0);
    if (gateHrs > 0) {
      phases.push({
        name: 'Gate Installation & Finishing',
        icon: String(phases.length + 1),
        hours: Math.round(gateHrs * 10) / 10,
        items: gateItems.map(b => b.detail),
      });
    }

    // Render each phase as a visual block
    for (const phase of phases) {
      y = ensureSpace(doc, y, 22);
      const pct = le.totalHours > 0 ? phase.hours / le.totalHours : 0;
      const barW = Math.max(8, cw * pct);
      const phaseDays = Math.max(0.5, Math.round(phase.hours / le.workDayHours * 10) / 10);

      // Phase number circle
      doc.setFillColor(27, 38, 54);
      doc.circle(mx + 4, y + 1.5, 3.5, 'F');
      doc.setTextColor(255, 255, 255);
      sz(7);
      doc.setFont(brandFont, 'bold');
      doc.text(phase.icon, mx + 4, y + 2.5, { align: 'center' });

      // Phase name & duration
      doc.setTextColor(27, 38, 54);
      sz(9);
      doc.setFont(brandFont, 'bold');
      doc.text(phase.name, mx + 12, y + 2);

      doc.setFont(brandFont, 'normal');
      sz(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`${Math.round(phase.hours * 10) / 10} hrs (~${phaseDays} day${phaseDays !== 1 ? 's' : ''})`, mx + cw - 3, y + 2, { align: 'right' });
      y += 6;

      // Progress bar
      doc.setFillColor(235, 238, 243);
      doc.roundedRect(mx + 12, y, cw - 12, 3, 1.5, 1.5, 'F');
      doc.setFillColor(27, 38, 54);
      doc.roundedRect(mx + 12, y, Math.min(barW, cw - 12), 3, 1.5, 1.5, 'F');
      y += 5;

      // Phase detail items
      sz(7);
      doc.setFont(brandFont, 'normal');
      doc.setTextColor(120, 120, 120);
      for (const item of phase.items.slice(0, 2)) {
        const trimmed = item.length > 80 ? item.slice(0, 77) + '...' : item;
        doc.text(`  •  ${trimmed}`, mx + 12, y);
        y += 3.5;
      }
      y += 3;
    }

    // Bottom summary bar
    y = ensureSpace(doc, y, 10);
    doc.setFillColor(245, 247, 250);
    doc.rect(mx, y - 3, cw, 8, 'F');
    doc.setTextColor(27, 38, 54);
    sz(9);
    doc.setFont(brandFont, 'bold');
    doc.text('ESTIMATED COMPLETION', mx + 3, y + 1);
    doc.text(`${le.workDays} – ${rangeHigh} working days`, mx + cw - 3, y + 1, { align: 'right' });
    y += 14;
  }

  // ── Detailed Sections ──
  y = ensureSpace(doc, y, 30);
  doc.setTextColor(27, 38, 54);
  sz(12);
  doc.setFont(brandFont, 'bold');
  doc.text('DETAILED FENCE SECTIONS', mx, y);
  y += 10;

  for (const sec of data.sections) {
    y = ensureSpace(doc, y, 40);

    // Section header
    doc.setFillColor(240, 243, 248);
    doc.rect(mx, y - 4, cw, 8, 'F');
    sz(10);
    doc.setFont(brandFont, 'bold');
    doc.setTextColor(27, 38, 54);
    doc.text(`${sec.name} — ${sec.linearFeet.toLocaleString()} Linear Feet`, mx + 3, y);
    y += 10;

    // Material table header
    if (sec.materials && sec.materials.length > 0) {
      doc.setFillColor(27, 38, 54);
      doc.rect(mx + 4, y - 4, cw - 8, 7, 'F');
      doc.setTextColor(255, 255, 255);
      sz(8);
      doc.setFont(brandFont, 'bold');
      doc.text('Material', mx + 7, y);
      doc.text('Quantity', mx + cw - 11, y, { align: 'right' });
      y += 6;

      const nameColW = (cw - 8) * 0.68;  // ~68% for material name
      const qtyColW = (cw - 8) * 0.28;   // ~28% for quantity (right-aligned)
      const lineH = 3.2; // line height per wrapped line

      doc.setTextColor(50, 50, 50);
      doc.setFont(brandFont, 'normal');
      sz(7.5);
      for (let i = 0; i < sec.materials.length; i++) {
        const nameLines = doc.splitTextToSize(sec.materials[i].name, nameColW);
        const qtyLines = doc.splitTextToSize(sec.materials[i].quantity, qtyColW);
        const rowLines = Math.max(nameLines.length, qtyLines.length);
        const rowHeight = rowLines * lineH + 3; // padding

        y = ensureSpace(doc, y, rowHeight);

        // Alternating row stripe
        if (i % 2 === 0) {
          doc.setFillColor(250, 251, 252);
          doc.rect(mx + 4, y - 3, cw - 8, rowHeight, 'F');
        }

        // Material name (wrapped, left-aligned)
        doc.setFont(brandFont, 'normal');
        sz(7.5);
        doc.setTextColor(50, 50, 50);
        for (let ln = 0; ln < nameLines.length; ln++) {
          doc.text(nameLines[ln], mx + 7, y + ln * lineH);
        }

        // Quantity (wrapped, right-aligned)
        doc.setFont(brandFont, 'bold');
        sz(7.5);
        doc.setTextColor(30, 30, 30);
        for (let ln = 0; ln < qtyLines.length; ln++) {
          doc.text(qtyLines[ln], mx + cw - 11, y + ln * lineH, { align: 'right' });
        }

        y += rowHeight;
      }
    }

    // Gates in this section
    if (sec.gates && sec.gates.length > 0) {
      for (const gate of sec.gates) {
        y = ensureSpace(doc, y, 6);
        sz(8);
        doc.text(gate.type, mx + 7, y);
        doc.text('1', mx + cw - 11, y, { align: 'right' });
        y += 6;
      }
    }

    y += 4;
  }

  // ── Compact Materials Order Summary (supplier-friendly) ──
  {
    // Aggregate materials across all sections into a compact list
    const matMap = new Map<string, { shortName: string; qty: string; sortOrder: number }>();

    const totalLinearFeet = data.sections.reduce((s, sec) => s + sec.linearFeet, 0);

    for (const sec of data.sections) {
      if (!sec.materials) continue;
      for (const m of sec.materials) {
        const n = m.name.toLowerCase();
        // Classify by material type and extract a short supplier-friendly name
        let key = '';
        let shortName = '';
        let order = 99;

        if (n.includes('stay-tuff') || n.includes('stay tuff') || (n.startsWith('fence wire') && n.includes('galvanized'))) {
          key = 'wire';
          // Extract model from name e.g. "Stay-Tuff 2096-6"
          const modelMatch = m.name.match(/Stay-Tuff\s+([\w-]+)/i);
          shortName = modelMatch ? `Stay-Tuff ${modelMatch[1]} Wire` : 'Fence Wire';
          order = 1;
        } else if (n.startsWith('barbed wire') || (n.includes('barbed') && n.includes('strand'))) {
          key = 'barbed_main';
          shortName = 'Barbed Wire (main fence)';
          order = 1;
        } else if (n.includes('field fence wire')) {
          key = 'field_wire';
          shortName = 'Field Fence Wire';
          order = 1;
        } else if (n.includes('no-climb') || n.includes('no climb')) {
          key = 'no_climb';
          shortName = 'No-Climb Horse Fence Wire';
          order = 1;
        } else if (n.includes('fence wire')) {
          key = 'wire_gen';
          shortName = 'Fence Wire';
          order = 1;
        } else if (n.includes('high-tensile barbed') || n.includes('barbed top') || (n.includes('barbed') && !n.includes('strand'))) {
          key = 'top_wire';
          shortName = m.name.match(/barbed/i) ? 'HT Barbed Wire (top/bottom)' : 'HT Smooth Wire (top/bottom)';
          order = 2;
        } else if (n.includes('high-tensile smooth') || n.includes('ht smooth')) {
          key = 'top_wire_smooth';
          shortName = 'HT Smooth Wire (top/bottom)';
          order = 2;
        } else if (n.startsWith('t-post') || n.includes('t-posts') || n.includes('studded')) {
          key = 'tposts';
          const sizeMatch = m.name.match(/([\d.]+)['\u2019]/);
          shortName = sizeMatch ? `T-Posts (${sizeMatch[1]}')` : 'T-Posts';
          order = 3;
        } else if (n.includes('line post') || n.includes('drill stem') || n.includes('square tube')) {
          key = 'lineposts';
          const pipeMatch = m.name.match(/([\d/"-]+\s*(?:OD|x\s*[\d/"]+))/i);
          shortName = pipeMatch ? `Line Posts (${pipeMatch[1]})` : 'Line Posts (pipe)';
          order = 4;
        } else if (n.includes('h-brace') || n.includes('brace assembl')) {
          key = 'braces';
          shortName = 'H-Brace Assemblies';
          order = 5;
        } else if (n.includes('concrete')) {
          key = 'concrete';
          shortName = 'Concrete Mix (80 lb bags)';
          order = 6;
        } else if (n.includes('tensioner')) {
          key = 'tensioners';
          shortName = 'Inline Wire Tensioners';
          order = 7;
        } else if (n.includes('clip') || n.includes('staple')) {
          key = 'clips';
          shortName = 'Fence Clips / Staples';
          order = 8;
        } else {
          key = `other_${m.name.slice(0, 20)}`;
          shortName = m.name.split('—')[0].trim();
          order = 10;
        }

        if (!matMap.has(key)) {
          matMap.set(key, { shortName, qty: m.quantity, sortOrder: order });
        } else {
          // For multi-section: append quantities (wire types are corrected below)
          const existing = matMap.get(key)!;
          existing.qty += ` + ${m.quantity}`;
        }
      }
    }

    // Override wire roll counts with aggregate-from-total-footage to avoid per-section rounding inflation.
    // e.g. three 100' sections don't each round up to 1 roll — total 330' fits in 1 roll.
    const aggFeetWithOverlap = Math.ceil(totalLinearFeet * 1.1);
    const wireKeys: Array<{ key: string; rollLen: number; label: string }> = [
      { key: 'wire',       rollLen: resolveWireRollLength(data.stayTuffModel), label: `${resolveWireRollLength(data.stayTuffModel)}'` },
      { key: 'field_wire', rollLen: 330,  label: `330'` },
      { key: 'no_climb',   rollLen: 200,  label: `200'` },
      { key: 'wire_gen',   rollLen: 330,  label: `330'` },
    ];
    for (const { key, rollLen, label } of wireKeys) {
      if (matMap.has(key)) {
        const rolls = Math.ceil(aggFeetWithOverlap / rollLen);
        matMap.get(key)!.qty = `${rolls} roll${rolls !== 1 ? 's' : ''} (${label} ea) — project total`;
      }
    }
    // Barbed wire main fence: configurable strand count, same aggregation
    if (matMap.has('barbed_main')) {
      const strands = Math.max(2, Math.min(9, Math.round(data.barbedStrandCount ?? 4)));
      const barbedRolls = Math.ceil((aggFeetWithOverlap * strands) / 1320);
      matMap.get('barbed_main')!.qty = `${barbedRolls} roll${barbedRolls !== 1 ? 's' : ''} (1,320' ea) — project total`;
    }

    // Sort by order
    const sortedMats = Array.from(matMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);

    if (sortedMats.length > 0) {
      y = ensureSpace(doc, y, 40);

      // Header bar
      doc.setFillColor(27, 38, 54);
      doc.rect(mx, y - 3, cw, 9, 'F');
      doc.setTextColor(255, 255, 255);
      sz(11);
      doc.setFont(brandFont, 'bold');
      doc.text('MATERIALS ORDER SUMMARY', mx + 4, y + 3);
      y += 12;

      sz(7.5);
      doc.setFont(brandFont, 'italic');
      doc.setTextColor(100, 100, 100);
      doc.text(`Total project: ${totalLinearFeet.toLocaleString()} linear feet across ${data.sections.length} section${data.sections.length > 1 ? 's' : ''}`, mx, y);
      y += 5;

      // Table header
      doc.setFillColor(240, 243, 248);
      doc.rect(mx, y - 3, cw, 7, 'F');
      sz(8);
      doc.setFont(brandFont, 'bold');
      doc.setTextColor(27, 38, 54);
      doc.text('Material', mx + 3, y + 1);
      doc.text('Quantity', mx + cw - 3, y + 1, { align: 'right' });
      y += 7;

      for (let i = 0; i < sortedMats.length; i++) {
        const row = sortedMats[i];
        // Normalize internal whitespace; preserve full quantity string so totals
        // (e.g. line-post breakdowns like "234 uprights (59 joints × 31', 74' scrap) + 156 ...")
        // aren't cut off. splitTextToSize below handles wrapping into the column width.
        const cleanQty = row.qty.replace(/\s*\+\s*/g, ' + ').replace(/\s+/g, ' ').trim();

        const nameLines = doc.splitTextToSize(row.shortName, cw * 0.55);
        const qtyLines = doc.splitTextToSize(cleanQty, cw * 0.4);
        const rowH = Math.max(nameLines.length, qtyLines.length) * 3.5 + 2;

        y = ensureSpace(doc, y, rowH);

        if (i % 2 === 0) {
          doc.setFillColor(250, 251, 252);
          doc.rect(mx, y - 3, cw, rowH, 'F');
        }

        doc.setFont(brandFont, 'normal');
        sz(8);
        doc.setTextColor(40, 40, 40);
        doc.text(nameLines, mx + 3, y);

        doc.setFont(brandFont, 'bold');
        sz(7.5);
        doc.setTextColor(27, 38, 54);
        doc.text(qtyLines, mx + cw - 3, y, { align: 'right' });

        y += rowH;
      }

      // Accessories
      if (data.accessories) {
        const accItems: { name: string; qty: number }[] = [];
        if (data.accessories.postCaps > 0) accItems.push({ name: data.premiumGalvanized ? 'Galvanized Post Caps' : 'Post Caps', qty: data.accessories.postCaps });
        if (data.accessories.springIndicators > 0) accItems.push({ name: 'Spring Tension Indicators', qty: data.accessories.springIndicators });
        if (data.accessories.concreteFillPosts > 0) accItems.push({ name: 'Concrete Fill (posts)', qty: data.accessories.concreteFillPosts });
        if (data.accessories.concreteFillBraces > 0) accItems.push({ name: 'Concrete Fill (braces)', qty: data.accessories.concreteFillBraces });

        for (const acc of accItems) {
          y = ensureSpace(doc, y, 6);
          doc.setFont(brandFont, 'normal');
          sz(8);
          doc.setTextColor(40, 40, 40);
          doc.text(acc.name, mx + 3, y);
          doc.setFont(brandFont, 'bold');
          doc.text(String(acc.qty), mx + cw - 3, y, { align: 'right' });
          y += 5;
        }
      }

      // Gates
      if (data.gates && data.gates.length > 0) {
        y = ensureSpace(doc, y, 6);
        doc.setFont(brandFont, 'normal');
        sz(8);
        doc.setTextColor(40, 40, 40);
        for (const gate of data.gates) {
          doc.text(gate.type, mx + 3, y);
          doc.setFont(brandFont, 'bold');
          doc.text('1', mx + cw - 3, y, { align: 'right' });
          y += 5;
        }
      }

      // Painting
      if (data.painting) {
        y = ensureSpace(doc, y, 6);
        doc.setFont(brandFont, 'normal');
        sz(8);
        doc.setTextColor(40, 40, 40);
        doc.text(`Paint — ${data.painting.color}`, mx + 3, y);
        doc.setFont(brandFont, 'bold');
        doc.text(`${data.painting.gallons} gal`, mx + cw - 3, y, { align: 'right' });
        y += 5;
      }

      y += 6;
    }
  }

  // ── Permit & HOA Check ──
  if (data.permitInfo) {
    y = ensureSpace(doc, y, 40);

    doc.setFillColor(27, 38, 54);
    doc.rect(mx, y - 3, cw, 9, 'F');
    doc.setTextColor(255, 255, 255);
    sz(11);
    doc.setFont(brandFont, 'bold');
    doc.text('PERMIT & PROPERTY COMPLIANCE CHECK', mx + 4, y + 3);
    y += 14;

    const pi = data.permitInfo;
    const checkItems: { label: string; status: string; statusColor: [number, number, number] }[] = [];

    checkItems.push({
      label: 'HOA / Property Owner Association',
      status: pi.hoaFound ? `Found: ${pi.hoaName || 'HOA on file'}` : 'No HOA found',
      statusColor: pi.hoaFound ? [200, 140, 40] : [34, 139, 84],
    });

    checkItems.push({
      label: 'County Building Permit',
      status: pi.permitRequired
        ? (pi.permitNote || 'Permit may be required — verify with local jurisdiction')
        : (pi.permitNote || 'No county permit required for agricultural fencing'),
      statusColor: pi.permitRequired ? [200, 140, 40] : [34, 139, 84],
    });

    if (pi.deedRestrictions) {
      checkItems.push({
        label: 'Deed Restrictions',
        status: pi.deedRestrictions,
        statusColor: [200, 140, 40],
      });
    } else {
      checkItems.push({
        label: 'Deed Restrictions',
        status: 'None found on record',
        statusColor: [34, 139, 84],
      });
    }

    for (const item of checkItems) {
      y = ensureSpace(doc, y, 14);

      // Check circle
      doc.setFillColor(...item.statusColor);
      doc.circle(mx + 4, y, 2, 'F');
      sz(6);
      doc.setFont(brandFont, 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('\u2713', mx + 4, y + 0.8, { align: 'center' });

      // Label
      sz(9);
      doc.setFont(brandFont, 'bold');
      doc.setTextColor(27, 38, 54);
      doc.text(item.label, mx + 10, y + 1);

      // Status on its own line below the label
      sz(8);
      doc.setFont(brandFont, 'normal');
      doc.setTextColor(...item.statusColor);
      doc.text(item.status, mx + 14, y + 6);

      y += 12;
    }

    sz(7);
    doc.setFont(brandFont, 'italic');
    doc.setTextColor(120, 120, 120);
    doc.text('This check is informational only. Customer is responsible for verifying all permit, HOA, and deed restriction requirements before work begins.', mx, y);
    y += 8;
  }

  // ── Annual Maintenance Plan ──
  if (data.maintenancePlan) {
    y = ensureSpace(doc, y, 50);

    doc.setFillColor(244, 247, 252);
    doc.roundedRect(mx, y - 2, cw, 42, 2, 2, 'F');
    doc.setFillColor(59, 130, 246);
    doc.rect(mx, y - 2, cw, 2.5, 'F');

    sz(10);
    doc.setFont(brandFont, 'bold');
    doc.setTextColor(27, 38, 54);
    doc.text('ANNUAL MAINTENANCE PLAN \u2014 OPTIONAL UPGRADE', mx + 5, y + 6);

    sz(14);
    doc.setFont(brandFont, 'bold');
    doc.setTextColor(59, 130, 246);
    doc.text(`$${data.maintenancePlan.annualPrice}/year`, mx + cw - 5, y + 6, { align: 'right' });

    y += 12;

    sz(8);
    doc.setFont(brandFont, 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text('Keep your fence in peak condition with an annual service visit. Includes:', mx + 5, y);
    y += 5;

    for (const svc of data.maintenancePlan.services) {
      sz(8);
      doc.setFont(brandFont, 'normal');
      doc.setTextColor(50, 50, 50);
      doc.text(`\u2022  ${svc}`, mx + 8, y);
      y += 4;
    }

    y += 2;
    sz(7);
    doc.setFont(brandFont, 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text('Ask your representative to add the maintenance plan at signing. First visit scheduled 12 months after installation.', mx + 5, y);
    y += 10;
  }

  // ── Neighbor Referral ──
  if (data.referralDiscount && data.referralDiscount > 0) {
    y = ensureSpace(doc, y, 20);

    doc.setFillColor(254, 249, 243);
    doc.roundedRect(mx, y - 2, cw, 16, 2, 2, 'F');
    doc.setDrawColor(234, 138, 45);
    doc.setLineWidth(0.4);
    doc.roundedRect(mx, y - 2, cw, 16, 2, 2, 'S');

    sz(9);
    doc.setFont(brandFont, 'bold');
    doc.setTextColor(180, 90, 20);
    doc.text(`Fencing a shared property line? Save ${data.referralDiscount}%`, mx + 5, y + 4);

    sz(8);
    doc.setFont(brandFont, 'normal');
    doc.setTextColor(80, 60, 30);
    doc.text(`We offer a ${data.referralDiscount}% discount when adjacent landowners book together. Split the cost on shared fence lines and both save.`, mx + 5, y + 10);

    y += 20;
  }

  // ── Good / Better / Best Pricing Tiers ──
  if (data.bidTiers) {
    y = ensureSpace(doc, y, 60);

    sz(12);
    doc.setFont(brandFont, 'bold');
    doc.setTextColor(27, 38, 54);
    doc.text('INVESTMENT OPTIONS', mx, y);
    y += 8;

    const tiers = [
      { tier: data.bidTiers.good,   color: [34, 197, 94] as [number,number,number],   label: 'GOOD' },
      { tier: data.bidTiers.better, color: [59, 130, 246] as [number,number,number],  label: 'BETTER' },
      { tier: data.bidTiers.best,   color: [234, 138, 45] as [number,number,number],  label: 'BEST' },
    ];
    const tierW = (cw - 8) / 3;
    let tx = mx;
    for (const { tier, color, label } of tiers) {
      doc.setFillColor(...color);
      doc.roundedRect(tx, y, tierW, 8, 2, 2, 'F');
      sz(8); doc.setFont(brandFont, 'bold'); doc.setTextColor(255, 255, 255);
      doc.text(label, tx + tierW / 2, y + 5.5, { align: 'center' });

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(tx, y + 8, tierW, 30, 0, 0, 'F');
      doc.setDrawColor(...color);
      doc.setLineWidth(0.4);
      doc.roundedRect(tx, y, tierW, 38, 2, 2, 'S');

      sz(10); doc.setFont(brandFont, 'bold'); doc.setTextColor(27, 38, 54);
      doc.text(`$${tier.price.toLocaleString()}`, tx + tierW / 2, y + 18, { align: 'center' });

      sz(7); doc.setFont(brandFont, 'bold'); doc.setTextColor(...color);
      doc.text(tier.label, tx + tierW / 2, y + 24, { align: 'center' });

      sz(7); doc.setFont(brandFont, 'normal'); doc.setTextColor(80, 80, 80);
      doc.text(tier.description, tx + tierW / 2, y + 31, { align: 'center', maxWidth: tierW - 6 });

      tx += tierW + 4;
    }
    y += 44;
  }

  // ── Competitor Comparison ──
  if (data.competitorComparison && data.competitorComparison.length > 0) {
    y = ensureSpace(doc, y, 50);

    sz(12); doc.setFont(brandFont, 'bold'); doc.setTextColor(27, 38, 54);
    doc.text('WHY HAYDEN RANCH SERVICES?', mx, y);
    y += 8;

    // Header row
    doc.setFillColor(27, 38, 54);
    doc.rect(mx, y, cw, 7, 'F');
    sz(7); doc.setFont(brandFont, 'bold'); doc.setTextColor(255, 255, 255);
    const compColW = [cw * 0.35, cw * 0.2, cw * 0.45];
    doc.text('Company', mx + 3, y + 4.5);
    doc.text('$/ft', mx + compColW[0] + 3, y + 4.5);
    doc.text('Notes', mx + compColW[0] + compColW[1] + 3, y + 4.5);
    y += 7;

    // Our row first (highlighted)
    doc.setFillColor(255, 249, 235);
    doc.rect(mx, y, cw, 8, 'F');
    doc.setDrawColor(234, 138, 45); doc.setLineWidth(0.5);
    doc.rect(mx, y, cw, 8, 'S');
    sz(7); doc.setFont(brandFont, 'bold'); doc.setTextColor(27, 38, 54);
    const ourRate = data.projectTotal / (data.sections.reduce((s, r) => s + r.linearFeet, 0) || 1);
    doc.text('Hayden Ranch Services ★', mx + 3, y + 5);
    doc.text(`$${ourRate.toFixed(2)}`, mx + compColW[0] + 3, y + 5);
    sz(7); doc.setFont(brandFont, 'normal');
    doc.text('Commercial-grade materials, concrete-set posts, 1-yr workmanship warranty', mx + compColW[0] + compColW[1] + 3, y + 5, { maxWidth: compColW[2] - 6 });
    y += 8;

    for (let i = 0; i < data.competitorComparison.length; i++) {
      const comp = data.competitorComparison[i];
      doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255);
      doc.rect(mx, y, cw, 8, 'F');
      sz(7); doc.setFont(brandFont, 'bold'); doc.setTextColor(80, 80, 80);
      doc.text(comp.name, mx + 3, y + 5);
      doc.text(`$${comp.pricePerFoot.toFixed(2)}`, mx + compColW[0] + 3, y + 5);
      sz(7); doc.setFont(brandFont, 'normal'); doc.setTextColor(100, 100, 100);
      doc.text(comp.notes, mx + compColW[0] + compColW[1] + 3, y + 5, { maxWidth: compColW[2] - 6 });
      y += 8;
    }
    y += 6;
  }

  // ── Digital Acceptance Link ──
  if (data.acceptanceLink) {
    y = ensureSpace(doc, y, 40);

    doc.setFillColor(234, 138, 45);
    doc.roundedRect(mx, y, cw, 30, 3, 3, 'F');

    sz(11); doc.setFont(brandFont, 'bold'); doc.setTextColor(255, 255, 255);
    doc.text(data.acceptanceLinkLabel || 'ACCEPT THIS PROPOSAL ONLINE', mx + cw / 2, y + 10, { align: 'center' });

    sz(8); doc.setFont(brandFont, 'normal'); doc.setTextColor(255, 255, 255);
    doc.text('Scan the QR code or visit the link below to sign and approve:', mx + cw / 2, y + 17, { align: 'center' });

    sz(9); doc.setFont(brandFont, 'bold');
    doc.text(data.acceptanceLink, mx + cw / 2, y + 25, { align: 'center' });

    y += 36;
  }

  // ── Auto-generated Pipe Fence Section Diagram ──
  // Side-elevation drawing showing exactly what one section of the customer's
  // pipe fence will look like, complete with measurements.
  if (data.pipeFenceConfig) {
    y = ensureSpace(doc, y, 110);

    // Header bar
    doc.setFillColor(27, 38, 54);
    doc.rect(mx, y - 3, cw, 9, 'F');
    doc.setTextColor(255, 255, 255);
    sz(12); doc.setFont(brandFont, 'bold');
    doc.text('YOUR PIPE FENCE — SECTION DIAGRAM', mx + 4, y + 3);
    y += 14;

    drawPipeFenceSectionDiagram(doc, mx, y, cw, 90, data.pipeFenceConfig, brandFont, sz);
    y += 96;
  }

  // ── Terms and Conditions ──
  doc.addPage();
  y = 20;

  doc.setTextColor(27, 38, 54);
  sz(14);
  doc.setFont(brandFont, 'bold');
  doc.text('TERMS AND CONDITIONS', mx, y);
  y += 10;

  const terms = data.customTerms && data.customTerms.length > 0 ? data.customTerms : DEFAULT_TERMS;

  // Replace template variables in terms
  const postSpec = POST_MATERIALS.find(p => p.id === data.postMaterial);
  const postMatLabel = postSpec
    ? `${postSpec.label}${data.squareTubeGauge ? ` (${data.squareTubeGauge})` : ''}`
    : data.postMaterial;
  const processedTerms = terms.map((term) =>
    term
      .replace(/\{fenceType\}/g, data.fenceType)
      .replace(/\{postMaterial\}/g, postMatLabel)
      .replace(/\{depositPercent\}/g, data.depositPercent.toString())
      .replace(/\{depositAmount\}/g, data.depositAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }))
      .replace(/\{balanceAmount\}/g, data.balanceAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }))
      .replace(/\{workingDays\}/g, `${data.workingDays} to ${data.workingDays + Math.ceil(data.workingDays * 0.25)}`)
  );

  sz(8);
  doc.setFont(brandFont, 'normal');
  doc.setTextColor(50, 50, 50);

  for (let i = 0; i < processedTerms.length; i++) {
    const termText = `${i + 1}. ${processedTerms[i]}`;
    const lines = doc.splitTextToSize(termText, cw - 4);
    const blockHeight = lines.length * 3.5 + 3;

    y = ensureSpace(doc, y, blockHeight);
    doc.text(lines, mx + 2, y);
    y += blockHeight;
  }

  // ── Acceptance Section ──
  y = ensureSpace(doc, y, 70);
  y += 8;

  doc.setTextColor(27, 38, 54);
  sz(14);
  doc.setFont(brandFont, 'bold');
  doc.text('ACCEPTANCE', mx, y);
  y += 8;

  sz(8.5);
  doc.setFont(brandFont, 'normal');
  doc.setTextColor(50, 50, 50);
  const acceptText = `I/We have read, understood, and agree to all terms and conditions stated in this proposal. I/We authorize Hayden Ranch Services to proceed with the work as described. I/We acknowledge that the ${data.depositPercent}% deposit ($${data.depositAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}) is non-refundable and earned upon receipt. I/We warrant that I/we have authority to enter into this agreement and authorize work on the property.`;
  const acceptLines = doc.splitTextToSize(acceptText, cw);
  doc.text(acceptLines, mx, y);
  y += acceptLines.length * 3.5 + 12;

  // ── Insurance & License Badges ──
  if (data.credentials) {
    const creds = data.credentials;
    const badges: { label: string; detail: string }[] = [];
    if (creds.txAdjusterLicense) badges.push({ label: 'TX Public Adjuster', detail: creds.txAdjusterLicense });
    if (creds.bondAmount) badges.push({ label: 'Surety Bonded', detail: creds.bondAmount });
    if (creds.liabilityInsurance) badges.push({ label: 'General Liability', detail: creds.liabilityInsurance });
    if (creds.workersComp) badges.push({ label: "Workers' Comp", detail: creds.workersComp });

    if (badges.length > 0) {
      y = ensureSpace(doc, y, 18);

      const badgeW = (cw - (badges.length - 1) * 4) / badges.length;
      for (let b = 0; b < badges.length; b++) {
        const bx = mx + b * (badgeW + 4);
        doc.setFillColor(240, 245, 250);
        doc.roundedRect(bx, y - 2, badgeW, 14, 1.5, 1.5, 'F');
        doc.setDrawColor(59, 130, 246);
        doc.setLineWidth(0.3);
        doc.roundedRect(bx, y - 2, badgeW, 14, 1.5, 1.5, 'S');

        // Shield icon placeholder
        doc.setFillColor(59, 130, 246);
        doc.circle(bx + 6, y + 5, 3.5, 'F');
        sz(6);
        doc.setFont(brandFont, 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('\u2713', bx + 6, y + 6.2, { align: 'center' });

        sz(7.5);
        doc.setFont(brandFont, 'bold');
        doc.setTextColor(27, 38, 54);
        doc.text(badges[b].label, bx + 12, y + 3);

        sz(6.5);
        doc.setFont(brandFont, 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text(badges[b].detail, bx + 12, y + 8);
      }

      y += 18;
    }
  }

  // Signature lines
  y = ensureSpace(doc, y, 60);
  y += 12; // extra space above signature block
  const sigMid = pw / 2;

  // Customer signature
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.3);
  doc.line(mx, y, sigMid - 10, y);
  doc.line(sigMid + 10, y, pw - mx, y);
  y += 4;

  sz(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Customer Signature', mx, y);
  doc.text('Date', sigMid - 25, y);
  doc.text('Hayden Ranch Services Representative', sigMid + 10, y);
  y += 10;

  // Print name lines
  doc.line(mx, y, sigMid - 10, y);
  doc.line(sigMid + 10, y, pw - mx, y);
  y += 4;
  doc.text('Print Name', mx, y);
  doc.text('Print Name', sigMid + 10, y);
  y += 10;

  // Property address line
  doc.line(mx, y, sigMid + 30, y);
  y += 4;
  doc.text('Property Address', mx, y);
  y += 12;

  // Footer
  sz(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Questions? Contact us at ${COMPANY.phone} or ${COMPANY.email}`, pw / 2, y, { align: 'center' });
  y += 5;
  doc.setFont(brandFont, 'italic');
  doc.text('Thank you for considering Hayden Ranch Services for your fence installation project!', pw / 2, y, { align: 'center' });

  // Add page numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    sz(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont(brandFont, 'normal');
    doc.text(`Page ${i} of ${totalPages}`, pw / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
  }

  // Save
  const filename = `${data.projectName || 'Fence_Bid'}_${data.date.replace(/\s+/g, '_')}.pdf`;
  doc.save(filename.replace(/[^a-zA-Z0-9_\-.]/g, '_'));
}

// ============================================================
// Helper: Calculate materials for a fence section
// ============================================================

/** Parse wire height in inches from stayTuffModel (e.g. '15/96/6' → 96) or fenceHeight (e.g. '6ft' → 72) */
function resolveWireHeight(fenceHeight: string, stayTuffModel?: string): number {
  if (stayTuffModel) {
    // Spec format: "WWHH-SS-RR" e.g. "2096-6-330" → 96", "949-6-330" → 49", "735-6-330" → 35"
    // Height is the last 2 digits of the first dash-separated group
    const firstGroup = stayTuffModel.split('-')[0];
    if (firstGroup && firstGroup.length >= 2) {
      const h = parseInt(firstGroup.slice(-2), 10);
      if (!isNaN(h) && h > 0) return h;
    }
  }
  const match = fenceHeight.match(/(\d+)/);
  if (match) return parseInt(match[1], 10) * 12;
  return 60; // fallback 5ft
}

/** Extract roll length from Stay-Tuff spec string, e.g. "2096-6-330" → 330, "1661-3-200" → 200 */
function resolveWireRollLength(stayTuffModel?: string): number {
  if (stayTuffModel) {
    const parts = stayTuffModel.split('-');
    if (parts.length >= 3) {
      const rollLen = parseInt(parts[2], 10);
      if (!isNaN(rollLen) && rollLen > 0) return rollLen;
    }
  }
  return 330; // default
}

/** Resolve horizontal wire count from Stay-Tuff model spec or fence type */
function resolveHorizontalWires(stayTuffModel?: string, fenceType?: string): number {
  if (stayTuffModel) {
    // Spec format: "2096-6-330" → first number group gives horizontal wire count
    // e.g. "949-6-330" → 9 horizontal wires, "2096-6-330" → 20
    const parts = stayTuffModel.split('/');
    // Try parsing from spec like "949" or "2096" — first two digits for wires > 99, else first digit(s)
    const specPart = parts[0] || stayTuffModel;
    const specDigits = specPart.replace(/\D/g, '');
    if (specDigits.length >= 3) {
      // e.g. "949" → 9 wires at 49", "2096" → 20 wires at 96"
      const wireCount = parseInt(specDigits.slice(0, specDigits.length - 2), 10);
      if (wireCount > 0 && wireCount <= 30) return wireCount;
    }
  }
  // Defaults by fence type
  if (fenceType?.toLowerCase().includes('barbed')) return 4;
  if (fenceType?.toLowerCase().includes('no-climb') || fenceType?.toLowerCase().includes('no_climb')) return 16;
  return 9; // general field fence default
}

/** Terrain label for PDF descriptions */
const TERRAIN_LABELS: Record<string, string> = {
  easy: 'level ground, minimal rock',
  moderate: 'moderate slope, some rock',
  difficult: 'steep terrain, heavy rock',
  very_difficult: 'extreme terrain, solid rock',
};

export function calculateSectionMaterials(
  linearFeet: number,
  fenceType: string,
  fenceHeight: string,
  stayTuffModel?: string,
  terrain: string = 'moderate',
  postMaterial: PostMaterial = 'drill_stem_238',
  squareTubeGauge: SquareTubeGauge = '14ga',
  tPostSpacing: number = 10,
  linePostSpacing: number = 66,
  topWireType: TopWireType = 'smooth',
  options: {
    barbedStrandCount?: number; // for fenceType === 'barbed_wire'; default 4
    barbedPointType?: '2_point' | '4_point'; // affects barbed wire material name
    premiumGalvanized?: boolean; // labels posts/t-posts/caps as galvanized
    pipeFenceConfig?: PipeFenceConfig; // full pipe-fence design (only used for pipe fence)
  } = {},
): SectionMaterial[] {
  const barbedStrandCount = Math.max(2, Math.min(9, Math.round(options.barbedStrandCount ?? 4)));
  const barbedPointLabel = options.barbedPointType === '2_point' ? '2-point' : '4-point';
  const galvPrefix = options.premiumGalvanized ? 'Galvanized ' : '';

  // ============================================================
  // PIPE FENCE — dedicated path: uprights + horizontal rails + caps + concrete + paint.
  // No T-posts, no woven wire, no clips, no tensioners.
  // ============================================================
  const isPipeFenceShortCircuit = fenceType.toLowerCase().includes('pipe');
  if (isPipeFenceShortCircuit && options.pipeFenceConfig) {
    const cfg = options.pipeFenceConfig;
    const pipe = calculatePipeFenceMaterials(linearFeet, cfg);
    const uprightSpec = POST_MATERIALS.find(p => p.id === cfg.uprightMaterial) || POST_MATERIALS[0];
    const railSpec = POST_MATERIALS.find(p => p.id === cfg.railMaterial) || POST_MATERIALS[0];
    const styleLabel = cfg.topRailStyle === 'continuous'
      ? 'continuous top rail (welded across post tops)'
      : 'rails butt-welded between posts (post tops capped)';
    const finishLabel = cfg.finish === 'painted'
      ? `painted${cfg.paintColor ? ' ' + cfg.paintColor : ''}`
      : 'bare (no paint — will rust naturally)';
    const out: SectionMaterial[] = [];
    out.push({
      name: `Pipe Fence — ${cfg.fenceHeightFeet}ft tall, ${cfg.railCount} rail${cfg.railCount > 1 ? 's' : ''}, ${styleLabel}, ${finishLabel}`,
      quantity: `${linearFeet.toLocaleString()} ft @ ${cfg.postSpacingFeet}' upright spacing`,
    });
    out.push({
      name: `${galvPrefix}${uprightSpec.label} Uprights — cut to ${pipe.uprightCutLengthFeet}' each`,
      quantity: `${pipe.uprightCount} uprights (${pipe.uprightJoints} joints × ${pipe.uprightJointLengthFeet}', ${pipe.uprightWastageFeet}' scrap)`,
    });
    out.push({
      name: `${galvPrefix}${railSpec.label} Horizontal Rails — ${cfg.railCount} rows`,
      quantity: `${pipe.railJoints} joints × ${pipe.railJointLengthFeet}' (${pipe.railTotalFeet.toLocaleString()} ft total inc. 5% cut waste)`,
    });
    if (pipe.postCapsNeeded > 0) {
      out.push({ name: 'Post Caps — pressed steel', quantity: `${pipe.postCapsNeeded} caps` });
    }
    out.push({
      name: 'Concrete Mix — 80 lb bags, fast-setting',
      quantity: `${pipe.concreteBags} bags`,
    });
    out.push({
      name: 'Welds (informational — included in labor)',
      quantity: `${pipe.weldsCount} rail-to-post welds`,
    });
    if (pipe.paintGallons > 0) {
      out.push({
        name: `Paint — ${cfg.paintColor || 'specified color'}, oil-based rust-inhibiting`,
        quantity: `${pipe.paintGallons} gallons`,
      });
    }
    return out;
  }

  const ft = linearFeet;
  const wireHeightIn = resolveWireHeight(fenceHeight, stayTuffModel);
  const rollLength = resolveWireRollLength(stayTuffModel);
  const wireWithOverlap = Math.ceil(ft * 1.1); // 10% overlap for tensioning
  const wireRolls = Math.ceil(wireWithOverlap / rollLength);
  const wireRollsDec = (wireWithOverlap / rollLength).toFixed(1);

  // Use user-configured spacings
  const linePostCount = Math.max(2, Math.ceil(ft / linePostSpacing));
  // T-posts go between each pair of line posts: subtract 1 for each line post position
  const spans = Math.max(0, linePostCount - 1);
  const tPostsPerSpan = Math.max(0, Math.floor(linePostSpacing / tPostSpacing) - 1);
  // Minimum 1 T-post per section so very short runs still get at least one intermediate support
  const tPosts = Math.max(1, spans * tPostsPerSpan);

  // Correct T-post sizing from fence-materials.ts
  const tPostSpec = recommendedTPostLength(wireHeightIn);

  // Correct post sizing from fence-materials.ts
  const postCalc = calculatePostLength(wireHeightIn);

  // Post material info
  const postSpec = POST_MATERIALS.find(p => p.id === postMaterial) || POST_MATERIALS[0];
  const gaugeOpts = getGaugeOptions(postMaterial);
  const gaugeSpec = gaugeOpts.length > 0
    ? (gaugeOpts.find(g => g.gauge === squareTubeGauge) || gaugeOpts[0])
    : null;

  const jointLen = postSpec.jointLengthFeet;
  const postsPerJoint = postCalc.postsPerJoint(postMaterial);
  // ── Bracing ──
  // H-braces go at each end of the section + mid-run braces for very long straight runs (1 per 660').
  // Gate braces and bend/corner braces are calculated separately in the overall bid.
  const endBraces = 2;
  const midRunBraces = Math.max(0, Math.floor(linearFeet / 660) - 1);
  const hBraceCount = endBraces + midRunBraces;

  // Brace geometry: H = above ground (ft), D = below ground (ft), S = brace spacing (ft)
  const H = postCalc.aboveGroundFeet;
  const D = postCalc.belowGroundFeet;
  const S = 8; // standard brace spacing in feet
  const diag = Math.sqrt(S * S + H * H);

  // Single H-brace pipe: 2 posts (H+D each) + 1 horizontal (S) + 1 diagonal
  const singleHPipe = 2 * (H + D) + S + diag;
  const bracePostCount = hBraceCount * 2; // 2 vertical posts per H-brace
  const totalBracePipeFeet = hBraceCount * singleHPipe;

  // Pipe joints: line posts + brace pipe
  const totalPostsFromPipe = linePostCount + bracePostCount;
  const postJointsNeeded = postsPerJoint > 0 ? Math.ceil(totalPostsFromPipe / postsPerJoint) : totalPostsFromPipe;
  const braceJointsNeeded = Math.ceil(totalBracePipeFeet / jointLen);
  const jointsNeeded = postJointsNeeded + braceJointsNeeded;

  // Post description
  const postSpecInfo = POST_MATERIALS.find(p => p.id === postMaterial);
  const postLabel = postSpecInfo
    ? `${postSpecInfo.label}${gaugeSpec ? ` (${gaugeSpec.label}, ${gaugeSpec.wallThickness} wall)` : ''}`
    : postMaterial;

  const concreteBagsPerPost = wireHeightIn >= 72 ? 3 : 2;
  // An H-brace assembly has 2 vertical posts → 2 holes worth of concrete.
  const concreteBags = (linePostCount * concreteBagsPerPost) + (hBraceCount * 2 * concreteBagsPerPost);

  // Hardware counts
  const clipsPerTPost = wireHeightIn >= 72 ? 5 : 4;
  const clips = tPosts * clipsPerTPost;
  const clipBoxes = Math.ceil(clips / 500);

  // High-tensile top/bottom wire
  const htStrands = wireHeightIn >= 72 ? 2 : 1;

  // Tensioners: (mesh horizontal wires + barbed wire strands) per 660ft run.
  // For a barbed-wire-only fence the "mesh" is the barbed strands themselves and
  // there is no separate top/bottom strand.
  const isBarbedWireForTensioner = fenceType.toLowerCase().includes('barbed');
  const meshHorizWires = isBarbedWireForTensioner
    ? barbedStrandCount
    : resolveHorizontalWires(stayTuffModel, fenceType);
  const barbedStrands = isBarbedWireForTensioner ? 0 : htStrands;
  const tensionerRuns = Math.max(1, Math.ceil(ft / 660));
  const tensioners = tensionerRuns * (meshHorizWires + barbedStrands);

  const isStayTuff = fenceType.includes('stay_tuff') || fenceType.includes('Stay Tuff') || fenceType.includes('Stay-Tuff');
  const isBarbedWire = fenceType.toLowerCase().includes('barbed');
  const isNoClimb = fenceType.toLowerCase().includes('no-climb') || fenceType.toLowerCase().includes('no_climb');
  const isFieldFence = fenceType.toLowerCase().includes('field');
  const isPipeFence = fenceType.toLowerCase().includes('pipe');
  const terrainLabel = TERRAIN_LABELS[terrain] || 'moderate conditions';

  const materials: SectionMaterial[] = [];

  // ==============================================================
  // WIRE — varies by fence type
  // ==============================================================
  if (isBarbedWire) {
    const strands = barbedStrandCount;
    const barbedRolls = Math.ceil((wireWithOverlap * strands) / 1320);
    materials.push({
      name: `Barbed Wire — ${strands}-strand, 15.5 ga, ${barbedPointLabel}`,
      quantity: `${barbedRolls} rolls (1,320' ea)`,
    });
  } else if (isNoClimb) {
    const noClimbRolls = Math.ceil(wireWithOverlap / 200);
    materials.push({
      name: `No-Climb Horse Fence — ${wireHeightIn}" height, 2"×4" mesh`,
      quantity: `${noClimbRolls} rolls (200' ea)`,
    });
  } else if (isStayTuff && stayTuffModel) {
    materials.push({
      name: `Stay-Tuff ${stayTuffModel} Fixed Knot Wire — ${wireHeightIn}"`,
      quantity: `${wireRolls} rolls (${rollLength}' ea)`,
    });
  } else if (isStayTuff) {
    materials.push({
      name: `Stay-Tuff Fixed Knot Wire — ${wireHeightIn}"`,
      quantity: `${wireRolls} rolls (${rollLength}' ea)`,
    });
  } else if (isFieldFence) {
    materials.push({
      name: `Field Fence Wire — ${wireHeightIn}"`,
      quantity: `${wireRolls} rolls (${rollLength}' ea)`,
    });
  } else {
    materials.push({
      name: `Fence Wire — ${wireHeightIn}"`,
      quantity: `${wireRolls} rolls (${rollLength}' ea)`,
    });
  }

  // ==============================================================
  // TOP & BOTTOM WIRE
  // ==============================================================
  if (!isBarbedWire) {
    const useBarbed = topWireType === 'barbed' || topWireType === 'barbed_double';
    const topStrands = topWireType === 'barbed_double' ? 2 : 1;
    const bottomStrands = wireHeightIn >= 72 ? 1 : 0;
    const totalStrands = topStrands + bottomStrands;

    if (useBarbed) {
      const barbedFtNeeded = wireWithOverlap * totalStrands;
      const barbedRolls = Math.ceil(barbedFtNeeded / 1320);
      materials.push({
        name: `HT Barbed Wire (${barbedPointLabel}) — ${totalStrands} strand${totalStrands > 1 ? 's' : ''} (top${bottomStrands ? ' & bottom' : ''})`,
        quantity: `${barbedRolls} rolls (1,320' ea)`,
      });
    } else {
      const smoothRolls = Math.ceil((wireWithOverlap * totalStrands) / 4000);
      materials.push({
        name: `12.5 ga HT Smooth Wire — ${totalStrands} strand${totalStrands > 1 ? 's' : ''} (top${bottomStrands ? ' & bottom' : ''})`,
        quantity: `${smoothRolls} rolls (4,000' ea)`,
      });
    }
  }

  // ==============================================================
  // T-POSTS
  // ==============================================================
  if (!isPipeFence) {
    materials.push({
      name: `${galvPrefix}${tPostSpec.label} T-Posts — studded, ${tPostSpacing}' spacing`,
      quantity: `${tPosts} posts`,
    });
  }

  // ==============================================================
  // LINE POSTS
  // ==============================================================
  materials.push({
    name: `${galvPrefix}${postLabel} Line Posts — ${postCalc.totalLengthFeet}' cut length, ${linePostSpacing}' spacing`,
    quantity: `${linePostCount} posts (${jointsNeeded} joints × ${jointLen}')`,
  });

  // ==============================================================
  // BRACE ASSEMBLIES
  // ==============================================================
  materials.push({
    name: `H-Brace Assemblies — welded pipe`,
    quantity: `${hBraceCount} assemblies`,
  });

  // ==============================================================
  // CONCRETE
  // ==============================================================
  materials.push({
    name: `Concrete Mix — 80 lb bags, fast-setting`,
    quantity: `${concreteBags} bags`,
  });

  // ==============================================================
  // INLINE TENSIONERS
  // ==============================================================
  if (!isBarbedWire && !isPipeFence) {
    materials.push({
      name: `Inline Wire Tensioners — ratchet-style`,
      quantity: `${tensioners} tensioners`,
    });
  }

  // ==============================================================
  // CLIPS & HARDWARE
  // ==============================================================
  if (!isPipeFence) {
    materials.push({
      name: `Fence Clips — galvanized steel`,
      quantity: `${clips} clips (${clipBoxes} box${clipBoxes > 1 ? 'es' : ''})`,
    });
  }

  return materials;
}

// ============================================================
// Labor Time Estimation
// ============================================================
// Based on real-world production rates:
//   Augering:       12 post holes per 3 hours (4 holes/hr, 15 min each)
//   Post setting:   30 min per post (concrete pour + plumb + brace)
//   T-posts:        10-15 per hour (avg 12/hr)
//   H-brace:        2 posts to auger & set
//   Corner brace:   5 posts to auger & set
//   Work day:       9-10 hours

export function calculateLaborEstimate(params: {
  totalLinearFeet: number;
  linePostCount: number;
  tPostCount: number;
  hBraceCount: number;
  cornerBraceCount: number;
  gateCount: number;
  clipsPerTPost?: number;      // clips per T-post (default 4)
  tiesPerLinePost?: number;    // wire ties per line post (default 4)
  workDayHours?: number;       // default 9.5
  // Pipe-fence overrides — when present, the wire-stringing/clipping steps
  // are replaced with welding + rail handling + (optional) painting steps.
  // weldsCount: total rail-to-post welds for the run (from
  // calculatePipeFenceMaterials.weldsCount).
  // railJoints: full pipe joints to cut / position
  // (calculatePipeFenceMaterials.railJoints).
  // paintGallons: 0 for bare; otherwise full-job paint quantity.
  pipeFence?: {
    weldsCount: number;
    railJoints: number;
    paintGallons: number;
  };
}): LaborEstimate {
  const {
    totalLinearFeet,
    linePostCount,
    tPostCount,
    hBraceCount,
    cornerBraceCount,
    gateCount,
    clipsPerTPost = 4,
    tiesPerLinePost = 4,
    workDayHours = 9.5,
    pipeFence,
  } = params;

  const isPipeFence = !!pipeFence;

  const breakdown: { task: string; hours: number; detail: string }[] = [];

  // ── Line post holes (auger + set) ──
  // Augering: 15 min/hole, Setting: 30 min/post → 45 min total per line post
  const linePostAugerHrs = linePostCount * (15 / 60);
  const linePostSetHrs = linePostCount * (30 / 60);
  breakdown.push({
    task: 'Auger line post holes',
    hours: linePostAugerHrs,
    detail: `${linePostCount} holes × 15 min each`,
  });
  breakdown.push({
    task: 'Set line posts in concrete',
    hours: linePostSetHrs,
    detail: `${linePostCount} posts × 30 min each (pour, plumb, brace)`,
  });

  // ── H-brace assembly (2 posts each: auger + set + build assembly) ──
  const hBracePostCount = hBraceCount * 2;
  const hBraceAugerHrs = hBracePostCount * (15 / 60);
  const hBraceSetHrs = hBracePostCount * (30 / 60);
  const hBraceAssemblyHrs = hBraceCount * 0.5; // ~30 min to weld rail + diagonal per assembly
  if (hBraceCount > 0) {
    breakdown.push({
      task: 'Auger & set H-brace posts',
      hours: hBraceAugerHrs + hBraceSetHrs,
      detail: `${hBraceCount} H-braces × 2 posts each = ${hBracePostCount} holes + sets`,
    });
    breakdown.push({
      task: 'Build H-brace assemblies (weld rail & diagonal)',
      hours: hBraceAssemblyHrs,
      detail: `${hBraceCount} assemblies × ~30 min welding/fitting`,
    });
  }

  // ── Corner brace assembly (5 posts each) ──
  const cornerPostCount = cornerBraceCount * 5;
  const cornerAugerHrs = cornerPostCount * (15 / 60);
  const cornerSetHrs = cornerPostCount * (30 / 60);
  const cornerAssemblyHrs = cornerBraceCount * 1.0; // ~1 hr to build each corner assembly
  if (cornerBraceCount > 0) {
    breakdown.push({
      task: 'Auger & set corner brace posts',
      hours: cornerAugerHrs + cornerSetHrs,
      detail: `${cornerBraceCount} corner braces × 5 posts each = ${cornerPostCount} holes + sets`,
    });
    breakdown.push({
      task: 'Build corner brace assemblies',
      hours: cornerAssemblyHrs,
      detail: `${cornerBraceCount} assemblies × ~1 hr welding/fitting`,
    });
  }

  // ── T-posts (drive with hydraulic driver, avg 12/hr) ──
  const tPostHrs = tPostCount / 12;
  if (tPostCount > 0) {
    breakdown.push({
      task: 'Drive T-posts',
      hours: tPostHrs,
      detail: `${tPostCount} T-posts × ~5 min each (12/hr avg)`,
    });
  }

  // ── Wire stringing (~300 ft/hr for unrolling & tensioning) ──
  // Pipe fence has no wire — skip this step entirely for pipe.
  let wireHrs = 0;
  if (!isPipeFence) {
    wireHrs = totalLinearFeet / 300;
    breakdown.push({
      task: 'Unroll & tension wire',
      hours: wireHrs,
      detail: `${totalLinearFeet.toLocaleString()} ft @ ~300 ft/hr (unroll, stretch, tension)`,
    });
  }

  // ── Clipping wire to posts (~1 min per clip/tie) ──
  // Again, no clips/ties on a pipe fence.
  let clippingHrs = 0;
  if (!isPipeFence) {
    const totalClips = (tPostCount * clipsPerTPost) + (linePostCount * tiesPerLinePost);
    clippingHrs = totalClips / 60; // 1 minute per clip
    breakdown.push({
      task: 'Clip & tie wire to posts',
      hours: clippingHrs,
      detail: `${totalClips.toLocaleString()} clips/ties @ ~1 min each (${tPostCount} T-posts × ${clipsPerTPost} + ${linePostCount} line posts × ${tiesPerLinePost})`,
    });
  }

  // ── Pipe-fence specific steps: rail handling + welding + painting ──
  // Welding is the dominant labor on a pipe fence. Real-world rate from ranch
  // pipe fence builders is ~3 minutes per finished rail-to-post weld
  // (positioning the rail, tacking, full weld pass, light grinding). Continuous
  // top rail welds are slightly faster (lap weld on top of post) but caps-style
  // butt welds are slower (two welds per rail end) — 3 min/weld is a fair avg.
  // Rail handling: ~5 min per joint (haul, measure, cut, fit between posts)
  // Painting: ~30 min per gallon (prep + apply, sprayer or roller)
  let pipeRailHandlingHrs = 0;
  let pipeWeldingHrs = 0;
  let pipePaintHrs = 0;
  if (pipeFence) {
    pipeRailHandlingHrs = pipeFence.railJoints * (5 / 60);
    pipeWeldingHrs = pipeFence.weldsCount * (3 / 60);
    pipePaintHrs = pipeFence.paintGallons * 0.5;
    breakdown.push({
      task: 'Cut & position rail pipe',
      hours: pipeRailHandlingHrs,
      detail: `${pipeFence.railJoints} joints × ~5 min each (haul, measure, cut, fit between posts)`,
    });
    breakdown.push({
      task: 'Weld rails to posts',
      hours: pipeWeldingHrs,
      detail: `${pipeFence.weldsCount.toLocaleString()} welds × ~3 min each (position, tack, full pass, light grind)`,
    });
    if (pipeFence.paintGallons > 0) {
      breakdown.push({
        task: 'Paint fence',
        hours: pipePaintHrs,
        detail: `${pipeFence.paintGallons} gal × ~30 min each (prep + spray/roll)`,
      });
    }
  }

  // ── Gates (avg 1.5 hrs per gate install including welding frame) ──
  const gateHrs = gateCount * 1.5;
  if (gateCount > 0) {
    breakdown.push({
      task: 'Install gates',
      hours: gateHrs,
      detail: `${gateCount} gate${gateCount > 1 ? 's' : ''} × ~1.5 hrs each (hang, weld hinges, latch)`,
    });
  }

  const augerHours = linePostAugerHrs + hBraceAugerHrs + cornerAugerHrs;
  const postSettingHours = linePostSetHrs + hBraceSetHrs + cornerSetHrs;
  const braceAssemblyHours = hBraceAssemblyHrs + cornerAssemblyHrs;
  const totalHours = breakdown.reduce((sum, b) => sum + b.hours, 0);
  const workDays = Math.ceil(totalHours / workDayHours * 10) / 10; // round to 0.1

  return {
    drillingHours: Math.round(augerHours * 10) / 10,
    postSettingHours: Math.round(postSettingHours * 10) / 10,
    tPostHours: Math.round(tPostHrs * 10) / 10,
    wireHours: Math.round(wireHrs * 10) / 10,
    clippingHours: Math.round(clippingHrs * 10) / 10,
    braceAssemblyHours: Math.round(braceAssemblyHours * 10) / 10,
    gateHours: Math.round(gateHrs * 10) / 10,
    pipeRailHandlingHours: Math.round(pipeRailHandlingHrs * 10) / 10,
    pipeWeldingHours: Math.round(pipeWeldingHrs * 10) / 10,
    pipePaintHours: Math.round(pipePaintHrs * 10) / 10,
    totalHours: Math.round(totalHours * 10) / 10,
    workDayHours,
    workDays: Math.ceil(workDays),
    breakdown: breakdown.map(b => ({ ...b, hours: Math.round(b.hours * 10) / 10 })),
  };
}
// ============================================================
// Pipe Fence — Auto-generated Section Diagram (side elevation)
// ============================================================
//
// Renders a scaled side-view of one representative section of the
// customer's pipe fence. Shows posts, every rail, the ground line, post
// caps (if cap-style), the continuous top rail (if continuous-style),
// and labels post-to-post spacing + total fence height.
//
// All units in jsPDF coordinates are millimeters. We map the real-world
// fence (in feet) into a fixed drawing area (boxX..boxX+boxW, boxY..boxY+boxH).
// ============================================================

function drawPipeFenceSectionDiagram(
  doc: jsPDF,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  cfg: PipeFenceConfig,
  brandFont: string,
  sz: (s: number) => void,
): void {
  // Show 3 bays = 4 posts so the picture is informative without being cramped.
  const baysShown = 3;
  const realWidthFt = baysShown * cfg.postSpacingFeet;
  const realHeightFt = cfg.fenceHeightFeet + 1.5; // include some headroom + ground

  // Reserve margins inside the box for measurement labels.
  const padX = 22;     // left/right space for height label / arrow
  const padTop = 8;    // top space for "post spacing" label
  const padBottom = 14; // bottom space for ground hatching + spacing label
  const drawX = boxX + padX;
  const drawY = boxY + padTop;
  const drawW = boxW - padX * 2;
  const drawH = boxH - padTop - padBottom;

  // Scale: pick the smaller scale so the whole drawing fits.
  const scaleX = drawW / realWidthFt;
  const scaleY = drawH / realHeightFt;
  // Use independent X/Y scales — fence sections are normally wider than tall
  // and forcing a 1:1 ratio would waste page space.
  const ftToMmX = (ft: number) => ft * scaleX;
  const ftToMmY = (ft: number) => ft * scaleY;

  // Outer card
  doc.setFillColor(250, 251, 253);
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'F');
  doc.setDrawColor(220, 225, 235);
  doc.setLineWidth(0.3);
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'S');

  // Ground line (drawY + drawH = ground)
  const groundY = drawY + drawH - ftToMmY(0);
  doc.setDrawColor(120, 90, 50);
  doc.setLineWidth(0.5);
  doc.line(drawX - 4, groundY, drawX + drawW + 4, groundY);
  // Ground hatching
  doc.setLineWidth(0.2);
  doc.setDrawColor(160, 130, 80);
  for (let hx = drawX - 3; hx < drawX + drawW + 4; hx += 2.5) {
    doc.line(hx, groundY, hx + 1.8, groundY + 2.2);
  }

  // Post dimensions in drawing units
  const railOdInchesLocal = postOdInches(cfg.railMaterial);
  const uprightOdIn = postOdInches(cfg.uprightMaterial);
  const uprightThicknessMm = Math.max(1.4, ftToMmX(uprightOdIn / 12));
  const railThicknessMm = Math.max(0.8, ftToMmY(railOdInchesLocal / 12));

  // Color of pipe — bare = rusty brown; painted = use color name if recognizable, else dark grey
  const isPainted = cfg.finish === 'painted';
  const colorMap: Record<string, [number, number, number]> = {
    black: [25, 25, 25],
    white: [240, 240, 240],
    red: [180, 40, 40],
    green: [50, 110, 60],
    brown: [110, 75, 50],
    grey: [110, 110, 115],
    gray: [110, 110, 115],
    silver: [180, 185, 190],
    tan: [196, 164, 105],
  };
  const paintRgb = colorMap[(cfg.paintColor || 'black').toLowerCase()] || [40, 40, 45];
  const pipeRgb: [number, number, number] = isPainted ? paintRgb : [150, 95, 60]; // rust

  // Post positions (4 posts for 3 bays)
  const postCount = baysShown + 1;
  const postXs: number[] = [];
  for (let i = 0; i < postCount; i++) {
    postXs.push(drawX + ftToMmX(i * cfg.postSpacingFeet));
  }

  // Above-ground top of each upright (post tops). For "caps" style they stick up
  // a tiny bit above the top rail (we show ~3 inches of post above top rail).
  // For "continuous" style the top rail covers the post tops.
  const topRailFt = cfg.fenceHeightFeet; // top rail at fence height
  const topRailY = groundY - ftToMmY(topRailFt);
  const postTopY = cfg.topRailStyle === 'caps'
    ? topRailY - ftToMmY(0.25)        // 3" of post above top rail
    : topRailY;

  // Draw the uprights
  doc.setFillColor(...pipeRgb);
  doc.setDrawColor(40, 40, 50);
  doc.setLineWidth(0.2);
  for (const px of postXs) {
    doc.rect(px - uprightThicknessMm / 2, postTopY, uprightThicknessMm, groundY - postTopY, 'F');
  }

  // Draw caps (cap style only)
  if (cfg.topRailStyle === 'caps') {
    doc.setFillColor(...pipeRgb);
    for (const px of postXs) {
      const capW = uprightThicknessMm + 1.2;
      const capH = 1.4;
      doc.rect(px - capW / 2, postTopY - capH, capW, capH, 'F');
    }
  }

  // Rail vertical positions: evenly distributed from the top of the fence down to
  // the ground. With railCount evenly-spaced rails and the ground as the lower
  // reference, rail i (0 = top) sits at fenceHeight × (1 - i/railCount):
  //   • 1 rail  → top only
  //   • 2 rails → top, mid-height (H, H/2)
  //   • 3 rails → top, 2/3 H, 1/3 H
  //   • 4 rails → top, 3/4 H, H/2, H/4 ... and so on.
  // This matches typical pipe-fence framing where the bottom rail anchors near
  // ground and the rails between are evenly spaced from the top rail down.
  const railCount = Math.max(1, Math.min(6, Math.round(cfg.railCount)));
  const railYsFt: number[] = [];
  for (let i = 0; i < railCount; i++) {
    const heightFt = cfg.fenceHeightFeet * (1 - i / railCount);
    railYsFt.push(heightFt);
  }

  // Draw rails
  doc.setFillColor(...pipeRgb);
  for (let i = 0; i < railYsFt.length; i++) {
    const ry = groundY - ftToMmY(railYsFt[i]);
    let railStartX: number, railEndX: number;
    const isTopRail = i === 0;
    if (isTopRail && cfg.topRailStyle === 'continuous') {
      // Continuous top rail spans across all post tops, sticking out a touch on each side.
      railStartX = postXs[0] - 1.5;
      railEndX = postXs[postXs.length - 1] + 1.5;
    } else {
      // Other rails butt-welded between posts: draw between each adjacent pair of posts.
      // We render as one continuous strip from first to last post, but visually that's the same here.
      railStartX = postXs[0];
      railEndX = postXs[postXs.length - 1];
    }
    doc.rect(railStartX, ry - railThicknessMm / 2, railEndX - railStartX, railThicknessMm, 'F');
  }

  // ── Labels & dimensions ──
  doc.setTextColor(40, 40, 60);
  doc.setFont(brandFont, 'normal');

  // Post-to-post spacing label (between first two posts)
  sz(7);
  const spacingLabelY = groundY + 5;
  const spanMidX = (postXs[0] + postXs[1]) / 2;
  doc.setDrawColor(80, 80, 90);
  doc.setLineWidth(0.25);
  doc.line(postXs[0], spacingLabelY - 1, postXs[1], spacingLabelY - 1);
  // tick marks
  doc.line(postXs[0], spacingLabelY - 2.5, postXs[0], spacingLabelY + 0.5);
  doc.line(postXs[1], spacingLabelY - 2.5, postXs[1], spacingLabelY + 0.5);
  doc.text(`${cfg.postSpacingFeet} ft`, spanMidX, spacingLabelY + 3.5, { align: 'center' });

  // Fence height label (vertical, on left)
  sz(7);
  const heightLabelX = drawX - 6;
  doc.setDrawColor(80, 80, 90);
  doc.line(heightLabelX, groundY, heightLabelX, topRailY);
  doc.line(heightLabelX - 1.2, groundY, heightLabelX + 1.2, groundY);
  doc.line(heightLabelX - 1.2, topRailY, heightLabelX + 1.2, topRailY);
  doc.text(`${cfg.fenceHeightFeet} ft`, heightLabelX - 3, (groundY + topRailY) / 2, { align: 'center', angle: 90 });

  // Cap label (cap style)
  if (cfg.topRailStyle === 'caps') {
    sz(6);
    doc.setTextColor(80, 80, 110);
    doc.text('post caps', postXs[postXs.length - 1] + 4, postTopY + 0.8);
  }

  // Top rail style annotation
  sz(6);
  doc.setTextColor(80, 80, 110);
  const topAnnotation = cfg.topRailStyle === 'continuous'
    ? 'continuous top rail'
    : 'top rail welded between posts';
  doc.text(topAnnotation, postXs[0], topRailY - 2);

  // Header text: design summary
  sz(7.5);
  doc.setFont(brandFont, 'bold');
  doc.setTextColor(27, 38, 54);
  const upLabel = POST_MATERIALS.find(p => p.id === cfg.uprightMaterial)?.label || cfg.uprightMaterial;
  const railLabel = POST_MATERIALS.find(p => p.id === cfg.railMaterial)?.label || cfg.railMaterial;
  const finishLabel = cfg.finish === 'painted' ? `painted ${cfg.paintColor || ''}`.trim() : 'bare (will rust)';
  doc.text(
    `${cfg.fenceHeightFeet}' tall · ${cfg.railCount} rail${cfg.railCount > 1 ? 's' : ''} · uprights: ${upLabel} · rails: ${railLabel} · ${finishLabel}`,
    boxX + boxW / 2, boxY + 4.5, { align: 'center' },
  );

  // Footer note
  sz(6);
  doc.setFont(brandFont, 'italic');
  doc.setTextColor(110, 110, 130);
  doc.text(
    `Side-elevation showing ${baysShown} bays (${baysShown + 1} posts). Drawing not to exact scale; horizontal & vertical scales differ for clarity.`,
    boxX + boxW / 2, boxY + boxH - 2, { align: 'center' },
  );
}
