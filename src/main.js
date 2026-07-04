const app = document.getElementById("app");

async function loadMeta() {
  const res = await fetch("/data/la-rochelle-pallice/meta.json");
  if (!res.ok) throw new Error(`meta.json: HTTP ${res.status}`);
  return res.json();
}

async function render() {
  try {
    const meta = await loadMeta();
    app.innerHTML = `
      <h1>Marées &mdash; La Rochelle</h1>
      <p class="subtitle">Dashboard en construction</p>
      <div class="card">
        <p><strong>Station de référence :</strong> ${meta.site}</p>
        <p><strong>Données disponibles :</strong> ${meta.date_from} &rarr; ${meta.date_to}</p>
        <p class="status">Pipeline data OK (source : ${meta.source})</p>
      </div>
    `;
  } catch (err) {
    app.innerHTML = `
      <h1>Marées &mdash; La Rochelle</h1>
      <div class="card">
        <p class="status">Erreur de chargement des données : ${err.message}</p>
      </div>
    `;
  }
}

render();
