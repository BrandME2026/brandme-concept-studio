/**
 * Infiere la categoría de una página generada a partir del dominio de su URL real.
 * Heurística determinista (sin LLM, sin tocar el schema). Dato real derivado, no mock.
 */

import type { TranslationKey } from "@/lib/i18n/es";

export interface Category {
  id: "restaurants" | "fitness" | "services" | "other";
  nameKey: TranslationKey;
  icon: string;
}

const CATEGORIES: Record<Category["id"], Category> = {
  restaurants: { id: "restaurants", nameKey: "ll.gallery.cat.restaurants", icon: "🍔" },
  fitness: { id: "fitness", nameKey: "ll.gallery.cat.fitness", icon: "💪" },
  services: { id: "services", nameKey: "ll.gallery.cat.services", icon: "✂️" },
  other: { id: "other", nameKey: "ll.gallery.cat.other", icon: "🌐" },
};

// Keywords de dominio → categoría. Ampliable sin tocar lógica.
const RULES: { id: Category["id"]; keywords: string[] }[] = [
  {
    id: "restaurants",
    keywords: [
      "burgerking", "bk", "domino", "jerseymike", "mcdonald", "wendys", "tacobell",
      "subway", "pizza", "kfc", "chipotle", "starbucks", "dunkin", "popeyes", "sonic",
      "restaurant", "grill", "kitchen", "cafe", "coffee", "food",
    ],
  },
  {
    id: "fitness",
    keywords: [
      "anytimefitness", "orangetheory", "massageenvy", "planetfitness", "goldsgym",
      "crossfit", "yoga", "pilates", "fitness", "gym", "wellness", "spa",
    ],
  },
  {
    id: "services",
    keywords: [
      "greatclips", "ups", "servpro", "supercuts", "hrblock", "jan-pro", "molly",
      "clips", "salon", "cleaning", "plumbing", "hvac", "service", "repair", "tax",
    ],
  },
];

export function inferCategory(url: string): Category {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    host = url.toLowerCase();
  }
  for (const rule of RULES) {
    if (rule.keywords.some((k) => host.includes(k))) return CATEGORIES[rule.id];
  }
  return CATEGORIES.other;
}

/** Orden estable de categorías para renderizar las que tengan elementos. */
export const CATEGORY_ORDER: Category[] = [
  CATEGORIES.restaurants,
  CATEGORIES.fitness,
  CATEGORIES.services,
  CATEGORIES.other,
];
