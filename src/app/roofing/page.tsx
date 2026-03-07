'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { parseRoofReport, detectReportSource } from '@/lib/roofing/report-parser';
import { generateCutList } from '@/lib/roofing/cut-list-engine';
import { PANEL_SPECS } from '@/lib/roofing/panel-specs';
import { RoofModel, PanelProfile, ReportSource, CutList } from '@/types';
import RoofSketchCanvas from '@/components/roofing/RoofSketchCanvas';
import CutListTable from '@/components/roofing/CutListTable';
import TrimTable from '@/components/roofing/TrimTable';

export default function RoofingPage() {
  const {
    roofModels,
    cutLists,
    addRoofModel,
    addCutList,
    selectedPanelProfile,
    selectedGauge,
    setSelectedPanelProfile,
    setSelectedGauge,
  } = useAppStore();

  const [reportText, setReportText] = useState('');
  const [reportSource, setReportSource] = useState<ReportSource>('eagleview');
  const [projectName, setProjectName] = useState('');
  const [activeModel, setActiveModel] = useState<RoofModel | null>(null);
  const [activeCutList, setActiveCutList] = useState<CutList | null>(null);
  const [showImport, setShowImport] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleImportReport = useCallback(() => {
    if (!reportText.trim()) return;
    setUploadError('');

    const model = parseRoofReport(reportText, reportSource, projectName || undefined);
    addRoofModel(model);
    setActiveModel(model);
    setShowImport(false);
    setReportText('');
  }, [reportText, reportSource, projectName, addRoofModel]);

  const handleGenerateCutList = useCallback(() => {
    if (!activeModel) return;

    const cutList = generateCutList(activeModel, selectedPanelProfile, selectedGauge);
    addCutList(cutList);
    setActiveCutList(cutList);
  }, [activeModel, selectedPanelProfile, selectedGauge, addCutList]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploadError('');
      const fileName = file.name.replace(/\.\w+$/, '');
      setProjectName(fileName);

      // If it's a PDF, send to server-side parser
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setUploading(true);
        try {
          const formData = new FormData();
          formData.append('file', file);

          const res = await fetch('/api/parse-pdf', { method: 'POST', body: formData });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'PDF parsing failed');
          }

          const { text } = await res.json();
          if (!text || text.trim().length < 10) {
            throw new Error('PDF contained no extractable text. Try copy-pasting the report text instead.');
          }

          setReportText(text);

          // Auto-detect source from PDF content
          const detected = detectReportSource(text);
          if (detected !== 'manual') {
            setReportSource(detected);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to parse PDF';
          setUploadError(message);
        } finally {
          setUploading(false);
        }
      } else {
        // Plain text file
        const text = await file.text();
        setReportText(text);

        const detected = detectReportSource(text);
        if (detected !== 'manual') {
          setReportSource(detected);
        }
      }
    },
    []
  );

  return (
    <div className="min-h-screen bg-steel-50">
      {/* Header */}
      <header className="bg-white border-b border-steel-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-steel-400 hover:text-steel-600 transition">
              ← Back
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                </svg>
              </div>
              <h1 className="text-steel-800 font-bold text-lg">Metal Roofing Cut Lists</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left sidebar - Controls */}
          <div className="space-y-6">
            {/* Import Section */}
            {showImport ? (
              <div className="bg-white rounded-xl border border-steel-200 p-6 shadow-sm">
                <h2 className="text-steel-800 font-semibold text-lg mb-4">Import Roof Report</h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-steel-600 mb-1">
                      Project Name
                    </label>
                    <input
                      type="text"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g. Smith Residence"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-steel-600 mb-1">
                      Report Source
                    </label>
                    <select
                      value={reportSource}
                      onChange={(e) => setReportSource(e.target.value as ReportSource)}
                      className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="roofr">Roofr</option>
                      <option value="eagleview">EagleView</option>
                      <option value="gaf_quickmeasure">GAF QuickMeasure</option>
                      <option value="roofgraf">RoofGraf</option>
                      <option value="manual">Manual Entry</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-steel-600 mb-1">
                      Upload Report File (PDF, TXT)
                    </label>
                    <input
                      type="file"
                      accept=".txt,.csv,.pdf,.json,.xml"
                      onChange={handleFileUpload}
                      disabled={uploading}
                      className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                    />
                    {uploading && (
                      <p className="text-xs text-blue-600 mt-1 animate-pulse">
                        ⏳ Extracting text from PDF…
                      </p>
                    )}
                    {uploadError && (
                      <p className="text-xs text-red-600 mt-1">
                        ⚠ {uploadError}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-steel-600 mb-1">
                      Or paste report text
                    </label>
                    <textarea
                      value={reportText}
                      onChange={(e) => setReportText(e.target.value)}
                      rows={8}
                      className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={`Paste your ${reportSource === 'eagleview' ? 'EagleView' : reportSource === 'gaf_quickmeasure' ? 'GAF QuickMeasure' : 'RoofGraf'} report data here...\n\nExample:\nAddress: 123 Main St\nTotal Roof Area: 2,450 sq ft\nFacet 1: 800 sq ft, 6/12 pitch\nFacet 2: 650 sq ft, 6/12 pitch\nRidges: 35 ft\nEaves: 120 ft\nRakes: 65 ft`}
                    />
                  </div>

                  <button
                    onClick={handleImportReport}
                    disabled={!reportText.trim()}
                    className="w-full bg-blue-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Import &amp; Parse Report
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-steel-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-steel-800 font-semibold text-lg">Active Model</h2>
                  <button
                    onClick={() => setShowImport(true)}
                    className="text-blue-600 text-sm hover:underline"
                  >
                    Import New
                  </button>
                </div>
                {activeModel && (
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-steel-700">{activeModel.projectName}</p>
                    {activeModel.address && (
                      <p className="text-steel-500">{activeModel.address}</p>
                    )}
                    <p className="text-steel-500">
                      {activeModel.totalAreaSqFt.toLocaleString()} sq ft •{' '}
                      {activeModel.facets.length} facet(s)
                    </p>
                    <p className="text-steel-400 text-xs">
                      Source: {activeModel.source.replace(/_/g, ' ')}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Panel Selection */}
            <div className="bg-white rounded-xl border border-steel-200 p-6 shadow-sm">
              <h2 className="text-steel-800 font-semibold text-lg mb-4">Panel Selection</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-steel-600 mb-2">
                    Panel Profile
                  </label>
                  <div className="space-y-2">
                    {Object.values(PANEL_SPECS).map((spec) => (
                      <label
                        key={spec.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                          selectedPanelProfile === spec.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-steel-200 hover:border-steel-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="panel"
                          value={spec.id}
                          checked={selectedPanelProfile === spec.id}
                          onChange={(e) =>
                            setSelectedPanelProfile(e.target.value as PanelProfile)
                          }
                          className="text-blue-600"
                        />
                        <div>
                          <p className="text-sm font-medium text-steel-700">{spec.name}</p>
                          <p className="text-xs text-steel-500">
                            {spec.widthInches}&quot; coverage • up to {spec.maxLengthFeet}ft
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-steel-600 mb-1">
                    Gauge
                  </label>
                  <select
                    value={selectedGauge}
                    onChange={(e) => setSelectedGauge(parseInt(e.target.value, 10))}
                    className="w-full border border-steel-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={26}>26 Gauge</option>
                    <option value={24}>24 Gauge</option>
                    <option value={22}>22 Gauge</option>
                  </select>
                </div>

                <button
                  onClick={handleGenerateCutList}
                  disabled={!activeModel}
                  className="w-full bg-brand-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Generate Cut List
                </button>
              </div>
            </div>

            {/* Previous Models */}
            {roofModels.length > 0 && (
              <div className="bg-white rounded-xl border border-steel-200 p-6 shadow-sm">
                <h2 className="text-steel-800 font-semibold text-lg mb-4">Saved Models</h2>
                <div className="space-y-2">
                  {roofModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => {
                        setActiveModel(model);
                        setShowImport(false);
                        // Find matching cut list
                        const cl = cutLists.find((c) => c.roofModelId === model.id);
                        if (cl) setActiveCutList(cl);
                        else setActiveCutList(null);
                      }}
                      className={`w-full text-left p-3 rounded-lg border text-sm transition ${
                        activeModel?.id === model.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-steel-200 hover:border-steel-300'
                      }`}
                    >
                      <p className="font-medium text-steel-700">{model.projectName}</p>
                      <p className="text-steel-500 text-xs">
                        {model.totalAreaSqFt.toLocaleString()} sq ft •{' '}
                        {new Date(model.createdAt).toLocaleDateString()}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Main content area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Roof Sketch */}
            <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-steel-200">
                <h2 className="text-steel-800 font-semibold">
                  Roof Sketch
                  {activeCutList && ' — with Cut List Overlay'}
                </h2>
              </div>
              <div className="p-4">
                <RoofSketchCanvas
                  roofModel={activeModel}
                  cutList={activeCutList}
                />
              </div>
            </div>

            {/* Cut List Tables */}
            {activeCutList && (
              <>
                <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-steel-200 flex items-center justify-between">
                    <h2 className="text-steel-800 font-semibold">
                      Panel Cut List — {PANEL_SPECS[activeCutList.panelProfile].name}
                    </h2>
                    <span className="text-sm text-steel-500">
                      {activeCutList.panels.length} panels •{' '}
                      {Math.round(activeCutList.totalPanelSqFt).toLocaleString()} sq ft
                    </span>
                  </div>
                  <CutListTable cutList={activeCutList} />
                </div>

                <div className="bg-white rounded-xl border border-steel-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-steel-200">
                    <h2 className="text-steel-800 font-semibold">Trim &amp; Accessories</h2>
                  </div>
                  <TrimTable cutList={activeCutList} />
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
