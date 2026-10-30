#!/usr/bin/env node
// Turns a prompts file into one PNG per line with the tier's mflux command,
// with a fixed seed for each scene. Writes images.json, with each image's
// prompt and seed, to --out.
//
// Usage: node images.mjs --prompts <file> --out <folder> --command "<image command>"
//          [--seed <first seed>] [--width <px>] [--height <px>]
//
// Each non-blank line of the prompts file is the prompt of one scene. Scene n
// takes the seed --seed + n - 1, so a rerun of the same prompt gives the same
// image. mflux needs a width and height that are multiples of 16: the Qwen and
// FLUX.2 commands round other sizes down, and the Iris command refuses them.
// The default, 1664x928, is Qwen-Image's 16:9 size.
//
// A rerun keeps the PNG of a scene whose prompt, command, seed and size are
// the same, because mflux would make the same image again.
//
// Exit codes: 0 when every scene has its image, 1 on an error.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function usage(message) {
  console.error(`images.mjs: ${message}`);
  console.error('usage: node images.mjs --prompts <file> --out <folder> --command "<image command>" [--seed <first seed>] [--width <px>] [--height <px>]');
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${command} exited ${result.status}:\n${(result.stderr || result.stdout).trim().slice(-2000)}`);
  }
}

function isPng(file) {
  return existsSync(file) && readFileSync(file).subarray(0, 8).equals(PNG_SIGNATURE);
}

// Makes a scene's PNG in a new folder and moves it into place, so a command
// that exits 0 without an image never leaves the old PNG as the new one.
function makeImage(prompt, seed, name) {
  const folder = mkdtempSync(join(out, ".mflux-"));
  try {
    const made = join(folder, `${name}.png`);
    run(program, [
      ...commandArgs, "--prompt", prompt, "--seed", String(seed),
      "--width", String(width), "--height", String(height), "--output", made,
    ]);
    if (!isPng(made)) throw new Error(`${program} made no image for ${name}`);
    renameSync(made, join(out, `${name}.png`));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const { values } = parseArgs({
  options: {
    prompts: { type: "string" },
    out: { type: "string" },
    command: { type: "string" },
    seed: { type: "string", default: "1" },
    width: { type: "string", default: "1664" },
    height: { type: "string", default: "928" },
  },
});
for (const name of ["prompts", "out", "command"]) {
  if (!values[name]) usage(`--${name} is required`);
}
for (const name of ["seed", "width", "height"]) {
  if (!/^\d+$/.test(values[name])) usage(`--${name} must be a whole number`);
}
for (const name of ["width", "height"]) {
  const value = Number(values[name]);
  if (value === 0 || value % 16 !== 0) usage(`--${name} ${value} is not a multiple of 16`);
}
const firstSeed = Number(values.seed);
const width = Number(values.width);
const height = Number(values.height);
const [program, ...commandArgs] = values.command.trim().split(/\s+/);

const prompts = readFileSync(values.prompts, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
if (prompts.length === 0) usage(`${values.prompts} has no lines`);

const out = values.out;
mkdirSync(out, { recursive: true });
const imagesFile = join(out, "images.json");
const previous = existsSync(imagesFile) ? JSON.parse(readFileSync(imagesFile, "utf8")) : { images: [] };
const sameSetup = previous.command === values.command && previous.width === width && previous.height === height;

const names = prompts.map((_, i) => `scene-${String(i + 1).padStart(2, "0")}`);
const seeds = prompts.map((_, i) => firstSeed + i);
const keep = prompts.map(
  (prompt, i) =>
    sameSetup &&
    previous.images[i]?.prompt === prompt &&
    previous.images[i]?.seed === seeds[i] &&
    isPng(join(out, `${names[i]}.png`)),
);
// images.json is what tells a rerun which PNGs to keep. Remove it before the
// first PNG changes, so a run that stops part way keeps no image next time.
if (keep.includes(false)) rmSync(imagesFile, { force: true });

const images = [];
try {
  prompts.forEach((prompt, i) => {
    const n = i + 1;
    if (keep[i]) {
      console.error(`scene ${n}: keeping ${names[i]}.png`);
    } else {
      console.error(`scene ${n}: making an image with seed ${seeds[i]}`);
      makeImage(prompt, seeds[i], names[i]);
    }
    images.push({ n, prompt, seed: seeds[i], png: `${names[i]}.png` });
  });
} catch (error) {
  console.error(`images.mjs: ${error.message}`);
  process.exit(1);
}

writeFileSync(imagesFile, `${JSON.stringify({ command: values.command, width, height, images }, null, 2)}\n`);
console.log(`${images.length} images in ${out}, ${width}x${height}.`);
