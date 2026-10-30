import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function pluginEntry(rel) {
  const entry = readJson(rel).plugins.find((p) => p.name === "mlx-video-kit");
  assert.ok(entry, `${rel}: no plugins[] entry named mlx-video-kit`);
  return entry;
}

test("every version field in the four manifests is the same", () => {
  const versions = {
    ".claude-plugin/plugin.json": readJson(".claude-plugin/plugin.json").version,
    ".claude-plugin/marketplace.json": pluginEntry(".claude-plugin/marketplace.json").version,
    "plugin.json": readJson("plugin.json").version,
    ".agents/plugins/marketplace.json": pluginEntry(".agents/plugins/marketplace.json").version,
  };
  for (const [file, version] of Object.entries(versions)) {
    assert.match(String(version), /^\d+\.\d+\.\d+$/, `${file}: version is missing or not x.y.z`);
  }
  assert.equal(new Set(Object.values(versions)).size, 1, `versions differ: ${JSON.stringify(versions, null, 2)}`);
});

// A one-line YAML value without its quotes or trailing comment. A YAML null
// reads as "", because the YAML parser gives no description for it.
function scalarValue(raw) {
  const quoted = /^(["'])(.*?)\1/.exec(raw);
  if (quoted) return quoted[2].trim();
  const plain = raw.replace(/(^|\s)#.*$/, "").trim();
  return /^(null|Null|NULL|~)?$/.test(plain) ? "" : plain;
}

// Returns the description from the frontmatter, or "" when there is none.
// Reads a one-line value, a quoted value, or a `>` or `|` block scalar.
function skillDescription(content) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(content);
  if (!frontmatter) return "";
  const lines = frontmatter[1].split(/\r?\n/);
  const i = lines.findIndex((line) => /^description:/.test(line));
  if (i === -1) return "";
  const value = lines[i].slice("description:".length).trim();
  if (!/^[>|][-+]?(\s+#.*)?$/.test(value)) return scalarValue(value);
  const block = [];
  for (const line of lines.slice(i + 1)) {
    if (line.trim() !== "" && !/^\s/.test(line)) break;
    block.push(line.trim());
  }
  return block.join(" ").trim();
}

test("skillDescription reads each frontmatter form", () => {
  assert.equal(skillDescription("---\nname: a\ndescription: Make a video.\n---\n"), "Make a video.");
  assert.equal(skillDescription('---\ndescription: "Make a video."\n---\n'), "Make a video.");
  assert.equal(skillDescription("---\ndescription: >\n  Make a\n  video.\nname: a\n---\n"), "Make a video.");
  assert.equal(skillDescription("---\ndescription: |-\n  Make a video.\n---\n"), "Make a video.");
  assert.equal(skillDescription("---\nname: a\ndescription:\n---\n"), "");
  assert.equal(skillDescription('---\ndescription: ""\n---\n'), "");
  assert.equal(skillDescription("---\ndescription: Make a video. # draft\n---\n"), "Make a video.");
  assert.equal(skillDescription("---\ndescription: > # folded\n  Make a video.\n---\n"), "Make a video.");
  assert.equal(skillDescription('---\ndescription: "" # removed\n---\n'), "");
  assert.equal(skillDescription("---\ndescription: # removed\n---\n"), "");
  assert.equal(skillDescription("---\ndescription: null\n---\n"), "");
  assert.equal(skillDescription("---\ndescription: ~\n---\n"), "");
  assert.equal(skillDescription("---\nname: a\n---\n"), "");
  assert.equal(skillDescription("no frontmatter\n"), "");
});

const skillsDir = join(root, "skills");
const skillFiles = readdirSync(skillsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join("skills", entry.name, "SKILL.md"));

test("the skills folder holds at least one skill", () => {
  assert.ok(skillFiles.length > 0, "found no folder under skills/");
});

for (const rel of skillFiles) {
  test(`${rel} has a description`, () => {
    const description = skillDescription(readFileSync(join(root, rel), "utf8"));
    assert.ok(description.length > 0, `${rel}: frontmatter has no description`);
  });
}
