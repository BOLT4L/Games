import firebase_admin
from firebase_admin import credentials, db

from telegram import (
    Update, ReplyKeyboardMarkup, KeyboardButton,
    InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
)

from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    CallbackQueryHandler, filters, ContextTypes, ConversationHandler
)
from  util import *
import util

import os
from dotenv import load_dotenv
load_dotenv()
# ---------------- CONFIG ----------------

CHOOSING_DEPOSIT_AMOUNT, WAITING_DEPOSIT_RECEIPT = range(2)
SEND_TARGET, SEND_CONTENT = range(100, 102)
WAITING_WITHDRAW_AMOUNT = range(2, 3)
# ---------------- DEMO AUTO BET ----------------
DEMO_ROOM, DEMO_QUANTITY, DEMO_GAMES = range(10, 13)

BOT_TOKEN = os.getenv("BOT_TOKEN")

ADMIN_IDS = [
    int(x) for x in os.getenv("ADMIN_IDS", "").split(",") if x
]

TELEBIRR_NUMBER = os.getenv("TELEBIRR_NUMBER")

WEB_APP_URL = os.getenv("WEB_APP_URL")
AUTOBET_API = os.getenv("AUTOBET_API")

# ---------------- TEXT ----------------
TEXT = {
    "en": {
        "welcome": "Welcome! Please share your contact to register.",
        "choose_lang": "Choose language",
        "deposit": "Deposit",
        "withdraw": "Withdraw",
        "play": "Play Game",
        "amount": "Choose amount",
        "send_receipt": "Send SMS receipt screenshot or text.",
        "withdraw_amount": "Enter withdraw amount",
        "not_registered": "Please register first",
        "request_sent" : " Thanks your request has been sent .",
        "not_eligible" : "Not eligible for withdraw",
        "change_lang": "Change Language",
        "menu_text": "Main Menu",
        "already_registered": "You are already registered.",
        "registration_success": "Registration successful!",
        "unknown_option": "Unknown option.",
        "no_rooms": "No rooms available right now.",
        "room_selected": "Room {room_id} selected. Tap below to enter:"
    },

    "am": {
        "welcome": "እንኳን ደህና መጡ። ለመመዝገብ ስልክ ቁጥር ያጋሩ።",
        "choose_lang": "ቋንቋ ይምረጡ",
        "deposit": "ገንዘብ አስገባ",
        "withdraw": "ገንዘብ አውጣ",
        "play": "ጨዋታ ጀምር",
        "amount": "መጠን ይምረጡ",
        "send_receipt": "የSMS ደረሰኝ ይላኩ",
        "withdraw_amount": "የሚወጣ መጠን",
        "not_registered": "እባክዎ መመዝገብ ያስፈልጋል",
        "request_sent" : "እናመሰግናለን ጥያቄዎ በተሳካ ሁኔታ ተልኳል ::",
        "not_eligible" : "ገንዘብ ለማውጣት ብቁ አይደሉም",
        "change_lang": "ቋንቋ ቀይር",
        "menu_text": "ዋና ማውጫ",
        "already_registered": "ከዚህ በፊት ተመዝግበዋል።",
        "registration_success": "ምዝገባ ተሳክቷል!",
        "unknown_option": "ያልታወቀ ምርጫ",
        "no_rooms": "አሁን ምንም ክፍሎች የሉም",
        "room_selected": "ክፍል {room_id} ተመርጧል። ከታች ይግቡ:"
    },

    "om": {
        "welcome": "Baga nagaan dhuftan. Lakkoofsa bilbilaa qoodaa.",
        "choose_lang": "Afaan filadhaa",
        "deposit": "Maallaqa galchuu",
        "withdraw": "Maallaqa baasuu",
        "play": "Tapha jalqabi",
        "amount": "Hanga filadhaa",
        "send_receipt": "SMS receipt ergaa",
        "withdraw_amount": "Hanga baasuu galchi",
        "not_registered": "Mee jalqaba galmaa'i",
        "request_sent": "Galatoomaa, gaaffiin keessan milkaa'inaan ergameera",
        "not_eligible" : "Maallaqa baasuuf ulaagaa hin guutu",
        "change_lang": "Afaan Jijjiiri",
        "menu_text": "Menu Guddaa",
        "already_registered": "Dursee galmaa'aniittu.",
        "registration_success": "Galmeen milkaa'eera!",
        "unknown_option": "Filannoo hin beekamne",
        "no_rooms": "Amma kutaan hin jiru",
        "room_selected": "Kutaa {room_id} filatameera. Gadiin seeni:"
    }
}
ROOM_NAMES = {
    "en": {"room0": "Room One", "room1": "Room Two", "room2": "Room Three", "room3": "Room Four"},
    "am": {"room0": "ክፍል አንድ", "room1": "ክፍል ሁለት", "room2": "ክፍል ሶስት", "room3": "ክፍል አራት"},
    "om": {"room0": "Kutaa Tokko", "room1": "Kutaa Lama", "room2": "Kutaa Sadii", "room3": "Kutaa Afur"}
}
# ---------------- START ----------------

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = str(update.effective_user.id)

    try:
        user = get_user(uid)
    except Exception as e:
        print(f"Error fetching user: {e}")
        user = None

    # ✅ USER EXISTS
    if user:
        context.user_data["lang"] = user.get("lang", "am")
        await update.message.reply_text(TEXT["am"]["already_registered"])
        return await main_menu(update, context)

    # ❌ USER DOES NOT EXIST → ask contact
    keyboard = [[KeyboardButton("📱 Share Contact", request_contact=True)]]

    await update.message.reply_text(
        TEXT["am"]["welcome"],
        reply_markup=ReplyKeyboardMarkup(keyboard, resize_keyboard=True, one_time_keyboard=True)
    )
