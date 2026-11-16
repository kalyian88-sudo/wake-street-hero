# WHY NOT: Wake Street Hero — план и архитектура

Этот файл — единый источник правды для всех, кто пишет код (люди и агенты).
Исходное ТЗ дословно: [`docs/SPEC.md`](./SPEC.md). Контракты модулей: `src/types/*`, события: `src/core/events.ts`.

## 0. Этапы (порядок из ТЗ §17)

| # | Этап | Что готово на выходе |
|---|------|----------------------|
| 1 | План, каркас, контракты | этот файл, `src/types`, заглушки модулей, проект собирается |
| 2 | Вертикальный срез | Пхукет Old Town, вейкборд, винч, трюки, вода, райдер, HUD — играбельно и красиво |
| 3 | Вейкскейт | флипы, ловля доски, своя стойка и физика |
| 4 | Остальные споты и города | 12 спотов в 3 городах, темы декора |
| 5 | Карьера | цели, звёзды, монеты, репутация, сюжет, спонсоры, хаб и карты городов |
| 6 | Магазин и редактор райдера | каталог из `src/data/gear.ts`, редактор внешности |
| 7 | Звук и музыка | процедурный WebAudio |
| 8 | Поделиться | карточка 1080×1920, Web Share / PNG |
| 9 | i18n | RU / EN |
| 10 | PWA | manifest, иконки, service worker, офлайн |
| 11 | Полировка | тесты, оптимизация, визуальные проходы по скриншотам |
| 12 | README | запуск, сборка, деплой, как менять шмот / ссылки / споты |

Модули, которые не зависят друг от друга (звук, сохранения, i18n, очки), пишутся параллельно с вертикальным срезом.

## 1. Conventions (обязательны для всего кода)

- **Units / axes**: metres, seconds, radians at runtime. Right-handed, **Y up**. Normal canal water level `y = 0`.
- **Forward is local +Z.** Yaw θ about +Y maps forward to `(sin θ, 0, cos θ)` — identical to `Object3D.rotation.y`.
  Positive yaw turns LEFT (towards +X).
- **Spots run towards +Z** (start at low z, winch at high z). Looking along +Z: rider's **left = +X, right = −X**.
- **Data** (`src/data/**`) uses DEGREES for every `rot` field and `0xRRGGBB` numbers for colours.
- **Steer sign**: `InputFrame.steer > 0` = screen right = rider's right of travel (yaw decreases).
- **Rider model**: board nose = local +Z. Regular stance = left foot forward, chest faces the rider's right-of-board (local −X);
  goofy is mirrored. `state.boardYaw` is the rig root yaw.
- **Shared shape math lives in `src/data/geometry.ts`** (kicker profile, ledge edges, stairs layout, wall normal, winch anchor).
  Physics and visuals MUST both use it so hitboxes match what the player sees.
- The **sim is headless**: `src/physics`, `src/tricks`, `src/career`, `src/data`, `src/core/events.ts`, `src/core/riderState.ts`
  import only `three` math classes. No DOM, no WebGL, no imports from `world/rider/ui/audio`.
- No runtime network access, no external assets. Geometry is procedural, textures are generated on canvas (cached, ≤ 1024², typically 256–512).
- Brand: red `#E30613`, dark grey `#1C1D21`, white. Wordmark "WHY NOT" (bold condensed italic, system fonts only). See `BRAND` in `src/config.ts`.

## 2. Module map (owner = the only one who edits those files)

| Module | Files | Factory / exports (exact names) |
|--------|-------|---------------------------------|
| contracts | `src/types/**`, `src/config.ts`, `src/core/events.ts`, `src/core/riderState.ts`, `src/data/geometry.ts`, `src/data/cities.ts`, `src/data/spots/index.ts` | shared; additive changes only (see §6) |
| **core** | `src/core/**` (except events/riderState), `src/main.ts`, `index.html` | `createGame(opts): IGame` in `src/core/Game.ts` |
| **input + HUD** | `src/input/**`, `src/ui/hud/**` | `createInput(): IInput`, `neutralInputFrame()`; `createHud(deps): IHud` |
| **sim** | `src/physics/**`, `src/tricks/TrickController.ts` (+ helpers it needs under `src/tricks/air/`) | `createRiderSim(config, bus): IRiderSim`, `buildCollisionWorld(spot): ICollisionWorld`, `src/physics/autopilot.ts` |
| **rules + data** | `src/tricks/scoring.ts`, `src/tricks/landing.ts`, `src/tricks/*.ts` (pure), `src/data/tricks.ts`, `src/data/gear.ts`, `src/career/objectives.ts`, `src/career/rewards.ts`, `tests/unit/{scoring,combo,landing,objectives,rewards,gear}*.test.ts` | `resolveTrick`, `createScoreKeeper`, `judgeLanding`, `TRICKS`, `getTrick`, `GEAR`, `getGear`, `computeStats`, `createRunObjectives`, `buildRunResult`, `applyRunResult` |
| **rider** | `src/rider/**` | `createRiderRig(look, board, profile): IRiderRig` |
| **env + fx** | `src/world/env/**` | `createEnvironment(def, ctx)`, `createWater(regions, env, ctx)`, `createParticles(env, ctx)` |
| **world** | `src/world/**` (except `env/`, `menu/`), `src/data/spots/phuket_oldtown.ts` (props/env only) | `buildSpotWorld(spot, ctx): Promise<ISpotWorld>`, `registerProp`, `loadAssetOverride` |
| **audio** | `src/audio/**` | `createAudio(bus): IAudio` |
| **shell** | `src/save/**`, `src/i18n/**`, `src/ui/**` (except `hud/`), `tests/unit/save*.test.ts` | `createSaveStore(bus)`, `migrate`, `defaultSave`, `i18n`, `t`, `l`, `detectLang`, `createUI(game): IUI` |
| later stages | `src/world/menu/**` (hub/city/rider backdrops), `src/share/**`, `src/career/{story,sponsors}.ts`, `src/data/spots/*.ts`, `src/world/themes/*.ts`, `public/**` | see stubs |

