var DEFAULTS = {
  enabled: true,
  serverUrl: "http://127.0.0.1:38471",
  mode: "auto",
};

var cache = new Map();
var active = 0;
var queue = [];
var MAX = 3;

chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.local.get(DEFAULTS, function (current) {
    chrome.storage.local.set({
      enabled: current.enabled !== false,
      serverUrl: current.serverUrl || DEFAULTS.serverUrl,
      mode: current.mode || DEFAULTS.mode,
    });
  });
});

chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
  if (!message || message.type !== "classify") return;
  classify(message.text)
    .then(function (payload) {
      sendResponse(payload);
    })
    .catch(function (error) {
      sendResponse({ ok: false, error: error && error.message ? error.message : "Slopglass couldn't classify that post." });
    });
  return true;
});

function classify(text) {
  return settings().then(function (config) {
    var key = config.serverUrl + "\n" + text;
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    return enqueue(function () {
      if (cache.has(key)) return Promise.resolve(cache.get(key));
      return callServer(config.serverUrl, text).then(function (payload) {
        if (payload && payload.ok) cache.set(key, payload);
        return payload;
      });
    });
  });
}

function settings() {
  return chrome.storage.local.get(DEFAULTS);
}

function enqueue(task) {
  return new Promise(function (resolve, reject) {
    var run = function () {
      active += 1;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(function () {
          active -= 1;
          var next = queue.shift();
          if (next) next();
        });
    };
    if (active < MAX) run();
    else queue.push(run);
  });
}

function callServer(serverUrl, text) {
  var base = String(serverUrl || DEFAULTS.serverUrl).replace(/\/$/, "");
  var controller = new AbortController();
  var timer = setTimeout(function () {
    controller.abort();
  }, 25000);
  return fetch(base + "/api/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text }),
    signal: controller.signal,
  })
    .then(function (response) {
      return response.json().catch(function () {
        return { ok: false, error: "Slopglass returned something that wasn't JSON (" + response.status + ")." };
      });
    })
    .catch(function () {
      return {
        ok: false,
        error: "Can't reach the Slopglass server at " + base + ". Start it, or set the URL in the popup.",
      };
    })
    .finally(function () {
      clearTimeout(timer);
    });
}
