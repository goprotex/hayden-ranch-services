'use client';

import { CutList } from '@/types';
import { PANEL_SPECS } from '@/lib/roofing/panel-specs';

interface Props { cutList: CutList; }

const FACET_COLORS = ['#f59e0b','#3b82f6','#10b981','#f43f5e','#8b5cf6','#06b6d4','#ec4899','#14b8a6'];

export default function CutListTable({ cutList }: Props) {
  const spec = PANEL_SPECS[cutList.panelProfile];
  const widthIn = spec.widthInches;
  const widthFt = widthIn / 12;

  // Group panels by facet
  const facetGroups = new Map<string, typeof cutList.panels>();
  for (const panel of cutList.panels) {
    const group = facetGroups.get(panel.facetId) || [];
    group.push(panel);
    facetGroups.set(panel.facetId, group);
  }
  const facetIds = Array.from(facetGroups.keys());

  // Unique cut lengths
  const uniqueLengths = [...new Set(cutList.panels.map(p => p.lengthFeet))].sort((a, b) => b - a);

  // Max length for diagram scaling
  const maxLen = Math.max(...cutList.panels.map(p => p.lengthFeet), 1);

  return (
    <div>
      {/* Summary stats */}
      <div className='px-6 py-4 bg-surface-200/60 border-b border-steel-700/30'>
        <div className='grid grid-cols-2 md:grid-cols-5 gap-4 text-sm'>
          <div><p className='text-steel-500 text-xs'>Total Panels</p><p className='font-bold text-steel-100'>{cutList.panels.length}</p></div>
          <div><p className='text-steel-500 text-xs'>Panel Width</p><p className='font-bold text-amber-400'>{widthIn}&quot; ({widthFt.toFixed(1)} ft)</p></div>
          <div><p className='text-steel-500 text-xs'>Coverage Area</p><p className='font-bold text-steel-100'>{Math.round(cutList.totalPanelSqFt).toLocaleString()} sq ft</p></div>
          <div><p className='text-steel-500 text-xs'>Waste ({Math.round(cutList.wasteFactor * 100)}%)</p><p className='font-bold text-steel-100'>{Math.round(cutList.totalWasteSqFt).toLocaleString()} sq ft</p></div>
          <div><p className='text-steel-500 text-xs'>Gauge</p><p className='font-bold text-steel-100'>{cutList.gauge} ga</p></div>
        </div>
      </div>

      {/* Unique cut lengths badges */}
      <div className='px-6 py-3 bg-surface-100 border-b border-steel-700/30'>
        <p className='text-[10px] font-bold text-steel-500 uppercase tracking-wider mb-2'>Unique Cut Lengths</p>
        <div className='flex flex-wrap gap-2'>
          {uniqueLengths.map(len => {
            const count = cutList.panels.filter(p => p.lengthFeet === len).length;
            return (
              <span key={len} className='inline-flex items-center gap-1.5 bg-surface-200 border border-steel-700/30 rounded-full px-3 py-1 text-xs'>
                <strong className='text-amber-400'>{len}&apos;</strong>
                <span className='text-steel-500'>&times; {count}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* VISUAL CUT DIAGRAM */}
      <div className='px-6 py-4 border-b border-steel-700/30'>
        <p className='text-[10px] font-bold text-steel-500 uppercase tracking-wider mb-3'>Panel Layout Diagram</p>
        {facetIds.map((fid, fi) => {
          const panels = facetGroups.get(fid) || [];
          const color = FACET_COLORS[fi % FACET_COLORS.length];
          return (
            <div key={fid} className='mb-4'>
              <p className='text-xs text-steel-400 mb-1.5 flex items-center gap-2'>
                <span className='w-2.5 h-2.5 rounded-full inline-block' style={{ backgroundColor: color }} />
                <span className='font-semibold text-steel-300'>{fid}</span>
                <span className='text-steel-600'>&mdash; {panels.length} panels @ {widthIn}&quot; wide</span>
              </p>
              <div className='flex gap-[2px] items-end' style={{ height: '80px' }}>
                {panels.map((p, pi) => {
                  const hPct = Math.max(20, (p.lengthFeet / maxLen) * 100);
                  // Width proportional: 36" panel should be visually wider than 16"
                  const wPx = Math.max(12, Math.min(48, Math.round(widthIn * 1.2)));
                  return (
                    <div key={p.id} className='group relative flex flex-col items-center justify-end' style={{ height: '100%' }}>
                      <div className='text-[8px] text-steel-500 mb-0.5 opacity-0 group-hover:opacity-100 transition'>{p.lengthFeet}&apos;</div>
                      <div
                        className='rounded-t-sm transition-all hover:brightness-125 cursor-default'
                        style={{ width: wPx + 'px', height: hPct + '%', backgroundColor: color + '90', borderLeft: '1px solid ' + color, borderTop: '1px solid ' + color }}
                        title={`Panel {pi+1}: {p.lengthFeet}' x {widthIn}"`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className='flex justify-between mt-1 text-[9px] text-steel-600'>
                <span>&larr; Eave</span>
                <span>Ridge &rarr;</span>
              </div>
            </div>
          );
        })}
        <div className='mt-2 text-[10px] text-steel-600 flex items-center gap-3'>
          <span>Narrower panels (14-16&quot;) = more panels per facet</span>
          <span>&bull;</span>
          <span>Wider panels (36&quot;) = fewer panels, faster install</span>
        </div>
      </div>

      {/* Detail table */}
      <table className='w-full text-sm'>
        <thead>
          <tr className='border-b border-steel-700/30 bg-surface-100'>
            <th className='text-left px-6 py-3 text-steel-500 text-xs font-semibold'>#</th>
            <th className='text-left px-6 py-3 text-steel-500 text-xs font-semibold'>Facet</th>
            <th className='text-left px-6 py-3 text-steel-500 text-xs font-semibold'>Panel</th>
            <th className='text-right px-6 py-3 text-steel-500 text-xs font-semibold'>Width</th>
            <th className='text-right px-6 py-3 text-steel-500 text-xs font-semibold'>Length</th>
            <th className='text-right px-6 py-3 text-steel-500 text-xs font-semibold'>Sq Ft</th>
          </tr>
        </thead>
        <tbody>
          {cutList.panels.map((panel, i) => (
            <tr key={panel.id} className='border-b border-steel-700/20 hover:bg-surface-200/40 transition'>
              <td className='px-6 py-2 text-steel-600 text-xs'>{i + 1}</td>
              <td className='px-6 py-2 text-steel-400 text-xs'>{panel.facetId}</td>
              <td className='px-6 py-2 font-medium text-steel-300 text-xs'>{spec.name}</td>
              <td className='px-6 py-2 text-right text-steel-400 text-xs'>{panel.widthInches}&quot;</td>
              <td className='px-6 py-2 text-right font-semibold text-amber-400 text-xs'>{panel.lengthFeet}&apos;</td>
              <td className='px-6 py-2 text-right text-steel-400 text-xs'>{((panel.lengthFeet * panel.widthInches) / 12).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}