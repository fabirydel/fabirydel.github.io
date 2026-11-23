# fabirydel.com: photography site

Jekyll static site (Fabian Rydel, landscape & travel photography), hosted on GitHub Pages at fabirydel.com (`CNAME`).
Jekyll 3.8 + minima theme, plugins: jekyll-feed, jekyll-seo-tag, jekyll-sitemap. Ruby version in `.ruby-version`.

## Run
```bash
bundle exec jekyll serve        # http://localhost:4000
```
`_config.yml` is not hot-reloaded: restart the server after editing it. `Guardfile` exists for guard-jekyll-plus but plain `jekyll serve` is enough.

## Content model (this is the part to understand before editing)
- `_locations/<name>.html`: one file per place (~233). Front matter only: `title`, `namePath`, `headerImagePath`, `indexImagePath`, `position`, `country`, `latlng`, `mapGoogle`. `output: false`, so these are data, not pages.
- `_countries/<country>.html`: one page per country (`layout: country`; `flag`, `latlng`, `bounds`, `zoom`, `cover`).
- `_data/locations_per_country.yml`: country -> list of location names. **Must be updated whenever a location is added.**
- `_data/portfolio.yml`: curated portfolio grid entries (path, title, place, location, country, `large`), grouped by colour sections.
- `_data/flag_colors.yml`: colours per flag.
- `_landscapes/` (themes: mountains, coast, castles, ...) is an output collection with its own pages.
- `_collections/<name>.html`: one page per collection, a hand-picked set of photos (`layout: collection`; `title`, `description`, `cover`, `images:` as paths relative to `images/full/`). (`locations:` is still understood and expands to every photo of those places, see `_includes/collection_paths.html`, but no file uses it any more.) In Liquid, `site.collections` is the list of these documents.
- `_trips/<name>.html`: one page per trip, an ordered list of locations (`layout: trip`; `title`, optional `description`, `stops:` as `- location: <namePath>` + `date: "YYYY-MM-DD"`). The dates set the order; a stop without a date sorts last. A stop may add `images:` (paths relative to `images/full/`) to show only those photos of the place in the trip (for places visited on several trips; absent = every photo), picked in the editor with the stop's "Photos" button. A stop may also add `travel: straight` to draw the leg from the previous stop as a straight arc (flight, ferry); otherwise each leg follows the roads (Mapbox Directions `driving`, fetched in the browser and cached in localStorage; legs over 1800 km, unroutable ones or absurd detours fall back to the arc). In Liquid, `site.trips` is the list of these documents.
- `_nfts/`: NFT pages. Metadata fields are **encrypted** strings (CryptoJS, see `assets/js/nftEncryption.js` and `_includes/decrypt_modal.html`). Never "fix" or re-encode them by hand.
- `_includes/` holds the galleries/modals; `_layouts/` the page layouts; `assets/js/` is vanilla JS (galleries, maps, grid layout, color sort); styles are `assets/css/main.scss` plus a few plain CSS files and `_sass/`.

