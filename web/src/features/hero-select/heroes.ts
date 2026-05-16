// Hardcoded hero list — phase 3 stub. Phase 4+ replaces with
// GET /api/catalog/heroes. IDs must match internal/catalog/heroes/heroes.json.

export type HeroCard = {
  id: string;
  name: string;
  description: string;
  startingHp: number;
  accent: string; // tailwind border color
};

export const HEROES: HeroCard[] = [
  {
    id: "knight",
    name: "Knight",
    description: "A stalwart fighter who favors weapons and shields.",
    startingHp: 100,
    accent: "border-amber-500",
  },
  {
    id: "ranger",
    name: "Ranger",
    description: "A nimble hunter who excels with bows and traps.",
    startingHp: 90,
    accent: "border-emerald-500",
  },
  {
    id: "alchemist",
    name: "Alchemist",
    description: "A potion-flinging tinkerer with explosive surprises.",
    startingHp: 80,
    accent: "border-violet-500",
  },
];
