let recorder = null;
let mediaStream = null;
let audioContext = null;
let shouldRun = false;
let activeTabId = null;
let backendUrl = "";
let loopToken = 0;
let busy = false;
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SUBLINGO_OFFSCREEN_START") startCapture(message);
  if (message.type === "SUBLINGO_OFFSCREEN_STOP") stopCapture();
});
async function startCapture(message) {
  await stopCapture(false);
  activeTabId = message.tabId;
  backendUrl = message.backendUrl;
  const token = ++loopToken;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: message.streamId } },
      video: false
    });
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(audioContext.destination);
    shouldRun = true;
    captureLoop(token);
  } catch (error) {
    shouldRun = false;
    chrome.runtime.sendMessage({ type: "SUBLINGO_AUDIO_ERROR", tabId: activeTabId, text: "无法捕获此网页音频：" + error.message }).catch(() => {});
    chrome.runtime.sendMessage({ type: "SUBLINGO_CAPTURE_STOPPED" }).catch(() => {});
  }
}
async function captureLoop(token) {
  while (shouldRun && token === loopToken) {
    try {
      const blob = await recordSegment();
      if (blob && blob.size > 1500) await sendSegment(blob, token);
    } catch (error) {
      chrome.runtime.sendMessage({ type: "SUBLINGO_AUDIO_ERROR", tabId: activeTabId, text: "音频片段处理失败：" + error.message }).catch(() => {});
    }
    await new Promise(resolve => setTimeout(resolve, 120));
  }
}
function recordSegment() {
  return new Promise((resolve, reject) => {
    if (!mediaStream || !shouldRun) return resolve(null);
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const chunks = [];
    try {
      recorder = new MediaRecorder(mediaStream, { mimeType });
      recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      recorder.onerror = event => reject(event.error || new Error("MediaRecorder 错误"));
      recorder.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: mimeType }) : null);
      recorder.start();
      setTimeout(() => { if (recorder?.state === "recording") recorder.stop(); }, 4200);
    } catch (error) { reject(error); }
  });
}
async function sendSegment(blob, token) {
  if (busy || !shouldRun || token !== loopToken) return;
  busy = true;
  try {
    const form = new FormData();
    form.append("audio", blob, "segment.webm");
    const response = await fetch(backendUrl + "/api/transcribe", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "后台返回错误 " + response.status);
    if (data.japanese && data.chinese && token === loopToken) {
      chrome.runtime.sendMessage({ type: "SUBLINGO_AUDIO_RESULT", tabId: activeTabId, japanese: data.japanese, chinese: data.chinese }).catch(() => {});
    }
  } catch (error) {
    chrome.runtime.sendMessage({ type: "SUBLINGO_AUDIO_ERROR", tabId: activeTabId, text: "识别/翻译失败：" + error.message }).catch(() => {});
  } finally { busy = false; }
}
async function stopCapture(notify = true) {
  shouldRun = false;
  loopToken++;
  try { if (recorder && recorder.state !== "inactive") recorder.stop(); } catch {}
  if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
  if (audioContext) { try { await audioContext.close(); } catch {} }
  mediaStream = null;
  audioContext = null;
  recorder = null;
  if (notify) chrome.runtime.sendMessage({ type: "SUBLINGO_CAPTURE_STOPPED" }).catch(() => {});
}