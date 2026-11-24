function parseRepoFromApiUrl(apiUrl) {
  if (!apiUrl) return "github";
  const m = String(apiUrl).match(/\/repos\/([^/]+\/[^/]+)$/);
  return m ? m[1] : String(apiUrl).split("/").slice(-2).join("/");
}

function shortRepoName(fullName) {
  return String(fullName || "").split("/").pop() || fullName;
}

function extractNotionPageId(url) {
  if (!url) return null;
  const clean = String(url).split("?")[0].split("#")[0];
  const seg = clean.split("/").filter(Boolean).pop() || "";
  const m = seg.match(/([0-9a-fA-F]{32})$/);
  return m ? m[1] : (seg || null);
}

function mapLinearStatus(statusName, statusType) {
  const lower = String(statusName || "").toLowerCase();
  if (lower.includes("review")) return "in_review";
  if (statusType === "started") return "in_progress";
  if (statusType === "backlog") return "paused";
  if (statusType === "completed") return "done";
  if (statusType === "canceled") return "canceled";
  return "todo";
}

function mapLinearPriority(prioObj) {
  const val = prioObj && typeof prioObj.value === "number" ? prioObj.value : 0;
  if (val === 1) return "urgent";
  if (val === 2) return "high";
  if (val === 3) return "medium";
  if (val === 4) return "low";
  return "none";
}

function mapNotionStatus(val) {
  if (val === "进行中") return "in_progress";
  if (val === "待办") return "todo";
  if (val === "暂缓") return "paused";
  if (val === "已完成") return "done";
  if (val === "已关闭") return "canceled";
  return "todo";
}

function mapNotionPriority(val) {
  if (val === "紧急") return "urgent";
  if (val === "重要") return "high";
  if (val === "中") return "medium";
  if (val === "不重要") return "low";
  return "none";
}

