# Astra 30 TCG / Afterhours

An interactive nine-pocket TCG binder in a furnished Tokyo apartment, with a living city, configurable weather/time, an open gaming room, and a locally saved collection.

**Website:** https://justschen.github.io/astra-30-tcg/

## Full visual experience

The site includes **199 cards / 251 checklist variants**, with all 251 full-size card images and matching thumbnails. Cards can be held, inspected, admired and filed into the binder, with printing-aware simulated finishes.

The city data, room materials, plants, card art, font and icons retain their respective rights and credits. Card artwork is published at the repository owner's authorization; that does not grant downstream users a new artwork license.

## Run locally

Use Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4173/. Use `PORT=4175 npm run dev` if another preview is running.

```sh
npm test                    # Build the full site and run unit tests
npm run build               # Production output: dist/binder/
npm run test:binder:browser  # Requires the development preview and Playwright Chromium
```

All runtime assets are local, except the user-activated supported YouTube TV embed. No backend or API key is required.

## GitHub Pages deployment

[The Pages workflow](.github/workflows/pages.yml) installs locked dependencies, builds the full site, runs unit tests and deploys `dist/binder/`. It runs automatically when `main` changes and can also be started from **Actions > Deploy Afterhours to GitHub Pages > Run workflow**.

- Publishing source: **GitHub Actions** in repository Settings > Pages.
- Project URL: `https://justschen.github.io/astra-30-tcg/`.
- Asset paths are relative, so the `/astra-30-tcg/` project prefix is supported.
- Full artwork and thumbnails are served locally from `binder/public/cards/`. Deployment tests verify that every output image matches its source bytes.
- The workflow uploads only the production directory, never the repository or local caches.

## Move a local collection to the website

Browser storage is origin-specific. In the old local preview, use **Settings > Export layout**, then **Settings > Import layout** on the live website. An unplaced hand is transient, so place or return those cards before migrating.

See [the detailed app guide](binder/README.md), [city attribution](binder/public/city/ATTRIBUTION.txt), and [room/plant attribution](binder/public/room/ATTRIBUTION.txt).

This is an independent fan-made prototype, not affiliated with Pokemon, Nintendo, Creatures, GAME FREAK, Vault X or Pokecottage. Third-party asset licenses do not grant rights to the card illustrations. No general license for the original application code is granted by this repository.
