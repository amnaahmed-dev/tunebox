import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

// ---------- Song shapes ----------
const fromItunes = (t) => ({
  id: String(t.trackId),
  name: t.trackName,
  artist: t.artistName,
  artwork: t.artworkUrl100?.replace("100x100", "300x300"),
  url: t.previewUrl,
  genre: t.primaryGenreName,
});

const fromRow = (r) => ({
  id: r.track_id,
  name: r.name,
  artist: r.artist,
  artwork: r.artwork,
  url: r.preview_url,
});

async function searchItunes(params) {
  const qs = new URLSearchParams({ media: "music", entity: "song", ...params });
  const res = await fetch(`https://itunes.apple.com/search?${qs}`);
  const data = await res.json();
  return data.results.filter((t) => t.previewUrl).map(fromItunes);
}

// Remove repeats (same id, or same title + artist)
function dedupe(list) {
  const seen = new Set();
  return list.filter((s) => {
    const key = `${s.name}|${s.artist}`.toLowerCase();
    if (seen.has(s.id) || seen.has(key)) return false;
    seen.add(s.id);
    seen.add(key);
    return true;
  });
}

// Two songs from the same album share one cover. This gives every cover a single key.
const artKey = (url) => (url ? url.replace(/\/\d+x\d+[^/]*$/, "") : "");

