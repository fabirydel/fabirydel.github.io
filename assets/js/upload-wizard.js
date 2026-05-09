/* ============================================================
   Upload Wizard
   Adds a new location (and optionally a new country) to the
   Jekyll site by writing files directly into the repo using
   the File System Access API.

   Workflow:
     1. Pick repo folder (persisted in IndexedDB)
     2. Drop / pick images
     3. Enter location title, country, latlng, mapGoogle
     4. If new country → enter title, latlng, bounds, zoom, flag
     5. Pick which uploaded image is the cover
     6. Preview the diff and confirm
     7. Resize images (1300/400/30 fit-inside-box) and write:
          images/full/<namePath>/<file>.jpg
          images/thumb/<namePath>/<file>.jpg
          images/blur/<namePath>/<file>.jpg
          _locations/<namePath>.html
          _countries/<country>.html         (only if new)
          images/flags/<country>.png        (only if missing)
          _data/locations_per_country.yml   (updated in place)

   Only runs on Chromium-based browsers via the File System
   Access API. Requires localhost (HTTPS not configured).
   ============================================================ */

(function () {
  'use strict';

  // ----------------------------------------------------------
  // Boot guard — make sure we're on the upload page and the
  // browser supports the APIs we need.
  // ----------------------------------------------------------
  const root = document.getElementById('upload-wizard');
  if (!root) return;

  const supportsFSA = 'showDirectoryPicker' in window;
  if (!supportsFSA) {
    document.getElementById('uw-incompatible').hidden = false;
    return;
  }

  // ----------------------------------------------------------
  // Resize bounds (longest side fits inside the box).
  // ----------------------------------------------------------
  const SIZES = [
    { name: 'full',  bound: 1300, quality: 0.92 },
    { name: 'thumb', bound:  400, quality: 0.88 },
    { name: 'blur',  bound:   30, quality: 0.7  },
  ];

  // ----------------------------------------------------------
  // Tiny IndexedDB-backed key/value store, used to remember
  // the picked directory handle between sessions.
  // ----------------------------------------------------------
  const idb = (function () {
    const DB_NAME = 'upload-wizard';
    const STORE = 'kv';
    let dbPromise;
    function open() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return dbPromise;
    }
    async function get(key) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    async function set(key, value) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    return { get, set };
  })();

  // ----------------------------------------------------------
  // Wizard state
  // ----------------------------------------------------------
  const state = {
    rootHandle: null,           // FileSystemDirectoryHandle for repo root
    yamlText: '',               // current locations_per_country.yml text
    countries: [],              // list of country slugs from the yaml
    images: [],                 // [{file, name, slug, previewUrl}]
    coverIndex: 0,              // which image is indexImagePath
    coverCountryIndex: 0,       // which image is the country cover (when new)
    location: { title: '', namePath: '', country: '', latlng: '', mapGoogle: '' },
    isNewCountry: false,
    newCountry: { title: '', latlng: '', bounds: '', zoom: 6, flagBlob: null, flagAlreadyExists: false },
    currentStep: 'folder',
  };

  const STEP_ORDER = ['folder', 'images', 'location', 'country', 'cover', 'confirm', 'done'];

  // ----------------------------------------------------------
  // Step navigation
  // ----------------------------------------------------------
  function showStep(step) {
    state.currentStep = step;
    root.querySelectorAll('.uw-step').forEach(el => {
      el.hidden = el.dataset.step !== step;
    });
    // Progress indicator
    const order = STEP_ORDER;
    const cur = order.indexOf(step);
    root.querySelectorAll('.uw-steps li').forEach(li => {
      const i = order.indexOf(li.dataset.step);
      li.classList.toggle('is-active', i === cur);
      li.classList.toggle('is-done', i < cur);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goNext() {
    const idx = STEP_ORDER.indexOf(state.currentStep);
    let next = STEP_ORDER[idx + 1];
    // Skip the country step if not a new country
    if (next === 'country' && !state.isNewCountry) next = 'cover';
    showStep(next);
    onEnterStep(next);
  }

  function goBack() {
    const idx = STEP_ORDER.indexOf(state.currentStep);
    let prev = STEP_ORDER[idx - 1];
    if (prev === 'country' && !state.isNewCountry) prev = 'location';
    showStep(prev);
    onEnterStep(prev);
  }

  function onEnterStep(step) {
    if (step === 'cover') renderCoverGrid();
    if (step === 'confirm') renderPreview();
    if (step === 'country') renderNewCountryStep();
  }

  // Wire up back/next/process buttons
  root.querySelectorAll('[data-action="back"]').forEach(b => b.addEventListener('click', goBack));
  root.querySelectorAll('[data-action="next"]').forEach(b => {
    b.addEventListener('click', () => {
      if (state.currentStep === 'images') {
        if (state.images.length === 0) return;
        goNext();
      } else if (state.currentStep === 'location') {
        if (!validateLocationStep()) return;
        goNext();
      } else if (state.currentStep === 'country') {
        if (!validateNewCountryStep()) return;
        goNext();
      } else if (state.currentStep === 'cover') {
        goNext();
      } else {
        goNext();
      }
    });
  });

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------
  function slugify(input) {
    return (input || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip accents
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function setStatus(elId, msg, kind) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg || '';
    el.classList.remove('is-ok', 'is-err', 'is-info');
    if (kind) el.classList.add('is-' + kind);
  }

  function fileBaseName(file) {
    const n = file.name;
    const i = n.lastIndexOf('.');
    return i > 0 ? n.slice(0, i) : n;
  }

  // If the user pasted a full <iframe ...> tag (which is what Google Maps
  // copies to the clipboard), pull the src attribute out and use only that.
  // If they pasted just the URL, return it as-is. Whitespace-trimmed either
  // way.
  function extractMapSrc(input) {
    const v = (input || '').trim();
    if (!v) return '';
    // Cheap case-insensitive check first to avoid the regex on plain URLs.
    if (!/<iframe\b/i.test(v)) return v;
    // Match either single- or double-quoted src="…" attribute.
    const m = v.match(/<iframe[^>]*\bsrc\s*=\s*(['"])([^'"]+)\1/i);
    return m ? m[2].trim() : v;
  }

  // ----------------------------------------------------------
  // Step 1 — Folder picker
  // ----------------------------------------------------------
  async function tryRestoreSavedFolder() {
    try {
      const saved = await idb.get('rootHandle');
      if (!saved) return;
      const opts = { mode: 'readwrite' };
      let perm = await saved.queryPermission(opts);
      if (perm === 'granted') {
        await useRootHandle(saved, /*silent=*/true);
      } else {
        // We don't auto-prompt; user must click the button to grant.
        setStatus('uw-folder-status',
          'Saved folder found — click "Choose folder" to grant access again.',
          'info');
      }
    } catch (err) {
      console.warn('No saved folder', err);
    }
  }

  document.querySelector('[data-action="pick-folder"]').addEventListener('click', async () => {
    try {
      // Try saved handle first — saves a click on subsequent uses.
      const saved = await idb.get('rootHandle');
      if (saved) {
        const perm = await saved.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          await useRootHandle(saved, /*silent=*/false);
          return;
        }
      }
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await useRootHandle(handle, /*silent=*/false);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setStatus('uw-folder-status', 'Could not access folder: ' + err.message, 'err');
    }
  });

  async function useRootHandle(handle, silent) {
    // Sanity-check: this should look like the Jekyll repo root.
    const required = ['_locations', '_countries', '_data', 'images'];
    const found = [];
    const missing = [];
    // entries() yields [name, FileSystemHandle] pairs; check handle.kind,
    // which is 'directory' or 'file'.
    for await (const [name, child] of handle.entries()) {
      if (child.kind === 'directory' && required.includes(name)) found.push(name);
    }
    for (const r of required) if (!found.includes(r)) missing.push(r);
    if (missing.length) {
      setStatus(
        'uw-folder-status',
        `That folder doesn't look like the site repo. Missing: ${missing.join(', ')}.`,
        'err'
      );
      return;
    }

    state.rootHandle = handle;
    await idb.set('rootHandle', handle);

    // Load the YAML so we know the existing countries
    try {
      const dataDir = await handle.getDirectoryHandle('_data');
      const yamlFile = await dataDir.getFileHandle('locations_per_country.yml');
      const f = await yamlFile.getFile();
      state.yamlText = await f.text();
      state.countries = parseCountriesFromYaml(state.yamlText);
    } catch (err) {
      setStatus('uw-folder-status',
        'Could not read _data/locations_per_country.yml: ' + err.message, 'err');
      return;
    }

    populateCountryList();
    setStatus('uw-folder-status',
      `✓ Connected — ${state.countries.length} countries detected. ${silent ? '(restored from previous session)' : ''}`,
      'ok');
    // Don't auto-advance the very first time — let user see confirmation;
    // but skip directly to images on subsequent (silent) restores.
    if (silent) showStep('images');
    else setTimeout(() => showStep('images'), 500);
  }

  function populateCountryList() {
    const dl = document.getElementById('uw-country-list');
    dl.innerHTML = '';
    state.countries.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      dl.appendChild(opt);
    });
  }

  // ----------------------------------------------------------
  // YAML parsing & writing (intentionally minimal — we only
  // care about country: { locations: [...] })
  // ----------------------------------------------------------
  function parseCountriesFromYaml(text) {
    const countries = [];
    const lines = text.split('\n');
    for (const line of lines) {
      const m = line.match(/^([a-z][a-z0-9_]*):\s*$/);
      if (m) countries.push(m[1]);
    }
    return countries.sort();
  }

  function getLocationsForCountry(text, country) {
    const lines = text.split('\n');
    const locations = [];
    let inCountry = false;
    let inLocations = false;
    for (const raw of lines) {
      const line = raw.replace(/\r$/, '');
      const head = line.match(/^([a-z][a-z0-9_]*):\s*$/);
      if (head) {
        if (inCountry) break; // moved to next country
        if (head[1] === country) inCountry = true;
        continue;
      }
      if (!inCountry) continue;
      if (/^\s*locations:\s*$/.test(line)) { inLocations = true; continue; }
      if (inLocations) {
        const item = line.match(/^\s+-\s+(.+?)\s*$/);
        if (item) locations.push(item[1]);
        else if (line.trim() === '') break;
      }
    }
    return locations;
  }

  function buildUpdatedYaml(text, country, newLocation, isNewCountry) {
    if (isNewCountry) {
      let out = text.replace(/\n+$/, '') + '\n\n';
      out += `${country}:\n  locations:\n    - ${newLocation}\n`;
      return out;
    }
    // Insert into existing country alphabetically, into the first matching block.
    const lines = text.split('\n');
    const out = [];
    let inCountry = false;
    let inLocations = false;
    let inserted = false;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.replace(/\r$/, '');
      const head = line.match(/^([a-z][a-z0-9_]*):\s*$/);

      if (head) {
        if (inCountry && inLocations && !inserted) {
          out.push(`    - ${newLocation}`);
          inserted = true;
        }
        inCountry = head[1] === country;
        inLocations = false;
        out.push(raw);
        continue;
      }
      if (inCountry && /^\s*locations:\s*$/.test(line)) {
        inLocations = true;
        out.push(raw);
        continue;
      }
      if (inCountry && inLocations && !inserted) {
        const item = line.match(/^\s+-\s+(.+?)\s*$/);
        if (item) {
          if (newLocation < item[1]) {
            out.push(`    - ${newLocation}`);
            inserted = true;
          }
          out.push(raw);
          continue;
        }
        // End of locations list — empty line or non-list line
        if (line.trim() === '' || !/^\s/.test(line)) {
          out.push(`    - ${newLocation}`);
          inserted = true;
          inCountry = false;
          inLocations = false;
          out.push(raw);
          continue;
        }
      }
      out.push(raw);
    }
    if (inCountry && inLocations && !inserted) {
      out.push(`    - ${newLocation}`);
      inserted = true;
    }
    return out.join('\n');
  }

  // ----------------------------------------------------------
  // Step 2 — Image picker
  // ----------------------------------------------------------
  const dropzone = document.getElementById('uw-dropzone');
  const fileInput = document.getElementById('uw-file-input');

  dropzone.addEventListener('click', (e) => {
    if (e.target === fileInput) return;
    fileInput.click();
  });

  ['dragenter', 'dragover'].forEach(ev =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragging');
    })
  );
  ['dragleave', 'drop'].forEach(ev =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragging');
    })
  );

  dropzone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files || [])
      .filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|heic|webp)$/i.test(f.name));
    addImageFiles(files);
  });

  fileInput.addEventListener('change', () => {
    addImageFiles(Array.from(fileInput.files || []));
    fileInput.value = '';
  });

  function addImageFiles(files) {
    let added = 0, dupName = 0, dupSlug = 0, badType = 0;
    for (const file of files) {
      // Reject anything that isn't an image we can decode.
      if (!(file.type.startsWith('image/') || /\.(jpe?g|png|heic|webp|gif|bmp|tiff?)$/i.test(file.name))) {
        badType++;
        continue;
      }
      // Skip duplicates by name + size
      if (state.images.some(img => img.file.name === file.name && img.file.size === file.size)) {
        dupName++;
        continue;
      }
      const baseName = fileBaseName(file);
      const slug = baseName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const outputName = slug + '.jpg';
      // Two different files could collide on outputName if one is e.g.
      // "IMG_1.jpg" and another "IMG_1.png" — warn instead of overwriting.
      if (state.images.some(img => img.outputName === outputName)) {
        dupSlug++;
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      state.images.push({
        file,
        name: file.name,
        outputName,
        previewUrl,
      });
      added++;
    }
    renderImageList();
    document.getElementById('uw-images-next').disabled = state.images.length === 0;

    // Surface what got skipped, if anything — so "I uploaded 9, why are
    // there 8?" doesn't fail silently.
    if (dupName || dupSlug || badType) {
      const parts = [];
      if (dupName) parts.push(`${dupName} duplicate file${dupName === 1 ? '' : 's'}`);
      if (dupSlug) parts.push(`${dupSlug} name collision${dupSlug === 1 ? '' : 's'} (e.g. IMG_1.jpg + IMG_1.png both want to be IMG_1.jpg)`);
      if (badType) parts.push(`${badType} non-image file${badType === 1 ? '' : 's'}`);
      alert(`Added ${added} image${added === 1 ? '' : 's'}. Skipped: ${parts.join(', ')}.`);
    }
  }

  function renderImageList() {
    const grid = document.getElementById('uw-image-list');
    grid.innerHTML = '';
    state.images.forEach((img, i) => {
      const tile = document.createElement('div');
      tile.className = 'uw-image-tile';
      tile.innerHTML = `
        <img src="${img.previewUrl}" alt="">
        <button type="button" class="uw-remove" aria-label="Remove">×</button>
        <span class="uw-image-name" title="${img.outputName}">${img.outputName}</span>
      `;
      tile.querySelector('.uw-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        URL.revokeObjectURL(img.previewUrl);
        state.images.splice(i, 1);
        renderImageList();
        document.getElementById('uw-images-next').disabled = state.images.length === 0;
      });
      grid.appendChild(tile);
    });
  }

  // ----------------------------------------------------------
  // Step 3 — Location form
  // ----------------------------------------------------------
  const titleInput = document.getElementById('uw-title');
  const namepathInput = document.getElementById('uw-namepath');
  const namepathHint = document.getElementById('uw-namepath-hint');
  const countryInput = document.getElementById('uw-country');
  const countryHint = document.getElementById('uw-country-hint');
  const latlngInput = document.getElementById('uw-latlng');
  const mapInput = document.getElementById('uw-mapgoogle');

  let userEditedNamepath = false;

  titleInput.addEventListener('input', () => {
    if (!userEditedNamepath) namepathInput.value = slugify(titleInput.value);
    refreshNamepathHint();
  });
  namepathInput.addEventListener('input', () => {
    userEditedNamepath = namepathInput.value.length > 0;
    namepathInput.value = slugify(namepathInput.value);
    refreshNamepathHint();
  });

  countryInput.addEventListener('input', () => {
    const v = slugify(countryInput.value);
    if (v && !state.countries.includes(v)) {
      countryHint.textContent = `↑ "${v}" is new — you'll fill in country details on the next step.`;
    } else if (v) {
      countryHint.textContent = `✓ Existing country.`;
    } else {
      countryHint.textContent = '';
    }
  });

  // If the user pastes a full <iframe …> tag, replace it with just the src
  // URL as soon as they tab/click out of the field, so they see what will
  // actually be saved.
  mapInput.addEventListener('blur', () => {
    const cleaned = extractMapSrc(mapInput.value);
    if (cleaned !== mapInput.value.trim()) {
      mapInput.value = cleaned;
    }
  });

  function refreshNamepathHint() {
    const np = slugify(namepathInput.value || '');
    if (!np) { namepathHint.textContent = ''; return; }
    namepathHint.textContent =
      `Will save as _locations/${np}.html and create images/{full,thumb,blur}/${np}/`;
  }

  function validateLocationStep() {
    const title = titleInput.value.trim();
    const namePath = slugify(namepathInput.value || '');
    const country = slugify(countryInput.value || '');
    if (!title) { alert('Title is required.'); return false; }
    if (!namePath) { alert('namePath is required.'); return false; }
    if (!country) { alert('Country is required.'); return false; }

    state.location.title = title;
    state.location.namePath = namePath;
    state.location.country = country;
    state.location.latlng = latlngInput.value.trim();
    state.location.mapGoogle = extractMapSrc(mapInput.value);
    state.isNewCountry = !state.countries.includes(country);
    return true;
  }

  // ----------------------------------------------------------
  // Step 4 — New country
  // ----------------------------------------------------------
  const cTitle  = document.getElementById('uw-c-title');
  const cLatlng = document.getElementById('uw-c-latlng');
  const cBounds = document.getElementById('uw-c-bounds');
  const cZoom   = document.getElementById('uw-c-zoom');
  const flagInput = document.getElementById('uw-flag-input');
  const flagUploadLabel = document.querySelector('.uw-flag-upload');
  const flagPreview = document.getElementById('uw-flag-preview');
  const flagStatus = document.getElementById('uw-flag-status');

  flagInput.addEventListener('change', async () => {
    const f = flagInput.files[0];
    if (!f) return;
    state.newCountry.flagBlob = f;
    flagPreview.innerHTML = `<img src="${URL.createObjectURL(f)}"><span>Selected: ${f.name}</span>`;
  });

  async function renderNewCountryStep() {
    const slug = state.location.country;
    document.getElementById('uw-newcountry-name').textContent = slug;
    document.getElementById('uw-newcountry-slug').textContent = slug;
    root.querySelectorAll('.uw-flag-slug').forEach(s => s.textContent = slug);
    if (!cTitle.value) cTitle.value = slug.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());

    // Check whether the flag PNG already exists in /images/flags/
    state.newCountry.flagAlreadyExists = false;
    state.newCountry.flagBlob = null;
    flagPreview.innerHTML = '';
    try {
      const flagsDir = await state.rootHandle.getDirectoryHandle('images')
        .then(h => h.getDirectoryHandle('flags'));
      try {
        await flagsDir.getFileHandle(slug + '.png');
        state.newCountry.flagAlreadyExists = true;
        flagStatus.textContent = `✓ /images/flags/${slug}.png already exists`;
        flagUploadLabel.hidden = true;
      } catch {
        flagStatus.textContent = `not found — please upload one`;
        flagUploadLabel.hidden = false;
      }
    } catch (err) {
      flagStatus.textContent = `couldn't check (${err.message})`;
      flagUploadLabel.hidden = false;
    }
  }

  function validateNewCountryStep() {
    const t = cTitle.value.trim();
    const ll = cLatlng.value.trim();
    const bb = cBounds.value.trim();
    const z = parseInt(cZoom.value, 10);
    if (!t) { alert('Country title required.'); return false; }
    if (!ll) { alert('latlng required.'); return false; }
    if (!bb) { alert('bounds required.'); return false; }
    if (!z || isNaN(z)) { alert('zoom required.'); return false; }
    if (!state.newCountry.flagAlreadyExists && !state.newCountry.flagBlob) {
      const ok = confirm(`No flag PNG found at /images/flags/${state.location.country}.png and no flag uploaded. Continue without one? (the flag image will simply be missing on the site)`);
      if (!ok) return false;
    }
    state.newCountry.title = t;
    state.newCountry.latlng = ll;
    state.newCountry.bounds = bb;
    state.newCountry.zoom = z;
    return true;
  }

  // ----------------------------------------------------------
  // Step 5 — Pick cover image(s)
  // ----------------------------------------------------------
  function renderCoverGrid() {
    const grid = document.getElementById('uw-cover-grid');
    grid.innerHTML = '';
    state.coverIndex = Math.min(state.coverIndex, state.images.length - 1);
    if (state.coverIndex < 0) state.coverIndex = 0;

    const showCountryCover = state.isNewCountry;
    const hint = document.getElementById('uw-cover-country-hint');
    if (showCountryCover) {
      hint.textContent = ' Right-click (or long-press) a photo to also use it as the new country\'s cover image — defaults to the same one.';
      state.coverCountryIndex = state.coverIndex;
    } else {
      hint.textContent = '';
    }

    state.images.forEach((img, i) => {
      const tile = document.createElement('div');
      tile.className = 'uw-image-tile';
      if (i === state.coverIndex) tile.classList.add('is-selected');
      if (showCountryCover && i === state.coverCountryIndex) tile.classList.add('is-cover-country');
      tile.innerHTML = `
        <img src="${img.previewUrl}" alt="">
        <span class="uw-image-name">${img.outputName}</span>
      `;
      tile.addEventListener('click', () => {
        state.coverIndex = i;
        renderCoverGrid();
      });
      tile.addEventListener('contextmenu', (e) => {
        if (!showCountryCover) return;
        e.preventDefault();
        state.coverCountryIndex = i;
        renderCoverGrid();
      });
      grid.appendChild(tile);
    });

    document.getElementById('uw-cover-next').disabled = state.images.length === 0;
  }

  // ----------------------------------------------------------
  // Step 6 — Preview
  // ----------------------------------------------------------
  function renderPreview() {
    const np = state.location.namePath;
    const country = state.location.country;
    const cover = state.images[state.coverIndex];
    const coverPath = `${np}/${cover.outputName}`;

    const filesToCreate = [];
    state.images.forEach(img => {
      SIZES.forEach(s => {
        filesToCreate.push(`images/${s.name}/${np}/${img.outputName}`);
      });
    });
    filesToCreate.push(`_locations/${np}.html`);
    if (state.isNewCountry) {
      filesToCreate.push(`_countries/${country}.html`);
      if (state.newCountry.flagBlob) {
        filesToCreate.push(`images/flags/${country}.png`);
      }
    }

    const locationFm = buildLocationFrontmatter(state.location, coverPath);
    let countryFm = '';
    if (state.isNewCountry) {
      const countryCover = state.images[state.coverCountryIndex] || cover;
      countryFm = buildCountryFrontmatter(state.newCountry, country, `${np}/${countryCover.outputName}`);
    }

    let yamlPreview;
    if (state.isNewCountry) {
      yamlPreview = `${country}:\n  locations:\n    - ${np}`;
    } else {
      const existing = getLocationsForCountry(state.yamlText, country);
      const inserted = [...existing, np].sort();
      yamlPreview = `${country}:\n  locations:\n` + inserted.map(l => `    - ${l}${l === np ? '   ← new' : ''}`).join('\n');
    }

    const el = document.getElementById('uw-preview');
    el.innerHTML = `
      <h3>Files to create (${filesToCreate.length})</h3>
      <ul>${filesToCreate.map(f => `<li><code>${f}</code></li>`).join('')}</ul>

      <h3>_locations/${np}.html</h3>
      <pre>${escapeHtml(locationFm)}</pre>

      ${state.isNewCountry ? `<h3>_countries/${country}.html</h3><pre>${escapeHtml(countryFm)}</pre>` : ''}

      <h3>_data/locations_per_country.yml ${state.isNewCountry ? '(new block appended)' : '(updated block)'}</h3>
      <pre>${escapeHtml(yamlPreview)}</pre>

      <h3>Images</h3>
      <ul>
        <li>${state.images.length} photo${state.images.length === 1 ? '' : 's'} × 3 sizes = ${state.images.length * 3} JPEGs</li>
        <li>full = max 1300px (longest side)</li>
        <li>thumb = max 400px</li>
        <li>blur = max 30px</li>
      </ul>
    `;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
  }

  function buildLocationFrontmatter(loc, indexImagePath) {
    return [
      '---',
      'layout: location',
      `title: ${loc.title}`,
      `namePath: ${loc.namePath}`,
      `indexImagePath: ${indexImagePath}`,
      `country: ${loc.country}`,
      `latlng: "${loc.latlng}"`,
      `mapGoogle: ${loc.mapGoogle}`,
      '---',
      ''
    ].join('\n');
  }

  function buildCountryFrontmatter(c, slug, cover) {
    return [
      '---',
      'layout: country',
      `title: ${c.title}`,
      `flag: ${slug}`,
      `name: ${slug}`,
      `latlng: "${c.latlng}"`,
      `bounds: "${c.bounds}"`,
      `zoom: ${c.zoom}`,
      `cover: ${cover}`,
      '---',
      ''
    ].join('\n');
  }

  // ----------------------------------------------------------
  // Step 7 — Process & write everything
  // ----------------------------------------------------------
  document.getElementById('uw-process-btn').addEventListener('click', async () => {
    const overlay = document.getElementById('uw-processing');
    const bar = document.getElementById('uw-processing-bar-fill');
    const statusEl = document.getElementById('uw-processing-status');
    const logEl = document.getElementById('uw-processing-log');
    overlay.hidden = false;
    logEl.textContent = '';

    function setProgress(pct, msg) {
      bar.style.width = pct + '%';
      statusEl.textContent = msg;
    }
    function log(msg) {
      logEl.textContent += msg + '\n';
      logEl.scrollTop = logEl.scrollHeight;
    }

    try {
      const np = state.location.namePath;
      const country = state.location.country;
      const cover = state.images[state.coverIndex];

      // Bail if location already exists — we don't want to clobber.
      const locDir = await state.rootHandle.getDirectoryHandle('_locations');
      try {
        await locDir.getFileHandle(np + '.html');
        if (!confirm(`_locations/${np}.html already exists. Overwrite?`)) {
          overlay.hidden = true;
          return;
        }
      } catch {}

      // 1. Resize and write images
      const totalSteps = state.images.length * SIZES.length + 3 + (state.isNewCountry ? 2 : 0);
      let stepN = 0;

      const imagesDir = await state.rootHandle.getDirectoryHandle('images');
      const sizeDirs = {};
      for (const s of SIZES) {
        sizeDirs[s.name] = await imagesDir.getDirectoryHandle(s.name, { create: true })
          .then(h => h.getDirectoryHandle(np, { create: true }));
      }

      for (let i = 0; i < state.images.length; i++) {
        const img = state.images[i];
        const bitmap = await loadBitmap(img.file);
        for (const s of SIZES) {
          stepN++;
          setProgress((stepN / totalSteps) * 100, `Resizing ${img.name} → ${s.name}…`);
          const blob = await resizeToBlob(bitmap, s.bound, s.quality);
          const fh = await sizeDirs[s.name].getFileHandle(img.outputName, { create: true });
          const w = await fh.createWritable();
          await w.write(blob);
          await w.close();
          log(`✓ images/${s.name}/${np}/${img.outputName}  (${(blob.size/1024).toFixed(1)} KB)`);
        }
        if (bitmap.close) bitmap.close();
        // Small breather between images — Jekyll's file watcher absorbs
        // bursts much better with even a tiny gap.
        await new Promise(r => setTimeout(r, 50));
      }

      // 2. Write the location HTML
      stepN++;
      setProgress((stepN / totalSteps) * 100, `Writing _locations/${np}.html…`);
      const locContent = buildLocationFrontmatter(state.location, `${np}/${cover.outputName}`);
      const locFh = await locDir.getFileHandle(np + '.html', { create: true });
      const locW = await locFh.createWritable();
      await locW.write(locContent);
      await locW.close();
      log(`✓ _locations/${np}.html`);

      // 3. If new country, write the country file (and flag PNG if uploaded)
      if (state.isNewCountry) {
        stepN++;
        setProgress((stepN / totalSteps) * 100, `Writing _countries/${country}.html…`);
        const countriesDir = await state.rootHandle.getDirectoryHandle('_countries');
        const countryCover = state.images[state.coverCountryIndex] || cover;
        const countryContent = buildCountryFrontmatter(
          state.newCountry, country, `${np}/${countryCover.outputName}`
        );
        const cFh = await countriesDir.getFileHandle(country + '.html', { create: true });
        const cW = await cFh.createWritable();
        await cW.write(countryContent);
        await cW.close();
        log(`✓ _countries/${country}.html`);

        if (state.newCountry.flagBlob) {
          stepN++;
          setProgress((stepN / totalSteps) * 100, `Writing flag…`);
          const flagsDir = await imagesDir.getDirectoryHandle('flags', { create: true });
          // Convert to PNG via canvas to ensure the file is valid PNG even
          // when the user uploaded a JPEG.
          const flagBitmap = await loadBitmap(state.newCountry.flagBlob);
          const flagBlob = await bitmapToPng(flagBitmap, 512);
          if (flagBitmap.close) flagBitmap.close();
          const flagFh = await flagsDir.getFileHandle(country + '.png', { create: true });
          const flagW = await flagFh.createWritable();
          await flagW.write(flagBlob);
          await flagW.close();
          log(`✓ images/flags/${country}.png`);
        }
      }

      // 4. Update YAML
      stepN++;
      setProgress((stepN / totalSteps) * 100, `Updating locations_per_country.yml…`);
      const dataDir = await state.rootHandle.getDirectoryHandle('_data');
      const yamlFh = await dataDir.getFileHandle('locations_per_country.yml');
      // Re-read in case the file changed since we cached it
      const f = await yamlFh.getFile();
      const currentText = await f.text();
      const updated = buildUpdatedYaml(currentText, country, np, state.isNewCountry);
      const yamlW = await yamlFh.createWritable();
      await yamlW.write(updated);
      await yamlW.close();
      state.yamlText = updated;
      state.countries = parseCountriesFromYaml(updated);
      log(`✓ _data/locations_per_country.yml`);

      // 5. Settle delay — give Jekyll's watcher a moment to absorb all the
      //    rapid-fire writes above before we trigger the final rebuild.
      //    Without this, the watcher's mid-upload rebuilds can capture a
      //    partial site.static_files snapshot and the location's gallery
      //    ends up missing some images.
      setProgress(96, `Waiting for Jekyll to settle…`);
      await new Promise(r => setTimeout(r, 1500));

      // 6. Re-touch every location file in this country. This forces Jekyll
      //    to re-render:
      //      - the new location's gallery against the *complete* static_files
      //        list (so all uploaded images appear)
      //      - the existing locations' next/prev navigation (which reads the
      //        YAML and would otherwise stay stale until those files
      //        themselves are edited)
      setProgress(98, `Refreshing all ${country} location pages…`);
      const allInCountry = getLocationsForCountry(updated, country);
      for (const loc of allInCountry) {
        await touchFile(state.rootHandle, ['_locations', loc + '.html']);
        log(`✓ refreshed _locations/${loc}.html`);
      }

      // 7. Bump mtimes on aggregating pages so Jekyll regenerates the
      //    country map and other cross-collection pages.
      setProgress(99, `Nudging Jekyll to rebuild dependent pages…`);
      await touchAggregatingPages(state.rootHandle, country);
      log(`✓ touched country/worldmap/locations/index for rebuild`);

      setProgress(100, 'Done!');
      await new Promise(r => setTimeout(r, 350));
      overlay.hidden = true;

      renderDoneSummary();
      showStep('done');
    } catch (err) {
      console.error(err);
      log('✗ ' + err.message);
      statusEl.textContent = 'Error — see log below.';
      // Don't auto-close so the user can read the error.
      const closeBtn = document.createElement('button');
      closeBtn.className = 'uw-btn';
      closeBtn.textContent = 'Close';
      closeBtn.style.marginTop = '0.75rem';
      closeBtn.addEventListener('click', () => overlay.hidden = true, { once: true });
      logEl.parentNode.appendChild(closeBtn);
    }
  });

  // ----------------------------------------------------------
  // Image processing helpers
  // ----------------------------------------------------------
  async function loadBitmap(file) {
    if ('createImageBitmap' in window) {
      try {
        return await createImageBitmap(file);
      } catch (e) {
        // fall through (HEIC etc. may fail)
      }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode ' + file.name)); };
      img.src = url;
    });
  }

  function fitInsideBox(srcW, srcH, bound) {
    const longest = Math.max(srcW, srcH);
    if (longest <= bound) return { w: srcW, h: srcH };
    const scale = bound / longest;
    return { w: Math.max(1, Math.round(srcW * scale)), h: Math.max(1, Math.round(srcH * scale)) };
  }

  async function resizeToBlob(bitmap, bound, quality) {
    const w0 = bitmap.width || bitmap.naturalWidth;
    const h0 = bitmap.height || bitmap.naturalHeight;
    const { w, h } = fitInsideBox(w0, h0, bound);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', quality);
    });
  }

  // Re-write a file with its existing content to bump the mtime. Jekyll's
  // file-watcher uses mtime to detect changes, so this is enough to force a
  // re-render of pages that aggregate site.locations.
  async function touchFile(rootHandle, segments) {
    try {
      let dir = rootHandle;
      for (let i = 0; i < segments.length - 1; i++) {
        dir = await dir.getDirectoryHandle(segments[i]);
      }
      const fh = await dir.getFileHandle(segments[segments.length - 1]);
      const f = await fh.getFile();
      const text = await f.text();
      const w = await fh.createWritable();
      await w.write(text);
      await w.close();
    } catch (err) {
      // It's fine if a file doesn't exist — just skip it.
      console.debug('skip touch', segments.join('/'), err.message);
    }
  }

  async function touchAggregatingPages(rootHandle, country) {
    // Country page → drives the country-page map pins.
    await touchFile(rootHandle, ['_countries', country + '.html']);
    // Top-level pages that read site.locations.
    await touchFile(rootHandle, ['worldmap.html']);
    await touchFile(rootHandle, ['locations.html']);
    // Portfolio (index.html via portfolio layout) reads `site.locations | size`.
    await touchFile(rootHandle, ['index.html']);
  }

  async function bitmapToPng(bitmap, maxBound) {
    const w0 = bitmap.width || bitmap.naturalWidth;
    const h0 = bitmap.height || bitmap.naturalHeight;
    const { w, h } = fitInsideBox(w0, h0, maxBound);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
    });
  }

  // ----------------------------------------------------------
  // Done step
  // ----------------------------------------------------------
  function renderDoneSummary() {
    const np = state.location.namePath;
    const country = state.location.country;
    const el = document.getElementById('uw-done-summary');
    el.innerHTML = `
      <p>✓ Created <code>${state.images.length}</code> photos in 3 sizes for <strong>${state.location.title}</strong>.</p>
      <p>${state.isNewCountry
        ? `✓ Added new country <strong>${state.newCountry.title}</strong> (<code>${country}</code>).`
        : `✓ Added to existing country <strong>${country}</strong>.`}</p>
      <p>Refresh your local Jekyll preview to see the new pages:</p>
      <ul>
        <li><code>/locations/${np}</code></li>
        <li><code>/countries/${country}</code></li>
      </ul>
      <p class="uw-hint">When you're happy, commit and push:
        <br><code>git add -A && git commit -m "Add ${state.location.title}" && git push</code></p>
    `;
  }

  document.querySelector('[data-action="restart"]').addEventListener('click', () => {
    // Free image previews
    state.images.forEach(img => URL.revokeObjectURL(img.previewUrl));
    state.images = [];
    state.coverIndex = 0;
    state.coverCountryIndex = 0;
    state.location = { title: '', namePath: '', country: '', latlng: '', mapGoogle: '' };
    state.newCountry = { title: '', latlng: '', bounds: '', zoom: 6, flagBlob: null, flagAlreadyExists: false };
    state.isNewCountry = false;
    userEditedNamepath = false;

    // Reset form
    [titleInput, namepathInput, countryInput, latlngInput, mapInput,
     cTitle, cLatlng, cBounds, cZoom].forEach(el => el.value = '');
    document.getElementById('uw-image-list').innerHTML = '';
    document.getElementById('uw-images-next').disabled = true;
    document.getElementById('uw-flag-preview').innerHTML = '';

    showStep('images'); // skip folder picker — already connected
  });

  // ----------------------------------------------------------
  // Boot
  // ----------------------------------------------------------
  showStep('folder');
  tryRestoreSavedFolder();
})();
