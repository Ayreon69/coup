// Cerveau des bots : ils ne connaissent que leurs cartes, ce qui est posé sur la table et ce qu'ils ont entendu.
import { ACTION_RULES, ASSASSIN_COST, COPIES, COUP_COST, MUST_COUP_AT, type ActionKind, type Character, type WindowKind } from '../shared/protocol';

export interface Personality {
  /** Goût du mensonge : prétendre un personnage qu'on n'a pas (0 à 1). 0 : ne ment jamais. */
  bluff: number;
  /** Méfiance : tendance à contester (0 à 1). */
  doubt: number;
  /** Goût de l'attaque : préférer frapper plutôt qu'amasser (0 à 1). */
  aggro: number;
  /** Mémoire des prétentions entendues (0 à 1). */
  memory: number;
}

export function randomPersonality(rng: () => number = Math.random): Personality {
  return { bluff: 0.1 + rng() * 0.75, doubt: 0.15 + rng() * 0.7, aggro: 0.2 + rng() * 0.7, memory: 0.2 + rng() * 0.8 };
}

/** Le pilote automatique d'un joueur absent : prudent et honnête, il ne bluffe jamais à sa place. */
export const AUTOPILOT: Personality = { bluff: 0, doubt: 0.25, aggro: 0.5, memory: 0.6 };

/** Un joueur encore en jeu, tel que tout le monde le voit. */
export interface Seat {
  id: string;
  coins: number;
  hidden: number;
  /** Ce qu'il a prétendu être ces derniers tours, le plus récent en dernier : la table l'a entendu. */
  claims: Character[];
}

/** Tout ce qu'un bot sait. Les cartes cachées des autres et la Cour n'y figurent pas : il ne peut pas tricher. */
export interface BotView {
  me: string;
  hand: Character[];
  coins: number;
  /** Les joueurs encore en jeu, dans l'ordre de la table, lui compris. */
  seats: Seat[];
  /** Toutes les cartes retournées sur la table. */
  dead: Character[];
  /** Le nombre de cartes dans la Cour. */
  court: number;
  personality: Personality;
}

export interface BotMove {
  action: ActionKind;
  target: string | null;
}

/** Ce qu'on demande au bot pendant une fenêtre de réaction. */
export interface BotAsk {
  kind: WindowKind;
  actorId: string;
  action: ActionKind;
  targetId: string | null;
  block: { by: string; as: Character } | null;
  canChallenge: boolean;
  blockAs: Character[];
}

export type BotReply = { choice: 'pass' } | { choice: 'challenge' } | { choice: 'block'; as: Character };

const COIN = 0.09;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function count<T>(list: readonly T[], x: T): number {
  return list.filter((y) => y === x).length;
}

function seat(view: BotView, id: string | null): Seat | undefined {
  return id ? view.seats.find((s) => s.id === id) : undefined;
}

function others(view: BotView): Seat[] {
  return view.seats.filter((s) => s.id !== view.me);
}

/** Les exemplaires de ce personnage que le bot ne voit nulle part : ni retournés, ni dans sa main. */
export function unseen(view: BotView, c: Character): number {
  return Math.max(0, COPIES - count(view.dead, c) - count(view.hand, c));
}

/** Chance qu'une main de h cartes tirées parmi u inconnues contienne au moins un des k exemplaires restants. */
export function atLeastOne(u: number, k: number, h: number): number {
  if (k <= 0 || h <= 0) return 0;
  if (u - k < h) return 1;
  let none = 1;
  for (let i = 0; i < h; i++) none *= (u - k - i) / (u - i);
  return 1 - none;
}

/** Les prétentions dont le bot se souvient, selon sa mémoire. */
function remembered(view: BotView, s: Seat): Character[] {
  const depth = 1 + Math.round(view.personality.memory * 3);
  return s.claims.slice(-depth);
}

