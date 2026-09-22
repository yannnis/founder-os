var enabled = document.getElementById("enabled");
var server = document.getElementById("server");
var status = document.getElementById("status");
var save = document.getElementById("save");

chrome.storage.local.get(
  { enabled: true, serverUrl: "http://127.0.0.1:38471", mode: "auto" },
  function (config) {
    enabled.checked = config.enabled !== false;
    server.value = config.serverUrl;
    var picked = document.querySelector('input[name="mode"][value="' + config.mode + '"]');
    if (picked) picked.checked = true;
    else document.querySelector('input[value="auto"]').checked = true;
  },
);

enabled.addEventListener("change", function () {
  chrome.storage.local.set({ enabled: enabled.checked });
});

document.querySelectorAll('input[name="mode"]').forEach(function (input) {
  input.addEventListener("change", function () {
    if (input.checked) chrome.storage.local.set({ mode: input.value });
  });
});

save.addEventListener("click", async function () {
  var url;
  try {
    url = new URL(server.value.trim());
  } catch {
    setStatus("That server URL isn't valid.", "bad");
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    setStatus("Use an http or https URL.", "bad");
    return;
  }
  var local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (!local) {
    var granted = await chrome.permissions.request({ origins: [url.origin + "/*"] });
    if (!granted) {
      setStatus("Chrome needs permission to call " + url.origin + ".", "bad");
      return;
    }
  }
  await chrome.storage.local.set({ serverUrl: url.origin });
  server.value = url.origin;
  setStatus("Checking…", "");
  try {
    var response = await fetch(url.origin + "/api/health");
    var body = await response.json();
    if (body && body.ok) setStatus("Connected. Model " + body.model + ".", "good");
    else setStatus("Server is up, but TYPESAFE_API_KEY is missing.", "bad");
  } catch {
    setStatus("Saved, but nothing answered at " + url.origin + ".", "bad");
  }
});

function setStatus(message, kind) {
  status.textContent = message;
  status.className = kind || "";
}
