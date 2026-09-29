# Afterhours

A virtual collector's room: a pearl-white, gold-zip 9-pocket binder on a scanned-wood table, a fully modeled Tokyo-inspired city beyond the balcony, and a locally saved collection.

This is the standalone full-visual release in `justschen/astra-30-tcg`. The original temporary repository remains separate. All collection interactions, card images and scene assets are included.

## Run

From the repository root:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4173**. Set `PORT` to use a different port.

```sh
npm run build:binder
npm test
npm run test:binder:browser
npm run audit:binder:performance
```

The production build is in `dist/binder/`; serve that directory with a static web server. Development uses the separate `dist/binder-dev/` directory, so building production does not replace a running preview's chunks. Production builds remove only their owned generated scripts, styles and sourcemaps before rebuilding, not unrelated files. The browser test expects the development server to be running, uses the existing Playwright dependency, and writes ignored screenshots to `shots/binder/`. It does not modify your normal browser's storage.

If Chromium is not installed for Playwright yet, run `npx playwright install chromium` before the browser tests.

## Controls

- Drag the room to look around; scroll to zoom. **Horizontal scene movement follows your drag: right moves the scene right, and left moves it left. Drag down to look up, and drag up to look down.** The invert setting has been removed, and old saved invert preferences no longer affect the camera. Page-turn gestures are unchanged. **Binder** sets it on the table; **Lift binder** raises and tilts the actual book for close reading; **The room** looks up into the apartment; **Balcony** moves outside the glazing, inside the completed three-sided balcony railing.
- Use the **left/right arrow keys**, toolbar arrows, or drag a page's outer edge to turn a sheet.
- **Click or tap a card to pick it up.** The unframed hand expands leftward with a slight overlap between cards, then wraps onto a second row and additional rows as needed. The selected card lifts above its neighbors. Larger hands scroll vertically on small screens instead of clipping the final card horizontally.
- **Return to bag** returns every currently held card to the **bag**, including cards picked up from pockets or stacks. This is one undoable action; cards already placed are not changed.
- **Fold hand** leaves only the selected card visible so you can reach the binder beneath it. **Show cards** restores all rows. Large hands fold automatically when they obstruct pocket centers, on desktop as well as mobile. Explicitly showing the hand is respected until the next selection/placement transition.
- **Click a card in the hand to select it.** Its raised position and gold outline identify the active card. Clicking a highlighted empty pocket places that card, including across different pages. Hovering previews the selected artwork. After placement, selection returns to the first remaining card, preserving pickup order unless you choose another.
- An occupied pocket picks up its card instead of silently replacing it. A pocket vacated by a queued card can accept the next card safely.
- The bag stays open while selecting multiple cards. Its **Back to binder** button returns to the table or preserves the lifted-binder view; it does not automatically place cards. Clicking a selected bag card again removes it from the hand. Filters and sorting never reorder the hand.
- **Double-click or right-click a hand card**, press **E**, or use a bag card's **eye button** to inspect. A single click on a hand card only selects it. Move over the enlarged artwork to catch its foil; its reverse is an original protective-sleeve design. Closing inspection restores the originating bag control and scroll position for continued keyboard browsing.
- Click a **table-stack label** while holding cards to place the selected card there. Repeatedly clicking the physical cards picks up successive top cards. Use **Return card to bag** in the inspector to move a selected card into the bag.
- On touchscreens, cards use taps and the bag keeps native vertical scrolling. Dragging the room or a page edge remains available.
- **B** opens the broad, centered bag modal. It uses more of the screen for the card grid rather than a narrow right-side panel. Search by name, number, or illustrator; filter by collection, rarity, and location; sort by set order, name, or rarity.
- Rarity sorting follows an explicit collector-oriented tier/section order rather than alphabetic labels. Result tiles show rarity; the source's `Pikachu` category is displayed as **Pikachu holo** without rewriting catalog metadata.
- Click the **page readout** for a map of all 21 spreads, or use the spread selector in Pocket view. **Show in binder** on a filed bag/inspection card jumps directly to its saved pocket and lifts the binder.
- **Organize binder** previews a batch arrangement from the held cards, existing binder or entire checklist. Choose an order and starting page, protect pages with **Keep selected pages untouched**, then **Preview arrangement** and **Apply plan**. Preview changes nothing; applying is one undo step. Insufficient space, a stale preview or a save conflict blocks application rather than discarding cards.
- **Admire** in the hand controls, **Admire card in the room** in inspection, or **A** with a selected card holds up the real card mesh. Drag horizontally to turn through a full 360 degrees and vertically to tilt up or down, limited to 60 degrees in either direction. The card stays upright: roll and upside-down tumbling are disabled. Arrow keys, Tilt up/down, Flip and Reset provide the same control without dragging; Flip turns to the other face without inverting it. **Esc** or **Back to hand** finishes without placing or returning the card. Full-size artwork is loaded for this view; the reverse remains an original Afterhours sleeve. Open dialogs retain priority over card-rotation shortcuts.
- Cards now share **printing-aware, angle-dependent finish previews** in the binder, on the table and in Admire. Smooth holo, ex-style stars, Cosmos, full-art foil, inferred textured/confetti foil and starburst treatments use different shared masks and microfacet patterns. The Admire caption identifies the treatment and explicitly flags unknown prints. These effects react to viewing/light angle, not a looping rainbow animation.
- The top-right **eye** button or **H** hides the HUD except the time/location and the eye. Held cards and any admired card remain in place. Click the eye again to restore the controls. Storage or loading errors are not suppressed.
- Click a table-stack label with an empty hand, or right-click a label at any time, to browse it. **Sort this stack** applies the chosen order to the physical stack.
- In the bag, choose **On table > Table stack** to view **To sort**, **Keepers**, or **Trades** independently, or all three together.
- **Delete/Backspace** puts back the selected card. **Esc** closes an open dialog, or returns the unplaced hand to its saved locations; unlike **Return to bag**, it does not move cards to the bag. **Ctrl/Cmd+Z** undoes up to 30 actions, restoring the layout, hand, and selected card.
- **Pocket view** provides the same collection using standard keyboard-accessible buttons and a selected-card dropdown, including when WebGL is unavailable. Mobile layouts display one full page per row for larger, readable pocket targets.
- The sound control enables optional, synthesized weather ambience and page sounds. Audio does not autoplay.

