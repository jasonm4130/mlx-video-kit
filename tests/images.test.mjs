import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const images = join(root, "skills/make-video/images.mjs");
const fixturePrompts = join(root, "tests/fixtures/three-scenes/prompts.txt");

// A stand-in mflux command, so the test runs without MLX. It appends its
// arguments to calls.log, one JSON array per call, and writes a PNG that holds
// the prompt and the seed after its signature. FAKE_MFLUX_WRITES_NOTHING makes
// it exit 0 with no PNG; FAKE_MFLUX_EXIT makes it fail with that code.
const fakeMflux = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
fs.appendFileSync(path.join(process.env.FAKE_LOG_DIR, "calls.log"), JSON.stringify(process.argv.slice(2)) + "\\n");
if (process.env.FAKE_MFLUX_EXIT) process.exit(Number(process.env.FAKE_MFLUX_EXIT));
if (process.env.FAKE_MFLUX_WRITES_NOTHING) process.exit(0);
const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
fs.writeFileSync(arg("--output"), Buffer.concat([signature, Buffer.from(arg("--seed") + ":" + arg("--prompt"))]));
`;

function setup(promptsText) {
  const dir = mkdtempSync(join(tmpdir(), "images-test-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "mflux-generate-fake"), fakeMflux);
  chmodSync(join(bin, "mflux-generate-fake"), 0o755);
  const prompts = join(dir, "prompts.txt");
  writeFileSync(prompts, promptsText ?? readFileSync(fixturePrompts, "utf8"));
  return { dir, bin, prompts, out: join(dir, "out") };
}

const command = "mflux-generate-fake --model fake-model -q 8";

function run(env, args = [], fakeEnv = {}) {
  const result = spawnSync(
    process.execPath,
    [images, "--prompts", env.prompts, "--out", env.out, "--command", command, ...args],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: `${env.bin}:${process.env.PATH}`, FAKE_LOG_DIR: env.dir, ...fakeEnv },
    },
  );
  const calls = readFileSync(join(env.dir, "calls.log"), { encoding: "utf8", flag: "a+" });
  return { ...result, calls: calls.split("\n").filter(Boolean).map((line) => JSON.parse(line)) };
}

const flag = (call, name) => call[call.indexOf(name) + 1];
const readImages = (env) => JSON.parse(readFileSync(join(env.out, "images.json"), "utf8"));
const pngText = (env, name) => readFileSync(join(env.out, name)).subarray(8).toString();

test("the fixture prompts give one PNG per prompt, with fixed seeds and a 1664x928 size", () => {
  const env = setup();
  const result = run(env);
  assert.equal(result.status, 0, result.stderr);
  const prompts = readFileSync(fixturePrompts, "utf8").trim().split("\n");
  assert.equal(prompts.length, 3);

  assert.deepEqual(
    readdirSync(env.out).filter((name) => name.endsWith(".png")).sort(),
    ["scene-01.png", "scene-02.png", "scene-03.png"],
  );
  assert.equal(result.calls.length, 3);
  result.calls.forEach((call, i) => {
    assert.deepEqual(call.slice(0, 3), ["--model", "fake-model", "-q"]);
    assert.equal(flag(call, "--prompt"), prompts[i]);
    assert.equal(flag(call, "--seed"), String(i + 1));
    assert.equal(flag(call, "--width"), "1664");
    assert.equal(flag(call, "--height"), "928");
    assert.equal(pngText(env, `scene-0${i + 1}.png`), `${i + 1}:${prompts[i]}`);
  });

  const manifest = readImages(env);
  assert.equal(manifest.command, command);
  assert.equal(manifest.width, 1664);
  assert.equal(manifest.height, 928);
  assert.deepEqual(
    manifest.images.map((image) => [image.n, image.png, image.seed, image.prompt]),
    prompts.map((prompt, i) => [i + 1, `scene-0${i + 1}.png`, i + 1, prompt]),
  );
  assert.match(result.stdout, /3 images in /);
});

test("a second run with the same prompts gives the same seeds", () => {
  const first = run(setup());
  const second = run(setup());
  assert.deepEqual(
    second.calls.map((call) => flag(call, "--seed")),
    first.calls.map((call) => flag(call, "--seed")),
  );
});

test("--seed sets the first seed, each next scene takes the next seed, and a new seed makes new images", () => {
  const env = setup();
  run(env);
  const result = run(env, ["--seed", "40"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    result.calls.slice(3).map((call) => flag(call, "--seed")),
    ["40", "41", "42"],
  );
  assert.equal(pngText(env, "scene-01.png").split(":")[0], "40");
});

test("a size that is not a multiple of 16 is refused before mflux runs", () => {
  const env = setup();
  const result = run(env, ["--width", "1920", "--height", "1080"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--height 1080 is not a multiple of 16/);
  assert.equal(result.calls.length, 0);
});

test("a rerun makes a new image only for a changed prompt", () => {
  const env = setup("A red fox.\nA blue lake.\nA green hill.\n");
  run(env);
  writeFileSync(env.prompts, "A red fox.\nA grey lake.\nA green hill.\n");
  const result = run(env);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    result.calls.slice(3).map((call) => flag(call, "--prompt")),
    ["A grey lake."],
  );
  assert.equal(pngText(env, "scene-02.png"), "2:A grey lake.");
  assert.equal(readImages(env).images[1].prompt, "A grey lake.");
});

test("a rerun with another command or size makes every image again", () => {
  const env = setup("A red fox.\nA blue lake.\n");
  run(env);
  const result = run(env, ["--width", "1024", "--height", "576"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 4);
  assert.equal(flag(result.calls[3], "--height"), "576");
});

test("a command that exits 0 with no PNG is an error, and the old PNG is not kept as new", () => {
  const env = setup("A red fox.\n");
  run(env);
  writeFileSync(env.prompts, "A white fox.\n");
  const result = run(env, [], { FAKE_MFLUX_WRITES_NOTHING: "1" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /made no image for scene-01/);
  assert.equal(existsSync(join(env.out, "images.json")), false);
  assert.equal(readdirSync(env.out).some((name) => name.startsWith(".mflux-")), false);
});

test("a command that fails stops the run with exit 1", () => {
  const env = setup("A red fox.\n");
  const result = run(env, [], { FAKE_MFLUX_EXIT: "4" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /mflux-generate-fake exited 4/);
});

test("a missing argument is refused with the usage line", () => {
  const env = setup();
  const result = spawnSync(process.execPath, [images, "--prompts", env.prompts, "--out", env.out], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--command is required/);
  assert.match(result.stderr, /usage: /);
});
