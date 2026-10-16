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
- [x] Izometrikus csempe-rács (víz, part, föld, hegy, erdő)
- [x] Procedurális szigetgenerálás seed-del (több sziget egy tengeren, `?seed=123`)
- [x] Kézzel készített térkép betöltése (`?map=pelda`, ASCII formátum: `src/data/maps/`)
- [x] Kamera: húzás, zoom (egér + érintés, pinch)
- [x] Csempe kijelölés egérrel / érintéssel
- [x] Nagyobb térkép (256×256, 8 sziget, 22–40 mező sugarú szigetek); terep chunkokra bontva, culling

### 2. Építés
- [x] Építési menü (kategóriák)
- [x] Épület lerakás előnézettel, érvényesség-ellenőrzés (terep, ütközés)
- [x] Utak húzása
- [x] Bontás
- [x] Építési költség: pénz + anyag (fa, szerszám, tégla)
- [x] Kikötő/raktár hatósugár – csak ezen belül lehet építeni

### 3. Gazdaság és termelési láncok
- [ ] Szimulációs tick, játékidő, szünet és gyorsítás
- [ ] Áruk és raktárkészlet szigetenként (most még egy közös készlet)
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
- [x] Grafika v2: animált tenger, sekély part menti víz, tajték, megemelt szigetek sziklafallal, textúrázott terep, fák/bokrok/hegyek sprite-okból, részletes épületek, földutak, felhőárnyékok, középkori UI
- [x] Grafika v3: GPU shaderes talaj és tenger (szerves partvonal, lágy terepátmenetek, domborzati árnyékolás, mélység szerinti víz, hullámok, tajték, csillogás, felhőárnyék), új fák/bokrok/sziklák/hegyek, összefüggő utak, távoli LOD
- [x] Grafika v4: éles kép nagy DPI-n, partra futó hullámok, szélben hullámzó fű, ringó fák, részletes épületek (cserép, ablakkeret, zsalu, virágláda, lábazat), kéményfüst, sirályok
- [x] Optimalizálás: sütött zajtextúra a shaderben (mipmappel), CPU-n elmosott maszkok, effektek csak a képernyőn látható részen
- [x] Beállítások: felbontás (automatikus = kijelző sűrűsége, max 2×; vagy 960–3840 px szélesség), élsimítás (ki/MSAA/FXAA), FPS számláló; mentve a böngészőbe
- [x] Grafika v5: egységes fényirány (árnyékok jobbra-lent), lágy és irányított árnyékok, fal-szemcsézés, élesebb sziklák és partvonal, fű-szálak, lombgömbök napos peremmel és sötét résekkel, tűlevél-részletek, meleg napfény-fény
- [x] Megjelenés: sima vagy pixeles (beállítás); hegyvidéki talaj újrarajzolva (fakó kő, zuzalék, zuzmó, cserje a szélén)
- [x] Víz külön pixeles/sima beállítás; víz-sávok javítása (chamfer távolságmező, a térkép szélén mély víz); parti pálmák, sodort fa és kavicsok
- [x] Víz: saját felbontás (sima víz mindig eszköz-pixel, független a világtól); átlátszó sekély víz homokfenékkel, kaustika; csillogás gyengítve
- [x] Egyedi házak: 6 falszín, gerincés és nyeregtető, 1–2 szint, színes markiz, ajtó, kert kerítéssel, virágágyással és ösvénnyel
- [x] Víz v2: partra futó törő hullámok, zátonyfoltok, széles napfény-sáv, parti tárgyak tükörképe a vízen; házak: a kerítés a tető alá került
- [x] Víz v3: csíkmentes hullámok, parti sziklák hullámgyűrűvel és tajtékkal, fa móló a kikötőnél/halásznál, épületek tükörképe; tükörképek csak a vízen (a szárazföld alatt); mobilon teljes pontosságú shader
- [x] Napszakok: 8 perces nap (hajnal, dél, naplemente, éjszaka), színes fény, hosszú reggeli/esti árnyékok, éjjel világító ablakok és lámpák, holdfény-csík a vízen; beállítás: változó / mindig nappal; `?ido=0.8`
- [x] Épületek saját formával: kikötő darura taposókerékkel, raktár kőalappal és emelőgerendával, favágó rönkház farakással, halászkunyhó hálóval és csónakkal, kápolna haranggal és temetővel; építés állvánnyal és porral, bontáskor porfelhő
- [x] Vízi sziklák csoportokban, kicsitől a nagy szirtig (5×), sirálypöttyökkel, hullámgyűrűvel
- [ ] Grafika finomítása (épület sprite-ok, animációk)
- [ ] Hangok, zene
- [x] Teljesítmény: statikus világ darabonként textúrába sütve (zoomhoz igazított felbontás, csak a változott darab sül újra, nem látott darabok felszabadulnak), élő csak a víz-shader; JS idő/képkocka 9,5 → 1,1 ms
- [x] Hegyek újrarajzolva: csupasz és havas csúcsok, ritkább elhelyezés, rétegzett sziklatalaj
- [ ] Egyensúlyozás

### Később (nem MVP)
- [ ] Orient régió, nomádok/nemesek
- [ ] AI ellenfél
- [ ] Harc (hajók, katonák)
- [ ] Küldetések, kampány
