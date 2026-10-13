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
function fetchWithTimeout(url, options = {}, timeoutMs = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
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
    report("音频捕获成功，正在检查后台服务连接……");
    // Render free services may need time to wake up after inactivity.
    try {
      const health = await fetchWithTimeout(backendUrl + "/health", { method: "GET", cache: "no-store" }, 65000);
      if (!health.ok) throw new Error("后台健康检查返回 HTTP " + health.status);
      const info = await health.json();
      if (!info.ok) throw new Error("后台健康检查未通过");
      report("后台连接成功，正在聆听日语……");
    } catch (error) {
      const reason = error.name === "AbortError" ? "连接后台超时" : (error.message || String(error));
      report("后台连接检查失败：" + reason + "。请确认后台地址正确，且 Render 服务已启动。");
      // Continue trying audio requests; the diagnostic below will show if the API is unreachable.
    }
    if (shouldRun && token === loopToken) captureLoop(token);
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
    let response;
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        response = await fetchWithTimeout(backendUrl + "/api/transcribe", { method: "POST", body: form }, 90000);
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 2 && shouldRun && token === loopToken) {
          report("后台连接中断，正在重试（" + attempt + "/1）……");
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    }
    if (!response) {
      if (lastError?.name === "AbortError") throw new Error("连接后台超时。请先在浏览器打开后台 /health 检查服务是否正常。");
      throw new Error("无法连接后台（Failed to fetch）。请检查后台地址、Render 服务状态和网络连接。");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "后台返回错误 HTTP " + response.status);
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
