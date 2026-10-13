let recorder = null;
let mediaStream = null;
let audioContext = null;
let shouldRun = false;
let activeTabId = null;
let backendUrl = "";
let loopToken = 0;
let busy = false;

function report(text) {
  chrome.runtime.sendMessage({ type: "SUBLINGO_PROGRESS", tabId: activeTabId, text }).catch(() => {});
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SUBLINGO_OFFSCREEN_START") startCapture(message);
  if (message.type === "SUBLINGO_OFFSCREEN_STOP") stopCapture();
});

async function startCapture(message) {
  await stopCapture(false);
  activeTabId = message.tabId;
  backendUrl = (message.backendUrl || "").replace(/\/$/, "");
  const token = ++loopToken;
  report("正在连接视频音频……");
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: message.streamId } },
      video: false
    });
    if (!mediaStream.getAudioTracks().length) throw new Error("捕获成功但没有音轨。");
    audioContext = new AudioContext();
    await audioContext.resume();
    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(audioContext.destination);
    shouldRun = true;
    report("音频捕获成功，正在聆听日语……");
    captureLoop(token);
  } catch (error) {
    shouldRun = false;
    report("音频捕获失败：" + (error.message || String(error)));
    chrome.runtime.sendMessage({ type: "SUBLINGO_AUDIO_ERROR", tabId: activeTabId, text: "无法捕获此网页音频：" + (error.message || String(error)) }).catch(() => {});
    chrome.runtime.sendMessage({ type: "SUBLINGO_CAPTURE_STOPPED" }).catch(() => {});
  }
}

async function captureLoop(token) {
  while (shouldRun && token === loopToken) {
    try {
      const blob = await recordSegment();
      if (!shouldRun || token !== loopToken) break;
      if (blob && blob.size > 1500) {
        report("已录到音频（" + Math.round(blob.size / 1024) + " KB），正在识别和翻译……");
        await sendSegment(blob, token);
      } else {
        report("暂时没有录到足够的声音。请确认视频正在播放且有声音。");
      }
    } catch (error) {
      report("音频片段处理失败：" + (error.message || String(error)));
    }
    await new Promise(resolve => setTimeout(resolve, 120));
  }
}

function recordSegment() {
  return new Promise((resolve, reject) => {
    if (!mediaStream || !shouldRun) return resolve(null);
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const chunks = [];
    let localRecorder;
    try {
      localRecorder = new MediaRecorder(mediaStream, { mimeType });
      recorder = localRecorder;
      localRecorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      localRecorder.onerror = event => reject(event.error || new Error("MediaRecorder 错误"));
      localRecorder.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: mimeType }) : null);
      localRecorder.start();
      setTimeout(() => { if (localRecorder.state === "recording") localRecorder.stop(); }, 4200);
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
      report("翻译成功，字幕已显示。");
      chrome.runtime.sendMessage({ type: "SUBLINGO_AUDIO_RESULT", tabId: activeTabId, japanese: data.japanese, chinese: data.chinese }).catch(() => {});
    } else {
      report("已发送音频，但没有识别到清晰的日语语音。请让视频继续播放并确认声音正常。");
    }
  } catch (error) {
    report("识别/翻译失败：" + (error.message || String(error)));
    chrome.runtime.sendMessage({ type: "SUBLINGO_AUDIO_ERROR", tabId: activeTabId, text: "识别/翻译失败：" + (error.message || String(error)) }).catch(() => {});
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
  if (notify) {
    report("实时翻译已停止。");
    chrome.runtime.sendMessage({ type: "SUBLINGO_CAPTURE_STOPPED" }).catch(() => {});
  }
}
