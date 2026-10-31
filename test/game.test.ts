// Les règles, les contestations et blocages, les bots, et les secrets de la vue envoyée à chaque joueur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIONS, ACTION_RULES, CHARACTERS, COPIES, MAX_PLAYERS, actionError, type Character, type RoomView } from '../shared/protocol';
import { AUTOPILOT, atLeastOne, chooseAction, chooseKeep, chooseLoss, credibility, randomPersonality, respond, type BotView } from '../server/bots';
import { Room, type Player } from '../server/room';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function table(humans: number, bots = 0): { room: Room; players: Player[] } {
  const room = new Room('TEST');
  const players = Array.from({ length: humans }, (_, i) => {
    const p = room.addHuman(`Joueur ${i}`, 'parti');
    if (typeof p === 'string') throw new Error(p);
    p.connected = true;
    return p;
  });
  room.hostId = players[0].id;
  for (let i = 0; i < bots; i++) room.addBot(players[0].id);
  return { room, players };
}

/** Lance une partie entre humains, et met le premier joueur de la table au trait avec deux ducats. */
function started(n: number): { room: Room; ids: string[] } {
  const { room, players } = table(n);
  room.start(players[0].id);
  const ids = room.players.map((p) => p.id);
  // On remet le premier siège au trait, avec les ducats de départ, pour des scénarios lisibles.
  room.turn!.actorId = ids[0];
  for (const p of room.players) p.coins = 2;
  return { room, ids };
}

let seq = 1000;
/** Impose les mains ; la Cour devient le reste du paquet. */
function rig(room: Room, hands: Record<string, Character[]>): void {
  for (const [id, cards] of Object.entries(hands)) room.get(id)!.hand = cards.map((character) => ({ id: ++seq, character }));
  const pool = CHARACTERS.flatMap((c) => Array.from({ length: COPIES }, () => c));
  for (const p of room.players) for (const c of [...p.hand.map((x) => x.character), ...p.revealed]) {
    const i = pool.indexOf(c);
    if (i >= 0) pool.splice(i, 1);
  }
  room.court = pool;
}

const coins = (room: Room, id: string) => room.get(id)!.coins;
const hidden = (room: Room, id: string) => room.get(id)!.hand.length;
const step = (room: Room) => room.turn!.step;

/** Tout le monde sauf ceux qui ont déjà répondu laisse passer la fenêtre en cours. */
function allPass(room: Room): void {
  const w = room.turn!.window!;
  for (const id of w.eligible) if (!w.passed.has(id)) expect(room.respond(id, 'pass', undefined, step(room))).toBeUndefined();
}

/** Laisse filer le verdict d'une contestation. */
function afterReveal(room: Room): void {
  expect(room.turn!.phase).toBe('reveal');
  vi.advanceTimersByTime(5000);
  room.tick();
}

describe('mise en place', () => {
  it('quinze cartes, deux chacun, deux ducats, et le reste dans la Cour', () => {
    const { room, players } = table(4);
    room.start(players[0].id);
    expect(room.players.every((p) => p.hand.length === 2 && p.coins === 2)).toBe(true);
    expect(room.court).toHaveLength(15 - 8);
    const all = [...room.court, ...room.players.flatMap((p) => p.hand.map((c) => c.character))];
    for (const c of CHARACTERS) expect(all.filter((x) => x === c)).toHaveLength(3);
  });

  it('à deux joueurs, celui qui commence n’a qu’un ducat', () => {
    const { room, players } = table(2);
    room.start(players[0].id);
    const first = room.get(room.turn!.actorId)!;
    const other = room.players.find((p) => p.id !== first.id)!;
    expect(first.coins).toBe(1);
    expect(other.coins).toBe(2);
  });

  it('de 2 à 6 joueurs', () => {
    const solo = table(1).room;
    expect(solo.start(solo.hostId)).toMatch(/au moins 2/);
    const { room, players } = table(1, MAX_PLAYERS - 1);
    expect(room.addBot(players[0].id)).toMatch(/complète/);
    expect(typeof room.addHuman('Tard', 'pal')).toBe('string');
    expect(room.start(players[1]?.id ?? 'x')).toBeTruthy();
    expect(room.start(players[0].id)).toBeUndefined();
  });
});

