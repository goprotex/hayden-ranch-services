// ============================================================
// ROOFING TYPES
// ============================================================

/** Supported roof measurement report sources */
export type ReportSource = 'eagleview' | 'gaf_quickmeasure' | 'roofgraf' | 'roofr' | 'manual';

/** Metal panel profile types */
export type PanelProfile =
  | '6v_crimp'
  | 'r_panel'
  | 'standing_seam_snap_lock_16'
  | 'standing_seam_snap_lock_14';

/** Panel profile details */
export interface PanelSpec {
  id: PanelProfile;
  name: string;
  widthInches: number;        // coverage width
  minLengthFeet: number;
  maxLengthFeet: number;
  overlapInches: number;
  ribHeightInches: number;
  gaugeOptions: number[];     // e.g. [26, 24, 22]
}

/** A single roof facet / plane */
export interface RoofFacet {
  id: string;
  label: string;
  vertices: Point2D[];        // outline polygon
  pitchRatio: string;         // e.g. "6/12"
  pitchDegrees: number;
  areaSquareFeet: number;
  slopeAreaSquareFeet: number;
  edgeTypes: FacetEdge[];
}

export interface Point2D {
  x: number;
  y: number;
}

export interface FacetEdge {
  id: string;
  start: Point2D;
  end: Point2D;
  lengthFeet: number;
  type: EdgeType;
}

export type EdgeType =
  | 'ridge'
  | 'hip'
  | 'valley'
  | 'eave'
  | 'rake'
  | 'sidewall'
  | 'headwall'
  | 'drip_edge'
  | 'transition';

/** Full roof model parsed from a report */
export interface RoofModel {
  id: string;
  projectName: string;
  address: string;
  source: ReportSource;
  totalAreaSqFt: number;
  facets: RoofFacet[];
  createdAt: string;
}

/** A single panel cut */
export interface PanelCut {
  id: string;
  facetId: string;
  panelProfile: PanelProfile;
  lengthFeet: number;
  widthInches: number;
  position: {
    x: number;
    y: number;
    rotation: number;         // degrees
  };
  notes?: string;
}

/** Trim piece types */
export type TrimType =
  | 'ridge_cap'
  | 'hip_cap'
  | 'valley_flashing'
  | 'eave_drip'
  | 'rake_trim'
  | 'sidewall_flashing'
  | 'headwall_flashing'
  | 'transition_flashing'
  | 'j_channel'
  | 'z_flashing'
  | 'gable_trim'
  | 'peak_box'
  | 'endwall_flashing'
  | 'inside_closure'
  | 'outside_closure';

export interface TrimPiece {
  id: string;
  type: TrimType;
  lengthFeet: number;
  quantity: number;
  edgeId: string;             // which edge this applies to
  notes?: string;
}

/** Complete cut list for a project */
export interface CutList {
  id: string;
  roofModelId: string;
  panelProfile: PanelProfile;
  gauge: number;
  panels: PanelCut[];
  trim: TrimPiece[];
  fasteners: FastenerRequirement[];
  accessories: Accessory[];
  wasteFactor: number;        // percentage
  totalPanelSqFt: number;
  totalWasteSqFt: number;
}

export interface FastenerRequirement {
  type: string;
  size: string;
  quantity: number;
  perSquare: number;          // per 100 sqft
}

export interface Accessory {
  name: string;
  quantity: number;
  unit: string;
}

// ============================================================
// PRICING TYPES
// ============================================================

export interface Receipt {
  id: string;
  supplier: string;
  date: string;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  total: number;
  imageUrl?: string;
  rawText?: string;
}

export interface ReceiptItem {
  description: string;
  sku?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  category: MaterialCategory;
}

export type MaterialCategory =
  | 'panel'
  | 'trim'
  | 'fastener'
  | 'sealant'
  | 'underlayment'
  | 'closure'
  | 'flashing'
  | 'accessory'
  | 'fence_wire'
  | 'fence_post'
  | 'fence_hardware'
  | 'other';

