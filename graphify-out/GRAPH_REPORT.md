# Graph Report - game  (2026-10-15)

## Corpus Check
- 30 files · ~9,399 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 3)

## Summary
- 201 nodes · 244 edges · 18 communities (16 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bdb89de7`
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
- map.ts
- Ponytail Help
- devDependencies
- ponytail-audit/SKILL.md
- ponytail-review/SKILL.md
- Ponytail
- ponytail-debt/SKILL.md
- CLAUDE.md
- .claude/CLAUDE.md
- camera.ts

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 10 edges
2. `Rules` - 10 edges
3. `Mérföldkövek` - 10 edges
4. `scripts` - 7 edges
5. `Caveman Help` - 7 edges
6. `Ponytail Help` - 7 edges
7. `tileAt()` - 6 edges
8. `attachCameraControls()` - 6 edges
9. `tileToScreen()` - 6 edges
10. `caveman` - 6 edges

## Surprising Connections (you probably didn't know these)
- `tileAt()` --calls--> `screenToWorld()`  [EXTRACTED]
  src/main.ts → src/render/camera.ts
- `tileAt()` --calls--> `terrainAt()`  [EXTRACTED]
  src/main.ts → src/sim/map.ts
- `landAreas()` --calls--> `terrainAt()`  [EXTRACTED]
  src/sim/map.test.ts → src/sim/map.ts
- `tileAt()` --calls--> `screenToTile()`  [EXTRACTED]
  src/main.ts → src/render/iso.ts
- `outline()` --calls--> `diamond()`  [EXTRACTED]
  src/main.ts → src/render/terrain.ts

## Import Cycles
- None detected.

## Communities (18 total, 2 thin omitted)

### Community 0 - "package.json"
Cohesion: 0.10
Nodes (19): dependencies, pixi.js, name, private, scripts, build, dev, format (+11 more)

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
Cohesion: 0.12
Nodes (24): pixi.js, vitest, app, cam, hover, MAPS, mid, onHover() (+16 more)

### Community 5 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, isolatedModules, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+3 more)

### Community 6 - "caveman-commit"
Cohesion: 0.18
Nodes (9): caveman-commit, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 7 - "caveman-review"
Cohesion: 0.18
Nodes (9): caveman-review, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 8 - "map.ts"
Cohesion: 0.28
Nodes (10): CHARS, GameMap, generateMap(), lerp(), parseMap(), smooth(), terrainAt(), landAreas() (+2 more)

### Community 9 - "Ponytail Help"
Cohesion: 0.25
Nodes (7): Configure Default Mode, Deactivate, Levels, More, Ponytail Help, Skills, Update

### Community 10 - "devDependencies"
Cohesion: 0.25
Nodes (8): devDependencies, eslint, @eslint/js, prettier, typescript, typescript-eslint, vite, vitest

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
Cohesion: 0.29
Nodes (7): attachCameraControls(), Camera, Handlers, MAX_SCALE, MIN_SCALE, screenToWorld(), zoomAt()

## Knowledge Gaps
- **3 isolated node(s):** `eslint`, `prettier`, `typescript`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 126 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `pixi.js` connect `main.ts` to `package.json`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **What connects `eslint`, `prettier`, `typescript` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Why does `devDependencies` connect `devDependencies` to `package.json`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Should `Caveman Help` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `Mérföldkövek` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `caveman` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._