// La table : la cour tout autour, l'action en cours au centre, tes lettres et tes décisions en bas.
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Check, Coins, Flag, HandCoins, LogOut, MoreHorizontal, ShieldCheck, Smile, Swords, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ACTIONS,
  ACTION_RULES,
  CHARACTER_INFO,
  EMOTES,
  MUST_COUP_AT,
  TAUNTS,
  actionError,
  type ActionKind,
  type Card,
  type Character,
  type PlayerView,
  type RoomView,
  type TurnView,
} from '../../../shared/protocol';
import { CardFace, Coin, Emblem, MiniCard, Seal, Shield, charVars } from '../components/Art';
import { Bubble, Button, Modal } from '../components/Ui';
import { sfx } from '../lib/sound';
import { fallenText, loseReasonText, outcomeText, subject, the, type NameOf } from '../lib/text';
import { cls, plural, secondsLeft, useTick, vibrate } from '../lib/util';
import { leaveRoom, send, socket } from '../net';
import { useStore, type Emote } from '../store';

const GENERAL_ICONS: Partial<Record<ActionKind, typeof Coins>> = { income: Coins, foreignAid: HandCoins, coup: Swords };

/** La jauge du temps qui reste, sous ce qui attend une décision. */
function Gauge({ endsAt, span, urgentFor }: { endsAt: number; span: number; urgentFor?: boolean }) {
  const now = useTick(200);
  const left = Math.max(0, endsAt - now);
  const secs = secondsLeft(endsAt, now);
  const urgent = !!urgentFor && secs <= 5 && left > 0;
  useEffect(() => {
    if (urgent) sfx.tick();
  }, [urgent, secs]);
  if (!endsAt || !span) return null;
  return (
    <div className={cls('gauge', urgent && 'is-urgent')} role="timer" aria-label={`${secs} secondes`}>
      <span style={{ transform: `scaleX(${Math.min(1, left / span)})` }} />
    </div>
  );
}

/** Une somme qui change sur un siège : « +3 » qui s'envole, le temps de le voir. */
function CoinDelta({ coins }: { coins: number }) {
  const prev = useRef(coins);
  const [delta, setDelta] = useState<{ id: number; d: number } | null>(null);
  useEffect(() => {
    const d = coins - prev.current;
    prev.current = coins;
    if (!d) return;
    const id = Date.now();
    setDelta({ id, d });
    const t = setTimeout(() => setDelta((x) => (x?.id === id ? null : x)), 1400);
    return () => clearTimeout(t);
  }, [coins]);
  if (!delta) return null;
  return (
    <motion.span key={delta.id} className={cls('coin-delta', delta.d < 0 && 'is-minus')} initial={{ opacity: 0, y: 4 }} animate={{ opacity: [0, 1, 1, 0], y: -16 }} transition={{ duration: 1.3 }} aria-hidden>
      {delta.d > 0 ? `+${delta.d}` : delta.d}
    </motion.span>
  );
}

/** Le rôle d'un joueur dans le tour en cours, pour l'étiquette de son siège. */
function seatRole(p: PlayerView, t: TurnView): { tag: string; tone: string } | null {
  const w = t.window;
  if (p.status === 'out') return { tag: 'exilé', tone: 'out' };
  if (t.phase === 'lose' && t.loserId === p.id) return { tag: 'ouvre une lettre', tone: 'hit' };
  if (t.phase === 'exchange' && t.actorId === p.id) return { tag: 'échange', tone: 'actor' };
  if (t.phase === 'respond' && w?.eligible.includes(p.id)) {
    const aimed = t.targetId === p.id && w.kind !== 'block' ? 'visé, ' : '';
    return w.passed.includes(p.id) ? { tag: `${aimed}laisse passer`, tone: 'pass' } : { tag: `${aimed}hésite…`, tone: 'wait' };
  }
  if (t.challenge && t.challenge.by === p.id && t.phase !== 'choose') return { tag: 'conteste', tone: 'challenge' };
  if (t.block?.by === p.id) return { tag: 'bloque', tone: 'block' };
  if (t.actorId === p.id) return { tag: t.phase === 'choose' ? 'réfléchit…' : 'joue', tone: 'actor' };
  if (t.targetId === p.id && t.phase !== 'choose') return { tag: 'visé', tone: 'hit' };
  return null;
}

