# mlx-video-kit

mlx-video-kit is a plugin for Claude Code and Codex. It helps an agent make narrated videos on a Mac with Apple silicon. The narration and the images come from local MLX models, and HyperFrames renders the video. Nothing goes to a hosted model.

The plugin picks the models from the Mac's total memory, so a 16 GB Mac and a 128 GB Mac each get models that fit.

This repository is in early work. The `make-video` skill is a placeholder until a later change fills it in.

## Skills

- `video-setup` checks the tools, installs the MLX tools and downloads the models for this Mac. Run it once per Mac.
- `make-video` writes a storyboard, makes the narration and the images, and renders the video with HyperFrames.

## Install

In Claude Code:

```sh
claude plugin marketplace add jasonm4130/mlx-video-kit
claude plugin install mlx-video-kit@mlx-video-kit
```

In Codex:

```sh
codex plugin marketplace add jasonm4130/mlx-video-kit
codex plugin add mlx-video-kit@mlx-video-kit
```

The plugin also needs the HyperFrames plugin. Install it yourself from https://github.com/heygen-com/hyperframes. The `video-setup` skill checks that `npx hyperframes` runs, but it does not install HyperFrames.

## Models by memory

The `video-setup` skill reads the Mac's total memory with `sysctl -n hw.memsize` and picks one row of the tier table in `skills/video-setup/SKILL.md`. The tiers are 16 GB, 32-36 GB, 64 GB and 128 GB. The narration models are Qwen3-TTS CustomVoice, and the image models are Iris-3B Turbo, FLUX.2-klein-4B and Qwen-Image-2512.

Every model is Apache-2.0. The 32-36 GB and 64 GB rows are unmeasured: nobody has recorded the peak memory of their image models yet. The skill downloads the models from Hugging Face; this repository holds no weights.

## Layout

The plugin sits at the repository root, and one repository serves both agents.

- `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` are the Claude Code manifests.
- `plugin.json` is the Codex manifest, in the Agent Plugins schema.
- `.agents/plugins/marketplace.json` is the Codex marketplace.
- `skills/` holds the skills. Both agents read the same files.

The plugin has no hooks and no MCP server, because Codex runs plugin hooks only in some installs. A skill finds its own files relative to its own folder, not through `${CLAUDE_PLUGIN_ROOT}`.

## Development

Run the checks with:

```sh
bash scripts/check
```

The script needs Node.js 22 or later and the `claude` CLI. It runs the tests in `tests/` and then `claude plugin validate --strict .`. The tests fail when the version fields in the four manifests differ, or when a `SKILL.md` has no description. When you change the version, change it in all four files.

## Licence

MIT. See `LICENSE`.
