const API_BASE = "https://cleaner-logical-entitled-handling.trycloudflare.com";
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
let autoBetEnabled = false;
let autoBetCardId = null;
let autoBetGamesLeft = 0;
let lastProcessedNumber = null;
let autoBingoEnabled = false;
let autoBingoInterval = null;
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
    pot: "ደራሽ",
    bet: "ውርርድ",
    balance: "ቀሪ ሂሳብ",
    state: "ሁኔታ",
    waiting: "መጠባበቅ",
    countdown_state: "መቆጠር",
    playing: "መጫወት",
    ended: "ተጠናቋል",
    you_won: "አሸንፈዋል!",
    congratulations: "እንኳን ደስ አለህ! ካርድ #",
    game_over: "ጨዋታው ተጠናቋል",
    winner_cards: "አሸናፊ ካርዶች",
    auto_bet: "አውቶ ቤት",
  auto_bingo: "አውቶ ቢንጎ",

  auto_bet_on: "አውቶ ቤት አብራ",
  auto_bet_off: "አውቶ ቤት ጠፍቷል",

  auto_bingo_on: "አውቶ ቢንጎ አብራ",
  auto_bingo_off: "አውቶ ቢንጎ ጠፍቷል",
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
    ended: "Ended",
    you_won: "YOU WON!",
    congratulations: "Congratulations! You won with card #",
    game_over: "Game Over!",
    winner_cards: "Winner card(s):",
    auto_bet: "Auto Bet",
  auto_bingo: "Auto Bingo",

  auto_bet_on: "Auto Bet ON",
  auto_bet_off: "Auto Bet OFF",
  auto_bingo_on: "Auto Bingo ON",
  auto_bingo_off: "Auto Bingo OFF",


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
    ended: "Xumurameera",
    you_won: "Ati mo'atte!",
    congratulations: "Baga gammaddan! Kaardii #",
    game_over: "Tapha xumurameera",
    winner_cards: "Kaardii mo'ataa",
  auto_bet: "Ofumaan Sharata",
  auto_bingo: "Ofumaan BINGO",

  auto_bet_on: "Ofumaan Sharata Itti Jira",
auto_bet_off: "Ofumaan Sharata Dhaabbate",

