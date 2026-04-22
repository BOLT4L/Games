import express from "express";
import bodyParser from "body-parser";
import { io } from "socket.io-client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 4000;
const API_BASE =
  process.env.API_BASE ||
  "https://cleaner-logical-entitled-handling.trycloudflare.com";

app.use(bodyParser.json());

// -------------------- Helpers --------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDrawnNumbersFromCard(cardNumbers, drawnNumbers) {
  const drawnSet = new Set(drawnNumbers);
  return cardNumbers.filter((n) => drawnSet.has(n));
}

function checkWinningPattern(card, drawnNumbers) {
  const marked = new Set(drawnNumbers);

  const rows = [
    [0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],
    [15,16,17,18,19],[20,21,22,23,24],
  ];

  for (let row of rows) {
    if (row.every((i) => marked.has(card[i]))) {
      return row.map(i => card[i]);
    }
  }

  const cols = [
    [0,5,10,15,20],[1,6,11,16,21],[2,7,12,17,22],
    [3,8,13,18,23],[4,9,14,19,24],
  ];

  for (let col of cols) {
    if (col.every((i) => marked.has(card[i]))) {
      return col.map(i => card[i]);
    }
  }

  const diag1 = [0,6,12,18,24];
  const diag2 = [4,8,12,16,20];

  if (diag1.every(i => marked.has(card[i]))) return diag1.map(i => card[i]);
  if (diag2.every(i => marked.has(card[i]))) return diag2.map(i => card[i]);

  const corners = [0,4,20,24];
  if (corners.every(i => marked.has(card[i]))) return corners.map(i => card[i]);

  return null;
}

// -------------------- Socket Setup --------------------
function createSocket(roomId) {
  const socket = io(API_BASE, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  let currentState = null;

  socket.on("connect", () => {
    console.log("✅ Connected:", socket.id);
    socket.emit("join_room", { room_id: roomId });
  });

  socket.on("state_update", (state) => {
    currentState = state;
  });

  socket.on("disconnect", (reason) => {
    console.log("❌ Disconnected:", reason);
  });

  return { socket, getState: () => currentState };
}

// -------------------- Wait Helpers --------------------
function waitForState(socket, targetStates) {
  return new Promise((resolve) => {
    const handler = (state) => {
      if (targetStates.includes(state.state)) {
        socket.off("state_update", handler);
        resolve(state);
      }
    };
    socket.on("state_update", handler);
  });
}

// -------------------- Bingo Monitor --------------------
async function monitorBingo(socket, roomId, userPickedCards) {
  return new Promise((resolve) => {
    const handler = async (data) => {
      if (data.state === "ended") {
        console.log("🛑 Game ended");
        socket.off("state_update", handler);
        resolve();
        return;
      }

      const drawnNumbers = data.drawn_numbers || [];

      for (let userId in userPickedCards) {
        for (let entry of userPickedCards[userId]) {
          const { cardId, numbers } = entry;

          let pattern = checkWinningPattern(numbers, drawnNumbers);

          if (pattern) {
            const matched = getDrawnNumbersFromCard(numbers, drawnNumbers);
            pattern = [...new Set([...pattern, ...matched])];

            console.log(`🏆 BINGO FOUND! User ${userId}`);

            socket.emit("bingo", {
              room_id: roomId,
              user_id: userId,
              card_id: cardId,
              pattern,
            });
          }
        }
      }
    };

    socket.on("state_update", handler);
  });
}

// -------------------- Main Game Logic --------------------
async function playGames(roomId, quantity, games) {
  const { socket, getState } = createSocket(roomId);

  const demoUsers = Array.from({ length: 30 }, (_, i) => String(i + 1));

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const allCards = JSON.parse(
    fs.readFileSync(path.join(__dirname, "cards.json"), "utf-8")
  );

  const allCardIds = Object.keys(allCards);
  let resultSummary = {};

  // wait first state
  await waitForState(socket, ["waiting", "countdown"]);

  for (let game = 0; game < games; game++) {
    console.log(`🎮 Game ${game + 1}/${games}`);

    let userPickedCards = {};
    let successfulPicks = 0;

    const shuffledUsers = [...demoUsers].sort(() => Math.random() - 0.5);

    for (let userId of shuffledUsers) {
      if (successfulPicks >= quantity) break;

      const state = getState();
      if (!state || !["waiting", "countdown"].includes(state.state)) {
        console.log("⚠️ Game started early");
        break;
      }

      const takenCards = new Set((state.cards || []).map((c) => c[0]));
      const availableCards = allCardIds.filter((c) => !takenCards.has(c));

      if (availableCards.length === 0) break;

      const cardId =
        availableCards[Math.floor(Math.random() * availableCards.length)];

      socket.emit("pick", {
        room_id: roomId,
        user_id: userId,
        card_id: cardId,
        bet_amount: state.bet_amount || 0,
      });

      if (!userPickedCards[userId]) userPickedCards[userId] = [];
      userPickedCards[userId].push({
        cardId,
        numbers: allCards[cardId],
      });

      if (!resultSummary[userId]) resultSummary[userId] = [];
      resultSummary[userId].push(cardId);

      successfulPicks++;
      await sleep(200);
    }

    console.log("🚀 Monitoring bingo...");
    await monitorBingo(socket, roomId, userPickedCards);

    if (game < games - 1) {
      console.log("⏳ Waiting next game...");
      await waitForState(socket, ["waiting"]);
    }
  }

  socket.disconnect();
  return resultSummary;
}

// -------------------- API --------------------
app.post("/play", async (req, res) => {
  const { roomId, quantity, games, callbackUrl } = req.body;

  res.json({ success: true, message: "Job started" });

  (async () => {
    try {
      const result = await playGames(roomId, quantity, games);

      if (callbackUrl) {
        await fetch(callbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            success: true,
            gamesPlayed: games,
            pickedCards: result,
          }),
        });
      }
    } catch (err) {
      if (callbackUrl) {
        await fetch(callbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            success: false,
            error: err.message,
          }),
        });
      }
    }
  })();
});

app.listen(PORT, () => {
  console.log(`🚀 Game bot server running on port ${PORT}`);
});