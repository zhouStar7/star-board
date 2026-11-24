const GITHUB_LOGIN = STAR_BOARD_CONFIG.githubLogin;
const NOTION_TASK_DS_ID = STAR_BOARD_CONFIG.notionDataSourceId;
const NOTION_TASK_DS = `collection://${NOTION_TASK_DS_ID}`;
const NOTION_CATEGORIES = STAR_BOARD_CONFIG.notionCategories;
const LINEAR_PRIORITY_TO_NUM = { urgent: 1, high: 2, medium: 3, low: 4, none: 0 };
const NOTION_PRIORITY_TO_LABEL = { urgent: "紧急", high: "重要", medium: "中", low: "不重要", none: "" };
const STORAGE_UI_KEY = "cowork_tri_board_ui_v3";
const STORAGE_NOTES_KEY = "cowork_tri_board_notes_v3";

const STATUS_META = {
  in_review: { label: "待审 / 评审中", cls: "st-in_review", order: 0 },
  in_progress: { label: "进行中", cls: "st-in_progress", order: 1 },
  todo: { label: "待办", cls: "st-todo", order: 2 },
  paused: { label: "暂缓 / Backlog", cls: "st-paused", order: 3 },
  done: { label: "已完成 / 已关闭", cls: "st-done", order: 4 },
  canceled: { label: "已取消", cls: "st-canceled", order: 5 }
};

// Per-source real remote status mappings for bi-directional sync
const SOURCE_STATUS_SPECS = {
  linear: {
    in_review: { remoteValue: "In Review", rawStatus: "In Review", optionLabel: "In Review", dropHint: "同步为 Linear · In Review" },
    in_progress: { remoteValue: "In Progress", rawStatus: "In Progress", optionLabel: "In Progress", dropHint: "同步为 Linear · In Progress" },
    todo: { remoteValue: "Todo", rawStatus: "Todo", optionLabel: "Todo", dropHint: "同步为 Linear · Todo" },
    paused: { remoteValue: "Backlog", rawStatus: "Backlog", optionLabel: "Backlog", dropHint: "同步为 Linear · Backlog" },
    done: { remoteValue: "Done", rawStatus: "Done", optionLabel: "Done", dropHint: "同步为 Linear · Done" },
    canceled: { remoteValue: "Canceled", rawStatus: "Canceled", optionLabel: "Canceled", dropHint: "同步为 Linear · Canceled" }
  },
  notion: {
    in_progress: { remoteValue: "进行中", rawStatus: "进行中", optionLabel: "进行中", dropHint: "同步为 Notion · 进行中" },
    todo: { remoteValue: "待办", rawStatus: "待办", optionLabel: "待办", dropHint: "同步为 Notion · 待办" },
    paused: { remoteValue: "暂缓", rawStatus: "暂缓", optionLabel: "暂缓", dropHint: "同步为 Notion · 暂缓" },
    done: { remoteValue: "已完成", rawStatus: "已完成", optionLabel: "已完成", dropHint: "同步为 Notion · 已完成" },
    canceled: { remoteValue: "已关闭", rawStatus: "已关闭", optionLabel: "已关闭", dropHint: "同步为 Notion · 已关闭" }
  },
  github: {
    in_review: { state: "open", draft: false, rawStatus: "Open PR", optionLabel: "Open PR", dropHint: "转为 GitHub Open PR（待审）" },
    in_progress: { state: "open", draft: true, rawStatus: "Draft PR", optionLabel: "Draft PR", dropHint: "转为 GitHub Draft PR（草稿）" },
    done: { state: "closed", draft: null, rawStatus: "已关闭 PR", optionLabel: "关闭 PR（不合并）", dropHint: "关闭 GitHub PR（不合并）" }
  }
};

const INCOMPATIBLE_REASONS = {
  notion: { in_review: "Notion 无「评审中」状态" },
  github: { todo: "GitHub PR 无「待办」状态", paused: "GitHub PR 无「暂缓」状态" }
};

const PRIORITY_META = {
  urgent: { label: "紧急", cls: "p-urgent", rank: 0 },
  high: { label: "重要 / 高", cls: "p-high", rank: 1 },
  medium: { label: "中", cls: "p-medium", rank: 2 },
  low: { label: "低", cls: "p-low", rank: 3 },
  none: { label: "未设", cls: "p-none", rank: 4 }
};

function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
}

const defaultUi = {
  view: "board",
  source: "all",
  status: "all",
  priority: "all",
  scope: "all",
  search: "",
  hideClosed: true,
  metricPreset: "all",
  sortBy: "date",
  sortDir: "asc"
};

