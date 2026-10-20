# WICK — working notes for Claude sessions

WICK is a candle-cat platformer in plain ES modules, using Canvas 2D and WebAudio. There is no build step. `README.md` has the architecture, the test strategy and the full prompt history (the numbered list), so read it first.

- Repo: https://github.com/corycowgill/Wick (branch `main`)
- Every push to `main` deploys to Render automatically.
- itch.io is uploaded by hand from a zip (see Shipping).

## Rules that always apply

- **Bump `BUILD` in `src/version.js` on every push.** Also set `BUILD_DATE`.
- **Add a numbered prompt-history item to `README.md`** for each user request you ship. Quote the request, then a short paragraph on what changed.
- **Keep the simulation deterministic.**
  - The recorded routes in `tools/_routes/levelN.json` are frame-by-frame inputs replayed in the real game.
  - Changes to rendering, UI or audio must leave every replay identical: same deaths, finish wax and final position.
  - Don't put `Math.random` in a draw path that would flicker. Use hashed or seeded noise.
- **Simulation changes need re-recorded routes.** This covers physics, `CFG` simulation values, entities, `player.js`, input→sim timing and level geometry. Re-record the routes, re-check them with the bot, and recompute `PAR` and `TORCH_FLOORS`.
- **Readability comes first.** Platforms, one-way planks, hazards, plates, fuses, pumpkins, the keepsake and torches must stay clearly readable. Backgrounds sit back in value and contrast.
- **Respect the player settings.**
  - `Settings.reduceFlash`, the shake setting and mute.
  - Quality tiers: `state.quality` goes 2→1→0, plus `Post.quality`. Skip heavy extras at the low tiers.
  - Gentle mode (`GENTLE` assist values): don't change it.
- **Keep it fast.** It must hold 60 fps on a phone. Cache static layers into offscreen canvases, and avoid big allocations every frame.
- **Memory on this machine is tight** (about 1.7 GB free). Run one heavy process at a time, either one Chrome or one bot or test run. Use `node --max-old-space-size=2500`.

## Levels

- **Levels are generated.** Edit geometry in `tools/levelgen.js`, then run `node tools/levelgen.js` to rewrite `src/levels/level1..18.js` and `index.js`.
  - `ORDER` sets the play order.
  - Each level must have exactly one keepsake, `K`; the generator throws otherwise.
  - The jump reference is in the file header.
- **`PAR`** holds the medal targets, computed from the bot's route:
  - time ≈ 1.35 × the bot's time, rounded up to 5 s;
  - wax = the bot's true finish wax − 10, minimum 5.
- **`TORCH_FLOORS`** holds the respawn wax for each torch. A respawn gives `max(wax at the torch, floor)`. Each floor is the least wax the hazard bot needs to reach the next torch, plus 5.
  - Keep floors ≤ 70, so that dying doesn't act as a refill.
  - A floor must hold with every pumpkin and lantern already eaten, because pickups stay gone after a death. The playtest's torch-to-torch check enforces this. Rain Alley and Hay Maze keep a 75 on their first torch.
- **The design intent** for each level is in its `define(...)` block comments. The difficulty curve ramps from level 1 (the tutorial) to level 18 (Castle Stair, the finale).

## Testing

```sh
# static server (the replay and screenshot scripts expect port 8799)
python -m http.server 8799 --bind 127.0.0.1        # run in the background

node --max-old-space-size=3000 tests/playtest.js --quick            # ~2.5 min, must pass
node --max-old-space-size=3000 tests/playtest.js --level N          # full torch-to-torch check for one level
node tools/playthrough.mjs routes N        # find and record a hazard route -> tools/_routes/levelN.json
PLAYWRIGHT=file:///<path>/node_modules/playwright-core/index.mjs SHOTS_DIR=<tmp dir> \
  node tools/playthrough.mjs replay [N...] # replay in real headless Chrome; expect "COMPLETED ... deaths 0" and "no page errors"
```

- **Playwright:** install it with `npm i --no-save playwright-core`. `node_modules` is gitignored. Launch it with `executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'`.
- **Debug URL flags:**
  - `?debug` shows frame ms, wax, position and quality tier.
  - `?level=N` starts at level N.
  - `?nointro` skips the studio intro.
- **`window.WICK.state`** exposes the game state. You can teleport Wick with `state.player.x/y` to take screenshots of a spot.
- **Phone check:** use 844×390 at DPR 3 with touch (iPhone landscape).
- **Route searches** take 3–4 minutes on Harvest Lifts, Rain Alley, Hay Maze and Castle Stair.
- **`tools/_routes/` is gitignored,** but the route files are committed. Use `git add -f tools/_routes/levelN.json`.
- **Before every push,** run the quick playtest and a full 18-level replay.

## Code map

| Area | Files |
|---|---|
| Loop, scenes, events, pause and options menus | `src/main.js` |
| HUD, cards, level select, captions | `src/ui.js` |
| Tuning | `src/config.js` |
| Wick's simulation | `src/player.js` |
| Collision | `src/physics.js` |
| Level parser | `src/level.js` |
| Entities | `src/entities/` |
| Input | `src/input*.js`. Touch has hold-pause-to-restart. |
| Saves | `src/settings.js` (`wick.settings`); records in localStorage under `wick.records` |
| Tiles, backdrop, `themeOf` / `SCENE_THEMES` | `src/render/draw-world.js` |
| Drawn set-pieces, validated against the grid | `src/render/set-pieces.js` |
| Sky, weather, scene palettes | `src/render/theme-fx.js` |
| Darkness layer, sky lift | `src/render/lighting.js` |
| Colour grade, iris | `src/render/post.js` |
| Wick drawing: moods, tail physics, idle routine, cat behaviours | `src/render/draw-wick.js` |
| Moths and movers | `src/render/draw-dynamic.js` |
| Particles | `src/render/particles.js` |
| Camera (render-only) | `src/render/camera.js` |
| Synth SFX, meows, purr, music | `src/audio.js` |
| Bot | `tests/bot.js`. It uses the real `Player` physics. Its fire model follows the game's frame loop, and it polishes its final approach and torch arrivals so "true" finish wax is measured. |

## Shipping

- **GitHub / Render:**
  1. Commit with a descriptive message.
  2. Bump `BUILD`.
  3. Add the README item.
  4. Run `git push origin main`.
- **itch.io:** run `git archive --format=zip -o dist/wick-itch.zip HEAD index.html src intro assets`, then upload the zip by hand. Check "played in the browser" and set the viewport to 960×540.
  - butler is not installed, and the user hasn't set it up.
  - Never enter the user's itch credentials yourself.

## Open ideas (not started; ask the user first, because they change gameplay)

- **A signature wax move,** for example a flare dash that burns wax to burst forward and light the area. Levels would be designed around it, and the bot would learn it.
- **B-side remix levels,** unlocked by keepsakes.
- **Braid-style story fragments** in the world.
- **Known small issues:** sign speech bubbles can overlap each other (`drawSignText` in `draw-world.js`, seen on Windy Bridge); on phones Wick starts under the touch pad on levels whose spawn hugs the left wall.
- **Not yet verified by a human:** the volume of the new synthesized sounds, and the new UI on a real iPhone.
