import time
import json
from util import *
ROOM_RUNTIME = {
        "room0" :{
            "players": [],
            "cards": {},
            "pot": 0,
            "betAmount":10,
            "state":"waiting",
            "drawn_numbers": [],
            "bingo_locked": False,
            "drawing_stopped": False,
        },
        "room1" :{
            "players": [],
            "cards": {},
            "pot": 0,
            "betAmount":20,
            "state":"waiting",
            "drawn_numbers": [],
            "bingo_locked": False,
            "drawing_stopped": False,
        },
        "room2" :{
            "players": [],
            "cards": {},
            "pot": 0,
            "betAmount":50,
            "state":"waiting",
            "drawn_numbers": [],
            "bingo_locked": False,
            "drawing_stopped": False,
        },
        "room3" :{
            "players": [],
            "cards": {},
            "pot": 0,
            "betAmount":100,
            "state":"waiting",
            "drawn_numbers": [],
            "bingo_locked": False,
            "drawing_stopped": False,
        },

}

# Load available cards from cards.json
with open("cards.json", "r") as f:
    AVAILABLE_CARDS = json.load(f)
def game_worker():
    print("Game worker started...")

    while True:
        try:
            process_rooms()
        except Exception as e:
            print("Worker error:", e)

        time.sleep(0.3)

def process_rooms():
    rooms = ROOM_RUNTIME

    if not rooms:
        return

    for room_id, room in rooms.items():


        state = room.get("state")

        if state == "waiting":
            handle_waiting(room_id)

        elif state == "countdown":
            handle_countdown(room_id)

        elif state == "playing":
            handle_playing(room_id)

        elif state == "ended":
            handle_ended(room_id)

def handle_waiting(room_id):
    runtime = ROOM_RUNTIME.get(room_id)

    if not runtime:
        return

    players = runtime.get("players", [])

    if len(players) >= 2:
        print(f"{room_id} → countdown")
        runtime["state"] = "countdown"
        runtime["countdown"] = 30
        runtime["state_started_at"] = time.time()

        

def handle_countdown(room_id):
    runtime = ROOM_RUNTIME.get(room_id)
    if not runtime:
        return

    elapsed = time.time() - runtime["state_started_at"]
    remaining = 30 - int(elapsed)

    runtime["countdown"] = max(remaining, 0)


    if remaining <= 0:

        print(f"{room_id} → playing")

        cards = runtime.get("cards", {})

        
        bet = 10

        player_cards = {}

        # count cards per player
        for card in cards.values():
            uid = card["player_id"]
            player_cards[uid] = player_cards.get(uid, 0) + 1

        total_cards = 0

        for uid, count in player_cards.items():


            deduct_user_balance(uid, bet)

            increment_games_played(uid)

            total_cards += count

        runtime["pot"] = total_cards * bet * 0.8
        runtime["state"] = "playing"
        runtime["drawn_numbers"] = []
        runtime["last_draw_time"] = time.time()

def handle_playing(room_id):

    runtime = ROOM_RUNTIME.get(room_id)
    if not runtime:
        return
    if runtime.get("bingo_locked"):
        now = time.time()

        if now - runtime.get("bingo_time", 0) > 1.0:
            print(f"{room_id} → ending (bingo window closed)")
            end_game(room_id)
            return
    if runtime.get("drawing_stopped"):
        return

    now = time.time()

    if now - runtime["last_draw_time"] < 2:
        return

    number = draw_number(runtime)

    if number is None:
        end_game(room_id)
        return

    runtime["drawn_numbers"].append(number)
    runtime["last_draw_time"] = now


def handle_ended(room_id):
    runtime = ROOM_RUNTIME.get(room_id)
    if not runtime:
        return

    elapsed = time.time() - runtime["state_started_at"]

    if elapsed < 5:
        return
    winners = runtime.get("winners", [])
    if winners:
        # ✅ Pay players
        process_payout(room_id)
    else:
        # ✅ Send to company
        process_house_payout(room_id, runtime)
    

    # reset runtime
    runtime.update({
        "state": "waiting",
        "players": [],
        "cards": {},
        "pot": 0,
        "drawn_numbers": [],
        "bingo_locked": False,
        "drawing_stopped": False,
        "winners": [],
        "winner_cards": [],
        "payout_done": False,
        "house_payout_done": False,
        "countdown": 0
    })
#------------------------------------------------------------------------------------------------------
import random

def draw_number(runtime):
    all_numbers = set(range(1, 76))
    drawn = set(runtime["drawn_numbers"])

    remaining = list(all_numbers - drawn)

    if not remaining:
        return None

    return random.choice(remaining)
