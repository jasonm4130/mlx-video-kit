# mlx-video-kit

mlx-video-kit is a plugin for Claude Code and Codex. It helps an agent make narrated videos on a Mac with Apple silicon. The narration and the images come from local MLX models, and HyperFrames renders the video. Nothing goes to a hosted model.

The plugin picks the models from the Mac's total memory, so a 16 GB Mac and a 128 GB Mac each get models that fit.

This repository is in early work.

## The reel

[![The mlx-video-kit reel: a laptop on a desk, with the title mlx-video-kit](reel/renders/poster.jpg)](reel/renders/mlx-video-kit-reel.mp4)

The plugin made its own reel, [`reel/renders/mlx-video-kit-reel.mp4`](reel/renders/mlx-video-kit-reel.mp4): 33.9 s at 1920x1080, with seven scenes. Click the picture to play it. The storyboard, the narration script, the image prompts and the HyperFrames project are in `reel/`.

It ran on an M5 Max with 128 GB, with the 128 GB row of the tier table:

| Step | Model or tool | Time | Peak memory |
| --- | --- | --- | --- |
| Narration, 7 lines, with the ASR check | `mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16`, voice Ryan; `mlx-community/Qwen3-ASR-0.6B-8bit` | 59.0 s | 4.76 GB |
| Images, 7 at 1664x928 | `baidu/ERNIE-Image-Turbo` with `mflux-generate-ernie-image-turbo` | 373.9 s | 23.70 GB |
| Render, 33.9 s of video | HyperFrames 0.8.222 | 85.5 s | 0.76 GB |
| Total | | 518.4 s | 23.70 GB |

Time is the wall time from `/usr/bin/time -l`. Peak memory is its maximum resident set size, which is the largest single process of the step. The narration time adds two runs: the first made all seven lines, and the ASR check named two misreads, so the second made those two lines again. All seven lines then matched. After the image run, scene 4 was made again with a clearer prompt; that run is not in the table.

## Skills

- `video-setup` checks the tools, installs the MLX tools and downloads the models for this Mac. Run it once per Mac.
- `make-video` writes a storyboard, makes the narration, checks each line with a local speech-to-text model, and renders the video with HyperFrames. Its script `narrate.mjs` makes one WAV per narration line and names each line whose transcript differs from its text. Its script `images.mjs` makes one image per scene with the tier's image model.

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

The `video-setup` skill reads the Mac's total memory with `sysctl -n hw.memsize` and picks one row of the tier table in `skills/video-setup/SKILL.md`. The tiers are 16 GB, 32-36 GB, 64 GB and 128 GB. The narration models are Qwen3-TTS CustomVoice, and the image models are Iris-3B Turbo, FLUX.2-klein-4B, Qwen-Image-2512 and ERNIE-Image-Turbo.

Every model is Apache-2.0. The 32-36 GB and 64 GB rows are unmeasured: nobody has recorded the peak memory of their image models yet. `docs/samples/` holds the images and narration that set the 128 GB row. The skill downloads the models from Hugging Face; this repository holds no weights.

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

The script needs Node.js 22 or later and the `claude` CLI. It runs the tests in `tests/` and then `claude plugin validate --strict .`. The tests fail when the version fields in the four manifests differ, or when a `SKILL.md` has no description. The `narrate.mjs` tests run the script with stand-in mlx-audio commands, so they need no MLX models. When you change the version, change it in all four files.

## Licence

MIT. See `LICENSE`.
