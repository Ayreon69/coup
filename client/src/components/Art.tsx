// Les visuels du jeu, tous dessinés ici en SVG : portraits de profil, emblèmes, sceaux de cire, ducats, blasons et cartes.
import { useId, type CSSProperties, type ReactNode } from 'react';
import { CHARACTER_INFO, type Character } from '../../../shared/protocol';
import { cls } from '../lib/util';

export const CHAR_COLORS: Record<Character, { bg: string; deep: string; light: string }> = {
  duchesse: { bg: '#5d2a64', deep: '#331338', light: '#e6c9ee' },
  assassin: { bg: '#2c2629', deep: '#141012', light: '#e7a3a3' },
  comtesse: { bg: '#962539', deep: '#56101d', light: '#f6c3ca' },
  capitaine: { bg: '#25528f', deep: '#12294d', light: '#bcd5f4' },
  ambassadeur: { bg: '#27674b', deep: '#103626', light: '#c2e6cd' },
};

export function charVars(c: Character): CSSProperties {
  const k = CHAR_COLORS[c];
  return { '--c-bg': k.bg, '--c-deep': k.deep, '--c-light': k.light } as CSSProperties;
}

// ───────────────────────────── Emblèmes ─────────────────────────────

/** L'emblème de chaque personnage, gravé sur les sceaux et dans le coin des cartes. */
export function Emblem({ c, className }: { c: Character; className?: string }) {
  return (
    <svg className={cls('emblem', className)} viewBox="0 0 24 24" aria-hidden focusable="false">
      {c === 'duchesse' && (
        <g fill="currentColor">
          <path d="M3.5 18.5 4.6 8.6l4 4.2L12 5.5l3.4 7.3 4-4.2 1.1 9.9z" />
          <rect x="3.4" y="18.8" width="17.2" height="2.4" rx="0.6" />
          <circle cx="4.6" cy="7.6" r="1.4" />
          <circle cx="12" cy="4.3" r="1.5" />
          <circle cx="19.4" cy="7.6" r="1.4" />
        </g>
      )}
      {c === 'assassin' && (
        <g fill="currentColor">
          <path d="M12 1.5 14.3 13.6h-4.6z" />
          <rect x="6.6" y="13.6" width="10.8" height="2.1" rx="1" />
          <rect x="10.9" y="15.7" width="2.2" height="5" rx="0.5" />
          <circle cx="12" cy="21.6" r="1.6" />
        </g>
      )}
      {c === 'comtesse' && (
        <g fill="currentColor">
          <path d="M12 20.5 2.6 10.6A13.4 13.4 0 0 1 21.4 10.6Z" />
          <g stroke="var(--emblem-cut, rgba(0,0,0,.35))" strokeWidth="0.9" fill="none">
            <path d="M12 20.5 5.2 7.9M12 20.5 8.4 5.9M12 20.5V5.3M12 20.5l3.6-14.6M12 20.5l6.8-12.6" />
          </g>
          <circle cx="12" cy="20.5" r="1.7" />
        </g>
      )}
      {c === 'capitaine' && (
        <g fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
          <circle cx="12" cy="4.4" r="2.2" />
          <path d="M12 6.6v14.4M7.4 9.8h9.2M4.2 14.2c.6 4.3 3.8 6.8 7.8 6.8s7.2-2.5 7.8-6.8" />
          <path d="M2.8 15.6l1.4-1.8 1.9 1.4M21.2 15.6l-1.4-1.8-1.9 1.4" />
        </g>
      )}
      {c === 'ambassadeur' && (
        <g fill="currentColor">
          <path d="M5.5 4h11.8a2.6 2.6 0 0 1 0 5.2H17v9.6a2.6 2.6 0 0 1-2.6 2.6H5.6a2.6 2.6 0 0 1 0-5.2h.4V6.6A2.6 2.6 0 0 1 5.5 4z" />
          <g stroke="var(--emblem-cut, rgba(0,0,0,.35))" strokeWidth="0.9" fill="none">
            <path d="M8.5 9h5.6M8.5 11.6h5.6M8.5 14.2h3.6" />
          </g>
          <circle cx="15.6" cy="17.6" r="2.3" fill="var(--emblem-seal, #b8321f)" />
        </g>
      )}
    </svg>
  );
}