Stub files currently exist for every factory (they use `src/dev/stub.ts`). **Replace the stub, keep the export name and signature.**

## 3. Frame order (core `RunSession`)

```
realDt = clamp(now - last, 0, 1/20)
frame  = input.poll()
scale  = time.update(realDt, sim.state.slowMo, sim.state.hero)   // smooth, see GAME.slowMoScale / hero*Scale
dt     = realDt * scale
sim.step(dt, frame, scale)                 // physics + trick state machine, emits bus events
objectives.update(sim.state, sim.score.state, dt)
rig.update(sim.state, dt)
world.update(dt, time, { rider: sim.state, camera })   // water wake, particles, winch, rope, letters, sun follow
cameraRig.update(realDt, dt, sim.state, rig)
replay.record(sim.state)
audio.update(realDt, { state: sim.state, timeScale: scale, paused })
hud.update({ state, score, objectives, timeScale: scale, countdown }, realDt)
engine.render()
```

Game states: `boot → menu ⇄ preview → countdown → run ⇄ paused → results ⇄ replay → menu`.
Test hooks (always available, used by Playwright): `window.__game` = the `IGame`, plus `window.__wsh` debug API
(`start(spotId, winchId?, board?, power?)`, `step(seconds)` to advance the sim without waiting for real frames, `state()`, `setInput(v)`).
URL params: `?debug` (overlay, hitboxes, free camera, unlock all), `?spot=<id>&winch=<id>&board=<kind>&autostart` (jump straight into a run), `?quality=low|medium|high`, `?lang=ru|en`.

## 4. Gameplay decisions (ТЗ §4–§7 → concrete rules)

### 4.1 Winch & rope (arcade model)
- The winch at `W` reels the rope in at `WINCH_SPEED[power]` (7.5 / 9.5 / 11.5 m/s), ramping up over ~1.5 s after GO.
- Rope constraint: when `dist(rider, W) > L` the rope is taut — the rider's radial speed towards the winch is pulled up to the reel speed
  (elastic gain, not a hard snap). `L` shrinks at the reel speed.
- The board's edge kills sideways velocity (like a keel) and the stick turns the heading relative to the rope direction (max carve ≈ 50°),
  so carving across the line whips speed up (`v ≈ v_winch / cos φ`), drag ∝ v² tames it.
- Slack (`dist < L`): no pull, drag slows the rider, the winch takes the slack up slightly faster. Re-tension produces `rope.jerk`;
  a big jerk inside the landing window = bail `ropeJerk` (ТЗ: «слишком резкий рывок в момент приземления»).
- Handle button toggles `rope.holding`. Released: coast on inertia, handle skims ahead on the water while the winch reels in slack; pressing again re-grabs (tension ramps in).
- Run ends (`finished`) inside `GAME.finishRadius` of the winch. A bail does NOT end the run: combo burns, rider resurfaces after ~2 s on the nearest water on the line and is pulled again.

