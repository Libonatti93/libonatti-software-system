const state = {
  csrf: "",
  dashboard: null,
  workflows: [],
  selectedWorkflow: null,
  notes: [],
  agents: [],
  agentInfo: null,
  radar: null,
  radarFilter: "todos",
  events: null,
  cesarFrame: 0,
  cesarMapAbort: null,
  editingNoteId: null
};

const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
})[character]);

function formatDate(value, withTime = true) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(new Date(value));
}

function relativeTime(value) {
  if (!value) return "sem leitura";
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "agora";
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `há ${Math.floor(seconds / 3600)} h`;
  return `há ${Math.floor(seconds / 86400)} d`;
}

function statusLabel(status) {
  return {
    success: "Sucesso",
    warning: "Atenção",
    error: "Erro",
    running: "Executando"
  }[status] || status;
}

function workflowName(id) {
  return state.workflows.find((workflow) => workflow.id === id)?.name || id;
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  window.setTimeout(() => element.classList.remove("show"), 3200);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  if (options.method && options.method !== "GET") headers["X-LIOS-CSRF"] = state.csrf;
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    showLogin();
    throw new Error(payload.error || "Sessão expirada.");
  }
  if (!response.ok) throw new Error(payload.error || "Não foi possível concluir.");
  return payload;
}

function showLogin() {
  if (state.events) state.events.close();
  $("#app-shell").hidden = true;
  $("#login-shell").hidden = false;
}

function showApp() {
  $("#login-shell").hidden = true;
  $("#app-shell").hidden = false;
}

async function bootstrap() {
  const response = await fetch("/api/auth/status");
  const auth = await response.json();
  if (!auth.authenticated) {
    showLogin();
    return;
  }
  state.csrf = auth.csrf;
  showApp();
  await loadAll();
  connectEvents();
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  $("#login-error").textContent = "";
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const payload = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("#username").value,
        password: $("#password").value
      })
    });
    state.csrf = payload.csrf;
    form.reset();
    showApp();
    await loadAll();
    connectEvents();
  } catch (error) {
    $("#login-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("#logout").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    showLogin();
  }
});

async function loadAll() {
  const [dashboard, workflowPayload, notePayload, agentPayload, radar] = await Promise.all([
    api("/api/dashboard"),
    api("/api/workflows"),
    api("/api/notes"),
    api("/api/agents"),
    api("/api/editorial-radar")
  ]);
  state.dashboard = dashboard;
  state.workflows = workflowPayload.workflows;
  state.notes = notePayload.notes;
  state.agents = agentPayload.agents;
  state.agentInfo = agentPayload;
  state.radar = radar;
  state.selectedWorkflow ||= state.workflows[0]?.id;
  renderAll();
}

function renderAll() {
  renderDashboard();
  renderWorkflows();
  renderNotes();
  renderAgents();
  renderAudit();
  renderRadar();
}

