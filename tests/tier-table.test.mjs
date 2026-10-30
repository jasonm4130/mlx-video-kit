import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(join(root, "skills/video-setup/SKILL.md"), "utf8");

const GIB = 1024 ** 3;

// The rows of the markdown table whose header starts with "| Tier |",
// each as an object keyed by the header cells.
function tierTable(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith("| Tier |"));
  assert.notEqual(start, -1, "video-setup SKILL.md has no tier table");
  const cells = (line) =>
    line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim().replaceAll("`", ""));
  const header = cells(lines[start]);
  const rows = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    rows.push(Object.fromEntries(cells(line).map((cell, i) => [header[i], cell])));
  }
  return rows;
}

// Reads "16-31" or "128 or more" as { min, max } in GiB.
function memoryRange(text) {
  const bounded = /^(\d+)-(\d+)$/.exec(text);
  if (bounded) return { min: Number(bounded[1]), max: Number(bounded[2]) };
  const open = /^(\d+) or more$/.exec(text);
  assert.ok(open, `cannot read the memory range "${text}"`);
  return { min: Number(open[1]), max: Infinity };
}

// The row the skill tells the agent to pick for a `sysctl -n hw.memsize` value.
function pickRow(rows, memsize) {
  const gib = Math.floor(memsize / GIB);
  return rows.find((row) => {
    const { min, max } = memoryRange(row["Total memory (GiB)"]);
    return gib >= min && gib <= max;
  });
}

const rows = tierTable(skill);

test("the tier table has the four tiers in order", () => {
  assert.deepEqual(
    rows.map((row) => row.Tier),
    ["16 GB", "32-36 GB", "64 GB", "128 GB"],
  );
});

test("the memory ranges start at 16 GiB and leave no gap or overlap", () => {
  const ranges = rows.map((row) => memoryRange(row["Total memory (GiB)"]));
  assert.equal(ranges[0].min, 16);
  for (let i = 1; i < ranges.length; i++) {
    assert.equal(ranges[i].min, ranges[i - 1].max + 1, `${rows[i].Tier} does not start where ${rows[i - 1].Tier} ends`);
  }
  assert.equal(ranges.at(-1).max, Infinity);
});

for (const [memsize, tier, narration, image] of [
  [16 * GIB, "16 GB", "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit", "mflux-generate-iris --model iris-3b -q 8"],
  [24 * GIB, "16 GB", "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit", "mflux-generate-iris --model iris-3b -q 8"],
  [36 * GIB, "32-36 GB", "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit", "mflux-generate-flux2 --model flux2-klein-4b"],
  [64 * GIB, "64 GB", "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16", "mflux-generate-qwen --model qwen-image-2512 -q 8"],
  [128 * GIB, "128 GB", "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16", "mflux-generate-ernie-image-turbo --model ernie-image-turbo"],
]) {
  test(`a Mac with hw.memsize ${memsize} gets the ${tier} row`, () => {
    const row = pickRow(rows, memsize);
    assert.ok(row, `no row holds ${memsize / GIB} GiB`);
    assert.equal(row.Tier, tier);
    assert.equal(row["Narration model"], narration);
    assert.equal(row["Image command"], image);
  });
}

test("the 128 GB row names ERNIE-Image-Turbo as its image model", () => {
  assert.equal(pickRow(rows, 128 * GIB)["Image model"], "baidu/ERNIE-Image-Turbo");
});

test("a Mac with less than 16 GiB gets no row", () => {
  assert.equal(pickRow(rows, 8 * GIB), undefined);
});

test("only the 32-36 GB and 64 GB rows are marked unmeasured", () => {
  assert.deepEqual(
    rows.filter((row) => row.Status === "unmeasured").map((row) => row.Tier),
    ["32-36 GB", "64 GB"],
  );
});