let ui = Object.assign({}, defaultUi, safeGet(STORAGE_UI_KEY, {}));
let notesMap = safeGet(STORAGE_NOTES_KEY, {});
let items = [];
let linearProjects = [];
let linearTeams = [
  { name: STAR_BOARD_CONFIG.linearDefaultTeam, key: "ENG", displayName: STAR_BOARD_CONFIG.linearDefaultTeam, description: "" }
];
let githubRepos = [];
let selectedKey = null;
let draggingKey = null;
let suppressNextClick = false;
let createTarget = "linear";
let isCreatingTask = false;
let isParsingAi = false;
const syncingKeys = new Set();
let loadStatus = { github: "loading", linear: "loading", notion: "loading", errors: [] };

function persistUi() {
  safeSet(STORAGE_UI_KEY, ui);
}

function persistNotes() {
  safeSet(STORAGE_NOTES_KEY, notesMap);
}

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sourceSvg(source) {
  if (source === "github") {
    return `<svg width="14" height="14" viewBox="0 0 16 16" fill="#24292F" aria-hidden="true"><path d="M8 0.5a7.5 7.5 0 0 0-2.37 14.62c.38.07.52-.16.52-.36v-1.4c-2.1.46-2.54-.89-2.54-.89-.34-.87-.84-1.1-.84-1.1-.69-.47.05-.46.05-.46.76.05 1.16.78 1.16.78.68 1.16 1.77.82 2.2.63.07-.49.26-.82.48-1.01-1.68-.19-3.44-.84-3.44-3.73 0-.82.3-1.5.78-2.03-.08-.19-.34-.96.07-2 0 0 .64-.2 2.08.78a7.2 7.2 0 0 1 3.8 0c1.44-.98 2.08-.78 2.08-.78.41 1.04.15 1.81.07 2 .49.53.78 1.21.78 2.03 0 2.9-1.76 3.54-3.45 3.73.27.23.52.7.52 1.41v2.09c0 .2.14.43.52.36A7.5 7.5 0 0 0 8 .5Z"/></svg>`;
  }
  if (source === "linear") {
    return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.5" stroke="#5E6AD2" stroke-width="1.6"/><path d="M3.3 9.7L6.3 12.7M2.6 7.1L8.9 13.4M4.3 4.8L11.2 11.7" stroke="#5E6AD2" stroke-width="1.35" stroke-linecap="round"/></svg>`;
  }
  return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2" stroke="#37352F" stroke-width="1.5"/><path d="M5.4 11V5l5.2 6V5" stroke="#37352F" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function gripSvg() {
  return `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.15"/><circle cx="7" cy="3" r="1.15"/><circle cx="3" cy="7" r="1.15"/><circle cx="7" cy="7" r="1.15"/><circle cx="3" cy="11" r="1.15"/><circle cx="7" cy="11" r="1.15"/></svg>`;
}

function showToast(message, type = "info", action = null) {
  const wrap = document.getElementById("toastWrap");
  const toast = document.createElement("div");
  toast.className = `toast ${type === "ok" ? "is-ok" : type === "error" ? "is-error" : type === "warn" ? "is-warn" : ""}`;
  const span = document.createElement("span");
  span.textContent = message;
  toast.appendChild(span);

  if (action && action.label && typeof action.onClick === "function") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      action.onClick();
      toast.remove();
    });
    toast.appendChild(btn);
  }

  wrap.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, type === "error" ? 6000 : 4200);
}

function unwrapMcp(res) {
  if (!res) throw new Error("Empty MCP response");
  if (res.isError) {
    const msg = res.content && res.content[0] && res.content[0].text ? res.content[0].text : "MCP 工具调用返回错误";
    throw new Error(msg);
  }
  if (res.structuredContent !== undefined && res.structuredContent !== null) {
    return res.structuredContent;
  }
  const txt = res.content && res.content[0] && res.content[0].text;
  if (typeof txt === "string") {
    return JSON.parse(txt);
  }
  throw new Error("MCP 返回格式无法解析");
}

function isAuthExpiredError(rawErr) {
  const msg = String(rawErr && rawErr.message ? rawErr.message : rawErr || "");
  return /401|Bad credentials|unauthorized|signed in again|reconnect/i.test(msg);
}

function formatMcpError(prefix, rawErr) {
  const msg = String(rawErr && rawErr.message ? rawErr.message : rawErr || "未知错误");
  if (isAuthExpiredError(msg)) {
    return `${prefix}登录态已过期，请在 Claude Desktop 的 Settings → Connectors（或 Customize → Connectors）中点击 ${prefix} 的 Reconnect 重新授权，然后刷新看板`;
  }
  return `${prefix}: ${msg}`;
}

function checkWriteResult(res) {
  if (!res) throw new Error("未收到 MCP 返回结果");
  if (res.isError) {
    const msg = res.content && res.content[0] && res.content[0].text ? res.content[0].text : "远程状态写入失败";
    throw new Error(msg);
  }
  return res;
}
