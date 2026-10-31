// Les phrases du jeu : qui prétend quoi, contre qui, et comment ça se termine. Seulement pour le tour en cours.
import { ACTION_RULES, CHARACTER_INFO, type ActionKind, type Character, type LoseReason, type TurnView } from '../../../shared/protocol';
import { plural } from './util';

export type NameOf = (id: string | null | undefined) => string;

export function the(c: Character): string {
  return CHARACTER_INFO[c].the;
}

/** « Taxe : +3 ducats », « Vol sur Bianca ». */
export function actionLine(action: ActionKind, target: string | null, nameOf: NameOf, me: string): string {
  const rule = ACTION_RULES[action];
  if (!rule.targeted) return `${rule.label} · ${rule.effect.toLowerCase()}`;
  const who = target === me ? 'toi' : nameOf(target);
  return `${rule.label} contre ${who}`;
}

/** Le sujet d'une phrase : « Tu » ou le nom. */
export function subject(id: string | null | undefined, me: string, nameOf: NameOf): string {
  return id === me ? 'Tu' : nameOf(id);
}

export function loseReasonText(r: LoseReason | null): string {
  if (r === 'coup') return "un Coup d'État";
  if (r === 'assassinate') return 'un Assassinat';
  return 'une contestation perdue';
}

/** Le dénouement du tour, en une phrase. */
export function outcomeText(t: TurnView, me: string, nameOf: NameOf): string {
  const o = t.outcome;
  if (!o || !t.action) return '';
  const actor = subject(t.actorId, me, nameOf);
  const mine = t.actorId === me;
  if (o.result === 'caught') return mine ? 'Ton bluff est démasqué : ton action tombe.' : `Bluff démasqué : l'action de ${nameOf(t.actorId)} tombe.`;
  if (o.result === 'blocked') return mine ? 'Ton action est bloquée.' : `L'action de ${nameOf(t.actorId)} est bloquée.`;
  switch (t.action) {
    case 'income':
    case 'foreignAid':
    case 'tax':
      return `${actor} ${mine ? 'prends' : 'prend'} ${plural(o.amount, 'ducat')}.`;
    case 'steal': {
      if (!o.amount) return 'Il ne restait rien à voler.';
      const victim = t.targetId === me ? 'toi' : nameOf(t.targetId);
      return `${actor} ${mine ? 'voles' : 'vole'} ${plural(o.amount, 'ducat')} à ${victim}.`;
    }
    case 'exchange':
      return mine ? 'Tu as renouvelé tes lettres.' : `${nameOf(t.actorId)} a renouvelé ses lettres.`;
    case 'coup':
    case 'assassinate': {
      const hit = t.fallen.find((f) => f.id === t.targetId);
      if (!hit) return 'La cible était déjà hors jeu.';
      return t.targetId === me ? 'Tu perds une influence.' : `${nameOf(t.targetId)} perd une influence.`;
    }
  }
  return '';
}

/** « Bianca retourne la Comtesse. » pour chaque carte tombée ce tour-ci. */
export function fallenText(t: TurnView, me: string, nameOf: NameOf): string[] {
  return t.fallen.map((f) => `${subject(f.id, me, nameOf)} ${f.id === me ? 'retournes' : 'retourne'} ${the(f.character)}.`);
}
