(function () {
  "use strict";

  const config = window.APP_CONFIG || {};
  const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
  const db = isConfigured ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
  const storageKey = "karaoke-queue-v1";
  const requestsOpenKey = "karaoke-requests-open";
  const adminSessionKey = "karaoke-admin-password";
  const channel = "BroadcastChannel" in window ? new BroadcastChannel("karaoke-queue") : null;
  let songs = [];
  let adminPassword = sessionStorage.getItem(adminSessionKey) || "";
  let isAdmin = Boolean(adminPassword);
  let requestsOpen = localStorage.getItem(requestsOpenKey) !== "closed";
  let toastTimer;
  let resizeTimer;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const els = {
    queueView: $("#queueView"), requestView: $("#requestView"), queueList: $("#queueList"),
    emptyState: $("#emptyState"), queueCount: $("#queueCount"), nowSong: $("#nowSong"),
    nowSinger: $("#nowSinger"), historyList: $("#historyList"), historyEmpty: $("#historyEmpty"),
    songForm: $("#songForm"), successPanel: $("#successPanel"), closedPanel: $("#closedPanel"),
    successMessage: $("#successMessage"), adminDialog: $("#adminDialog"), loginPanel: $("#loginPanel"),
    adminPanel: $("#adminPanel"), adminQueue: $("#adminQueue"), dialogError: $("#dialogError"),
    requestsToggle: $("#requestsToggle"), requestsState: $("#requestsState"),
    requestShortcut: $("#requestShortcut"), heroQr: $(".hero-qr"),
    requestAccessLabel: $("#requestAccessLabel"), toast: $("#toast")
  };

  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;"
  })[char]);

  function requestUrl() {
    const base = config.siteUrl || `${location.origin}${location.pathname}`;
    return `${base.replace(/\/$/, "")}/?view=request`;
  }

  function setView(view, updateHistory = true) {
    const request = view === "request";
    els.queueView.hidden = request;
    els.requestView.hidden = !request;
    if (updateHistory) {
      const url = new URL(location.href);
      request ? url.searchParams.set("view", "request") : url.searchParams.delete("view");
      history.pushState({}, "", url);
    }
    if (!request) render();
    renderRequestAvailability();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(storageKey)) || []; }
    catch { return []; }
  }

  function saveLocal() {
    localStorage.setItem(storageKey, JSON.stringify(songs));
    channel?.postMessage("refresh");
  }

  async function fetchSongs() {
    if (!db) {
      songs = loadLocal();
      render();
      return;
    }
    const { data, error } = await db.from("song_requests").select("*").order("created_at", { ascending: true });
    if (error) return showToast(`加载失败：${error.message}`);
    songs = data || [];
    render();
  }

  async function fetchRequestAvailability() {
    if (db) {
      const { data, error } = await db.from("event_settings").select("requests_open").eq("id", true).single();
      if (error) return showToast(`点歌通道状态加载失败：${error.message}`);
      requestsOpen = data.requests_open;
    } else {
      requestsOpen = localStorage.getItem(requestsOpenKey) !== "closed";
    }
    renderRequestAvailability();
  }

  function render() {
    const current = songs.find((song) => song.status === "singing");
    const waiting = songs.filter((song) => song.status === "waiting");
    const finished = songs.filter((song) => song.status === "finished").slice(-30).reverse();

    els.nowSong.textContent = current?.song || "等你开唱";
    els.nowSinger.textContent = current ? current.singer : "点一首，舞台等你";
    els.queueCount.textContent = `${waiting.length} 首待唱`;
    els.emptyState.hidden = waiting.length > 0;
    els.historyEmpty.hidden = finished.length > 0;
    renderLoop(els.queueList, waiting, (item, index, duplicate) => `
      <li class="queue-item"${duplicate ? ' aria-hidden="true"' : ""}>
        <span class="queue-number">${String(index + 1).padStart(2, "0")}</span>
        <div><p class="song-title">${escapeHtml(item.song)}</p><p class="singer-name">${escapeHtml(item.singer)}</p></div>
        <span class="wait-time">约 ${Math.max(1, index + (current ? 1 : 0)) * 5} 分钟</span>
      </li>`);
    renderLoop(els.historyList, finished, (item, _index, duplicate) => `
      <div class="history-item"${duplicate ? ' aria-hidden="true"' : ""}>
        <p class="song-title">${escapeHtml(item.song)}</p>
        <p class="singer-name">${escapeHtml(item.singer)}</p>
      </div>`);
    renderAdmin();
  }

  function renderLoop(container, items, renderItem) {
    const original = items.map((item, index) => renderItem(item, index, false)).join("");
    container.innerHTML = original;
    container.classList.remove("is-scrolling");

    const viewportHeight = container.parentElement.clientHeight;
    const shouldScroll = items.length > 1 && viewportHeight > 0 && container.scrollHeight > viewportHeight + 1;
    if (shouldScroll) {
      const duplicate = items.map((item, index) => renderItem(item, index, true)).join("");
      container.innerHTML = original + duplicate;
    }
    container.classList.toggle("is-scrolling", shouldScroll);
    container.style.setProperty("--loop-duration", `${Math.max(12, items.length * 4)}s`);
    container.style.setProperty("--loop-shift", "-50%");
  }

  function renderAdmin() {
    if (!isAdmin) return;
    els.requestsToggle.checked = requestsOpen;
    els.requestsState.textContent = requestsOpen ? "开放中" : "已关闭";
    els.requestsState.classList.toggle("closed", !requestsOpen);
    const active = songs.filter((song) => song.status !== "finished");
    els.adminQueue.innerHTML = active.length ? active.map((item) => `
      <div class="admin-row">
        <div><strong>${escapeHtml(item.song)}</strong><small>${escapeHtml(item.singer)} · ${item.status === "singing" ? "演唱中" : "等待中"}</small></div>
        <div class="admin-actions">
          ${item.status === "waiting" ? `<button data-action="sing" data-id="${item.id}" title="设为正在演唱">开唱</button>` : `<button data-action="finish" data-id="${item.id}" title="标记为已完成">完成</button>`}
          <button class="danger" data-action="delete" data-id="${item.id}" title="删除">删除</button>
        </div>
      </div>`).join("") : "<p class=\"dialog-copy\">当前没有待处理的歌曲。</p>";
  }

  function renderRequestAvailability() {
    els.requestShortcut.disabled = !requestsOpen;
    els.requestShortcut.textContent = requestsOpen ? "点歌" : "点歌关闭";
    els.heroQr.classList.toggle("closed", !requestsOpen);
    els.requestAccessLabel.textContent = requestsOpen ? "扫码点歌" : "点歌已关闭";
    els.requestsToggle.checked = requestsOpen;
    els.requestsState.textContent = requestsOpen ? "开放中" : "已关闭";
    els.requestsState.classList.toggle("closed", !requestsOpen);

    if (!requestsOpen) {
      els.songForm.hidden = true;
      els.successPanel.hidden = true;
      els.closedPanel.hidden = false;
    } else {
      els.closedPanel.hidden = true;
      if (els.successPanel.hidden) els.songForm.hidden = false;
    }
  }

  async function addSong(singer, song) {
    if (!requestsOpen) throw new Error("点歌通道已关闭");
    const record = { singer, song, status: "waiting" };
    if (db) {
      const { error } = await db.from("song_requests").insert(record);
      if (error) throw error;
    } else {
      songs.push({ ...record, id: crypto.randomUUID(), created_at: new Date().toISOString() });
      saveLocal();
      render();
    }
  }

  async function updateSong(id, values) {
    if (db) {
      const { error } = await db.rpc("admin_set_song_status", {
        request_id: id,
        next_status: values.status,
        shared_password: adminPassword
      });
      if (error) throw error;
      await fetchSongs();
    } else {
      if (values.status === "singing") songs.forEach((song) => { if (song.status === "singing") song.status = "finished"; });
      songs = songs.map((song) => song.id === id ? { ...song, ...values } : song);
      saveLocal(); render();
    }
  }

  async function deleteSong(id) {
    if (db) {
      const { error } = await db.rpc("admin_delete_song", {
        request_id: id,
        shared_password: adminPassword
      });
      if (error) throw error;
      await fetchSongs();
    } else { songs = songs.filter((song) => song.id !== id); saveLocal(); render(); }
  }

  async function clearAll() {
    if (db) {
      const { error } = await db.rpc("admin_clear_all", { shared_password: adminPassword });
      if (error) throw error;
      await fetchSongs();
    } else { songs = []; saveLocal(); render(); }
  }

  async function setRequestsOpen(nextOpen) {
    if (db) {
      const { error } = await db.rpc("admin_set_requests_open", {
        next_open: nextOpen,
        shared_password: adminPassword
      });
      if (error) throw error;
      await fetchRequestAvailability();
    } else {
      requestsOpen = nextOpen;
      localStorage.setItem(requestsOpenKey, nextOpen ? "open" : "closed");
      channel?.postMessage("settings");
      renderRequestAvailability();
    }
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2800);
  }

  function openAdmin() {
    els.dialogError.textContent = "";
    isAdmin = Boolean(adminPassword);
    els.loginPanel.hidden = isAdmin;
    els.adminPanel.hidden = !isAdmin;
    $("#demoAdminHint").hidden = Boolean(db);
    renderAdmin();
    els.adminDialog.showModal();
  }

  async function init() {
    const url = requestUrl();
    if (window.QRCode) new window.QRCode($("#qrCode"), { text: url, width: 174, height: 174, correctLevel: window.QRCode.CorrectLevel.M });
    else $("#qrCode").textContent = "二维码加载失败";

    setView(new URLSearchParams(location.search).get("view") === "request" ? "request" : "queue", false);
    if (db) {
      db.channel("public-live-state")
        .on("postgres_changes", { event: "*", schema: "public", table: "song_requests" }, fetchSongs)
        .on("postgres_changes", { event: "*", schema: "public", table: "event_settings" }, fetchRequestAvailability)
        .subscribe();
    } else {
      channel?.addEventListener("message", (event) => {
        if (event.data === "settings") fetchRequestAvailability();
        else fetchSongs();
      });
      window.addEventListener("storage", fetchSongs);
    }
    await Promise.all([fetchSongs(), fetchRequestAvailability()]);
  }

  $$(".open-request").forEach((button) => button.addEventListener("click", () => setView("request")));
  $$(".go-queue").forEach((button) => button.addEventListener("click", () => setView("queue")));
  $("#requestShortcut").addEventListener("click", () => setView("request"));
  $("#backToQueue").addEventListener("click", () => setView("queue"));
  window.addEventListener("popstate", () => setView(new URLSearchParams(location.search).get("view") === "request" ? "request" : "queue", false));
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 120);
  });

  els.songForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#submitSong");
    const data = new FormData(event.currentTarget);
    const singer = data.get("singer").trim();
    const song = data.get("song").trim();
    if (!singer || !song) return;
    button.disabled = true;
    try {
      await addSong(singer, song);
      els.songForm.hidden = true;
      els.successPanel.hidden = false;
      els.successMessage.textContent = `“${song}” 已加入队列，轮到 ${singer} 时请准备好。`;
      event.currentTarget.reset();
    } catch (error) { showToast(`提交失败：${error.message}`); }
    finally { button.disabled = false; }
  });
  $("#addAnother").addEventListener("click", () => {
    els.successPanel.hidden = true;
    renderRequestAvailability();
    if (requestsOpen) $("#singerName").focus();
  });
  $("#adminButton").addEventListener("click", openAdmin);
  $(".dialog-close").addEventListener("click", () => els.adminDialog.close());
  els.adminDialog.addEventListener("click", (event) => { if (event.target === els.adminDialog) els.adminDialog.close(); });

  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    els.dialogError.textContent = "";
    const data = new FormData(event.currentTarget);
    const password = data.get("password");
    try {
      if (db) {
        const { data: valid, error } = await db.rpc("verify_admin_password", { shared_password: password });
        if (error) throw error;
        if (!valid) throw new Error("管理员密码不正确");
      } else if (password !== "admin") throw new Error("密码不正确");
      adminPassword = password;
      sessionStorage.setItem(adminSessionKey, password);
      isAdmin = true; els.loginPanel.hidden = true; els.adminPanel.hidden = false; renderAdmin();
      event.currentTarget.reset();
    } catch (error) { els.dialogError.textContent = error.message; }
  });
  $("#logoutButton").addEventListener("click", () => {
    adminPassword = "";
    sessionStorage.removeItem(adminSessionKey);
    isAdmin = false;
    els.adminDialog.close();
    showToast("已退出管理员模式");
  });
  els.adminQueue.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    button.disabled = true;
    try {
      if (button.dataset.action === "delete") await deleteSong(button.dataset.id);
      else await updateSong(button.dataset.id, { status: button.dataset.action === "sing" ? "singing" : "finished" });
    } catch (error) { els.dialogError.textContent = error.message; }
  });
  els.requestsToggle.addEventListener("change", async (event) => {
    const nextOpen = event.currentTarget.checked;
    event.currentTarget.disabled = true;
    els.dialogError.textContent = "";
    try {
      await setRequestsOpen(nextOpen);
      showToast(nextOpen ? "点歌通道已开放" : "点歌通道已关闭");
    } catch (error) {
      requestsOpen = !nextOpen;
      renderRequestAvailability();
      els.dialogError.textContent = error.message;
    } finally {
      event.currentTarget.disabled = false;
    }
  });
  $("#clearAll").addEventListener("click", async () => {
    if (songs.length === 0) return showToast("队列已经是空的");
    if (!confirm("将删除正在演唱、等待中和已经唱过的全部记录，且无法恢复。确定继续吗？")) return;
    try { await clearAll(); showToast("已彻底清空全部记录"); }
    catch (error) { els.dialogError.textContent = error.message; }
  });

  init();
})();
