import { jsPDF } from 'jspdf';
import { CutList, RoofModel, RoofFacet, PanelCut } from '@/types';
import { PANEL_SPECS } from './panel-specs';

const TRIM_LABELS: Record<string, string> = {
  ridge_cap: 'Ridge Cap',
  hip_cap: 'Hip Cap',
  valley_flashing: 'Valley Flashing',
  eave_drip: 'Eave Drip Edge',
  rake_trim: 'Rake Trim',
  sidewall_flashing: 'Sidewall Flashing',
  headwall_flashing: 'Headwall Flashing',
  transition_flashing: 'Transition Flashing',
  j_channel: 'J-Channel',
  z_flashing: 'Z-Flashing',
  gable_trim: 'Gable Trim',
  peak_box: 'Peak Box',
  endwall_flashing: 'Endwall Flashing',
  inside_closure: 'Inside Closure Strip',
  outside_closure: 'Outside Closure Strip',
};

const EDGE_COLORS: Record<string, [number, number, number]> = {
  eave: [34, 197, 94],
  ridge: [59, 130, 246],
  hip: [239, 68, 68],
  valley: [249, 115, 22],
  rake: [168, 85, 247],
  sidewall: [107, 114, 128],
  headwall: [107, 114, 128],
  transition: [107, 114, 128],
  drip_edge: [34, 197, 94],
};

const EDGE_LABELS: Record<string, string> = {
  eave: 'Eave',
  ridge: 'Ridge',
  hip: 'Hip',
  valley: 'Valley',
  rake: 'Rake',
  sidewall: 'Sidewall',
  headwall: 'Headwall',
  transition: 'Transition',
  drip_edge: 'Drip Edge',
};

