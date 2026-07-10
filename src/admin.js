/**
 * Console admin (page séparée /admin) : authentification puis onglets Stats et
 * gestion des Lieux. L'auth est vérifiée côté serveur (cookie de session
 * signé) ; toutes les écritures passent par /api/admin/* (admin only).
 */
import "./style.css";
import "./admin.css";

const root = document.getElementById("admin");

const fmtDateTime = (t) =>
  t ? new Date(t).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "—";

const rel = (t) => {
  if (!t) return "—";
  const d = Date.now() - t;
  const days = Math.floor(d / 86400000);
  if (days >= 1) return `il y a ${days} j`;
  const h = Math.floor(d / 3600000);
  if (h >= 1) return `il y a ${h} h`;
  return `il y a ${Math.max(1, Math.floor(d / 60000))} min`;
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function fetchMe() {
  try {
    const r = await fetch("/api/admin/me");
    return r.ok ? r.json() : { admin: false };
  } catch {
    return { admin: false };
  }
}

function loginView(error) {
  root.innerHTML = `
    <div class="admin-wrap admin-login-wrap">
      <h1>Admin · Marées La Rochelle</h1>
      <form class="admin-login">
        <input name="user" placeholder="Identifiant" autocomplete="username" />
        <input name="password" type="password" placeholder="Mot de passe" autocomplete="current-password" />
        <button type="submit">Se connecter</button>
        ${error ? `<p class="admin-error">${esc(error)}</p>` : ""}
      </form>
      <p class="admin-back"><a href="/">← Retour à l'app</a></p>
    </div>`;
  root.querySelector(".admin-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    f.querySelector("button").disabled = true;
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: f.user.value.trim(), password: f.password.value }),
      });
      if (r.ok) return boot();
      loginView("Identifiants invalides.");
    } catch {
      loginView("Erreur réseau, réessaie.");
    }
  });
}

// ---------------------------------------------------------------- shell + tabs
let currentTab = "stats";

function shell() {
  root.innerHTML = `
    <div class="admin-wrap">
      <div class="admin-head">
        <h1>Console admin</h1>
        <div class="admin-head-actions">
          <a class="admin-btn" href="/">Voir l'app</a>
          <button class="admin-btn logout" type="button">Déconnexion</button>
        </div>
      </div>
      <nav class="admin-tabs">
        <button class="tab-btn" data-tab="stats">Stats</button>
        <button class="tab-btn" data-tab="beaches">Lieux</button>
      </nav>
      <div id="tab-content"></div>
    </div>`;
  root.querySelector(".logout").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    loginView();
  });
  root.querySelectorAll(".tab-btn").forEach((b) =>
    b.addEventListener("click", () => {
      currentTab = b.dataset.tab;
      renderTab();
    })
  );
  renderTab();
}

function renderTab() {
  root.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === currentTab));
  if (currentTab === "stats") renderStats();
  else renderBeaches();
}

const content = () => root.querySelector("#tab-content");

// -------------------------------------------------------------------- stats
function statCard(value, label) {
  return `<div class="stat-card"><span class="stat-value">${value}</span><span class="stat-label">${esc(label)}</span></div>`;
}