function extractRepoName(desc) {
  if (!desc) return null;
  const m = String(desc).match(/对应代码仓库为\s*`([^`]+)`/);
  return m ? m[1] : null;
}

function isOverdueDate(dateStr) {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr.slice(0, 10) < today;
}

function formatDateShort(iso) {
  if (!iso) return "—";
  return String(iso).slice(0, 10);
}

function cleanLinearDesc(desc) {
  if (!desc) return "";
  return String(desc)
    .replace(/<linear-image>[\s\S]*?<\/linear-image>/g, "[图片]")
    .replace(/<linear-embed[^>]*>[\s\S]*?<\/linear-embed>/g, "[视频/附件]")
    .trim();
}

function getRemoteStatusSpec(source, targetStatus) {
  const map = SOURCE_STATUS_SPECS[source];
  return map ? map[targetStatus] || null : null;
}

function buildStatusSelectOptions(item) {
  const specs = SOURCE_STATUS_SPECS[item.source] || {};
  const entries = Object.entries(specs);
  return entries.map(([stKey, spec]) =>
    `<option value="${stKey}" ${item.status === stKey ? "selected" : ""}>${escapeHtml(spec.optionLabel)}</option>`
  ).join("");
}

async function syncItemStatus(key, targetStatus) {
  const item = items.find((i) => i.key === key);
  if (!item) return;
  if (syncingKeys.has(key)) return;
  if (item.status === targetStatus) return;

  const spec = getRemoteStatusSpec(item.source, targetStatus);
  if (!spec) {
    const reason = (INCOMPATIBLE_REASONS[item.source] && INCOMPATIBLE_REASONS[item.source][targetStatus]) || "当前来源不支持该目标状态";
    showToast(`${item.id} 无法移动：${reason}`, "warn");
    return;
  }

  const prev = {
    status: item.status,
    rawStatus: item.rawStatus,
    updatedAt: item.updatedAt,
    ghState: item.ghState,
    ghDraft: item.ghDraft,
    subKind: item.subKind
  };

  // Optimistic update
  item.status = targetStatus;
  item.rawStatus = spec.rawStatus;
  item.updatedAt = new Date().toISOString();
  if (item.source === "github") {
    item.ghState = spec.state;
    if (spec.draft !== null) {
      item.ghDraft = spec.draft;
      item.subKind = spec.draft ? "GitHub Draft PR" : "GitHub Pull Request";
    }
  }
  syncingKeys.add(key);
  renderAll();
  if (selectedKey === key) renderDrawer();

  try {
    if (item.source === "linear") {
      const res = await window.cowork.callMcpTool("mcp__Linear__save_issue", {
        id: item.id,
        state: spec.remoteValue
      });
      checkWriteResult(res);
    } else if (item.source === "notion") {
      if (!item.notionPageId) throw new Error("缺少 Notion 页面 ID");
      let res;
      try {
        res = await window.cowork.callMcpTool("mcp__Notion__notion-update-page", {
          page_id: item.notionPageId,
          command: "update_properties",
          properties: { "状态": spec.remoteValue }
        });
        if (res && res.isError) {
          const errTxt = (res.content && res.content[0] && res.content[0].text) || "";
          if (/string|JSON|invalid_type|object/i.test(errTxt)) {
            res = await window.cowork.callMcpTool("mcp__Notion__notion-update-page", {
              page_id: item.notionPageId,
              command: "update_properties",
              properties: JSON.stringify({ "状态": spec.remoteValue })
            });
          }
        }
      } catch (firstErr) {
        res = await window.cowork.callMcpTool("mcp__Notion__notion-update-page", {
          page_id: item.notionPageId,
          command: "update_properties",
          properties: JSON.stringify({ "状态": spec.remoteValue })
        });
      }
      checkWriteResult(res);
    } else if (item.source === "github") {
      const args = {
        owner: item.ghOwner,
        repo: item.ghRepo,
        pullNumber: item.ghNumber
      };
      if (spec.state === "closed") {
        args.state = "closed";
      } else {
        if (prev.ghState !== "open") args.state = "open";
        args.draft = Boolean(spec.draft);
      }
      const res = await window.cowork.callMcpTool("mcp__GitHub__update_pull_request", args);
      checkWriteResult(res);
    }

    syncingKeys.delete(key);
    renderAll();
    if (selectedKey === key) renderDrawer();

    const srcName = item.source === "github" ? "GitHub" : item.source === "linear" ? "Linear" : "Notion";
    const hiddenNow = ui.hideClosed && (targetStatus === "done" || targetStatus === "canceled");
    showToast(
      hiddenNow
        ? `已同步至 ${srcName}：${item.id} → ${spec.rawStatus}（已按当前筛选收起）`
        : `已同步至 ${srcName}：${item.id} → ${spec.rawStatus}`,
      "ok",
      hiddenNow
        ? {
            label: "显示已完成",
            onClick: () => {
              ui.hideClosed = false;
              persistUi();
              renderAll();
            }
          }
        : null
    );
    runAiSummary();
  } catch (err) {
    // Rollback on failure
    item.status = prev.status;
    item.rawStatus = prev.rawStatus;
    item.updatedAt = prev.updatedAt;
    item.ghState = prev.ghState;
    item.ghDraft = prev.ghDraft;
    item.subKind = prev.subKind;
    syncingKeys.delete(key);
    renderAll();
    if (selectedKey === key) renderDrawer();
    showToast(`同步失败，已恢复原状态：${err.message || err}`, "error");
  }
}

function normalizeData(ghPrs, ghRepos, linIssues, linProjects, notionRows) {
  githubRepos = (ghRepos || []).map((r) => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    description: r.description || "",
    url: r.html_url,
    language: r.language || "",
    isPrivate: Boolean(r.private),
    openCount: r.open_issues_count || 0,
    updatedAt: r.updated_at || ""
  }));

  const repoByProjectName = new Map();
  linearProjects = (linProjects || []).map((p) => {
    const repo = extractRepoName(p.description);
    if (repo) repoByProjectName.set(p.name, repo);
    return {
      id: p.id,
      name: p.name,
      summary: p.summary || "",
      description: p.description || "",
      url: p.url,
      repo,
      team: p.leadTeam ? p.leadTeam.name : STAR_BOARD_CONFIG.linearDefaultTeam,
      status: p.status ? p.status.name : "Backlog",
      updatedAt: p.updatedAt || ""
    };
  });

  const normalizedGithub = (ghPrs || []).map((pr) => {
    const fullRepo = parseRepoFromApiUrl(pr.repository_url);
    const [ghOwner, ghRepo] = fullRepo.split("/");
    const repoShort = ghRepo || shortRepoName(fullRepo);
    const isOpen = pr.state === "open";
    const isDraft = Boolean(pr.draft);
    const status = !isOpen ? "done" : (isDraft ? "in_progress" : "in_review");
    const rawStatus = !isOpen ? "已关闭 PR" : (isDraft ? "Draft PR" : "Open PR");
    return {
      key: `github:${fullRepo}#${pr.number}`,
      id: `#${pr.number}`,
      source: "github",
      ghOwner: ghOwner || GITHUB_LOGIN,
      ghRepo: repoShort,
      ghNumber: Number(pr.number),
      ghState: pr.state || "open",
      ghDraft: isDraft,
      title: pr.title,
      status,
      rawStatus,
      priority: isOpen && !isDraft ? "medium" : "none",
      scope: repoShort,
      subKind: isDraft ? "GitHub Draft PR" : "GitHub Pull Request",
      repo: fullRepo,
      branch: null,
      dueDate: null,
      updatedAt: pr.updated_at || pr.created_at || "",
      assignee: (pr.user && pr.user.login) || GITHUB_LOGIN,
      url: pr.html_url,
      description: `仓库 ${fullRepo} 的 Pull Request #${pr.number}（${rawStatus}），创建于 ${formatDateShort(pr.created_at)}，最近更新于 ${formatDateShort(pr.updated_at)}。`
    };
  });

  const normalizedLinear = (linIssues || []).map((iss) => {
    const repo = iss.project ? repoByProjectName.get(iss.project) || null : null;
    return {
      key: `linear:${iss.id}`,
      id: iss.id,
      source: "linear",
      title: iss.title,
      status: mapLinearStatus(iss.status, iss.statusType),
      rawStatus: iss.status || "",
      priority: mapLinearPriority(iss.priority),
      scope: iss.project || (iss.team ? `团队 ${iss.team}` : "Linear"),
      subKind: iss.team ? `Linear / ${iss.team}` : "Linear",
      repo,
      branch: iss.gitBranchName || null,
      dueDate: iss.dueDate || null,
      updatedAt: iss.updatedAt || iss.createdAt || "",
      assignee: iss.assignee || iss.createdBy || "未分配",
      url: iss.url,
      description: cleanLinearDesc(iss.description)
    };
  });

  const normalizedNotion = (notionRows || []).map((row, idx) => {
    const rawUrl = row.url || "";
    const pageId = extractNotionPageId(rawUrl);
    const pageShort = pageId ? pageId.slice(-6).toUpperCase() : String(idx + 1).padStart(4, "0");
    const due = row["date:到期:start"] || null;
    return {
      key: `notion:${pageId || rawUrl || idx}`,
      id: `NT-${pageShort}`,
      source: "notion",
      notionPageId: pageId,
      title: String(row["任务"] || "未命名任务").trim(),
      status: mapNotionStatus(row["状态"]),
      rawStatus: row["状态"] || "待办",
      priority: mapNotionPriority(row["重要性"]),
      scope: row["分类"] || "未分类任务",
      subKind: row["能量"] ? `Notion 任务 · 能量${row["能量"]}` : `Notion ${STAR_BOARD_CONFIG.notionDatabaseName}`,
      repo: null,
      branch: null,
      dueDate: due,
      updatedAt: due || "",
      assignee: STAR_BOARD_CONFIG.notionDefaultAssignee,
      url: rawUrl,
      description: `来自 Notion「${STAR_BOARD_CONFIG.notionDatabaseName}」。当前状态：${row["状态"] || "待办"}${row["分类"] ? `，分类：${row["分类"]}` : ""}${row["重要性"] ? `，重要性：${row["重要性"]}` : ""}${due ? `，计划到期日：${due}` : ""}。`
    };
  });

  items = [...normalizedLinear, ...normalizedGithub, ...normalizedNotion];
}

