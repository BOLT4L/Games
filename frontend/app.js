const API_BASE = "https://51.20.43.208.sslip.io/";
const urlParams = new URLSearchParams(window.location.search);
let ROOM_ID = urlParams.get("room_id");
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

// ── English-only UI strings ──
const UI = {
  select_card:      "Select Your Card",
  countdown:        "Countdown",
  previous:         "Previous",
  next:             "Next",
  place_bet:        "Place Bet",
  cancel_bet:       "Cancel Bet",
  game_arena:       "Game Arena",
  bingo:            "BINGO",
  no_card:          "No card selected yet!",
  players:          "Players",
  pot:              "Pot",
  bet:              "Bet",
  balance:          "Balance",
  state:            "State",
  waiting:          "Waiting",
  countdown_state:  "Countdown",
  playing:          "Playing",
  ended:            "Ended",
  you_won:          "YOU WON!",
  congratulations:  "Congratulations! You won with card #",
  game_over:        "Game Over!",
  winner_cards:     "Winner card(s):",
  auto_bet:         "Auto Bet",
  auto_bingo:       "Auto Bingo",
  auto_bet_on:      "Auto Bet  ON",
  auto_bet_off:     "Auto Bet  OFF",
  auto_bingo_on:    "Auto Bingo  ON",
  auto_bingo_off:   "Auto Bingo  OFF",
};

function t(key) {
  return UI[key] || key;
}

// ── Card click delegation ──
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("card")) {
    if (e.target.classList.contains("disabled") || e.target.classList.contains("my-card")) return;
    const cardId = e.target.dataset.id;
    if (cardId) selectCard(cardId);
  }
});

function normalizeState(state) {
  return {
    ...state,
    cards:        state.cards        || [],
    drawn_numbers: state.drawn_numbers || [],
    countdown:    state.countdown    || 0,
    state:        state.state        || "waiting",
    pot:          state.pot          || 0,
    bet_amount:   state.betAmount    || state.bet_amount || 0,
  };
}

async function loadCards() {
  const res = await fetch("cards.json");
  allCards = await res.json();
  cardIds = Object.keys(allCards);
}

let selectedCards = new Set();

// ── RENDER: Card Selection ──
function renderCardSelection(state) {
  const app = document.getElementById("app");
  const pickedCards = (state.cards || []).map(c => c[0]);
  const myCard = myPickedCard;
  const start = currentPage * CARDS_PER_PAGE;
  const end   = start + CARDS_PER_PAGE;
  const pageCards = cardIds.slice(start, end);

  let html = `
    <div class="section-header">
      <h2>${t("select_card")}</h2>
      <div class="countdown-pill">
        <span class="countdown-icon">⏱</span>
        <span id="countdownValue">${state.countdown}</span>s
      </div>
    </div>
    <div class="cards">
  `;

  pageCards.forEach(cardId => {
    const isPicked = pickedCards.includes(cardId);
    const isMine   = cardId === myCard;
    let className  = "card";
    if (isMine)                    className += " my-card";
    else if (isPicked)             className += " disabled";
    else if (selectedCard === cardId) className += " selected";
    html += `<div class="${className}" data-id="${cardId}">${cardId.replace("card","")}</div>`;
  });

  html += `</div>`;

  const totalPages = Math.ceil(cardIds.length / CARDS_PER_PAGE);
  html += `
    <div class="pagination">
      <button class="nav-btn" onclick="prevPage()">← ${t("previous")}</button>
      <span class="page-indicator">Page ${currentPage + 1} / ${totalPages}</span>
      <button class="nav-btn" onclick="nextPage()">${t("next")} →</button>
    </div>
  `;

  app.innerHTML = html;
}