function renderRadar() {
  if (!state.radar) return;
  const { signals = [], sourceStatus = {}, updatedAt, scope = [] } = state.radar;
  $("#radar-status-grid").innerHTML = Object.entries(sourceStatus).length
    ? Object.values(sourceStatus).map((source) => `
      <article class="radar-source ${source.ok ? "source-ok" : source.stale ? "source-stale" : "source-error"}">
        <span>${esc(source.label)}</span>
        <strong>${source.ok || source.stale ? esc(source.count) : "!"}</strong>
        <small>${source.ok ? "sinais relevantes" : source.stale ? "última leitura preservada" : esc(source.error || "Fonte indisponível")}</small>
      </article>
    `).join("")
    : '<div class="empty-state">A primeira coleta será executada automaticamente.</div>';
  $("#radar-freshness").textContent = updatedAt ? `Atualizado ${relativeTime(updatedAt)} · ciclo de 12 min` : "Aguardando primeira coleta";
  $("#radar-total").textContent = `${signals.length} ${signals.length === 1 ? "sinal" : "sinais"}`;

  const filters = [["todos", "Todos"], ...scope.map((label) => [
    label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR"),
    label
  ])];
  $("#radar-filters").innerHTML = filters.map(([id, label]) => `
    <button class="${state.radarFilter === id ? "active" : ""}" data-radar-filter="${esc(id)}">${esc(label)}</button>
  `).join("");
  $$("[data-radar-filter]").forEach((button) => button.addEventListener("click", () => {
    state.radarFilter = button.dataset.radarFilter;
    renderRadar();
  }));

  const visible = state.radarFilter === "todos"
    ? signals
    : signals.filter((item) => item.category === state.radarFilter);
  $("#radar-grid").innerHTML = visible.length ? visible.slice(0, 60).map((item) => `
    <article class="radar-card">
      <header>
        <span class="radar-category">${esc(item.categoryLabel)}</span>
        <b class="recommendation recommendation-${esc(item.recommendation.toLocaleLowerCase("pt-BR"))}">${esc(item.recommendation)}</b>
      </header>
      <h3>${esc(item.title)}</h3>
      <p>${esc(item.context)}</p>
      <div class="radar-score">
        <div><i style="width:${Math.max(0, Math.min(100, Number(item.score) || 0))}%"></i></div>
        <strong>${esc(item.score)}/100</strong>
      </div>
      <footer>
        <span>${esc(item.sourceLabel)} · ${esc(item.signalLabel)}</span>
        <a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Abrir fonte ↗</a>
      </footer>
    </article>
  `).join("") : '<div class="empty-state">Nenhum sinal relevante nesta categoria na coleta atual.</div>';
}

function renderDashboard() {
  if (!state.dashboard) return;
  const { summary, latestRuns, activity, generatedAt } = state.dashboard;
  const metrics = [
    ["DISPONIBILIDADE AGORA", summary.uptimePercent == null ? "—" : `${summary.uptimePercent}%`, "Última leitura das páginas públicas", true],
    ["LATÊNCIA MÉDIA", summary.averageLatencyMs == null ? "—" : `${summary.averageLatencyMs} ms`, "PT-BR + ES", summary.averageLatencyMs != null && summary.averageLatencyMs < 1000],
    ["SAÚDE TÉCNICA SEO", summary.seoScore == null ? "—" : `${summary.seoScore}%`, summary.auditedPages == null ? "Auditoria ainda não executada" : `${summary.auditedPages} páginas auditadas`, summary.seoScore >= 90],
    ["CUSTO DE IA", "R$ 0,00", `${summary.activeAgents} agentes ativos`, true]
  ];
  $("#metric-grid").innerHTML = metrics.map(([label, value, detail, ok]) => `
    <article class="metric-card">
      <span>${esc(label)}</span>
      <strong class="${ok ? "metric-ok" : ""}">${esc(value)}</strong>
      <small>${esc(detail)}</small>
    </article>
  `).join("");
  $("#run-count").textContent = `${activity.length} RUN${activity.length === 1 ? "" : "S"}`;
  $("#sidebar-freshness").textContent = `Atualizado ${relativeTime(generatedAt)}`;
  $("#run-feed").innerHTML = latestRuns.length ? latestRuns.slice(0, 7).map((run) => `
    <div class="run-item">
      <i class="${esc(run.status)}"></i>
      <div><b>${esc(workflowName(run.workflowId))}</b><p>${esc(run.summary)}</p></div>
      <time>${esc(relativeTime(run.startedAt))}</time>
    </div>
  `).join("") : '<div class="empty-state">Os primeiros fluxos estão sendo executados.</div>';
  renderChart(activity);
}

function renderChart(activity) {
  const container = $("#activity-chart");
  if (!activity.length) {
    container.innerHTML = '<div class="chart-empty">O gráfico aparecerá após a primeira execução.</div>';
    return;
  }
  const points = activity.slice(-24);
  const width = 760;
  const height = 180;
  const max = Math.max(...points.map((item) => item.durationMs), 1);
  const coordinates = points.map((item, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = height - 20 - (item.durationMs / max) * (height - 42);
    return { x, y, item };
  });
  const grid = [20, 60, 100, 140].map((y) => `<line class="chart-grid" x1="0" y1="${y}" x2="${width}" y2="${y}"></line>`).join("");
  const polyline = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const dots = coordinates.map((point) => `<circle class="chart-dot" cx="${point.x}" cy="${point.y}" r="4"><title>${esc(workflowName(point.item.workflowId))}: ${point.item.durationMs} ms</title></circle>`).join("");
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Duração das execuções nas últimas 24 horas">${grid}<polyline class="chart-line" points="${polyline}"></polyline>${dots}</svg>`;
}