async function renderStats() {
  content().innerHTML = `<p>Chargement des statistiques…</p>`;
  const [stats, beachesCfg] = await Promise.all([
    fetch("/api/admin/stats").then((r) => r.json()),
    fetch("/api/beaches").then((r) => r.json()).catch(() => ({ beaches: [] })),
  ]);
  const nameById = Object.fromEntries((beachesCfg.beaches || []).map((b) => [b.id, b.name]));
  const beachName = (id) => nameById[id] || id;

  const usersRows = stats.users
    .map(
      (u) => `
      <tr>
        <td><code>${esc(u.token)}</code></td>
        <td>${u.name ? esc(u.name) : '<span class="muted">—</span>'}</td>
        <td>${fmtDateTime(u.createdAt)}</td>
        <td title="${fmtDateTime(u.lastSeen)}">${esc(rel(u.lastSeen))}</td>
      </tr>`
    )
    .join("");

  const favRows = stats.favorites.length
    ? stats.favorites.map((f) => `<tr><td>${esc(beachName(f.key))}</td><td>${f.count}</td></tr>`).join("")
    : `<tr><td class="muted" colspan="2">Aucun favori explicite pour l'instant</td></tr>`;

  const customRows = stats.customBeaches.length
    ? stats.customBeaches.map((c) => `<tr><td>${esc(c.key)}</td><td>${c.count}</td></tr>`).join("")
    : `<tr><td class="muted" colspan="2">Aucun lieu ajouté pour l'instant</td></tr>`;

  content().innerHTML = `
    <div class="stat-grid">
      ${statCard(stats.activeUsers, "Utilisateurs actifs (15 j)")}
      ${statCard(stats.totalUsers, "Utilisateurs au total")}
      ${statCard(stats.namedUsers, "Ont renseigné un nom")}
    </div>
    <h2>Tokens & utilisateurs</h2>
    <div class="table-scroll">
      <table class="admin-table">
        <thead><tr><th>Token</th><th>Nom</th><th>Créé le</th><th>Dernière visite</th></tr></thead>
        <tbody>${usersRows || '<tr><td class="muted" colspan="4">Aucun utilisateur</td></tr>'}</tbody>
      </table>
    </div>
    <div class="two-col">
      <div>
        <h2>Plages favorites</h2>
        <table class="admin-table"><thead><tr><th>Plage</th><th>Favoris</th></tr></thead><tbody>${favRows}</tbody></table>
      </div>
      <div>
        <h2>Lieux ajoutés par les utilisateurs</h2>
        <table class="admin-table"><thead><tr><th>Lieu</th><th>Occurrences</th></tr></thead><tbody>${customRows}</tbody></table>
      </div>
    </div>`;
}

// -------------------------------------------------------------------- lieux
let meta = {};
let active = [];
let drafts = [];
let saveTimer = null;

const slugify = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const findBeach = (id) => active.find((b) => b.id === id) || drafts.find((b) => b.id === id);

function setSaveStatus(text) {
  const el = root.querySelector(".save-status");
  if (el) el.textContent = text;
}

async function saveBeachesNow() {
  setSaveStatus("Enregistrement…");
  const beaches = [
    ...active.map((b) => ({ ...b, published: true })),
    ...drafts.map((b) => ({ ...b, published: false })),
  ];
  try {
    const r = await fetch("/api/admin/beaches", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...meta, beaches }),
    });
    setSaveStatus(r.ok ? "Enregistré ✓" : "Erreur d'enregistrement");
  } catch {
    setSaveStatus("Hors ligne — non enregistré");
  }
}

