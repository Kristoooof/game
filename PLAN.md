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
- [x] Szimulációs tick (fix 0,25 s játékidő), szünet és gyorsítás (1×/2×/4×; szóköz, 1/2/3)
- [x] Áruk és raktárkészlet szigetenként (a kezdő készlet a hajón, az első kikötő kirakja; a felső sáv a képernyő közepén lévő sziget készletét mutatja)
- [x] Termelő épületek: favágó (erdő), halász (víz), birkafarm (fű) → szövöde (posztó), kovácsműhely (fa → szerszám), téglaégető (hegy/sziklás part); a környező terep adja a sebességet
- [x] Szállítók: minden kikötőnek/raktárnak egy szekere, legrövidebb úton viszi a termelők árut a sziget raktárába, és hozza nekik az alapanyagot
- [x] Termelés hatékonyság kijelzése (koppintásra: hatékonyság, készlet, ok: nincs út, megtelt, nincs alapanyag, kevés erdő)

### 4. Lakosság
- [x] Lakóházak, lakossági szintek (Paraszt → Polgár → Kereskedő; 8/16/25 lakó); a ház kinézete a szinttel nő (zsúpfedeles kunyhó → kétszintes cserepes ház → kőlábazatos kereskedőház)
- [x] Igények és elégedettség: hal (mindenkinek), posztó (polgártól), szerszám (kereskedőnek), hit (kápolna 10 mezőn belül); a javak a sziget raktárából fogynak, az elégedettség szerint telik vagy ürül a ház
- [x] Ház szintlépés, ha tele van és minden igény teljesül (anyagért: 3 fa, illetve 3 tégla + 2 szerszám)
- [x] Adóbevétel (lakónként és szintenként, elégedettséggel arányos), épület-fenntartási költség; a felső sávban pénzmérleg percenként és lakosság; házra koppintva lakók, elégedettség, hiányzó igények

### 5. Hajók és szigetek közti kereskedelem
- [x] Hajóépítés a kikötőben (kikötőre koppintva: 800 arany, 10 fa, 4 szerszám; 40 egység raktér)
- [x] Hajó mozgatása (A* útkeresés vízen, földnyelvet nem vág át), kijelölés koppintással, parancs: koppintás a vízre vagy egy kikötőre
- [x] Rakodás/kirakodás kikötőben a hajó paneljén (5-ösével)
- [x] Kereskedelmi útvonalak: megállók kikötőnként, áruként „be”/„ki”, automata körjárat (a raktér egyenlően oszlik a berakott áruk közt)
- [x] Új sziget megszerzése: a kikötőt egy 8 mezőn belül álló hajó rakományából kell fizetni; a játék a kezdő hajónál indul, az első kikötő a teljes rakományt kirakja
- [x] Szigetenként eltérő termékenység: birka (gyapjú) minden második szigeten, a kezdő szigeten nem → a posztóhoz kereskedni kell
- [x] Szabadkereskedő NPC hajó: sorban járja a kikötőket, ahol a kikötő paneljén beállított áruból vesz (10 fölött) vagy elad (15-ig, másfélszeres áron)

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
- [x] Táj: folyók a hegyekből a tengerig (patakként indulnak, kanyarognak, folyásiránnyal áramló víz), vízesés a hegy peremén, híd ahol út keresztezi; sziklás partszakaszok, dűnés széles strandok, dombok, virágos mezők
- [x] Domborzat: teraszok (2 szint) sziklafallal, peremfénnyel és lábárnyékkal; a folyó szintenként lép le, ott valódi vízesés zúdul a sziklafalon habbal és párával; folyó-sodrás flowmappel (kanyarban és a partnál is egyenletes); épület nem állhat szintek határán, az út rámpaként átmehet
- [x] Hangulat: időjárás (derült, felhős, eső, köd; néhány percenként vált), sodródó felhőárnyékok, eső cseppekkel és gyűrűkkel a vízen, köd a tengeren, szélre hajló fák; beállítás: változó / mindig derült; `?idojaras=rain`
- [x] Mozgó élet: emberkék sétálnak az utakon, szekerek a raktár/kikötő és a házak között (legrövidebb úton), halászcsónakok a halászkunyhóknál; vitorlások a nyílt tengeren hullámnyommal, orrhullámmal és tükörképpel
- [x] Csiszolás: 4× felbontású sprite-ok, dúsabb lomb és tűlevél, kopott falak és foltos-mohás tetők, keréknyomos köves utak, részletes emberkék és szekér, kötélzetes hajók árnyalt vitorlával, mohás párkányos sziklafalak
- [x] Asset-generációváltás: hegyek és sziklák magasságmezőből, lombkoronák gömbökből, fenyők kúpokból, képpontonként megvilágítva (fényirány, takarás, peremfény, felületi textúra); épületeken vakolat-, cserép- és nádtextúra
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
