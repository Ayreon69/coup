// Test de bout en bout : 3 humains (socket.io) + 2 bots jouent une partie complète sur le serveur compilé.
// Usage : npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: { ...process.env, PORT: String(PORT), CP_FAST: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  server.kill();
  process.exit(1);
};
setTimeout(() => fail('délai dépassé (3 min)'), 180_000).unref();

await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('prêt') && resolve()));

const ACTIONS = ['income', 'foreignAid', 'coup', 'tax', 'assassinate', 'steal', 'exchange'];
const TARGETED = new Set(['coup', 'assassinate', 'steal']);
const COST = { coup: 7, assassinate: 3 };
const PUBLIC_KEYS = 'autopilot,avatar,coins,connected,hidden,id,isBot,isHost,name,rank,revealed,status';

/** Chaque carte reçoit un numéro neuf en entrant dans une main : à qui il appartient, et jamais à un autre. */
const owner = new Map();
let audited = 0;
const claims = new Set();
const challenges = new Set();
const blocks = new Set();

function client(name) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, socket, view: null, me: null };
  socket.on('state', (v) => {
    c.view = v;
    audit(v);
    play(c);
  });
  c.call = (event, payload = {}) => new Promise((res) => socket.emit(event, payload, res));
  return c;
}

/** Vérifie les secrets sur chaque état reçu. */
function audit(v) {
  if (v.phase !== 'playing') return;
  audited++;
  const me = v.players.find((p) => p.id === v.me);
  for (const p of v.players) if (Object.keys(p).sort().join(',') !== PUBLIC_KEYS) fail(`champ inattendu dans la vue publique : ${Object.keys(p)}`);
  const json = JSON.stringify(v);
  if (/"(log|history|court|claims)"/.test(json)) fail('un historique ou la Cour circule');
  if (v.hand) {
    if (me.status === 'playing' && v.hand.length !== me.hidden) fail(`${me.name} reçoit ${v.hand.length} cartes pour ${me.hidden} cachées`);
    for (const c of v.hand) {
      if (!owner.has(c.id)) owner.set(c.id, v.me);
      else if (owner.get(c.id) !== v.me) fail(`la carte ${c.id} d'un autre joueur arrive chez ${me.name}`);
    }
  }
  if (v.you?.exchange) {
    if (v.turn.actorId !== v.me || v.turn.phase !== 'exchange') fail("les cartes de l'Échange arrivent chez quelqu'un d'autre");
    for (const c of v.you.exchange.cards) {
      if (!owner.has(c.id)) owner.set(c.id, v.me);
      else if (owner.get(c.id) !== v.me) fail("une carte de l'Échange appartient à quelqu'un d'autre");
    }
  }
  for (const m of json.matchAll(/"id":(\d+),"character"/g)) {
    const id = Number(m[1]);
    if (owner.has(id) && owner.get(id) !== v.me) fail(`la carte ${id} fuit vers ${me.name}`);
  }
  const t = v.turn;
  if (t?.action && ACTIONS.indexOf(t.action) >= 3) claims.add(t.number);
  if (t?.challenge) challenges.add(`${t.number}:${t.challenge.on}`);
  if (t?.block) blocks.add(t.number);
}

/** Un joueur pressé qui joue au hasard, uniquement à partir de sa vue, comme le ferait l'interface. */
function play(c) {
  const v = c.view;
  const t = v?.turn;
  if (!v || v.phase !== 'playing' || !t) return;
  const me = v.players.find((p) => p.id === v.me);
  if (me.status !== 'playing') return;
  const ack = () => {};
  if (t.phase === 'choose' && t.actorId === v.me) {
    const opps = v.players.filter((p) => p.status === 'playing' && p.id !== v.me);
    const legal = [];
    for (const a of ACTIONS) {
      if (me.coins >= 10 && a !== 'coup') continue;
      if ((COST[a] ?? 0) > me.coins) continue;
      if (!TARGETED.has(a)) legal.push({ a });
      else for (const o of opps) if (a !== 'steal' || o.coins > 0) legal.push({ a, target: o.id });
    }
    const pick = legal[Math.floor(Math.random() * legal.length)];
    c.socket.emit('game:act', { action: pick.a, target: pick.target }, ack);
  } else if (t.phase === 'respond' && v.you && !v.you.responded && t.window?.eligible.includes(v.me)) {
    const r = Math.random();
    if (v.you.canChallenge && r < 0.2) c.socket.emit('game:respond', { choice: 'challenge', step: t.step }, ack);
    else if (v.you.blockAs.length && r < 0.45) c.socket.emit('game:respond', { choice: 'block', as: v.you.blockAs[0], step: t.step }, ack);
    else c.socket.emit('game:respond', { choice: 'pass', step: t.step }, ack);
  } else if (t.phase === 'lose' && t.loserId === v.me) {
    c.socket.emit('game:lose', { card: v.hand[Math.floor(Math.random() * v.hand.length)].id }, ack);
  } else if (v.you?.exchange) {
    const cards = [...v.you.exchange.cards].sort(() => Math.random() - 0.5);
    c.socket.emit('game:exchange', { keep: cards.slice(0, v.you.exchange.keep).map((x) => x.id) }, ack);
  }
}

