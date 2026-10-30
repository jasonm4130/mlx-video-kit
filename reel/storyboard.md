# mlx-video-kit reel storyboard

A reel of about 34 s about mlx-video-kit, made with the plugin itself. The `make-video` skill reads this table. `script.txt` holds the narration lines in the same order.

| Scene | Narration | On-screen text | Image prompt |
| --- | --- | --- | --- |
| 1 | This is MLX video kit. | mlx-video-kit | A silver laptop on a dark wooden desk at night, its screen glowing with a strip of film frames, soft blue light, cinematic, shallow depth of field |
| 2 | It is a plugin for Claude Code and Codex that makes narrated videos on a Mac. | A plugin for Claude Code and Codex | A small film studio built inside a laptop keyboard, tiny cameras and lights on the keys, warm studio light, miniature photography |
| 3 | Every voice and every picture in this reel comes from a model on this machine. | Local voices. Local pictures. | A glowing microchip on a circuit board, with sound waves and painted landscapes rising out of it like smoke, dark background, detailed |
| 4 | First, a setup skill checks how much memory the Mac has, and picks models that fit. | 16 GB to 128 GB | Exactly four glass jars on a shelf, small, medium, large and very large, each filled with glowing light, the largest the brightest, clean studio backdrop |
| 5 | A second model listens to each line, and flags any word the voice gets wrong. | Every line checked by ear | A vintage studio microphone next to a pair of headphones, a red pen mark on a sheet of script paper, moody light |
| 6 | Then Hyper Frames turns the storyboard into a video. | HyperFrames renders the video | Storyboard cards pinned to a cork wall, turning into a strip of film that flows toward a projector, warm light, cinematic |
| 7 | Nothing in this reel went to a hosted service. Make your own. | github.com/jasonm4130/mlx-video-kit | A laptop alone on a desk by a window at dawn, an unplugged network cable coiled beside it, calm and quiet, soft golden light |

## Narration changes after the ASR check

- Line 1: "M L X video kit" became "MLX video kit". The ASR wrote the spelled letters as "MLX", so the words did not compare equal.
- Line 4: "The setup skill reads" became "First, a setup skill checks". The ASR heard "To set up Skill Reads".
- Line 6: "HyperFrames" became "Hyper Frames". The ASR wrote the word as two, so the words did not compare equal. The on-screen text keeps "HyperFrames".