function buildLocalSummary() {
  const active = items.filter((i) => i.status !== "canceled" && i.status !== "done");
  const openPrs = active.filter((i) => i.source === "github" && i.status === "in_review");
  const activeLinear = active.filter((i) => i.source === "linear" && i.status === "in_progress");
  const activeNotion = active.filter((i) => i.source === "notion" && i.status === "in_progress");
  const parts = [];
  if (activeLinear.length > 0) {
    parts.push(`Linear 进行中 ${activeLinear.length} 项（${activeLinear.map((i) => i.id).join("、")}）`);
  }
  if (openPrs.length > 0) {
    parts.push(`GitHub 有 ${openPrs.length} 个待合入 PR（集中在 ${[...new Set(openPrs.map((p) => p.scope))].join("、")}）`);
  }
  if (activeNotion.length > 0) {
    parts.push(`Notion 正在推进 ${activeNotion.map((i) => i.title).join("、")}`);
  }
  return parts.length > 0 ? parts.join("；") + "。" : "三端实时数据已同步。";
}

async function runAiSummary() {
  const el = document.getElementById("aiSummaryText");
  el.textContent = buildLocalSummary();
  if (!window.cowork || typeof window.cowork.askClaude !== "function") return;

  const compact = items
    .filter((i) => i.status !== "canceled" && i.status !== "done")
    .map((i) => ({
      id: i.id,
      source: i.source,
      title: i.title,
      status: i.rawStatus,
      priority: PRIORITY_META[i.priority].label,
      scope: i.scope,
      repo: i.repo,
      dueDate: i.dueDate,
      updatedAt: formatDateShort(i.updatedAt)
    }));

  try {
    const res = await window.cowork.askClaude(
      "你是用户的资深研发助理。请结合这份来自 GitHub、Linear 与 Notion 的真实活跃任务与 PR 列表，用自然简洁的中文输出不超过 2 句话的今日优先推进建议，点出最关键的编号、仓库或跨平台关联项（不要使用项目符号或 markdown 标题）。",
      [compact]
    );
    if (res && !res.isError && res.text && res.text.trim()) {
      el.textContent = res.text.trim();
    }
  } catch {
    // Keep local summary
  }
}

