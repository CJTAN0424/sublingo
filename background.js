let activeTabId = null;
let starting = false;
async function ensureOffscreen() {
  const url = chrome.runtime.getURL("offscreen.html");
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
  if (!contexts.length) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA", "BLOBS"],
      justification: "Capture audio from the user-selected video tab and process short audio segments for subtitles."
    });
  }
}
async function sendStatus(tabId, text) {
  try { await chrome.tabs.sendMessage(tabId, { type: "SUBLINGO_STATUS", text }); } catch {}
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SUBLINGO_START") {
    (async () => {
      if (starting) { sendResponse({ ok: false, error: "正在启动，请稍候。" }); return; }
      starting = true;
      try {
        const tabId = message.tabId;
        if (!tabId) throw new Error("找不到当前视频标签页。");
        const tab = await chrome.tabs.get(tabId);
        if (!tab.url || !/^https?:/.test(tab.url)) throw new Error("请先打开普通的视频网页。Chrome 内部页面无法捕获音频。");
        const { backendUrl } = await chrome.storage.local.get({ backendUrl: "" });
        if (!backendUrl) throw new Error("请先填写后台服务地址。");
        const streamId = message.streamId;
        if (!streamId) throw new Error("无法获取标签页音频，请重新点击开始。");
        const health = await fetch(backendUrl + "/health");
        if (!health.ok) throw new Error("后台服务暂时无法访问。请检查服务地址或部署状态。");
        const healthData = await health.json();
        if (!healthData.speechRecognitionConfigured) throw new Error("后台尚未设置 OPENAI_API_KEY。请先在 Render 配置 API Key。");
        await ensureOffscreen();
        activeTabId = tabId;
        await chrome.storage.local.set({ translating: true });
        await chrome.runtime.sendMessage({ type: "SUBLINGO_OFFSCREEN_START", streamId, tabId, backendUrl }).catch(() => {});
        await chrome.tabs.sendMessage(tabId, { type: "SUBLINGO_TOGGLE", enabled: true }).catch(() => {});
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error.message || "启动失败" });
      } finally { starting = false; }
    })();
    return true;
  }
  if (message.type === "SUBLINGO_STOP") {
    chrome.runtime.sendMessage({ type: "SUBLINGO_OFFSCREEN_STOP" }).catch(() => {});
    chrome.storage.local.set({ translating: false });
    if (activeTabId) sendStatus(activeTabId, "");
    activeTabId = null;
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === "SUBLINGO_AUDIO_RESULT" && message.tabId) {
    chrome.tabs.sendMessage(message.tabId, {
      type: "SUBLINGO_SUBTITLE",
      japanese: message.japanese,
      chinese: message.chinese
    }).catch(() => {});
  }
  if (message.type === "SUBLINGO_AUDIO_ERROR" && message.tabId) sendStatus(message.tabId, message.text || "音频识别暂时失败");
  if (message.type === "SUBLINGO_CAPTURE_STOPPED") {
    activeTabId = null;
    chrome.storage.local.set({ translating: false });
  }
});