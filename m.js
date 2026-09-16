/* HydroAI 모바일 — 캘린더(날짜→얼굴) + 내 공간, 조회 전용. 한국어/English.
   잠금: 얼굴 선택 + 본인 대시보드 비밀번호(신입 초기 = 성 소문자 + '!').
   data.enc.json(AES-256-GCM) 봉투에서 본인 KEK 로 내용키를 풀어 그린다. 서버 없음. */
(() => {
"use strict";

const ENC_URL = "data.enc.json";
const K_NAME = "hym2-name", K_KEK = "hym2-kek", K_BLOB = "hym2-blob";
const K_THEME = "hydroai-theme", K_LANG = "hydroai-lang";

/* ─── 언어 ─── */
let LANG = localStorage.getItem(K_LANG) === "en" ? "en" : "ko";
const t = (ko, en) => (LANG === "en" ? en : ko);
const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];
const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dow = (i) => (LANG === "en" ? DOW_EN[i] : DOW_KO[i]);

/* 카테고리 심볼·라벨 — hydroai-meeting common.js 와 동일. 색은 m.css 의 --cat-* */
const CATS = {
  conference: { sym: "🎤", ko: "학회", en: "Conference" },
  lab: { sym: "🧪", ko: "내부 행사", en: "Lab event" },
  exam: { sym: "📝", ko: "시험기간", en: "Exam period" },
  academic: { sym: "🎓", ko: "학사일정", en: "Academic" },
  travel: { sym: "✈️", ko: "출장", en: "Travel" },
  deadline: { sym: "⏰", ko: "마감", en: "Deadline" },
  holiday: { sym: "🏖️", ko: "휴일", en: "Holiday" },
  away: { sym: "⛔", ko: "부재", en: "Away" },
  other: { sym: "📌", ko: "기타", en: "Other" },
};
const VAC_SYM = { vacation: "🏖️", travel: "✈️", conference: "🎤", remote: "🏠", field: "🌾", other: "📌" };
/* 개인 플랜 카테고리 — hydroai-members member.js PCATS 와 동일 */
const PCATS = {
  research: ["🔬", "연구", "Research"], chore: ["🧹", "잡무", "Chores"],
  workout: ["🏋️", "운동", "Workout"], study: ["📖", "공부", "Study"],
  meal: ["🍴", "식사", "Meal"], class: ["📚", "수업", "Class"],
  travel: ["✈️", "출장", "Travel"], conference: ["🎤", "학회", "Conference"],
  field: ["🌾", "현장", "Field"], personal: ["🙋", "개인", "Personal"],
  other: ["📌", "기타", "Other"],
};

/* 주간 파이 조각 — 순서·색은 dataviz 검증을 통과한 팔레트(연구가 첫 조각) */
const PLAN_SLOTS = [
  /* 미팅은 플랜이 아니라 캘린더(미팅 기록)에서 센다 — 플랜만 세니 PI 시간이 통째로
     빠져 보였다(PI 지적 2026-08-15). cats 가 비어 있어 플랜과는 절대 안 겹친다. */
  { cats: [], meeting: true, sym: "🤝", ko: "미팅", en: "Meetings", cvar: "--s-meeting" },
  { cats: ["research"], sym: "🔬", ko: "연구", en: "Research", cvar: "--s-research" },
  { cats: ["study"], sym: "📖", ko: "공부", en: "Study", cvar: "--s-study" },
  { cats: ["travel", "conference", "field"], sym: "✈️", ko: "출장·학회", en: "Trips", cvar: "--s-away" },
  { cats: ["class"], sym: "📚", ko: "수업", en: "Class", cvar: "--s-class" },
  { cats: ["workout"], sym: "🏋️", ko: "운동", en: "Workout", cvar: "--s-workout" },
  { cats: ["chore"], sym: "🧹", ko: "잡무", en: "Chores", cvar: "--s-chore" },
  { cats: ["meal", "personal", "other"], sym: "📌", ko: "기타", en: "Other", cvar: "--s-other" },
];

/* 다른 대시보드 — 탭하면 "연구실에서 확인하세요". nav.js ITEMS 스냅샷(홈·캘린더·멤버 제외).
   4번째 값 1 = PI 전용 — 학생에겐 목록에서 존재 자체를 숨긴다 (PI 지시 2026-08-13).
   5번째 값 = 폰에도 있는 화면이면 그 탭으로 보낸다 (🖥️ 서버). */
const DASH = [
  ["🛰️", "연구", "Research"],       ["🎙️", "미팅기록", "Voice", 1],  ["📖", "저널클럽", "Journal"],
  ["📝", "논문리뷰", "Papers"],      ["🧑‍🏫", "랩미팅", "Lab Mtg"],    ["🎤", "학회", "Confs"],
  ["📚", "자료실", "Archive"],       ["🧰", "장비", "Equip"],         ["🖥️", "서버", "GPU", 0, "srv"],
  ["🌐", "네트워크", "Network"],     ["🪑", "배치도", "Seats"],       ["🗃️", "데이터", "Data"],
  ["📡", "위성", "Satellites"],      ["🌾", "함평", "Hampyeong"],     ["🧾", "과제", "Grants", 1],
  ["🛒", "구매", "Purchase"],        ["🧑‍⚖️", "리뷰어", "Peer", 1],   ["🛰️", "외부접속", "Remote", 1],
  ["🌱", "인턴", "Interns"],         ["🗂️", "관리자", "Admin", 1],
];

let ENC = null;        // 받은 봉투 {v, iter, picker, keyring, shared, personal}
let P = null;          // 복호화된 공용 payload
let ME = null;         // {name, personal}
let selDate = "";
let byDate = {};
let iniMap = {};       // 이름 → 이니셜
let photoMap = {};     // 이름 → 사진 b64
let KNOWN = new Set(); // 현 멤버 + PI + 마스코트 — 이 밖의 이름은 얼굴로 안 띄운다
let lastFetch = 0;

/* ─── 유틸 ─── */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const pad2 = (n) => String(n).padStart(2, "0");
const pd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const ymd = (dt) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ymd(d); };
const monStart = (s) => { const d = pd(s); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return ymd(d); };
const kdate = (s) => { const d = pd(s); return LANG === "en"
  ? `${MON_EN[d.getMonth()]} ${d.getDate()} (${DOW_EN[d.getDay()]})`
  : `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW_KO[d.getDay()]})`; };
const kdShort = (s) => { const d = pd(s); return `${d.getMonth() + 1}/${d.getDate()} (${dow(d.getDay())})`; };
const kdNum = (s) => { const d = pd(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const inRange = (s) => P && s >= P.range.start && s <= P.range.end;
const linkify = (escaped) => escaped.replace(/(https?:\/\/[^\s<]+)/g,
  '<a href="$1" target="_blank" rel="noopener">$1</a>');
const initialsOf = (name) => {
  if (iniMap[name]) return iniMap[name];
  const tk = String(name).trim().split(/\s+/);
  return ((tk[0]?.[0] || "") + (tk[1]?.[0] || "")).toUpperCase() || "?";
};
const todayStr = () => (P && P.today) || ymd(new Date());
const dueLabel = (x) => (LANG === "en" && x.label_en ? x.label_en : (x.label || t("기한", "Due")));

/* ─── 암호 ─── */
const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hexToBytes = (s) => new Uint8Array((s.match(/../g) || []).map((h) => parseInt(h, 16)));
const bytesToHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function deriveKEK(pw, saltHex, iter) {
  const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: iter, hash: "SHA-256" }, km, 256);
}
async function subKey(kekBuf, label) {
  const lab = new TextEncoder().encode(label);
  const cat = new Uint8Array(kekBuf.byteLength + lab.length);
  cat.set(new Uint8Array(kekBuf), 0); cat.set(lab, kekBuf.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", cat);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}
async function gcmOpen(key, blob) {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(blob.iv) }, key, b64d(blob.ct));
}
async function openAll(kekBuf, name) {
  const ring = ENC.keyring?.[name];
  if (!ring) throw new Error("no-ring");
  const masterRaw = await gcmOpen(await subKey(kekBuf, "hym-wrap-v2"), { iv: ring.iv, ct: ring.wk });
  const masterKey = await crypto.subtle.importKey("raw", masterRaw, "AES-GCM", false, ["decrypt"]);
  const shared = JSON.parse(new TextDecoder().decode(await gcmOpen(masterKey, ENC.shared)));
  if (ENC.photos) {          // 조각 발행: 사진은 딴 파일(거의 불변) — 여기서 도로 합친다
    try {
      const ph = JSON.parse(new TextDecoder().decode(await gcmOpen(masterKey, ENC.photos)));
      (shared.members || []).forEach((m) => { if (ph[m.name]) m.photo = ph[m.name]; });
      if (shared.pi && ph.__pi__) shared.pi.photo = ph.__pi__;
    } catch { /* 사진이 없어도 이니셜로 그린다 */ }
  }
  let personal = null;
  if (ENC.personal?.[name]) {
    try {
      personal = JSON.parse(new TextDecoder().decode(
        await gcmOpen(await subKey(kekBuf, "hym-personal-v2"), ENC.personal[name])));
    } catch { personal = null; }
  }
  return { shared, personal };
}

/* ─── 부팅 ─── */
/* 조각 발행(v3): feed.json(작음)이 내용 해시가 이름에 박힌 불변 파일들을 가리킨다.
   바뀐 조각만 새 이름이라, 폰은 그 파일만 다시 받는다(나머지는 sw.js 캐시가 즉답).
   여기서 통봉투(v2)와 같은 모양으로 재조립하므로 아래 해독·화면 코드는 그대로다. */
async function fetchParts() {
  const rf = await fetch("feed.json?t=" + Date.now(), { cache: "no-store" });
  if (!rf.ok) throw new Error("no-feed");
  const feed = await rf.json();
  if (feed.v !== 3 || !feed.files?.picker || !feed.files?.shared) throw new Error("no-feed");
  const jget = async (p) => {
    const r = await fetch(p);                  // 불변 파일 — 캐시에 맡긴다
    if (!r.ok) throw new Error("HTTP " + r.status + " " + p);
    return r.json();
  };
  const names = Object.keys(feed.files.personal || {});
  const [picker, shared, photos, ...pers] = await Promise.all([
    jget(feed.files.picker), jget(feed.files.shared),
    feed.files.photos ? jget(feed.files.photos) : null,
    ...names.map((n) => jget(feed.files.personal[n])),
  ]);
  const personal = {};
  names.forEach((n, i) => { personal[n] = pers[i]; });
  return { v: 2, kdf: feed.kdf, iter: feed.iter, picker,
           keyring: feed.keyring, shared, photos, personal };
}
async function fetchEnc() {
  let enc = null;
  try { enc = await fetchParts(); }
  catch { /* 조각이 없거나(옛 발행) 하나라도 실패 — 통봉투로 */ }
  if (!enc) {
    const r = await fetch(ENC_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    enc = await r.json();
  }
  try { localStorage.setItem(K_BLOB, JSON.stringify(enc)); } catch { /* 저장 못 해도 그만 */ }
  lastFetch = Date.now();
  return enc;
}

/* HTML 껍데기가 낡았으면 한 번만 다시 받는다 — iOS 홈 화면 앱이 index.html 을 오래
   붙들고 있어 새 화면(탭·마크업)이 안 오던 문제. 주소에 ?v= 를 붙여야 새로 받아진다. */
async function shellCheck() {
  try {
    const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
    const v = (await r.json()).v || "";
    const mine = document.documentElement.dataset.shell || "";
    if (v && mine && v !== mine && sessionStorage.getItem("hym-reload") !== v) {
      sessionStorage.setItem("hym-reload", v);      // 무한 재적재 방지
      /* 캐시에 잡힌 껍데기를 확실히 버리게: 서비스워커 캐시도 비우고 새 주소로 */
      try {
        if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
      } catch { /* 캐시 API 가 없으면 그냥 넘어간다 */ }
      location.replace(location.pathname + "?v=" + encodeURIComponent(v));
      return true;
    }
  } catch { /* 네트워크가 없으면 그냥 쓰던 화면으로 */ }
  return false;
}

/* 서비스워커 — 홈 화면 앱이 옛 코드에 갇히지 않게(항상 서버 우선). 실패해도 앱은 돈다. */
function swSetup() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

async function boot() {
  applyTheme(getTheme());
  applyDrop(getDrop());
  applyStaticText();
  swSetup();
  if (await shellCheck()) return;
  ["hym-key", "hym-salt", "hym-blob"].forEach((k) => localStorage.removeItem(k));  // v1 정리
  if (!window.crypto?.subtle) { showLock(t("이 브라우저에서는 열 수 없어요 (https 필요)", "Can't open in this browser (needs https)")); return; }
  try {
    ENC = await fetchEnc();
  } catch {
    const cached = localStorage.getItem(K_BLOB);
    if (cached) { ENC = JSON.parse(cached); }
    else { showLock(t("데이터를 못 받았어요 — 네트워크 확인 후 새로고침해 주세요", "Couldn't load data — check your network and refresh")); return; }
  }
  if (ENC.v !== 2) { showLock(t("앱이 갱신되는 중이에요 — 잠시 후 다시 열어주세요", "The app is being updated — try again in a minute")); return; }
  const name = localStorage.getItem(K_NAME), kekHex = localStorage.getItem(K_KEK);
  if (name && kekHex && ENC.keyring?.[name]) {
    try {
      const { shared, personal } = await openAll(hexToBytes(kekHex).buffer, name);
      start(shared, name, personal);
      return;
    } catch { localStorage.removeItem(K_KEK); }
  }
  showLock();
}

/* ─── 잠금 화면 — 얼굴 → 비밀번호 ─── */
let pickName = "";

function faceHtml(e) {
  return e.ph
    ? `<img src="data:image/jpeg;base64,${e.ph}" alt="">`
    : `<span class="face-ini">${esc(e.i || initialsOf(e.n))}</span>`;
}

function showLock(msg) {
  $("#lock").hidden = false; $("#app").hidden = true;
  $("#lockMsg").textContent = msg || "";
  const grid = $("#faceGrid");
  if (ENC?.picker) {
    grid.innerHTML = ENC.picker.map((e, idx) =>
      `<button class="face" data-idx="${idx}">
        <span class="face-ph">${faceHtml(e)}${e.pi ? '<span class="face-tag">🐶</span>' : ""}</span>
        <span class="face-nm">${esc(LANG === "en" ? e.n : (e.k || e.n))}</span></button>`).join("");
  }
  if (!pickName) { grid.hidden = false; $("#lockForm").hidden = true; }
  applyStaticText();
}

$("#faceGrid").addEventListener("click", (ev) => {
  const b = ev.target.closest(".face");
  if (!b || !ENC?.picker) return;
  const e = ENC.picker[Number(b.dataset.idx)];
  if (!e) return;
  pickName = e.n;
  $("#pwName").textContent = LANG === "en" ? e.n : (e.k || e.n);
  $("#pwNameEn").textContent = LANG === "en" ? (e.k || "") : e.n;
  const img = $("#pwFace"), emo = $("#pwEmoji");
  if (e.ph) { img.src = "data:image/jpeg;base64," + e.ph; img.hidden = false; emo.hidden = true; }
  else { img.hidden = true; emo.hidden = false; }
  $("#faceGrid").hidden = true; $("#lockForm").hidden = false;
  $("#lockHint").textContent = t("본인 비밀번호를 입력하세요", "Enter your password");
  $("#lockMsg").textContent = "";
  setTimeout(() => $("#lockPw").focus(), 60);
});

$("#pwBack").addEventListener("click", () => {
  pickName = ""; $("#lockPw").value = "";
  $("#faceGrid").hidden = false; $("#lockForm").hidden = true;
  $("#lockHint").textContent = t("얼굴을 누르세요", "Tap your face");
  $("#lockMsg").textContent = "";
});

$("#lockForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!ENC || !pickName) return;
  const pw = $("#lockPw").value;
  if (!pw) return;
  const btn = $("#lockBtn");
  btn.disabled = true; btn.textContent = t("확인 중…", "Checking…"); $("#lockMsg").textContent = "";
  const ring = ENC.keyring[pickName];
  /* 초기 비밀번호(성+!)는 대시보드가 대소문자를 안 가린다 — 소문자 후보도 시도 */
  const cands = [...new Set([pw, pw.toLowerCase()])];
  let ok = false;
  for (const cand of cands) {
    try {
      const kek = await deriveKEK(cand, ring.s, ENC.iter || 200000);
      const { shared, personal } = await openAll(kek, pickName);
      localStorage.setItem(K_NAME, pickName);
      localStorage.setItem(K_KEK, bytesToHex(kek));
      start(shared, pickName, personal);
      ok = true;
      break;
    } catch { /* 다음 후보 */ }
  }
  if (!ok) {
    $("#lockMsg").textContent = t("비밀번호가 맞지 않아요", "Wrong password");
    const card = document.querySelector(".lock-card");
    card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
  }
  btn.disabled = false; btn.textContent = t("열기", "Open");
});