async function loadLiveData() {
  const badge = document.getElementById("syncBadge");
  const syncText = document.getElementById("syncText");
  const errEl = document.getElementById("errorBanner");
  loadStatus = { github: "loading", linear: "loading", notion: "loading", errors: [] };

  if (!window.cowork || typeof window.cowork.callMcpTool !== "function") {
    loadStatus = { github: "error", linear: "error", notion: "error", errors: [] };
    badge.classList.remove("is-loading");
    badge.classList.add("is-error");
    syncText.textContent = "未检测到 Cowork MCP 运行环境";
    errEl.textContent = "Star Board 需要作为 Claude Cowork 实时 Artifact 运行，并启用 GitHub、Linear 与 Notion MCP 连接器。请参考 README.md 完成配置。";
    errEl.classList.add("visible");
    renderAll();
    return;
  }

  const hasGithubConfig = Boolean(GITHUB_LOGIN && GITHUB_LOGIN !== "YOUR_GITHUB_USERNAME");
  const hasNotionConfig = Boolean(NOTION_TASK_DS_ID && NOTION_TASK_DS_ID !== "YOUR_NOTION_DATA_SOURCE_ID");
  const unconfigured = (msg) => Promise.reject(new Error(msg));

  const [ghPrRes, ghRepoRes, linIssRes, linProjRes, linTeamRes, notionRes] = await Promise.allSettled([
    hasGithubConfig ? window.cowork.callMcpTool("mcp__GitHub__search_pull_requests", {
      query: `involves:${GITHUB_LOGIN}`,
      sort: "updated",
      order: "desc",
      perPage: 25,
      fields: ["number", "title", "state", "draft", "html_url", "user", "created_at", "updated_at", "repository_url"]
    }) : unconfigured("请在 index.html 顶部 STAR_BOARD_CONFIG.githubLogin 中填写你的 GitHub 用户名"),
    hasGithubConfig ? window.cowork.callMcpTool("mcp__GitHub__search_repositories", {
      query: `user:${GITHUB_LOGIN}`,
      sort: "updated",
      order: "desc",
      perPage: 25,
      minimal_output: true
    }) : unconfigured("请在 STAR_BOARD_CONFIG.githubLogin 中配置 GitHub 用户名"),
    window.cowork.callMcpTool("mcp__Linear__list_issues", {
      limit: 100,
      orderBy: "updatedAt"
    }),
    window.cowork.callMcpTool("mcp__Linear__list_projects", {
      limit: 50
    }),
    window.cowork.callMcpTool("mcp__Linear__list_teams", {}),
    hasNotionConfig ? window.cowork.callMcpTool("mcp__Notion__notion-query-data-sources", {
      data: {
        mode: "rows",
        data_source_url: NOTION_TASK_DS,
        filter: {
          type: "group",
          operator: "and",
          filters: [
            {
              type: "property",
              property: "发送到归档",
              propertyType: "checkbox",
              operator: "checkbox_is_not",
              value: { type: "exact", value: true }
            },
            {
              type: "property",
              property: "状态",
              propertyType: "status",
              operator: "status_is_not",
              value: [
                { type: "is_option", value: "已完成" },
                { type: "is_option", value: "已关闭" }
              ]
            }
          ]
        },
        sort: [{ property: "到期", direction: "descending" }],
        limit: 50
      }
    }) : unconfigured("请在 index.html 顶部 STAR_BOARD_CONFIG.notionDataSourceId 中填写你的 Notion Data Source ID")
  ]);

  let ghPrs = [];
  let ghRepos = [];
  let linIssues = [];
  let linProjects = [];
  let notionRows = [];

  if (ghPrRes.status === "fulfilled") {
    try {
      ghPrs = unwrapMcp(ghPrRes.value).items;
      loadStatus.github = "ok";
    } catch (e) {
      loadStatus.github = isAuthExpiredError(e) ? "auth" : "error";
      loadStatus.errors.push(formatMcpError("GitHub", e));
    }
  } else {
    loadStatus.github = isAuthExpiredError(ghPrRes.reason) ? "auth" : "error";
    loadStatus.errors.push(formatMcpError("GitHub", ghPrRes.reason));
  }

  if (ghRepoRes.status === "fulfilled") {
    try {
      ghRepos = unwrapMcp(ghRepoRes.value).items;
    } catch (e) {
      if (loadStatus.github === "ok" || loadStatus.github === "loading") loadStatus.errors.push(formatMcpError("GitHub 仓库", e));
    }
  } else {
    if (loadStatus.github === "ok" || loadStatus.github === "loading") loadStatus.errors.push(formatMcpError("GitHub 仓库", ghRepoRes.reason));
  }

  if (linIssRes.status === "fulfilled") {
    try {
      linIssues = unwrapMcp(linIssRes.value).issues;
      loadStatus.linear = "ok";
    } catch (e) {
      loadStatus.linear = isAuthExpiredError(e) ? "auth" : "error";
      loadStatus.errors.push(formatMcpError("Linear", e));
    }
  } else {
    loadStatus.linear = isAuthExpiredError(linIssRes.reason) ? "auth" : "error";
    loadStatus.errors.push(formatMcpError("Linear", linIssRes.reason));
  }

  if (linProjRes.status === "fulfilled") {
    try {
      linProjects = unwrapMcp(linProjRes.value).projects;
    } catch (e) {
      if (loadStatus.linear === "ok" || loadStatus.linear === "loading") loadStatus.errors.push(formatMcpError("Linear 项目", e));
    }
  } else {
    if (loadStatus.linear === "ok" || loadStatus.linear === "loading") loadStatus.errors.push(formatMcpError("Linear 项目", linProjRes.reason));
  }

  if (linTeamRes.status === "fulfilled") {
    try {
      const parsedTeams = unwrapMcp(linTeamRes.value);
      if (Array.isArray(parsedTeams.teams) && parsedTeams.teams.length > 0) {
        linearTeams = parsedTeams.teams;
      }
    } catch {
      // Keep default teams fallback
    }
  }

  if (notionRes.status === "fulfilled") {
    try {
      notionRows = unwrapMcp(notionRes.value).results;
      loadStatus.notion = "ok";
    } catch (e) {
      loadStatus.notion = isAuthExpiredError(e) ? "auth" : "error";
      loadStatus.errors.push(formatMcpError("Notion", e));
    }
  } else {
    loadStatus.notion = isAuthExpiredError(notionRes.reason) ? "auth" : "error";
    loadStatus.errors.push(formatMcpError("Notion", notionRes.reason));
  }

  normalizeData(ghPrs, ghRepos, linIssues, linProjects, notionRows);

  if (loadStatus.errors.length > 0) {
    errEl.textContent = `部分数据源拉取异常：${loadStatus.errors.join("；")}`;
    errEl.classList.add("visible");
  } else {
    errEl.classList.remove("visible");
  }

  badge.classList.remove("is-loading", "is-error");
  const okCount = [loadStatus.github, loadStatus.linear, loadStatus.notion].filter((s) => s === "ok").length;
  if (okCount === 3) {
    syncText.textContent = "GitHub、Linear、Notion 三端双向同步";
  } else if (okCount > 0) {
    syncText.textContent = `已同步 ${okCount} / 3 个数据源`;
  } else {
    badge.classList.add("is-error");
    syncText.textContent = "实时数据拉取失败";
  }

  renderAll();
  runAiSummary();
}