describe('actions', () => {
  it('Revenu : un ducat, sans fenêtre de réaction', () => {
    const { room, ids } = started(3);
    expect(room.act(ids[0], 'income', null)).toBeUndefined();
    expect(coins(room, ids[0])).toBe(3);
    expect(room.turn!.phase).toBe('outcome');
  });

  it('Aide étrangère : deux ducats si personne ne bloque', () => {
    const { room, ids } = started(3);
    room.act(ids[0], 'foreignAid', null);
    expect(room.turn!.window!.eligible.sort()).toEqual([ids[1], ids[2]].sort());
    allPass(room);
    expect(coins(room, ids[0])).toBe(4);
  });

  it('la Duchesse, prétendue par n’importe qui, bloque l’Aide étrangère', () => {
    const { room, ids } = started(3);
    room.act(ids[0], 'foreignAid', null);
    expect(room.respond(ids[2], 'block', 'duchesse', step(room))).toBeUndefined();
    expect(room.turn!.window!.kind).toBe('block');
    expect(room.turn!.window!.eligible.sort()).toEqual([ids[0], ids[1]].sort());
    allPass(room);
    expect(coins(room, ids[0])).toBe(2);
    expect(room.turn!.outcome!.result).toBe('blocked');
  });

  it('Taxe : trois ducats', () => {
    const { room, ids } = started(3);
    room.act(ids[0], 'tax', null);
    allPass(room);
    expect(coins(room, ids[0])).toBe(5);
  });

  it('Vol : deux ducats, ou un seul si la cible n’en a qu’un, jamais sur une bourse vide', () => {
    const { room, ids } = started(3);
    room.get(ids[1])!.coins = 1;
    room.get(ids[2])!.coins = 0;
    expect(room.act(ids[0], 'steal', ids[2])).toMatch(/ducat/);
    expect(room.act(ids[0], 'steal', ids[0])).toBeTruthy();
    room.act(ids[0], 'steal', ids[1]);
    allPass(room);
    expect(coins(room, ids[0])).toBe(3);
    expect(coins(room, ids[1])).toBe(0);
  });

  it('seule la cible peut bloquer un Vol, en Capitaine ou en Ambassadeur', () => {
    const { room, ids } = started(3);
    room.get(ids[1])!.coins = 4;
    room.act(ids[0], 'steal', ids[1]);
    expect(room.respond(ids[2], 'block', 'capitaine', step(room))).toBeTruthy();
    expect(room.respond(ids[1], 'block', 'duchesse', step(room))).toBeTruthy();
    expect(room.respond(ids[1], 'block', 'ambassadeur', step(room))).toBeUndefined();
    allPass(room);
    expect(coins(room, ids[1])).toBe(4);
  });

  it("Coup d'État : 7 ducats, imparable, la cible choisit sa carte", () => {
    const { room, ids } = started(3);
    expect(room.act(ids[0], 'coup', ids[1])).toMatch(/7 ducats/);
    room.get(ids[0])!.coins = 8;
    rig(room, { [ids[1]]: ['duchesse', 'comtesse'] });
    room.act(ids[0], 'coup', ids[1]);
    expect(coins(room, ids[0])).toBe(1);
    expect(room.turn!.phase).toBe('lose');
    expect(room.turn!.loserId).toBe(ids[1]);
    const comtesse = room.get(ids[1])!.hand.find((c) => c.character === 'comtesse')!;
    expect(room.chooseLoss(ids[2], comtesse.id)).toBeTruthy();
    expect(room.chooseLoss(ids[1], comtesse.id)).toBeUndefined();
    expect(room.get(ids[1])!.revealed).toEqual(['comtesse']);
    expect(room.get(ids[1])!.hand.map((c) => c.character)).toEqual(['duchesse']);
  });

  it("à 10 ducats, le Coup d'État est obligatoire", () => {
    const { room, ids } = started(3);
    room.get(ids[0])!.coins = 10;
    for (const a of ACTIONS) if (a !== 'coup') expect(room.act(ids[0], a, ids[1])).toMatch(/obligatoire/);
    expect(room.act(ids[0], 'coup', ids[1])).toBeUndefined();
  });

  it('Assassinat : coûte 3 ducats, la cible perd une influence', () => {
    const { room, ids } = started(3);
    room.get(ids[0])!.coins = 3;
    room.act(ids[0], 'assassinate', ids[2]);
    expect(coins(room, ids[0])).toBe(0);
    allPass(room);
    expect(room.turn!.loserId).toBe(ids[2]);
  });

  it('Échange : on pioche deux cartes et on en garde autant qu’on en avait', () => {
    const { room, ids } = started(3);
    rig(room, { [ids[0]]: ['comtesse', 'comtesse'] });
    const court = room.court.length;
    room.act(ids[0], 'exchange', null);
    allPass(room);
    expect(room.turn!.phase).toBe('exchange');
    const v = room.viewFor(ids[0]);
    expect(v.you!.exchange!.cards).toHaveLength(4);
    expect(v.you!.exchange!.keep).toBe(2);
    const cards = v.you!.exchange!.cards;
    expect(room.chooseExchange(ids[0], [cards[0].id])).toMatch(/exactement 2/);
    expect(room.chooseExchange(ids[0], [cards[2].id, cards[3].id])).toBeUndefined();
    expect(room.get(ids[0])!.hand.map((c) => c.id)).toEqual([cards[2].id, cards[3].id]);
    expect(room.court).toHaveLength(court);
  });
});

