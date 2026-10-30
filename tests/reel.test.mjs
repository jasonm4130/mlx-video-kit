import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { markdownTable } from "./markdown-table.mjs";

// The reel in reel/ is the plugin's own output. These tests keep its files in
// step: a changed line, prompt or model must be made and rendered again.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reel = join(root, "reel");
const read = (path) => readFileSync(join(reel, path), "utf8");
const lines = (path) => read(path).split(/\r?\n/).filter((line) => line.trim());

const narration = JSON.parse(read("assets/narration/narration.json"));
const images = JSON.parse(read("assets/images/images.json"));
const storyboard = markdownTable(read("storyboard.md"), "Scene");
const row128 = markdownTable(readFileSync(join(root, "skills/video-setup/SKILL.md"), "utf8"), "Tier").find(
  (row) => row.Tier === "128 GB",
);
const html = read("index.html");

// The data-start and data-duration of the element with this id in index.html.
function timing(id) {
  const tag = new RegExp(`<[^>]*\\bid="${id}"[^>]*>`).exec(html);
  assert.ok(tag, `index.html has no element with id "${id}"`);
  const attr = (name) => Number(new RegExp(`${name}="([^"]*)"`).exec(tag[0])?.[1]);
  return { start: attr("data-start"), duration: attr("data-duration") };
}

test("the storyboard, script and prompts list the same scenes in order", () => {
  assert.deepEqual(lines("script.txt"), storyboard.map((row) => row.Narration));
  assert.deepEqual(lines("prompts.txt"), storyboard.map((row) => row["Image prompt"]));
});

test("the narration is of the script, by the 128 GB narration model, and every line passed the ASR check", () => {
  assert.equal(narration.model, row128["Narration model"]);
  assert.deepEqual(narration.lines.map((line) => line.text), lines("script.txt"));
  for (const line of narration.lines) {
    assert.ok(line.match, `line ${line.n}: the ASR heard "${line.transcript}"`);
    assert.ok(existsSync(join(reel, "assets/narration", line.wav)), `${line.wav} is missing`);
  }
  assert.ok(narration.totalSeconds >= 30 && narration.totalSeconds <= 60, `${narration.totalSeconds} s is not 30 to 60 s`);
});

test("the images are of the prompts, by the 128 GB image command", () => {
  assert.equal(images.command, row128["Image command"]);
  assert.deepEqual(images.images.map((image) => image.prompt), lines("prompts.txt"));
  for (const image of images.images) {
    assert.ok(existsSync(join(reel, "assets/images", image.png)), `${image.png} is missing`);
  }
});

test("index.html places each scene and its narration at the narration's times", () => {
  assert.equal(timing("root").duration, narration.totalSeconds);
  for (const line of narration.lines) {
    const expected = { start: line.start, duration: line.seconds };
    assert.deepEqual(timing(`scene-${line.n}`), expected, `scene-${line.n}`);
    assert.deepEqual(timing(`narration-${line.n}`), expected, `narration-${line.n}`);
  }
  for (const [, src] of html.matchAll(/src="(assets\/[^"]+)"/g)) {
    assert.ok(existsSync(join(reel, src)), `index.html uses ${src}, which is missing`);
  }
});

test("the README shows the render, and both files exist", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  for (const path of ["reel/renders/poster.jpg", "reel/renders/mlx-video-kit-reel.mp4"]) {
    assert.ok(readme.includes(`](${path})`), `the README does not link ${path}`);
    assert.ok(existsSync(join(root, path)), `${path} is missing`);
  }
});
