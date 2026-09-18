import assert from "node:assert/strict";
import { test } from "node:test";
import { encode as encodePng } from "fast-png";
import { decode as decodeJpeg, encode as encodeJpeg } from "jpeg-js";
import {
  applyFoodLook,
  applyRgbCurves,
  applyUnsharpMask,
  boxResize,
  buildCurveLut,
  FOOD_FILTER,
  LUT_B,
  LUT_G,
  LUT_R,
  resizeMaxSide,
  type RgbaImage,
} from "./foodFilter";
import { filterCoverBytes } from "./imageCodec";
import { sniffImage } from "./media";

function rgba(width: number, height: number, fill: [number, number, number, number?]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3] ?? 255;
  }
  return { width, height, data };
}

function cloneImg(img: RgbaImage): RgbaImage {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

test("RGB curve LUTs hit Averie knots exactly", () => {
  assert.equal(LUT_R.length, 256);
  assert.equal(LUT_G.length, 256);
  assert.equal(LUT_B.length, 256);
  for (const [x, y] of FOOD_FILTER.curves.r) assert.equal(LUT_R[x], y, `R[${x}]`);
  for (const [x, y] of FOOD_FILTER.curves.g) assert.equal(LUT_G[x], y, `G[${x}]`);
  for (const [x, y] of FOOD_FILTER.curves.b) assert.equal(LUT_B[x], y, `B[${x}]`);
});

test("buildCurveLut is stable and in 0–255", () => {
  const again = buildCurveLut(FOOD_FILTER.curves.r);
  assert.deepEqual([...again], [...LUT_R]);
  for (let i = 0; i < 256; i++) {
    assert.ok(LUT_R[i] >= 0 && LUT_R[i] <= 255);
    assert.ok(LUT_G[i] >= 0 && LUT_G[i] <= 255);
    assert.ok(LUT_B[i] >= 0 && LUT_B[i] <= 255);
  }
  // Warm midtones: red lifted more than green at 128.
  assert.equal(LUT_R[128], 147);
  assert.equal(LUT_G[128], 130);
  assert.equal(LUT_B[128], 128);
  assert.ok(LUT_R[32] > 2 && LUT_R[32] < 72);
});

test("applyRgbCurves maps a mid-gray pixel", () => {
  const img = rgba(2, 2, [128, 128, 128]);
  applyRgbCurves(img);
  for (let i = 0; i < img.data.length; i += 4) {
    assert.equal(img.data[i], 147);
    assert.equal(img.data[i + 1], 130);
    assert.equal(img.data[i + 2], 128);
    assert.equal(img.data[i + 3], 255);
  }
});

test("UnsharpMask leaves a uniform field unchanged", () => {
  const img = rgba(8, 8, [80, 90, 100]);
  applyUnsharpMask(img);
  for (let i = 0; i < img.data.length; i += 4) {
    assert.equal(img.data[i], 80);
    assert.equal(img.data[i + 1], 90);
    assert.equal(img.data[i + 2], 100);
  }
});

test("UnsharpMask increases contrast on a hard edge", () => {
  const img = rgba(16, 8, [0, 0, 0]);
  for (let y = 0; y < 8; y++) {
    for (let x = 8; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      img.data[i] = 200;
      img.data[i + 1] = 200;
      img.data[i + 2] = 200;
    }
  }
  applyUnsharpMask(img);
  const darkEdge = img.data[(3 * 16 + 7) * 4];
  const brightEdge = img.data[(3 * 16 + 8) * 4];
  assert.equal(darkEdge, 0);
  assert.ok(brightEdge > 200, `expected sharpened bright edge, got ${brightEdge}`);
});

test("food look is curves then unsharp (order matters on an edge)", () => {
  const edge = rgba(12, 6, [40, 40, 40]);
  for (let y = 0; y < 6; y++) {
    for (let x = 6; x < 12; x++) {
      const i = (y * 12 + x) * 4;
      edge.data[i] = 200;
      edge.data[i + 1] = 180;
      edge.data[i + 2] = 90;
    }
  }
  const curvesFirst = cloneImg(edge);
  applyRgbCurves(curvesFirst);
  applyUnsharpMask(curvesFirst);

  const sharpFirst = cloneImg(edge);
  applyUnsharpMask(sharpFirst);
  applyRgbCurves(sharpFirst);

  const official = cloneImg(edge);
  applyFoodLook(official);

  assert.deepEqual([...official.data], [...curvesFirst.data]);
  assert.notDeepEqual([...official.data], [...sharpFirst.data]);
});

test("resizeMaxSide downscales the long side to 1600", () => {
  const img = rgba(3200, 1000, [10, 20, 30]);
  const out = resizeMaxSide(img, 1600);
  assert.equal(out.width, 1600);
  assert.equal(out.height, 500);
  assert.equal(out.data[0], 10);
  assert.equal(boxResize(img, 3200, 1000), img);
});

test("filterCoverBytes returns a warmed JPEG from a tiny fixture", async () => {
  const width = 8;
  const height = 8;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 128;
    data[i + 1] = 128;
    data[i + 2] = 128;
    data[i + 3] = 255;
  }
  const jpeg = encodeJpeg({ data, width, height }, 90);
  const raw = jpeg.data instanceof Uint8Array ? jpeg.data : Uint8Array.from(jpeg.data);
  assert.equal(sniffImage(raw)?.ext, "jpg");

  const filtered = await filterCoverBytes(raw, { ext: "jpg", mime: "image/jpeg" });
  assert.equal(sniffImage(filtered)?.ext, "jpg");
  assert.ok(filtered.byteLength > 32);

  const decoded = decodeJpeg(filtered, { useTArray: true, formatAsRGBA: true });
  let r = 0;
  let g = 0;
  let n = 0;
  for (let i = 0; i < decoded.data.length; i += 4) {
    r += decoded.data[i];
    g += decoded.data[i + 1];
    n++;
  }
  const meanR = r / n;
  const meanG = g / n;
  assert.ok(meanR > 135, `expected warmed red, got meanR=${meanR}`);
  assert.ok(meanR > meanG, `expected red > green after curves, got ${meanR} vs ${meanG}`);
});

test("filterCoverBytes converts a tiny PNG to a warmed JPEG", async () => {
  const width = 8;
  const height = 8;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 128;
    data[i + 1] = 128;
    data[i + 2] = 128;
    data[i + 3] = 255;
  }
  const png = encodePng({ width, height, data, channels: 4 });
  const filtered = await filterCoverBytes(png, { ext: "png", mime: "image/png" });
  assert.equal(sniffImage(filtered)?.ext, "jpg");
  const decoded = decodeJpeg(filtered, { useTArray: true, formatAsRGBA: true });
  let r = 0;
  let n = 0;
  for (let i = 0; i < decoded.data.length; i += 4) {
    r += decoded.data[i];
    n++;
  }
  assert.ok(r / n > 135, `expected warmed red from PNG, got meanR=${r / n}`);
});
