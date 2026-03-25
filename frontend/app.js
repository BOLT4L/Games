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
let isActionLocked = false;
let resultShown = false;
let ROOM_BET_AMOUNT = 0;
const CARDS_PER_PAGE = 100;

async function loadCards(){
  const res = await fetch("cards.json");
  allCards = await res.json();
  cardIds = Object.keys(allCards);
}

loadCards();
let selectedCards = new Set();

async function fetchState() {
  try {
    const res = await fetch(`${API_BASE}/room/${ROOM_ID}/state`, {
  headers: {
    "ngrok-skip-browser-warning": "true"
  }
});

    const text = await res.text();
    console.log("RAW RESPONSE:", text);

    try {
      return JSON.parse(text);
    } catch (e) {
      console.error("❌ Not JSON:", text);
      return null;
    }

  } catch (err) {
    console.error("Fetch failed:", err);
    return null;
  }
}

// ------------------ UI RENDER ------------------
function renderCardSelection(state){

  const app = document.getElementById("app");

  const pickedCards = new Set((state.cards || []).map(c => c[0]));
  const myCard = myPickedCard;
  const start = currentPage * CARDS_PER_PAGE;
  const end = start + CARDS_PER_PAGE;

  const pageCards = cardIds.slice(start, end);

  let html = `
  <h2>Select Your Card</h2>
  <div>Countdown: ${state.countdown}</div>

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
      <div class="${className}"
        onclick="${(isPicked || myCard) ? '' : `selectCard('${cardId}')`}">
        ${cardId.replace("card","")}
      </div>
    `;
  });

  html += `</div>`;

  /* Pagination */
  html += `
  <div style="margin-top:20px;text-align:center">

    <button onclick="prevPage()" ${currentPage === 0 ? "disabled" : ""}>
      Previous
    </button>

    <span style="margin:0 10px">
      Page ${currentPage + 1} / 3
    </span>

    <button onclick="nextPage()" ${currentPage === 2 ? "disabled" : ""}>
      Next
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
      <button onclick="cancelBet('${myPickedCard}')"
        style="padding:10px 20px;background:red;color:white;border:none;border-radius:6px">
        Cancel Bet
      </button>
    `;
  } else {
    html += `
      <button onclick="placeBet('${selectedCard}','')"
        style="padding:10px 20px;background:green;color:white;border:none;border-radius:6px">
        Place Bet
      </button>
    `;
  }

  html += `</div>`;
  html += `</div>`;

  container.innerHTML = html;
}

