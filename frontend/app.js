const API_BASE = "https://cicely-pedodontic-nonnegligibly.ngrok-free.dev";
const urlParams = new URLSearchParams(window.location.search);

const ROOM_ID = urlParams.get("room_id") ;
const USER_ID = urlParams.get("user_id");
let allCards = {};
let cardIds = [];
let calledNumbers = [];
let markedCells = new Set();
let selectedCard = null;
let myPickedCard = null;
let currentPage = 0;
let hasCalledBingo = false;
let currentState = null;
let resultShown = false;
let ROOM_BET_AMOUNT = 0;
let lastCards = {};
const CARDS_PER_PAGE = 100;
const LANG = {
  am: {
    select_card: "ካርድ ይምረጡ",
    countdown: "ቆጠራ",
    previous: "ቀዳሚ",
    next: "ቀጣይ",
    place_bet: "ውርርድ አስገባ",
    cancel_bet: "ውርርድ ሰርዝ",
    game_arena: "የጨዋታ መድረክ",
    bingo: "ቢንጎ",
    no_card: "ካርድ አልተመረጠም",
    players: "ተጫዋቾች",
    pot: "ገንዘብ",
    bet: "ውርርድ",
    balance: "ቀሪ ሂሳብ",
    state: "ሁኔታ",
    waiting: "መጠባበቅ",
    countdown_state: "መቆጠር",
    playing: "መጫወት",
    ended: "ተጠናቋል"
  },
  en: {
    select_card: "Select Your Card",
    countdown: "Countdown",
    previous: "Previous",
    next: "Next",
    place_bet: "Place Bet",
    cancel_bet: "Cancel Bet",
    game_arena: "Game Arena",
    bingo: "BINGO",
    no_card: "No card selected yet!",
    players: "Players",
    pot: "Pot",
    bet: "Bet",
    balance: "Balance",
    state: "State",
    waiting: "Waiting",
    countdown_state: "Countdown",
    playing: "Playing",
    ended: "Ended"
  },
  or: {
    select_card: "Kaardii Filadhu",
    countdown: "Lakkoofsa",
    previous: "Dura",
    next: "Itti Aanu",
    place_bet: "Sharata Galchi",
    cancel_bet: "Sharata Haqi",
    game_arena: "Dirree Taphaa",
    bingo: "BINGO",
    no_card: "Kaardii hin filatamne",
    players: "Taphattoota",
    pot: "Maallaqa",
    bet: "Sharata",
    balance: "Haftee",
    state: "Haala",
    waiting: "Eegaa jira",
    countdown_state: "Lakkoofsa",
    playing: "Taphachaa jira",
    ended: "Xumurameera"
  }
};
let currentLang = "am"; // default
// Add this near the top of your JS, after all variables are defined
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("card")) { 
    const cardId = e.target.dataset.id;
    if(cardId) selectCard(cardId);
  }
});
function normalizeState(state) {
  return {
    ...state,
    cards: state.cards || [],
    drawn_numbers: state.drawn_numbers || [],
    countdown: state.countdown || 0,
    state: state.state || "waiting",
    pot: state.pot || 0,
    bet_amount: state.betAmount || state.bet_amount || 0
  };
}
function t(key) {
  return LANG[currentLang][key] || key;
}
function setLang(lang) {
  currentLang = lang;
  updateGameInfo(currentState)
  handleStateUpdate(currentState)
  
}
async function loadCards(){
  const res = await fetch("cards.json");
  allCards = await res.json();
  cardIds = Object.keys(allCards);
}


let selectedCards = new Set();



// ------------------ UI RENDER ------------------
function renderCardSelection(state){

  const app = document.getElementById("app");

  const pickedCards = (state.cards || []).map(c => c[0]);
  const myCard = myPickedCard;
  const start = currentPage * CARDS_PER_PAGE;
  const end = start + CARDS_PER_PAGE;

  const pageCards = cardIds.slice(start, end);

  let html = `
  <h2>${t("select_card")}</h2>
  <div>${t("countdown")}: <span id="countdownValue">${state.countdown}</span></div>

  <div class="cards">
  `;

  pageCards.forEach(cardId => {

    const isPicked = pickedCards.includes(cardId);
    const isMine = cardId === myCard;

    let className = "card";

if(isMine) className += " my-card";
else if(isPicked) className += " disabled";
else if(selectedCard === cardId) className += " selected";

    html += `
     <div class="${className}" data-id="${cardId}">
    ${cardId.replace("card","")}
</div>
    `;
  });

  html += `</div>`;

  /* Pagination */
 html += `
<div style="margin-top:20px;text-align:center">

<button onclick="prevPage()">
  ${t("previous")}
</button>

<span style="margin:0 10px">
  Page ${currentPage + 1} / ${Math.ceil(cardIds.length / CARDS_PER_PAGE)}
</span>

<button onclick="nextPage()">
  ${t("next")}
</button>

</div>
`;

  /* Selected card preview */
 
  app.innerHTML = html;
}