## Pages
- `/` is the Explore page (`index.html`, `_layouts/explore.html`, `assets/js/explore.js`, `_sass/explore.scss`): a Mapbox GL JS globe with a flat-map toggle, a per-location photo panel and a "Begin the journey" button that starts at the first location (the prev/next arrows move on; there is no autoplay) and a "Randomize" button that shuffles the order (`setRoute` in explore.js) and lands on its first location. Its data (locations, countries, full-size photo paths) is inlined as JSON by the layout.
- Shared by Explore and Trips: the location panel (photo collage + full-screen viewer), the prev/next transport bar and the `ui-btn` / `ui-icon-btn` buttons. Markup in `_includes/place_panel.html`, `place_transport.html`, `place_viewer.html`; styles in `_sass/place-ui.scss`; behaviour in `assets/js/place-panel.js` (`PlacePanel({...})`, load it before the page script). Change them there, not per page; open the panel with `.is-open`, hide the transport with `.is-hidden`.
- `/portfolio/` is the curated grid (`portfolio.html`). `/countries` lists countries.
- `/collections/` is the collections index (`collections.html`): stacks of prints that fan out on hover. `/collections/<name>` (`_layouts/collection.html`) deals the photos across a "table" (draggable prints, Table/Grid toggle, Shuffle). Both use `assets/js/collections.js` and `_sass/collections.scss`.
- `/collections/edit/` (`collections-edit.html`, `assets/js/collection-editor.js`) is the local-only editor that creates and edits `_collections` files; it renders nothing in production.
- Dev-only tools on photo tiles (localhost, non-production builds): the portfolio checkbox (`assets/js/portfolio-toggle.js`) and the collection picker (`assets/js/collection-toggle.js`). The cover picker (`assets/js/cover-toggle.js`, `assets/css/cover-toggle.css`) puts a star on each photo tile of the country pages; clicking it rewrites `indexImagePath` in `_locations/<place>.html`. They and the collection editor write source files through `window.devFiles` (`assets/js/dev-files.js`), which posts to `/__dev/files`, an endpoint added to `jekyll serve` by the local gem in `_dev/jekyll-dev-files` (loaded via the Gemfile because github-pages forces safe mode, so `_plugins/` is ignored). It only touches `_collections/*.html`, `_trips/*.html`, `_locations/*.html` (read/write only, no delete) and `_data/portfolio.yml`. Without the gem the tools fall back to the browser's folder access, which is remembered per port.
- `/trips/` is the trips index (`trips.html`, `_layouts/trips.html`): a card per trip with its (straight-line) route over a Mapbox static satellite image (the SVG route is drawn with the same Web Mercator maths as the static API, see `cardView` in `assets/js/trips.js`). `/trips/<name>` (no trailing slash, like collections: GitHub Pages serves these as `<name>.html`, so a link ending in `/` is a 404 in production; `_layouts/trip.html`) is a flat Mapbox GL map (a button above the zoom buttons switches the view: Satellite, Streets, Terrain, Dark; remembered in localStorage) with the route drawn stop to stop (done legs are one static source shown through a layer filter and only the leg in progress is re-sent each frame, so long trips stay smooth; Directions geometry is simplified before it is cached), photo pins, an itinerary panel and a Play tour. `/trips/edit/` (`trips-edit.html`, `assets/js/trip-editor.js`, `assets/css/trip-editor.css`) is the local-only editor that creates, edits and deletes `_trips` files (pick places, set a date on each). Styles: `_sass/trips.scss`.
- `explore.html` and `worldmap.html` are redirect stubs for old URLs (the old Locations map page is gone).

## Images
- `images/full/<location>/<file>.jpg` (max 1300px), `images/thumb/` (max 400px), `images/blur/` (max 30px blur placeholders). Same relative path in all three.
- All three sizes must exist for a photo to display correctly.
- `images/` is ~3.5 GB. **Never read, list recursively or open images** unless the task is specifically about one file.

## Adding a new location
Preferred: the upload wizard at `http://localhost:4000/upload` (`upload.html`, `assets/js/upload-wizard.js`). Use Chrome/Edge/Brave on localhost (File System Access API). It resizes images into full/thumb/blur, writes the `_locations` and `_countries` files and updates `locations_per_country.yml`. It can also be done by hand following the same steps. A new photo in the portfolio grid also needs an entry in `_data/portfolio.yml`.

## Gotchas
- `_site/` is generated build output (~3.5 GB). Never read or edit it; ignore it in searches.
- `vendor/`, `.bundle/`, `.sass-cache/`, `.jekyll-metadata` are tooling artefacts.
- `app-ads.txt` at the root is for AdMob (belongs to the Collect The Orbs game). Do not remove it.
- Google Analytics is intentionally unset (see comment in `_config.yml`).
- `redesign-preview.html` is a standalone preview page, not part of the live navigation.
- Commit history style: short lowercase messages ("grid fixes, new locations").

## Working efficiently (keeps token use down)
- Search with Grep/Glob and read only the relevant file or range; the `_locations` and `_countries` files are tiny but there are hundreds, so don't read them all.
- Exclude `_site`, `images`, `vendor` from every search.
- For a visual change, run the server and check the page in the browser instead of reading CSS/JS end to end.
- Start a fresh session per task (new location batch, layout fix, etc.).
