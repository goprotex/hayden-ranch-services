import { jsPDF } from 'jspdf';
import { CutList, RoofModel } from '@/types';
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

export function generateCutListPDF(cutList: CutList, roofModel: RoofModel): void {
  const doc = new jsPDF('p', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // ---- HEADER ----
  doc.setFillColor(30, 41, 59); // steel-800
  doc.rect(0, 0, pageWidth, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('HAYDEN RANCH SERVICES', margin, 14);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Metal Roofing & Fencing Solutions  •  haydenranchservices.com', margin, 22);

  doc.setFontSize(9);
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
  const spec = PANEL_SPECS[cutList.panelProfile];

  const infoLines = [
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
  doc.setFillColor(238, 242, 255); // indigo-50
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
  doc.text('Unique Cut Lengths', margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const lengthChunks: string[] = uniqueLengths.map(len => {
    const count = cutList.panels.filter(p => p.lengthFeet === len).length;
    return `${len}' × ${count}`;
  });
  const lengthLine = lengthChunks.join('   |   ');
  doc.text(lengthLine, margin, y);
  y += 8;

  // ---- PANEL TABLE ----
  y = drawSectionHeader(doc, 'Panel Cut List', margin, y, contentWidth);

  // Table header
  const panelCols = [
    { label: '#', width: 10, align: 'center' as const },
    { label: 'Facet', width: 35, align: 'left' as const },
    { label: 'Panel', width: 45, align: 'left' as const },
    { label: 'Width', width: 20, align: 'right' as const },
    { label: 'Length', width: 22, align: 'right' as const },
    { label: 'Sq Ft', width: 20, align: 'right' as const },
  ];

  y = drawTableHeader(doc, panelCols, margin, y);

  // Table rows
  const groupedByFacet = new Map<string, typeof cutList.panels>();
  for (const panel of cutList.panels) {
    const g = groupedByFacet.get(panel.facetId) || [];
    g.push(panel);
    groupedByFacet.set(panel.facetId, g);
  }

  let panelNum = 0;
  for (const [facetId, panels] of groupedByFacet) {
    // Facet subheader
    if (y > 250) {
      doc.addPage();
      y = margin;
    }

    for (const panel of panels) {
      panelNum++;
      if (y > 260) {
        doc.addPage();
        y = margin;
        y = drawTableHeader(doc, panelCols, margin, y);
      }

      const sqft = ((panel.lengthFeet * panel.widthInches) / 12).toFixed(1);
      const row = [
        String(panelNum),
        facetId,
        spec.name,
        `${panel.widthInches}"`,
        `${panel.lengthFeet}'`,
        sqft,
      ];

      const rowBg = panelNum % 2 === 0;
      if (rowBg) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 3.5, contentWidth, 5.5, 'F');
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);

      let cx = margin;
      panelCols.forEach((col, ci) => {
        const xPos = col.align === 'right' ? cx + col.width - 2 : col.align === 'center' ? cx + col.width / 2 : cx + 2;
        doc.text(row[ci], xPos, y, { align: col.align });
        cx += col.width;
      });

      y += 5.5;
    }
  }

  y += 5;

  // ---- TRIM TABLE ----
  if (cutList.trim.length > 0) {
    if (y > 220) {
      doc.addPage();
      y = margin;
    }

    y = drawSectionHeader(doc, 'Trim & Accessories', margin, y, contentWidth);

    const trimCols = [
      { label: 'Trim Type', width: 55, align: 'left' as const },
      { label: 'Pieces', width: 20, align: 'right' as const },
      { label: 'Length Each', width: 28, align: 'right' as const },
      { label: 'Total LF', width: 25, align: 'right' as const },
    ];

    y = drawTableHeader(doc, trimCols, margin, y);

    cutList.trim.forEach((piece, i) => {
      if (y > 260) {
        doc.addPage();
        y = margin;
        y = drawTableHeader(doc, trimCols, margin, y);
      }

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
    if (y > 230) {
      doc.addPage();
      y = margin;
    }

    y = drawSectionHeader(doc, 'Fasteners', margin, y, contentWidth);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);

    for (const f of cutList.fasteners) {
      doc.text(`${f.type} (${f.size}) — ${f.quantity.toLocaleString()} pcs`, margin + 2, y);
      y += 5;
    }

    y += 3;
  }

  // ---- ACCESSORIES ----
  if (cutList.accessories.length > 0) {
    if (y > 240) {
      doc.addPage();
      y = margin;
    }

    y = drawSectionHeader(doc, 'Accessories & Supplies', margin, y, contentWidth);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);

    for (const acc of cutList.accessories) {
      doc.text(`${acc.name} — ${acc.quantity} ${acc.unit}`, margin + 2, y);
      y += 5;
    }
  }

  // ---- FOOTER on each page ----
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
      `Hayden Ranch Services  •  ${roofModel.projectName}  •  Page ${p} of ${pageCount}`,
      pageWidth / 2,
      ph - 5,
      { align: 'center' }
    );
  }

  // Save
  const fileName = `CutList_${roofModel.projectName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

// ---- Helper functions ----

function drawSectionHeader(
  doc: jsPDF,
  title: string,
  x: number,
  y: number,
  width: number
): number {
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(x, y, width, 7, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(title, x + 4, y + 5);
  return y + 10;
}

function drawTableHeader(
  doc: jsPDF,
  cols: { label: string; width: number; align: 'left' | 'right' | 'center' }[],
  startX: number,
  y: number
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