/** Chance que ce joueur ait vraiment le personnage qu'il prétend être, vue par le bot. */
export function credibility(view: BotView, claimant: string, c: Character): number {
  const s = seat(view, claimant);
  if (!s) return 0;
  const k = unseen(view, c);
  if (k === 0) return 0;
  const unknown = others(view).reduce((n, o) => n + o.hidden, 0) + view.court;
  const prior = atLeastOne(unknown, k, s.hidden);
  // Un joueur annonce souvent ce qu'il a ; un méfiant croit au bluff plus volontiers.
  const ifHas = 0.85;
  const ifNot = 0.24 + view.personality.doubt * 0.3;
  let odds = (prior * ifHas) / Math.max(1e-6, (1 - prior) * ifNot);
  const past = remembered(view, s);
  if (past.includes(c)) odds *= 1.7;
  const otherRoles = new Set(past.filter((x) => x !== c)).size;
  if (otherRoles >= 2) odds *= 0.55;
  return clamp(odds / (1 + odds), 0, 0.99);
}

/** Chance qu'on conteste le bot s'il prétend ce personnage : les autres ne voient que les cartes retournées. */
function challengeRisk(view: BotView, c: Character): number {
  const dead = count(view.dead, c);
  if (dead >= COPIES) return 1;
  return clamp(0.1 + dead * 0.2 + (others(view).length - 1) * 0.035 + (remembered(view, seat(view, view.me)!).some((x) => x !== c) ? 0.05 : 0), 0.05, 0.9);
}

/** Ce que coûte au bot de perdre une influence : tout, s'il n'en a plus qu'une. */
function lossCost(s: Seat): number {
  return s.hidden >= 2 ? 1 : 2.6;
}

/** La menace qu'un adversaire fait peser : sa fortune, son influence, ce qu'il a prétendu. */
function threat(view: BotView, s: Seat): number {
  const past = remembered(view, s);
  return s.coins * 0.08 + s.hidden * 0.3 + (past.includes('assassin') ? 0.2 : 0) + (past.includes('duchesse') ? 0.1 : 0);
}

function pickTarget(view: BotView, kind: 'coup' | 'assassinate' | 'steal', rng: () => number): Seat | null {
  const opps = others(view).filter((s) => kind !== 'steal' || s.coins > 0);
  if (!opps.length) return null;
  let best = opps[0];
  let score = -Infinity;
  for (const o of opps) {
    const past = remembered(view, o);
    let v = threat(view, o) + rng() * 0.3;
    if (kind !== 'steal' && o.hidden === 1) v += 0.35 + view.personality.aggro * 0.2;
    if (kind === 'assassinate' && past.includes('comtesse')) v -= 0.5;
    if (kind === 'steal') {
      v = Math.min(2, o.coins) * 0.3 + o.coins * 0.05 + rng() * 0.3;
      if (past.includes('capitaine') || past.includes('ambassadeur')) v -= 0.45;
    }
    if (v > score) {
      score = v;
      best = o;
    }
  }
  return best;
}

/** Chance qu'un adversaire bloque : on se fie à ce qu'il a déjà prétendu. */
function blockOdds(view: BotView, blockers: Seat[], by: Character[]): number {
  let none = 1;
  for (const b of blockers) {
    const past = remembered(view, b);
    const claimed = by.some((c) => past.includes(c));
    none *= 1 - (claimed ? 0.6 : 0.15 + 0.05 * by.length);
  }
  return 1 - none;
}

