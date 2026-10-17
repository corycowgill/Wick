# WICK

*AI Browser Game Jam 5 · theme: TORCH · by Hallucinated Games*

You are Wick, a candle-cat. Your wax is your health, your height and your light. Reach the next torch before you burn down to a stub. Spend wax to build, and every ledge becomes a tradeoff.

Repo: https://github.com/corycowgill/Wick

Vanilla JS + Canvas 2D + WebAudio. No build step and no libraries. All art is drawn in code. Music and sound effects were generated with open AI models from Hugging Face (see Credits), with a WebAudio synth fallback.

## Play

Serve the folder with any static server and open it:

```sh
npx serve .            # or: python -m http.server
```

On iPhone, open the page in Safari in landscape. For full screen, use Share → Add to Home Screen. To deploy, publish the repo root as a static site (on Render: Static Site, branch `main`, no build command, publish directory `.`).

## Controls

| Action | Keyboard | Xbox controller | Touch |
|---|---|---|---|
| Move | ← → / A D | Left stick / D-pad | Thumb pad (touch anywhere lower-left) |
| Jump | Space / ↑ / W | A | JUMP |
| Drip wax (build a blob) | ↓ / S / X | X or RT | DRIP |
| Soak a blob back up | E | B | SOAK |
| Restart from last torch | R | Y | Pause → Restart |
| Pause | Esc / P | Menu | ❚❚ |
| Mute | M | View | Pause → Sound |

Input switches automatically to the last device you used.

## How it works

- Wax drains all the time, and faster while you move. Each jump costs 2 and each drip costs 8.
- Body height, jump height and light radius all scale with wax.
- Torches are checkpoints (+40 wax, once). Pumpkins give +15 once.
- Wax blobs stay solid for 14s. A glowing outline shows where the next one will land. Drip at a ledge to bridge a gap, in front of you to make a step, against a wall to rise, or mid-jump to stack a pillar.
- Hazards: wind gusts (leaves and streaks warn you), water drips (shelter under anything solid), dark zones, cobwebs, and fuse ropes that burn gates open.

## Levels

| # | Level | New idea |
|---|---|---|
| 1 | Market Row | moving, wax drain, torches |
| 2 | Pumpkin Lane | pumpkin refills, reading your light |
| 3 | Drip Step | building with wax |
| 4 | Lantern Canal | soaking wax back |
| 5 | The Windy Bridge | wind gusts |
| 6 | Rain Alley | water drips and shelter |
| 7 | Bell Tower | climbing by dripping |
| 8 | Hay Maze | cobwebs, fuses, gates |
| 9 | Ember Fair | chain reactions |
| 10 | Cold Quarter | everything, with little wax to spare |
| 11 | Castle Stair | the finale climb |

## How this game was built

WICK was built entirely through prompting, with one human directing and Claude Code doing the work. Claude Code is Anthropic's coding agent, here running Claude Opus. It wrote, tested and deployed every line in this repo: code, levels, art, tooling and tests. The human role was creative direction: writing the design doc, playing builds on an iPhone, and asking for the next thing.

### The prompts

The whole project came from this sequence of requests, lightly cleaned up for typos:

1. **The design doc.** One long prompt: *"WICK: Design Doc and Agent Build Plan"*. It covered the pitch, tech constraints (vanilla JS, Canvas, WebAudio, no assets), controls for keyboard, Xbox and iPhone, tuning tables, eight levels, art direction ("painted by torchlight"), audio, file layout, interfaces between modules, a build plan, a cut list and a definition of done. Claude built the whole game from it in one pass.
2. *"Use this GitHub"*, then *"What branch do I deploy into Render and what settings"*.
3. *"It doesn't load on iPhone."* This added an on-screen boot error report and older-Safari support.
4. *"Improve the graphics."* Per-level themes, depth-shaded stone, interiors, weather.
5. *"Revisit how the wax blobs and drip work and make sure the gameplay is intuitive."* A ghost preview of where each blob lands, buffered jump-drips, drip-to-rise against walls, and clear failure feedback.
6. *"Improve the graphic details in the environments and levels"* and *"Give it more atmosphere, style, feel."* Colour grading, vignette, grain, light shafts, decorations, lanterns, an iris wipe.
7. *"Use my Hugging Face CLI to find a sound model and generate music and sound fx and add them to the game."*
8. *"More graphics improvements for the aesthetic. iPhone controls: make it a thumb pad for the movement."*
9. *"Improve the VFX"*, *"Make the gameplay more fluid"* and *"Improve the VFX and details in the levels."* Flame trails, light pillars, shockwaves, apex hang, corner correction, ledge assist, rim light, light pools, jump shadows, visible wind.
10. *"Improve the level design and add more levels."* Three new levels, and the wax budgets retuned.
11. *"Play through all the levels and test the gameplay and puzzles."* This led to the hazard-aware playthrough below. It found that some of the wax cuts from step 10 were too harsh once real wind and rain were in play (The Windy Bridge, Cold Quarter, Castle Stair), and those were eased. All 11 levels are now completed by recorded routes replayed in the real game, with live wind, rain and fire.
12. *"Describe how we are building this game in the readme"* (this section), and *"Add the Hallucinated Games intro to the loading."*

