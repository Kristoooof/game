# Graph Report - game  (2026-10-17)

## Corpus Check
- 48 files · ~52,216 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 3)

## Summary
- 464 nodes · 990 edges · 28 communities (24 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9db17e10`
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
- terrain.ts
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
- applySettings
- settings.ts
- fxaa.ts
- refresh
- atmosphere.ts
- life.ts
- daylight.ts
- life.ts
- wind.ts

## God Nodes (most connected - your core abstractions)
1. `drawBuilding()` - 27 edges
2. `createTerrain()` - 24 edges
3. `mulberry32()` - 24 edges
4. `fill()` - 21 edges
5. `terrainAt()` - 21 edges
6. `P()` - 18 edges
7. `groundToScreen()` - 18 edges
8. `walls()` - 17 edges
9. `house()` - 15 edges
10. `showPreview()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `bake()` --indirect_call--> `shade()`  [INFERRED]
  src/render/terrain.ts → src/render/buildings.ts
- `World` --references--> `Good`  [EXTRACTED]
  src/sim/world.ts → src/data/buildings.ts
- `Building` --references--> `BuildingId`  [EXTRACTED]
  src/sim/world.ts → src/data/buildings.ts
- `refresh()` --calls--> `chimneyAt()`  [EXTRACTED]
  src/main.ts → src/render/buildings.ts
- `refresh()` --calls--> `drawTerritory()`  [EXTRACTED]
  src/main.ts → src/render/buildings.ts

## Import Cycles
- None detected.

## Communities (28 total, 4 thin omitted)

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
Nodes (43): app, atmosphere, cam, countFps, effects, fixedTime, fixedWeather, fxaa (+35 more)

### Community 5 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, isolatedModules, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+3 more)

### Community 6 - "caveman-commit"
Cohesion: 0.18
Nodes (9): caveman-commit, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 7 - "caveman-review"
Cohesion: 0.18
Nodes (9): caveman-review, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 8 - "terrain.ts"
Cohesion: 0.06
Nodes (82): pixi.js, drawLampPost(), drawRoads(), lampPosts(), pierBox(), setGlow(), setSun(), createEffects() (+74 more)

### Community 9 - "Ponytail Help"
Cohesion: 0.25
Nodes (7): Configure Default Mode, Deactivate, Levels, More, Ponytail Help, Skills, Update

### Community 10 - "render/buildings.ts"
Cohesion: 0.15
Nodes (43): AWNING_COLORS, barrel(), Box, chimneyAt(), crane(), crate(), door(), DOOR_COLORS (+35 more)

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
Cohesion: 0.27
Nodes (14): anchorFor(), cancel(), construction, demolishAt(), end(), footprint(), move(), onHover() (+6 more)

### Community 19 - "applySettings"
Cohesion: 0.67
Nodes (3): applySettings(), waterRes(), resolutionOf()

### Community 20 - "settings.ts"
Cohesion: 0.17
Nodes (14): Antialias, createFpsCounter(), createSettingsPanel(), DAY_CYCLE, DEFAULTS, displayWidth(), loadSettings(), LOOKS (+6 more)

### Community 22 - "refresh"
Cohesion: 0.67
Nodes (3): icon(), refresh(), showResources()

### Community 23 - "atmosphere.ts"
Cohesion: 0.28
Nodes (8): canvasTexture(), cloudTexture(), createAtmosphere(), NEXT, Sky, TARGETS, Weather, WIND

### Community 24 - "life.ts"
Cohesion: 0.15
Nodes (18): BuildingDef, BuildingId, BUILDINGS, Category, CATEGORY_NAMES, Good, GOOD_NAMES, menu (+10 more)

### Community 25 - "daylight.ts"
Cohesion: 0.29
Nodes (9): vitest, AMBIENT, daylight(), DayTime, lerp(), RGB, smooth(), SUN_STEPS (+1 more)

### Community 26 - "life.ts"
Cohesion: 0.11
Nodes (30): bake(), Baked, BREECHES, Cart, cartArt(), createLife(), HAIR, horse() (+22 more)

## Knowledge Gaps
- **3 isolated node(s):** `eslint`, `prettier`, `typescript`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 212 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `pixi.js` connect `terrain.ts` to `package.json`, `main.ts`, `render/buildings.ts`, `fxaa.ts`, `atmosphere.ts`, `life.ts`, `life.ts`, `wind.ts`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **What connects `eslint`, `prettier`, `typescript` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Why does `mulberry32()` connect `terrain.ts` to `render/buildings.ts`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Should `Caveman Help` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `Mérföldkövek` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `caveman` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._