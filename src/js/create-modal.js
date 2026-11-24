// Bind UI Events
document.getElementById("btnViewTable").addEventListener("click", () => {
  ui.view = "table";
  if (ui.metricPreset === "projects") ui.metricPreset = "all";
  persistUi();
  renderAll();
});

document.getElementById("btnViewBoard").addEventListener("click", () => {
  ui.view = "board";
  if (ui.metricPreset === "projects") ui.metricPreset = "all";
  persistUi();
  renderAll();
});

document.getElementById("btnViewProjects").addEventListener("click", () => {
  ui.view = "projects";
  ui.metricPreset = "projects";
  persistUi();
  renderAll();
});

document.getElementById("searchInput").addEventListener("input", (e) => {
  ui.search = e.target.value;
  persistUi();
  renderMain();
  syncControls();
});

document.getElementById("statusFilter").addEventListener("change", (e) => {
  ui.status = e.target.value;
  ui.metricPreset = "all";
  persistUi();
  renderAll();
});

document.getElementById("priorityFilter").addEventListener("change", (e) => {
  ui.priority = e.target.value;
  ui.metricPreset = "all";
  persistUi();
  renderAll();
});

document.getElementById("scopeFilter").addEventListener("change", (e) => {
  ui.scope = e.target.value;
  persistUi();
  renderAll();
});

document.getElementById("chkHideClosed").addEventListener("change", (e) => {
  ui.hideClosed = e.target.checked;
  persistUi();
  renderAll();
});

// ==================== Create Task Modal + AI Quick Parse ====================
function getTodayLocalIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysLocalIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWeekdayZh(dateObj) {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][dateObj.getDay()];
}

function populateCreateModalOptions() {
  const teamSel = document.getElementById("cfLinearTeam");
  const prevTeam = teamSel.value;
  teamSel.innerHTML = linearTeams.map((t) => {
    const label = t.description ? `${t.name}（${t.description}）` : (t.displayName || t.name);
    return `<option value="${escapeHtml(t.name)}">${escapeHtml(label)}</option>`;
  }).join("");
  if (linearTeams.some((t) => t.name === prevTeam)) {
    teamSel.value = prevTeam;
  } else if (linearTeams.some((t) => t.name === STAR_BOARD_CONFIG.linearDefaultTeam)) {
    teamSel.value = STAR_BOARD_CONFIG.linearDefaultTeam;
  }

  const projSel = document.getElementById("cfLinearProject");
  const prevProj = projSel.value;
  projSel.innerHTML = `<option value="">暂不关联项目</option>` +
    linearProjects.map((p) => {
      const label = p.repo ? `${p.name}（${p.repo}）` : p.name;
      return `<option value="${escapeHtml(p.name)}">${escapeHtml(label)}</option>`;
    }).join("");
  if (linearProjects.some((p) => p.name === prevProj)) {
    projSel.value = prevProj;
  }
}

function refreshCreatePlatformAvailability() {
  const linSub = document.getElementById("targetLinearSub");
  const notSub = document.getElementById("targetNotionSub");
  const submitBtn = document.getElementById("btnSubmitCreateTask");
  const hintEl = document.getElementById("createTargetHint");

  if (loadStatus.linear === "auth") {
    linSub.className = "platform-opt-warn";
    linSub.textContent = "需重新登录";
  } else if (loadStatus.linear === "error") {
    linSub.className = "platform-opt-warn";
    linSub.textContent = "连接异常";
  } else {
    linSub.className = "platform-opt-sub";
    linSub.textContent = "研发 / 项目";
  }

  if (loadStatus.notion === "auth") {
    notSub.className = "platform-opt-warn";
    notSub.textContent = "需重新登录";
  } else if (loadStatus.notion === "error") {
    notSub.className = "platform-opt-warn";
    notSub.textContent = "连接异常";
  } else {
    notSub.className = "platform-opt-sub";
    notSub.textContent = "个人 / AI工程";
  }

  const targetState = createTarget === "linear" ? loadStatus.linear : loadStatus.notion;
  if (targetState === "auth" || targetState === "error") {
    submitBtn.disabled = true;
    hintEl.textContent = createTarget === "linear"
      ? "Linear 当前不可写入，请先重连或切换至 Notion"
      : "Notion 当前不可写入，请先重连或切换至 Linear";
    hintEl.style.color = "var(--danger)";
  } else {
    submitBtn.disabled = isCreatingTask;
    hintEl.textContent = createTarget === "linear"
      ? "将实时写入 Linear"
      : `将实时写入 Notion「${STAR_BOARD_CONFIG.notionDatabaseName}」`;
    hintEl.style.color = "";
  }
}

