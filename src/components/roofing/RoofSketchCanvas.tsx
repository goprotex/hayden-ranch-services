'use client';

import { useEffect, useRef } from 'react';
import { RoofModel, CutList, PanelCut } from '@/types';
import { PANEL_SPECS } from '@/lib/roofing/panel-specs';

interface Props {
  roofModel: RoofModel | null;
  cutList: CutList | null;
}

const COLORS = {
  facetFill: '#e0f2fe',
  facetStroke: '#0284c7',
  panelStroke: '#6366f1',
  panelFill: 'rgba(99, 102, 241, 0.08)',
  ridge: '#ef4444',
  hip: '#f97316',
  valley: '#eab308',
  eave: '#22c55e',
  rake: '#8b5cf6',
  sidewall: '#ec4899',
  headwall: '#14b8a6',
  text: '#334155',
  grid: '#f1f5f9',
};

export default function RoofSketchCanvas({ roofModel, cutList }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#fafbfc';
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (!roofModel || roofModel.facets.length === 0) {
      drawPlaceholder(ctx, rect.width, rect.height);
      return;
    }

    // Calculate the bounding box of all facets
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const facet of roofModel.facets) {
      for (const v of facet.vertices) {
        minX = Math.min(minX, v.x);
        minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, v.y);
      }
    }

    const modelWidth = maxX - minX || 1;
    const modelHeight = maxY - minY || 1;
    const padding = 60;
    const scaleX = (rect.width - padding * 2) / modelWidth;
    const scaleY = (rect.height - padding * 2) / modelHeight;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = padding + (rect.width - padding * 2 - modelWidth * scale) / 2;
    const offsetY = padding + (rect.height - padding * 2 - modelHeight * scale) / 2;

    const toScreen = (x: number, y: number): [number, number] => [
      (x - minX) * scale + offsetX,
      (y - minY) * scale + offsetY,
    ];

    // Draw grid
    drawGrid(ctx, rect.width, rect.height);

    // Draw facets
    for (const facet of roofModel.facets) {
      // Fill
      ctx.beginPath();
      const [sx, sy] = toScreen(facet.vertices[0].x, facet.vertices[0].y);
      ctx.moveTo(sx, sy);
      for (let i = 1; i < facet.vertices.length; i++) {
        const [fx, fy] = toScreen(facet.vertices[i].x, facet.vertices[i].y);
        ctx.lineTo(fx, fy);
      }
      ctx.closePath();
      ctx.fillStyle = COLORS.facetFill;
      ctx.fill();
      ctx.strokeStyle = COLORS.facetStroke;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      const cx = facet.vertices.reduce((s, v) => s + v.x, 0) / facet.vertices.length;
      const cy = facet.vertices.reduce((s, v) => s + v.y, 0) / facet.vertices.length;
      const [lcx, lcy] = toScreen(cx, cy);
      ctx.fillStyle = COLORS.text;
      ctx.font = 'bold 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(facet.label, lcx, lcy - 8);
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillText(`${facet.areaSquareFeet.toLocaleString()} sf • ${facet.pitchRatio}`, lcx, lcy + 8);

      // Draw edges with color coding
      for (const edge of facet.edgeTypes) {
        const [ex1, ey1] = toScreen(edge.start.x, edge.start.y);
        const [ex2, ey2] = toScreen(edge.end.x, edge.end.y);

        ctx.beginPath();
        ctx.moveTo(ex1, ey1);
        ctx.lineTo(ex2, ey2);
        ctx.strokeStyle = (COLORS as Record<string, string>)[edge.type] || COLORS.facetStroke;
        ctx.lineWidth = edge.type === 'ridge' || edge.type === 'hip' ? 3 : 2;
        ctx.stroke();
      }
    }

    // Draw cut list panels overlay
    if (cutList) {
      const spec = PANEL_SPECS[cutList.panelProfile];

      for (const panel of cutList.panels) {
        const pw = spec.widthInches / 12; // in feet
        const ph = panel.lengthFeet;

        const [px, py] = toScreen(panel.position.x, panel.position.y);
        const [px2, py2] = toScreen(panel.position.x + pw, panel.position.y + ph);

        const screenW = px2 - px;
        const screenH = py2 - py;

        ctx.fillStyle = COLORS.panelFill;
        ctx.fillRect(px, py, screenW, screenH);
        ctx.strokeStyle = COLORS.panelStroke;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, screenW, screenH);
      }

      // Panel count label
      ctx.fillStyle = 'rgba(99, 102, 241, 0.9)';
      ctx.font = 'bold 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        `${cutList.panels.length} panels • ${spec.name}`,
        10,
        rect.height - 10
      );
    }

    // Legend
    drawLegend(ctx, rect.width);
  }, [roofModel, cutList]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg border border-steel-200"
        style={{ height: '500px' }}
      />
      {!roofModel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-steel-400 text-sm">
            Import a roof report to see the 2D sketch here
          </p>
        </div>
      )}
    </div>
  );
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Draw a simple house outline as placeholder
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);

  // House body
  ctx.strokeRect(w * 0.25, h * 0.4, w * 0.5, h * 0.45);

  // Roof
  ctx.beginPath();
  ctx.moveTo(w * 0.2, h * 0.4);
  ctx.lineTo(w * 0.5, h * 0.15);
  ctx.lineTo(w * 0.8, h * 0.4);
  ctx.stroke();

  ctx.setLineDash([]);
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;
  const spacing = 30;

  for (let x = 0; x < w; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawLegend(ctx: CanvasRenderingContext2D, canvasWidth: number) {
  const items = [
    { label: 'Ridge', color: COLORS.ridge },
    { label: 'Hip', color: COLORS.hip },
    { label: 'Valley', color: COLORS.valley },
    { label: 'Eave', color: COLORS.eave },
    { label: 'Rake', color: COLORS.rake },
  ];

  const startX = canvasWidth - 10;
  const startY = 20;

  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';

  items.forEach((item, i) => {
    const y = startY + i * 18;
    ctx.fillStyle = item.color;
    ctx.fillRect(startX - 50, y - 4, 12, 3);
    ctx.fillStyle = COLORS.text;
    ctx.fillText(item.label, startX, y);
  });
}