function renderGameArena(state){

  const app = document.getElementById("app");

  const cardId = myPickedCard;

  if (!cardId || !allCards[cardId]) {
    app.innerHTML = "<h2>No card selected yet!</h2>";
    return;
  }

  const numbers = allCards[cardId];
  const lastCalled = calledNumbers[calledNumbers.length-1];
  const last = calledNumbers[calledNumbers.length-1];
    const prev = calledNumbers[calledNumbers.length-2];
    const prev2 = calledNumbers[calledNumbers.length-3];
 const oldCalled = new Set(calledNumbers.slice(0,-1));

  let html = `<h2>Game Arena</h2>`;

  html += `<div class="arena">`;

  /* ---------------- PLAYER CARD ---------------- */

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
  <button 
    onclick="callBingo([...markedCells])"
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
    BINGO
  </button>
</div>
`;

html += `</div>`;


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

  app.innerHTML = html;
}
async function renderGameInfo(state){

  const container = document.getElementById("gameInfoBar");
  const userData = await loadUser();
  const userBalance = userData ? userData.balance : 0;
  const playersCount = (state.cards || []).length;
  const pot = state.pot || 0;
  const bet = state.bet_amount || state.bet || 0;
  const roomState = state.state || "unknown";


  let html = `
    <div class="info-box"> Players: ${playersCount}</div>
    <div class="info-box"> Pot: ${pot}</div>
    <div class="info-box"> Bet: ${bet}</div>
    <div class="info-box"> Balance: ${userBalance}</div>
    <div class="info-box"> State: ${roomState}</div>
  `;

  container.innerHTML = html;
}
// ------------------ ACTIONS ------------------

async function callBingo(pattern) {
    if (isActionLocked) return;
        isActionLocked = true;
  if(hasCalledBingo){
    showPopup("You have already called BINGO this game!");
    return;
  }

  const cardId = myPickedCard;
  if(!cardId){
    showPopup("No card selected");
    return;
  }

  try {
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

    if(!res.ok){
      showPopup(data.error || "Bingo failed");
      return;
    }

    showPopup(data.message || "Bingo submitted!");
    hasCalledBingo = true; // ✅ mark that the user has called bingo

  } catch(err){
    console.error(err);
    showPopup("Network error calling bingo");
  }
}
async function placeBet(cardId){
  if (isActionLocked) return;
  isActionLocked = true;

  try {
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

  } finally {
    isActionLocked = false; // ✅ ALWAYS unlock
  }

  updateUI();
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
  updateUI();
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
let cachedUser = null;

async function loadUser(){
  if(!cachedUser){
    cachedUser = await fetchUser();
  }
  return cachedUser;
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
  if(currentPage < 2){
    currentPage++;
    updateUI();
  }
}

function prevPage(){
  if(currentPage > 0){
    currentPage--;
    updateUI();
  }
}
function selectCard(cardId){
  selectedCard = cardId;
  updateUI();
}
function toggleMark(num){

  

  if(markedCells.has(num)){
    markedCells.delete(num);
  }else{
    markedCells.add(num);
  }

  renderGameArena(currentState); // refresh UI
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
async function updateUI() {
  if (isActionLocked) return;

  const state = await fetchState();
  if (!state) return;
  currentState = state;
  renderGameInfo(state);    
  if (state.state === "ended" && !resultShown) {

  const winners = state.winners || [];
  const winnerCards = state.winner_cards || [];

  // ✅ CASE 1: USER IS WINNER
  if (winners.includes(USER_ID)) {

    let winAmount = 0;

    if (state.pot && winners.length > 0) {
      winAmount = (state.pot / winners.length).toFixed(2);
    }

    showPopup(`🎉 BINGO!\nYou won ${winAmount}`);

  } 
  // ❌ CASE 2: USER LOST
  else if (winners.length > 0) {

    let html = `<h3>😢 No Bingo</h3>`;
    html += `<div>Winning Cards:</div>`;

    winnerCards.forEach(w => {

      const cardId = typeof w === "object" ? w.card_id : w;
      const pattern = typeof w === "object" ? w.pattern : [];

      const numbers = allCards[cardId];

      if (!numbers) return;

      html += `<div style="margin-top:10px">Card ${cardId}</div>`;
      html += `<div style="display:grid;grid-template-columns:repeat(5,20px);gap:2px">`;

      numbers.forEach(n => {

        const isMarked = pattern.includes(n);

        html += `
          <div style="
            width:20px;
            height:20px;
            font-size:10px;
            display:flex;
            align-items:center;
            justify-content:center;
            background:${isMarked ? "#22c55e" : "#ccc"};
            color:black;
          ">
            ${n === 0 ? "★" : n}
          </div>
        `;
      });

      html += `</div>`;
    });

    showPopupHTML(html);

  } 
  // 😐 CASE 3: NO WINNER (house win)
  else {
    showPopup("No winners. House takes the pot.");
  }

  resultShown = true;
}
  document.getElementById("countdown").innerText =
    `Room State: ${state.state}`;
  ROOM_BET_AMOUNT = state.bet_amount || state.bet || 0;
  calledNumbers = state.drawn_numbers || [];
  // check if user already has a card
  const myCardEntry = (state.cards || []).find(c => c[1] === USER_ID);
  myPickedCard = myCardEntry ? myCardEntry[0] : null;
  if (lastRoomState && lastRoomState !== "waiting" && state.state === "waiting") {
    selectedCard = null;
    myPickedCard = null;
    selectedCards.clear();
    hasCalledBingo = false;
    markedCells.clear();
    resultShown = false;
  }
  // if already picked → show preview automatically
  if (myPickedCard) {
    selectedCard = myPickedCard;
  }

  if (state.state === "waiting" || state.state === "countdown") {
    renderCardSelection(state);
    renderSelectedCardPreview();
  } else {
    renderGameArena(state);
    const container = document.getElementById("selectedCardPreview");
    container.innerHTML = "";
  }
  lastRoomState = state.state;
}

// Poll every 2 seconds
setInterval(updateUI, 1000);

// Initial load
updateUI();