function setCreateTarget(target) {
  createTarget = target === "notion" ? "notion" : "linear";
  document.getElementById("btnTargetLinear").setAttribute("aria-pressed", String(createTarget === "linear"));
  document.getElementById("btnTargetNotion").setAttribute("aria-pressed", String(createTarget === "notion"));
  document.getElementById("linearFieldsGroup").style.display = createTarget === "linear" ? "flex" : "none";
  document.getElementById("notionFieldsGroup").style.display = createTarget === "notion" ? "flex" : "none";
  document.getElementById("cfDescLabel").textContent = createTarget === "linear" ? "任务说明（Markdown，可选）" : "页面正文补充（可选）";
  refreshCreatePlatformAvailability();
}

function flashPrefilledControls(ids) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("is-prefilled");
    setTimeout(() => el.classList.remove("is-prefilled"), 1800);
  });
}

function openCreateModal(preset = {}) {
  populateCreateModalOptions();
  document.getElementById("createTaskForm").reset();
  document.getElementById("aiQuickInput").value = "";
  const fb = document.getElementById("aiParseFeedback");
  fb.textContent = "";
  fb.className = "ai-parse-feedback";

  // Context-aware target selection
  let target = preset.source;
  if (!target) {
    if (preset.status === "in_review") {
      target = "linear";
    } else if (ui.source === "linear" || ui.source === "notion") {
      target = ui.source;
    } else if (ui.scope !== "all" && linearProjects.some((p) => p.name === ui.scope)) {
      target = "linear";
    } else if (ui.scope !== "all" && NOTION_CATEGORIES.includes(ui.scope)) {
      target = "notion";
    } else if (loadStatus.linear !== "ok" && loadStatus.notion === "ok") {
      target = "notion";
    } else {
      target = "linear";
    }
  }
  setCreateTarget(target);

  // Context-aware status pre-fill
  const rawStatus = preset.status || (ui.status !== "all" ? ui.status : "todo");
  const linearState = ["todo", "in_progress", "in_review", "paused"].includes(rawStatus) ? rawStatus : "todo";
  const notionState = ["todo", "in_progress", "paused"].includes(rawStatus) ? rawStatus : "todo";
  document.getElementById("cfLinearState").value = linearState;
  document.getElementById("cfNotionState").value = notionState;

  // Context-aware priority pre-fill
  if (ui.priority !== "all" && ui.priority !== "none") {
    document.getElementById("cfLinearPriority").value = ui.priority;
    document.getElementById("cfNotionPriority").value = ui.priority;
  }

  // Context-aware project / category pre-fill
  const initProject = preset.project || (ui.scope !== "all" && linearProjects.some((p) => p.name === ui.scope) ? ui.scope : "");
  if (initProject) {
    document.getElementById("cfLinearProject").value = initProject;
  }
  const initCat = preset.category || (ui.scope !== "all" && NOTION_CATEGORIES.includes(ui.scope) ? ui.scope : "");
  if (initCat) {
    document.getElementById("cfNotionCategory").value = initCat;
  }

  document.getElementById("createModalWrap").classList.add("open");
  if (preset.status || preset.project || preset.category) {
    document.getElementById("cfTitle").focus();
  } else {
    document.getElementById("aiQuickInput").focus();
  }
}

function closeCreateModal() {
  if (isCreatingTask) return;
  document.getElementById("createModalWrap").classList.remove("open");
}

