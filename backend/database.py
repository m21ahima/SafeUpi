"""
database.py
-----------
Handles all SQLite storage for SafeUPI transactions.
Uses Python's built-in sqlite3 module - no extra install needed.
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "safeupi.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # lets us access columns by name
    return conn


def init_db():
    """Creates the transactions table if it doesn't already exist.
    Call this once when the server starts."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipient TEXT NOT NULL,
            amount REAL NOT NULL,
            category TEXT,
            note TEXT,
            risk_score INTEGER NOT NULL,
            risk_level TEXT NOT NULL,
            status TEXT NOT NULL,          -- 'completed', 'escrow_pending', 'escrow', 'refunded'
            escrow_id TEXT,                -- on-chain escrow id, filled in once MetaMask locks it
            tx_hash TEXT,                  -- most recent on-chain tx hash for this transaction
            sender_address TEXT,           -- MetaMask address that locked the funds
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.commit()

    # Lightweight migration for safeupi.db files created before the
    # blockchain columns existed, so existing data isn't lost.
    cursor.execute("PRAGMA table_info(transactions)")
    existing_columns = {row["name"] for row in cursor.fetchall()}
    if "tx_hash" not in existing_columns:
        cursor.execute("ALTER TABLE transactions ADD COLUMN tx_hash TEXT")
    if "sender_address" not in existing_columns:
        cursor.execute("ALTER TABLE transactions ADD COLUMN sender_address TEXT")
    if "user_id" not in existing_columns:
        cursor.execute("ALTER TABLE transactions ADD COLUMN user_id INTEGER")
    if "sender_email" not in existing_columns:
        cursor.execute("ALTER TABLE transactions ADD COLUMN sender_email TEXT")
    if "sender_mobile" not in existing_columns:
        cursor.execute("ALTER TABLE transactions ADD COLUMN sender_mobile TEXT")
    conn.commit()

    # ---- users (signup/login) ----
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            mobile TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            is_verified INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)

    # ---- OTPs, used for both signup verification and login 2FA ----
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            identifier TEXT NOT NULL,     -- email or mobile the code was issued for
            code TEXT NOT NULL,
            purpose TEXT NOT NULL,        -- 'signup' | 'login'
            user_id INTEGER,
            expires_at TEXT NOT NULL,
            consumed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)

    # ---- notification log (simulated SMS/email, see notifications.py) ----
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id INTEGER,
            channel TEXT NOT NULL,        -- 'sms' | 'email'
            recipient TEXT NOT NULL,      -- phone number or email address
            message TEXT NOT NULL,
            sent_mode TEXT NOT NULL,      -- 'simulated' | 'live'
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)

    conn.commit()
    conn.close()


def insert_transaction(recipient, amount, category, note, risk_score, risk_level, status,
                        escrow_id=None, user_id=None, sender_email=None, sender_mobile=None):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO transactions
            (recipient, amount, category, note, risk_score, risk_level, status, escrow_id,
             user_id, sender_email, sender_mobile)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (recipient, amount, category, note, risk_score, risk_level, status, escrow_id,
          user_id, sender_email, sender_mobile))
    conn.commit()
    transaction_id = cursor.lastrowid
    conn.close()
    return transaction_id


