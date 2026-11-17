// Dev-only: one way for the local tools (collection editor, collection
// picker, portfolio toggle) to read and write source files.
//
//   window.devFiles.read(path)          -> Promise<string|null>  (null: no such file)
//   window.devFiles.write(path, text)   -> Promise
//   window.devFiles.remove(path)       -> Promise  (collections only on the server route)
//   window.devFiles.touch(path)         -> Promise  (bump mtime so Jekyll rebuilds)
//   window.devFiles.info()              -> Promise<{ mode, folder }>
//   window.devFiles.pickFolder()        -> Promise<{ mode, folder }>  (folder mode only)
//
// `path` is relative to the site root, e.g. "_collections/castles.html".
//
// Preferred route: the dev server writes the file itself, through the
// /__dev/files endpoint added by _dev/jekyll-dev-files. That works on any
// port and needs no permission, and always targets the folder the server
// runs from.
//
// Fallback (endpoint missing, e.g. the gem isn't installed yet): the File
// System Access API, with the repo folder handle kept in IndexedDB. The
// browser stores that per address, so each port asks for the folder once.

(function () {
  'use strict';

  var ENDPOINT = '/__dev/files';
  var serverState = null; // Promise<{ ok, folder }>

  function call(payload) {
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Dev-Files': '1' },
      body: JSON.stringify(payload),
      cache: 'no-store'
    }).then(function (res) {
      var type = res.headers.get('Content-Type') || '';
      if (type.indexOf('application/json') === -1) {
        var e = new Error('The dev server has no file endpoint.');
        e.noEndpoint = true;
        throw e;
      }
      return res.json().then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || 'The dev server refused the request.');
        return data;
      });
    });
  }

  function server() {
    if (!serverState) {
      serverState = call({ op: 'ping' }).then(
        function (d) { return { ok: true, folder: d.folder || '' }; },
        function () { return { ok: false, folder: '' }; }
      );
    }
    return serverState;
  }

  // ------------------------------------------------------------------
  // Fallback: File System Access API
  // ------------------------------------------------------------------
  var idb = (function () {
    var dbPromise;
    function open() {
      if (!dbPromise) {
        dbPromise = new Promise(function (resolve, reject) {
          // Same database the upload wizard uses, so one grant covers both.
          var req = indexedDB.open('upload-wizard', 1);
          req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { reject(req.error); };
        });
      }
      return dbPromise;
    }
    return {
      get: function (key) {
        return open().then(function (db) {
          return new Promise(function (resolve, reject) {
            var req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
          });
        });
      },
      set: function (key, value) {
        return open().then(function (db) {
          return new Promise(function (resolve, reject) {
            var tx = db.transaction('kv', 'readwrite');
            tx.objectStore('kv').put(value, key);
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
          });
        });
      }
    };
  })();

  var cachedRoot = null;

  function requireFsa() {
    if (!('showDirectoryPicker' in window)) {
      throw new Error('The dev server has no file endpoint and this browser cannot write files directly. ' +
        'Run `bundle install` and restart `jekyll serve`, or use Chrome, Edge or Brave.');
    }
  }

  async function pickRoot() {
    requireFsa();
    var handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    try {
      await handle.getDirectoryHandle('_collections');
      await handle.getDirectoryHandle('_data');
    } catch (err) {
      throw new Error('That folder does not look like the site repo (no _collections/ or _data/).');
    }
    await idb.set('rootHandle', handle);
    cachedRoot = handle;
    return handle;
  }

  async function getRoot() {
    if (cachedRoot) return cachedRoot;
    requireFsa();
    var saved = await idb.get('rootHandle');
    if (saved) {
      var perm = await saved.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await saved.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        cachedRoot = saved;
        return saved;
      }
    }
    return pickRoot();
  }

  async function fileHandle(path, create) {
    var parts = path.split('/');
    var dir = await getRoot();
    for (var i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: !!create });
    }
    return dir.getFileHandle(parts[parts.length - 1], { create: !!create });
  }

  async function fsaRead(path) {
    var fh;
    try {
      fh = await fileHandle(path, false);
    } catch (err) {
      if (err && err.name === 'NotFoundError') return null;
      throw err;
    }
    return (await fh.getFile()).text();
  }

  async function fsaWrite(path, text) {
    var fh = await fileHandle(path, true);
    var w = await fh.createWritable();
    await w.write(text);
    await w.close();
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  window.devFiles = {
    read: function (path) {
      return server().then(function (s) {
        if (!s.ok) return fsaRead(path);
        return call({ op: 'read', path: path }).then(function (d) { return d.exists ? d.content : null; });
      });
    },

    write: function (path, text) {
      return server().then(function (s) {
        if (!s.ok) return fsaWrite(path, text);
        return call({ op: 'write', path: path, content: text }).then(function () {});
      });
    },

    remove: function (path) {
      return server().then(function (s) {
        if (s.ok) return call({ op: 'delete', path: path }).then(function () {});
        return fileHandle(path, false).then(async function () {
          var parts = path.split('/');
          var dir = await getRoot();
          for (var i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i]);
          await dir.removeEntry(parts[parts.length - 1]);
        }, function (err) {
          if (err && err.name === 'NotFoundError') return;
          throw err;
        });
      });
    },

    touch: function (path) {
      return server().then(function (s) {
        if (s.ok) return call({ op: 'touch', path: path }).then(function () {});
        return fsaRead(path).then(function (text) {
          if (text !== null) return fsaWrite(path, text);
        });
      }).catch(function (err) {
        // Non-fatal: the real write has already happened.
        console.debug('[dev-files] touch failed', path, err);
      });
    },

    info: function () {
      return server().then(function (s) {
        if (s.ok) return { mode: 'server', folder: s.folder };
        if (!('showDirectoryPicker' in window)) return { mode: 'none', folder: '' };
        return idb.get('rootHandle').then(
          function (h) { return { mode: 'folder', folder: h ? h.name : '' }; },
          function () { return { mode: 'folder', folder: '' }; }
        );
      });
    },

    pickFolder: function () {
      return pickRoot().then(function (h) { return { mode: 'folder', folder: h.name }; });
    }
  };
})();
