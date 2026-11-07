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
    newCountry: { title: '', latlng: '', bounds: '', zoom: 6, colors: [], flagBlob: null, flagAlreadyExists: false },
    currentStep: 'folder',
    mode: 'new',                 // 'new' | 'existing'
    existingLocations: [],       // [{namePath, title, country, latlng, mapGoogle}] from _locations/*.html
    existingLocation: null,      // the entry picked from existingLocations
    existingLocationCollisions: [], // outputNames that already exist in the target location's folder
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
    // Adding to an existing location reuses its existing cover — nothing to pick.
    if (next === 'cover' && state.mode === 'existing') next = 'confirm';
    showStep(next);
    onEnterStep(next);
  }

  function goBack() {
    const idx = STEP_ORDER.indexOf(state.currentStep);
    let prev = STEP_ORDER[idx - 1];
    if (prev === 'cover' && state.mode === 'existing') prev = 'location';
    else if (prev === 'country' && !state.isNewCountry) prev = 'location';
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

  // ---- Input normalisation / validation ---------------------
  // The site's JS runs JSON.parse() on latlng/bounds, so a value that isn't
  // valid JSON breaks the page's maps (and one bad location breaks the whole
  // worldmap). Accept the formats people actually paste (Google Maps gives
  // "lat,lng"; others add brackets or parentheses) and always save
  // "[lat, lng]".
  function extractNumbers(input) {
    return ((input || '').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  }

  // Returns "[lat, lng]" or null if `input` isn't a valid coordinate pair.
  function normalizeLatLng(input) {
    const nums = extractNumbers(input);
    if (nums.length !== 2) return null;
    const [lat, lng] = nums;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return `[${lat}, ${lng}]`;
  }

  // Returns "[[lat, lng], [lat, lng]]" or null.
  function normalizeBounds(input) {
    const n = extractNumbers(input);
    if (n.length !== 4) return null;
    if ([n[0], n[2]].some(v => Math.abs(v) > 90) || [n[1], n[3]].some(v => Math.abs(v) > 180)) return null;
    return `[[${n[0]}, ${n[1]}], [${n[2]}, ${n[3]}]]`;
  }

  // A title that is really a coordinate pair (pasted into the wrong field)
  // or has no letters at all would produce a nonsense namePath like
  // "55_2322213_6_5394664", which YAML also parses as a number.
  function titleProblem(title) {
    if (!/[a-z]/i.test(title)) {
      return /\d/.test(title)
        ? 'Title looks like coordinates or a number. Enter the place name here and put coordinates in the latlng field.'
        : 'Title needs at least one letter.';
    }
    return null;
  }

  // Quote a YAML scalar only when plain style would be misread.
  function yamlScalar(value) {
    const v = String(value);
    const risky = /^[\s\-?:,\[\]{}#&*!|>'"%@`]/.test(v) || /:\s|\s#|\s$/.test(v) ||
      /^(true|false|yes|no|null|~|on|off)$/i.test(v) || /^[-+]?[\d._]+$/.test(v);
    return risky ? '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : v;
  }

  // ---- Flag colours (_data/flag_colors.yml) -----------------
  // Detects the main colours of a flag image, ordered as they appear
  // (along whichever axis the colours are spread over). Returns ["#RRGGBB", …].
  async function detectFlagColors(bitmap, maxColors = 4) {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    // Bucket pixels to 4 bits per channel; track position per bucket.
    const buckets = new Map();
    let opaque = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        if (data[i + 3] < 200) continue;
        opaque++;
        const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
        let b = buckets.get(key);
        if (!b) { b = { n: 0, r: 0, g: 0, b: 0, x: 0, y: 0 }; buckets.set(key, b); }
        b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2]; b.x += x; b.y += y;
      }
    }
    if (!opaque) return [];

    const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    const cands = [...buckets.values()]
      .map(b => ({ n: b.n, r: b.r / b.n, g: b.g / b.n, b: b.b / b.n, x: b.x / b.n, y: b.y / b.n }))
      .sort((a, b) => b.n - a.n);

    // Greedy: keep a bucket if it is a visibly different colour from those
    // already kept; fold near-duplicates (anti-aliasing, gradients) into them.
    const kept = [];
    for (const c of cands) {
      const near = kept.find(k => dist(k, c) < 60);
      if (near) {
        const t = near.n + c.n;
        near.x = (near.x * near.n + c.x * c.n) / t;
        near.y = (near.y * near.n + c.y * c.n) / t;
        near.n = t;
      } else {
        kept.push({ ...c });
      }
    }
    const main = kept.filter(k => k.n / opaque >= 0.08).slice(0, maxColors);
    if (main.length < 2) return main.map(toHex);

    const spread = arr => Math.max(...arr) - Math.min(...arr);
    const axis = spread(main.map(k => k.x)) >= spread(main.map(k => k.y)) ? 'x' : 'y';
    main.sort((a, b) => a[axis] - b[axis]);
    return main.map(toHex);

    function toHex(c) {
      return '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
    }
  }

  // Parses "#abc, #AABBCC" style text into ["#AABBCC", …]; null if invalid.
  function parseColorList(input) {
    const parts = (input || '').split(/[\s,]+/).filter(Boolean);
    const out = [];
    for (const p of parts) {
      let m = p.match(/^#?([0-9a-f]{6})$/i);
      if (!m) {
        const short = p.match(/^#?([0-9a-f]{3})$/i);
        if (!short) return null;
        m = [null, short[1].split('').map(c => c + c).join('')];
      }
      out.push('#' + m[1].toUpperCase());
    }
    return out;
  }

  // Inserts a block for `slug` into flag_colors.yml, keeping the file's
  // alphabetical order and any existing block untouched.
  function buildUpdatedFlagColors(text, slug, colors) {
    if (new RegExp('^' + slug + ':', 'm').test(text)) return text;
    const block = `${slug}:\n` + colors.map(c => `  - "${c}"`).join('\n') + '\n';
    const re = /^([a-z0-9_]+):\s*$/gm;
    let m;
    while ((m = re.exec(text))) {
      if (m[1] > slug) return text.slice(0, m.index) + block + text.slice(m.index);
    }
    return text.replace(/\n*$/, '\n') + block;
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
    await loadExistingLocations();
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

  // Minimal front-matter parser — good enough for our own flat key: value
  // files (buildLocationFrontmatter never emits nested structures or lists).
  function parseFrontmatter(text) {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return {};
    const fm = {};
    m[1].split('\n').forEach(line => {
      const kv = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
      if (!kv) return;
      let value = kv[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      fm[kv[1]] = value;
    });
    return fm;
  }

  // Scans _locations/*.html so "add to existing location" has titles and
  // countries to show, not just the slugs locations_per_country.yml has.
  async function loadExistingLocations() {
    const locations = [];
    try {
      const locDir = await state.rootHandle.getDirectoryHandle('_locations');
      for await (const [name, entry] of locDir.entries()) {
        if (entry.kind !== 'file' || !name.endsWith('.html')) continue;
        const f = await entry.getFile();
        const fm = parseFrontmatter(await f.text());
        if (!fm.namePath) continue;
        locations.push({
          namePath: fm.namePath,
          title: fm.title || fm.namePath,
          country: fm.country || '',
          latlng: fm.latlng || '',
          mapGoogle: fm.mapGoogle || '',
        });
      }
    } catch (err) {
      console.warn('Could not load existing locations', err);
    }
    locations.sort((a, b) => a.title.localeCompare(b.title));
    state.existingLocations = locations;
    populateExistingLocationSelect();
  }

  function populateExistingLocationSelect() {
    const sel = document.getElementById('uw-existing-location');
    sel.innerHTML = '<option value="">Select a location…</option>';
    state.existingLocations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc.namePath;
      opt.textContent = `${loc.title} — ${loc.country} (${loc.namePath})`;
      sel.appendChild(opt);
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

  // ---- New vs. existing location mode -----------------------
  const newLocationFields = document.getElementById('uw-new-location-fields');
  const existingLocationFields = document.getElementById('uw-existing-location-fields');
  const existingLocationSelect = document.getElementById('uw-existing-location');
  const existingLocationSummary = document.getElementById('uw-existing-location-summary');

  root.querySelectorAll('input[name="uw-loc-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      state.mode = radio.value === 'existing' ? 'existing' : 'new';
      newLocationFields.hidden = state.mode === 'existing';
      existingLocationFields.hidden = state.mode === 'new';
    });
  });

  existingLocationSelect.addEventListener('change', () => {
    const np = existingLocationSelect.value;
    state.existingLocation = state.existingLocations.find(l => l.namePath === np) || null;
    refreshExistingLocationSummary();
  });

  // Checks the target location's images/full/<namePath>/ folder for
  // filenames that collide with the currently-selected uploads, so we never
  // silently overwrite an existing photo. Returns how many photos it
  // currently has.
  async function computeExistingCollisions(namePath) {
    const existingNames = new Set();
    let existingCount = 0;
    try {
      const dir = await state.rootHandle.getDirectoryHandle('images')
        .then(h => h.getDirectoryHandle('full'))
        .then(h => h.getDirectoryHandle(namePath));
      for await (const [name, entry] of dir.entries()) {
        if (entry.kind === 'file') { existingNames.add(name); existingCount++; }
      }
    } catch (err) {
      // No folder yet for this location — nothing to collide with.
    }
    state.existingLocationCollisions = state.images
      .map(img => img.outputName)
      .filter(name => existingNames.has(name));
    return existingCount;
  }

  async function refreshExistingLocationSummary() {
    const loc = state.existingLocation;
    if (!loc) { existingLocationSummary.innerHTML = ''; return; }
    const existingCount = await computeExistingCollisions(loc.namePath);
    let html = `<div class="uw-existing-summary">`;
    html += `<strong>${escapeHtml(loc.title)}</strong> — ${escapeHtml(loc.country)}<br>`;
    html += `Currently has ${existingCount} photo${existingCount === 1 ? '' : 's'}.`;
    if (state.existingLocationCollisions.length) {
      const n = state.existingLocationCollisions.length;
      html += `<span class="uw-collision-warning">⚠ ${n} of your selected photo${n === 1 ? '' : 's'} share${n === 1 ? 's' : ''} a filename with one already here and will be skipped: ${state.existingLocationCollisions.map(escapeHtml).join(', ')}. Rename the file and re-add it to include it.</span>`;
    }
    html += `</div>`;
    existingLocationSummary.innerHTML = html;
  }

  function validateLocationStep() {
    if (state.mode === 'existing') {
      const loc = state.existingLocation;
      if (!loc) { alert('Pick an existing location.'); return false; }
      if (state.existingLocationCollisions.length === state.images.length) {
        alert('Every selected photo already exists in this location (same filename). Rename them or remove the collisions before continuing.');
        return false;
      }
      state.location.title = loc.title;
      state.location.namePath = loc.namePath;
      state.location.country = loc.country;
      state.location.latlng = loc.latlng;
      state.location.mapGoogle = loc.mapGoogle;
      state.isNewCountry = false;
      return true;
    }

    const title = titleInput.value.trim();
    const namePath = slugify(namepathInput.value || '');
    const country = slugify(countryInput.value || '');
    if (!title) { alert('Title is required.'); return false; }
    const tProblem = titleProblem(title);
    if (tProblem) { alert(tProblem); return false; }
    if (!namePath) { alert('namePath is required.'); return false; }
    if (!/[a-z]/.test(namePath)) { alert('namePath needs at least one letter (it is the folder and file name).'); return false; }
    if (!country) { alert('Country is required.'); return false; }

    // latlng is optional, but when present it must be a valid pair.
    const rawLatLng = latlngInput.value.trim();
    let latlng = '';
    if (rawLatLng) {
      latlng = normalizeLatLng(rawLatLng);
      if (!latlng) { alert('latlng must be two numbers, e.g. 55.2322, -6.5394 (latitude first).'); return false; }
      latlngInput.value = latlng;
    }

    state.location.title = title;
    state.location.namePath = namePath;
    state.location.country = country;
    state.location.latlng = latlng;
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
  const cColors = document.getElementById('uw-c-colors');
  const flagInput = document.getElementById('uw-flag-input');
  const flagUploadLabel = document.querySelector('.uw-flag-upload');
  const flagPreview = document.getElementById('uw-flag-preview');
  const flagStatus = document.getElementById('uw-flag-status');

  // Fills the flag-colour field from a flag image (existing file or upload).
  // Never overwrites something the user typed.
  let colorsEditedByUser = false;
  cColors.addEventListener('input', () => { colorsEditedByUser = cColors.value.length > 0; });
  async function autofillColorsFrom(fileOrBlob) {
    if (colorsEditedByUser) return;
    try {
      const bitmap = await loadBitmap(fileOrBlob);
      const colors = await detectFlagColors(bitmap);
      if (bitmap.close) bitmap.close();
      if (colors.length && !colorsEditedByUser) cColors.value = colors.join(', ');
    } catch (err) {
      console.debug('flag colour detection failed', err);
    }
  }

  flagInput.addEventListener('change', async () => {
    const f = flagInput.files[0];
    if (!f) return;
    state.newCountry.flagBlob = f;
    flagPreview.innerHTML = `<img src="${URL.createObjectURL(f)}"><span>Selected: ${f.name}</span>`;
    autofillColorsFrom(f);
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
    colorsEditedByUser = false;
    cColors.value = '';
    try {
      const flagsDir = await state.rootHandle.getDirectoryHandle('images')
        .then(h => h.getDirectoryHandle('flags'));
      try {
        const existingFlag = await flagsDir.getFileHandle(slug + '.png');
        state.newCountry.flagAlreadyExists = true;
        flagStatus.textContent = `✓ /images/flags/${slug}.png already exists`;
        flagUploadLabel.hidden = true;
        autofillColorsFrom(await existingFlag.getFile());
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
    const llNorm = normalizeLatLng(ll);
    if (!llNorm) { alert('Country latlng must be two numbers, e.g. 53.35, -7.9 (latitude first).'); return false; }
    const bbNorm = normalizeBounds(bb);
    if (!bbNorm) { alert('bounds must be four numbers: two corners as "lat, lng", e.g. [[55.4, -5.2], [51.2, -11.4]].'); return false; }
    const colors = parseColorList(cColors.value);
    if (colors === null) { alert('Flag colors must be hex values like #169B62, separated by commas (or leave it empty).'); return false; }
    if (!state.newCountry.flagAlreadyExists && !state.newCountry.flagBlob) {
      const ok = confirm(`No flag PNG found at /images/flags/${state.location.country}.png and no flag uploaded. Continue without one? (the flag image will simply be missing on the site)`);
      if (!ok) return false;
    }
    state.newCountry.title = t;
    state.newCountry.latlng = llNorm;
    state.newCountry.bounds = bbNorm;
    state.newCountry.zoom = z;
    state.newCountry.colors = colors;
    cLatlng.value = llNorm;
    cBounds.value = bbNorm;
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
    if (state.mode === 'existing') {
      renderExistingLocationPreview();
      return;
    }

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
      if (state.newCountry.colors.length) {
        filesToCreate.push(`_data/flag_colors.yml (add ${country} block)`);
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

      ${state.isNewCountry ? `<h3>_data/flag_colors.yml (new block)</h3><pre>${state.newCountry.colors.length
        ? escapeHtml(`${country}:\n` + state.newCountry.colors.map(c => `  - "${c}"`).join('\n'))
        : '(none — the country card will have no colour stripe)'}</pre>` : ''}

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

  // Re-checks collisions right before showing the preview, in case the
  // user went back and changed the image selection after picking the
  // location.
  async function renderExistingLocationPreview() {
    const loc = state.existingLocation;
    const np = loc.namePath;
    await computeExistingCollisions(np);

    const toWrite = state.images.filter(img => !state.existingLocationCollisions.includes(img.outputName));
    const skipped = state.images.filter(img => state.existingLocationCollisions.includes(img.outputName));

    const filesToCreate = [];
    toWrite.forEach(img => {
      SIZES.forEach(s => filesToCreate.push(`images/${s.name}/${np}/${img.outputName}`));
    });

    const el = document.getElementById('uw-preview');
    el.innerHTML = `
      <h3>Adding photos to an existing location</h3>
      <p><strong>${escapeHtml(loc.title)}</strong> — ${escapeHtml(loc.country)} (<code>${np}</code>)</p>

      <h3>Files to create (${filesToCreate.length})</h3>
      <ul>${filesToCreate.map(f => `<li><code>${f}</code></li>`).join('')}</ul>

      ${skipped.length ? `
        <h3>Skipped — filename already exists in this location (${skipped.length})</h3>
        <ul>${skipped.map(img => `<li><code>${img.outputName}</code></li>`).join('')}</ul>
      ` : ''}

      <h3>Images</h3>
      <ul>
        <li>${toWrite.length} photo${toWrite.length === 1 ? '' : 's'} × 3 sizes = ${toWrite.length * 3} JPEGs</li>
        <li>full = max 1300px (longest side)</li>
        <li>thumb = max 400px</li>
        <li>blur = max 30px</li>
      </ul>

      <p class="uw-hint">No location, country, or YAML files will be created or modified — this location already exists.</p>
    `;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
  }

  function buildLocationFrontmatter(loc, indexImagePath) {
    return [
      '---',
      'layout: location',
      `title: ${yamlScalar(loc.title)}`,
      `namePath: ${yamlScalar(loc.namePath)}`,
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
      `title: ${yamlScalar(c.title)}`,
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

  // Adds the current uploads to an already-existing location: resizes and
  // writes images into its existing images/{full,thumb,blur}/<namePath>/
  // folders, then nudges Jekyll to rebuild. No _locations, _countries, or
  // YAML writes — the location is already fully set up.
  async function processExistingLocation(setProgress, log) {
    const loc = state.existingLocation;
    const np = loc.namePath;
    const country = loc.country;

    await computeExistingCollisions(np); // re-check right before writing
    const toWrite = state.images.filter(img => !state.existingLocationCollisions.includes(img.outputName));
    if (state.existingLocationCollisions.length) {
      log(`⚠ Skipping ${state.existingLocationCollisions.length} photo(s) already present: ${state.existingLocationCollisions.join(', ')}`);
    }
    if (toWrite.length === 0) {
      throw new Error('Nothing to write — every selected photo already exists in this location.');
    }

    const totalSteps = toWrite.length * SIZES.length + 1;
    let stepN = 0;

    const imagesDir = await state.rootHandle.getDirectoryHandle('images');
    const sizeDirs = {};
    for (const s of SIZES) {
      sizeDirs[s.name] = await imagesDir.getDirectoryHandle(s.name, { create: true })
        .then(h => h.getDirectoryHandle(np, { create: true }));
    }

    for (const img of toWrite) {
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
      await new Promise(r => setTimeout(r, 50));
    }

    setProgress(90, `Waiting for Jekyll to settle…`);
    await new Promise(r => setTimeout(r, 1500));

    setProgress(96, `Refreshing ${loc.title}…`);
    await touchFile(state.rootHandle, ['_locations', np + '.html']);
    log(`✓ refreshed _locations/${np}.html`);

    setProgress(99, `Nudging Jekyll to rebuild dependent pages…`);
    await touchAggregatingPages(state.rootHandle, country);
    log(`✓ touched country/worldmap/locations/index for rebuild`);
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
      if (state.mode === 'existing') {
        await processExistingLocation(setProgress, log);
        setProgress(100, 'Done!');
        await new Promise(r => setTimeout(r, 350));
        overlay.hidden = true;
        renderDoneSummary();
        showStep('done');
        return;
      }

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

        if (state.newCountry.colors.length) {
          const dataDirForColors = await state.rootHandle.getDirectoryHandle('_data');
          const colorsFh = await dataDirForColors.getFileHandle('flag_colors.yml', { create: true });
          const colorsText = await (await colorsFh.getFile()).text();
          const colorsW = await colorsFh.createWritable();
          await colorsW.write(buildUpdatedFlagColors(colorsText, country, state.newCountry.colors));
          await colorsW.close();
          log(`✓ _data/flag_colors.yml`);
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
    // Top-level pages that read site.locations / site.countries. Under
    // `jekyll serve --incremental` a new collection document does NOT
    // invalidate these on its own, so a new country/location would be
    // missing from them until they are touched.
    await touchFile(rootHandle, ['worldmap.html']);
    await touchFile(rootHandle, ['countries.html']);
    await touchFile(rootHandle, ['locations.html']);
    // Every page embeds the countries modal (a list of site.countries);
    // Jekyll tracks includes as dependencies, so touching it rebuilds them all.
    await touchFile(rootHandle, ['_includes', 'countries_modal.html']);
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

    if (state.mode === 'existing') {
      const added = state.images.length - state.existingLocationCollisions.length;
      el.innerHTML = `
        <p>✓ Added <code>${added}</code> photo${added === 1 ? '' : 's'} in 3 sizes to <strong>${state.location.title}</strong>.</p>
        ${state.existingLocationCollisions.length
          ? `<p>Skipped ${state.existingLocationCollisions.length} already present: ${state.existingLocationCollisions.join(', ')}</p>`
          : ''}
        <p>Refresh your local Jekyll preview to see the new photos:</p>
        <ul>
          <li><code>/countries/${country}#chapter-${np}</code></li>
        </ul>
        <p class="uw-hint">When you're happy, commit and push:
          <br><code>git add -A && git commit -m "Add photos to ${state.location.title}" && git push</code></p>
      `;
      return;
    }

    el.innerHTML = `
      <p>✓ Created <code>${state.images.length}</code> photos in 3 sizes for <strong>${state.location.title}</strong>.</p>
      <p>${state.isNewCountry
        ? `✓ Added new country <strong>${state.newCountry.title}</strong> (<code>${country}</code>).`
        : `✓ Added to existing country <strong>${country}</strong>.`}</p>
      <p>Refresh your local Jekyll preview to see the new photos:</p>
      <ul>
        <li><code>/countries/${country}#chapter-${np}</code></li>
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
    state.newCountry = { title: '', latlng: '', bounds: '', zoom: 6, colors: [], flagBlob: null, flagAlreadyExists: false };
    state.isNewCountry = false;
    state.mode = 'new';
    state.existingLocation = null;
    state.existingLocationCollisions = [];
    userEditedNamepath = false;

    // Reset form
    [titleInput, namepathInput, countryInput, latlngInput, mapInput,
     cTitle, cLatlng, cBounds, cZoom, cColors].forEach(el => el.value = '');
    document.getElementById('uw-image-list').innerHTML = '';
    document.getElementById('uw-images-next').disabled = true;
    document.getElementById('uw-flag-preview').innerHTML = '';
    root.querySelector('input[name="uw-loc-mode"][value="new"]').checked = true;
    newLocationFields.hidden = false;
    existingLocationFields.hidden = true;
    existingLocationSelect.value = '';
    existingLocationSummary.innerHTML = '';

    showStep('images'); // skip folder picker — already connected
  });

  // ----------------------------------------------------------
  // Boot
  // ----------------------------------------------------------
  showStep('folder');
  tryRestoreSavedFolder();
})();
