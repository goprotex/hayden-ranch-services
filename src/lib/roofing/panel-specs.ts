import { PanelSpec, PanelProfile } from '@/types';

/** Panel specification database */
export const PANEL_SPECS: Record<PanelProfile, PanelSpec> = {
  '6v_crimp': {
    id: '6v_crimp',
    name: '6V Crimp Panel',
    widthInches: 36,
    minLengthFeet: 3,
    maxLengthFeet: 40,
    overlapInches: 2,
    ribHeightInches: 0.75,
    gaugeOptions: [26, 24, 22],
  },
  r_panel: {
    id: 'r_panel',
    name: 'R-Panel / PBR Panel',
    widthInches: 36,
    minLengthFeet: 3,
    maxLengthFeet: 45,
    overlapInches: 0,
    ribHeightInches: 1.25,
    gaugeOptions: [26, 24, 22],
  },
  standing_seam_snap_lock_16: {
    id: 'standing_seam_snap_lock_16',
    name: '16" Standing Seam Snap Lock',
    widthInches: 16,
    minLengthFeet: 3,
    maxLengthFeet: 50,
    overlapInches: 0,
    ribHeightInches: 1.75,
    gaugeOptions: [26, 24, 22],
  },
  standing_seam_snap_lock_14: {
    id: 'standing_seam_snap_lock_14',
    name: '14" Standing Seam Snap Lock',
    widthInches: 14,
    minLengthFeet: 3,
    maxLengthFeet: 50,
    overlapInches: 0,
    ribHeightInches: 1.75,
    gaugeOptions: [26, 24, 22],
  },
};

/** Map edge types to required trim pieces */
export const EDGE_TRIM_MAP: Record<string, string[]> = {
  ridge: ['ridge_cap', 'inside_closure'],
  hip: ['hip_cap', 'inside_closure'],
  valley: ['valley_flashing'],
  eave: ['eave_drip', 'outside_closure'],
  rake: ['rake_trim'],
  sidewall: ['sidewall_flashing', 'j_channel'],
  headwall: ['headwall_flashing', 'z_flashing'],
  drip_edge: ['eave_drip'],
  transition: ['transition_flashing', 'z_flashing'],
};

/** Standard trim piece lengths (feet) */
export const TRIM_STANDARD_LENGTH = 10.5;

/** Fastener specs per panel type */
export const FASTENER_SPECS: Record<PanelProfile, { type: string; size: string; perSquare: number }> = {
  '6v_crimp': {
    type: 'Wood Grip Screw with Washer',
    size: '#10 x 1.5"',
    perSquare: 80,
  },
  r_panel: {
    type: 'Self-Drilling Screw with Washer',
    size: '#12 x 1.5"',
    perSquare: 80,
  },
  standing_seam_snap_lock_16: {
    type: 'Concealed Clip',
    size: 'Standard Clip',
    perSquare: 65,
  },
  standing_seam_snap_lock_14: {
    type: 'Concealed Clip',
    size: 'Standard Clip',
    perSquare: 75,
  },
};

/** Default waste factors by panel type */
export const DEFAULT_WASTE_FACTOR: Record<PanelProfile, number> = {
  '6v_crimp': 0.10,
  r_panel: 0.10,
  standing_seam_snap_lock_16: 0.07,
  standing_seam_snap_lock_14: 0.07,
};
