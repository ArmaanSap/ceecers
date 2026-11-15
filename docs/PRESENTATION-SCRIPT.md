# MARVIN: judges' presentation script

Team CEECers, NASA Space Apps 2026, Interplanetary Survival Guide: Martian Map.
Target: about 4 minutes of talk + a 90-second live demo. A 2-minute cut is at the end. Replace [A]..[E] with names.

## Before you start (2 minutes)
- Open the live site on the Railway URL in full screen. Pre-pick 3 stops and build one route so a result is ready.
- Have a 60-second screen recording of the demo on the desktop as a backup. Wi-Fi fails at events.
- Headset charged if you will show VR; otherwise show the VR panel screenshot.
- Know the one-line pitch: "MARVIN is a Google-Maps-style walk planner for Mars that tells an astronaut why each step of the route was chosen."

## Slide 1: Title (15 s) [A]
"Hi judges, we're CEECers. This is MARVIN, the Mars Adaptive Routing and Visual Information Network. It's our answer to the Martian Map challenge: one map, many NASA missions, built for planning a first human walk on Mars."

## Slide 2: The challenge and why Jezero (25 s) [A]
"NASA data about Mars lives in separate archives: orbital maps, rover tracks, panoramas, elevation. An astronaut planning a walk needs them together. We chose Jezero Crater because it once held a lake, so it's a top science target, and Perseverance has collected years of data there. That means we could test our map against real ground."

## Slide 3: About MARVIN (20 s) [B]
"Think of a Google Maps for Mars. You pick science stops, it plans a round trip from a base, you preview real rover panoramas of the places you'll walk to, and a mission-control voice, CAPCOM, explains the decisions."

## Slide 4: How it helps astronauts (40 s) [B]
"Three things make it useful rather than just pretty.
One: it plans over the whole terrain, not along rover tracks. It searches a 20-metre elevation model for the least costly walkable path, weighing walking effort, time, and how close the slope gets to your limit.
Two: it explains itself. Every turn and leg has a plain-language reason, for example 'a straight line is not allowed here, it crosses 60 metres steeper than your 25-degree limit'.
Three: it is honest. Our terrain AI classifies ground in panoramas, but it never decides whether a route is safe."

## LIVE DEMO (90 s) [C drives, A narrates]
1. (10 s) Intro glide from globe to Jezero. "We start from orbit and land on the crater."
2. (20 s) Click two points of interest, pick a task, press Make route. "Distance, time, climb, and calories on an Earth-gravity baseline."
3. (20 s) Click a numbered marker. "Here is the reason for this leg: it's 7 percent longer than a straight line on purpose, to stay under the slope limit." Click 'Ask CAPCOM'.
4. (15 s) Switch Route style to 'Widest slope margin' and rebuild. "Same stops, different priorities, different path."
5. (15 s) Open Panorama, run the live terrain scan. "This is a model we fine-tuned. It runs in your browser, no upload."
6. (10 s) DEM 3D, press Start. "The astronaut walks the route in 3D. And with a headset (Enter VR) you stand on Jezero with the site's panels all around you."
If anything breaks: say "let me show our recording" and play the backup. Do not debug live.

## Slide 5: Data behind MARVIN (30 s) [D]
"We used real data throughout. NASA: the Perseverance traverse and 29 Mastcam-Z panoramas, Mars Trek tiles, MOLA relief, AI4Mars labels. Partners: ASU, USGS, FU Berlin for colour maps, Esri for the globe. The numbers that drive routing come from the 20-metre CTX elevation model, the Minetti walking-energy model, and Tobler's hiking speed. Archives like CRISM, THEMIS and MEDA are linked as context; we did not feed them into the route."

## Slide 6: What the astronauts see (30 s) [D]
"What the astronaut sees: 2D and 3D elevation, routes with explained turns, live views from rover sites with distances, a radiation reference that is clearly marked as modeled rather than measured, and CAPCOM updates. On the terrain AI, we tested ourselves on Jezero panoramas: about 81 percent right on loose ground versus rock, 50 percent on four classes. That's why we show two groups, not four."

## Honest limits and what's next (25 s) [E]  (add as a slide)
"What it can't do yet: a 20-metre model can't see rocks or sand, our effort numbers use Earth gravity, and the slope limit is a planning assumption. Next: Mars-gravity effort, a thermal term from MEDA data, more training images from other rovers, and a mission planner you can use inside VR."

## Slide 7: Thank you (15 s) [A]
"MARVIN is live at [URL], the code is on GitHub at [repo], and the project zip is on the About page. Thank you. We'd love your questions."

## Q&A cheat sheet
- **Is the route safe?** No claim of safety. It respects a slope limit you set, explains why, and says to check on the ground. The terrain AI does not set safety.
- **Why not use the rover's path?** The rover drives where a rover can; humans walk differently. Our router searches the whole elevation model. The traverse is a map layer and a source of stops.
- **How accurate is the AI?** AI4Mars test mean IoU 0.83 on four classes. On Jezero panoramas by our own hand check: 81% loose vs rock, 50% four-class; it tends to under-report rock. We merged classes because of that.
- **Is it really trained by you?** We fine-tuned NVIDIA's SegFormer-B0 encoder on NASA/JPL AI4Mars labels. Say "fine-tuned", not "trained from scratch".
- **Calories on Mars?** An Earth-gravity baseline, labelled as such. Mars gravity would lower it; a Mars-specific model is a next step.
- **Radiation?** A modeled reference rate, not a Jezero measurement, and not used for routing.
- **Is 'Martian Base' real?** A fictional planning label so there is a start and return point.
- **What did the team build vs reuse?** Our code: planner, router, explanations, simulator, 3D/VR, CAPCOM, terrain pipeline. Reused: NASA/partner data, Three.js, ONNX Runtime Web, Esri SDK, NVIDIA encoder.
- **Does it work offline / on a headset?** Core site works from the server; Esri globe needs internet. VR works in Quest Browser over https (tested in an emulated Quest; say so if asked).
- **Can it scale?** Static site plus one tiny server; the heavy work (routing, model) runs in the browser.

## 2-minute cut
Slide 1 (10 s) -> one-sentence problem (15 s) -> live demo steps 2, 3, 5 (75 s) -> limits + next in one sentence (10 s) -> close with URL (10 s).
