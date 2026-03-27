import express from "express";
import bodyParser from "body-parser";
import { io } from "socket.io-client";
import fetch from "node-fetch"; // for Node 18-, otherwise native fetch works
import fs from "fs";
import { Console } from "console";

const app = express();
const PORT = process.env.PORT || 4000;
const API_BASE = "https://cicely-pedodontic-nonnegligibly.ngrok-free.dev";

app.use(bodyParser.json());

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
// Wrap your autoBet function in Node.js
async function autoBet(roomId, quantity, auto) {
  const demoUsers = ["1","2","3","4","5","6","7","8","9","10"];

  const storedCardsFile = "autoCards.json";
  let storedCards = {};
  if (fs.existsSync(storedCardsFile)) {
    storedCards = JSON.parse(fs.readFileSync(storedCardsFile, "utf-8"));
  }

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
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      body: JSON.stringify({ user_id: userId, card_id: cardId, bet_amount: 0 })
    });
    const data = await res.json();
    return data.success;
  }

  const allCards = JSON.parse(fs.readFileSync("cards.json", "utf-8"));
  const allCardIds = Object.keys(allCards);

  // 🔥 ADD THIS
  const maxTurns = auto ? 5 : 1;

  for (let turn = 0; turn < maxTurns; turn++) {
    console.log(`Turn ${turn + 1}/${maxTurns}`);

    const roomState = await fetchRoomState();

    if (!roomState || !roomState.cards) return {};

    if (!["waiting", "countdown"].includes(roomState.state)) {
      console.log("Room not valid, stopping...");
      break;
    }

    // ✅ random users EACH TURN
    const shuffledUsers = [...demoUsers].sort(() => Math.random() - 0.5);

    for (let userId of shuffledUsers) {
      const userCards = roomState.cards
        .filter(c => c[1] === userId)
        .map(c => c[0]);

      let remaining = quantity - userCards.length;
      if (remaining <= 0) continue;

      const latestState = await fetchRoomState();

      if (!latestState || !["waiting", "countdown"].includes(latestState.state)) {
        console.log("Room stopped mid-process");
        return {};
      }

      const takenCards = new Set(latestState.cards.map(c => c[0]));

      // ✅ stored cards first
      if (auto && storedCards[userId]) {
        for (let cardId of storedCards[userId]) {
          if (!takenCards.has(cardId)) {
            const success = await pickCard(userId, cardId);
            if (success) {
              takenCards.add(cardId);
              remaining--;
            }
            if (remaining <= 0) break;
            await sleep(1500); // 🔥 delay per pick
          }
        }
      }

      // ✅ random picking
      let availableCards = allCardIds.filter(c => !takenCards.has(c));

      while (remaining > 0 && availableCards.length > 0) {
        const idx = Math.floor(Math.random() * availableCards.length);
        const cardId = availableCards[idx];

        const success = await pickCard(userId, cardId);

        if (success) {
          takenCards.add(cardId);

          if (auto) {
            if (!storedCards[userId]) storedCards[userId] = [];
            storedCards[userId].push(cardId);
          }

          remaining--;
        }

        availableCards.splice(idx, 1);

        await sleep(1500); // 🔥 delay
      }
    }

    // 🔥 delay between turns
    if (auto) {
      console.log("Waiting before next turn...");
      await sleep(2000);
    } else {
      break; // manual mode → only 1 turn
    }
  }

  if (auto) {
    fs.writeFileSync(storedCardsFile, JSON.stringify(storedCards, null, 2));
  }

  return storedCards;
}
// ---------------- POST /autobet ----------------
app.post("/autobet", async (req, res) => {
  const { roomId, quantity, auto, } = req.body;

  if (!roomId || !quantity ) {
    return res.status(400).json({ error: "roomId, quantity required" });
  }

  try {
    const result = await autoBet(roomId, quantity, auto);
    res.json({ success: true, pickedCards: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`AutoBet server running on port ${PORT}`);
});