// Fin de partie : le vainqueur et ses lettres enfin ouvertes, le classement, les distinctions et la revanche.
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { LogOut, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { FinalEntry, RoomView } from '../../../shared/protocol';
import { CardFace, MiniCard, Shield } from '../components/Art';
import { Button, Logo } from '../components/Ui';
import { sfx } from '../lib/sound';
import { cls, plural } from '../lib/util';
import { leaveRoom, send } from '../net';

interface Award {
  title: string;
  entry: FinalEntry;
  detail: string;
}

const GOLD = ['#f0d48a', '#d9b25f', '#b8321f', '#efe7d4', '#2b5797'];

/** Les distinctions de la séance : elles ne se révèlent qu'une fois la partie finie. */
function awards(final: FinalEntry[]): Award[] {
  const best = (score: (f: FinalEntry) => number) => {
    const sorted = [...final].sort((a, b) => score(b) - score(a));
    return sorted[0] && score(sorted[0]) > 0 ? sorted[0] : null;
  };
  const list: Award[] = [];
  const liar = best((f) => f.stats.bluffs - f.stats.caught);
  if (liar) list.push({ title: 'Menteur impuni', entry: liar, detail: `${plural(liar.stats.bluffs - liar.stats.caught, 'bluff')} jamais démasqué${liar.stats.bluffs - liar.stats.caught > 1 ? 's' : ''}` });
  const hound = best((f) => f.stats.goodCalls);
  if (hound) list.push({ title: 'Fin limier', entry: hound, detail: `${plural(hound.stats.goodCalls, 'contestation')} gagnée${hound.stats.goodCalls > 1 ? 's' : ''}` });
  const iron = best((f) => f.stats.strikes);
  if (iron) list.push({ title: 'Main de fer', entry: iron, detail: `${plural(iron.stats.strikes, 'influence')} ôtée${iron.stats.strikes > 1 ? 's' : ''} par le fer ou l'or` });
  const caught = best((f) => f.stats.caught);
  if (caught) list.push({ title: 'La main dans le sac', entry: caught, detail: `${plural(caught.stats.caught, 'bluff')} démasqué${caught.stats.caught > 1 ? 's' : ''}` });
  const doubt = best((f) => f.stats.badCalls);
  if (doubt) list.push({ title: 'Le doute de trop', entry: doubt, detail: `${plural(doubt.stats.badCalls, 'contestation')} perdue${doubt.stats.badCalls > 1 ? 's' : ''}` });
  return list;
}

export function Final({ view }: { view: RoomView }) {
  const final = view.final ?? [];
  const isHost = view.hostId === view.me;
  const winner = final[0];
  const iWon = winner?.id === view.me;
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    if (iWon) {
      sfx.victory();
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        void confetti({ particleCount: 140, spread: 95, origin: { y: 0.35 }, colors: GOLD });
        setTimeout(() => void confetti({ particleCount: 70, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors: GOLD }), 450);
        setTimeout(() => void confetti({ particleCount: 70, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors: GOLD }), 750);
      }
    } else sfx.fall();
  }, [iWon]);

  const list = awards(final);

  return (
    <main className="final">
      <header className="final-top">
        <Logo size="sm" />
        <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
          Quitter
        </Button>
      </header>

      {winner && (
        <motion.section className="final-winner" initial={{ scale: 0.92 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }}>
          <span className="eyebrow">{iWon ? 'La cour est à toi' : 'Règne désormais sur la cour'}</span>
          <div className="final-medal">
            <Shield avatar={winner.avatar} className="final-shield" />
          </div>
          <h1>{iWon ? 'Tu l’emportes !' : winner.name}</h1>
          {winner.kept.length > 0 && (
            <div className="final-kept">
              <p className="muted">{iWon ? 'Tes lettres encore scellées :' : 'Ses lettres encore scellées, enfin ouvertes :'}</p>
              <div className="final-cards">
                {winner.kept.map((c, i) => (
                  <motion.span key={i} initial={{ scale: 0.7, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.3 + i * 0.15, type: 'spring', stiffness: 260, damping: 16 }}>
                    <CardFace c={c} />
                  </motion.span>
                ))}
              </div>
            </div>
          )}
        </motion.section>
      )}

      <div className="final-grid">
        <section className="sheet">
          <h3>Classement</h3>
          <ol className="rank-list">
            {final.map((f) => (
              <li key={f.id} className={cls('rank-row', f.id === view.me && 'is-me')}>
                <span className="rank-n">{f.rank}</span>
                <Shield avatar={f.avatar} className="player-shield" />
                <span className="player-name">
                  {f.name}
                  {f.id === view.me && <span className="muted"> (toi)</span>}
                </span>
                <span className="rank-cards">
                  {f.revealed.map((c, i) => (
                    <MiniCard key={i} c={c} />
                  ))}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {list.length > 0 && (
          <section className="sheet">
            <h3>Distinctions</h3>
            <ul className="award-list">
              {list.map((a) => (
                <li key={a.title} className="award">
                  <Shield avatar={a.entry.avatar} className="player-shield" />
                  <div>
                    <b>{a.title}</b>
                    <span className="muted small">
                      {a.entry.name} : {a.detail}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="lobby-cta">
        {isHost ? (
          <Button variant="primary" className="btn-lg btn-wide" icon={<RotateCcw size={20} />} onClick={() => void send('game:restart')}>
            Revanche
          </Button>
        ) : (
          <div className="waiting" role="status">
            <span className="spinner" /> En attente de la revanche…
          </div>
        )}
      </div>
    </main>
  );
}
