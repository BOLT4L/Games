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

import datetime
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

# ---------------- START ----------------

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):

    uid = str(update.effective_user.id)

    user = get_user(uid)

    if user:
        await main_menu(update)
        return

    keyboard = [
        [InlineKeyboardButton("English", callback_data="lang_en")]
    ]

    await update.message.reply_text(
        "Choose Language",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


# ---------------- LANGUAGE ----------------

async def language_selected(update: Update, context: ContextTypes.DEFAULT_TYPE):

    query = update.callback_query
    await query.answer()

    lang = query.data.split("_")[1]

    context.user_data["lang"] = lang

    contact_btn = KeyboardButton("Share Contact", request_contact=True)

    await query.message.reply_text(
        TEXT["en"]["welcome"],
        reply_markup=ReplyKeyboardMarkup(
            [[contact_btn]],
            resize_keyboard=True
        )
    )


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

# ---------------- MAIN MENU ----------------

async def main_menu(update: Update):

    keyboard = [
        ["Deposit", "Withdraw"],
        ["Play Game"]
    ]

    await update.message.reply_text(
        "Menu",
        reply_markup=ReplyKeyboardMarkup(
            keyboard,
            resize_keyboard=True
        )
    )



# ---------------- RECEIPT CHECK ----------------

def check_receipt_stub(text):
    return True

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
    if not check_receipt_stub(receipt):
        await update.message.reply_text("Receipt invalid")
        return

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
            f"Deposit request\nUser:{uid}\nAmount:{amount}\nReceipt:{receipt}",
            reply_markup=InlineKeyboardMarkup(keyboard)
        )

    await update.message.reply_text(TEXT[lang]["request_sent"])
    return ConversationHandler.END

# ---------------- WITHDRAW ----------------

def check_withdraw_eligibility(uid):
    return True
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
        await update.message.reply_text("Please enter a valid number.")
        return WAITING_WITHDRAW_AMOUNT
    
    if not check_withdraw_eligibility(uid):
        await update.message.reply_text("Not eligible for withdraw")
        return

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

async def change_language(update: Update, context: ContextTypes.DEFAULT_TYPE):

    keyboard = [
        [InlineKeyboardButton("English", callback_data="lang_en")],
        [InlineKeyboardButton("አማርኛ", callback_data="lang_am")],
        [InlineKeyboardButton("Afaan Oromo", callback_data="lang_or")]
    ]

    await update.message.reply_text(
        "Choose Language",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
async def show_rooms(update: Update, context: ContextTypes.DEFAULT_TYPE):

    rooms = get_available_rooms()

    if not rooms:
        await update.message.reply_text("No rooms available right now.")
        return

    keyboard = []

    for room in rooms:
        text = f"{room['name']} | {room['bet']} ETB | {room['players']}/{room['max']}"
        keyboard.append([
            InlineKeyboardButton(
                text,
                callback_data=f"room_{room['id']}"
            )
        ])

    await update.message.reply_text(
        "Select a room:",
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

    app.add_handler(CallbackQueryHandler(language_selected, pattern="lang_"))
    app.add_handler(CallbackQueryHandler(admin_actions, pattern="approve_|deny_"))

    app.add_handler(MessageHandler(filters.CONTACT, contact_handler))

    
    # Deposit amount messages (numbers) → receipt_handler
    deposit_conv = ConversationHandler(
        entry_points=[MessageHandler(filters.Regex("^Deposit$"), start_deposit)],
        states={
            CHOOSING_DEPOSIT_AMOUNT: [CallbackQueryHandler(deposit_amount_chosen, pattern="^dep_")],
            WAITING_DEPOSIT_RECEIPT: [MessageHandler(filters.TEXT & ~filters.COMMAND, deposit_receipt_received)]
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    )

    # Conversation for Withdraw
    withdraw_conv = ConversationHandler(
        entry_points=[MessageHandler(filters.Regex("^Withdraw$"), start_withdraw)],
        states={
            WAITING_WITHDRAW_AMOUNT: [MessageHandler(filters.TEXT & ~filters.COMMAND, withdraw_amount_received)]
        },
        fallbacks=[CommandHandler("cancel", cancel)]
    )
    app.add_handler(deposit_conv)
    app.add_handler(withdraw_conv)
    app.add_handler(MessageHandler(filters.Regex("^Play Game$"), show_rooms))
    app.add_handler(CallbackQueryHandler(room_selected, pattern="^room_"))
    print("Bot Running...")

    app.run_polling()


if __name__ == "__main__":
    main()