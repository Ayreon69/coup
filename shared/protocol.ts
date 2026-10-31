// Contrat partagé entre le serveur et le client : personnages, actions, vues de table, réglages et constantes.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const START_COINS = 2;
/** Trois exemplaires de chacun des cinq personnages : quinze cartes en tout. */
export const COPIES = 3;
export const COUP_COST = 7;
export const ASSASSIN_COST = 3;
/** Qui commence son tour avec autant de ducats doit lancer un Coup d'État. */
export const MUST_COUP_AT = 10;

export const CHARACTERS = ['duchesse', 'assassin', 'comtesse', 'capitaine', 'ambassadeur'] as const;
export type Character = (typeof CHARACTERS)[number];

export interface CharacterInfo {
  name: string;
  /** Le nom avec son article : « la Duchesse », « l'Assassin ». */
  the: string;
  power: string;
  counter: string | null;
}

/** Les noms de l'édition française (Complots, Ferti) : la Duchesse y remplace le Duc de l'édition anglaise. */
export const CHARACTER_INFO: Record<Character, CharacterInfo> = {
  duchesse: { name: 'Duchesse', the: 'la Duchesse', power: 'Taxe : prend 3 ducats au Trésor.', counter: "Bloque l'Aide étrangère." },
  assassin: { name: 'Assassin', the: "l'Assassin", power: "Assassinat : paie 3 ducats, et la cible perd une influence.", counter: null },
  comtesse: { name: 'Comtesse', the: 'la Comtesse', power: 'Aucune action.', counter: "Bloque l'Assassinat." },
  capitaine: { name: 'Capitaine', the: 'le Capitaine', power: 'Vol : prend 2 ducats à un joueur.', counter: 'Bloque le Vol.' },
  ambassadeur: { name: 'Ambassadeur', the: "l'Ambassadeur", power: 'Échange : pioche 2 cartes de la Cour, en rend 2.', counter: 'Bloque le Vol.' },
};

export const ACTIONS = ['income', 'foreignAid', 'coup', 'tax', 'assassinate', 'steal', 'exchange'] as const;
export type ActionKind = (typeof ACTIONS)[number];

export interface ActionRule {
  label: string;
  /** Le personnage qu'il faut prétendre être (null : action générale, personne ne peut la contester). */
  claim: Character | null;
  cost: number;
  targeted: boolean;
  /** Les personnages qui bloquent l'action. Une action ciblée ne se bloque que par sa cible. */
  blockedBy: Character[];
  /** L'effet en quelques mots. */
  effect: string;
}

export const ACTION_RULES: Record<ActionKind, ActionRule> = {
  income: { label: 'Revenu', claim: null, cost: 0, targeted: false, blockedBy: [], effect: '+1 ducat' },
  foreignAid: { label: 'Aide étrangère', claim: null, cost: 0, targeted: false, blockedBy: ['duchesse'], effect: '+2 ducats' },
  coup: { label: "Coup d'État", claim: null, cost: COUP_COST, targeted: true, blockedBy: [], effect: 'Une influence en moins' },
  tax: { label: 'Taxe', claim: 'duchesse', cost: 0, targeted: false, blockedBy: [], effect: '+3 ducats' },
  assassinate: { label: 'Assassinat', claim: 'assassin', cost: ASSASSIN_COST, targeted: true, blockedBy: ['comtesse'], effect: 'Une influence en moins' },
  steal: { label: 'Vol', claim: 'capitaine', cost: 0, targeted: true, blockedBy: ['capitaine', 'ambassadeur'], effect: 'Prend 2 ducats' },
  exchange: { label: 'Échange', claim: 'ambassadeur', cost: 0, targeted: false, blockedBy: [], effect: 'Pioche 2, en rend 2' },
};

/** Pourquoi une action est impossible (null : elle est permise). La même règle des deux côtés. */
export function actionError(kind: ActionKind, coins: number, target: { coins: number; alive: boolean; self: boolean } | null): string | null {
  const rule = ACTION_RULES[kind];
  if (coins >= MUST_COUP_AT && kind !== 'coup') return `À ${MUST_COUP_AT} ducats, le Coup d'État est obligatoire.`;
  if (coins < rule.cost) return `Il faut ${rule.cost} ducats.`;
  if (!rule.targeted) return null;
  if (!target || !target.alive || target.self) return 'Choisis un adversaire encore en jeu.';
  if (kind === 'steal' && target.coins === 0) return "Ce joueur n'a plus un ducat.";
  return null;
}

/** Ce qu'on trouve sur la table et qu'on peut emporter avec soi. */
export const AVATARS = ['parti', 'coupe', 'tranche', 'ecartele', 'chevron', 'bande', 'pal', 'fasce', 'sautoir', 'croix', 'chef', 'pairle'] as const;
export const EMOTES = ['😏', '🤨', '😱', '🤥', '🙄', '👑', '🗡️', '🤝'] as const;
export const TAUNTS = ['Je ne mens jamais.', 'Prouve-le.', 'Tu bluffes.', 'Bien joué.', 'Méfie-toi de moi.', 'Rien à cacher.', 'Pas si vite…'] as const;