function localFallbackParse(text) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();
  let source = createTarget;
  let project = "";
  let team = (linearTeams[0] && linearTeams[0].name) || STAR_BOARD_CONFIG.linearDefaultTeam;
  let category = "";
  let status = "todo";
  let priority = "none";
  let energy = "";
  let dueDate = "";

  // Match Linear project or repo keywords dynamically
  for (const p of linearProjects) {
    const tokens = String(p.name || "").split(/[\s·\-_/()（）]+/).filter((w) => w.length >= 2);
    if (
      raw.includes(p.name) ||
      (p.repo && lower.includes(p.repo.toLowerCase())) ||
      tokens.some((tok) => raw.toLowerCase().includes(tok.toLowerCase()))
    ) {
      project = p.name;
      source = "linear";
      break;
    }
  }

  // Match Notion category keywords if not already matched to a Linear project
  if (!project) {
    if (/ai工程|harness|agent|mcp|skill|claude|deepseek|llm|模型/i.test(raw)) {
      source = "notion";
      category = "AI工程";
    } else if (/学习|阅读|看书|教程|调研|笔记|课程/.test(raw)) {
      source = "notion";
      category = "学习";
    } else if (/生活|健身|食谱|买|猫|体检|旅游|家/.test(raw)) {
      source = "notion";
      category = "生活";
    } else if (/接口|联调|bug|修复|上线|部署|研发|重构|pr|issue/.test(lower)) {
      source = "linear";
    }
  }

  if (/评审|review/i.test(raw)) status = source === "linear" ? "in_review" : "in_progress";
  else if (/进行中|马上开始|今天开始|正在做/.test(raw)) status = "in_progress";
  else if (/暂缓|以后|backlog|低优先搁置/i.test(raw)) status = "paused";

  if (/紧急|立刻|马上|p0|urgent/i.test(raw)) priority = "urgent";
  else if (/高优|重要|优先|尽快|p1|high/i.test(raw)) priority = "high";
  else if (/中等|普通|p2/i.test(raw)) priority = "medium";
  else if (/不重要|低优|顺手|p3/i.test(raw)) priority = "low";

  if (/高能量|烧脑|深度/.test(raw)) energy = "高";
  else if (/低能量|轻松|琐碎/.test(raw)) energy = "低";

  const isoMatch = raw.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    dueDate = isoMatch[1];
  } else if (/今天|今日/.test(raw)) {
    dueDate = getTodayLocalIso();
  } else if (/明天|明日/.test(raw)) {
    dueDate = addDaysLocalIso(1);
  } else if (/后天/.test(raw)) {
    dueDate = addDaysLocalIso(2);
  } else {
    const wdMap = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 0, "天": 0 };
    const wdMatch = raw.match(/(下周|本周|周|星期)([一二三四五六日天])/);
    if (wdMatch) {
      const isNext = wdMatch[1] === "下周";
      const targetDay = wdMap[wdMatch[2]];
      const now = new Date();
      let diff = targetDay - now.getDay();
      if (isNext) {
        diff += 7;
      } else if (diff < 0) {
        diff += 7;
      }
      dueDate = addDaysLocalIso(diff);
    }
  }

  // Clean title gently
  let title = raw
    .replace(/^(今天|明天|后天|本周[一二三四五六日天]|下周[一二三四五六日天]|周[一二三四五六日天])(前|之前)?[，,、\s]*/g, "")
    .replace(/[，,、\s]*(紧急|高优|高优先级|重要|低优|不重要|进行中|暂缓)$/g, "")
    .trim();
  if (!title) title = raw;

  return {
    source,
    title,
    team,
    project,
    category,
    status,
    priority,
    energy,
    dueDate,
    description: "",
    reason: source === "linear"
      ? `已按本地规则归入 Linear${project ? `「${project}」` : ""}${dueDate ? `，截止 ${dueDate}` : ""}，请确认后创建。`
      : `已按本地规则归入 Notion${category ? `「${category}」` : ""}${dueDate ? `，计划日 ${dueDate}` : ""}，请确认后创建。`
  };
}