### Technology

- **Runtime:** plain ES modules, Canvas 2D and WebAudio. No framework, no bundler and no build step. Runs from any static file server.
- **Art:** 100% procedural. Tiles, parallax towns, Wick, props and effects are drawn with canvas paths. Tile variants are pre-rendered into small sprite canvases at 2x.
- **Lighting:** an offscreen darkness layer has light holes cut out of it with `destination-out` radial gradients. Then come additive bloom, rim light on edges facing a flame, pools of light on the floor, a per-theme colour grade, vignette and film grain.
- **Physics:** a fixed 60 Hz timestep with axis-separated AABB collision against a tile grid. The body height changes with wax, anchored at the feet.
- **Input:** keyboard, Gamepad API (standard mapping, rumble) and Pointer Events (a floating analog thumb pad, multi-touch) all feed one shared input object.
- **Levels:** ASCII grids, generated from geometry code by `tools/levelgen.js`.
- **Audio:** music from `facebook/musicgen-medium` and sound effects from `cvssp/audioldm2`. Both were generated locally on an RTX 4060 with `tools/gen_audio.py`, using Hugging Face models found through the `hf` CLI. Sound effects are generated three at a time and the best is picked by CLAP score. Everything is normalised, encoded to small MP3s and loops crossfaded. A synth fallback covers anything missing.
- **Studio intro:** the shared Hallucinated Games canvas intro (`intro/hallucinated-intro.js`).
- **Hosting:** GitHub to Render, as a static site with automatic deploys on push.

### How it was tested

There's no human QA team, so the game is tested by machines:

- **Reachability bot** (`tests/bot.js`). It plays each level using the real `Player` physics. Its moves are scripted input sequences (walks, jumps, drip steps, pillars, bridges, wall lifts). It searches for the route that keeps the most wax, tracking which torches and pumpkins were used. It proves:
  - every level is finishable;
  - every torch can reach the next one from the guaranteed respawn wax, so there are no soft locks;
  - building levels can't be beaten without dripping.
- **Hazard-aware playthrough** (`tools/playthrough.mjs`). The same bot runs with wind and rain on the real clock, real fuse burn times and "wait" moves. Its inputs are recorded frame by frame, then replayed in the real game in headless Chrome, with the renderer, events and timing all live. It confirms each level is completed and captures screenshots.
- **Soak and unit tests** (`tests/playtest.js`): a 60-second random-input run on every level checking for NaNs or escaping the world, rules for how dripping behaves, and input tests (deadzone, multi-touch, pointer cancel, controller disconnect, thumb pad).
- **Screenshots:** headless Chrome and WebKit were used to look at every graphics change, including an emulated iPhone in landscape and portrait.

## Layout

```
index.html            page, iOS meta tags, touch-control CSS
intro/                Hallucinated Games studio intro
src/config.js         all tuning constants
src/main.js           loop, scenes, event wiring
src/input*.js         unified keyboard / gamepad / touch input
src/physics.js        tile AABB collision
src/player.js         Wick: wax, movement, dripping
src/level.js          ASCII level parser and world
src/entities/         torch, pumpkin, goal, wax blob, wind, drip emitter, cobweb, fuse/gate
src/render/           camera, lighting, post effects, world art, Wick art, particles
src/audio.js          sample playback + synth fallback, flame loop, music
src/ui.js             HUD, menus, level select, title and end screens
src/levels/           level1..11 + index.js (generated by tools/levelgen.js)
assets/audio/         generated music and sfx (tools/gen_audio.py)
tests/                headless QA: reachability bot, soak, drip and input tests
tools/                level generator, audio generator, playthrough tester
```

## Tests

```sh
npm test                                    # full suite (~5 min)
node tests/playtest.js --quick              # skips the torch-to-torch searches
node tools/playthrough.mjs routes           # hazard-aware routes for every level
node tools/playthrough.mjs replay           # replay them in headless Chrome (needs a server + playwright-core)
```

Debug URL flags: `?level=N` starts at level N. `?debug` shows frame time and position. `?nointro` skips the studio intro.

## Credits

- Design and direction: Hallucinated Games
- Built with [Claude Code](https://claude.com/claude-code)
- Music: [facebook/musicgen-medium](https://huggingface.co/facebook/musicgen-medium) by Meta AI, licensed CC-BY-NC-4.0
- Sound effects: [cvssp/audioldm2](https://huggingface.co/cvssp/audioldm2) by the CVSSP group, University of Surrey, licensed CC-BY-NC-SA-4.0

Those model licences allow non-commercial use only, with attribution. The generated audio in `assets/audio/` is shared under CC-BY-NC-SA-4.0.