### Phone and tablet collection controls

- Editable fields and native selectors use **at least 16px text** on touch/narrow layouts, avoiding the small-input focus zoom used by iOS browsers. Browser pinch zoom remains enabled; the app does not set `user-scalable=no` or a maximum zoom.
- Opening the bag on touch starts in browsing mode instead of focusing the search field and summoning the keyboard. Tap search when needed. **Done** or the keyboard's Search/Enter action dismisses editing without clearing the query or selected cards. Desktop opening and the **B** shortcut retain immediate search focus; **/** focuses search inside the bag.
- Phone results use two larger card columns. **Filters and sorting** is collapsible, preserving its values when folded. While the keyboard occupies the visual viewport, results switch to compact thumbnail rows; the search/close controls and selected-card action remain reachable.
- The mobile bag has one main scroll container with a pinned header and footer. It follows the **visual viewport**, including keyboard height and offset, without resizing the 3D canvas or counteracting intentional pinch zoom. Returning from inspection restores the originating card and scroll position. Finger scrolling does not tilt the inspection artwork.
- The phone header reflows rather than squeezing five buttons into ovals. Room controls are circular **44px touch targets**, and the eye uses the same background, border and blur as its neighbors on desktop and mobile.

`node binder/tests/mobile-ux-browser.mjs` checks Chromium and WebKit at phone/tablet widths, in landscape, with larger text, and with simulated keyboard viewport changes. Install the WebKit binary with `npx playwright install webkit` if that optional browser is missing. These tests verify the CSS zoom threshold and viewport handling; an actual iPhone remains the final check for native keyboard/browser-chrome behavior.

The binder contains **20 double-sided sheets**, **40 nine-pocket faces**, and **360 distinct slots**. Its **21 open spreads** include the front and back inside covers. The sample starts at the first fully pocketed spread.

There is one virtual copy of each checklist variant. Picking up reserves its saved location until placement; a faint ghost and an in-hand label distinguish a reserved binder pocket from an empty one. Reusing a reserved pocket safely relocates its held card's reservation to the newly freed location, with an explicit announcement. Returning a hand to the bag does not undo completed placements and never loses a card.

The lifted view animates the existing binder mesh rather than displaying a second copy or a screenshot. Its pockets, arrow-key turns, mouse page-edge turns, selected-card placement, and back/front sheets all remain active. It fits portrait tablets as well as desktop and phone viewports.

### Card finishes and confidence

