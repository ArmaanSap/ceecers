# Terrain AI: the model we trained

**What it is.** A SegFormer-B0 semantic-segmentation network (encoder initialised from `nvidia/mit-b0`, check that model card's licence) that we fine-tuned ourselves on the AI4Mars dataset (NASA/JPL labelled rover images, CC0, via `hassanjbara/AI4MARS`). Four classes: soil, bedrock, sand, big rock. 384x384 input, 2 epochs, exported to ONNX (`dist/assets/models/marswalk_terrain.onnx`, about 14 MB). Training notebook: `docs/Marvin_terrain_training.ipynb` (Google Colab, free T4).

**How well it works (held-out `test_min3`, labels the annotators agreed on):**
| class | IoU |
|---|---|
| soil | 0.986 |
| bedrock | 0.933 |
| sand | 0.957 |
| big rock | 0.458 |
| **mean IoU** | **0.833** (pixel accuracy 0.982) |
Big rock is the weak class: rocks are small and rare. Raw numbers: `dist/assets/models/metrics.json`.

**What the app does with it.** `scripts/run_terrain_model.py` slides the model over each of the 29 real Mastcam-Z panoramas and writes colour overlays and per-panorama shares (the raw four-class shares are kept under `raw` in `summary.json`; the app merges them into loose ground and rock) to `dist/assets/terrain-ai/`. The panorama viewer shows them (Terrain AI overlay), Live views show a composition bar, and CAPCOM answers "what is the ground like here?" and has a `describe_terrain` tool. Results are precomputed offline, so the app does not need a GPU or a server.

**Limits, stated plainly (also shown in the app).**
- The test numbers come from AI4Mars images (a different camera than the Mastcam-Z mosaics used in this app), so we measured it ourselves: a blind hand check of 80 crops (74 labelled, 6 skipped; tool in `tools/terrain-eval/`, one labeller, points sampled evenly across the model's predicted classes). **Four-class accuracy was only 50%.** The model called sand 18 times and the labeller agreed twice (mostly soil), and it called flat rock slabs "big rock" 11 of 17 times. Merging the confusable pairs (loose = soil+sand, rock = bedrock+big rock) gives **60/74 = 81%**: it never called loose ground rock (0 of 24), but called rock loose 14 of 50 times, so **it under-reports rock.** Roughly +/-10 points; only 2 points were truly sand, so nothing can be said about sand. Because of this the app shows two groups, not four.
- Jezero's floor is mostly fractured rock pavement, which AI4Mars has few examples of; that is the likely cause.
- AI4Mars ignores sky, far terrain and the rover. We therefore mask black no-data, sky above the horizon and the rover hardware (unsaturated pixels), and drop "big rock" labels within a margin of the rover, which the model otherwise labels as rock. The mask is a heuristic: some rover parts and shadows still leak in, mostly as small "big rock" patches near the rover.
- Shares are the proportion of the analysed part of each image (typically 40-70%), not of the whole scene.
- It describes surface type in a photo. It is not a trafficability or safety rating, and it is not connected to the route planner.

**Reproduce.** Run the notebook in Colab (about 30-45 min), put the ONNX file at `dist/assets/models/marswalk_terrain.onnx`, then `python3 scripts/run_terrain_model.py` (needs `onnxruntime`, `numpy`, `scipy`, `pillow`).

**For the Space Apps "Use of Artificial Intelligence" field.** Two kinds of AI were used: (1) a model the team trained on NASA AI4Mars data (above), started from NVIDIA's pretrained `mit-b0` encoder; (2) Claude (Anthropic), used as the live CAPCOM assistant and to help write the code, tests and documentation of this project.

## Where it runs in the app
- **Live in the browser:** `dist/terrain-live.js` + `dist/vendor/ort` (onnxruntime-web, MIT) run `dist/assets/models/marswalk_terrain.onnx` on the open panorama. The ground mask is taken from the precomputed overlay's alpha; the class map is merged to loose ground vs rock.
- Precomputed overlays and `summary.json` (offline Python run) power Live views bars, route popups, CAPCOM's `describe_terrain` and the route brief.
- If you re-run `scripts/run_terrain_model.py`, merge soil+sand and bedrock+big rock again (colours `#e0b050` and `#6ea8ff`, `summary.json` `share`/`raw`) before shipping.