/* ─── 시작·헤더 ─── */
function start(shared, myName, personal) {
  P = shared;
  ME = { name: myName, personal };
  SRV = null;                        // 새 발행본이 왔으면 폰이 따로 받아둔 실측은 버린다
  iniMap = {}; photoMap = {}; KNOWN = new Set();
  (P.members || []).forEach((m) => {
    KNOWN.add(m.name);
    if (m.initial) iniMap[m.name] = m.initial;
    if (m.photo) photoMap[m.name] = m.photo;
  });
  if (P.pi) {
    KNOWN.add(P.pi.name);
    if (P.pi.photo) photoMap[P.pi.name] = P.pi.photo;
  }
  (P.mascots || []).forEach((m) => KNOWN.add(m.name));
  if (!selDate) selDate = todayStr();
  indexDates();
  renderAll();
  $("#btnAdd").hidden = !isPi();     // ＋ 미팅 만들기 — PI 로그인일 때만
  $("#lock").hidden = true; $("#app").hidden = false;
  requestAnimationFrame(renderHeader);   // 화면이 뜬 뒤라야 진단값(바 높이)이 잡힌다
}

function renderAll() {
  applyStaticText();
  renderHeader(); renderCal(); renderMy(); renderServers(); renderMembers();
  renderApprovals(); renderGrants(); renderMore();
}

function renderHeader() {
  const g = new Date(P.generated);
  const now = new Date();
  const sameDay = g.toDateString() === now.toDateString();
  const hm = `${pad2(g.getHours())}:${pad2(g.getMinutes())}`;
  const dpfx = sameDay ? "" : `${g.getMonth() + 1}/${g.getDate()} `;
  /* 빌드 앞 4자리를 늘 보이게 — "폰에 반영됐나?"를 눈으로 바로 확인하려고 (PI 요청) */
  const b4 = (document.documentElement.dataset.shell || "?").slice(0, 4);
  /* 진단값 — 안전영역(sab)과 탭바 높이. 폰마다 값이 달라 사진 한 장으로 확인하려고. */
  let diag = "";
  try {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;bottom:0;height:env(safe-area-inset-bottom);width:0";
    document.body.appendChild(probe);
    const sab = Math.round(probe.getBoundingClientRect().height);
    probe.remove();
    diag = ` · s${sab}b${Math.round($("#tabbar").getBoundingClientRect().height)}`;
  } catch { /* 진단 실패는 무시 */ }
  $("#genAt").textContent = diag
    ? `${dpfx}${hm} · ${b4}${diag}`                     // 진단 중엔 짧게(줄바꿈 방지)
    : t(`${dpfx}${hm} 기준 · ${b4}`, `as of ${dpfx}${hm} · ${b4}`);
  const ageH = (now - g) / 3.6e6;
  $("#staleBar").hidden = ageH < 3;
  if (ageH >= 3) {
    const age = ageH < 48 ? t(`${Math.round(ageH)}시간`, `${Math.round(ageH)}h`)
                          : t(`${Math.round(ageH / 24)}일`, `${Math.round(ageH / 24)}d`);
    $("#staleBar").textContent = t(`⚠️ 연구실 게이트웨이 소식이 오래됐어요 — ${age} 전 기준`,
                                   `⚠️ Lab gateway data is stale — from ${age} ago`);
  }
}

/* ─── 날짜 색인 ─── */
function bucket(date) {
  return (byDate[date] ||= { occ: [], allday: [], timed: [], dues: [], deadlines: [], piaway: [], apple: [], bdays: [] });
}
function indexDates() {
  byDate = {};
  (P.occ || []).forEach((o) => bucket(o.date).occ.push(o));
  (P.events || []).forEach((ev) => {
    const end = ev.end && ev.end >= ev.start ? ev.end : ev.start;
    if (ev.start === end && ev.time_start) { bucket(ev.start).timed.push(ev); return; }
    let d = ev.start, n = 0;
    while (d <= end && n++ < 62) { bucket(d).allday.push(ev); d = addDays(d, 1); }
  });
  (P.dues || []).forEach((x) => bucket(x.date).dues.push(x));
  (P.deadlines || []).forEach((x) => bucket(x.date).deadlines.push(x));
  (P.pi_away || []).forEach((x) => bucket(x.date).piaway.push(x));
  (P.apple || []).forEach((x) => {
    const end = x.end_date && x.end_date >= x.date ? x.end_date : x.date;
    let d = x.date, n = 0;
    while (d <= end && n++ < 62) { bucket(d).apple.push(x); d = addDays(d, 1); }
  });
  (P.birthdays || []).forEach((b) => { if (b && b.date) bucket(b.date).bdays.push(b); });
  Object.values(byDate).forEach((B) => {
    B.occ.sort((a, b) => (a.start || "") < (b.start || "") ? -1 : 1);
    B.timed.sort((a, b) => (a.time_start || "") < (b.time_start || "") ? -1 : 1);
  });
}

/* ─── 캘린더 — 날짜를 누르면 얼굴들, 얼굴을 누르면 내용 ─── */
function renderCal() {
  const d = pd(selDate);
  $("#calMonth").textContent = t(`${d.getFullYear()}년 ${d.getMonth() + 1}월`,
                                 `${MON_EN[d.getMonth()]} ${d.getFullYear()}`);
  const strip = $("#weekStrip");
  strip.innerHTML = "";
  const today = todayStr();
  const weekStart = monStart(selDate);
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);   // 루프마다 새 변수 — 클릭 핸들러가 제 날짜를 기억한다
    const dd = pd(day);
    const B = byDate[day];
    const dots = [];
    if (B) {
      if (B.occ.length) dots.push("var(--accent)");
      if (B.allday.length || B.timed.length) {
        const c = (B.allday[0] || B.timed[0]).category;
        dots.push(`var(--cat-${CATS[c] ? c : "other"})`);
      }
      if (B.dues.length || B.deadlines.length) dots.push("var(--cat-deadline)");
    }
    const el = document.createElement("button");
    el.className = "wday" + (dd.getDay() === 0 ? " sun" : "") +
      (day === today ? " today" : "") + (day === selDate ? " sel" : "");
    el.innerHTML = `<span class="dow">${dow(dd.getDay())}</span><span class="num">${dd.getDate()}</span>
      <span class="dots">${dots.slice(0, 3).map((c) => `<i style="background:${c}"></i>`).join("")}</span>`;
    el.addEventListener("click", () => { selDate = day; renderCal(); });
    strip.appendChild(el);
  }
  renderDay();
}

function facePh(name, cls) {
  const ph = photoMap[name];
  if (ph) return `<img class="${cls}" src="data:image/jpeg;base64,${ph}" alt="">`;
  const masc = (P.mascots || []).find((m) => m.name === name);
  if (masc?.emoji) return `<span class="${cls} face-ini">${esc(masc.emoji)}</span>`;
  return `<span class="${cls} face-ini">${esc(initialsOf(name))}</span>`;
}

function personLabel(name) {
  if (LANG === "en") return name;
  if (P.pi && name === P.pi.name) return P.pi.name_ko || name;
  const m = (P.members || []).find((x) => x.name === name)
    || (P.mascots || []).find((x) => x.name === name);
  return (m && (m.name_ko || m.name)) || name;
}

/* 아젠다 줄 — 시간은 옆에, 얼굴은 작게 (PI 지시 2026-08-13) */
function agRow({ w1, w2, face, title, sub, cvar, sheet, id, dim }) {
  const tagOpen = sheet ? `<button class="agrow${dim ? " dim" : ""}" data-sheet="${sheet}" data-id="${id}"`
                        : `<div class="agrow${dim ? " dim" : ""}"`;
  return `${tagOpen} style="--c:${cvar}">
    <span class="ag-when"><b>${w1 || ""}</b><i>${w2 || ""}</i></span>
    <span class="ag-face">${facePh(face, "")}</span>
    <span class="ag-body"><span class="t">${title}</span>${sub ? `<span class="sub">${sub}</span>` : ""}</span>
  ${sheet ? "</button>" : "</div>"}`;
}

function agOcc(o, mode) {
  const done = o.completion?.status === "done";
  const me = ME?.name;
  let face = o.student || (P.pi?.name || "");
  if (mode === "my" && face === me && (o.attendees || []).length) face = o.attendees[0];
  const others = (o.attendees || []).filter((n) => n !== face)
    .map((n) => `<span class="ini">${esc(initialsOf(n))}</span>`).join("");
  const sub = [others,
    (o.external || []).length ? `<span class="ini">👤 ${o.external.length}</span>` : "",
    o.location ? `<span>📍 ${esc(o.location)}</span>` : "",
    o.moved ? `<span class="tag mv">↷</span>` : "",
    o.note ? `<span class="tag">📝</span>` : ""].filter(Boolean).join("");
  return agRow({
    w1: mode === "my" ? kdNum(o.date) : esc(o.start || ""),
    w2: mode === "my" ? esc(o.start || "") : esc(o.end || ""),
    face, cvar: "var(--accent)", sheet: "occ", id: `${esc(o.mid)}::${esc(o.occ)}`,
    dim: done || o.ended,
    title: `${done ? "✅ " : ""}${esc(o.title || t("미팅", "Meeting"))}`, sub,
  });
}

function renderDay() {
  const box = $("#dayList");
  const B = byDate[selDate];
  const today = todayStr();
  let h = `<div class="day-title">${kdate(selDate)} ${selDate === today ? `<span class="muted">· ${t("오늘", "Today")}</span>` : ""}</div>`;

  if (!inRange(selDate)) {
    box.innerHTML = h + `<div class="empty">${t("이 날짜는 담겨 있지 않아요 —<br>연구실 대시보드에서 확인하세요 🔬",
      "This date isn't included —<br>check the lab dashboard 🔬")}</div>`;
    return;
  }
  /* 사람에 안 붙는 랩 전체 행사·주인 없는 마감은 칩으로 */
  const chips = [];
  (B?.allday || []).forEach((ev) => { if (!ev.member) chips.push(catChip(ev)); });
  (B?.deadlines || []).forEach((x, i) => {
    if (!(x.people || []).length)
      chips.push(`<button class="ad-chip" style="--c:var(--cat-deadline)" data-sheet="dlc" data-id="${esc(selDate)}::${i}">
        <span>⏰</span><span class="t">${esc(dueLabel(x))}${x.title ? " — " + esc(x.title) : ""}</span></button>`);
  });
  if (chips.length) h += `<div class="allday">${chips.join("")}</div>`;

  /* 부재는 "부재:" 한 줄에 사진만 — 미팅이 주인공이다 (PI 지시 2026-08-13) */
  const piName = P.pi?.name || "PI";
  const away = new Map();   // 이름 → 그날 자리 비우는 사유가 있는 사람
  (B?.allday || []).forEach((ev) => {
    if (ev.member && KNOWN.has(ev.member)) away.set(ev.member, true);
  });
  (B?.timed || []).forEach((ev) => {
    if (ev.member && KNOWN.has(ev.member)) away.set(ev.member, true);
  });
  if ((B?.piaway || []).length || (B?.apple || []).length) away.set(piName, true);
  if (away.size) {
    h += `<div class="away-strip"><span class="away-lb">${t("부재:", "Away:")}</span>` +
      [...away.keys()].map((n) => {
        const sym = awaySym(n, selDate);
        return `<button class="aw-face" data-sheet="away" data-id="${esc(n)}" title="${esc(personLabel(n))}">
          ${facePh(n, "")}${sym ? `<span class="aw-sym">${sym}</span>` : ""}</button>`;
      }).join("") + `</div>`;
  }

  /* 마감(미해결 포함)도 사진 한 줄로 — 누르면 무슨 마감인지 (PI 지시 2026-08-13) */
  const dueFaces = new Map();
  (B?.dues || []).forEach((x) => {
    if (x.person && KNOWN.has(x.person)) dueFaces.set(x.person, true);
  });
  (B?.deadlines || []).forEach((x) =>
    (x.people || []).forEach((n) => { if (KNOWN.has(n)) dueFaces.set(n, true); }));
  if (dueFaces.size) {
    h += `<div class="away-strip"><span class="away-lb">${t("마감:", "Due:")}</span>` +
      [...dueFaces.keys()].map((n) =>
        `<button class="aw-face" data-sheet="duesp" data-id="${esc(n)}" title="${esc(personLabel(n))}">
          ${facePh(n, "")}<span class="aw-sym">⏰</span></button>`).join("") + `</div>`;
  }

  const rows = [];   // 생일은 위, 미팅은 시간순
  (B?.bdays || []).forEach((b) => {
    if (b.name && KNOWN.has(b.name)) rows.push({ t: "00:00", html: agRow({
      w1: "🎂", face: b.name, cvar: "var(--cat-holiday)",
      title: t(`${esc(personLabel(b.name))} 생일`, `${esc(personLabel(b.name))}'s birthday`) }) });
  });
  (B?.occ || []).forEach((o) => rows.push({ t: o.start || "23:59", html: agOcc(o, "day") }));
  rows.sort((a, b) => (a.t < b.t ? -1 : 1));

  h += rows.map((r) => r.html).join("");
  if (!rows.length && !away.size && !dueFaces.size && !chips.length)
    h += `<div class="empty">${t("일정이 없어요 🌿", "Nothing scheduled 🌿")}</div>`;
  box.innerHTML = h;
}

/* 마감 시트 — 얼굴을 누르면 그날 그 사람의 마감들 */
function sheetDues(name, date) {
  const B = byDate[date] || {};
  let h = `<div class="sh-photo">${facePh(name, "emoji-ph")}
    <div><div class="sh-title">${esc(personLabel(name))}</div>
    <div class="sh-sub" style="margin:0">${kdate(date)} · ${t("마감", "Due")}</div></div></div>`;
  (B.dues || []).forEach((x) => {
    if (x.person !== name) return;
    h += `<div class="pd-item" style="--c:var(--cat-deadline)">
      <div class="pd-t">⏰ ${esc(dueLabel(x))}</div>
      ${x.project ? `<div class="pd-note">${esc(x.project)}</div>` : ""}</div>`;
  });
  (B.deadlines || []).forEach((x) => {
    if (!(x.people || []).includes(name)) return;
    h += `<div class="pd-item" style="--c:var(--cat-deadline)">
      <div class="pd-t">⏰ ${esc(dueLabel(x))}${x.title ? " — " + esc(x.title) : ""}</div></div>`;
  });
  return h;
}

