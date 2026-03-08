import jsPDF from 'jspdf';
import { recommendedTPostLength, calculatePostLength } from './fence-materials';

// ============================================================
// Types for fence bid PDF
// ============================================================

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

  // Custom project overview text
  projectOverview: string;

  // Terrain description
  terrainDescription: string;

  // Property research / soil narrative for the customer
  soilNarrative?: string;

  // Map screenshot data URLs (base64 PNGs) — supports multiple captures
  mapImages?: string[];

  // Terms (use default if empty)
  customTerms?: string[];
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
  `Scope of Work: Installation includes ${'{fenceType}'} fence with drill stem corner posts, H-braces, and line posts with concrete setting. All hardware, clips, and professional installation included. Any work not explicitly listed in this proposal is excluded.`,
  `Payment Terms: ${'{depositPercent}'}% non-refundable deposit ($${'{depositAmount}'}) required to schedule work and order materials. Deposit is earned upon receipt and covers material ordering, scheduling, and opportunity costs. Balance ($${'{balanceAmount}'}) due in full upon completion before contractor leaves property. Payment accepted by check, cash, or bank transfer. Returned checks subject to $50 fee plus any bank charges. No work begins without cleared deposit.`,
  `Cancellation Policy: Customer may cancel within 3 business days of signing with full deposit refund. After 3 business days, deposit is non-refundable and earned.`,
  `Site Access and Conditions: Customer warrants they have legal right to authorize work on the property. Customer is responsible for marking all underground utilities by calling 811 at least 3 business days before work begins. Customer grants contractor access to property and right to cross property as needed to complete work. Customer is responsible for securing all animals during work. Contractor is not liable for livestock escape due to temporary fence access during installation.`,
  `Material Pricing: Material costs subject to change if proposal not accepted within 30 days. If material costs increase more than 10% before work begins, contractor reserves right to adjust pricing or cancel contract with deposit refunded. All materials ordered are non-returnable. Customer is responsible for deposit even if customer cancels after materials are ordered.`,
  `Rock and Subsurface Conditions: Pricing assumes standard rock conditions manageable with hydraulic breaker. If solid limestone, caliche, or bedrock requiring core drilling is encountered on more than 10% of posts, additional drilling will be billed at $15 per post not to exceed $750 without written customer approval. If subsurface conditions prevent post installation at specified locations, contractor may relocate posts up to 10 feet to achieve proper installation. Customer will be notified of significant subsurface issues before additional charges are incurred.`,
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
  doc.setFillColor(27, 38, 54); // dark navy
  doc.rect(0, 0, pw, 42, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(COMPANY.name, mx, y + 2);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(COMPANY.address, mx, y + 10);
  doc.text(`${COMPANY.phone} | ${COMPANY.email}`, mx, y + 16);

  // Date & valid until (right aligned)
  doc.setFontSize(9);
  doc.text(`Date: ${data.date}`, pw - mx, y + 2, { align: 'right' });
  doc.text(`Valid Until: ${data.validUntil}`, pw - mx, y + 8, { align: 'right' });

  y = 52;

  // ── Title ──
  doc.setTextColor(27, 38, 54);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');

  // Dynamic title based on fence type
  const title = data.fenceType.toUpperCase() + ' INSTALLATION PROPOSAL';
  doc.text(title, pw / 2, y, { align: 'center' });
  y += 12;

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
    const imgHeight = imgWidth * 0.55; // ~16:9 aspect ratio

    for (let mi = 0; mi < data.mapImages.length; mi++) {
      try {
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

  // ── Property Research & Site Analysis ──
  if (data.soilNarrative) {
    y = ensureSpace(doc, y, 40);
    doc.setTextColor(27, 38, 54);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('PROPERTY RESEARCH & SITE ANALYSIS', mx, y);
    y += 6;

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    const soilLines = doc.splitTextToSize(data.soilNarrative, cw);
    // May be multiple paragraphs, handle page breaks
    for (let i = 0; i < soilLines.length; i++) {
      y = ensureSpace(doc, y, 4);
      doc.text(soilLines[i], mx, y);
      y += 3.5;
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

    const specLines = [
      `Wire Height: ${data.wireHeightInches}" (${(data.wireHeightInches / 12).toFixed(1)} ft)${data.stayTuffModel ? ` — Stay-Tuff model ${data.stayTuffModel}` : ''}`,
      `T-Post Size: ${tSpec.label} — required to support ${data.wireHeightInches}" wire height with proper above-ground clearance`,
      `Corner/End Post: ${pCalc.totalLengthFeet}' drill stem (2-3/8" OD) — ${pCalc.aboveGroundFeet.toFixed(1)}' above ground, ${pCalc.belowGroundFeet}' below ground for stability`,
      `Post Material: Drill stem posts cut from 31' joints (${pCalc.postsPerDrillStemJoint} posts per joint) — superior strength vs. standard pipe`,
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

      doc.setTextColor(50, 50, 50);
      doc.setFont('helvetica', 'normal');
      for (let i = 0; i < sec.materials.length; i++) {
        y = ensureSpace(doc, y, 6);
        if (i % 2 === 0) {
          doc.setFillColor(250, 251, 252);
          doc.rect(mx + 4, y - 3.5, cw - 8, 6, 'F');
        }
        doc.setFontSize(8);
        doc.text(sec.materials[i].name, mx + 7, y);
        doc.text(sec.materials[i].quantity, mx + cw - 11, y, { align: 'right' });
        y += 6;
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
  const processedTerms = terms.map((term) =>
    term
      .replace(/\{fenceType\}/g, data.fenceType)
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
  terrain: string = 'moderate'
): SectionMaterial[] {
  const ft = linearFeet;
  const wireHeightIn = resolveWireHeight(fenceHeight, stayTuffModel);
  const wireWithOverlap = Math.ceil(ft * 1.1); // 10% overlap for tensioning
  const wireRolls = Math.ceil(wireWithOverlap / 330);
  const wireRollsDec = (wireWithOverlap / 330).toFixed(1);

  // Post spacing depends on terrain
  const spacingMap: Record<string, number> = { easy: 16.5, moderate: 14, difficult: 12, very_difficult: 10 };
  const spacing = spacingMap[terrain] || 14;

  // Correct T-post sizing from fence-materials.ts
  const tPostSpec = recommendedTPostLength(wireHeightIn);
  const tPosts = Math.ceil(ft / spacing);

  // Correct drill stem post sizing from fence-materials.ts
  const postCalc = calculatePostLength(wireHeightIn);
  const drillStemPosts = Math.max(2, Math.ceil(ft / 200)); // corners + end posts ~every 200ft
  const drillStemBraces = drillStemPosts;
  const concreteBagsPerPost = wireHeightIn >= 72 ? 3 : 2;
  const concreteBags = drillStemPosts * concreteBagsPerPost;

  // Hardware counts
  const clipsPerTPost = wireHeightIn >= 72 ? 5 : 4;
  const clips = tPosts * clipsPerTPost;
  const clipBoxes = Math.ceil(clips / 500);

  // High-tensile top/bottom wire
  const htStrands = wireHeightIn >= 72 ? 2 : 1;

  // Tensioners (1 per 660ft run + 1 per strand)
  const tensioners = Math.max(2, Math.ceil(ft / 660)) * (htStrands + 1);

  const isStayTuff = fenceType.includes('stay_tuff') || fenceType.includes('Stay Tuff') || fenceType.includes('Stay-Tuff');
  const terrainLabel = TERRAIN_LABELS[terrain] || 'moderate conditions';

  const materials: SectionMaterial[] = [];

  // -- Wire --
  if (isStayTuff && stayTuffModel) {
    materials.push({
      name: `Stay-Tuff ${stayTuffModel} Fixed Knot wire (${wireHeightIn}" height, 330' rolls) — Made in USA, 20-yr warranty`,
      quantity: `${wireWithOverlap.toLocaleString()} ft (${wireRollsDec} rolls = ${wireRolls} rolls ordered)`,
    });
  } else if (isStayTuff) {
    materials.push({
      name: `Stay-Tuff field fence wire (${wireHeightIn}" height, 330' rolls) — Made in USA, 20-yr warranty`,
      quantity: `${wireWithOverlap.toLocaleString()} ft (${wireRollsDec} rolls = ${wireRolls} rolls ordered)`,
    });
  } else {
    materials.push({
      name: `Field fence wire (${wireHeightIn}" height, 330' rolls)`,
      quantity: `${wireWithOverlap.toLocaleString()} ft (${wireRolls} rolls)`,
    });
  }

  // -- High-tensile smooth wire (top/bottom) --
  materials.push({
    name: `12.5 ga high-tensile smooth wire — ${htStrands === 2 ? 'top & bottom strands' : 'top strand'} (4,000' rolls)`,
    quantity: `${(wireWithOverlap * htStrands).toLocaleString()} ft (${htStrands} strand${htStrands > 1 ? 's' : ''})`,
  });

  // -- T-Posts (correctly sized) --
  materials.push({
    name: `${tPostSpec.label} T-Posts (1.33 lb/ft) — spaced ${spacing}' apart on ${terrainLabel}`,
    quantity: `${tPosts} posts`,
  });

  // -- Drill stem corner/end posts --
  materials.push({
    name: `Drill stem corner & end posts (2-3/8" OD) — ${postCalc.totalLengthFeet}' total length, set ${postCalc.belowGroundFeet}' deep, ${postCalc.aboveGroundFeet.toFixed(1)}' above ground`,
    quantity: `${drillStemPosts} posts (cut from ${Math.ceil(drillStemPosts / postCalc.postsPerDrillStemJoint)} joints x 31')`,
  });

  // -- Drill stem brace rails --
  materials.push({
    name: `Drill stem brace rails (2-3/8" OD) — 10' horizontal rails for H-brace assemblies`,
    quantity: `${drillStemBraces} rails`,
  });

  // -- Brace wire --
  materials.push({
    name: `Brace wire (12.5 ga, 20' coils) — diagonal tensioning for each brace assembly`,
    quantity: `${drillStemBraces} coils`,
  });

  // -- Concrete --
  materials.push({
    name: `Concrete mix (80 lb bags) — ${concreteBagsPerPost} bags per corner/end post for ${postCalc.belowGroundFeet}' depth setting`,
    quantity: `${concreteBags} bags (${(concreteBags * 80).toLocaleString()} lbs total)`,
  });

  // -- Inline tensioners --
  materials.push({
    name: `Inline wire tensioners — maintains proper tension across long runs`,
    quantity: `${tensioners} tensioners`,
  });

  // -- Clips and hardware --
  materials.push({
    name: `Fence clips (${clipsPerTPost} per T-post, boxes of 500) — secures wire to T-posts`,
    quantity: `${clips} clips (${clipBoxes} box${clipBoxes > 1 ? 'es' : ''})`,
  });

  return materials;
}
