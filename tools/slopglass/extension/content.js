var extract = globalThis.SlopglassExtract;
var ROOT_MARGIN = "800px 0px";
var LOOKAHEAD = 800;
var cssPromise = null;
var MIN_CHARS = 40;

var observer = new IntersectionObserver(onIntersect, { rootMargin: ROOT_MARGIN });
var scanTimer = 0;
var hosts = new Map();
var ledger = new Map();
var activeMode = null;
var meterPromise = null;
var generation = 0;

function cssText() {
  if (cssPromise) return cssPromise;
  var request = fetch(chrome.runtime.getURL("overlay.css"))
    .then(function (response) {
      if (!response.ok) throw new Error("overlay.css " + response.status);
      return response.text();
    })
    .catch(function () {
      if (cssPromise === request) cssPromise = null;
      return "";
    });
  cssPromise = request;
  return request;
}

function resolveMode(config) {
  if (config.mode === "feed" || config.mode === "profile") return config.mode;
  return location.pathname.indexOf("/in/") !== -1 ? "profile" : "feed";
}

function scan() {
  chrome.storage.local.get({ enabled: true, mode: "auto" }, function (config) {
    if (config.enabled === false) {
      clearMarks();
      ledger.clear();
      removeMeter();
      return;
    }
    var mode = resolveMode(config);
    if (mode !== activeMode) {
      activeMode = mode;
      ledger.clear();
      clearMarks();
      paintMeter();
    }
    extract.findPostRoots(document).forEach(function (root) {
      if (extract.isNested(root)) return;
      if (mode === "profile") {
        judge(root);
        return;
      }
      if (root.dataset.slopglassWatching === "1") return;
      observer.unobserve(root);
      root.dataset.slopglassWatching = "1";
      observer.observe(root);
    });
  });
}

function onIntersect(entries) {
  entries.forEach(function (entry) {
    if (!entry.isIntersecting) return;
    judge(entry.target);
  });
}

function judge(root) {
  if (extract.isNested(root)) return;
  if (extract.isRepost(root)) {
    var skipKey = root.getAttribute("data-urn") || root.getAttribute("data-id") || "repost";
    root.dataset.slopglassKey = "repost\n" + skipKey;
    paint(root, { phase: "repost" });
    note(skipKey, { kind: "skip" });
    return;
  }
  var post = extract.readPost(root);
  if (!post) return;
  var key = post.urn || post.text;
  if (post.text.length < MIN_CHARS) {
    root.dataset.slopglassKey = "thin\n" + key;
    paint(root, { phase: "thin" });
    note(key, { kind: "thin" });
    return;
  }
  if (root.dataset.slopglassKey === key && root.querySelector(".slopglass-host")) return;
  root.dataset.slopglassKey = key;
  paint(root, { phase: "reading" });
  chrome.runtime.sendMessage({ type: "classify", text: post.text }, function (response) {
    if (root.dataset.slopglassKey !== key) return;
    if (chrome.runtime.lastError || !response) {
      paint(root, { phase: "error", message: "The extension lost its connection. Reload the page." });
      return;
    }
    if (response.ok && response.skipped) {
      if (response.reason === "too_short") {
        paint(root, { phase: "thin" });
        note(key, { kind: "thin" });
      }
      return;
    }
    if (!response.ok || !response.reading) {
      paint(root, { phase: "error", message: response.error || "Jev didn't return a judgment." });
      return;
    }
    paint(root, { phase: "ready", reading: response.reading });
    note(key, { kind: "judged", bucket: response.reading.bucket });
  });
}

function note(key, entry) {
  ledger.set(key, entry);
  paintMeter();
}

function clearMarks() {
  generation += 1;
  hosts.forEach(function (promise) {
    promise.then(function (host) {
      if (host && host.remove) host.remove();
    });
  });
  hosts.clear();
  document.querySelectorAll(".slopglass-host").forEach(function (node) {
    node.remove();
  });
  document.querySelectorAll("[data-slopglass-key]").forEach(function (node) {
    delete node.dataset.slopglassKey;
  });
  document.querySelectorAll("[data-slopglass-watching]").forEach(function (node) {
    delete node.dataset.slopglassWatching;
  });
}

