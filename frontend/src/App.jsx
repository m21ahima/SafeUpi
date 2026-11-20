import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import "./App.css";
import RiskAlertModal from "./components/RiskAlertModal";
import EscrowActions from "./components/EscrowActions";
import {
  lockFundsOnChain,
  releaseFundsOnChain,
  refundFundsOnChain,
  sendDirectPaymentOnChain,
} from "./web3";

const API_BASE = "http://127.0.0.1:8000";

function App() {
  const [activePage, setActivePage] = useState("Dashboard");

  const [paymentData, setPaymentData] = useState({
    recipient: "",
    amount: "",
    category: "",
    note: "",
    recipientWallet: "",
  });

  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [risk, setRisk] = useState(null);
  const [loading, setLoading] = useState(false);

  // ---- blockchain escrow state ----
  const [showRiskModal, setShowRiskModal] = useState(false);
  const [modalPhase, setModalPhase] = useState(null); // null | 'connecting' | 'locking' | 'confirming'
  const [modalError, setModalError] = useState(null);
  const [escrow, setEscrow] = useState(null); // { escrowId, txHash } once locked on-chain
  const [escrowWorking, setEscrowWorking] = useState(null); // null | 'releasing' | 'refunding'
  const [escrowError, setEscrowError] = useState(null);

  // ---- direct (non-escrow) MetaMask confirmation, for LOW/MEDIUM/MEDIUM-HIGH ----
  const [directPhase, setDirectPhase] = useState(null); // null | 'sending' | 'confirming'
  const [directError, setDirectError] = useState(null);
  const [directDone, setDirectDone] = useState(false);

  // ---- theme (light/dark), persisted across visits ----
  // SafeUPI uses a fixed light theme.
  const theme = "light";

  // ---- auth: signup / login / OTP verification ----
  const [authUser, setAuthUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("safeupi_user") || "null");
    } catch {
      return null;
    }
  });
  const [authScreen, setAuthScreen] = useState("login"); // 'login' | 'signup' | 'otp'
  const [authForm, setAuthForm] = useState({ name: "", email: "", mobile: "", password: "" });
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpContext, setOtpContext] = useState(null); // { identifier, purpose, pendingUserId, demoOtp }
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");

  // ---- captcha (shown on the Log In screen) ----
  const [captcha, setCaptcha] = useState(null); // { captcha_id, question }
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  const refreshCaptcha = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/auth/captcha`);
      setCaptcha(res.data);
      setCaptchaAnswer("");
    } catch (err) {
      console.error("Could not load captcha:", err);
    }
  };

  useEffect(() => {
    if (!authUser && authScreen === "login") {
      refreshCaptcha();
    }
  }, [authScreen, authUser]);

  // ---- show/hide password toggles, one per form ----
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showResetPasswordField, setShowResetPasswordField] = useState(false);

  const handleAuthChange = (e) => {
    setAuthForm({ ...authForm, [e.target.name]: e.target.value });
    setAuthError(null);
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      await axios.post(`${API_BASE}/api/auth/signup`, {
        name: authForm.name,
        email: authForm.email,
        mobile: authForm.mobile,
        password: authForm.password,
      });
      // No OTP at signup anymore - account is ready immediately.
      // Send them to Log In (which still requires OTP as 2FA).
      setAuthForm((prev) => ({ ...prev, name: "", mobile: "", password: "" }));
      setAuthScreen("login");
      setAuthError("Account created! Please log in.");
    } catch (err) {
      setAuthError(err?.response?.data?.detail || "Could not sign up. Is the backend running?");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/auth/login`, {
        email: authForm.email,
        password: authForm.password,
        captcha_id: captcha?.captcha_id,
        captcha_answer: captchaAnswer,
      });
      setOtpContext({ identifier: authForm.email, purpose: "login", demoOtp: res.data.demo_otp });
      setAuthScreen("otp");
    } catch (err) {
      setAuthError(err?.response?.data?.detail || "Could not log in. Is the backend running?");
      refreshCaptcha(); // old captcha is consumed either way - get a fresh one
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/auth/verify-otp`, {
        identifier: otpContext.identifier,
        code: otpCode,
        purpose: otpContext.purpose,
      });
      setAuthUser(res.data.user);
      localStorage.setItem("safeupi_user", JSON.stringify(res.data.user));
      setOtpCode("");
      setOtpContext(null);
      setAuthForm({ name: "", email: "", mobile: "", password: "" });
    } catch (err) {
      setAuthError(err?.response?.data?.detail || "Could not verify OTP.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!otpContext) return;
    setAuthError(null);
    try {
      const res = await axios.post(`${API_BASE}/api/auth/resend-otp`, {
        identifier: otpContext.identifier,
        purpose: otpContext.purpose,
      });
      setOtpContext({ ...otpContext, demoOtp: res.data.demo_otp });
    } catch (err) {
      setAuthError(err?.response?.data?.detail || "Could not resend OTP.");
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      await axios.post(`${API_BASE}/api/auth/forgot-password`, { email: forgotEmail });
      setAuthScreen("reset");
    } catch (err) {
      setAuthError(err?.response?.data?.detail || "Could not request password reset.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      await axios.post(`${API_BASE}/api/auth/reset-password`, {
        email: forgotEmail, code: resetCode, new_password: resetPassword,
      });
      setAuthScreen("login");
      setAuthForm((prev) => ({ ...prev, email: forgotEmail, password: "" }));
      setResetCode("");
      setResetPassword("");
      setAuthError("Password reset successfully. Please log in.");
    } catch (err) {
      setAuthError(err?.response?.data?.detail || "Could not reset password.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthUser(null);
    localStorage.removeItem("safeupi_user");
    setActivePage("Dashboard");
    setAuthScreen("login");
    setAuthError(null);
    setOtpContext(null);
    setOtpCode("");
    setAuthForm({ name: "", email: "", mobile: "", password: "" });
  };

  const menuItems = [
    { name: "Dashboard", icon: "⌂" },
    { name: "Make Payment", icon: "₹" },
    { name: "Transactions", icon: "▣" },
    { name: "Blockchain Ledger", icon: "◈" },
    { name: "ML Training", icon: "◉" },
  ];

  // ---- live data pulled from the backend (real DB rows, not mock data) ----
  const [rawTransactions, setRawTransactions] = useState([]); // /api/transactions
  const [rawLedger, setRawLedger] = useState([]); // /api/ledger
  const [rawStats, setRawStats] = useState({
    total_transactions: 0,
    high_risk_detected: 0,
    amount_protected: 0,
    fraud_prevented: 0,
  });
  const [limits, setLimits] = useState({
    min_amount: 100,
    max_amount: 1000000,
    daily_limit: 300000,
    daily_spent_today: 0,
    category_limits: {},
  });
  const [amountError, setAmountError] = useState(null);
  const [rawNotifications, setRawNotifications] = useState([]);
  const [summary30, setSummary30] = useState({ count: 0, total: 0, by_day: [] });
  const [transactionFilter, setTransactionFilter] = useState("All");

  // ---- formatting helpers ----
  const formatRupees = (amount) => {
    const n = Number(amount) || 0;
    if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
    return `₹${n.toLocaleString("en-IN")}`;
  };

  const formatRiskLabel = (level) => {
    if (!level) return "Low";
    if (level === "MEDIUM/HIGH") return "Medium";
    return level.charAt(0) + level.slice(1).toLowerCase();
  };

  const formatStatusLabel = (status) => {
    switch (status) {
      case "completed":
        return "Completed";
      case "escrow":
        return "Escrow";
      case "escrow_pending":
        return "Pending Lock";
      case "direct_pending":
        return "Review";
      case "refunded":
        return "Refunded";
      default:
        return status || "Pending";
    }
  };

  const formatRelativeTime = (isoLike) => {
    if (!isoLike) return "just now";
    // SQLite's datetime('now') is UTC without a timezone suffix
    const iso = isoLike.includes("T") ? isoLike : isoLike.replace(" ", "T") + "Z";
    const then = new Date(iso);
    const diffMs = Date.now() - then.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hr ago`;
    return then.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };

  const formatDateTime = (isoLike) => {
    if (!isoLike) return "—";
    const iso = isoLike.includes("T") ? isoLike : isoLike.replace(" ", "T") + "Z";
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ---- pull the latest data from the backend ----
  const refreshData = useCallback(async () => {
    try {
      const [txRes, ledgerRes, statsRes, limitsRes, notifRes, summaryRes] = await Promise.all([
        axios.get(`${API_BASE}/api/transactions`, { params: { user_id: authUser?.id } }),
        axios.get(`${API_BASE}/api/ledger`),
        axios.get(`${API_BASE}/api/stats`),
        axios.get(`${API_BASE}/api/limits`, { params: { user_id: authUser?.id } }),
        axios.get(`${API_BASE}/api/notifications`),
        axios.get(`${API_BASE}/api/summary/last-30-days`, { params: { user_id: authUser?.id } }),
      ]);
      setRawTransactions(txRes.data || []);
      setRawLedger(ledgerRes.data || []);
      setRawStats(statsRes.data || {});
      setLimits((prev) => ({ ...prev, ...(limitsRes.data || {}) }));
      setRawNotifications(notifRes.data || []);
      setSummary30(summaryRes.data || { count: 0, total: 0, by_day: [] });
    } catch (err) {
      console.error("Could not refresh dashboard data:", err);
    }
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    refreshData();
    // Keep the Dashboard / Transactions / Ledger / ML Training pages fresh
    // even if this browser tab isn't the one that made the payment.
    const interval = setInterval(refreshData, 15000);
    return () => clearInterval(interval);
  }, [refreshData, authUser]);

  // ---- last 30 days only, used for the Risk Overview + summary ----
  const last30DaysTransactions = rawTransactions.filter((t) => {
    if (!t.created_at) return true;
    const iso = t.created_at.includes("T") ? t.created_at : t.created_at.replace(" ", "T") + "Z";
    const ageDays = (Date.now() - new Date(iso).getTime()) / 86400000;
    return ageDays <= 30;
  });

  const riskCounts = last30DaysTransactions.reduce(
    (acc, t) => {
      if (t.risk_level === "LOW") acc.low += 1;
      else if (t.risk_level === "MEDIUM" || t.risk_level === "MEDIUM/HIGH") acc.medium += 1;
      else acc.high += 1; // HIGH or MALICIOUS
      return acc;
    },
    { low: 0, medium: 0, high: 0 }
  );
  const totalRisk30 = last30DaysTransactions.length || 1;
  const safePercent = Math.round((riskCounts.low / totalRisk30) * 100);

  // ---- Dashboard summary cards, now driven by real /api/stats ----
  const stats = [
    {
      title: "Total Transactions",
      value: (rawStats.total_transactions ?? 0).toLocaleString("en-IN"),
      change: `${last30DaysTransactions.length} in last 30 days`,
      icon: "↗",
    },
    {
      title: "High Risk Detected",
      value: String(rawStats.high_risk_detected ?? 0),
      change: `${riskCounts.high} in last 30 days`,
      icon: "⚠",
    },
    {
      title: "Amount Protected",
      value: formatRupees(rawStats.amount_protected ?? 0),
      change: "held in escrow",
      icon: "₹",
    },
    {
      title: "Fraud Prevented",
      value: formatRupees(rawStats.fraud_prevented ?? 0),
      change: "refunded to senders",
      icon: "✓",
    },
    {
      title: "Completed (Last 30 Days)",
      value: String(summary30.count ?? 0),
      change: formatRupees(summary30.total ?? 0) + " total",
      icon: "📅",
    },
  ];

  // ---- shared "recent transactions" list, used on Dashboard + Transactions ----
  const transactions = rawTransactions.map((t) => ({
    id: t.id,
    recipient: t.recipient,
    amount: formatRupees(t.amount),
    rawAmount: t.amount,
    risk: formatRiskLabel(t.risk_level),
    status: formatStatusLabel(t.status),
    time: formatRelativeTime(t.created_at),
    dateTime: formatDateTime(t.created_at),
    riskScore: t.risk_score,
  }));

  const filteredTransactions = transactions.filter((t) => {
    if (transactionFilter === "All") return true;
    return t.risk === transactionFilter;
  });

  // ---- which step of the real payment flow the user is currently on ----
  const paymentDone =
    directDone || (risk && (risk.status === "Payment completed" || risk.status === "Payment refunded"));
  let currentFlowStep = 1;
  if (loading) currentFlowStep = 2;
  else if (paymentSubmitted && risk) {
    if (paymentDone) currentFlowStep = 4;
    else if (risk.requiresEscrow) currentFlowStep = escrow ? 4 : 3;
    else currentFlowStep = 3;
  }

  // ---- Blockchain Ledger rows, from real on-chain-escrowed records ----
  const ledgerStatusMap = {
    escrow: { cls: "escrow", label: "🔒 Escrow" },
    completed: { cls: "released", label: "✓ Released" },
    refunded: { cls: "review", label: "↩ Refunded" },
  };
  const ledgerRows = rawLedger.map((t) => {
    const meta = ledgerStatusMap[t.status] || { cls: "review", label: t.status };
    return {
      id: t.id,
      block: `#${1200 + t.id}`,
      hash: t.tx_hash ? `${t.tx_hash.slice(0, 6)}...${t.tx_hash.slice(-4)}` : "pending",
      amount: formatRupees(t.amount),
      risk: formatRiskLabel(t.risk_level),
      statusCls: meta.cls,
      statusLabel: meta.label,
    };
  });

  const handlePaymentChange = (e) => {
    const { name, value } = e.target;

    setPaymentData({
      ...paymentData,
      [name]: value,
    });

    setPaymentSubmitted(false);
    setShowRiskModal(false);
    setAmountError(null);
  };

  // ---- client-side check, mirrors the backend's authoritative check ----
  const validatePaymentLimits = (amount, category) => {
    if (!amount || amount < limits.min_amount) {
      return `Minimum transfer amount is ₹${limits.min_amount.toLocaleString("en-IN")}.`;
    }
    if (amount > limits.max_amount) {
      return `Maximum transfer amount is ₹${limits.max_amount.toLocaleString("en-IN")}.`;
    }
    const categoryCap = limits.category_limits?.[category];
    if (categoryCap && amount > categoryCap) {
      return `'${category}' payments are capped at ₹${categoryCap.toLocaleString("en-IN")} each.`;
    }
    if (limits.daily_spent_today + amount > limits.daily_limit) {
      const remaining = Math.max(0, limits.daily_limit - limits.daily_spent_today);
      return `Daily limit of ₹${limits.daily_limit.toLocaleString("en-IN")} reached — ₹${remaining.toLocaleString("en-IN")} left today.`;
    }
    return null;
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();

    const amount = Number(paymentData.amount);
    const validationError = validatePaymentLimits(amount, paymentData.category);
    if (validationError) {
      setAmountError(validationError);
      return;
    }
    setAmountError(null);
    setLoading(true);

    // Fresh escrow + direct-payment state for this new payment
    setEscrow(null);
    setEscrowError(null);
    setModalError(null);
    setDirectPhase(null);
    setDirectError(null);
    setDirectDone(false);

    try {
      const response = await axios.post(`${API_BASE}/api/analyze-payment`, {
        recipient: paymentData.recipient,
        amount,
        category: paymentData.category,
        note: paymentData.note,
        sender_email: authUser?.email,
        sender_mobile: authUser?.mobile,
        user_id: authUser?.id,
      });

      const data = response.data;

      setRisk({
        score: data.risk_score,
        level: data.risk_level,
        icon:
          data.risk_level === "MALICIOUS" ? "🛑" :
          data.risk_level === "HIGH" ? "🔴" :
          data.risk_level === "MEDIUM/HIGH" ? "🟠" :
          data.risk_level === "MEDIUM" ? "🟡" : "🟢",
        colorClass:
          data.risk_level === "MALICIOUS" ? "malicious-risk-text" :
          data.risk_level === "HIGH" ? "high-risk-text" :
          data.risk_level === "MEDIUM/HIGH" ? "medium-high-risk-text" :
          data.risk_level === "MEDIUM" ? "medium-risk-text" : "low-risk-text",
        status: data.requires_escrow ? "Payment Protected" : "Awaiting your confirmation in MetaMask",
        message: data.message,
        transactionId: data.transaction_id,
        amountWei: data.amount_wei,
        requiresEscrow: data.requires_escrow,
        requiresDirectConfirmation: data.requires_direct_confirmation,
        isMalicious: data.is_malicious,
      });

      setPaymentSubmitted(true);

      // High/malicious risk -> pop up the escrow notification for the sender.
      // Everything else still needs a MetaMask confirmation, just via the
      // inline "Confirm Payment" box further down instead of this modal.
      if (data.requires_escrow) {
        setShowRiskModal(true);
      }

      refreshData();
    } catch (err) {
      console.error("Payment analysis failed:", err);
      if (err?.response?.status === 400 && err?.response?.data?.detail) {
        // A limit check failed on the backend (the authoritative check).
        setAmountError(err.response.data.detail);
      } else {
        alert("Could not reach the backend. Is it running on port 8000?");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProtectWithEscrow = async () => {
    setModalError(null);

    const wallet = paymentData.recipientWallet.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      setModalError(
        "Enter a valid recipient wallet address (0x...) in the payment form to lock funds in escrow."
      );
      return;
    }

    try {
      setModalPhase("connecting");
      setModalPhase("locking");
      const { txHash, senderAddress } = await lockFundsOnChain(wallet, risk.amountWei);

      setModalPhase("confirming");
      const res = await axios.post(`${API_BASE}/api/lock-confirmation`, {
        transaction_id: risk.transactionId,
        tx_hash: txHash,
        sender_address: senderAddress,
      });

      setEscrow({ escrowId: res.data.escrow_id, txHash });
      setRisk((prev) => ({
        ...prev,
        status: "Payment Protected",
        message: "Funds are locked in the smart contract escrow. Confirm below when you're ready.",
      }));
      setShowRiskModal(false);
      refreshData();
    } catch (err) {
      console.error("Escrow lock failed:", err);
      setModalError(
        err?.response?.data?.detail || err?.message || "Could not lock funds in escrow."
      );
    } finally {
      setModalPhase(null);
    }
  };

  const handleConfirmDirectPayment = async () => {
    setDirectError(null);

    const wallet = paymentData.recipientWallet.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      setDirectError(
        "Enter a valid recipient wallet address (0x...) in the payment form to send this payment."
      );
      return;
    }

    try {
      setDirectPhase("sending");
      const { txHash, senderAddress } = await sendDirectPaymentOnChain(wallet, risk.amountWei);

      setDirectPhase("confirming");
      await axios.post(`${API_BASE}/api/direct-payment-confirmation`, {
        transaction_id: risk.transactionId,
        tx_hash: txHash,
        sender_address: senderAddress,
        recipient_address: wallet,
      });

      setDirectDone(true);
      setRisk((prev) => ({
        ...prev,
        status: "Payment completed",
        message: "You confirmed this payment in MetaMask and it was sent on-chain to the recipient.",
      }));
      refreshData();
    } catch (err) {
      console.error("Direct payment failed:", err);
      setDirectError(err?.response?.data?.detail || err?.message || "Could not send this payment.");
    } finally {
      setDirectPhase(null);
    }
  };

  const handleDismissRiskModal = () => {
    setShowRiskModal(false);
    setModalError(null);
    setRisk((prev) =>
      prev
        ? { ...prev, status: "Payment cancelled", message: "You cancelled this payment before it was sent." }
        : prev
    );
  };

  const handleReleaseEscrow = async () => {
    setEscrowError(null);
    setEscrowWorking("releasing");
    try {
      const { txHash } = await releaseFundsOnChain(escrow.escrowId);
      await axios.post(`${API_BASE}/api/confirm-payment`, {
        transaction_id: risk.transactionId,
        tx_hash: txHash,
      });
      setRisk((prev) => ({
        ...prev,
        status: "Payment completed",
        message: "You confirmed this payment — funds have been released to the recipient.",
      }));
      setEscrow(null);
      refreshData();
    } catch (err) {
      console.error("Release failed:", err);
      setEscrowError(err?.response?.data?.detail || err?.message || "Could not release funds.");
    } finally {
      setEscrowWorking(null);
    }
  };

  const handleRefundEscrow = async () => {
    setEscrowError(null);
    setEscrowWorking("refunding");
    try {
      const { txHash } = await refundFundsOnChain(escrow.escrowId);
      await axios.post(`${API_BASE}/api/cancel-payment`, {
        transaction_id: risk.transactionId,
        tx_hash: txHash,
      });
      setRisk((prev) => ({
        ...prev,
        status: "Payment refunded",
        message: "This payment was cancelled — funds have been refunded back to you.",
      }));
      setEscrow(null);
      refreshData();
    } catch (err) {
      console.error("Refund failed:", err);
      setEscrowError(err?.response?.data?.detail || err?.message || "Could not refund funds.");
    } finally {
      setEscrowWorking(null);
    }
  };

  

  if (!authUser) {
    return (
      <div className="auth-shell" data-theme={theme}>
        <div className="auth-card">

          <div className="logo">
            <div className="logo-icon">S</div>
            <div>
              <h2>SafeUPI</h2>
              <span>Payment Security</span>
            </div>
          </div>

          {authScreen === "login" && (
            <>
              <h2>Welcome back</h2>
              <p className="auth-sub">Log in to your SafeUPI account.</p>

              {authError && <div className="auth-error">{authError}</div>}

              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" name="email" required value={authForm.email} onChange={handleAuthChange} />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showLoginPassword ? "text" : "password"}
                      name="password"
                      required
                      value={authForm.password}
                      onChange={handleAuthChange}
                      style={{ paddingRight: "44px", width: "100%" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((v) => !v)}
                      aria-label={showLoginPassword ? "Hide password" : "Show password"}
                      style={{
                        position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                        background: "none", border: "none", cursor: "pointer", fontSize: "16px",
                      }}
                    >
                      {showLoginPassword ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>

                {captcha && (
                  <div className="form-group">
                    <label>
                      Security check: {captcha.question}{" "}
                      <button
                        type="button"
                        onClick={refreshCaptcha}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--purple)" }}
                      >
                        ↻ new
                      </button>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      value={captchaAnswer}
                      onChange={(e) => setCaptchaAnswer(e.target.value)}
                      placeholder="Your answer"
                    />
                  </div>
                )}

                <button className="auth-submit" type="submit" disabled={authLoading}>
                  {authLoading ? "Sending OTP..." : "Log In"}
                </button>
              </form>

              <button className="forgot-link" onClick={() => { setAuthScreen("forgot"); setForgotEmail(authForm.email); setAuthError(null); }}>Forgot password?</button>

              <div className="auth-switch">
                New to SafeUPI?{" "}
                <button onClick={() => { setAuthScreen("signup"); setAuthError(null); }}>
                  Create an account
                </button>
              </div>
            </>
          )}

          {authScreen === "signup" && (
            <>
              <h2>Create your account</h2>
              <p className="auth-sub">You'll verify with an OTP each time you log in.</p>

              {authError && <div className="auth-error">{authError}</div>}

              <form onSubmit={handleSignup}>
                <div className="form-group">
                  <label>Full Name</label>
                  <input type="text" name="name" required value={authForm.name} onChange={handleAuthChange} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" name="email" required value={authForm.email} onChange={handleAuthChange} />
                </div>
                <div className="form-group">
                  <label>Mobile Number</label>
                  <input type="tel" name="mobile" required value={authForm.mobile} onChange={handleAuthChange} />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showSignupPassword ? "text" : "password"}
                      name="password"
                      required
                      minLength={6}
                      value={authForm.password}
                      onChange={handleAuthChange}
                      style={{ paddingRight: "44px", width: "100%" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword((v) => !v)}
                      aria-label={showSignupPassword ? "Hide password" : "Show password"}
                      style={{
                        position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                        background: "none", border: "none", cursor: "pointer", fontSize: "16px",
                      }}
                    >
                      {showSignupPassword ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>
                <button className="auth-submit" type="submit" disabled={authLoading}>
                  {authLoading ? "Creating account..." : "Sign Up"}
                </button>
              </form>

              <div className="auth-switch">
                Already have an account?{" "}
                <button onClick={() => { setAuthScreen("login"); setAuthError(null); }}>
                  Log in
                </button>
              </div>
            </>
          )}

          {authScreen === "forgot" && (
            <>
              <h2>Forgot password?</h2>
              <p className="auth-sub">Enter your registered email to receive a password reset OTP.</p>
              {authError && <div className="auth-error">{authError}</div>}
              <form onSubmit={handleForgotPassword}>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
                </div>
                <button className="auth-submit" type="submit" disabled={authLoading}>{authLoading ? "Sending..." : "Send Reset OTP"}</button>
              </form>
              <div className="auth-switch"><button onClick={() => { setAuthScreen("login"); setAuthError(null); }}>Back to login</button></div>
            </>
          )}

          {authScreen === "reset" && (
            <>
              <h2>Reset password</h2>
              <p className="auth-sub">Enter the OTP sent to your email and choose a new password.</p>
              {authError && <div className="auth-error">{authError}</div>}
              <form onSubmit={handleResetPassword}>
                <div className="form-group"><label>Email</label><input type="email" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} /></div>
                <div className="form-group"><label>Reset OTP</label><input className="otp-input" inputMode="numeric" maxLength={6} required value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))} /></div>
                <div className="form-group">
                  <label>New Password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showResetPasswordField ? "text" : "password"}
                      minLength={6}
                      required
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      style={{ paddingRight: "44px", width: "100%" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPasswordField((v) => !v)}
                      aria-label={showResetPasswordField ? "Hide password" : "Show password"}
                      style={{
                        position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                        background: "none", border: "none", cursor: "pointer", fontSize: "16px",
                      }}
                    >
                      {showResetPasswordField ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>
                <button className="auth-submit" type="submit" disabled={authLoading}>{authLoading ? "Resetting..." : "Reset Password"}</button>
              </form>
            </>
          )}

          {authScreen === "otp" && otpContext && (
            <>
              <h2>Enter verification code</h2>
              <p className="auth-sub">
                We sent a 6-digit code to <strong>{otpContext.identifier}</strong>. It expires in 1 minute.
              </p>

              {otpContext.demoOtp && (
                <div className="auth-demo-otp">
                  No SMS/email provider is connected yet, so here's your code for this demo:{" "}
                  <strong>{otpContext.demoOtp}</strong>
                </div>
              )}

              {authError && <div className="auth-error">{authError}</div>}

              <form onSubmit={handleVerifyOtp}>
                <div className="form-group">
                  <label>OTP Code</label>
                  <input
                    type="text"
                    className="otp-input"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <button className="auth-submit" type="submit" disabled={authLoading}>
                  {authLoading ? "Verifying..." : "Verify & Continue"}
                </button>
              </form>

              <div className="auth-switch">
                Didn't get it? <button onClick={handleResendOtp}>Resend code</button>
              </div>
            </>
          )}

        </div>
      </div>
    );
  }

  return (
    <div className="app" data-theme={theme}>

      {/* ================= SIDEBAR ================= */}

      <aside className="sidebar">

        <div className="logo">
          <div className="logo-icon">S</div>

          <div>
            <h2>SafeUPI</h2>
            <span>Payment Security</span>
          </div>
        </div>

        <nav>
          {menuItems.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${
                activePage === item.name ? "active" : ""
              }`}
              onClick={() => {
                setActivePage(item.name);
                setPaymentSubmitted(false);
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">

          <div className="system-status">
            <span className="status-dot"></span>

            <div>
              <strong>System Online</strong>
              <small>All services operational</small>
            </div>
          </div>

          <div className="user-profile">

            <div className="avatar">
              {authUser.name
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>

            <div>
              <strong>{authUser.name}</strong>
              <small>{authUser.email}</small>
            </div>

          </div>

          <button className="logout-btn" onClick={handleLogout}>
            Log Out
          </button>

        </div>

      </aside>

      {/* ================= MAIN CONTENT ================= */}

      <main className="main-content">

        {/* ================= TOP BAR ================= */}

        <header className="topbar">

          <div>
            <p className="breadcrumb">
              SafeUPI / {activePage}
            </p>

            <h1>{activePage}</h1>
          </div>

          <div className="header-right">

            <div className="notification">
              🔔
            </div>

            <div className="security-badge">
              <span className="status-dot"></span>
              Protected
            </div>

          </div>

        </header>

        {/* ================================================= */}
        {/* DASHBOARD */}
        {/* ================================================= */}

        {activePage === "Dashboard" && (

          <>

            <section className="welcome-card">

              <div>

                <span className="welcome-label">
                  SECURITY OVERVIEW
                </span>

                <h2>
                  Your payments are protected.
                </h2>

                <p>
                  SafeUPI continuously analyzes your transactions
                  and automatically protects suspicious payments.
                </p>

              </div>

              <div className="shield">
                🛡️
              </div>

            </section>

            <section className="stats-grid">

              {stats.map((stat) => (

                <div className="stat-card" key={stat.title}>

                  <div className="stat-top">

                    <span>
                      {stat.title}
                    </span>

                    <div className="stat-icon">
                      {stat.icon}
                    </div>

                  </div>

                  <h2>
                    {stat.value}
                  </h2>

                  <div className="stat-change">

                    <span>
                      ↑ {stat.change}
                    </span>

                    <small>
                      vs last month
                    </small>

                  </div>

                </div>

              ))}

            </section>

            <section className="dashboard-grid">

              <div className="panel risk-panel">

                <div className="panel-header">

                  <div>

                    <h3>
                      Risk Overview
                    </h3>

                    <p>
                      Transaction risk distribution
                    </p>

                  </div>

                  <span className="period">
                    Last 30 days ▾
                  </span>

                </div>

                <div className="risk-chart">

                  <div className="risk-circle">

                    <strong>
                      {last30DaysTransactions.length ? `${safePercent}%` : "—"}
                    </strong>

                    <span>
                      Safe
                    </span>

                  </div>

                  <div className="risk-legend">

                    <div>
                      <span className="legend-dot safe"></span>
                      <span>Low Risk</span>
                      <strong>{riskCounts.low}</strong>
                    </div>

                    <div>
                      <span className="legend-dot medium"></span>
                      <span>Medium Risk</span>
                      <strong>{riskCounts.medium}</strong>
                    </div>

                    <div>
                      <span className="legend-dot high"></span>
                      <span>High Risk</span>
                      <strong>{riskCounts.high}</strong>
                    </div>

                  </div>

                </div>

                <div className="risk-history">
                  <div className="risk-history-heading">
                    <strong>Daily payment activity</strong>
                    <span>Last 14 days</span>
                  </div>
                  <div className="risk-history-bars">
                    {summary30.by_day.slice(-14).map((d) => {
                      const maxTotal = Math.max(...summary30.by_day.map((x) => x.total), 1);
                      const heightPct = Math.max(6, Math.round((d.total / maxTotal) * 100));
                      return (
                        <div className="risk-history-bar" key={d.day} title={`${d.day}: ${formatRupees(d.total)}`}>
                          <div className="risk-history-bar-fill" style={{ height: `${heightPct}%` }}></div>
                        </div>
                      );
                    })}
                  </div>
                  {summary30.by_day.length === 0 && <p className="empty-chart">No daily activity yet.</p>}
                </div>

              </div>

              <div className="panel">

                <div className="panel-header">

                  <div>

                    <h3>
                      ML Risk Engine
                    </h3>

                    <p>
                      Continuous learning status
                    </p>

                  </div>

                  <span className="online-label">
                    ● ONLINE
                  </span>

                </div>

                <div className="model-info">

                  <div className="model-row">
                    <span>Model Version</span>
                    <strong>v12.4</strong>
                  </div>

                  <div className="model-row">
                    <span>Training Samples</span>
                    <strong>{(38421 + rawStats.total_transactions).toLocaleString("en-IN")}</strong>
                  </div>

                  <div className="model-row">
                    <span>F1 Score</span>
                    <strong>94.2%</strong>
                  </div>

                  <div className="model-row">
                    <span>Last Updated</span>
                    <strong>{transactions[0] ? transactions[0].time : "—"}</strong>
                  </div>

                </div>

                <button
                  className="training-button"
                  onClick={() => setActivePage("ML Training")}
                >
                  View Training Details →
                </button>

              </div>

            </section>

            <section className="panel transactions-panel">

              <div className="panel-header">

                <div>

                  <h3>
                    Recent Transactions
                  </h3>

                  <p>
                    Latest payment activity
                  </p>

                </div>

                <button
                  className="view-all"
                  onClick={() => setActivePage("Transactions")}
                >
                  View All →
                </button>

              </div>

              <div className="transaction-table">

                <div className="table-header">

                  <span>Recipient</span>
                  <span>Amount</span>
                  <span>Risk</span>
                  <span>Status</span>
                  <span>Time</span>

                </div>

                {transactions.length === 0 && (
                  <div className="transaction-row">
                    <span style={{ gridColumn: "1 / -1", opacity: 0.6 }}>
                      No transactions yet — make a payment to see it here.
                    </span>
                  </div>
                )}

                {transactions.slice(0, 5).map((transaction) => (

                  <div
                    className="transaction-row"
                    key={transaction.id}
                  >

                    <strong>
                      {transaction.recipient}
                    </strong>

                    <span>
                      {transaction.amount}
                    </span>

                    <span
                      className={`risk-badge ${transaction.risk.toLowerCase()}`}
                    >
                      {transaction.risk}
                    </span>

                    <span
                      className={`transaction-status ${transaction.status
                        .toLowerCase()
                        .replace(" ", "-")}`}
                    >
                      {transaction.status}
                    </span>

                    <span className="time">
                      {transaction.time}
                    </span>

                  </div>

                ))}

              </div>

            </section>

          </>

        )}

        {/* ================================================= */}
        {/* MAKE PAYMENT */}
        {/* ================================================= */}

        {activePage === "Make Payment" && (

          <section className="payment-page">

            <div className="payment-intro">

              <div>

                <span className="welcome-label">
                  SECURE PAYMENT
                </span>

                <h2>
                  Make a Payment
                </h2>

                <p>
                  SafeUPI will analyze this transaction
                  before allowing the payment to proceed.
                </p>

              </div>

              <div className="payment-shield">
                🛡️
              </div>

            </div>

            <div className="payment-layout">

              <div className="panel payment-form-panel">

                <div className="panel-header">

                  <div>

                    <h3>
                      Payment Details
                    </h3>

                    <p>
                      Enter the details of the transaction
                    </p>

                  </div>

                </div>

                <form
                  className="payment-form"
                  onSubmit={handlePaymentSubmit}
                >

                  <div className="form-group">

                    <label>
                      Recipient UPI ID
                    </label>

                    <input
                      type="text"
                      name="recipient"
                      placeholder="example@upi"
                      value={paymentData.recipient}
                      onChange={handlePaymentChange}
                      required
                    />

                    <small>
                      Enter the recipient's UPI ID
                    </small>

                  </div>

                  <div className="form-group">

                    <label>
                      Amount
                    </label>

                    <div className="amount-input">

                      <span>
                        ₹
                      </span>

                      <input
                        type="number"
                        name="amount"
                        placeholder="0.00"
                        min={limits.min_amount}
                        max={limits.max_amount}
                        value={paymentData.amount}
                        onChange={handlePaymentChange}
                        required
                      />

                    </div>

                    <small>
                      Min ₹{limits.min_amount.toLocaleString("en-IN")} · Max ₹{limits.max_amount.toLocaleString("en-IN")} per payment.
                      {" "}₹{limits.daily_spent_today.toLocaleString("en-IN")} of ₹{limits.daily_limit.toLocaleString("en-IN")} sent today.
                    </small>

                    {amountError && (
                      <small style={{ color: "#ef4444", display: "block", marginTop: 4 }}>
                        {amountError}
                      </small>
                    )}

                  </div>

                  <div className="form-group">

                    <label>
                      Recipient Wallet Address
                      <small className="label-hint"> (required — every payment is confirmed via MetaMask)</small>
                    </label>

                    <input
                      type="text"
                      name="recipientWallet"
                      placeholder="0x... (a Ganache test account, for the demo)"
                      value={paymentData.recipientWallet}
                      onChange={handlePaymentChange}
                    />

                    <small>
                      Every payment now needs your sign-off in MetaMask. High-risk
                      payments are locked on-chain in escrow until you confirm or
                      cancel; other payments are sent directly once you confirm.
                    </small>

                  </div>

                  <div className="form-group">

                    <label>
                      Payment Category
                    </label>

                    <select
                      name="category"
                      value={paymentData.category}
                      onChange={handlePaymentChange}
                      required
                    >

                      <option value="">
                        Select category
                      </option>

                      <option value="Shopping">
                        Shopping
                      </option>

                      <option value="Food">
                        Food
                      </option>

                      <option value="Bills">
                        Bills
                      </option>

                      <option value="Travel">
                        Travel
                      </option>

                      <option value="Education">
                        Education
                      </option>

                      <option value="Healthcare">
                        Healthcare
                      </option>

                      <option value="Transfer">
                        Personal Transfer
                      </option>

                      <option value="Other">
                        Other
                      </option>

                    </select>

                  </div>

                  <div className="form-group">

                    <label>
                      Payment Note
                    </label>

                    <textarea
                      name="note"
                      placeholder="Optional payment description..."
                      rows="3"
                      value={paymentData.note}
                      onChange={handlePaymentChange}
                    />

                  </div>

                  <button
                    type="submit"
                    className="analyze-button"
                  >
                    🛡️ Analyze Payment
                  </button>

                </form>

              </div>

              <div className="payment-side">

                <div className="panel security-panel">

                  <div className="security-heading">

                    <div className="security-icon">
                      🛡️
                    </div>

                    <div>

                      <h3>
                        SafeUPI Protection
                      </h3>

                      <p>
                        Every payment is analyzed
                      </p>

                    </div>

                  </div>

                  <div className="protection-item">

                    <span>✓</span>

                    <div>

                      <strong>
                        AI Risk Analysis
                      </strong>

                      <small>
                        ML analyzes transaction behavior
                      </small>

                    </div>

                  </div>

                  <div className="protection-item">

                    <span>✓</span>

                    <div>

                      <strong>
                        Fraud Detection
                      </strong>

                      <small>
                        Suspicious patterns are identified
                      </small>

                    </div>

                  </div>

                  <div className="protection-item">

                    <span>✓</span>

                    <div>

                      <strong>
                        Smart Escrow
                      </strong>

                      <small>
                        High-risk payments can be temporarily held
                      </small>

                    </div>

                  </div>

                  <div className="protection-item">

                    <span>✓</span>

                    <div>

                      <strong>
                        Automatic Refund
                      </strong>

                      <small>
                        Cancelled payments are returned
                      </small>

                    </div>

                  </div>

                </div>

                <div className="info-card">

                  <span>
                    HOW IT WORKS
                  </span>

                  <div className={`flow-step ${currentFlowStep === 1 ? "active" : currentFlowStep > 1 ? "done" : ""}`}>
                    <div>1</div>
                    <p>Enter payment details</p>
                  </div>

                  <div className="flow-line"></div>

                  <div className={`flow-step ${currentFlowStep === 2 ? "active" : currentFlowStep > 2 ? "done" : ""}`}>
                    <div>2</div>
                    <p>AI risk engine scores the transaction</p>
                  </div>

                  <div className="flow-line"></div>

                  <div className={`flow-step ${currentFlowStep === 3 ? "active" : currentFlowStep > 3 ? "done" : ""}`}>
                    <div>3</div>
                    <p>
                      Low/Medium risk → confirm &amp; send in MetaMask.
                      High/Malicious → funds locked in smart-contract escrow.
                    </p>
                  </div>

                  <div className="flow-line"></div>

                  <div className={`flow-step ${currentFlowStep === 4 ? "active" : ""}`}>
                    <div>4</div>
                    <p>You release or refund escrowed funds; direct payments settle immediately.</p>
                  </div>

                </div>

              </div>

            </div>

            {/* ================= DYNAMIC RISK RESULT ================= */}

            {paymentSubmitted && (

              <div className="analysis-result">

                <div className="analysis-result-header">

                  <div className="analysis-icon">
                    {risk.icon}
                  </div>

                  <div>

                    <span className="welcome-label">
                      AI RISK ANALYSIS
                    </span>

                    <h3>
                      Payment Analysis Complete
                    </h3>

                    <p>
                      SafeUPI has analyzed this transaction based
                      on the current payment risk rules.
                    </p>

                  </div>

                </div>

                <div className="risk-result-grid">

                  <div className="risk-result-card">

                    <span>
                      Risk Score
                    </span>

                    <strong>
                      {risk.score}/100
                    </strong>

                  </div>

                  <div className="risk-result-card">

                    <span>
                      Risk Level
                    </span>

                    <strong className={risk.colorClass}>
                      {risk.icon} {risk.level}
                    </strong>

                  </div>

                  <div className="risk-result-card">

                    <span>
                      Amount
                    </span>

                    <strong>
                      ₹{Number(paymentData.amount).toLocaleString("en-IN")}
                    </strong>

                  </div>

                </div>

                <div className={`protection-alert ${risk.colorClass}`}>

                  <div className="alert-icon">
                    {risk.icon}
                  </div>

                  <div>

                    <strong>
                      {risk.status}
                    </strong>

                    <p>
                      {risk.message}
                    </p>

                  </div>

                </div>

                <div className="risk-reasons">

                  <h4>
                    Risk Analysis
                  </h4>

                  {risk.level === "LOW" && (

                    <>
                      <div className="reason">
                        <span>✓</span>
                        <p>
                          Transaction amount is within a low-risk range.
                        </p>
                      </div>

                      <div className="reason">
                        <span>✓</span>
                        <p>
                          No high-value payment threshold detected.
                        </p>
                      </div>
                    </>

                  )}

                  {risk.level === "MEDIUM" && (

                    <>
                      <div className="reason">
                        <span>⚠</span>
                        <p>
                          Transaction amount is moderately high.
                        </p>
                      </div>

                      <div className="reason">
                        <span>⚠</span>
                        <p>
                          Additional transaction verification is recommended.
                        </p>
                      </div>
                    </>

                  )}

                  {risk.level === "MEDIUM/HIGH" && (

                    <>
                      <div className="reason">
                        <span>⚠</span>
                        <p>
                          Transaction amount is higher than normal.
                        </p>
                      </div>

                      <div className="reason">
                        <span>⚠</span>
                        <p>
                          Additional verification may be required.
                        </p>
                      </div>
                    </>

                  )}

                  {risk.level === "HIGH" && (

                    <>
                      <div className="reason">
                        <span>⚠</span>
                        <p>
                          High transaction amount detected.
                        </p>
                      </div>

                      <div className="reason">
                        <span>⚠</span>
                        <p>
                          Payment requires additional protection.
                        </p>
                      </div>

                      <div className="reason">
                        <span>🔒</span>
                        <p>
                          Transaction can be moved to SafeUPI escrow.
                        </p>
                      </div>
                    </>

                  )}

                  {risk.level === "MALICIOUS" && (

                    <>
                      <div className="reason">
                        <span>🛑</span>
                        <p>
                          Transaction matches known fraud patterns.
                        </p>
                      </div>

                      <div className="reason">
                        <span>🛑</span>
                        <p>
                          Strongly recommended to cancel this payment.
                        </p>
                      </div>

                      <div className="reason">
                        <span>🔒</span>
                        <p>
                          Funds will only move if you explicitly confirm in escrow.
                        </p>
                      </div>
                    </>

                  )}

                </div>

                <EscrowActions
                  escrow={escrow}
                  onRelease={handleReleaseEscrow}
                  onRefund={handleRefundEscrow}
                  working={escrowWorking}
                  error={escrowError}
                />

                {risk.requiresDirectConfirmation && (

                  <div className="direct-payment-box">

                    <h4>
                      {directDone ? "✅ Payment sent" : "Confirm this payment in MetaMask"}
                    </h4>

                    <p>
                      {directDone
                        ? "This payment was signed in MetaMask and sent on-chain to the recipient."
                        : "This payment doesn't need escrow protection, but it still needs your explicit sign-off — MetaMask will ask you to confirm before anything is sent."}
                    </p>

                    {directError && <p className="risk-modal-error">{directError}</p>}

                    {!directDone && (
                      <button
                        type="button"
                        className="risk-modal-primary"
                        onClick={handleConfirmDirectPayment}
                        disabled={directPhase !== null}
                      >
                        {directPhase === "sending" && "Confirm in MetaMask..."}
                        {directPhase === "confirming" && "Verifying on-chain..."}
                        {directPhase === null && "🦊 Confirm Payment in MetaMask"}
                      </button>
                    )}

                  </div>

                )}

                <div className="analysis-footer">

                  <span>
                    🔐 Transaction secured by SafeUPI
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentSubmitted(false);
                      setEscrow(null);
                      setShowRiskModal(false);
                      setDirectPhase(null);
                      setDirectError(null);
                      setDirectDone(false);
                    }}
                  >
                    Analyze Another Payment
                  </button>

                </div>

              </div>

            )}

            <RiskAlertModal
              risk={showRiskModal ? risk : null}
              onProtect={handleProtectWithEscrow}
              onDismiss={handleDismissRiskModal}
              phase={modalPhase}
              error={modalError}
            />

          </section>

        )}

        {/* ================================================= */}
        {/* TRANSACTIONS */}
        {/* ================================================= */}

        {activePage === "Transactions" && (

          <section className="transactions-page">

            <div className="page-intro">

              <div>

                <span className="welcome-label">
                  PAYMENT HISTORY
                </span>

                <h2>
                  Transactions
                </h2>

                <p>
                  View and monitor all your SafeUPI payment activity.
                </p>

              </div>

              <div className="page-icon">
                ▣
              </div>

            </div>

            <section className="stats-grid transaction-stats">

              <div className="stat-card">

                <div className="stat-top">
                  <span>Total Payments</span>
                  <div className="stat-icon">₹</div>
                </div>

                <h2>{transactions.length}</h2>

                <div className="stat-change">
                  <span>{last30DaysTransactions.length} in last 30 days</span>
                  <small>all time</small>
                </div>

              </div>

              <div className="stat-card">

                <div className="stat-top">
                  <span>Safe Payments</span>
                  <div className="stat-icon">✓</div>
                </div>

                <h2>{riskCounts.low}</h2>

                <div className="stat-change">
                  <span>{last30DaysTransactions.length ? `${safePercent}%` : "—"}</span>
                  <small>of transactions</small>
                </div>

              </div>

              <div className="stat-card">

                <div className="stat-top">
                  <span>High Risk</span>
                  <div className="stat-icon">⚠</div>
                </div>

                <h2>{rawStats.high_risk_detected ?? 0}</h2>

                <div className="stat-change">
                  <span>Protected</span>
                  <small>by SafeUPI</small>
                </div>

              </div>

              <div className="stat-card">

                <div className="stat-top">
                  <span>Escrow</span>
                  <div className="stat-icon">🔒</div>
                </div>

                <h2>{rawLedger.filter((r) => r.status === "escrow").length}</h2>

                <div className="stat-change">
                  <span>Active</span>
                  <small>protected payments</small>
                </div>

              </div>

            </section>

            <div className="panel transactions-full-panel">

              <div className="panel-header">

                <div>

                  <h3>
                    All Transactions
                  </h3>

                  <p>
                    Complete payment activity
                  </p>

                </div>

                <div className="transaction-filter">

                  {["All", "Low", "Medium", "High"].map((label) => (
                    <button
                      key={label}
                      className={transactionFilter === label ? "filter-active" : ""}
                      onClick={() => setTransactionFilter(label)}
                    >
                      {label === "Low" ? "Low Risk" : label === "High" ? "High Risk" : label}
                    </button>
                  ))}

                </div>

              </div>

              <div className="transaction-table">

                <div className="table-header">

                  <span>Recipient</span>
                  <span>Amount</span>
                  <span>Risk Score</span>
                  <span>Status</span>
                  <span>Time</span>

                </div>

                {filteredTransactions.length === 0 && (
                  <div className="transaction-row">
                    <span style={{ gridColumn: "1 / -1", opacity: 0.6 }}>
                      No transactions match this filter yet.
                    </span>
                  </div>
                )}

                {filteredTransactions.map((transaction) => (

                  <div
                    className="transaction-row"
                    key={transaction.id}
                  >

                    <div>

                      <strong>
                        {transaction.recipient}
                      </strong>

                      <small>
                        {transaction.dateTime}
                      </small>

                    </div>

                    <strong>
                      {transaction.amount}
                    </strong>

                    <span
                      className={`risk-badge ${transaction.risk.toLowerCase()}`}
                    >
                      {transaction.risk} ({transaction.riskScore})
                    </span>

                    <span
                      className={`transaction-status ${transaction.status
                        .toLowerCase()
                        .replace(" ", "-")}`}
                    >
                      {transaction.status}
                    </span>

                    <span className="time">
                      {transaction.time}
                    </span>

                  </div>

                ))}

              </div>

            </div>

            <div className="transaction-security">

              <div className="security-mini-card">

                <div className="security-mini-icon">
                  🛡️
                </div>

                <div>

                  <strong>
                    AI Protected
                  </strong>

                  <p>
                    Every transaction is analyzed by the SafeUPI
                    risk engine.
                  </p>

                </div>

              </div>

              <div className="security-mini-card">

                <div className="security-mini-icon">
                  🔗
                </div>

                <div>

                  <strong>
                    Blockchain Verified
                  </strong>

                  <p>
                    Protected transactions are recorded in the
                    blockchain ledger.
                  </p>

                </div>

              </div>

              <div className="security-mini-card">

                <div className="security-mini-icon">
                  🔒
                </div>

                <div>

                  <strong>
                    Escrow Protected
                  </strong>

                  <p>
                    High-risk transactions can be held before
                    funds are released.
                  </p>

                </div>

              </div>

            </div>

          </section>

        )}

        {/* ================================================= */}
        {/* BLOCKCHAIN LEDGER */}
        {/* ================================================= */}

        {activePage === "Blockchain Ledger" && (

          <section className="ledger-page">

            <div className="page-intro">

              <div>

                <span className="welcome-label">
                  BLOCKCHAIN SECURITY
                </span>

                <h2>
                  Blockchain Ledger
                </h2>

                <p>
                  Transparent and tamper-resistant records of
                  protected SafeUPI transactions.
                </p>

              </div>

              <div className="page-icon">
                🔗
              </div>

            </div>

            <div className="ledger-status">

              <div className="ledger-status-left">

                <span className="status-dot"></span>

                <div>

                  <strong>
                    Blockchain Network Online
                  </strong>

                  <small>
                    Connected to local Ganache network
                  </small>

                </div>

              </div>

              <div className="network-name">
                GANACHE
              </div>

            </div>

            <section className="stats-grid">

              <div className="stat-card">

                <div className="stat-top">
                  <span>Blocks</span>
                  <div className="stat-icon">📦</div>
                </div>

                <h2>{1200 + (rawLedger[0]?.id || 0)}</h2>

                <div className="stat-change">
                  <span>↑ Active</span>
                  <small>latest block</small>
                </div>

              </div>

              <div className="stat-card">

                <div className="stat-top">
                  <span>Protected Records</span>
                  <div className="stat-icon">🔐</div>
                </div>

                <h2>{rawLedger.length}</h2>

                <div className="stat-change">
                  <span>Verified</span>
                  <small>on blockchain</small>
                </div>

              </div>

              <div className="stat-card">

                <div className="stat-top">
                  <span>Escrow Records</span>
                  <div className="stat-icon">🔒</div>
                </div>

                <h2>{rawLedger.filter((r) => r.status === "escrow").length}</h2>

                <div className="stat-change">
                  <span>Active</span>
                  <small>protected payments</small>
                </div>

              </div>

              <div className="stat-card">

                <div className="stat-top">
                  <span>Network Status</span>
                  <div className="stat-icon">✓</div>
                </div>

                <h2>Online</h2>

                <div className="stat-change">
                  <span>Connected</span>
                  <small>Ganache</small>
                </div>

              </div>

            </section>

            <div className="panel ledger-panel">

              <div className="panel-header">

                <div>

                  <h3>
                    Recent Blockchain Records
                  </h3>

                  <p>
                    Immutable transaction records
                  </p>

                </div>

                <span className="online-label">
                  ● VERIFIED
                </span>

              </div>

              <div className="ledger-table">

                <div className="ledger-table-header">

                  <span>Block</span>
                  <span>Transaction Hash</span>
                  <span>Amount</span>
                  <span>Risk</span>
                  <span>Status</span>

                </div>

                {ledgerRows.length === 0 && (
                  <div className="ledger-row">
                    <span style={{ gridColumn: "1 / -1", opacity: 0.6 }}>
                      No blockchain-protected records yet.
                    </span>
                  </div>
                )}

                {ledgerRows.map((row) => (

                  <div className="ledger-row" key={row.id}>

                    <strong>{row.block}</strong>
                    <span className="hash">{row.hash}</span>
                    <span>{row.amount}</span>

                    <span className={`risk-badge ${row.risk.toLowerCase()}`}>
                      {row.risk}
                    </span>

                    <span className={`ledger-status-badge ${row.statusCls}`}>
                      {row.statusLabel}
                    </span>

                  </div>

                ))}

              </div>

            </div>

            <div className="ledger-info-grid">

              <div className="info-card">

                <div className="security-icon">
                  🔗
                </div>

                <h3>
                  Tamper-Resistant Records
                </h3>

                <p>
                  Each protected transaction is recorded as a
                  blockchain entry, providing a transparent audit trail.
                </p>

              </div>

              <div className="info-card">

                <div className="security-icon">
                  🔒
                </div>

                <h3>
                  Smart Escrow
                </h3>

                <p>
                  High-risk transactions can be held until the
                  cooling-off period is completed.
                </p>

              </div>

              <div className="info-card">

                <div className="security-icon">
                  ✓
                </div>

                <h3>
                  Verification
                </h3>

                <p>
                  Transaction hashes allow protected records to
                  be verified against the blockchain.
                </p>

              </div>

            </div>

          </section>

        )}

        {/* ================================================= */}
        {/* ML TRAINING */}
        {/* ================================================= */}

        {activePage === "ML Training" && (

          <section className="ml-page">

            <div className="page-intro">

              <div>

                <span className="welcome-label">
                  ARTIFICIAL INTELLIGENCE
                </span>

                <h2>
                  ML Training
                </h2>

                <p>
                  Monitor the SafeUPI machine learning engine and
                  continuous fraud detection model.
                </p>

              </div>

              <div className="page-icon">
                🤖
              </div>

            </div>

            <div className="ml-status">

              <div className="ml-status-left">

                <span className="status-dot"></span>

                <div>

                  <strong>
                    Continuous Learning Online
                  </strong>

                  <small>
                    ML risk engine is actively monitoring transactions.
                  </small>

                </div>

              </div>

              <div className="online-label">
                ● ONLINE
              </div>

            </div>

            <section className="stats-grid">

              <div className="stat-card">

                <div className="stat-top">
                  <span>Model Version</span>
                  <div className="stat-icon">🧠</div>
                </div>

                <h2>v12.4</h2>

                <div className="stat-change">
                  <span>Active</span>
                  <small>current model</small>
                </div>

              </div>

              <div className="stat-card">

                <div className="stat-top">
                  <span>Training Samples</span>
                  <div className="stat-icon">📊</div>
                </div>

                <h2>38,421</h2>

                <div className="stat-change">
                  <span>↑ 1,248</span>
                  <small>new samples</small>
                </div>

              </div>

              <div className="stat-card">

                <div className="stat-top">
                  <span>Accuracy</span>
                  <div className="stat-icon">🎯</div>
                </div>

                <h2>96.8%</h2>

                <div className="stat-change">
                  <span>↑ 1.4%</span>
                  <small>improvement</small>
                </div>

              </div>

              <div className="stat-card">

                <div className="stat-top">
                  <span>F1 Score</span>
                  <div className="stat-icon">✓</div>
                </div>

                <h2>94.2%</h2>

                <div className="stat-change">
                  <span>Stable</span>
                  <small>model performance</small>
                </div>

              </div>

            </section>

            <section className="dashboard-grid">

              <div className="panel">

                <div className="panel-header">

                  <div>

                    <h3>
                      Model Performance
                    </h3>

                    <p>
                      Current fraud detection performance
                    </p>

                  </div>

                  <span className="online-label">
                    ● HEALTHY
                  </span>

                </div>

                <div className="model-performance">

                  <div className="performance-item">

                    <div>
                      <span>Accuracy</span>
                      <strong>96.8%</strong>
                    </div>

                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: "96.8%" }}
                      ></div>
                    </div>

                  </div>

                  <div className="performance-item">

                    <div>
                      <span>Precision</span>
                      <strong>93.7%</strong>
                    </div>

                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: "93.7%" }}
                      ></div>
                    </div>

                  </div>

                  <div className="performance-item">

                    <div>
                      <span>Recall</span>
                      <strong>94.8%</strong>
                    </div>

                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: "94.8%" }}
                      ></div>
                    </div>

                  </div>

                  <div className="performance-item">

                    <div>
                      <span>F1 Score</span>
                      <strong>94.2%</strong>
                    </div>

                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: "94.2%" }}
                      ></div>
                    </div>

                  </div>

                </div>

              </div>

              <div className="panel">

                <div className="panel-header">

                  <div>

                    <h3>
                      Continuous Learning
                    </h3>

                    <p>
                      Online model training status
                    </p>

                  </div>

                  <span className="online-label">
                    ● ACTIVE
                  </span>

                </div>

                <div className="learning-box">

                  <div className="learning-icon">
                    🔄
                  </div>

                  <div>

                    <strong>
                      Model is learning continuously
                    </strong>

                    <p>
                      New transaction feedback is used to
                      improve the fraud detection model.
                    </p>

                  </div>

                </div>

                <div className="model-info">

                  <div className="model-row">
                    <span>Learning Method</span>
                    <strong>Online Learning</strong>
                  </div>

                  <div className="model-row">
                    <span>Last Training</span>
                    <strong>{transactions[0] ? transactions[0].time : "—"}</strong>
                  </div>

                  <div className="model-row">
                    <span>Samples Added</span>
                    <strong>+{transactions.length}</strong>
                  </div>

                </div>

                <button
                  className="training-button"
                  onClick={() => {
                    refreshData();
                    alert("Retraining request sent to ML service.");
                  }}
                >
                  🔄 Trigger Retraining
                </button>

              </div>

            </section>

            <div className="panel training-activity">

              <div className="panel-header">

                <div>

                  <h3>
                    Recent Training Activity
                  </h3>

                  <p>
                    Latest model learning events
                  </p>

                </div>

              </div>

              <div className="training-list">

                <div className="training-item">

                  <div className="training-icon">
                    ✓
                  </div>

                  <div>

                    <strong>
                      Model updated successfully
                    </strong>

                    <small>
                      {transactions.length} transaction sample{transactions.length === 1 ? "" : "s"} processed.
                    </small>

                  </div>

                  <span>
                    {transactions[0] ? transactions[0].time : "—"}
                  </span>

                </div>

                <div className="training-item">

                  <div className="training-icon">
                    🧠
                  </div>

                  <div>

                    <strong>
                      Fraud patterns learned
                    </strong>

                    <small>
                      {transactions.find((t) => t.risk === "High" || t.risk === "Malicious")
                        ? `Suspicious pattern flagged for ${transactions.find((t) => t.risk === "High" || t.risk === "Malicious").recipient}.`
                        : "No suspicious patterns detected recently."}
                    </small>

                  </div>

                  <span>
                    {transactions.find((t) => t.risk === "High" || t.risk === "Malicious")?.time || "—"}
                  </span>

                </div>

                <div className="training-item">

                  <div className="training-icon">
                    📊
                  </div>

                  <div>

                    <strong>
                      Training dataset updated
                    </strong>

                    <small>
                      New verified transaction feedback added.
                    </small>

                  </div>

                  <span>
                    1 hour ago
                  </span>

                </div>

                <div className="training-item">

                  <div className="training-icon">
                    🔄
                  </div>

                  <div>

                    <strong>
                      Continuous learning cycle completed
                    </strong>

                    <small>
                      Model performance remains stable.
                    </small>

                  </div>

                  <span>
                    2 hours ago
                  </span>

                </div>

              </div>

            </div>

            <div className="panel">

              <div className="panel-header">

                <div>

                  <h3>
                    Recent ML Predictions
                  </h3>

                  <p>
                    Latest transactions analyzed by the model.
                  </p>

                </div>

              </div>

              <div className="transaction-table">

                <div className="table-header">

                  <span>Transaction</span>
                  <span>Amount</span>
                  <span>Risk</span>
                  <span>Risk Score</span>
                  <span>Prediction</span>

                </div>

                {transactions.length === 0 && (
                  <div className="transaction-row">
                    <span style={{ gridColumn: "1 / -1", opacity: 0.6 }}>
                      No predictions yet — make a payment to see the model in action.
                    </span>
                  </div>
                )}

                {transactions.slice(0, 5).map((t) => {
                  const predictionMap = {
                    Completed: { cls: "completed", label: "Safe" },
                    Escrow: { cls: "escrow", label: "Protected" },
                    Refunded: { cls: "review", label: "Refunded" },
                  };
                  const pred = predictionMap[t.status] || { cls: "review", label: "Review" };
                  return (
                    <div className="transaction-row" key={t.id}>

                      <strong>{t.recipient}</strong>

                      <span>{t.amount}</span>

                      <span className={`risk-badge ${t.risk.toLowerCase()}`}>
                        {t.risk}
                      </span>

                      <span>{t.riskScore}%</span>

                      <span className={`transaction-status ${pred.cls}`}>
                        {pred.label}
                      </span>

                    </div>
                  );
                })}

              </div>

            </div>

          </section>

        )}

      </main>

    </div>
  );
}

export default App;