import time
import firebase_admin
from firebase_admin import credentials, db
from datetime import datetime
import os

firebase_key_path = os.getenv("FIREBASE_KEY_PATH", "firebase_key.json")

cred = credentials.Certificate(firebase_key_path)

firebase_admin.initialize_app(cred, {
    "databaseURL": "https://friday-b92f9-default-rtdb.firebaseio.com/"
})

ADMIN_IDS = [
    int(x) for x in os.getenv("ADMIN_IDS", "").split(",") if x
]
users_ref = db.reference("/users")
rooms_ref = db.reference("/rooms")
def is_admin(uid):
    return int(uid) in ADMIN_IDS

def get_all_users():
    ref = db.reference("users")
    data = ref.get()
    return list(data.keys()) if data else []
def get_user(uid):
    return users_ref.child(uid).get()

async def get_user_lang(uid):
    """Helper to fetch user language from Firebase"""
    user = get_user(str(uid))
    return user.get("lang", "en") if user else "am"
def update_user_lang(uid: str, lang: str):
    """Update the user's preferred language in the database (rdtbs)"""
    user_ref = db.reference(f"users/{uid}")
    if user_ref.get():
        user_ref.update({"lang": lang})
def create_user(user, phone, lang):

    uid = str(user.id)

    now = datetime.utcnow().isoformat()

    users_ref.child(uid).set({
        "balance": 0,
        "createdAt": now,
        "gamesPlayed": 0,
        "gamesWon": 0,
        "lang": lang,
        "noreferral": True,
        "phoneNumber": phone,
        "telegramId": uid,
        "totalWinnings": 0,
        "updatedAt": now,
        "username": user.username
    })
from firebase_admin import db
from datetime import datetime
import uuid


def add_deposit(uid, amount, status="approved"):
    """
    Create a deposit record in Firebase.
    """

    if not amount or float(amount) <= 0:
        return False, "Invalid deposit amount."

    deposit_id = str(uuid.uuid4())

    deposit_data = {
        "id": deposit_id,
        "userId": str(uid),
        "amount": float(amount),
        "status": status,  # "pending", "approved", "rejected"
        "date": datetime.utcnow().isoformat()
    }

    try:
        ref = db.reference(f"deposits/{deposit_id}")
        ref.set(deposit_data)

        return True, deposit_data

    except Exception as e:
        return False, str(e)

def update_balance(uid, amount):

    user = get_user(uid)

    if not user:
        return
    
    new_balance = user.get("balance", 0) + amount

    users_ref.child(uid).update({
        "balance": new_balance,
        "updatedAt": datetime.utcnow().isoformat()
    })
    if amount > 0 :
        add_deposit(uid,amount)


def parse_date(date_str):
    """Safely parse ISO date strings"""
    try:
        return datetime.fromisoformat(date_str)
    except Exception:
        return None


def check_withdraw_eligibility(uid,amount):
    # ===========================================
    # 🔍 STEP 1: Get ALL deposits for user
    # ===========================================
    deps_ref = db.reference("deposits")
    deps = deps_ref.get()

    if not deps:
        return False, "❌ You must deposit at least once before withdrawing."

    user_deposits = [
        d for d in deps.values()
        if str(d.get("userId")) == str(uid)
    ]

    if len(user_deposits) == 0:
        return False, "❌ You must deposit at least once before withdrawing."

    # ===========================================
    # 🔍 STEP 2: Find last deposit date
    # ===========================================
    valid_deposits = [
        d for d in user_deposits if d.get("date")
    ]

    if not valid_deposits:
        return False, "❌ Invalid deposit data."

    last_deposit = sorted(
        valid_deposits,
        key=lambda x: parse_date(x["date"]) or datetime.min,
        reverse=True
    )[0]

    last_deposit_date = parse_date(last_deposit["date"])
    if not last_deposit_date:
        return False, "❌ Invalid deposit date."

    # ===========================================
    # 🔍 STEP 3: Get user lastWinDate
    # ===========================================
    user_ref = db.reference(f"users/{uid}")
    user = user_ref.get()

    if not user or not user.get("lastWinDate"):
        return False, "❌ You must win at least one game before withdrawing."
    try:
        amount = int(amount)  
    except:
        return False,
    if amount > user.get("balance"):
        return False, "❌ You donot have enough amount."
    last_win_date = parse_date(user["lastWinDate"])
    if not last_win_date:
        return False, "❌ Invalid win date."


    return True, None
import re
def extract_url_from_text(text):
    """
    Extract valid receipt URL from text.
    Supports:
    - Ethiotelecom receipts
    - CBE receipts
    """
    pattern = r"https:\/\/(?:transactioninfo\.ethiotelecom\.et\/receipt\/[A-Z0-9]+|apps\.cbe\.com\.et:100\/\?id=[A-Z0-9]+)"
    
    match = re.search(pattern, text, re.IGNORECASE)
    return match.group(0) if match else None


def check_receipt_stub(text):
    """
    Validate receipt:
    1. Extract URL
    2. Check if already used
    """

    # ===========================================
    # 🔍 STEP 1: Extract URL
    # ===========================================
    url = extract_url_from_text(text)

    if not url:
        return False, "❌ No valid receipt link found."

    # ===========================================
    # 🔍 STEP 2: Check duplicates
    # ===========================================
    deposits_ref = db.reference("deposits")
    deposits = deposits_ref.get()

    if deposits:
        for d in deposits.values():
            if d.get("url") == url:
                return False, "❌ This receipt has already been used."

    return True, url
#---------------------------------------
def get_available_rooms():
    rooms_data = rooms_ref.get()

    available_rooms = []

    if not rooms_data:
        return []

    for room_id, room in rooms_data.items():

        if (
            room.get("status") == "active" and
            room.get("gameStatus") == "waiting" and
            not room.get("isDemoRoom", False)
        ):
            available_rooms.append({
                "id": room_id,
                "name": room.get("name", room_id),
                "bet": room.get("betAmount", 0),
                "players": room.get("currentPlayers", 0),
                "max": room.get("maxPlayers", 0)
            })

    return available_rooms
def get_room_state(room_id):
    room_ref = db.reference(f"/rooms/{room_id}")
    room = room_ref.get()

    if not room:
        return None

    players = room.get("bingoCards", {})
    current_players = len(players)

    state = {
        "room_id": room_id,
        "name": room.get("name"),
        "status": room.get("status"),  # active / inactive
        "game_status": room.get("gameStatus"),  # waiting, countdown, playing, ended
        "bet_amount": room.get("betAmount"),
        "players": current_players,
        "max_players": room.get("maxPlayers"),
        "is_full": current_players >= room.get("maxPlayers", 0),
        "can_start": current_players >= 2 and room.get("gameStatus") == "waiting",
        "countdown": room.get("countdown", 0),
        "created_by": room.get("createdBy"),
        "created_at": room.get("createdAt"),
    }

    return state
def set_room(room_id,state):
    db.reference(f"/rooms/{room_id}").update({
            "gameStatus": state
        })