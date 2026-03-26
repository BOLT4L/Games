import time
import firebase_admin
from firebase_admin import credentials, db
import datetime
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

    now = datetime.datetime.utcnow().isoformat()

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


def update_balance(uid, amount):

    user = get_user(uid)

    if not user:
        return

    new_balance = user.get("balance", 0) + amount

    users_ref.child(uid).update({
        "balance": new_balance,
        "updatedAt": datetime.datetime.utcnow().isoformat()
    })

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