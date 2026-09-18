/**
 * Averie 美食滤镜 — RGB 曲线然后 UnsharpMask。
 * Workers-safe typed-array pipeline (no ImageMagick, no Node canvas).
 */

/** Control points: input → output, 0–255. */
export type CurvePoints = readonly (readonly [number, number])[];

export const FOOD_FILTER = {
  name: "averie-food-curves",
  order: "curves-then-unsharp",
  curves: {
    r: [
      [0, 2],
      [64, 72],
      [128, 147],
      [192, 205],
      [255, 249],
    ] as const,
    g: [
      [0, 2],
      [64, 56],
      [128, 130],
      [192, 199],
      [255, 252],
    ] as const,
    b: [
      [0, 8],
      [64, 42],
      [128, 128],
      [192, 199],
      [255, 253],
    ] as const,
  },
  unsharp: { radius: 3.7, percent: 37, threshold: 4 },
  maxSide: 1600,
  jpegQuality: 82,
} as const;

export const LUT_R = buildCurveLut(FOOD_FILTER.curves.r);
export const LUT_G = buildCurveLut(FOOD_FILTER.curves.g);
export const LUT_B = buildCurveLut(FOOD_FILTER.curves.b);

export type RgbaImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export class CoverFilterError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "CoverFilterError";
  }
}

export function clamp8(n: number): number {
  if (n < 0) return 0;
  if (n > 255) return 255;
  return n;
}

/**
 * Natural cubic spline through the 5 RGB curve knots, sampled to a 256-entry LUT.
 */
export function buildCurveLut(points: CurvePoints): Uint8Array {
  const n = points.length - 1;
  if (n < 1) throw new Error("curve needs at least 2 points");
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const h = new Array<number>(n);
  for (let i = 0; i < n; i++) h[i] = xs[i + 1] - xs[i];

  const a = new Array<number>(n + 1).fill(0);
  const b = new Array<number>(n + 1).fill(1);
  const c = new Array<number>(n + 1).fill(0);
  const d = new Array<number>(n + 1).fill(0);
  b[0] = 1;
  d[0] = 0;
  b[n] = 1;
  d[n] = 0;
  for (let i = 1; i < n; i++) {
    a[i] = h[i - 1];
    b[i] = 2 * (h[i - 1] + h[i]);
    c[i] = h[i];
    d[i] = 6 * ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1]);
  }

  for (let i = 1; i <= n; i++) {
    const w = a[i] / b[i - 1];
    b[i] -= w * c[i - 1];
    d[i] -= w * d[i - 1];
  }
  const m = new Array<number>(n + 1);
  m[n] = d[n] / b[n];
  for (let i = n - 1; i >= 0; i--) {
    m[i] = (d[i] - c[i] * m[i + 1]) / b[i];
  }

  const lut = new Uint8Array(256);
  let seg = 0;
  for (let x = 0; x <= 255; x++) {
    while (seg < n - 1 && x > xs[seg + 1]) seg++;
    const hi = h[seg];
    const A = (xs[seg + 1] - x) / hi;
    const B = (x - xs[seg]) / hi;
    const y =
      A * ys[seg] +
      B * ys[seg + 1] +
      ((A * A * A - A) * m[seg] + (B * B * B - B) * m[seg + 1]) * (hi * hi) / 6;
    lut[x] = clamp8(Math.round(y));
  }
  return lut;
}

export function applyRgbCurves(img: RgbaImage, lutR = LUT_R, lutG = LUT_G, lutB = LUT_B): void {
  const { data } = img;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lutR[data[i]];
    data[i + 1] = lutG[data[i + 1]];
    data[i + 2] = lutB[data[i + 2]];
  }
}

function gaussianKernel(sigma: number): Float64Array {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float64Array(radius * 2 + 1);
  const s2 = 2 * sigma * sigma;
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / s2);
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  return kernel;
}

function convolveHoriz(src: Float32Array, dest: Float32Array, w: number, h: number, kernel: Float64Array): void {
  const r = (kernel.length - 1) >> 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        let xx = x + k;
        if (xx < 0) xx = 0;
        else if (xx >= w) xx = w - 1;
        acc += src[row + xx] * kernel[k + r];
      }
      dest[row + x] = acc;
    }
  }
}

