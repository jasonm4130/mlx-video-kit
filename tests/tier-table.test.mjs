import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { markdownTable } from "./markdown-table.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(join(root, "skills/video-setup/SKILL.md"), "utf8");

const GIB = 1024 ** 3;

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

const rows = markdownTable(skill, "Tier");

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
  [64 * GIB, "64 GB", "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16", "mflux-generate-ernie-image-turbo --model ernie-image-turbo"],
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

for (const memsize of [64 * GIB, 128 * GIB]) {
  test(`a Mac with hw.memsize ${memsize} gets ERNIE-Image-Turbo as its image model`, () => {
    assert.equal(pickRow(rows, memsize)["Image model"], "baidu/ERNIE-Image-Turbo");
  });
}

test("a Mac with less than 16 GiB gets no row", () => {
  assert.equal(pickRow(rows, 8 * GIB), undefined);
});

test("only the 32-36 GB row is marked unmeasured", () => {
  assert.deepEqual(
    rows.filter((row) => row.Status === "unmeasured").map((row) => row.Tier),
    ["32-36 GB"],
  );
});
