(() => {
  if (window.__sublingoLoaded) return;
  window.__sublingoLoaded = true;
  let overlay;
  function ensureOverlay() {
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement("div");
    overlay.id = "sublingo-overlay";
    overlay.innerHTML = '<div class="sublingo-ja"></div><div class="sublingo-zh"></div>';
    document.documentElement.appendChild(overlay);
    return overlay;
  }
  function show(enabled) {
    const el = ensureOverlay();
    el.style.display = enabled ? "block" : "none";
  }
  function setDemo() {
    const el = ensureOverlay();
    el.querySelector(".sublingo-ja").textContent = "こんにちは。SubLingoへようこそ！";
    el.querySelector(".sublingo-zh").textContent = "你好，欢迎使用 SubLingo！";
    el.style.display = "block";
  }
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SUBLINGO_TOGGLE") show(message.enabled);
    if (message.type === "SUBLINGO_DEMO") setDemo();
    if (message.type === "SUBLINGO_CLEAR") {
      const el = ensureOverlay();
      el.querySelector(".sublingo-ja").textContent = "";
      el.querySelector(".sublingo-zh").textContent = "";
      el.style.display = "none";
    }
  });
  chrome.storage.local.get({ enabled: false }, ({ enabled }) => show(enabled));
})();