function Seat({ p, t, emotes, targetable, chosen, onPick }: { p: PlayerView; t: TurnView; emotes: Emote[]; targetable: boolean; chosen: boolean; onPick: () => void }) {
  const role = seatRole(p, t);
  const out = p.status === 'out';
  const cards = [...Array.from({ length: p.hidden }, () => null), ...p.revealed];
  const label = `${p.name}, ${plural(p.coins, 'ducat')}, ${plural(p.hidden, 'lettre')} scellée${p.hidden > 1 ? 's' : ''}${p.revealed.length ? `, retournée${p.revealed.length > 1 ? 's' : ''} : ${p.revealed.map((c) => CHARACTER_INFO[c].name).join(', ')}` : ''}${role ? `, ${role.tag}` : ''}`;
  const body = (
    <>
      <Bubble emotes={emotes} />
      <span className="seat-top">
        <Shield avatar={p.avatar} className="seat-shield" title="" />
        <span className="seat-name">{p.name}</span>
      </span>
      <span className="seat-bottom">
        <span className="seat-coins">
          <Coin />
          <b>{p.coins}</b>
          <CoinDelta coins={p.coins} />
        </span>
        <span className="seat-cards">
          {cards.map((c, i) => (
            <motion.span key={`${i}-${c ?? 'x'}`} initial={c ? { rotateY: 90 } : false} animate={{ rotateY: 0 }} transition={{ duration: 0.35 }}>
              <MiniCard c={c} />
            </motion.span>
          ))}
        </span>
      </span>
      {role && <span className={cls('seat-tag', `is-${role.tone}`)}>{role.tag}</span>}
      {p.autopilot && !out && <span className="seat-auto">pilote auto</span>}
      {!p.connected && !p.autopilot && !out && <span className="seat-auto">hors ligne</span>}
    </>
  );
  const aimed = t.targetId === p.id && t.phase !== 'choose' && t.phase !== 'outcome' && !out;
  const acting = t.actorId === p.id && !out;
  const classes = cls('seat', role && `role-${role.tone}`, aimed && 'is-aimed', acting && 'is-acting', out && 'is-out', targetable && 'is-targetable', chosen && 'is-chosen');
  if (targetable)
    return (
      <button type="button" className={classes} aria-label={`Viser ${label}`} aria-pressed={chosen} onClick={onPick}>
        {body}
      </button>
    );
  return (
    <div className={classes} aria-label={label} role="group">
      {body}
    </div>
  );
}