describe('contestations', () => {
  it('il avait la carte : il la montre, en pioche une autre, et le contestataire perd une influence', () => {
    const { room, ids } = started(3);
    rig(room, { [ids[0]]: ['duchesse', 'comtesse'], [ids[1]]: ['assassin', 'capitaine'] });
    room.act(ids[0], 'tax', null);
    room.respond(ids[1], 'challenge', undefined, step(room));
    expect(room.turn!.challenge).toMatchObject({ by: ids[1], of: ids[0], claim: 'duchesse', truthful: true });
    afterReveal(room);
    expect(hidden(room, ids[0])).toBe(2);
    expect(room.turn!.phase).toBe('lose');
    expect(room.turn!.loserId).toBe(ids[1]);
    room.chooseLoss(ids[1], room.get(ids[1])!.hand[0].id);
    expect(coins(room, ids[0])).toBe(5);
    expect(room.court).toHaveLength(15 - 6);
  });

  it('il bluffait : il perd une influence et son action tombe, ducats rendus', () => {
    const { room, ids } = started(3);
    room.get(ids[0])!.coins = 3;
    rig(room, { [ids[0]]: ['duchesse', 'comtesse'] });
    room.act(ids[0], 'assassinate', ids[1]);
    expect(coins(room, ids[0])).toBe(0);
    room.respond(ids[2], 'challenge', undefined, step(room));
    expect(room.turn!.challenge!.truthful).toBe(false);
    expect(coins(room, ids[0])).toBe(3);
    afterReveal(room);
    expect(room.turn!.loserId).toBe(ids[0]);
    room.chooseLoss(ids[0], room.get(ids[0])!.hand[1].id);
    expect(room.turn!.phase).toBe('outcome');
    expect(room.turn!.outcome!.result).toBe('caught');
    expect(hidden(room, ids[1])).toBe(2);
  });

  it('le premier qui conteste a la parole, les autres ne peuvent plus rien dire', () => {
    const { room, ids } = started(3);
    rig(room, { [ids[0]]: ['comtesse', 'comtesse'] });
    room.act(ids[0], 'tax', null);
    const s = step(room);
    room.respond(ids[1], 'challenge', undefined, s);
    expect(room.respond(ids[2], 'challenge', undefined, s)).toBeTruthy();
  });

  it('une réponse arrivée après un changement de situation est ignorée', () => {
    const { room, ids } = started(3);
    room.act(ids[0], 'foreignAid', null);
    const old = step(room);
    room.respond(ids[1], 'block', 'duchesse', old);
    expect(room.respond(ids[2], 'challenge', undefined, old)).toMatch(/Trop tard/);
  });

  it('contester un Assassin qui dit vrai peut coûter deux influences', () => {
    const { room, ids } = started(3);
    room.get(ids[0])!.coins = 3;
    rig(room, { [ids[0]]: ['assassin', 'duchesse'], [ids[1]]: ['capitaine', 'ambassadeur'] });
    room.act(ids[0], 'assassinate', ids[1]);
    room.respond(ids[1], 'challenge', undefined, step(room));
    afterReveal(room);
    room.chooseLoss(ids[1], room.get(ids[1])!.hand[0].id);
    // La cible peut encore bloquer après sa contestation perdue : elle laisse passer.
    expect(room.turn!.window!.kind).toBe('target');
    expect(room.viewFor(ids[1]).you!.blockAs).toEqual(['comtesse']);
    room.respond(ids[1], 'pass', undefined, step(room));
    expect(room.get(ids[1])!.status).toBe('out');
    expect(room.get(ids[1])!.revealed).toHaveLength(2);
  });

  it('bluffer la Comtesse face à un Assassin, et se faire prendre, coûte aussi deux influences', () => {
    const { room, ids } = started(3);
    room.get(ids[0])!.coins = 3;
    rig(room, { [ids[0]]: ['assassin', 'duchesse'], [ids[1]]: ['capitaine', 'ambassadeur'] });
    room.act(ids[0], 'assassinate', ids[1]);
    room.respond(ids[1], 'block', 'comtesse', step(room));
    room.respond(ids[0], 'challenge', undefined, step(room));
    expect(room.turn!.challenge).toMatchObject({ on: 'block', truthful: false });
    afterReveal(room);
    room.chooseLoss(ids[1], room.get(ids[1])!.hand[0].id);
    expect(room.get(ids[1])!.status).toBe('out');
  });

  it('une vraie Comtesse arrête l’Assassin, mais les 3 ducats restent dépensés', () => {
    const { room, ids } = started(3);
    room.get(ids[0])!.coins = 3;
    rig(room, { [ids[0]]: ['assassin', 'duchesse'], [ids[1]]: ['comtesse', 'ambassadeur'], [ids[2]]: ['capitaine', 'capitaine'] });
    room.act(ids[0], 'assassinate', ids[1]);
    room.respond(ids[1], 'block', 'comtesse', step(room));
    room.respond(ids[2], 'challenge', undefined, step(room));
    afterReveal(room);
    expect(room.turn!.loserId).toBe(ids[2]);
    room.chooseLoss(ids[2], room.get(ids[2])!.hand[0].id);
    expect(room.turn!.outcome!.result).toBe('blocked');
    expect(coins(room, ids[0])).toBe(0);
    expect(hidden(room, ids[1])).toBe(2);
  });

  it('la fenêtre se ferme toute seule au bout du délai : le silence laisse passer', () => {
    const { room, ids } = started(3);
    room.act(ids[0], 'tax', null);
    vi.advanceTimersByTime(room.settings.react * 1000 + 10);
    room.tick();
    expect(coins(room, ids[0])).toBe(5);
    expect(room.turn!.phase).toBe('outcome');
  });

  it('un exilé rend ses ducats et garde ses cartes face visible ; le dernier en lice gagne', () => {
    const { room, ids } = started(2);
    room.get(ids[0])!.coins = 7;
    rig(room, { [ids[1]]: ['duchesse'] });
    room.get(ids[1])!.revealed = ['comtesse'];
    room.act(ids[0], 'coup', ids[1]);
    expect(room.get(ids[1])!.status).toBe('out');
    expect(room.get(ids[1])!.coins).toBe(0);
    expect(room.get(ids[1])!.revealed).toEqual(['comtesse', 'duchesse']);
    vi.advanceTimersByTime(5000);
    room.tick();
    expect(room.phase).toBe('finished');
    expect(room.final![0].id).toBe(ids[0]);
  });
});