// ───────────────────────────── Sceau de cire ─────────────────────────────

/** Le pourtour d'une goutte de cire : un cercle qui a coulé, toujours le même. */
const BLOB = (() => {
  const pts: string[] = [];
  const n = 48;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 46 + 2.6 * Math.sin(a * 7 + 0.6) + 1.6 * Math.sin(a * 13 + 2.1) + 1.2 * Math.cos(a * 5);
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
})();

/** Un sceau de cire rouge, frappé de l'emblème d'un personnage (ou de la lettre C). */
export function Seal({ c, className, style, broken }: { c?: Character | null; className?: string; style?: CSSProperties; broken?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <span className={cls('seal', broken && 'is-broken', className)} style={style} aria-hidden>
      <svg viewBox="0 0 100 100" focusable="false">
        <defs>
          <radialGradient id={`w${id}`} cx="38%" cy="32%" r="75%">
            <stop offset="0" stopColor="#e2563d" />
            <stop offset="0.55" stopColor="#b42d1b" />
            <stop offset="1" stopColor="#6e170c" />
          </radialGradient>
        </defs>
        <path d={BLOB} fill={`url(#w${id})`} />
        <circle cx="50" cy="50" r="33" fill="none" stroke="#6e170c" strokeWidth="3" opacity="0.7" />
        <circle cx="50" cy="50" r="33" fill="none" stroke="#f08a6e" strokeWidth="1" opacity="0.35" transform="translate(-1 -1)" />
        {broken && <path d="M30 18 44 42 36 50 52 62 46 84" fill="none" stroke="#3d0b05" strokeWidth="3.4" strokeLinejoin="round" />}
      </svg>
      {c ? (
        <Emblem c={c} className="seal-mark" />
      ) : (
        <b className="seal-letter">C</b>
      )}
    </span>
  );
}

// ───────────────────────────── Ducats ─────────────────────────────

