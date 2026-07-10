/**
 * Console admin (page séparée /admin) : authentification puis statistiques
 * agrégées sur les dossiers de réglages. L'auth réelle est vérifiée côté
 * serveur (cookie de session signé) ; ici on n'affiche que ce que l'API
 * renvoie à un admin authentifié.
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
    const btn = f.querySelector("button");
    btn.disabled = true;
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

function statCard(value, label) {
  return `<div class="stat-card"><span class="stat-value">${value}</span><span class="stat-label">${esc(label)}</span></div>`;
}

async function consoleView() {
  root.innerHTML = `<div class="admin-wrap"><p>Chargement des statistiques…</p></div>`;
  const [stats, beachesCfg] = await Promise.all([
    fetch("/api/admin/stats").then((r) => r.json()),
    fetch("/config/beaches.json").then((r) => r.json()).catch(() => ({ beaches: [] })),
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
    ? stats.favorites
        .map((f) => `<tr><td>${esc(beachName(f.key))}</td><td>${f.count}</td></tr>`)
        .join("")
    : `<tr><td class="muted" colspan="2">Aucun favori explicite pour l'instant</td></tr>`;

  const customRows = stats.customBeaches.length
    ? stats.customBeaches.map((c) => `<tr><td>${esc(c.key)}</td><td>${c.count}</td></tr>`).join("")
    : `<tr><td class="muted" colspan="2">Aucun lieu ajouté pour l'instant</td></tr>`;

  root.innerHTML = `
    <div class="admin-wrap">
      <div class="admin-head">
        <h1>Console admin</h1>
        <div class="admin-head-actions">
          <a class="admin-btn" href="/">Voir l'app</a>
          <button class="admin-btn logout" type="button">Déconnexion</button>
        </div>
      </div>

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
          <table class="admin-table">
            <thead><tr><th>Plage</th><th>Favoris</th></tr></thead>
            <tbody>${favRows}</tbody>
          </table>
        </div>
        <div>
          <h2>Lieux ajoutés par les utilisateurs</h2>
          <table class="admin-table">
            <thead><tr><th>Lieu</th><th>Occurrences</th></tr></thead>
            <tbody>${customRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;

  root.querySelector(".logout").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    loginView();
  });
}

async function boot() {
  const info = await fetchMe();
  if (info.admin) consoleView();
  else loginView();
}

boot();
