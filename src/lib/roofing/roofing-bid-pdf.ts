import jsPDF from 'jspdf';

// `` Types ``

export interface RoofBidSection {
  id: string;
  name: string;
  areaSqFt: number;
  ratePerSqFt: number;
  total: number;
  pitch?: string;
}

export interface RoofMaterialCosts {
  panelCostPerSqFt: number;
  underlaymentCostPerSqFt: number;
  trimAndFlashingPerSqFt: number;
  fastenersCostPerSqFt: number;
  laborCostPerSqFt: number;
  profitMarginPercent: number;
  overheadPercent: number;
}

export interface RoofSketchFacet {
  name: string;
  areaSqFt: number;
  pitch: string;
  color: string;
  vertices: [number, number][]; // normalized 0-1 coords for drawing
}

export interface RoofBidData {
  projectName: string;
  clientName: string;
  propertyAddress: string;
  date: string;
  validUntil: string;
  roofType: string;
  panelProfile: string;
  gauge: number;
  sections: RoofBidSection[];
  extras: { name: string; cost: number }[];
  projectTotal: number;
  depositPercent: number;
  depositAmount: number;
  balanceAmount: number;
  timelineWeeks: number;
  workingDays: number;
  projectOverview: string;
  includesTearOff: boolean;
  roofLayers: number;
  warrantyYears: number;
  customTerms?: string[];
  // New: material/pricing breakdown
  materialCosts?: RoofMaterialCosts;
  // New: sketch facets for diagram
  sketchFacets?: RoofSketchFacet[];
  // New: map capture image (base64)
  mapImage?: string;
}

// Company info
const COMPANY = {
  name: 'HAYDEN RANCH SERVICES',
  address: '5900 Balcones Dr #26922, Austin, TX 78731',
  phone: '(830) 777-9111',
  email: 'office@haydenclaim.com',
};