export function Coin({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={cls('coin', className)} viewBox="0 0 24 24" aria-hidden focusable="false">
      <defs>
        <radialGradient id={`g${id}`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.45" stopColor="#e2b453" />
          <stop offset="1" stopColor="#8f6420" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill={`url(#g${id})`} stroke="#6e4b14" strokeWidth="1" />
      <circle cx="12" cy="12" r="8" fill="none" stroke="#8f6420" strokeWidth="0.9" strokeDasharray="1.2 1.1" />
      <path d="M12 6.4 13.4 10.4 17.6 10.6 14.3 13.1 15.5 17.2 12 14.8 8.5 17.2 9.7 13.1 6.4 10.6 10.6 10.4z" fill="#a8771f" />
    </svg>
  );
}

// ───────────────────────────── Blasons ─────────────────────────────

const OR = '#d9b25f';
const ARGENT = '#efe7d4';
const GUEULES = '#b8321f';
const AZUR = '#2b5797';
const SINOPLE = '#2f6e4f';
const SABLE = '#211c1e';
const POURPRE = '#6b2d6e';

/** Douze blasons : une partition, deux émaux. Le nom se lit comme en héraldique. */
export const SHIELDS: Record<string, { label: string; a: string; b: string }> = {
  parti: { label: "Parti d'or et d'azur", a: OR, b: AZUR },
  coupe: { label: 'Coupé de gueules et d’argent', a: GUEULES, b: ARGENT },
  tranche: { label: 'Tranché de sinople et d’or', a: SINOPLE, b: OR },
  ecartele: { label: 'Écartelé de pourpre et d’argent', a: POURPRE, b: ARGENT },
  chevron: { label: 'D’azur au chevron d’or', a: AZUR, b: OR },
  bande: { label: 'De gueules à la bande d’or', a: GUEULES, b: OR },
  pal: { label: 'De sable au pal d’argent', a: SABLE, b: ARGENT },
  fasce: { label: 'De sinople à la fasce d’argent', a: SINOPLE, b: ARGENT },
  sautoir: { label: 'D’or au sautoir de gueules', a: OR, b: GUEULES },
  croix: { label: 'D’azur à la croix d’argent', a: AZUR, b: ARGENT },
  chef: { label: 'De pourpre au chef d’or', a: POURPRE, b: OR },
  pairle: { label: 'De sable au pairle d’or', a: SABLE, b: OR },
};

const SHIELD_PATH = 'M3 2.5h26v11.5c0 9.4-6.4 15.4-13 18.5C9.4 29.4 3 23.4 3 14z';

function Charge({ kind, color }: { kind: string; color: string }) {
  switch (kind) {
    case 'parti':
      return <rect x="16" y="0" width="16" height="34" fill={color} />;
    case 'coupe':
      return <rect x="0" y="15" width="32" height="20" fill={color} />;
    case 'tranche':
      return <path d="M3 2.5 32 34H0V2.5z" fill={color} />;
    case 'ecartele':
      return <path d="M16 0h16v15H16zM0 15h16v20H0z" fill={color} />;
    case 'chevron':
      return <path d="M2 25 16 9l14 16v6L16 15 2 31z" fill={color} />;
    case 'bande':
      return <path d="M2 2h7l22 22v7h-5L2 7z" fill={color} />;
    case 'pal':
      return <rect x="11.5" y="0" width="9" height="34" fill={color} />;
    case 'fasce':
      return <rect x="0" y="12" width="32" height="8" fill={color} />;
    case 'sautoir':
      return <path d="M3 2.5h5L16 11l8-8.5h5v5L20.5 16 29 24.5v5h-5L16 21l-8 8.5H3v-5L11.5 16 3 7.5z" fill={color} />;
    case 'croix':
      return <path d="M12.5 0h7v12.5H32v7H19.5V34h-7V19.5H0v-7h12.5z" fill={color} />;
    case 'chef':
      return <rect x="0" y="0" width="32" height="10.5" fill={color} />;
    case 'pairle':
      return <path d="M2 2h6l8 9 8-9h6l-11 13v19h-6V15z" fill={color} />;
    default:
      return null;
  }
}

/** Le blason d'un joueur, tenu lieu d'avatar. */
export function Shield({ avatar, className, title }: { avatar: string | undefined; className?: string; title?: string }) {
  const id = useId().replace(/:/g, '');
  const s = SHIELDS[avatar ?? ''] ?? SHIELDS.parti;
  return (
    <svg className={cls('shield', className)} viewBox="0 0 32 34" role="img" aria-label={title ?? s.label} focusable="false">
      <defs>
        <clipPath id={`s${id}`}>
          <path d={SHIELD_PATH} />
        </clipPath>
        <linearGradient id={`l${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#s${id})`}>
        <rect width="32" height="34" fill={s.a} />
        <Charge kind={avatar ?? 'parti'} color={s.b} />
        <rect width="32" height="34" fill={`url(#l${id})`} />
      </g>
      <path d={SHIELD_PATH} fill="none" stroke="#c9a14f" strokeWidth="1.6" />
    </svg>
  );
}

// ───────────────────────────── Portraits ─────────────────────────────

const FACE =
  'M66 37C56 37 50.5 44 49.5 52C49 56 48.6 58.6 47.2 60.8C45.6 63.6 43.2 69.6 41.6 73.6C41 75.2 41.7 76.6 43.6 76.8L46.2 77.2C45.8 78.5 46 79.5 45.4 80.3C45 80.9 45.4 81.5 46.2 81.6C45.6 82.5 45.8 83.7 46.6 84.3C46.4 86.6 46.9 89.2 49 91C51.4 93 54.6 93.8 58 93.6C59.6 97 61 101 62 106L63 118H85C83.6 108 83.4 100 85.6 93C90.5 84 92 70 89.4 58C86.6 45 77.6 37 66 37Z';

/** Un visage de profil, tourné vers la gauche, à la manière des médailles de la Renaissance. */
function Face({ skin, shade, eye = '#2a1a14', lips = '#9c4a3c', brow }: { skin: string; shade: string; eye?: string; lips?: string; brow?: string }) {
  return (
    <g>
      <path d={FACE} fill={skin} />
      <path d="M77.5 76C75 85 69 91.5 59.5 93.4" fill="none" stroke={shade} strokeWidth="1.4" opacity="0.7" />
      <path d="M63 106C68 108 76 108 84.6 104" fill="none" stroke={shade} strokeWidth="1.2" opacity="0.5" />
      <ellipse cx="74.5" cy="69.5" rx="3.6" ry="6" fill={skin} stroke={shade} strokeWidth="1.1" />
      <path d="M74.2 66.5c1.4 1.4 1.4 4.6 0 6" fill="none" stroke={shade} strokeWidth="0.9" />
      <path d="M49.6 62.2C51.2 60.8 53.6 60.8 55.4 62C53.6 63 51.4 63.2 49.6 62.2Z" fill={eye} />
      <path d="M49.2 60.3Q52.6 58.4 56.2 60.6" fill="none" stroke={shade} strokeWidth="0.9" />
      {brow && <path d="M48.6 57.3Q53 55 58.2 56.7" fill="none" stroke={brow} strokeWidth="1.5" strokeLinecap="round" />}
      <path d="M44.4 75.3Q45.7 74.4 46.7 75.7" fill="none" stroke={shade} strokeWidth="0.9" />
      <path d="M45.7 81.6 48.6 81.9" stroke={lips} strokeWidth="1.3" strokeLinecap="round" />
    </g>
  );
}

function Niche({ id, c }: { id: string; c: Character }) {
  const k = CHAR_COLORS[c];
  return (
    <>
      <defs>
        <radialGradient id={`bg${id}`} cx="45%" cy="38%" r="75%">
          <stop offset="0" stopColor={k.bg} />
          <stop offset="1" stopColor={k.deep} />
        </radialGradient>
      </defs>
      <rect width="120" height="150" fill={`url(#bg${id})`} />
      {/* Une niche en arc derrière le modèle, comme dans un retable. */}
      <path d="M22 150V62C22 38 39 22 60 22S98 38 98 62V150" fill="none" stroke="#fff" strokeOpacity="0.09" strokeWidth="1.2" />
      <path d="M28 150V64C28 44 42 30 60 30S92 44 92 64V150" fill="#000" fillOpacity="0.12" />
    </>
  );
}

function Duchesse({ id }: { id: string }) {
  return (
    <>
      <Niche id={id} c="duchesse" />
      {/* Robe de brocart pourpre, encolure carrée bordée d'or. */}
      <path d="M8 150C12 128 34 116 58 113H92C108 118 116 132 118 150Z" fill="#4a1d52" />
      <path d="M38 150 44 124C58 119 80 119 98 124L104 150" fill="#e9d9b8" />
      <path d="M38 150 44 124C58 119 80 119 98 124L104 150" fill="none" stroke="#d9b25f" strokeWidth="2.2" />
      <g fill="#d9b25f" opacity="0.55">
        {[20, 30, 108, 114, 24, 112].map((x, i) => (
          <path key={i} d={`M${x} ${136 + (i % 3) * 5}l2.4 3-2.4 3-2.4-3z`} />
        ))}
      </g>
      <Face skin="#f1d6bb" shade="#c99d7c" lips="#a8483e" brow="#7a4a2a" />
      {/* Chevelure tirée, chignon tressé de perles. */}
      <path d="M50.5 50C52 40 60 34.5 68.5 34.5C81 34.5 89.6 43 91.6 56C93 66 92 76 88 84C86.4 88 85.4 92 85.8 95.5L82.6 96C82.4 90 83.4 84 84.2 78C85 70 83 61 77.4 55C71 48.6 61 47.6 50.5 50Z" fill="#7a4a2a" />
      <circle cx="91.5" cy="69" r="9.5" fill="#6b3e22" />
      <path d="M84 63.5c4 2.6 11 2.6 15 0M83.5 69.5c4.6 2.4 11.4 2.4 16 0M84.5 75.5c4 2.2 10.4 2.2 14 0" fill="none" stroke="#9a6438" strokeWidth="1.3" />
      <g fill="#f6f1e4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const a = (i / 8) * Math.PI * 2;
          return <circle key={i} cx={91.5 + 10.3 * Math.cos(a)} cy={69 + 10.3 * Math.sin(a)} r="1.25" />;
        })}
      </g>
      {/* La ferronnière sur le front, et la couronne ducale. */}
      <path d="M51 50.6C57 47.4 65 46.6 73 47.4" fill="none" stroke="#d9b25f" strokeWidth="0.9" />
      <circle cx="52.2" cy="50.2" r="1.7" fill="#b8321f" stroke="#d9b25f" strokeWidth="0.6" />
      <path d="M57.5 40.5 59.4 30 63.4 35.6 67.4 27 71.4 34.6 75.6 28 79.4 35.2 83.6 31.4 84.8 41.4C76 38.4 66 38.4 57.5 40.5Z" fill="#e2b453" stroke="#8f6420" strokeWidth="0.7" />
      <g fill="#f6f1e4">
        <circle cx="59.4" cy="29.6" r="1.4" />
        <circle cx="67.4" cy="26.6" r="1.5" />
        <circle cx="75.6" cy="27.6" r="1.4" />
        <circle cx="83.6" cy="31" r="1.3" />
      </g>
      <circle cx="71" cy="37.4" r="1.4" fill="#2b5797" />
      <circle cx="73.4" cy="80" r="1.9" fill="#f6f1e4" stroke="#c9b99a" strokeWidth="0.4" />
      <g fill="#f6f1e4">
        {Array.from({ length: 11 }, (_, i) => (
          <circle key={i} cx={63.6 + i * 2.05} cy={110.6 + Math.sin((i / 10) * Math.PI) * 2.6} r="1.05" />
        ))}
      </g>
    </>
  );
}

