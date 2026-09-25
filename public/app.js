// live job search feedback stream with smooth unspooling queue
(() => {
  const jobInput = document.getElementById("jobInput");
  const output = document.getElementById("output");
  const maxLines = 500;
  let activeJobId = "";
  let lastSeq = 0;
  let pollTimer = null;
  let eventSource = null;
  let isFetching = false;
  let unspoolTimer = null;
  const renderedKeys = new Set();
  const unspoolQueue = [];

  const params = new URLSearchParams(window.location.search);
  const initialJob = params.get("job") || params.get("id") || "";
  if (initialJob) {
    jobInput.value = initialJob;
    activeJobId = initialJob.trim().toLowerCase();
  }

  function queueItem(item) {
    if (!item || !item.username) return;
    const key = `${item.seq || ''}-${item.platform}-${item.username}-${item.status}`;
    if (renderedKeys.has(key)) return;
    renderedKeys.add(key);

    if (item.seq && item.seq > lastSeq) {
      lastSeq = item.seq;
    }

    if (renderedKeys.size > 1000) {
      const first = renderedKeys.values().next().value;
      renderedKeys.delete(first);
    }

    unspoolQueue.push(item);
  }

  // smooth unspooling ticker to prevent visual stutter and dom reflow thrashing
  function tickUnspool() {
    if (unspoolQueue.length === 0) return;

    const notice = document.getElementById("notice");
    if (notice) notice.remove();

    // dynamically adapt drain count: release 1 per tick under low queue, catch up when high
    const count = unspoolQueue.length > 25
      ? Math.min(8, Math.ceil(unspoolQueue.length / 5))
      : 1;

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count && unspoolQueue.length > 0; i++) {
      const item = unspoolQueue.shift();
      const line = document.createElement("div");
      const status = (item.status || "checked").toLowerCase();
      line.className = `line ${status}`;
      line.textContent = `checked "${item.username}" on ${item.platform} - ${item.status}`;
      fragment.appendChild(line);
    }

    output.appendChild(fragment);

    // prune excessive lines
    while (output.childElementCount > maxLines) {
      output.removeChild(output.firstElementChild);
    }

    // single scroll update per tick
    output.scrollTop = output.scrollHeight;
  }

  function renderNotice(msg) {
    output.innerHTML = "";
    renderedKeys.clear();
    unspoolQueue.length = 0;
    const notice = document.createElement("div");
    notice.className = "notice";
    notice.id = "notice";
    notice.textContent = msg || "Enter a Job ID above to view live search output.";
    output.appendChild(notice);
  }

  // fast background poller to guarantee no checks are lost across cold restarts
  async function fetchUpdates() {
    if (!activeJobId || isFetching) return;
    isFetching = true;

    try {
      const url = `/api/events?jobId=${encodeURIComponent(activeJobId)}&since=${lastSeq}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.lastSeq !== undefined) {
          lastSeq = Math.max(lastSeq, data.lastSeq);
        }

        const items = data.recent || [];
        for (const item of items) {
          queueItem(item);
        }
      }
    } catch {} finally {
      isFetching = false;
    }
  }

  function connectSse() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    if (!activeJobId) return;

    try {
      const streamUrl = `/api/events?stream=1&jobId=${encodeURIComponent(activeJobId)}&since=${lastSeq}`;
      eventSource = new EventSource(streamUrl);

      eventSource.onmessage = e => {
        try {
          const data = JSON.parse(e.data);
          if (data.lastSeq !== undefined) {
            lastSeq = Math.max(lastSeq, data.lastSeq);
          }
          const items = data.checks || [];
          for (const item of items) {
            queueItem(item);
          }
        } catch {}
      };

      eventSource.onerror = () => {
        // browser will auto-reconnect using the retry duration
      };
    } catch {}
  }

  function startLiveSync() {
    if (pollTimer) clearInterval(pollTimer);
    if (unspoolTimer) clearInterval(unspoolTimer);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    lastSeq = 0;
    renderedKeys.clear();
    unspoolQueue.length = 0;

    if (!activeJobId) {
      renderNotice("Enter a Job ID above to view live search output.");
      return;
    }

    renderNotice(`Connecting to live stream for job ${activeJobId}...`);

    // unspool ticker runs every 25ms (40 fps smooth output)
    unspoolTimer = setInterval(tickUnspool, 25);

    // primary: direct server-sent events stream
    connectSse();

    // secondary: fast background poll every 250ms to ensure zero missed checks
    fetchUpdates();
    pollTimer = setInterval(fetchUpdates, 250);
  }

  jobInput.addEventListener("input", e => {
    const val = e.target.value.trim().toLowerCase();
    if (val === activeJobId) return;

    activeJobId = val;
    startLiveSync();
  });

  if (activeJobId) {
    startLiveSync();
  }
})();