function renderWorkflows() {
  if (!state.workflows.length) return;
  $("#workflow-tabs").innerHTML = state.workflows.map((workflow) => `
    <button class="${workflow.id === state.selectedWorkflow ? "active" : ""}" data-workflow="${esc(workflow.id)}">
      ${esc(workflow.name)}
    </button>
  `).join("");
  $$("[data-workflow]").forEach((button) => button.addEventListener("click", () => {
    state.selectedWorkflow = button.dataset.workflow;
    renderWorkflows();
  }));
  const workflow = state.workflows.find((item) => item.id === state.selectedWorkflow) || state.workflows[0];
  const latest = workflow.latestRun;
  const nodeStatuses = Object.fromEntries((latest?.steps || []).map((step) => [step.nodeId, step.status]));
  const nodeMap = Object.fromEntries(workflow.nodes.map((node) => [node.id, node]));
  const edges = workflow.edges.map(([fromId, toId]) => {
    const from = nodeMap[fromId];
    const to = nodeMap[toId];
    const active = workflow.running || nodeStatuses[fromId] === "running" || nodeStatuses[toId] === "running";
    const x1 = from.x + 150;
    const y1 = from.y + 36;
    const x2 = to.x;
    const y2 = to.y + 36;
    const curve = Math.max(40, (x2 - x1) / 2);
    return `<path class="flow-edge ${active ? "flow-edge-active" : ""}" d="M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}"></path>`;
  }).join("");
  const nodes = workflow.nodes.map((node) => {
    const status = nodeStatuses[node.id] || (workflow.running && node.id === "trigger" ? "running" : "");
    return `
      <g class="flow-node ${status ? `flow-node-${esc(status)}` : ""}" transform="translate(${node.x} ${node.y})">
        <rect width="150" height="72" rx="2"></rect>
        <rect class="node-accent" width="4" height="72"></rect>
        <text class="node-type" x="18" y="23">${esc(node.type.toUpperCase())}</text>
        <text x="18" y="48">${esc(node.label)}</text>
      </g>
    `;
  }).join("");
  $("#workflow-canvas").innerHTML = `<svg viewBox="0 0 1046 420" role="img" aria-label="Fluxo ${esc(workflow.name)}">${edges}${nodes}</svg>`;
  $("#workflow-detail").innerHTML = `
    <article class="workflow-copy"><h3>${esc(workflow.name)}</h3><p>${esc(workflow.description)}</p><p><b>Agenda:</b> ${esc(workflow.schedule)}</p></article>
    <article class="workflow-run"><h3>${latest ? esc(statusLabel(latest.status)) : "Aguardando primeira execução"}</h3><p>${latest ? esc(latest.summary) : "Nenhum dado foi fabricado. Execute o fluxo para criar a primeira leitura real."}</p><button id="run-workflow" ${workflow.running ? "disabled" : ""}>${workflow.running ? "Executando…" : "Executar agora ↗"}</button></article>
  `;
  $("#run-workflow").addEventListener("click", () => runWorkflow(workflow.id));
}

async function runWorkflow(id) {
  try {
    await api(`/api/workflows/${id}/run`, { method: "POST" });
    toast("Fluxo iniciado. Acompanhe os nós em tempo real.");
    await refreshWorkflows();
  } catch (error) {
    toast(error.message);
  }
}

async function refreshWorkflows() {
  const payload = await api("/api/workflows");
  state.workflows = payload.workflows;
  renderWorkflows();
}