export interface PriceEntry {
  id: string;
  description: string;
  sku?: string;
  category: MaterialCategory;
  unitPrice: number;
  unit: string;
  supplier: string;
  date: string;
  receiptId: string;
}

export interface MaterialEstimate {
  items: MaterialEstimateItem[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  generatedAt: string;
}

export interface MaterialEstimateItem {
  description: string;
  category: MaterialCategory;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  priceSource: string;        // which receipt/date the price came from
  confidence: 'exact' | 'similar' | 'estimated';
}

// ============================================================
// FENCING TYPES
// ============================================================

export type FenceType =
  | 'stay_tuff_fixed_knot'
  | 'stay_tuff_hinge_joint'
  | 'field_fence'
  | 'barbed_wire'
  | 'no_climb'
  | 'pipe_fence'
  | 't_post_wire'
  | 'custom';

export type FenceHeight = '4ft' | '5ft' | '6ft' | '7ft' | '8ft';

export interface StayTuffProduct {
  model: string;              // e.g. "2096-6-330"
  height: number;
  horizontalWires: number;
  verticalSpacing: number;
  description: string;
}

/** Fence vertex / point types for map interaction */
export type FencePointType = 'line_post' | 'h_brace' | 'n_brace' | 'corner_brace' | 'double_h' | 'kicker' | 'gate' | 'water_gap';

export interface GeoPoint {
  lat: number;
  lng: number;
  elevation?: number;         // feet above sea level
}

export interface FenceLine {
  id: string;
  points: GeoPoint[];
  totalLengthFeet: number;
  segments: FenceSegment[];
}

export interface FenceSegment {
  id: string;
  start: GeoPoint;
  end: GeoPoint;
  lengthFeet: number;
  elevationChangeFeet: number;
  slope: number;              // percentage grade
  terrainDifficulty: TerrainDifficulty;
  soilType?: string;
}

export type TerrainDifficulty = 'easy' | 'moderate' | 'difficult' | 'very_difficult';

export interface FenceBid {
  id: string;
  projectName: string;
  clientName: string;
  address: string;
  fenceLines: FenceLine[];
  fenceType: FenceType;
  fenceHeight: FenceHeight;
  stayTuffOption?: StayTuffProduct;
  materials: FenceMaterialList;
  laborEstimate: LaborEstimate;
  totalCost: number;
  createdAt: string;
}

export interface FenceMaterialList {
  cornerPosts: { quantity: number; lengthFeet: number; type: string };
  linePosts: { quantity: number; lengthFeet: number; spacingFeet: number; type: string };
  tPosts: { quantity: number; lengthFeet: number; spacingFeet: number };
  bracingAssemblies: { quantity: number; type: string };
  gateAssemblies: { quantity: number; widthFeet: number; type: string }[];
  wire: { rolls: number; feetPerRoll: number; totalFeet: number; type: string };
  barbedWire: { rolls: number; strands: number; totalFeet: number };
  clips: { quantity: number; type: string };
  staples: { pounds: number };
  concrete: { bags: number; poundsPerBag: number };
  tensioners: { quantity: number };
  extras: { name: string; quantity: number; unit: string }[];
}

export interface LaborEstimate {
  totalHours: number;
  crewSize: number;
  days: number;
  difficultyMultiplier: number;
  hourlyRate: number;
  totalLaborCost: number;
}

// ============================================================
// PROJECT / APP TYPES
// ============================================================

export interface Project {
  id: string;
  name: string;
  clientName: string;
  address: string;
  type: 'roofing' | 'fencing' | 'both';
  status: 'draft' | 'bidding' | 'approved' | 'in_progress' | 'complete';
  roofModel?: RoofModel;
  cutList?: CutList;
  materialEstimate?: MaterialEstimate;
  fenceBid?: FenceBid;
  createdAt: string;
  updatedAt: string;
}