function convolveVert(src: Float32Array, dest: Float32Array, w: number, h: number, kernel: Float64Array): void {
  const r = (kernel.length - 1) >> 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        let yy = y + k;
        if (yy < 0) yy = 0;
        else if (yy >= h) yy = h - 1;
        acc += src[yy * w + x] * kernel[k + r];
      }
      dest[y * w + x] = acc;
    }
  }
}

/** Pillow ImageFilter.UnsharpMask: radius=σ, percent, threshold on 8-bit |orig-blur|. */
export function applyUnsharpMask(
  img: RgbaImage,
  radius = FOOD_FILTER.unsharp.radius,
  percent = FOOD_FILTER.unsharp.percent,
  threshold = FOOD_FILTER.unsharp.threshold,
): void {
  const { width, height, data } = img;
  const kernel = gaussianKernel(radius);
  const amount = percent / 100;
  const plane = new Float32Array(width * height);
  const tmp = new Float32Array(width * height);
  for (let ch = 0; ch < 3; ch++) {
    for (let i = 0, p = 0; i < data.length; i += 4, p++) plane[p] = data[i + ch];
    convolveHoriz(plane, tmp, width, height, kernel);
    convolveVert(tmp, plane, width, height, kernel);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const orig = data[i + ch];
      const diff = orig - plane[p];
      if (Math.abs(diff) >= threshold) {
        data[i + ch] = clamp8(Math.round(orig + diff * amount));
      }
    }
  }
}

export function boxResize(img: RgbaImage, w2: number, h2: number): RgbaImage {
  const w1 = img.width;
  const h1 = img.height;
  if (w2 === w1 && h2 === h1) return img;
  const src = img.data;
  const dest = new Uint8ClampedArray(w2 * h2 * 4);
  for (let y = 0; y < h2; y++) {
    const sy0 = (y * h1) / h2;
    const sy1 = ((y + 1) * h1) / h2;
    const y0 = Math.floor(sy0);
    const y1 = Math.min(h1, Math.ceil(sy1));
    for (let x = 0; x < w2; x++) {
      const sx0 = (x * w1) / w2;
      const sx1 = ((x + 1) * w1) / w2;
      const x0 = Math.floor(sx0);
      const x1 = Math.min(w1, Math.ceil(sx1));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      for (let yy = y0; yy < y1; yy++) {
        const rowY0 = Math.max(sy0, yy);
        const rowY1 = Math.min(sy1, yy + 1);
        const yh = rowY1 - rowY0;
        if (yh <= 0) continue;
        for (let xx = x0; xx < x1; xx++) {
          const colX0 = Math.max(sx0, xx);
          const colX1 = Math.min(sx1, xx + 1);
          const xw = colX1 - colX0;
          if (xw <= 0) continue;
          const wgt = xw * yh;
          const i = (yy * w1 + xx) * 4;
          r += src[i] * wgt;
          g += src[i + 1] * wgt;
          b += src[i + 2] * wgt;
          a += src[i + 3] * wgt;
          area += wgt;
        }
      }
      const o = (y * w2 + x) * 4;
      if (area > 0) {
        dest[o] = Math.round(r / area);
        dest[o + 1] = Math.round(g / area);
        dest[o + 2] = Math.round(b / area);
        dest[o + 3] = Math.round(a / area);
      } else {
        dest[o + 3] = 255;
      }
    }
  }
  return { width: w2, height: h2, data: dest };
}

export function resizeMaxSide(img: RgbaImage, maxSide = FOOD_FILTER.maxSide): RgbaImage {
  const side = Math.max(img.width, img.height);
  if (side <= maxSide) return img;
  const scale = maxSide / side;
  const w2 = Math.max(1, Math.round(img.width * scale));
  const h2 = Math.max(1, Math.round(img.height * scale));
  return boxResize(img, w2, h2);
}

/** In-place: RGB curves, then UnsharpMask. */
export function applyFoodLook(img: RgbaImage): void {
  applyRgbCurves(img);
  applyUnsharpMask(img);
}