/* 그 사람의 그날 부재 사유 중 대표 심볼 하나 */
function awaySym(name, date) {
  const B = byDate[date];
  if (!B) return "";
  if (P.pi && name === P.pi.name && (B.piaway.length || B.apple.length)) {
    const k = B.piaway[0]?.kind;
    return B.piaway.length ? (VAC_SYM[k] || "⛔") : "🐶";
  }
  const ev = [...B.allday, ...B.timed].find((e) => e.member === name);
  return ev ? (VAC_SYM[ev.vtype] || CATS[ev.category]?.sym || "📌") : "";
}

/* 부재 시트 — 얼굴을 누르면 그날 그 사람이 왜·언제 없는지 */
function sheetAway(name, date) {
  const B = byDate[date] || {};
  let h = `<div class="sh-photo">${facePh(name, "emoji-ph")}
    <div><div class="sh-title">${esc(personLabel(name))}</div>
    <div class="sh-sub" style="margin:0">${kdate(date)} · ${t("부재", "Away")}</div></div></div>`;
  const blocks = [];
  [...(B.allday || []), ...(B.timed || [])].forEach((ev) => {
    if (ev.member !== name) return;
    const cat = CATS[ev.category] ? ev.category : "other";
    const sym = VAC_SYM[ev.vtype] || CATS[cat].sym;
    blocks.push(`<div class="pd-item" style="--c:var(--cat-${cat})">
      ${ev.time_start ? `<div class="pd-when">${esc(ev.time_start)}${ev.time_end ? "–" + esc(ev.time_end) : ""}</div>` : ""}
      <div class="pd-t">${sym} ${esc(ev.title)}</div>
      ${ev.start !== ev.end && ev.end ? `<div class="pd-sub"><span>${kdShort(ev.start)} ~ ${kdShort(ev.end)}</span></div>` : ""}
      ${ev.note ? `<div class="pd-note">${linkify(esc(ev.note))}</div>` : ""}</div>`);
  });
  if (P.pi && name === P.pi.name) {
    (B.piaway || []).forEach((x) => blocks.push(`<div class="pd-item" style="--c:var(--cat-away)">
      <div class="pd-when">${esc(x.start || "")}–${esc(x.end || "")}</div>
      <div class="pd-t">${VAC_SYM[x.kind] || "⛔"} ${t("PI 부재", "PI away")}${x.label ? ` (${esc(x.label)})` : ""}</div></div>`));
    (B.apple || []).forEach((x) => blocks.push(`<div class="pd-item" style="--c:var(--apple)">
      ${x.all_day ? "" : `<div class="pd-when">${esc(x.start || "")}–${esc(x.end || "")}</div>`}
      <div class="pd-t">🐶 ${t("PI 개인 일정", "PI personal event")}</div>
      <div class="pd-sub"><span>${t("애플 캘린더", "Apple Calendar")}</span></div></div>`));
  }
  return h + blocks.join("");
}

function catChip(ev) {
  const cat = CATS[ev.category] ? ev.category : "other";
  const sym = ev.vtype ? (VAC_SYM[ev.vtype] || "📌") : CATS[cat].sym;
  const label = ev.category_custom || (ev.vtype ? "" : t(CATS[cat].ko, CATS[cat].en));
  return `<button class="ad-chip" style="--c:var(--cat-${cat})" data-sheet="ev" data-id="${esc(ev.id || "")}">
    <span>${sym}</span><span class="t">${esc(label ? label + " · " : "")}${esc(ev.title)}</span></button>`;
}

/* 주 넘기기 — 스와이프 + 버튼 */
$("#wkPrev").addEventListener("click", () => { selDate = addDays(selDate, -7); renderCal(); });
$("#wkNext").addEventListener("click", () => { selDate = addDays(selDate, 7); renderCal(); });
$("#btnToday").addEventListener("click", () => { selDate = todayStr(); renderCal(); });
let swX = null;
$("#weekStrip").addEventListener("touchstart", (e) => { swX = e.touches[0].clientX; }, { passive: true });
$("#weekStrip").addEventListener("touchend", (e) => {
  if (swX == null) return;
  const dx = e.changedTouches[0].clientX - swX; swX = null;
  if (Math.abs(dx) > 48) { selDate = addDays(selDate, dx < 0 ? 7 : -7); renderCal(); }
}, { passive: true });

/* ─── 사람·하루 시트 ─── */
function occBlock(o) {
  const done = o.completion?.status === "done";
  const ppl = [o.student, ...(o.attendees || [])].filter(Boolean);
  let h = `<div class="pd-item" style="--c:var(--accent)">
    <div class="pd-when">${esc(o.start || "")}–${esc(o.end || "")}</div>
    <div class="pd-t">${done ? "✅ " : ""}${esc(o.title || t("미팅", "Meeting"))}${o.moved ? ` <span class="tag mv">↷ ${t("옮김", "moved")}</span>` : ""}</div>
    <div class="pd-sub">${ppl.map((n) => `<span class="ini">${esc(initialsOf(n))}</span>`).join("")}
      ${(o.external || []).length ? `<span class="ini">👤 ${o.external.map(esc).join(", ")}</span>` : ""}
      ${o.location ? `<span>📍 ${esc(o.location)}</span>` : ""}</div>`;
  if (o.moved && o.move_info?.from) {
    const f = o.move_info.from;
    h += `<div class="pd-note muted">${t(`↷ ${kdShort(f.date)} ${f.start}에서 옮겨졌어요`,
                                         `↷ moved from ${kdShort(f.date)} ${f.start}`)}</div>`;
  }
  if (o.note) h += `<div class="pd-note">${linkify(esc(o.note))}</div>`;
  return h + `</div>`;
}

/* 노트 본문 — 마크다운류 텍스트를 가볍게: 이미지는 자리표시, 표는 가로 스크롤 */
function renderNoteBody(src) {
  let s = esc(src || "");
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g,
    `<span class="img-ph">🖼 ${t("이미지 — 연구실에서", "image — view in the lab")}</span>`);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/^#{1,6}\s*(.+)$/gm, "<b>$1</b>");   // 마크다운 제목은 굵게만
  s = s.replace(/\{[a-z]+:([^}]*)\}/gi, "$1");     // {red:…} 같은 색 지정은 안속만
  s = linkify(s);
  const lines = s.split("\n");
  const out = []; let tbl = [];
  const flush = () => { if (tbl.length) { out.push(`<div class="note-tbl">${tbl.join("\n")}</div>`); tbl = []; } };
  for (const ln of lines) {
    if (/^\s*\|/.test(ln) || /\t.+\t/.test(ln)) tbl.push(ln);
    else { flush(); out.push(ln); }
  }
  flush();
  return out.join("\n");
}

function sheetNote(n, isMeeting) {
  const phase = n.phase === "pre" ? " · " + t("미팅 전", "before") : n.phase === "post" ? " · " + t("미팅 후", "after") : "";
  return `<div class="sh-title">${isMeeting ? "💬" : "📓"} ${esc(n.title || t("(제목 없음)", "(untitled)"))}</div>
    <div class="sh-sub">${esc(n.date || "")}${phase}</div>
    ${n.body ? `<div class="note-body">${renderNoteBody(n.body)}</div>`
             : `<div class="sh-body muted">${t("본문이 없어요", "No text content")}</div>`}
    <div class="sh-sec">${t("서식·이미지 원본은 연구실 대시보드에서 🔬", "Full formatting & images on the lab dashboard 🔬")}</div>`;
}

function sheetDue(x, isDl) {
  const who = (isDl ? (x.people || []) : [x.person]).filter(Boolean);
  return `<div class="sh-title">⏰ ${esc(dueLabel(x))}${isDl && x.title ? " — " + esc(x.title) : ""}</div>
    <div class="sh-sub">${kdate(x.date)}</div>
    ${!isDl && x.project ? `<div class="sh-body">${esc(x.project)}</div>` : ""}
    <div class="sh-sec">${t("담당", "Owner")}</div>
    <div class="sh-body">${who.map((n) => esc(personLabel(n))).join(", ") || "-"}</div>`;
}

/* ─── 주간 파이 — 플랜 시간을 카테고리로 (메타인지용) ─── */
const planMin = (p) => {
  if (p.all_day) return 480;                          // 종일 플랜은 8시간으로 친다
  const [sh, sm] = String(p.start || "0:0").split(":").map(Number);
  const [eh, em] = String(p.end || "0:0").split(":").map(Number);
  return Math.max(0, (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0)));
};

const MEET_SLOT = PLAN_SLOTS.findIndex((s) => s.meeting);

function meetMin(o) {
  const [sh, sm] = String(o.start || "0:0").split(":").map(Number);
  const [eh, em] = String(o.end || "0:0").split(":").map(Number);
  return Math.max(0, (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0)));
}

/* 대시보드와 같은 규칙으로 '기본 연구'를 채운다 (member.js 주간 그리드):
   평일 09:30–18:00 중 빈 시간(점심 12–13 제외)을 연구로 본다. 휴가일·주말은 제외,
   PI 개인 플랜에는 채우지 않는다. 15분 미만 자투리는 무시. */
