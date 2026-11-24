function getBaseItems() {
  return ui.hideClosed
    ? items.filter((i) => syncingKeys.has(i.key) || (i.status !== "canceled" && i.status !== "done"))
    : items;
}

function getFilteredItems() {
  const q = ui.search.trim().toLowerCase();
  const base = getBaseItems();
  const filtered = base.filter((item) => {
    if (ui.source !== "all" && item.source !== ui.source) return false;
    if (ui.status !== "all" && item.status !== ui.status) return false;
    if (ui.priority !== "all" && item.priority !== ui.priority) return false;
    if (ui.scope !== "all" && item.scope !== ui.scope) return false;
    if (ui.metricPreset === "overdue" && !(item.dueDate && isOverdueDate(item.dueDate) && item.status !== "done")) return false;
    if (q) {
      const hay = `${item.id} ${item.title} ${item.scope} ${item.repo || ""} ${item.assignee} ${item.rawStatus}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const dir = ui.sortDir === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    let cmp = 0;
    if (ui.sortBy === "status") {
      cmp = STATUS_META[a.status].order - STATUS_META[b.status].order;
      if (cmp === 0) cmp = (b.updatedAt || "").localeCompare(a.updatedAt || "");
    } else if (ui.sortBy === "priority") {
      cmp = PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
      if (cmp === 0) cmp = STATUS_META[a.status].order - STATUS_META[b.status].order;
    } else if (ui.sortBy === "id") {
      cmp = a.id.localeCompare(b.id, "zh-CN");
    } else if (ui.sortBy === "title") {
      cmp = a.title.localeCompare(b.title, "zh-CN");
    } else if (ui.sortBy === "scope") {
      cmp = a.scope.localeCompare(b.scope, "zh-CN");
    } else if (ui.sortBy === "date") {
      cmp = (b.updatedAt || "").localeCompare(a.updatedAt || "");
    }
    return cmp * dir;
  });
  return filtered;
}

function renderMetrics() {
  const activeBase = items.filter((i) => i.status !== "canceled" && i.status !== "done");
  const openReviewPrs = activeBase.filter((i) => i.source === "github" && i.status === "in_review").length;
  const inProgress = activeBase.filter((i) => i.status === "in_progress").length;
  const todoCount = activeBase.filter((i) => i.status === "todo").length;
  const overdue = activeBase.filter((i) => i.dueDate && isOverdueDate(i.dueDate)).length;
  const totalContainers = githubRepos.length + linearProjects.length;

  const cells = [
    { key: "review_pr", label: "待审 GitHub PR", val: openReviewPrs, cls: openReviewPrs > 0 ? "is-warn" : "" },
    { key: "in_progress", label: "进行中 / Draft", val: inProgress, cls: "is-accent" },
    { key: "todo", label: "待办任务", val: todoCount, cls: "" },
    { key: "overdue", label: "已过计划日", val: overdue, cls: overdue > 0 ? "is-danger" : "" },
    { key: "projects", label: "仓库与项目总数", val: totalContainers, cls: "is-ok" }
  ];

  const bar = document.getElementById("metricBar");
  bar.innerHTML = cells.map((c) => `
    <button type="button" class="metric-cell ${ui.metricPreset === c.key ? "active" : ""}" data-preset="${c.key}">
      <span class="metric-label">${c.label}</span>
      <span class="metric-val ${c.cls}">${c.val}</span>
    </button>
  `).join("");

  bar.querySelectorAll(".metric-cell").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = btn.dataset.preset;
      if (preset === "projects") {
        ui.view = "projects";
        ui.metricPreset = "projects";
        persistUi();
        renderAll();
        return;
      }
      if (ui.view === "projects") ui.view = "table";
      if (ui.metricPreset === preset) {
        ui.metricPreset = "all";
        ui.source = "all";
        ui.status = "all";
      } else {
        ui.metricPreset = preset;
        ui.source = "all";
        ui.status = "all";
        if (preset === "review_pr") { ui.source = "github"; ui.status = "in_review"; }
        if (preset === "in_progress") ui.status = "in_progress";
        if (preset === "todo") ui.status = "todo";
      }
      persistUi();
      renderAll();
    });
  });
}

function renderSourcePills() {
  const base = getBaseItems();
  const counts = {
    all: base.length,
    github: base.filter((i) => i.source === "github").length,
    linear: base.filter((i) => i.source === "linear").length,
    notion: base.filter((i) => i.source === "notion").length
  };
  const defs = [
    { key: "all", label: "全部" },
    { key: "github", label: "GitHub" },
    { key: "linear", label: "Linear" },
    { key: "notion", label: "Notion" }
  ];

  const wrap = document.getElementById("sourcePills");
  wrap.innerHTML = defs.map((d) => `
    <button type="button" class="source-pill ${ui.source === d.key ? "active" : ""}" data-source="${d.key}">
      ${d.key !== "all" ? sourceSvg(d.key) : ""}
      <span>${d.label}</span>
      <span style="opacity:.65;font-variant-numeric:tabular-nums;">${counts[d.key]}</span>
    </button>
  `).join("");

  wrap.querySelectorAll(".source-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.source = btn.dataset.source;
      ui.metricPreset = "all";
      persistUi();
      renderAll();
    });
  });
}

function renderScopeOptions() {
  const select = document.getElementById("scopeFilter");
  const scopes = [...new Set(getBaseItems().map((i) => i.scope).filter(Boolean))];
  select.innerHTML = `<option value="all">全部仓库 / 项目 / 分类</option>` +
    scopes.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  if (scopes.includes(ui.scope)) {
    select.value = ui.scope;
  } else {
    ui.scope = "all";
    select.value = "all";
  }
}

function syncControls() {
  document.getElementById("searchInput").value = ui.search;
  const st = document.getElementById("statusFilter");
  const pr = document.getElementById("priorityFilter");
  const sc = document.getElementById("scopeFilter");
  st.value = ui.status;
  pr.value = ui.priority;
  sc.value = ui.scope;
  st.classList.toggle("has-value", ui.status !== "all");
  pr.classList.toggle("has-value", ui.priority !== "all");
  sc.classList.toggle("has-value", ui.scope !== "all");
  document.getElementById("chkHideClosed").checked = ui.hideClosed;

  const hasFilters = ui.source !== "all" || ui.status !== "all" || ui.priority !== "all" || ui.scope !== "all" || ui.search.trim() !== "" || ui.metricPreset === "overdue";
  document.getElementById("btnClearFilters").style.display = hasFilters ? "inline-block" : "none";

  document.getElementById("btnViewTable").setAttribute("aria-pressed", String(ui.view === "table"));
  document.getElementById("btnViewBoard").setAttribute("aria-pressed", String(ui.view === "board"));
  document.getElementById("btnViewProjects").setAttribute("aria-pressed", String(ui.view === "projects"));
  document.getElementById("filterToolbar").style.display = ui.view === "projects" ? "none" : "flex";
}

function sortArrow(col) {
  if (ui.sortBy !== col) return "";
  return `<span class="sort-indicator">${ui.sortDir === "asc" ? "▲" : "▼"}</span>`;
}

function renderTableView(list) {
  if (list.length === 0) {
    return `<div class="table-shell"><div class="empty-state"><p>当前筛选条件下没有匹配的实时条目。</p><button class="btn-ghost" type="button" id="emptyResetBtn">显示全部条目</button></div></div>`;
  }

  const rows = list.map((item) => {
    const st = STATUS_META[item.status] || STATUS_META.todo;
    const pr = PRIORITY_META[item.priority] || PRIORITY_META.none;
    const isSyncing = syncingKeys.has(item.key);
    const dueTag = item.dueDate
      ? `<span class="meta-chip ${isOverdueDate(item.dueDate) && item.status !== "done" ? "due-overdue" : "due-normal"}">计划日 ${formatDateShort(item.dueDate)}</span>`
      : "";
    const repoTag = item.repo ? `<span class="meta-chip repo-chip">${escapeHtml(item.repo)}</span>` : "";
    const hasNote = Boolean(notesMap[item.key] && notesMap[item.key].trim());

    return `
      <tr data-key="${escapeHtml(item.key)}" class="${selectedKey === item.key ? "is-selected" : ""} ${isSyncing ? "is-syncing" : ""}">
        <td class="col-id">
          <span class="item-id-cell">
            <span class="src-icon">${sourceSvg(item.source)}</span>
            <span>${escapeHtml(item.id)}</span>
          </span>
        </td>
        <td>
          <span class="item-title-main">${escapeHtml(item.title)}</span>
          <div class="item-subline">
            <span class="time-cell">${escapeHtml(item.subKind)}</span>
            ${repoTag}
            ${dueTag}
            ${isSyncing ? `<span class="syncing-chip">同步中…</span>` : ""}
            ${hasNote ? `<span class="meta-chip">有备注</span>` : ""}
          </div>
        </td>
        <td><span class="meta-chip">${escapeHtml(item.scope)}</span></td>
        <td onclick="event.stopPropagation()">
          <select class="status-select ${st.cls}" data-inline-status="${escapeHtml(item.key)}" ${isSyncing ? "disabled" : ""} aria-label="修改并同步状态">
            ${buildStatusSelectOptions(item)}
          </select>
        </td>
        <td>
          <span class="prio-badge ${pr.cls}">
            <span class="prio-dot"></span>
            <span>${pr.label}</span>
          </span>
        </td>
        <td class="time-cell">${formatDateShort(item.updatedAt)}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="table-shell">
      <table>
        <thead>
          <tr>
            <th class="sortable col-id" data-sort="id">来源与编号${sortArrow("id")}</th>
            <th class="sortable" data-sort="title">标题与仓库 / 计划日${sortArrow("title")}</th>
            <th class="sortable" data-sort="scope">仓库 / 项目 / 分类${sortArrow("scope")}</th>
            <th class="sortable" data-sort="status">状态（可直接改）${sortArrow("status")}</th>
            <th class="sortable" data-sort="priority">优先级${sortArrow("priority")}</th>
            <th class="sortable" data-sort="date">最近更新${sortArrow("date")}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderBoardView(list) {
  const colOrder = ["in_review", "in_progress", "todo", "paused", "done"];
  const colsHtml = colOrder.map((statusKey) => {
    const colItems = list.filter((i) => i.status === statusKey);
    const st = STATUS_META[statusKey];
    const cardsHtml = colItems.length === 0
      ? `<div class="time-cell" style="padding:18px 4px;text-align:center;">可拖拽卡片至此列</div>`
      : colItems.map((item) => {
          const pr = PRIORITY_META[item.priority] || PRIORITY_META.none;
          const isSyncing = syncingKeys.has(item.key);
          return `
            <article
              class="board-card ${selectedKey === item.key ? "is-selected" : ""} ${isSyncing ? "is-syncing" : ""}"
              data-key="${escapeHtml(item.key)}"
              draggable="${isSyncing ? "false" : "true"}"
            >
              <div class="card-top">
                <span class="card-top-left">
                  <span class="drag-grip" title="按住拖拽修改状态">${gripSvg()}</span>
                  <span class="item-id-cell">
                    <span class="src-icon">${sourceSvg(item.source)}</span>
                    <span>${escapeHtml(item.id)}</span>
                  </span>
                </span>
                <span class="prio-badge ${pr.cls}"><span class="prio-dot"></span><span>${pr.label}</span></span>
              </div>
              <div class="card-title">${escapeHtml(item.title)}</div>
              <div class="item-subline">
                <span class="meta-chip">${escapeHtml(item.scope)}</span>
                ${item.dueDate ? `<span class="meta-chip ${isOverdueDate(item.dueDate) && item.status !== "done" ? "due-overdue" : "due-normal"}">${formatDateShort(item.dueDate)}</span>` : ""}
                ${isSyncing ? `<span class="syncing-chip">同步中…</span>` : ""}
              </div>
              <div class="card-footer">
                <span class="time-cell">${escapeHtml(item.rawStatus || st.label)}</span>
                <span class="time-cell">${formatDateShort(item.updatedAt)}</span>
              </div>
            </article>
          `;
        }).join("");

    const canQuickAdd = statusKey !== "done";
    return `
      <section class="board-col" data-col-status="${statusKey}">
        <div class="col-header">
          <span class="status-pill ${st.cls}">${st.label}</span>
          <span class="col-count">${colItems.length}</span>
        </div>
        <div class="col-drop-banner" data-drop-banner="${statusKey}"></div>
        ${cardsHtml}
        ${canQuickAdd ? `<button type="button" class="col-quick-add" data-quick-add-status="${statusKey}">+ 在此列新建</button>` : ""}
      </section>
    `;
  }).join("");

  return `
    <div class="board-hint">
      <span>按住任意卡片拖入其他状态列，松手后将直接同步写回 GitHub / Linear / Notion。</span>
      <span class="time-cell">拖拽时自动标注各列是否支持当前来源</span>
    </div>
    <div class="board-grid">${colsHtml}</div>
  `;
}

function bindBoardDragAndDrop(container) {
  const cols = Array.from(container.querySelectorAll(".board-col[data-col-status]"));
  const cards = Array.from(container.querySelectorAll(".board-card[data-key]"));

  function resetDragVisuals() {
    cols.forEach((col) => {
      col.classList.remove("drop-compatible", "drop-incompatible", "is-drag-over");
      col._dragDepth = 0;
      const banner = col.querySelector("[data-drop-banner]");
      if (banner) banner.textContent = "";
    });
    cards.forEach((c) => c.classList.remove("is-dragging"));
  }

  cards.forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      const key = card.dataset.key;
      const item = items.find((i) => i.key === key);
      if (!item || syncingKeys.has(key)) {
        e.preventDefault();
        return;
      }
      draggingKey = key;
      suppressNextClick = true;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", key);
      }
      requestAnimationFrame(() => card.classList.add("is-dragging"));

      cols.forEach((col) => {
        const colStatus = col.dataset.colStatus;
        const banner = col.querySelector("[data-drop-banner]");
        col._dragDepth = 0;
        if (colStatus === item.status) {
          col.classList.remove("drop-compatible", "drop-incompatible");
          if (banner) banner.textContent = "";
          return;
        }
        const spec = getRemoteStatusSpec(item.source, colStatus);
        if (spec) {
          col.classList.add("drop-compatible");
          if (banner) banner.textContent = spec.dropHint;
        } else {
          col.classList.add("drop-incompatible");
          const reason = (INCOMPATIBLE_REASONS[item.source] && INCOMPATIBLE_REASONS[item.source][colStatus]) || "不支持此状态";
          if (banner) banner.textContent = reason;
        }
      });
    });

    card.addEventListener("dragend", () => {
      draggingKey = null;
      resetDragVisuals();
      setTimeout(() => { suppressNextClick = false; }, 120);
    });
  });

  cols.forEach((col) => {
    col._dragDepth = 0;
    const targetStatus = col.dataset.colStatus;

    col.addEventListener("dragenter", (e) => {
      const item = items.find((i) => i.key === draggingKey);
      if (!item) return;
      const canDrop = targetStatus !== item.status && Boolean(getRemoteStatusSpec(item.source, targetStatus));
      if (!canDrop) return;
      e.preventDefault();
      col._dragDepth += 1;
      col.classList.add("is-drag-over");
    });

    col.addEventListener("dragover", (e) => {
      const item = items.find((i) => i.key === draggingKey);
      if (!item) return;
      const canDrop = targetStatus !== item.status && Boolean(getRemoteStatusSpec(item.source, targetStatus));
      if (canDrop) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        col.classList.add("is-drag-over");
      } else if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "none";
      }
    });

    col.addEventListener("dragleave", () => {
      col._dragDepth = Math.max(0, (col._dragDepth || 1) - 1);
      if (col._dragDepth === 0) {
        col.classList.remove("is-drag-over");
      }
    });

    col.addEventListener("drop", (e) => {
      e.preventDefault();
      const key = draggingKey || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
      draggingKey = null;
      resetDragVisuals();
      setTimeout(() => { suppressNextClick = false; }, 120);
      if (key) {
        syncItemStatus(key, targetStatus);
      }
    });
  });
}

