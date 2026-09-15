// Service worker de la preversion (voir build.mjs). Il sert le site depuis
// Cache Storage, ou la page de connexion depose les fichiers dechiffres. Tant
// que le cache est vide, il laisse passer les requetes : GitHub Pages repond
// alors par la page de connexion.
//
// Version f77276ad2334. Ce fichier change a chaque publication : le navigateur
// installe le nouveau worker, qui vide le cache. Le site deja dechiffre ne
// survit pas a une nouvelle version, le mot de passe est redemande.

const BASE = "/tw3-preview";
const CACHE = "tw3-preview";

self.addEventListener("install", () => self.skipWaiting());

// Si un site dechiffre existait, il date de la publication precedente : les
// onglets ouverts sont recharges, et tombent sur la page de connexion au lieu
// de continuer a afficher l'ancienne version.
//
// `navigate` n'est pas attendu : la navigation passe par ce worker, qui ne
// traite aucune requete avant la fin de son activation. L'attendre ici
// bloquait l'onglet en chargement indefiniment.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const stale = await caches.delete(CACHE);
      await self.clients.claim();
      if (!stale) return;
      for (const client of await self.clients.matchAll({ type: "window" })) {
        client.navigate(client.url).catch(() => {});
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(respond(request, url.pathname));
});

// Cles possibles dans le cache pour un chemin demande.
function candidates(pathname) {
  let path;
  if (pathname === BASE || pathname === `${BASE}/`) path = "/";
  // Charge RSC de l'accueil : sans barre finale, le routeur demande
  // `/tw3-preview.txt`, hors du dossier.
  else if (pathname === `${BASE}.txt`) path = "/index.txt";
  else if (pathname.startsWith(`${BASE}/`)) path = pathname.slice(BASE.length);
  // next/image n'ajoute pas le basePath aux `src` passes en chaine : un chemin
  // qui ne le porte pas est cherche sous le basePath.
  else path = pathname;
  return path.endsWith("/") ? [`${path}index.html`] : [path, `${path}.html`];
}

// `caches.match` et non `caches.open` : la lecture ne doit pas creer de cache
// vide, sans quoi l'activation croirait trouver une ancienne version.
async function respond(request, pathname) {
  for (const path of candidates(pathname)) {
    const hit = await caches.match(BASE + path, { cacheName: CACHE });
    if (hit) return hit;
  }
  if (request.mode === "navigate") {
    const notFound = await caches.match(`${BASE}/404.html`, { cacheName: CACHE });
    if (notFound) return new Response(notFound.body, { status: 404, headers: notFound.headers });
  }
  return fetch(request);
}