function hostFor(root) {
  var pending = hosts.get(root);
  if (pending) return pending;
  var gen = generation;
  var promise = cssText().then(function (css) {
    if (gen !== generation) return null;
    var host = root.querySelector(":scope > .slopglass-host");
    if (!host) {
      host = document.createElement("div");
      host.className = "slopglass-host";
      host.style.cssText = "display:block;margin:0 0 8px;position:relative;z-index:2;";
      host.attachShadow({ mode: "open" });
      root.insertBefore(host, root.firstChild);
    }
    if (host.shadowRoot && !host.shadowRoot.querySelector("style")) {
      var style = document.createElement("style");
      style.textContent = css;
      host.shadowRoot.appendChild(style);
    }
    return host;
  });
  hosts.set(root, promise);
  return promise;
}

function paint(root, state) {
  var gen = generation;
  hostFor(root).then(function (host) {
    if (gen !== generation || !host || !host.shadowRoot) return;
    var shadow = host.shadowRoot;
    var existing = shadow.querySelector(".wrap");
    if (existing) existing.remove();
    shadow.appendChild(render(state));
  });
}

function render(state) {
  var wrap = document.createElement("div");
  wrap.className = "wrap";
  var bar = document.createElement("div");
  bar.className = "chip-row";
  var button = document.createElement("button");
  button.className = "chip";
  button.type = "button";

  if (state.phase === "reading") {
    bar.dataset.verdict = "reading";
    button.innerHTML = '<span class="dot pulse"></span><span class="label">Reading</span>';
    button.disabled = true;
    bar.appendChild(button);
    wrap.appendChild(bar);
    return wrap;
  }

  if (state.phase === "thin") {
    bar.dataset.verdict = "skim";
    button.innerHTML = '<span class="dot"></span><span class="label">Skim</span><span class="reason"></span>';
    button.querySelector(".reason").textContent = "Too short to be more than a skim.";
    button.disabled = true;
    bar.appendChild(button);
    wrap.appendChild(bar);
    return wrap;
  }

  if (state.phase === "repost") {
    bar.dataset.verdict = "skipped";
    button.innerHTML = '<span class="dot"></span><span class="label">Repost</span><span class="reason"></span>';
    button.querySelector(".reason").textContent = "Skipped. Someone else is doing the talking.";
    button.disabled = true;
    bar.appendChild(button);
    wrap.appendChild(bar);
    return wrap;
  }

  if (state.phase === "error") {
    bar.dataset.verdict = "error";
    button.innerHTML = '<span class="dot"></span><span class="label">Missed</span><span class="reason"></span>';
    button.querySelector(".reason").textContent = state.message;
    button.disabled = true;
    bar.appendChild(button);
    wrap.appendChild(bar);
    return wrap;
  }

  var reading = state.reading;
  bar.dataset.verdict = reading.bucket;
  button.innerHTML = '<span class="dot"></span><span class="label"></span><span class="reason"></span>';
  button.querySelector(".label").textContent = reading.label;
  button.querySelector(".reason").textContent = reading.reason;
  button.setAttribute("aria-expanded", "false");

  var panel = document.createElement("div");
  panel.className = "panel";
  panel.appendChild(details(reading));
  button.addEventListener("click", function () {
    var open = panel.classList.toggle("open");
    button.setAttribute("aria-expanded", open ? "true" : "false");
  });
  bar.appendChild(button);
  wrap.appendChild(bar);
  wrap.appendChild(panel);
  return wrap;
}

function details(reading) {
  var box = document.createElement("div");
  var meta = document.createElement("div");
  meta.className = "meta";
  var cached = reading.latencyMs === 0 ? " · cached" : "";
  meta.textContent = reading.model + " · " + reading.latencyMs + "ms" + cached;
  box.appendChild(meta);

  [
    ["Specific", reading.features.specific],
    ["New", reading.features.fresh],
    ["Funny", reading.features.funny],
    ["Begging", reading.features.bait],
    ["Selling", reading.features.promo],
    ["Empty words", reading.features.empty],
  ].forEach(function (row) {
    box.appendChild(meter(row[0], row[1]));
  });
  return box;
}

