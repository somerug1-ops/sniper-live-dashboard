// live job search feedback stream
(() => {
  const jobInput = document.getElementById("jobInput");
  const output = document.getElementById("output");
  const maxLines = 500;
  let activeJobId = "";
  let lastSeq = 0;
  let pollTimer = null;
  let isFetching = false;
  const renderedKeys = new Set();

  const params = new URLSearchParams(window.location.search);
  const initialJob = params.get("job") || params.get("id") || "";
  if (initialJob) {
    jobInput.value = initialJob;
    activeJobId = initialJob.trim().toLowerCase();
  }

  function appendLine(item) {
    const key = `${item.seq || ''}-${item.platform}-${item.username}-${item.status}`;
    if (renderedKeys.has(key)) return;
    renderedKeys.add(key);
    if (renderedKeys.size > 800) {
      const first = renderedKeys.values().next().value;
      renderedKeys.delete(first);
    }

    const notice = document.getElementById("notice");
    if (notice) notice.remove();

    const line = document.createElement("div");
    const status = (item.status || "checked").toLowerCase();
    line.className = `line ${status}`;

    // exact requested line output
    line.textContent = `checked "${item.username}" on ${item.platform} - ${item.status}`;
    output.appendChild(line);

    if (output.childElementCount > maxLines) {
      output.removeChild(output.firstElementChild);
    }

    output.scrollTop = output.scrollHeight;
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
        if (items.length > 0) {
          for (const item of items) {
            appendLine(item);
          }
        }
      }
    } catch {} finally {
      isFetching = false;
    }
  }

  function startLiveSync() {
    if (pollTimer) clearInterval(pollTimer);
    lastSeq = 0;
    renderedKeys.clear();

    if (!activeJobId) {
      renderNotice("Enter a Job ID above to view live search output.");
      return;
    }

    renderNotice(`Connecting to live stream for job ${activeJobId}...`);

    // fetch immediately then repeat every 350ms
    fetchUpdates();
    pollTimer = setInterval(fetchUpdates, 350);
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
