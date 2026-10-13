const toggleButton = document.getElementById("toggle");
const status = document.getElementById("status");
async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}
async function send(type, extra = {}) {
  const tab = await activeTab();
  if (!tab?.id) { status.textContent = "找不到当前网页"; return; }
  try {
    await chrome.tabs.sendMessage(tab.id, { type, ...extra });
    return true;
  } catch {
    status.textContent = "此页面暂时无法运行字幕，请刷新网页后重试。";
    return false;
  }
}
chrome.storage.local.get({ enabled: false }, ({ enabled }) => {
  toggleButton.textContent = enabled ? "关闭字幕显示" : "开启字幕显示";
});
toggleButton.addEventListener("click", async () => {
  const { enabled = false } = await chrome.storage.local.get({ enabled: false });
  const next = !enabled;
  await chrome.storage.local.set({ enabled: next });
  if (await send("SUBLINGO_TOGGLE", { enabled: next })) {
    toggleButton.textContent = next ? "关闭字幕显示" : "开启字幕显示";
    status.textContent = next ? "字幕显示已开启" : "字幕显示已关闭";
  }
});
document.getElementById("demo").addEventListener("click", async () => {
  if (await send("SUBLINGO_DEMO")) status.textContent = "已显示示例字幕";
});
document.getElementById("clear").addEventListener("click", async () => {
  if (await send("SUBLINGO_CLEAR")) status.textContent = "字幕已清除";
});