function renderSelectedCardPreview(){

  const container = document.getElementById("selectedCardPreview");

  if(!selectedCard){
    container.innerHTML = "";
    return;
  }

  const numbers = allCards[selectedCard];

  let html = `
  <div class="card-preview">

  <h3>Selected Card #${selectedCard.replace("card","")}</h3>

  <div class="bingo-header">
  <div>B</div><div>I</div><div>N</div><div>G</div><div>O</div>
  </div>

  <div class="bingo-grid">
  `;

  numbers.forEach(n=>{
    html += `
      <div class="bingo-cell">
      ${n===0 ? "★" : n}
      </div>
    `;
  });

  html += `</div></div>`;
    /* ✅ BUTTONS BACK */
  html += `<div style="margin-top:15px;text-align:center">`;

  if (myPickedCard) {
    html += `
      <button id ="cancelBetBtn"
        style="padding:10px 20px;background:red;color:white;border:none;border-radius:6px">
        ${t("cancel_bet")}
      </button>
    `;
  } else {
    html += `
    <button id="placeBetBtn"style="padding:10px 20px;background:green;color:white;border:none;border-radius:6px">
        ${t("place_bet")}
      </button>
        
    `;
  }

  html += `</div>`;
  html += `</div>`;

  container.innerHTML = html;
  attachPreviewEvents();
}

function renderGameArena(state){

  const app = document.getElementById("app");

  const cardId = myPickedCard;

  if (!cardId) {
    document.getElementById("app").innerHTML = "<h2>Waiting for your card...</h2>";
    return;
  }

  if (!cardId || !allCards[cardId]) {
    app.innerHTML = `<h2>${t("no_card")}</h2>`;
    return;
  }

  const numbers = allCards[cardId];
  const lastCalled = calledNumbers[calledNumbers.length-1];
  const last = calledNumbers[calledNumbers.length-1];
    const prev = calledNumbers[calledNumbers.length-2];
    const prev2 = calledNumbers[calledNumbers.length-3];
  const oldCalled = calledNumbers.slice(0,-1);

  let html = `<h2>${t("game_arena")}</h2>`;

  html += `<div class="arena scale-2x">`;
  
  /* ---------------- PLAYER CARD ---------------- */


  /* ---------------- CALLED NUMBERS BOARD ---------------- */

 html += `<div class="called-board">`;

/* ---- DRAW HISTORY CIRCLES ---- */

html += `<div style="display:flex;justify-content:center;gap:10px;margin-bottom:10px;align-items:flex-end">`;

if(last){
  html += `
  <div style="
    width:30px;
    height:30px;
    border-radius:50%;
    background:${getBingoColor(last)};
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:12px;
    font-weight:bold;
    box-shadow:0 0 10px rgba(0,0,0,0.4);
  ">${last}</div>`;
}

if(prev){
  html += `
  <div style="
    width:22px;
    height:22px;
    border-radius:50%;
    background:${getBingoColor(prev)};
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:10px;
    font-weight:bold;
  ">${prev}</div>`;
}

if(prev2){
  html += `
  <div style="
    width:16px;
    height:16px;
    border-radius:50%;
    background:${getBingoColor(prev2)};
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:8px;
    font-weight:bold;
  ">${prev2}</div>`;
}


html += `</div>`;

  html += `
  <div class="bingo-header">
    <div>B</div>
    <div>I</div>
    <div>N</div>
    <div>G</div>
    <div>O</div>
  </div>
  `;

  html += `<div class="called-grid">`;

for(let row=1; row<=15; row++){
  for(let col=0; col<5; col++){

    const num = row + col*15;

    let cls = "called-number";

    if(num === lastCalled) cls += " called-last";
    else if(oldCalled.includes(num)) cls += " called-old";

    html += `<div class="${cls}">${num}</div>`;
  }
}

html += `</div>`;
  html += `</div>`;

  html += `<div class="player-card">`;

  html += `
  <div class="bingo-header">
    <div>B</div>
    <div>I</div>
    <div>N</div>
    <div>G</div>
    <div>O</div>
  </div>
  `;

  html += `<div class="bingo-grid">`;

  numbers.forEach(n=>{

    const isMarked = markedCells.has(n);

    html+=`
    <div 
      class="bingo-cell ${isMarked ? "marked":""}"
      onclick="toggleMark(${n})"
    >
      ${n===0 ? "★" : n}
    </div>`;
  });

  html += `</div>`;

/* ---- BINGO BUTTON ---- */

html += `
<div style="display:flex;justify-content:center;margin-top:10px">
  <button id="callBingoBtn"
    style="
      padding:10px 20px;
      font-weight:bold;
      font-size:16px;
      background:linear-gradient(135deg,#22c55e,#16a34a);
      color:white;
      border:none;
      border-radius:8px;
      cursor:pointer;
      box-shadow:0 4px 10px rgba(0,0,0,0.3);
    ">
    ${t("bingo")}
  </button>
</div>
`;

html += `</div>`;


  app.innerHTML = html;
attachArenaEvents();
}
async function renderGameInfo(state){

  const container = document.getElementById("gameInfoBar");
  const userData = await fetchUser(); // ✅ get latest balance
  const userBalance = userData ? userData.balance : 0;
  const playersCount = (state.cards || []).length;
  const pot = state.pot || 0;
  const bet = state.bet_amount || state.bet || 0;
  const roomState = state.state || "unknown";


  let html = `
<div class="info-box"> ${t("players")}: ${playersCount}</div>
<div class="info-box"> ${t("pot")}: ${pot}</div>
<div class="info-box"> ${t("bet")}: ${bet}</div>
<div class="info-box"> ${t("balance")}: ${userBalance}</div>
<div class="info-box"> ${t("state")}: ${roomState}</div>
  `;

  container.innerHTML = html;
}
// ------------------ ACTIONS ------------------

