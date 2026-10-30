#!/usr/bin/env node
// Turns a script file into one WAV per line with mlx-audio, transcribes each
// WAV with Qwen3-ASR, and reports each line whose transcript differs from its
// text. Writes narration.json, with each line's start and length, to --out.
//
// Usage: node narrate.mjs --script <file> --out <folder> --model <tts model>
//          [--voice <name>] [--asr-model <asr model>] [--redo <n,n,...>]
//
// Each non-blank line of the script is one narration line. A rerun keeps the
// WAV of a line whose text, model and voice are the same, unless --redo names
// the line. Every rerun transcribes every WAV again.
//
// Exit codes: 0 when every line matches, 2 when a line does not, 1 on an error.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const DEFAULT_ASR_MODEL = "mlx-community/Qwen3-ASR-0.6B-8bit";

function usage(message) {
  console.error(`narrate.mjs: ${message}`);
  console.error("usage: node narrate.mjs --script <file> --out <folder> --model <tts model> [--voice <name>] [--asr-model <asr model>] [--redo <n,n,...>]");
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${command} exited ${result.status}:\n${(result.stderr || result.stdout).trim().slice(-2000)}`);
  }
}

// The length in seconds of a RIFF WAV file: the data chunk size over the byte rate.
function wavSeconds(file) {
  const buffer = readFileSync(file);
  let byteRate;
  for (let offset = 12; offset + 8 <= buffer.length; ) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "fmt ") byteRate = buffer.readUInt32LE(offset + 16);
    if (id === "data") {
      if (!byteRate) throw new Error(`${file}: data chunk comes before fmt chunk`);
      return size / byteRate;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error(`${file}: no data chunk`);
}

// Makes a line's WAV in a new folder and moves it into place. mlx-audio can
// exit 0 without writing audio when generation raises, so a missing or empty
// WAV is an error here, and the old WAV is never kept as the new one.
function makeAudio(text, name) {
  const folder = mkdtempSync(join(out, ".tts-"));
  try {
    const voice = values.voice ? ["--voice", values.voice] : [];
    run("mlx_audio.tts.generate", [
      "--model", values.model, "--text", text, ...voice,
      "--output_path", folder, "--file_prefix", name, "--join_audio",
    ]);
    const made = join(folder, `${name}.wav`);
    if (!existsSync(made) || !(wavSeconds(made) > 0)) {
      throw new Error(`mlx_audio.tts.generate made no audio for ${name}`);
    }
    renameSync(made, join(out, `${name}.wav`));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

// Lower case words, without punctuation, so "TACO!" and "taco" compare equal.
function words(text) {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

const { values } = parseArgs({
  options: {
    script: { type: "string" },
    out: { type: "string" },
    model: { type: "string" },
    voice: { type: "string" },
    "asr-model": { type: "string", default: DEFAULT_ASR_MODEL },
    redo: { type: "string", default: "" },
  },
});
for (const name of ["script", "out", "model"]) {
  if (!values[name]) usage(`--${name} is required`);
}
const redo = new Set(values.redo.split(",").filter(Boolean).map(Number));

const texts = readFileSync(values.script, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
if (texts.length === 0) usage(`${values.script} has no lines`);

const out = values.out;
const asrDir = join(out, "asr");
mkdirSync(asrDir, { recursive: true });
const narrationFile = join(out, "narration.json");
const previous = existsSync(narrationFile) ? JSON.parse(readFileSync(narrationFile, "utf8")) : { lines: [] };
const sameVoice = previous.model === values.model && previous.voice === (values.voice ?? null);

const names = texts.map((_, i) => `line-${String(i + 1).padStart(2, "0")}`);
const keep = texts.map(
  (text, i) =>
    sameVoice && !redo.has(i + 1) && previous.lines[i]?.text === text && existsSync(join(out, `${names[i]}.wav`)),
);
// narration.json is what tells a rerun which WAVs to keep. Remove it before
// the first WAV changes, so a run that stops part way keeps no audio next time.
if (keep.includes(false)) rmSync(narrationFile, { force: true });

const lines = [];
let start = 0;
try {
  texts.forEach((text, i) => {
    const n = i + 1;
    const name = names[i];
    const wav = `${name}.wav`;
    if (!keep[i]) {
      console.error(`line ${n}: making audio`);
      makeAudio(text, name);
    }
    console.error(`line ${n}: transcribing`);
    const asrFile = join(asrDir, `${name}.json`);
    rmSync(asrFile, { force: true });
    run("mlx_audio.stt.generate", [
      "--model", values["asr-model"], "--audio", join(out, wav),
      "--output-path", join(asrDir, name), "--format", "json",
    ]);
    if (!existsSync(asrFile)) throw new Error(`mlx_audio.stt.generate made no transcript for ${name}`);
    const transcript = JSON.parse(readFileSync(asrFile, "utf8")).text.trim();
    const seconds = Math.round(wavSeconds(join(out, wav)) * 1000) / 1000;
    const match = words(transcript).join(" ") === words(text).join(" ");
    lines.push({ n, text, wav, start, seconds, transcript, match });
    // Times are rounded to the millisecond, so a sum reads 11.12, not 11.120000000000001.
    start = Math.round((start + seconds) * 1000) / 1000;
  });
} catch (error) {
  console.error(`narrate.mjs: ${error.message}`);
  process.exit(1);
}

writeFileSync(
  narrationFile,
  `${JSON.stringify({ model: values.model, voice: values.voice ?? null, totalSeconds: start, lines }, null, 2)}\n`,
);

const misreads = lines.filter((line) => !line.match);
console.log(`${lines.length - misreads.length} of ${lines.length} lines match. Total ${start.toFixed(2)} s.`);
for (const line of misreads) {
  console.log(`line ${line.n}: the script says "${line.text}"`);
  console.log(`line ${line.n}: the ASR heard "${line.transcript}"`);
}
process.exit(misreads.length ? 2 : 0);
