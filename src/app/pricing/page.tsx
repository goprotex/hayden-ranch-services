'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { parseReceiptText, receiptToPriceEntries } from '@/lib/pricing/receipt-parser';
import { Receipt, PriceEntry, ReceiptItem } from '@/types';

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export default function PricingPage() {
  const { receipts, priceDatabase, addReceipt, addPriceEntries } = useAppStore();
  const [receiptText, setReceiptText] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadError, setUploadError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      // Override supplier if user typed one
      if (supplierName.trim()) {
        receipt.supplier = supplierName.trim();
      }

      addReceipt(receipt);
      const entries = receiptToPriceEntries(receipt);
      addPriceEntries(entries);
      setActiveReceipt(receipt);
      setSupplierName('');
    },
    [supplierName, addReceipt, addPriceEntries]
  );

  const handleParseReceipt = useCallback(async () => {
    if (!receiptText.trim()) return;

    setUploadStatus('processing');
    setUploadError('');

    try {
      // Try AI-powered parsing first via the API
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
    } catch {
      // AI unavailable — fall through to regex parser
    }

    // Fallback: regex-based parsing
    const receipt = parseReceiptText(receiptText, supplierName || undefined);
    addReceipt(receipt);
    const entries = receiptToPriceEntries(receipt);
    addPriceEntries(entries);
    setActiveReceipt(receipt);
    setReceiptText('');
    setSupplierName('');
    setUploadStatus('done');
    setTimeout(() => setUploadStatus('idle'), 2000);
  }, [receiptText, supplierName, addReceipt, addPriceEntries, processAIResult]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      // Show preview for images
      if (isImage) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      } else {
        setPreviewUrl(null);
      }

      if (isImage || isPdf) {
        // Use AI parsing for images and PDFs
        setUploadStatus('uploading');
        setUploadError('');

        try {
          const formData = new FormData();
          formData.append('file', file);

          setUploadStatus('processing');
          const res = await fetch('/api/parse-receipt', {
            method: 'POST',
            body: formData,
          });

          const data = await res.json();

          if (!res.ok || data.error) {
            throw new Error(data.error || 'Failed to parse receipt');
          }

          processAIResult(data);
          setUploadStatus('done');
          setTimeout(() => {
            setUploadStatus('idle');
            setPreviewUrl(null);
          }, 3000);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Upload failed';
          setUploadError(msg);
          setUploadStatus('error');
        }
      } else {
        // Text/CSV — read as text and populate textarea
        const text = await file.text();
        setReceiptText(text);
        setUploadStatus('idle');
      }

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [processAIResult]
  );

  // Group prices by category
  const pricesByCategory = priceDatabase.reduce(
    (acc, entry) => {
      if (!acc[entry.category]) acc[entry.category] = [];
      acc[entry.category].push(entry);
      return acc;
    },
    {} as Record<string, PriceEntry[]>
  );

  return (
    <div className="min-h-screen bg-steel-50">
      <header className="bg-white border-b border-steel-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-steel-400 hover:text-steel-600 transition">
              ← Back
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <h1 className="text-steel-800 font-bold text-lg">Material Pricing</h1>
            </div>
          </div>
          <span className="text-sm text-steel-500">
            {priceDatabase.length} prices from {receipts.length} receipts
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left - Upload */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-steel-200 p-6 shadow-sm">
              <h2 className="text-steel-800 font-semibold text-lg mb-4">Upload Receipt</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-steel-600 mb-1">
                    Supplier Name (optional)
                  </label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="e.g. Mueller, Metal Mart..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-steel-600 mb-1">
                    Upload Receipt (Image, PDF, or Text)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.csv,.pdf,.jpg,.jpeg,.png,.webp,.heic,.bmp,.tiff"
                    onChange={handleFileUpload}
                    title="Upload a receipt file"
                    className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                    disabled={uploadStatus === 'uploading' || uploadStatus === 'processing'}
                  />
                  <p className="text-xs text-steel-400 mt-1">
                    📸 Photo scans, PDFs, text files — AI reads them all
                  </p>

                  {/* Upload status indicator */}
                  {uploadStatus === 'uploading' && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-blue-600">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Uploading file...
                    </div>
                  )}
                  {uploadStatus === 'processing' && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-amber-600">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      🤖 AI is reading your receipt...
                    </div>
                  )}
                  {uploadStatus === 'done' && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      ✅ Receipt parsed successfully!
                    </div>
                  )}
                  {uploadStatus === 'error' && (
                    <div className="mt-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg">
                      ❌ {uploadError}
                    </div>
                  )}

                  {/* Image preview */}
                  {previewUrl && (
                    <div className="mt-3 border border-steel-200 rounded-lg overflow-hidden">
                      <img
                        src={previewUrl}
                        alt="Receipt preview"
                        className="w-full max-h-48 object-contain bg-steel-50"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-steel-600 mb-1">
                    Or paste receipt text
                  </label>
                  <textarea
                    value={receiptText}
                    onChange={(e) => setReceiptText(e.target.value)}
                    rows={10}
                    className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder={`Paste your receipt text here...\n\nExample:\nMetal Mart\n03/15/2026\n10  29ga R-Panel 16' Galvalume  $18.50  $185.00\n4   Ridge Cap 10.5'              $12.00  $48.00\n2   Box Screws #10 x 1.5"       $45.00  $90.00\nSubtotal: $323.00\nTax: $26.35\nTotal: $349.35`}
                  />
                </div>

                <button
                  onClick={handleParseReceipt}
                  disabled={!receiptText.trim() || uploadStatus === 'processing'}
                  className="w-full bg-green-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {uploadStatus === 'processing' ? '🤖 AI Parsing...' : 'Parse Receipt'}
                </button>
              </div>
            </div>

            {/* Recent receipts */}
            {receipts.length > 0 && (
              <div className="bg-white rounded-xl border border-steel-200 p-6 shadow-sm">
                <h2 className="text-steel-800 font-semibold text-lg mb-4">Recent Receipts</h2>
                <div className="space-y-2">
                  {receipts.slice(-10).reverse().map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setActiveReceipt(r)}
                      className={`w-full text-left p-3 rounded-lg border text-sm transition ${
                        activeReceipt?.id === r.id
                          ? 'border-green-500 bg-green-50'
                          : 'border-steel-200 hover:border-steel-300'
                      }`}
                    >
                      <p className="font-medium text-steel-700">{r.supplier}</p>
                      <p className="text-steel-500 text-xs">
                        {r.date} • ${r.total.toFixed(2)} • {r.items.length} items
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right - Price Database */}
          <div className="lg:col-span-2 space-y-6">
            {/* Active receipt detail */}
            {activeReceipt && (
              <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-steel-200 flex justify-between items-center">
                  <div>
                    <h2 className="text-steel-800 font-semibold">{activeReceipt.supplier}</h2>
                    <p className="text-sm text-steel-500">{activeReceipt.date}</p>
                  </div>
                  <p className="text-lg font-bold text-green-600">${activeReceipt.total.toFixed(2)}</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-steel-200 bg-steel-50">
                      <th className="text-left px-6 py-3 text-steel-600 font-medium">Item</th>
                      <th className="text-right px-6 py-3 text-steel-600 font-medium">Qty</th>
                      <th className="text-right px-6 py-3 text-steel-600 font-medium">Unit Price</th>
                      <th className="text-right px-6 py-3 text-steel-600 font-medium">Total</th>
                      <th className="text-left px-6 py-3 text-steel-600 font-medium">Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeReceipt.items.map((item, i) => (
                      <tr key={i} className="border-b border-steel-100 hover:bg-steel-50">
                        <td className="px-6 py-2 text-steel-700">{item.description}</td>
                        <td className="px-6 py-2 text-right text-steel-600">{item.quantity}</td>
                        <td className="px-6 py-2 text-right text-steel-600">${item.unitPrice.toFixed(2)}</td>
                        <td className="px-6 py-2 text-right font-medium text-green-600">${item.totalPrice.toFixed(2)}</td>
                        <td className="px-6 py-2">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-steel-100 text-steel-600">
                            {item.category.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Full price database */}
            <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-steel-200">
                <h2 className="text-steel-800 font-semibold">Price Database</h2>
                <p className="text-sm text-steel-500 mt-1">
                  All prices extracted from your uploaded receipts
                </p>
              </div>

              {Object.keys(pricesByCategory).length === 0 ? (
                <div className="px-6 py-12 text-center text-steel-400">
                  <p>No prices yet. Upload a receipt to get started.</p>
                </div>
              ) : (
                Object.entries(pricesByCategory).map(([category, entries]) => (
                  <div key={category}>
                    <div className="px-6 py-2 bg-steel-50 border-b border-steel-200">
                      <p className="text-xs font-semibold text-steel-600 uppercase tracking-wide">
                        {category.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {entries.map((entry) => (
                          <tr key={entry.id} className="border-b border-steel-100 hover:bg-steel-50">
                            <td className="px-6 py-2 text-steel-700">{entry.description}</td>
                            <td className="px-6 py-2 text-right font-medium text-green-600">
                              ${entry.unitPrice.toFixed(2)}/{entry.unit}
                            </td>
                            <td className="px-6 py-2 text-right text-steel-500 text-xs">
                              {entry.supplier} • {entry.date}
                            </td>
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