/** Le tour du bot : chaque action reçoit une valeur, les bluffs sont pesés contre le risque d'être démasqué. */
export function chooseAction(view: BotView, rng: () => number = Math.random): BotMove {
  const p = view.personality;
  const me = seat(view, view.me)!;
  const opps = others(view);
  const honest = p.bluff === 0;
  if (view.coins >= MUST_COUP_AT) return { action: 'coup', target: pickTarget(view, 'coup', rng)?.id ?? opps[0].id };

  const has = (c: Character) => view.hand.includes(c);
  const risk = lossCost(me);
  /** Le prix d'un mensonge, pondéré par le goût du bluff. Interdit au pilote automatique. */
  const lie = (c: Character) => (has(c) ? 0 : honest || challengeRisk(view, c) >= 1 ? Infinity : challengeRisk(view, c) * risk * (1.4 - 1.2 * p.bluff));
  const threshold = (after: number) => (view.coins < COUP_COST && after >= COUP_COST ? 0.15 : 0);
  const noise = () => (rng() - 0.5) * (0.12 + p.bluff * 0.1);
  const options: { move: BotMove; value: number }[] = [];
  const push = (move: BotMove, value: number) => {
    if (Number.isFinite(value)) options.push({ move, value: value + noise() });
  };

  push({ action: 'income', target: null }, COIN + threshold(view.coins + 1));
  const aidBlock = blockOdds(view, opps, ['duchesse']);
  push({ action: 'foreignAid', target: null }, 2 * COIN * (1 - aidBlock) + threshold(view.coins + 2) * (1 - aidBlock));
  push({ action: 'tax', target: null }, 3 * COIN + threshold(view.coins + 3) - lie('duchesse'));

  if (view.coins >= COUP_COST) {
    const t = pickTarget(view, 'coup', rng);
    if (t) push({ action: 'coup', target: t.id }, 0.95 + p.aggro * 0.35 - COUP_COST * COIN * 0.4);
  }
  if (view.coins >= ASSASSIN_COST) {
    const t = pickTarget(view, 'assassinate', rng);
    if (t) {
      const blocked = blockOdds(view, [t], ['comtesse']);
      const kill = (t.hidden === 1 ? 1.1 : 0.8) + p.aggro * 0.25;
      push({ action: 'assassinate', target: t.id }, kill * (1 - blocked) - ASSASSIN_COST * COIN - lie('assassin'));
    }
  }
  const victim = pickTarget(view, 'steal', rng);
  if (victim) {
    const take = Math.min(2, victim.coins);
    const blocked = blockOdds(view, [victim], ['capitaine', 'ambassadeur']);
    push({ action: 'steal', target: victim.id }, take * COIN * 1.6 * (1 - blocked) + threshold(view.coins + take) - lie('capitaine'));
  }
  // L'Échange sert à se refaire une main : plus elle est faible, plus il tente.
  const weak = view.hand.every((c) => c === 'ambassadeur' || c === 'comtesse') ? 0.15 : 0;
  push({ action: 'exchange', target: null }, 0.12 + weak - lie('ambassadeur'));

  options.sort((a, b) => b.value - a.value);
  return options[0]?.move ?? { action: 'income', target: null };
}

/** Ce que coûte au bot de laisser tenir la prétention en jeu (négatif : ça l'arrange). */
function stakes(view: BotView, ask: BotAsk): number {
  const me = seat(view, view.me)!;
  const actor = seat(view, ask.actorId);
  const many = view.seats.length > 2 ? 1 : 1.6;
  const value = (): number => {
    switch (ask.action) {
      case 'assassinate':
        return ask.targetId === view.me ? lossCost(me) : -0.1;
      case 'steal': {
        if (ask.targetId === view.me) return Math.min(2, me.coins) * COIN * 1.4 + (me.coins >= COUP_COST && me.coins - 2 < COUP_COST ? 0.3 : 0);
        return 0.04;
      }
      case 'tax':
        return (0.12 + (actor && actor.coins < COUP_COST && actor.coins + 3 >= COUP_COST ? 0.3 : 0)) * many;
      case 'foreignAid':
        return (0.08 + (actor && actor.coins < COUP_COST && actor.coins + 2 >= COUP_COST ? 0.25 : 0)) * many;
      case 'exchange':
        return 0.06 * many;
      default:
        return 0;
    }
  };
  if (ask.kind !== 'block') return value();
  // Le blocage tient : l'action échoue. Bon pour la table, sauf pour celui qui agit.
  if (ask.actorId !== view.me) return -0.4 * Math.max(0, value());
  switch (ask.action) {
    case 'assassinate': {
      const t = seat(view, ask.targetId);
      return (t?.hidden === 1 ? 1.2 : 0.85) + view.personality.aggro * 0.2;
    }
    case 'steal':
      return 0.3;
    case 'foreignAid':
      return 0.2;
    default:
      return 0.1;
  }
}