describe('secrets', () => {
  /** Une vue sans l'horloge, pour comparer. */
  const strip = (v: RoomView) => JSON.stringify({ ...v, serverNow: 0 });

  /** Mélange les cartes cachées des autres et la Cour, sans toucher à ce qui est public. */
  function scramble(room: Room, keep: string): void {
    const pool = [...room.court, ...room.players.filter((p) => p.id !== keep).flatMap((p) => p.hand.map((c) => c.character))];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (const p of room.players) if (p.id !== keep) for (const c of p.hand) c.character = pool.shift()!;
    room.court = pool;
  }

  it('la vue d’un joueur ne dépend en rien des cartes cachées des autres ni de la Cour', () => {
    const { room, ids } = started(4);
    room.act(ids[0], 'tax', null);
    for (const viewer of ids) {
      for (let k = 0; k < 20; k++) {
        const before = strip(room.viewFor(viewer));
        scramble(room, viewer);
        expect(strip(room.viewFor(viewer))).toBe(before);
      }
    }
  });

  it('ni main, ni Cour, ni identifiant de carte adverse dans la vue', () => {
    const { room, ids } = started(3);
    const v = room.viewFor(ids[1]);
    expect(v.hand!.map((c) => c.id).sort()).toEqual(room.get(ids[1])!.hand.map((c) => c.id).sort());
    const json = JSON.stringify(v.players);
    expect(json).not.toMatch(/hand|court|character/);
    for (const other of [ids[0], ids[2]]) for (const c of room.get(other)!.hand) expect(JSON.stringify(v)).not.toContain(`"id":${c.id},`);
  });

  it('les cartes de l’Échange ne vont qu’à l’Ambassadeur', () => {
    const { room, ids } = started(3);
    room.act(ids[0], 'exchange', null);
    allPass(room);
    expect(room.viewFor(ids[0]).you!.exchange!.cards).toHaveLength(4);
    expect(room.viewFor(ids[1]).you!.exchange).toBeNull();
    expect(room.viewFor(ids[2]).you!.exchange).toBeNull();
  });

  it('un spectateur ne voit aucune carte cachée', () => {
    const { room, ids } = started(3);
    const spy = room.addHuman('Curieux', 'pal');
    if (typeof spy === 'string') throw new Error(spy);
    expect(spy.status).toBe('spectator');
    room.act(ids[0], 'exchange', null);
    allPass(room);
    const v = room.viewFor(spy.id);
    expect(v.hand).toBeNull();
    expect(v.you).toBeNull();
  });

  it('aucun historique : la prétention d’un tour passé disparaît de toutes les vues', () => {
    const { room, ids } = started(3);
    room.act(ids[0], 'tax', null);
    allPass(room);
    expect(JSON.stringify(room.viewFor(ids[1]))).toContain('"tax"');
    vi.advanceTimersByTime(5000);
    room.tick();
    expect(room.turn!.actorId).toBe(ids[1]);
    for (const id of ids) {
      const json = JSON.stringify({ ...room.viewFor(id), hand: null });
      expect(json).not.toContain('"tax"');
      expect(json).not.toContain('"duchesse"');
    }
  });

  it('ce que sait un bot ne dépend pas des cartes cachées des autres', () => {
    const { room, players } = table(1, 4);
    room.start(players[0].id);
    for (const bot of room.players.filter((p) => p.isBot)) {
      const before = JSON.stringify(room.botView(bot));
      for (let k = 0; k < 10; k++) {
        scramble(room, bot.id);
        expect(JSON.stringify(room.botView(bot))).toBe(before);
      }
    }
  });
});