auto_bingo_on: "Ofumaan BINGO Itti Jira",
auto_bingo_off: "Ofumaan BINGO Dhaabbate",
  }
};
let currentLang = "am"; // default
// Add this near the top of your JS, after all variables are defined
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("card")) {

    // 🔥 BLOCK disabled cards
    if (e.target.classList.contains("disabled") ||
        e.target.classList.contains("my-card")) {
      return;
    }

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
function getSpeechLang() {
  if (currentLang === "am") return "am-ET";
  if (currentLang === "or") return "om-ET";
  return "en-US";
}
function setLang(lang) {
  currentLang = lang;
  handleStateUpdate(currentState)
  
}
async function loadCards(){
  const res = await fetch("cards.json");
  allCards = await res.json();
  cardIds = Object.keys(allCards);
}
function numberToAmharic(num) {
  const ones = [
    "", "አንድ", "ሁለት", "ሶስት", "አራት",
    "አምስት", "ስድስት", "ሰባት", "ስምንት", "ዘጠኝ"
  ];

  const tens = [
    "", "አስር", "ሃያ", "ሰላሳ", "አርባ",
    "ሃምሳ", "ስድሳ", "ሰባ", "ሰማንያ", "ዘጠና"
  ];

  if (num === 0) return "ዜሮ";
  if (num < 10) return ones[num];
  if (num === 10) return "አስር";

  if (num < 100) {
    const t = Math.floor(num / 10);
    const o = num % 10;

    if (o === 0) return tens[t];
    return `${tens[t]} ${ones[o]}`;
  }

  return num.toString(); // fallback
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
   if(currentState && currentState.state === "playing"){
    return;
  }

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
    <div style="
      display:flex;
      justify-content:center;
      gap:10px;
      margin-top:10px;
    ">
      <button id="cancelBetBtn"
        style="
          padding:10px 20px;
          background:red;
          color:white;
          border:none;
          border-radius:6px;
        ">
        ${t("cancel_bet")}
      </button>

      <button id="autoBetBtn"
        class="auto-btn ${autoBetEnabled ? "on" : "off"}"
        onclick="toggleAutoBetforpreview()"
        style="
          padding:10px 20px;
          border:none;
          border-radius:6px;
        ">
        ${autoBetEnabled ? "🟢" : "⚪"} 
        ${autoBetEnabled ? t("auto_bet_on") : t("auto_bet_off")}
      </button>
    </div>
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

let arenaInitialized = false;

function renderGameArena(state){

  const app = document.getElementById("app");

  

  // 🔥 ONLY render base ONCE
  if (!arenaInitialized) {

    app.innerHTML = `
      <h2>${t("game_arena")}</h2>

      <div class="arena scale-2x">
        <div id="calledBoard"></div>
        <div id="playerCard"></div>
      </div>
     

      
    `;

    renderPlayerCard();     // 🔥 render ONCE
    updateCalledBoard();    // 🔥 initial board

    attachArenaEvents();

    arenaInitialized = true;
  }
}
function saveAutoState() {
  const data = {
    autoBetEnabled,
    autoBetCardId,
    autoBetGamesLeft,
    autoBingoEnabled
  };

  localStorage.setItem("bingo_auto_state", JSON.stringify(data));
}

function loadAutoState() {
  const data = localStorage.getItem("bingo_auto_state");
  if (!data) return;

  try {
    const parsed = JSON.parse(data);

    autoBetEnabled = parsed.autoBetEnabled || false;
    autoBetCardId = parsed.autoBetCardId || null;
    autoBetGamesLeft = parsed.autoBetGamesLeft || 0;
    autoBingoEnabled = parsed.autoBingoEnabled || false;

  } catch (e) {
    console.error("Failed to load auto state", e);
  }
}
async function hasEnoughBalance() {
  const userData = await fetchUser();
  if (!userData) return false;

  return userData.balance >= ROOM_BET_AMOUNT;
}
function toggleAutoBet(){
  if(!selectedCard){
    showPopup(t("select_card_first"));
    return;
  }

  autoBetEnabled = !autoBetEnabled;

 if(autoBetEnabled){
    autoBetGamesLeft = 5;

    // ✅ store current selected card
    autoBetCardId = selectedCard;

    showPopup("Auto Bet ON");
  } else {
    autoBetGamesLeft = 0;
    autoBetCardId = null; // reset
    showPopup("Auto Bet OFF");
  }
  saveAutoState();
  renderPlayerCard(); // ✅ re-render button text
}
function toggleAutoBetforpreview(){
  if(!selectedCard){
    showPopup(t("select_card_first"));
    return;
  }

  autoBetEnabled = !autoBetEnabled;

 if(autoBetEnabled){
    autoBetGamesLeft = 5;

    // ✅ store current selected card
    autoBetCardId = selectedCard;

    showPopup("Auto Bet ON");
  } else {
    autoBetGamesLeft = 0;
    autoBetCardId = null; // reset
    showPopup("Auto Bet OFF");
  }
  saveAutoState();
  renderSelectedCardPreview(); // ✅ re-render button text
}
function toggleAutoBingo(){
  if(!myPickedCard){
    showPopup("Select a card first");
    return;
  }

  autoBingoEnabled = !autoBingoEnabled;

  if(autoBingoEnabled){
    startAutoBingoWatcher();
    showPopup("Auto Bingo ON");
  } else {
    stopAutoBingoWatcher();
    showPopup("Auto Bingo OFF");
  }
  saveAutoState();
  renderPlayerCard();
}
function startAutoBingoWatcher(){
 console.log("Starting Auto Bingo Watcher");

  if(autoBingoInterval) return;
  if(autoBingoInterval) clearInterval(autoBingoInterval);

  autoBingoInterval = setInterval(() => {

    if(!autoBingoEnabled || !selectedCard || !currentState) return;
    if(currentState.state !== "playing") return;

    const numbers = allCards[selectedCard];
    if(!numbers) return;

    // ✅ ensure center is always marked
    if (numbers.includes(0) && !markedCells.has(0)) {
      markedCells.add(0);
      updateSingleCell(0);
    }

    const drawn = currentState.drawn_numbers;

    // ✅ FIX: mark ALL drawn numbers (important if auto starts late)
    drawn.forEach(num => {
      if(numbers.includes(num) && !markedCells.has(num)){
        toggleMark(num);
      }
    });

    // OPTIONAL optimization (not required anymore)
    const latestNumber = drawn[drawn.length - 1];
    if(latestNumber && latestNumber !== lastProcessedNumber){
      lastProcessedNumber = latestNumber;
    }

    // ✅ check win AFTER marking everything
    const hasWin = checkWin(numbers, markedCells);

    if(hasWin && !hasCalledBingo){
      socket.emit("bingo", {
        room_id: ROOM_ID,
        user_id: USER_ID,
        card_id: selectedCard,
        pattern: [...markedCells]
      });

      hasCalledBingo = true;
      showPopup("Auto Bingo Called!");
    }

  }, 500);

}

function stopAutoBingoWatcher(){
  console.log("Stopping Auto Bingo Watcher");
  if(autoBingoInterval){
    clearInterval(autoBingoInterval);
    autoBingoInterval = null;
  }
}
function checkWin(card, drawnNumbers) {
  const marked = new Set(drawnNumbers);

  const rows = [
    [card[0], card[1], card[2], card[3], card[4]],
    [card[5], card[6], card[7], card[8], card[9]],
    [card[10], card[11], card[12], card[13], card[14]],
    [card[15], card[16], card[17], card[18], card[19]],
    [card[20], card[21], card[22], card[23], card[24]],
  ];

  for (let row of rows) {
    if (row.every(n => marked.has(n))) return row;
  }

  const cols = [
    [card[0], card[5], card[10], card[15], card[20]],
    [card[1], card[6], card[11], card[16], card[21]],
    [card[2], card[7], card[12], card[17], card[22]],
    [card[3], card[8], card[13], card[18], card[23]],
    [card[4], card[9], card[14], card[19], card[24]],
  ];

  for (let col of cols) {
    if (col.every(n => marked.has(n))) return col;
  }

  const diag1 = [card[0], card[6], card[12], card[18], card[24]];
  const diag2 = [card[4], card[8], card[12], card[16], card[20]];

  if (diag1.every(n => marked.has(n))) return diag1;
  if (diag2.every(n => marked.has(n))) return diag2;

  const corners = [card[0], card[4], card[20], card[24]];
  if (corners.every(n => marked.has(n))) return corners;

  return null;
}
function renderPlayerCard(){

  const container = document.getElementById("playerCard");

  const numbers = allCards[myPickedCard];
  const cardId = myPickedCard;

  if (!cardId) {
    container.innerHTML = "<h2>Waiting for your card...</h2>";
    return;
  }

  if (!allCards[cardId]) {
    container.innerHTML = `<h2>${t("no_card")}</h2>`;
    return;
  }

  let html = `
    <div class="player-card">
      <div class="bingo-header">
        <div>B</div><div>I</div><div>N</div><div>G</div><div>O</div>
      </div>

      <div class="bingo-grid">
  `;

  numbers.forEach(n=>{
    html += `
      <div 
        class="bingo-cell ${markedCells.has(n) ? "marked":""}"
        data-num="${n}"
        onclick="toggleMark(${n})"
      >
        ${n===0 ? "★" : n}
      </div>
    `;
  });

  html += `</div>
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
      <div class="auto-controls">

  <button 
    class="auto-btn ${autoBetEnabled ? "on" : "off"}"
    onclick="toggleAutoBet()"
  >
    ${autoBetEnabled ? "🟢" : "⚪"} 
    ${autoBetEnabled ? t("auto_bet_on") : t("auto_bet_off")}
  </button>

  <button 
    class="auto-btn ${autoBingoEnabled ? "on" : "off"}"
    onclick="toggleAutoBingo()"
  >
    ${autoBingoEnabled ? "🟢" : "⚪"} 
    ${autoBingoEnabled ? t("auto_bingo_on") : t("auto_bingo_off")}
  </button>

</div></div>`;

  container.innerHTML = html;
}
function updateCalledBoard(){

 const container = document.getElementById("calledBoard");
  
  if(!container) {
    // If we are playing but board is missing, force re-init
    if(currentState && currentState.state === "playing") {
        arenaInitialized = false; 
        renderGameArena(currentState);
    }
    return;
  }

  const last = calledNumbers[calledNumbers.length-1];
  const prev = calledNumbers[calledNumbers.length-2];
  const prev2 = calledNumbers[calledNumbers.length-3];
  const oldCalled = calledNumbers.slice(0,-1);

  let html = `<div class="called-board">`;

  // ---- circles ----
  html += `<div style="display:flex;justify-content:center;gap:10px;margin-bottom:10px;align-items:flex-end">`;

  if(last){
    html += `<div style="width:30px;height:30px;border-radius:50%;background:${getBingoColor(last)};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;">${last}</div>`;
  }

  if(prev){
    html += `<div style="width:22px;height:22px;border-radius:50%;background:${getBingoColor(prev)};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;">${prev}</div>`;
  }

  if(prev2){
    html += `<div style="width:16px;height:16px;border-radius:50%;background:${getBingoColor(prev2)};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;">${prev2}</div>`;
  }

  html += `</div>`;

  // ---- grid ----
  html += `
    <div class="bingo-header">
      <div>B</div><div>I</div><div>N</div><div>G</div><div>O</div>
    </div>
    <div class="called-grid">
  `;

  for(let row=1; row<=15; row++){
    for(let col=0; col<5; col++){

      const num = row + col*15;

      let cls = "called-number";

      if(num === last) cls += " called-last";
      else if(oldCalled.includes(num)) cls += " called-old";

      html += `<div class="${cls}">${num}</div>`;
    }
  }

  html += `</div></div>`;

  container.innerHTML = html;
}
async function renderGameInfo(state){

  const container = document.getElementById("gameInfoBar");
  const userData = await fetchUser(); // ✅ get latest balance
  const userBalance = userData ? userData.balance : 0;
  const playersCount = (state.cards || []).length;
  const pot = state.pot || Number(playersCount * state.bet_amount * 0.8)||  0;
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

function callBingo(pattern) {
  if (hasCalledBingo) {
    showPopup("You already called BINGO!");
    return;
  }

  if (!myPickedCard) {
    showPopup("No card selected");
    return;
  }

  socket.emit("bingo", {
    room_id: ROOM_ID,
    user_id: USER_ID,
    card_id: myPickedCard,
    pattern: pattern
  });
  
}

// Listen for server response

function placeBet(cardId) {
  socket.emit("pick", {
    room_id: ROOM_ID,
    user_id: USER_ID,
    card_id: cardId,
    bet_amount: ROOM_BET_AMOUNT
  });

 

  renderSelectedCardPreview();
  if (currentState) renderCardSelection(currentState);
}

function cancelBet(cardId) {
  socket.emit("unpick", {
    room_id: ROOM_ID,
    user_id: USER_ID,
    card_id: cardId
  });

  selectedCard = null;
  myPickedCard = null;

  renderSelectedCardPreview();
  if (currentState) renderCardSelection(currentState);
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
function clearPreview(){
  const container = document.getElementById("selectedCardPreview");
  if(container){
    container.innerHTML = "";
  
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
function getBingoLetter(num) {
  if (num <= 15) return "B";
  if (num <= 30) return "I";
  if (num <= 45) return "N";
  if (num <= 60) return "G";
  return "O";
}
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
function showWinnerPopup(winnerCard) {
  const popup = document.getElementById("popup");
  
  popup.innerHTML = `
    <div style="
      padding:20px; 
      background: linear-gradient(135deg, #22c55e, #16a34a); 
      color:white; 
      border-radius:12px; 
      text-align:center;
      box-shadow:0 4px 15px rgba(0,0,0,0.4);
      animation: popIn 0.5s ease-out;
    ">
     <h2>🎉 ${t("you_won")} 🎉</h2>
    <p>${t("congratulations")} ${winnerCard.card_id.replace("card","")}</p>
      <div id="winnerCardContainer"></div>
    </div>
  `;

  renderHighlightedCard(winnerCard.card_id, winnerCard.pattern, "winnerCardContainer", true);

  popup.style.display = "block";

  setTimeout(() => { popup.style.display = "none"; }, 4000);
}
function showLoserPopup(winnerCards) {
  const popup = document.getElementById("popup");

  let html = `
    <div style="
      padding:20px; 
      background:#1e40af; 
      color:white; 
      border-radius:12px; 
      text-align:center;
      box-shadow:0 4px 15px rgba(0,0,0,0.4);
      max-height:80vh;
      overflow-y:auto;
    ">
      <h2>${t("game_over")}</h2>
      <p>${t("winner_cards")}</p>

      <div style="
        display:flex;
        flex-wrap:wrap;
        justify-content:center;
        gap:20px;
        margin-top:15px;
      ">
  `;

  winnerCards.forEach((w, index) => {
    html += `
      <div style="
        background:white;
        color:black;
        padding:10px;
        border-radius:10px;
        min-width:160px;
      ">
        <div style="margin-bottom:5px;font-weight:bold">
          ${w.username || w.user_id}
        </div>
        <div style="font-size:12px;margin-bottom:5px">
          Card #${w.card_id.replace("card","")}
        </div>

        <div id="loserCard_${index}"></div>
      </div>
    `;
  });

  html += `</div></div>`;

  popup.innerHTML = html;
  popup.style.display = "block";

  // render cards AFTER DOM is ready
  setTimeout(() => {
    winnerCards.forEach((w, index) => {
      renderHighlightedCard(w.card_id, w.pattern, `loserCard_${index}`, false);
    });
  }, 50);

  // ⏳ give more time if many winners
  const duration = Math.max(4000, winnerCards.length * 2000);

  setTimeout(() => {
    popup.style.display = "none";
  }, duration);
}
async function renderHighlightedCard(cardId, pattern, containerId, isWinner=false) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const res = await fetch("cards.json");
  allCards = await res.json();
  const numbers = allCards[cardId];

  if (!numbers) {
    container.innerHTML = `<div style="color:red">Card ${cardId} not found!</div>`;
    return;
  }

  // convert pattern to a set for faster lookup
  const markedSet = new Set(pattern);

  // Helper to find winning line
  function getWinningLine(nums) {
    // rows
    const rows = [
      [0,1,2,3,4],
      [5,6,7,8,9],
      [10,11,12,13,14],
      [15,16,17,18,19],
      [20,21,22,23,24]
    ];
    for (let row of rows) if (row.every(i => markedSet.has(nums[i]))) return row;

    // columns
    const cols = [
      [0,5,10,15,20],
      [1,6,11,16,21],
      [2,7,12,17,22],
      [3,8,13,18,23],
      [4,9,14,19,24]
    ];
    for (let col of cols) if (col.every(i => markedSet.has(nums[i]))) return col;

    // diagonals
    const diag1 = [0,6,12,18,24];
    const diag2 = [4,8,12,16,20];
    if (diag1.every(i => markedSet.has(nums[i]))) return diag1;
    if (diag2.every(i => markedSet.has(nums[i]))) return diag2;

    // four corners
    const corners = [0,4,20,24];
    if (corners.every(i => markedSet.has(nums[i]))) return corners;

    return []; // no winning line
  }

  const winningLine = getWinningLine(numbers);

  const size = isWinner ? "scale-1.5" : "scale-1";

  let html = `<div class="card-preview ${size}" style="display:inline-block">`;

  html += `
    <div class="bingo-header">
      <div>B</div><div>I</div><div>N</div><div>G</div><div>O</div>
    </div>
    <div class="bingo-grid">
  `;

  numbers.forEach((n, index) => {
    const isMarked = markedSet.has(n);
    const isWinning = winningLine.includes(index);
    let bg = "#fff";
    let color = "#000";

    if (isWinning) {
      bg = "#447ffe"; // green for winning line
      color = "#fff";
    } else if (isMarked) {
      bg = "#fbbf24"; // yellow for marked numbers not in winning line
      color = "#000";
    }

    html += `<div class="bingo-cell" style="
        width:30px;
        height:30px;
        text-align:center;
        margin:1px;
        background:${bg};
        color:${color};
        border:1px solid #ccc;
        border-radius:4px
      ">
      ${n===0?"★":n}
    </div>`;
  });

  html += `</div></div>`;
  container.innerHTML = html;
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
function selectCard(cardId) {
  if (selectedCard === cardId) return; // no change

  // remove previous selection highlight
  if (selectedCard) {
    const prev = document.querySelector(`.card[data-id="${selectedCard}"]`);
    if (prev) prev.classList.remove("selected");
  }

  // set new selected card
  selectedCard = cardId;

  // add highlight to new selection
  const current = document.querySelector(`.card[data-id="${selectedCard}"]`);
  if (current) current.classList.add("selected");

  // update preview
  renderSelectedCardPreview();

  
}
function toggleMark(num){
  if(markedCells.has(num)){
    markedCells.delete(num);
  } else {
    markedCells.add(num);
  }

  updateSingleCell(num);
}
function updateSingleCell(num){
  const cell = document.querySelector(`.bingo-cell[data-num="${num}"]`);
  if(!cell) return;

  if(markedCells.has(num)){
    cell.classList.add("marked");
  } else {
    cell.classList.remove("marked");
  }
}
function handleStateUpdate(state) {
  const normalized = normalizeState(state);
  currentState = normalized;
  ROOM_BET_AMOUNT = normalized.bet_amount || 0;
  hasCalledBingo = normalized.bingo_called.includes(USER_ID);
  // 🔥 ALWAYS update core info
  updateGameInfo(normalized);
  
  // 🔥 detect my card
  const userCard = (normalized.cards || []).find(c => c[1] === USER_ID);
  myPickedCard = userCard ? userCard[0] : null;

  // 🔥 keep selectedCard in sync ONLY if I have a card
  if (myPickedCard) {
    selectedCard = myPickedCard;
  }

  const roomState = normalized.state;

  // =========================
  // 🎯 WAITING / COUNTDOWN
  // =========================
  if (roomState === "waiting" || roomState === "countdown") {
  if (lastRoomState === "playing") return;
  // 🔥 reset player state if previous state was ended
  if(lastRoomState === "ended") {

    resetPlayerState();
  }

  // 🔥 cards UI sync
  updateCardSelection(normalized);
  renderSelectedCardPreview();
  const alreadyPicked = (normalized.cards || []).some(c => c[1] === USER_ID);

  if (autoBetEnabled && !alreadyPicked && autoBetCardId && autoBetGamesLeft > 0) {

 setTimeout(async () => {

  const ok = await hasEnoughBalance();

  if (!ok) {
    autoBetEnabled = false;
    autoBetCardId = null;
    autoBetGamesLeft = 0;

    saveAutoState(); // persist OFF

    showPopup("Auto Bet stopped: insufficient balance");
    renderPlayerCard();
    return;
  }

  socket.emit("pick", {
    room_id: ROOM_ID,
    user_id: USER_ID,
    card_id: autoBetCardId,
    bet_amount: ROOM_BET_AMOUNT
  });

  autoBetGamesLeft--;

  if (autoBetGamesLeft <= 0) {
    autoBetEnabled = false;
    autoBetCardId = null;

    saveAutoState();
    showPopup("Auto Bet finished");
  }

}, 1000);
}

  arenaInitialized = false;
  lastRoomState = roomState;
  return;
}

  // =========================
  // 🎯 PLAYING
  // =========================
  clearPreview();

 if (roomState === "playing") {
   if(autoBingoEnabled){
    startAutoBingoWatcher(); // ✅ restore after reload
  }

  // 🔥 First time entering playing → build arena ONCE
  if (!arenaInitialized) {
    renderGameArena(normalized);
  }

  // 🔥 Always update numbers (this updates UI internally)
  updateCalledNumbers(normalized);

  return;
}
  // =========================
  // 🎯 ENDED
  // =========================
  if (roomState === "ended") {

    updateGameArena(normalized);

    // optional: show result popup once
    if (!resultShown && normalized.winners) {
      resultShown = true;

      const userWinner = normalized.winners.includes(USER_ID);

      if (userWinner) {
        // ✅ Current user won
      const myWinnerCard = normalized.winner_cards.find(c => c.card_id === myPickedCard);
      console.log(myWinnerCard)
      showWinnerPopup(myWinnerCard);
      } else {
        // ❌ Current user lost
       showLoserPopup(normalized.winner_cards);
      }
    }
    lastRoomState = roomState;
    return;
  }
  
}
function resetPlayerState() {
  // clear marked numbers
  markedCells.clear();

  // reset selected and picked card
  selectedCard = null;
  myPickedCard = null;

  // clear preview
  clearPreview();

  // mark arena as not initialized (so it rebuilds properly)
  arenaInitialized = false;
  hasCalledBingo = false;
  // also reset resultShown so the next game can show results again
  resultShown = false;
}
function updateCountdown(state){
  const el = document.getElementById("countdownValue");
  if(el) el.innerText = state.countdown;
}

function updateCalledNumbers(state) {
  const newNumbers = state.drawn_numbers;

  // detect NEW number only
  const lastNumber = newNumbers[newNumbers.length - 1];

  if (lastNumber && lastNumber !== calledNumbers[calledNumbers.length - 1]) {

    // 🔊 CALL SOUND HERE
    const letter = getBingoLetter(lastNumber);
  }

  calledNumbers = newNumbers;

  updateCalledBoard();
}
function cardsChanged(newCards, oldCards) {
  if (!oldCards) return true;
  if (newCards.length !== oldCards.length) return true;

  const setA = new Set(newCards.map(c => c[0] + "-" + c[1]));
  const setB = new Set(oldCards.map(c => c[0] + "-" + c[1]));

  if (setA.size !== setB.size) return true;

  for (let item of setA) {
    if (!setB.has(item)) return true;
  }

  return false;
}
function updateCardSelection(state){
  const newCards = state.cards;

  const changed = cardsChanged(newCards, lastCards);

  if (changed) {
    lastCards = [...newCards];
    renderCardSelection(state);
  }

  // 🔥 ALWAYS update countdown (even if cards didn't change)
  updateCountdown(state);
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
  socket = io("https://cleaner-logical-entitled-handling.trycloudflare.com", {
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    console.log("✅ Connected:", socket.id);
    socket.emit("join_room", { room_id: ROOM_ID }); // join immediately
  });

  socket.on("state_update", (state) => {
    handleStateUpdate(state);    
    console.log("📡 FRONTEND RECEIVED STATE_UPDATE:", state);
  });
  socket.on("pick_result", (data) => {
    if (!data.success) showPopup("Pick failed");
  });

  socket.on("unpick_result", (data) => {
    if (!data.success) showPopup("Unpick failed");
  });

  socket.on("bingo_result", (data) => {
    if (!data.success) showPopup("Bingo failed");
  });

  socket.on("disconnect", (reason) => {
    console.log("❌ Disconnected:", reason);
  });

}
async function startApp() {
  await loadCards();
  loadAutoState();   // 🔥 REQUIRED
  initSocket();        // start socket AFTER cards loaded
}

startApp();