function renderProjectsView() {
  const prCountByRepo = {};
  items.filter((i) => i.source === "github" && i.status !== "done").forEach((i) => {
    prCountByRepo[i.scope] = (prCountByRepo[i.scope] || 0) + 1;
  });

  const issueCountByProject = {};
  items.filter((i) => i.source === "linear" && i.status !== "canceled" && i.status !== "done").forEach((i) => {
    issueCountByProject[i.scope] = (issueCountByProject[i.scope] || 0) + 1;
  });

  const repoCards = githubRepos.map((r) => {
    const openPrs = prCountByRepo[r.name] || 0;
    return `
      <article class="proj-card">
        <div class="proj-head">
          <div class="proj-name">${escapeHtml(r.name)}</div>
          <span class="meta-chip">${r.isPrivate ? "Private" : "Public"}</span>
        </div>
        <p class="proj-summary">${escapeHtml(r.description || "暂无仓库说明")}</p>
        <div class="item-subline">
          ${r.language ? `<span class="meta-chip">${escapeHtml(r.language)}</span>` : ""}
          <span class="meta-chip">开放 PR ${openPrs}</span>
          <span class="time-cell">更新 ${formatDateShort(r.updatedAt)}</span>
        </div>
        <div class="proj-foot">
          ${openPrs > 0
            ? `<button type="button" class="clear-filters" style="padding:0;" data-filter-repo="${escapeHtml(r.name)}">查看仓库 PR</button>`
            : `<span class="time-cell">暂无开放 PR</span>`}
          <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">在 GitHub 打开</a>
        </div>
      </article>
    `;
  }).join("");

  const projectCards = linearProjects.map((p) => {
    const cnt = issueCountByProject[p.name] || 0;
    return `
      <article class="proj-card">
        <div class="proj-head">
          <div class="proj-name">${escapeHtml(p.name)}</div>
          <span class="meta-chip">${escapeHtml(p.id)}</span>
        </div>
        <p class="proj-summary">${escapeHtml(p.summary || "暂无项目简介")}</p>
        <div class="item-subline">
          ${p.repo ? `<span class="meta-chip repo-chip">仓库 ${escapeHtml(p.repo)}</span>` : ""}
          <span class="meta-chip">进行中 Issue ${cnt}</span>
          <span class="meta-chip">${escapeHtml(p.status)}</span>
        </div>
        <div class="proj-foot">
          <span style="display:inline-flex;align-items:center;gap:10px;">
            <button type="button" class="clear-filters" style="padding:0;" data-filter-project="${escapeHtml(p.name)}">筛选该项目任务</button>
            <button type="button" class="clear-filters" style="padding:0;" data-create-project="${escapeHtml(p.name)}">+ 建任务</button>
          </span>
          <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">在 Linear 打开</a>
        </div>
      </article>
    `;
  }).join("");

  return `
    <div class="projects-stack">
      <section>
        <div class="section-heading">${sourceSvg("github")}<span>GitHub 仓库（${githubRepos.length}）</span></div>
        <div class="projects-grid">${repoCards || `<div class="time-cell">暂无仓库数据</div>`}</div>
      </section>
      <section>
        <div class="section-heading">${sourceSvg("linear")}<span>Linear 工作项目（${linearProjects.length}）</span></div>
        <div class="projects-grid">${projectCards || `<div class="time-cell">暂无项目数据</div>`}</div>
      </section>
    </div>
  `;
}