describe('bots', () => {
  function view(over: Partial<BotView> = {}): BotView {
    return {
      me: 'b',
      hand: ['comtesse', 'ambassadeur'],
      coins: 2,
      seats: [
        { id: 'a', coins: 2, hidden: 2, claims: [] },
        { id: 'b', coins: 2, hidden: 2, claims: [] },
        { id: 'c', coins: 2, hidden: 2, claims: [] },
      ],
      dead: [],
      court: 9,
      personality: randomPersonality(),
      ...over,
    };
  }

  it('calcule la chance qu’une main contienne un personnage', () => {
    expect(atLeastOne(13, 3, 2)).toBeCloseTo(1 - (10 * 9) / (13 * 12));
    expect(atLeastOne(13, 0, 2)).toBe(0);
  });

  it('conteste à coup sûr un personnage dont il voit les trois exemplaires', () => {
    const v = view({ hand: ['duchesse', 'comtesse'], dead: ['duchesse', 'duchesse'] });
    expect(credibility(v, 'a', 'duchesse')).toBe(0);
    for (let i = 0; i < 50; i++) {
      const r = respond({ ...v, personality: randomPersonality() }, { kind: 'action', actorId: 'a', action: 'tax', targetId: null, block: null, canChallenge: true, blockAs: [] });
      expect(r.choice).toBe('challenge');
    }
  });

  it('bloque avec la bonne carte quand on lui vole ses ducats', () => {
    const v = view({ hand: ['capitaine', 'duchesse'] });
    const r = respond(v, { kind: 'action', actorId: 'a', action: 'steal', targetId: 'b', block: null, canChallenge: true, blockAs: ['capitaine', 'ambassadeur'] });
    expect(r).toEqual({ choice: 'block', as: 'capitaine' });
  });

  it('avec une seule influence, face à un Assassin, il réagit au lieu de se laisser tuer', () => {
    let reacted = 0;
    for (let i = 0; i < 200; i++) {
      const v = view({ hand: ['duchesse'], seats: [{ id: 'a', coins: 0, hidden: 2, claims: [] }, { id: 'b', coins: 2, hidden: 1, claims: [] }], dead: ['capitaine'], court: 11 });
      const r = respond(v, { kind: 'action', actorId: 'a', action: 'assassinate', targetId: 'b', block: null, canChallenge: true, blockAs: ['comtesse'] });
      if (r.choice !== 'pass') reacted++;
    }
    expect(reacted).toBeGreaterThan(150);
  });

  it('ne joue que des actions permises, et le Coup d’État à 10 ducats', () => {
    for (let i = 0; i < 500; i++) {
      const coins = Math.floor(Math.random() * 12);
      const v = view({ coins, hand: [CHARACTERS[i % 5]], seats: [{ id: 'a', coins: i % 4, hidden: 1, claims: [] }, { id: 'b', coins, hidden: 1, claims: [] }], personality: randomPersonality() });
      const m = chooseAction(v);
      const target = v.seats.find((s) => s.id === m.target);
      expect(actionError(m.action, coins, target ? { coins: target.coins, alive: true, self: target.id === 'b' } : null)).toBeNull();
      if (coins >= 10) expect(m.action).toBe('coup');
    }
  });

  it('le pilote automatique ne bluffe jamais', () => {
    for (let i = 0; i < 300; i++) {
      const hand: Character[] = [CHARACTERS[i % 5], CHARACTERS[(i * 3) % 5]];
      const v = view({ hand, coins: i % 9, personality: AUTOPILOT });
      const m = chooseAction(v);
      const claim = ACTION_RULES[m.action].claim;
      if (claim) expect(hand).toContain(claim);
      const r = respond(v, { kind: 'action', actorId: 'a', action: 'steal', targetId: 'b', block: null, canChallenge: true, blockAs: ['capitaine', 'ambassadeur'] });
      if (r.choice === 'block') expect(hand).toContain(r.as);
    }
  });

  it('retourne sa carte la moins utile et garde le meilleur à l’Échange', () => {
    const v = view({ hand: ['ambassadeur', 'duchesse'] });
    let kept = 0;
    for (let i = 0; i < 50; i++) if (chooseLoss(v) === 0) kept++;
    expect(kept).toBeGreaterThan(45);
    const offer: Character[] = ['ambassadeur', 'duchesse', 'duchesse', 'capitaine'];
    for (let i = 0; i < 50; i++) expect(chooseKeep(v, offer, 2).map((k) => offer[k]).sort()).toEqual(['capitaine', 'duchesse']);
  });

  it('des personnalités variées : certains bluffent, d’autres non', () => {
    let bluffs = 0;
    let honest = 0;
    for (let i = 0; i < 400; i++) {
      const v = view({ hand: ['comtesse', 'comtesse'], coins: 2, personality: randomPersonality() });
      const m = chooseAction(v);
      if (ACTION_RULES[m.action].claim) bluffs++;
      else honest++;
    }
    expect(bluffs).toBeGreaterThan(40);
    expect(honest).toBeGreaterThan(40);
  });
});

