'use client';

import { CutList } from '@/types';

interface Props { cutList: CutList; }

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

export default function TrimTable({ cutList }: Props) {
  return (
    <div>
      {cutList.trim.length > 0 && (
        <div>
          <div className='px-6 py-3 bg-surface-100 border-b border-steel-700/30'>
            <p className='text-[10px] font-bold text-steel-500 uppercase tracking-wider'>Trim Components</p>
          </div>
          <table className='w-full text-sm'>
            <thead>
              <tr className='border-b border-steel-700/30 bg-surface-100'>
                <th className='text-left px-6 py-3 text-steel-500 text-xs font-semibold'>Trim Type</th>
                <th className='text-right px-6 py-3 text-steel-500 text-xs font-semibold'>Pieces</th>
                <th className='text-right px-6 py-3 text-steel-500 text-xs font-semibold'>Length Each</th>
                <th className='text-right px-6 py-3 text-steel-500 text-xs font-semibold'>Total LF</th>
              </tr>
            </thead>
            <tbody>
              {cutList.trim.map(piece => (
                <tr key={piece.id} className='border-b border-steel-700/20 hover:bg-surface-200/40 transition'>
                  <td className='px-6 py-2 font-medium text-steel-300 text-xs'>{TRIM_LABELS[piece.type] || piece.type}</td>
                  <td className='px-6 py-2 text-right text-steel-400 text-xs'>{piece.quantity}</td>
                  <td className='px-6 py-2 text-right text-steel-400 text-xs'>{piece.lengthFeet}&apos;</td>
                  <td className='px-6 py-2 text-right font-semibold text-amber-400 text-xs'>{(piece.quantity * piece.lengthFeet).toFixed(1)}&apos;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cutList.fasteners.length > 0 && (
        <div>
          <div className='px-6 py-3 bg-surface-100 border-b border-steel-700/30'>
            <p className='text-[10px] font-bold text-steel-500 uppercase tracking-wider'>Fasteners</p>
          </div>
          <table className='w-full text-sm'>
            <thead>
              <tr className='border-b border-steel-700/30 bg-surface-100'>
                <th className='text-left px-6 py-3 text-steel-500 text-xs font-semibold'>Type</th>
                <th className='text-left px-6 py-3 text-steel-500 text-xs font-semibold'>Size</th>
                <th className='text-right px-6 py-3 text-steel-500 text-xs font-semibold'>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {cutList.fasteners.map((f, i) => (
                <tr key={i} className='border-b border-steel-700/20 hover:bg-surface-200/40 transition'>
                  <td className='px-6 py-2 font-medium text-steel-300 text-xs'>{f.type}</td>
                  <td className='px-6 py-2 text-steel-400 text-xs'>{f.size}</td>
                  <td className='px-6 py-2 text-right font-semibold text-amber-400 text-xs'>{f.quantity.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cutList.accessories.length > 0 && (
        <div>
          <div className='px-6 py-3 bg-surface-100 border-b border-steel-700/30'>
            <p className='text-[10px] font-bold text-steel-500 uppercase tracking-wider'>Accessories &amp; Supplies</p>
          </div>
          <table className='w-full text-sm'>
            <thead>
              <tr className='border-b border-steel-700/30 bg-surface-100'>
                <th className='text-left px-6 py-3 text-steel-500 text-xs font-semibold'>Item</th>
                <th className='text-right px-6 py-3 text-steel-500 text-xs font-semibold'>Quantity</th>
                <th className='text-right px-6 py-3 text-steel-500 text-xs font-semibold'>Unit</th>
              </tr>
            </thead>
            <tbody>
              {cutList.accessories.map((acc, i) => (
                <tr key={i} className='border-b border-steel-700/20 hover:bg-surface-200/40 transition'>
                  <td className='px-6 py-2 font-medium text-steel-300 text-xs'>{acc.name}</td>
                  <td className='px-6 py-2 text-right text-steel-400 text-xs'>{acc.quantity}</td>
                  <td className='px-6 py-2 text-right text-steel-500 text-xs'>{acc.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}