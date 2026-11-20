"""
notifications.py
-----------------
Sends SMS + email alerts for OTPs and transaction events.

By default nothing real is sent (no SMS/email provider credentials
configured), so every "send" is logged to the console and saved in the
`notifications` table where the frontend can display it - this keeps the
whole flow demoable without a paid account.

TO GO LIVE (this is fully wired up already - you only need credentials):
  EMAIL - any SMTP account works, including a free Gmail account:
              1. Turn on 2-Step Verification on the Gmail account.
              2. Create an "App Password" at myaccount.google.com/apppasswords.
              3. Copy backend/.env.example to backend/.env and fill in:
                     SAFEUPI_EMAIL_PROVIDER=smtp
                     SMTP_HOST=smtp.gmail.com
                     SMTP_PORT=587
                     SMTP_USER=youraddress@gmail.com
                     SMTP_PASS=<the 16-character app password>
  SMS   - Twilio has a free trial that can text verified numbers:
              1. Sign up at twilio.com/try-twilio, verify your own phone
                 number (trial accounts can only text verified numbers).
              2. Copy your Account SID, Auth Token, and trial phone number
                 from the console into backend/.env:
                     SAFEUPI_SMS_PROVIDER=twilio
                     TWILIO_ACCOUNT_SID=...
                     TWILIO_AUTH_TOKEN=...
                     TWILIO_FROM_NUMBER=+1...
              3. pip install twilio (already in requirements.txt)

Nothing else in the backend needs to change - insert_transaction() and
the endpoints in main.py already call notify_transaction_event() /
send_otp(), which automatically switch from simulated to live the moment
these env vars are set. If a live send fails (bad credentials, unverified
trial number, etc.) it logs the error and falls back to simulated mode
instead of crashing the request.
"""

import os

import database

try:
    from dotenv import load_dotenv
    load_dotenv()  # loads backend/.env if present, so real credentials
                    # don't have to be exported by hand every time
except ImportError:
    pass  # python-dotenv not installed - env vars can still be set manually

SMS_PROVIDER = os.environ.get("SAFEUPI_SMS_PROVIDER")  # e.g. "twilio"
EMAIL_PROVIDER = os.environ.get("SAFEUPI_EMAIL_PROVIDER")  # e.g. "smtp"


def _send_sms_twilio(to_number: str, message: str):
    from twilio.rest import Client

    account_sid = os.environ["TWILIO_ACCOUNT_SID"]
    auth_token = os.environ["TWILIO_AUTH_TOKEN"]
    from_number = os.environ["TWILIO_FROM_NUMBER"]

    client = Client(account_sid, auth_token)
    client.messages.create(body=message, from_=from_number, to=to_number)


def _send_email_smtp(to_email: str, subject: str, message: str):
    import smtplib
    from email.mime.text import MIMEText

    host = os.environ["SMTP_HOST"]
    port = int(os.environ["SMTP_PORT"])
    user = os.environ["SMTP_USER"]
    password = os.environ["SMTP_PASS"]
    from_addr = os.environ.get("SMTP_FROM", user)

    msg = MIMEText(message)
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email

    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(user, password)
        server.send_message(msg)


def send_sms(to_number: str, message: str, transaction_id=None):
    if not to_number:
        return
    if SMS_PROVIDER == "twilio":
        try:
            _send_sms_twilio(to_number, message)
            mode = "live"
        except Exception as e:
            print(f"[SMS] live send failed ({e}), falling back to simulated mode.")
            mode = "simulated"
    else:
        mode = "simulated"

    print(f"[SMS - {mode}] to {to_number}: {message}")
    database.log_notification(transaction_id, "sms", to_number, message, mode)


def send_email(to_email: str, subject: str, message: str, transaction_id=None):
    if not to_email:
        return
    if EMAIL_PROVIDER == "smtp":
        try:
            _send_email_smtp(to_email, subject, message)
            mode = "live"
        except Exception as e:
            print(f"[EMAIL] live send failed ({e}), falling back to simulated mode.")
            mode = "simulated"
    else:
        mode = "simulated"

    print(f"[EMAIL - {mode}] to {to_email} ({subject}): {message}")
    database.log_notification(transaction_id, "email", to_email, message, mode)


def send_otp(email: str, code: str, purpose: str, mobile: str = None):
    """Send the same OTP to email and SMS when both destinations exist."""
    message = f"Your SafeUPI {purpose} verification code is {code}. It expires in 1 minute. Do not share it."
    if email:
        send_email(email, "Your SafeUPI verification code", message)
    if mobile:
        send_sms(mobile, message)


def notify_transaction_event(txn: dict, event: str):
    """event: 'created' | 'escrow' | 'completed' | 'refunded'"""
    messages = {
        "created": f"SafeUPI: payment of Rs.{txn['amount']:.2f} to {txn['recipient']} is being reviewed.",
        "escrow": f"SafeUPI: payment of Rs.{txn['amount']:.2f} to {txn['recipient']} was flagged and is held in escrow.",
        "completed": f"SafeUPI: payment of Rs.{txn['amount']:.2f} to {txn['recipient']} was completed successfully.",
        "refunded": f"SafeUPI: payment of Rs.{txn['amount']:.2f} to {txn['recipient']} was cancelled and refunded to you.",
    }
    message = messages.get(event, f"SafeUPI: update on your payment to {txn['recipient']}.")

    email = txn.get("sender_email")
    mobile = txn.get("sender_mobile")
    if email:
        send_email(email, "SafeUPI transaction update", message, transaction_id=txn["id"])
    if mobile:
        send_sms(mobile, message, transaction_id=txn["id"])