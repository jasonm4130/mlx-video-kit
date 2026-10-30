---
name: video-setup
description: Set up this Mac to make videos with mlx-video-kit. Use once per Mac, before the first video, or when a model or tool is missing.
---

# Set up a Mac for mlx-video-kit

Do the steps in order. Stop at the first step that fails, and tell the user what failed and how to fix it.

## 1. Check the tools

This plugin runs only on a Mac with Apple silicon. Run each check:

```sh
uname -sm
uv --version
ffmpeg -version | head -1
node --version
npx --yes hyperframes --version
```

- `uname -sm` must print `Darwin arm64`.
- If `uv` is missing, tell the user to install it from https://docs.astral.sh/uv/.
- If `ffmpeg` is missing, tell the user to run `brew install ffmpeg`.
- `node --version` must print v22 or later. If it does not, tell the user to install Node.js 22 or later.
- `npx hyperframes --version` fetches the HyperFrames CLI from npm and prints its version. If it fails, show the user its error.
- The `make-video` skill also needs the HyperFrames plugin. If the user has not installed it, tell them to install it from https://github.com/heygen-com/hyperframes. Do not install it for them.

## 2. Install the MLX tools

```sh
uv tool install mlx-audio --with soundfile
uv tool install mflux
```

mlx-audio makes the narration. It does not install `soundfile`, which it needs to write WAV files, so the first command adds it. mflux makes the images.

If a tool is already installed, uv says so and changes nothing. That is not a failure.

## 3. Pick the tier

Read the total memory in GiB:

```sh
echo $(( $(sysctl -n hw.memsize) / 1073741824 ))
```

Pick the one row of the table below whose "Total memory" holds that number. If the number is less than 16, stop: tell the user that the Mac has less memory than the smallest tier.

| Tier | Total memory (GiB) | Narration model | Image model | Image command | Status |
| --- | --- | --- | --- | --- | --- |
| 16 GB | 16-31 | `mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit` | `speridlabs/iris-3b` | `mflux-generate-iris --model iris-3b -q 8` | measured |
| 32-36 GB | 32-63 | `mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit` | `black-forest-labs/FLUX.2-klein-4B` | `mflux-generate-flux2 --model flux2-klein-4b` | unmeasured |
| 64 GB | 64-127 | `mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16` | `Qwen/Qwen-Image-2512` | `mflux-generate-qwen --model qwen-image-2512 -q 8` | unmeasured |
| 128 GB | 128 or more | `mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16` | `baidu/ERNIE-Image-Turbo` | `mflux-generate-ernie-image-turbo --model ernie-image-turbo` | measured |

Every model in the table is Apache-2.0. The Iris image command also downloads its text encoder, `Qwen/Qwen3-VL-4B-Instruct`, which is Apache-2.0 too.

The 128 GB row keeps Qwen3-TTS for narration after a comparison with `mlx-community/VoxCPM2-bf16` on 9 lines. Both models had no clipping, peaked at -4.6 to -4.7 dBFS and matched 9 of 9 lines on an ASR check. Qwen3-TTS spoke at 1.8 to 2.6 words per second, had a loudness spread of 5.8 dB and paused at most 0.42 s inside a line. VoxCPM2 spoke at 2.4 to 3.3 words per second, had a spread of 4.8 dB, paused at most 0.54 s and added 0.3 to 0.6 s of silence at the end. Qwen3-TTS was faster and used less memory, and it has the named voices that the `make-video` skill passes. These numbers do not measure how natural the voice sounds.

"measured" means that someone has recorded the peak memory of that row's image model. "unmeasured" means that nobody has, so the row can need more memory than the Mac has. When you pick an unmeasured row, tell the user this.

Tell the user the tier you picked, the memory you read, and the two models.

## 4. Download the models

The first run of each model downloads it to the Hugging Face cache, `~/.cache/huggingface/hub`. A second run downloads nothing. Make one short test of each model in a new temporary folder. Put the tier's models in the commands:

```sh
out=$(mktemp -d)
mlx_audio.tts.generate --model <narration model> --text "mlx-video-kit is ready." --voice Ryan --output_path "$out"
<image command> --prompt "a red fox in fresh snow" --steps 2 --width 256 --height 256 --seed 1 --output "$out/test.png"
ls -l "$out"
```

The image downloads are large: about 14 GB for the 16 GB tier, 16 GB for the 32-36 GB tier, 58 GB for the 64 GB tier and 32 GB for the 128 GB tier. Tell the user the size before you start the image command.

Each command must exit 0, and the folder must hold one WAV file and `test.png`. The test image is small and has few steps, so it can look rough. That is not a failure.

## 5. Report

Tell the user:

- the tier and the two models,
- that each test made its file,
- that the Mac is ready for the `make-video` skill.