function renderNotes() {
  renderCesarMap();
  $("#note-grid").innerHTML = state.notes.length ? state.notes.map((note) => `
    <article class="note-card">
      <h3>${esc(note.title)}</h3>
      <p>${esc(note.body)}</p>
      <div class="note-tags">${note.tags.map((tag) => `<span>${esc(tag)}</span>`).join("")}</div>
      <div class="note-meta"><time>${esc(formatDate(note.updatedAt))}</time><span><button data-edit-note="${esc(note.id)}">Editar</button><button data-delete-note="${esc(note.id)}">Excluir</button></span></div>
    </article>
  `).join("") : '<div class="empty-state">Nenhuma nota encontrada.</div>';
  $$('[data-edit-note]').forEach((button) => button.addEventListener("click", () => {
    const note = state.notes.find((item) => item.id === button.dataset.editNote);
    if (note) openNoteEditor(note);
  }));
  $$("[data-delete-note]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("Excluir esta nota da memória?")) return;
    try {
      await api(`/api/notes/${button.dataset.deleteNote}`, { method: "DELETE" });
      await searchNotes($("#note-search").value);
      toast("Nota removida.");
    } catch (error) {
      toast(error.message);
    }
  }));
}

function openNoteEditor(note = null) {
  state.editingNoteId = note?.id || null;
  $("#note-form").hidden = false;
  $("#note-form-eyebrow").textContent = note ? "EDITAR MEMÓRIA · CESAR" : "NOVA MEMÓRIA · CESAR";
  $("#note-form-title").textContent = note ? note.title : "Registrar nota";
  $("#note-submit").textContent = note ? "Atualizar memória" : "Salvar no Cesar";
  $("#note-title").value = note?.title || "";
  $("#note-body").value = note?.body || "";
  $("#note-tags").value = (note?.tags || []).join(", ");
  $("#note-form").scrollIntoView({ behavior: "smooth", block: "center" });
  $("#note-title").focus({ preventScroll: true });
}

function closeNoteEditor() {
  state.editingNoteId = null;
  $("#note-form").reset();
  $("#note-form").hidden = true;
  $("#note-error").textContent = "";
}