function applyParsedFields(parsed) {
  const touched = [];
  const target = parsed.source === "notion" ? "notion" : "linear";
  setCreateTarget(target);

  if (parsed.title && String(parsed.title).trim()) {
    document.getElementById("cfTitle").value = String(parsed.title).trim();
    touched.push("cfTitle");
  }

  if (target === "linear") {
    if (parsed.team && linearTeams.some((t) => t.name === parsed.team)) {
      document.getElementById("cfLinearTeam").value = parsed.team;
      touched.push("cfLinearTeam");
    }
    if (parsed.project && linearProjects.some((p) => p.name === parsed.project)) {
      document.getElementById("cfLinearProject").value = parsed.project;
      touched.push("cfLinearProject");
    } else {
      document.getElementById("cfLinearProject").value = "";
    }
    const st = ["todo", "in_progress", "in_review", "paused"].includes(parsed.status) ? parsed.status : "todo";
    document.getElementById("cfLinearState").value = st;
    touched.push("cfLinearState");

    const pr = ["urgent", "high", "medium", "low", "none"].includes(parsed.priority) ? parsed.priority : "none";
    document.getElementById("cfLinearPriority").value = pr;
    if (pr !== "none") touched.push("cfLinearPriority");

    if (parsed.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dueDate)) {
      document.getElementById("cfLinearDue").value = parsed.dueDate;
      touched.push("cfLinearDue");
    }
  } else {
    if (parsed.category && NOTION_CATEGORIES.includes(parsed.category)) {
      document.getElementById("cfNotionCategory").value = parsed.category;
      touched.push("cfNotionCategory");
    } else {
      document.getElementById("cfNotionCategory").value = "";
    }
    const st = ["todo", "in_progress", "paused"].includes(parsed.status) ? parsed.status : "todo";
    document.getElementById("cfNotionState").value = st;
    touched.push("cfNotionState");

    const pr = ["urgent", "high", "medium", "low", "none"].includes(parsed.priority) ? parsed.priority : "none";
    document.getElementById("cfNotionPriority").value = pr;
    if (pr !== "none") touched.push("cfNotionPriority");

    if (["高", "中", "低"].includes(parsed.energy)) {
      document.getElementById("cfNotionEnergy").value = parsed.energy;
      touched.push("cfNotionEnergy");
    }
    if (parsed.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dueDate)) {
      document.getElementById("cfNotionDue").value = parsed.dueDate;
      touched.push("cfNotionDue");
    }
  }

  if (parsed.description && String(parsed.description).trim()) {
    document.getElementById("cfDesc").value = String(parsed.description).trim();
    touched.push("cfDesc");
  }

  flashPrefilledControls(touched);
  const fb = document.getElementById("aiParseFeedback");
  fb.textContent = parsed.reason || "已智能预填下方表单，请确认无误后点击「创建并同步」。";
  fb.className = "ai-parse-feedback visible";
}

