"""
auth.py
-------
Minimal signup/login + OTP verification for SafeUPI.

Uses only the Python standard library (hashlib's PBKDF2) for password
hashing - no extra install needed, and good enough for a college demo.
In a real production system you'd use bcrypt/argon2 and a proper session/
JWT layer; this keeps things simple while still not storing plaintext
passwords.
"""

import hashlib
import os
import random
import string
import time
import uuid
from datetime import datetime, timedelta

OTP_LENGTH = 6
OTP_VALID_SECONDS = 60  # OTP must be entered within 1 minute of being issued

# --------------------------------------------------------------------
# Passwords
# --------------------------------------------------------------------

def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    """Returns (hash, salt). Generates a new random salt if none given."""
    if salt is None:
        salt = os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return digest.hex(), salt


def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    check_hash, _ = hash_password(password, salt)
    return check_hash == stored_hash


# --------------------------------------------------------------------
# OTPs
# --------------------------------------------------------------------

def generate_otp() -> str:
    return "".join(random.choices(string.digits, k=OTP_LENGTH))


def otp_expiry() -> str:
    return (datetime.utcnow() + timedelta(seconds=OTP_VALID_SECONDS)).strftime("%Y-%m-%d %H:%M:%S")


def is_otp_expired(expires_at: str) -> bool:
    return datetime.utcnow() > datetime.strptime(expires_at, "%Y-%m-%d %H:%M:%S")


# --------------------------------------------------------------------
# Captcha (login only)
# --------------------------------------------------------------------
# In-memory is fine here: captchas are short-lived (2 minutes) and only
# need to survive a single login attempt, not a server restart.

CAPTCHA_VALID_SECONDS = 120
_captcha_store = {}  # captcha_id -> {"answer": str, "expires": float}


def generate_captcha() -> dict:
    a, b = random.randint(1, 9), random.randint(1, 9)
    captcha_id = uuid.uuid4().hex
    _captcha_store[captcha_id] = {
        "answer": str(a + b),
        "expires": time.time() + CAPTCHA_VALID_SECONDS,
    }
    return {"captcha_id": captcha_id, "question": f"What is {a} + {b}?"}


def verify_captcha(captcha_id: str, answer: str) -> bool:
    entry = _captcha_store.pop(captcha_id, None)  # one-time use either way
    if not entry:
        return False
    if time.time() > entry["expires"]:
        return False
    return str(answer).strip() == entry["answer"]