const a = client('Alice');
const b = client('Bob');
const d = client('Chloé');
await Promise.all([a, b, d].map((c) => new Promise((r) => c.socket.on('connect', r))));

const created = await a.call('room:create', { name: 'Alice', avatar: 'parti' });
if (!created.ok) fail(`création : ${created.error}`);
const code = created.data.code;
const joined = await b.call('room:join', { code: code.toLowerCase(), name: 'Bob', avatar: 'croix' });
if (!joined.ok) fail(`jointure : ${joined.error}`);
const third = await d.call('room:join', { code, name: 'Chloé', avatar: 'pal' });
if (!third.ok) fail(`jointure : ${third.error}`);
for (let i = 0; i < 2; i++) await a.call('room:addBot');
const denied = await b.call('game:start');
if (denied.ok) fail('un invité ne devrait pas pouvoir lancer la partie');
const started = await a.call('game:start');
if (!started.ok) fail(`lancement : ${started.error}`);
console.log(`✓ table ${code} lancée à 5 joueurs`);

// Un curieux arrive en cours de partie : il regarde, sans jamais voir une carte cachée.
const spy = client('Curieux');
await new Promise((r) => spy.socket.on('connect', r));
const watching = await spy.call('room:join', { code, name: 'Curieux', avatar: 'chef' });
if (!watching.ok) fail(`spectateur : ${watching.error}`);
spy.socket.on('state', (v) => {
  if (v.hand || v.you) fail('le spectateur reçoit une main');
});

// Bob se déconnecte puis revient avec son jeton : il doit retrouver sa place.
b.socket.disconnect();
await new Promise((r) => setTimeout(r, 30));
const b2 = client('Bob');
await new Promise((r) => b2.socket.on('connect', r));
const resumed = await b2.call('room:join', { code, ...joined.data, resumeOnly: true });
if (!resumed.ok || resumed.data.playerId !== joined.data.playerId) fail('reprise de session échouée');
console.log('✓ reconnexion de Bob sur sa place');

await new Promise((resolve) => {
  const check = setInterval(() => {
    if (a.view?.phase === 'finished') {
      clearInterval(check);
      resolve();
    }
  }, 50);
});
if (!audited || !claims.size) fail("aucun état n'a été contrôlé");
console.log(`✓ aucune carte cachée ne fuit, sur ${audited} états reçus (${claims.size} prétentions, ${challenges.size} contestations, ${blocks.size} blocages)`);
const final = a.view.final;
if (final.length !== 5) fail('il doit y avoir 5 joueurs au classement');
if (final.filter((f) => f.rank === 1).length !== 1) fail('il doit y avoir un seul vainqueur');
if (final.slice(1).some((f) => f.revealed.length !== 2)) fail('chaque exilé a ses deux cartes retournées');
if (final[0].kept.length + final[0].revealed.length !== 2) fail('le vainqueur garde ses cartes, montrées à la fin');
console.log(`✓ partie terminée, vainqueur : ${final[0].name}`);

await a.call('game:restart');
await new Promise((r) => setTimeout(r, 100));
if (a.view.phase !== 'lobby') fail('retour au salon échoué');
console.log('✓ retour au salon pour une revanche');

a.socket.close();
b2.socket.close();
d.socket.close();
spy.socket.close();
server.kill();
console.log('✓ test de bout en bout réussi');
process.exit(0);