async function callBingo(pattern) {


  try {
    if (hasCalledBingo) {
      showPopup("You already called BINGO!");
      return;
    }

    const cardId = myPickedCard;
    if (!cardId) {
      showPopup("No card selected");
      return;
    }

    const res = await fetch(`${API_BASE}/room/${ROOM_ID}/bingo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: USER_ID,
        card_id: cardId,
        pattern: pattern
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showPopup(data.error || "Bingo failed");
      return;
    }

    showPopup(data.message || "Bingo submitted!");
    hasCalledBingo = true;

  } catch (err) {
    console.error(err);
    showPopup("Network error");
  } 
}
async function placeBet(cardId,bet){
  await fetch(`${API_BASE}/room/${ROOM_ID}/pick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: USER_ID,
      card_id: cardId,
      bet_amount: ROOM_BET_AMOUNT
    })
  });

  selectedCard = cardId;
  myPickedCard = cardId;
  renderSelectedCardPreview();
  if(currentState){
  renderCardSelection(currentState);
}  // ✅ ADD
  
  
}

async function cancelBet(cardId){
  await fetch(`${API_BASE}/room/${ROOM_ID}/unpick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: USER_ID,
      card_id: cardId
    })
  });

  selectedCard = null;
  myPickedCard = null;
  renderSelectedCardPreview();  // ✅ ADD
  if(currentState){
  renderCardSelection(currentState);
}
  
}
async function fetchUser() {
  try {
    const res = await fetch(`${API_BASE}/user/${USER_ID}`, {
      headers: {
        "ngrok-skip-browser-warning": "true"
      }
    });
    
    if (!res.ok) {
      console.error("User fetch failed:", res.status);
      return null;
    }

    const data = await res.json();
    return data.exists ? data : null;

  } catch (err) {
    console.error("Error fetching user:", err);
    return null;
  }
}
function attachPreviewEvents() {
  const placeBtn = document.getElementById("placeBetBtn");
  const cancelBtn = document.getElementById("cancelBetBtn");

  if (placeBtn) {
    placeBtn.addEventListener("click", () => {
      placeBet(selectedCard);
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      cancelBet(myPickedCard);
    });
  }
}
function attachArenaEvents() {
  const bingoBtn = document.getElementById("callBingoBtn");
  if (bingoBtn) {
    bingoBtn.addEventListener("click", () => {
      callBingo([...markedCells]);
    });
  }
}
// ------------------ POPUP ------------------

function showPopup(msg) {
  const popup = document.getElementById("popup");
  popup.innerText = msg;
  popup.style.display = "block";

  setTimeout(() => {
    popup.style.display = "none";
  }, 3000);
}
function showPopupHTML(html) {
  const popup = document.getElementById("popup");
  popup.innerHTML = html;
  popup.style.display = "block";

  setTimeout(() => {
    popup.style.display = "none";
  }, 5000); // longer for viewing cards
}
function nextPage(){
  const maxPage = Math.ceil(cardIds.length / CARDS_PER_PAGE) - 1;
  if(currentPage < maxPage){
    currentPage++;
    renderCardSelection(currentState);
  }
}

function prevPage(){
  if(currentPage > 0){
    currentPage--;
    renderCardSelection(currentState);
    
  }
}
function selectCard(cardId){
  selectedCard = cardId;
  renderSelectedCardPreview();
  if(currentState){
  renderCardSelection(currentState);
}
  
}
function toggleMark(num){
  if(markedCells.has(num)){
    markedCells.delete(num);
  } else {
    markedCells.add(num);
  }

  updateSingleCell(num);
}
function handleStateUpdate(state) {
  const normalized = normalizeState(state);
  currentState = normalized;

  updateGameInfo(normalized);

  const userCard = (normalized.cards || []).find(c => c[1] === USER_ID);
  myPickedCard = userCard ? userCard[0] : null;
  selectedCard = myPickedCard;

  const roomState = normalized.state;

  if (roomState === "waiting" || roomState === "countdown") {
    renderCardSelection(normalized);
    renderSelectedCardPreview();
  } else {
    renderGameArena(normalized);
  }
}
function updateCountdown(state){
  const el = document.getElementById("countdownValue");
  if(el) el.innerText = state.countdown;
}
function updateCalledNumbers(state){
  if(JSON.stringify(calledNumbers) === JSON.stringify(state.drawn_numbers)) return;

  calledNumbers = state.drawn_numbers;

  // ✅ FIX: re-render arena instead
  if(currentState.state === "playing"){
    renderGameArena(currentState);
  }
}
function updateCardSelection(state){
  const newCards = state.cards;

  if(JSON.stringify(newCards) === JSON.stringify(lastCards)) return;

  lastCards = newCards;
  renderCardSelection(state);
}
function updateGameArena(state){
  if(!myPickedCard) return;

  renderGameArena(state);
}
let lastInfo = "";

function updateGameInfo(state){
  const newInfo = JSON.stringify({
    players: state.cards?.length,
    pot: state.pot,
    bet: state.bet_amount,
    state: state.state
  });

  if(newInfo === lastInfo) return;

  lastInfo = newInfo;
  renderGameInfo(state);
}
function getBingoColor(num){

  if(num >= 1 && num <= 15) return "#3b82f6";   // B - blue
  if(num >= 16 && num <= 30) return "#22c55e";  // I - green
  if(num >= 31 && num <= 45) return "#f59e0b";  // N - orange
  if(num >= 46 && num <= 60) return "#ef4444";  // G - red
  if(num >= 61 && num <= 75) return "#a855f7";  // O - purple

  return "#999";
}

// ------------------ MAIN LOOP ------------------
let lastRoomState = null;

// Poll every 2 seconds
let socket;

function initSocket() {
  socket = io("https://cicely-pedodontic-nonnegligibly.ngrok-free.dev", {
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    console.log("✅ Connected:", socket.id);
    socket.emit("join_room", { room_id: ROOM_ID }); // join immediately
  });

  socket.on("states_update", (state) => {
    handleStateUpdate(state);    
    console.log("📡 FRONTEND RECEIVED STATE_UPDATE:", state);
  });

  socket.on("disconnect", (reason) => {
    console.log("❌ Disconnected:", reason);
  });
}
async function startApp() {
  await loadCards();   // 🔥 REQUIRED
  initSocket();        // start socket AFTER cards loaded
}

startApp();
