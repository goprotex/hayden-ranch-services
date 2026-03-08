'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { parseReceiptText, receiptToPriceEntries } from '@/lib/pricing/receipt-parser';
import { Receipt, PriceEntry, ReceiptItem } from '@/types';

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export default function PricingPage() {
  const { receipts, priceDatabase, addReceipt, addPriceEntries, syncReceiptPrices, materialPrices, loadSharedPrices, saveSharedPricesToServer } = useAppStore();
  const [receiptText, setReceiptText] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadError, setUploadError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [syncResult, setSyncResult] = useState<{ matched: number; updated: number } | null>(null);

  // Load shared prices from server on mount
  useEffect(() => {
    loadSharedPrices();
  }, [loadSharedPrices]);

  const processAIResult = useCallback(
    (data: Record<string, unknown>) => {
      const receipt: Receipt = {
        id: crypto.randomUUID(),
        supplier: (data.supplier as string) || supplierName || 'Unknown',
        date: (data.date as string) || new Date().toISOString().split('T')[0],
        items: Array.isArray(data.items)
          ? (data.items as Record<string, unknown>[]).map((item) => ({
              description: String(item.description || ''),
              sku: item.sku ? String(item.sku) : undefined,
              quantity: Number(item.quantity) || 1,
              unit: String(item.unit || 'each'),
              unitPrice: Number(item.unitPrice) || 0,
              totalPrice: Number(item.totalPrice) || 0,
              category: String(item.category || 'other'),
            })) as ReceiptItem[]
          : [],
        subtotal: Number(data.subtotal) || 0,
        tax: Number(data.tax) || 0,
        total: Number(data.total) || 0,
        rawText: JSON.stringify(data, null, 2),
      };
      if (supplierName.trim()) receipt.supplier = supplierName.trim();
      addReceipt(receipt);
      const entries = receiptToPriceEntries(receipt);
      addPriceEntries(entries);
      // Auto-sync receipt prices to fencing material prices
      const result = syncReceiptPrices();
      setSyncResult(result);
      // Persist updated prices to server for all users
      if (result.updated > 0) saveSharedPricesToServer();
      setActiveReceipt(receipt);
      setSupplierName('');
    },
    [supplierName, addReceipt, addPriceEntries, syncReceiptPrices, saveSharedPricesToServer]
  );

  const handleParseReceipt = useCallback(async () => {
    if (!receiptText.trim()) return;
    setUploadStatus('processing');
    setUploadError('');
    try {
      const res = await fetch('/api/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: receiptText }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.error) {
          processAIResult(data);
          setReceiptText('');
          setUploadStatus('done');
          setTimeout(() => setUploadStatus('idle'), 2000);
          return;
        }
      }
    } catch { /* fallthrough */ }
    const receipt = parseReceiptText(receiptText, supplierName || undefined);
    addReceipt(receipt);
    const entries = receiptToPriceEntries(receipt);
    addPriceEntries(entries);
    // Auto-sync receipt prices to fencing material prices
    const result = syncReceiptPrices();
    setSyncResult(result);
    // Persist updated prices to server for all users
    if (result.updated > 0) saveSharedPricesToServer();
    setActiveReceipt(receipt);
    setReceiptText('');
    setSupplierName('');
    setUploadStatus('done');
    setTimeout(() => setUploadStatus('idle'), 2000);
  }, [receiptText, supplierName, addReceipt, addPriceEntries, processAIResult, syncReceiptPrices, saveSharedPricesToServer]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isImage) { setPreviewUrl(URL.createObjectURL(file)); } else { setPreviewUrl(null); }
      if (isImage || isPdf) {
        setUploadStatus('uploading');
        setUploadError('');
        try {
          const formData = new FormData();
          formData.append('file', file);
          setUploadStatus('processing');
          const res = await fetch('/api/parse-receipt', { method: 'POST', body: formData });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || 'Failed to parse receipt');
          processAIResult(data);
          setUploadStatus('done');
          setTimeout(() => { setUploadStatus('idle'); setPreviewUrl(null); }, 3000);
        } catch (err: unknown) {
          setUploadError(err instanceof Error ? err.message : 'Upload failed');
          setUploadStatus('error');
        }
      } else {
        const text = await file.text();
        setReceiptText(text);
        setUploadStatus('idle');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [processAIResult]
  );

  const pricesByCategory = priceDatabase.reduce((acc, entry) => {
    if (!acc[entry.category]) acc[entry.category] = [];
    acc[entry.category].push(entry);
    return acc;
  }, {} as Record<string, PriceEntry[]>);

  return (
    <div className="min-h-screen bg-surface-400 bg-mesh">
      <header className="glass border-b border-steel-700/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-steel-400 hover:text-amber-400 transition text-sm">\u2190 Back</Link>
            <h1 className="text-steel-100 font-bold text-lg">\ud83d\udcb0 Material Pricing</h1>
          </div>
          <span className="text-sm text-steel-500">
            {priceDatabase.length} prices from {receipts.length} receipts
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Sync notification banner */}
        {syncResult && (
          <div className="mb-6 bg-gradient-to-r from-emerald-900/30 to-teal-900/30 border border-emerald-700/40 rounded-xl p-4 flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-3">
              <span className="text-2xl">&#x1f517;</span>
              <div>
                <p className="text-sm font-bold text-emerald-300">
                  Receipt prices synced to fencing materials
                </p>
                <p className="text-xs text-emerald-400/70">
                  {syncResult.matched} items matched &bull; {syncResult.updated} prices updated
                </p>
              </div>
            </div>
            <button onClick={() => setSyncResult(null)} className="text-emerald-400/50 hover:text-emerald-300 text-lg">&times;</button>
          </div>
        )}

        {/* Manual sync button when receipts exist but haven't been synced */}
        {priceDatabase.length > 0 && !syncResult && (
          <div className="mb-6 bg-surface-300 border border-steel-700/30 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">&#x1f4cb;</span>
              <p className="text-xs text-steel-400">
                {priceDatabase.length} receipt prices available &mdash; sync them to your fencing material prices for accurate bids.
              </p>
            </div>
            <button onClick={() => {
              const result = syncReceiptPrices();
              setSyncResult(result);
              if (result.updated > 0) saveSharedPricesToServer();
            }} className="text-xs bg-amber-600/20 text-amber-400 px-4 py-2 rounded-lg font-semibold hover:bg-amber-600/30 transition whitespace-nowrap">
              &#x26a1; Sync to Fencing Prices
            </button>
          </div>
        )}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Upload Panel */}
          <div className="space-y-6 animate-slide-in-left">
            <div className="card-dark p-6">
              <h2 className="text-steel-200 font-semibold text-lg mb-4">Upload Receipt</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-steel-400 mb-1">Supplier Name (optional)</label>
                  <input type="text" value={supplierName} onChange={(e) => setSupplierName(e.target.value)}
                    className="w-full bg-surface-200 border border-steel-700/30 rounded-lg px-3 py-2 text-sm text-steel-200 placeholder-steel-500 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                    placeholder="e.g. Mueller, Metal Mart..." />
                </div>

                <div>
                  <label className="block text-sm font-medium text-steel-400 mb-1">Upload Receipt (Image, PDF, or Text)</label>
                  <input ref={fileInputRef} type="file" accept=".txt,.csv,.pdf,.jpg,.jpeg,.png,.webp,.heic,.bmp,.tiff"
                    onChange={handleFileUpload} title="Upload a receipt file"
                    className="w-full text-sm text-steel-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-amber-600/20 file:text-amber-400 hover:file:bg-amber-600/30"
                    disabled={uploadStatus === 'uploading' || uploadStatus === 'processing'} />
                  <p className="text-xs text-steel-500 mt-1">\ud83d\udcf8 Photo scans, PDFs, text files \u2014 AI reads them all</p>

                  {uploadStatus === 'uploading' && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-blue-400">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Uploading file...
                    </div>
                  )}
                  {uploadStatus === 'processing' && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-amber-400">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      \ud83e\udd16 AI is reading your receipt...
                    </div>
                  )}
                  {uploadStatus === 'done' && <div className="mt-3 flex items-center gap-2 text-sm text-emerald-400">\u2705 Receipt parsed successfully!</div>}
                  {uploadStatus === 'error' && <div className="mt-3 text-sm text-red-400 bg-red-950/30 p-2 rounded-lg">\u274c {uploadError}</div>}
                  {previewUrl && (
                    <div className="mt-3 border border-steel-700/30 rounded-lg overflow-hidden">
                      <img src={previewUrl} alt="Receipt preview" className="w-full max-h-48 object-contain bg-surface-100" />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-steel-400 mb-1">Or paste receipt text</label>
                  <textarea value={receiptText} onChange={(e) => setReceiptText(e.target.value)} rows={10}
                    className="w-full bg-surface-200 border border-steel-700/30 rounded-lg px-3 py-2 text-sm font-mono text-steel-200 placeholder-steel-500 focus:ring-2 focus:ring-amber-500/50"
                    placeholder="Paste your receipt text here..." />
                </div>

                <button onClick={handleParseReceipt}
                  disabled={!receiptText.trim() || uploadStatus === 'processing'}
                  className="w-full bg-gradient-to-r from-amber-600 to-orange-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-amber-900/30">
                  {uploadStatus === 'processing' ? '\ud83e\udd16 AI Parsing...' : 'Parse Receipt'}
                </button>
              </div>
            </div>

            {receipts.length > 0 && (
              <div className="card-dark p-6">
                <h2 className="text-steel-200 font-semibold text-lg mb-4">Recent Receipts</h2>
                <div className="space-y-2">
                  {receipts.slice(-10).reverse().map((r) => (
                    <button key={r.id} onClick={() => setActiveReceipt(r)}
                      className={`w-full text-left p-3 rounded-lg border text-sm transition ${
                        activeReceipt?.id === r.id
                          ? 'border-amber-500/50 bg-amber-900/20'
                          : 'border-steel-700/30 hover:border-steel-600/50 bg-surface-200/50'
                      }`}>
                      <p className="font-medium text-steel-200">{r.supplier}</p>
                      <p className="text-steel-500 text-xs">
                        {r.date} \u2022 ${r.total.toFixed(2)} \u2022 {r.items.length} items
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Price Database */}
          <div className="lg:col-span-2 space-y-6 animate-fade-in">
            {activeReceipt && (
              <div className="card-dark overflow-hidden">
                <div className="px-6 py-4 border-b border-steel-700/20 flex justify-between items-center">
                  <div>
                    <h2 className="text-steel-200 font-semibold">{activeReceipt.supplier}</h2>
                    <p className="text-sm text-steel-500">{activeReceipt.date}</p>
                  </div>
                  <p className="text-lg font-bold text-amber-400">${activeReceipt.total.toFixed(2)}</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-steel-700/20 bg-surface-100">
                      <th className="text-left px-6 py-3 text-steel-400 font-medium">Item</th>
                      <th className="text-right px-6 py-3 text-steel-400 font-medium">Qty</th>
                      <th className="text-right px-6 py-3 text-steel-400 font-medium">Unit Price</th>
                      <th className="text-right px-6 py-3 text-steel-400 font-medium">Total</th>
                      <th className="text-left px-6 py-3 text-steel-400 font-medium">Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeReceipt.items.map((item, i) => (
                      <tr key={i} className="border-b border-steel-700/10 hover:bg-surface-100/50">
                        <td className="px-6 py-2 text-steel-300">{item.description}</td>
                        <td className="px-6 py-2 text-right text-steel-400">{item.quantity}</td>
                        <td className="px-6 py-2 text-right text-steel-400">${item.unitPrice.toFixed(2)}</td>
                        <td className="px-6 py-2 text-right font-medium text-amber-400">${item.totalPrice.toFixed(2)}</td>
                        <td className="px-6 py-2">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-surface-200 text-steel-400">
                            {item.category.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="card-dark overflow-hidden">
              <div className="px-6 py-4 border-b border-steel-700/20">
                <h2 className="text-steel-200 font-semibold">Price Database</h2>
                <p className="text-sm text-steel-500 mt-1">All prices extracted from your uploaded receipts</p>
              </div>
              {Object.keys(pricesByCategory).length === 0 ? (
                <div className="px-6 py-12 text-center text-steel-500">
                  <p className="text-3xl mb-3">\ud83d\udcb3</p>
                  <p>No prices yet. Upload a receipt to get started.</p>
                </div>
              ) : (
                Object.entries(pricesByCategory).map(([category, entries]) => (
                  <div key={category}>
                    <div className="px-6 py-2 bg-surface-100 border-b border-steel-700/20">
                      <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">{category.replace(/_/g, ' ')}</p>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {entries.map((entry) => (
                          <tr key={entry.id} className="border-b border-steel-700/10 hover:bg-surface-100/50">
                            <td className="px-6 py-2 text-steel-300">{entry.description}</td>
                            <td className="px-6 py-2 text-right font-medium text-amber-400">${entry.unitPrice.toFixed(2)}/{entry.unit}</td>
                            <td className="px-6 py-2 text-right text-steel-500 text-xs">{entry.supplier} \u2022 {entry.date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
