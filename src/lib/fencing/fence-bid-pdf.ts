import jsPDF from 'jspdf';
import {
  recommendedTPostLength,
  calculatePostLength,
  POST_MATERIALS,
  getGaugeOptions,
  type PostMaterial,
  type SquareTubeGauge,
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
  wireHours: number;           // estimated wire stringing time
  braceAssemblyHours: number;  // time to build H-brace & corner brace assemblies
  gateHours: number;           // gate installation
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

  // Steep grade info
  steepFootage?: number;
  steepSurchargePerFoot?: number;

  // Terms (use default if empty)
  customTerms?: string[];

  // Wire category for product photos
  wireCategory?: string;

  // Pre-loaded product images as base64 data URLs
  productImages?: { label: string; dataUrl: string }[];
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
        label: 'Shallow Bedrock — Rock Drilling Required',
        reason: `USDA data shows ${site.restrictionType || 'bedrock'} at ${depthStr} below grade`,
        dataPoint: `Bedrock depth: ${depthStr}`,
        impact: '80-horse tractor with Beltech rock drill required for every post hole. Standard auger cannot penetrate this depth. Each post must be anchored directly into the rock shelf.',
        costNote: 'Core drilling included in project pricing — no surprise charges',
      });
    } else if (site.bedrockDepthIn <= 30) {
      adj.push({
        label: 'Moderate Bedrock — Partial Rock Drilling',
        reason: `${site.restrictionType || 'Bedrock'} at ${depthStr} — standard post depth is 30-36"`,
        dataPoint: `Bedrock depth: ${depthStr}`,
        impact: 'Many post holes will bottom out on rock. Crew will arrive with 80-horse tractor with Beltech and skid steer mounted auger, setting posts at maximum achievable depth with epoxy anchoring where needed.',
        costNote: 'Rock drilling equipment mobilization included in pricing',
      });
    } else {
      adj.push({
        label: 'Subsurface Rock Possible',
        reason: `${site.restrictionType || 'Bedrock'} detected at ${depthStr} depth`,
        dataPoint: `Bedrock depth: ${depthStr}`,
        impact: 'Some deeper posts may encounter rock. Skid steer mounted auger and Beltech drill will be on-site as a precaution.',
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
  `Rock and Subsurface Conditions: Pricing assumes standard rock conditions manageable with our skid steer mounted auger and 80-horse tractor with Beltech drill. If solid limestone, caliche, or bedrock requiring core drilling is encountered on more than 10% of posts, additional drilling will be billed at $15 per post not to exceed $750 without written customer approval. If subsurface conditions prevent post installation at specified locations, contractor may relocate posts up to 10 feet to achieve proper installation. Customer will be notified of significant subsurface issues before additional charges are incurred.`,
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
// Main PDF generator
// ============================================================

export function generateFenceBidPDF(data: FenceBidData): void {
  const doc = new jsPDF('p', 'mm', 'letter');
  const pw = doc.internal.pageSize.getWidth();  // 215.9
  const mx = 18; // margins
  const cw = pw - mx * 2; // content width

  let y = 18;

  // ── Page 1: Header ──
  // Dark navy banner
  doc.setFillColor(27, 38, 54);
  doc.rect(0, 0, pw, 44, 'F');

  // Company name & contact (left)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(COMPANY.name, mx, y + 3);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 210, 220);
  doc.text(COMPANY.address, mx, y + 11);
  doc.text(`${COMPANY.phone}  •  ${COMPANY.email}`, mx, y + 16);

  // Proposal number & dates (right)
  doc.setFontSize(8);
  doc.setTextColor(200, 210, 220);
  doc.text(`Proposal Date: ${data.date}`, pw - mx, y + 3, { align: 'right' });
  doc.text(`Valid Through: ${data.validUntil}`, pw - mx, y + 9, { align: 'right' });

  // Thin accent line at bottom of header
  doc.setFillColor(196, 164, 105); // coyote tan accent
  doc.rect(0, 44, pw, 1.2, 'F');

  y = 52;

  // ── Title ──
  doc.setTextColor(27, 38, 54);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
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
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(150, 150, 150);
  doc.text('PREPARED FOR', mx + 5, y + 5);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(27, 38, 54);
  doc.text(data.clientName || 'Customer', mx + 5, y + 12);

  if (data.propertyAddress) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(data.propertyAddress, mx + 5, y + 17);
  }

  // Right column: Project Name
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(150, 150, 150);
  doc.text('PROJECT', mx + cw / 2 + 5, y + 5);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(27, 38, 54);
  doc.text(data.projectName || 'Fence Installation', mx + cw / 2 + 5, y + 12);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  const specLine = [data.fenceHeight, data.stayTuffModel].filter(Boolean).join(' — ');
  if (specLine) doc.text(specLine, mx + cw / 2 + 5, y + 17);

  y += 30;

  // ── Project Overview ──
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('PROJECT OVERVIEW', mx, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
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
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
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
          doc.setFontSize(7);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(100, 100, 100);
          doc.text('Satellite view showing fence line placement, gate locations, and brace positions. Orange = fence line, Red = end posts, Blue = corner braces, Green = H-braces, Yellow = gates.', mx, y);
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
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('STAY-TUFF 20 YEAR LIMITED WARRANTY', mx, y);
    y += 5;

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
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
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('YOUR FENCE MATERIALS', mx + 4, y + 3);
    y += 14;

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'italic');
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
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
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
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('PROPERTY RESEARCH & SITE ANALYSIS', mx + 4, y + 3);
    y += 12;

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'italic');
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
          doc.setFontSize(6.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(100, 110, 130);
          doc.text(boxes[i].label.toUpperCase(), bx + 3, y + 6);

          // Value
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(27, 38, 54);
          doc.text(boxes[i].value, bx + 3, y + 11.5);

          // Note
          if (boxes[i].note) {
            doc.setFontSize(6);
            doc.setFont('helvetica', 'italic');
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
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Understanding Your Land', mx, y);
      y += 5;

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
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
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Soil Profile', mx, y);
      y += 5;

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
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
            'entisols': 'Entisols are very young soils with minimal development — essentially weathered rock. These are common on steep slopes, floodplains, and rocky ridgelines in the Hill Country. Post installation in Entisols often requires rock drilling because there simply is not much soil depth to work with.',
            'aridisols': 'Aridisols form in dry climates and often contain calcium carbonate (caliche) layers that are extremely hard. Caliche layers are notorious in Texas for destroying auger bits and requiring specialized drilling equipment.',
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
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        const compIntro = `The soil survey divides your property's soil map unit into ${site.components.length} component${site.components.length > 1 ? 's' : ''}:`;
        doc.text(compIntro, mx, y);
        y += 4.5;

        for (const comp of site.components) {
          y = ensureSpace(doc, y, 5);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text(`• ${comp.name}`, mx + 3, y);
          doc.setFont('helvetica', 'normal');
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
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
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

        // Scale: map 0–60 inches of real depth to the visual height
        const maxScaleIn = Math.max(60, depth + 12);
        const soilZoneH = Math.min((depth / maxScaleIn) * (vizH - 8), vizH - 14);
        const bedrockY = y + 4 + soilZoneH;

        // Dimensions
        const vizX = mx + 10;
        const vizW = cw - 20;
        const postW = 5;
        const postX = vizX + vizW * 0.35;
        const postDepthIn = Math.min(36, depth); // post can't go deeper than bedrock
        const postH = (postDepthIn / maxScaleIn) * (vizH - 8);
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
          // Deterministic positions based on index
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

        // ── Bedrock boundary line (dashed feel — thick colored line) ──
        doc.setDrawColor(180, 60, 40); // reddish indicator
        doc.setLineWidth(0.6);
        doc.line(vizX, bedrockY, vizX + vizW, bedrockY);

        // ── Fence post ──
        // Below-ground portion
        doc.setFillColor(90, 90, 90);
        doc.rect(postX, groundY, postW, postH, 'F');
        // Above-ground portion
        doc.setFillColor(70, 70, 70);
        doc.rect(postX, groundY - postAboveH, postW, postAboveH, 'F');
        // Post cap
        doc.setFillColor(50, 50, 50);
        doc.rect(postX - 0.5, groundY - postAboveH - 1.2, postW + 1, 1.2, 'F');

        // ── Ground surface accent ──
        doc.setDrawColor(80, 120, 50); // green grass line
        doc.setLineWidth(0.8);
        doc.line(vizX, groundY, vizX + vizW, groundY);

        // ── Depth callout arrow (right side) ──
        const arrowX = vizX + vizW + 4;
        doc.setDrawColor(27, 38, 54);
        doc.setLineWidth(0.4);
        // Vertical line from ground to bedrock
        doc.line(arrowX, groundY, arrowX, bedrockY);
        // Top tick
        doc.line(arrowX - 1.5, groundY, arrowX + 1.5, groundY);
        // Bottom tick
        doc.line(arrowX - 1.5, bedrockY, arrowX + 1.5, bedrockY);
        // Arrow heads
        doc.setFillColor(27, 38, 54);
        // Down arrow
        doc.triangle(arrowX - 1, bedrockY - 1.5, arrowX + 1, bedrockY - 1.5, arrowX, bedrockY, 'F');
        // Up arrow
        doc.triangle(arrowX - 1, groundY + 1.5, arrowX + 1, groundY + 1.5, arrowX, groundY, 'F');

        // Depth label alongside arrow
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(180, 60, 40);
        const midArrow = (groundY + bedrockY) / 2;
        doc.text(depthLabel, arrowX + 3, midArrow + 1);

        // ── Labels ──
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');

        // "GROUND LEVEL" label
        doc.setTextColor(80, 120, 50);
        doc.text('GROUND LEVEL', vizX + vizW * 0.65, groundY - 1);

        // "SOIL" label
        doc.setTextColor(120, 90, 50);
        const soilMidY = groundY + soilZoneH / 2 + 2;
        doc.text('SOIL', vizX + 3, soilMidY);

        // "BEDROCK" label
        doc.setTextColor(255, 255, 255);
        const rockMidY = bedrockY + bedrockZoneH / 2 + 2;
        doc.text(site.restrictionType ? site.restrictionType.toUpperCase() : 'BEDROCK', vizX + 3, rockMidY);

        // "POST" label
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(6);
        doc.text('FENCE POST', postX + postW + 2, groundY + postH / 2);

        // Post depth label
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(6);
        const postDepthStr = postDepthIn >= 12 ? `${Math.floor(postDepthIn / 12)}' set` : `${postDepthIn}" set`;
        doc.text(postDepthStr, postX + postW + 2, groundY + postH / 2 + 4);

        // ── Severity indicator badge ──
        const severity = depth <= 18 ? 'ROCK DRILL REQUIRED' : depth <= 30 ? 'PARTIAL ROCK DRILLING' : 'POSSIBLE ROCK';
        const badgeColor: [number, number, number] = depth <= 18 ? [180, 50, 40] : depth <= 30 ? [200, 140, 40] : [80, 140, 80];
        const badgeW = doc.getTextWidth(severity) + 6;
        doc.setFillColor(...badgeColor);
        const badgeX = vizX;
        const badgeY = y + vizH - 3;
        doc.roundedRect(badgeX, badgeY, badgeW + 2, 5, 1, 1, 'F');
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(severity, badgeX + 1 + badgeW / 2, badgeY + 3.5, { align: 'center' });

        // Standard post depth reference
        doc.setFontSize(6);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(120, 120, 120);
        doc.text('Standard post depth: 30–36"', vizX + vizW - 2, badgeY + 3.5, { align: 'right' });

        y += vizH + 6;
      }

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(55, 55, 60);

      const subParts: string[] = [];
      if (site.bedrockDepthIn != null) {
        const depth = site.bedrockDepthIn;
        const ft = Math.floor(depth / 12);
        const inches = depth % 12;
        const depthStr = ft > 0 ? `${ft} feet${inches > 0 ? ' ' + inches + ' inches' : ''}` : `${depth} inches`;
        subParts.push(`According to USDA subsurface data, ${site.restrictionType || 'bedrock'} exists at approximately ${depthStr} below the surface on your property. For context, a standard fence post needs to be set 30 to 36 inches deep for proper stability. ${depth <= 18 ? 'At this depth, every single post hole will hit solid rock — there is no way around it. Our crew will arrive with a truck-mounted hydraulic rock drill that can bore through limestone and bedrock to set posts directly into the rock shelf. This is actually the strongest possible installation — a post anchored in solid rock is not going anywhere.' : depth <= 30 ? 'At this depth, most post holes will encounter rock before reaching the ideal 36-inch depth. We bring rock drilling equipment to finish these holes and ensure each post reaches maximum achievable depth.' : 'At this depth, our deeper post holes (particularly corner and end posts) may encounter rock. We keep drilling equipment on the truck as standard practice for Hill Country installations.'}`);
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
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Terrain, Drainage & Water', mx, y);
      y += 5;

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
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
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('What This Means for Your Fence & Pricing', mx, y);
      y += 5;

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
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
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(27, 38, 54);
        doc.text(adj.label, mx + 8, y + 2);

        // Data point badge
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(140, 90, 30);
        doc.text(adj.dataPoint, mx + 8, y + 6);

        // Impact text
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
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
      // Build a material-aware closer referencing user's selections
      const postSpec = POST_MATERIALS.find(p => p.id === data.postMaterial);
      const matPostLabel = postSpec
        ? `${postSpec.label} (${postSpec.diameter}, ${postSpec.weightPerFoot} lb/ft)`
        : data.postMaterial;
      const isDrillStem = data.postMaterial.startsWith('drill_stem');
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

      const closerParts: string[] = [
        `We selected ${matPostLabel} for your line posts (spaced every ${data.linePostSpacing}') and T-posts every ${data.tPostSpacing}' specifically for the conditions on YOUR property.`,
      ];
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

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(27, 38, 54);
      doc.text('Our Material Selection — Tailored to Your Property', mx + 4, y + 7);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
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
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
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

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    for (const line of specLines) {
      y = ensureSpace(doc, y, 5);
      doc.text(`• ${line}`, mx + 2, y);
      y += 4.5;
    }
    y += 6;
  }

  // ── Investment Summary ──
  y = ensureSpace(doc, y, 60);
  doc.setTextColor(27, 38, 54);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('INVESTMENT SUMMARY', mx, y);
  y += 8;

  // Table header
  doc.setFillColor(27, 38, 54);
  doc.rect(mx, y - 4, cw, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Section', mx + 3, y);
  doc.text('Linear Feet', mx + cw * 0.55, y);
  doc.text('Total', mx + cw - 3, y, { align: 'right' });
  y += 7;

  // Section rows
  let totalLinearFeet = 0;
  doc.setTextColor(50, 50, 50);
  doc.setFont('helvetica', 'normal');

  for (let i = 0; i < data.sections.length; i++) {
    const sec = data.sections[i];
    y = ensureSpace(doc, y, 7);

    if (i % 2 === 0) {
      doc.setFillColor(245, 247, 250);
      doc.rect(mx, y - 4, cw, 7, 'F');
    }

    doc.setFontSize(9);
    doc.text(sec.name, mx + 3, y);
    doc.text(sec.linearFeet.toLocaleString(), mx + cw * 0.55, y);
    doc.text(`$${sec.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, mx + cw - 3, y, { align: 'right' });
    totalLinearFeet += sec.linearFeet;
    y += 7;
  }

  // Gates (if any)
  for (const gate of data.gates) {
    y = ensureSpace(doc, y, 7);
    doc.setFontSize(9);
    doc.text(gate.type, mx + 3, y);
    doc.text('—', mx + cw * 0.55, y);
    doc.text(`$${gate.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, mx + cw - 3, y, { align: 'right' });
    y += 7;
  }

  // Total linear feet row
  y = ensureSpace(doc, y, 8);
  doc.setFillColor(230, 235, 240);
  doc.rect(mx, y - 4, cw, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(27, 38, 54);
  doc.text(`Total Linear Feet: ${totalLinearFeet.toLocaleString()}`, mx + 3, y);
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
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(27, 38, 54);
      doc.text('Accessories', mx + 3, y);
      y += 7;
      for (const [label, cost] of accRows) {
        y = ensureSpace(doc, y, 7);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        doc.text(`  ${label}`, mx + 3, y);
        doc.text(`$${cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, mx + cw - 3, y, { align: 'right' });
        y += 7;
      }
    }
  }

  // Steep grade surcharge (if any)
  if (data.steepFootage && data.steepSurchargePerFoot) {
    y = ensureSpace(doc, y, 10);
    doc.setFillColor(255, 240, 240);
    doc.rect(mx, y - 4, cw, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
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
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('PROJECT TOTAL', mx + 3, y + 1);
  doc.text(`$${data.projectTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, mx + cw - 3, y + 1, { align: 'right' });
  y += 16;

  // ── Payment Schedule ──
  y = ensureSpace(doc, y, 40);
  doc.setTextColor(27, 38, 54);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
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
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text(payRows[i][0], mx + 3, y);
    doc.text(payRows[i][1], mx + cw - 3, y, { align: 'right' });
    y += 7;
  }

  // Total row
  doc.setFillColor(27, 38, 54);
  doc.rect(mx, y - 4, cw, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('PROJECT TOTAL', mx + 3, y);
  doc.text(`$${data.projectTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, mx + cw - 3, y, { align: 'right' });
  y += 14;

  // ── Project Timeline ──
  if (data.laborEstimate) {
    const le = data.laborEstimate;
    y = ensureSpace(doc, y, 90);

    // Section header bar
    doc.setFillColor(27, 38, 54);
    doc.rect(mx, y - 3, cw, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('PROJECT TIMELINE', mx + 4, y + 3);
    y += 14;

    // Summary line
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    const rangeHigh = le.workDays + Math.ceil(le.workDays * 0.25);
    doc.text(`Estimated Duration: ${le.workDays} to ${rangeHigh} working days  •  ${le.workDayHours}-hour work days  •  ${le.totalHours} total crew-hours`, mx, y);
    y += 8;

    // Group breakdown into project phases
    const phases: { name: string; icon: string; hours: number; items: string[] }[] = [];

    // Phase 1: Site Preparation (drilling + post setting)
    const drillItems = le.breakdown.filter(b => b.task.toLowerCase().includes('drill'));
    const setItems = le.breakdown.filter(b => b.task.toLowerCase().includes('set') && !b.task.toLowerCase().includes('assembly'));
    const prepHrs = drillItems.reduce((s, b) => s + b.hours, 0) + setItems.reduce((s, b) => s + b.hours, 0);
    if (prepHrs > 0) {
      phases.push({
        name: 'Site Preparation & Post Setting',
        icon: '1',
        hours: prepHrs,
        items: [...drillItems.map(b => b.detail), ...setItems.map(b => b.detail)],
      });
    }

    // Phase 2: Structural (braces, assemblies)
    const braceItems = le.breakdown.filter(b => b.task.toLowerCase().includes('brace') || b.task.toLowerCase().includes('assembly'));
    const braceHrs = braceItems.reduce((s, b) => s + b.hours, 0);
    if (braceHrs > 0) {
      phases.push({
        name: 'Bracing & Structural Assembly',
        icon: '2',
        hours: braceHrs,
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
        hours: tPostHrs,
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
        hours: wireHrs,
        items: wireItems.map(b => b.detail),
      });
    }

    // Phase 5: Gates & Finishing
    const gateItems = le.breakdown.filter(b => b.task.toLowerCase().includes('gate'));
    const gateHrs = gateItems.reduce((s, b) => s + b.hours, 0);
    if (gateHrs > 0) {
      phases.push({
        name: 'Gate Installation & Finishing',
        icon: String(phases.length + 1),
        hours: gateHrs,
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
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text(phase.icon, mx + 4, y + 2.5, { align: 'center' });

      // Phase name & duration
      doc.setTextColor(27, 38, 54);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(phase.name, mx + 12, y + 2);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`${phase.hours} hrs (~${phaseDays} day${phaseDays !== 1 ? 's' : ''})`, mx + cw - 3, y + 2, { align: 'right' });
      y += 6;

      // Progress bar
      doc.setFillColor(235, 238, 243);
      doc.roundedRect(mx + 12, y, cw - 12, 3, 1.5, 1.5, 'F');
      doc.setFillColor(27, 38, 54);
      doc.roundedRect(mx + 12, y, Math.min(barW, cw - 12), 3, 1.5, 1.5, 'F');
      y += 5;

      // Phase detail items
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
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
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('ESTIMATED COMPLETION', mx + 3, y + 1);
    doc.text(`${le.workDays} – ${rangeHigh} working days`, mx + cw - 3, y + 1, { align: 'right' });
    y += 14;
  }

  // ── Detailed Sections ──
  y = ensureSpace(doc, y, 30);
  doc.setTextColor(27, 38, 54);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('DETAILED FENCE SECTIONS', mx, y);
  y += 10;

  for (const sec of data.sections) {
    y = ensureSpace(doc, y, 40);

    // Section header
    doc.setFillColor(240, 243, 248);
    doc.rect(mx, y - 4, cw, 8, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(27, 38, 54);
    doc.text(`${sec.name} — ${sec.linearFeet.toLocaleString()} Linear Feet`, mx + 3, y);
    y += 10;

    // Material table header
    if (sec.materials && sec.materials.length > 0) {
      doc.setFillColor(27, 38, 54);
      doc.rect(mx + 4, y - 4, cw - 8, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Material', mx + 7, y);
      doc.text('Quantity', mx + cw - 11, y, { align: 'right' });
      y += 6;

      const nameColW = (cw - 8) * 0.68;  // ~68% for material name
      const qtyColW = (cw - 8) * 0.28;   // ~28% for quantity (right-aligned)
      const lineH = 3.2; // line height per wrapped line

      doc.setTextColor(50, 50, 50);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
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
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(50, 50, 50);
        for (let ln = 0; ln < nameLines.length; ln++) {
          doc.text(nameLines[ln], mx + 7, y + ln * lineH);
        }

        // Quantity (wrapped, right-aligned)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
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
        doc.setFontSize(8);
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
          // For multi-section: append quantities
          const existing = matMap.get(key)!;
          existing.qty += ` + ${m.quantity}`;
        }
      }
    }

    // Sort by order
    const sortedMats = Array.from(matMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);

    if (sortedMats.length > 0) {
      y = ensureSpace(doc, y, 40);

      // Header bar
      doc.setFillColor(27, 38, 54);
      doc.rect(mx, y - 3, cw, 9, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('MATERIALS ORDER SUMMARY', mx + 4, y + 3);
      y += 12;

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      doc.text(`Total project: ${totalLinearFeet.toLocaleString()} linear feet across ${data.sections.length} section${data.sections.length > 1 ? 's' : ''}`, mx, y);
      y += 5;

      // Table header
      doc.setFillColor(240, 243, 248);
      doc.rect(mx, y - 3, cw, 7, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(27, 38, 54);
      doc.text('Material', mx + 3, y + 1);
      doc.text('Quantity', mx + cw - 3, y + 1, { align: 'right' });
      y += 7;

      for (let i = 0; i < sortedMats.length; i++) {
        const row = sortedMats[i];
        // Clean qty: take first quantity only (no multi-section duplication for single-section bids)
        const cleanQty = row.qty.includes('+') ? row.qty.split('+').map(s => s.trim()).join(' + ') : row.qty;
        // Truncate qty for compact display
        const qtyShort = cleanQty.length > 50 ? cleanQty.slice(0, 47) + '...' : cleanQty;

        const nameLines = doc.splitTextToSize(row.shortName, cw * 0.55);
        const qtyLines = doc.splitTextToSize(qtyShort, cw * 0.4);
        const rowH = Math.max(nameLines.length, qtyLines.length) * 3.5 + 2;

        y = ensureSpace(doc, y, rowH);

        if (i % 2 === 0) {
          doc.setFillColor(250, 251, 252);
          doc.rect(mx, y - 3, cw, rowH, 'F');
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(40, 40, 40);
        doc.text(nameLines, mx + 3, y);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(27, 38, 54);
        doc.text(qtyLines, mx + cw - 3, y, { align: 'right' });

        y += rowH;
      }

      // Accessories
      if (data.accessories) {
        const accItems: { name: string; qty: number }[] = [];
        if (data.accessories.postCaps > 0) accItems.push({ name: 'Post Caps', qty: data.accessories.postCaps });
        if (data.accessories.springIndicators > 0) accItems.push({ name: 'Spring Tension Indicators', qty: data.accessories.springIndicators });
        if (data.accessories.concreteFillPosts > 0) accItems.push({ name: 'Concrete Fill (posts)', qty: data.accessories.concreteFillPosts });
        if (data.accessories.concreteFillBraces > 0) accItems.push({ name: 'Concrete Fill (braces)', qty: data.accessories.concreteFillBraces });

        for (const acc of accItems) {
          y = ensureSpace(doc, y, 6);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(40, 40, 40);
          doc.text(acc.name, mx + 3, y);
          doc.setFont('helvetica', 'bold');
          doc.text(String(acc.qty), mx + cw - 3, y, { align: 'right' });
          y += 5;
        }
      }

      // Gates
      if (data.gates && data.gates.length > 0) {
        y = ensureSpace(doc, y, 6);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(40, 40, 40);
        for (const gate of data.gates) {
          doc.text(gate.type, mx + 3, y);
          doc.setFont('helvetica', 'bold');
          doc.text('1', mx + cw - 3, y, { align: 'right' });
          y += 5;
        }
      }

      y += 6;
    }
  }

  // ── Terms and Conditions ──
  doc.addPage();
  y = 20;

  doc.setTextColor(27, 38, 54);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
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

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
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
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('ACCEPTANCE', mx, y);
  y += 8;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 50);
  const acceptText = `I/We have read, understood, and agree to all terms and conditions stated in this proposal. I/We authorize Hayden Ranch Services to proceed with the work as described. I/We acknowledge that the ${data.depositPercent}% deposit ($${data.depositAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}) is non-refundable and earned upon receipt. I/We warrant that I/we have authority to enter into this agreement and authorize work on the property.`;
  const acceptLines = doc.splitTextToSize(acceptText, cw);
  doc.text(acceptLines, mx, y);
  y += acceptLines.length * 3.5 + 12;

  // Signature lines
  const sigMid = pw / 2;

  // Customer signature
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.3);
  doc.line(mx, y, sigMid - 10, y);
  doc.line(sigMid + 10, y, pw - mx, y);
  y += 4;

  doc.setFontSize(7);
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
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Questions? Contact us at ${COMPANY.phone} or ${COMPANY.email}`, pw / 2, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'italic');
  doc.text('Thank you for considering Hayden Ranch Services for your fence installation project!', pw / 2, y, { align: 'center' });

  // Add page numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
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
    const parts = stayTuffModel.split('/');
    if (parts.length >= 2) {
      const h = parseInt(parts[1], 10);
      if (!isNaN(h) && h > 0) return h;
    }
  }
  const match = fenceHeight.match(/(\d+)/);
  if (match) return parseInt(match[1], 10) * 12;
  return 60; // fallback 5ft
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
): SectionMaterial[] {
  const ft = linearFeet;
  const wireHeightIn = resolveWireHeight(fenceHeight, stayTuffModel);
  const wireWithOverlap = Math.ceil(ft * 1.1); // 10% overlap for tensioning
  const wireRolls = Math.ceil(wireWithOverlap / 330);
  const wireRollsDec = (wireWithOverlap / 330).toFixed(1);

  // Use user-configured spacings
  const tPosts = Math.ceil(ft / tPostSpacing);
  const linePostCount = Math.max(2, Math.ceil(ft / linePostSpacing));

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

  // Each H-brace assembly: 1 additional brace post + 1 horizontal rail (10') + 1 welded diagonal pipe (~10').
  // The end/corner post is already counted as a line post.
  const bracePostCount = hBraceCount;
  const bracePipePieces = hBraceCount * 2; // horizontal rail + welded diagonal per assembly

  // Pipe joints: line posts + brace posts + brace rails/diagonals
  const totalPostsFromPipe = linePostCount + bracePostCount;
  const postJointsNeeded = postsPerJoint > 0 ? Math.ceil(totalPostsFromPipe / postsPerJoint) : totalPostsFromPipe;
  const bracePiecesPerJoint = Math.floor(jointLen / 10);
  const braceJointsNeeded = bracePiecesPerJoint > 0 ? Math.ceil(bracePipePieces / bracePiecesPerJoint) : bracePipePieces;
  const jointsNeeded = postJointsNeeded + braceJointsNeeded;

  // Post description
  const postSpecInfo = POST_MATERIALS.find(p => p.id === postMaterial);
  const postLabel = postSpecInfo
    ? `${postSpecInfo.label}${gaugeSpec ? ` (${gaugeSpec.label}, ${gaugeSpec.wallThickness} wall)` : ''}`
    : postMaterial;

  const concreteBagsPerPost = wireHeightIn >= 72 ? 3 : 2;
  const concreteBags = (linePostCount * concreteBagsPerPost) + (hBraceCount * concreteBagsPerPost);

  // Hardware counts
  const clipsPerTPost = wireHeightIn >= 72 ? 5 : 4;
  const clips = tPosts * clipsPerTPost;
  const clipBoxes = Math.ceil(clips / 500);

  // High-tensile top/bottom wire
  const htStrands = wireHeightIn >= 72 ? 2 : 1;

  // Tensioners (1 per 660ft run + 1 per strand)
  const tensioners = Math.max(2, Math.ceil(ft / 660)) * (htStrands + 1);

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
    const strands = 4;
    const barbedRolls = Math.ceil((wireWithOverlap * strands) / 1320);
    materials.push({
      name: `Barbed Wire — ${strands}-strand, 15.5 gauge, 4-point barbs, 5" spacing (1,320' rolls). Standard ${strands}-strand configuration for livestock containment. Includes 10% overlap allowance for proper tensioning and corner wraps.`,
      quantity: `${(wireWithOverlap * strands).toLocaleString()} ft total wire (${strands} strands × ${ft.toLocaleString()} ft = ${barbedRolls} rolls)`,
    });
  } else if (isNoClimb) {
    const noClimbRolls = Math.ceil(wireWithOverlap / 200);
    materials.push({
      name: `No-Climb Horse Fence — ${wireHeightIn}" height, 2" × 4" mesh pattern, 12.5 gauge galvanized wire (200' rolls). Designed with small mesh openings to prevent horses from catching hooves. Safe for all equine and small livestock. Includes 10% overlap allowance.`,
      quantity: `${wireWithOverlap.toLocaleString()} ft (${(wireWithOverlap / 200).toFixed(1)} rolls = ${noClimbRolls} rolls ordered)`,
    });
  } else if (isStayTuff && stayTuffModel) {
    materials.push({
      name: `Stay-Tuff ${stayTuffModel} Fixed Knot Wire — ${wireHeightIn}" height, high-tensile galvanized steel, 330' rolls. Made in USA with 20-year manufacturer warranty against rust and breakage. Fixed-knot design prevents knot slippage under animal pressure and maintains wire spacing over time. Includes 10% overlap for tensioning.`,
      quantity: `${wireWithOverlap.toLocaleString()} ft (${wireRollsDec} rolls = ${wireRolls} rolls ordered)`,
    });
  } else if (isStayTuff) {
    materials.push({
      name: `Stay-Tuff High-Tensile Field Fence Wire — ${wireHeightIn}" height, 330' rolls. Made in USA, 20-year warranty. Fixed-knot construction for superior strength and longevity. Includes 10% overlap.`,
      quantity: `${wireWithOverlap.toLocaleString()} ft (${wireRollsDec} rolls = ${wireRolls} rolls ordered)`,
    });
  } else if (isFieldFence) {
    materials.push({
      name: `Field Fence Wire — ${wireHeightIn}" height, graduated mesh spacing, 12.5 gauge galvanized, 330' rolls. Standard agricultural field fence suitable for cattle, goats, and general livestock containment. Includes 10% overlap for tensioning.`,
      quantity: `${wireWithOverlap.toLocaleString()} ft (${wireRollsDec} rolls = ${wireRolls} rolls ordered)`,
    });
  } else {
    materials.push({
      name: `Fence wire — ${wireHeightIn}" height, 330' rolls. General-purpose galvanized wire for the selected fence configuration. Includes 10% overlap allowance.`,
      quantity: `${wireWithOverlap.toLocaleString()} ft (${wireRolls} rolls)`,
    });
  }

  // ==============================================================
  // TOP & BOTTOM WIRE — smooth HT or barbed (user selectable), not used with barbed wire fence type
  // ==============================================================
  if (!isBarbedWire) {
    const useBarbed = topWireType === 'barbed' || topWireType === 'barbed_double';
    const topStrands = topWireType === 'barbed_double' ? 2 : 1;
    const bottomStrands = wireHeightIn >= 72 ? 1 : 0; // bottom wire only on tall fences
    const totalStrands = topStrands + bottomStrands;

    if (useBarbed) {
      // 4-prong high-tensile barbed wire — 1,320' rolls
      const barbedFtNeeded = wireWithOverlap * totalStrands;
      const barbedRolls = Math.ceil(barbedFtNeeded / 1320);
      const strandDesc = topStrands === 2
        ? `double barbed top + ${bottomStrands ? '1 barbed bottom' : 'no bottom'}`
        : `1 barbed top${bottomStrands ? ' + 1 barbed bottom' : ''}`;
      materials.push({
        name: `High-Tensile 4-Prong Barbed Wire — ${strandDesc}, 15.5 gauge, 4-point barbs, 5" spacing (1,320' rolls). Runs along the top${topStrands === 2 ? ' (double strand)' : ''} ${bottomStrands ? 'and bottom ' : ''}of the fence for livestock deterrent and predator control. ${topStrands === 2 ? 'Double barbed top provides extra deterrent against animals pushing over the fence.' : ''} ${bottomStrands ? 'Bottom strand prevents livestock from pushing under.' : ''} Includes 10% overlap.`,
        quantity: `${barbedFtNeeded.toLocaleString()} ft (${totalStrands} strand${totalStrands > 1 ? 's' : ''} = ${barbedRolls} rolls × 1,320')`,
      });
    } else {
      // Smooth high-tensile wire — 4,000' rolls (original behavior)
      const strandLabel = totalStrands === 2 ? 'top & bottom strands' : 'top strand only';
      materials.push({
        name: `12.5 Gauge High-Tensile Smooth Wire — ${strandLabel}, 4,000' rolls. Runs along the top${totalStrands === 2 ? ' and bottom' : ''} of the fence to add rigidity and prevent livestock from pushing over or under. ${totalStrands === 2 ? 'Two strands recommended for fences 72" and taller.' : 'Single top strand for fences under 72".'}`,
        quantity: `${(wireWithOverlap * totalStrands).toLocaleString()} ft (${totalStrands} strand${totalStrands > 1 ? 's' : ''}, ${((wireWithOverlap * totalStrands) / 4000).toFixed(2)} rolls)`,
      });
    }
  }

  // ==============================================================
  // T-POSTS (correctly auto-sized from wire height)
  // ==============================================================
  if (!isPipeFence) {
    materials.push({
      name: `${tPostSpec.label} T-Posts (1.33 lb/ft, studded) — Spaced every ${tPostSpacing}' on center. Auto-sized: ${wireHeightIn}" wire height requires ${tPostSpec.lengthFeet}' T-posts to provide adequate above-ground height plus burial depth. T-posts are the intermediate support between line posts on ${terrainLabel}.`,
      quantity: `${tPosts} posts (${ft.toLocaleString()} ft ÷ ${tPostSpacing}' spacing)`,
    });
  }

  // ==============================================================
  // LINE POSTS (user's selected material)
  // ==============================================================
  materials.push({
    name: `${postLabel} Line Posts — Set ${postCalc.belowGroundFeet}' deep in concrete, ${postCalc.aboveGroundFeet.toFixed(1)}' above ground (${postCalc.totalLengthFeet}' total cut length). Spaced every ${linePostSpacing}' on center. ${postMaterial.startsWith('drill_stem') ? 'Heavy-wall oilfield pipe recycled for agricultural use — excellent strength-to-cost ratio, highly resistant to livestock impact and weather.' : `Square tube with ${gaugeSpec ? gaugeSpec.wallThickness : '0.075"'} wall thickness — clean profile with excellent rigidity for straight fence lines.`} Cut from ${jointLen}' joints (${postsPerJoint} posts per joint). Total joints: ${postJointsNeeded} for ${totalPostsFromPipe} posts (${linePostCount} line + ${bracePostCount} brace) + ${braceJointsNeeded} for ${bracePipePieces} brace rails/diagonals.`,
    quantity: `${totalPostsFromPipe} posts + ${bracePipePieces} brace pipes (${jointsNeeded} joints × ${jointLen}')`,
  });

  // ==============================================================
  // BRACE ASSEMBLIES (H-braces at ends + mid-run for long sections)
  // ==============================================================
  const braceBreakdown = midRunBraces > 0
    ? `${endBraces} at section ends + ${midRunBraces} mid-run (1 per 660' of run)`
    : `${endBraces} at section ends`;
  materials.push({
    name: `H-Brace Assemblies — Each assembly: 2 vertical ${postSpecInfo?.label ?? postMaterial} posts + 1 horizontal brace rail (10') + 1 welded pipe diagonal (~10'). The diagonal is welded between the top of one post and the base of the other for maximum rigidity — no brace wire used. Braces anchor the fence line at ends and along long runs to resist wire tension pull (up to 250 lbs per wire strand). Gate braces are calculated separately with each gate.`,
    quantity: `${hBraceCount} assemblies (${braceBreakdown})`,
  });

  // ==============================================================
  // CONCRETE
  // ==============================================================
  materials.push({
    name: `Concrete Mix — 80 lb bags, fast-setting. ${concreteBagsPerPost} bags per post (${postCalc.belowGroundFeet}' depth) for both line posts and H-brace posts. Proper concrete setting prevents frost heave, livestock-induced lean, and soil erosion undermining. ${wireHeightIn >= 72 ? '3 bags per post required for taller fences (72"+) to provide adequate lateral support.' : '2 bags per post is standard for fences under 72".'}`,
    quantity: `${concreteBags} bags — ${linePostCount} line posts + ${bracePostCount} brace posts × ${concreteBagsPerPost} bags each (${(concreteBags * 80).toLocaleString()} lbs total)`,
  });

  // ==============================================================
  // INLINE TENSIONERS (not used with barbed wire or pipe fence)
  // ==============================================================
  if (!isBarbedWire && !isPipeFence) {
    materials.push({
      name: `Inline Wire Tensioners — Ratchet-style tensioning devices installed at intervals to maintain proper wire tension across long runs. Allows re-tensioning after initial stretch-out period (wire stretches 1-2% in the first 30 days). ${htStrands + 1} tensioners per 660' run (1 per wire strand).`,
      quantity: `${tensioners} tensioners`,
    });
  }

  // ==============================================================
  // CLIPS & HARDWARE
  // ==============================================================
  if (!isPipeFence) {
    materials.push({
      name: `Fence Clips — ${clipsPerTPost} clips per T-post, sold in boxes of 500. Galvanized steel clips secure the wire mesh to each T-post at evenly spaced intervals. ${clipsPerTPost === 5 ? '5 clips per post for taller fences (72"+) to prevent wire sag between attachment points.' : '4 clips per post is standard for fences under 72".'}`,
      quantity: `${clips} clips (${clipBoxes} box${clipBoxes > 1 ? 'es' : ''})`,
    });
  }

  return materials;
}

// ============================================================
// Labor Time Estimation
// ============================================================
// Based on real-world production rates:
//   Drilling:       12 post holes per 3 hours (4 holes/hr, 15 min each)
//   Post setting:   30 min per post (concrete pour + plumb + brace)
//   T-posts:        10-15 per hour (avg 12/hr)
//   H-brace:        2 posts to drill & set
//   Corner brace:   5 posts to drill & set
//   Work day:       9-10 hours

export function calculateLaborEstimate(params: {
  totalLinearFeet: number;
  linePostCount: number;
  tPostCount: number;
  hBraceCount: number;
  cornerBraceCount: number;
  gateCount: number;
  workDayHours?: number; // default 9.5
}): LaborEstimate {
  const {
    totalLinearFeet,
    linePostCount,
    tPostCount,
    hBraceCount,
    cornerBraceCount,
    gateCount,
    workDayHours = 9.5,
  } = params;

  const breakdown: { task: string; hours: number; detail: string }[] = [];

  // ── Line post holes (drill + set) ──
  // Drilling: 15 min/hole, Setting: 30 min/post → 45 min total per line post
  const linePostDrillHrs = linePostCount * (15 / 60);
  const linePostSetHrs = linePostCount * (30 / 60);
  breakdown.push({
    task: 'Drill line post holes',
    hours: linePostDrillHrs,
    detail: `${linePostCount} holes × 15 min each (4 holes/hr)`,
  });
  breakdown.push({
    task: 'Set line posts in concrete',
    hours: linePostSetHrs,
    detail: `${linePostCount} posts × 30 min each (pour, plumb, brace)`,
  });

  // ── H-brace assembly (2 posts each: drill + set + build assembly) ──
  const hBracePostCount = hBraceCount * 2;
  const hBraceDrillHrs = hBracePostCount * (15 / 60);
  const hBraceSetHrs = hBracePostCount * (30 / 60);
  const hBraceAssemblyHrs = hBraceCount * 0.5; // ~30 min to weld rail + diagonal per assembly
  if (hBraceCount > 0) {
    breakdown.push({
      task: 'Drill & set H-brace posts',
      hours: hBraceDrillHrs + hBraceSetHrs,
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
  const cornerDrillHrs = cornerPostCount * (15 / 60);
  const cornerSetHrs = cornerPostCount * (30 / 60);
  const cornerAssemblyHrs = cornerBraceCount * 1.0; // ~1 hr to build each corner assembly
  if (cornerBraceCount > 0) {
    breakdown.push({
      task: 'Drill & set corner brace posts',
      hours: cornerDrillHrs + cornerSetHrs,
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

  // ── Wire stringing (~300 ft/hr for crew: unroll, tension, tie) ──
  const wireHrs = totalLinearFeet / 300;
  breakdown.push({
    task: 'String & tension wire',
    hours: wireHrs,
    detail: `${totalLinearFeet.toLocaleString()} ft @ ~300 ft/hr (unroll, stretch, clip)`,
  });

  // ── Gates (avg 1.5 hrs per gate install including welding frame) ──
  const gateHrs = gateCount * 1.5;
  if (gateCount > 0) {
    breakdown.push({
      task: 'Install gates',
      hours: gateHrs,
      detail: `${gateCount} gate${gateCount > 1 ? 's' : ''} × ~1.5 hrs each (hang, weld hinges, latch)`,
    });
  }

  const drillingHours = linePostDrillHrs + hBraceDrillHrs + cornerDrillHrs;
  const postSettingHours = linePostSetHrs + hBraceSetHrs + cornerSetHrs;
  const braceAssemblyHours = hBraceAssemblyHrs + cornerAssemblyHrs;
  const totalHours = breakdown.reduce((sum, b) => sum + b.hours, 0);
  const workDays = Math.ceil(totalHours / workDayHours * 10) / 10; // round to 0.1

  return {
    drillingHours: Math.round(drillingHours * 10) / 10,
    postSettingHours: Math.round(postSettingHours * 10) / 10,
    tPostHours: Math.round(tPostHrs * 10) / 10,
    wireHours: Math.round(wireHrs * 10) / 10,
    braceAssemblyHours: Math.round(braceAssemblyHours * 10) / 10,
    gateHours: Math.round(gateHrs * 10) / 10,
    totalHours: Math.round(totalHours * 10) / 10,
    workDayHours,
    workDays: Math.ceil(workDays),
    breakdown: breakdown.map(b => ({ ...b, hours: Math.round(b.hours * 10) / 10 })),
  };
}