const R_START = 9 * 60 + 30, R_END = 18 * 60, L_START = 12 * 60, L_END = 13 * 60;
const hm2m = (s) => {
  const [h, m] = String(s || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

function autoResearchMin(day, busy) {
  const merged = [];
  busy.slice().sort((a, b) => a[0] - b[0]).forEach(([s, e]) => {
    if (merged.length && s <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    } else merged.push([s, e]);
  });
  let total = 0;
  const fill = (lo, hi) => {
    let cur = lo;
    merged.forEach(([s, e]) => {
      if (s > cur && cur < hi && Math.min(s, hi) - cur >= 15) total += Math.min(s, hi) - cur;
      cur = Math.max(cur, e);
    });
    if (cur < hi && hi - cur >= 15) total += hi - cur;
  };
  fill(R_START, L_START);
  fill(L_END, R_END);
  return total;
}

function weekAgg(plans, from, to, who) {
  const mins = PLAN_SLOTS.map(() => 0);
  (plans || []).forEach((p) => {
    if (p.date < from || p.date >= to) return;
    const i = PLAN_SLOTS.findIndex((s) => s.cats.includes(p.category));
    mins[i < 0 ? PLAN_SLOTS.length - 1 : i] += planMin(p);
  });
  /* 실제 미팅 시간 — 그 사람이 주 대상이거나 참석자인 미팅
     (who 를 안 주면 나 기준이고, PI 본인은 학생 미팅 전부가 내 미팅) */
  const target = who || ME?.name;
  const allMine = !who && isPi();
  (P.occ || []).forEach((o) => {
    if (o.date < from || o.date >= to) return;
    if (!(allMine || o.student === target || (o.attendees || []).includes(target))) return;
    mins[MEET_SLOT] += meetMin(o);
  });

  /* 기본 연구 채움 — PI 본인 화면은 제외(대시보드도 PI 개인 플랜엔 안 채운다) */
  const src = who ? (ME?.personal?.mem || {})[who] : ME?.personal;
  if (src && !(!who && isPi())) {
    const RES = PLAN_SLOTS.findIndex((s) => s.cats.includes("research"));
    for (let d = from; d < to; d = addDays(d, 1)) {
      const dow = (pd(d).getDay() + 6) % 7;               // 0=월 … 6=일
      if (dow > 4) continue;                              // 주말은 자유 등록
      if ((src.vacw || []).some((v) => v.start <= d && d <= v.end)) continue;   // 휴가일
      const busy = [];
      (plans || []).forEach((p) => {
        if (p.date !== d) return;
        busy.push(p.all_day ? [0, 1440] : [hm2m(p.start), hm2m(p.end)]);
      });
      (src.cls || []).forEach((c) => {
        if (Number(c.day) === dow) busy.push([hm2m(c.start), hm2m(c.end)]);
      });
      (P.occ || []).forEach((o) => {
        if (o.date !== d) return;
        if (!(o.student === target || (o.attendees || []).includes(target))) return;
        busy.push([hm2m(o.start), hm2m(o.end)]);
      });
      mins[RES] += autoResearchMin(d, busy);
    }
  }
  return mins;
}

const hfmt = (m) => {
  const hr = m / 60;
  return (hr >= 10 || hr === Math.round(hr) ? Math.round(hr) : hr.toFixed(1)) + "h";
};

function donutSvg(mins) {
  const total = mins.reduce((a, b) => a + b, 0);
  const R = 38, C = 2 * Math.PI * R, GAP = 2;
  let seg = "", off = C / 4;                          // 12시 방향부터
  if (total > 0) {
    mins.forEach((m, i) => {
      if (!m) return;
      const len = (m / total) * C;
      seg += `<circle r="${R}" cx="60" cy="60" fill="none"
        stroke="var(${PLAN_SLOTS[i].cvar})" stroke-width="19"
        stroke-dasharray="${Math.max(len - GAP, 0.5)} ${C - Math.max(len - GAP, 0.5)}"
        stroke-dashoffset="${off}"></circle>`;
      off -= len;
    });
  } else {
    seg = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="var(--hairline)" stroke-width="19"></circle>`;
  }
  return `<svg class="donut" viewBox="0 0 120 120" role="img">${seg}
    <text x="60" y="64" text-anchor="middle" class="donut-total">${hfmt(total)}</text></svg>`;
}

function pieCard(plans, today, who) {
  /* 지난 2주 + 이번 주 — 3주를 나란히 (PI 지시 2026-08-15) */
  const thisMon = monStart(today);
  const weeks = [
    { from: addDays(thisMon, -14), to: addDays(thisMon, -7), ko: "2주 전", en: "2 wks ago" },
    { from: addDays(thisMon, -7), to: thisMon, ko: "저번 주", en: "Last week" },
    { from: thisMon, to: addDays(thisMon, 7), ko: "이번 주", en: "This week" },
  ].map((w) => ({ ...w, mins: weekAgg(plans, w.from, w.to, who) }));
  if (!weeks.some((w) => w.mins.some((m) => m))) return "";

  let s = `<div class="mem-sec">${t("주간 플랜 돌아보기", "My weeks in plans")}</div><div class="card">
    <div class="pies pies3">` +
    weeks.map((w) => `<div class="pie-box">${donutSvg(w.mins)}
      <div class="pie-lb">${t(w.ko, w.en)}</div></div>`).join("") +
    `</div><div class="pleg">`;
  PLAN_SLOTS.forEach((sl, i) => {
    if (!weeks.some((w) => w.mins[i])) return;
    s += `<div class="r"><span class="dot" style="background:var(${sl.cvar})"></span>
      <span class="nm">${sl.sym} ${t(sl.ko, sl.en)}</span>
      <span class="vals">${weeks.map((w, k) => k === weeks.length - 1
        ? `<b>${hfmt(w.mins[i])}</b>` : `${hfmt(w.mins[i])}`).join(' <span class="muted">·</span> ')}</span></div>`;
  });
  s += `</div><p class="pie-note">${t("미팅=캘린더 기록 · 평일 09:30–18:00 빈 시간은 기본 연구(대시보드와 같은 규칙)",
    "Meetings from the calendar · empty weekday 09:30–18:00 counts as research (same rule as the dashboard)")}</p></div>`;
  return s;
}

/* ─── 🙋 내 공간 — 조회 전용 ─── */
function renderMy() {
  const box = $("#myList");
  const me = ME.name;
  const my = ME.personal || {};
  const today = todayStr();
  const isPi = P.pi && me === P.pi.name;
  let h = `<div class="my-head card">
    ${facePh(me, "my-face")}
    <div><b>${esc(personLabel(me))}</b> <span class="muted">${esc(LANG === "en" ? "" : me)}</span><br>
    <span class="muted" style="font-size:12px">${isPi ? t("PI · 지도교수 🐶", "PI · Advisor 🐶") : t("내 공간 · 조회 전용", "My space · read-only")}</span></div></div>`;
  if (my.pw_default) {
    h += `<div class="my-warn">${t("🔐 아직 초기 비밀번호를 쓰고 있어요 — 연구실 대시보드에서 꼭 바꿔주세요. 비밀번호를 바꾸면 이 앱도 새 비밀번호로 다시 열립니다.",
      "🔐 You're still on the initial password — please change it on the lab dashboard. Once changed, this app opens with the new one.")}</div>`;
  }

  /* 주간 파이 — 저번 주 vs 이번 주, 어디에 시간을 썼나 */
  h += pieCard(my.plans || [], today);

  /* 내 미팅 — 학생 미팅은 전부 PI와의 미팅이므로, PI 에겐 다 보인다 */
  const upto = addDays(today, 14);
  const all = (P.occ || []).filter((o) =>
    o.date >= today && o.date <= upto &&
    (isPi || o.student === me || (o.attendees || []).includes(me)))
    .sort((a, b) => ((a.date + (a.start || "")) < (b.date + (b.start || "")) ? -1 : 1));
  const meets = all.slice(0, 12);
  h += `<div class="mem-sec">${t("다가오는 내 미팅", "My upcoming meetings")}</div>`;
  h += meets.length ? meets.map((o) => agOcc(o, "my")).join("")
    : `<div class="empty small">${t("잡힌 미팅이 없어요 🌿", "No meetings scheduled 🌿")}</div>`;
  if (all.length > meets.length)
    h += `<div class="empty small">${t(`…외 ${all.length - meets.length}건은 캘린더에서`,
                                       `…${all.length - meets.length} more in the calendar`)}</div>`;

  /* 내 마감 */
  const dues = [];
  (P.dues || []).forEach((x) => { if (x.person === me && x.date >= addDays(today, -3)) dues.push({ d: x.date, t: dueLabel(x), sub: x.project || "" }); });
  (P.deadlines || []).forEach((x) => { if ((x.people || []).includes(me) && x.date >= addDays(today, -3)) dues.push({ d: x.date, t: `${dueLabel(x)}${x.title ? " — " + x.title : ""}`, sub: "" }); });
  dues.sort((a, b) => (a.d < b.d ? -1 : 1));
  if (dues.length) {
    h += `<div class="mem-sec">${t("내 마감", "My deadlines")}</div>` + dues.map((x) =>
      `<div class="item" style="--c:var(--cat-deadline)">
        <span class="when"><span class="s">${kdNum(x.d)}</span><span class="e">⏰</span></span>
        <span class="bar"></span>
        <span class="body"><span class="t">${esc(x.t)}</span>
          ${x.sub ? `<span class="sub"><span>${esc(x.sub)}</span></span>` : ""}</span></div>`).join("");
  }

  /* 할 일 (읽기 전용) — 누르면 상세 + 내 캘린더(.ics)에 담기 */
  const todos = my.todos || [];
  if (todos.length) {
    h += `<div class="mem-sec">${t(`할 일 ${todos.length}`, `To-dos · ${todos.length}`)}</div><div class="card list">`;
    h += todos.slice(0, 10).map((td, i) => {
      const od = td.due && td.due < today;
      return `<button class="row" data-sheet="todo" data-id="${i}"><span class="row-ico">${td.author === "PI" ? "🐶" : "☐"}</span>
        <span class="row-main">${esc(td.text)}<br>
          ${td.due ? `<span class="row-sub" style="${od ? "color:var(--cat-deadline)" : ""}">⏰ ${esc(td.due)}${od ? t(" · 지남", " · overdue") : ""}</span>` : ""}</span>
        <span class="row-sub">›</span></button>`;
    }).join("");
    if (todos.length > 10) h += `<div class="row muted" style="justify-content:center">${t(`…외 ${todos.length - 10}개`, `…and ${todos.length - 10} more`)}</div>`;
    h += `</div>`;
  }

  /* 이번 주 플랜 */
  const plans = (my.plans || []).filter((p) => p.date >= today && p.date <= addDays(today, 6));
  if (plans.length) {
    h += `<div class="mem-sec">${t("이번 주 내 플랜", "My plan this week")}</div><div class="card">`;
    const byd = {};
    plans.forEach((p) => (byd[p.date] ||= []).push(p));
    Object.keys(byd).sort().forEach((d) => {
      h += `<div class="plan-day"><span class="plan-d">${kdShort(d)}</span><span class="plan-chips">`;
      h += byd[d].map((p) => {
        const pc = PCATS[p.category] || PCATS.other;
        return `<span class="plan-chip${p.done ? " done" : ""}">${pc[0]} ${p.all_day ? t("종일", "all day") : `${esc((p.start || "").slice(0, 5))}–${esc((p.end || "").slice(0, 5))}`} ${esc(p.title || t(pc[1], pc[2]))}</span>`;
      }).join("");
      h += `</span></div>`;
    });
    h += `</div>`;
  }

  /* 연구노트·미팅노트 최근 4 — 누르면 본문 */
  const noteList = (kind, title, ico, arr) => {
    if (!arr.length) return "";
    let s = `<div class="mem-sec">${title}</div><div class="card list">`;
    s += arr.map((n, i) => {
      const phase = n.phase === "pre" ? t("미팅 전", "before") : n.phase === "post" ? t("미팅 후", "after") : "";
      return `<button class="row" data-sheet="note" data-id="${kind}::${i}"><span class="row-ico">${ico}</span>
      <span class="row-main">${esc(n.title || t("(제목 없음)", "(untitled)"))}<br>
        <span class="row-sub">${esc(n.date || "")}${phase ? " · " + phase : ""}${n.body ? "" : " · " + t("본문 없음", "no text")}</span></span>
      <span class="row-sub">›</span></button>`;
    }).join("");
    return s + `</div>`;
  };
  h += noteList("r", t("내 연구노트", "My research notes"), "📓", my.notes || []);
  h += noteList("m", t("내 미팅 노트", "My meeting notes"), "💬", my.mnotes || []);

  /* 내 휴가 */
  const vacs = my.vacs || [];
  if (vacs.length) {
    h += `<div class="mem-sec">${t("다가오는 내 휴가", "My upcoming leave")}</div><div class="allday">`;
    h += vacs.map((v) => `<span class="ad-chip" style="--c:var(--cat-holiday)">
      <span>${VAC_SYM[v.type] || "🏖️"}</span><span class="t">${esc(v.start)} ~ ${esc(v.end)}</span></span>`).join("");
    h += `</div>`;
  }

  /* 🏆 연구 성과 — 맨 아래 */
  const ach = my.ach;
  if (ach) {
    const chips = [
      ach.pubs ? `📄 ${t(`논문 ${ach.pubs}`, `${ach.pubs} papers`)}` : "",
      ach.confs ? `🎤 ${t(`학회 ${ach.confs}`, `${ach.confs} talks`)}` : "",
      ach.awards ? `🏅 ${t(`수상 ${ach.awards}`, `${ach.awards} awards`)}` : "",
      ach.fellows ? `🎓 ${t(`펠로우십 ${ach.fellows}`, `${ach.fellows} fellowships`)}` : "",
    ].filter(Boolean);
    h += `<div class="mem-sec">🏆 ${t("내 연구 성과", "My achievements")}</div><div class="card">
      <div class="ach-counts">${chips.map((c) => `<span class="ad-chip"><span class="t">${c}</span></span>`).join("")}</div>`;
    (ach.recent || []).forEach((r) => {
      h += `<div class="ach-li">📄 <span>${esc(r.title || "")}
        <span class="muted">${esc([r.year, r.venue].filter(Boolean).join(" · "))}</span></span></div>`;
    });
    if (ach.updated) h += `<p class="pie-note">${t(`CV 분석 기준 ${esc(ach.updated)}`, `From CV analysis, ${esc(ach.updated)}`)}</p>`;
    h += `</div>`;
  }

  h += `<p class="more-meta">${t("수정·완료 처리는 연구실 대시보드에서 🔬", "Edit and complete things on the lab dashboard 🔬")}</p>`;
  box.innerHTML = h;
}

/* 할 일 시트 + 내 캘린더(.ics) 담기 */
function sheetTodo(td, idx) {
  const today = todayStr();
  const od = td.due && td.due < today;
  return `<div class="sh-title">${td.author === "PI" ? "🐶" : "☐"} ${esc(td.text)}</div>
    <div class="sh-sub">${td.author === "PI" ? t("PI가 준 할 일", "Assigned by PI") : t("내 할 일", "My to-do")}
      ${td.due ? ` · ⏰ ${esc(td.due)}${td.due_time ? " " + esc(td.due_time) : ""}${od ? t(" (지남)", " (overdue)") : ""}` : ""}</div>
    <button class="ics-btn" data-act="ics" data-id="${idx}">📆 ${t("내 캘린더에 추가 (.ics)", "Add to my calendar (.ics)")}</button>
    <p class="pie-note center">${t("아이폰·삼성 캘린더가 파일을 열며 일정으로 넣어줘요", "Opens in iPhone/Samsung calendar as an event")}</p>`;
}

function icsEsc(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function downloadTodoIcs(td) {
  const due = td.due || todayStr();
  const d8 = due.replace(/-/g, "");
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const uid = Math.random().toString(36).slice(2) + "@hydroai-mobile";
  const when = td.due_time
    ? `DTSTART:${d8}T${td.due_time.replace(":", "")}00\r\nDTEND:${d8}T${td.due_time.replace(":", "")}00`
    : `DTSTART;VALUE=DATE:${d8}\r\nDTEND;VALUE=DATE:${addDays(due, 1).replace(/-/g, "")}`;
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HydroAI//mobile//KO",
    "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${now}`, when,
    `SUMMARY:${icsEsc("☐ " + td.text + " (HydroAI)")}`,
    `DESCRIPTION:${icsEsc((td.author === "PI" ? "PI가 준 할 일" : "내 할 일") + " — HydroAI 모바일")}`,
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url; a.download = "hydroai-todo.ics";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest('[data-act="ics"]');
  if (!b) return;
  const td = (ME?.personal?.todos || [])[Number(b.dataset.id)];
  if (td) downloadTodoIcs(td);
});

/* ─── 🧑‍🔬 멤버 — PI 전용. 학생 개인 공간을 그대로 들여다본다 ─── */
function renderMembers() {
  const mem = ME?.personal?.mem;
  const tab = $("#tabMem");
  if (tab) tab.hidden = !(isPi() && mem);          // 학생 폰엔 탭 자체가 없다
  const box = $("#memList");
  if (!box || !mem) return;
  const names = (P.members || []).map((m) => m.name).filter((n) => mem[n]);
  let h = `<div class="my-head card"><div><b>🧑‍🔬 ${t("멤버", "Members")}</b><br>
    <span class="muted" style="font-size:12px">${t(`${names.length}명 · 얼굴을 누르면 그 학생 공간`,
      `${names.length} people · tap a face to open their space`)}</span></div></div>`;
  h += `<div class="face-grid">` + names.map((n) => {
    const m = mem[n];
    const open = (m.todos || []).filter((x) => x.due && x.due < todayStr()).length;
    return `<button class="face" data-sheet="who" data-id="${esc(n)}">
      <span class="face-ph">${facePh(n, "")}
        ${open ? `<span class="face-cnt">${open}</span>` : ""}</span>
      <span class="face-nm">${esc(personLabel(n))}</span></button>`;
  }).join("") + `</div>`;
  h += `<p class="more-meta">${t("배지 숫자 = 기한 지난 할 일 · 노트 본문은 연구실에서 🔬",
    "Badge = overdue to-dos · full notes on the lab dashboard 🔬")}</p>`;
  box.innerHTML = h;
}

/* 학생 한 명의 공간 — 주간 파이·다가오는 미팅·할 일·노트 */
function sheetWho(name) {
  const m = (ME?.personal?.mem || {})[name];
  if (!m) return "";
  const today = todayStr();
  let h = `<div class="sh-photo">${facePh(name, "emoji-ph")}
    <div><div class="sh-title">${esc(personLabel(name))}</div>
    <div class="sh-sub" style="margin:0">${esc(name)}</div></div></div>`;
  h += pieCard(m.plans || [], today, name);

  const upto = addDays(today, 14);
  const meets = (P.occ || []).filter((o) => o.date >= today && o.date <= upto
    && (o.student === name || (o.attendees || []).includes(name)))
    .sort((a, b) => ((a.date + (a.start || "")) < (b.date + (b.start || "")) ? -1 : 1)).slice(0, 6);
  h += `<div class="mem-sec">${t("다가오는 미팅", "Upcoming meetings")}</div>`;
  h += meets.length ? meets.map((o) => agOcc(o, "my")).join("")
    : `<div class="empty small">${t("없음", "None")}</div>`;

  const todos = m.todos || [];
  if (todos.length) {
    h += `<div class="mem-sec">${t(`할 일 ${todos.length}`, `To-dos · ${todos.length}`)}</div><div class="card list">`;
    h += todos.slice(0, 8).map((td) => {
      const od = td.due && td.due < today;
      return `<div class="row"><span class="row-ico">${td.author === "PI" ? "🐶" : "☐"}</span>
        <span class="row-main">${esc(td.text)}<br>
          ${td.due ? `<span class="row-sub" style="${od ? "color:var(--cat-deadline)" : ""}">⏰ ${esc(td.due)}${od ? t(" · 지남", " · overdue") : ""}</span>` : ""}</span></div>`;
    }).join("") + `</div>`;
  }
  const noteRows = (arr, ico) => arr.map((n) => `<div class="row"><span class="row-ico">${ico}</span>
    <span class="row-main">${esc(n.title || t("(제목 없음)", "(untitled)"))}<br>
      <span class="row-sub">${esc(n.date || "")}</span></span></div>`).join("");
  if ((m.notes || []).length) {
    h += `<div class="mem-sec">${t("연구노트", "Research notes")}</div>
      <div class="card list">${noteRows(m.notes, "📓")}</div>`;
  }
  if ((m.mnotes || []).length) {
    h += `<div class="mem-sec">${t("미팅 노트", "Meeting notes")}</div>
      <div class="card list">${noteRows(m.mnotes, "💬")}</div>`;
  }
  if ((m.vacs || []).length) {
    h += `<div class="mem-sec">${t("다가오는 휴가", "Upcoming leave")}</div><div class="allday">`;
    h += m.vacs.map((v) => `<span class="ad-chip" style="--c:var(--cat-holiday)">
      <span>${VAC_SYM[v.type] || "🏖️"}</span><span class="t">${esc(v.start)} ~ ${esc(v.end)}</span></span>`).join("");
    h += `</div>`;
  }
  return h;
}

/* ─── ✅ 승인 — PI 전용 탭. 학생 신청을 폰에서 바로 결재한다 ─── */
const AP_KIND = {
  req: ["📋", "미팅·일정", "Schedule"], vac: ["🏖️", "휴가·출장", "Leave"],
  todo: ["📝", "할 일 수정", "To-do edit"], plan: ["🙋", "자리 비움", "Away plan"],
  class: ["📚", "수업", "Class"], buy: ["🛒", "구매", "Purchase"],
};

function renderApprovals() {
  const rows = ME?.personal?.appr || [];
  const tab = $("#tabAp");
  if (tab) {
    tab.hidden = !isPi();                       // 학생 폰엔 탭 자체가 없다
    const bd = $("#apBadge");
    bd.hidden = !rows.length;
    bd.textContent = rows.length > 9 ? "9+" : String(rows.length);
  }
  const box = $("#apList");
  if (!box) return;
  let h = `<div class="my-head card"><div><b>✅ ${t("승인 대기", "Approvals")}</b><br>
    <span class="muted" style="font-size:12px">${rows.length
      ? t(`${rows.length}건 · 누르면 승인/거절`, `${rows.length} pending · tap to decide`)
      : t("지금은 처리할 게 없어요", "Nothing waiting")}</span></div></div>`;
  if (!rows.length) {
    h += `<div class="empty">${t("깨끗합니다 🌿", "All clear 🌿")}</div>`;
    box.innerHTML = h;
    return;
  }
  h += rows.map((r, i) => {
    /* r.t 앞에 이미 종류 이모지가 붙어 있다 — 라벨 이모지를 또 붙이지 않는다 */
    return `<div class="agrow ap" style="--c:var(--accent)" data-apid="${i}">
      <span class="ag-face">${facePh(r.w, "")}</span>
      <span class="ag-body"><span class="t">${esc(r.t)}</span>
        <span class="sub"><span>${esc(personLabel(r.w))}</span>${r.s ? `<span>${esc(r.s)}</span>` : ""}</span></span>
      <span class="ap-btns">
        <button class="ap-yes" data-act="apdo" data-id="${i}" data-ok="1">✓</button>
        <button class="ap-no" data-act="apdo" data-id="${i}" data-ok="0">✕</button>
      </span></div>`;
  }).join("");
  h += `<p class="more-meta">${t("사유를 붙이거나 되돌리려면 연구실 대시보드에서 🔬",
    "Add a note or undo on the lab dashboard 🔬")}</p>`;
  box.innerHTML = h;
}

/* ─── 🔭 과제찾기 — PI 전용 탭 (개인 블록에 grants 가 있을 때만 탭이 보인다) ─── */
let GR_OPEN = false;              // '외 N건' 을 눌러 전부 펼쳤나

function renderGrants() {
  const grants = ME?.personal?.grants || [];
  /* PI 폰엔 목록이 비어도 탭을 남긴다 — 공고를 전부 포기 처리하면 탭이 통째로 사라져
     기능이 없어진 걸로 보였다(PI 제보 2026-08-16: 대시보드에서 남은 12건을 한꺼번에
     포기로 바꾼 뒤 탭이 증발). 학생은 개인 블록에 grants 자체가 없어 여전히 안 뜬다. */
  $("#tabGr").hidden = !isPi();
  const box = $("#grList");
  if (!box || !isPi()) { if (box) box.innerHTML = ""; return; }
  if (!grants.length) {
    box.innerHTML = `<div class="my-head card"><div><b>🔭 ${t("과제찾기", "Grant finder")}</b><br>
      <span class="muted" style="font-size:12px">${t("지금 볼 공고가 없어요", "Nothing open right now")}</span></div></div>
      <div class="empty">${t("남은 공고를 전부 포기로 표시했거나 마감이 지났어요.<br>새 공고는 매일 아침 모아 옵니다 🔭",
        "Everything open was dropped or has passed its deadline.<br>New calls are collected every morning 🔭")}</div>
      <p class="more-meta">${t("되돌리기·다시 보기는 연구실 대시보드 🔭에서",
        "Undo and review on the lab dashboard 🔭")}</p>`;
    return;
  }
  const today = todayStr();
  const cap = GR_OPEN ? grants.length : 8;
  let h = `<div class="my-head card"><div><b>🔭 ${t("과제찾기", "Grant finder")}</b><br>
    <span class="muted" style="font-size:12px">${t(`연구 관련도순 · ${grants.length}건 · 조회 전용`,
      `By relevance · ${grants.length} · read-only`)}</span></div></div>`;
  h += `<div class="card list">`;
  h += grants.slice(0, cap).map((g, i) => {
    const dd = g.d ? Math.round((new Date(g.d + "T23:59:59") - new Date(today + "T12:00:00")) / 864e5) : null;
    const dtxt = dd === null ? t("마감 미상", "no due") : dd <= 0 ? t("오늘 마감", "due today") : `D-${dd}`;
    const on = g.st === "interest";
    const inner = `<span class="row-ico">${on ? "⭐" : (g.s ?? 0) >= 70 ? "✨" : "🔭"}</span>
      <span class="row-main">${esc(g.t)}<br>
        <span class="row-sub"${dd !== null && dd <= 7 ? ' style="color:var(--cat-deadline)"' : ""}>${g.s != null ? `${g.s}${t("점", "pt")} · ` : ""}${dtxt} · ${esc(g.o)}${g.r ? ` · 🔗${esc(g.r)}` : ""}</span></span>`;
    const link = g.u
      ? `<a class="gr-main" style="text-decoration:none;color:inherit" href="${esc(g.u)}" target="_blank" rel="noopener">${inner}</a>`
      : `<span class="gr-main">${inner}</span>`;
    /* ⭐관심 / ✕포기 — 웹 대시보드와 같은 상태 파일이라 여기서 누르면 /grants.html 에도 뜬다 */
    return `<div class="row gr-row">${link}
      <span class="gr-btns">
        <button class="gr-star${on ? " on" : ""}" data-act="grant" data-id="${i}" data-st="${on ? "" : "interest"}">⭐</button>
        <button class="gr-drop" data-act="grant" data-id="${i}" data-st="dropped">✕</button>
      </span></div>`;
  }).join("");
  if (grants.length > cap) {
    h += `<button class="row" id="grMore" style="justify-content:center;width:100%">
      ${t(`…외 ${grants.length - cap}건 모두 보기`, `Show ${grants.length - cap} more`)}</button>`;
  } else if (GR_OPEN && grants.length > 8) {
    h += `<button class="row" id="grMore" style="justify-content:center;width:100%">${t("접기", "Collapse")}</button>`;
  }
  h += `</div><p class="more-meta">${t("관심 체크·AI 평가는 연구실 대시보드 🔭에서", "Star & AI review on the lab dashboard 🔭")}</p>`;
  box.innerHTML = h;
  const mb = $("#grMore");
  if (mb) mb.onclick = () => { GR_OPEN = !GR_OPEN; renderGrants(); };
}

/* ─── 🖥️ 서버 — 연구실 GPU·CPU 서버가 지금 어떤가 (조회 전용) ───
   연구실 /server.html 의 '📺 전체 보기'를 폰 크기로 줄인 것 — 지금 괜찮은가 · 몇 장이 도는가
   · 누가 쓰는가 · 내 예약은 언제 끝나는가. 신청·연장·승인 같은 사무는 연구실에서.
   판정 규칙은 대시보드와 같게 맞추되, **열 플래그(therm)는 75° 위에서만** 본다 —
   스로틀 플래그가 60°대 정상 부하에도 깜빡여 거짓 경고가 쏟아진 적이 있다(PI 지시 2026-08-16). */
let SRV = null;             // PI 가 ↻ 로 방금 받아온 실측 — 있으면 발행본 대신 이걸 그린다
const srvData = () => SRV || (P && P.srv) || null;
const SEV_ICO = { ok: "🟢", warn: "🟠", bad: "🔴", maint: "🔧", none: "⚪" };
const sevLabel = (s) => ({ ok: t("안정", "OK"), warn: t("주의", "Warn"), bad: t("문제", "Problem"),
  maint: t("점검 중", "Maintenance"), none: t("확인 불가", "No data") }[s]);
const srvHm = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const srvLoad = (v) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);   // 로드는 소수 둘째까지 안 본다
const srvName = (w) => (w.n ? (LANG === "en" ? String(w.n).split(" ")[0] : personLabel(w.n)) : (w.a || "?"));

function srvHealth(s) {
  if (s.mt) return { sev: "maint", why: [s.mtn || t("점검 중이라 신청을 받지 않아요", "Not accepting requests")] };
  if (!s.ok) return s.at
    ? { sev: "bad", why: [t("서버에 접속할 수 없어요", "Can't reach the server")
        + (s.lok ? t(` · 마지막 정상 ${srvHm(s.lok)}`, ` · last OK ${srvHm(s.lok)}`) : "")] }
    : { sev: "none", why: [t("실측 연동이 없는 서버예요", "No live monitoring yet")] };
  const why = [];
  let sev = "ok";
  const bad = (m) => { sev = "bad"; why.push(m); };
  const warn = (m) => { if (sev !== "bad") sev = "warn"; why.push(m); };
  const tmp = s.tmp || 0;
  if (tmp >= 85) bad(t(`GPU ${tmp}° — 너무 뜨거워요`, `GPU ${tmp}° — too hot`));
  else if (tmp >= 75 && s.th) bad(t(`GPU ${tmp}° · 발열로 성능 저하 중`, `GPU ${tmp}° · thermal throttling`));
  else if (tmp >= 78) warn(`GPU ${tmp}°`);
  const ld = srvLoad(s.ld || 0);
  if (s.co && s.ld > s.co) bad(t(`CPU 과부하 (로드 ${ld}/${s.co})`, `CPU overloaded (${ld}/${s.co})`));
  else if (s.co && s.ld > s.co * 0.75) warn(t(`CPU 바쁨 (로드 ${ld}/${s.co})`, `CPU busy (${ld}/${s.co})`));
  const rp = s.rt ? Math.round(s.ru / s.rt * 100) : 0;
  if (rp >= 95) bad(t(`DRAM ${rp}% — 가득`, `DRAM ${rp}% — full`));
  else if (rp >= 85) warn(`DRAM ${rp}%`);
  if (s.vt && s.vu / s.vt >= 0.95) warn(t("VRAM 가득", "VRAM full"));
  if (s.ov) warn(t(`⏰ 기간 초과 ${s.ov}건`, `⏰ ${s.ov} overdue`));
  if ((s.unb || []).length) warn(t(`예약 없이 사용 ${s.unb.length}명`, `${s.unb.length} unbooked`));
  if (!why.length) why.push(t("이상 없음", "All good"));
  return { sev, why };
}

function srvFace(w) {
  if (w.n && KNOWN.has(w.n)) return facePh(w.n, "sv-face");
  /* 공용 계정(discover)은 사람을 특정할 수 없다 — 얼굴 대신 계정으로 (B200 은 전원이 이 계정) */
  return `<span class="sv-face face-ini">${w.sh ? "👥" : esc(String(w.a || "?").slice(0, 2).toUpperCase())}</span>`;
}

function srvMeters(s) {
  const meter = (ico, val, cls) => `<span class="sv-m${cls ? " " + cls : ""}">${ico} ${esc(val)}</span>`;
  const rp = s.rt ? Math.round(s.ru / s.rt * 100) : 0;
  return [
    s.tmp ? meter("🌡️", `${s.tmp}°`, s.tmp >= 85 ? "bad" : s.tmp >= 78 ? "warn" : "") : "",
    s.ut != null ? meter(s.ut >= 80 ? "🔥" : "📈", `${s.ut}%`, s.ut >= 80 ? "warn" : "") : "",
    s.co ? meter("🧠", `${srvLoad(s.ld)}/${s.co}`,
      s.ld > s.co ? "bad" : s.ld > s.co * 0.75 ? "warn" : "") : "",
    s.rt ? meter("💾", `${rp}%`, rp >= 95 ? "bad" : rp >= 85 ? "warn" : "") : "",
    s.vt ? meter("🔷", `${s.vu}/${s.vt}G`, s.vu / s.vt >= 0.95 ? "warn" : "") : "",
    s.wait ? meter("⏳", t(`대기 ${s.wait}`, `${s.wait} waiting`), "warn") : "",
  ].filter(Boolean).join("");
}

function srvCard(s) {
  const hl = srvHealth(s);
  const slots = s.gn ? `<span class="sv-slots">${Array.from({ length: s.gn }, (_, i) =>
      `<i class="${i < s.gon ? "on" : i < s.gon + s.ext ? "ext" : ""}"></i>`).join("")}</span>
      <span class="sv-gc">${s.gon}${s.ext ? `<b>+${s.ext}⚠️</b>` : ""}/${s.gn} GPU</span>` : "";
  const who = (s.who || []).map((w) => `<span class="sv-p">${srvFace(w)}
    <span class="sv-pn">${esc(srvName(w))}${w.g ? `<i>${w.g}G</i>` : w.c ? `<i>${w.c}${t("코어", "c")}</i>` : ""}</span></span>`).join("");
  return `<button class="card svc sev-${hl.sev}" data-sheet="srv" data-id="${esc(s.p)}">
    <span class="sv-h"><b>${s.ic} ${esc(s.lb)}</b>
      <span class="sv-verdict">${SEV_ICO[hl.sev]} ${esc(sevLabel(hl.sev))}</span></span>
    ${slots ? `<span class="sv-slotrow">${slots}</span>` : ""}
    ${s.ok ? `<span class="sv-ms">${srvMeters(s)}</span>` : ""}
    ${who ? `<span class="sv-who">${who}</span>` : ""}
    <span class="sv-why">${hl.why.slice(0, 2).map(esc).join(" · ")}</span></button>`;
}

/* 내 예약 — 개인 블록(각자 키)에만 들어 있다. 남의 예약은 폰에 안 담긴다. */
const SRV_ST = (st) => ({
  use: ["🟢", t("사용 중", "In use")], over: ["⏰", t("기간 초과", "Overdue")],
  soon: ["🕓", t("시작 예정", "Upcoming")], queue: ["⏳", t("대기", "Queued")],
  pend: ["🐶", t("PI 승인 대기", "Awaiting PI")],
}[st] || ["📋", st]);

function srvLeft(endIso) {
  const ms = new Date(endIso) - new Date();
  if (isNaN(ms)) return "";
  if (ms < 0) return t("기간 지남", "past due");
  const h = Math.floor(ms / 3.6e6);
  return h >= 24 ? t(`${Math.floor(h / 24)}일 ${h % 24}시간 남음`, `${Math.floor(h / 24)}d ${h % 24}h left`)
                 : t(`${h}시간 남음`, `${h}h left`);
}

function srvMineRow(r) {
  const [ico, lab] = SRV_ST(r.st);
  const res = [r.g ? `🔢 ${r.g} GPU` : "", r.v ? `🔷 ${r.v}G` : "", r.c ? `🧠 ${r.c}` : "",
    r.m ? `💾 ${r.m}G` : ""].filter(Boolean).join(" · ");
  const when = `${esc(String(r.s).replace("T", " ").slice(5))} ~ ${esc(String(r.e).replace("T", " ").slice(5))}`;
  return `<div class="agrow" style="--c:${r.st === "over" ? "var(--cat-deadline)" : "var(--accent)"}">
    <span class="ag-when"><b>${r.ic}</b><i>${ico}</i></span>
    <span class="ag-body"><span class="t">${esc(r.lb)} — ${esc(lab)}${r.bill ? " 💳" : ""}</span>
      <span class="sub"><span>${when}</span><span>${esc(srvLeft(r.e))}</span>${res ? `<span>${res}</span>` : ""}</span></span></div>`;
}

function renderServers() {
  const d = srvData();
  const mine = (ME && ME.personal && ME.personal.srv) || [];
  const tab = $("#tabSrv");
  if (tab) tab.hidden = !d;              // 아직 안 실린 발행본이면 탭 자체를 감춘다
  const box = $("#srvList");
  if (!box) return;
  if (!d) { box.innerHTML = ""; return; }
  const pools = d.pools || [];
  const gOn = pools.reduce((a, s) => a + (s.ok ? s.gon + s.ext : 0), 0);
  const gAll = pools.reduce((a, s) => a + (s.ok ? s.gn : 0), 0);
  const worst = pools.map((s) => srvHealth(s).sev);
  const nBad = worst.filter((x) => x === "bad").length;
  const nWarn = worst.filter((x) => x === "warn").length;
  const at = pools.map((s) => s.at).filter(Boolean).sort().pop() || d.at;
  let h = `<div class="my-head card"><div><b>🖥️ ${t("서버 현황", "Servers")}</b>
      ${nBad ? `<span class="sv-tag bad">🔴 ${t(`문제 ${nBad}`, `${nBad} problem`)}</span>`
        : nWarn ? `<span class="sv-tag warn">🟠 ${t(`주의 ${nWarn}`, `${nWarn} warning`)}</span>`
        : `<span class="sv-tag ok">🟢 ${t("모두 정상", "All OK")}</span>`}<br>
      <span class="muted" style="font-size:12px">${t(`GPU ${gOn}/${gAll} 가동 · ${srvHm(at)} 실측`,
        `${gOn}/${gAll} GPUs busy · measured ${srvHm(at)}`)}</span></div>
    ${rpcUrl() ? `<button class="chip-btn" data-act="srvnow">↻ ${t("지금", "Now")}</button>` : ""}</div>`;
  if (mine.length) {
    h += `<div class="mem-sec">${t("내 예약", "My bookings")}</div>` + mine.map(srvMineRow).join("");
  }
  h += `<div class="mem-sec">${t("서버", "Machines")}</div>` + pools.map(srvCard).join("");
  h += `<p class="more-meta">${t("사용 신청·연장·종료는 연구실 대시보드 🖥️에서",
    "Request, extend and release on the lab dashboard 🖥️")}</p>`;
  box.innerHTML = h;
}

function sheetSrv(pid) {
  const d = srvData();
  const s = ((d && d.pools) || []).find((x) => x.p === pid);
  if (!s) return `<div class="sh-title">🖥️</div>`;
  const hl = srvHealth(s);
  const rows = [
    s.tmp ? [t("GPU 온도", "GPU temp"), `${s.tmp}°C${s.th ? t(" · 열 스로틀 표시", " · thermal flag") : ""}`] : null,
    s.ut != null ? [t("평균 연산", "Avg util"), `${s.ut}%`] : null,
    s.vt ? ["VRAM", `${s.vu} / ${s.vt} GB`] : null,
    s.co ? [t("CPU 로드", "CPU load"), `${srvLoad(s.ld)} / ${s.co}${t("코어", " cores")}`] : null,
    s.rt ? ["DRAM", `${s.ru} / ${s.rt} GB (${Math.round(s.ru / s.rt * 100)}%)`] : null,
    s.dk ? [t("디스크", "Disk"), s.dk] : null,
    [t("예약", "Bookings"), t(`사용 ${s.on}명 · 대기 ${s.wait}명${s.ov ? ` · 초과 ${s.ov}건` : ""}`,
      `${s.on} in use · ${s.wait} waiting${s.ov ? ` · ${s.ov} overdue` : ""}`)],
  ].filter(Boolean);
  const who = (s.who || []).map((w) => `<div class="sv-jrow">${srvFace(w)}
    <span class="sv-jb"><b>${esc(srvName(w))}</b>${w.sh ? ` <span class="muted">${t("공용 계정", "shared account")}</span>` : ""}
      <span class="muted">${[w.j, w.g ? `🔷 ${w.g}G` : "", w.c ? `🧠 ${w.c}${t("코어", " cores")}` : "",
        w.bk ? "" : `⚠️ ${t("예약 없음", "no booking")}`].filter(Boolean).map(esc).join(" · ")}</span></span></div>`).join("");
  return `<div class="sh-title">${s.ic} ${esc(s.lb)}</div>
    <div class="sh-sub">${SEV_ICO[hl.sev]} ${esc(sevLabel(hl.sev))} · ${esc(hl.why.join(" · "))}
      ${s.at ? ` · ${srvHm(s.at)} ${t("실측", "measured")}` : ""}</div>
    ${s.gn ? `<div class="sv-slotrow big"><span class="sv-slots">${Array.from({ length: s.gn }, (_, i) =>
      `<i class="${i < s.gon ? "on" : i < s.gon + s.ext ? "ext" : ""}"></i>`).join("")}</span>
      <span class="sv-gc">${s.gon}${s.ext ? `<b>+${s.ext}⚠️</b>` : ""}/${s.gn} GPU</span></div>` : ""}
    <div class="sv-tbl">${rows.map(([k, v]) =>
      `<div class="sv-tr"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>
    ${who ? `<div class="sh-sec">${t("지금 쓰는 사람", "Using it now")}</div>${who}` : ""}
    <p class="pie-note center">${t("사용 신청·연장·종료는 연구실 대시보드 🖥️에서",
      "Request, extend and release on the lab dashboard 🖥️")}</p>`;
}

/* ─── 더보기 ─── */
function renderMore() {
  const isPi = P.pi && ME.name === P.pi.name;
  $("#dashList").innerHTML = DASH.map(([ico, ko, en, piOnly, view], i) => {
    if (piOnly && !isPi) return "";   // PI 전용 대시보드는 학생 목록에 아예 없다
    /* 폰에도 있는 화면(🖥️ 서버)은 "연구실에서 보세요" 대신 그 탭으로 보낸다 */
    const here = view && !document.querySelector(`#tabbar .tab[data-view="${view}"]`)?.hidden;
    return `<button class="row" ${here ? `data-act="gotab" data-view="${view}"` : `data-sheet="dash" data-id="${i}"`}>
      <span class="row-ico">${ico}</span>
      <span class="row-main">${esc(t(ko, en))} <span class="row-sub">${esc(t(en, ko))}</span></span>
      <span class="row-sub">${here ? "›" : "🔬"}</span></button>`;
  }).join("");
  const ts = new Date(P.generated).toLocaleString(LANG === "en" ? "en-US" : "ko-KR",
    { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  /* 빌드 번호를 보여준다 — 폰이 옛 화면에 갇혔는지 눈으로 바로 확인하려고 */
  const build = document.documentElement.dataset.shell || "?";
  $("#moreMeta").innerHTML = t(
    `${esc(personLabel(ME.name))}(으)로 로그인 · 데이터 기준 ${esc(ts)}<br>
     빌드 ${esc(build)} · HydroAI · GIST 수문원격탐사·인공지능 연구실`,
    `Signed in as ${esc(ME.name)} · data as of ${esc(ts)}<br>
     build ${esc(build)} · HydroAI · Hydrology & Remote-sensing AI Lab, GIST`);
}

/* ─── 시트 ─── */
const sheetWrap = $("#sheetWrap"), sheet = $("#sheet");
function openSheet(html) {
  sheet.innerHTML = html;
  sheetWrap.hidden = false;
  requestAnimationFrame(() => sheetWrap.classList.add("open"));
}
function closeSheet() {
  sheet.style.transform = "";          // 끌던 중이면 인라인 값을 지워야 CSS 애니메이션이 산다
  sheetWrap.classList.remove("open");
  setTimeout(() => { sheetWrap.hidden = true; sheet.innerHTML = ""; }, 240);
}
$("#sheetBack").addEventListener("click", closeSheet);

/* 아래로 끌어 닫기 — 없던 동작이라 시트가 제자리로 튕겨 올라갔다(PI 제보 2026-08-15).
   맨 위까지 스크롤된 상태에서 아래로 끌면 시트가 손가락을 따라오고, 90px 넘게
   내리거나 빠르게 튕기면 닫힌다. */
(() => {
  let y0 = null, dy = 0, t0 = 0, dragging = false;
  const start = (e) => {
    if (sheet.scrollTop > 0) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0; t0 = e.timeStamp; dragging = false;
    sheet.style.transition = "none";
  };
  const move = (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy <= 0) {                       // 위로 올리는 건 평소대로 스크롤
      if (dragging) { sheet.style.transform = ""; dragging = false; }
      return;
    }
    if (sheet.scrollTop > 0) { y0 = null; return; }
    dragging = true;
    if (e.cancelable) e.preventDefault();   // 스크롤 대신 시트를 끈다
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const end = (e) => {
    sheet.style.transition = "";
    if (y0 == null || !dragging) { y0 = null; return; }
    const fast = dy > 40 && (e.timeStamp - t0) < 300;
    sheet.style.transform = "";
    if (dy > 90 || fast) closeSheet();
    y0 = null; dragging = false;
  };
  sheet.addEventListener("touchstart", start, { passive: true });
  sheet.addEventListener("touchmove", move, { passive: false });
  sheet.addEventListener("touchend", end);
  sheet.addEventListener("touchcancel", end);
})();

function sheetEv(ev) {
  const cat = CATS[ev.category] ? ev.category : "other";
  const sym = ev.vtype ? (VAC_SYM[ev.vtype] || "📌") : CATS[cat].sym;
  const span = ev.start === (ev.end || ev.start) ? kdate(ev.start) : `${kdate(ev.start)} ~ ${kdate(ev.end)}`;
  let h = `<div class="sh-title">${sym} ${esc(ev.title)}</div>
    <div class="sh-sub">${esc(ev.category_custom || t(CATS[cat].ko, CATS[cat].en))} · ${span}
    ${ev.time_start ? ` · ${esc(ev.time_start)}–${esc(ev.time_end || "")}` : ""}</div>`;
  if (ev.note) h += `<div class="sh-body" style="white-space:pre-wrap">${linkify(esc(ev.note))}</div>`;
  return h;
}

function sheetDash(i) {
  const [ico, ko, en] = DASH[i];
  return `<div class="big-ico">${ico}</div>
    <div class="sh-title center">${t("연구실에서 확인하세요", "Check it in the lab")}</div>
    <div class="sh-sub center">${t(`<b>${esc(ko)}</b> (${esc(en)}) 대시보드는<br>연구실 네트워크 안에서만 열 수 있어요 🔬`,
      `The <b>${esc(en)}</b> dashboard only opens<br>on the lab network 🔬`)}</div>`;
}

/* ─── PI 쓰기 — 미팅 만들기·시간 변경·취소 (연구실 게이트웨이 RPC) ─── */
const isPi = () => !!(P && P.pi && ME && ME.name === P.pi.name);
const rpcUrl = () => (ME && ME.personal && ME.personal.rpc) || "";
let holdUntil = 0;          // 쓰기 직후엔 자동 새로고침을 잠깐 참는다(발행이 따라올 때까지)

async function rpc(body) {
  const u = rpcUrl();
  if (!u) throw new Error(t("쓰기 통로가 아직 연결 안 됐어요 — 1~2분 뒤 새로고침해 보세요",
                            "Write channel not connected yet — refresh in a minute"));
  const r = await fetch(u + "/api/mobile/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mobile-Key": localStorage.getItem(K_KEK) || "" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.detail || "HTTP " + r.status);
  return j;
}

let toastTimer = 0;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

const HH = Array.from({ length: 24 }, (_, i) => pad2(i));
/* 5분 단위 — 타임라인이 5분에 붙으므로 드롭다운도 같은 눈금이라야 값이 안 잘린다 */
const MM = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const selOpts = (arr, cur) => arr.map((v) => `<option${v === cur ? " selected" : ""}>${v}</option>`).join("");
function timeSel(id, cur) {
  const [hh, mm] = String(cur || "10:00").split(":");
  return `<span class="tsel"><select id="${id}h">${selOpts(HH, hh)}</select>:<select id="${id}m">${selOpts(MM, MM.includes(mm) ? mm : "00")}</select></span>`;
}
const tval = (id) => $("#" + id + "h").value + ":" + $("#" + id + "m").value;

let pickStu = "", pickAtt = new Set();
function sheetCreate() {
  pickStu = ""; pickAtt = new Set();
  const faces = (P.members || []).map((m) =>
    `<button class="pface" data-act="pickstu" data-name="${esc(m.name)}">
      ${facePh(m.name, "")}<span>${esc(personLabel(m.name))}</span></button>`).join("");
  return `<div class="sh-title">＋ ${t("미팅 만들기", "New meeting")}</div>
    <div class="sh-sec">${t("한 번 누르면 주 대상 ★, 다른 얼굴을 더 누르면 참석자 ✓", "First tap = main ★, more taps = attendees ✓")}</div>
    <div class="pick-row">${faces}</div>
    <div class="frm">
      <label>${t("날짜", "Date")}<input type="date" id="fDate" value="${inRange(selDate) ? selDate : todayStr()}"></label>
      <label class="inline">${t("시작", "Start")} ${timeSel("fS", "10:00")} — ${t("끝", "End")} ${timeSel("fE", "10:30")}</label>
      <label>${t("제목", "Title")}<input id="fTitle" placeholder="Meeting"></label>
      <label>${t("장소", "Location")}<input id="fLoc"></label>
      <label>${t("메모 (줌 링크 등)", "Note (zoom link…)")}<textarea id="fNote" rows="2"></textarea></label>
      <label class="inline">${t("반복", "Repeat")} <select id="fRep">
        <option value="none">${t("안 함", "None")}</option>
        <option value="weekly">${t("매주", "Weekly")}</option>
        <option value="biweekly">${t("격주", "Biweekly")}</option></select>
        ${t("까지", "until")} <input type="date" id="fUntil" class="until"></label>
    </div>
    <button class="ics-btn" data-act="mcreate">${t("만들기", "Create")}</button>
    <p class="pie-note center">${t("만들면 랩 슬랙에 새 미팅 알림이 나가요", "Posts a new-meeting notice to lab Slack")}</p>`;
}

function occRef(id) {
  const [mid, occ] = String(id).split("::");
  return (P.occ || []).find((x) => x.mid === mid && x.occ === occ);
}

/* ─── 🕐 시간 변경 = 그날 캘린더에서 끌어 옮기기 (PI 지시 2026-08-22) ───
   폰에서 시:분 드롭다운을 두 번 돌리는 것보다, 그날 일정 위에서 블록을 끌어 옮기는 게 빠르고
   무엇보다 **겹치는지가 눈에 보인다**. 끌어서 이동 · 아래 손잡이로 길이 조절 · 빈 칸을 톡 치면
   그 시각으로. 시:분 드롭다운은 아래에 그대로 두고 양방향으로 맞춘다(정밀 입력·비상용). */
const TL_SNAP = 5;                    // 5분 단위로 붙는다
const TL_PX = 1;                      // 1분 = 1px (한 시간 60px — 30분 미팅이 손가락에 잡힌다)
let mvS = 600, mvE = 630;             // 편집 중인 시작·끝 (자정부터 분)
let tlH0 = 6, tlH1 = 24;              // 화면에 그리는 시간 범위 (미팅이 밖이면 넓힌다)
let tlDate = "";                      // 타임라인이 그리고 있는 날짜
let tlSkip = "";                      // 옮기는 중인 그 미팅 (배경에 두 번 그리지 않게)

const tlMin = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const tlHm = (min) => `${pad2(Math.floor(min / 60))}:${pad2(Math.round(min) % 60)}`;
const tlTop = (min) => (min - tlH0 * 60) * TL_PX;
const tlSnap = (min) => Math.round(min / TL_SNAP) * TL_SNAP;
const tlClampS = (s) => Math.max(tlH0 * 60, Math.min(tlH1 * 60 - (mvE - mvS), s));

/* 배경 = 그날 이미 있는 것들 (다른 미팅·시간 있는 행사). 겹쳐 보이라고 반투명. */
function tlOthers(date) {
  const B = byDate[date] || {};
  const rows = [];
  (B.occ || []).forEach((o) => {
    if (`${o.mid}::${o.occ}` === tlSkip) return;
    rows.push({ s: tlMin(o.start), e: tlMin(o.end || o.start), cvar: "var(--accent)",
                who: o.student || "", txt: o.title || t("미팅", "Meeting") });
  });
  (B.timed || []).forEach((ev) => {
    const cat = CATS[ev.category] ? ev.category : "other";
    rows.push({ s: tlMin(ev.time_start), e: tlMin(ev.time_end || ev.time_start),
                cvar: `var(--cat-${cat})`, who: "", txt: `${CATS[cat].sym} ${ev.title || ""}` });
  });
  return rows.filter((r) => r.e > r.s).map((r) => {
    const top = tlTop(r.s), h = Math.max(14, (r.e - r.s) * TL_PX);
    return `<div class="tl-ev" style="top:${top}px;height:${h}px;--c:${r.cvar}">
      <span>${esc(tlHm(r.s))} ${esc(r.who ? personLabel(r.who) + " · " : "")}${esc(r.txt)}</span></div>`;
  }).join("");
}

function tlMeHtml() {
  return `<div class="tl-me" id="tlMe" style="top:${tlTop(mvS)}px;height:${Math.max(24, (mvE - mvS) * TL_PX)}px">
    <span class="tl-lb" id="tlLb">${tlHm(mvS)}–${tlHm(mvE)}</span>
    <span class="tl-grip"></span></div>`;
}

function tlGridHtml(date) {
  let h = "";
  for (let hh = tlH0; hh <= tlH1; hh++) {
    h += `<div class="tl-hour" style="top:${tlTop(hh * 60)}px"><i>${pad2(hh)}</i></div>`;
  }
  if (date === todayStr()) {          // 오늘이면 '지금' 줄 — 지난 시간에 잡는 실수를 막아준다
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    if (now >= tlH0 * 60 && now <= tlH1 * 60) h += `<div class="tl-now" style="top:${tlTop(now)}px"></div>`;
  }
  return h + tlOthers(date) + tlMeHtml();
}

/* 날짜가 바뀌거나 시각을 직접 입력했을 때 다시 그린다 */
function tlRedraw() {
  const grid = $("#tlGrid");
  if (!grid) return;
  const date = $("#fDate") ? $("#fDate").value : tlDate;
  tlDate = date;
  grid.style.height = `${(tlH1 - tlH0) * 60 * TL_PX}px`;
  grid.innerHTML = tlGridHtml(date);
  tlBindMe();
}

/* 시각 표시를 한 군데서 — 블록 라벨·머리글·시:분 드롭다운을 같은 값으로 */
function tlSync() {
  const me = $("#tlMe");
  if (me) {
    me.style.top = `${tlTop(mvS)}px`;
    me.style.height = `${Math.max(24, (mvE - mvS) * TL_PX)}px`;
    const lb = $("#tlLb");
    if (lb) lb.textContent = `${tlHm(mvS)}–${tlHm(mvE)}`;
  }
  const head = $("#tlHead");
  if (head) {
    head.textContent = `${tlHm(mvS)} – ${tlHm(mvE)} · ${t(`${mvE - mvS}분`, `${mvE - mvS} min`)}`;
  }
  ["fS", "fE"].forEach((id, i) => {                  // 아래 드롭다운도 같이 (정밀 입력용)
    const min = i === 0 ? mvS : mvE;
    const hSel = $("#" + id + "h"), mSel = $("#" + id + "m");
    if (hSel) hSel.value = pad2(Math.floor(min / 60));
    if (mSel) mSel.value = pad2(min % 60);
  });
}

/* 끌기 — 포인터 이벤트 하나로 손가락·마우스 둘 다. 블록은 touch-action:none 이라
   브라우저가 스크롤로 채가지 않는다. 타임라인 안의 터치는 시트까지 올려보내지 않는다
   (시트가 '아래로 끌어 닫기'로 오해해 같이 내려간다). */
function tlBindMe() {
  const me = $("#tlMe"), wrap = $("#tlWrap"), grid = $("#tlGrid");
  if (!me || !wrap || !grid) return;
  let mode = "", grab = 0, dur = 30, moved = false;
  const minAt = (clientY) => (clientY - grid.getBoundingClientRect().top) / TL_PX + tlH0 * 60;

  me.addEventListener("pointerdown", (e) => {
    mode = e.target.classList.contains("tl-grip") ? "size" : "move";
    dur = mvE - mvS;
    /* 잡은 지점과의 거리를 기억한다 — 손잡이는 블록 밖으로 조금 나와 있어서, 이걸 안 빼면
       손을 대는 순간 끝 시각이 10분쯤 훌쩍 뛴다. */
    grab = minAt(e.clientY) - (mode === "size" ? mvE : mvS);
    moved = false;
    me.setPointerCapture(e.pointerId);
    me.classList.add("drag");
    e.preventDefault();
  });
  me.addEventListener("pointermove", (e) => {
    if (!mode) return;
    moved = true;
    if (mode === "move") {
      mvS = tlClampS(tlSnap(minAt(e.clientY) - grab));
      mvE = mvS + dur;
    } else {
      mvE = Math.min(tlH1 * 60, Math.max(mvS + 10, tlSnap(minAt(e.clientY) - grab)));
    }
    tlSync();
    /* 가장자리에 닿으면 따라 스크롤 — 10시에서 16시로 옮기려고 손을 뗄 필요가 없게 */
    const r = wrap.getBoundingClientRect();
    if (e.clientY < r.top + 40) wrap.scrollTop -= 8;
    else if (e.clientY > r.bottom - 40) wrap.scrollTop += 8;
    e.preventDefault();
  });
  const end = () => { mode = ""; me.classList.remove("drag"); };
  me.addEventListener("pointerup", end);
  me.addEventListener("pointercancel", end);
  /* 빈 칸을 톡 치면 그 시각으로 (끌기보다 빠를 때가 많다) */
  grid.addEventListener("click", (e) => {
    if (e.target.closest(".tl-me") || moved) { moved = false; return; }
    const dur2 = mvE - mvS;
    mvS = tlClampS(tlSnap(minAt(e.clientY) - dur2 / 2));
    mvE = mvS + dur2;
    tlSync();
  });
}

function tlHtml(date) {
  return `<div class="tl-top"><b id="tlHead"></b>
      <span class="muted">${t("끌어서 옮기고, 아래 손잡이로 길이 조절",
        "Drag to move · bottom grip to resize")}</span></div>
    <div class="tl-wrap" id="tlWrap"><div class="tl-grid" id="tlGrid"
      style="height:${(tlH1 - tlH0) * 60 * TL_PX}px">${tlGridHtml(date)}</div></div>`;
}

/* 시트를 연 뒤 붙이는 것들 — 끌기 바인딩·오늘 날짜 반응·블록이 보이게 스크롤 */
function tlMount() {
  const wrap = $("#tlWrap");
  if (!wrap) return;
  tlBindMe();
  tlSync();
  wrap.scrollTop = Math.max(0, tlTop(mvS) - wrap.clientHeight / 2 + (mvE - mvS) / 2);
  ["touchstart", "touchmove"].forEach((ev) =>
    wrap.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
  const d = $("#fDate");
  if (d) d.addEventListener("change", tlRedraw);
  ["fSh", "fSm", "fEh", "fEm"].forEach((id) => {
    const el = $("#" + id);
    if (!el) return;
    el.addEventListener("change", () => {              // 드롭다운으로 고치면 블록도 따라온다
      if (id[1] === "S") {
        /* 시작을 바꾸면 **길이는 그대로** 따라 옮긴다 — 끌기와 같은 감각.
           끝을 그냥 max 로 붙들면 시작이 끝을 넘는 순간 30분짜리가 5분으로 찌부러진다. */
        const dur = Math.max(5, mvE - mvS);
        mvS = tlMin(tval("fS"));
        mvE = mvS + dur;
      } else {
        mvE = Math.max(mvS + 5, tlMin(tval("fE")));
      }
      if (mvS < tlH0 * 60 || mvE > tlH1 * 60) {        // 범위 밖이면 캘린더를 넓혀 다시 그린다
        tlH0 = Math.min(tlH0, Math.floor(mvS / 60));
        tlH1 = Math.max(tlH1, Math.ceil(mvE / 60) + 1);
        tlRedraw();
      }
      tlSync();
    });
  });
}

function sheetMove(o) {
  const rec = (o.repeat || "none") !== "none";
  /* 참석자도 여기서 고친다 — 얼굴을 눌러 ★주 대상 / ✓참석자 (PI 지시 2026-08-16).
     반복 미팅의 시간은 그 회차만 바뀌지만, 참석자는 시리즈 전체가 바뀐다(대시보드와 같음). */
  pickStu = o.student || "";
  pickAtt = new Set(o.attendees || []);
  const faces = (P.members || []).map((m) =>
    `<button class="pface${m.name === pickStu ? " stu" : ""}${pickAtt.has(m.name) ? " att" : ""}"
       data-act="pickstu" data-name="${esc(m.name)}">
      ${facePh(m.name, "")}<span>${esc(personLabel(m.name))}</span></button>`).join("");
  /* 시간은 그날 캘린더에서 끌어서 — 드롭다운은 정밀 입력용으로 아래에 남긴다 */
  mvS = tlMin(o.start);
  mvE = Math.max(mvS + 5, tlMin(o.end || o.start));
  tlH0 = Math.min(6, Math.floor(mvS / 60));
  tlH1 = Math.max(24, Math.ceil(mvE / 60) + 1);
  tlSkip = `${o.mid}::${o.occ}`;
  tlDate = o.date;
  return `<div class="sh-title">🕐 ${t("시간·참석자 변경", "Edit meeting")}</div>
    <div class="sh-sub">${esc(o.title || t("미팅", "Meeting"))} · ${kdate(o.date)} ${esc(o.start)}${rec ? ` · ${t("시간은 이 회차만", "time: this occurrence only")}` : ""}</div>
    <div class="frm"><label>${t("날짜", "Date")}<input type="date" id="fDate" value="${esc(o.date)}"></label></div>
    ${tlHtml(o.date)}
    <div class="frm">
      <label class="inline">${t("시작", "Start")} ${timeSel("fS", o.start)} — ${t("끝", "End")} ${timeSel("fE", o.end)}</label>
      <label>${t("사유 (선택 — 알림에 붙어요)", "Reason (optional, shown in Slack)")}<input id="fReason"></label>
    </div>
    <div class="sh-sec">${t("참석자 — 얼굴을 눌러 ★주 대상 / ✓참석", "People — tap for ★ main / ✓ attendee")}</div>
    <div class="pick-row">${faces}</div>
    <button class="ics-btn" data-act="mvsave" data-id="${esc(o.mid)}::${esc(o.occ)}">${t("저장", "Save")}</button>
    ${rec ? `<p class="pie-note center">${t("참석자 변경은 시리즈 전체에 적용됩니다",
      "Attendee changes apply to the whole series")}</p>` : ""}`;
}

function sheetDel(o) {
  const rec = (o.repeat || "none") !== "none";
  return `<div class="sh-title">🗑 ${t("미팅 취소", "Cancel meeting")}</div>
    <div class="sh-sub">${esc(o.title || t("미팅", "Meeting"))} · ${kdate(o.date)} ${esc(o.start)}</div>
    <div class="frm"><label>${t("사유 (선택 — 참석자 알림에 붙어요)", "Reason (optional)")}<input id="fReason"></label></div>
    ${rec ? `<button class="ics-btn" data-act="delone" data-id="${esc(o.mid)}::${esc(o.occ)}">${t("이 회차만 취소", "Skip this occurrence")}</button>
             <button class="wr-btn danger wide" data-act="delall" data-id="${esc(o.mid)}::${esc(o.occ)}">${t("시리즈 전체 삭제", "Delete whole series")}</button>`
          : `<button class="ics-btn" data-act="delall" data-id="${esc(o.mid)}::${esc(o.occ)}">${t("미팅 삭제", "Delete meeting")}</button>`}
    <p class="pie-note center">${t("참석자 개인 알림과 랩 슬랙에 취소가 공지돼요", "Attendees and lab Slack get notified")}</p>`;
}

function afterWrite(msg) {
  holdUntil = Date.now() + 150000;
  closeSheet();
  toast(msg + " · " + t("반영 1~2분", "syncs in 1–2 min"));
}

function addOccsLocal(mr) {
  const step = mr.repeat === "weekly" ? 7 : mr.repeat === "biweekly" ? 14 : 0;
  let d = mr.date, n = 0;
  for (;;) {
    if (inRange(d)) P.occ.push({ mid: mr.id, occ: d, date: d, start: mr.start, end: mr.end,
      title: mr.title, student: mr.student, attendees: mr.attendees || [],
      location: mr.location, note: mr.note, repeat: mr.repeat });
    if (!step || ++n > 30) break;
    d = addDays(d, step);
    if (d > P.range.end || (mr.until && d > mr.until)) break;
  }
  indexDates(); renderCal(); renderMy();
}

async function busyRun(btn, fn) {
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = "…";
  try { await fn(); }
  catch (e) { toast("⚠️ " + (e.message || e)); }
  finally { btn.disabled = false; btn.textContent = old; }
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || !P) return;
  const act = b.dataset.act;
  if (act === "gotab") {
    goTab(b.dataset.view);
  } else if (act === "srvnow") {
    /* 🖥️ 지금 — 발행(≤3분)을 기다리지 않고 게이트웨이에서 실측을 바로 받아온다.
       읽기 전용이라 발행도, 자동 새로고침 유예도 건드리지 않는다. */
    busyRun(b, async () => {
      const res = await rpc({ op: "server" });
      if (res && res.srv) SRV = res.srv;
      if (res && res.mine && ME && ME.personal) ME.personal.srv = res.mine;
      renderServers();
      toast("🖥️ " + t("지금 상태로 갱신했어요", "Updated to live status"));
    });
  } else if (act === "pickstu") {
    const name = b.dataset.name;
    if (!pickStu || pickStu === name) {
      pickStu = pickStu === name ? "" : name;
      pickAtt.delete(name);
    } else if (pickAtt.has(name)) pickAtt.delete(name);
    else pickAtt.add(name);
    document.querySelectorAll(".pface").forEach((f) => {
      f.classList.toggle("stu", f.dataset.name === pickStu);
      f.classList.toggle("att", pickAtt.has(f.dataset.name));
    });
  } else if (act === "mcreate") {
    if (!pickStu) { toast(t("주 대상(★)을 골라주세요", "Pick the main person ★")); return; }
    const body = { op: "create", date: $("#fDate").value, start: tval("fS"), end: tval("fE"),
      student: pickStu, attendees: [...pickAtt],
      title: $("#fTitle").value.trim() || "Meeting",
      location: $("#fLoc").value.trim(), note: $("#fNote").value.trim(),
      repeat: $("#fRep").value };
    if (body.repeat !== "none" && $("#fUntil").value) body.until = $("#fUntil").value;
    busyRun(b, async () => {
      const res = await rpc(body);
      selDate = body.date;          // 만든 날짜로 이동한 뒤 그린다
      addOccsLocal(res);
      afterWrite(t("미팅을 만들었어요", "Meeting created"));
    });
  } else if (act === "apdo") {
    const rows = ME?.personal?.appr || [];
    const r = rows[Number(b.dataset.id)];
    if (!r) return;
    const ok = b.dataset.ok === "1";
    if (!ok && !confirm(t(`거절할까요?\n${r.t} — ${personLabel(r.w)}`,
                          `Reject?\n${r.t} — ${r.w}`))) return;
    busyRun(b, async () => {
      await rpc({ op: "approve", kind: r.k, id: r.id, ok });
      rows.splice(rows.indexOf(r), 1);      // 처리한 건은 목록에서 뺀다
      renderApprovals();
      holdUntil = Date.now() + 150000;
      toast((ok ? "✅ " + t("승인했어요", "Approved") : "✕ " + t("거절했어요", "Rejected"))
            + " · " + personLabel(r.w));
    });
  } else if (act === "grant") {
    const rows = ME?.personal?.grants || [];
    const g = rows[Number(b.dataset.id)];
    if (!g) return;
    const mark = b.dataset.st;
    if (mark === "dropped" && !confirm(t(`포기로 표시할까요?\n${g.t}`, `Mark as dropped?\n${g.t}`))) return;
    busyRun(b, async () => {
      await rpc({ op: "grant", id: g.i, st: mark });
      if (mark === "dropped") rows.splice(rows.indexOf(g), 1);   // 목록에서 바로 빠진다
      else g.st = mark;
      renderGrants();
      holdUntil = Date.now() + 150000;
      toast(mark === "interest" ? "⭐ " + t("관심 표시 · AI 평가 시작", "Starred · AI review started")
            : mark === "dropped" ? "✕ " + t("포기로 표시", "Marked dropped")
            : t("표시 해제", "Unmarked"));
    });
  } else if (act === "mv") {
    const o = occRef(b.dataset.id);
    if (!o) return;
    openSheet(sheetMove(o));
    requestAnimationFrame(() => {
      tlMount();                       // 끌기 바인딩 — DOM 이 들어간 뒤라야 붙는다
      /* 얼굴 줄은 가로로 길다 — 이미 ★인 사람이 화면 밖이면 보이게 끌어온다.
         scrollIntoView 는 쓰지 않는다: 얼굴 줄이 시트 아래로 내려간 뒤로는 그걸 보이게 하려고
         **시트까지 세로로 스크롤해** 제목과 캘린더가 화면 밖으로 밀렸다. 가로로만 옮긴다. */
      const row = sheet.querySelector(".pick-row");
      const st = row && row.querySelector(".pface.stu");
      if (st) row.scrollLeft = st.offsetLeft - row.clientWidth / 2 + st.offsetWidth / 2;
    });
  } else if (act === "del") {
    const o = occRef(b.dataset.id);
    if (o) openSheet(sheetDel(o));
  } else if (act === "mvsave") {
    const o = occRef(b.dataset.id);
    if (!o) return;
    if (!pickStu) { toast(t("주 대상(★)을 골라주세요", "Pick the main person ★")); return; }
    const rec = (o.repeat || "none") !== "none";
    const att = [...pickAtt];
    /* 참석자가 바뀌었나 — 바뀌었으면 시리즈 전체(scope 없음)로 한 번 더 보낸다.
       회차 이동(scope=one)에는 참석자 필드가 안 실리기 때문(미팅 앱 규칙). */
    const same = pickStu === (o.student || "")
      && att.length === (o.attendees || []).length
      && att.every((n) => (o.attendees || []).includes(n));
    /* 시각의 정본은 타임라인 블록(mvS·mvE) — 드롭다운은 거기에 맞춰 따라다닌다 */
    const body = { op: "update", mid: o.mid, date: $("#fDate").value,
      start: tlHm(mvS), end: tlHm(mvE), move_reason: $("#fReason").value.trim() };
    if (rec) { body.scope = "one"; body.occ = o.occ; }
    else { body.student = pickStu; body.attendees = att; }
    busyRun(b, async () => {
      await rpc(body);
      if (!same && rec) {                        // 반복 미팅의 참석자는 시리즈 전체로
        await rpc({ op: "update", mid: o.mid, student: pickStu, attendees: att });
      }
      o.date = body.date; o.start = body.start; o.end = body.end; o.moved = true;
      if (!same) {
        (P.occ || []).forEach((x) => {           // 시리즈 전체 화면도 맞춰준다
          if (x.mid === o.mid) { x.student = pickStu; x.attendees = att; }
        });
      }
      indexDates(); selDate = body.date; renderCal(); renderMy();
      afterWrite(same ? t("옮겼어요", "Moved") : t("저장했어요", "Saved"));
    });
  } else if (act === "delone" || act === "delall") {
    const o = occRef(b.dataset.id);
    if (!o) return;
    const body = { op: "delete", mid: o.mid,
      reason: $("#fReason") ? $("#fReason").value.trim() : "" };
    if (act === "delone") body.occ = o.occ;
    busyRun(b, async () => {
      await rpc(body);
      P.occ = (P.occ || []).filter((x) =>
        act === "delone" ? !(x.mid === o.mid && x.occ === o.occ) : x.mid !== o.mid);
      indexDates(); renderCal(); renderMy();
      afterWrite(t("취소했어요", "Cancelled"));
    });
  }
});