# ---------------- LANGUAGE ----------------

async def language_selected(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    lang = query.data.split("_")[1]  # 'en', 'am', 'om'
    context.user_data["lang"] = lang

    # Update in database
    uid = str(query.from_user.id)
    update_user_lang(uid, lang)

    # Show main menu in selected language
    await main_menu(update, context, lang=lang)
# ---------------- CONTACT REGISTRATION ----------------

async def contact_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):

    user = update.effective_user
    uid = str(user.id)

    # CHECK IF USER EXISTS
    existing = get_user(uid)

    if existing:
        lang = context.user_data.get("lang", "en")
        await update.message.reply_text(TEXT[lang]["already_registered"])
        await main_menu(update, context)
        return

    contact = update.message.contact
    lang = context.user_data.get("lang", "en")

    create_user(user, contact.phone_number, lang)

    await update.message.reply_text(TEXT[lang]["registration_success"])

    await main_menu(update, context)

async def menu_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text
    uid = update.effective_user.id
    import util
    lang = await util.get_user_lang(uid)
    context.user_data["lang"] = lang

    if text == TEXT[lang]["deposit"]:
        return await start_deposit(update, context)

    elif text == TEXT[lang]["withdraw"]:
        return await start_withdraw(update, context)

    elif text == TEXT[lang]["play"]:
        return await show_rooms(update, context)

    elif text in ["Change Language", TEXT[lang].get("change_lang", "")]:
        return await change_language(update, context)

    else:
        await update.message.reply_text(TEXT[lang]["unknown_option"])

async def demo_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id

    # 🔒 Restrict access
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ You are not allowed to use this command.")
        return ConversationHandler.END

    await update.message.reply_text("Enter roomId (e.g., room1):")
    return DEMO_ROOM
