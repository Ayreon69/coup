// Une table de Coup : salon, lettres scellées, actions, contestations, blocages, minuteries et classement.
import crypto from 'node:crypto';
import {
  ACTIONS,
  ACTION_RULES,
  AVATARS,
  CHARACTERS,
  COPIES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  REACT_OPTIONS,
  START_COINS,
  TAUNTS,
  THINK_OPTIONS,
  actionError,
  type ActionKind,
  type Card,
  type ChallengeView,
  type Character,
  type FinalEntry,
  type LoseReason,
  type OutcomeView,
  type PlayerStats,
  type PlayerStatus,
  type ReactTime,
  type RoomView,
  type Settings,
  type ThinkTime,
  type TurnPhase,
  type WindowKind,
} from '../shared/protocol';
import { AUTOPILOT, chooseAction, chooseKeep, chooseLoss, randomPersonality, respond, type BotAsk, type BotView, type Personality } from './bots';

const BOT_NAMES = ['Lucrezia', 'Ludovico', 'Bianca', 'Cesare', 'Isabella', 'Federico', 'Caterina', 'Lorenzo', 'Beatrice', 'Galeazzo'];
const MAX_MEMBERS = 16;
/** Délai laissé à un joueur déconnecté avant que le pilote automatique ne prenne le relais. */
const GRACE_MS = 20_000;
/** Mode accéléré pour les tests locaux (CP_FAST=1) : bots et chronos quasi instantanés. */
const FAST = process.env.CP_FAST === '1';
/** Le verdict d'une contestation, le temps que chacun le voie. */
const REVEAL_MS = FAST ? 20 : 2_300;
const REVEAL_BOTS_MS = FAST ? 10 : 1_300;
/** Le dénouement du tour, le temps de le lire. */
const OUTCOME_MS = FAST ? 20 : 2_400;
const OUTCOME_BOTS_MS = FAST ? 10 : 1_300;
/** Ce que la table retient de chacun : ses dernières prétentions. Seuls les bots s'en servent, côté serveur. */
const CLAIM_MEMORY = 4;

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: string;
  isBot: boolean;
  personality: Personality;
  sockets: Set<string>;
  connected: boolean;
  disconnectedAt: number;
  left: boolean;
  status: PlayerStatus;
  coins: number;
  /** Les lettres encore scellées : elles ne sortent du serveur que vers leur propriétaire. */
  hand: Card[];
  revealed: Character[];
  rank: number | null;
  outOrder: number;
  stats: PlayerStats;
}

interface Window {
  kind: WindowKind;
  eligible: string[];
  challengers: Set<string>;
  blockers: Map<string, Character[]>;
  passed: Set<string>;
  /** Quand chaque automate répond. */
  botAt: Map<string, number>;
}

type Step =
  | { t: 'window'; kind: WindowKind }
  | { t: 'reveal' }
  | { t: 'swap'; id: string; character: Character }
  | { t: 'lose'; id: string; reason: LoseReason }
  | { t: 'resolve' }
  | { t: 'exchange' }
  | { t: 'blocked' }
  | { t: 'caught' };

export interface Turn {
  number: number;
  actorId: string;
  phase: TurnPhase;
  step: number;
  endsAt: number;
  span: number;
  /** Quand l'automate concerné (joueur actif, perdant, Ambassadeur) agit. */
  botAt: number;
  action: ActionKind | null;
  targetId: string | null;
  paid: number;
  block: { by: string; as: Character } | null;
  window: Window | null;
  challenge: ChallengeView | null;
  /** La cible a laissé passer l'action : elle ne bloquera plus. */
  targetDeclined: boolean;
  /** Ce qu'il reste à dérouler, dans l'ordre. */
  agenda: Step[];
  loserId: string | null;
  loseReason: LoseReason | null;
  /** Les cartes retournées pendant ce tour. */
  fallen: { id: string; character: Character }[];
  /** Les deux cartes piochées par l'Ambassadeur. */
  drawn: Card[] | null;
  outcome: OutcomeView | null;
  gameOver: boolean;
}