$("#btnAdd").addEventListener("click", () => {
  if (!rpcUrl()) { toast(t("쓰기 통로가 아직 연결 안 됐어요 — 잠시 후 다시", "Write channel not ready yet")); return; }
  openSheet(sheetCreate());
});

/* 시트 열기 라우팅 — 목록들 위에서 이벤트 위임 */
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-sheet]");
  if (!el || !P) return;
  const id = el.dataset.id;
  switch (el.dataset.sheet) {
    case "who": openSheet(sheetWho(id)); break;
    case "away": openSheet(sheetAway(id, selDate)); break;
    case "duesp": openSheet(sheetDues(id, selDate)); break;
    case "todo": {
      const td = (ME?.personal?.todos || [])[Number(id)];
      if (td) openSheet(sheetTodo(td, Number(id)));
      break;
    }
    case "note": {
      const [kind, idx] = id.split("::");
      const arr = kind === "m" ? (ME?.personal?.mnotes || []) : (ME?.personal?.notes || []);
      const n = arr[Number(idx)];
      if (n) openSheet(sheetNote(n, kind === "m"));
      break;
    }
    case "duep": case "dlp": {
      const [date, idx] = id.split("::");
      const arr = el.dataset.sheet === "duep" ? byDate[date]?.dues : byDate[date]?.deadlines;
      const x = arr?.[Number(idx)];
      if (x) openSheet(sheetDue(x, el.dataset.sheet === "dlp"));
      break;
    }
    case "occ": {
      const [mid, occ] = id.split("::");
      const o = (P.occ || []).find((x) => x.mid === mid && x.occ === occ);
      if (!o) break;
      const piBtns = (isPi() && rpcUrl())
        ? `<div class="wr-row">
            <button class="wr-btn" data-act="mv" data-id="${esc(o.mid)}::${esc(o.occ)}">🕐 ${t("시간 변경", "Move")}</button>
            <button class="wr-btn danger" data-act="del" data-id="${esc(o.mid)}::${esc(o.occ)}">🗑 ${t("취소", "Cancel")}</button>
          </div>` : "";
      openSheet(`<div class="sh-title">${esc(o.title || t("미팅", "Meeting"))}</div>
        <div class="sh-sub">${kdate(o.date)}</div>` + occBlock(o) + piBtns);
      break;
    }
    case "ev": {
      const ev = (P.events || []).find((x) => x.id === id);
      if (ev) openSheet(sheetEv(ev));
      break;
    }
    case "dlc": {
      const [date, idx] = id.split("::");
      const x = byDate[date]?.deadlines?.[Number(idx)];
      if (x) openSheet(`<div class="sh-title">⏰ ${esc(dueLabel(x))}</div>
        <div class="sh-sub">${kdate(x.date)}</div>
        <div class="sh-body">${esc(x.title || "")}</div>`);
      break;
    }
    case "srv": openSheet(sheetSrv(id)); break;
    case "dash": openSheet(sheetDash(Number(id))); break;
  }
});