// Default terms
const DEFAULT_TERMS: string[] = [
  'This proposal is valid for 30 days from the date shown above.',
  'A deposit of {depositPercent}% (${depositAmount}) is due upon acceptance. The remaining balance of ${balanceAmount} is due upon satisfactory completion.',
  'Hayden Ranch Services will furnish all labor, materials, and equipment necessary to complete the scope described.',
  'All metal roofing panels and trim will be manufactured to specified dimensions and installed per manufacturer guidelines.',
  'Estimated project completion: {workingDays} working days from the scheduled start date, weather permitting.',
  'Any hidden damage, rot, or structural issues discovered during tear-off will be reported immediately. Repairs to damaged decking or structural members will be billed at cost plus 20% and require written approval before proceeding.',
  'All work performed under this contract is guaranteed for a period of two (2) years covering workmanship defects. Panel manufacturer warranties are separate and provided directly by the manufacturer.',
  'The property owner is responsible for ensuring clear access to all work areas. Vehicles, personal property, and landscaping near the structure should be relocated or protected prior to commencement.',
  'We carry general liability insurance and workers compensation coverage. Certificates of insurance are available upon request.',
  'Any alteration or deviation from the specifications in this proposal involving extra costs will be executed only upon written authorization and will become an additional charge over and above this estimate.',
  'This proposal, when accepted, becomes a binding contract. It is understood that Hayden Ranch Services is not responsible for delays caused by weather, material shortages, permitting delays, or other conditions beyond our control.',
  'All materials remain property of Hayden Ranch Services until final payment is received in full.',
  'The property owner agrees to provide access to electrical power and water at the job site for the duration of the project.',
  'Hayden Ranch Services will make every reasonable effort to protect landscaping and property during construction. Minor landscape disturbance in the immediate work area is expected and not covered under this contract.',
  'Cleanup and debris removal: All job-related debris, old roofing materials, and packaging will be removed from the premises upon project completion. A magnetic sweep of the property will be conducted.',
  'Payment may be made by check, cash, ACH, or credit card. A 3% processing fee applies to all credit card transactions.',
  'In the event of non-payment, the property owner agrees to be responsible for all collection costs, attorney fees, and court costs incurred.',
  'If unforeseen conditions require a change in the scope of work, a written change order detailing the additional work and associated costs will be provided for approval before proceeding.',
  'Permits: Unless specifically stated otherwise, the cost of building permits is not included in this proposal. If required, permit fees will be billed separately.',
  'This agreement shall be governed by and construed in accordance with the laws of the State of Texas. Any disputes shall be resolved in the courts of Hays County, Texas.',
];

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Draw roof diagram in PDF
function drawRoofDiagram(doc: jsPDF, data: RoofBidData, startX: number, startY: number, width: number, height: number): void {
  const facets = data.sketchFacets;
  if (!facets || facets.length === 0) return;

  // Background
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(startX, startY, width, height, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(startX, startY, width, height, 2, 2, 'S');

  // Find bounds of all facets
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of facets) {
    for (const [vx, vy] of f.vertices) {
      minX = Math.min(minX, vx); minY = Math.min(minY, vy);
      maxX = Math.max(maxX, vx); maxY = Math.max(maxY, vy);
    }
  }
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const pad = 8;
  const dw = width - pad * 2;
  const dh = height - pad * 2 - 8;
  const scale = Math.min(dw / rangeX, dh / rangeY);
  const ox = startX + pad + (dw - rangeX * scale) / 2;
  const oy = startY + pad + (dh - rangeY * scale) / 2;

  const toP = (vx: number, vy: number): [number, number] => [
    ox + (vx - minX) * scale,
    oy + (vy - minY) * scale,
  ];

  // Draw facets
  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b] as [number, number, number];
  };

  for (const facet of facets) {
    if (facet.vertices.length < 3) continue;
    const rgb = hexToRgb(facet.color || '#f59e0b');

    // Fill
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.setGState(doc.GState({ opacity: 0.2 }));
    const [fx, fy] = toP(facet.vertices[0][0], facet.vertices[0][1]);
    let path = `${fx} ${fy} m`;
    for (let i = 1; i < facet.vertices.length; i++) {
      const [px, py] = toP(facet.vertices[i][0], facet.vertices[i][1]);
      path += ` ${px} ${py} l`;
    }
    // Use manual polygon drawing
    doc.setGState(doc.GState({ opacity: 1 }));
    const pts = facet.vertices.map(v => toP(v[0], v[1]));
    // Draw filled polygon
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    // We'll draw a path manually
    const firstPt = pts[0];
    doc.triangle(firstPt[0], firstPt[1], firstPt[0], firstPt[1], firstPt[0], firstPt[1], 'F');
    // Actually, let's use lines for the outline and a simple approach for fill
    // Fill with low opacity by drawing a lighter version
    doc.setFillColor(
      Math.min(255, rgb[0] + 180),
      Math.min(255, rgb[1] + 180),
      Math.min(255, rgb[2] + 180)
    );
    // Draw as triangulated polygon for fill
    if (pts.length === 3) {
      doc.triangle(pts[0][0], pts[0][1], pts[1][0], pts[1][1], pts[2][0], pts[2][1], 'F');
    } else if (pts.length === 4) {
      doc.triangle(pts[0][0], pts[0][1], pts[1][0], pts[1][1], pts[2][0], pts[2][1], 'F');
      doc.triangle(pts[0][0], pts[0][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1], 'F');
    } else if (pts.length >= 5) {
      for (let i = 1; i < pts.length - 1; i++) {
        doc.triangle(pts[0][0], pts[0][1], pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 'F');
      }
    }

    // Outline
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    doc.setLineWidth(0.5);
    for (let i = 0; i < pts.length; i++) {
      const next = pts[(i + 1) % pts.length];
      doc.line(pts[i][0], pts[i][1], next[0], next[1]);
    }

    // Center label
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    doc.text(facet.name, cx, cy - 1.5, { align: 'center' });
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`${facet.areaSqFt.toLocaleString()} sf \u2022 ${facet.pitch}`, cx, cy + 2.5, { align: 'center' });
  }

  // Title
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('ROOF DIAGRAM', startX + width / 2, startY + height - 3, { align: 'center' });
}