function meter(label, value) {
  var row = document.createElement("div");
  row.className = "row";
  var name = document.createElement("div");
  name.textContent = label;
  var track = document.createElement("div");
  track.className = "track";
  var fill = document.createElement("span");
  fill.className = "fill";
  fill.style.width = Math.round(value * 100) + "%";
  track.appendChild(fill);
  var num = document.createElement("div");
  num.className = "num";
  num.textContent = Math.round(value * 100) + "%";
  row.appendChild(name);
  row.appendChild(track);
  row.appendChild(num);
  return row;
}

function meterHost() {
  if (meterPromise) return meterPromise;
  meterPromise = cssText().then(function (css) {
    var host = document.getElementById("slopglass-meter");
    if (!host) {
      host = document.createElement("div");
      host.id = "slopglass-meter";
      host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483646;width:220px;";
      document.documentElement.appendChild(host);
      host.attachShadow({ mode: "open" });
    }
    if (host.shadowRoot && !host.shadowRoot.querySelector("style")) {
      var style = document.createElement("style");
      style.textContent = css;
      host.shadowRoot.appendChild(style);
    }
    return host;
  });
  return meterPromise;
}

function removeMeter() {
  var host = document.getElementById("slopglass-meter");
  if (host) host.remove();
  meterPromise = null;
}

function paintMeter() {
  meterHost().then(function (host) {
    if (!host || !host.shadowRoot) return;
    var counts = { read: 0, skim: 0, pass: 0, skipped: 0 };
    ledger.forEach(function (entry) {
      if (entry.kind === "skip") counts.skipped += 1;
      else if (entry.kind === "thin") counts.skim += 1;
      else if (entry.bucket === "read" || entry.bucket === "skim" || entry.bucket === "pass") counts[entry.bucket] += 1;
    });
    var judged = counts.read + counts.skim + counts.pass;
    var score = judged ? Math.round((100 * (counts.pass + 0.5 * counts.skim)) / judged) : null;
    var face = "Nothing scored yet";
    if (score !== null) {
      if (score <= 35) face = "Worth following";
      else if (score <= 50) face = "Actually decent";
      else if (score <= 70) face = "Mid";
      else if (score <= 82) face = "Slop";
      else face = "It's over";
    }
    var bandId = "mid";
    if (score === null) bandId = "";
    else if (score <= 35) bandId = "back";
    else if (score <= 50) bandId = "decent";
    else if (score <= 70) bandId = "mid";
    else if (score <= 82) bandId = "slop";
    else bandId = "over";
    var existing = host.shadowRoot.querySelector(".float");
    if (existing) existing.remove();
    var box = document.createElement("div");
    box.className = "float";
    if (bandId) box.dataset.band = bandId;
    var title = document.createElement("p");
    title.className = "float-kicker";
    title.textContent = activeMode === "profile" ? "This profile" : "This scroll";
    var number = document.createElement("p");
    number.className = "float-score";
    number.textContent = score === null ? "—" : String(score);
    var label = document.createElement("p");
    label.className = "float-face";
    label.textContent = face;
    var line = document.createElement("p");
    line.className = "float-counts";
    line.textContent =
      counts.read +
      " read · " +
      counts.skim +
      " skim · " +
      counts.pass +
      " pass" +
      (counts.skipped ? " · " + counts.skipped + " skipped" : "");
    box.appendChild(title);
    box.appendChild(number);
    box.appendChild(label);
    box.appendChild(line);
    host.shadowRoot.appendChild(box);
  });
}

var mo = new MutationObserver(function () {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(scan, 120);
});

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== "local") return;
  if (changes.enabled || changes.mode || changes.serverUrl) {
    activeMode = null;
    scan();
  }
});

window.addEventListener("popstate", function () {
  activeMode = null;
  scan();
});

var scrollQueued = false;
window.addEventListener(
  "scroll",
  function () {
    if (scrollQueued || activeMode === "profile") return;
    scrollQueued = true;
    requestAnimationFrame(function () {
      scrollQueued = false;
      extract.findPostRoots(document).forEach(function (root) {
        if (extract.isNested(root)) return;
        var rect = root.getBoundingClientRect();
        if (rect.bottom > -LOOKAHEAD && rect.top < window.innerHeight + LOOKAHEAD) judge(root);
      });
    });
  },
  { passive: true },
);

scan();
mo.observe(document.documentElement, { childList: true, subtree: true });