async def demo_room(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data["demo_room"] = update.message.text.strip()
    await update.message.reply_text("Enter quantity (e.g., 3):")
    return DEMO_QUANTITY
async def demo_quantity(update: Update, context: ContextTypes.DEFAULT_TYPE):
    qty = update.message.text.strip()

    if not qty.isdigit():
        await update.message.reply_text("❌ Invalid number. Enter quantity again:")
        return DEMO_QUANTITY

    context.user_data["demo_quantity"] = int(qty)

    await update.message.reply_text("How many games:")
    return DEMO_GAMES
import requests
import json
import aiohttp

import asyncio

async def run_autobet(payload, chat_id, context):
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(AUTOBET_API, json=payload) as resp:
                result = await resp.json()

        if result.get("success"):
            await context.bot.send_message(
                chat_id,
                f"✅ Done!\nGames: {result.get('gamesPlayed')}\nCards: {result.get('pickedCards')}"
            )
        else:
            await context.bot.send_message(
                chat_id,
                f"❌ Failed: {result.get('error')}"
            )

    except Exception as e:
        await context.bot.send_message(chat_id, f"❌ Error: {str(e)}")


async def demo_games(update: Update, context: ContextTypes.DEFAULT_TYPE):
    games = update.message.text.strip()

    if not games.isdigit():
        await update.message.reply_text("❌ Invalid number. Enter again:")
        return DEMO_GAMES

    context.user_data["demo_games"] = int(games)

    payload = {
        "roomId": context.user_data.get("demo_room"),
        "quantity": context.user_data.get("demo_quantity"),
        "games": context.user_data.get("demo_games"),
    }

    # ✅ Respond immediately
    await update.message.reply_text("⏳ Auto games started in background...")

    # ✅ Run API in background (THIS IS THE KEY)
    asyncio.create_task(
        run_autobet(payload, update.effective_chat.id, context)
    )

    return ConversationHandler.END

import random
import time
from datetime import datetime, timedelta

# ---------------- DEMO USER MANAGEMENT ----------------
DEMO_AMOUNT, DEMO_USER_COUNT = range(20, 22)

async def add_demo_users_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ You are not allowed to use this command.")
        return ConversationHandler.END
    
    await update.message.reply_text("Enter amount to add for demo users:")
    return DEMO_AMOUNT

async def add_demo_users_amount(update: Update, context: ContextTypes.DEFAULT_TYPE):
    amt = update.message.text.strip()
    if not amt.isdigit():
        await update.message.reply_text("❌ Invalid number. Enter amount again:")
        return DEMO_AMOUNT
    context.user_data["demo_amount"] = int(amt)
    await update.message.reply_text("Enter number of users to add (1-30):")
    return DEMO_USER_COUNT

async def add_demo_users_count(update: Update, context: ContextTypes.DEFAULT_TYPE):
    count = update.message.text.strip()
    if not count.isdigit() or not (1 <= int(count) <= 30):
        await update.message.reply_text("❌ Invalid number. Enter number of users (1-30):")
        return DEMO_USER_COUNT

    count = int(count)
    amount = context.user_data.get("demo_amount")

    demo_user_ids = random.sample(range(1, 31), count)  # pick without repetition

    for uid in demo_user_ids:
        update_balance(str(uid), amount)
        # Log transaction
        tx_ref = db.reference("/transactions").push()
        tx_ref.set({
            "user_id": uid,
            "amount": amount,
            "type": "demo_credit",
            "timestamp": time.time()
        })

    await update.message.reply_text(
        f"✅ Added {amount} to {count} demo users: {demo_user_ids}"
    )
    return ConversationHandler.END

# ---------------- TRANSACTION & BALANCE STATS ----------------
async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    all_users_ref = db.reference("/users")
    transactions_ref = db.reference("/transactions")

    users = all_users_ref.get() or {}
    transactions = transactions_ref.get() or {}

    total_balance = sum(user.get("balance", 0) for user in users.values())
    highest_balance = max((user.get("balance", 0) for user in users.values()), default=0)

    total_deposit = sum(tx.get("amount", 0) for tx in transactions.values() if tx.get("type") == "deposit")
    total_withdraw = sum(tx.get("amount", 0) for tx in transactions.values() if tx.get("type") == "withdraw")

    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    day_ago = now - timedelta(days=1)

    daily_deposit = sum(
        tx.get("amount", 0)
        for tx in transactions.values()
        if tx.get("type") == "deposit" and datetime.utcfromtimestamp(tx.get("timestamp", 0)) >= day_ago
    )

    weekly_deposit = sum(
        tx.get("amount", 0)
        for tx in transactions.values()
        if tx.get("type") == "deposit" and datetime.utcfromtimestamp(tx.get("timestamp", 0)) >= week_ago
    )

    revenue = total_deposit - total_withdraw

    report = (
        f"📊 Stats:\n"
        f"Total Users Balance: {total_balance}\n"
        f"Highest User Balance: {highest_balance}\n"
        f"Total Deposit: {total_deposit}\n"
        f"Total Withdraw: {total_withdraw}\n"
        f"Daily Deposit: {daily_deposit}\n"
        f"Weekly Deposit: {weekly_deposit}\n"
        f"Revenue: {revenue}"
    )

    await update.message.reply_text(report)


async def demo_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Demo cancelled.")
    return ConversationHandler.END
# ---------------- MAIN MENU ----------------

async def main_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, lang=None):
    if not lang:
        lang = context.user_data.get("lang", "am")  # fallback to stored language

    # Determine chat_id depending on message or callback
    if hasattr(update, "callback_query") and update.callback_query:
        chat_id = update.callback_query.from_user.id
    else:
        chat_id = update.message.chat.id

    # Localized buttons
    keyboard = [
        [TEXT[lang]["deposit"], TEXT[lang]["withdraw"]],
        [TEXT[lang]["play"], "Change Language"]
    ]

    await context.bot.send_message(
        chat_id,
        TEXT[lang].get("menu_text", "Menu"),
        reply_markup=ReplyKeyboardMarkup(keyboard, resize_keyboard=True)
    )
