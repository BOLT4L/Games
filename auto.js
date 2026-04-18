import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 4000;
const API_BASE = "https://cicely-pedodontic-nonnegligibly.ngrok-free.dev";

app.use(bodyParser.json());

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
async function waitForNextGame(roomId) {
  console.log("⏳ Waiting for game to end...");

  // wait until game ends
  while (true) {
    const res = await fetch(`${API_BASE}/room/${roomId}/state`, {
      headers: { "ngrok-skip-browser-warning": "true" }
    });

    if (!res.ok) {
      await sleep(1000);
      continue;
    }

    const data = await res.json();

    if (data.state === "ended") {
      console.log("✅ Game ended");
      break;
    }

    await sleep(1000);
  }

  console.log("⏳ Waiting for next game (waiting state)...");

  // wait until new game starts (waiting)
  while (true) {
    const res = await fetch(`${API_BASE}/room/${roomId}/state`, {
      headers: { "ngrok-skip-browser-warning": "true" }
    });

    if (!res.ok) {
      await sleep(1000);
      continue;
    }

    const data = await res.json();

    if (data.state === "waiting") {
      console.log("🚀 New game started");
      break;
    }

    await sleep(1000);
  }
}
function checkWinningPattern(card, drawnNumbers) {
  // Center cell is stored as 0 in cards.json (free space); it is never "drawn" (balls are 1–75).
  const drawn = new Set(drawnNumbers);
  const isMarked = (n) => n === 0 || drawn.has(n);

  const rows = [
    [card[0], card[1], card[2], card[3], card[4]],
    [card[5], card[6], card[7], card[8], card[9]],
    [card[10], card[11], card[12], card[13], card[14]],
    [card[15], card[16], card[17], card[18], card[19]],
    [card[20], card[21], card[22], card[23], card[24]],
  ];

  for (let row of rows) {
    if (row.every(n => isMarked(n))) return row;
  }

  const cols = [
    [card[0], card[5], card[10], card[15], card[20]],
    [card[1], card[6], card[11], card[16], card[21]],
    [card[2], card[7], card[12], card[17], card[22]],
    [card[3], card[8], card[13], card[18], card[23]],
    [card[4], card[9], card[14], card[19], card[24]],
  ];

  for (let col of cols) {
    if (col.every(n => isMarked(n))) return col;
  }

  const diag1 = [card[0], card[6], card[12], card[18], card[24]];
  const diag2 = [card[4], card[8], card[12], card[16], card[20]];

  if (diag1.every(n => isMarked(n))) return diag1;
  if (diag2.every(n => isMarked(n))) return diag2;

  const corners = [card[0], card[4], card[20], card[24]];
  if (corners.every(n => isMarked(n))) return corners;

  return null;
}
// 🔥 UPDATED FUNCTION
async function playGames(roomId, quantity, games) {
  const demoUsers = ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30"];
  // userId -> [{cardId, numbers}]
  async function fetchRoomState() {
    const res = await fetch(`${API_BASE}/room/${roomId}/state`, {
      headers: { "ngrok-skip-browser-warning": "true" }
    });
    if (!res.ok) return null;
    return await res.json();
  }

  async function pickCard(userId, cardId, betAmount = 0) {
    const res = await fetch(`${API_BASE}/room/${roomId}/pick`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true"
      },
      body: JSON.stringify({
        user_id: userId,
        card_id: cardId,
        bet_amount: betAmount
      })
    });

    return await res.json(); // return full response
  }

  const allCards = JSON.parse(fs.readFileSync("cards.json", "utf-8"));
  const allCardIds = Object.keys(allCards);

  let resultSummary = {};

  // 🔥 MAIN LOOP (games)
  for (let game = 0; game < games; game++) {
    console.log(`🎮 Game ${game + 1}/${games}`);
    // Per-game picked cards (don't leak state across rounds)
    const userPickedCards = {};

    const roomState = await fetchRoomState();

    if (!roomState || !roomState.cards) {
      console.log("Invalid room state");
      break;
    }

    if (!["waiting", "countdown"].includes(roomState.state)) {
      console.log("Room not in valid state, stopping...");
      break;
    }
    const gameBetAmount = Number(roomState.bet_amount ?? roomState.bet ?? 0) || 0;
let successfulPicks = 0;
const shuffledUsers = [...demoUsers].sort(() => Math.random() - 0.5);

for (let userId of shuffledUsers) {
  if (successfulPicks >= quantity) break;

  const latestState = await fetchRoomState();

  if (!latestState || !["waiting", "countdown"].includes(latestState.state)) {
    console.log("Room stopped mid-game");
    console.log("⚠️ Game started during picking, proceeding with current cards...");
    break;
  }

  const userCards = latestState.cards
    .filter(c => String(c[1]) === String(userId))
    .map(c => c[0]);

  if (userCards.length > 0) continue;

  const takenCards = new Set(latestState.cards.map(c => c[0]));
  let availableCards = allCardIds.filter(c => !takenCards.has(c));

  if (availableCards.length === 0) {
    console.log("No cards left");
    break;
  }

  // 🎯 Try picking until success OR cards exhausted
  let picked = false;

  while (availableCards.length > 0 && !picked) {
    const idx = Math.floor(Math.random() * availableCards.length);
    const cardId = availableCards[idx];

    const result = await pickCard(userId, cardId, gameBetAmount);

if (result.success) {
  const cardNumbers = allCards[cardId];
  if (!userPickedCards[userId]) userPickedCards[userId] = [];
  userPickedCards[userId].push({ cardId, numbers: cardNumbers });

  if (!resultSummary[userId]) resultSummary[userId] = [];
  resultSummary[userId].push(cardId);

  picked = true;
  successfulPicks++;
} else {
  if (result.reason === "insufficient_balance") {
    console.log(`⛔ ${userId} has low balance → skip user`);
    break; // ❗ stop trying this user
  }

  if (result.reason === "card_taken") {
    // ✅ try another card
    continue;
  }

  if (result.reason === "already_has_card") {
    break;
  }

  if (result.reason === "invalid_state") {
    break;
  }
}

    availableCards.splice(idx, 1);
    await sleep(1000);
  }
}

    // 🔥 delay between games
    console.log("⏳ Waiting before next game...");
    await sleep(2000);

    // After picks, wait until play starts; then poll every 1s and check every demo card in the room.
    if (Object.keys(userPickedCards).length > 0) {
      console.log("🚀 Starting bingo monitoring for this round...");
      await monitorBingo(roomId, demoUsers, allCards, fetchRoomState);
    } else {
      console.log("ℹ️ No demo users picked cards this round; skipping bingo monitoring.");
    }

    // ✅ wait only if NOT the last game
    if (game < games - 1) {
      await waitForNextGame(roomId);
    }
  
  }

  return resultSummary;
}
async function callBingo(roomId, userId, cardId, pattern) {
  const res = await fetch(`${API_BASE}/room/${roomId}/bingo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true"
    },
    body: JSON.stringify({
      user_id: userId,
      card_id: cardId,
      pattern: pattern
    })
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    console.log("⚠️ Bingo response not JSON");
    return false;
  }
  if (!res.ok || !data.success) {
    console.log("⚠️ Bingo API rejected:", res.status, data);
  }
  return Boolean(data.success);
}

/** Build userId -> [{ cardId, numbers }] for demo players from live room state. */
function demoCardsFromRoomState(roomState, demoUserIds, allCards) {
  const demoSet = new Set(demoUserIds.map((id) => String(id)));
  const byUser = {};
  for (const pair of roomState.cards || []) {
    const cardId = pair[0];
    const playerId = String(pair[1]);
    if (!demoSet.has(playerId)) continue;
    const numbers = allCards[cardId];
    if (!numbers) continue;
    if (!byUser[playerId]) byUser[playerId] = [];
    byUser[playerId].push({ cardId, numbers });
  }
  return byUser;
}

async function monitorBingo(roomId, demoUserIds, allCards, fetchRoomState) {
  console.log("⏳ Waiting for room to enter playing...");

  let data = await fetchRoomState();
  while (data && data.state !== "playing" && data.state !== "ended") {
    await sleep(1000);
    data = await fetchRoomState();
  }

  if (!data || data.state === "ended") {
    console.log("🛑 Room never reached playing (or already ended).");
    return false;
  }

  console.log("👀 Monitoring all demo cards each second while playing...");
  let lastDrawnCount = -1;

  while (true) {
    data = await fetchRoomState();

    if (!data) {
      await sleep(1000);
      continue;
    }

    if (data.state === "ended") {
      console.log("🛑 Game ended before a demo bingo call succeeded.");
      return false;
    }

    if (data.state !== "playing") {
      await sleep(1000);
      continue;
    }

    const drawnNumbers = data.drawn_numbers || [];
    if (drawnNumbers.length !== lastDrawnCount) {
      lastDrawnCount = drawnNumbers.length;
      console.log(`🔢 Balls drawn: ${lastDrawnCount}`);
    }

    const userPickedCards = demoCardsFromRoomState(data, demoUserIds, allCards);

    for (const userId of Object.keys(userPickedCards)) {
      for (const { cardId, numbers } of userPickedCards[userId]) {
        const pattern = checkWinningPattern(numbers, drawnNumbers);

        if (pattern) {
          console.log(`🏆 BINGO FOUND! User ${userId}, card ${cardId}`);

          const success = await callBingo(roomId, userId, cardId, pattern);

          if (success) {
            console.log("🎉 BINGO CALLED SUCCESSFULLY");
            return true;
          }
        }
      }
    }

    await sleep(1000);
  }
}
// ---------------- POST /play ----------------
app.post("/play", async (req, res) => {
  const { roomId, quantity, games } = req.body;

  if (!roomId || !quantity || !games) {
    return res.status(400).json({
      error: "roomId, quantity, and games are required"
    });
  }

  try {
    const result = await playGames(roomId, quantity, games);
    res.json({
      success: true,
      gamesPlayed: games,
      pickedCards: result
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});


app.listen(PORT, () => {
  console.log(`🚀 Game bot server running on port ${PORT}`);
});