// PDF Generator
export function generateRoofBidPDF(data: RoofBidData): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const PW = 215.9;
  const PH = 279.4;
  const ML = 18;
  const MR = 18;
  const CW = PW - ML - MR;
  let y = 0;
  let pageNum = 1;

  function checkPage(needed: number) {
    if (y + needed > PH - 25) {
      doc.addPage();
      pageNum++;
      y = 20;
    }
  }

  // Header
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, PW, 38, 'F');
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(COMPANY.name, ML, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(COMPANY.address, ML, 24);
  doc.text(COMPANY.phone + '  |  ' + COMPANY.email, ML, 30);
  y = 46;

  // Title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(data.roofType + ' Roofing Installation Proposal', PW / 2, y, { align: 'center' });
  y += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Prepared for: ' + data.clientName, PW / 2, y, { align: 'center' });
  y += 5;
  if (data.propertyAddress) {
    doc.text(data.propertyAddress, PW / 2, y, { align: 'center' });
    y += 5;
  }
  doc.text('Date: ' + data.date + '  |  Valid Until: ' + data.validUntil, PW / 2, y, { align: 'center' });
  y += 10;

  // Project Overview
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('PROJECT OVERVIEW', ML, y);
  y += 6;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const overviewLines = doc.splitTextToSize(data.projectOverview, CW);
  doc.text(overviewLines, ML, y);
  y += overviewLines.length * 4.5 + 6;

  // Map Image (if available)
  if (data.mapImage) {
    checkPage(80);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('PROPERTY OVERVIEW', ML, y);
    y += 4;
    try {
      doc.addImage(data.mapImage, 'JPEG', ML, y, CW, 60);
      y += 64;
    } catch {
      // skip if image fails
    }
  }

  // Roof Diagram
  if (data.sketchFacets && data.sketchFacets.length > 0) {
    checkPage(70);
    drawRoofDiagram(doc, data, ML, y, CW, 60);
    y += 64;
  }

  // Specifications
  checkPage(30);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('SPECIFICATIONS', ML, y);
  y += 6;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  const specs = [
    ['Panel Profile', data.panelProfile],
    ['Gauge', data.gauge + ' gauge'],
    ['Roof Type', data.roofType],
    ['Includes Tear-Off', data.includesTearOff ? 'Yes (' + data.roofLayers + ' layer' + (data.roofLayers > 1 ? 's' : '') + ')' : 'No (overlay)'],
    ['Warranty', data.warrantyYears + ' year workmanship'],
  ];
  specs.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(label + ':', ML, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(String(val), ML + 45, y);
    y += 5;
  });
  y += 4;

  // Material Cost Breakdown (if provided)
  if (data.materialCosts) {
    checkPage(45);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('COST BREAKDOWN', ML, y);
    y += 6;

    const mc = data.materialCosts;
    const totalSqFt = data.sections.reduce((s, c) => s + c.areaSqFt, 0);
    const materialTotal = (mc.panelCostPerSqFt + mc.underlaymentCostPerSqFt + mc.trimAndFlashingPerSqFt + mc.fastenersCostPerSqFt) * totalSqFt;
    const laborTotal = mc.laborCostPerSqFt * totalSqFt;
    const subtotal = materialTotal + laborTotal;

    const breakdownItems = [
      ['Panels (' + mc.panelCostPerSqFt.toFixed(2) + '/sqft x ' + totalSqFt.toLocaleString() + ')', fmt(mc.panelCostPerSqFt * totalSqFt)],
      ['Underlayment (' + mc.underlaymentCostPerSqFt.toFixed(2) + '/sqft)', fmt(mc.underlaymentCostPerSqFt * totalSqFt)],
      ['Trim & Flashing (' + mc.trimAndFlashingPerSqFt.toFixed(2) + '/sqft)', fmt(mc.trimAndFlashingPerSqFt * totalSqFt)],
      ['Fasteners & Hardware (' + mc.fastenersCostPerSqFt.toFixed(2) + '/sqft)', fmt(mc.fastenersCostPerSqFt * totalSqFt)],
      ['Labor (' + mc.laborCostPerSqFt.toFixed(2) + '/sqft)', fmt(laborTotal)],
    ];

    doc.setFillColor(30, 41, 59);
    doc.rect(ML, y - 4, CW, 8, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Item', ML + 3, y);
    doc.text('Cost', ML + CW - 3, y, { align: 'right' });
    y += 6;

    doc.setFont('helvetica', 'normal');
    breakdownItems.forEach(([label, val], i) => {
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(ML, y - 4, CW, 7, 'F');
      }
      doc.setTextColor(51, 65, 85);
      doc.text(label, ML + 3, y);
      doc.setFont('helvetica', 'bold');
      doc.text('$' + val, ML + CW - 3, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += 7;
    });
    y += 4;
  }

  // Investment Summary
  checkPage(60);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('INVESTMENT SUMMARY', ML, y);
  y += 6;

  doc.setFillColor(30, 41, 59);
  doc.rect(ML, y - 4, CW, 8, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Section', ML + 3, y);
  doc.text('Area (sq ft)', ML + CW * 0.45, y);
  doc.text('Rate', ML + CW * 0.65, y);
  doc.text('Total', ML + CW - 3, y, { align: 'right' });
  y += 6;

  doc.setFont('helvetica', 'normal');
  data.sections.forEach((sec, i) => {
    checkPage(8);
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(ML, y - 4, CW, 7, 'F');
    }
    doc.setTextColor(51, 65, 85);
    doc.text(sec.name + (sec.pitch ? ' (' + sec.pitch + ')' : ''), ML + 3, y);
    doc.text(sec.areaSqFt.toLocaleString(), ML + CW * 0.45, y);
    doc.text('$' + sec.ratePerSqFt.toFixed(2) + '/sqft', ML + CW * 0.65, y);
    doc.setFont('helvetica', 'bold');
    doc.text('$' + fmt(sec.total), ML + CW - 3, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 7;
  });

  data.extras.forEach((ex) => {
    checkPage(8);
    doc.setTextColor(51, 65, 85);
    doc.text(ex.name, ML + 3, y);
    doc.setFont('helvetica', 'bold');
    doc.text('$' + fmt(ex.cost), ML + CW - 3, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 7;
  });

  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.5);
  doc.line(ML, y - 2, ML + CW, y - 2);
  y += 3;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  const totalSqFt = data.sections.reduce((s, c) => s + c.areaSqFt, 0);
  doc.text('Total: ' + totalSqFt.toLocaleString() + ' sq ft', ML + 3, y);
  doc.text('$' + fmt(data.projectTotal), ML + CW - 3, y, { align: 'right' });
  y += 10;

  // Payment Schedule
  checkPage(30);
  doc.setFillColor(255, 251, 235);
  doc.roundedRect(ML, y - 4, CW, 26, 2, 2, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(146, 64, 14);
  doc.text('PAYMENT SCHEDULE', ML + 4, y);
  y += 6;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 53, 15);
  doc.text('Deposit (' + data.depositPercent + '% - due at signing)', ML + 4, y);
  doc.text('$' + fmt(data.depositAmount), ML + CW - 6, y, { align: 'right' });
  y += 5;
  doc.text('Balance (due at completion)', ML + 4, y);
  doc.text('$' + fmt(data.balanceAmount), ML + CW - 6, y, { align: 'right' });
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Project Total', ML + 4, y);
  doc.setFontSize(11);
  doc.text('$' + fmt(data.projectTotal), ML + CW - 6, y, { align: 'right' });
  y += 12;

  // Timeline
  checkPage(12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('ESTIMATED TIMELINE', ML, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(data.workingDays + ' to ' + Math.ceil(data.workingDays * 1.25) + ' working days (approx. ' + data.timelineWeeks + ' weeks), weather permitting.', ML, y);
  y += 10;

  // Terms & Conditions
  doc.addPage();
  pageNum++;
  y = 20;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Terms & Conditions', PW / 2, y, { align: 'center' });
  y += 10;

  const terms = data.customTerms || DEFAULT_TERMS;
  terms.forEach((term, i) => {
    checkPage(16);
    let t = term
      .replace(/{depositPercent}/g, String(data.depositPercent))
      .replace(/{depositAmount}/g, fmt(data.depositAmount))
      .replace(/{balanceAmount}/g, fmt(data.balanceAmount))
      .replace(/{workingDays}/g, String(data.workingDays))
      .replace(/{roofType}/g, data.roofType);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text((i + 1) + '.', ML, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const wrapped = doc.splitTextToSize(t, CW - 10);
    doc.text(wrapped, ML + 8, y);
    y += wrapped.length * 4 + 3;
  });

  // Acceptance
  y += 6;
  checkPage(50);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('ACCEPTANCE', PW / 2, y, { align: 'center' });
  y += 8;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const acceptText = 'By signing below, you accept this proposal and agree to the terms and conditions outlined above. You authorize Hayden Ranch Services to proceed with the described work.';
  const aLines = doc.splitTextToSize(acceptText, CW);
  doc.text(aLines, ML, y);
  y += aLines.length * 4 + 12;

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.3);
  const halfW = (CW - 20) / 2;
  doc.line(ML, y, ML + halfW, y);
  doc.line(ML + halfW + 20, y, ML + CW, y);
  y += 5;
  doc.setFontSize(8);
  doc.text('Client Signature', ML, y);
  doc.text('Date', ML + halfW + 20, y);
  y += 12;
  doc.line(ML, y, ML + halfW, y);
  doc.line(ML + halfW + 20, y, ML + CW, y);
  y += 5;
  doc.text('Hayden Ranch Services Representative', ML, y);
  doc.text('Date', ML + halfW + 20, y);

  // Page numbers
  for (let i = 1; i <= pageNum; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Page ' + i + ' of ' + pageNum, PW / 2, PH - 10, { align: 'center' });
    doc.text(COMPANY.name + '  |  ' + COMPANY.phone, PW / 2, PH - 6, { align: 'center' });
  }

  const fileName = 'Roofing_Bid_' + data.projectName.replace(/\s+/g, '_') + '_' + data.date.replace(/[^\w]/g, '') + '.pdf';
  doc.save(fileName);
}
