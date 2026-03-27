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

import os
from dotenv import load_dotenv
load_dotenv()
# ---------------- CONFIG ----------------

CHOOSING_DEPOSIT_AMOUNT, WAITING_DEPOSIT_RECEIPT = range(2)

WAITING_WITHDRAW_AMOUNT = range(2, 3)

BOT_TOKEN = os.getenv("BOT_TOKEN")

ADMIN_IDS = [
    int(x) for x in os.getenv("ADMIN_IDS", "").split(",") if x
]

TELEBIRR_NUMBER = os.getenv("TELEBIRR_NUMBER")

WEB_APP_URL = os.getenv("WEB_APP_URL")

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

    if user:
        await main_menu(update, context)
        return

    keyboard = [[InlineKeyboardButton("English", callback_data="lang_en")]]
    await update.message.reply_text(
        "Choose Language",
        reply_markup=InlineKeyboardMarkup(keyboard)
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
        await update.message.reply_text("You are already registered.")
        await main_menu(update)
        return

    contact = update.message.contact
    lang = context.user_data.get("lang", "en")

    create_user(user, contact.phone_number, lang)

    await update.message.reply_text("Registration successful!")

    await main_menu(update)

async def menu_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text
    uid = update.effective_user.id

    lang = await get_user_lang(uid)
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
        await update.message.reply_text("Unknown option.")

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

# ---------------- RECEIPT CHECK ----------------
async def cancel_process(update, context, message):
    await update.message.reply_text(message)

    # clear temporary data
    context.user_data.pop("temp_deposit_amount", None)

    # go back to menu
    await main_menu(update, context)

    return ConversationHandler.END

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

    keyboard = [[
        InlineKeyboardButton(
            "Approve",
            callback_data=f"approve_dep_{uid}_{amount}"
        ),
        InlineKeyboardButton(
            "Deny",
            callback_data=f"deny_dep_{uid}_{amount}"
        )
    ]]

    for admin in ADMIN_IDS:
        await context.bot.send_message(
            admin,
            f"Deposit request\nUser:{uid}\nAmount:{amount}\nReceipt:{receipt}\nURL:{url}",
            reply_markup=InlineKeyboardMarkup(keyboard)
        )

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

    keyboard = [[
        InlineKeyboardButton(
            "Approve",
            callback_data=f"approve_wd_{uid}_{amount}"
        ),
        InlineKeyboardButton(
            "Deny",
            callback_data=f"deny_wd_{uid}_{amount}"
        )
    ]]

    for admin in ADMIN_IDS:
        await context.bot.send_message(
            admin,
            f"Withdraw request\nUser:{uid}\nAmount:{amount}",
            reply_markup=InlineKeyboardMarkup(keyboard)
        )

    await update.message.reply_text(TEXT[lang]["request_sent"])
    return ConversationHandler.END

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Action cancelled.")
    return ConversationHandler.END
# ---------------- ADMIN ACTIONS ----------------

async def admin_actions(update: Update, context: ContextTypes.DEFAULT_TYPE):

    query = update.callback_query
    await query.answer()

    if not is_admin(query.from_user.id):
        await query.answer("Unauthorized", show_alert=True)
        return

    data = query.data.split("_")

    action = data[0]
    tx_type = data[1]
    uid = data[2]
    amount = int(data[3])

    await query.edit_message_reply_markup(reply_markup=None)

    if action == "approve":

        if tx_type == "dep":
            update_balance(uid, amount)
            await context.bot.send_message(
                uid,
                f"Deposit approved +{amount}"
            )

        elif tx_type == "wd":
            update_balance(uid, -amount)
            await context.bot.send_message(
                uid,
                f"Withdraw approved -{amount}"
            )

    else:
        await context.bot.send_message(
            uid,
            f"{tx_type} request denied"
        )

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
        await update.message.reply_text("No rooms available right now.")
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
        f"Room {room_id} selected. Tap below to enter:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
# ---------------- MAIN ----------------

def main():

    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("changelanguage", change_language))

    # already in your main()
    app.add_handler(CallbackQueryHandler(language_selected, pattern="lang_"))
    app.add_handler(CallbackQueryHandler(admin_actions, pattern="approve_|deny_"))
    
    deposit_conv = ConversationHandler(
        entry_points=[MessageHandler(filters.TEXT & filters.Regex("^Deposit$"), start_deposit)],
        states={
            CHOOSING_DEPOSIT_AMOUNT: [
                CallbackQueryHandler(deposit_amount_chosen, pattern="^dep_")
            ],
            WAITING_DEPOSIT_RECEIPT: [
                MessageHandler(filters.ALL, deposit_receipt_received)
            ],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )
    withdraw_conv = ConversationHandler(
        entry_points=[MessageHandler(filters.TEXT & filters.Regex("^Withdraw$"), start_withdraw)],
        states={
            WAITING_WITHDRAW_AMOUNT: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, withdraw_amount_received)
            ],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )
    app.add_handler(deposit_conv)
    app.add_handler(withdraw_conv)

    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, menu_handler))  
    app.add_handler(CallbackQueryHandler(room_selected, pattern="^room_"))
    print("Bot Running...")

    app.run_polling()


if __name__ == "__main__":
    main()