// ── RENDER: Selected Card Preview (modal overlay) ──
function renderSelectedCardPreview() {
  if (currentState && currentState.state === "playing") return;
  const overlay  = document.getElementById("cardPreviewOverlay");
  const container = document.getElementById("selectedCardPreview");
  if (!selectedCard) { closeCardPreview(); return; }

  const numbers = allCards[selectedCard];

  const countdown = currentState ? currentState.countdown : 0;

  let html = `
    <div class="card-preview">
      <div class="preview-header">
        <h3>Card #${selectedCard.replace("card","")}</h3>
        <div class="countdown-pill">
          <span class="countdown-icon">⏱</span>
          <span id="previewCountdown">${countdown}</span>s
        </div>
      </div>
      <div class="bingo-header">
        <div>B</div><div>I</div><div>N</div><div>G</div><div>O</div>
      </div>
      <div class="bingo-grid">
  `;
  numbers.forEach(n => {
    html += `<div class="bingo-cell">${n === 0 ? "★" : n}</div>`;
  });
  html += `</div>`;

  html += `<div class="preview-actions">`;
  if (myPickedCard) {
    html += `
      <button id="cancelBetBtn">${t("cancel_bet")}</button>
      <button id="autoBetBtn" class="auto-btn ${autoBetEnabled ? "on" : "off"}" onclick="toggleAutoBetforpreview()">
        ${autoBetEnabled ? "🟢" : "⚪"} ${autoBetEnabled ? t("auto_bet_on") : t("auto_bet_off")}
      </button>
    `;
  } else {
    html += `<button id="placeBetBtn">${t("place_bet")}</button>`;
  }
  html += `</div></div>`;

  container.innerHTML = html;
  overlay.style.display = "flex";
  attachPreviewEvents();
}

function closeCardPreview() {
  const overlay = document.getElementById("cardPreviewOverlay");
  if (overlay) overlay.style.display = "none";
}

// Close card modal when clicking the dark backdrop (outside the modal box)
function handleOverlayClick(e) {
  if (e.target === document.getElementById("cardPreviewOverlay")) {
    closeCardPreview();
  }
}

let arenaInitialized = false;

// ── RENDER: Game Arena (shell — rendered once) ──
function renderGameArena(state) {
  const app = document.getElementById("app");
  if (!arenaInitialized) {
    app.innerHTML = `
      <h2 class="arena-title">${t("game_arena")}</h2>
      <div class="arena">
        <div id="calledBoard"></div>
        <div id="playerCard"></div>
      </div>
    `;
    renderPlayerCard();
    updateCalledBoard();
    attachArenaEvents();
    arenaInitialized = true;
  }
}

// ── AUTO STATE persistence ──
function saveAutoState() {
  localStorage.setItem("bingo_auto_state", JSON.stringify({
    autoBetEnabled, autoBetCardId, autoBetGamesLeft, autoBingoEnabled
  }));
}

function loadAutoState() {
  const data = localStorage.getItem("bingo_auto_state");
  if (!data) return;
  try {
    const p = JSON.parse(data);
    autoBetEnabled   = p.autoBetEnabled   || false;
    autoBetCardId    = p.autoBetCardId    || null;
    autoBetGamesLeft = p.autoBetGamesLeft || 0;
    autoBingoEnabled = p.autoBingoEnabled || false;
  } catch(e) { console.error("Failed to load auto state", e); }
}

async function hasEnoughBalance() {
  const userData = await fetchUser();
  if (!userData) return false;
  return userData.balance >= ROOM_BET_AMOUNT;
}

// ── AUTO BET toggles ──
function toggleAutoBet() {
  if (!selectedCard) { showPopup(t("select_card")); return; }
  autoBetEnabled = !autoBetEnabled;
  if (autoBetEnabled) {
    autoBetGamesLeft = 5;
    autoBetCardId = selectedCard;
    showPopup("Auto Bet ON");
  } else {
    autoBetGamesLeft = 0;
    autoBetCardId = null;
    showPopup("Auto Bet OFF");
  }
  saveAutoState();
  renderPlayerCard();
}

