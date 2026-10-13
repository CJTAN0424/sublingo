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
chrome.storage.local.get({ backendUrl: "", translating: false, lastStatus: "" }, ({ backendUrl, translating, lastStatus }) => {
  backendInput.value = backendUrl;
  startButton.disabled = translating;
  stopButton.disabled = !translating;
  status.textContent = lastStatus || (translating ? "实时翻译正在运行" : "填写后台地址，然后开始实时翻译");
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.lastStatus?.newValue) status.textContent = changes.lastStatus.newValue;
  if (area === "local" && changes.translating) {
    const running = changes.translating.newValue;
    startButton.disabled = running;
    stopButton.disabled = !running;
  }
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
  await chrome.storage.local.set({ backendUrl, lastStatus: "正在启动音频捕获……" });
  startButton.disabled = true;
  status.textContent = "正在启动音频捕获……";
  try {
    const tab = await activeTab();
    if (!tab?.id) throw new Error("找不到当前视频标签页");
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    const response = await chrome.runtime.sendMessage({ type: "SUBLINGO_START", streamId, tabId: tab.id });
    if (!response?.ok) throw new Error(response?.error || "无法启动");
    stopButton.disabled = false;
    status.textContent = "已启动。请让视频继续播放，稍后查看此处的诊断信息。";
  } catch (error) {
    startButton.disabled = false;
    status.textContent = error.message || "启动失败，请重试";
    await chrome.storage.local.set({ translating: false, lastStatus: status.textContent });
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
