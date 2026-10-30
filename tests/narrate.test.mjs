import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const narrate = join(root, "skills/make-video/narrate.mjs");
const fixtureScript = join(root, "tests/fixtures/three-scenes/script.txt");

// Stand-in mlx-audio CLIs, so the test runs without MLX. The TTS writes a
// silent 16 kHz WAV of 0.25 s per word and keeps the text beside it. The ASR
// reads that text back, and mishears "TACO" as "Takeo", as Qwen3-TTS did in a
// real run. Each TTS call appends its text to calls.log.
const fakeTts = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
if (!process.argv.includes("--join_audio")) process.exit(3);
const text = arg("--text");
const file = path.join(arg("--output_path"), arg("--file_prefix") + ".wav");
const bytes = Math.round(text.split(/\\s+/).length * 0.25 * 16000) * 2;
const header = Buffer.alloc(44);
header.write("RIFF", 0); header.writeUInt32LE(36 + bytes, 4); header.write("WAVE", 8);
header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22); header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28);
header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write("data", 36); header.writeUInt32LE(bytes, 40);
fs.writeFileSync(file, Buffer.concat([header, Buffer.alloc(bytes)]));
fs.writeFileSync(file + ".txt", text);
fs.appendFileSync(path.join(process.env.FAKE_LOG_DIR, "calls.log"), text + "\\n");
`;

const fakeAsr = `#!/usr/bin/env node
const fs = require("node:fs");
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
if (arg("--format") !== "json") process.exit(3);
const text = fs.readFileSync(arg("--audio") + ".txt", "utf8").replace("TACO", "Takeo");
fs.writeFileSync(arg("--output-path") + ".json", JSON.stringify({ text }));
`;

function setup(scriptText) {
  const dir = mkdtempSync(join(tmpdir(), "narrate-test-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const [name, body] of [
    ["mlx_audio.tts.generate", fakeTts],
    ["mlx_audio.stt.generate", fakeAsr],
  ]) {
    writeFileSync(join(bin, name), body);
    chmodSync(join(bin, name), 0o755);
  }
  const script = join(dir, "script.txt");
  if (scriptText === undefined) copyFileSync(fixtureScript, script);
  else writeFileSync(script, scriptText);
  return { dir, bin, script, out: join(dir, "out") };
}

const defaultArgs = ["--model", "tts-model", "--voice", "Ryan"];

function run(env, args = defaultArgs) {
  const result = spawnSync(
    process.execPath,
    [narrate, "--script", env.script, "--out", env.out, ...args],
    { encoding: "utf8", env: { ...process.env, PATH: `${env.bin}:${process.env.PATH}`, FAKE_LOG_DIR: env.dir } },
  );
  const calls = readFileSync(join(env.dir, "calls.log"), { encoding: "utf8", flag: "a+" });
  return { ...result, calls: calls.split("\n").filter(Boolean) };
}

const readNarration = (env) => JSON.parse(readFileSync(join(env.out, "narration.json"), "utf8"));

test("the fixture script gives one WAV per line, back to back, and exits 0", () => {
  const env = setup();
  const result = run(env);
  assert.equal(result.status, 0, result.stderr);
  const narration = readNarration(env);
  assert.equal(narration.lines.length, 3);
  assert.deepEqual(
    narration.lines.map((line) => line.wav),
    ["line-01.wav", "line-02.wav", "line-03.wav"],
  );
  let start = 0;
  for (const line of narration.lines) {
    assert.equal(line.start, start);
    assert.equal(line.seconds, line.text.split(/\s+/).length * 0.25);
    assert.equal(line.match, true);
    start += line.seconds;
  }
  assert.equal(narration.totalSeconds, start);
  assert.match(result.stdout, /3 of 3 lines match/);
});

test("the ASR report names the line whose audio does not match its text, and exits 2", () => {
  const env = setup("We start the day.\nThen we order a TACO!\nAnd that is the end.\n");
  const result = run(env);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /line 2: /);
  assert.match(result.stdout, /Then we order a TACO!/);
  assert.match(result.stdout, /Then we order a Takeo!/);
  assert.doesNotMatch(result.stdout, /line [13]: /);
  assert.deepEqual(
    readNarration(env).lines.map((line) => line.match),
    [true, false, true],
  );
});

test("a rerun makes new audio only for a changed line, and still checks every line", () => {
  const env = setup("We start the day.\nThen we order a TACO!\nAnd that is the end.\n");
  run(env);
  writeFileSync(env.script, "We start the day.\nThen we order a taco!\nAnd that is the end.\n");
  const result = run(env);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.slice(3), ["Then we order a taco!"]);

  // Swap the audio of lines 2 and 3 on disk: no text changed, so no line gets
  // new audio, but the ASR still reads each WAV and finds both.
  copyFileSync(join(env.out, "line-03.wav.txt"), join(env.out, "line-02.wav.txt"));
  const swapped = run(env);
  assert.equal(swapped.status, 2);
  assert.equal(swapped.calls.length, 4);
  assert.match(swapped.stdout, /line 2: /);
});

test("--redo makes new audio for the named lines even when their text is the same", () => {
  const env = setup();
  run(env);
  const result = run(env, [...defaultArgs, "--redo", "1,3"]);
  assert.equal(result.status, 0, result.stderr);
  const lines = readFileSync(fixtureScript, "utf8").split("\n").filter(Boolean);
  assert.deepEqual(result.calls.slice(3), [lines[0], lines[2]]);
});

test("a changed model makes new audio for every line", () => {
  const env = setup();
  run(env);
  const result = run(env, ["--model", "other-model"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 6);
});

test("a missing --model is a usage error", () => {
  const env = setup();
  const result = run(env, []);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--model/);
});
