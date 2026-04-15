from flask import Flask, jsonify, request
from worker import  pick_card, unpick_card, bingo_called , get_room_cards_response,load_runtime
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room,leave_room

import worker

ROOM_RUNTIME = worker.ROOM_RUNTIME
app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")
# Web socket 
@socketio.on('join_room')
def handle_join(data):
    room_id = data.get("room_id")
    print(f"[JOIN] Client joined room: {room_id}")   # 👈 ADD THIS

    join_room(room_id)

    runtime = ROOM_RUNTIME.get(room_id)
    if runtime:
        print(f"[JOIN] Sending initial state to {room_id}")  # 👈 ADD
        emit("state_update", build_room_state(room_id), room=room_id, namespace='/')


@socketio.on("leave_room")
def handle_leave(data):
    room_id = data.get("room_id")
    leave_room(room_id)
    emit("message", f"User left {room_id}", room=room_id)

@socketio.on("pick")
def handle_pick(data):
    room_id = data.get("room_id")
    user_id = data.get("user_id")
    card_id = data.get("card_id")
    bet_amount = data.get("bet_amount")

    success = pick_card(room_id, user_id, card_id, bet_amount)

    if success:
        from worker import broadcast_room
        broadcast_room(socketio, room_id)
    emit("pick_result", {
        "success": success,
        "card_id": card_id
    }, room=request.sid)
@socketio.on("unpick")
def handle_unpick(data):
    room_id = data.get("room_id")
    user_id = data.get("user_id")
    card_id = data.get("card_id")

    success = unpick_card(room_id, user_id, card_id)

    if success:
        from worker import broadcast_room
        broadcast_room(socketio, room_id)

    emit("unpick_result", {
        "success": success,
        "card_id": card_id
    }, room=request.sid)

@socketio.on("bingo")
def handle_bingo(data):
    room_id = data.get("room_id")
    user_id = data.get("user_id")
    card_id = data.get("card_id")
    pattern = data.get("pattern")

    success = bingo_called(room_id, card_id, pattern, user_id)

    if success:
        from worker import broadcast_room
        broadcast_room(socketio, room_id)

    emit("bingo_result", {
        "success": success
    }, room=request.sid)

def build_room_state(room_id):
    runtime = ROOM_RUNTIME.get(room_id)

    if not runtime:
        return {
            "room_id": room_id,
            "exists": False
        }

    return {
        "room_id": room_id,
        "players": runtime.get("players", []),
        "bet_amount": runtime.get("betAmount", 0),
        "cards": get_room_cards_response(room_id),
        "pot": runtime.get("pot", 0),
        "drawn_numbers": runtime.get("drawn_numbers", []),
        "countdown": runtime.get("countdown", 0),
        "state": runtime.get("state"),
        "winners": runtime.get("winners", []),
        "winner_cards": runtime.get("winner_cards", [])
    }

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


    success, reason = pick_card(room_id, user_id, card_id, bet_amount)

    if success:
        from worker import broadcast_room
        broadcast_room(socketio, room_id)

    return jsonify({
        "success": success,
        "reason": reason
    })
@app.route('/room/<room_id>/unpick', methods=['POST'])
def unpick(room_id):
    data = request.json

    user_id = data.get("user_id")
    card_id = data.get("card_id")

    success = unpick_card(room_id, user_id, card_id)

    if success:
        from worker import broadcast_room
        broadcast_room(socketio, room_id)   # 🔥 ADD THIS


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


    if success:
        from worker import broadcast_room
        broadcast_room(socketio, room_id)   # 🔥 ADD THIS

    return jsonify({
        "success": success
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
    socketio.start_background_task(game_worker, socketio)
if __name__ == '__main__':
    
    start_worker()
    load_runtime()
    socketio.run(app, host="0.0.0.0", port=3000, debug=False, allow_unsafe_werkzeug=True)