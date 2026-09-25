// live job search feedback stream with smooth unspooling queue
(() => {
  const jobInput = document.getElementById("jobInput");
  const output = document.getElementById("output");
  const maxLines = 500;
  let activeJobId = "";
  let pollTimer = null;
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
    const key = item.id || `${item.platform}-${item.username}-${item.status}`;
    if (renderedKeys.has(key)) return;
    renderedKeys.add(key);

    if (renderedKeys.size > 2000) {
      const first = renderedKeys.values().next().value;
      renderedKeys.delete(first);
    }

    unspoolQueue.push(item);
  }

  // smooth unspooling ticker to maintain continuous live output without bursts
  function tickUnspool() {
    if (unspoolQueue.length === 0) return;

    const notice = document.getElementById("notice");
    if (notice) notice.remove();

    // if queue is small, release 1 per tick; if queue grows, smoothly pace it out
    const count = unspoolQueue.length > 20
      ? Math.min(4, Math.ceil(unspoolQueue.length / 5))
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

  // high-frequency live poller with cache-busting timestamp
  async function fetchUpdates() {
    if (!activeJobId || isFetching) return;
    isFetching = true;

    try {
      const url = `/api/events?jobId=${encodeURIComponent(activeJobId)}&_t=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const items = data.recent || [];
        for (const item of items) {
          queueItem(item);
        }
      }
    } catch {} finally {
      isFetching = false;
    }
  }

  function startLiveSync() {
    if (pollTimer) clearInterval(pollTimer);
    if (unspoolTimer) clearInterval(unspoolTimer);

    renderedKeys.clear();
    unspoolQueue.length = 0;

    if (!activeJobId) {
      renderNotice("Enter a Job ID above to view live search output.");
      return;
    }

    renderNotice(`Connecting to live stream for job ${activeJobId}...`);

    // unspool ticker runs every 30ms for continuous smooth output
    unspoolTimer = setInterval(tickUnspool, 30);

    // poll every 180ms with cache busting
    fetchUpdates();
    pollTimer = setInterval(fetchUpdates, 180);
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