Finish is not determined by rarity alone. Explicit printing labels such as **Non-holo**, **Reverse Holo** and **Cosmos Holo** take precedence; more-specific rarity/subtype choices precede the catalog's generic **Holo** label. Modern standard holo can include a foil border, so art and border coverage are separate. See the [official Scarlet & Violet announcement](https://web.archive.org/web/20221209142252/https://www.pokemon.com/us/pokemon-news/pokemon-tcg-scarlet-violet-brings-changes-to-the-pokemon-trading-card-game) and [PokeBeach's border/ex-pattern coverage](https://www.pokebeach.com/2022/12/scarlet-violet-holo-effects-revealed-includes-foil-card-borders).

The generated patterns and layout masks are **original approximations**, not scans of the actual foil dies. Illustration Rares use smooth foil without assumed embossing. SIR and Classic Collection texture previews are explicitly inferred; RGB/Futuristic finishes and unspecified promos remain unverified, with no invented raised relief. Classic Collection does not tint the entire printed artwork gold. Exact finish data would require per-printing reference/mask/normal maps, not just the flat card image.

[card-finishes.js](./src/card-finishes.js) holds the resolver and shared material maps. The implementation uses Three.js physical iridescence, roughness and optional subtle normal/anisotropic response; a dark-ink safeguard reduces foil contribution over print. Masks are mipmapped non-color textures, shared per finish family and disposed with the room. A camera-relative upright pose and the protective reverse are independent of the foil layer.

Targeted validation: `node binder/tests/card-admiration-browser.mjs` exercises actual drag/touch/keyboard orientation and layout preservation; `node binder/tests/card-finishes-browser.mjs` checks rendered finish differences and frozen-frame stability. The latter is also part of the full browser suite.

## Quiet overlays and room settings

After **10 seconds without input**, the logo/top controls, collection introduction, location caption, and successful-save status fade away. Mouse movement, pointer input, scrolling, keyboard input, or focus restores them. The hand, binder navigation, and bag controls remain available.

Open dialogs, active gestures, and keyboard-focused overlay controls keep the HUD visible. Loading does not consume the inactivity period, and storage-error warnings are never hidden by the fade. Reduced-motion users get the same timeout without an animated transition.

### Graphics and performance

**Settings > Graphics and performance** offers three rendering modes. The selection is stored separately from your collection:

- **Balanced (default):** caps the room at 1.4 million pixels and the live city at 1.2 million pixels. These dimensions remain fixed while dragging, turning pages, placing cards and resting; the renderer no longer changes its sampling when an interaction stops. HUD/text controls remain at browser resolution. The former `auto` preference value is retained for compatibility.
- **Full detail:** retains the original rendering density (device pixel ratio capped at 1.65) for both layers, including during movement. It benefits from the new cache but remains expensive on large/Retina screens.
- **Smooth:** uses a fixed budget of up to 900,000 pixels for both room and city.

All modes retain the full-size card image files, printing-aware foil, city geometry, vehicle/pedestrian counts, weather and multisample antialiasing. **No cards or city objects are removed.** Changing graphics modes never changes the saved collection. If a browser blocks preference storage, the selected mode still works for the current session and a warning is shown.

Card print is kept separate from the room's cinematic tone mapping, so the already-colored image is not graded again. Its diffuse lighting is bounded rather than overexposing the print; foil adds a restrained, ink-masked reflection. The binder uses more matte pearl paper/leather, reduced sleeve clearcoat and a gentler room key. Admire uses the same room lights instead of adding a camera-attached lamp that could relight the background when a card appeared or disappeared.

Shared finish maps retain each printing's foil/texture pattern without lowering local roughness into near-mirror values. GPU tests verify original color swatches, unchanged paused background after placement/Admire, restrained highlight peaks and visible angle-dependent foil.

The weather, room-lighting, sound, settings and eye controls share one aligned row with equal circular dimensions, gaps and surface styling. On phones, view navigation and the clock/progress controls occupy separate rows to preserve touch-target sizes. The eye remains available when the other controls fade or are manually hidden. Faded controls do not leave invisible pointer targets; keyboard focus still wakes them.

Look direction is fixed rather than stored as a preference. Any obsolete `afterhours.preferences.v1` entry is ignored; collection data and its storage schema are unchanged.

The room includes ribbed paper lanterns, a paired pendant arrangement, pleated linen curtains, a walnut slat gallery wall, original framed prints, shelves, ceramics and a turntable/listening cabinet. An acoustic guitar on a stand, two floor-standing speakers, a framed vinyl gallery and a side table complete the listening corner. Soft, shader-animated steam rises from the coffee cup. Side walls, floor and ceiling extend behind the camera, with a closed back wall instead of exposed room edges at extreme look angles.

The interior uses a continuous plaster wall treatment and properly joined skirting/cornices rather than oversized decorative wall panels. A smaller table footprint, larger seating, lower/smaller TV and full-height doorway bring the furniture into a more consistent relationship. The table surface and joinery use restrained oak veneer with normal/roughness detail, and the floor has staggered individual boards. Camera positions, card dimensions and binder interaction coordinates are unchanged; the binder remains intentionally enlarged for editing rather than claiming an exact physical scale.

The entry is a **real opening in the apartment wall**, with a full-height hinged door held open beyond 90 degrees. Beyond it is a wider, enclosed **gaming den**: a dual-monitor computer setup, PC tower with illuminated cooling fans, mechanical keyboard/mouse, ergonomic chair, console/controller shelf and physical game cases. Cyan/magenta accents, under-desk lighting and a `CONTINUE?` sign distinguish it from the calmer living room. The original racing-game and mixer/chat screen artwork is drawn once, not streamed from a service or repainted every frame. These are decorative displays, not playable games or a second embedded browser.

The gaming room has real floors, walls, ceiling and depth; its equipment is positioned to be visible through the door from the existing seated camera. The ceiling stays behind the apartment lintel, and the exterior-depth prepass uses the same split wall geometry so it cannot fill the doorway back in. The door remains decorative and open by default, not a new navigation or walk-through control.

The left reading corner has a larger moss-upholstered chair, an oak library, framed records and a small original pocket-game keepsake. Shelf/seat heights and gaps are coordinated rather than scattered across tall wall panels. Reading and gaming-room lights follow the existing warm-room control without adding shadow-map passes. The gaming den reuses the previous hall's light budget; repeated keys, cases and fan parts are batched.

### Detailed houseplants

Both earlier procedural indoor leaf systems are replaced by **Poly Haven's CC0 Potted Plant 01 and 02 models**, with four deliberately placed plants. Real leaf-color, normal and roughness maps, varied branching and modeled curved leaf geometry replace flat generic paddles. The supplied opacity masks are embedded in the leaf color maps; alpha testing with alpha-to-coverage preserves the cutout silhouettes without transparent-card sorting. Pots sit on the floor or bookshelf at their intended scale, including a floor plant in the gaming den.

The two self-contained models total about **3.87 MiB** including 1K textures. Dense source dirt/pebbles are replaced with simple soil surfaces; the shared templates total **135,224 triangles** and repeated plants reuse their geometry/materials. No live asset-service requests occur in the app. Optional plant failures produce an explicit warning while leaving the room and binder usable. [Source credits](./public/room/ATTRIBUTION.txt) and [asset hashes/budgets](./public/room/plants/manifest.json) are included.

Regenerate these assets with `npm run assets:binder:plants`; use `npm run assets:binder:room -- --wood-only` for the oak maps, then rebuild. Plant source downloads are checksum-verified and cached under the ignored `tools/.cache/binder-plants/`. Alpha-conversion tests verify that the packed leaf image really retains opaque leaves and transparent negative space.

### In-room television

The television is mounted on the right wall above its media cabinet. Use **Settings > Television > Look at the TV**, then **Play TV**, or use the Settings play/pause control. It plays the requested [Snorlax & Pikachu Forest Lofi video](https://www.youtube.com/watch?v=kuctuTR_cEM) through YouTube's supported privacy-enhanced embed, starting muted. Unmute with the player's controls.

The player is perspective-aligned to the modeled screen, hidden behind occluding room objects, and removed from keyboard focus when off-screen or partially clipped. YouTube is contacted only after activation. Playback pauses when the tab is hidden; delayed readiness cannot override a pause. If embedding/network policy prevents playback, the TV exposes an explicit error, reconnect action and original YouTube link. The video is neither downloaded nor copied into a WebGL texture.

## Living city and weather

The view combines **real Project PLATEAU building meshes with an art-directed, full-3D interpretation of Zojoji, Shiba Park, and the district around Tokyo Tower**. There is no city photograph, projection-mapped photo, or billboard skyline in the rendered scene.

- **8,558 building volumes** span foreground, middle, distant, and surrounding neighborhoods. **5,090 use adapted survey geometry**; seven foreground anchors instead use individually modeled reference silhouettes. These include the broad terracotta office, ivory hotel/service spine, recessed charcoal crown, chamfered inclined crown, rounded tower, sloping green-glass slab and low park hotel. Twenty other foreground survey meshes remain fitted to the original anchors.
- **457 additional infill buildings** occupy the previously oversized near-city gaps, alongside **24 service courts and 72 parked cars**, parking markings, planters, curbs and drainage details. Infill preserves rotated building footprints, the actual curved road ribbons, sidewalks, the temple grounds and both side parks. Ground surfaces use concrete texture rather than a flat blue-gray plane.
- **3,397 ordinary buildings now use structured massing/roof profiles**, with **2,189 receiving actual silhouette changes** rather than different colors on the same box. The seven families are service slabs, side setbacks, rear setbacks, two-stage terraces, offset shoulder cores, asymmetric slant cuts and courtyard/notched upper wings. Setback widths, offsets and core proportions vary within families. Original heights, ground footprints, building IDs and population are preserved; surveyed bodies and the seven reference landmarks keep their existing forms.
- Roofs use supported regions on the actual upper-storey/terrace surfaces. Stair cores, lift overruns, louvered plant screens, fan/duct banks, ventilation racks and cylindrical water tanks replace the repeated thick cap plus isolated AC boxes. Parapets follow exposed terrace edges, and signs/cranes/beacons use roof-aware anchors. Equipment is kept away from fixture reservations; nearby surveyed/reference roofs reject overlapping equipment candidates.
- Stepped landmark bodies and vertical facade trim share the same tier envelopes. Mullions and outer strips stop at each setback instead of continuing as floating poles above the narrower upper floors.
- **Tokyo Tower is now about 24% smaller in the scene** (72 modeling units instead of 95), without changing the surrounding survey geometry. Its visible profile follows the supplied reference: a lower, narrower main observation deck, a much smaller upper deck, a stronger lower flare and a slender upper shaft. The main deck has beveled corners/tapered edges; the upper deck has an octagonal shell. Heavier, less repetitive bracing replaces the fine wire-mesh appearance. This is an art-directed silhouette, not a claim that its displayed deck heights are an engineering survey.
- **Zojoji** reuses the repository's detailed tiled-roof/temple geometry, with a gate, paths, lanterns, and a modeled park canopy.
- Window interiors, mullions, floor bands, rooftop mechanical equipment, water tanks, antennas, storefront signs, crosswalks, traffic signals, and street-light pools are geometry or procedural materials.
- The 27 foreground replacements use **sharp, world-scaled CC0 concrete/brick materials and analytical window shading**, not enlarged low-resolution aerial facade images. **5,727 modeled window assemblies** follow actual near-building wall planes, including setbacks, with frames, mullions and projecting sills. Recessed interiors, glazing reflections and varied fitted rooftop service assemblies add close-range detail. More distant survey buildings retain their licensed photographic surface atlases. Shopfronts and signs are fitted to supported wall regions rather than their old bounding boxes.
- **144 shopfronts**, including a fictional **7-Eleven corner store**, add signs, awnings, window displays, lanterns, cafe details, and utility lines. **99 sakura trees** and **512 pedestrians** add activity. Pedestrians use both shopping streets and the near side-district/temple routes, walk in two directional lanes, and carry umbrellas in rain. Paths stay outside the combined curved asphalt and building footprints.
- **576 moving traffic agents by default** travel along eight vehicle routes in a nine-street layout, three times the previous count. The temple approach is pedestrian-only. **Traffic** adjusts moving cars from zero to **768**; the 72 parked vehicles stay in their service courts. Cars have seeded speeds, safe spawning, car-following, acceleration/braking, visible headlight beams and brake lights, signal stops, and intersection yielding. They do not spawn inside junctions or enter one without enough space beyond it. Lane leaders and a spatial collision grid avoid all-pairs checks each frame.
- Moving vehicles include sedans, compacts, taxis, vans, box trucks and motorcycles with riders. Distinct lengths/widths, cab profiles, cargo bodies, taxi signs, colors, following gaps and small lane offsets break up the identical queues. Collision envelopes include wheel clearance. Headlights are brighter cool white; tail/brake lights are clearly red. Three-lamp signal heads switch between bright red, amber and green using the same phase logic obeyed by the traffic.
- A right-side shopping district adds original vertical, horizontal and rooftop neon signs to 30 existing blocks. Two main-street displays crossfade original ads every eleven seconds; their point lights and wet-road reflection colors track the displayed palette. Screen mounts are checked against the complete host mesh, not just bounding boxes. Two rooftop construction cranes have connected mast collars/bracing, triangulated jibs, slewing collars, operator cabs, counterweights, pendants and suspended pulley/hooks. Their supports stay on the reserved roof anchors; their tips and additional buildings carry red aviation beacons, including Tokyo Tower's tip.
- Traffic and pedestrian routes are sampled once and interpolated during animation. Crowd instance transforms update at most 30 times per second; vehicles and crowds share instanced geometry rather than adding a draw call per person or car. Pausing the city freezes both populations without losing their positions.
- Windows use warm, neutral, and cool light temperatures, with stronger color reserved for shop signs and architectural accents. Individual lights and blinds change on separate cycles, with fades of at least 1.4 seconds. Mipmapped occupancy and a dim subpixel limit prevent far windows from shimmering or turning entire towers into bright, flat slabs.
- Night lighting preserves material albedo instead of darkening it a second time. Cool sky fill, warmer ground bounce, directional light and distance haze keep unlit walls and roofs legible. Glazing uses a local HDR probe of the actual city. A shared 250ms deadline limits probe and pending sun-shadow updates during lighting input; the final requested state still renders when motion is paused. Shadow refresh precedes probe capture, including interleaved time/cloud changes. This is a spatially approximate reflection, not ray tracing.
- The main-view **Time of day** selector offers **Dawn / Day / Dusk / After dark**, without opening Settings. It stays synchronized with the matching Settings presets and the full 24-hour slider. A manually adjusted time appears as its exact clock value in the selector. Fresh loads start at **22:00 / After dark**, with **Clear** weather. Sun/moon position, building illumination, sky color, and clouds respond together. Pointer interaction no longer leaves the oversized native focus rectangle; keyboard navigation retains a compact focus cue on the control wrapper.
- **Cloud cover** and **Cloud speed** control procedural cloud formations independently of the weather. They are rendered in the sky shader, not a cloud photograph. **Window lights** and **Tower illumination** remain independently switchable; office lights, signs, street lights, and rooftop beacons vary gently with the motion clock.
- Rain uses **3,000 windblown, GPU-animated streaks at varying 3D depths**, from immediately outside the balcony to the distant streets. It changes road roughness, adds a dense overcast layer, suppresses direct sun/moon light and increases atmospheric extinction. The manual cloud level is retained and restored when weather returns to Clear. A height-integrated atmospheric model attenuates light with path length, adds sun-facing scatter and leaves high building tops above denser ground haze. Time/weather/cloud controls are simulated, not a real Tokyo forecast.
- A city-only **HDR light bloom** softens the strongest lights while preserving their geometry depth behind the room. Tokyo Tower retains distinct vermilion steel and warm-white painted bands, with restrained floodlight peaks, shaded structural faces and a softer halo through haze rather than a uniform yellow-white glow. Its size and the city's exposure/bloom settings are unchanged. Less pale scattering preserves depth without washing out luminous landmarks. Street-screen pixels use calibrated self-emission instead of also receiving the point light intended to illuminate the street, avoiding the double-lit hotspot while retaining ad colors and surrounding light spill. Highlight color preservation keeps bright neon from turning uniformly white. Wet asphalt uses scanned surface maps, patchy roughness, and camera-dependent reflected light calculated in the asphalt shader, so it cannot spill onto non-road geometry before bloom. These streaks approximate point-light reflections; they are not full-scene ray-traced mirror reflections.
- Asphalt color, normal, and roughness maps share world-space coordinates, including at overlapping intersections. Ground-layer depth bias, improved camera depth precision, and specular filtering reduce road flicker. Building-footprint shading and a bounded, depth-based contact-occlusion pass help separate close surfaces without darkening emissive highlights.
- The binder uses softer light, more matte paper/leather, and restrained sleeve/card highlights rather than a broad glossy glare. Exterior daylight contributes a restrained change in window fill and room environment strength; city-window and tower switches do not change the room's practical lamps or card readability.

The source geometry is surveyed, but the combined scene is **not an exact GIS replica or a photorealistic scan**. Foreground buildings are selected and fitted to the existing composition; foundations, park reservations and the tower sightline are adapted. Close facades and all night lighting are authored rather than observed. It retains controllable lighting, occlusion, traffic and true parallax.

The local survey package is about **20.8 MiB** before the manifest; unused foreground source atlases are retained for provenance but are not requested by the renderer. The build generates a lossless compressed runtime manifest: **1,755,985 bytes becomes 428,400 bytes**, with the original JSON retained for inspection. All runtime assets are served locally, with no live dependency on PLATEAU's servers. The source includes mixed LOD1/LOD2/LOD3 buildings, not uniformly LOD3 detail. Rebuild it reproducibly with `npm run assets:binder:city`; raw downloads are cached under the ignored `tools/.cache/binder-city/` directory. Asset generation checks download size, geometry integrity and clearance from the actual road ribbons. See [city attribution](./public/city/ATTRIBUTION.txt) for the CC BY 4.0 permission, source URLs and modifications.

The scene starts clear. The weather button cycles **Clear > Rain > Fog**. You can also choose weather under **Settings > Outside your window**, alongside time, clouds, and traffic.

**Browse cards while the room loads** and **Use Pocket view now** make collection controls available before the 3D world finishes. Individual failed city tiles retain their recorded building envelopes while other districts and the binder remain usable. A missing manifest retains the full authored city instead. A persistent warning identifies the degraded city; **Reload city** retries only after pending saves succeed, and is blocked while unsaved/conflicted work needs recovery. This is resilient loading, not near-to-far streaming: 3D initialization still awaits the tile workers.

**Pause city motion** freezes traffic, pedestrians, aircraft, beacons, street-ad crossfades, clouds, rain and coffee steam. City motion starts paused when `prefers-reduced-motion` is enabled; you can explicitly resume it. Weather selection still works when paused. Animation uses elapsed time, pauses while the document is hidden, and caps frame deltas so returning to a backgrounded tab does not fast-forward the city. Beacon pulses are slow and localized, not full-screen lightning or strobe effects. The user-activated YouTube player has its own play/pause control.

### Editing the reconstruction

- [city-layout.js](./src/city-layout.js): authored landmark proportions, world ground elevation, district density, and road control points.
- [city-materials.js](./src/city-materials.js): lit facade styles, meter-scaled surface maps, window parallax, and batched geometry.
- [building-massing.js](./src/building-massing.js): deterministic component envelopes, supported roof regions, shared box/shed geometry and the rooftop-service kit.
- [city-architecture.js](./src/city-architecture.js): close-range PBR facades, planar window fitting, frames and rooftop equipment.
- [city-survey.js](./src/city-survey.js): local quantized geometry loading, survey materials and close-detail integration.
- [city-survey-layout.js](./src/city-survey-layout.js): geospatial conversion, authored reservations and survey/layout reconciliation.
- [fetch-city-assets.mjs](./fetch-city-assets.mjs): bounded source import, texture-island packing, geometry compression and provenance.
- [city-streetscape.js](./src/city-streetscape.js): original shops/signs, sakura, pedestrians, utility lines, and wet-street light response.
- [city-light-pass.js](./src/city-light-pass.js): HDR color rendering, restrained bloom, and restoration of the original city depth for foreground occlusion.
- [city-landmarks.js](./src/city-landmarks.js): tower, observation decks, temple layout, and park foliage.
- [tokyo-tower.js](./src/tokyo-tower.js): reference-matched structural profile, independently scaled silhouette, truss work, decks and selective floodlighting.
- [city-reference-buildings.js](./src/city-reference-buildings.js): seven recognizable, individually shaped skyline anchors and their architectural trim.
- [city-air.js](./src/city-air.js): height-dependent atmospheric extinction and directional scattering, isolated from room materials.
- [skyline.js](./src/skyline.js): building/roof/street assembly, sky shader, city lights, and relighting controls.
- [city-motion.js](./src/city-motion.js): traffic, aircraft, rooftop beacons, clouds, and weather.
- [city-traffic.js](./src/city-traffic.js): autonomous car following, traffic signals, safe spawning, braking and yielding.
- [city-roads.js](./src/city-roads.js): the shared rendered road ribbons, spatial surface queries, and safe sidewalk paths.
- [city-life.js](./src/city-life.js): stable building lighting identities and independent window timing parameters.
- [city-infill.js](./src/city-infill.js): safe near-district plots, service courts, parking and existing-building footprint envelopes.
- [city-crowds.js](./src/city-crowds.js): weighted pedestrian distribution and cached, two-lane walking paths.
- [city-weather.js](./src/city-weather.js): layered rain geometry and coordinated cloud/haze weather state.
- [vehicle-profile.js](./src/vehicle-profile.js): deterministic vehicle shapes, dimensions and driver variation.
- [city-neon.js](./src/city-neon.js): right-side signage, supported animated screens, colored light spill and cranes.
- [room-extras.js](./src/room-extras.js), [room-tv.js](./src/room-tv.js): room additions, steam and spatially projected YouTube playback.
- [room-nooks.js](./src/room-nooks.js): proportioned reading furniture, the split apartment shell, open door and gaming-room enclosure.
- [room-render-cache.js](./src/room-render-cache.js): reusable room color/coverage/depth with live-city compositing and correct glazing depth.
- [render-quality.js](./src/render-quality.js): explicit, steady Balanced, Full detail and Smooth pixel budgets.
- [gaming-room.js](./src/gaming-room.js): computer/console fixtures, original display artwork, batched hardware and neon accents.
- [room-plants.js](./src/room-plants.js): shared local CC0 plant loading, alpha-aware materials and scale/placement.
- [fetch-plant-assets.mjs](./fetch-plant-assets.mjs): bounded, checksum-verified plant packaging with alpha-preserving leaf textures.
- [card-admiration.js](./src/card-admiration.js): full-resolution held-up card mesh, full yaw and bounded upright tilt.
- [card-finishes.js](./src/card-finishes.js): printing-aware finish previews, confidence labels and shared foil/roughness/relief maps.
- [day-cycle.js](./src/day-cycle.js): full-day sun direction, sunset strength, and clock formatting.

Scene distances are scaled modeling units, not GIS coordinates. Imported survey geometry uses a fixed `CITY_UNITS_PER_METRE`; changing `TOWER.height` no longer changes the city import or facade-window scale. Instanced geometry keeps repeated buildings and structural details efficient. The city and interior use separate light lists and the same camera. The HDR city pass restores the city depth before rendering the room, so buildings have real occlusion without city glow washing out the binder. Devices without HDR color-buffer support receive an explicit warning and use standard city rendering. Static city shadows do not redraw for every page turn. The city browser test verifies HDR near/far occlusion, solid-roof and exposed-road ray intersections, depth parallax, light toggles, and grounded vehicles.

## Persistence and backups

Layouts are saved under `afterhours.binder.v1` in this origin's `localStorage`; existing saved layouts remain compatible. The ordered hand is transient: reloading restores unplaced cards to their saved reservations. A move is saved only when placed. The arrangement is a virtual sample, not a claim that you own these cards.

Saves are asynchronous and serialized using the browser's **Web Locks API**, with an arrangement-revision check inside the writer lock. Another tab cannot silently overwrite a newer arrangement, and page navigation never replaces another tab's card placements. A conflicting external change pauses saving and leaves this tab's work intact for recovery. Choose **Load latest saved** to adopt the current stored arrangement (retaining this tab's page), or **Export this tab** to preserve its unsaved version first. Cancelled writes from before recovery cannot disable the recovered save generation. Browsers without Web Locks report unavailable safe saving rather than falling back to unsafe concurrent writes; use a current browser on localhost or HTTPS.

Use **Controls > Export layout** to back up or move your arrangement. Imports validate the schema, every card ID, exactly 360 pockets, all three stacks, and uniqueness before changing anything. An import is undoable. If saved data is corrupt or storage is blocked, the app reports it and does not overwrite the original automatically.

## Performance audit

The performance changes preserve all **8,558 buildings, 576 moving cars, 72 parked cars and 512 pedestrians**, full artwork and multisample antialiasing. Balanced/Smooth intentionally render fewer pixels as described above; Full detail retains the former high-resolution limit.

The initial CPU-focused audit did not solve the dominant GPU bottleneck. At 1440x900 on a Retina display, the original renderer repeatedly shaded the entire PBR room at 2376x1485 pixels while also rendering and post-processing the city. Pass isolation showed that removing the interior draw alone changed a roughly 58ms average frame interval to 22ms. The following fixes target that work:

- **Reuse room shading:** cache room color, coverage and surface depth when its camera, geometry, lighting and artwork are unchanged. The live city and coffee steam keep moving without re-shading every card, sleeve, table, plant and lamp. Page turns, camera motion, held-card changes, late textures and lighting correctly refresh it. Materials apply their own tone-mapping treatment exactly once before the cached display-linear composite, allowing printed artwork to retain its color. Glazing coverage/depth is preserved.
- **Avoid a redundant HDR/MSAA writeback:** bloom is blended in the final city composite instead of being drawn back into the multisampled city target and resolved again. The bloom pyramid, light colors and tower halo are preserved.
- **Separate city masks from room depth:** masked exterior pixels no longer impose a lower-resolution copy of a room surface's depth. The full-size cached room restores its own depth, preventing dark bands and incorrect occlusion when the two layers have different resolutions.
- **Bound Retina work without visible settling:** Balanced and Smooth use steady pixel budgets. The first optimization briefly switched density after motion, which visibly changed highlights and window sampling; that behavior has been removed. The previous CPU optimizations below remain in place.
- Car and crowd transforms write directly to their existing instance buffers. Only active buffer ranges are uploaded, rather than the unused maximum-capacity tail.
- Traffic collision buckets use reusable numeric-keyed cells instead of rebuilding string keys/arrays each frame. The final audit compared old/new state over two complete signal cycles at 192, 576 and 768 vehicles: positions, speeds, braking and collision-check counts matched exactly. Default-density simulation CPU time fell about 28% in that isolated comparison.
- Headlights use a bounded, stable nearest-16 selection rather than sorting all active cars. Static reflected-light positions are recalculated only after camera movement or source additions; unchanged reflection textures are not uploaded again. Animated advertisement colors still update immediately. The same nearest-32 selection is used for wet-street light sources.
- The binder's physical sheet layers retain their geometry and shadows but render as two instanced stacks instead of separate sheet meshes. Their full bounds are computed before page counts change; image comparisons and all 21-spread/page-turn tests cover the conversion.
- Static apartment/city transforms are prepared once; moving actors and lights still update normally.
- A paused, unchanged room submits **no repeated WebGL draws**. Binder-only interactions can reuse the cached city color/depth. Exterior-only controls do not invalidate room shading. Camera, daylight, interior lighting, resize and late card artwork invalidate the relevant room layer.
- Non-preview dialogs suspend city advancement and redundant rendering while covered. Settings stays live so atmosphere changes can be previewed.
- Time/cloud input updates inexpensive lighting immediately while environment captures and pending sun shadows share a 250ms refresh budget.
- Interior views use a depth-only pass of existing large room surfaces to reject hidden city fragments. Its small positive depth bias avoids competition with the final shaded room surface. The outdoor balcony skips this pass, where profiling found no useful occlusion.
- Cached room color/depth uses the renderer's exact drawing-buffer dimensions, including fractional device-pixel ratios. Full-detail city targets match that buffer; Balanced/Smooth use deliberately independent exterior dimensions. Retina/odd-viewport comparisons cover both paths.
- Detailed indoor plants reuse two model/material sets rather than duplicating downloads or textures. Dense dirt meshes are omitted, and the obsolete tabletop texture set is no longer loaded. Plant geometry is more detailed than the former procedural leaves; draw-call reductions alone are not a promise of a higher frame rate.
- Startup streetscape placement uses the shared footprint spatial index instead of repeatedly scanning the entire building list, with equivalent occupancy boundaries.
- Room textures and plant models load concurrently, with explicit cleanup if a required branch fails. GPU texture uploads yield after a small time budget rather than imposing one timer per texture. A gated-network browser regression verifies that plant requests start while a room texture is still pending and that collection browsing remains usable.
- City-manifest compression removes about **1.33 MB** from the initial transfer without removing metadata or buildings.

Run `npm run audit:binder:performance` against the preview (`BINDER_URL` overrides its URL) to compare moving/paused city and binder views, rain, the gaming-room view, and interleaved prepass-disabled/enabled samples. Set `BINDER_DPR=2` for Retina and `BINDER_GRAPHICS=detail` to test the unchanged high-resolution mode. The default is Balanced (`auto`). Image comparisons, cache-capture counters, and quality-switch tests check that improvements are not just rendering stale content.

In an actual-app Chromium/Metal test on Apple M2 Pro at **1440x900, DPR 2**, using the initially published version and stable Balanced mode with the same pointer movement:

| Measurement | Before | After |
| --- | ---: | ---: |
| Binder, average animation-frame interval while still | 55.6 ms | 16.7 ms |
| Binder, median animation-frame interval while still | 50.0 ms | 16.7 ms |
| Camera drag, average animation-frame interval | 56.5 ms | 27.2 ms |
| Camera drag, median animation-frame interval | 50.0 ms | 33.3 ms |
| Unchanged paused scene, draws per frame | 0 | 0 |

At the tested size, Balanced keeps the canvas at 1496x935 during both movement and rest instead of alternating between low and high resolutions. A prior isolated check of Full detail alone improved the stationary average interval to about 18.8ms through caching and pass fusion without lowering its original resolution. Camera movement still requires fresh room shading, so Balanced/Smooth are recommended for interaction on slower hardware.

These are measured local results, not a universal FPS guarantee. Input/layout cost, GPU, browser, battery/power mode and viewport still matter. Frame intervals are animation-frame measurements; GPU timer-query values are not treated as display FPS. The full city remains substantial, so Full detail can still be slow on large displays or integrated/mobile GPUs.

## Card data and assets

The checked-in metadata snapshot comes from the [Pokecottage 30th Celebration checklist](https://pokecottage.com/30th-celebration-master-set-guide#checklist), generated by that source on **September 26, 2026**:

- **199 cards / 251 checklist variants**, including promos and special variants.
- **223 source-verified images** and **28 locally reviewed images** are included with provenance and source-byte hashes.
- **251 full-size card illustrations and 251 thumbnails** are served locally. The repository owner confirmed authorization to publish the artwork; the underlying rights remain with their respective holders.
- Deployment tests verify that all output images match their source bytes. No unrevealed illustrations are fabricated or substituted.

The snapshot describes what that third-party guide publishes; it is not an independent authentication of the checklist. Metadata retains the original source URLs and source update time. Card image failures are explicitly labeled rather than substituted with unrelated artwork.

To rebuild the full site:

```sh
npm run build:binder
```

The source importer reads the site's JSON assignment as data; it never executes remote JavaScript. It preserves existing IDs/order by matching printing identity, rejects removed or ambiguous records and appends genuinely new printings. Local artwork reviews remain source-URL/hash pinned. Review catalog and publication permissions before replacing a deployed snapshot; existing saved layouts remain compatible.

## Visual references and rights

- Binder construction reference: [Vault X 9-Pocket Exo-Tec Anniversary](https://us.vaultx.com/collections/anniversary/products/9-pocket-exo-tec-zip-binder-anniversary), with white lining, side-loading pockets, gold stitching, and a gold zip.
- The modeling reference is **"Shiba-koen, aerial view on Tokyo Tower at dusk" by Kazuend**, an original [CC0](https://creativecommons.org/publicdomain/zero/1.0/) Unsplash release preserved on [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Shiba-koen,_aerial_view_on_Tokyo_Tower_at_dusk_(Unsplash).jpg). A local copy is retained for comparison only. The runtime does not fetch it, and the production build excludes it.
- Room and city materials use CC0 assets from [Poly Haven](https://polyhaven.com/): Oak Veneer 02, Leather White, Fabric Pattern 07, Concrete Wall 001, Brick Wall 001, and Asphalt 02, plus Potted Plant 01 and 02. The earlier Wood Table 001 maps are retained for provenance but are not loaded. Full credits and modifications are in [the room attribution file](./public/room/ATTRIBUTION.txt) and in the app's Controls menu.
- Room geometry, lanterns, curtains, framed artwork, turntable details, curved leaves, cushions, sleeve reverse, contact-shadow textures, and ambient audio are original procedural work. The app does not use commercial music.
- Manrope is self-hosted under its included SIL Open Font License. Icons are from Phosphor.
- Shop lettering, interior textures, signs, and blossom artwork are original. User-supplied commercial photos and illustrations inform the lighting/material direction but are not embedded; watermarks and copyrighted logo artwork are not copied.
- The fictional 7-Eleven uses original geometry, simple color stripes and a plain-text name, not a copied logo asset. 7-Eleven is a trademark of its owner; this prototype is unaffiliated.
- Card artwork belongs to its respective rights holders. This is an independent fan-made prototype, not affiliated with Pokemon, Nintendo, Creatures, GAME FREAK, Vault X, or Pokecottage. No redistribution license for card artwork is granted by this project; obtain the appropriate permissions before public or commercial distribution.

Rendering uses the repository's existing Three.js/esbuild stack. The app respects reduced-motion preferences, caps rendering pixel density, compiles shaders asynchronously, staggers high-resolution GPU uploads, and limits its unused card-texture cache. Bag grids use 320px thumbnails; the 3D cards and inspection use full-size artwork, with shared finish maps and a bounded unused-card cache.

To refresh the modeling reference and scanned materials, run `npm run assets:binder:room`, then rebuild. Use `npm run assets:binder:room -- --city-only` to fetch just the city PBR maps. All runtime assets are local. The city uses scanned surface materials and original textures, never a photographic skyline or projected city image.