def get_all_transactions(user_id=None):
    """If user_id is given, only that account's own transactions come
    back - so one user's history never leaks into another's dashboard."""
    conn = get_connection()
    cursor = conn.cursor()
    if user_id is not None:
        cursor.execute(
            "SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        )
    else:
        cursor.execute("SELECT * FROM transactions ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def set_transaction_escrow(transaction_id, escrow_id, tx_hash, sender_address):
    """Called once the frontend's MetaMask lockFunds() tx has been verified
    on-chain - moves a transaction from 'escrow_pending' to 'escrow'."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE transactions
        SET status = 'escrow', escrow_id = ?, tx_hash = ?, sender_address = ?
        WHERE id = ?
    """, (escrow_id, tx_hash, sender_address, transaction_id))
    conn.commit()
    conn.close()


def update_transaction_status(transaction_id, new_status, tx_hash=None):
    conn = get_connection()
    cursor = conn.cursor()
    if tx_hash:
        cursor.execute(
            "UPDATE transactions SET status = ?, tx_hash = ? WHERE id = ?",
            (new_status, tx_hash, transaction_id),
        )
    else:
        cursor.execute("UPDATE transactions SET status = ? WHERE id = ?", (new_status, transaction_id))
    conn.commit()
    conn.close()


def get_transaction_by_id(transaction_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM transactions WHERE id = ?", (transaction_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_today_total(user_id=None):
    """Sum today's transactions for one account. Each user has their own daily cap."""
    conn = get_connection()
    cursor = conn.cursor()
    if user_id is None:
        cursor.execute("""
            SELECT COALESCE(SUM(amount), 0) as total
            FROM transactions
            WHERE date(created_at) = date('now') AND user_id IS NULL
        """)
    else:
        cursor.execute("""
            SELECT COALESCE(SUM(amount), 0) as total
            FROM transactions
            WHERE date(created_at) = date('now') AND user_id = ?
        """, (user_id,))
    total = cursor.fetchone()["total"]
    conn.close()
    return total


def get_last_30_days_summary(user_id=None):
    """Powers the dashboard's 'Last 30 Days' card: how many payments THIS
    account completed successfully in the last 30 days (not pending, not
    refunded, and not other users' transactions)."""
    conn = get_connection()
    cursor = conn.cursor()

    where = "WHERE julianday('now') - julianday(created_at) <= 30 AND status = 'completed'"
    params = []
    if user_id is not None:
        where += " AND user_id = ?"
        params.append(user_id)

    cursor.execute(f"""
        SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
        FROM transactions
        {where}
    """, params)
    row = cursor.fetchone()

    cursor.execute(f"""
        SELECT date(created_at) as day, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
        FROM transactions
        {where}
        GROUP BY date(created_at)
        ORDER BY day ASC
    """, params)
    by_day = [dict(r) for r in cursor.fetchall()]

    conn.close()
    return {
        "count": row["count"],
        "total": row["total"],
        "by_day": by_day,
    }


# ========================================================================
# Users (signup / login / OTP)
# ========================================================================

def create_user(name, email, mobile, password_hash, password_salt):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO users (name, email, mobile, password_hash, password_salt)
        VALUES (?, ?, ?, ?, ?)
    """, (name, email, mobile, password_hash, password_salt))
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()
    return user_id


def get_user_by_email(email):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_mobile(mobile):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE mobile = ?", (mobile,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_id(user_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_user_password(user_id, password_hash, password_salt):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?",
        (password_hash, password_salt, user_id),
    )
    conn.commit()
    conn.close()


def mark_user_verified(user_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET is_verified = 1 WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()


def insert_otp(identifier, code, purpose, expires_at, user_id=None):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO otps (identifier, code, purpose, user_id, expires_at)
        VALUES (?, ?, ?, ?, ?)
    """, (identifier, code, purpose, user_id, expires_at))
    conn.commit()
    otp_id = cursor.lastrowid
    conn.close()
    return otp_id


def get_latest_otp(identifier, purpose):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM otps
        WHERE identifier = ? AND purpose = ? AND consumed = 0
        ORDER BY created_at DESC LIMIT 1
    """, (identifier, purpose))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def consume_otp(otp_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE otps SET consumed = 1 WHERE id = ?", (otp_id,))
    conn.commit()
    conn.close()


# ========================================================================
# Notifications (simulated SMS/email log)
# ========================================================================

def log_notification(transaction_id, channel, recipient, message, sent_mode):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO notifications (transaction_id, channel, recipient, message, sent_mode)
        VALUES (?, ?, ?, ?, ?)
    """, (transaction_id, channel, recipient, message, sent_mode))
    conn.commit()
    conn.close()


def get_recent_notifications(limit=20):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_stats():
    """Computes dashboard stats from real stored transactions."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as total FROM transactions")
    total = cursor.fetchone()["total"]

    cursor.execute("SELECT COUNT(*) as high_risk FROM transactions WHERE risk_level = 'HIGH'")
    high_risk = cursor.fetchone()["high_risk"]

    cursor.execute("SELECT COALESCE(SUM(amount), 0) as protected FROM transactions WHERE status = 'escrow'")
    amount_protected = cursor.fetchone()["protected"]

    cursor.execute("SELECT COALESCE(SUM(amount), 0) as prevented FROM transactions WHERE status = 'refunded'")
    fraud_prevented = cursor.fetchone()["prevented"]

    conn.close()

    return {
        "total_transactions": total,
        "high_risk_detected": high_risk,
        "amount_protected": amount_protected,
        "fraud_prevented": fraud_prevented,
    }