describe('table', () => {
  /** Un humain qui joue au hasard, uniquement à partir de sa vue : comme le ferait l'interface. */
  function humanMove(room: Room, id: string): void {
    const v = room.viewFor(id);
    const t = v.turn;
    if (!t || v.phase !== 'playing') return;
    const me = v.players.find((p) => p.id === id)!;
    if (t.phase === 'choose' && t.actorId === id) {
      const opps = v.players.filter((p) => p.status === 'playing' && p.id !== id);
      const legal = ACTIONS.flatMap((a): { a: (typeof ACTIONS)[number]; o?: (typeof opps)[number] }[] => (ACTION_RULES[a].targeted ? opps.map((o) => ({ a, o })) : [{ a }])).filter(
        ({ a, o }) => actionError(a, me.coins, o ? { coins: o.coins, alive: true, self: false } : null) === null,
      );
      const pick = legal[Math.floor(Math.random() * legal.length)];
      expect(room.act(id, pick.a, pick.o?.id)).toBeUndefined();
    } else if (t.phase === 'respond' && v.you && !v.you.responded && t.window?.eligible.includes(id)) {
      const r = Math.random();
      if (v.you.canChallenge && r < 0.2) room.respond(id, 'challenge', undefined, t.step);
      else if (v.you.blockAs.length && r < 0.4) room.respond(id, 'block', v.you.blockAs[0], t.step);
      else room.respond(id, 'pass', undefined, t.step);
    } else if (t.phase === 'lose' && t.loserId === id) {
      expect(room.chooseLoss(id, v.hand![Math.floor(Math.random() * v.hand!.length)].id)).toBeUndefined();
    } else if (t.phase === 'exchange' && v.you?.exchange) {
      const cards = [...v.you.exchange.cards].sort(() => Math.random() - 0.5);
      expect(room.chooseExchange(id, cards.slice(0, v.you.exchange.keep).map((c) => c.id))).toBeUndefined();
    }
  }

  function playOut(room: Room, audit?: () => void): number {
    let turns = 0;
    for (let i = 0; i < 30000 && room.phase === 'playing'; i++) {
      audit?.();
      for (const p of room.players) if (!p.isBot && !p.left) humanMove(room, p.id);
      vi.advanceTimersByTime(1500);
      room.tick();
      turns = room.turn?.number ?? turns;
    }
    expect(room.phase).toBe('finished');
    return turns;
  }

  it.each([2, 3, 4, 5, 6])('des parties complètes entre bots à %i joueurs', (n) => {
    for (let g = 0; g < 6; g++) {
      const { room, players } = table(1, n - 1);
      players[0].left = true;
      room.start(players[0].id);
      playOut(room);
      const final = room.viewFor(players[0].id).final!;
      expect(final).toHaveLength(n);
      expect(final.filter((f) => f.rank === 1)).toHaveLength(1);
      expect(final[0].revealed.length).toBeLessThan(2);
      expect(final.slice(1).every((f) => f.revealed.length === 2)).toBe(true);
    }
  });

  it('humains et bots : aucune main adverse ne fuit, à aucun moment', () => {
    const { room, players } = table(3, 3);
    room.start(players[0].id);
    playOut(room, () => {
      for (const p of room.players) {
        const v = room.viewFor(p.id);
        for (const other of room.players) {
          if (other.id === p.id) continue;
          for (const c of other.hand) expect(v.hand?.some((x) => x.id === c.id) ?? false).toBe(false);
        }
        if (v.you?.exchange) expect(room.turn!.actorId).toBe(p.id);
        expect(Object.keys(v.players[0]).sort()).toEqual(['autopilot', 'avatar', 'coins', 'connected', 'hidden', 'id', 'isBot', 'isHost', 'name', 'rank', 'revealed', 'status']);
      }
      // Quinze cartes en tout, à tout moment.
      const total = room.court.length + room.players.reduce((n, x) => n + x.hand.length + x.revealed.length, 0) + (room.turn?.phase === 'exchange' ? 2 : 0);
      expect(total).toBe(15);
    });
  });

  it('un joueur parti est remplacé par le pilote et ne bloque pas la table', () => {
    const { room, players } = table(2, 1);
    room.start(players[0].id);
    room.leave(players[1].id);
    expect(room.hostId).toBe(players[0].id);
    playOut(room);
  });

  it('un joueur présent qui laisse filer son temps : le pilote joue pour lui, honnêtement', () => {
    const { room, players } = table(2);
    room.settings.think = 30;
    room.start(players[0].id);
    const actor = room.turn!.actorId;
    vi.advanceTimersByTime(29_000);
    room.tick();
    expect(room.turn!.action).toBeNull();
    vi.advanceTimersByTime(2_000);
    room.tick();
    expect(room.turn!.action).not.toBeNull();
    const claim = ACTION_RULES[room.turn!.action!].claim;
    if (claim) expect(room.get(actor)!.hand.some((c) => c.character === claim)).toBe(true);
  });

  it('une partie lancée dès la création ne prend pas le créateur pour un absent', () => {
    const room = new Room('TEST');
    const p = room.addHuman('Pressé', 'parti');
    if (typeof p === 'string') throw new Error(p);
    p.connected = true;
    room.hostId = p.id;
    room.addBot(p.id);
    room.start(p.id);
    room.turn!.actorId = p.id;
    vi.advanceTimersByTime(10_000);
    room.tick();
    expect(room.turn!.action).toBeNull();
  });

  it('retourne au salon pour une revanche, et le vainqueur commence', () => {
    const { room, players } = table(1, 2);
    players[0].left = true;
    room.start(players[0].id);
    playOut(room);
    const winner = room.final![0].id;
    players[0].left = false;
    room.restart(players[0].id);
    expect(room.phase).toBe('lobby');
    expect(room.start(players[0].id)).toBeUndefined();
    expect(room.turn!.actorId).toBe(winner);
  });
});
