// live job search feedback stream
(() => {
  const jobInput = document.getElementById("jobInput");
  const output = document.getElementById("output");
  const maxLines = 500;
  let activeJobId = "";
  let pollTimer = null;
  let eventSource = null;
  let isFetching = false;
  const renderedKeys = new Set();

  const params = new URLSearchParams(window.location.search);
  const pathMatch = window.location.pathname.match(/^\/jobid-([a-zA-Z0-9_-]+)/i) ||
                    window.location.pathname.match(/^\/job-([a-zA-Z0-9_-]+)/i);
  const pathJob = pathMatch ? pathMatch[1] : "";
  const initialJob = params.get("job") || params.get("id") || pathJob || "";
  if (initialJob) {
    jobInput.value = initialJob;
    activeJobId = initialJob.trim().toLowerCase();
    if (pathJob && window.history && typeof window.history.replaceState === "function") {
      window.history.replaceState({}, "", `/?job=${encodeURIComponent(activeJobId)}`);
    }
  }

  // render incoming checks immediately with zero artificial delay
  function renderItems(items) {
    if (!items || items.length === 0) return;

    const fragment = document.createDocumentFragment();
    let added = 0;

    for (const item of items) {
      if (!item || !item.username) continue;
      const key = item.id || `${item.platform}-${item.username}-${item.status}`;
      if (renderedKeys.has(key)) continue;
      renderedKeys.add(key);

      if (renderedKeys.size > 2000) {
        const first = renderedKeys.values().next().value;
        renderedKeys.delete(first);
      }

      const line = document.createElement("div");
      const status = (item.status || "checked").toLowerCase();
      line.className = `line ${status}`;
      line.textContent = `checked "${item.username}" on ${item.platform} - ${item.status}`;
      fragment.appendChild(line);
      added++;
    }

    if (added > 0) {
      const notice = document.getElementById("notice");
      if (notice) notice.remove();

      output.appendChild(fragment);

      while (output.childElementCount > maxLines) {
        output.removeChild(output.firstElementChild);
      }

      output.scrollTop = output.scrollHeight;
    }
  }

  function renderNotice(msg) {
    output.innerHTML = "";
    renderedKeys.clear();
    const notice = document.createElement("div");
    notice.className = "notice";
    notice.id = "notice";
    notice.textContent = msg || "Enter a Job ID above to view live search output.";
    output.appendChild(notice);
  }

  // fast fallback poll every 150ms to ensure zero missed events
  async function fetchUpdates() {
    if (!activeJobId || isFetching) return;
    isFetching = true;

    try {
      const url = `/api/events?jobId=${encodeURIComponent(activeJobId)}&_t=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        renderItems(data.recent || []);
      }
    } catch {} finally {
      isFetching = false;
    }
  }

  // primary direct sse push for true sub-20ms real-time delivery
  function connectSse() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    if (!activeJobId) return;

    try {
      const streamUrl = `/api/events?stream=1&jobId=${encodeURIComponent(activeJobId)}`;
      eventSource = new EventSource(streamUrl);

      eventSource.onmessage = e => {
        try {
          const data = JSON.parse(e.data);
          renderItems(data.checks || []);
        } catch {}
      };

      eventSource.onerror = () => {
        // browser reconnects automatically using retry header
      };
    } catch {}
  }

  function startLiveSync() {
    if (pollTimer) clearInterval(pollTimer);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    renderedKeys.clear();

    if (!activeJobId) {
      renderNotice("Enter a Job ID above to view live search output.");
      return;
    }

    renderNotice(`Connecting to live stream for job ${activeJobId}...`);

    // connect direct instant sse push
    connectSse();

    // parallel fast poll fallback every 150ms
    fetchUpdates();
    pollTimer = setInterval(fetchUpdates, 150);
  }

  jobInput.addEventListener("input", e => {
    const val = e.target.value.trim().toLowerCase();
    if (val === activeJobId) return;

    activeJobId = val;
    if (window.history && typeof window.history.replaceState === "function") {
      window.history.replaceState({}, "", val ? `/?job=${encodeURIComponent(val)}` : "/");
    }
    startLiveSync();
  });

  if (activeJobId) {
    startLiveSync();
  }
})();
