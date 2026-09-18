import { decode as decodePng, convertIndexedToRgb } from "fast-png";
import { decode as decodeJpeg, encode as encodeJpegJs } from "jpeg-js";
import {
  applyFoodLook,
  CoverFilterError,
  FOOD_FILTER,
  resizeMaxSide,
  type RgbaImage,
} from "./foodFilter";

export type ImageKind = { ext: "jpg" | "png" | "webp"; mime: string };

function ensureBufferShim(): void {
  const g = globalThis as unknown as {
    Buffer?: { from: (d: ArrayLike<number>) => Uint8Array; alloc: (n: number) => Uint8Array };
  };
  if (g.Buffer) return;
  g.Buffer = {
    from(d: ArrayLike<number>) {
      return d instanceof Uint8Array ? new Uint8Array(d) : Uint8Array.from(d);
    },
    alloc(n: number) {
      return new Uint8Array(n);
    },
  };
}

function toRgba(width: number, height: number, src: Uint8Array, channels: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  if (channels === 4) {
    data.set(src);
    return { width, height, data };
  }
  if (channels === 3) {
    for (let i = 0, o = 0; i < src.length; i += 3, o += 4) {
      data[o] = src[i];
      data[o + 1] = src[i + 1];
      data[o + 2] = src[i + 2];
      data[o + 3] = 255;
    }
    return { width, height, data };
  }
  if (channels === 2) {
    for (let i = 0, o = 0; i < src.length; i += 2, o += 4) {
      const g = src[i];
      data[o] = g;
      data[o + 1] = g;
      data[o + 2] = g;
      data[o + 3] = src[i + 1];
    }
    return { width, height, data };
  }
  if (channels === 1) {
    for (let i = 0, o = 0; i < src.length; i++, o += 4) {
      const g = src[i];
      data[o] = g;
      data[o + 1] = g;
      data[o + 2] = g;
      data[o + 3] = 255;
    }
    return { width, height, data };
  }
  throw new CoverFilterError("不支持的 PNG 通道数");
}

function decodePngRgba(bytes: Uint8Array): RgbaImage {
  const png = decodePng(bytes);
  if (png.palette) {
    const rgb = convertIndexedToRgb(png);
    const ch = png.palette[0]?.length || 3;
    return toRgba(png.width, png.height, rgb, ch);
  }
  if (png.depth !== 8) {
    throw new CoverFilterError("仅支持 8 位 PNG");
  }
  const packed = png.data instanceof Uint8Array ? png.data : new Uint8Array(png.data);
  return toRgba(png.width, png.height, packed, png.channels);
}

function decodeJpegRgba(bytes: Uint8Array): RgbaImage {
  const decoded = decodeJpeg(bytes, {
    useTArray: true,
    formatAsRGBA: true,
    maxResolutionInMP: 12,
    maxMemoryUsageInMB: 64,
  });
  const raw = decoded.data;
  const data = new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.byteLength);
  return { width: decoded.width, height: decoded.height, data };
}

let webpInit: Promise<void> | null = null;

async function decodeWebpRgba(bytes: Uint8Array): Promise<RgbaImage> {
  const { default: decodeWebp, init } = await import("@jsquash/webp/decode");
  if (!webpInit) {
    webpInit = (async () => {
      const wasmMod = await import("./wasm/webp_dec.wasm.bin");
      const wasmBytes = wasmMod.default instanceof Uint8Array ? wasmMod.default : new Uint8Array(wasmMod.default);
      await init({
        instantiateWasm(imports: WebAssembly.Imports, successCallback: (mod: WebAssembly.Module) => void) {
          void WebAssembly.instantiate(wasmBytes, imports).then((instance) => {
            successCallback(instance as unknown as WebAssembly.Module);
          });
          return {};
        },
      });
    })();
  }
  try {
    await webpInit;
  } catch (err) {
    console.error("webp wasm init failed", err);
    webpInit = null;
    throw new CoverFilterError("无法解码 WebP，请改用 JPEG");
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const img = await decodeWebp(copy.buffer);
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

export async function decodeImage(bytes: Uint8Array, kind: ImageKind): Promise<RgbaImage> {
  if (kind.ext === "jpg") return decodeJpegRgba(bytes);
  if (kind.ext === "png") return decodePngRgba(bytes);
  if (kind.ext === "webp") return decodeWebpRgba(bytes);
  throw new CoverFilterError("仅支持 JPEG / PNG / WebP");
}

export function encodeJpeg(img: RgbaImage, quality: number): Uint8Array {
  ensureBufferShim();
  const encoded = encodeJpegJs(
    { data: img.data, width: img.width, height: img.height },
    quality,
  );
  const raw = encoded.data;
  return raw instanceof Uint8Array ? new Uint8Array(raw) : Uint8Array.from(raw);
}

const MAX_PIXELS = 12_000_000;

/**
 * Decode JPEG/PNG/WebP, resize, apply Averie food look, encode JPEG.
 */
export async function filterCoverBytes(bytes: Uint8Array, kind: ImageKind): Promise<Uint8Array> {
  let img: RgbaImage;
  try {
    img = await decodeImage(bytes, kind);
  } catch (err) {
    const msg = err instanceof CoverFilterError ? err.message : "无法解码图片";
    throw new CoverFilterError(msg);
  }
  if (img.width < 1 || img.height < 1) throw new CoverFilterError("图片尺寸无效");
  if (img.width * img.height > MAX_PIXELS) throw new CoverFilterError("图片尺寸过大");

  img = resizeMaxSide(img, FOOD_FILTER.maxSide);
  applyFoodLook(img);

  try {
    return encodeJpeg(img, FOOD_FILTER.jpegQuality);
  } catch (err) {
    console.error("jpeg encode failed", err);
    throw new CoverFilterError("封面 JPEG 编码失败");
  }
}
