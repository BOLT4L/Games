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
// 🔥 UPDATED FUNCTION
async function playGames(roomId, quantity, games) {
  const demoUsers = ["1","2","3","4","5","6","7","8","9","10"];
  let userPickedCards = {}; 
// userId -> [{cardId, numbers}]
  async function fetchRoomState() {
    const res = await fetch(`${API_BASE}/room/${roomId}/state`, {
      headers: { "ngrok-skip-browser-warning": "true" }
    });
    if (!res.ok) return null;
    return await res.json();
  }

  async function pickCard(userId, cardId) {
    const res = await fetch(`${API_BASE}/room/${roomId}/pick`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true"
      },
      body: JSON.stringify({
        user_id: userId,
        card_id: cardId,
        bet_amount: 0
      })
    });
    const data = await res.json();
    return data.success;
  }

  const allCards = JSON.parse(fs.readFileSync("cards.json", "utf-8"));
  const allCardIds = Object.keys(allCards);

  let resultSummary = {};

  // 🔥 MAIN LOOP (games)
  for (let game = 0; game < games; game++) {
    console.log(`🎮 Game ${game + 1}/${games}`);

    const roomState = await fetchRoomState();

    if (!roomState || !roomState.cards) {
      console.log("Invalid room state");
      break;
    }

    if (!["waiting", "countdown"].includes(roomState.state)) {
      console.log("Room not in valid state, stopping...");
      break;
    }
let successfulPicks = 0;
const shuffledUsers = [...demoUsers].sort(() => Math.random() - 0.5);

for (let userId of shuffledUsers) {
  if (successfulPicks >= quantity) break;

  const latestState = await fetchRoomState();

  if (!latestState || !["waiting", "countdown"].includes(latestState.state)) {
    console.log("Room stopped mid-game");
    return resultSummary;
  }

  const userCards = latestState.cards
    .filter(c => c[1] === userId)
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

    const success = await pickCard(userId, cardId);

    if (success) {
      const cardNumbers = allCards[cardId]; // from cards.json

      if (!userPickedCards[userId]) userPickedCards[userId] = [];

      userPickedCards[userId].push({
        cardId,
        numbers: cardNumbers
      });
      takenCards.add(cardId);

      if (!resultSummary[userId]) resultSummary[userId] = [];
      resultSummary[userId].push(cardId);

      successfulPicks++;
      picked = true;

      console.log(`✅ User ${userId} picked card ${cardId}`);
    }
    else{
      console.log("wtf")
    }

    availableCards.splice(idx, 1);
    await sleep(1500);
  }
}

    // 🔥 delay between games
    console.log("⏳ Waiting before next game...");
    await sleep(2000);
  // ✅ wait only if NOT the last game
// After all demo users have picked their cards
if (Object.keys(userPickedCards).length > 0) {
  // Wait until the game actually starts
  let roomState = await fetchRoomState();
  while (roomState && roomState.state === "waiting") {
    console.log("⏳ Room waiting to start game, delaying bingo monitoring...");
    await sleep(1000);
    roomState = await fetchRoomState();
  }

  // Only monitor bingo if game is active
  if (roomState && ["countdown", "playing"].includes(roomState.state)) {
    console.log("🚀 Starting bingo monitoring for active players...");
    await monitorBingo(roomId, userPickedCards, allCards);
  }
}
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

  const data = await res.json();
  return data.success;
}
async function monitorBingo(roomId, userPickedCards, allCards) {
  console.log("👀 Monitoring bingo...");

  let bingoCalled = false;

  while (!bingoCalled) {
    const res = await fetch(`${API_BASE}/room/${roomId}/state`, {
      headers: { "ngrok-skip-browser-warning": "true" }
    });

    if (!res.ok) {
      await sleep(1000);
      continue;
    }

    const data = await res.json();

    const drawnNumbers = data.drawn_numbers || [];

    for (let userId in userPickedCards) {
      for (let entry of userPickedCards[userId]) {
        const { cardId, numbers } = entry;

        const pattern = checkWinningPattern(numbers, drawnNumbers);

        if (pattern) {
          console.log(`🏆 BINGO FOUND! User ${userId}`);

          const success = await callBingo(roomId, userId, cardId, pattern);

          if (success) {
            console.log("🎉 BINGO CALLED SUCCESSFULLY");
            bingoCalled = true;
            return;
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