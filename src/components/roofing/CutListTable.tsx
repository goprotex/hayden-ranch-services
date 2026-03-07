'use client';

import { CutList } from '@/types';
import { PANEL_SPECS } from '@/lib/roofing/panel-specs';

interface Props {
  cutList: CutList;
}

export default function CutListTable({ cutList }: Props) {
  const spec = PANEL_SPECS[cutList.panelProfile];

  // Group panels by facet
  const facetGroups = new Map<string, typeof cutList.panels>();
  for (const panel of cutList.panels) {
    const group = facetGroups.get(panel.facetId) || [];
    group.push(panel);
    facetGroups.set(panel.facetId, group);
  }

  // Summary
  const uniqueLengths = [...new Set(cutList.panels.map((p) => p.lengthFeet))].sort(
    (a, b) => b - a
  );

  return (
    <div className="overflow-x-auto">
      {/* Summary */}
      <div className="px-6 py-4 bg-indigo-50 border-b border-indigo-100">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-steel-500">Total Panels</p>
            <p className="font-bold text-steel-800">{cutList.panels.length}</p>
          </div>
          <div>
            <p className="text-steel-500">Coverage Area</p>
            <p className="font-bold text-steel-800">
              {Math.round(cutList.totalPanelSqFt).toLocaleString()} sq ft
            </p>
          </div>
          <div>
            <p className="text-steel-500">Waste ({Math.round(cutList.wasteFactor * 100)}%)</p>
            <p className="font-bold text-steel-800">
              {Math.round(cutList.totalWasteSqFt).toLocaleString()} sq ft
            </p>
          </div>
          <div>
            <p className="text-steel-500">Gauge</p>
            <p className="font-bold text-steel-800">{cutList.gauge} ga</p>
          </div>
        </div>
      </div>

      {/* Unique cut lengths summary */}
      <div className="px-6 py-3 bg-steel-50 border-b border-steel-200">
        <p className="text-xs font-semibold text-steel-600 uppercase tracking-wide mb-2">
          Unique Cut Lengths
        </p>
        <div className="flex flex-wrap gap-2">
          {uniqueLengths.map((len) => {
            const count = cutList.panels.filter((p) => p.lengthFeet === len).length;
            return (
              <span
                key={len}
                className="inline-flex items-center gap-1 bg-white border border-steel-200 rounded-full px-3 py-1 text-xs"
              >
                <strong>{len}&apos;</strong>
                <span className="text-steel-400">× {count}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Detail table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-steel-200 bg-steel-50">
            <th className="text-left px-6 py-3 text-steel-600 font-medium">#</th>
            <th className="text-left px-6 py-3 text-steel-600 font-medium">Facet</th>
            <th className="text-left px-6 py-3 text-steel-600 font-medium">Panel</th>
            <th className="text-right px-6 py-3 text-steel-600 font-medium">Width</th>
            <th className="text-right px-6 py-3 text-steel-600 font-medium">Length</th>
            <th className="text-right px-6 py-3 text-steel-600 font-medium">Sq Ft</th>
          </tr>
        </thead>
        <tbody>
          {cutList.panels.map((panel, i) => (
            <tr key={panel.id} className="border-b border-steel-100 hover:bg-steel-50">
              <td className="px-6 py-2 text-steel-400">{i + 1}</td>
              <td className="px-6 py-2 text-steel-600">{panel.facetId}</td>
              <td className="px-6 py-2 font-medium text-steel-700">{spec.name}</td>
              <td className="px-6 py-2 text-right text-steel-600">
                {panel.widthInches}&quot;
              </td>
              <td className="px-6 py-2 text-right font-medium text-indigo-600">
                {panel.lengthFeet}&apos;
              </td>
              <td className="px-6 py-2 text-right text-steel-600">
                {((panel.lengthFeet * panel.widthInches) / 12).toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