### 4.2 Controls (exact mapping, both touch and keyboard)
| Where | Input | Result |
|-------|-------|--------|
| water / solid | hold JUMP | charge rope load (crouch 0→1 in ≈0.7 s); release = pop. Holding into a kicker lip adds boost |
| water | TRICK + ←/→ | surface 180 (switch ⇄ regular), small combo link |
| air | stick ←/→ (held) | spin: keeps adding 180° in that direction while held; release = finish the current half-turn. Needs the stick to pass neutral after take-off. TRICK + ←/→ also adds 180° per press |
| air | TRICK + ↑ / ↓ | backroll / frontroll (+360° roll each press → doubles). Backroll off a kicker is named Tantrum |
| air | TRICK, stick neutral | tap = shifty; hold ≥ 0.25 s (wakeboard) = raley |
| air, wakeboard | hold GRAB + direction | neutral Indy · ← Melon · → Mute · ↑ Nose · ↓ Tail · ↓+side Stalefish. Longer hold = more points. Release before landing |
| air, wakeskate | FLIP + direction | neutral Shuvit · ← Kickflip · → Heelflip · ↑ Impossible · ↓ 360 Flip. Then **catch**: press FLIP (or JUMP) again when the board comes round (`flip.catchWindow`), else board is lost = bail |
| water, wakeskate | hold FLIP while releasing JUMP | Boneless (planted pop, a bit higher) |
| rail | stick ←/→ | balance (bar with marker). `|balance| ≥ 1` = fall |
| rail | TRICK + ←/→ | 50-50 ⇄ boardslide (→ direction = lipslide) |
| rail | hold GRAB | press (stick ↑ nose press, ↓ tail press) |
| rail | JUMP | pop off — air tricks allowed out |
| any | HERO | start HERO mode when the meter is full |
Keyboard: arrows = stick, Space = JUMP, X = TRICK, C = GRAB/FLIP, Shift = HERO, Esc/P = pause.
No HANDLE control (owner's decision): the rider always holds the rope handle.

### 4.3 Slow-motion, landing, score
- `state.slowMo` → 1 while a spin / invert / flip / grab is in progress. Core smooths the global scale to `GAME.slowMoScale` (0.35) and shows a vignette.
- Landing verdict (`judgeLanding`): `perfect` / `clean` / `sketchy` (points halved, speed scrubbed) / `bail` (under-rotated, mid-invert, still grabbing, board not caught, rope jerk, too hard).
  Landing switch is fine (yaw error folds to 0..90°).
- Combo: every scored element adds to the pot and bumps the multiplier (+1, cap ×12); the window is `GAME.comboWindow` = 3 s of sim time and
  does not run down while airborne / on a rail / wall. Window expires → `pot × mult` is banked. Bail burns the pot.
- Staleness: repeating the same trick id scales points ×0.7, ×0.5, ×0.35 … (min ×0.2); doing other tricks restores it.
- HERO meter fills from clean landings and variety; when full the HERO button lights up → 8 real seconds of ×2 points and deeper slow-mo.

### 4.4 Boards
- **Wakeboard**: higher pop, stable, grabs, spins to 1080, inverts (backroll, frontroll, tantrum, raley, doubles), handle passes on spins ≥ 360.
- **Wakeskate**: ~70 % pop, no bindings — flips with catch timing, no inverts/grabs, own stance (feet free, knees softer), own rail stances.

## 5. Rendering budget (mobile, Medium)
- ≤ ~150 draw calls, ≤ ~250k triangles in view, one shadow-casting directional light (sun) with a rider-following frustum, no other dynamic lights
  (neon = emissive + bloom), DPR ≤ 1.5, post: bloom + FXAA + vignette (one composer, half-res bloom).
- Static decor is merged per material (`ctx.addStatic`), repeated props are `InstancedMesh` (`ctx.addInstance`).
- No per-frame allocations in hot paths (reuse vectors/matrices), no `new` in update loops, no layout thrash in the HUD (transform/opacity only).
- `QualityProfile` (src/config.ts) is the only quality switch modules look at; `setProfile()` must work at runtime.

## 6. Working rules (parallel agents share ONE working directory)
1. Edit only the files your module owns (§2). Never revert or "tidy" other modules' files.
2. Contracts (`src/types/**`, `src/core/events.ts`, `src/config.ts`, `src/data/geometry.ts`) may be changed only **additively** (new optional field, new event,
   new helper) and only when really needed — say so in your final report. Never rename/remove/re-type existing members.
3. No git commands that change state (no commit/checkout/stash/reset). No new npm dependencies.
4. Dev server: run `./scripts/dev-ensure.sh` (one shared Vite on http://localhost:5173 — never start another, never kill it).
   Your sandbox page: `dev/<name>.html` + `src/dev/<name>.ts` (copy the pattern of `dev/hello.html`).
5. Screenshots: `node scripts/shot.mjs --url http://localhost:5173/dev/<name>.html --wait 2500 --shot .shots/<name>/a.png` (see the header of the script:
   `--eval`, `--waitFor`, `--key`, `--tap`, several `--shot` in one run). **Open the PNG with the Read tool and look at it.** Software GL is slow (a few fps) — that is expected; judge the picture, not the fps.
6. Type-check only your files: `npx tsc --noEmit 2>&1 | grep -E "^src/(yourdir|…)"` must print nothing (other modules may be mid-edit).
   Unit tests: `npx vitest run tests/unit/<yourfile>`.
7. TypeScript strict, no `any` (use `unknown` + narrowing), files ≲ 600 lines, comments only where the maths/intent is not obvious.
8. Finish with a short report: what works, what is missing, contract changes, how to see it (sandbox URL + shot paths), known issues.
