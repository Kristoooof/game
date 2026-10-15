# Graph Report - game  (2026-10-15)

## Corpus Check
- 37 files · ~17,207 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 3)

## Summary
- 296 nodes · 523 edges · 19 communities (17 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `127d129e`
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
- textures.ts
- Ponytail Help
- render/buildings.ts
- ponytail-audit/SKILL.md
- ponytail-review/SKILL.md
- Ponytail
- ponytail-debt/SKILL.md
- CLAUDE.md
- .claude/CLAUDE.md
- camera.ts
- terrain.ts

## God Nodes (most connected - your core abstractions)
1. `showPreview()` - 14 edges
2. `drawBuilding()` - 12 edges
3. `attachCameraControls()` - 11 edges
4. `terrainAt()` - 11 edges
5. `fill()` - 10 edges
6. `tileToScreen()` - 10 edges
7. `createTerrain()` - 10 edges
8. `mulberry32()` - 10 edges
9. `compilerOptions` - 10 edges
10. `Rules` - 10 edges

## Surprising Connections (you probably didn't know these)
- `World` --references--> `Good`  [EXTRACTED]
  src/sim/world.ts → src/data/buildings.ts
- `Building` --references--> `BuildingId`  [EXTRACTED]
  src/sim/world.ts → src/data/buildings.ts
- `refresh()` --calls--> `drawRoads()`  [EXTRACTED]
  src/main.ts → src/render/buildings.ts
- `refresh()` --calls--> `drawTerritory()`  [EXTRACTED]
  src/main.ts → src/render/buildings.ts
- `tileAt()` --calls--> `screenToWorld()`  [EXTRACTED]
  src/main.ts → src/render/camera.ts

## Import Cycles
- None detected.

## Communities (19 total, 2 thin omitted)

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
Cohesion: 0.07
Nodes (56): BuildingDef, BuildingId, BUILDINGS, Category, CATEGORY_NAMES, Good, GOOD_NAMES, anchorFor() (+48 more)

### Community 5 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, isolatedModules, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+3 more)

### Community 6 - "caveman-commit"
Cohesion: 0.18
Nodes (9): caveman-commit, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 7 - "caveman-review"
Cohesion: 0.18
Nodes (9): caveman-review, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 8 - "textures.ts"
Cohesion: 0.13
Nodes (27): Art, AUTUMN, boulder, broadleaf(), bush(), conifer(), Ctx, DARK_GREEN (+19 more)

### Community 9 - "Ponytail Help"
Cohesion: 0.25
Nodes (7): Configure Default Mode, Deactivate, Levels, More, Ponytail Help, Skills, Update

### Community 10 - "render/buildings.ts"
Cohesion: 0.29
Nodes (18): Box, createBuildingsView(), drawBuilding(), drawRoads(), drawTerritory(), edge(), fill(), gabled() (+10 more)

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
Cohesion: 0.20
Nodes (13): vitest, active(), attachCameraControls(), Camera, cancel(), end(), Handlers, MAX_SCALE (+5 more)

### Community 18 - "terrain.ts"
Cohesion: 0.23
Nodes (13): pixi.js, createGround(), distance(), screenToTile(), TILE_H, TILE_W, createTerrain(), leaf() (+5 more)

## Knowledge Gaps
- **3 isolated node(s):** `eslint`, `prettier`, `typescript`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 145 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `pixi.js` connect `terrain.ts` to `package.json`, `textures.ts`, `render/buildings.ts`, `main.ts`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **What connects `eslint`, `prettier`, `typescript` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `Caveman Help` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `Mérföldkövek` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `caveman` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `main.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07093253968253968 - nodes in this community are weakly interconnected._