#---------------------SEND message ------------

async def sendmessage_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id

    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ You are not authorized to use this command.")
        return ConversationHandler.END

    await update.message.reply_text(
        "📤 Enter the username (without @), Telegram ID, or type 'all' to message everyone.\n\nYou can send text or media next."
    )

    return SEND_TARGET
async def send_target_received(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data["target"] = update.message.text.strip()
    await update.message.reply_text("✉️ Now send the message (text, photo, video, document, etc.)")
    return SEND_CONTENT
async def send_content_received(update: Update, context: ContextTypes.DEFAULT_TYPE):
    target = context.user_data.get("target")

    # 🔹 get users
    if target == "all":
        users = get_all_users()  # implement this
    else:
        users = [target]

    for uid in users:
        try:
            # TEXT
            if update.message.text:
                await context.bot.send_message(uid, update.message.text)

            # PHOTO
            elif update.message.photo:
                await context.bot.send_photo(
                    uid,
                    photo=update.message.photo[-1].file_id,
                    caption=update.message.caption or ""
                )

            # VIDEO
            elif update.message.video:
                await context.bot.send_video(
                    uid,
                    video=update.message.video.file_id,
                    caption=update.message.caption or ""
                )

            # DOCUMENT
            elif update.message.document:
                await context.bot.send_document(
                    uid,
                    document=update.message.document.file_id,
                    caption=update.message.caption or ""
                )

        except Exception as e:
            print(f"Failed to send to {uid}: {e}")

    await update.message.reply_text("✅ Message sent.")
    return ConversationHandler.END
async def send_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("❌ Send message cancelled.")
    return ConversationHandler.END
# ---------------- RECEIPT CHECK ----------------
async def cancel_process(update, context, message):
    await update.message.reply_text(message)

    # clear temporary data
    context.user_data.pop("temp_deposit_amount", None)

    # go back to menu
    await main_menu(update, context)

    return ConversationHandler.END


def _amount_from_pending(data):
    a = data.get("amount")
    if isinstance(a, int):
        return a
    if isinstance(a, float):
        return int(a)
    s = str(a).strip()
    if s.isdigit():
        return int(s)
    return int(float(s))


async def apply_admin_resolution_ui(context: ContextTypes.DEFAULT_TYPE, data: dict):
    """Remove buttons on every admin copy and append a closed footer."""
    status = data.get("status")
    body = data.get("body_text", "")
    if status == "approved":
        suffix = "\n\n────────\n✅ Approved — request closed."
    elif status == "denied":
        suffix = "\n\n────────\n❌ Denied — request closed."
    else:
        suffix = "\n\n────────\n✔️ Closed."
    new_text = f"{body}{suffix}"
    for aid, msg in (data.get("messages") or {}).items():
        try:
            await context.bot.edit_message_text(
                chat_id=msg["chat_id"],
                message_id=msg["message_id"],
                text=new_text,
                reply_markup=None,
            )
        except Exception as e:
            print(f"admin message edit failed ({aid}): {e}")


async def broadcast_request_closed_to_admins(
    context: ContextTypes.DEFAULT_TYPE, data: dict, acting_admin_id: int
):
    label = "approved" if data.get("status") == "approved" else "denied"
    kind = "Deposit" if data.get("kind") == "dep" else "Withdraw"
    uid = data.get("uid", "?")
    amt = data.get("amount", "?")
    handler = str(acting_admin_id)
    try:
        chat = await context.bot.get_chat(acting_admin_id)
        if getattr(chat, "username", None):
            handler = f"@{chat.username}"
    except Exception:
        pass
    text = (
        f"ℹ️ {kind} request closed (already {label}).\n"
        f"User: {uid} · Amount: {amt}\n"
        f"Handled by: {handler}"
    )
    for admin_id in ADMIN_IDS:
        try:
            await context.bot.send_message(admin_id, text)
        except Exception as e:
            print(f"broadcast to admin {admin_id}: {e}")


async def start_deposit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Triggered by 'Deposit' button or /deposit command"""
    uid = update.effective_user.id
    lang = await get_user_lang(uid)
    context.user_data["lang"] = lang
    keyboard = [[InlineKeyboardButton(str(amt), callback_data=f"dep_{amt}")] 
                for amt in [50, 100, 200, 500, 1000]]
    
    await update.message.reply_text(
        TEXT[lang]["amount"],
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return CHOOSING_DEPOSIT_AMOUNT

async def deposit_amount_chosen(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Saves amount and asks for receipt"""
    query = update.callback_query
    amount = query.data.split("_")[1]
    lang = context.user_data.get("lang", "en")
    context.user_data["temp_deposit_amount"] = amount
    
    await query.answer()
    instruction = TEXT[lang]["send_receipt"]
    await query.edit_message_text(
        f"💰 {amount} ETB\n\n{instruction}\nTelebirr: {TELEBIRR_NUMBER}"
    )
    return WAITING_DEPOSIT_RECEIPT

async def deposit_receipt_received(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Final step: Notify admin"""
    uid = str(update.effective_user.id)
    amount = context.user_data.get("temp_deposit_amount")
    receipt = update.message.text or "Image/File sent"
    lang = context.user_data.get("lang", "en")
    is_valid, result = check_receipt_stub(receipt)
    url = result
    if not is_valid:
        return await cancel_process(update, context, result)

    body_text = f"Deposit request\nUser:{uid}\nAmount:{amount}\nReceipt:{receipt}\nURL:{url}"
    request_id = util.new_admin_request_id()
    keyboard = [[
        InlineKeyboardButton(
            "Approve",
            callback_data=f"approve_dep_{request_id}",
        ),
        InlineKeyboardButton(
            "Deny",
            callback_data=f"deny_dep_{request_id}",
        ),
    ]]

    admin_messages = {}
    for admin in ADMIN_IDS:
        sent = await context.bot.send_message(
            admin,
            body_text,
            reply_markup=InlineKeyboardMarkup(keyboard),
        )
        admin_messages[str(admin)] = {
            "chat_id": sent.chat_id,
            "message_id": sent.message_id,
        }

    create_pending_admin_request("dep", uid, amount, body_text, admin_messages, request_id=request_id)

    await update.message.reply_text(TEXT[lang]["request_sent"])
    return ConversationHandler.END

# ---------------- WITHDRAW ----------------
async def start_withdraw(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = await get_user_lang(uid)
    context.user_data["lang"] = lang
    await update.message.reply_text(TEXT[lang]["withdraw_amount"])
    return WAITING_WITHDRAW_AMOUNT

async def withdraw_amount_received(update: Update, context: ContextTypes.DEFAULT_TYPE):
    amount = update.message.text
    uid = str(update.effective_user.id)
    lang = context.user_data.get("lang", "en")
    if not amount.isdigit():
        return await cancel_process(update, context, "❌ Invalid amount.")
    import util
    

    is_ok, msg = check_withdraw_eligibility(uid, amount)

    if not is_ok:
        return await cancel_process(update, context, msg)

    body_text = f"Withdraw request\nUser:{uid}\nAmount:{amount}"
    request_id = util.new_admin_request_id()
    keyboard = [[
        InlineKeyboardButton(
            "Approve",
            callback_data=f"approve_wd_{request_id}",
        ),
        InlineKeyboardButton(
            "Deny",
            callback_data=f"deny_wd_{request_id}",
        ),
    ]]

    admin_messages = {}
    for admin in ADMIN_IDS:
        sent = await context.bot.send_message(
            admin,
            body_text,
            reply_markup=InlineKeyboardMarkup(keyboard),
        )
        admin_messages[str(admin)] = {
            "chat_id": sent.chat_id,
            "message_id": sent.message_id,
        }

    create_pending_admin_request("wd", uid, amount, body_text, admin_messages, request_id=request_id)

    await update.message.reply_text(TEXT[lang]["request_sent"])
    return ConversationHandler.END

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Action cancelled.")
    return ConversationHandler.END
# ---------------- ADMIN ACTIONS ----------------

async def admin_actions(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query


    parts = query.data.split("_", 2)
    if len(parts) != 3:
        await query.answer("Invalid action", show_alert=True)
        return
    action, tx_type, request_id = parts
    if tx_type not in ("dep", "wd") or action not in ("approve", "deny"):
        await query.answer("Invalid action", show_alert=True)
        return

    print(f"Admin action: {action}, {tx_type}, request_id={request_id}")

    try:
        claimed, data = claim_pending_admin_request(
            request_id, query.from_user.id, action
        )
    except Exception as e:
        print(f"claim_pending_admin_request error: {e}")
        try:
            await query.answer("Error processing request", show_alert=True)
        except Exception:
            pass
        return

    if not data:
        await query.answer("Request not found.", show_alert=True)
        return

    if data.get("kind") != tx_type:
        await query.answer("Request data mismatch.", show_alert=True)
        return

    try:
        uid = str(data["uid"])
        amount = _amount_from_pending(data)
    except (TypeError, ValueError, KeyError) as e:
        print(f"admin_actions parse error: {e}")
        await query.answer("Invalid request data", show_alert=True)
        return

    try:
        if claimed:
            if action == "approve":
                if tx_type == "dep":
                    update_balance(uid, amount)
                    await context.bot.send_message(
                        uid, f"✅ Deposit approved +{amount}"
                    )
                elif tx_type == "wd":
                    update_balance(uid, -amount)
                    await context.bot.send_message(
                        uid, f"✅ Withdraw approved -{amount}"
                    )
            else:
                await context.bot.send_message(
                    uid, f"❌ {tx_type.upper()} request denied"
                )

            await apply_admin_resolution_ui(context, data)
            await broadcast_request_closed_to_admins(context, data, query.from_user.id)
            await query.answer(
                "✅ Processed" if action == "approve" else "Denied"
            )
        else:
            await apply_admin_resolution_ui(context, data)
            await query.answer("Already approved or denied.", show_alert=True)
    except Exception as e:
        print(f"Admin action error: {e}")
        try:
            await query.answer("Error processing request", show_alert=True)
        except Exception:
            pass
# ---------------- LANGUAGE CHANGE ----------------

# ---------------- LANGUAGE CHANGE ----------------
async def change_language(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show language selection for the user"""
    keyboard = [
        [InlineKeyboardButton("English", callback_data="lang_en")],
        [InlineKeyboardButton("አማርኛ", callback_data="lang_am")],
        [InlineKeyboardButton("Afaan Oromo", callback_data="lang_om")]
    ]

    # Use a callback query if coming from a button, otherwise message
    if update.message:
        await update.message.reply_text(
            "Choose Language / ቋንቋ ይምረጡ / Afaan filadhaa",
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
    elif update.callback_query:
        query = update.callback_query
        await query.message.reply_text(
            "Choose Language / ቋንቋ ይምረጡ / Afaan filadhaa",
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
async def show_rooms(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    lang = await get_user_lang(uid)
    context.user_data["lang"] = lang
    import worker
    rooms = worker.load_runtime()

    if not rooms:
        await update.message.reply_text(TEXT[lang]["no_rooms"])
        return

    keyboard = []

    for room_id, room_data in rooms.items():
        localized_name = ROOM_NAMES.get(lang, {}).get(room_id, room_id)
        bet = room_data.get("betAmount", 0)
        players_count = len(room_data.get("players", []))
        # If you have a max players field, use it, otherwise just show current players
        text = f"{localized_name} | {bet} ETB | {players_count} players"
        keyboard.append([
            InlineKeyboardButton(
                text,
                callback_data=f"room_{room_id}"
            )
        ])

    await update.message.reply_text(
        TEXT[lang]["play"],  # localized "Play Game"
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
async def room_selected(update: Update, context: ContextTypes.DEFAULT_TYPE):

    query = update.callback_query
    await query.answer()
    

    room_id = query.data.split("_")[1]

    user_id = query.from_user.id

    # ✅ SEND BOTH room_id + user_id
    url = f"{WEB_APP_URL}?room_id={room_id}&user_id={user_id}"

    keyboard = [[
        InlineKeyboardButton(
            "Enter Room",
            web_app=WebAppInfo(url=url)
        )
    ]]

    await query.message.reply_text(
        "room_selected".format(room_id=room_id),
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
# ---------------- MAIN ----------------

def main():

    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("changelanguage", change_language))
    app.add_handler(MessageHandler(filters.CONTACT, contact_handler))
    
    app.add_handler(CallbackQueryHandler(admin_actions, pattern="^(approve|deny)_"))

    # already in your main()
    app.add_handler(CallbackQueryHandler(language_selected, pattern="lang_"))
    
    deposit_conv = ConversationHandler(
        entry_points=[MessageHandler(filters.Regex(f"^{TEXT['en']['deposit']}$|^{TEXT['am']['deposit']}$|^{TEXT['om']['deposit']}$"), start_deposit)],
        states={
            CHOOSING_DEPOSIT_AMOUNT: [
                CallbackQueryHandler(deposit_amount_chosen, pattern="^dep_")
            ],
            WAITING_DEPOSIT_RECEIPT: [
                MessageHandler(filters.TEXT, deposit_receipt_received)
            ],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )
    withdraw_conv = ConversationHandler(
        entry_points=[MessageHandler(filters.Regex(f"^{TEXT['en']['withdraw']}$|^{TEXT['am']['withdraw']}$|^{TEXT['om']['withdraw']}$"), start_withdraw)],
        states={
            WAITING_WITHDRAW_AMOUNT: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, withdraw_amount_received)
            ],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )
    
    demo_conv = ConversationHandler(
        entry_points=[CommandHandler("demo", demo_start)],
        states={
            DEMO_ROOM: [MessageHandler(filters.TEXT & ~filters.COMMAND, demo_room)],
            DEMO_QUANTITY: [MessageHandler(filters.TEXT & ~filters.COMMAND, demo_quantity)],
            DEMO_GAMES: [MessageHandler(filters.TEXT & ~filters.COMMAND, demo_games)],
        },
        fallbacks=[CommandHandler("cancel", demo_cancel)],
    )

    app.add_handler(demo_conv)
    demo_user_conv = ConversationHandler(
        entry_points=[CommandHandler("add_demo_users", add_demo_users_start)],
        states={
            DEMO_AMOUNT: [MessageHandler(filters.TEXT & ~filters.COMMAND, add_demo_users_amount)],
            DEMO_USER_COUNT: [MessageHandler(filters.TEXT & ~filters.COMMAND, add_demo_users_count)],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )
    app.add_handler(demo_user_conv)
    send_conv = ConversationHandler(
        entry_points=[CommandHandler("sendmessage", sendmessage_command)],
        states={
            SEND_TARGET: [MessageHandler(filters.TEXT & ~filters.COMMAND, send_target_received)],
            SEND_CONTENT: [MessageHandler(filters.ALL & ~filters.COMMAND, send_content_received)],
        },
        fallbacks=[CommandHandler("cancel", send_cancel)],
    )

    app.add_handler(send_conv)
    # Stats command
    app.add_handler(CommandHandler("stats", stats_command))
    app.add_handler(deposit_conv)
    app.add_handler(withdraw_conv)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, menu_handler))  
    app.add_handler(CallbackQueryHandler(room_selected, pattern="^room_"))
    print("Bot Running...")

    app.run_polling()


if __name__ == "__main__":
    main()