async function runAiQuickParse() {
  if (isParsingAi) return;
  const inputEl = document.getElementById("aiQuickInput");
  const rawText = inputEl.value.trim();
  const fb = document.getElementById("aiParseFeedback");
  if (!rawText) {
    fb.textContent = "请先输入一句话描述，例如：周五前完成登录接口联调，重要";
    fb.className = "ai-parse-feedback visible is-warn";
    inputEl.focus();
    return;
  }

  const btn = document.getElementById("btnAiParse");
  isParsingAi = true;
  btn.disabled = true;
  btn.textContent = "解析中…";
  fb.textContent = "正在识别目标平台、项目/分类与日期…";
  fb.className = "ai-parse-feedback visible";

  const now = new Date();
  const todayIso = getTodayLocalIso();
  const weekday = getWeekdayZh(now);
  const context = {
    today: `${todayIso} (${weekday})`,
    linearTeams: linearTeams.map((t) => ({ name: t.name, description: t.description || "" })),
    linearProjects: linearProjects.map((p) => ({ name: p.name, repo: p.repo || "" })),
    notionCategories: NOTION_CATEGORIES,
    notionEnergies: ["高", "中", "低"]
  };

  let parsed = null;
  try {
    if (window.cowork && typeof window.cowork.askClaude === "function") {
      const prompt = [
        "你是任务录入解析助手。请把用户输入的一句话任务描述解析为严格 JSON 对象（不要输出任何 markdown 代码块或额外解释文字）。",
        "归属判断规则：涉及研发项目、代码仓库、接口联调、修复 Bug、版本发布的任务归 Linear；涉及个人生活、学习计划、阅读、AI工程探索或个人待办的任务归 Notion。",
        "字段要求：",
        '- source: "linear" 或 "notion"',
        "- title: 提炼后的简洁任务标题（去除时间与优先级修饰词）",
        `- team: Linear 团队名（必须在 linearTeams 中，默认 "${STAR_BOARD_CONFIG.linearDefaultTeam}"）`,
        "- project: 若归 Linear 且能匹配到某个 linearProjects，填完全一致的 name，否则填 \"\"",
        "- category: 若归 Notion 且能匹配 notionCategories（工作/AI工程/学习/生活），填对应项，否则填 \"\"",
        '- status: "todo" | "in_progress" | "in_review" | "paused"（注意 Notion 无 in_review）',
        '- priority: "urgent" | "high" | "medium" | "low" | "none"',
        '- energy: Notion 能量 "高" | "中" | "低" | ""',
        '- dueDate: "YYYY-MM-DD" 或 ""（请基于 today 准确推算相对日期，如明天、周五前、下周一）',
        "- description: 可选补充说明，没有则 \"\"",
        "- reason: 用 1 句简短中文说明预填依据（如：已匹配 Linear「xxx」项目，截止 yyyy-mm-dd）",
        `用户输入：${rawText}`
      ].join("\n");

      const res = await window.cowork.askClaude(prompt, [context]);
      if (res && !res.isError && res.text) {
        const clean = res.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      }
    }
  } catch {
    parsed = null;
  } finally {
    isParsingAi = false;
    btn.disabled = false;
    btn.textContent = "智能解析";
  }

  if (!parsed || typeof parsed !== "object") {
    parsed = localFallbackParse(rawText);
  }
  applyParsedFields(parsed);
  document.getElementById("btnSubmitCreateTask").focus();
}

async function createNotionPageRobust(propsObj, contentText) {
  const pageWithObj = { properties: propsObj };
  if (contentText) pageWithObj.content = contentText;
  const pageWithStr = { properties: JSON.stringify(propsObj) };
  if (contentText) pageWithStr.content = contentText;

  const attempts = [
    { parent: { data_source_id: NOTION_TASK_DS_ID }, pages: [pageWithObj] },
    { parent: { type: "data_source_id", data_source_id: NOTION_TASK_DS_ID }, pages: [pageWithObj] },
    { parent: { data_source_id: NOTION_TASK_DS_ID }, pages: [pageWithStr] },
    { parent: { type: "data_source_id", data_source_id: NOTION_TASK_DS_ID }, pages: [pageWithStr] }
  ];

  let lastErr = null;
  for (const payload of attempts) {
    try {
      const res = await window.cowork.callMcpTool("mcp__Notion__notion-create-pages", payload);
      if (res && !res.isError) {
        return res;
      }
      const errMsg = (res && res.content && res.content[0] && res.content[0].text) || "Notion 页面创建失败";
      lastErr = new Error(errMsg);
      if (!/string|JSON|invalid_type|object|parent|data_source|schema|Expected/i.test(errMsg)) {
        throw lastErr;
      }
    } catch (err) {
      lastErr = err;
      const msg = String(err && err.message ? err.message : err);
      if (!/string|JSON|invalid_type|object|parent|data_source|schema|Expected/i.test(msg)) {
        throw err;
      }
    }
  }
  throw lastErr || new Error("Notion 页面创建失败");
}