function renderCesarMap() {
  const canvas = $("#cesar-map-canvas");
  if (!canvas) return;
  window.cancelAnimationFrame(state.cesarFrame);
  state.cesarMapAbort?.abort();
  state.cesarMapAbort = new AbortController();
  const { signal } = state.cesarMapAbort;
  const context = canvas.getContext("2d");
  const tooltip = $("#cesar-map-tooltip");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const palette = ["217,255,67", "156,124,255", "242,241,237", "255,77,0", "109,225,232"];
  const notes = state.notes.map((note, index) => {
    const vector = Array.isArray(note.vector) ? note.vector : [];
    const count = Math.max(1, state.notes.length);
    const latitude = 1 - 2 * (index + .5) / count;
    const shellRadius = Math.sqrt(Math.max(0, 1 - latitude * latitude));
    const longitude = index * Math.PI * (3 - Math.sqrt(5)) + (vector[0] || 0) * .45;
    return {
      ...note,
      x: Math.cos(longitude) * shellRadius,
      y: latitude,
      z: Math.sin(longitude) * shellRadius,
      size: 2.5 + Math.min(5, (note.relatedIds || []).length) * .5,
      color: Math.abs(Math.round((vector[3] || index) * 1000)) % palette.length,
      phase: longitude
    };
  });
  const byId = new Map(notes.map((note, index) => [note.id, index]));
  const linkKeys = new Set();
  const links = [];
  notes.forEach((note, from) => (note.relatedIds || []).forEach((relatedId) => {
    const to = byId.get(relatedId);
    if (to == null) return;
    const key = [from, to].sort((a, b) => a - b).join(":");
    if (linkKeys.has(key)) return;
    linkKeys.add(key);
    links.push([from, to]);
  }));
  $("#cesar-node-count").textContent = notes.length;
  $("#cesar-link-count").textContent = links.length;
  $("#cesar-map-status").textContent = notes.length ? "VETORES CONECTADOS" : "BASE VAZIA";

  let width = 0;
  let height = 0;
  let ratio = 1;
  let projected = [];
  let pointer = { x: -1000, y: -1000 };
  let hoveredNote = null;

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = bounds.width;
    height = bounds.height;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function project(note, time) {
    const rotation = reducedMotion ? 0 : time * .00003;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const sphereRadius = Math.min(width, height) * .37;
    const rotatedX = (note.x * cos - note.z * sin) * sphereRadius;
    const rotatedZ = (note.x * sin + note.z * cos) * sphereRadius;
    const pitch = -.28;
    const rotatedY = (note.y * Math.cos(pitch) - (rotatedZ / sphereRadius) * Math.sin(pitch)) * sphereRadius;
    const depth = note.y * Math.sin(pitch) * sphereRadius + rotatedZ * Math.cos(pitch);
    const perspective = 650 / (760 + depth);
    return {
      x: width * .5 + rotatedX * perspective,
      y: height * .53 + rotatedY * perspective + Math.sin(time * .000264 + note.phase) * 2.5,
      depth,
      scale: Math.max(.38, perspective)
    };
  }

  function draw(time) {
    context.clearRect(0, 0, width, height);
    projected = notes.map((note) => project(note, time));
    const orbitRadius = Math.min(width, height) * .31;
    context.save();
    context.translate(width * .5, height * .53);
    for (const [rotation, squash, color] of [[-.5, .3, "217,255,67"], [.55, .26, "156,124,255"], [0, .18, "242,241,237"]]) {
      context.beginPath();
      context.ellipse(0, 0, orbitRadius, orbitRadius * squash, rotation, 0, Math.PI * 2);
      context.strokeStyle = `rgba(${color},.18)`;
      context.lineWidth = .7;
      context.stroke();
    }
    const nucleusPulse = 1 + Math.sin(time * .00144) * .12;
    const nucleus = context.createRadialGradient(0, 0, 0, 0, 0, 34 * nucleusPulse);
    nucleus.addColorStop(0, "rgba(255,255,255,1)");
    nucleus.addColorStop(.12, "rgba(217,255,67,.95)");
    nucleus.addColorStop(.42, "rgba(217,255,67,.28)");
    nucleus.addColorStop(1, "rgba(217,255,67,0)");
    context.fillStyle = nucleus;
    context.beginPath();
    context.arc(0, 0, 34 * nucleusPulse, 0, Math.PI * 2);
    context.fill();
    context.restore();
    links.forEach(([from, to], index) => {
      const a = projected[from];
      const b = projected[to];
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.strokeStyle = `rgba(${palette[notes[from].color]},${Math.max(.04, .16 - (a.depth + b.depth) / 4000)})`;
      context.lineWidth = .55;
      context.stroke();
      if (!reducedMotion && index % 5 === 0) {
        const progress = (time * .00003 + index * .091) % 1;
        const x = a.x + (b.x - a.x) * progress;
        const y = a.y + (b.y - a.y) * progress;
        context.beginPath();
        context.arc(x, y, 1.1, 0, Math.PI * 2);
        context.fillStyle = `rgba(${palette[notes[from].color]},.8)`;
        context.fill();
      }
    });
    notes.map((note, index) => ({ note, point: projected[index], index }))
      .sort((a, b) => b.point.depth - a.point.depth)
      .forEach(({ note, point }) => {
        const hovered = hoveredNote?.id === note.id;
        const radius = note.size * point.scale * (hovered ? 1.8 : 1);
        context.beginPath();
        context.arc(point.x, point.y, radius + (hovered ? 8 : 3), 0, Math.PI * 2);
        context.fillStyle = `rgba(${palette[note.color]},${hovered ? .16 : .05})`;
        context.fill();
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(${palette[note.color]},${hovered ? 1 : .78})`;
        context.shadowColor = `rgba(${palette[note.color]},.8)`;
        context.shadowBlur = hovered ? 18 : 7;
        context.fill();
        context.shadowBlur = 0;
      });
    state.cesarFrame = window.requestAnimationFrame(draw);
  }

  function updateTooltip(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    let closest = null;
    notes.forEach((note, index) => {
      const point = projected[index];
      if (!point) return;
      const distance = Math.hypot(pointer.x - point.x, pointer.y - point.y);
      if (distance < 14 && (!closest || distance < closest.distance)) closest = { note, distance };
    });
    hoveredNote = closest?.note || null;
    canvas.style.cursor = hoveredNote ? "pointer" : "default";
    if (!closest) {
      tooltip.hidden = true;
      return;
    }
    tooltip.innerHTML = `<b>CESAR · MEMÓRIA</b>${esc(closest.note.title)}`;
    tooltip.style.left = `${Math.min(width - 270, pointer.x + 15)}px`;
    tooltip.style.top = `${Math.max(70, pointer.y - 8)}px`;
    tooltip.hidden = false;
  }

  resize();
  window.addEventListener("resize", resize, { passive: true, signal });
  canvas.addEventListener("mousemove", updateTooltip, { passive: true, signal });
  canvas.addEventListener("click", () => { if (hoveredNote) openNoteEditor(hoveredNote); }, { signal });
  canvas.addEventListener("mouseleave", () => { pointer = { x: -1000, y: -1000 }; hoveredNote = null; tooltip.hidden = true; canvas.style.cursor = "default"; }, { signal });
  state.cesarFrame = window.requestAnimationFrame(draw);
}

async function searchNotes(query) {
  const payload = await api(`/api/notes?q=${encodeURIComponent(query)}`);
  state.notes = payload.notes;
  renderNotes();
}

$("#note-search").addEventListener("input", (event) => {
  window.clearTimeout(event.currentTarget.searchTimer);
  event.currentTarget.searchTimer = window.setTimeout(() => searchNotes(event.currentTarget.value).catch((error) => toast(error.message)), 220);
});
$("#new-note").addEventListener("click", () => openNoteEditor());
$("#close-note").addEventListener("click", closeNoteEditor);
$("#note-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  $("#note-error").textContent = "";
  try {
    const editing = state.editingNoteId;
    await api(editing ? `/api/notes/${editing}` : "/api/notes", {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify({
        title: $("#note-title").value,
        body: $("#note-body").value,
        tags: $("#note-tags").value
      })
    });
    closeNoteEditor();
    $("#note-search").value = "";
    await searchNotes("");
    toast(editing ? "Memória atualizada e reconectada." : "Nota salva no Cesar. Um novo ponto foi conectado.");
  } catch (error) {
    $("#note-error").textContent = error.message;
  }
});

function renderAgents() {
  $("#agent-grid").innerHTML = state.agents.map((agent, index) => `
    <article class="agent-card">
      <header><span>AGENTE / 0${index + 1}</span><b>${agent.enabled ? "ATIVO" : "EM ESPERA"}</b></header>
      <h3>${esc(agent.name)}</h3>
      <p>${esc(agent.role)}</p>
      <footer><span>${esc(agent.provider)}</span><span>${esc(agent.budget)}</span></footer>
    </article>
  `).join("");
  const collector = state.agentInfo?.relevanceAgent;
  if (collector) {
    const { configuration, stats } = collector;
    $("#relevance-agent-panel").innerHTML = `
      <div class="panel-head">
        <div><span>COLETOR EDITORIAL</span><h3>Memória vetorial Matheus Libonatti</h3></div>
        <b>${state.agentInfo.providerConfigured ? "CONFIGURADO" : "AGUARDANDO CHAVE"}</b>
      </div>
      <div class="agent-metrics">
        <div><span>JANELA</span><strong>${esc(configuration.windowStart)}–${esc(configuration.windowEnd)}</strong><small>Horário de Brasília</small></div>
        <div><span>ANALISADAS</span><strong>${esc(stats.analyzed)}</strong><small>histórico total</small></div>
        <div><span>NO RAG</span><strong>${esc(stats.stored)}</strong><small>nota ≥ 6/10</small></div>
        <div><span>DESCARTADAS</span><strong>${esc(stats.discarded)}</strong><small>nota abaixo de 6</small></div>
      </div>
      <p class="agent-config-message">${esc(state.agentInfo.message)} Status atual: ${esc(configuration.status)}.</p>
    `;
  }
  const editor = state.agentInfo?.editorAgent;
  if (editor) {
    const { configuration, stats, drafts = [] } = editor;
    $("#editor-agent-panel").innerHTML = `
      <div class="panel-head">
        <div><span>EDITOR DE INTELIGÊNCIA</span><h3>Rascunhos autorais Matheus Libonatti</h3></div>
        <b>${state.agentInfo.providerConfigured ? "CONFIGURADO" : "AGUARDANDO CHAVE"}</b>
      </div>
      <div class="agent-metrics">
        <div><span>EXECUÇÃO</span><strong>${esc(configuration.scheduledAt)}</strong><small>Todos os dias · Brasília</small></div>
        <div><span>RASCUNHOS</span><strong>${esc(stats.drafts)}</strong><small>histórico total</small></div>
        <div><span>EM REVISÃO</span><strong>${esc(stats.awaiting_review)}</strong><small>nada publicado sozinho</small></div>
        <div><span>CORTE</span><strong>8/10</strong><small>2+ fontes · máximo 6/semana</small></div>
      </div>
      <div class="editor-draft-list">
        ${drafts.length ? drafts.map((draft) => `
          <details>
            <summary><span>RASCUNHO #${esc(draft.id)}</span><strong>${esc(draft.title)}</strong></summary>
            <p>${esc(draft.dek)}</p>
            <p><b>Linha editorial:</b> ${esc(draft.editorial_angle)}</p>
            <p><b>Busca:</b> ${esc(draft.primary_keyword)} · ${esc(draft.search_intent)}</p>
            <div class="draft-source-links">${draft.sources.map((source) => `
              <a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.source)} · ${esc(source.relevance)}/10 ↗</a>
            `).join("")}</div>
            <pre>${esc(draft.body_markdown)}</pre>
          </details>
        `).join("") : '<div class="empty-state">Os rascunhos aparecerão após o RAG possuir pelo menos duas notícias compatíveis.</div>'}
      </div>
      <p class="agent-config-message">Status atual: ${esc(configuration.status)}. Os textos ficam em revisão humana e preservam as fontes utilizadas.</p>
    `;
  }
}

function renderAudit() {
  const runs = state.dashboard?.latestRuns || [];
  $("#audit-table").innerHTML = runs.length ? runs.map((run) => `
    <tr>
      <td>${esc(workflowName(run.workflowId))}</td>
      <td>${esc(formatDate(run.startedAt))}</td>
      <td>${esc(run.trigger)}</td>
      <td><span class="status-chip"><i class="${esc(run.status)}"></i>${esc(statusLabel(run.status))}</span></td>
      <td>${run.durationMs == null ? "—" : `${esc(run.durationMs)} ms`}</td>
      <td>${esc(run.summary)}</td>
    </tr>
  `).join("") : '<tr><td colspan="6" class="empty-state">Aguardando as primeiras execuções.</td></tr>';
}

function route(name) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
  $$("[data-route]").forEach((button) => button.classList.toggle("active", button.dataset.route === name));
  $("#page-title").textContent = {
    overview: "Minha central",
    radar: "Radar LIOS",
    workflows: "Automações",
    brain: "Cesar · Second Brain",
    agents: "Agentes IA",
    audit: "Operação"
  }[name];
  if (name === "brain") renderCesarMap();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$$("[data-route]").forEach((button) => button.addEventListener("click", (event) => {
  event.preventDefault();
  route(button.dataset.route);
}));

$("#refresh").addEventListener("click", async () => {
  try {
    await loadAll();
    toast("Dados atualizados.");
  } catch (error) {
    toast(error.message);
  }
});

$("#refresh-radar").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await api("/api/editorial-radar/refresh", { method: "POST" });
    toast("Coleta iniciada nas três fontes.");
  } catch (error) {
    toast(error.message);
  } finally {
    window.setTimeout(() => { button.disabled = false; }, 1500);
  }
});

function connectEvents() {
  if (state.events) state.events.close();
  state.events = new EventSource("/api/events");
  for (const eventName of ["run", "step", "radar"]) {
    state.events.addEventListener(eventName, async () => {
      try {
        const [dashboard, workflowsPayload, radar] = await Promise.all([
          api("/api/dashboard"),
          api("/api/workflows"),
          api("/api/editorial-radar")
        ]);
        state.dashboard = dashboard;
        state.workflows = workflowsPayload.workflows;
        state.radar = radar;
        renderDashboard();
        renderWorkflows();
        renderAudit();
        renderRadar();
      } catch {
        // A próxima reconexão ou atualização manual recupera o estado.
      }
    });
  }
}

window.setInterval(() => {
  $("#live-time").textContent = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo"
  }).format(new Date());
}, 1000);

function initBrainGraph() {
  const canvas = $("#brain-canvas");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const colors = ["217,255,67", "156,124,255", "242,241,237", "255,77,0"];
  const nodes = Array.from({ length: reducedMotion ? 44 : 86 }, (_, index) => {
    const cluster = index % 5;
    const angle = index * 2.39996 + cluster * .7;
    const radius = 76 + Math.sqrt(index + 1) * 27 + (cluster % 2) * 30;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * .72,
      z: Math.sin(angle * 1.7) * 145,
      size: index < 9 ? 2.7 + (index % 3) : .8 + (index % 5) * .38,
      cluster,
      phase: Math.random() * Math.PI * 2,
      speed: .00018 + Math.random() * .000264
    };
  });
  const links = [];
  nodes.forEach((node, index) => {
    if (index < 5) links.push([index, (index + 1) % 5]);
    if (index > 4) {
      links.push([index, index % 5]);
      links.push([index, Math.max(0, index - 4 - (index % 7))]);
      if (index % 3 === 0) links.push([index, Math.max(0, index - 11)]);
    }
  });
  let width = 0;
  let height = 0;
  let ratio = 1;
  let frame = 0;

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = bounds.width;
    height = bounds.height;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function project(node, time) {
    const rotation = time * node.speed + node.phase * .04;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const px = node.x * cos - node.z * sin;
    const depth = node.x * sin + node.z * cos;
    const perspective = 520 / (620 + depth);
    return {
      x: width * .52 + px * perspective,
      y: height * .48 + node.y * perspective + Math.sin(time * .00024 + node.phase) * 7,
      depth,
      scale: Math.max(.35, perspective)
    };
  }

  function draw(time) {
    context.clearRect(0, 0, width, height);
    const projected = nodes.map((node) => project(node, time));
    const glow = context.createRadialGradient(width * .52, height * .48, 0, width * .52, height * .48, Math.min(width, height) * .48);
    glow.addColorStop(0, "rgba(217,255,67,.075)");
    glow.addColorStop(.45, "rgba(156,124,255,.025)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    links.forEach(([from, to], linkIndex) => {
      const a = projected[from];
      const b = projected[to];
      const depthAlpha = Math.max(.035, Math.min(.24, .16 - (a.depth + b.depth) / 2800));
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.strokeStyle = `rgba(${colors[nodes[from].cluster % colors.length]},${depthAlpha})`;
      context.lineWidth = linkIndex % 7 === 0 ? .85 : .45;
      context.stroke();
      if (!reducedMotion && linkIndex % 4 === 0) {
        const travel = (time * .000048 + linkIndex * .137) % 1;
        const x = a.x + (b.x - a.x) * travel;
        const y = a.y + (b.y - a.y) * travel;
        context.beginPath();
        context.arc(x, y, linkIndex % 8 === 0 ? 1.8 : 1, 0, Math.PI * 2);
        context.fillStyle = `rgba(${colors[nodes[from].cluster % colors.length]},.9)`;
        context.shadowColor = `rgba(${colors[nodes[from].cluster % colors.length]},1)`;
        context.shadowBlur = 8;
        context.fill();
        context.shadowBlur = 0;
      }
    });

    nodes.map((node, index) => ({ node, point: projected[index] }))
      .sort((a, b) => b.point.depth - a.point.depth)
      .forEach(({ node, point }) => {
        const pulse = 1 + Math.sin(time * .00096 + node.phase) * .22;
        const radius = node.size * point.scale * pulse;
        const alpha = Math.max(.28, Math.min(.95, .72 - point.depth / 900));
        context.beginPath();
        context.arc(point.x, point.y, radius + 3, 0, Math.PI * 2);
        context.fillStyle = `rgba(${colors[node.cluster % colors.length]},.06)`;
        context.fill();
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(${colors[node.cluster % colors.length]},${alpha})`;
        context.shadowColor = `rgba(${colors[node.cluster % colors.length]},.7)`;
        context.shadowBlur = node.size > 2 ? 13 : 5;
        context.fill();
        context.shadowBlur = 0;
      });

    frame = window.requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize, { passive: true });
  frame = window.requestAnimationFrame(draw);
  document.addEventListener("visibilitychange", () => {
    window.cancelAnimationFrame(frame);
    if (!document.hidden) frame = window.requestAnimationFrame(draw);
  });
}

initBrainGraph();

bootstrap().catch((error) => {
  showLogin();
  $("#login-error").textContent = error.message;
});
