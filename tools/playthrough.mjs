// Full playthrough test: a hazard-aware bot finds a route through each level with
// wind and rain live, records its inputs, then the route is replayed in the real
// game in headless Chrome (renderer, events, timing) and checked for completion.
//
//   node tools/playthrough.mjs routes   [levels...]   find routes  -> tools/_routes/
//   node tools/playthrough.mjs replay   [levels...]   replay them in Chrome (needs a
//                                                     server on PLAY_URL and playwright-core)
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { search, pathOf, routeFrames } from '../tests/bot.js';
import LEVELS from '../src/levels/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.ROUTES_DIR || join(ROOT, 'tools', '_routes');
mkdirSync(OUT, { recursive: true });
const [mode = 'routes', ...rest] = process.argv.slice(2);
const pick = rest.length ? rest.map(Number) : LEVELS.map((_, i) => i + 1);

if (mode === 'routes') {
  for (const n of pick) {
    const L = LEVELS[n - 1];
    const t0 = Date.now();
    // big levels are searched torch by torch, chaining each segment's end state
    const segmented = process.env.SEGMENTED === '1' || L.tiles.length > 40;
    let r = null, goal = null;
    const parts = [];
    if (segmented) {
      let cur = null;
      for (let seg = 0; seg < 12; seg++) {
        r = search(L, { hazards: true, record: true, firstHit: true, target: 'nextTorch', startState: cur });
        if (!r.goal) break;
        parts.push(r.goal);
        cur = r.goal;
        if (cur.complete) { goal = cur; break; }
      }
    } else {
      r = search(L, { hazards: true, record: true, firstHit: true });
      goal = r.goal;
      if (goal) parts.push(goal);
    }
    const ms = Date.now() - t0;
    if (!goal) { console.log(`L${n} ${L.name}: NO ROUTE with hazards (${parts.length} segments done, ${ms}ms)`); continue; }
    const frameParts = parts.map((g) => routeFrames(g));
    const frames = new Int8Array(frameParts.reduce((k, p) => k + p.length, 0));
    { let o = 0; for (const p of frameParts) { frames.set(p, o); o += p.length; } }
    const chain = parts.flatMap((g) => pathOf(g).filter((st) => st.frames));
    const moves = ['start', ...chain.map((st) => st.act)];
    r = { goal };
    const waits = moves.filter((m) => m.startsWith('wait')).length;
    const builds = moves.filter((m) => /drip|pillar|bridge|lift/i.test(m)).length;
    writeFileSync(join(OUT, `level${n}.json`), JSON.stringify({
      level: n, name: L.name, wax: r.goal.wax, time: r.goal.time, frames: Array.from(frames),
      moves, waits, builds,
      // where the bot expects Wick after each move: [frame, x, feet]
      checkpoints: (() => { let f = 0; return chain.map((st) => { f += st.frames.length / 2; return [f, +st.x.toFixed(2), +st.feet.toFixed(2), +st.wax.toFixed(3)]; }); })(),
    }));
    console.log(`L${n} ${L.name}: route ${r.goal.time.toFixed(1)}s, ${r.goal.wax.toFixed(0)} wax left, ` +
      `${moves.length} moves (${builds} builds, ${waits} waits) (${ms}ms)`);
  }
}

if (mode === 'replay') {
  const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright-core');
  const url = process.env.PLAY_URL || 'http://127.0.0.1:8799/';
  const shots = process.env.SHOTS_DIR || OUT;
  const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) errors.push(m.text()); });
  await page.goto(url + '?debug');
  await page.waitForTimeout(800);
  for (const n of pick) {
    const file = join(OUT, `level${n}.json`);
    if (!existsSync(file)) { console.log(`L${n}: no route file`); continue; }
    const route = JSON.parse(readFileSync(file, 'utf8'));
    const speed = 4;
    await page.evaluate(({ n, frames, speed }) => window.WICK.replay(n - 1, frames, speed), { n, frames: route.frames, speed });
    const total = route.frames.length / 2;
    const t0 = Date.now();
    let shot = 0, last = null;
    // screenshots at fixed points along the route, then wait for the level to end
    const marks = [0.15, 0.4, 0.65, 0.9];
    for (;;) {
      last = await page.evaluate(() => {
        const s = window.WICK.state;
        return {
          i: s.replay ? s.replay.i : -1, scene: s.scene, level: s.levelIndex, complete: !!(s.world && s.world.complete),
          deaths: s.levelStats ? s.levelStats.deaths : 0, wax: s.player.wax, x: s.player.cx / 32, y: s.player.feet / 32,
        };
      });
      if (shot < marks.length && last.i >= total * marks[shot]) {
        await page.screenshot({ path: join(shots, `play-L${n}-${shot + 1}.png`) });
        shot++;
      }
      if (last.i < 0 || last.complete) break;
      if (Date.now() - t0 > 120000) break;
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(shots, `play-L${n}-end.png`) });
    const ok = last.complete || last.level === n || last.scene === 'end';
    console.log(`L${n} ${route.name}: ${ok ? 'COMPLETED' : 'FAILED'} in the real game` +
      ` (deaths ${last.deaths}, wax ${last.wax.toFixed(0)}, at ${last.x.toFixed(1)},${last.y.toFixed(1)})`);
  }
  console.log(errors.length ? 'page errors:\n' + errors.join('\n') : 'no page errors');
  await browser.close();
}
