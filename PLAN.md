# Böngészős Anno-szerű városépítő – terv

Anno 1404 ihlette, böngészőben futó gazdasági stratégiai játék. Saját név és saját (procedurális / szabad licencű) grafika – az eredeti játék assetjeit, nevét és logóját nem használjuk.

## Döntések

- **Grafika:** 2D izometrikus
- **Tech:** TypeScript + Vite + PixiJS, Vitest a tesztekhez
- **MVP terjedelem:** több sziget + hajók (kereskedelmi útvonalak), harc és AI ellenfél nélkül
- **UI nyelv:** magyar
- **Mentés:** böngészőbe (IndexedDB, localStorage fallback)
- **Platform:** asztali + mobil/érintés
- **Közzététel:** GitHub Pages (GitHub Actions build)

- **Játékidő:** szünet és gyorsítás (1×/2×/4×)
- **Térkép:** procedurális generálás seed-del, mellette kézzel készített térkép(ek) is
- **Hang:** hangeffektek és zene

## Architektúra

- `src/sim/` – tiszta, renderer-független szimuláció (fix tick, determinisztikus) → jól tesztelhető
- `src/render/` – PixiJS izometrikus nézet, kamera, sprite-ok
- `src/ui/` – HTML/CSS overlay (építési menü, raktár, lakossági igények)
- `src/data/` – épületek, áruk, láncok, lakossági szintek adatként (JSON/TS)
- Mentés = a szimulációs állapot szerializálása

## Mérföldkövek

### 0. Alapok
- [x] Skillek telepítése (caveman, ponytail, graphify, rtk)
- [x] Terv elkészítése
- [x] Vite + TS + PixiJS projekt, Vitest, ESLint/Prettier
- [x] GitHub Actions: build + teszt + GitHub Pages deploy
- [x] Üres izometrikus vászon (élő oldal: alapértelmezett branchről deployol)

### 1. Térkép és kamera
- [ ] Izometrikus csempe-rács (víz, part, föld, hegy, erdő)
- [ ] Procedurális szigetgenerálás seed-del (több sziget egy tengeren)
- [ ] Kézzel készített térkép betöltése
- [ ] Kamera: húzás, zoom (egér + érintés, pinch)
- [ ] Csempe kijelölés egérrel / érintéssel

### 2. Építés
- [ ] Építési menü (kategóriák)
- [ ] Épület lerakás előnézettel, érvényesség-ellenőrzés (terep, ütközés)
- [ ] Utak húzása
- [ ] Bontás
- [ ] Építési költség: pénz + anyag (fa, szerszám, tégla)
- [ ] Kikötő/raktár hatósugár – csak ezen belül lehet építeni

### 3. Gazdaság és termelési láncok
- [ ] Szimulációs tick, játékidő, szünet és gyorsítás
- [ ] Áruk és raktárkészlet szigetenként
- [ ] Termelő épületek (favágó, halász, birkafarm → szövöde, stb.)
- [ ] Szállítók: piaci/raktári kocsik útkereséssel (A*) az utakon
- [ ] Termelés hatékonyság kijelzése

### 4. Lakosság
- [ ] Lakóházak, lakossági szintek (Paraszt → Polgár → Kereskedő)
- [ ] Igények (élelem, ruha, hit, …) és elégedettség
- [ ] Ház szintlépés, ha igények teljesülnek
- [ ] Adóbevétel, épület-fenntartási költség, pénzmérleg

### 5. Hajók és szigetek közti kereskedelem
- [ ] Hajóépítés a kikötőben
- [ ] Hajó mozgatása (útkeresés vízen), kijelölés, parancsok
- [ ] Rakodás/kirakodás kikötők között
- [ ] Kereskedelmi útvonalak (automata körjárat, áru-szabályok)
- [ ] Új sziget megszerzése (kikötő építése)
- [ ] Szigetenként eltérő termékenység (pl. csak bizonyos szigeten nő a komló)
- [ ] Szabadkereskedő NPC hajó (vétel/eladás)

### 6. UI és élmény
- [ ] Magyar felület: felső sáv (pénz, lakosság), épület infópanel, raktár
- [ ] Mobil elrendezés, érintés-barát gombok
- [ ] Minimap
- [ ] Értesítések (hiány, elégedetlenség)
- [ ] Mentés / betöltés (több mentési hely)
- [ ] Főmenü, új játék seed-del

### 7. Csiszolás
- [ ] Grafika finomítása (épület sprite-ok, animációk, napszak?)
- [ ] Hangok, zene
- [ ] Teljesítmény (nagy térkép, culling)
- [ ] Egyensúlyozás

### Később (nem MVP)
- [ ] Orient régió, nomádok/nemesek
- [ ] AI ellenfél
- [ ] Harc (hajók, katonák)
- [ ] Küldetések, kampány