function uid(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function emptyStats(): PlayerStats {
  return { bluffs: 0, caught: 0, goodCalls: 0, badCalls: 0, strikes: 0 };
}

function between(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

export class Room {
  readonly code: string;
  hostId = '';
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  settings: Settings = { think: 60, react: 10 };
  players: Player[] = [];
  turn: Turn | null = null;
  /** La Cour : les cartes face cachée au centre. Personne ne la voit. */
  court: Character[] = [];
  final: FinalEntry[] | null = null;
  lastActive = Date.now();
  onChange: () => void = () => {};
  onEmote: (playerId: string, text: string) => void = () => {};

  private claims = new Map<string, Character[]>();
  private turnCount = 0;
  private stepSeq = 0;
  private cardSeq = 0;
  private outCount = 0;
  private lastWinner = '';
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  get(id: string | null | undefined): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  findByToken(playerId: unknown, token: unknown): Player | undefined {
    if (typeof playerId !== 'string' || typeof token !== 'string') return undefined;
    const p = this.get(playerId);
    return p && !p.isBot && p.token === token ? p : undefined;
  }

  get seated(): Player[] {
    return this.players.filter((p) => p.status !== 'spectator');
  }

  get humansOnline(): number {
    return this.players.filter((p) => !p.isBot && p.connected).length;
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  private makePlayer(name: string, avatar: string, isBot: boolean, status: PlayerStatus): Player {
    return {
      id: uid(),
      token: uid() + uid(),
      name: this.uniqueName(name),
      avatar,
      isBot,
      personality: randomPersonality(),
      sockets: new Set(),
      connected: isBot,
      disconnectedAt: Date.now(),
      left: false,
      status,
      coins: 0,
      hand: [],
      revealed: [],
      rank: null,
      outOrder: 0,
      stats: emptyStats(),
    };
  }

  addHuman(name: string, avatar: string): Player | string {
    if (this.players.length >= MAX_MEMBERS) return 'Cette table est pleine.';
    const seatFree = this.phase === 'lobby' && this.seated.length < MAX_PLAYERS;
    if (this.phase === 'lobby' && !seatFree) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const p = this.makePlayer(name, avatar, false, seatFree ? 'lobby' : 'spectator');
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  addBot(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut ajouter des bots.";
    if (this.phase !== 'lobby') return 'On ajoute des bots dans le salon.';
    if (this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const used = new Set(this.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${this.players.length + 1}`;
    const usedAvatars = new Set(this.players.map((p) => p.avatar));
    const free = AVATARS.filter((a) => !usedAvatars.has(a));
    const pool = free.length ? free : AVATARS;
    this.players.push(this.makePlayer(name, pool[crypto.randomInt(pool.length)], true, 'lobby'));
    return undefined;
  }

  kick(by: string, target: string): { sockets: string[] } | string {
    if (by !== this.hostId) return "Seul l'hôte peut retirer un joueur.";
    if (this.phase !== 'lobby') return 'On ne peut retirer un joueur que dans le salon.';
    const p = this.get(target);
    if (!p || p.id === by) return 'Joueur introuvable.';
    this.players = this.players.filter((x) => x.id !== p.id);
    return { sockets: [...p.sockets] };
  }

  leave(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.clear();
    p.connected = false;
    p.disconnectedAt = Date.now();
    if (this.phase === 'lobby' || p.status === 'spectator') this.players = this.players.filter((x) => x.id !== id);
    else p.left = true;
    if (this.hostId === id) this.transferHost();
  }

  private transferHost(): void {
    const next = this.players.find((p) => !p.isBot && !p.left && p.connected) ?? this.players.find((p) => !p.isBot && !p.left);
    this.hostId = next?.id ?? '';
  }

  connect(p: Player, socketId: string): void {
    p.sockets.add(socketId);
    p.connected = true;
    p.left = false;
    if (!this.hostId || !this.get(this.hostId) || this.get(this.hostId)?.left) this.hostId = p.id;
  }

  disconnect(id: string | undefined, socketId: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
  }

  isAuto(p: Player): boolean {
    return p.isBot || p.left || (!p.connected && Date.now() - p.disconnectedAt >= GRACE_MS);
  }

  updateSettings(by: string, payload: Record<string, unknown>): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut changer les réglages.";
    if (this.phase !== 'lobby') return 'Les réglages se changent dans le salon.';
    const { think, react } = payload;
    if ((THINK_OPTIONS as readonly unknown[]).includes(think)) this.settings.think = think as ThinkTime;
    if ((REACT_OPTIONS as readonly unknown[]).includes(react)) this.settings.react = react as ReactTime;
    return undefined;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  alive(): Player[] {
    return this.players.filter((p) => p.status === 'playing');
  }

  /** Une carte qui entre dans une main reçoit un numéro neuf : rien ne permet de la suivre d'une main à l'autre. */
  private draw(): Card {
    return { id: ++this.cardSeq, character: this.court.shift()! };
  }

  start(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut lancer la partie.";
    if (this.phase !== 'lobby') return 'La partie est déjà lancée.';
    const seated = this.seated;
    if (seated.length < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs (ajoute un bot si besoin).`;
    const spectators = this.players.filter((p) => p.status === 'spectator');
    this.players = [...shuffle([...seated]), ...spectators];
    this.court = shuffle(CHARACTERS.flatMap((c) => Array.from({ length: COPIES }, () => c)));
    this.claims.clear();
    for (const p of seated) {
      p.status = 'playing';
      p.coins = START_COINS;
      p.hand = [this.draw(), this.draw()];
      p.revealed = [];
      p.rank = null;
      p.outOrder = 0;
      p.stats = emptyStats();
      if (p.isBot) p.personality = randomPersonality();
    }
    // Le vainqueur de la partie précédente commence ; sinon, le sort.
    const winner = seated.find((p) => p.id === this.lastWinner);
    const first = winner ?? seated[crypto.randomInt(seated.length)];
    // À deux, celui qui commence n'a qu'un ducat : l'avantage du premier coup est compensé.
    if (seated.length === 2) first.coins = 1;
    this.phase = 'playing';
    this.turnCount = 0;
    this.outCount = 0;
    this.final = null;
    this.startTurn(first.id);
    return undefined;
  }

  restart(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut relancer une partie.";
    if (this.phase === 'lobby') return undefined;
    this.clearTimer();
    this.players = this.players.filter((p) => !p.left);
    let seats = 0;
    for (const p of this.players) {
      p.status = seats < MAX_PLAYERS ? 'lobby' : 'spectator';
      if (p.status === 'lobby') seats++;
      p.coins = 0;
      p.hand = [];
      p.revealed = [];
      p.rank = null;
    }
    this.phase = 'lobby';
    this.turn = null;
    this.court = [];
    this.final = null;
    return undefined;
  }

  endEarly(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut arrêter la partie.";
    if (this.phase !== 'playing') return undefined;
    return this.restart(by);
  }

  /** Plus aucun humain en jeu : les bots accélèrent pour ne pas faire attendre ceux qui regardent. */
  private onlyBots(): boolean {
    return this.alive().every((p) => this.isAuto(p));
  }

  private botDelay(kind: 'choose' | 'respond' | 'lose' | 'exchange'): number {
    if (FAST) return between(2, 12);
    if (this.onlyBots()) return { choose: between(700, 1200), respond: between(300, 700), lose: between(400, 800), exchange: between(600, 1000) }[kind];
    return { choose: between(1500, 3400), respond: between(1000, 2900), lose: between(1100, 2000), exchange: between(1600, 3000) }[kind];
  }

  private thinkSpan(): number {
    return FAST ? 900 : this.settings.think * 1000;
  }

  private setPhase(t: Turn, phase: TurnPhase, span: number): void {
    t.phase = phase;
    t.step = ++this.stepSeq;
    t.span = span;
    t.endsAt = span ? Date.now() + span : 0;
  }

  private startTurn(actorId: string): void {
    const t: Turn = {
      number: ++this.turnCount,
      actorId,
      phase: 'choose',
      step: 0,
      endsAt: 0,
      span: 0,
      botAt: 0,
      action: null,
      targetId: null,
      paid: 0,
      block: null,
      window: null,
      challenge: null,
      targetDeclined: false,
      agenda: [],
      loserId: null,
      loseReason: null,
      fallen: [],
      drawn: null,
      outcome: null,
      gameOver: false,
    };
    this.turn = t;
    this.setPhase(t, 'choose', this.thinkSpan());
    t.botAt = Date.now() + this.botDelay('choose');
  }

  private nextAfter(id: string): string {
    const seats = this.players.filter((p) => p.status !== 'spectator');
    const i = seats.findIndex((p) => p.id === id);
    for (let k = 1; k <= seats.length; k++) {
      const p = seats[(i + k) % seats.length];
      if (p.status === 'playing') return p.id;
    }
    return id;
  }

  /** La table a entendu ce joueur prétendre ce personnage. */
  private hear(id: string, c: Character): void {
    const list = this.claims.get(id) ?? [];
    list.push(c);
    if (list.length > CLAIM_MEMORY) list.shift();
    this.claims.set(id, list);
  }

  /** Une prétention démentie ou une carte partie dans la Cour : la table l'oublie. */
  private forget(id: string, c: Character): void {
    const list = this.claims.get(id);
    if (!list) return;
    const i = list.lastIndexOf(c);
    if (i >= 0) list.splice(i, 1);
  }

  act(id: string, actionRaw: unknown, targetRaw: unknown): string | undefined {
    const t = this.turn;
    if (this.phase !== 'playing' || !t || t.phase !== 'choose') return "Ce n'est pas le moment d'agir.";
    if (t.actorId !== id) return "Ce n'est pas ton tour.";
    if (!(ACTIONS as readonly unknown[]).includes(actionRaw)) return 'Action inconnue.';
    const action = actionRaw as ActionKind;
    const me = this.get(id)!;
    const rule = ACTION_RULES[action];
    const target = rule.targeted ? this.get(typeof targetRaw === 'string' ? targetRaw : undefined) : undefined;
    const err = actionError(action, me.coins, target ? { coins: target.coins, alive: target.status === 'playing', self: target.id === id } : null);
    if (err) return err;
    me.coins -= rule.cost;
    t.paid = rule.cost;
    t.action = action;
    t.targetId = target?.id ?? null;
    if (rule.claim) {
      this.hear(id, rule.claim);
      if (!me.hand.some((c) => c.character === rule.claim)) me.stats.bluffs++;
    }
    t.agenda = rule.claim || rule.blockedBy.length ? [{ t: 'window', kind: 'action' }, { t: 'resolve' }] : [{ t: 'resolve' }];
    this.run(t);
    return undefined;
  }

  /** Déroule le tour jusqu'à la prochaine décision attendue. */
  private run(t: Turn): void {
    while (this.turn === t && this.phase === 'playing') {
      if (this.alive().length <= 1) {
        this.endTurn(t, true);
        return;
      }
      const step = t.agenda.shift();
      if (!step) {
        this.endTurn(t, false);
        return;
      }
      if (this.exec(t, step)) return;
    }
  }

  /** Exécute une étape ; vrai si quelqu'un doit maintenant décider. */
  private exec(t: Turn, step: Step): boolean {
    switch (step.t) {
      case 'window':
        return this.openWindow(t, step.kind);
      case 'reveal':
        t.window = null;
        this.setPhase(t, 'reveal', this.onlyBots() ? REVEAL_BOTS_MS : REVEAL_MS);
        return true;
      case 'swap':
        this.swap(step.id, step.character);
        return false;
      case 'lose':
        return this.openLoss(t, step.id, step.reason);
      case 'resolve':
        this.resolve(t);
        return false;
      case 'exchange':
        return this.openExchange(t);
      case 'blocked':
        t.outcome = { result: 'blocked', amount: 0 };
        t.agenda = [];
        return false;
      case 'caught':
        t.outcome = { result: 'caught', amount: 0 };
        t.agenda = [];
        return false;
    }
  }

  private openWindow(t: Turn, kind: WindowKind): boolean {
    const rule = ACTION_RULES[t.action!];
    const alive = this.alive();
    const challengers = new Set<string>();
    const blockers = new Map<string, Character[]>();
    const target = this.get(t.targetId);
    const targetAlive = target?.status === 'playing';
    if (kind === 'action') {
      if (rule.claim) for (const p of alive) if (p.id !== t.actorId) challengers.add(p.id);
      if (rule.blockedBy.length) {
        if (rule.targeted) {
          if (targetAlive) blockers.set(target!.id, [...rule.blockedBy]);
        } else for (const p of alive) if (p.id !== t.actorId) blockers.set(p.id, [...rule.blockedBy]);
      }
    } else if (kind === 'target') {
      if (rule.targeted && rule.blockedBy.length && targetAlive && !t.targetDeclined) blockers.set(target!.id, [...rule.blockedBy]);
    } else {
      for (const p of alive) if (p.id !== t.block!.by) challengers.add(p.id);
    }
    const eligible = alive.filter((p) => challengers.has(p.id) || blockers.has(p.id)).map((p) => p.id);
    if (!eligible.length) return false;
    const botAt = new Map<string, number>();
    const now = Date.now();
    for (const id of eligible) botAt.set(id, now + this.botDelay('respond'));
    t.window = { kind, eligible, challengers, blockers, passed: new Set(), botAt };
    this.setPhase(t, 'respond', FAST ? 400 : this.settings.react * 1000);
    return true;
  }

  respond(id: string, choice: unknown, as: unknown, step: unknown): string | undefined {
    const t = this.turn;
    if (this.phase !== 'playing' || !t || t.phase !== 'respond' || !t.window) return "Il n'y a rien à contester pour l'instant.";
    if (step !== undefined && step !== null && step !== t.step) return 'Trop tard : la situation a changé.';
    const w = t.window;
    if (!w.eligible.includes(id)) return "Tu n'as pas ton mot à dire ici.";
    if (w.passed.has(id)) return 'Tu as déjà laissé passer.';
    if (choice === 'pass') {
      w.passed.add(id);
      if (w.kind === 'action' && id === t.targetId) t.targetDeclined = true;
      if (w.eligible.every((e) => w.passed.has(e))) this.closeWindow(t);
      return undefined;
    }
    if (choice === 'challenge') {
      if (!w.challengers.has(id)) return "Il n'y a rien à contester.";
      this.challenge(t, id);
      return undefined;
    }
    if (choice === 'block') {
      const allowed = w.blockers.get(id);
      if (!allowed || !(allowed as readonly unknown[]).includes(as)) return 'Ce personnage ne bloque pas cette action.';
      this.declareBlock(t, id, as as Character);
      return undefined;
    }
    return 'Réponse inconnue.';
  }

  /** Tout le monde a laissé passer : on reprend le fil du tour. */
  private closeWindow(t: Turn): void {
    t.window = null;
    this.run(t);
  }

  private declareBlock(t: Turn, id: string, as: Character): void {
    t.window = null;
    t.block = { by: id, as };
    this.hear(id, as);
    const p = this.get(id)!;
    if (!p.hand.some((c) => c.character === as)) p.stats.bluffs++;
    t.agenda = [{ t: 'window', kind: 'block' }, { t: 'blocked' }];
    this.run(t);
  }

  private challenge(t: Turn, by: string): void {
    const w = t.window!;
    t.window = null;
    const on = w.kind === 'block' ? 'block' : 'action';
    const of = on === 'block' ? t.block!.by : t.actorId;
    const claim = on === 'block' ? t.block!.as : ACTION_RULES[t.action!].claim!;
    const claimant = this.get(of)!;
    const challenger = this.get(by)!;
    const truthful = claimant.hand.some((c) => c.character === claim);
    t.challenge = { by, of, claim, on, truthful };
    if (truthful) {
      challenger.stats.badCalls++;
      if (claimant.isBot && !FAST && Math.random() < 0.3) this.onEmote(claimant.id, TAUNTS[0]);
    } else {
      challenger.stats.goodCalls++;
      claimant.stats.caught++;
      this.forget(of, claim);
      if (challenger.isBot && !FAST && Math.random() < 0.3) this.onEmote(challenger.id, TAUNTS[2]);
    }
    if (on === 'action') {
      if (truthful) {
        t.agenda = [{ t: 'reveal' }, { t: 'swap', id: of, character: claim }, { t: 'lose', id: by, reason: 'challenge' }, { t: 'window', kind: 'target' }, { t: 'resolve' }];
      } else {
        // Le bluff est démasqué : l'action tombe et ce qu'elle avait coûté est rendu.
        claimant.coins += t.paid;
        t.paid = 0;
        t.outcome = { result: 'caught', amount: 0 };
        t.agenda = [{ t: 'reveal' }, { t: 'lose', id: of, reason: 'challenge' }, { t: 'caught' }];
      }
    } else if (truthful) {
      t.outcome = { result: 'blocked', amount: 0 };
      t.agenda = [{ t: 'reveal' }, { t: 'swap', id: of, character: claim }, { t: 'lose', id: by, reason: 'challenge' }, { t: 'blocked' }];
    } else {
      t.agenda = [{ t: 'reveal' }, { t: 'lose', id: of, reason: 'challenge' }, { t: 'resolve' }];
    }
    this.run(t);
  }

  /** La carte montrée retourne dans la Cour, qu'on mélange, et son propriétaire en pioche une nouvelle. */
  private swap(id: string, character: Character): void {
    const p = this.get(id);
    if (!p) return;
    const i = p.hand.findIndex((c) => c.character === character);
    if (i < 0) return;
    p.hand.splice(i, 1);
    this.court.push(character);
    shuffle(this.court);
    p.hand.push(this.draw());
    this.forget(id, character);
  }

  private openLoss(t: Turn, id: string, reason: LoseReason): boolean {
    const p = this.get(id);
    if (!p || p.status !== 'playing' || !p.hand.length) return false;
    if (p.hand.length === 1) {
      this.loseCard(t, p, p.hand[0].id);
      return false;
    }
    t.loserId = id;
    t.loseReason = reason;
    t.window = null;
    this.setPhase(t, 'lose', this.thinkSpan());
    t.botAt = Date.now() + this.botDelay('lose');
    return true;
  }

  private loseCard(t: Turn, p: Player, cardId: number): void {
    const i = p.hand.findIndex((c) => c.id === cardId);
    if (i < 0) return;
    const [card] = p.hand.splice(i, 1);
    p.revealed.push(card.character);
    t.fallen.push({ id: p.id, character: card.character });
    this.forget(p.id, card.character);
    if (!p.hand.length) {
      // Exilé : ses ducats retournent au Trésor, ses cartes restent face visible.
      p.status = 'out';
      p.outOrder = ++this.outCount;
      p.coins = 0;
    }
  }

  chooseLoss(id: string, cardId: unknown): string | undefined {
    const t = this.turn;
    if (this.phase !== 'playing' || !t || t.phase !== 'lose' || t.loserId !== id) return "Tu n'as pas de carte à retourner.";
    const p = this.get(id)!;
    if (!p.hand.some((c) => c.id === cardId)) return 'Cette carte n’est pas dans ta main.';
    this.loseCard(t, p, cardId as number);
    t.loserId = null;
    t.loseReason = null;
    this.run(t);
    return undefined;
  }

  private resolve(t: Turn): void {
    const actor = this.get(t.actorId)!;
    const target = this.get(t.targetId);
    const targetAlive = target?.status === 'playing';
    let amount = 0;
    if (actor.status === 'playing') {
      switch (t.action) {
        case 'income':
          amount = 1;
          break;
        case 'foreignAid':
          amount = 2;
          break;
        case 'tax':
          amount = 3;
          break;
        case 'steal':
          if (targetAlive) {
            amount = Math.min(2, target!.coins);
            target!.coins -= amount;
          }
          break;
        case 'coup':
        case 'assassinate':
          if (targetAlive) {
            actor.stats.strikes++;
            t.agenda.unshift({ t: 'lose', id: target!.id, reason: t.action });
          }
          break;
        case 'exchange':
          t.agenda.unshift({ t: 'exchange' });
          break;
      }
      actor.coins += amount;
    }
    t.outcome = { result: 'success', amount };
  }

  private openExchange(t: Turn): boolean {
    const actor = this.get(t.actorId);
    if (!actor || actor.status !== 'playing') return false;
    t.drawn = [this.draw(), this.draw()];
    this.setPhase(t, 'exchange', this.thinkSpan());
    t.botAt = Date.now() + this.botDelay('exchange');
    return true;
  }

  chooseExchange(id: string, keepRaw: unknown): string | undefined {
    const t = this.turn;
    if (this.phase !== 'playing' || !t || t.phase !== 'exchange' || t.actorId !== id || !t.drawn) return "Ce n'est pas le moment d'échanger.";
    const p = this.get(id)!;
    const pool = [...p.hand, ...t.drawn];
    const keep = Array.isArray(keepRaw) ? [...new Set(keepRaw)] : [];
    if (keep.length !== p.hand.length) return `Garde exactement ${p.hand.length} carte${p.hand.length > 1 ? 's' : ''}.`;
    if (!keep.every((k) => pool.some((c) => c.id === k))) return 'Carte inconnue.';
    p.hand = pool.filter((c) => keep.includes(c.id));
    this.court.push(...pool.filter((c) => !keep.includes(c.id)).map((c) => c.character));
    shuffle(this.court);
    t.drawn = null;
    // Après un Échange, la main a pu changer du tout au tout : la table ne sait plus rien de lui, sauf son Ambassadeur.
    this.claims.set(id, ['ambassadeur']);
    this.run(t);
    return undefined;
  }

  private endTurn(t: Turn, gameOver: boolean): void {
    if (!t.outcome) t.outcome = { result: 'success', amount: 0 };
    t.window = null;
    t.loserId = null;
    t.loseReason = null;
    t.gameOver = gameOver;
    t.agenda = [];
    this.setPhase(t, 'outcome', this.onlyBots() && !gameOver ? OUTCOME_BOTS_MS : OUTCOME_MS);
  }

  private finishGame(): void {
    const alive = this.alive();
    const winner = alive[0];
    const out = this.players.filter((p) => p.status === 'out').sort((a, b) => b.outOrder - a.outOrder);
    [winner, ...out].filter(Boolean).forEach((p, i) => {
      p.rank = i + 1;
    });
    this.lastWinner = winner?.id ?? '';
    this.phase = 'finished';
    this.clearTimer();
    this.final = this.players
      .filter((p) => p.rank !== null)
      .sort((a, b) => a.rank! - b.rank!)
      .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, rank: p.rank!, revealed: [...p.revealed], kept: p.rank === 1 ? p.hand.map((c) => c.character) : [], stats: { ...p.stats } }));
    if (winner?.isBot && !FAST && this.players.some((p) => !p.isBot && p.connected)) this.onEmote(winner.id, TAUNTS[3]);
  }

  // ───────────────────────────── Automates ─────────────────────────────

  /** Ce que sait un automate : sa main, la table, ce qu'il a entendu. Jamais la main des autres ni la Cour. */
  botView(p: Player): BotView {
    return {
      me: p.id,
      hand: p.hand.map((c) => c.character),
      coins: p.coins,
      seats: this.alive().map((s) => ({ id: s.id, coins: s.coins, hidden: s.hand.length, claims: [...(this.claims.get(s.id) ?? [])] })),
      dead: this.players.flatMap((x) => x.revealed),
      court: this.court.length,
      personality: p.isBot ? p.personality : AUTOPILOT,
    };
  }

  private autoAct(t: Turn, p: Player): void {
    const move = chooseAction(this.botView(p));
    if (!this.act(p.id, move.action, move.target)) return;
    // Filet de sécurité : la partie ne doit jamais se bloquer sur un automate.
    const victim = this.alive().find((x) => x.id !== p.id);
    if (this.act(p.id, 'coup', victim?.id) && this.act(p.id, 'income', null)) this.act(p.id, 'foreignAid', null);
  }

  private autoRespond(t: Turn, p: Player): void {
    const w = t.window!;
    const ask: BotAsk = {
      kind: w.kind,
      actorId: t.actorId,
      action: t.action!,
      targetId: t.targetId,
      block: t.block,
      canChallenge: w.challengers.has(p.id),
      blockAs: w.blockers.get(p.id) ?? [],
    };
    const reply = respond(this.botView(p), ask);
    const err = this.respond(p.id, reply.choice, reply.choice === 'block' ? reply.as : undefined, t.step);
    if (err) this.respond(p.id, 'pass', undefined, t.step);
  }

  private autoLose(t: Turn, p: Player): void {
    const i = chooseLoss(this.botView(p));
    this.chooseLoss(p.id, (p.hand[i] ?? p.hand[0]).id);
  }

  private autoExchange(t: Turn, p: Player): void {
    const pool = [...p.hand, ...(t.drawn ?? [])];
    const idx = chooseKeep(this.botView(p), pool.map((c) => c.character), p.hand.length);
    if (this.chooseExchange(p.id, idx.map((i) => pool[i].id))) this.chooseExchange(p.id, p.hand.map((c) => c.id));
  }

  /** L'automate doit-il agir maintenant pour ce joueur ? Un absent est remplacé ; un présent qui laisse filer le temps aussi. */
  private dueNow(p: Player, t: Turn, now: number): boolean {
    if (this.isAuto(p)) return now >= t.botAt;
    return t.endsAt > 0 && now >= t.endsAt;
  }

  // ───────────────────────────── Minuteries ─────────────────────────────

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** À appeler après chaque changement : planifie la prochaine échéance puis diffuse l'état. */
  commit(): void {
    this.reschedule();
    this.onChange();
  }

  /** Quand l'automate de ce joueur pourrait devoir agir. */
  private autoDue(p: Player, botAt: number): number {
    if (this.isAuto(p)) return botAt;
    if (!p.connected) return Math.max(botAt, p.disconnectedAt + GRACE_MS);
    return Infinity;
  }

  private reschedule(): void {
    this.clearTimer();
    const t = this.turn;
    if (this.phase !== 'playing' || !t) return;
    const now = Date.now();
    let due = t.endsAt > 0 ? t.endsAt : Infinity;
    if (t.phase === 'choose') due = Math.min(due, this.autoDue(this.get(t.actorId)!, t.botAt));
    if (t.phase === 'lose' && t.loserId) due = Math.min(due, this.autoDue(this.get(t.loserId)!, t.botAt));
    if (t.phase === 'exchange') due = Math.min(due, this.autoDue(this.get(t.actorId)!, t.botAt));
    if (t.phase === 'respond' && t.window) {
      for (const id of t.window.eligible) {
        if (t.window.passed.has(id)) continue;
        due = Math.min(due, this.autoDue(this.get(id)!, t.window.botAt.get(id) ?? now));
      }
    }
    if (due === Infinity) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        this.tick();
      } catch (e) {
        console.error(`[room ${this.code}]`, e);
      }
      this.commit();
    }, Math.max(0, Math.min(due - now, 2_147_000_000)));
  }

  tick(): void {
    const t = this.turn;
    if (this.phase !== 'playing' || !t) return;
    const now = Date.now();
    switch (t.phase) {
      case 'choose': {
        const p = this.get(t.actorId)!;
        if (this.dueNow(p, t, now)) this.autoAct(t, p);
        return;
      }
      case 'respond': {
        const w = t.window;
        if (!w) return;
        for (const id of w.eligible) {
          if (this.turn !== t || t.window !== w) return;
          const p = this.get(id)!;
          if (!w.passed.has(id) && this.isAuto(p) && now >= (w.botAt.get(id) ?? 0)) this.autoRespond(t, p);
        }
        if (this.turn === t && t.window === w && t.endsAt > 0 && now >= t.endsAt) {
          // Le temps est écoulé : qui n'a rien dit laisse passer.
          for (const id of w.eligible) {
            if (w.passed.has(id)) continue;
            w.passed.add(id);
            if (w.kind === 'action' && id === t.targetId) t.targetDeclined = true;
          }
          this.closeWindow(t);
        }
        return;
      }
      case 'lose': {
        const p = this.get(t.loserId);
        if (p && this.dueNow(p, t, now)) this.autoLose(t, p);
        return;
      }
      case 'exchange': {
        const p = this.get(t.actorId)!;
        if (this.dueNow(p, t, now)) this.autoExchange(t, p);
        return;
      }
      case 'reveal':
        if (now >= t.endsAt) this.run(t);
        return;
      case 'outcome':
        if (now < t.endsAt) return;
        if (t.gameOver) this.finishGame();
        else this.startTurn(this.nextAfter(t.actorId));
        return;
    }
  }

  dispose(): void {
    this.clearTimer();
  }

  // ───────────────────────────── Vue personnalisée ─────────────────────────────

  viewFor(viewerId: string): RoomView {
    const t = this.turn;
    const me = this.get(viewerId);
    const w = t?.window ?? null;
    const seatedMe = me && me.status !== 'spectator' && me.status !== 'lobby';
    return {
      code: this.code,
      phase: this.phase,
      me: viewerId,
      hostId: this.hostId,
      settings: { ...this.settings },
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isBot: p.isBot,
        isHost: p.id === this.hostId,
        connected: p.isBot || p.connected,
        autopilot: !p.isBot && p.status === 'playing' && this.isAuto(p),
        status: p.status,
        coins: p.coins,
        hidden: p.hand.length,
        revealed: [...p.revealed],
        rank: p.rank,
      })),
      turn: t
        ? {
            number: t.number,
            actorId: t.actorId,
            phase: t.phase,
            endsAt: t.endsAt,
            span: t.span,
            step: t.step,
            action: t.action,
            targetId: t.targetId,
            block: t.block ? { ...t.block } : null,
            window: w ? { kind: w.kind, eligible: [...w.eligible], passed: [...w.passed] } : null,
            challenge: t.challenge ? { ...t.challenge } : null,
            loserId: t.phase === 'lose' ? t.loserId : null,
            loseReason: t.phase === 'lose' ? t.loseReason : null,
            fallen: t.fallen.map((f) => ({ ...f })),
            outcome: t.phase === 'outcome' && t.outcome ? { ...t.outcome } : null,
          }
        : null,
      // Le cœur du jeu : une main ne sort du serveur que vers son propriétaire.
      hand: seatedMe && this.phase !== 'lobby' ? me.hand.map((c) => ({ ...c })) : null,
      you:
        seatedMe && t && this.phase === 'playing'
          ? {
              canChallenge: t.phase === 'respond' && !!w && w.challengers.has(viewerId) && !w.passed.has(viewerId),
              blockAs: t.phase === 'respond' && w && !w.passed.has(viewerId) ? [...(w.blockers.get(viewerId) ?? [])] : [],
              responded: !!w && w.passed.has(viewerId),
              exchange: t.phase === 'exchange' && t.actorId === viewerId && t.drawn ? { cards: [...me.hand, ...t.drawn].map((c) => ({ ...c })), keep: me.hand.length } : null,
            }
          : null,
      final: this.final,
      serverNow: Date.now(),
    };
  }
}