function renderMain() {
  const container = document.getElementById("mainContainer");
  if (ui.view === "projects") {
    container.innerHTML = renderProjectsView();
    container.querySelectorAll("[data-filter-repo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ui.view = "table";
        ui.source = "github";
        ui.scope = btn.dataset.filterRepo;
        ui.metricPreset = "all";
        persistUi();
        renderAll();
      });
    });
    container.querySelectorAll("[data-filter-project]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ui.view = "table";
        ui.source = "linear";
        ui.scope = btn.dataset.filterProject;
        ui.metricPreset = "all";
        persistUi();
        renderAll();
      });
    });
    container.querySelectorAll("[data-create-project]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openCreateModal({ source: "linear", project: btn.dataset.createProject });
      });
    });
    return;
  }

  const list = getFilteredItems();
  document.getElementById("resultCount").textContent = `显示 ${list.length} / ${getBaseItems().length} 条`;
  container.innerHTML = ui.view === "table" ? renderTableView(list) : renderBoardView(list);

  container.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const col = th.dataset.sort;
      if (ui.sortBy === col) {
        ui.sortDir = ui.sortDir === "asc" ? "desc" : "asc";
      } else {
        ui.sortBy = col;
        ui.sortDir = "asc";
      }
      persistUi();
      renderMain();
    });
  });

  container.querySelectorAll("[data-inline-status]").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      syncItemStatus(sel.dataset.inlineStatus, e.target.value);
    });
  });

  if (ui.view === "board") {
    bindBoardDragAndDrop(container);
    container.querySelectorAll("[data-quick-add-status]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const stKey = btn.dataset.quickAddStatus;
        openCreateModal({
          status: stKey,
          source: stKey === "in_review" ? "linear" : undefined
        });
      });
    });
  }

  container.querySelectorAll("tbody tr[data-key], .board-card[data-key]").forEach((el) => {
    el.addEventListener("click", () => {
      if (suppressNextClick) return;
      openDrawer(el.dataset.key);
    });
  });

  const emptyBtn = document.getElementById("emptyResetBtn");
  if (emptyBtn) emptyBtn.addEventListener("click", clearFilters);
}

