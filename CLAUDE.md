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
- `_landscapes/` (themes: mountains, coast, castles, ...) and `_collections/` (named trips) are output collections with their own pages.
- `_nfts/`: NFT pages. Metadata fields are **encrypted** strings (CryptoJS, see `assets/js/nftEncryption.js` and `_includes/decrypt_modal.html`). Never "fix" or re-encode them by hand.
- `_includes/` holds the galleries/modals; `_layouts/` the page layouts; `assets/js/` is vanilla JS (galleries, maps, grid layout, color sort); styles are `assets/css/main.scss` plus a few plain CSS files and `_sass/`.

## Pages
- `/` is the Explore page (`index.html`, `_layouts/explore.html`, `assets/js/explore.js`, `_sass/explore.scss`): a Mapbox GL JS globe with a flat-map toggle, a per-location photo panel and an autoplay journey. Its data (locations, countries, full-size photo paths) is inlined as JSON by the layout.
- `/portfolio/` is the curated grid (`portfolio.html`). `/countries` lists countries.
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