function Assassin({ id }: { id: string }) {
  return (
    <>
      <Niche id={id} c="assassin" />
      <defs>
        <radialGradient id={`gl${id}`} cx="40%" cy="45%" r="55%">
          <stop offset="0" stopColor="#8f1d2c" stopOpacity="0.55" />
          <stop offset="1" stopColor="#8f1d2c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`bl${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f4f6f8" />
          <stop offset="0.5" stopColor="#aab3bd" />
          <stop offset="1" stopColor="#6f7882" />
        </linearGradient>
      </defs>
      <rect width="120" height="150" fill={`url(#gl${id})`} />
      {/* La cape et le dos du capuchon. */}
      <path d="M30 150C26 124 34 104 44 90C50 70 50 48 60 38C70 28 86 28 96 40C106 54 104 76 100 92C98 108 104 128 112 150Z" fill="#231d21" />
      <Face skin="#d6a47c" shade="#a6744f" lips="#7d3a30" />
      {/* Le masque d'ivoire sur le haut du visage. */}
      <path d="M47.6 51.5C51 49.6 57.4 49.6 63.2 51.6L67.4 58.6C65.8 64.6 61.2 68.4 54.6 70.2L42.6 70.8C43.8 65.4 45.6 58.6 47.6 51.5Z" fill="#efe6d2" />
      <path d="M47.6 51.5C51 49.6 57.4 49.6 63.2 51.6L67.4 58.6C65.8 64.6 61.2 68.4 54.6 70.2L42.6 70.8" fill="none" stroke="#c9a14f" strokeWidth="0.9" />
      <path d="M49.2 61.8C51 59.8 54 59.6 56.2 61.4C54.2 63.2 51.2 63.4 49.2 61.8Z" fill="#120d0f" />
      {/* Le bord du capuchon, doublé de cramoisi. */}
      <path d="M46 57C47 44 55.6 35 68 34.4C82.6 33.8 93 45 93.6 61.6C94.2 80 89.6 96 96 118L77 119C79.6 104 82 92 80.4 80.4C78.8 69.6 74 61.6 66.4 58.4C60 55.8 52.6 55.6 46 57Z" fill="#2e272b" />
      <path d="M46 57C52.6 55.6 60 55.8 66.4 58.4C74 61.6 78.8 69.6 80.4 80.4C82 92 79.6 104 77 119" fill="none" stroke="#8f1d2c" strokeWidth="2.2" />
      {/* La dague, tenue contre la poitrine. */}
      <g transform="rotate(-24 44 120)">
        <path d="M42 66 46.6 112H37.4Z" fill={`url(#bl${id})`} />
        <path d="M42 70V110" stroke="#fff" strokeOpacity="0.6" strokeWidth="0.6" />
        <rect x="31.4" y="111.6" width="21.2" height="4.2" rx="2" fill="#c9a14f" />
        <rect x="39.6" y="115.6" width="4.8" height="12" rx="1.4" fill="#4a2b1d" />
        <circle cx="42" cy="129.6" r="3" fill="#c9a14f" />
      </g>
    </>
  );
}