function debouncedSave() {
  setSaveStatus("Modifié…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveBeachesNow, 600);
}

function saveAndRerender() {
  renderBeaches();
  saveBeachesNow();
}

function beachRow(b, isActive) {
  return `
    <div class="beach-admin-row" data-id="${esc(b.id)}">
      ${isActive ? `<button class="drag-h" title="Réordonner" aria-label="Réordonner">⠿</button>` : `<span class="drag-h placeholder"></span>`}
      <div class="beach-admin-main">
        <div class="beach-admin-top">
          <input type="color" class="f-color" value="${esc(b.color || "#5ec4ea")}" title="Couleur" />
          <input type="text" class="f-name" value="${esc(b.name || "")}" placeholder="Nom du lieu" />
          <button class="mini toggle-pub" title="${isActive ? "Passer en brouillon" : "Publier"}">${isActive ? "▲ Publié" : "▼ Brouillon"}</button>
          <button class="mini danger del" title="Supprimer">✕</button>
        </div>
        <div class="beach-admin-fields">
          <label>Seuil <input type="number" class="f-thr" step="0.05" min="0" max="10" value="${Number(b.swim_threshold_m ?? 3).toFixed(2)}" /> m</label>
          <label><input type="checkbox" class="f-fav" ${b.default_favorite ? "checked" : ""} /> Favori par défaut</label>
          <label><input type="checkbox" class="f-low" ${b.swimmable_at_low_tide ? "checked" : ""} /> Baignable à marée basse</label>
        </div>
      </div>
    </div>`;
}

async function renderBeaches() {
  if (!active.length && !drafts.length && !meta.__loaded) {
    content().innerHTML = `<p>Chargement des lieux…</p>`;
    const cfg = await fetch("/api/admin/beaches").then((r) => r.json());
    const { beaches = [], ...rest } = cfg;
    meta = { ...rest, __loaded: true };
    active = beaches.filter((b) => b.published !== false);
    drafts = beaches.filter((b) => b.published === false);
  }

  content().innerHTML = `
    <div class="beaches-head">
      <p class="muted">Les lieux <strong>actifs</strong> apparaissent chez tous les utilisateurs (dans cet ordre par défaut). Les <strong>brouillons</strong> sont invisibles côté public.</p>
      <span class="save-status"></span>
    </div>

    <h2>Actifs · <span class="muted">${active.length}</span></h2>
    <div class="beach-admin-list active-list">${active.map((b) => beachRow(b, true)).join("") || '<p class="muted empty">Aucun lieu actif.</p>'}</div>

    <h2>Brouillons · <span class="muted">${drafts.length}</span></h2>
    <div class="beach-admin-list draft-list">${drafts.map((b) => beachRow(b, false)).join("") || '<p class="muted empty">Aucun brouillon.</p>'}</div>

    <form class="add-beach-admin">
      <input type="text" name="name" placeholder="Nom d'un nouveau lieu" required />
      <button type="submit">+ Ajouter (en brouillon)</button>
    </form>`;

  wireBeachEvents();
  setupActiveDrag();
}

function wireBeachEvents() {
  content().querySelectorAll(".beach-admin-row").forEach((row) => {
    const id = row.dataset.id;
    const b = findBeach(id);
    if (!b) return;
    row.querySelector(".f-name").addEventListener("input", (e) => {
      b.name = e.target.value;
      debouncedSave();
    });
    row.querySelector(".f-color").addEventListener("input", (e) => {
      b.color = e.target.value;
      debouncedSave();
    });
    row.querySelector(".f-thr").addEventListener("change", (e) => {
      const v = parseFloat(e.target.value);
      if (!Number.isNaN(v)) b.swim_threshold_m = v;
      debouncedSave();
    });
    row.querySelector(".f-fav").addEventListener("change", (e) => {
      b.default_favorite = e.target.checked;
      debouncedSave();
    });
    row.querySelector(".f-low").addEventListener("change", (e) => {
      b.swimmable_at_low_tide = e.target.checked;
      debouncedSave();
    });
    row.querySelector(".toggle-pub").addEventListener("click", () => {
      const isActive = active.includes(b);
      (isActive ? active : drafts).splice((isActive ? active : drafts).indexOf(b), 1);
      (isActive ? drafts : active).push(b);
      saveAndRerender();
    });
    row.querySelector(".del").addEventListener("click", () => {
      if (!confirm(`Supprimer « ${b.name} » définitivement ?`)) return;
      active = active.filter((x) => x !== b);
      drafts = drafts.filter((x) => x !== b);
      saveAndRerender();
    });
  });

  content().querySelector(".add-beach-admin").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    const base = slugify(name) || "lieu";
    let id = base;
    let n = 2;
    while (findBeach(id)) id = `${base}-${n++}`;
    drafts.push({
      id,
      name,
      station: "la-rochelle-pallice",
      color: "#60a5fa",
      swim_threshold_m: meta.default_swim_threshold_m ?? 3,
      default_favorite: false,
      swimmable_at_low_tide: false,
      published: false,
    });
    saveAndRerender();
  });
}

// Réordonnancement des lieux actifs par glisser-déposer (Pointer Events)
function setupActiveDrag() {
  const list = content().querySelector(".active-list");
  if (!list) return;
  list.querySelectorAll(".drag-h").forEach((handle) => {
    handle.style.touchAction = "none";
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const row = handle.closest(".beach-admin-row");
      let startY = e.clientY;
      row.classList.add("dragging");

      const onMove = (m) => {
        row.style.transform = `translateY(${m.clientY - startY}px)`;
        for (const sib of list.querySelectorAll(".beach-admin-row")) {
          if (sib === row) continue;
          const r = sib.getBoundingClientRect();
          if (m.clientY > r.top && m.clientY < r.bottom) {
            const rows = [...list.children];
            list.insertBefore(row, rows.indexOf(row) < rows.indexOf(sib) ? sib.nextSibling : sib);
            row.style.transform = "translateY(0)";
            startY = m.clientY;
            break;
          }
        }
      };
      const onUp = () => {
        row.classList.remove("dragging");
        row.style.transform = "";
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        const orderIds = [...list.querySelectorAll(".beach-admin-row")].map((r) => r.dataset.id);
        active.sort((a, b) => orderIds.indexOf(a.id) - orderIds.indexOf(b.id));
        saveBeachesNow();
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  });
}

async function boot() {
  const info = await fetchMe();
  if (info.admin) shell();
  else loginView();
}

boot();
