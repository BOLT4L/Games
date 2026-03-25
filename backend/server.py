from flask import Flask, jsonify, request
from worker import ROOM_RUNTIME, pick_card, unpick_card, bingo_called , get_room_cards_response
from flask_cors import CORS

app = Flask(__name__)
CORS(app) 
# API endpoint
@app.route('/room/<room_id>/state', methods=['GET'])
def get_room_state(room_id):
    runtime = ROOM_RUNTIME.get(room_id)

    if not runtime:
        return jsonify({
            "room_id": room_id,
            "exists": False,
            "message": "Room not initialized"
        }), 404




    return jsonify({
        "room_id": room_id,
        "players": runtime.get("players", []),
        "bet_amount":runtime.get("betAmount",0),
        "cards": get_room_cards_response(room_id),
        "pot": runtime.get("pot", 0),
        "drawn_numbers": runtime.get("drawn_numbers", []),
        "countdown": runtime.get("countdown", 0),
        "state": runtime.get("state"),
        "winners": runtime.get("winners", []),
        "winner_cards":runtime.get("winner_cards",[])
    })
# Root route (optional)
@app.route('/room/<room_id>/pick', methods=['POST'])
def pick(room_id):
    data = request.json
    bet_amount = data.get("bet_amount")
    user_id = data.get("user_id")
    card_id = data.get("card_id")

    success = pick_card(room_id, user_id, card_id,bet_amount)

    return jsonify({
        "success": success
    })
@app.route('/room/<room_id>/unpick', methods=['POST'])
def unpick(room_id):
    data = request.json

    user_id = data.get("user_id")
    card_id = data.get("card_id")

    success = unpick_card(room_id, user_id, card_id)

    return jsonify({
        "success": success
    })
@app.route('/room/<room_id>/bingo', methods=['POST'])
def bingo(room_id):
    data = request.json

    user_id = data.get("user_id")
    card_id = data.get("card_id")
    pattern = data.get("pattern")  # list of numbers

    success = bingo_called(room_id, card_id, pattern, user_id)

    return jsonify({
        "bingo": success
    })

from util import get_user
@app.route('/user/<user_id>', methods=['GET'])
def get_user_api(user_id):

    user = get_user(user_id)

    if not user:
        return jsonify({
            "exists": False,
            "message": "User not found"
        }), 404

    return jsonify({
        "exists": True,
        "user_id": user_id,
        "balance": user.get("balance", 0),
        "username": user.get("username"),
        "phone": user.get("phoneNumber"),
        "gamesPlayed": user.get("gamesPlayed", 0),
        "gamesWon": user.get("gamesWon", 0),
        "totalWinnings": user.get("totalWinnings", 0),
        "lang": user.get("lang", "en")
    })
# Run server
import threading
from worker import game_worker

def start_worker():
    t = threading.Thread(target=game_worker, daemon=True)
    t.start()

if __name__ == '__main__':
    start_worker()
    app.run(host='0.0.0.0', port=3000)