// Service Worker do "Crônicas da Rotina".
//
// Depois de dois incidentes de tela travando de vez (Opera GX no PC, Chrome no celular),
// a prioridade #1 aqui deixou de ser "velocidade" e passou a ser "nunca mais travar":
// - Toda chamada de rede tem um limite de tempo (AbortController) — se a rede não responder
//   rápido, desiste e cai pro cache, em vez de ficar pendurado pra sempre.
// - Só mexe em arquivos do PRÓPRIO site (index.html, manifest, ícones). Chamadas pro
//   Supabase, CDNs (Chart.js, Supabase SDK) etc. passam direto, sem este Service Worker
//   se meter — antes ele interceptava tudo, sem necessidade nenhuma disso.
// - Só intercepta GET. POST/PATCH (ex.: salvar na nuvem) nunca passam por aqui.
//
// IMPORTANTE PRA VOCÊ (Deivisson): sempre que publicar uma mudança importante no site,
// troque o número aqui embaixo (v3 -> v4 -> v5...). Isso avisa o navegador de todo mundo
// "isto aqui é uma versão nova de verdade, jogue fora o que você tinha guardado" — foi a
// falta disso que fez uma versão quebrada antiga ficar grudada nos navegadores antes.
const CACHE_NAME = 'cronicas-da-rotina-v3';

const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// Nunca deixa uma chamada de rede pendurada pra sempre — depois desse tempo, desiste e
// cai pro cache (ou pra rede sem cache, se não achar nada guardado).
const NETWORK_TIMEOUT_MS = 6000;

function timeoutFetch(req, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(req, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        // Cada arquivo é pré-carregado isolado dos outros: se um falhar (ex.: um ícone
        // não encontrado), os demais continuam sendo guardados normalmente, em vez de a
        // instalação inteira falhar por causa de UM arquivo com problema.
        Promise.all(APP_SHELL.map((url) =>
          cache.add(url).catch((err) => console.error('[SW] Falha ao pré-cachear', url, err))
        ))
      )
      .catch((err) => console.error('[SW] Falha ao abrir o cache na instalação', err))
  );
  self.skipWaiting(); // a versão nova assume o controle assim que possível
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .catch((err) => console.error('[SW] Falha ao limpar caches antigos', err))
  );
  self.clients.claim(); // assume o controle das abas já abertas, sem precisar fechar e reabrir
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Só GET. Nunca intercepta POST/PATCH/DELETE (ex.: as chamadas de salvar na nuvem).
  if (req.method !== 'GET') return;

  // Só arquivos do PRÓPRIO site. Deixa o navegador cuidar normalmente de qualquer coisa
  // de outro domínio (Supabase, CDN do Chart.js, CDN do SDK do Supabase etc.) — este
  // Service Worker não tem nenhum motivo pra se meter nessas chamadas.
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  event.respondWith(
    timeoutFetch(req, NETWORK_TIMEOUT_MS)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => {
          if (cached) return cached;
          // Sem rede e sem nada guardado: pra navegação de página, ainda tenta abrir o
          // app shell (index.html) como último recurso, em vez de simplesmente falhar.
          if (isHTML) return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'Sem conexão e sem cache' });
        })
      )
  );
});