// Keep only one song per cover picture
function dedupeArt(list) {
  const seen = new Set();
  return list.filter((s) => {
    const k = artKey(s.artwork);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Take up to n songs whose cover has not been used anywhere else on the page yet
function takeUnique(list, n, used) {
  const out = [];
  for (const s of list) {
    const k = artKey(s.artwork);
    if (!k || used.has(k)) continue;
    used.add(k);
    out.push(s);
    if (out.length >= n) break;
  }
  return out;
}

// The artists you like most (ties go to the most recently liked)
function topArtists(liked, n = 3) {
  const count = new Map();
  liked.forEach((s) => count.set(s.artist, (count.get(s.artist) || 0) + 1));
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([a]) => a);
}

// Shown on Home until you have liked some songs
const STARTERS = [
  ["Top hits", "top hits"],
  ["Chill", "chill acoustic"],
  ["Throwback", "90s hits"],
];

// Flat tile colors and the mood of each genre
const GENRES = [
  ["Hip-hop", "hip hop", "#ff6a4d", "Bold & confident"],
  ["Rock", "rock", "#f2cf4a", "Loud & raw"],
  ["Jazz", "jazz", "#ff9a3c", "Smooth late nights"],
  ["Alternative", "alternative", "#7fd6a6", "Moody & different"],
  ["Pop", "pop hits", "#ff9ec0", "Bright & catchy"],
  ["Electronic", "electronic", "#b8e04a", "Pulse & energy"],
  ["Lo-fi", "lo-fi chill", "#ffb38a", "Calm & cozy"],
  ["R&B", "r&b soul", "#ece8dd", "Slow & soulful"],
];
const TILT = [-3, 2, -1.5, 3, -2, 1.5];

// The 3D arch of cover tiles in the hero (x and y are %, s is size in px, r is rotation, z is depth)
const ARCH = [
  { x: 50, y: 9, s: 188, r: 0, z: 70, c: true },
  { x: 25, y: 17, s: 124, r: -11, z: 30 },
  { x: 75, y: 15, s: 128, r: 10, z: 30 },
  { x: 11, y: 40, s: 112, r: 38, z: 10 },
  { x: 89, y: 39, s: 112, r: -36, z: 10 },
  { x: 1, y: 63, s: 100, r: -24, z: -10 },
  { x: 99, y: 62, s: 100, r: 28, z: -10 },
];

// Mouse-follow 3D tilt: sets --rx / --ry that the .tilt CSS class uses
function tilt(e) {
  const el = e.currentTarget;
  const k = Number(el.dataset.tilt || 12);
  const r = el.getBoundingClientRect();
  el.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - 0.5) * k}deg`);
  el.style.setProperty("--rx", `${-((e.clientY - r.top) / r.height - 0.5) * k}deg`);
}
function untilt(e) {
  e.currentTarget.style.setProperty("--rx", "0deg");
  e.currentTarget.style.setProperty("--ry", "0deg");
}
const T = { onMouseMove: tilt, onMouseLeave: untilt };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

// ---------- Icons ----------
const PLAY = "M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z";
const PAUSE = "M6 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm8 0h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z";
const PREV = "M6 5h2v14H6V5Zm3.5 7 9.5-6.5v13L9.5 12Z";
const NEXT = "M16 5h2v14h-2V5ZM5 18.5v-13L14.5 12 5 18.5Z";

function Icon({ d, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function Heart({ filled, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7-4.6-9.3-9A5.3 5.3 0 0 1 12 6.5 5.3 5.3 0 0 1 21.3 12C19 16.4 12 21 12 21Z" />
    </svg>
  );
}

// ---------- Song list row ----------
function Row({ s, i, active, playing, liked, onPlay, onLike }) {
  return (
    <div className={`row ${active ? "active" : ""}`}>
      <button onClick={onPlay} className="row-main" aria-label={`Play ${s.name}`}>
        <span className="row-idx">
          <span className="num">
            {active && playing ? (
              <span className="eq"><i /><i /><i /></span>
            ) : (
              i + 1
            )}
          </span>
          <span className="ply">
            <Icon d={active && playing ? PAUSE : PLAY} size={16} />
          </span>
        </span>
        <img src={s.artwork} alt="" className="row-art" />
        <span className="min-w-0">
          <span className="row-title block truncate font-semibold">{s.name}</span>
          <span className="block truncate text-sm text-dim">{s.artist}</span>
        </span>
      </button>
      <button
        onClick={onLike}
        aria-label={liked ? "Remove from liked" : "Add to liked"}
        className={`row-heart ${liked ? "text-violet" : "text-dim"}`}
      >
        <Heart filled={liked} size={20} />
      </button>
      <span className="row-time">0:30</span>
    </div>
  );
}

// ---------- Record sleeve card (used in shelves) ----------
function Card({ s, active, liked, onPlay, onLike }) {
  return (
    <div className={`sleeve shelf-item ${active ? "out" : ""}`}>
      <div className="vinyl" />
      <button onClick={onPlay} className="block w-full text-left" aria-label={`Play ${s.name}`}>
        <img src={s.artwork} alt="" className="cover" />
      </button>
      <div className="flex items-start justify-between gap-2 mt-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">{s.name}</p>
          <p className="text-sm text-dim truncate">{s.artist}</p>
        </div>
        <button
          onClick={onLike}
          aria-label={liked ? "Remove from liked" : "Add to liked"}
          className={liked ? "text-violet" : "text-dim"}
        >
          <Heart filled={liked} size={20} />
        </button>
      </div>
    </div>
  );
}

// ---------- Login background: a tilted wall of music posters ----------
// 21 different posters (7 columns x 3 rows). "who" picks which person is drawn on a cover poster.
const POSTERS = [
  { v: "type", bg: "linear-gradient(165deg, #ff9a5c 0%, #ff4d5e 55%, #ff7aa8 100%)", title: "Experience songs you love", pills: ["Repeat", "Create"] },
  { v: "cover", who: 0, bg: "linear-gradient(165deg, #ffe066 0%, #ffa63c 100%)", pills: ["Hip-hop", "Rock", "Jazz", "Alternative"] },
  { v: "type", bg: "linear-gradient(165deg, #2c2c2f 0%, #0f0f10 100%)", fg: "#ff6a4d", title: "Music, podcasts, livesets, talks", pills: ["New tracks", "Live"] },
  { v: "card", bg: "linear-gradient(165deg, #ffb8cc 0%, #ff6f96 100%)", title: "Modern love", pills: ["Slow", "20 min"] },
  { v: "type", bg: "linear-gradient(165deg, #b8f2ca 0%, #52c98a 100%)", title: "Ad-free forever", pills: ["Unlimited streaming", "Download anytime"] },
  { v: "cover", who: 1, bg: "linear-gradient(165deg, #ffc65c 0%, #ff6238 100%)", pills: ["Pop", "Lo-fi", "R&B"] },
  { v: "type", bg: "linear-gradient(165deg, #9dbcff 0%, #4a6cf7 100%)", title: "700M+ songs", pills: ["Play"] },
  { v: "card", bg: "linear-gradient(165deg, #dbf77c 0%, #86cf45 100%)", title: "Listen to new songs and learn trends", pills: ["Trending"] },
  { v: "type", bg: "linear-gradient(165deg, #ffd6ae 0%, #ff8a78 100%)", title: "Drop the needle", pills: ["Vinyl"] },
  { v: "cover", who: 2, bg: "linear-gradient(165deg, #ff9a5c 0%, #ff4d5e 55%, #ff7aa8 100%)", pills: ["Electronic", "Chill"] },
  { v: "type", bg: "linear-gradient(165deg, #2c2c2f 0%, #0f0f10 100%)", fg: "#f2cf4a", title: "Search any song", pills: ["30-sec previews"] },
  { v: "card", bg: "linear-gradient(165deg, #ffe066 0%, #ffa63c 100%)", title: "Your likes, your crate", pills: ["Liked"] },
  { v: "type", bg: "linear-gradient(165deg, #cdb0ff 0%, #7b5cff 100%)", title: "Hit repeat", pills: ["Repeat"] },
  { v: "cover", who: 3, bg: "linear-gradient(165deg, #b8f2ca 0%, #52c98a 100%)", pills: ["Indie", "Acoustic"] },
  { v: "type", bg: "linear-gradient(165deg, #ffc65c 0%, #ff6238 100%)", title: "Music for every mood", pills: ["Happy", "Focus", "Chill"] },
  { v: "cover", who: 4, bg: "linear-gradient(165deg, #ffb0d4 0%, #ff6f96 100%)", pills: ["K-pop", "Dance"] },
  { v: "type", bg: "linear-gradient(165deg, #9be7ff 0%, #3aa0ff 100%)", title: "Live sessions", pills: ["Live", "Acoustic"] },
  { v: "card", bg: "linear-gradient(165deg, #ffd0e0 0%, #ff9ec0 100%)", title: "Late night drive", pills: ["Chill"] },
  { v: "cover", who: 5, bg: "linear-gradient(165deg, #e0c8ff 0%, #a07cff 100%)", pills: ["Soul", "Funk"] },
  { v: "type", bg: "linear-gradient(165deg, #2c2c2f 0%, #0f0f10 100%)", fg: "#7fd6a6", title: "Fresh finds weekly", pills: ["New", "Weekly"] },
  { v: "card", bg: "linear-gradient(165deg, #fff1a8 0%, #ffd23c 100%)", title: "Throwback Thursday", pills: ["Classics"] },
];

// Want real photos instead of the drawn people? Put images in "public/posters"
// and list them here, for example: const PHOTOS = ["/posters/1.jpg", "/posters/2.jpg"];
const PHOTOS = [];

// Six different people, so no face shows up twice
const PORTRAITS = [
  { skin: "#a0694a", hair: "curly", hairColor: "#161313", glasses: true, hp: "#ff2d3d", jacket: "#1e1e20", top: "#ff9a8d", lips: "#d63a3a" },
  { skin: "#e3ad8c", hair: "bob", hairColor: "#2b1d17", closed: true, hp: "#efe6cf", jacket: "#e8402f", top: "#e8402f", lips: "#c8443a" },
  { skin: "#f3c9a8", hair: "long", hairColor: "#3a2118", hp: "#7b5cff", jacket: "#7fd6a6", top: "#ffffff", lips: "#e0506a" },
  { skin: "#f0c4a4", hair: "curly", hairColor: "#c8442f", hp: "#52c98a", jacket: "#ff9ec0", top: "#ffffff", lips: "#d4574f" },
  { skin: "#c98b62", hair: "bob", hairColor: "#7a2e1a", glasses: true, hp: "#ff9a3c", jacket: "#ffd23c", top: "#1e1e20", lips: "#e0506a" },
  { skin: "#8d5a3c", hair: "long", hairColor: "#0f0f10", closed: true, hp: "#ff6a9a", jacket: "#f5f5f3", top: "#ff6a4d", lips: "#c8443a" },
];

function Portrait({ p }) {
  const curls = [[62, 120, 16], [72, 100, 17], [92, 90, 19], [116, 92, 18], [134, 104, 17], [143, 126, 14], [58, 144, 12], [144, 148, 11]];
  return (
    <svg className="poster-portrait" viewBox="0 0 200 300" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <rect x="87" y="180" width="26" height="46" rx="10" fill={p.skin} />
      <rect x="87" y="205" width="26" height="20" fill="rgba(0,0,0,0.16)" />
      <ellipse cx="100" cy="140" rx="38" ry="48" fill={p.skin} />
      <path d="M8 300C8 232 56 214 100 214s92 18 92 86Z" fill={p.jacket} />
      <path d="M76 216 100 266l24-50Z" fill={p.top} />
      {p.hair === "curly" && curls.map(([x, y, r], k) => <circle key={k} cx={x} cy={y} r={r} fill={p.hairColor} />)}
      {p.hair === "bob" && (
        <path d="M58 150C52 78 148 78 142 150l4 30-20-2-2-62C108 108 92 108 74 116l-2 62-20 2Z" fill={p.hairColor} />
      )}
      {p.hair === "buzz" && <path d="M62 130C62 88 138 88 138 130 126 112 74 112 62 130Z" fill={p.hairColor} />}
      {p.hair === "long" && (
        <path d="M56 160C46 70 154 70 144 160L150 240 126 236 124 120C108 106 92 106 76 120L74 236 50 240Z" fill={p.hairColor} />
      )}
      {!p.shades && !p.closed && (
        <>
          <ellipse cx="85" cy="142" rx="4" ry="5" fill="#161616" />
          <ellipse cx="115" cy="142" rx="4" ry="5" fill="#161616" />
        </>
      )}
      {p.closed && <path d="M78 144q7 6 14 0M108 144q7 6 14 0" stroke="#161616" strokeWidth="3" strokeLinecap="round" fill="none" />}
      {p.glasses && (
        <g fill="rgba(255,255,255,0.18)" stroke="#161616" strokeWidth="3.5">
          <circle cx="84" cy="142" r="14" />
          <circle cx="116" cy="142" r="14" />
          <path d="M98 142h4" fill="none" />
        </g>
      )}
      {p.shades && (
        <g fill="#0f0f10">
          <rect x="66" y="132" width="30" height="20" rx="8" />
          <rect x="104" y="132" width="30" height="20" rx="8" />
          <rect x="94" y="138" width="12" height="4" />
        </g>
      )}
      <path d="M98 150q-4 12 2 14" stroke="rgba(0,0,0,0.25)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M88 172q12 9 24 0-12-5-24 0Z" fill={p.lips} />
      <path d="M56 150C48 58 152 58 144 150" stroke={p.hp} strokeWidth="9" strokeLinecap="round" fill="none" />
      <rect x="44" y="132" width="20" height="40" rx="10" fill={p.hp} />
      <rect x="136" y="132" width="20" height="40" rx="10" fill={p.hp} />
      <rect x="50" y="140" width="8" height="24" rx="4" fill="rgba(0,0,0,0.18)" />
      <rect x="142" y="140" width="8" height="24" rx="4" fill="rgba(0,0,0,0.18)" />
    </svg>
  );
}

function Poster({ spec, art, i }) {
  return (
    <div className={`poster ${spec.v}`} style={{ background: spec.bg, color: spec.fg || "#0f0f10" }}>
      {spec.v === "cover" &&
        (PHOTOS.length ? (
          <img src={PHOTOS[spec.who % PHOTOS.length]} alt="" className="poster-cover" />
        ) : (
          <Portrait p={PORTRAITS[spec.who % PORTRAITS.length]} />
        ))}
      {spec.title && <p className="poster-title">{spec.title}</p>}
      {spec.v === "card" && art && <img src={art} alt="" className="poster-card" />}
      {i % 3 === 0 && (
        <svg className="poster-star" width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 0c.8 6.6 5.4 11.2 12 12-6.6.8-11.2 5.4-12 12-.8-6.6-5.4-11.2-12-12C6.6 11.2 11.2 6.6 12 0Z" />
        </svg>
      )}
      <div className="poster-pills">
        {spec.pills.map((p, k) => (
          <span key={p} className="poster-pill" style={{ transform: `rotate(${TILT[(i + k) % TILT.length]}deg)` }}>
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}

function PosterWall({ art }) {
  const cols = 7;
  const rows = 3;
  return (
    <div className="wall" aria-hidden="true">
      <div className="wall-grid">
        {Array.from({ length: cols }, (_, c) => (
          <div key={c} className="wall-col">
            {Array.from({ length: rows }, (_, r) => {
              const n = c * rows + r; // every poster has its own number, so none repeats
              return <Poster key={r} spec={POSTERS[n]} art={art[n]} i={n} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState("in"); // "in" = log in, "up" = sign up
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [searched, setSearched] = useState("");
  const [songs, setSongs] = useState(null); // null = no search yet
  const [liked, setLiked] = useState([]);
  const [likedReady, setLikedReady] = useState(false);
  const [shelves, setShelves] = useState([]);
  const [tab, setTab] = useState("home");
  const [now, setNow] = useState(null);
  const [popup, setPopup] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [bg, setBg] = useState({ cur: null, prev: null });
  const [genreArt, setGenreArt] = useState({}); // genre name -> songs (their covers are used on the tiles)
  const [wallArt, setWallArt] = useState([]);
  const [compact, setCompact] = useState(false);
  const [history, setHistory] = useState([]);
  const audioRef = useRef(null);
  const queueRef = useRef([]);
  const cacheRef = useRef({});

  // Watch who is logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null);
      setMsg("");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Load liked songs when a user logs in
  useEffect(() => {
    if (user) {
      loadLiked();
      loadHistory();
    } else {
      setLiked([]);
      setLikedReady(false);
      setHistory([]);
    }
  }, [user]);

  // Start playing whenever a new song is picked
  useEffect(() => {
    if (now && audioRef.current) {
      audioRef.current.src = now.url;
      audioRef.current.play().catch(() => {});
      logPlay(now);
    }
  }, [now]);

  // Keep the previous cover so the blurred background can crossfade
  useEffect(() => {
    if (now) setBg((b) => (b.cur === now.artwork ? b : { cur: now.artwork, prev: b.cur }));
  }, [now]);

  // Recommendations: built from the artists you like most
  const top = topArtists(liked);
  const topKey = top.join("|");
  useEffect(() => {
    if (!user || !likedReady) return;
    let cancelled = false;

    async function cached(key, params) {
      if (!cacheRef.current[key]) cacheRef.current[key] = await searchItunes(params);
      return cacheRef.current[key];
    }

    async function build() {
      try {
        let out = [];
        if (top.length) {
          const likedIds = new Set(liked.map((l) => l.id));
          const lists = await Promise.all(
            top.map(async (a) => {
              const res = await cached(`artist:${a}`, { term: a, attribute: "artistTerm", limit: "40" });
              return [a, dedupe(res).filter((s) => !likedIds.has(s.id))];
            })
          );
          // Find the genres of the artists you like, then pick songs from OTHER artists in those genres
          const genreCount = new Map();
          lists.forEach(([, l]) => l.forEach((s) => s.genre && genreCount.set(s.genre, (genreCount.get(s.genre) || 0) + 1)));
          const genres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g);
          const mine = top.map((a) => a.toLowerCase());
          const picks = await Promise.all(
            genres.map((g) => cached(`genre:${g}`, { term: `${g} hits`, limit: "50" }).catch(() => []))
          );
          const mix = [];
          for (let i = 0; i < 30; i++) picks.forEach((l) => l[i] && mix.push(l[i]));
          const fresh = dedupe(mix).filter(
            (s) => !likedIds.has(s.id) && !mine.some((a) => s.artist.toLowerCase().includes(a))
          );
          out = [
            ...(fresh.length ? [{ title: "Picked for you", sub: `Similar to ${top.join(", ")}`, songs: fresh }] : []),
            ...lists.map(([a, l]) => ({ title: `More from ${a}`, songs: l })),
          ];
        } else {
          out = await Promise.all(
            STARTERS.map(async ([title, term]) => {
              const res = await cached(`starter:${term}`, { term, limit: "40" });
              return { title, songs: dedupe(res) };
            })
          );
        }
        // Each shelf keeps one song per cover; the page-wide "no repeated cover" pass happens when drawing Home
        if (!cancelled) setShelves(out.map((s) => ({ ...s, songs: dedupeArt(s.songs) })).filter((s) => s.songs.length > 0));
      } catch {
        if (!cancelled) setShelves([]);
      }
    }

    build();
    return () => {
      cancelled = true;
    };
  }, [user, likedReady, topKey]);

  // Songs for the genre tiles: their covers become the pictures on the tiles
  useEffect(() => {
    if (!user) return;
    let dead = false;
    Promise.all(
      GENRES.map(async ([label, term]) => {
        try {
          const r = dedupeArt(dedupe(await searchItunes({ term, limit: "50" })));
          return [label, r];
        } catch {
          return [label, []];
        }
      })
    ).then((entries) => {
      if (!dead) setGenreArt(Object.fromEntries(entries));
    });
    return () => {
      dead = true;
    };
  }, [user]);

  // Album covers for the login background (one song per cover)
  useEffect(() => {
    if (user || wallArt.length) return;
    let dead = false;
    Promise.all(
      ["pop hits", "hip hop", "rock", "jazz", "electronic"].map((term) =>
        searchItunes({ term, limit: "20" }).catch(() => [])
      )
    ).then((lists) => {
      if (dead) return;
      const mixed = [];
      for (let i = 0; i < 20; i++) lists.forEach((l) => l[i] && mixed.push(l[i]));
      setWallArt(dedupeArt(dedupe(mixed)).map((x) => x.artwork));
    });
    return () => {
      dead = true;
    };
  }, [user]);

  // Esc closes the pop-up
  useEffect(() => {
    if (!popup) return;
    const onKey = (e) => e.key === "Escape" && setPopup(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popup]);

  // Scrolling down folds the header away and keeps only a small search bar
  useEffect(() => {
    const onScroll = () => setCompact((c) => (c ? window.scrollY > 60 : window.scrollY > 160));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // History: every song you play is saved (newest first, no repeats)
  async function loadHistory() {
    const { data } = await supabase.from("history").select("*").order("played_at", { ascending: false }).limit(50);
    setHistory((data || []).map(fromRow));
  }

  async function logPlay(s) {
    if (!user) return;
    const { error } = await supabase.from("history").upsert(
      {
        user_id: user.id,
        track_id: s.id,
        name: s.name,
        artist: s.artist,
        artwork: s.artwork,
        preview_url: s.url,
        played_at: new Date().toISOString(),
      },
      { onConflict: "user_id,track_id" }
    );
    if (!error) setHistory((h) => [s, ...h.filter((x) => x.id !== s.id)].slice(0, 50));
  }

  async function clearHistory() {
    await supabase.from("history").delete().eq("user_id", user.id);
    setHistory([]);
  }

  async function loadLiked() {
    const { data } = await supabase.from("liked_songs").select("*").order("created_at", { ascending: false });
    setLiked((data || []).map(fromRow));
    setLikedReady(true);
  }

  async function auth(kind) {
    setMsg("");
    const { error } =
      kind === "up"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg(error.message);
    else if (kind === "up") {
      setMode("in");
      setMsg("Account created. Now log in.");
    }
  }

  function submit(e) {
    e.preventDefault();
    auth(mode);
  }

  async function runSearch(raw) {
    const term = raw.trim();
    if (!term) return;
    setQ(term);
    setLoading(true);
    setTab("home");
    setMsg("");
    setSearched(term);
    try {
      setSongs(dedupe(await searchItunes({ term, limit: "30" })));
    } catch {
      setMsg("Search failed. Check your internet and try again.");
    }
    setLoading(false);
  }

  function search(e) {
    e.preventDefault();
    runSearch(q);
  }

  function onQ(v) {
    setQ(v);
    if (!v.trim()) setSongs(null);
  }

  function clearSearch() {
    setQ("");
    setSongs(null);
    setMsg("");
  }

  const isLiked = (s) => liked.some((l) => l.id === s.id);

  async function toggleLike(s) {
    if (isLiked(s)) {
      await supabase.from("liked_songs").delete().eq("track_id", s.id);
      setLiked(liked.filter((l) => l.id !== s.id));
    } else {
      const { error } = await supabase.from("liked_songs").insert({
        user_id: user.id,
        track_id: s.id,
        name: s.name,
        artist: s.artist,
        artwork: s.artwork,
        preview_url: s.url,
      });
      if (error) setMsg(error.message);
      else setLiked([s, ...liked]);
    }
  }

  // Pick a song; "from" is the list it came from, so the next song plays after it ends
  function pick(s, from) {
    if (now?.id === s.id) {
      // same song: open the pop-up, or play/pause if it is already open
      if (!popup) setPopup(true);
      else togglePlay();
    } else {
      if (from) queueRef.current = from;
      setNow(s);
      setPopup(true);
    }
  }

  function step(dir) {
    const q2 = queueRef.current;
    const i = q2.findIndex((x) => x.id === now?.id);
    const next = q2[i + dir];
    if (next) setNow(next);
  }

  function togglePlay() {
    const a = audioRef.current;
    if (!a || !now) return;
    a.paused ? a.play() : a.pause();
  }

  function seek(e) {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
  }

  const audioEl = (
    <audio
      ref={audioRef}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => {
        setPlaying(false);
        step(1);
      }}
      onTimeUpdate={(e) => setProgress((e.target.currentTime / (e.target.duration || 30)) * 100)}
    />
  );

  // ---------- Login / Sign up ----------
  if (!user) {
    const isIn = mode === "in";
    return (
      <div className="relative min-h-screen grid place-items-center px-6 py-10">
        <PosterWall art={wallArt} />
        <div className="auth-card relative z-10 w-full max-w-[420px]">
          <div className="cd-wrap mx-auto" aria-hidden="true">
            <div className="cd-tilt">
              <div className="cd-edge" />
              <div className="cd"><div className="cd-ring" /><div className="cd-hole" /></div>
              <div className="cd-shine" />
            </div>
          </div>
          <h1 className="mt-8">
            <span className="script">{isIn ? "Log in to" : "Sign up for"}</span>
            <span className="brand">Tunebox</span>
          </h1>

          <form onSubmit={submit} className="mt-8">
            <label htmlFor="email" className="block text-sm font-semibold mb-2">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="w-full mb-5 px-4 py-3 rounded-md bg-panel border border-line"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label htmlFor="password" className="block text-sm font-semibold mb-2">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={isIn ? "current-password" : "new-password"}
              className="w-full mb-6 px-4 py-3 rounded-md bg-panel border border-line"
              placeholder={isIn ? "Your password" : "6 or more characters"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit" className="w-full py-3.5 rounded-full bg-violet text-ink font-bold hover:brightness-110">
              {isIn ? "Log in" : "Sign up"}
            </button>
          </form>

          {msg && <p className="mt-4 text-center text-sm text-dim">{msg}</p>}

          <div className="border-t border-line mt-8 pt-6 text-center text-dim">
            {isIn ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => {
                setMode(isIn ? "up" : "in");
                setMsg("");
              }}
              className="text-lilac font-semibold underline underline-offset-4"
            >
              {isIn ? "Sign up for Tunebox" : "Log in here"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Main app ----------
  const rowProps = (s, list) => ({
    s,
    active: now?.id === s.id,
    playing,
    liked: isLiked(s),
    onPlay: () => pick(s, list),
    onLike: () => toggleLike(s),
  });
  const name = user.email.split("@")[0];
  const jumpBrowse = () => document.getElementById("browse")?.scrollIntoView({ behavior: "smooth" });

  // No cover picture is shown twice on Home: quick picks, hero arch, shelves, then genre tiles
  // each take covers that nothing before them has used.
  const used = new Set();
  const quick = takeUnique(liked, 6, used);
  const archSongs = takeUnique(shelves.flatMap((sh) => sh.songs), ARCH.length, used);
  const homeShelves = shelves
    .map((sh) => ({ ...sh, songs: takeUnique(sh.songs, 12, used) }))
    .filter((sh) => sh.songs.length > 0);
  const tiles = GENRES.map(([label, term, color, mood]) => ({
    label,
    term,
    color,
    mood,
    covers: takeUnique(genreArt[label] || [], 4, used), // 1 for the blurred background, 3 in the row
  }));

  return (
    <div className="theme-home min-h-screen">
      {audioEl}

      {/* Blurred cover glow behind everything */}
      {bg.prev && <div className="ambient still" style={{ backgroundImage: `url(${bg.prev})` }} />}
      {bg.cur && <div key={bg.cur} className="ambient" style={{ backgroundImage: `url(${bg.cur})` }} />}

      <main className="relative z-10 pb-28 min-w-0">
        <div className={`sticky top-0 z-20 glass px-8 hdr ${compact ? "compact" : ""}`}>
          <div className="hdr-fold"><div><div className="topbar pt-5">
            <h1 className="brand-mark">Tunebox</h1>
            <div className="who">
              <span className="truncate">{user.email}</span>
              <button onClick={() => supabase.auth.signOut()} className="underline underline-offset-4 hover:text-lilac">
                Log out
              </button>
            </div>
          </div></div></div>
          <form onSubmit={search} className="relative hdr-search">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-dim pointer-events-none">
              <SearchIcon />
            </span>
            <input
              className="w-full pl-12 pr-11 py-3 rounded-full bg-raised border border-line"
              placeholder="What do you want to listen to?"
              value={q}
              onChange={(e) => onQ(e.target.value)}
            />
            {q && (
              <button type="button" onClick={clearSearch} aria-label="Clear search" className="absolute right-4 top-1/2 -translate-y-1/2 text-dim hover:text-lilac">
                ✕
              </button>
            )}
          </form>
          <div className="hdr-fold"><div><div className="flex gap-2 pt-4 pb-4">
            <button onClick={() => setTab("home")} className={`chip ${tab === "home" ? "on" : ""}`}>Home</button>
            <button onClick={() => setTab("liked")} className={`chip ${tab === "liked" ? "on" : ""}`}>
              Liked Songs ({liked.length})
            </button>
            <button onClick={() => setTab("history")} className={`chip ${tab === "history" ? "on" : ""}`}>History</button>
          </div></div></div>
        </div>

        <div className="px-8 pt-6">
          {msg && <p className="mb-4 text-sm text-dim">{msg}</p>}

          {/* ----- Liked Songs ----- */}
          {tab === "liked" && (
            <>
              <div className="flex items-end gap-6 mb-8">
                <div className="banner tilt" data-tilt="14" {...T}><Heart filled size={56} /></div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Playlist</p>
                  <h2 className="text-5xl font-extrabold tracking-tight my-2">Liked Songs</h2>
                  <p className="text-dim truncate">{name} · {liked.length} {liked.length === 1 ? "song" : "songs"}</p>
                </div>
              </div>
              {liked.length > 0 && (
                <button
                  onClick={() => pick(liked[0], liked)}
                  aria-label="Play liked songs"
                  className="w-14 h-14 rounded-full bg-violet text-ink grid place-items-center mb-4 hover:brightness-110"
                >
                  <Icon d={playing && liked.some((l) => l.id === now?.id) ? PAUSE : PLAY} size={24} />
                </button>
              )}
              {liked.length === 0 && <p className="text-dim max-w-sm">Tap the heart on a song to keep it here.</p>}
              {liked.map((s, i) => <Row key={s.id} i={i} {...rowProps(s, liked)} />)}
            </>
          )}

          {/* ----- History ----- */}
          {tab === "history" && (
            <>
              <div className="flex items-end justify-between gap-4 mb-6">
                <div className="min-w-0">
                  <h2 className="text-5xl font-extrabold tracking-tight">History</h2>
                  <p className="text-dim mt-2">Songs you played recently · {history.length}</p>
                </div>
                {history.length > 0 && <button onClick={clearHistory} className="chip">Clear history</button>}
              </div>
              {history.length === 0 && <p className="text-dim max-w-sm">Songs you play will show up here.</p>}
              {history.map((s, i) => <Row key={s.id} i={i} {...rowProps(s, history)} />)}
            </>
          )}

          {/* ----- Search results ----- */}
          {tab === "home" && songs !== null && (
            <>
              {loading && <p className="text-dim">Searching...</p>}
              {!loading && songs.length === 0 && (
                <p className="text-dim max-w-sm">No results for “{searched}”. Check the spelling or try another artist.</p>
              )}
              {!loading && songs.length > 0 && (
                <>
                  <div className="grid gap-8 xl:grid-cols-[340px_1fr]">
                    <section>
                      <h2 className="sec">Top result</h2>
                      <button onClick={() => pick(songs[0], songs)} className="top tilt text-left w-full" data-tilt="8" {...T} aria-label={`Play ${songs[0].name}`}>
                        <img src={songs[0].artwork} alt="" className="w-24 h-24 rounded-lg object-cover" />
                        <span className="block text-3xl font-extrabold mt-5 truncate">{songs[0].name}</span>
                        <span className="block text-dim mt-1 truncate">Song · {songs[0].artist}</span>
                        <span className="top-play">
                          <Icon d={playing && now?.id === songs[0].id ? PAUSE : PLAY} size={22} />
                        </span>
                      </button>
                    </section>
                    <section className="min-w-0">
                      <h2 className="sec">Songs</h2>
                      {songs.slice(1, 6).map((s, i) => <Row key={s.id} i={i} {...rowProps(s, songs)} />)}
                    </section>
                  </div>
                  {songs.length > 6 && (
                    <section className="mt-10">
                      <h2 className="sec">More songs</h2>
                      {songs.slice(6).map((s, i) => <Row key={s.id} i={i + 5} {...rowProps(s, songs)} />)}
                    </section>
                  )}
                </>
              )}
            </>
          )}

          {/* ----- Home: 3D arch hero, quick picks, recommendations ----- */}
          {tab === "home" && songs === null && (
            <>
              <h2 className="greet mb-5">{greeting()}</h2>

              <section
                className="arch"
                onMouseMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  e.currentTarget.style.setProperty("--mx", ((e.clientX - r.left) / r.width - 0.5) * 2);
                  e.currentTarget.style.setProperty("--my", ((e.clientY - r.top) / r.height - 0.5) * 2);
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.setProperty("--mx", 0);
                  e.currentTarget.style.setProperty("--my", 0);
                }}
              >
                <nav className="arch-nav">
                  <div className="arch-logo"><span className="hh-cd" aria-hidden="true" /><span>Tunebox</span></div>
                  <div className="arch-links">
                    <button onClick={() => setTab("home")}>Home</button>
                    <button onClick={() => setTab("liked")}>Liked</button>
                    <button onClick={jumpBrowse}>Genres</button>
                  </div>
                  <button className="arch-cta" onClick={jumpBrowse}>Browse all</button>
                </nav>

                <div className="arch-tiles">
                  <div className="arch-stage">
                    {ARCH.map((t, i) => {
                      const s = archSongs[i];
                      const style = { "--x": t.x, "--y": t.y, "--s": t.s, "--r": t.r, "--z": t.z, "--d": `${i * -0.7}s` };
                      if (!s) return <div key={i} className="arch-tile ghost" style={style} />;
                      return (
                        <div key={s.id} className={`arch-tile ${t.c ? "center" : ""} ${now?.id === s.id ? "on" : ""}`} style={style}>
                          <button className="arch-hit" onClick={() => pick(s, archSongs)} aria-label={`Play ${s.name}`}>
                            <img src={s.artwork} alt="" />
                          </button>
                          {t.c && (
                            <>
                              <div className="arch-chip">
                                <b>{s.name}</b>
                                <small>{s.artist}</small>
                              </div>
                              <button
                                className="arch-heart"
                                onClick={() => toggleLike(s)}
                                aria-label={isLiked(s) ? "Remove from liked" : "Add to liked"}
                              >
                                <Heart filled={isLiked(s)} size={18} />
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="arch-copy">
                  <h3>Search it. Play it. <em>Keep it.</em></h3>
                  <p>Any song, any mood. Tap a cover to play it, and heart the ones you love.</p>
                  <button className="arch-btn" onClick={() => runSearch("top hits")}>Start listening</button>
                </div>
              </section>

              {quick.length > 0 && (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-8">
                  {quick.map((s) => (
                    <button key={s.id} onClick={() => pick(s, quick)} className={`quick tilt ${now?.id === s.id ? "active" : ""}`} data-tilt="8" {...T}>
                      <img src={s.artwork} alt="" />
                      <span className="font-semibold truncate pr-3">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {homeShelves.length === 0 && <p className="text-dim mt-8">Loading songs for you...</p>}
              {homeShelves.map((sh) => (
                <section key={sh.title} className="mt-10">
                  <h2 className="sec">{sh.title}</h2>
                  {sh.sub && <p className="text-sm text-dim -mt-2 mb-2">{sh.sub}</p>}
                  <div className="shelf">
                    {sh.songs.map((s) => {
                      const p = rowProps(s, sh.songs);
                      return <Card key={s.id} s={s} active={p.active} liked={p.liked} onPlay={p.onPlay} onLike={p.onLike} />;
                    })}
                  </div>
                </section>
              ))}

              <section className="mt-12" id="browse">
                <h2 className="sec">Browse all</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-4">
                  {tiles.map(({ label, term, color, mood, covers }) => (
                    <button key={label} onClick={() => runSearch(term)} className="tile tilt" style={{ background: color }} data-tilt="16" {...T}>
                      {covers[0] && <span className="tile-bg" style={{ backgroundImage: `url(${covers[0].artwork})` }} />}
                      <span className="tile-tint" style={{ background: color }} />
                      <span className="tile-name">{label}</span>
                      <span className="tile-mood">{mood}</span>
                      <span className="tile-art">
                        {covers.slice(1).map((c) => <img key={c.id} src={c.artwork} alt="" />)}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      {/* Mini bar: shows while a song plays and the pop-up is closed */}
      {now && !popup && (
        <button className="mini" onClick={() => setPopup(true)} aria-label="Open player">
          <img src={now.artwork} alt="" className={`mini-cover ${playing ? "on" : ""}`} />
          <span className="mini-text">
            <b className="block truncate">{now.name}</b>
            <small className="block truncate">{now.artist}</small>
          </span>
          <span
            className="mini-play"
            role="button"
            aria-label={playing ? "Pause" : "Play"}
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
          >
            <Icon d={playing ? PAUSE : PLAY} size={16} />
          </span>
        </button>
      )}

      {/* Song pop-up */}
      {popup && now && (
        <div className="pop-back" onClick={() => setPopup(false)}>
          <div className="pop" role="dialog" aria-label="Now playing" onClick={(e) => e.stopPropagation()}>
            <button className="pop-x" onClick={() => setPopup(false)} aria-label="Close">✕</button>
            <img key={now.id} src={now.artwork} alt="" className={`pop-art ${playing ? "on" : ""}`} />
            <p className="pop-title">{now.name}</p>
            <p className="pop-artist">{now.artist}</p>

            <div onClick={seek} className="pop-bar">
              <div style={{ width: `${progress}%` }} />
            </div>

            <div className="pop-controls">
              <button onClick={() => toggleLike(now)} aria-label={isLiked(now) ? "Remove from liked" : "Add to liked"} className="pop-side">
                <Heart filled={isLiked(now)} size={24} />
              </button>
              <button onClick={() => step(-1)} aria-label="Previous song" className="pop-side">
                <Icon d={PREV} size={26} />
              </button>
              <button onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} className="pop-play">
                <Icon d={playing ? PAUSE : PLAY} size={24} />
              </button>
              <button onClick={() => step(1)} aria-label="Next song" className="pop-side">
                <Icon d={NEXT} size={26} />
              </button>
            </div>
            <p className="pop-note">Previews are 30 seconds long.</p>
          </div>
        </div>
      )}
    </div>
  );
}