async function handleCreateTaskSubmit(e) {
  e.preventDefault();
  if (isCreatingTask) return;

  const title = document.getElementById("cfTitle").value.trim();
  if (!title) {
    document.getElementById("cfTitle").focus();
    return;
  }

  const desc = document.getElementById("cfDesc").value.trim();
  const submitBtn = document.getElementById("btnSubmitCreateTask");
  isCreatingTask = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "创建中…";

  try {
    let newItem = null;
    const nowIso = new Date().toISOString();

    if (createTarget === "linear") {
      const team = document.getElementById("cfLinearTeam").value || (linearTeams[0] && linearTeams[0].name) || STAR_BOARD_CONFIG.linearDefaultTeam;
      const project = document.getElementById("cfLinearProject").value || "";
      const statusKey = document.getElementById("cfLinearState").value || "todo";
      const prioKey = document.getElementById("cfLinearPriority").value || "none";
      const dueDate = document.getElementById("cfLinearDue").value || "";
      const stateSpec = SOURCE_STATUS_SPECS.linear[statusKey] || SOURCE_STATUS_SPECS.linear.todo;

      const args = {
        title,
        team,
        state: stateSpec.remoteValue
      };
      if (project) args.project = project;
      if (LINEAR_PRIORITY_TO_NUM[prioKey] > 0) args.priority = LINEAR_PRIORITY_TO_NUM[prioKey];
      if (dueDate) args.dueDate = dueDate;
      if (desc) args.description = desc;

      const rawRes = await window.cowork.callMcpTool("mcp__Linear__save_issue", args);
      checkWriteResult(rawRes);

      let created = {};
      try {
        const parsed = unwrapMcp(rawRes);
        created = parsed.issue || parsed;
      } catch {
        created = {};
      }

      const issueId = created.identifier || created.id || `NEW-${Date.now().toString().slice(-4)}`;
      const matchedProj = linearProjects.find((p) => p.name === project);
      newItem = {
        key: `linear:${issueId}`,
        id: issueId,
        source: "linear",
        title: created.title || title,
        status: statusKey,
        rawStatus: created.status || stateSpec.rawStatus,
        priority: prioKey,
        scope: project || `团队 ${team}`,
        subKind: `Linear / ${team}`,
        repo: matchedProj ? matchedProj.repo : null,
        branch: created.gitBranchName || null,
        dueDate: dueDate || null,
        updatedAt: created.updatedAt || nowIso,
        assignee: STAR_BOARD_CONFIG.linearDefaultAssignee,
        url: created.url || STAR_BOARD_CONFIG.linearWorkspaceUrl,
        description: desc || ""
      };
    } else {
      const category = document.getElementById("cfNotionCategory").value || "";
      const statusKey = document.getElementById("cfNotionState").value || "todo";
      const prioKey = document.getElementById("cfNotionPriority").value || "none";
      const energy = document.getElementById("cfNotionEnergy").value || "";
      const dueDate = document.getElementById("cfNotionDue").value || "";
      const stateSpec = SOURCE_STATUS_SPECS.notion[statusKey] || SOURCE_STATUS_SPECS.notion.todo;
      const importanceLabel = NOTION_PRIORITY_TO_LABEL[prioKey] || "";

      const propsObj = {
        "任务": title,
        "状态": stateSpec.remoteValue
      };
      if (category) propsObj["分类"] = category;
      if (importanceLabel) propsObj["重要性"] = importanceLabel;
      if (energy) propsObj["能量"] = energy;
      if (dueDate) {
        propsObj["date:到期:start"] = dueDate;
        propsObj["date:到期:is_datetime"] = 0;
      }

      const rawRes = await createNotionPageRobust(propsObj, desc);
      checkWriteResult(rawRes);

      let created = {};
      try {
        const parsed = unwrapMcp(rawRes);
        created = (parsed.pages && parsed.pages[0]) || (parsed.results && parsed.results[0]) || parsed;
      } catch {
        created = {};
      }

      const pageUrl = created.url || "";
      const rawPageId = created.id ? String(created.id).replaceAll("-", "") : extractNotionPageId(pageUrl);
      const shortId = rawPageId ? rawPageId.slice(-6).toUpperCase() : Date.now().toString(36).slice(-6).toUpperCase();

      newItem = {
        key: `notion:${rawPageId || pageUrl || Date.now()}`,
        id: `NT-${shortId}`,
        source: "notion",
        notionPageId: rawPageId,
        title,
        status: statusKey,
        rawStatus: stateSpec.rawStatus,
        priority: prioKey,
        scope: category || "未分类任务",
        subKind: energy ? `Notion 任务 · 能量${energy}` : `Notion ${STAR_BOARD_CONFIG.notionDatabaseName}`,
        repo: null,
        branch: null,
        dueDate: dueDate || null,
        updatedAt: dueDate || nowIso,
        assignee: STAR_BOARD_CONFIG.notionDefaultAssignee,
        url: pageUrl || STAR_BOARD_CONFIG.notionDatabaseUrl,
        description: desc || `来自 Notion「${STAR_BOARD_CONFIG.notionDatabaseName}」。当前状态：${stateSpec.rawStatus}${category ? `，分类：${category}` : ""}${importanceLabel ? `，重要性：${importanceLabel}` : ""}${dueDate ? `，计划到期日：${dueDate}` : ""}。`
      };
    }

    items.unshift(newItem);
    isCreatingTask = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "创建并同步";
    closeCreateModal();
    renderAll();
    runAiSummary();

    const visibleNow = ui.view !== "projects" && getFilteredItems().some((i) => i.key === newItem.key);
    const srcName = newItem.source === "linear" ? "Linear" : "Notion";
    showToast(
      visibleNow
        ? `已创建并同步至 ${srcName}：${newItem.id} ${newItem.title}`
        : `已创建 ${newItem.id}（当前视图或筛选未显示）`,
      "ok",
      visibleNow
        ? {
            label: "查看详情",
            onClick: () => openDrawer(newItem.key)
          }
        : {
            label: "定位查看",
            onClick: () => {
              if (ui.view === "projects") ui.view = "board";
              clearFilters();
              openDrawer(newItem.key);
            }
          }
    );
  } catch (err) {
    isCreatingTask = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "创建并同步";
    showToast(`创建失败：${formatMcpError(createTarget === "linear" ? "Linear" : "Notion", err)}`, "error");
  }
}