/** Contester, bloquer (pour de vrai ou au bluff) ou laisser passer : le bot choisit ce qui lui coûte le moins. */
export function respond(view: BotView, ask: BotAsk, rng: () => number = Math.random): BotReply {
  const p = view.personality;
  const me = seat(view, view.me)!;
  const harm = stakes(view, ask);
  const noise = () => (rng() - 0.5) * 0.18;
  let best: BotReply = { choice: 'pass' };
  let bestCost = harm;

  if (ask.blockAs.length) {
    const real = ask.blockAs.find((c) => view.hand.includes(c));
    if (real) {
      // Avec la bonne carte, bloquer ne coûte rien : une contestation se retournerait contre son auteur.
      if (harm > 0.02 || rng() < 0.6) return { choice: 'block', as: real };
    } else if (p.bluff > 0) {
      const as = [...ask.blockAs].sort((a, b) => challengeRisk(view, a) - challengeRisk(view, b))[0];
      const q = challengeRisk(view, as) + (ask.action === 'assassinate' ? 0.08 : 0);
      // Démasqué sur un Assassinat, on perd deux influences d'un coup.
      const caught = ask.action === 'assassinate' ? lossCost(me) + (me.hidden >= 2 ? 1.6 : 0) : lossCost(me) + harm;
      const cost = q >= 1 ? Infinity : q * caught * (1.25 - p.bluff * 0.6) + noise();
      if (cost < bestCost) {
        best = { choice: 'block', as };
        bestCost = cost;
      }
    }
  }

  if (ask.canChallenge) {
    const claimant = ask.kind === 'block' ? ask.block!.by : ask.actorId;
    const claim = ask.kind === 'block' ? ask.block!.as : ACTION_RULES[ask.action].claim!;
    const cred = credibility(view, claimant, claim);
    const them = seat(view, claimant);
    const gain = them?.hidden === 1 ? 0.75 : 0.4;
    // Si l'autre dit vrai, le bot perd une influence et l'action passe quand même ; s'il ment, l'action tombe.
    const cost = cred * (lossCost(me) + Math.max(0, harm)) - (1 - cred) * gain - (p.doubt - 0.4) * 0.35 + noise();
    if (cred === 0) return { choice: 'challenge' };
    if (cost < bestCost) {
      best = { choice: 'challenge' };
      bestCost = cost;
    }
  }
  return best;
}

/** La valeur d'un personnage dans la main du bot, selon la table. */
function cardValue(view: BotView, c: Character): number {
  const heard = view.seats.filter((s) => s.id !== view.me).flatMap((s) => remembered(view, s));
  switch (c) {
    case 'duchesse':
      return 1;
    case 'assassin':
      return 0.8 + (view.coins >= ASSASSIN_COST ? 0.15 : 0);
    case 'capitaine':
      return 0.8;
    case 'comtesse':
      return 0.7 + (heard.includes('assassin') ? 0.25 : 0);
    case 'ambassadeur':
      return 0.55;
  }
}

/** La carte à retourner : la moins utile, en gardant de préférence ce qu'il a déjà prétendu. */
export function chooseLoss(view: BotView, rng: () => number = Math.random): number {
  const mine = remembered(view, seat(view, view.me)!);
  let worst = 0;
  let low = Infinity;
  view.hand.forEach((c, i) => {
    const v = cardValue(view, c) + (mine.includes(c) ? 0.15 : 0) + (rng() - 0.5) * 0.12;
    if (v < low) {
      low = v;
      worst = i;
    }
  });
  return worst;
}

/** L'Échange : garder les meilleures cartes, sans doublon si possible. */
export function chooseKeep(view: BotView, cards: Character[], keep: number, rng: () => number = Math.random): number[] {
  const pool = cards.map((c, i) => ({ i, c, v: cardValue(view, c) + (rng() - 0.5) * 0.15 }));
  const picked: typeof pool = [];
  while (picked.length < Math.min(keep, pool.length)) {
    let best = pool.find((o) => !picked.includes(o))!;
    let top = -Infinity;
    for (const o of pool) {
      if (picked.includes(o)) continue;
      // Deux fois le même personnage, c'est une seule corde à son arc.
      const v = o.v * (picked.some((x) => x.c === o.c) ? 0.55 : 1);
      if (v > top) {
        top = v;
        best = o;
      }
    }
    picked.push(best);
  }
  return picked.map((o) => o.i);
}
