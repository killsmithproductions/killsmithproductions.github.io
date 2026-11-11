(function () {
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var motionPreference = new URLSearchParams(window.location.search).get("motion") === "off" ? "off" : "on";
  document.documentElement.dataset.motionPreference = motionPreference;

  var loops = Array.prototype.slice.call(document.querySelectorAll("[data-loop-src]"));
  var regions = Array.prototype.slice.call(document.querySelectorAll("[data-motion-region]"));
  var generations = new WeakMap();
  var alphaChecked = new WeakSet();

  function motionAllowed() {
    return !document.hidden && motionPreference === "on";
  }

  function stopLoop(video, image) {
    video.pause();
    video.hidden = true;
    if (image) image.hidden = true;
    if (video.parentElement) video.parentElement.classList.remove("is-playing");
  }

  function tryVideo(video, image, current) {
    var region = video.closest("[data-motion-region]");
    var visible = motionAllowed() && region && region.dataset.motionVisible === "true";
    if (generations.get(video) !== current) return;
    if (!visible || video.error || video.dataset.alphaUnsupported === "true" || !video.canPlayType('video/webm; codecs="vp9"')) {
      stopLoop(video, image);
      return;
    }
    video.autoplay = true;
    video.muted = true;
    video.defaultMuted = true;
    if (image) image.hidden = true;
    if (!video.getAttribute("src")) video.src = video.dataset.loopSrc;
    video.hidden = false;
    video.play().then(function () {
      if (generations.get(video) !== current) return;
      if (!alphaChecked.has(video)) {
        alphaChecked.add(video);
        try {
          var canvas = document.createElement("canvas");
          canvas.width = 32;
          canvas.height = 20;
          var context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas unavailable");
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          var pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          var hasAlpha = false;
          for (var i = 3; i < pixels.length; i += 4) {
            if (pixels[i] < 240) {
              hasAlpha = true;
              break;
            }
          }
          if (!hasAlpha) throw new Error("WebM alpha unsupported");
        } catch (error) {
          video.dataset.alphaUnsupported = "true";
          stopLoop(video, image);
          return;
        }
      }
      if (motionAllowed() && region && region.dataset.motionVisible === "true") {
        if (video.parentElement) video.parentElement.classList.add("is-playing");
      } else {
        stopLoop(video, image);
      }
    }).catch(function () {
      if (generations.get(video) === current) stopLoop(video, image);
    });
  }

  function updateLoop(video) {
    var current = (generations.get(video) || 0) + 1;
    generations.set(video, current);
    var region = video.closest("[data-motion-region]");
    var image = region ? region.querySelector("[data-loop-image-src]") : null;
    var visible = motionAllowed() && region && region.dataset.motionVisible === "true";
    video.autoplay = false;
    if (!visible) {
      stopLoop(video, image);
      return;
    }
    if (!image || image.dataset.failed === "true") {
      tryVideo(video, image, current);
      return;
    }
    video.pause();
    video.hidden = true;
    function showImage() {
      if (generations.get(video) !== current || !motionAllowed() || region.dataset.motionVisible !== "true") return;
      image.hidden = false;
      if (video.parentElement) video.parentElement.classList.add("is-playing");
    }
    image.onload = showImage;
    image.onerror = function () {
      image.dataset.failed = "true";
      tryVideo(video, image, current);
    };
    if (!image.getAttribute("src")) image.src = image.dataset.loopImageSrc;
    if (image.complete && image.naturalWidth) showImage();
  }

  function updateMotion() {
    document.documentElement.dataset.decorativeMotion = motionAllowed() ? "running" : "paused";
    loops.forEach(updateLoop);
  }

  reducedMotion.addEventListener("change", updateMotion);
  document.addEventListener("visibilitychange", updateMotion);
  window.addEventListener("pageshow", updateMotion);
  loops.forEach(function (video) {
    video.addEventListener("error", function () { updateLoop(video); });
  });

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.dataset.motionVisible = String(entry.isIntersecting);
      });
      updateMotion();
    }, { threshold: 0 });
    regions.forEach(function (region) { observer.observe(region); });
  } else {
    regions.forEach(function (region) { region.dataset.motionVisible = "true"; });
  }
  updateMotion();

  function embedMarkup(panel) {
    var wrap = document.createElement("div");
    wrap.className = "spotify-embed-wrap";
    var status = document.createElement("p");
    status.className = "player-status";
    status.setAttribute("role", "status");
    status.textContent = "Connecting to Spotify…";
    var iframe = document.createElement("iframe");
    iframe.setAttribute("data-testid", "embed-iframe");
    iframe.title = panel.dataset.embedTitle || "Dyl the Killsmith on Spotify";
    iframe.src = panel.dataset.embedSrc;
    iframe.style.borderRadius = "12px";
    iframe.width = "100%";
    iframe.height = panel.dataset.embedHeight || "352";
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("allowfullscreen", "");
    iframe.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.addEventListener("load", function () { status.remove(); });
    wrap.appendChild(status);
    wrap.appendChild(iframe);
    return wrap;
  }

  document.querySelectorAll("[data-spotify-panel] iframe").forEach(function (iframe) {
    var status = iframe.parentElement ? iframe.parentElement.querySelector(".player-status") : null;
    if (!status) return;
    iframe.addEventListener("load", function () { status.remove(); });
  });

  function showEmbed(panel) {
    if (!panel.dataset.embedSrc || panel.querySelector(".spotify-embed-wrap")) return;
    var invitation = panel.querySelector(".spotify-invitation");
    var row = panel.querySelector(".player-fallback-row");
    var wrap = embedMarkup(panel);
    if (invitation) invitation.replaceWith(wrap);
    else if (row) panel.insertBefore(wrap, row);
    else panel.appendChild(wrap);
    if (row && !row.querySelector("[data-spotify-reload]")) {
      var reload = document.createElement("button");
      reload.className = "inline-retry";
      reload.type = "button";
      reload.setAttribute("data-spotify-reload", "");
      reload.textContent = "RELOAD PLAYER";
      row.appendChild(reload);
    }
  }

  function reloadEmbed(panel) {
    var wrap = panel.querySelector(".spotify-embed-wrap");
    if (!wrap || !panel.dataset.embedSrc) return;
    wrap.replaceWith(embedMarkup(panel));
  }

  document.addEventListener("click", function (event) {
    if (!(event.target instanceof Element)) return;
    var load = event.target.closest("[data-spotify-load]");
    if (load) {
      var panel = load.closest("[data-spotify-panel]");
      if (panel) showEmbed(panel);
      return;
    }
    var reload = event.target.closest("[data-spotify-reload]");
    if (reload) {
      var player = reload.closest("[data-spotify-panel]");
      if (player) reloadEmbed(player);
    }
  });

  function openPrivacy() {
    var details = document.querySelector("#privacy > details");
    if (details) details.open = true;
  }

  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;
    var link = event.target.closest('a[href="#privacy"]');
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    openPrivacy();
  });
  window.addEventListener("hashchange", function () {
    if (window.location.hash === "#privacy") openPrivacy();
  });
  if (window.location.hash === "#privacy") openPrivacy();

  var menuToggle = document.querySelector("#menuToggle");
  var navLinks = document.querySelector("#navLinks");

  function closeMenu() {
    if (navLinks) navLinks.classList.remove("open");
    if (menuToggle) {
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Open navigation");
    }
  }

  if (menuToggle) {
    menuToggle.addEventListener("click", function () {
      var open = menuToggle.getAttribute("aria-expanded") !== "true";
      menuToggle.setAttribute("aria-expanded", String(open));
      menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      if (navLinks) navLinks.classList.toggle("open", open);
    });
  }
  if (navLinks) {
    navLinks.addEventListener("click", function (event) {
      if (event.target instanceof Element && event.target.closest("a")) closeMenu();
    });
  }
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && menuToggle && menuToggle.getAttribute("aria-expanded") === "true") {
      closeMenu();
      menuToggle.focus();
    }
  });
  window.matchMedia("(min-width: 951px)").addEventListener("change", closeMenu);
})();