function toggleAutoBetforpreview() {
  if (!selectedCard) { showPopup(t("select_card")); return; }
  autoBetEnabled = !autoBetEnabled;
  if (autoBetEnabled) {
    autoBetGamesLeft = 5;
    autoBetCardId = selectedCard;
    showPopup("Auto Bet ON");
  } else {
    autoBetGamesLeft = 0;
    autoBetCardId = null;
    showPopup("Auto Bet OFF");
  }
  saveAutoState();
  renderSelectedCardPreview();
}

function toggleAutoBingo() {
  if (!myPickedCard) { showPopup("Select a card first"); return; }
  autoBingoEnabled = !autoBingoEnabled;
  if (autoBingoEnabled) {
    startAutoBingoWatcher();
    showPopup("Auto Bingo ON");
  } else {
    stopAutoBingoWatcher();
    showPopup("Auto Bingo OFF");
  }
  saveAutoState();
  renderPlayerCard();
}

function startAutoBingoWatcher() {
  if (autoBingoInterval) return;
  autoBingoInterval = setInterval(() => {
    if (!autoBingoEnabled || !selectedCard || !currentState) return;
    if (currentState.state !== "playing") return;
    const numbers = allCards[selectedCard];
    if (!numbers) return;
    if (numbers.includes(0) && !markedCells.has(0)) { markedCells.add(0); updateSingleCell(0); }
    const drawn = currentState.drawn_numbers;
    drawn.forEach(num => {
      if (numbers.includes(num) && !markedCells.has(num)) toggleMark(num);
    });
    const latestNumber = drawn[drawn.length - 1];
    if (latestNumber && latestNumber !== lastProcessedNumber) lastProcessedNumber = latestNumber;
    const hasWin = checkWin(numbers, markedCells);
    if (hasWin && !hasCalledBingo) {
      socket.emit("bingo", { room_id: ROOM_ID, user_id: USER_ID, card_id: selectedCard, pattern: [...markedCells] });
      hasCalledBingo = true;
      showPopup("Auto Bingo Called!");
    }
  }, 500);
}

function stopAutoBingoWatcher() {
  if (autoBingoInterval) { clearInterval(autoBingoInterval); autoBingoInterval = null; }
}

