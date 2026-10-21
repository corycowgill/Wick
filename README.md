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
- Hazards: wind gusts (leaves and streaks warn you; golden gusts are tailwinds that carry your jumps further, and any gust fans your flame so wax burns faster), water drips (shelter under anything solid), dark zones, cobwebs, and fuse ropes that burn gates open.
- Pressure plates hold their door open only while something sits on them: Wick, or a wax blob (until it melts). The plate and its door share a gem colour.
- Moving parts: carts, lifts and ferries run on their own clock (stand on one to ride). Moths fly fixed loops; a brush steals 12 wax and knocks you back.

## Levels

| # | Level | New idea |
|---|---|---|
| 1 | Market Row | the whole tutorial: moving, torches, pumpkins, the dark, and dripping to step, bridge and rise |
| 2 | Lantern Canal | soaking wax back |
| 3 | The Windy Bridge | headwinds to wait out, golden tailwinds to leap with |
| 4 | Harvest Lifts | moving carts and lifts |
| 5 | Rain Alley | water drips and shelter |
| 6 | Candle Works | pressure plates: hold a door open with wax |
| 7 | Bell Tower | climbing by dripping |
| 8 | Moth Hollow | moths that fly set loops and steal wax |
| 9 | Hay Maze | cobwebs, fuses, gates |
| 10 | Firebreak | a fuse out of reach, a race against a burning bridge, a locked closet |
| 11 | Ember Fair | chain reactions |
| 12 | Night Ferries | ferries, a lock lift and moths over the water |
| 13 | Clockwork Yard | plates with lifts, carts and moths |
| 14 | Storm Mill | mixed: a plate in the rain, a lift through a hatch in the dark, a fuse lit from a lift |
| 15 | Gale Locks | mixed: ride a tailwind through a plate door, a plate on a post in a headwind, a burning bridge in the gusts |
| 16 | Moth Mill | mixed: a plate under a moth opens a door the cart runs through, a plate up a lift opens a door at its foot |
| 17 | Cold Quarter | everything, with little wax to spare |
| 18 | Castle Stair | the finale climb |

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
11. *"Play through all the levels and test the gameplay and puzzles."* This led to the hazard-aware playthrough below. It found that some of the wax cuts from step 10 were too harsh once real wind and rain were in play (The Windy Bridge, Cold Quarter, Castle Stair), and those were eased. All 11 levels were then completed by recorded routes replayed in the real game, with live wind, rain and fire.
12. *"Describe how we are building this game in the readme"* (this section), and *"Add the Hallucinated Games intro to the loading."*
13. *"Improve the graphics details in each level: add nuance and atmosphere to each level and its theme."* Each level got a signature set piece: market stalls, a cornfield with scarecrows, giant candles, canal bridges with floating lanterns, windmills, lightning and thunder, swinging bells, drifting straw, a Ferris wheel with fireworks, an aurora with frosty breath, and stained glass with embers.
14. *"Improve the gameplay, it feels a little slow"*, then *"Collapse the tutorial levels into a faster level or two, and add more levels with more dynamic elements."* Run speed went up about 30% with gravity scaled to match, so every jump keeps the same height and reach and the levels stay valid. Deaths, level cards and the finish are quicker, and the level-complete card can be skipped. The first three levels became one tutorial street. Three new levels add moving carts, lifts and ferries, plus moths.
15. *"Add more interesting puzzling levels"*, *"Review the wind mechanic and make the bridge level more challenging but still passable"* and *"Add a credits scene that is funny about how AI made it."* Pressure plates and doors, and three puzzle levels: Candle Works, Firebreak and Clockwork Yard. Tailwinds, and wind now costs wax. The Windy Bridge was rebuilt around tailwind leaps; each one can also be bridged with wax. A credits roll lists the real prompts. A build number is on the title screen.
16. *"Improve the game levels: add more levels that mix different mechanics together to solve the challenges."* Three mixed levels, each puzzle needing two or three mechanics at once: Storm Mill (rain, plates, lifts, fire, the dark), Gale Locks (wind, plates, fire) and Moth Mill (moths, plates, carts, lifts). The level select became a 6-wide grid to fit 18 levels.
17. *"Improve the graphic details on all of the levels: add more style and personality based on the existing game."* Levels that shared a theme each got their own set piece: grain silos with a hoist (Harvest Lifts), a burnt field with a brush fire on the horizon (Firebreak), a lighthouse sweeping its beam over moored boats (Night Ferries), a great clock with a pendulum and meshing gears (Clockwork Yard), a waterwheel and drive shafts turning cogs (Storm Mill), lock gates with pennants that stream out in each gust (Gale Locks), and a moonlit mill whose lantern draws a swarm of moths (Moth Mill). Moths circle the giant candles, and lanterns swing in the barn. Wick got a personality too: eyes follow nearby moths, a happy grin at torches and pumpkins, a wince when a moth hits, wide eyes when a door opens, a squint and flattened ears in a gust, a shiver in the rain, worried brows when the wax runs low, and dozing off (with a yawn and z's) when left alone.
18. *"Audit the game as a game critic"*, then *"Create an agent plan and execute."* Three agents worked in parallel on the review's findings. Respawns now keep the wax you had at the torch (with a per-torch safety floor), and spare refills were trimmed so most routes end with 20 to 45 wax instead of 55+. Every level has one optional keepsake (a paper lantern) off the main route, and a par time and wax target; best time, wax and deaths are saved, with swift, bright and keepsake marks on the level select. Hints for the later levels were rewritten and several now open somewhere new (a boathouse roof, a lantern arch, a high ledge, a snowy eave). A notch above Wick shows how high a full jump reaches and turns amber when the wax is too low to climb two tiles. Moths read as a threat: red eyes, a warning ring up close and a dotted trace of their route. A short intro sets up the Lantern Festival, and the ending pays it off.
19. *"Keep improving the game"* and *"The title options get cut off on iPhone in landscape."* An Options screen (title and pause): gentle wax (slower drain, softer moths and rain; medals off), a speedrun timer, screen shake and flash toggles, and remappable jump, drip and soak keys. A soft heartbeat below 20% wax. The title menu moved into a column beside Wick so all five items fit, and the canvas now fits the visible viewport inside the iPhone safe area.
20. *"Improve the game."* Touch controls can be resized, faded or swapped to the other side for left-handed play. After three deaths in the same spot a one-time tip explains what went wrong (low wax, rain, moths, gaps or wind). The level-complete card has a Retry button for chasing medals. On slow phones the game drops to a cheaper render mode once instead of stuttering. Harvest Lifts, Hay Maze and Night Ferries were retuned so their best routes end with 35 to 41 wax (a torch moved later in each, plus a grain chute, a bale and a harbour pit). The test bot got much faster (the quick suite runs in about 2.5 minutes) and takes `--level N`.
21. *"Have a graphics artist agent play the game, critique, and then have agents action on the feedback."* An art-director agent replayed all 18 levels (about 260 screenshots) and wrote a critique; two agents fixed it. The world: dark zones feather instead of slicing the sky, the aurora stays in the sky, rain and snow stop at roofs, canal water reads as teal water, Firebreak's horizon fire looks like fire, wax blobs look like poured wax, fuses are braided cords, windows vary and some are dark, the castle grows nearer level by level and its beacon blazes only at the end, and each interior has its own motif (rain-streaked skylights, candle racks, bell ropes, gears, stained glass). The characters and UI: the complete card slides aside so the lit goal stays visible, a low-wax rim on Wick, burnout and water death moments, warmer moth edges, a cleaner HUD, level-select cards with theme colours, value pills in Options, phone side bars filled with the level sky, outline touch buttons that warm when pressed, and an ending with Wick beside a blazing beacon, fireworks and the town lighting up.
22. *"Have an agent take a second pass."* The open items from the art review: hanging vines became leafy strands (they read as music notes), each Hay Maze cobweb patch is one real web that still burns cell by cell, the last rain under roofs is gone, low-wax Wick keeps a clear warm space in the cold vignette, the jump notch is a soft warm glow, Lantern Canal's far arches sit darker for depth, Firebreak is less orange so hazards stand out, Gale Locks has its own teal evening with lock gates instead of windmills, Castle Stair ends at a gilded great torch with banners, and fuses hang from poles, hooks and stakes instead of floating. Then level select picked up the new Firebreak and Gale Locks palettes, and the low-wax cold vignette got gentler with a wider clear space around Wick.
23. *"Do a game analysis level by level, and improve each level to make them challenging and fun."* Two level-design agents critiqued and rebuilt all 18 levels. Wax now runs low (an optimal run used to finish with 60-80 wax to spare), keepsakes cost wax or a harder jump, and each level gets its own set-piece: the Great Lock and dry dock on the canal, a coal bunker in the rain, a plate on top of the candle press, six different bell-tower floors, a burn-the-web keepsake vault in the hay, two fuses at Firebreak, plates you drip on from a moving cart, a lock lift into a headwind, carts through the dark at Moth Mill, and a Castle Stair finale with 3 torches instead of 5, a moth hall and a cart across a gusty gap. Medal targets and torch floors were recalculated from the new routes.
24. *"Improve the game."* The level-complete card waits for a key or tap, and medals stamp in one at a time with a bell, marking new ones. Level select shows each level's best time, medal targets and keepsake. The HUD shows wax %, which flashes under 20%. The flame relights with sparks and a sound on respawn. Wind, rain and nearby moths have audio cues, and pause muffles the music.
25. *"Give Wick, the character, more cat personality."* Wick's tail has its own spring physics: it trails, flicks on landing, swishes while waiting, puffs up when scared and stands up when happy. Standing still, Wick sits, washes a paw, stretches with a yawn and curls into a loaf to sleep; any input snaps Wick out with a startled hop. Wick shakes off after rain and huffs about it, crouches and chatters at nearby moths, slow-blinks after a big jump, rubs against lit torches and purrs, and kneads at the goal. Whiskers and slit or round pupils react to light, wind and mood. Short synthesized meows, chirps and a purr. All of it is render- and audio-only, so recorded replays are unchanged.
26. *"Improve the graphic details in the levels."* An environment-art pass. Each theme now has its own masonry (cut blocks on the canal, locks, tower and castle; brick in the works and mills; slate in the Cold Quarter; fieldstone in Moth Hollow and Firebreak) instead of one cobble pattern everywhere. Thin slabs and posts became timber beams with splintered ends at holes. The new set-pieces are drawn as what they are (`src/render/set-pieces.js`, 37 pieces checked against the grid at load): lock gates and a dry dock with a half-built hull, the candle press and copper vat, the bell crate and loft bell, organ pipes and a gilded dais, hay bales, a coal bunker, a gear housing and more. Stone has worn edges, stains, cracks and per-theme moss, soot or frost, and props sit on soft contact shadows. Render-only; replays are unchanged.
27. *"Continue the items to do."* The leftovers from the art pass and the polish review. Lantern Canal and Night Ferries get a night palette with a moon, near-black arches and pale quay stone, so sky, stone and water read apart. The Moth Mill pier gets tarred piles, buffers and mooring rings; the Castle Stair finale gets a corbelled battlement with a crested shield, and a crimson runner and bannered parapet up to the great torch. Outdoor levels have soft out-of-focus branches along the top edge, fading out near Wick and anything you need to see. Dark zones and the Storm Mill walls are cached, which brings the busiest levels back under their old frame times. "Restart level" in the pause menu now asks twice, so one stray press can't throw away a run.
28. *"Do the items."* Drip and rain curtains are drawn again after the lighting, so they read on phones: a lit emitter that beads up and sends dashes down during the warm-up, a faint landing line, and while raining a sheen, lit drop heads and a bright splash line. After a death a short caption says why ("Doused by the rain", "The moths took your flame", "Burned out: no wax left") and follows Wick back to the torch. On touch, holding the pause button for 0.6 s (a gold ring fills) restarts from the torch; a tap still pauses.
29. *"Keep improving the gameplay and graphics, I want this to be on par with Celeste or Braid."* Balance, painted backdrops and game feel. The bot now measures true finish wax, and every level's medals and torch respawn wax were re-derived from it, so the curve falls steadily from about 63 wax left on Market Row to 46 on Castle Stair. Torch respawns no longer rely on a pumpkin or lantern later in the stretch, since a player may have eaten it before dying: Lantern Canal and Windy Bridge moved their second torch, Candle Works, Moth Mill and Cold Quarter eased a wall or climb, and Castle Stair has three torches again. The playtest now checks every torch with all pickups already eaten. Each level has a painted, layered backdrop with distant town lights, and the colour grade warms and darkens over the journey. The camera looks ahead, holds steady through hops and leans toward the next torch; Wick's flame trails and stretches and shows the wax level in its colour; there are dust, splash and wax-bead particles, a slanted melted-wax wipe on death and respawn, a ribbon title card, and footsteps that sound like the surface. Everything but the balance work is render- or audio-only, and all 18 recorded replays still finish with no deaths.
30. *"Give me instructions for a new session to work with this game."* `CLAUDE.md` in the repo root: the rules every change must follow (build number, determinism, readability, settings, performance), how levels, medals and torch floors are made, the test and replay commands, a code map, shipping steps and the open ideas that need a decision first.
31. *"Create an expert game level designer agent, the personification of a legendary designer like Shigeru Miyamoto at Nintendo. Have this agent play through the levels and revise them based on their critical eye."* A reusable level-designer agent (`.claude/agents/master-level-designer.md`) that judges levels the Nintendo way: teach through play, one idea per level developed and then twisted, fair deaths, pacing and rest beats, a keepsake that rewards curiosity, and real wax choices. It played and graded all 18 levels, then revised them. On a phone, Wick no longer starts under the thumb pad. Lantern Canal lost its easy climb-out steps, so bridging and soaking wax back is the thrifty way across. Windy Bridge's keepsake now costs real wax, and the "Fell in?" sign sits where only a cat who fell reads it. Rain Alley's flat middle became a dip under the rain: bridge it with wax or dash through in a dry spell. Market Row talks less, and overlapping sign bubbles were merged or moved. Routes, medals and torch floors were re-derived, and all 18 replays still finish with no deaths.

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
src/levels/           level1..18 + index.js (generated by tools/levelgen.js)
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