function Comtesse({ id }: { id: string }) {
  return (
    <>
      <Niche id={id} c="comtesse" />
      {/* La collerette de dentelle en éventail derrière la nuque. */}
      <path d="M54 118C50 100 60 84 78 83C96 83 107 97 106 118Z" fill="#f6efe2" />
      <g fill="none" stroke="#d8c8ae" strokeWidth="0.8">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
          const a = Math.PI * (1.05 + (i / 8) * 0.95);
          return <path key={i} d={`M80 112L${80 + 27 * Math.cos(a)} ${112 + 27 * Math.sin(a)}`} />;
        })}
      </g>
      <path d="M54 118C50 100 60 84 78 83C96 83 107 97 106 118" fill="none" stroke="#fff" strokeWidth="2.4" strokeDasharray="2.6 1.8" />
      <path d="M8 150C12 128 34 116 58 113H92C108 118 116 132 118 150Z" fill="#6f1424" />
      <path d="M40 150 46 124C60 119 78 119 96 124L102 150" fill="#f1e4cc" />
      <path d="M40 150 46 124C60 119 78 119 96 124L102 150" fill="none" stroke="#f6efe2" strokeWidth="3" strokeDasharray="1.6 1.4" />
      <Face skin="#efcfb2" shade="#c5967a" lips="#b23a3c" brow="#6e3018" />
      {/* Chevelure rousse relevée, boucles et chignon haut. */}
      <path d="M50 51C50.6 39 59 31.6 69 31.4C82.6 31.2 92 41 92.4 56C92.8 68 90 79 86 87L82.4 87.6C83.6 80 84.2 72 83 64C81.6 56 76 50.6 68 49C62 47.8 55.6 48.6 50 51Z" fill="#8a3d1c" />
      <circle cx="80" cy="30" r="10.5" fill="#7a3416" />
      <g fill="#a54e25">
        <circle cx="74.6" cy="25.4" r="3.6" />
        <circle cx="82.4" cy="23.4" r="3.4" />
        <circle cx="87.6" cy="29.4" r="3.4" />
        <circle cx="56" cy="44" r="3.2" />
        <circle cx="52" cy="49.4" r="2.8" />
        <circle cx="61.4" cy="40" r="3.2" />
      </g>
      <path d="M83.6 86C86 92 85 98 82 102" fill="none" stroke="#8a3d1c" strokeWidth="3" strokeLinecap="round" />
      {/* La rose piquée dans les cheveux. */}
      <path d="M90.6 46c3 1.6 6.6.6 8-2" fill="none" stroke="#2f6e4f" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="88" cy="41.6" r="5" fill="#c9283d" />
      <path d="M88 39.4c1.8 0 2.6 1.6 1.6 2.8-1 1.2-3.2.8-3.4-.8-.2-1.8 1.6-3.4 3.6-3" fill="none" stroke="#7a1020" strokeWidth="0.9" />
      <circle cx="73.4" cy="78.6" r="1.4" fill="#d9b25f" />
      <ellipse cx="73.4" cy="83" rx="1.7" ry="2.4" fill="#f6f1e4" />
    </>
  );
}

