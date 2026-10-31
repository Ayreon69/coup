// Les règles illustrées, lisibles en une minute, ouvrables depuis partout.
import { Coins, HandCoins, Swords } from 'lucide-react';
import { CHARACTERS, CHARACTER_INFO } from '../../../shared/protocol';
import { useStore } from '../store';
import { CardFace, Coin, Emblem, charVars } from './Art';
import { Modal } from './Ui';

export function RulesModal() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Les règles en 1 minute" wide>
      <div className="rules">
        <p className="rules-lead">
          Chacun garde <b>deux lettres scellées</b> : deux personnages de la cour, que lui seul connaît. Ce sont ses <b>influences</b>. On peut prétendre être <b>n'importe qui</b>, tant que personne ne conteste. <b>Le dernier qui garde de l'influence gagne.</b>
        </p>

        <section>
          <h3>À ton tour, une action</h3>
          <ul className="rule-actions">
            <li>
              <Coins size={18} aria-hidden />
              <span>
                <b>Revenu</b> : +1 ducat. Personne ne peut l'empêcher.
              </span>
            </li>
            <li>
              <HandCoins size={18} aria-hidden />
              <span>
                <b>Aide étrangère</b> : +2 ducats. N'importe qui peut la bloquer en se disant Duchesse.
              </span>
            </li>
            <li>
              <Swords size={18} aria-hidden />
              <span>
                <b>Coup d'État</b> : paie 7 ducats, la cible perd une influence. Imparable. <b>Obligatoire à partir de 10 ducats.</b>
              </span>
            </li>
          </ul>
        </section>

        <section>
          <h3>Les cinq personnages</h3>
          <p className="rules-note-inline">Trois exemplaires de chacun, quinze cartes en tout. Le reste attend face cachée dans la Cour.</p>
          <ul className="rule-chars">
            {CHARACTERS.map((c) => (
              <li key={c} style={charVars(c)}>
                <CardFace c={c} className="rule-card" />
                <div>
                  <b>
                    <Emblem c={c} className="rule-emblem" /> {CHARACTER_INFO[c].name}
                  </b>
                  <span>{CHARACTER_INFO[c].power}</span>
                  {CHARACTER_INFO[c].counter && <span className="rule-counter">{CHARACTER_INFO[c].counter}</span>}
                </div>
              </li>
            ))}
          </ul>
          <p className="rules-note-inline">Seule la cible peut bloquer un Assassinat ou un Vol. Les 3 ducats d'un Assassinat bloqué restent dépensés.</p>
        </section>

        <section className="rule-split">
          <div className="rule-case is-challenge">
            <h3>Contester</h3>
            <p>
              Toute prétention, blocage compris, peut être contestée par n'importe qui. Le premier qui conteste a la parole. <b>S'il avait la carte</b>, il la montre, la remet dans la Cour et en pioche une autre : le contestataire perd une influence, et l'action continue. <b>Sinon</b>, c'est lui qui perd une influence, et son action tombe (ducats rendus).
            </p>
          </div>
          <div className="rule-case is-lose">
            <h3>Perdre une influence</h3>
            <p>Tu choisis laquelle de tes lettres tu ouvres : le personnage est retourné, il reste visible de tous et ne compte plus. Sans lettre scellée, tu es exilé et tes ducats retournent au Trésor.</p>
          </div>
        </section>

        <section className="rule-tips">
          <h3>Bon à savoir</h3>
          <ul>
            <li>
              <b>Rien n'est noté à ta place :</b> seules l'action en cours et son issue s'affichent. Qui a prétendu quoi, c'est à toi de t'en souvenir.
            </li>
            <li>
              <b>Réagir à temps :</b> après chaque prétention, chacun a quelques secondes pour contester ou bloquer. Le silence laisse passer.
            </li>
            <li>
              <b>À deux joueurs</b>, celui qui commence n'a qu'un <Coin className="inline-coin" /> ducat.
            </li>
            <li>
              <b>Deux influences d'un coup :</b> contester un Assassin qui dit vrai, ou bluffer la Comtesse et se faire prendre, peut coûter la partie.
            </li>
          </ul>
        </section>

        <p className="rule-foot">
          D'après <i>Coup</i>, de Rikki Tahta (La Mame Games, Indie Boards &amp; Cards), paru en français sous le nom <i>Complots</i> (Ferti), dont ce jeu reprend les noms des personnages. Création de fans, non officielle, avec ses propres visuels. Ce que les règles laissent ouvert est un choix de cette version : le premier qui réagit l'emporte, le silence vaut accord au bout du délai, et l'on ne vole pas un joueur sans le sou.
        </p>
      </div>
    </Modal>
  );
}