/** Temps pour choisir son action ou sa carte, en secondes (0 : sans limite). */
export const THINK_OPTIONS = [30, 60, 0] as const;
export type ThinkTime = (typeof THINK_OPTIONS)[number];
/** Temps laissé à la table pour contester ou bloquer, en secondes. */
export const REACT_OPTIONS = [6, 10, 15] as const;
export type ReactTime = (typeof REACT_OPTIONS)[number];

export interface Settings {
  think: ThinkTime;
  react: ReactTime;
}

export type PlayerStatus = 'lobby' | 'playing' | 'out' | 'spectator';

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  autopilot: boolean;
  status: PlayerStatus;
  /** Les ducats se voient sur la table. */
  coins: number;
  /** Combien de lettres sont encore scellées. Leur contenu, jamais. */
  hidden: number;
  /** Les personnages retournés : ils restent visibles de tous. */
  revealed: Character[];
  rank: number | null;
}

export interface Card {
  id: number;
  character: Character;
}

/**
 * choose : le joueur actif choisit son action. respond : la table peut contester ou bloquer.
 * reveal : le verdict d'une contestation. lose : quelqu'un retourne une carte.
 * exchange : l'Ambassadeur choisit ses cartes. outcome : le dénouement du tour, le temps de le lire.
 */
export type TurnPhase = 'choose' | 'respond' | 'reveal' | 'lose' | 'exchange' | 'outcome';

/** action : contester l'action ou la bloquer. target : la cible peut encore bloquer. block : contester le blocage. */
export type WindowKind = 'action' | 'target' | 'block';

export interface WindowView {
  kind: WindowKind;
  /** Ceux qui ont leur mot à dire. */
  eligible: string[];
  passed: string[];
}

export interface ChallengeView {
  by: string;
  /** Le joueur contesté et le personnage qu'il prétendait être. */
  of: string;
  claim: Character;
  on: 'action' | 'block';
  /** Il avait bien la carte : elle est montrée, puis remélangée dans la Cour. */
  truthful: boolean;
}

export type LoseReason = 'challenge' | 'coup' | 'assassinate';

export interface OutcomeView {
  result: 'success' | 'blocked' | 'caught';
  /** Les ducats gagnés (Revenu, Aide, Taxe) ou volés. */
  amount: number;
}

/** Le tour en cours, et rien d'autre : les prétentions des tours passés ne se consultent nulle part. */
export interface TurnView {
  number: number;
  actorId: string;
  phase: TurnPhase;
  /** Échéance de la phase (0 : sans limite). */
  endsAt: number;
  /** Durée totale de la phase, pour la jauge. */
  span: number;
  /** Numéro de la décision en cours : une réponse qui arrive en retard est ignorée. */
  step: number;
  action: ActionKind | null;
  targetId: string | null;
  block: { by: string; as: Character } | null;
  window: WindowView | null;
  challenge: ChallengeView | null;
  /** Qui doit retourner une carte, et pourquoi. */
  loserId: string | null;
  loseReason: LoseReason | null;
  /** Les cartes retournées pendant ce tour (elles restent de toute façon visibles devant leur propriétaire). */
  fallen: { id: string; character: Character }[];
  outcome: OutcomeView | null;
}

/** Ce que toi seul peux faire maintenant. */
export interface YouView {
  canChallenge: boolean;
  blockAs: Character[];
  responded: boolean;
  /** L'Échange : tes cartes et les deux piochées, dont tu gardes autant que tu en avais. */
  exchange: { cards: Card[]; keep: number } | null;
}

export interface PlayerStats {
  /** Prétentions sans avoir la carte. */
  bluffs: number;
  /** Bluffs démasqués par une contestation. */
  caught: number;
  /** Contestations gagnées et perdues. */
  goodCalls: number;
  badCalls: number;
  /** Influences ôtées par un Coup d'État ou un Assassinat. */
  strikes: number;
}

export interface FinalEntry {
  id: string;
  name: string;
  avatar: string;
  rank: number;
  revealed: Character[];
  /** Les cartes encore cachées du vainqueur, montrées une fois la partie finie. */
  kept: Character[];
  stats: PlayerStats;
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  me: string;
  hostId: string;
  settings: Settings;
  players: PlayerView[];
  turn: TurnView | null;
  /** Tes cartes encore cachées, à toi seul. */
  hand: Card[] | null;
  you: YouView | null;
  final: FinalEntry[] | null;
  serverNow: number;
}

export type Ack<T = unknown> = (res: { ok: boolean; error?: string; data?: T }) => void;
