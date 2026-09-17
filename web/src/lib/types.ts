export type Category = {
  id: string;
  name: string;
  sort: number;
};

export type Recipe = {
  summary?: string;
  ingredients?: string[];
  ingredients_v1?: string;
  ingredients_v2_next?: string;
  steps?: string[];
  tasting?: string;
  improvements?: string[];
  calories?: string | number;
  notes?: string;
  [key: string]: unknown;
};

export type Dish = {
  id: string;
  title: string;
  status: "cooked" | "want_cook";
  categories: Category[];
  coverUrl: string | null;
  cookedAt: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  wantEatCount: number;
  myScore: number | null;
  wanted: boolean;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  recipe?: Recipe | null;
  coverPath?: string | null;
};
