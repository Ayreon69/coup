// Le salon : partage de la table, joueurs, bots, réglages de l'hôte et lancement.
import { BookOpen, Bot, Check, Copy, Crown, LogOut, Play, QrCode, Share2, UserX } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, REACT_OPTIONS, THINK_OPTIONS, type ReactTime, type RoomView, type ThinkTime } from '../../../shared/protocol';
import { Shield } from '../components/Art';
import { Button, Logo, Modal, Segmented } from '../components/Ui';
import { cls, shareUrl } from '../lib/util';
import { leaveRoom, send } from '../net';
import { useStore } from '../store';

export function Lobby({ view }: { view: RoomView }) {
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const isHost = view.hostId === view.me;
  const seated = view.players.filter((p) => p.status !== 'spectator');
  const spectators = view.players.filter((p) => p.status === 'spectator');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const url = shareUrl(view.code);
  const host = view.players.find((p) => p.id === view.hostId);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      useStore.getState().showToast(`Lien : ${url}`, 'info');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Coup', text: `Rejoins ma table de Coup (code ${view.code}) !`, url });
      } catch {
        /* partage annulé */
      }
    } else void copy();
  };

  return (
    <main className="lobby">
      <header className="lobby-top">
        <Logo size="sm" />
        <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
          Quitter
        </Button>
      </header>

      <section className="code-panel parchment">
        <span className="eyebrow">Code de la table</span>
        <strong className="big-code" aria-label={`Code ${view.code.split('').join(' ')}`}>
          {view.code}
        </strong>
        <div className="share-row">
          <Button variant="primary" icon={<Share2 size={18} />} onClick={share}>
            Inviter
          </Button>
          <Button icon={copied ? <Check size={18} /> : <Copy size={18} />} onClick={copy}>
            {copied ? 'Lien copié' : 'Copier le lien'}
          </Button>
          <Button icon={<QrCode size={18} />} onClick={() => setQr(true)} aria-label="Afficher le QR code" />
        </div>
      </section>

      <div className="lobby-grid">
        <section className="sheet">
          <div className="sheet-head">
            <h3>
              La cour <span className="muted">{seated.length}/{MAX_PLAYERS}</span>
            </h3>
            {isHost && (
              <Button icon={<Bot size={18} />} disabled={seated.length >= MAX_PLAYERS} onClick={() => void send('room:addBot')}>
                Ajouter un bot
              </Button>
            )}
          </div>
          <ul className="player-list">
            {seated.map((p) => (
              <li key={p.id} className={cls('player-row', p.id === view.me && 'is-me', !p.connected && 'is-off')}>
                <Shield avatar={p.avatar} className="player-shield" />
                <span className="player-name">
                  {p.name}
                  {p.id === view.me && <span className="muted"> (toi)</span>}
                </span>
                {p.isHost && (
                  <span className="tag tag-gold">
                    <Crown size={12} aria-hidden /> Hôte
                  </span>
                )}
                {p.isBot && <span className="tag">Bot</span>}
                {!p.connected && <span className="tag">Hors ligne</span>}
                {isHost && p.id !== view.me && (
                  <button type="button" className="icon-btn" aria-label={`Retirer ${p.name}`} onClick={() => void send('room:kick', { playerId: p.id })}>
                    <UserX size={18} />
                  </button>
                )}
              </li>
            ))}
            {Array.from({ length: Math.max(0, MIN_PLAYERS - seated.length) }, (_, i) => (
              <li key={`empty${i}`} className="player-row is-empty">
                <span className="player-ghost">?</span>
                <span className="player-name muted">En attente d'un joueur…</span>
              </li>
            ))}
          </ul>
          {spectators.length > 0 && <p className="muted small">Spectateurs : {spectators.map((p) => p.name).join(', ')}</p>}
        </section>

        <section className="sheet">
          <div className="sheet-head">
            <h3>Réglages</h3>
            {!isHost && <span className="muted small">choisis par {host?.name ?? "l'hôte"}</span>}
          </div>
          <span className="field-label">Temps pour jouer son tour</span>
          <Segmented<ThinkTime> label="Temps pour jouer son tour" value={view.settings.think} disabled={!isHost} onChange={(think) => void send('room:settings', { think })} options={THINK_OPTIONS.map((t) => ({ value: t, label: t === 0 ? 'Sans limite' : `${t} s` }))} />
          <p className="muted small lobby-note">Le temps écoulé, le pilote automatique joue à ta place, sans jamais bluffer.</p>
          <span className="field-label">Temps pour contester ou bloquer</span>
          <Segmented<ReactTime> label="Temps pour contester ou bloquer" value={view.settings.react} disabled={!isHost} onChange={(react) => void send('room:settings', { react })} options={REACT_OPTIONS.map((t) => ({ value: t, label: `${t} s` }))} />
          <p className="muted small lobby-note">La fenêtre se ferme dès que tout le monde a répondu. Le silence laisse passer.</p>
        </section>
      </div>

      <div className="lobby-cta">
        {isHost ? (
          <Button variant="primary" className="btn-lg btn-wide" icon={<Play size={20} />} disabled={seated.length < MIN_PLAYERS} onClick={() => void send('game:start')}>
            {seated.length < MIN_PLAYERS ? `Il faut au moins ${MIN_PLAYERS} joueurs` : `Ouvrir la séance (${seated.length} joueurs)`}
          </Button>
        ) : (
          <div className="waiting" role="status">
            <span className="spinner" /> En attente que {host?.name ?? "l'hôte"} ouvre la séance…
          </div>
        )}
        <Button variant="ghost" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Nouveau ? Les règles en 1 minute
        </Button>
      </div>

      <Modal open={qr} onClose={() => setQr(false)} title={`Table ${view.code}`}>
        <div className="qr-box">
          <QRCodeSVG value={url} size={220} bgColor="#f4e9cf" fgColor="#1d1712" level="M" marginSize={2} />
          <p className="muted small">Scanne pour rejoindre la table directement.</p>
          <code className="url-code">{url}</code>
        </div>
      </Modal>
    </main>
  );
}
