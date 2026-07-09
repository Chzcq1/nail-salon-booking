/**
 * ShopSlugContext — ให้ทุก component รู้ว่าตอนนี้อยู่ที่ร้านไหน
 *
 * หน้าที่เข้าผ่าน /r/:slug/... จะมีค่า slug ไม่เป็น null
 * หน้าปกติ (/) จะได้ null → ใช้ shop default (shop 1)
 */
import { createContext, useContext } from "react";

export const ShopSlugContext = createContext<string | null>(null);

/** hook สำหรับ component ทั่วไป */
export function useShopSlug(): string | null {
  return useContext(ShopSlugContext);
}

/**
 * สร้าง query string สำหรับ API call:
 *   shopQs("abc")   → "?shop_slug=abc"
 *   shopQs(null)    → ""
 *   shopQs("abc", "date=2024-01-01") → "?date=2024-01-01&shop_slug=abc"
 */
export function shopQs(slug: string | null, extra?: string): string {
  const parts: string[] = [];
  if (extra) parts.push(extra);
  if (slug) parts.push(`shop_slug=${encodeURIComponent(slug)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}
