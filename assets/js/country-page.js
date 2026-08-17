// Country page interactions:
//
//   1. Drag-to-move on the bubble's header band (the title bar at the
//      top of the circle).
//   2. Drag-to-resize from the bubble's rim (within ~12px of the outer
//      edge). The circle grows/shrinks; its center stays anchored to
//      where it was when the gesture started, compensated via transform.
//   3. Zoom in/out buttons inside the bubble's footer call
//      map.zoomIn / map.zoomOut.
//   4. Scroll-spy: as the user scrolls into a new chapter, the Leaflet
//      map flies/zooms to that location, the matching marker gets
//      .is-active, and the bubble's title swaps to the location name.
//      When the user is above the first chapter, the map flies back to
//      the country-wide default view.
//   5. Locations TOC strip: hidden by default, slides down once the
//      user scrolls past the country hero. Click on a TOC entry smooth-
//      scrolls to that chapter; the entry with the chapter in view gets
//      .is-active.

(function () {
  'use strict';

  // Shared transform offset for the bubble. Both drag (move) and
  // resize (center-compensation) write to this so they don't fight.
  var bubbleTx = 0;
  var bubbleTy = 0;
  var bubbleEl = null;

  function applyBubbleTransform() {
    if (!bubbleEl) return;
    bubbleEl.style.transform = 'translate(' + bubbleTx + 'px, ' + bubbleTy + 'px)';
  }

  // Normalizes a mouse or touch event down to its coordinate point, shared
  // by the drag and resize handlers below.
  function getPoint(e) {
    if (e.touches && e.touches[0]) return e.touches[0];
    if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0];
    return e;
  }

  // ---- Drag the bubble (via header band) ------------------------
  function attachDrag(bubble, handle) {
    var startX = 0, startY = 0, startTx = 0, startTy = 0;
    var dragging = false;

    function onDown(e) {
      // Don't start a drag while the bubble is collapsed.
      if (bubble.classList.contains('is-hidden')) return;
      var pt = getPoint(e);
      startX = pt.clientX;
      startY = pt.clientY;
      startTx = bubbleTx;
      startTy = bubbleTy;
      dragging = true;
      // .is-dragging on the bubble does two things: lets the CSS
      // disable transitions (so the drag feels instant) and swaps
      // the header cursor to grabbing.
      bubble.classList.add('is-dragging');

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
      document.addEventListener('touchcancel', onUp);
      e.preventDefault();
    }

    function onMove(e) {
      if (!dragging) return;
      var pt = getPoint(e);
      bubbleTx = startTx + (pt.clientX - startX);
      bubbleTy = startTy + (pt.clientY - startY);
      applyBubbleTransform();
      if (e.cancelable) e.preventDefault();
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      bubble.classList.remove('is-dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      document.removeEventListener('touchcancel', onUp);
    }

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
  }

  // ---- Resize the bubble (via rim) ------------------------------
  // Rectangle resize: drag any edge or corner. Edges resize one
  // dimension; corners resize both. The opposite edge stays anchored
  // (typical window-resize behavior), with position compensation via
  // the shared bubble transform offset.
  function attachResize(bubble) {
    var RIM_TOLERANCE = 14;   // px from any edge → resize zone
    var MIN_W = 240;
    var MIN_H = 160;
    var MAX_W = 800;
    var MAX_H = 700;

    var initialRect = { left: 0, top: 0, width: 0, height: 0 };
    var initialPt = { x: 0, y: 0 };
    var initialTx = 0;
    var initialTy = 0;
    var activeEdges = null;
    var resizing = false;

    // Returns { left, right, top, bottom } booleans for which edges of
    // the bubble the point is within the resize tolerance of. Returns
    // null if the point is outside the bubble area entirely or fully
    // inside (no edge within tolerance).
    function getRimEdges(pt) {
      var rect = bubble.getBoundingClientRect();
      var fromLeft = pt.clientX - rect.left;
      var fromRight = rect.right - pt.clientX;
      var fromTop = pt.clientY - rect.top;
      var fromBottom = rect.bottom - pt.clientY;
      // Outside the bubble: ignore.
      if (fromLeft < -2 || fromRight < -2 || fromTop < -2 || fromBottom < -2) return null;

      var edges = {
        left:   fromLeft   < RIM_TOLERANCE,
        right:  fromRight  < RIM_TOLERANCE,
        top:    fromTop    < RIM_TOLERANCE,
        bottom: fromBottom < RIM_TOLERANCE
      };

      if (!edges.left && !edges.right && !edges.top && !edges.bottom) return null;
      return edges;
    }

    function rimDirection(edges) {
      // Map the active edge combination to a cursor direction key.
      // Corners take precedence over single edges.
      if ((edges.left && edges.top) || (edges.right && edges.bottom)) return 'nwse';
      if ((edges.right && edges.top) || (edges.left && edges.bottom)) return 'nesw';
      if (edges.left || edges.right) return 'ew';
      if (edges.top || edges.bottom) return 'ns';
      return null;
    }

    function bodyCursorFor(dir) {
      switch (dir) {
        case 'ew': return 'ew-resize';
        case 'ns': return 'ns-resize';
        case 'nwse': return 'nwse-resize';
        case 'nesw': return 'nesw-resize';
        default: return '';
      }
    }

    // Hover — set data-rim so CSS shows the right direction cursor.
    function onHover(e) {
      if (resizing) return;
      if (bubble.classList.contains('is-hidden')) {
        delete bubble.dataset.rim;
        return;
      }
      var edges = getRimEdges({ clientX: e.clientX, clientY: e.clientY });
      var dir = edges && rimDirection(edges);
      if (dir) bubble.dataset.rim = dir;
      else delete bubble.dataset.rim;
    }

    function onLeave() {
      if (!resizing) delete bubble.dataset.rim;
    }

    bubble.addEventListener('mousemove', onHover);
    bubble.addEventListener('mouseleave', onLeave);

    function onDown(e) {
      // Don't start a resize while the bubble is collapsed.
      if (bubble.classList.contains('is-hidden')) return;
      var pt = getPoint(e);
      var edges = getRimEdges(pt);
      if (!edges) return;

      initialRect = {
        left: bubble.offsetLeft,
        top: bubble.offsetTop,
        width: bubble.offsetWidth,
        height: bubble.offsetHeight
      };
      initialPt = { x: pt.clientX, y: pt.clientY };
      initialTx = bubbleTx;
      initialTy = bubbleTy;
      activeEdges = edges;
      resizing = true;
      bubble.classList.add('is-resizing');
      document.body.style.cursor = bodyCursorFor(rimDirection(edges));

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
      document.addEventListener('touchcancel', onUp);

      e.preventDefault();
      e.stopPropagation();
    }

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    function onMove(e) {
      if (!resizing) return;
      var pt = getPoint(e);
      var dx = pt.clientX - initialPt.x;
      var dy = pt.clientY - initialPt.y;

      var newWidth = initialRect.width;
      var newHeight = initialRect.height;
      var newTx = initialTx;
      var newTy = initialTy;

      // Right edge dragged: width grows/shrinks; left edge stays put.
      if (activeEdges.right) {
        newWidth = clamp(initialRect.width + dx, MIN_W, MAX_W);
      }
      // Left edge dragged: width changes; right edge stays put.
      // Compensate transform so the right edge is anchored.
      if (activeEdges.left) {
        newWidth = clamp(initialRect.width - dx, MIN_W, MAX_W);
        var deltaW = newWidth - initialRect.width;
        newTx = initialTx - deltaW;
      }
      if (activeEdges.bottom) {
        newHeight = clamp(initialRect.height + dy, MIN_H, MAX_H);
      }
      if (activeEdges.top) {
        newHeight = clamp(initialRect.height - dy, MIN_H, MAX_H);
        var deltaH = newHeight - initialRect.height;
        newTy = initialTy - deltaH;
      }

      bubble.style.width = newWidth + 'px';
      bubble.style.height = newHeight + 'px';
      bubbleTx = newTx;
      bubbleTy = newTy;
      applyBubbleTransform();

      if (window.__countryMap) window.__countryMap.invalidateSize(false);

      if (e.cancelable) e.preventDefault();
    }

    function onUp() {
      if (!resizing) return;
      resizing = false;
      activeEdges = null;
      bubble.classList.remove('is-resizing');
      document.body.style.cursor = '';
      delete bubble.dataset.rim;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      document.removeEventListener('touchcancel', onUp);
    }

    // Capture phase on the bubble itself so we see the mousedown before
    // it reaches Leaflet (map drag) or the header drag handler.
    bubble.addEventListener('mousedown', onDown, true);
    bubble.addEventListener('touchstart', onDown, { passive: false, capture: true });
  }

  // ---- Hide/show toggle (top-left button) ------------------------
  function attachToggle(bubble) {
    var toggle = document.getElementById('country-map-bubble-toggle');
    if (!toggle) return;

    var STORAGE_KEY = 'country-map-bubble-hidden';

    // Saved inline width/height so the user's resized dimensions are
    // restored when they re-open the map.
    var savedWidth = null;
    var savedHeight = null;

    function readStored() {
      try { return localStorage.getItem(STORAGE_KEY); }
      catch (e) { return null; }
    }

    function writeStored(hidden) {
      try { localStorage.setItem(STORAGE_KEY, hidden ? '1' : '0'); }
      catch (e) { /* localStorage may be disabled or full — ignore */ }
    }

    function setHidden(hidden, options) {
      options = options || {};
      if (hidden) {
        savedWidth = bubble.style.width;
        savedHeight = bubble.style.height;
        bubble.classList.add('is-hidden');
        // Clear inline so the CSS rules for the collapsed state apply,
        // and zero the transform so the bubble snaps into the left
        // gutter rather than wherever the user dragged it.
        bubble.style.width = '';
        bubble.style.height = '';
        bubble.style.transform = '';
        toggle.setAttribute('aria-label', 'Show map');
      } else {
        bubble.classList.remove('is-hidden');
        if (savedWidth) bubble.style.width = savedWidth;
        if (savedHeight) bubble.style.height = savedHeight;
        applyBubbleTransform();
        toggle.setAttribute('aria-label', 'Hide map');
      }

      if (options.persist !== false) writeStored(hidden);

      // After the transition settles, ask Leaflet to re-measure so the
      // tiles render correctly at the new container size.
      setTimeout(function () {
        if (window.__countryMap) window.__countryMap.invalidateSize();
      }, 480);
    }

    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setHidden(!bubble.classList.contains('is-hidden'));
    });

    // Also stop mousedown so the resize handler doesn't claim the
    // click before the toggle fires.
    toggle.addEventListener('mousedown', function (e) { e.stopPropagation(); });

    // Restore the user's last preference (default = visible if nothing
    // is stored). Transitions are disabled briefly so the collapse
    // doesn't animate on every page load for users who have it hidden.
    if (readStored() === '1') {
      bubble.style.transition = 'none';
      setHidden(true, { persist: false });
      // Force the browser to commit the layout change before re-enabling
      // transitions; otherwise the bubble would animate from expanded
      // to collapsed on the next paint.
      void bubble.offsetHeight;
      requestAnimationFrame(function () {
        bubble.style.transition = '';
      });
    }
  }

  // ---- Zoom buttons (bubble footer + banner controls) ------------
  function attachZoomButtons() {
    var buttons = document.querySelectorAll('.country-map-bubble__zoom');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var map = window.__countryMap;
        if (!map) return;
        if (btn.dataset.zoom === 'in') map.zoomIn();
        else if (btn.dataset.zoom === 'out') map.zoomOut();
      });
      btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    });

    var bannerButtons = document.querySelectorAll('.country-map-banner__zoom');
    bannerButtons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var map = window.__countryBannerMap;
        if (!map) return;
        if (btn.dataset.zoom === 'in') map.zoomIn();
        else if (btn.dataset.zoom === 'out') map.zoomOut();
      });
    });
  }

  // ---- TOC horizontal auto-scroll ---------------------------------
  //
  // When the country has more locations than fit horizontally in the
  // sticky TOC, the ol becomes horizontally scrollable (overflow-x:
  // auto in country-page.scss). As the user scrolls the page and the
  // scroll-spy moves `.is-active` to a TOC item that's currently
  // clipped off either side, slide the ol horizontally to bring that
  // item into view (centered).
  function ensureTocItemVisible(item) {
    var list = item.parentElement;
    if (!list) return;
    // Nothing to do if the ol isn't actually scrollable (all items fit).
    if (list.scrollWidth <= list.clientWidth + 1) return;

    var listRect = list.getBoundingClientRect();
    var itemRect = item.getBoundingClientRect();
    // A bit of breathing room before we consider the item "clipped" —
    // so half-visible items still count as visible enough.
    var pad = 16;

    var fullyVisible =
      itemRect.left   >= listRect.left  + pad &&
      itemRect.right  <= listRect.right - pad;
    if (fullyVisible) return;

    // Centre the item by computing how far the ol's centre is from
    // the item's centre and scrolling that delta.
    var delta = (itemRect.left + itemRect.width / 2)
              - (listRect.left + listRect.width / 2);

    if (typeof list.scrollBy === 'function') {
      list.scrollBy({ left: delta, behavior: 'smooth' });
    } else {
      list.scrollLeft += delta;
    }
  }

  // ---- Scroll-spy: drive map + TOC --------------------------------
  function attachScrollSpy(bubbleTitle) {
    var chapters = Array.from(document.querySelectorAll('.country-chapter'));
    if (chapters.length === 0) return;

    var map = window.__countryMap;
    var markers = window.__countryMarkers || {};
    var defaults = window.__countryDefaultView;
    if (!map) return;

    var FLY_ZOOM = 11;
    var FLY_DURATION = 1.0;

    var tocItems = Array.from(document.querySelectorAll('.country-toc li[data-target]'));

    var current = null;

    function highlight(locationName) {
      if (current === locationName) return;
      current = locationName;

      Object.keys(markers).forEach(function (k) {
        var el = markers[k].getElement && markers[k].getElement();
        if (el) el.classList.toggle('is-active', k === locationName);
      });

      var newActive = null;
      tocItems.forEach(function (li) {
        var isActive = li.dataset.target === ('chapter-' + locationName);
        li.classList.toggle('is-active', isActive);
        if (isActive) newActive = li;
      });

      // If the active item has scrolled off the edge of the TOC (the ol
      // overflows horizontally when there are too many locations to fit),
      // pull it back into view.
      if (newActive) ensureTocItemVisible(newActive);

      // Bubble title text — always the dark default color, just swap text.
      if (bubbleTitle) {
        var ch = locationName && document.getElementById('chapter-' + locationName);
        var name = ch && ch.querySelector('.country-chapter__name');
        bubbleTitle.textContent = name ? name.textContent : (document.title ? document.title.split('|')[0].trim() : '');
      }
    }

    function flyToCountry() {
      if (!defaults) return;
      map.flyTo(defaults.latlng, defaults.zoom, { duration: FLY_DURATION });
      highlight(null);
    }

    function flyToChapter(chapter) {
      var raw = chapter.dataset.latlng;
      if (!raw) return;
      try {
        var latlng = JSON.parse(raw);
        map.flyTo(latlng, FLY_ZOOM, { duration: FLY_DURATION });
      } catch (err) { /* malformed latlng: ignore */ }
      highlight(chapter.dataset.location);
    }

    if (!('IntersectionObserver' in window)) return;

    var visible = new Set();
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      });

      if (visible.size === 0) {
        if (window.scrollY < chapters[0].offsetTop) {
          flyToCountry();
        }
        return;
      }

      var topMost = null;
      var topMostY = Infinity;
      visible.forEach(function (el) {
        var y = el.getBoundingClientRect().top;
        if (y < topMostY) { topMostY = y; topMost = el; }
      });

      if (topMost) flyToChapter(topMost);
    }, {
      rootMargin: '-30% 0px -50% 0px',
      threshold: 0
    });

    chapters.forEach(function (c) { observer.observe(c); });
  }

  // ---- TOC: reveal-on-scroll + click smooth-scroll ----------------
  function attachToc() {
    var toc = document.querySelector('.country-toc');
    if (!toc) return;

    var hero = document.querySelector('.country-hero');
    if (hero && 'IntersectionObserver' in window) {
      var revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            toc.classList.remove('is-revealed');
          } else {
            toc.classList.add('is-revealed');
          }
        });
      }, { threshold: 0 });
      revealObserver.observe(hero);
    } else if (hero) {
      toc.classList.add('is-revealed');
    }

    Array.from(toc.querySelectorAll('li[data-target]')).forEach(function (li) {
      li.addEventListener('click', function () {
        var target = document.getElementById(li.dataset.target);
        if (target && typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  // Sync --header-height to the actual rendered #header height so the
  // TOC sits flush against the bottom of the header without a sliver
  // of page content showing through. The static value in variables.scss
  // is a rough estimate that doesn't match the live rendered size.
  function syncHeaderHeight() {
    var h = document.getElementById('header');
    if (!h) return;
    var actual = h.getBoundingClientRect().height;
    if (actual > 0) {
      document.documentElement.style.setProperty('--header-height', actual + 'px');
    }
  }

  function init() {
    bubbleEl = document.getElementById('country-map-bubble');
    var handle = document.getElementById('country-map-bubble-header');
    var title = document.getElementById('country-map-bubble-title');
    if (bubbleEl && handle) attachDrag(bubbleEl, handle);
    if (bubbleEl) attachResize(bubbleEl);
    if (bubbleEl) attachToggle(bubbleEl);
    attachZoomButtons();
    attachToc();
    syncHeaderHeight();
    window.addEventListener('resize', syncHeaderHeight);
    // Re-measure after fonts/web fonts settle, which can shift the
    // header's height by a px or two.
    window.addEventListener('load', syncHeaderHeight);

    if (window.__countryMap) {
      attachScrollSpy(title);
    } else {
      window.addEventListener('country-map-ready', function () {
        attachScrollSpy(title);
      }, { once: true });
    }

    // Hide the floating bubble while the banner map is visible in the viewport;
    // show it once the banner scrolls out of view.
    var bannerWrapper = document.getElementById('country-map-banner-wrapper');
    if (bannerWrapper && bubbleEl) {
      // Set immediately so there is no flash on page load.
      if (bannerWrapper.getBoundingClientRect().bottom > 0) {
        bubbleEl.classList.add('is-banner-visible');
      }
      if ('IntersectionObserver' in window) {
        var bannerObserver = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            bubbleEl.classList.toggle('is-banner-visible', entry.isIntersecting);
          });
        }, { threshold: 0 });
        bannerObserver.observe(bannerWrapper);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