/* 다른 탭·목록에서 서버 화면으로 (☰ 더보기의 🖥️ 서버 줄) */
function goTab(view) {
  const b = document.querySelector(`#tabbar .tab[data-view="${view}"]`);
  if (b && !b.hidden) b.click();
}

/* ─── 탭 ─── */
document.querySelectorAll("#tabbar .tab").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("#tabbar .tab").forEach((x) => x.classList.toggle("on", x === b));
  ["cal", "my", "srv", "mem", "ap", "gr", "more"].forEach((v) => { $("#view-" + v).hidden = v !== b.dataset.view; });
  $("#main").scrollTop = 0;      // 스크롤은 #main 이 한다(앱 셸 구조)
}));

/* ─── 고정 문구(언어별) ─── */
function applyStaticText() {
  document.documentElement.lang = LANG;
  const tabs = [t("캘린더", "Calendar"), t("내 공간", "My space"), t("서버", "Servers"),
                t("멤버", "Members"), t("승인", "Approve"), t("과제찾기", "Grants"),
                t("더보기", "More")];
  document.querySelectorAll("#tabbar .tab-t").forEach((el, i) => { el.textContent = tabs[i]; });
  $("#btnToday").textContent = t("오늘", "Today");
  $("#btnLang").textContent = LANG === "ko" ? "EN" : "한";
  $("#moreNote").innerHTML = t(
    "모바일에서는 <b>📅 캘린더</b>와 <b>🙋 내 공간</b>(조회)만 돼요.<br>나머지 대시보드는 연구실 안에서 열려요.",
    "On mobile you get <b>📅 Calendar</b> and <b>🙋 My space</b> (read-only).<br>Everything else opens inside the lab.");
  $("#barLbl").textContent = t("아래 바 위치 (▼ 누르면 내려감)", "Bottom bar position (▼ lowers)");
  $("#toolRefresh .row-main").textContent = t("지금 새로고침", "Refresh now");
  $("#toolLang .row-main").textContent = t("English로 보기", "한국어로 보기");
  $("#toolTheme .row-main").textContent = t("밝은/어두운 테마 전환", "Toggle light/dark theme");
  $("#toolLock .row-main").textContent = t("로그아웃 (다른 사람으로)", "Sign out (switch person)");
  /* 잠금 화면 */
  $("#lockHint").textContent = pickName ? t("본인 비밀번호를 입력하세요", "Enter your password")
                                        : t("얼굴을 누르세요", "Tap your face");
  $("#lockPw").placeholder = t("대시보드 비밀번호", "Dashboard password");
  const btn = $("#lockBtn");
  if (!btn.disabled) btn.textContent = t("열기", "Open");
  $("#pwBack").textContent = t("다른 사람", "Not me");
  $("#lockNote").textContent = t("연구실 대시보드에서 쓰는 그 비밀번호예요 · 이 기기에 기억됩니다",
                                 "Same password as the lab dashboard · remembered on this device");
  $("#lockLang").textContent = LANG === "ko" ? "English" : "한국어";
}

