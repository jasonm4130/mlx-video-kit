---
name: make-video
description: Make a narrated video with local MLX narration and MLX images, rendered by HyperFrames. Use when the user asks for a video, a reel or an explainer.
---

# Make a narrated video

Do the steps in order. Stop at the first step that fails, and tell the user what failed.

This skill's folder holds `narrate.mjs` and `images.mjs`. In the commands below, `<skill folder>` is the folder of this SKILL.md file. Run the `video-setup` skill first if this Mac has not run it.

## 1. Pick the tier

Read the total memory in GiB, and pick the row of the tier table in `../video-setup/SKILL.md`, relative to this skill's folder, exactly as that skill says:

```sh
echo $(( $(sysctl -n hw.memsize) / 1073741824 ))
```

Use the row's narration model in step 4 and its image command in step 5. Tell the user the tier, the narration model and the image model.

## 2. Make the project folder

Make a HyperFrames project in a new folder. Use the video's name, in lower case with hyphens, as `<project>`:

```sh
npx --yes hyperframes init <project> --example blank --non-interactive --skip-skills
mkdir -p <project>/assets/narration <project>/assets/images
```

## 3. Write the storyboard

Write `<project>/storyboard.md`: a table with one row per scene. Each row has the scene number, the narration line, the on-screen text and the image prompt. Show it to the user and change it as they ask before you go on.

Write each narration line for the ear:

- Use one or two short sentences.
- Write a number in words: "twenty", not "20".
- Write a word in capitals only if the voice must spell it out: "M L X", not "MLX". The voice can misread a word in capitals; "TACO!" came out as "Takeo".

Write each image prompt as one line that says what the picture shows: the subject, the place, the light and the style, for example "a red fox in fresh snow at dawn, photograph". Do not ask for words in the image; the on-screen text goes over it in step 6.

Then write two files, each with one line per scene in scene order, no blank lines and no scene numbers:

- `<project>/script.txt`: the narration lines.
- `<project>/prompts.txt`: the image prompts.

## 4. Make the narration

```sh
node "<skill folder>/narrate.mjs" --script <project>/script.txt --out <project>/assets/narration --model <narration model> --voice Ryan
```

The script makes `line-01.wav`, `line-02.wav` and so on with mlx-audio. Then it transcribes each WAV with Qwen3-ASR 0.6B 8-bit and compares the transcript with the line. It writes `narration.json` to the same folder, with each line's `start` and `seconds`, and `totalSeconds`.

- Exit 0: every line matches. Go to step 5.
- Exit 2: the script names each line whose transcript differs from its text, with what the ASR heard. For each one, change the line in `script.txt` and in the storyboard, for example spell a word as it sounds, and run the command again. A rerun makes new audio only for a changed line. To make new audio for a line with the same text, add `--redo <n>`, for example `--redo 2,5`. Repeat until the script exits 0. After three tries on one line, show the user the line and what the ASR heard, and ask what to do.
- Exit 1: show the user the error.

The voices of the Qwen3-TTS CustomVoice models include `Ryan`, `Aiden`, `Vivian` and `Serena`. Use another voice only when the user asks.

## 5. Make the images

```sh
node "<skill folder>/images.mjs" --prompts <project>/prompts.txt --out <project>/assets/images --command "<image command>"
```

The script runs the tier's image command once per prompt, and makes `scene-01.png`, `scene-02.png` and so on. Scene 1 takes seed 1, scene 2 seed 2, and so on, so a rerun of the same prompt makes the same image. It writes `images.json` to the same folder, with each image's prompt and seed.

Each image is 1664x928, Qwen-Image's 16:9 size. mflux needs a width and a height that are multiples of 16, so it cannot make 1920x1080; the scene in step 6 scales the image to fill the frame. Change the size only when the user asks, with `--width` and `--height`.

- Exit 0: every scene has its image. Show the user the images.
- Exit 1: show the user the error.

To change an image, change its prompt in `prompts.txt` and in the storyboard, and run the command again. A rerun makes new images only for changed prompts: the same prompt and seed make the same image again.

The first run of a large image model can take some minutes per image. Tell the user the number of images before you start.

## 6. Place the media in the HyperFrames project

Write `<project>/index.html`. Start from the blank example that step 2 made, and keep its GSAP script and its timeline. For each line in `narration.json`, add one scene with its image and one `<audio>` element, with the line's `start` as `data-start` and its `seconds` as `data-duration`. Set the root `data-duration` to `totalSeconds`. Scenes follow one another with no gap, so the video lasts as long as the narration.

For a narration of two lines, of 3.52 s and 4.56 s, the body is:

```html
<div id="root" data-composition-id="main" data-start="0" data-duration="8.08" data-width="1920" data-height="1080">
  <section id="scene-1" class="clip scene" data-start="0" data-duration="3.52" data-track-index="0">
    <img class="scene-image" src="assets/images/scene-01.png" alt="">
    <h1>On-screen text of scene 1</h1>
  </section>
  <section id="scene-2" class="clip scene" data-start="3.52" data-duration="4.56" data-track-index="0">
    <img class="scene-image" src="assets/images/scene-02.png" alt="">
    <h1>On-screen text of scene 2</h1>
  </section>
  <audio id="narration-1" src="assets/narration/line-01.wav" data-start="0" data-duration="3.52" data-track-index="1"></audio>
  <audio id="narration-2" src="assets/narration/line-02.wav" data-start="3.52" data-duration="4.56" data-track-index="1"></audio>
</div>
```

Make each image fill its scene, behind the text:

```css
.scene { position: absolute; inset: 0; overflow: hidden; }
.scene-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.scene h1 { position: relative; }
```

Put each scene's on-screen text from the storyboard in its `<section>`, and keep it legible over the image, for example with a text shadow or a dark band behind it. Style and animate the scenes as the HyperFrames plugin's skills say. Do not change a scene's `data-start` or `data-duration`.

Then check the composition, and fix each error it reports:

```sh
npx --yes hyperframes check <project>
```

## 7. Render the video

```sh
npx --yes hyperframes render <project> --output <project>/renders/<project>.mp4
```

Check the duration of the MP4:

```sh
ffprobe -v error -show_entries format=duration -of csv=p=0 <project>/renders/<project>.mp4
```

It must be within 0.5 s of `totalSeconds` in `narration.json`. If it is not, a scene or an `<audio>` element has the wrong timing: compare `index.html` with `narration.json`, fix it and render again.

## 8. Report

Tell the user:

- the path of the MP4 and its duration,
- the tier, the narration model and the image model,
- each narration line you changed after the ASR check, and why.
