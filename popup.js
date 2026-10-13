const status = document.getElementById("status");
const startButton = document.getElementById("start");
const stopButton = document.getElementById("stop");
const backendInput = document.getElementById("backendUrl");
async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}
async function sendToTab(type, extra = {}) {
  const tab = await activeTab();
  if (!tab?.id) { status.textContent = "找不到当前网页"; return false; }
  try { await chrome.tabs.sendMessage(tab.id, { type, ...extra }); return true; }
  catch { status.textContent = "此页面暂时无法运行字幕。请打开普通网页并刷新后重试。"; return false; }
}
chrome.storage.local.get({ backendUrl: "", translating: false }, ({ backendUrl, translating }) => {
  backendInput.value = backendUrl;
  startButton.disabled = translating;
  stopButton.disabled = !translating;
  status.textContent = translating ? "实时翻译正在运行" : "填写后台地址，然后开始实时翻译";
});
backendInput.addEventListener("change", async () => {
  const value = backendInput.value.trim().replace(/\/$/, "");
  await chrome.storage.local.set({ backendUrl: value });
});
startButton.addEventListener("click", async () => {
  const backendUrl = backendInput.value.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(backendUrl)) {
    status.textContent = "请先填写有效的后台地址，例如 https://你的服务.onrender.com";
    return;
  }
  await chrome.storage.local.set({ backendUrl });
  startButton.disabled = true;
  status.textContent = "正在启动音频捕获……";
  try {
    const tab = await activeTab();
    if (!tab?.id) throw new Error("找不到当前视频标签页");
    // Obtain the stream ID directly inside the user's popup click handler.
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    const response = await chrome.runtime.sendMessage({ type: "SUBLINGO_START", streamId, tabId: tab.id });
    if (!response?.ok) throw new Error(response?.error || "无法启动");
    startButton.disabled = true;
    stopButton.disabled = false;
    status.textContent = "已启动。字幕通常会延迟数秒显示。";
  } catch (error) {
    startButton.disabled = false;
    status.textContent = error.message || "启动失败，请重试";
  }
});
stopButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "SUBLINGO_STOP" });
  startButton.disabled = false;
  stopButton.disabled = true;
  status.textContent = "实时翻译已停止";
});
document.getElementById("toggle").addEventListener("click", async () => {
  const { enabled = false } = await chrome.storage.local.get({ enabled: false });
  const next = !enabled;
  await chrome.storage.local.set({ enabled: next });
  if (await sendToTab("SUBLINGO_TOGGLE", { enabled: next })) status.textContent = next ? "字幕显示已开启" : "字幕显示已关闭";
});
document.getElementById("demo").addEventListener("click", async () => {
  if (await sendToTab("SUBLINGO_DEMO")) status.textContent = "已显示示例字幕";
});
document.getElementById("clear").addEventListener("click", async () => {
  if (await sendToTab("SUBLINGO_CLEAR")) status.textContent = "字幕已清除";
});