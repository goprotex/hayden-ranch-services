/**
 * Maps Stay-Tuff wire categories to product photos for PDF inclusion.
 * Photos live in /images/products/ and are loaded as base64 at runtime.
 */

type WireCategory = 'deer' | 'horse' | 'goat' | 'cattle' | 'field' | 'xtreme' | 'xtreme_black';

interface ProductPhoto {
  filename: string;
  label: string;
}

const CATEGORY_PHOTOS: Record<WireCategory, ProductPhoto[]> = {
  deer: [
    { filename: 'staytuff-deer-tuff-2096-6-01.png', label: 'Stay-Tuff Deer Tuff 2096-6 Roll' },
    { filename: 'staytuff-deer-tuff-profiles-02.png', label: 'Deer Tuff — Recommended Fence Profiles' },
    { filename: 'staytuff-deer-tuff-03.jpg', label: 'Deer Tuff Installed — Sheep & Lambs' },
    { filename: 'staytuff-deer-tuff-05.jpg', label: 'Deer Tuff Installed — Lambs at Fence Line' },
  ],
  horse: [
    { filename: 'staytuff-horse-tuff-1661-3-01-1.png', label: 'Stay-Tuff Horse Tuff Roll' },
    { filename: 'staytuff-horse-tuff-profiles-02-1.png', label: 'Horse Tuff — Recommended Fence Profiles' },
    { filename: 'staytuff-horse-tuff-04.jpg', label: 'Horse Tuff Installed — Horse at Fence Line' },
    { filename: 'staytuff-in-line-strainer-05.jpg', label: 'Stay-Tuff In-Line Strainer' },
  ],
  goat: [
    { filename: 'staytuff-goat-tuff-1348-12-01.png', label: 'Stay-Tuff Goat Tuff 1348 Roll' },
    { filename: 'staytuff-goat-tuff-profiles-02.png', label: 'Goat Tuff — Recommended Fence Profiles' },
    { filename: 'staytuff-goat-tuff-03.jpg', label: 'Goat Tuff Installed — Goats in Pasture' },
    { filename: 'staytuff-goat-tuff-05.jpg', label: 'Goat Tuff Installed — Cattle Behind Fence' },
  ],
  cattle: [
    { filename: 'staytuff-cattle-tuff-949-12-01.png', label: 'Stay-Tuff Cattle Tuff 949 Roll' },
    { filename: 'staytuff-cattle-tuff-profiles-02.png', label: 'Cattle Tuff — Recommended Fence Profiles' },
    { filename: 'staytuff-cattle-tuff-03.jpg', label: 'Cattle Tuff Installed — Cattle Behind Fence' },
    { filename: 'staytuff-high-tensile-barbed-wire-02.jpg', label: 'Stay-Tuff High Tensile Barbed Wire' },
  ],
  field: [
    { filename: 'staytuff-general-livestock-fence-04.jpg', label: 'General Livestock Fence Installed' },
    { filename: 'staytuff-general-livestock-fence-profiles-02.png', label: 'General Livestock — Recommended Fence Profiles' },
    { filename: 'staytuff-general-livestock-fence-03.jpg', label: 'Fixed Knot Fence in Pasture' },
    { filename: 'staytuff-high-tensile-barbed-wire-01.png', label: 'Stay-Tuff High Tensile Barbed Wire Roll' },
  ],
  xtreme: [
    { filename: 'staytuff-1775-6-xtreme-01.png', label: 'Stay-Tuff Xtreme 1775-6 Roll' },
    { filename: 'staytuff-fixed-knot-fence-xtreme-profiles-02.png', label: 'Xtreme — Recommended Fence Profiles' },
    { filename: 'staytuff-fixed-knot-fence-how-xtreme-works-03.png', label: 'How Xtreme Reinforced Coating Works' },
    { filename: 'staytuff-general-livestock-fence-05.jpg', label: 'Fixed Knot Fence — Field Installation' },
  ],
  xtreme_black: [
    { filename: 'staytuff-949-6-xtreme-black-01.png', label: 'Stay-Tuff Xtreme Black Roll' },
    { filename: 'staytuff-fixed-knot-fence-xtreme-black-profiles-02.png', label: 'Xtreme Black — Recommended Fence Profiles' },
    { filename: 'staytuff-fixed-knot-fence-xtreme-black-04.jpg', label: 'Xtreme Black Installed' },
    { filename: 'staytuff-fixed-knot-fence-xtreme-black-06.jpg', label: 'Xtreme Black — Close Up' },
  ],
};

// Common photos added to all Stay-Tuff bids
const COMMON_PHOTOS: ProductPhoto[] = [
  { filename: 'staytuff-in-line-strainer-05.jpg', label: 'Stay-Tuff In-Line Strainer Tool' },
  { filename: 'staytuff-high-tensile-barbed-wire-01.png', label: 'Stay-Tuff High Tensile Barbed Wire' },
];

/**
 * Load product photos for a given wire category as base64 data URLs.
 * Returns an array of { label, dataUrl } ready for jsPDF.
 */
export async function loadProductPhotos(
  wireCategory: string,
): Promise<{ label: string; dataUrl: string }[]> {
  const cat = wireCategory as WireCategory;
  const photos = CATEGORY_PHOTOS[cat];
  if (!photos) return [];

  // Deduplicate: start with category-specific, add common ones not already included
  const allPhotos = [...photos];
  for (const common of COMMON_PHOTOS) {
    if (!allPhotos.some(p => p.filename === common.filename)) {
      allPhotos.push(common);
    }
  }

  // Limit to 6 photos max for reasonable PDF size
  const selected = allPhotos.slice(0, 6);

  const results: { label: string; dataUrl: string }[] = [];

  for (const photo of selected) {
    try {
      const resp = await fetch(`/images/products/${photo.filename}`);
      if (!resp.ok) continue;
      const blob = await resp.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      results.push({ label: photo.label, dataUrl });
    } catch {
      // Skip failed loads
    }
  }

  return results;
}
