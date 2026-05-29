import os
import json
from twilio.rest import Client
from dotenv import load_dotenv

# Try to load the root .env
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
load_dotenv(os.path.join(BASE_DIR, ".env"))

def get_env(key: str) -> str:
    # Handle quotes in env vars if any
    val = os.getenv(key, "")
    return val.strip("'").strip('"')

def send_emergency_sms(message: str = "blah"):
    sid = get_env("TWILIO_SID_1")
    token = get_env("TWILIO_AUTH_TOKEN_1")
    from_phone = get_env("TWILIO_PHONE_1")
    to_phone = get_env("DESTINATION_PHONE_1")

    if not all([sid, token, from_phone, to_phone]):
        print("[Twilio] Missing SMS credentials or destination phone number.")
        return False

    try:
        client = Client(sid, token)
        message_obj = client.messages.create(
            body=message,
            from_=from_phone,
            to=to_phone
        )
        print(f"[Twilio] SMS sent successfully. SID: {message_obj.sid}")
        return True
    except Exception as e:
        print(f"[Twilio] Failed to send SMS: {e}")
        return False

def send_emergency_whatsapp(summary: str):
    sid = get_env("TWILIO_SID_2")
    token = get_env("TWILIO_AUTH_TOKEN_2")
    from_phone = get_env("TWILIO_PHONE_2")
    to_phone = get_env("DESTINATION_PHONE_2")

    if not all([sid, token, from_phone, to_phone]):
        print("[Twilio] Missing WhatsApp credentials or destination phone number.")
        return False

    # Ensure format for WhatsApp
    if not from_phone.startswith("whatsapp:"):
        from_phone = f"whatsapp:{from_phone}"
    if not to_phone.startswith("whatsapp:"):
        to_phone = f"whatsapp:{to_phone}"

    try:
        client = Client(sid, token)
        message_obj = client.messages.create(
            body=summary,
            from_=from_phone,
            to=to_phone
        )
        print(f"[Twilio] WhatsApp sent successfully. SID: {message_obj.sid}")
        return True
    except Exception as e:
        print(f"[Twilio] Failed to send WhatsApp: {e}")
        return False