function checkWin(card, drawnNumbers) {
  const marked = new Set(drawnNumbers);
  const rows = [[0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[15,16,17,18,19],[20,21,22,23,24]];
  for (let row of rows) if (row.every(n => marked.has(card[n]))) return row.map(i => card[i]);
  const cols = [[0,5,10,15,20],[1,6,11,16,21],[2,7,12,17,22],[3,8,13,18,23],[4,9,14,19,24]];
  for (let col of cols) if (col.every(n => marked.has(card[n]))) return col.map(i => card[i]);
  const diag1 = [0,6,12,18,24]; const diag2 = [4,8,12,16,20];
  if (diag1.every(n => marked.has(card[n]))) return diag1.map(i => card[i]);
  if (diag2.every(n => marked.has(card[n]))) return diag2.map(i => card[i]);
  const corners = [0,4,20,24];
  if (corners.every(n => marked.has(card[n]))) return corners.map(i => card[i]);
  return null;
}

// ── RENDER: Player Card ──
function renderPlayerCard() {
  const container = document.getElementById("playerCard");
  const cardId = myPickedCard;
  if (!cardId) { container.innerHTML = `<div class="waiting-msg">⏳ Waiting for your card...</div>`; return; }
  if (!allCards[cardId]) { container.innerHTML = `<h2>${t("no_card")}</h2>`; return; }
  const numbers = allCards[cardId];

  let html = `
    <div class="player-card">
      <div class="card-label">Card #${cardId.replace("card","")}</div>
      <div class="bingo-header">
        <div>B</div><div>I</div><div>N</div><div>G</div><div>O</div>
      </div>
      <div class="bingo-grid">
  `;
  numbers.forEach(n => {
    html += `
      <div class="bingo-cell ${markedCells.has(n) ? "marked" : ""}" data-num="${n}" onclick="toggleMark(${n})">
        ${n === 0 ? "★" : n}
      </div>`;
  });
  html += `</div>
    <div class="bingo-btn-wrap">
      <button id="callBingoBtn">${t("bingo")}</button>
    </div>
    <div class="auto-controls">
      <button class="auto-btn ${autoBetEnabled ? "on" : "off"}" onclick="toggleAutoBet()">
        ${autoBetEnabled ? "🟢" : "⚪"} ${autoBetEnabled ? t("auto_bet_on") : t("auto_bet_off")}
      </button>
      <button class="auto-btn ${autoBingoEnabled ? "on" : "off"}" onclick="toggleAutoBingo()">
        ${autoBingoEnabled ? "🟢" : "⚪"} ${autoBingoEnabled ? t("auto_bingo_on") : t("auto_bingo_off")}
      </button>
    </div>
  </div>`;

  container.innerHTML = html;
}

// ── RENDER: Called Board ──
function updateCalledBoard() {
  const container = document.getElementById("calledBoard");
  if (!container) {
    if (currentState && currentState.state === "playing") { arenaInitialized = false; renderGameArena(currentState); }
    return;
  }
  const last  = calledNumbers[calledNumbers.length - 1];
  const prev  = calledNumbers[calledNumbers.length - 2];
  const prev2 = calledNumbers[calledNumbers.length - 3];
  const oldCalled = calledNumbers.slice(0, -1);

  let html = `<div class="called-board">`;
  // Recent numbers display
  html += `<div class="recent-numbers">`;
  if (prev2) html += `<div class="recent-ball small" style="background:${getBingoColor(prev2)}">${prev2}</div>`;
  if (prev)  html += `<div class="recent-ball medium" style="background:${getBingoColor(prev)}">${prev}</div>`;
  if (last)  html += `<div class="recent-ball large" style="background:${getBingoColor(last)}">${last}</div>`;
  html += `</div>`;

  html += `
    <div class="bingo-header">
      <div>B</div><div>I</div><div>N</div><div>G</div><div>O</div>
    </div>
    <div class="called-grid">
  `;
  for (let row = 1; row <= 15; row++) {
    for (let col = 0; col < 5; col++) {
      const num = row + col * 15;
      let cls = "called-number";
      if (num === last)           cls += " called-last";
      else if (oldCalled.includes(num)) cls += " called-old";
      html += `<div class="${cls}">${num}</div>`;
    }
  }
  html += `</div></div>`;
  container.innerHTML = html;
}

// ── RENDER: Game Info Bar ──
async function renderGameInfo(state) {
  const container = document.getElementById("gameInfoBar");
  const userData   = await fetchUser();
  const userBalance = userData ? userData.balance : 0;
  const playersCount = (state.cards || []).length;
  const pot = state.pot || Number(playersCount * state.bet_amount * 0.8) || 0;
  const bet = state.bet_amount || state.bet || 0;
  const roomState = state.state || "unknown";

  container.innerHTML = `
    <div class="info-box">👥 ${t("players")}: <strong>${playersCount}</strong></div>
    <div class="info-box">💰 ${t("pot")}: <strong>${pot} AED</strong></div>
    <div class="info-box">🎯 ${t("bet")}: <strong>${bet} AED</strong></div>
    <div class="info-box">💳 ${t("balance")}: <strong>${userBalance} AED</strong></div>
    <div class="info-box state-badge state-${roomState}">${roomState}</div>
  `;
}

// ── ACTIONS ──
function callBingo(pattern) {
  if (hasCalledBingo) { showPopup("You already called BINGO!"); return; }
  if (!myPickedCard)  { showPopup("No card selected"); return; }
  socket.emit("bingo", { room_id: ROOM_ID, user_id: USER_ID, card_id: myPickedCard, pattern });
}

function placeBet(cardId) {
  socket.emit("pick", { room_id: ROOM_ID, user_id: USER_ID, card_id: cardId, bet_amount: ROOM_BET_AMOUNT });
  renderSelectedCardPreview();
  if (currentState) renderCardSelection(currentState);
}

function cancelBet(cardId) {
  socket.emit("unpick", { room_id: ROOM_ID, user_id: USER_ID, card_id: cardId });
  selectedCard = null; myPickedCard = null;
  renderSelectedCardPreview();
  if (currentState) renderCardSelection(currentState);
}

async function fetchUser() {
  try {
    const res = await fetch(`${API_BASE}/user/${USER_ID}`, { headers: { "ngrok-skip-browser-warning": "true" } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.exists ? data : null;
  } catch (err) { console.error("Error fetching user:", err); return null; }
}

function clearPreview() {
  closeCardPreview();
  const container = document.getElementById("selectedCardPreview");
  if (container) container.innerHTML = "";
}

function attachPreviewEvents() {
  const placeBtn  = document.getElementById("placeBetBtn");
  const cancelBtn = document.getElementById("cancelBetBtn");
  if (placeBtn)  placeBtn.addEventListener("click",  () => placeBet(selectedCard));
  if (cancelBtn) cancelBtn.addEventListener("click", () => cancelBet(myPickedCard));
}

function attachArenaEvents() {
  const bingoBtn = document.getElementById("callBingoBtn");
  if (bingoBtn) bingoBtn.addEventListener("click", () => callBingo([...markedCells]));
}

// ── POPUP ──
function getBingoLetter(num) {
  if (num <= 15) return "B"; if (num <= 30) return "I";
  if (num <= 45) return "N"; if (num <= 60) return "G"; return "O";
}

function showPopup(msg) {
  const popup = document.getElementById("popup");
  // simple toast — don't overwrite a modal popup
  if (popup.classList.contains("popup-modal") && popup.style.display === "flex") return;
  popup.className = "popup popup-toast";
  popup.innerText = msg;
  popup.style.display = "block";
  setTimeout(() => {
    popup.style.display = "none";
    popup.className = "popup";
  }, 3000);
}

function showPopupHTML(html) {
  const popup = document.getElementById("popup");
  popup.innerHTML = html; popup.style.display = "block";
  setTimeout(() => { popup.style.display = "none"; }, 5000);
}

function showWinnerPopup(winnerCard) {
  const popup = document.getElementById("popup");
  popup.className = "popup popup-modal";
  popup.innerHTML = `
    <div class="popup-backdrop" onclick="dismissPopup()"></div>
    <div class="popup-modal-box win-popup">
      <div class="win-fireworks">🎉</div>
      <h2>${t("you_won")}</h2>
      <p>${t("congratulations")}${winnerCard.card_id.replace("card","")}</p>
      <div id="winnerCardContainer"></div>
      <button class="popup-close-btn" onclick="dismissPopup()">Close</button>
    </div>`;
  renderHighlightedCard(winnerCard.card_id, winnerCard.pattern, "winnerCardContainer", true);
  popup.style.display = "flex";
  setTimeout(() => dismissPopup(), 7000);
}

function showLoserPopup(winnerCards) {
  const popup = document.getElementById("popup");
  popup.className = "popup popup-modal";
  let html = `
    <div class="popup-backdrop" onclick="dismissPopup()"></div>
    <div class="popup-modal-box lose-popup">
      <h2>${t("game_over")}</h2>
      <p>${t("winner_cards")}</p>
      <div class="winner-cards-wrap">`;
  winnerCards.forEach((w, index) => {
    html += `
      <div class="winner-card-item">
        <div class="winner-name">${w.username || w.user_id}</div>
        <div class="winner-cardnum">Card #${w.card_id.replace("card","")}</div>
        <div id="loserCard_${index}"></div>
      </div>`;
  });
  html += `</div><button class="popup-close-btn" onclick="dismissPopup()">Close</button></div>`;
  popup.innerHTML = html;
  popup.style.display = "flex";
  setTimeout(() => {
    winnerCards.forEach((w, index) => renderHighlightedCard(w.card_id, w.pattern, `loserCard_${index}`, false));
  }, 50);
  setTimeout(() => dismissPopup(), Math.max(8000, winnerCards.length * 2500));
}

function dismissPopup() {
  const popup = document.getElementById("popup");
  popup.style.display = "none";
  popup.className = "popup";
}

async function renderHighlightedCard(cardId, pattern, containerId, isWinner = false) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const res = await fetch("cards.json");
  allCards = await res.json();
  const numbers = allCards[cardId];
  if (!numbers) { container.innerHTML = `<div style="color:red">Card ${cardId} not found!</div>`; return; }
  const markedSet = new Set(pattern);

  function getWinningLine(nums) {
    const rows = [[0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[15,16,17,18,19],[20,21,22,23,24]];
    for (let row of rows) if (row.every(i => markedSet.has(nums[i]))) return row;
    const cols = [[0,5,10,15,20],[1,6,11,16,21],[2,7,12,17,22],[3,8,13,18,23],[4,9,14,19,24]];
    for (let col of cols) if (col.every(i => markedSet.has(nums[i]))) return col;
    const diag1 = [0,6,12,18,24]; const diag2 = [4,8,12,16,20];
    if (diag1.every(i => markedSet.has(nums[i]))) return diag1;
    if (diag2.every(i => markedSet.has(nums[i]))) return diag2;
    const corners = [0,4,20,24];
    if (corners.every(i => markedSet.has(nums[i]))) return corners;
    return [];
  }
  const winningLine = getWinningLine(numbers);
  let html = `<div class="card-preview" style="display:inline-block">
    <div class="bingo-header"><div>B</div><div>I</div><div>N</div><div>G</div><div>O</div></div>
    <div class="bingo-grid">`;
  numbers.forEach((n, index) => {
    const isMarked  = markedSet.has(n);
    const isWinning = winningLine.includes(index);
    let bg = "#1a1a3a"; let color = "#e8eaf6";
    if (isWinning)      { bg = "#4f8ef7"; color = "#fff"; }
    else if (isMarked)  { bg = "#fbbf24"; color = "#000"; }
    html += `<div class="bingo-cell" style="background:${bg};color:${color};width:28px;height:28px;margin:1px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">${n===0?"★":n}</div>`;
  });
  html += `</div></div>`;
  container.innerHTML = html;
}

// ── PAGINATION ──
function nextPage() {
  const maxPage = Math.ceil(cardIds.length / CARDS_PER_PAGE) - 1;
  if (currentPage < maxPage) { currentPage++; renderCardSelection(currentState); }
}
function prevPage() {
  if (currentPage > 0) { currentPage--; renderCardSelection(currentState); }
}

function selectCard(cardId) {
  if (selectedCard === cardId) return;
  if (selectedCard) {
    const prev = document.querySelector(`.card[data-id="${selectedCard}"]`);
    if (prev) prev.classList.remove("selected");
  }
  selectedCard = cardId;
  const current = document.querySelector(`.card[data-id="${selectedCard}"]`);
  if (current) current.classList.add("selected");
  renderSelectedCardPreview();
}

function toggleMark(num) {
  if (markedCells.has(num)) markedCells.delete(num); else markedCells.add(num);
  updateSingleCell(num);
}

function updateSingleCell(num) {
  const cell = document.querySelector(`.bingo-cell[data-num="${num}"]`);
  if (!cell) return;
  cell.classList.toggle("marked", markedCells.has(num));
}

// ── STATE HANDLER ──
function handleStateUpdate(state) {
  const normalized = normalizeState(state);
  currentState = normalized;
  ROOM_BET_AMOUNT = normalized.bet_amount || 0;
  hasCalledBingo = normalized.bingo_called.includes(USER_ID);
  updateGameInfo(normalized);

  const userCard = (normalized.cards || []).find(c => c[1] === USER_ID);
  myPickedCard = userCard ? userCard[0] : null;
  if (myPickedCard) selectedCard = myPickedCard;

  const roomState = normalized.state;

  // ── WAITING / COUNTDOWN ──
  if (roomState === "waiting" || roomState === "countdown") {
    if (lastRoomState === "playing") return;
    if (lastRoomState === "ended") resetPlayerState();
    updateCardSelection(normalized);
    renderSelectedCardPreview();
    const alreadyPicked = (normalized.cards || []).some(c => c[1] === USER_ID);
    if (autoBetEnabled && !alreadyPicked && autoBetCardId && autoBetGamesLeft > 0) {
      setTimeout(async () => {
        const ok = await hasEnoughBalance();
        if (!ok) {
          autoBetEnabled = false; autoBetCardId = null; autoBetGamesLeft = 0;
          saveAutoState(); showPopup("Auto Bet stopped: insufficient balance"); renderPlayerCard(); return;
        }
        socket.emit("pick", { room_id: ROOM_ID, user_id: USER_ID, card_id: autoBetCardId, bet_amount: ROOM_BET_AMOUNT });
        autoBetGamesLeft--;
        if (autoBetGamesLeft <= 0) { autoBetEnabled = false; autoBetCardId = null; saveAutoState(); showPopup("Auto Bet finished"); }
      }, 1000);
    }
    arenaInitialized = false;
    lastRoomState = roomState;
    return;
  }

  // ── PLAYING ──
  clearPreview();
  if (roomState === "playing") {
    if (autoBingoEnabled) startAutoBingoWatcher();
    if (!arenaInitialized) renderGameArena(normalized);
    updateCalledNumbers(normalized);
    return;
  }

  // ── ENDED ──
  if (roomState === "ended") {
    updateGameArena(normalized);
    if (!resultShown && normalized.winners) {
      resultShown = true;
      const userWinner = normalized.winners.includes(USER_ID);
      if (userWinner) {
        const myWinnerCard = normalized.winner_cards.find(c => c.card_id === myPickedCard);
        showWinnerPopup(myWinnerCard);
      } else {
        showLoserPopup(normalized.winner_cards);
      }
    }
    lastRoomState = roomState;
    return;
  }
}

function resetPlayerState() {
  markedCells.clear(); selectedCard = null; myPickedCard = null;
  clearPreview(); arenaInitialized = false; hasCalledBingo = false; resultShown = false;
}

function updateCountdown(state) {
  const el = document.getElementById("countdownValue");
  if (el) el.innerText = state.countdown;
  // also keep the preview modal countdown in sync
  const previewEl = document.getElementById("previewCountdown");
  if (previewEl) previewEl.innerText = state.countdown;
}

// ── VOICE: announce drawn number ──
function announceNumber(num) {
  if (!window.speechSynthesis) return;
  const letter = getBingoLetter(num);
  const utterance = new SpeechSynthesisUtterance(`${letter} ${num}`);
  utterance.lang    = "en-US";
  utterance.rate    = 0.9;
  utterance.pitch   = 1.1;
  utterance.volume  = 1;
  window.speechSynthesis.cancel(); // stop any current speech
  window.speechSynthesis.speak(utterance);
}

function updateCalledNumbers(state) {
  const newNumbers = state.drawn_numbers;
  const lastNumber = newNumbers[newNumbers.length - 1];
  if (lastNumber && lastNumber !== calledNumbers[calledNumbers.length - 1]) {
    announceNumber(lastNumber);
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
  for (let item of setA) { if (!setB.has(item)) return true; }
  return false;
}

function updateCardSelection(state) {
  const newCards = state.cards;
  const changed = cardsChanged(newCards, lastCards);
  if (changed) { lastCards = [...newCards]; renderCardSelection(state); }
  updateCountdown(state);
}

function updateGameArena(state) {
  if (!myPickedCard) return;
  renderGameArena(state);
}

let lastInfo = "";
function updateGameInfo(state) {
  const newInfo = JSON.stringify({ players: state.cards?.length, pot: state.pot, bet: state.bet_amount, state: state.state });
  if (newInfo === lastInfo) return;
  lastInfo = newInfo;
  renderGameInfo(state);
}

function getBingoColor(num) {
  if (num >= 1  && num <= 15) return "#3b82f6";
  if (num >= 16 && num <= 30) return "#22c55e";
  if (num >= 31 && num <= 45) return "#f59e0b";
  if (num >= 46 && num <= 60) return "#ef4444";
  if (num >= 61 && num <= 75) return "#a855f7";
  return "#999";
}

// ── SOCKET & MAIN LOOP ──
let lastRoomState = null;
let socket;

function initSocket() {
  socket = io("https://51.20.43.208.sslip.io/", { transports: ["websocket"] });
  socket.on("connect", () => {
    console.log("✅ Connected:", socket.id);
    socket.emit("join_room", { room_id: ROOM_ID });
  });
  socket.on("state_update",  (state) => { handleStateUpdate(state); });
  socket.on("pick_result",   (data)  => { if (!data.success) showPopup("Pick failed"); });
  socket.on("unpick_result", (data)  => { if (!data.success) showPopup("Unpick failed"); });
  socket.on("bingo_result",  (data)  => { if (!data.success) showPopup("Bingo failed"); });
  socket.on("disconnect",    (reason) => { console.log("❌ Disconnected:", reason); });
}

async function startApp() {
  if (!ROOM_ID) {
    await renderRoomPicker();
    return;
  }
  await loadCards();
  loadAutoState();
  initSocket();
}

// ── ROOM PICKER ──
async function renderRoomPicker() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="room-picker-loading">Loading rooms...</div>`;

  let rooms = [];
  try {
    const res = await fetch(`${API_BASE}rooms`, { headers: { "ngrok-skip-browser-warning": "true" } });
    rooms = await res.json();
  } catch (e) {
    app.innerHTML = `<div class="room-picker-error">⚠️ Could not load rooms. Please try again.</div>`;
    return;
  }

  const stateLabel = { waiting: "Waiting", countdown: "Starting", playing: "Playing", ended: "Ended" };

  let html = `
    <div class="room-picker">
      <h2 class="room-picker-title">🎮 Choose a Room</h2>
      <div class="room-list">
  `;

  rooms.forEach(room => {
    const state = room.state || "waiting";
    const disabled = state === "playing" ? "room-card--disabled" : "";
    html += `
      <div class="room-card ${disabled}" onclick="enterRoom('${room.room_id}')">
        <div class="room-card-name">${roomLabel(room.room_id)}</div>
        <div class="room-card-bet">💰 ${room.bet_amount} AED</div>
        <div class="room-card-players">👥 ${room.players} players</div>
        <div class="room-card-state state-${state}">${stateLabel[state] || state}</div>
      </div>
    `;
  });

  html += `</div></div>`;
  app.innerHTML = html;
}

function roomLabel(room_id) {
  const names = { room00: "Room Free (1 AED)", room0: "Room One (5 AED)", room1: "Room Two (10 AED)", room2: "Room Three (20 AED)", room3: "Room Four (50 AED)" };
  return names[room_id] || room_id;
}

async function enterRoom(room_id) {
  ROOM_ID = room_id;
  // Update the URL without reloading
  const newUrl = new URL(window.location.href);
  newUrl.searchParams.set("room_id", room_id);
  window.history.replaceState({}, "", newUrl.toString());

  const app = document.getElementById("app");
  app.innerHTML = `<div class="room-picker-loading">Entering room...</div>`;

  await loadCards();
  loadAutoState();
  initSocket();
}

startApp();