/** Le tapis du centre : l'action en cours, ses réactions, et son dénouement. Rien des tours passés. */
function Stage({ view, t, nameOf, hasPad }: { view: RoomView; t: TurnView; nameOf: NameOf; hasPad: boolean }) {
  const me = view.me;
  const actor = view.players.find((p) => p.id === t.actorId);
  const mine = t.actorId === me;

  if (t.phase === 'choose' || !t.action) {
    const meP = view.players.find((p) => p.id === me);
    return (
      <div className={cls('stage', 'is-choose', mine && 'is-mine')} aria-live="polite">
        <motion.div key={`c${t.number}`} className="stage-turn" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <Shield avatar={actor?.avatar} className="stage-shield" title="" />
          {mine ? (
            <div>
              <strong>À toi de jouer</strong>
              <span>{meP && meP.coins >= MUST_COUP_AT ? `${MUST_COUP_AT} ducats : le Coup d'État est obligatoire.` : 'Choisis une action, vraie ou fausse.'}</span>
            </div>
          ) : (
            <div>
              <strong>{nameOf(t.actorId)}</strong>
              <span>choisit son action…</span>
            </div>
          )}
        </motion.div>
        <Gauge endsAt={t.endsAt} span={t.span} urgentFor={mine} />
      </div>
    );
  }

  const rule = ACTION_RULES[t.action];
  const claim = rule.claim;
  const c = t.challenge;
  const showVerdict = !!c && t.phase !== 'respond';
  const fallen = fallenText(t, me, nameOf);

  let status = '';
  if (t.phase === 'respond' && t.window) {
    const order = view.players.map((p) => p.id);
    const waiting = t.window.eligible.filter((id) => !t.window!.passed.includes(id)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const iWait = waiting.includes(me);
    const others = waiting.filter((id) => id !== me).map((id) => nameOf(id));
    if (t.window.kind === 'block') status = iWait ? 'Tu peux contester ce blocage.' : `La table peut contester le blocage${others.length ? ` : ${others.join(', ')}` : ''}…`;
    else if (t.window.kind === 'target') status = iWait ? 'Tu peux encore bloquer.' : `${nameOf(t.targetId)} peut encore bloquer…`;
    else if (iWait) status = claim ? (rule.blockedBy.length && view.you?.blockAs.length ? 'Tu peux contester ou bloquer.' : 'Tu peux contester.') : 'Tu peux bloquer.';
    else status = `En attente : ${others.join(', ')}…`;
  } else if (t.phase === 'lose') status = t.loserId === me ? `Tu perds une influence (${loseReasonText(t.loseReason)}) : choisis ta lettre.` : `${nameOf(t.loserId)} choisit la lettre à ouvrir…`;
  else if (t.phase === 'exchange') status = mine ? 'Choisis les lettres que tu gardes.' : `${nameOf(t.actorId)} choisit ses lettres dans la Cour…`;

  return (
    <div className={cls('stage', `is-${t.phase}`, mine && 'is-mine', t.targetId === me && 'is-target')} aria-live="polite">
      <motion.article key={`a${t.number}`} className="decree parchment" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.22 }}>
        <div className="decree-head">
          <Shield avatar={actor?.avatar} className="decree-shield" title="" />
          <span className="decree-who">{mine ? (claim ? 'Tu' : 'Toi') : nameOf(t.actorId)}</span>
          {claim ? (
            <span className="decree-claim" style={charVars(claim)}>
              {mine ? 'te dis' : 'se dit'} <b>{CHARACTER_INFO[claim].name}</b>
            </span>
          ) : (
            <span className="decree-claim is-general">action générale</span>
          )}
        </div>
        <div className="decree-body">
          {claim ? (
            <motion.span key={`s${t.number}`} initial={{ scale: 1.7, rotate: -14, opacity: 0 }} animate={{ scale: 1, rotate: -6, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 16 }}>
              <Seal c={claim} className="decree-seal" broken={showVerdict && c?.on === 'action' && !c.truthful} />
            </motion.span>
          ) : (
            <span className="decree-icon">{(() => {
              const Icon = GENERAL_ICONS[t.action] ?? Coins;
              return <Icon size={30} aria-hidden />;
            })()}</span>
          )}
          <div className="decree-action">
            <strong>{rule.label}</strong>
            <span>{rule.targeted ? `contre ${t.targetId === me ? 'toi' : nameOf(t.targetId)}` : rule.effect}</span>
          </div>
        </div>

        {t.block && (
          <motion.div className="decree-block" style={charVars(t.block.as)} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
            <ShieldCheck size={18} aria-hidden />
            <span>
              {subject(t.block.by, me, nameOf)} {t.block.by === me ? 'bloques' : 'bloque'}, {t.block.by === me ? 'te disant' : 'se disant'} <b>{CHARACTER_INFO[t.block.as].name}</b>
            </span>
            <Seal c={t.block.as} className="decree-mini-seal" broken={showVerdict && c?.on === 'block' && !c.truthful} />
          </motion.div>
        )}

        {c && (
          <motion.div className={cls('decree-challenge', showVerdict && (c.truthful ? 'is-true' : 'is-false'))} initial={{ opacity: 0, scale: 1.15 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}>
            <Swords size={18} aria-hidden />
            <span>
              {subject(c.by, me, nameOf)} {c.by === me ? 'contestes' : 'conteste'}{' '}
              {c.of === me ? (c.on === 'block' ? 'ton blocage' : 'ta prétention') : `${c.on === 'block' ? 'le blocage' : 'la prétention'} de ${nameOf(c.of)}`} !
            </span>
          </motion.div>
        )}

        {showVerdict && c && (
          <motion.div className={cls('verdict', c.truthful ? 'is-true' : 'is-false')} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            {c.truthful ? (
              <>
                {t.phase === 'reveal' && (
                  <motion.span className="verdict-card" initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={{ duration: 0.4 }}>
                    <CardFace c={c.claim} />
                  </motion.span>
                )}
                <span>
                  <b>{c.of === me ? 'Tu avais' : `${nameOf(c.of)} avait`} bien {the(c.claim)}.</b>
                  <small>{c.of === me ? 'Elle retourne dans la Cour, tu en pioches une autre.' : 'Elle retourne dans la Cour, une autre est piochée.'}</small>
                </span>
              </>
            ) : (
              <>
                <span className="stamp">Bluff</span>
                <span>
                  <b>{c.of === me ? 'Tu n’avais pas' : `${nameOf(c.of)} n'avait pas`} {the(c.claim)}.</b>
                </span>
              </>
            )}
          </motion.div>
        )}

        {t.phase === 'outcome' && (
          <motion.div className={cls('decree-outcome', `is-${t.outcome?.result ?? 'success'}`)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <b>{outcomeText(t, me, nameOf)}</b>
            {fallen.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </motion.div>
        )}

        {status && !hasPad && <p className="decree-status">{status}</p>}
        {t.phase === 'lose' && fallen.length > 0 && <p className="decree-status is-quiet">{fallen.join(' ')}</p>}
        {(t.phase === 'respond' || t.phase === 'lose' || t.phase === 'exchange') && <Gauge endsAt={t.endsAt} span={t.span} urgentFor={(t.phase === 'respond' && !!view.you && !view.you.responded && !!t.window?.eligible.includes(me)) || t.loserId === me || (t.phase === 'exchange' && mine)} />}
      </motion.article>
    </div>
  );
}

/** Les sept actions, et la cible quand il en faut une. */
function ActionPad({ opps, coins, hand, pick, setPick, target, setTarget }: { opps: PlayerView[]; coins: number; hand: Card[]; pick: ActionKind | null; setPick: (a: ActionKind | null) => void; target: string | null; setTarget: (id: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const must = coins >= MUST_COUP_AT;
  const holds = (c: Character | null) => !c || hand.some((h) => h.character === c);
  const rule = pick ? ACTION_RULES[pick] : null;
  const targetP = opps.find((o) => o.id === target);
  const err = pick ? actionError(pick, coins, rule!.targeted ? (targetP ? { coins: targetP.coins, alive: true, self: false } : null) : null) : 'Choisis une action.';

  // Une seule cible possible : elle est choisie d'office.
  useEffect(() => {
    if (!rule?.targeted) {
      setTarget(null);
      return;
    }
    const valid = opps.filter((o) => !(pick === 'steal' && o.coins === 0));
    if (valid.length === 1) setTarget(valid[0].id);
    else if (target && !valid.some((o) => o.id === target)) setTarget(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);

  useEffect(() => {
    if (must) setPick('coup');
  }, [must]);

  const go = async (kind = pick, tgt = target) => {
    if (!kind || busy) return;
    setBusy(true);
    const ok = await send('game:act', { action: kind, target: ACTION_RULES[kind].targeted ? tgt : null });
    setBusy(false);
    if (ok) {
      setPick(null);
      setTarget(null);
    }
  };

  const confirmText = (() => {
    if (!pick || !rule) return 'Choisis une action';
    if (rule.targeted && !targetP) return pick === 'steal' ? 'Choisis qui voler' : 'Choisis ta cible';
    if (err) return err;
    if (pick === 'coup') return `Coup d'État contre ${targetP!.name}`;
    if (pick === 'assassinate') return `Assassiner ${targetP!.name}`;
    if (pick === 'steal') return `Voler ${targetP!.name}`;
    return `Annoncer : ${rule.label}`;
  })();

  return (
    <div className="pad action-pad">
      <div className="action-grid" role="radiogroup" aria-label="Ton action">
        {ACTIONS.map((a) => {
          const r = ACTION_RULES[a];
          const blocked = actionError(a, coins, r.targeted ? { coins: 9, alive: true, self: false } : null);
          const Icon = GENERAL_ICONS[a];
          const bluff = !holds(r.claim);
          return (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={pick === a}
              disabled={!!blocked}
              title={blocked ?? undefined}
              className={cls('action-btn', r.claim ? 'is-char' : 'is-general', pick === a && 'is-on')}
              style={r.claim ? charVars(r.claim) : undefined}
              onClick={() => {
                sfx.pick();
                setPick(pick === a ? null : a);
              }}
              onDoubleClick={() => {
                if (!r.targeted) void go(a, null);
              }}
            >
              <span className="action-icon">{r.claim ? <Emblem c={r.claim} /> : Icon && <Icon size={20} aria-hidden />}</span>
              <span className="action-text">
                <b>{r.label}</b>
                <small>{r.cost ? `${r.cost} ducats` : r.effect}</small>
              </span>
              {r.claim && bluff && !blocked && <span className="action-claim">bluff</span>}
            </button>
          );
        })}
      </div>
      {must && <p className="pad-note">À {MUST_COUP_AT} ducats, le Coup d'État est obligatoire.</p>}
      {rule?.targeted && (
        <div className="target-row" role="radiogroup" aria-label="Ta cible">
          <span className="target-label">{pick === 'steal' ? 'Voler qui ?' : 'Contre qui ?'}</span>
          {opps.map((o) => {
            const off = pick === 'steal' && o.coins === 0;
            return (
              <button key={o.id} type="button" role="radio" aria-checked={target === o.id} disabled={off} className={cls('target-chip', target === o.id && 'is-on')} onClick={() => setTarget(o.id)}>
                <Shield avatar={o.avatar} className="chip-shield" title="" />
                <span>{o.name}</span>
                <small>
                  <Coin /> {o.coins}
                </small>
              </button>
            );
          })}
        </div>
      )}
      <Button variant="primary" className="pad-go" disabled={!!err || busy} onClick={() => void go()}>
        {pick && rule?.claim && !err ? (
          <span className="go-inner">
            {confirmText}
            <small>{holds(rule.claim) ? `tu as ${the(rule.claim)}` : `bluff : tu te dis ${CHARACTER_INFO[rule.claim].name}`}</small>
          </span>
        ) : (
          confirmText
        )}
      </Button>
    </div>
  );
}

/** Contester, bloquer, laisser passer : les trois réponses possibles, en grand. */
function ResponsePad({ view, t, hand, nameOf }: { view: RoomView; t: TurnView; hand: Card[]; nameOf: NameOf }) {
  const you = view.you!;
  const [busy, setBusy] = useState<string | null>(null);
  const answer = async (choice: 'pass' | 'challenge' | 'block', as?: Character) => {
    if (busy) return;
    setBusy(choice + (as ?? ''));
    await send('game:respond', { choice, as, step: t.step });
    setBusy(null);
  };
  const w = t.window!;
  const claim = w.kind === 'block' ? t.block!.as : ACTION_RULES[t.action!].claim;
  const claimant = w.kind === 'block' ? t.block!.by : t.actorId;
  let question = '';
  if (w.kind === 'block') question = `${nameOf(claimant)} se dit ${claim ? CHARACTER_INFO[claim].name : '?'} pour bloquer.`;
  else if (w.kind === 'target') question = `${nameOf(t.actorId)} avait bien ${claim ? the(claim) : '?'}. Bloquer quand même ?`;
  else if (claim) question = `${nameOf(claimant)} se dit ${CHARACTER_INFO[claim].name}.`;
  else question = `${nameOf(t.actorId)} demande l'Aide étrangère.`;
  const targeted = t.targetId === view.me && w.kind !== 'block';

  return (
    <div className={cls('pad', 'response-pad', targeted && 'is-target')}>
      <p className="pad-question">
        {targeted && <b className="pad-alert">C'est toi qu'on vise. </b>}
        {question}
      </p>
      <div className="response-btns">
        {you.canChallenge && (
          <Button variant="danger" className="resp-btn" icon={<Swords size={20} />} disabled={!!busy} onClick={() => void answer('challenge')}>
            Contester
          </Button>
        )}
        {you.blockAs.map((c) => {
          const bluff = !hand.some((h) => h.character === c);
          return (
            <Button key={c} className="resp-btn is-block" style={charVars(c)} icon={<Emblem c={c} />} disabled={!!busy} onClick={() => void answer('block', c)}>
              <span className="go-inner">
                Bloquer en tant que {CHARACTER_INFO[c].name}
                <small>{bluff ? 'bluff : tu ne l’as pas' : `tu as ${the(c)}`}</small>
              </span>
            </Button>
          );
        })}
        <Button variant="ghost" className="resp-btn is-pass" icon={<Check size={20} />} disabled={!!busy} onClick={() => void answer('pass')}>
          Laisser passer
        </Button>
      </div>
    </div>
  );
}

/** Perdre une influence : on choisit la lettre qu'on ouvre. */
function LosePad({ t, hand }: { t: TurnView; hand: Card[] }) {
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = hand.find((c) => c.id === pick);
  const go = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    await send('game:lose', { card: chosen.id });
    setBusy(false);
  };
  return (
    <div className="pad lose-pad">
      <p className="pad-question">
        <b className="pad-alert">Tu perds une influence</b> ({loseReasonText(t.loseReason)}). Quelle lettre ouvres-tu ?
      </p>
      <div className="lose-cards" role="radiogroup" aria-label="La carte à retourner">
        {hand.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={pick === c.id} aria-label={CHARACTER_INFO[c.character].name} className={cls('pick-card', pick === c.id && 'is-on')} onClick={() => setPick(c.id)} onDoubleClick={() => void go()}>
            <CardFace c={c.character} />
          </button>
        ))}
      </div>
      <Button variant="danger" className="pad-go" disabled={!chosen || busy} onClick={() => void go()}>
        {chosen ? `Retourner ${the(chosen.character)}` : 'Touche la carte à sacrifier'}
      </Button>
    </div>
  );
}

/** L'Échange : on garde autant de lettres qu'on en avait, le reste retourne à la Cour. */
function ExchangePad({ cards, keep, handIds }: { cards: Card[]; keep: number; handIds: Set<number> }) {
  const [picked, setPicked] = useState<number[]>(() => cards.filter((c) => handIds.has(c.id)).map((c) => c.id));
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  // Rien ne se retire tout seul : si la main est pleine, on dit quoi faire.
  const toggle = (id: number) => {
    sfx.pick();
    if (picked.includes(id)) {
      setPicked(picked.filter((x) => x !== id));
      setFull(false);
    } else if (picked.length >= keep) setFull(true);
    else {
      setPicked([...picked, id]);
      setFull(false);
    }
  };
  const go = async () => {
    if (picked.length !== keep || busy) return;
    setBusy(true);
    await send('game:exchange', { keep: picked });
    setBusy(false);
  };
  return (
    <div className="pad exchange-pad">
      <p className="pad-question" aria-live="polite">
        {full ? (
          <b className="pad-alert">Tu en gardes déjà {keep} : touche d'abord celle que tu rends.</b>
        ) : (
          <>
            Garde <b>{plural(keep, 'lettre')}</b>, les autres retournent dans la Cour.
          </>
        )}
      </p>
      <div className="exchange-cards" role="group" aria-label="Les cartes de l'Échange">
        {cards.map((c) => (
          <button key={c.id} type="button" aria-pressed={picked.includes(c.id)} aria-label={`${CHARACTER_INFO[c.character].name}, ${handIds.has(c.id) ? 'ta carte' : 'piochée'}`} className={cls('pick-card', picked.includes(c.id) && 'is-on')} onClick={() => toggle(c.id)}>
            <CardFace c={c.character} />
            <span className="pick-note">{handIds.has(c.id) ? 'ta carte' : 'piochée'}</span>
          </button>
        ))}
      </div>
      <Button variant="primary" className="pad-go" disabled={picked.length !== keep || busy} onClick={() => void go()}>
        {picked.length === keep ? `Garder ${picked.length > 1 ? 'ces lettres' : 'cette lettre'}` : `Choisis encore ${plural(keep - picked.length, 'lettre')}`}
      </Button>
    </div>
  );
}

function ReactionTray({ onClose }: { onClose: () => void }) {
  const emit = (emoji: string) => {
    socket.emit('emote', { emoji });
    onClose();
  };
  return (
    <motion.div className="reactions parchment" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} role="dialog" aria-label="Réactions">
      <div className="reaction-emojis">
        {EMOTES.map((e) => (
          <button key={e} type="button" onClick={() => emit(e)} aria-label={`Réaction ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="reaction-taunts">
        {TAUNTS.map((x) => (
          <button key={x} type="button" onClick={() => emit(x)}>
            {x}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/** Sons et vibrations : ils se déduisent des changements d'état reçus du serveur. */
function useTurnEffects(view: RoomView) {
  const t = view.turn;
  const prev = useRef<{ n: number; phase: string; action: string | null; block: boolean; challenge: boolean; fallen: number; step: number } | null>(null);
  useEffect(() => {
    if (!t) return;
    const me = view.me;
    const p = prev.current;
    const fresh = !p || p.n !== t.number;
    if (fresh && t.actorId === me && t.phase === 'choose') {
      sfx.turn();
      vibrate(30);
    }
    if (t.action && (fresh || !p?.action)) {
      if (ACTION_RULES[t.action].claim) sfx.stamp();
      if (t.targetId === me && (t.action === 'assassinate' || t.action === 'coup' || t.action === 'steal')) {
        setTimeout(() => sfx.alarm(), 180);
        vibrate([40, 60, 40]);
      }
    }
    if (t.block && !p?.block && !fresh) sfx.block();
    if (t.challenge && (!p?.challenge || fresh)) {
      sfx.challenge();
      if (t.challenge.of === me) vibrate(80);
    }
    if (t.phase === 'reveal' && p?.phase !== 'reveal' && t.challenge) {
      sfx.flip();
      setTimeout(() => (t.challenge!.truthful ? sfx.truth() : sfx.caught()), 220);
    }
    if (t.fallen.length > (fresh ? 0 : p?.fallen ?? 0)) {
      sfx.toll();
      if (t.fallen.some((f) => f.id === me)) vibrate(140);
    }
    if (t.phase === 'outcome' && p?.phase !== 'outcome' && t.outcome?.result === 'success' && t.outcome.amount > 0) sfx.coins(t.outcome.amount);
    if (t.phase === 'respond' && p?.step !== t.step && t.window?.eligible.includes(me) && t.targetId !== me) vibrate(15);
    if (t.phase === 'lose' && t.loserId === me && p?.step !== t.step) vibrate([60, 40, 60]);
    prev.current = { n: t.number, phase: t.phase, action: t.action, block: !!t.block, challenge: !!t.challenge, fallen: t.fallen.length, step: t.step };
  }, [t, view.me]);
}

function Menu({ view, open, onClose }: { view: RoomView; open: boolean; onClose: () => void }) {
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const [confirmStop, setConfirmStop] = useState(false);
  const isHost = view.hostId === view.me;
  const close = () => {
    setConfirmStop(false);
    onClose();
  };
  return (
    <Modal open={open} onClose={close} title="Menu">
      <div className="menu-list">
        <Button icon={prefs.sound ? <Volume2 size={18} /> : <VolumeX size={18} />} onClick={() => setPrefs({ sound: !prefs.sound })}>
          Son : {prefs.sound ? 'activé' : 'coupé'}
        </Button>
        <Button
          icon={<BookOpen size={18} />}
          onClick={() => {
            close();
            setRulesOpen(true);
          }}
        >
          Les règles
        </Button>
        {isHost && (
          <Button
            variant="danger"
            icon={<Flag size={18} />}
            onClick={() => {
              // Deux appuis : un geste malheureux ne doit pas couper la partie de toute la table.
              if (!confirmStop) {
                setConfirmStop(true);
                return;
              }
              close();
              void send('game:end');
            }}
          >
            {confirmStop ? 'Confirmer : arrêter pour tout le monde' : 'Arrêter la partie'}
          </Button>
        )}
        <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
          Quitter la table
        </Button>
      </div>
    </Modal>
  );
}

export function Table({ view }: { view: RoomView }) {
  const emotes = useStore((s) => s.emotes);
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const [menu, setMenu] = useState(false);
  const [react, setReact] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [pick, setPick] = useState<ActionKind | null>(null);
  useTurnEffects(view);
  const t = view.turn;
  const turnNumber = t?.number;
  // Un nouveau tour efface l'action qu'on était en train de préparer.
  useEffect(() => {
    setPick(null);
    setTarget(null);
  }, [turnNumber]);

  const seats = view.players.filter((p) => p.status === 'playing' || p.status === 'out');
  const me = seats.find((p) => p.id === view.me);
  // On tourne la table pour que le joueur suivant soit le premier affiché.
  const others = useMemo(() => {
    const i = seats.findIndex((p) => p.id === view.me);
    return i < 0 ? seats : [...seats.slice(i + 1), ...seats.slice(0, i)];
  }, [seats, view.me]);
  const nameOf: NameOf = (id) => (id === view.me ? 'toi' : view.players.find((p) => p.id === id)?.name ?? '?');

  if (!t) {
    return (
      <main className="table-screen is-empty">
        <p className="waiting" role="status">
          <span className="spinner" /> La cour se rassemble…
        </p>
      </main>
    );
  }

  const hand = view.hand ?? [];
  const alive = me?.status === 'playing';
  const myTurn = alive && t.phase === 'choose' && t.actorId === view.me;
  const you = view.you;
  const canRespond = alive && t.phase === 'respond' && !!you && !you.responded && (you.canChallenge || you.blockAs.length > 0);
  const mustLose = alive && t.phase === 'lose' && t.loserId === view.me;
  const exchange = alive ? you?.exchange ?? null : null;
  const busyPad = myTurn || canRespond || mustLose || !!exchange;
  const targeting = myTurn ? target : null;
  const aiming = myTurn && !!pick && ACTION_RULES[pick].targeted;

  return (
    <div className={cls('table-screen', busyPad && 'has-pad')}>
      <header className="topbar">
        <span className="topbar-title">
          <Seal className="topbar-seal" />
          <span>Tour {t.number}</span>
        </span>
        <div className="topbar-tools">
          <button type="button" className="icon-btn" aria-label="Les règles" onClick={() => setRulesOpen(true)}>
            <BookOpen size={19} />
          </button>
          <button type="button" className="icon-btn" aria-label={prefs.sound ? 'Couper le son' : 'Activer le son'} onClick={() => setPrefs({ sound: !prefs.sound })}>
            {prefs.sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
          <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}>
            <MoreHorizontal size={20} />
          </button>
        </div>
      </header>

      <section className="court" data-count={Math.min(others.length, 5)} aria-label="Les autres joueurs">
        {others.map((p) => (
          <Seat
            key={p.id}
            p={p}
            t={t}
            emotes={emotes.filter((e) => e.playerId === p.id)}
            targetable={aiming && p.status === 'playing' && !(pick === 'steal' && p.coins === 0)}
            chosen={targeting === p.id}
            onPick={() => setTarget(p.id)}
          />
        ))}
      </section>

      <Stage view={view} t={t} nameOf={nameOf} hasPad={busyPad} />

      <section className={cls('dock', busyPad && 'is-busy', myTurn && 'is-turn')} aria-label="Ta main">
        {me ? (
          <div className="dock-me">
            <Bubble emotes={emotes.filter((e) => e.playerId === view.me)} className="is-mine" />
            <div className="dock-id">
              <Shield avatar={me.avatar} className="dock-shield" title="" />
              <div>
                <span className="dock-name">{me.name}</span>
                <span className="dock-coins">
                  <Coin />
                  <b>{me.coins}</b>
                  <span className="sr-only">ducats</span>
                  <CoinDelta coins={me.coins} />
                </span>
              </div>
            </div>
            <div className={cls('dock-cards', busyPad && 'is-small', (mustLose || !!exchange) && 'is-hidden')} aria-label="Tes lettres">
              {hand.map((c) => (
                <motion.span key={c.id} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.35 }}>
                  <CardFace c={c.character} label={`Ta carte : ${CHARACTER_INFO[c.character].name}`} />
                </motion.span>
              ))}
              {me.revealed.map((c, i) => (
                <CardFace key={`r${i}`} c={c} dead className="is-revealed" />
              ))}
            </div>
            <button type="button" className={cls('react-btn', react && 'is-on')} aria-label="Réagir" aria-expanded={react} onClick={() => setReact((x) => !x)}>
              {react ? <X size={20} /> : <Smile size={20} />}
            </button>
            <AnimatePresence>{react && <ReactionTray onClose={() => setReact(false)} />}</AnimatePresence>
          </div>
        ) : (
          <p className="dock-off">Tu regardes la partie depuis la galerie.</p>
        )}

        {myTurn && me && <ActionPad key={t.number} opps={others.filter((p) => p.status === 'playing')} coins={me.coins} hand={hand} pick={pick} setPick={setPick} target={target} setTarget={setTarget} />}
        {canRespond && <ResponsePad key={t.step} view={view} t={t} hand={hand} nameOf={nameOf} />}
        {mustLose && <LosePad key={t.step} t={t} hand={hand} />}
        {exchange && <ExchangePad key={t.step} cards={exchange.cards} keep={exchange.keep} handIds={new Set(hand.map((c) => c.id))} />}
        {me && me.status === 'out' && <p className="dock-off">Tes deux lettres sont ouvertes : tu es exilé. Reste pour voir qui l'emporte.</p>}
        {alive && t.phase === 'respond' && you?.responded && <p className="dock-wait">Tu laisses passer. On attend les autres…</p>}
      </section>

      <Menu view={view} open={menu} onClose={() => setMenu(false)} />
    </div>
  );
}

