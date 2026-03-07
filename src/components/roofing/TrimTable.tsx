'use client';

import { CutList } from '@/types';

interface Props {
  cutList: CutList;
}

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
      {/* Trim pieces */}
      {cutList.trim.length > 0 && (
        <div>
          <div className="px-6 py-3 bg-steel-50 border-b border-steel-200">
            <p className="text-xs font-semibold text-steel-600 uppercase tracking-wide">
              Trim Components
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-steel-200">
                <th className="text-left px-6 py-3 text-steel-600 font-medium">Trim Type</th>
                <th className="text-right px-6 py-3 text-steel-600 font-medium">Pieces</th>
                <th className="text-right px-6 py-3 text-steel-600 font-medium">Length Each</th>
                <th className="text-right px-6 py-3 text-steel-600 font-medium">Total LF</th>
              </tr>
            </thead>
            <tbody>
              {cutList.trim.map((piece) => (
                <tr key={piece.id} className="border-b border-steel-100 hover:bg-steel-50">
                  <td className="px-6 py-2 font-medium text-steel-700">
                    {TRIM_LABELS[piece.type] || piece.type}
                  </td>
                  <td className="px-6 py-2 text-right text-steel-600">{piece.quantity}</td>
                  <td className="px-6 py-2 text-right text-steel-600">
                    {piece.lengthFeet}&apos;
                  </td>
                  <td className="px-6 py-2 text-right font-medium text-indigo-600">
                    {(piece.quantity * piece.lengthFeet).toFixed(1)}&apos;
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Fasteners */}
      {cutList.fasteners.length > 0 && (
        <div>
          <div className="px-6 py-3 bg-steel-50 border-b border-steel-200">
            <p className="text-xs font-semibold text-steel-600 uppercase tracking-wide">
              Fasteners
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-steel-200">
                <th className="text-left px-6 py-3 text-steel-600 font-medium">Type</th>
                <th className="text-left px-6 py-3 text-steel-600 font-medium">Size</th>
                <th className="text-right px-6 py-3 text-steel-600 font-medium">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {cutList.fasteners.map((f, i) => (
                <tr key={i} className="border-b border-steel-100 hover:bg-steel-50">
                  <td className="px-6 py-2 font-medium text-steel-700">{f.type}</td>
                  <td className="px-6 py-2 text-steel-600">{f.size}</td>
                  <td className="px-6 py-2 text-right font-medium text-indigo-600">
                    {f.quantity.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Accessories */}
      {cutList.accessories.length > 0 && (
        <div>
          <div className="px-6 py-3 bg-steel-50 border-b border-steel-200">
            <p className="text-xs font-semibold text-steel-600 uppercase tracking-wide">
              Accessories &amp; Supplies
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-steel-200">
                <th className="text-left px-6 py-3 text-steel-600 font-medium">Item</th>
                <th className="text-right px-6 py-3 text-steel-600 font-medium">Quantity</th>
                <th className="text-right px-6 py-3 text-steel-600 font-medium">Unit</th>
              </tr>
            </thead>
            <tbody>
              {cutList.accessories.map((acc, i) => (
                <tr key={i} className="border-b border-steel-100 hover:bg-steel-50">
                  <td className="px-6 py-2 font-medium text-steel-700">{acc.name}</td>
                  <td className="px-6 py-2 text-right text-steel-600">{acc.quantity}</td>
                  <td className="px-6 py-2 text-right text-steel-500">{acc.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