function openDrawer(key) {
  selectedKey = key;
  renderDrawer();
  document.getElementById("drawerBackdrop").classList.add("open");
  document.getElementById("detailDrawer").classList.add("open");
  renderMain();
}

function closeDrawer() {
  selectedKey = null;
  document.getElementById("drawerBackdrop").classList.remove("open");
  document.getElementById("detailDrawer").classList.remove("open");
  renderMain();
}

function renderDrawer() {
  const item = items.find((i) => i.key === selectedKey);
  if (!item) return;
  const st = STATUS_META[item.status] || STATUS_META.todo;
  const pr = PRIORITY_META[item.priority] || PRIORITY_META.none;
  const isSyncing = syncingKeys.has(item.key);
  const srcLabel = item.source === "github" ? "GitHub" : (item.source === "linear" ? "Linear" : "Notion");

  document.getElementById("drawerIdWrap").innerHTML = `
    <span class="item-id-cell" style="font-size:13px;color:var(--ink);">
      <span class="src-icon">${sourceSvg(item.source)}</span>
      <span>${srcLabel}</span>
      <span>${escapeHtml(item.id)}</span>
    </span>
  `;

  const extLink = document.getElementById("drawerExternalLink");
  if (item.url) {
    extLink.href = item.url;
    extLink.textContent = `在 ${srcLabel} 中打开`;
    extLink.style.display = "inline";
  } else {
    extLink.style.display = "none";
  }

  document.getElementById("drawerBody").innerHTML = `
    <div>
      <div class="drawer-title">${escapeHtml(item.title)}</div>
      <div class="item-subline" style="margin-top:8px;">
        <select class="status-select ${st.cls}" id="drawerStatusSelect" ${isSyncing ? "disabled" : ""} aria-label="修改并同步远程状态">
          ${buildStatusSelectOptions(item)}
        </select>
        ${isSyncing ? `<span class="syncing-chip">正在同步至 ${srcLabel}…</span>` : ""}
        <span class="prio-badge ${pr.cls}"><span class="prio-dot"></span><span>${pr.label}</span></span>
        ${item.repo ? `<span class="meta-chip repo-chip">${escapeHtml(item.repo)}</span>` : ""}
      </div>
    </div>

    <div class="drawer-kv">
      <div>
        <span class="kv-label">仓库 / 项目 / 分类</span>
        <span class="kv-val">${escapeHtml(item.scope)}</span>
      </div>
      <div>
        <span class="kv-label">${item.dueDate ? "计划到期日" : "最近更新"}</span>
        <span class="kv-val">${formatDateShort(item.dueDate || item.updatedAt)}</span>
      </div>
      <div>
        <span class="kv-label">负责人 / 作者</span>
        <span class="kv-val">${escapeHtml(item.assignee)}</span>
      </div>
      <div>
        <span class="kv-label">${item.branch ? "Git 分支" : "条目类型"}</span>
        <span class="kv-val" style="font-family:${item.branch ? "var(--font-mono)" : "inherit"};font-size:11.5px;word-break:break-all;">${escapeHtml(item.branch || item.subKind)}</span>
      </div>
    </div>

    <div class="drawer-section">
      <h3>条目说明</h3>
      <p class="drawer-desc">${escapeHtml(item.description || "暂无补充说明。")}</p>
    </div>

    <div class="drawer-section">
      <h3>个人跟进备注（仅保存在本机）</h3>
      <textarea class="note-area" id="dNotes" placeholder="记下今天联调结论、评审意见或待确认事项…">${escapeHtml(notesMap[item.key] || "")}</textarea>
    </div>
  `;

  const drawerStatusSel = document.getElementById("drawerStatusSelect");
  if (drawerStatusSel) {
    drawerStatusSel.addEventListener("change", (e) => {
      syncItemStatus(item.key, e.target.value);
    });
  }

  const notesEl = document.getElementById("dNotes");
  notesEl.addEventListener("input", () => {
    notesMap[item.key] = notesEl.value;
    persistNotes();
    document.getElementById("drawerSavedHint").textContent = "备注已实时保存";
    renderMain();
  });
}

function clearFilters() {
  ui.source = "all";
  ui.status = "all";
  ui.priority = "all";
  ui.scope = "all";
  ui.search = "";
  ui.metricPreset = "all";
  persistUi();
  renderAll();
}

function renderConnectorFooter() {
  const setTag = (elId, src, label, state) => {
    const el = document.getElementById(elId);
    el.className = `conn-tag ${state === "ok" ? "is-live" : (state === "error" || state === "auth" ? "is-error" : "")}`;
    const suffix = state === "ok" ? "读写同步已就绪" : (state === "auth" ? "需重新登录" : (state === "error" ? "拉取异常" : "同步中"));
    el.innerHTML = `${sourceSvg(src)}<span>${label} ${suffix}</span>`;
  };
  setTag("tagGithub", "github", "GitHub", loadStatus.github);
  setTag("tagLinear", "linear", "Linear", loadStatus.linear);
  setTag("tagNotion", "notion", "Notion", loadStatus.notion);
}

function renderAll() {
  renderMetrics();
  renderSourcePills();
  renderScopeOptions();
  syncControls();
  renderConnectorFooter();
  renderMain();
}