document.getElementById("targetLinearIcon").innerHTML = sourceSvg("linear");
document.getElementById("targetNotionIcon").innerHTML = sourceSvg("notion");

document.getElementById("btnNewTask").addEventListener("click", () => openCreateModal());
document.getElementById("btnCloseCreateModal").addEventListener("click", closeCreateModal);
document.getElementById("btnCancelCreateModal").addEventListener("click", closeCreateModal);
document.getElementById("createModalWrap").addEventListener("click", (e) => {
  if (e.target.id === "createModalWrap") closeCreateModal();
});
document.getElementById("btnTargetLinear").addEventListener("click", () => setCreateTarget("linear"));
document.getElementById("btnTargetNotion").addEventListener("click", () => setCreateTarget("notion"));
document.getElementById("btnAiParse").addEventListener("click", runAiQuickParse);
document.getElementById("aiQuickInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    runAiQuickParse();
  }
});
document.getElementById("createTaskForm").addEventListener("submit", handleCreateTaskSubmit);

document.getElementById("btnClearFilters").addEventListener("click", clearFilters);
document.getElementById("drawerBackdrop").addEventListener("click", closeDrawer);
document.getElementById("btnCloseDrawer").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const modalOpen = document.getElementById("createModalWrap").classList.contains("open");
    if (modalOpen) {
      closeCreateModal();
    } else {
      closeDrawer();
    }
    return;
  }
  if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (document.getElementById("createModalWrap").classList.contains("open")) return;
    e.preventDefault();
    openCreateModal();
  }
});

renderConnectorFooter();
loadLiveData();