/** Format decimal feet as 12'6" */
function fmtLen(feet: number): string {
  const whole = Math.floor(feet);
  const inches = Math.round((feet - whole) * 12);
  if (inches === 0) return `${whole}'`;
  if (inches === 12) return `${whole + 1}'`;
  return `${whole}'${inches}"`;
}
export function generateCutListPDF(cutList: CutList, roofModel: RoofModel): void {
  const doc = new jsPDF('p', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;
  const spec = PANEL_SPECS[cutList.panelProfile];

  // ---- HEADER ----
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('HAYDEN RANCH SERVICES', margin, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Metal Roofing & Fencing Solutions  \u2022  haydenranchservices.com', margin, 22);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, 22, { align: 'right' });
  y = 40;

  // ---- PROJECT INFO ----
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('CUT LIST', margin, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const infoLines: [string, string][] = [
    ['Project:', roofModel.projectName],
    ['Address:', roofModel.address || 'N/A'],
    ['Panel Profile:', spec.name],
    ['Gauge:', `${cutList.gauge} ga`],
    ['Total Roof Area:', `${roofModel.totalAreaSqFt.toLocaleString()} sq ft`],
    ['Facets:', `${roofModel.facets.length}`],
  ];
  for (const [label, value] of infoLines) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, margin + 35, y);
    y += 5;
  }
  y += 5;

  // ---- SUMMARY BOX ----
  doc.setFillColor(238, 242, 255);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  const summaryItems = [
    `Total Panels: ${cutList.panels.length}`,
    `Coverage: ${Math.round(cutList.totalPanelSqFt).toLocaleString()} sf`,
    `Waste (${Math.round(cutList.wasteFactor * 100)}%): ${Math.round(cutList.totalWasteSqFt).toLocaleString()} sf`,
    `Trim Pieces: ${cutList.trim.reduce((s, t) => s + t.quantity, 0)}`,
  ];
  const colW = contentWidth / summaryItems.length;
  summaryItems.forEach((item, i) => {
    doc.text(item, margin + colW * i + colW / 2, y + 10, { align: 'center' });
  });
  y += 25;

  // ---- UNIQUE CUT LENGTHS ----
  const uniqueLengths = [...new Set(cutList.panels.map(p => p.lengthFeet))].sort((a, b) => b - a);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('Unique Cut Lengths', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const lengthChunks = uniqueLengths.map(len => {
    const count = cutList.panels.filter(p => p.lengthFeet === len).length;
    return `${fmtLen(len)} \u00d7 ${count}`;
  });
  doc.text(lengthChunks.join('   |   '), margin, y);
  y += 10;
  // ---- PANEL SUMMARY TABLE ----
  y = drawSectionHeader(doc, 'Panel Summary by Facet', margin, y, contentWidth);
  const sumCols = [
    { label: 'Facet', width: 40, align: 'left' as const },
    { label: 'Pitch', width: 20, align: 'center' as const },
    { label: 'Panels', width: 20, align: 'right' as const },
    { label: 'Panel Length', width: 30, align: 'right' as const },
    { label: 'Width', width: 22, align: 'right' as const },
    { label: 'Sq Ft', width: 25, align: 'right' as const },
  ];
  y = drawTableHeader(doc, sumCols, margin, y);
  for (const facet of roofModel.facets) {
    const fp = cutList.panels.filter(p => p.facetId === facet.id);
    if (fp.length === 0) continue;
    if (y > 255) { doc.addPage(); y = margin; y = drawTableHeader(doc, sumCols, margin, y); }
    const sqft = fp.reduce((s, p) => s + (p.lengthFeet * p.widthInches) / 12, 0);
    const row = [
      facet.label || facet.id,
      facet.pitchRatio,
      String(fp.length),
      fmtLen(fp[0].lengthFeet),
      `${fp[0].widthInches}"`,
      `${Math.round(sqft)} sf`,
    ];
    const rowIdx = roofModel.facets.indexOf(facet);
    if (rowIdx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y - 3.5, contentWidth, 5.5, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    let cx = margin;
    sumCols.forEach((col, ci) => {
      const xPos = col.align === 'right' ? cx + col.width - 2 : col.align === 'center' ? cx + col.width / 2 : cx + 2;
      doc.text(row[ci], xPos, y, { align: col.align });
      cx += col.width;
    });
    y += 5.5;
  }
  y += 8;

  // ---- FACET DIAGRAM PAGES ----
  for (const facet of roofModel.facets) {
    const facetPanels = cutList.panels.filter(p => p.facetId === facet.id);
    if (facetPanels.length === 0) continue;
    doc.addPage();
    y = margin;

    // Facet title bar
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(margin, y, contentWidth, 9, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(
      `${facet.label || facet.id}  \u2014  ${facet.pitchRatio} pitch  \u2014  ${facetPanels.length} panels  \u2014  ${Math.round(facet.areaSquareFeet)} sq ft`,
      margin + 4, y + 6.5,
    );
    y += 14;

    // Visual diagram
    const diagramH = Math.min(160, pageHeight - y - 65);
    y = drawFacetDiagram(doc, facet, facetPanels, margin, y, contentWidth, diagramH);
    y += 6;

    // Edge legend
    const edgeTypesUsed = [...new Set(facet.edgeTypes.map(e => e.type))];
    doc.setFontSize(7);
    let lx = margin;
    for (const et of edgeTypesUsed) {
      const c = EDGE_COLORS[et] || [30, 41, 59];
      doc.setFillColor(c[0], c[1], c[2]);
      doc.rect(lx, y - 2, 4, 2.5, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      const lbl = EDGE_LABELS[et] || et;
      doc.text(lbl, lx + 5.5, y, { align: 'left' });
      lx += doc.getTextWidth(lbl) + 10;
    }
    y += 6;

    // Per-facet panel list
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text('Panel details:', margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    const perRow = 6;
    for (let i = 0; i < facetPanels.length; i += perRow) {
      const chunk = facetPanels.slice(i, i + perRow);
      const line = chunk.map((p, j) => `#${i + j + 1}: ${fmtLen(p.lengthFeet)} \u00d7 ${p.widthInches}"`).join('    ');
      doc.text(line, margin, y);
      y += 3.5;
    }
  }
  // ---- TRIM TABLE ----
  if (cutList.trim.length > 0) {
    doc.addPage();
    y = margin;
    y = drawSectionHeader(doc, 'Trim & Accessories', margin, y, contentWidth);
    const trimCols = [
      { label: 'Trim Type', width: 55, align: 'left' as const },
      { label: 'Pieces', width: 20, align: 'right' as const },
      { label: 'Length Each', width: 28, align: 'right' as const },
      { label: 'Total LF', width: 25, align: 'right' as const },
    ];
    y = drawTableHeader(doc, trimCols, margin, y);
    cutList.trim.forEach((piece, i) => {
      if (y > 260) { doc.addPage(); y = margin; y = drawTableHeader(doc, trimCols, margin, y); }
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 3.5, contentWidth, 5.5, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      const row = [
        TRIM_LABELS[piece.type] || piece.type,
        String(piece.quantity),
        `${piece.lengthFeet}'`,
        `${(piece.quantity * piece.lengthFeet).toFixed(1)}'`,
      ];
      let cx = margin;
      trimCols.forEach((col, ci) => {
        const xPos = col.align === 'right' ? cx + col.width - 2 : cx + 2;
        doc.text(row[ci], xPos, y, { align: col.align });
        cx += col.width;
      });
      y += 5.5;
    });
    y += 5;
  }

  // ---- FASTENERS ----
  if (cutList.fasteners.length > 0) {
    if (y > 230) { doc.addPage(); y = margin; }
    y = drawSectionHeader(doc, 'Fasteners', margin, y, contentWidth);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    for (const f of cutList.fasteners) {
      doc.text(`${f.type} (${f.size}) \u2014 ${f.quantity.toLocaleString()} pcs`, margin + 2, y);
      y += 5;
    }
    y += 3;
  }

  // ---- ACCESSORIES ----
  if (cutList.accessories.length > 0) {
    if (y > 240) { doc.addPage(); y = margin; }
    y = drawSectionHeader(doc, 'Accessories & Supplies', margin, y, contentWidth);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    for (const acc of cutList.accessories) {
      doc.text(`${acc.name} \u2014 ${acc.quantity} ${acc.unit}`, margin + 2, y);
      y += 5;
    }
  }

  // ---- FOOTER ----
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const ph = doc.internal.pageSize.getHeight();
    doc.setFillColor(248, 250, 252);
    doc.rect(0, ph - 12, pageWidth, 12, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Hayden Ranch Services  \u2022  ${roofModel.projectName}  \u2022  Page ${p} of ${pageCount}`,
      pageWidth / 2, ph - 5, { align: 'center' },
    );
  }

  const fileName = `CutList_${roofModel.projectName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
/** Draw a visual panel layout diagram for one facet */
function drawFacetDiagram(
  doc: jsPDF,
  facet: RoofFacet,
  panels: PanelCut[],
  startX: number,
  startY: number,
  maxW: number,
  maxH: number,
): number {
  const verts = facet.vertices;
  if (verts.length < 3) return startY;

  // Bounding box of facet vertices
  const fMinX = Math.min(...verts.map(v => v.x));
  const fMaxX = Math.max(...verts.map(v => v.x));
  const fMinY = Math.min(...verts.map(v => v.y));
  const fMaxY = Math.max(...verts.map(v => v.y));

  // Expand bounding box to include full panel rectangles (may overhang past facet at hip/valley)
  let bMinX = fMinX;
  let bMaxX = fMaxX;
  let bMinY = fMinY;
  let bMaxY = fMaxY;
  for (const p of panels) {
    bMinX = Math.min(bMinX, p.position.x);
    bMaxX = Math.max(bMaxX, p.position.x + p.widthInches / 12);
    bMinY = Math.min(bMinY, p.position.y);
    bMaxY = Math.max(bMaxY, p.position.y + p.lengthFeet);
  }

  const totalW = bMaxX - bMinX || 1;
  const totalH = bMaxY - bMinY || 1;

  // Scale to fit diagram area
  const scaleX = maxW / totalW;
  const scaleY = maxH / totalH;
  const scale = Math.min(scaleX, scaleY) * 0.88;

  const drawW = totalW * scale;
  const drawH = totalH * scale;
  const offX = startX + (maxW - drawW) / 2;
  const offY = startY + (maxH - drawH) / 2;

  // Transform model-feet to PDF-mm (Y flipped so eave at bottom)
  const tx = (x: number) => offX + (x - bMinX) * scale;
  const ty = (yVal: number) => offY + (bMaxY - yVal) * scale;

  // Light background for diagram area
  doc.setFillColor(250, 251, 253);
  doc.setDrawColor(220, 225, 235);
  doc.setLineWidth(0.15);
  doc.roundedRect(startX, startY, maxW, maxH, 2, 2, 'FD');

  // Draw full uncut panel rectangles
  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    const pw = (p.widthInches / 12) * scale;
    const ph = p.lengthFeet * scale;
    const px = tx(p.position.x);
    const py = ty(p.position.y + p.lengthFeet);

    // Alternate panel fill colors
    if (i % 2 === 0) {
      doc.setFillColor(225, 235, 252);
    } else {
      doc.setFillColor(252, 237, 220);
    }
    doc.setDrawColor(170, 180, 200);
    doc.setLineWidth(0.25);
    doc.rect(px, py, pw, ph, 'FD');

    // Panel number at top
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(`#${i + 1}`, px + pw / 2, py + 3, { align: 'center' });

    // Panel length label (vertical center)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(fmtLen(p.lengthFeet), px + pw / 2, py + ph / 2 + 1, { align: 'center' });

    // Width label at bottom
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${p.widthInches}"`, px + pw / 2, py + ph - 1.5, { align: 'center' });
  }

  // Draw facet outline edges on top (color-coded by edge type)
  for (const edge of facet.edgeTypes) {
    const c = EDGE_COLORS[edge.type] || [30, 41, 59];
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(1.2);
    doc.line(tx(edge.start.x), ty(edge.start.y), tx(edge.end.x), ty(edge.end.y));
  }

  // Close any gaps in the polygon outline
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.6);
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    const alreadyDrawn = facet.edgeTypes.some(
      e =>
        (Math.abs(e.start.x - a.x) < 0.1 && Math.abs(e.start.y - a.y) < 0.1 &&
         Math.abs(e.end.x - b.x) < 0.1 && Math.abs(e.end.y - b.y) < 0.1) ||
        (Math.abs(e.start.x - b.x) < 0.1 && Math.abs(e.start.y - b.y) < 0.1 &&
         Math.abs(e.end.x - a.x) < 0.1 && Math.abs(e.end.y - a.y) < 0.1),
    );
    if (!alreadyDrawn) {
      doc.line(tx(a.x), ty(a.y), tx(b.x), ty(b.y));
    }
  }

  // Pitch label in centroid with white pill background
  const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
  const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;
  const pitchText = facet.pitchRatio;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  const pitchW = doc.getTextWidth(pitchText) + 6;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.4);
  doc.roundedRect(tx(cx) - pitchW / 2, ty(cy) - 5, pitchW, 8, 2, 2, 'FD');
  doc.setTextColor(30, 41, 59);
  doc.text(pitchText, tx(cx), ty(cy) + 1, { align: 'center' });

  // Scale reference bar (bottom-right of diagram)
  const refFeet = Math.max(1, Math.round(totalW / 4));
  const refMm = refFeet * scale;
  const rx = startX + maxW - 8 - refMm;
  const ry = startY + maxH - 6;
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.4);
  doc.line(rx, ry, rx + refMm, ry);
  doc.line(rx, ry - 1.5, rx, ry + 1.5);
  doc.line(rx + refMm, ry - 1.5, rx + refMm, ry + 1.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text(`${refFeet}'`, rx + refMm / 2, ry - 2, { align: 'center' });

  return startY + maxH;
}
/** Section header bar */
function drawSectionHeader(
  doc: jsPDF,
  title: string,
  x: number,
  y: number,
  width: number,
): number {
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(x, y, width, 7, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(title, x + 4, y + 5);
  return y + 10;
}

/** Table column headers */
function drawTableHeader(
  doc: jsPDF,
  cols: { label: string; width: number; align: 'left' | 'right' | 'center' }[],
  startX: number,
  y: number,
): number {
  doc.setFillColor(241, 245, 249);
  const totalWidth = cols.reduce((s, c) => s + c.width, 0);
  doc.rect(startX, y - 3.5, totalWidth, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  let cx = startX;
  for (const col of cols) {
    const xPos = col.align === 'right' ? cx + col.width - 2 : col.align === 'center' ? cx + col.width / 2 : cx + 2;
    doc.text(col.label, xPos, y, { align: col.align });
    cx += col.width;
  }
  return y + 5;
}