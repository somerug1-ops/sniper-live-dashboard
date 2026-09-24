// live stream client controller
(() => {
  let isPaused = false;
  let audioEnabled = false;
  let audioCtx = null;
  let currentPlatformFilter = "all";
  let currentStatusFilter = "all";
  let streamCount = 0;
  let hitsCount = 0;
  const maxStreamRows = 120;

  // dom elements
  const statusIndicator = document.getElementById("statusIndicator");
  const liveTag = document.getElementById("liveTag");
  const rateValue = document.getElementById("rateValue");
  const scannedValue = document.getElementById("scannedValue");
  const availableValue = document.getElementById("availableValue");
  const hitCount = document.getElementById("hitCount");
  const streamStatus = document.getElementById("streamStatus");
  const availableList = document.getElementById("availableList");
  const streamList = document.getElementById("streamList");
  const emptyHits = document.getElementById("emptyHits");
  const platformFilter = document.getElementById("platformFilter");
  const statusFilter = document.getElementById("statusFilter");
  const soundToggleBtn = document.getElementById("soundToggleBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const clearBtn = document.getElementById("clearBtn");

  // web audio synth for hit alerts
  function playHitChime() {
    if (!audioEnabled) return;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // a5
      osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.12); // e6
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch {}
  }

  // format timestamp
  function formatTime(ts) {
    const d = ts ? new Date(ts) : new Date();
    return d.toTimeString().split(" ")[0];
  }

  // update top metrics
  function updateStats(stats) {
    if (!stats) return;
    if (stats.ratePerSec !== undefined) {
      rateValue.textContent = `${stats.ratePerSec}/s`;
    }
    if (stats.totalScanned !== undefined) {
      scannedValue.textContent = stats.totalScanned.toLocaleString();
    }
    if (stats.totalAvailable !== undefined) {
      availableValue.textContent = stats.totalAvailable.toLocaleString();
      hitCount.textContent = `${stats.totalAvailable} found`;
    }
  }

  // render available hit row
  function addAvailableHit(hit) {
    if (!hit || !hit.username) return;
    if (emptyHits && emptyHits.parentElement) {
      emptyHits.remove();
    }

    // check if already rendered
    const existing = document.getElementById(`hit-${hit.platform}-${hit.username}`);
    if (existing) return;

    hitsCount++;
    const row = document.createElement("div");
    row.className = "hit-row";
    row.id = `hit-${hit.platform}-${hit.username}`;

    const left = document.createElement("div");
    left.className = "hit-left";

    const badge = document.createElement("span");
    badge.className = `platform-badge ${hit.platform.toLowerCase()}`;
    badge.textContent = hit.platform;

    const name = document.createElement("span");
    name.className = "hit-name";
    name.textContent = hit.username;

    left.appendChild(badge);
    left.appendChild(name);

    const actions = document.createElement("div");
    actions.className = "hit-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(hit.username).then(() => {
        copyBtn.textContent = "Copied!";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 1200);
      });
    });

    actions.appendChild(copyBtn);
    row.appendChild(left);
    row.appendChild(actions);

    availableList.prepend(row);
    playHitChime();
  }

  // append check row to stream
  function addStreamRow(item) {
    if (isPaused) return;

    // filters
    if (currentPlatformFilter !== "all" && item.platform.toLowerCase() !== currentPlatformFilter) {
      return;
    }
    if (currentStatusFilter === "available" && item.status !== "available") {
      return;
    }

    const row = document.createElement("div");
    row.className = "stream-row";

    const time = document.createElement("span");
    time.className = "stream-time";
    time.textContent = formatTime(item.timestamp);

    const platform = document.createElement("span");
    platform.className = "stream-platform";
    platform.textContent = `[${item.platform}]`;

    const name = document.createElement("span");
    name.className = "stream-name";
    name.textContent = item.username;

    const status = document.createElement("span");
    status.className = `stream-status ${item.status}`;
    status.textContent = item.status;

    row.appendChild(time);
    row.appendChild(platform);
    row.appendChild(name);
    row.appendChild(status);

    streamList.appendChild(row);
    streamCount++;

    // cap rows
    if (streamList.childElementCount > maxStreamRows) {
      streamList.removeChild(streamList.firstElementChild);
    }

    streamList.scrollTop = streamList.scrollHeight;
  }

  // process batch
  function handleBatch(data) {
    if (!data) return;

    if (data.stats) {
      updateStats(data.stats);
    }

    if (Array.isArray(data.hits)) {
      for (const hit of data.hits) {
        addAvailableHit(hit);
      }
    }

    if (Array.isArray(data.checks)) {
      for (const check of data.checks) {
        if (check.status === "available") {
          addAvailableHit(check);
        }
        addStreamRow(check);
      }
    }

    if (Array.isArray(data.recent)) {
      for (const check of data.recent) {
        addStreamRow(check);
      }
    }
  }

  // sse connection with fallback
  function startStream() {
    let evtSource = null;

    try {
      evtSource = new EventSource("/api/events?stream=1");

      evtSource.onopen = () => {
        statusIndicator.classList.add("active");
        liveTag.classList.add("active");
        liveTag.textContent = "CONNECTED";
        streamStatus.textContent = "Streaming live";
      };

      evtSource.onmessage = evt => {
        try {
          const data = JSON.parse(evt.data);
          handleBatch(data);
        } catch {}
      };

      evtSource.onerror = () => {
        statusIndicator.classList.remove("active");
        liveTag.classList.remove("active");
        liveTag.textContent = "POLLING";
        streamStatus.textContent = "Reconnecting";
        if (evtSource) {
          evtSource.close();
          evtSource = null;
        }
        // fallback to polling
        startPolling();
      };
    } catch {
      startPolling();
    }
  }

  // polling fallback
  let pollInterval = null;
  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(async () => {
      try {
        const res = await fetch("/api/events");
        if (res.ok) {
          const data = await res.json();
          statusIndicator.classList.add("active");
          liveTag.classList.add("active");
          liveTag.textContent = "POLLING";
          handleBatch(data);
        }
      } catch {}
    }, 600);
  }

  // event listeners
  platformFilter.addEventListener("change", e => {
    currentPlatformFilter = e.target.value.toLowerCase();
  });

  statusFilter.addEventListener("change", e => {
    currentStatusFilter = e.target.value;
  });

  soundToggleBtn.addEventListener("click", () => {
    audioEnabled = !audioEnabled;
    soundToggleBtn.textContent = audioEnabled ? "Audio: On" : "Audio: Off";
    soundToggleBtn.classList.toggle("active", audioEnabled);
    if (audioEnabled) {
      playHitChime();
    }
  });

  pauseBtn.addEventListener("click", () => {
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? "Resume Stream" : "Pause Stream";
    pauseBtn.classList.toggle("active", isPaused);
    streamStatus.textContent = isPaused ? "Stream paused" : "Streaming live";
  });

  clearBtn.addEventListener("click", () => {
    streamList.innerHTML = "";
    streamCount = 0;
  });

  // start connection
  startStream();
})();