function setLang(l) {
  LANG = l === "en" ? "en" : "ko";
  localStorage.setItem(K_LANG, LANG);
  applyStaticText();
  if (P) { renderAll(); }
  if (!$("#lock").hidden) showLock($("#lockMsg").textContent);
}
$("#btnLang").addEventListener("click", () => setLang(LANG === "ko" ? "en" : "ko"));
$("#toolLang").addEventListener("click", () => setLang(LANG === "ko" ? "en" : "ko"));
$("#lockLang").addEventListener("click", () => setLang(LANG === "ko" ? "en" : "ko"));

/* ─── 아래 바 위치 조절 — 기기마다 iOS 가 잡아두는 아래 영역이 달라 직접 내린다 ─── */
/* 최대 8px 까지만 — 더 내리면 라벨이 화면 밖으로 잘린다(앱 아래가 화면 끝이라). */
const K_DROP = "hym-bardrop", DROP_MAX = 8;
const getDrop = () => Math.max(0, Math.min(DROP_MAX, Number(localStorage.getItem(K_DROP) || 0)));
function applyDrop(v) {
  document.documentElement.style.setProperty("--bar-drop", v + "px");
  const el = $("#barVal");
  if (el) el.textContent = String(v);
}
function nudgeDrop(delta) {
  const v = Math.max(0, Math.min(DROP_MAX, getDrop() + delta));
  localStorage.setItem(K_DROP, String(v));
  applyDrop(v);
}
$("#barDown").addEventListener("click", () => nudgeDrop(2));
$("#barUp").addEventListener("click", () => nudgeDrop(-2));