def bingo_called(room_id, card_id, pattern_numbers,player_id):

    runtime = ROOM_RUNTIME.get(room_id)
    if not runtime:
        print("no room")
        return False

    # game must be playing
    if runtime.get("state") != "playing":
        print("state not on playing ")
        return False

    cards = runtime.get("cards", {})
    if card_id not in cards:
        print("card not found")
        return False

    card = cards[card_id]
    card_numbers = card["numbers"]
    print(card_numbers)

    # check numbers belong to card
    for n in pattern_numbers:
        if n not in card_numbers:
            print("pattern not in the card")
            return False

    # check numbers were drawn
    drawn = runtime.get("drawn_numbers", [])
    # keep only numbers that are actually drawn
    valid_drawn_pattern = [n for n in pattern_numbers if n in drawn]

    # require at least 5 valid numbers
    if len(valid_drawn_pattern) < 4:
        print("not enough drawn numbers for bingo")
        return False

    # check pattern validity
    if not check_winning_pattern(card_numbers, pattern_numbers):
        print("card doesnot win ")
        return False

    now = time.time()

    # first winner
    if not runtime.get("bingo_locked"):

        runtime["bingo_locked"] = True
        runtime["drawing_stopped"] = True
        runtime["bingo_time"] = time.time()
        runtime["winners"] = [player_id]
        runtime["winner_cards"] = [
            {
                "card_id": card_id,
                "pattern": pattern_numbers,
            }
        ]

        print("bingoed")
        return True

    # additional winners within window
    if now - runtime["bingo_time"] <= 1.0:
        if player_id not in runtime.get("winners", []):
            runtime["winners"].append(player_id)
        existing_cards = [c["card_id"] for c in runtime.get("winner_cards", [])]

        if card_id not in existing_cards:
            runtime["winner_cards"].append({
                "card_id": card_id,
                "pattern": pattern_numbers,
            })

        return True

    return False
def check_winning_pattern(card, pattern):
    """
    card: list of 25 numbers
    pattern: numbers the player claims for bingo
    """

    marked = set(pattern)


    # ROWS
    rows = [
        [card[0], card[1], card[2], card[3], card[4]],
        [card[5], card[6], card[7], card[8], card[9]],
        [card[10], card[11], card[12], card[13], card[14]],
        [card[15], card[16], card[17], card[18], card[19]],
        [card[20], card[21], card[22], card[23], card[24]],
    ]

    for row in rows:
        if all(num in marked for num in row):
            return True

    # COLUMNS
    columns = [
        [card[0], card[5], card[10], card[15], card[20]],
        [card[1], card[6], card[11], card[16], card[21]],
        [card[2], card[7], card[12], card[17], card[22]],
        [card[3], card[8], card[13], card[18], card[23]],
        [card[4], card[9], card[14], card[19], card[24]],
    ]

    for col in columns:
        if all(num in marked for num in col):
            return True

    # DIAGONALS
    diag1 = [card[0], card[6], card[12], card[18], card[24]]
    diag2 = [card[4], card[8], card[12], card[16], card[20]]

    if all(num in marked for num in diag1):
        return True

    if all(num in marked for num in diag2):
        return True

    # FOUR CORNERS
    corners = [card[0], card[4], card[20], card[24]]

    if all(num in marked for num in corners):
        return True

    return False

def end_game(room_id):

    runtime = ROOM_RUNTIME.get(room_id)
    if not runtime:
        return
    runtime["state"] = "ended"
    runtime["drawing_stopped"] = True
    runtime["state_started_at"] = time.time()


def process_payout(room_id):
    runtime = ROOM_RUNTIME.get(room_id)
    if not runtime:
        return
    if runtime.get("payout_done"):
        return

    winners = runtime.get("winners", [])

    if not winners:
        print("No winners")
        runtime["payout_done"] = True
        return

    

    pot = runtime["pot"]

    share = pot / len(winners)
    for uid in winners:
        reward_user(uid, share)
        tx_ref = db.reference("/transactions").push()

        tx_ref.set({
            "user_id": uid,
            "amount": share,
            "type": "bingo_win",
            "room_id": room_id,
            "timestamp": time.time()
        })

    runtime["payout_done"] = True

    print("Payout complete")
