import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import inputs from "../assets/fonts/manifest.json";

// Official MapLibre font-maker WASM; no native compiler or installed fonts needed.
const revision = "bab9b243413cb17b66b158d629a4bac2d7299786";
const binaries: Record<string, string> = {
  "sdfglyph.js":
    "2d5cce9e20511e3e1798a696b496cfb4fb9c55cd9cceaa73fd77849e1c3d7a64",
  "sdfglyph.wasm":
    "de2986e66201499de76f21bb3a649e1f27d7d68af21cb2616dc3a7b25bade691",
};
const cache = resolve(".cache/font-maker");
mkdirSync(cache, { recursive: true });
function verify(file: string, expected: string) {
  if (
    createHash("sha256").update(readFileSync(file)).digest("hex") !== expected
  )
    throw new Error(
      `Checksum mismatch: ${file}. Remove the cached file and retry.`,
    );
}
for (const [file, hash] of Object.entries(binaries)) {
  const path = `${cache}/${file}`;
  if (!existsSync(path))
    execFileSync("curl", [
      "-fsSL",
      "--max-time",
      "60",
      `https://raw.githubusercontent.com/maplibre/font-maker/${revision}/${file}`,
      "-o",
      path,
    ]);
  verify(path, hash);
}
interface FontMaker {
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  _create_fontstack(name: number): number;
  _fontstack_add_face(stack: number, font: number, size: number): void;
  _generate_glyph_buffer(stack: number, start: number): number;
  _glyph_buffer_data(buffer: number): number;
  _glyph_buffer_size(buffer: number): number;
  _free_glyph_buffer(buffer: number): void;
  _free_fontstack(stack: number): void;
}
let initialized!: () => void;
const ready = new Promise<void>((resolve) => {
  initialized = resolve;
});
const config = {
  wasmBinary: readFileSync(`${cache}/sdfglyph.wasm`),
  print: () => {},
  printErr: (message: string) => console.error(message),
  onRuntimeInitialized: () => initialized(),
};
// Evaluate only the versioned, checksum-verified Emscripten module above.
new Function(
  "Module",
  "require",
  "__dirname",
  readFileSync(`${cache}/sdfglyph.js`, "utf8"),
)(config, createRequire(import.meta.url), cache);
await ready;
const maker = config as unknown as FontMaker;
for (const input of inputs) {
  const source = `assets/fonts/${input.file}`;
  verify(source, input.sha256);
  const font = readFileSync(source);
  const name = Buffer.from(`${input.name}\0`);
  const namePointer = maker._malloc(name.length);
  maker.HEAPU8.set(name, namePointer);
  const stack = maker._create_fontstack(namePointer);
  maker._free(namePointer);
  const fontPointer = maker._malloc(font.length);
  maker.HEAPU8.set(font, fontPointer);
  maker._fontstack_add_face(stack, fontPointer, font.length);
  const output = `public/fonts/${input.name}`;
  mkdirSync(output, { recursive: true });
  for (const start of input.ranges) {
    const buffer = maker._generate_glyph_buffer(stack, start);
    const pointer = maker._glyph_buffer_data(buffer);
    const size = maker._glyph_buffer_size(buffer);
    writeFileSync(
      `${output}/${start}-${start + 255}.pbf`,
      maker.HEAPU8.slice(pointer, pointer + size),
    );
    maker._free_glyph_buffer(buffer);
  }
  maker._free_fontstack(stack);
  maker._free(fontPointer);
  copyFileSync(`assets/fonts/${input.license}`, `${output}/OFL.txt`);
  console.log(`Prepared ${input.name}: ${input.ranges.length} glyph ranges.`);
}