/* ─── 테마 ─── */
const getTheme = () => (localStorage.getItem(K_THEME) === "light" ? "light" : "dark");
const applyTheme = (th) => {
  document.documentElement.dataset.theme = th;
  document.querySelector('meta[name="theme-color"]').content = th === "light" ? "#f0eee6" : "#1b1a17";
};
const toggleTheme = () => { const th = getTheme() === "light" ? "dark" : "light"; localStorage.setItem(K_THEME, th); applyTheme(th); };
$("#btnTheme").addEventListener("click", toggleTheme);
$("#toolTheme").addEventListener("click", toggleTheme);

/* ─── 새로고침·로그아웃 ─── */
async function refresh() {
  const btn = $("#btnRefresh");
  btn.style.opacity = ".4";
  if (await shellCheck()) return;        // ↻ 는 데이터뿐 아니라 화면(코드)도 최신으로
  let enc = null;
  try { enc = await fetchEnc(); } catch { /* 네트워크 실패 — 보던 화면 유지 */ }
  if (enc && enc.v === 2) {
    ENC = enc;
    const name = localStorage.getItem(K_NAME), kekHex = localStorage.getItem(K_KEK);
    if (name && kekHex && ENC.keyring?.[name]) {
      try {
        const { shared, personal } = await openAll(hexToBytes(kekHex).buffer, name);
        start(shared, name, personal);
      } catch {                     // 재래핑됨 = 비밀번호가 바뀌었다
        localStorage.removeItem(K_KEK);
        pickName = "";
        showLock(t("비밀번호가 바뀌었나 봐요 — 다시 로그인해 주세요",
                   "Your password seems to have changed — please sign in again"));
      }
    } else {
      localStorage.removeItem(K_KEK);
      pickName = "";
      showLock(t("다시 로그인해 주세요", "Please sign in again"));
    }
  }
  btn.style.opacity = "";
}
$("#btnRefresh").addEventListener("click", refresh);
$("#toolRefresh").addEventListener("click", refresh);
$("#toolLock").addEventListener("click", () => {
  [K_NAME, K_KEK].forEach((k) => localStorage.removeItem(k));
  location.reload();
});
document.addEventListener("visibilitychange", () => {
  if (Date.now() < holdUntil) return;   // 방금 폰에서 쓴 게 있으면 발행이 따라올 때까지 기다린다
  if (!document.hidden && P && Date.now() - lastFetch > 5 * 60e3) refresh();
});

boot();
})();
