---
name: make-video
description: Make a narrated video with local MLX narration and MLX images, rendered by HyperFrames. Use when the user asks for a video, a reel or an explainer.
---

# Make a narrated video

Do the steps in order. Stop at the first step that fails, and tell the user what failed.

This version makes the narration and renders scenes of text. It does not make images yet; a later change adds the image step.

This skill's folder holds `narrate.mjs`. In the commands below, `<skill folder>` is the folder of this SKILL.md file. Run the `video-setup` skill first if this Mac has not run it.

## 1. Pick the tier

Read the total memory in GiB, and pick the row of the tier table in `../video-setup/SKILL.md`, relative to this skill's folder, exactly as that skill says:

```sh
echo $(( $(sysctl -n hw.memsize) / 1073741824 ))
```

Use the row's narration model in step 4. Tell the user the tier and the narration model.

## 2. Make the project folder

Make a HyperFrames project in a new folder. Use the video's name, in lower case with hyphens, as `<project>`:

```sh
npx --yes hyperframes init <project> --example blank --non-interactive --skip-skills
mkdir -p <project>/assets/narration
```

## 3. Write the storyboard

Write `<project>/storyboard.md`: a table with one row per scene. Each row has the scene number, the narration line and the on-screen text. Show it to the user and change it as they ask before you go on.

Write each narration line for the ear:

- Use one or two short sentences.
- Write a number in words: "twenty", not "20".
- Write a word in capitals only if the voice must spell it out: "M L X", not "MLX". The voice can misread a word in capitals; "TACO!" came out as "Takeo".

Then write `<project>/script.txt`: the narration lines in scene order, one per line, with no blank lines and no scene numbers.

## 4. Make the narration

```sh
node "<skill folder>/narrate.mjs" --script <project>/script.txt --out <project>/assets/narration --model <narration model> --voice Ryan
```

The script makes `line-01.wav`, `line-02.wav` and so on with mlx-audio. Then it transcribes each WAV with Qwen3-ASR 0.6B 8-bit and compares the transcript with the line. It writes `narration.json` to the same folder, with each line's `start` and `seconds`, and `totalSeconds`.

- Exit 0: every line matches. Go to step 5.
- Exit 2: the script names each line whose transcript differs from its text, with what the ASR heard. For each one, change the line in `script.txt` and in the storyboard, for example spell a word as it sounds, and run the command again. A rerun makes new audio only for a changed line. To make new audio for a line with the same text, add `--redo <n>`, for example `--redo 2,5`. Repeat until the script exits 0. After three tries on one line, show the user the line and what the ASR heard, and ask what to do.
- Exit 1: show the user the error.

The voices of the Qwen3-TTS CustomVoice models include `Ryan`, `Aiden`, `Vivian` and `Serena`. Use another voice only when the user asks.

## 5. Place the media in the HyperFrames project

Write `<project>/index.html`. Start from the blank example that step 2 made, and keep its GSAP script and its timeline. For each line in `narration.json`, add one scene and one `<audio>` element, with the line's `start` as `data-start` and its `seconds` as `data-duration`. Set the root `data-duration` to `totalSeconds`. Scenes follow one another with no gap, so the video lasts as long as the narration.

For a narration of two lines, of 3.52 s and 4.56 s, the body is:

```html
<div id="root" data-composition-id="main" data-start="0" data-duration="8.08" data-width="1920" data-height="1080">
  <section id="scene-1" class="clip scene" data-start="0" data-duration="3.52" data-track-index="0">
    <h1>On-screen text of scene 1</h1>
  </section>
  <section id="scene-2" class="clip scene" data-start="3.52" data-duration="4.56" data-track-index="0">
    <h1>On-screen text of scene 2</h1>
  </section>
  <audio id="narration-1" src="assets/narration/line-01.wav" data-start="0" data-duration="3.52" data-track-index="1"></audio>
  <audio id="narration-2" src="assets/narration/line-02.wav" data-start="3.52" data-duration="4.56" data-track-index="1"></audio>
</div>
```

Put each scene's on-screen text from the storyboard in its `<section>`. Style and animate the scenes as the HyperFrames plugin's skills say. Do not change a scene's `data-start` or `data-duration`.

Then check the composition, and fix each error it reports:

```sh
npx --yes hyperframes check <project>
```

## 6. Render the video

```sh
npx --yes hyperframes render <project> --output <project>/renders/<project>.mp4
```

Check the duration of the MP4:

```sh
ffprobe -v error -show_entries format=duration -of csv=p=0 <project>/renders/<project>.mp4
```

It must be within 0.5 s of `totalSeconds` in `narration.json`. If it is not, a scene or an `<audio>` element has the wrong timing: compare `index.html` with `narration.json`, fix it and render again.

## 7. Report

Tell the user:

- the path of the MP4 and its duration,
- the tier and the narration model,
- each narration line you changed after the ASR check, and why.