function Capitaine({ id }: { id: string }) {
  return (
    <>
      <Niche id={id} c="capitaine" />
      <defs>
        <linearGradient id={`st${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e3e8ee" />
          <stop offset="0.6" stopColor="#9ba6b2" />
          <stop offset="1" stopColor="#5f6a76" />
        </linearGradient>
      </defs>
      {/* La cuirasse et l'écharpe rouge. */}
      <path d="M8 150C12 128 34 116 58 113H92C108 118 116 132 118 150Z" fill={`url(#st${id})`} />
      <path d="M40 150C46 134 56 124 72 120M60 150C64 138 72 130 84 126" fill="none" stroke="#5f6a76" strokeWidth="1" />
      <path d="M28 150 92 112 101 117 44 150Z" fill="#b8321f" />
      <path d="M28 150 92 112" stroke="#e2563d" strokeWidth="0.8" />
      <Face skin="#c88d60" shade="#966141" lips="#7d3a30" brow="#3b2416" />
      {/* Barbe en pointe et moustache. */}
      <path d="M46.6 82.6C51 82.8 56.6 85 62 88.6C66 91 70.4 89 74.6 84.6C74.6 92.8 68.6 100.6 58.6 102.4C52.4 103.4 48 100.6 46.4 97C45.8 92.4 46.4 87 46.6 82.6Z" fill="#3b2416" />
      <path d="M44.4 79C47 77.8 50.4 78.4 52.6 80.6C49.4 81 46.6 80.8 44.4 79Z" fill="#3b2416" />
      {/* Le morion à crête, rivets d'or et plumet. */}
      <path d="M88 40C99 31 108 33 113 20C111 38 101 46 89 48Z" fill="#f2ede2" />
      <path d="M90 44C100 39 106 36 110 28" fill="none" stroke="#b8321f" strokeWidth="1.6" />
      <path d="M38.6 55C45 50.4 51.4 50 56 52.4C56 40 63.4 31 72.4 31C81.4 31 88.6 40 88.4 52.4C93 50 99.6 50.4 104 55C97.4 59.4 88.6 59.6 82 57.4H60.6C53.4 59.6 45 59.4 38.6 55Z" fill={`url(#st${id})`} stroke="#4f5964" strokeWidth="0.8" />
      <path d="M60 36.4C61 24.6 68.4 18.6 74.6 19.6C81.4 20.6 85.6 28.4 84.6 37.6C78.6 33.2 66.6 32.4 60 36.4Z" fill={`url(#st${id})`} stroke="#4f5964" strokeWidth="0.8" />
      <g fill="#d9b25f">
        {[44, 52, 62, 72, 82, 92, 100].map((x, i) => (
          <circle key={x} cx={x} cy={i === 0 || i === 6 ? 55 : 56.4} r="1.05" />
        ))}
      </g>
    </>
  );
}

function Ambassadeur({ id }: { id: string }) {
  return (
    <>
      <Niche id={id} c="ambassadeur" />
      {/* La robe de brocart et son col de fourrure. */}
      <path d="M8 150C12 128 34 116 58 113H92C108 118 116 132 118 150Z" fill="#3f5f2a" />
      <g fill="#d9b25f" opacity="0.5">
        {[22, 34, 100, 110].map((x, i) => (
          <circle key={x} cx={x} cy={138 + (i % 2) * 6} r="1.6" />
        ))}
      </g>
      <path d="M22 150C24 134 36 122 56 116C60 124 66 128 74 128C82 128 90 124 94 116C106 120 112 132 114 150L104 150C102 140 96 132 88 130C84 136 78 140 72 140C64 140 58 136 54 130C42 134 34 140 32 150Z" fill="#6b4a2e" />
      <path d="M24 146c4-1 6 2 10 0M38 132c3-1 5 2 8 0M96 128c3-1 5 2 8 0M104 142c3-1 5 2 8 0" fill="none" stroke="#8a6640" strokeWidth="1.2" />
      <Face skin="#8a5a3b" shade="#5e3a24" lips="#5a2a22" eye="#1a0f0b" brow="#d8d2c4" />
      {/* Barbe blanche de sage. */}
      <path d="M46.4 82.4C50 83.4 55 85.2 60 88.4C65 91.6 70.6 89.4 76 82.4C77.4 94 72 106 61 109C53.4 111 47.6 106.6 46 100C45.2 94.4 45.6 88 46.4 82.4Z" fill="#e7e2d6" />
      <path d="M44.2 78.8C47.2 77.4 51 78 53.4 80.6C49.8 81.2 46.8 80.8 44.2 78.8Z" fill="#e7e2d6" />
      <path d="M52 96c2 4 6 7 10 7M56 92c1 3 4 6 8 7" fill="none" stroke="#bdb6a6" strokeWidth="0.8" />
      {/* Le haut bonnet bordé de fourrure. */}
      <path d="M52 47C51.4 33 53.6 21 59 13.4L85.6 12.6C91 20 93.4 32 92.4 48Z" fill="#5a1f24" />
      <path d="M58 16C62 22 66 34 66 46M70 14C72 22 74 34 74 46M82 14C82 24 82 36 82 46" fill="none" stroke="#7a2c33" strokeWidth="1" />
      <path d="M46.6 53C48 45 58.6 41 71.4 41C84 41 94.6 45 96.6 53C90.6 58 54 59 46.6 53Z" fill="#7a5634" />
      <path d="M50 51c3-1 4 1.6 7 .4M60 49.6c3-1 4 1.6 7 .4M71 49.6c3-1 4 1.6 7 .4M82 50.4c3-1 4 1.6 7 .4" fill="none" stroke="#9c7a52" strokeWidth="1" />
      <circle cx="72" cy="41" r="2" fill="#d9b25f" />
      {/* La lettre de créance, roulée et scellée. */}
      <g transform="rotate(-16 34 128)">
        <rect x="14" y="121" width="40" height="11" rx="5.5" fill="#efe2c2" stroke="#b49a6a" strokeWidth="0.8" />
        <ellipse cx="14.6" cy="126.5" rx="2.4" ry="5.5" fill="#d9c9a4" stroke="#b49a6a" strokeWidth="0.8" />
        <path d="M30 132 27 141M34 132 36 141" stroke="#b8321f" strokeWidth="1.6" />
        <circle cx="32" cy="131.6" r="4" fill="#b8321f" stroke="#6e170c" strokeWidth="0.8" />
      </g>
    </>
  );
}

const PORTRAITS: Record<Character, (p: { id: string }) => ReactNode> = {
  duchesse: Duchesse,
  assassin: Assassin,
  comtesse: Comtesse,
  capitaine: Capitaine,
  ambassadeur: Ambassadeur,
};

export function Portrait({ c, className }: { c: Character; className?: string }) {
  const id = useId().replace(/:/g, '');
  const Draw = PORTRAITS[c];
  return (
    <svg className={cls('portrait', className)} viewBox="0 0 120 150" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      <Draw id={id} />
    </svg>
  );
}

// ───────────────────────────── Cartes ─────────────────────────────

/** Une carte de personnage, face visible : portrait en niche, nom dans un cartouche. */
export function CardFace({ c, className, dead, label }: { c: Character; className?: string; dead?: boolean; label?: string }) {
  return (
    <span className={cls('card', 'card-face', dead && 'is-dead', className)} style={charVars(c)} role="img" aria-label={label ?? `${CHARACTER_INFO[c].name}${dead ? ', retournée' : ''}`}>
      <span className="card-art">
        <Portrait c={c} />
      </span>
      <span className="card-name">{CHARACTER_INFO[c].name}</span>
      <span className="card-corner">
        <Emblem c={c} />
      </span>
    </span>
  );
}

/** Le dos d'une carte : une lettre pliée et scellée. Toutes identiques. */
export function CardBack({ className, label = 'Lettre scellée' }: { className?: string; label?: string }) {
  return (
    <span className={cls('card', 'card-back', className)} role="img" aria-label={label}>
      <svg viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden focusable="false">
        <path d="M0 0 50 62 100 0" fill="none" stroke="#b49a6a" strokeWidth="1.2" />
        <path d="M0 140 42 74M100 140 58 74" fill="none" stroke="#c9b48a" strokeWidth="1" />
        <path d="M6 6h88v128H6z" fill="none" stroke="#c9a14f" strokeWidth="0.8" strokeDasharray="3 2" />
      </svg>
      <Seal className="card-back-seal" />
    </span>
  );
}

/** Une petite carte sur un siège : lettre scellée, ou personnage retourné. */
export function MiniCard({ c, className }: { c?: Character | null; className?: string }) {
  if (!c)
    return (
      <span className={cls('mini', 'mini-back', className)} role="img" aria-label="Carte cachée">
        <i />
      </span>
    );
  return (
    <span className={cls('mini', 'mini-face', className)} style={charVars(c)} role="img" aria-label={`${CHARACTER_INFO[c].name} retournée`}>
      <Emblem c={c} />
    </span>
  );
}
