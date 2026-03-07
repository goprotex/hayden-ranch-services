# Hayden Ranch Services

**Metal Roofing Cut Lists • Material Pricing • Fencing Bids**

A comprehensive business management app for [haydenranchservices.com](https://haydenranchservices.com) — built with Next.js and deployable to Vercel.

---

## 🏗️ Features

### 1. Metal Roofing Cut List Generator
- **Import Reports** from EagleView, GAF QuickMeasure, and RoofGraf
- **2D Roof Sketch** — interactive canvas showing facets, edges, and panel layout
- **Panel Options**: 6V Crimp, R-Panel, 16" Standing Seam Snap Lock, 14" Standing Seam Snap Lock
- **Gauge Selection**: 22, 24, or 26 gauge
- **Auto-Generated Cut Lists** with panel lengths, quantities, and positions
- **Trim Components**: Ridge cap, hip cap, valley flashing, eave drip, rake trim, sidewall/headwall flashing, J-channel, Z-flashing, closures
- **Fastener Calculations** per panel type
- **Visual Overlay** — see the cut list rendered on the roof sketch

### 2. Material Pricing from Receipts
- **Upload Receipts** — paste text or upload files from metal building suppliers
- **Smart Parsing** — extracts line items, quantities, prices, and categorizes automatically
- **Price Database** — builds a searchable database from all your receipts
- **Auto-Pricing** — match cut list items to your most recent supplier prices
- **Track Price History** over time by supplier

### 3. Fencing Bid Tool
- **Satellite Map Drawing** — draw fence lines directly over imagery (Mapbox)
- **Stay Tuff Options** — all major fixed knot and hinge joint models
- **Multiple Fence Types**: barbed wire, field fence, no-climb, pipe fence, and more
- **Height Options**: 4' through 8'
- **Auto-Calculate Materials**: corner posts, line posts, T-posts, bracing, wire rolls, clips, staples, concrete, tensioners
- **Soil & Terrain Analysis** — cross-reference with soil maps and elevation data
- **Difficulty Multipliers** — adjust labor estimates based on terrain
- **Complete Bid Generation** with labor and material totals

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ 
- [Git](https://git-scm.com/)
- A [GitHub](https://github.com/) account
- A [Vercel](https://vercel.com/) account (free tier works)

### 1. Install Dependencies

```bash
cd hayden-ranch-services
npm install
```

### 2. Set Up Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and add:
- `NEXT_PUBLIC_MAPBOX_TOKEN` — Get one free at [mapbox.com](https://account.mapbox.com/access-tokens/)

### 3. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📦 Deploy to GitHub + Vercel

### Step 1: Create GitHub Repository

```bash
cd hayden-ranch-services
git init
git add .
git commit -m "Initial commit - Hayden Ranch Services"
```

Go to [github.com/new](https://github.com/new) and create a new repo called `hayden-ranch-services`.

```bash
git remote add origin https://github.com/YOUR_USERNAME/hayden-ranch-services.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **"Import Git Repository"**
3. Select your `hayden-ranch-services` repo
4. Vercel auto-detects Next.js — click **"Deploy"**
5. Add your environment variables in Vercel dashboard → Settings → Environment Variables

### Step 3: Connect Your Domain

1. In Vercel dashboard → your project → **Settings** → **Domains**
2. Add `haydenranchservices.com`
3. Follow the DNS instructions to point your domain to Vercel

---

## 📁 Project Structure

```
hayden-ranch-services/
├── src/
│   ├── app/                        # Next.js App Router pages
│   │   ├── page.tsx                # Dashboard / home
│   │   ├── layout.tsx              # Root layout
│   │   ├── globals.css             # Global styles
│   │   ├── roofing/page.tsx        # Roofing cut list tool
│   │   ├── pricing/page.tsx        # Material pricing tool
│   │   └── fencing/page.tsx        # Fencing bid tool
│   ├── components/
│   │   └── roofing/
│   │       ├── RoofSketchCanvas.tsx # 2D roof visualization
│   │       ├── CutListTable.tsx     # Panel cut list display
│   │       └── TrimTable.tsx        # Trim & accessories display
│   ├── lib/
│   │   ├── store.ts                # Zustand state management
│   │   ├── roofing/
│   │   │   ├── panel-specs.ts      # Panel profile database
│   │   │   ├── cut-list-engine.ts  # Cut list calculation engine
│   │   │   └── report-parser.ts    # Report import parser
│   │   ├── pricing/
│   │   │   └── receipt-parser.ts   # Receipt text parser
│   │   └── fencing/
│   │       └── fence-calculator.ts # Fence material calculator
│   └── types/
│       └── index.ts                # TypeScript type definitions
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── next.config.js
└── .env.example
```

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| State | Zustand (persisted to localStorage) |
| Maps | Mapbox GL JS |
| Canvas | HTML5 Canvas (roof sketches) |
| Receipt OCR | Tesseract.js (planned) |
| PDF Parsing | pdf-parse |
| Deployment | Vercel |

---

## 🗺️ Roadmap

- [ ] PDF report import (parse EagleView PDFs directly)
- [ ] Receipt image OCR with Tesseract.js
- [ ] Full Mapbox satellite map integration for fencing
- [ ] Soil map overlay (USDA Web Soil Survey API)
- [ ] Elevation profile from Mapbox terrain
- [ ] PDF bid/invoice export
- [ ] AI-powered report parsing with Claude
- [ ] Customer management / CRM features
- [ ] Mobile-friendly field input mode

---

## 📝 License

Private — © 2026 Hayden Ranch Services
