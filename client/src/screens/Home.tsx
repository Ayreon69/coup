// Accueil : les cinq portraits en éventail, pseudo et blason, créer ou rejoindre une table, s'entraîner, les règles.
import { BookOpen, Bot, House, LogIn, Plus, Swords } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AVATARS, CHARACTERS } from '../../../shared/protocol';
import { CardFace, SHIELDS, Shield } from '../components/Art';
import { Button, Logo } from '../components/Ui';
import { cls } from '../lib/util';
import { codeFromUrl, createRoom, joinRoom, leaveRoom } from '../net';
import { useStore } from '../store';

export function Home() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const conn = useStore((s) => s.conn);
  const session = useStore((s) => s.session);
  const [invited, setInvited] = useState(codeFromUrl);
  const [code, setCode] = useState('');
  useEffect(() => {
    const sync = () => setInvited(codeFromUrl());
    window.addEventListener('cp:url', sync);
    return () => window.removeEventListener('cp:url', sync);
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const nameOk = profile.name.trim().length > 0;

  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busy) return;
    if (!nameOk) {
      useStore.getState().showToast('Choisis d’abord un pseudo.', 'info');
      document.getElementById('pseudo')?.focus();
      return;
    }
    setBusy(key);
    await fn();
    setBusy(null);
  };

  const cleanCode = code.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);
  // Table créée ou reprise : la vue arrive dans un instant, on n'affiche pas le formulaire entre-temps.
  const entering = !!invited && session?.code === invited;

  if (entering) {
    return (
      <main className="home">
        <header className="home-hero">
          <Logo size="lg" />
        </header>
        <section className="home-panel parchment entering" role="status">
          <p>
            <span className="spinner" /> Ouverture de la table <b>{invited}</b>…
          </p>
          {conn !== 'online' && <p className="wake-note">Réveil du serveur… (jusqu'à une minute la première fois)</p>}
          <Button variant="ghost" onClick={() => void leaveRoom()}>
            Annuler
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="home">
      <a className="all-games" href="https://akhis-games.onrender.com">
        <House size={16} aria-hidden /> Tous les jeux
      </a>
      <header className="home-hero">
        <div className="home-fan" aria-hidden>
          {CHARACTERS.map((c, i) => (
            <span key={c} className="fan-card" style={{ '--i': i - 2 } as React.CSSProperties}>
              <CardFace c={c} />
            </span>
          ))}
        </div>
        <Logo size="lg" />
        <p className="tagline">Deux lettres scellées, et une cour de menteurs.</p>
      </header>

      <section className="home-panel parchment">
        {invited && (
          <div className="invite-banner">
            On t'attend à la table <b>{invited}</b>. Choisis un pseudo et entre.
          </div>
        )}
        <label className="field-label" htmlFor="pseudo">
          Ton nom à la cour
        </label>
        <input
          id="pseudo"
          className="input input-lg"
          placeholder="Ex. Lucrezia"
          value={profile.name}
          maxLength={16}
          autoComplete="nickname"
          onChange={(e) => setProfile({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && invited) void run('join', () => joinRoom(invited));
          }}
        />
        <span className="field-label" id="blason-label">
          Ton blason
        </span>
        <div className="avatar-picker" role="radiogroup" aria-labelledby="blason-label">
          {AVATARS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={profile.avatar === a} aria-label={SHIELDS[a].label} title={SHIELDS[a].label} className={cls('avatar-opt', profile.avatar === a && 'is-on')} onClick={() => setProfile({ avatar: a })}>
              <Shield avatar={a} />
            </button>
          ))}
        </div>

        {invited ? (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<LogIn size={20} />} disabled={!!busy} onClick={() => run('join', () => joinRoom(invited))}>
              {busy === 'join' ? 'Connexion…' : `Rejoindre la table ${invited}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                window.history.replaceState(null, '', '/');
                setInvited(null);
              }}
            >
              Créer ma propre table à la place
            </Button>
          </div>
        ) : (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<Plus size={20} />} disabled={!!busy} onClick={() => run('create', () => createRoom())}>
              {busy === 'create' ? 'Création…' : 'Créer une table'}
            </Button>
            <div className="join-row">
              <input
                className="input code-input"
                placeholder="CODE"
                value={cleanCode}
                maxLength={4}
                aria-label="Code de la table"
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cleanCode.length === 4) void run('join', () => joinRoom(cleanCode));
                }}
              />
              <Button icon={<LogIn size={18} />} disabled={cleanCode.length !== 4 || !!busy} onClick={() => run('join', () => joinRoom(cleanCode))}>
                Rejoindre
              </Button>
            </div>
            <div className="train-row">
              <span className="field-label">S'entraîner contre des bots</span>
              <div className="train-btns">
                <Button icon={<Bot size={18} />} disabled={!!busy} onClick={() => run('bots', () => createRoom({ bots: 3, autostart: true }))}>
                  {busy === 'bots' ? 'Préparation…' : 'À quatre'}
                </Button>
                <Button icon={<Swords size={18} />} disabled={!!busy} onClick={() => run('duel', () => createRoom({ bots: 1, autostart: true }))}>
                  {busy === 'duel' ? 'Préparation…' : 'En duel'}
                </Button>
              </div>
            </div>
          </div>
        )}
        <Button variant="ghost" className="rules-link" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Les règles en 1 minute
        </Button>
        {conn !== 'online' && (
          <p className="wake-note" role="status">
            <span className="spinner" /> Réveil du serveur… (jusqu'à une minute la première fois)
          </p>
        )}
      </section>

      <footer className="home-foot">
        D'après <i>Coup</i>, de Rikki Tahta (<i>Complots</i> en français). Création de fans, non officielle, avec ses propres visuels.
      </footer>
    </main>
  );
}
