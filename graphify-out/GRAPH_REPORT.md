# Graph Report - game  (2026-10-21)

## Corpus Check
- 62 files · ~70,004 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 3)

## Summary
- 587 nodes · 1455 edges · 32 communities (28 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `06054f97`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- package.json
- Caveman Help
- Mérföldkövek
- caveman
- main.ts
- compilerOptions
- caveman-commit
- caveman-review
- applySettings
- Ponytail Help
- render/buildings.ts
- ponytail-audit/SKILL.md
- ponytail-review/SKILL.md
- Ponytail
- ponytail-debt/SKILL.md
- CLAUDE.md
- .claude/CLAUDE.md
- camera.ts
- showPreview
- world.ts
- settings.ts
- map.ts
- setSpeed
- atmosphere.ts
- textures.ts
- ships.ts
- life.ts
- daylight.ts
- save.ts
- pixi.js
- applyCamera
- panel.ts

## God Nodes (most connected - your core abstractions)
1. `drawBuilding()` - 28 edges
2. `terrainAt()` - 26 edges
3. `createTerrain()` - 25 edges
4. `mulberry32()` - 25 edges
5. `fill()` - 23 edges
6. `islandOf()` - 21 edges
7. `Good` - 18 edges
8. `P()` - 18 edges
9. `groundToScreen()` - 18 edges
10. `place()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `bake()` --indirect_call--> `shade()`  [INFERRED]
  src/render/terrain.ts → src/render/buildings.ts
- `Level` --references--> `Good`  [EXTRACTED]
  src/data/population.ts → src/data/buildings.ts
- `Stop` --references--> `Good`  [EXTRACTED]
  src/sim/world.ts → src/data/buildings.ts
- `Production` --references--> `Terrain`  [EXTRACTED]
  src/data/buildings.ts → src/sim/map.ts
- `showResources()` --calls--> `balance()`  [EXTRACTED]
  src/main.ts → src/sim/population.ts

## Import Cycles
- None detected.

## Communities (32 total, 4 thin omitted)

### Community 0 - "package.json"
Cohesion: 0.07
Nodes (27): dependencies, pixi.js, devDependencies, eslint, @eslint/js, prettier, typescript, typescript-eslint (+19 more)

### Community 1 - "Caveman Help"
Cohesion: 0.14
Nodes (12): caveman-help, Example output, How to invoke, See also, What it does, Caveman Help, Configure Default Mode, Deactivate (+4 more)

### Community 2 - "Mérföldkövek"
Cohesion: 0.14
Nodes (13): 0. Alapok, 1. Térkép és kamera, 2. Építés, 3. Gazdaság és termelési láncok, 4. Lakosság, 5. Hajók és szigetek közti kereskedelem, 6. UI és élmény, 7. Csiszolás (+5 more)

### Community 3 - "caveman"
Cohesion: 0.09
Nodes (20): caveman, Example output, How to invoke, See also, What it does, 1. Answer first, 2. Kill ceremony, 3. Short word (+12 more)

### Community 4 - "main.ts"
Cohesion: 0.04
Nodes (45): app, atmosphere, cam, countFps, effects, first, fixedTime, fixedWeather (+37 more)

### Community 5 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, isolatedModules, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+3 more)

### Community 6 - "caveman-commit"
Cohesion: 0.18
Nodes (9): caveman-commit, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 7 - "caveman-review"
Cohesion: 0.18
Nodes (9): caveman-review, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 8 - "applySettings"
Cohesion: 0.67
Nodes (3): applySettings(), waterRes(), resolutionOf()

### Community 9 - "Ponytail Help"
Cohesion: 0.25
Nodes (7): Configure Default Mode, Deactivate, Levels, More, Ponytail Help, Skills, Update

### Community 10 - "render/buildings.ts"
Cohesion: 0.14
Nodes (47): refresh(), AWNING_COLORS, barrel(), Box, chimneyAt(), crane(), crate(), door() (+39 more)

### Community 11 - "ponytail-audit/SKILL.md"
Cohesion: 0.40
Nodes (4): 1. Map first, 2. Look for, 3. Check before you report, 4. Output

### Community 12 - "ponytail-review/SKILL.md"
Cohesion: 0.40
Nodes (4): 1. Understand first, 2. Look for, 3. Check before you report, 4. Output

### Community 13 - "Ponytail"
Cohesion: 0.40
Nodes (4): Before you write, Levels, Ponytail, The smallest complete change

### Community 14 - "ponytail-debt/SKILL.md"
Cohesion: 0.50
Nodes (3): Boundaries, Output, Scan

### Community 17 - "camera.ts"
Cohesion: 0.21
Nodes (12): active(), attachCameraControls(), Camera, cancel(), end(), Handlers, MAX_SCALE, MIN_SCALE (+4 more)

### Community 18 - "showPreview"
Cohesion: 0.21
Nodes (14): anchorFor(), buildMenu, cancel(), construction, demolishAt(), footprint(), move(), onHover() (+6 more)

### Community 19 - "world.ts"
Cohesion: 0.15
Nodes (34): vitest, end(), CAP, CART_SPEED, coverage(), depotFor(), moveCart(), nextJob() (+26 more)

### Community 20 - "settings.ts"
Cohesion: 0.17
Nodes (14): Antialias, createFpsCounter(), createSettingsPanel(), DAY_CYCLE, DEFAULTS, displayWidth(), loadSettings(), LOOKS (+6 more)

### Community 21 - "map.ts"
Cohesion: 0.09
Nodes (51): drawLampPost(), drawRoads(), lampPosts(), pierBox(), setGlow(), setSun(), setWet(), createEffects() (+43 more)

### Community 22 - "setSpeed"
Cohesion: 0.33
Nodes (6): autosave(), closeMenu(), menu, openMenu(), setSpeed(), toSave()

### Community 23 - "atmosphere.ts"
Cohesion: 0.28
Nodes (8): canvasTexture(), cloudTexture(), createAtmosphere(), NEXT, Sky, TARGETS, Weather, WIND

### Community 24 - "textures.ts"
Cohesion: 0.11
Nodes (37): blit(), clamp01(), Ctx, hexRGB(), litCrown(), mix(), RGB, smooth() (+29 more)

### Community 25 - "ships.ts"
Cohesion: 0.13
Nodes (35): PRICES, bar(), buildingPanel(), costOf(), deselect(), harborName(), harborPanel(), icon() (+27 more)

### Community 26 - "life.ts"
Cohesion: 0.14
Nodes (16): bake(), Baked, BREECHES, cartArt(), Figure, HAIR, horse(), Load (+8 more)

### Community 27 - "daylight.ts"
Cohesion: 0.33
Nodes (8): AMBIENT, daylight(), DayTime, lerp(), RGB, smooth(), SUN_STEPS, sunShadow()

### Community 28 - "save.ts"
Cohesion: 0.07
Nodes (51): BuildingDef, BuildingId, BUILDINGS, Category, CATEGORY_NAMES, Good, GOOD_NAMES, Production (+43 more)

### Community 30 - "pixi.js"
Cohesion: 0.25
Nodes (5): pixi.js, createFxaa(), createWind(), COLORS, createMinimap()

## Knowledge Gaps
- **3 isolated node(s):** `eslint`, `prettier`, `typescript`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 221 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `pixi.js` connect `pixi.js` to `package.json`, `main.ts`, `render/buildings.ts`, `map.ts`, `atmosphere.ts`, `textures.ts`, `life.ts`, `save.ts`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **What connects `eslint`, `prettier`, `typescript` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Why does `mulberry32()` connect `textures.ts` to `render/buildings.ts`, `map.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Should `Caveman Help` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `Mérföldkövek` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `caveman` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._