def process_house_payout(room_id, runtime):
    if runtime.get("house_payout_done"):
        return

    
    pot = runtime["pot"]

    # Save transaction to company account
    tx_ref = db.reference("/transactions").push()

    tx_ref.set({
        "type": "house_win",
        "room_id": room_id,
        "amount": pot,
        "timestamp": time.time()
    })

    # Optional: track company balance
    company_ref = db.reference("/company")

    def update_company(data):
        if not data:
            data = {}
        data["balance"] = data.get("balance", 0) + pot
        data["totalEarnings"] = data.get("totalEarnings", 0) + pot
        return data

    company_ref.transaction(update_company)

    runtime["house_payout_done"] = True

    print(f"House collected {pot} from room {room_id}")
def deduct_user_balance(user_id, amount):
    ref = db.reference(f"/users/{user_id}/balance")

    def update_balance(current):
        if current is None:
            current = 0

        if current < amount:
            return None  # ✅ abort transaction safely

        return current - amount

    result = ref.transaction(update_balance)

    # 🔥 check if transaction succeeded
    if result is None:
        raise Exception("Insufficient balance")

    return result

def increment_games_played(user_id):

    ref = db.reference(f"/users/{user_id}/gamesPlayed")

    def update(val):
        return (val or 0) + 1

    ref.transaction(update)

def reward_user(user_id, amount):

    user_ref = db.reference(f"/users/{user_id}")

    def transaction(user):

        if not user:
            return user

        user["balance"] = user.get("balance",0) + amount
        user["gamesWon"] = user.get("gamesWon",0) + 1
        user["totalWinnings"] = user.get("totalWinnings",0) + amount

        return user

    user_ref.transaction(transaction)

import json

  # assumed format: { "card_id": [25 numbers], ... }

def pick_card(room_id, user_id, card_id,bet_amount):
    """
    Assign a card to a player in a room with validation.
    """
    # 1️⃣ Check if card exists in available cards
    if card_id not in AVAILABLE_CARDS:
        print(f"Card {card_id} does not exist in cards.json")
        return False

    # 2️⃣ Check if user exists in DB
    user_ref = db.reference(f"/users/{user_id}").get()
    if not user_ref:
        print(f"User {user_id} does not exist")
        return False
    
    user_balance = user_ref.get("balance", 0)

    if user_balance < bet_amount:
        print(f"User {user_id} has insufficient balance")
        return False
    # 3️⃣ Initialize room runtime if missing
   
    

    runtime = ROOM_RUNTIME[room_id]

    # 4️⃣ Check if user already has a card in this room
    for c_id, c_data in runtime["cards"].items():
        if c_data["player_id"] == user_id:
            print(f"User {user_id} already has card {c_id} in room {room_id}")
            return False

    # 5️⃣ Check if card is already picked by someone else
    if card_id in runtime["cards"]:
        print(f"Card {card_id} already picked in room {room_id}")
        return False

    # ✅ Assign card
    runtime["cards"][card_id] = {
        "player_id": user_id,
        "numbers": AVAILABLE_CARDS[card_id]
    }

    # Add player to players list if not already there
    if user_id not in runtime["players"]:
        runtime["players"].append(user_id)

    print(f"Player {user_id} successfully picked card {card_id} in room {room_id}")
    return True

def unpick_card(room_id, user_id, card_id):
    """
    Remove a card from a room runtime.
    
    room_id: str, the room ID
    user_id: str, the player ID
    card_id: str, the card ID to remove
    """
    runtime = ROOM_RUNTIME.get(room_id)

    if not runtime:
        print(f"Room {room_id} does not exist in runtime")
        return False

    cards = runtime.get("cards", {})

    # Check if card exists
    if card_id not in cards:
        print(f"Card {card_id} does not exist in room {room_id}")
        return False

    # Check if card belongs to the user
    if cards[card_id]["player_id"] != user_id:
        print(f"Card {card_id} does not belong to user {user_id}")
        return False

    # Remove the card
    del cards[card_id]

    # Remove player from players list if they have no more cards
    user_has_other_cards = any(c["player_id"] == user_id for c in cards.values())
    if not user_has_other_cards and user_id in runtime["players"]:
        runtime["players"].remove(user_id)
    
    if len(runtime["players"]) < 2:
        runtime["state"] = "waiting"
        runtime["countdown"] = 0  # stop the countdown
        
        print(f"Room {room_id} has fewer than 2 players, set to waiting state")

    print(f"User {user_id} unpicked card {card_id} from room {room_id}")
    return True

def get_room_cards_response(room_id):
    if room_id not in ROOM_RUNTIME:
        return []

    runtime = ROOM_RUNTIME[room_id]

    result = []

    for card_id, card_data in runtime["cards"].items():
        result.append([card_id, card_data["player_id"]])

    return result