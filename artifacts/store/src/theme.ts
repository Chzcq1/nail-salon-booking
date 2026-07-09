/**
 * Brand color theming — each shop can pick a color preset.
 * Primary hex is stored in nail_shop_settings.brand_color.
 * The full theme (derived shades) is looked up here and injected as CSS custom properties.
 *
 * CSS vars injected:
 *   --b-primary, --b-deep, --b-light, --b-pale, --b-bg, --b-border
 *   --b-primary-15, --b-primary-22, --b-primary-44, --b-primary-55, --b-primary-66
 *   --b-deep-15  (for linear-gradient references)
 */

export interface BrandTheme {
  name: string;
  primary: string;
  deep: string;
  light: string;
  pale: string;
  bg: string;
  border: string;
}

export const BRAND_THEMES: BrandTheme[] = [
  { name: "ชมพู (ค่าเริ่มต้น)", primary: "#B5174B", deep: "#880E4F", light: "#D81B60", pale: "#FCE4EC", bg: "#FFF5F8", border: "#F8BBD9" },
  { name: "ม่วง",               primary: "#7C3AED", deep: "#4C1D95", light: "#8B5CF6", pale: "#F5F3FF", bg: "#FAF8FF", border: "#DDD6FE" },
  { name: "น้ำเงิน",            primary: "#1D4ED8", deep: "#1E3A8A", light: "#3B82F6", pale: "#EFF6FF", bg: "#F0F9FF", border: "#BFDBFE" },
  { name: "เขียว",              primary: "#059669", deep: "#064E3B", light: "#10B981", pale: "#ECFDF5", bg: "#F0FDF4", border: "#A7F3D0" },
  { name: "ส้ม",                primary: "#EA580C", deep: "#7C2D12", light: "#F97316", pale: "#FFF7ED", bg: "#FFFBF7", border: "#FED7AA" },
  { name: "ฟ้า",                primary: "#0891B2", deep: "#164E63", light: "#06B6D4", pale: "#F0FDFA", bg: "#F7FDFF", border: "#A5F3FC" },
  { name: "ทอง",                primary: "#B45309", deep: "#78350F", light: "#D97706", pale: "#FFFBEB", bg: "#FFFDF7", border: "#FDE68A" },
  { name: "แดง",                primary: "#DC2626", deep: "#7F1D1D", light: "#EF4444", pale: "#FEF2F2", bg: "#FFF5F5", border: "#FECACA" },
];

export const DEFAULT_THEME = BRAND_THEMES[0];

export function getTheme(brandColor: string | null | undefined): BrandTheme {
  if (!brandColor) return DEFAULT_THEME;
  const lc = brandColor.toLowerCase();
  return BRAND_THEMES.find(t => t.primary.toLowerCase() === lc) ?? DEFAULT_THEME;
}

/** แปลง hex (#RRGGBB) เป็น "r, g, b" string สำหรับใส่ใน rgba() */
function hexToRgbComponents(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "181, 23, 75"; // fallback ชมพู
  return `${r}, ${g}, ${b}`;
}

export function injectThemeCss(theme: BrandTheme): void {
  const id = "nail-brand-theme";
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  const rgb = hexToRgbComponents(theme.primary);
  el.textContent = `:root {
    --b-primary:    ${theme.primary};
    --b-deep:       ${theme.deep};
    --b-light:      ${theme.light};
    --b-pale:       ${theme.pale};
    --b-bg:         ${theme.bg};
    --b-border:     ${theme.border};
    /* alpha variants ของ primary — ใช้แทน "\${P.pink}55" ที่ไม่ใช้กับ CSS vars ได้ */
    --b-primary-15: rgba(${rgb}, 0.08);
    --b-primary-22: rgba(${rgb}, 0.13);
    --b-primary-44: rgba(${rgb}, 0.27);
    --b-primary-55: rgba(${rgb}, 0.33);
    --b-primary-66: rgba(${rgb}, 0.40);
  }`;
}
