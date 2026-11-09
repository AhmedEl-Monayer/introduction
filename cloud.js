/* ============================================================
   Computer Fundamentals — cloud.js
   Supabase auth + leaderboard
   ------------------------------------------------------------
   نظام الحساب: اسم مستخدم + كلمة مرور فقط (بدون بريد إلكتروني).
   الاسم يُستخدم لاشتقاق بريد داخلي ثابت لا يظهر للمستخدم.
   الليدربورد للحسابات المسجلة فقط، والضيف لا تُحفظ نتائجه.
   ============================================================ */
(function () {
  "use strict";

  const CFG = window.CF_SUPABASE || {};
  const hasLib = !!window.supabase && typeof window.supabase.createClient === "function";
  const cfgUrl = String(CFG.url || "").trim();
  const cfgKey = String(CFG.anonKey || "").trim();

  // بريد داخلي وهمي مشتق من اسم المستخدم — لا يُرسل ولا يُعرض لأحد
  const EMAIL_DOMAIN = "students.example.com";
  const GUEST_KEY = "cf-guest";

  let client = null;
  let ready = false;
  let mailerAutoconfirm = null; // true = Confirm email مقفول (التسجيل مسموح)

  if (hasLib && cfgUrl && cfgKey) {
    try {
      client = window.supabase.createClient(cfgUrl, cfgKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      ready = true;
    } catch (err) {
      console.error("[CFCloud] تعذّر تهيئة Supabase:", err);
    }
  }

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const QUIZ_LABELS = {
    l1: "مقدمة في الحوسبة",
    l3: "العتاد",
    l4: "Windows وWord",
    l5: "Excel وPowerPoint",
    l6: "أنظمة الأعداد",
    exam: "اختبار شامل"
  };

  const SORTS = {
    recent: [["created_at", false]],
    oldest: [["created_at", true]],
    best: [["percent", false], ["duration_seconds", true], ["created_at", false]],
    fastest: [["duration_seconds", true], ["percent", false], ["created_at", false]]
  };

  let session = null;
  let profile = null;
  let profileError = null;
  let currentAuthTab = "login";
  let booted = false;

  let pollTimer = 0;
  let focusTimer = 0;
  let searchTimer = 0;

  const lb = {
    quiz: "all",
    sort: "recent",
    search: "",
    limit: 25,
    rows: [],
    count: 0,
    loading: false,
    loaded: false,
    error: null
  };
  let lbRequest = 0;
  let statsRequest = 0;

  /* ------------------------------------------------------------
     Helpers
  ------------------------------------------------------------ */
  function text(sel, value) {
    const el = typeof sel === "string" ? $(sel) : sel;
    if (el) el.textContent = value;
  }

  function initial(name) {
    const chars = Array.from(String(name || "").trim());
    return chars.length ? chars[0].toUpperCase() : "👤";
  }

  function displayName() {
    if (profile && profile.username) return profile.username;
    const meta = session && session.user && session.user.user_metadata;
    if (meta && meta.username) return meta.username;
    return "لاعب";
  }

  function isHttp() {
    return location.protocol === "http:" || location.protocol === "https:";
  }

  function pageUrl() {
    return location.origin + location.pathname + location.search;
  }

  function number(n) {
    return Number(n || 0).toLocaleString("en-US");
  }

  function formatDuration(seconds) {
    const sec = Math.max(0, Math.round(Number(seconds) || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function formatDate(iso) {
    try {
      return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(iso));
    } catch (e) {
      return String(iso || "");
    }
  }

  function setMsg(el, message, kind) {
    if (!el) return;
    el.textContent = message || "";
    el.dataset.kind = kind || "";
    el.hidden = !message;
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent;
      button.disabled = true;
      button.textContent = label || "جارٍ…";
    } else {
      button.disabled = false;
      if (button.dataset.idleLabel) {
        button.textContent = button.dataset.idleLabel;
        delete button.dataset.idleLabel;
      }
    }
  }

  function normalizedName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  // FNV-1a 32-bit — ثابت في كل المتصفحات، بيحوّل الاسم لبريد داخلي فريد
  function fnv1a(str, seed) {
    let h = seed >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(36);
  }

  function usernameEmail(name) {
    const norm = normalizedName(name).toLowerCase();
    return "u_" + fnv1a(norm, 2166136261) + fnv1a(norm, 2246822507) + "@" + EMAIL_DOMAIN;
  }

  function guestMode() {
    try { return sessionStorage.getItem(GUEST_KEY) === "1"; } catch (e) { return false; }
  }

  function setGuestMode(on) {
    try {
      if (on) sessionStorage.setItem(GUEST_KEY, "1");
      else sessionStorage.removeItem(GUEST_KEY);
    } catch (e) { /* تجاهل */ }
  }

  function clearLocalBest() {
    try {
      Object.keys(localStorage)
        .filter(key => key.indexOf("cf-best-") === 0)
        .forEach(key => localStorage.removeItem(key));
    } catch (e) { /* تجاهل */ }
    // إبلاغ app.js بمسح تقدم الجلسة (إن وُجد)
    try {
      document.dispatchEvent(new CustomEvent("cf:reset-progress"));
    } catch (e) { /* تجاهل */ }
  }

  function friendlyError(error) {
    const msg = String(
      (error && (error.message || error.error_description || error.msg || error.hint)) || ""
    );
    if (!msg) return "حدث خطأ غير متوقع. جرّب تاني.";
    if (/invalid login credentials/i.test(msg)) return "اسم المستخدم أو كلمة المرور غير صحيحة.";
    if (/email not confirmed/i.test(msg)) return "الحساب محتاج تأكيد بريد، وده غير متاح في نظام الاسم وكلمة المرور. اطلب من المسؤول إيقاف Confirm email.";
    if (/user already registered|already been registered/i.test(msg)) return "اسم المستخدم ده محجوز. جرّب اسمًا آخر.";
    if (/database error saving new user/i.test(msg)) return "تعذّر إنشاء الحساب — الاسم قد يكون محجوزًا. جرّب اسمًا آخر.";
    if (/password should be at least|password is too short/i.test(msg)) return "كلمة المرور لازم تكون 6 أحرف على الأقل.";
    if (/unable to validate email|invalid email/i.test(msg)) return "اسم المستخدم غير صالح. جرّب اسمًا آخر بدون رموز غريبة.";
    if (/email rate limit|over_email_send_rate_limit/i.test(msg)) return "تم إرسال طلبات كثيرة. انتظر شوية وجرّب تاني.";
    if (/duplicate key|unique constraint|profiles_username/i.test(msg)) return "اسم المستخدم ده محجوز. جرّب اسمًا آخر.";
    if (/username_immutable/i.test(msg)) return "اسم المستخدم ثابت ولا يمكن تغييره بعد إنشاء الحساب.";
    if (/row-level security|permission denied/i.test(msg)) return "ليس لديك صلاحية للعملية دي. تأكد إنك مسجّل دخول وإن schema متشغّل صح.";
    if (/could not find the table|schema cache|relation .*does not exist|does not exist/i.test(msg)) return "الجداول غير موجودة في قاعدة البيانات. شغّل ملف supabase-schema.sql كاملًا في SQL Editor.";
    if (/invalid api key|no api key|apikey/i.test(msg)) return "مفتاح anon غير صحيح. راجع Project URL و anon public key في supabase-config.js.";
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return "تعذّر الاتصال بالسيرفر. راجع الإنترنت وجرّب تاني.";
    if (/jwt|token.*expired/i.test(msg)) return "انتهت صلاحية الجلسة. سجّل الدخول من جديد.";
    return msg;
  }

  /* ------------------------------------------------------------
     Account button / home callout
  ------------------------------------------------------------ */
  function renderAccount() {
    const button = $("#accountBtn");
    const avatar = $("#accountAvatar");
    const label = $("#accountLabel");
    if (!button) return;

    button.classList.toggle("signed-in", !!session);
    button.classList.toggle("cloud-off", !ready);
    button.classList.toggle("guest", ready && !session && guestMode());

    if (!ready) {
      if (avatar) avatar.textContent = "☁️";
      if (label) label.textContent = "الإعداد";
      button.title = "الليدربورد يحتاج إعداد Supabase";
      return;
    }

    if (session) {
      const name = displayName();
      if (avatar) avatar.textContent = initial(name);
      if (label) label.textContent = name;
      button.title = "حسابك وإعدادات الليدربورد";
    } else if (guestMode()) {
      if (avatar) avatar.textContent = "🎓";
      if (label) label.textContent = "ضيف";
      button.title = "أنت في وضع الضيف — النتائج مش بتتحفظ";
    } else {
      if (avatar) avatar.textContent = "👤";
      if (label) label.textContent = "دخول";
      button.title = "تسجيل الدخول أو إنشاء حساب";
    }
  }

  function updateHomeCallout() {
    const textEl = $("#homeCloudText");
    const button = $("#homeCloudBtn");
    if (!textEl || !button) return;

    if (!ready) {
      textEl.textContent = "الليدربورد السحابي محتاج إعداد Supabase أولًا. الموقع شغّال بالكامل، لكن النتائج مش بتتحفظ.";
      button.textContent = "طريقة التفعيل";
    } else if (session) {
      textEl.textContent = "أهلًا " + displayName() + "! كل محاولة جديدة بتتحفظ تلقائيًا وتظهر في ترتيب الطلاب.";
      button.textContent = "حسابي";
    } else if (guestMode()) {
      textEl.textContent = "أنت في وضع الضيف: تقدر تذاكر وتحل الاختبارات، لكن نتيجتك بتظهر مرة واحدة ومش بتتحفظ. سجّل حسابك باسم مستخدم وكلمة مرور عشان تشارك في الليدربورد.";
      button.textContent = "إنشاء حساب";
    } else {
      textEl.textContent = "سجّل حسابك باسم مستخدم وكلمة مرور عشان محاولاتك تتحفظ وتظهر في ترتيب الطلاب. اسمك هيظهر للكل ومش هيتغير.";
      button.textContent = "تسجيل الدخول";
    }
  }

  /* ------------------------------------------------------------
     Modal
  ------------------------------------------------------------ */
  function setAuthTab(tab) {
    currentAuthTab = tab === "signup" ? "signup" : "login";
    $$("[data-auth-tab]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.authTab === currentAuthTab);
      btn.setAttribute("aria-selected", btn.dataset.authTab === currentAuthTab ? "true" : "false");
    });
    const loginForm = $("#loginForm");
    const signupForm = $("#signupForm");
    if (loginForm) loginForm.hidden = currentAuthTab !== "login";
    if (signupForm) signupForm.hidden = currentAuthTab !== "signup";
    setMsg($("#authMsg"), "");
  }

  function renderSignupAvailability() {
    const warn = $("#signupSetupWarn");
    const submit = $("#signupSubmit");
    const blocked = ready && mailerAutoconfirm === false;
    if (warn) {
      warn.hidden = !blocked;
      if (blocked) {
        warn.textContent = "⚠️ التسجيل متوقف مؤقتًا: لازم يوقف المسؤول تأكيد الإيميل (Confirm email) من إعدادات Supabase أولًا، لأن نظام الحساب هنا اسم + كلمة مرور بدون بريد.";
      }
    }
    if (submit && !submit.dataset.idleLabel) submit.disabled = blocked;
  }

  function renderAuthViews() {
    const setup = $("#cloudSetupNotice");
    const authView = $("#authView");
    const profileView = $("#profileView");
    const subtitle = $("#accountSubtitle");

    if (!ready) {
      if (setup) setup.hidden = false;
      if (authView) authView.hidden = true;
      if (profileView) profileView.hidden = true;
      if (subtitle) subtitle.textContent = "الليدربورد السحابي غير مفعّل بعد";
      return;
    }

    if (setup) setup.hidden = true;

    if (session) {
      if (authView) authView.hidden = true;
      if (profileView) profileView.hidden = false;
      if (subtitle) subtitle.textContent = "بيانات حسابك ومحاولاتك";
      renderProfile();
    } else {
      if (authView) authView.hidden = false;
      if (profileView) profileView.hidden = true;
      if (subtitle) {
        subtitle.textContent = guestMode()
          ? "أنت في وضع الضيف — سجّل حسابك عشان تشارك في الليدربورد"
          : "سجّل باسم مستخدم وكلمة مرور للمشاركة في الليدربورد";
      }
      renderSignupAvailability();
      setAuthTab(currentAuthTab);
    }
  }

  function renderProfile() {
    if (!session) return;
    const name = displayName();

    text("#profileName", name);
    const avatar = $("#profileAvatar");
    if (avatar) avatar.textContent = initial(name);

    if (profileError) {
      setMsg($("#profileMsg"), "تعذّر تحميل بيانات حسابك: " + friendlyError(profileError) + " — راجع SUPABASE_SETUP.md.", "bad");
    }

    loadMyStats();
  }

  async function loadMyStats() {
    if (!ready || !client || !session || !session.user) return;
    const uid = session.user.id;
    const req = ++statsRequest;

    try {
      const { data, error } = await client
        .from("attempts")
        .select("quiz_key, percent, score, total")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (req !== statsRequest || error) return;

      const rows = data || [];
      let best = 0;
      let sum = 0;
      const bestByQuiz = {};
      rows.forEach(row => {
        const pct = Number(row.percent) || 0;
        if (pct > best) best = pct;
        sum += pct;
        const key = row.quiz_key;
        if (key && (!bestByQuiz[key] || pct > bestByQuiz[key].percent)) {
          bestByQuiz[key] = { percent: pct, score: row.score, total: row.total };
        }
      });
      const avg = rows.length ? Math.round(sum / rows.length) : 0;

      text("#statAttempts", number(rows.length));
      text("#statBest", best + "%");
      text("#statAvg", avg + "%");

      // تحديث مؤشر التقدم في الصفحة الرئيسية من السحابة (بدون أي حفظ محلي)
      try {
        document.dispatchEvent(new CustomEvent("cf:cloud-progress", { detail: { best: bestByQuiz } }));
      } catch (e) { /* تجاهل */ }
    } catch (e) {
      /* الإحصائيات اختيارية */
    }
  }

  function openAccount(mode) {
    const modal = $("#accountModal");
    if (!modal) return;

    if (!ready) {
      renderAuthViews();
    } else if (!session) {
      setAuthTab(mode === "signup" ? "signup" : "login");
      renderAuthViews();
    } else {
      renderAuthViews();
    }

    modal.hidden = false;
    document.body.classList.add("modal-open");

    setTimeout(() => {
      let focus = null;
      if (!ready) focus = $("#accountClose");
      else if (session) focus = $("#newPassword");
      else if (currentAuthTab === "signup") focus = $("#signupName");
      else focus = $("#loginName");
      if (focus) focus.focus();
    }, 40);
  }

  function closeAccount() {
    const modal = $("#accountModal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    setMsg($("#authMsg"), "");
    setMsg($("#profileMsg"), "");
    const button = $("#accountBtn");
    if (button) button.focus();
  }

  function handleGuest() {
    if (session) return;
    setGuestMode(true);
    clearLocalBest();
    closeAccount();
    renderAccount();
    renderAuthViews();
    updateHomeCallout();
    renderLeaderboard();
  }

  /* ------------------------------------------------------------
     Auth actions
  ------------------------------------------------------------ */
  async function loadProfile() {
    if (!ready || !client || !session || !session.user) {
      profile = null;
      return null;
    }

    const uid = session.user.id;
    profileError = null;
    try {
      const res = await client
        .from("profiles")
        .select("id, username, created_at")
        .eq("id", uid)
        .maybeSingle();

      if (res.error) throw res.error;
      profile = res.data || null;

      // احتياطي لو الtrigger لم يعمل لأي سبب
      if (!profile) {
        const meta = session.user.user_metadata || {};
        const fallback = normalizedName(meta.username || meta.full_name || meta.name || "لاعب").slice(0, 24) || "لاعب";
        const inserted = await client
          .from("profiles")
          .upsert({ id: uid, username: fallback }, { onConflict: "id" })
          .select("id, username, created_at")
          .single();
        if (inserted.error) throw inserted.error;
        profile = inserted.data;
      }
    } catch (err) {
      console.warn("[CFCloud] تعذّر تحميل الملف الشخصي:", err);
      profile = null;
      profileError = err;
    }

    return profile;
  }

  async function loadAuthSettings() {
    if (!ready) return;
    try {
      const res = await fetch(cfgUrl + "/auth/v1/settings", { headers: { apikey: cfgKey } });
      if (!res.ok) return;
      const data = await res.json();
      mailerAutoconfirm = data.mailer_autoconfirm === true;
    } catch (e) {
      /* نحاول التسجيل ونعالج النتيجة لو محتاج تأكيد */
    }
    renderSignupAvailability();
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (!ready) return;

    const name = normalizedName(($("#loginName") && $("#loginName").value) || "");
    const password = String(($("#loginPassword") && $("#loginPassword").value) || "");
    const msg = $("#authMsg");

    if (!name || !password) {
      setMsg(msg, "اكتب اسم المستخدم وكلمة المرور.", "bad");
      return;
    }

    const button = $("#loginSubmit");
    setBusy(button, true, "جارٍ الدخول…");
    setMsg(msg, "");

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: usernameEmail(name),
        password: password
      });
      if (error) {
        setMsg(msg, friendlyError(error), "bad");
        return;
      }
      session = data.session || null;
      if (session) {
        setGuestMode(false);
        await loadProfile();
        renderAccount();
        renderAuthViews();
        updateHomeCallout();
        loadLeaderboard();
        const passwordInput = $("#loginPassword");
        if (passwordInput) passwordInput.value = "";
      } else {
        setMsg(msg, "تم التحقق، لكن لم يتم إنشاء جلسة. جرّب تاني.", "bad");
      }
    } catch (err) {
      setMsg(msg, friendlyError(err), "bad");
    } finally {
      setBusy(button, false);
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    if (!ready) return;

    const name = normalizedName(($("#signupName") && $("#signupName").value) || "");
    const password = String(($("#signupPassword") && $("#signupPassword").value) || "");
    const confirmed = !!($("#signupConfirm") && $("#signupConfirm").checked);
    const msg = $("#authMsg");

    if (name.length < 2 || name.length > 24) {
      setMsg(msg, "اسم المستخدم لازم يكون من 2 إلى 24 حرفًا.", "bad");
      return;
    }
    if (password.length < 6) {
      setMsg(msg, "كلمة المرور لازم تكون 6 أحرف على الأقل.", "bad");
      return;
    }
    if (!confirmed) {
      setMsg(msg, "لازم تأكد إنك فهمت أن اسم المستخدم هيظهر لكل الطلاب ومش هيتغير.", "bad");
      return;
    }
    if (mailerAutoconfirm === false) {
      setMsg(msg, "التسجيل متوقف مؤقتًا: لازم يوقف المسؤول تأكيد الإيميل (Confirm email) من إعدادات Supabase أولًا.", "bad");
      return;
    }

    const button = $("#signupSubmit");
    setBusy(button, true, "جارٍ إنشاء الحساب…");
    setMsg(msg, "");

    try {
      // فحص توفّر الاسم قبل إنشاء الحساب (لو الدالة موجودة)
      try {
        const check = await client.rpc("username_taken", { candidate: name });
        if (!check.error && check.data === true) {
          setMsg(msg, "اسم المستخدم ده محجوز. جرّب اسمًا آخر.", "bad");
          return;
        }
      } catch (e) { /* الدالة غير مثبتة بعد — نكمل */ }

      const { data, error } = await client.auth.signUp({
        email: usernameEmail(name),
        password: password,
        options: { data: { username: name } }
      });

      if (error) {
        setMsg(msg, friendlyError(error), "bad");
        return;
      }

      // حماية من كشف/تكرار الأسماء لما Supabase يرجّع مستخدمًا بدون identities
      if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setMsg(msg, "اسم المستخدم ده محجوز. جرّب اسمًا آخر.", "bad");
        return;
      }

      if (data.session) {
        session = data.session;
        setGuestMode(false);
        await loadProfile();
        renderAccount();
        renderAuthViews();
        updateHomeCallout();
        loadLeaderboard();
        setMsg($("#profileMsg"), "تم إنشاء الحساب ✓ — اسمك ثابت وهيتعرض لكل الطلاب.", "ok");
      } else {
        setAuthTab("login");
        const loginName = $("#loginName");
        if (loginName) loginName.value = name;
        setMsg(msg, "الحساب اتعمل لكنه محتاج تأكيد إيميل، وده غير متاح في نظام الاسم وكلمة المرور. اطلب من المسؤول إيقاف Confirm email ثم سجّل الدخول.", "bad");
      }
    } catch (err) {
      setMsg(msg, friendlyError(err), "bad");
    } finally {
      setBusy(button, false);
      renderSignupAvailability();
    }
  }

  async function handleSignOut() {
    if (!ready) return;
    const button = $("#signOutBtn");
    setBusy(button, true, "جارٍ الخروج…");
    try {
      await client.auth.signOut();
    } catch (e) {
      /* تجاهل */
    }
    session = null;
    profile = null;
    profileError = null;
    setGuestMode(false);
    clearLocalBest();
    setBusy(button, false);
    setAuthTab("login");
    renderAccount();
    renderAuthViews();
    updateHomeCallout();
    lb.rows = [];
    lb.count = 0;
    lb.loaded = false;
    renderLeaderboard();
  }

  async function handlePasswordSave(event) {
    event.preventDefault();
    if (!ready || !session) return;

    const input = $("#newPassword");
    const msg = $("#profileMsg");
    const password = String((input && input.value) || "");

    if (password.length < 6) {
      setMsg(msg, "كلمة المرور الجديدة لازم تكون 6 أحرف على الأقل.", "bad");
      return;
    }

    const button = $("#passwordSave");
    setBusy(button, true, "جارٍ التغيير…");
    setMsg(msg, "");

    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) {
        setMsg(msg, friendlyError(error), "bad");
        return;
      }
      if (input) input.value = "";
      setMsg(msg, "تم تغيير كلمة المرور ✓", "ok");
    } catch (err) {
      setMsg(msg, friendlyError(err), "bad");
    } finally {
      setBusy(button, false);
    }
  }

  /* ------------------------------------------------------------
     Attempt submission (called from app.js)
  ------------------------------------------------------------ */
  async function submitAttempt(input) {
    if (!ready) return { status: "unavailable" };

    if (!session) {
      try {
        const { data } = await client.auth.getSession();
        session = (data && data.session) || null;
      } catch (e) {
        session = null;
      }
    }
    if (!session || !session.user) return { status: "auth-required" };

    const payload = {
      user_id: session.user.id,
      quiz_key: String(input && input.quizKey || ""),
      score: Math.max(0, Math.round(Number(input && input.score) || 0)),
      total: Math.max(1, Math.round(Number(input && input.total) || 1)),
      duration_seconds: Math.max(0, Math.round(Number(input && input.durationSeconds) || 0))
    };
    if (payload.score > payload.total) payload.score = payload.total;

    if (!QUIZ_LABELS[payload.quiz_key]) {
      return { status: "error", message: "نوع الاختبار غير معروف." };
    }

    let result = await client.from("attempts").insert(payload);

    if (result.error && /jwt|token/i.test(result.error.message || "")) {
      try {
        const refreshed = await client.auth.refreshSession();
        session = (refreshed.data && refreshed.data.session) || session;
        if (session) result = await client.from("attempts").insert(payload);
      } catch (e) {
        /* ignore */
      }
    }

    if (result.error) {
      console.warn("[CFCloud] تعذّر حفظ المحاولة:", result.error);
      return { status: "error", message: friendlyError(result.error) };
    }

    loadLeaderboard();
    return { status: "saved" };
  }

  /* ------------------------------------------------------------
     Leaderboard
  ------------------------------------------------------------ */
  function setLeaderboardStatus(message, kind) {
    const status = $("#lbStatus");
    if (!status) return;
    status.hidden = !message;
    status.textContent = message || "";
    status.dataset.kind = kind || "";
  }

  function renderLeaderboardUnavailable() {
    const banner = $("#lbSetupBanner");
    const toolbar = $("#lbToolbar");
    const gate = $("#lbGuestGate");
    const table = $("#lbTableWrap");
    const empty = $("#lbEmpty");
    const more = $("#lbMore");

    if (banner) banner.hidden = false;
    if (toolbar) toolbar.hidden = true;
    if (gate) gate.hidden = true;
    if (table) table.hidden = true;
    if (empty) empty.hidden = true;
    if (more) more.hidden = true;
    setLeaderboardStatus("الليدربورد غير مفعّل — أضف إعدادات Supabase في supabase-config.js ثم شغّل supabase-schema.sql.", "bad");
    text("#lbSummary", "—");
  }

  function renderLeaderboardGuest() {
    const banner = $("#lbSetupBanner");
    const toolbar = $("#lbToolbar");
    const gate = $("#lbGuestGate");
    const table = $("#lbTableWrap");
    const empty = $("#lbEmpty");
    const more = $("#lbMore");

    if (banner) banner.hidden = true;
    if (toolbar) toolbar.hidden = true;
    if (gate) gate.hidden = false;
    if (table) table.hidden = true;
    if (empty) empty.hidden = true;
    if (more) more.hidden = true;
    setLeaderboardStatus("", "");
    text("#lbSummary", "—");
    const body = $("#lbTableBody");
    if (body) body.textContent = "";
  }

  function renderLeaderboard() {
    if (!ready) {
      renderLeaderboardUnavailable();
      return;
    }
    if (!session) {
      renderLeaderboardGuest();
      return;
    }

    const banner = $("#lbSetupBanner");
    const toolbar = $("#lbToolbar");
    const gate = $("#lbGuestGate");
    const status = $("#lbStatus");
    const table = $("#lbTableWrap");
    const body = $("#lbTableBody");
    const empty = $("#lbEmpty");
    const more = $("#lbMore");
    const summary = $("#lbSummary");

    if (banner) banner.hidden = true;
    if (toolbar) toolbar.hidden = false;
    if (gate) gate.hidden = true;
    if (status) status.hidden = false;

    if (body) body.textContent = "";

    const hasRows = lb.rows.length > 0;

    if (status) {
      status.dataset.kind = "";
      if (lb.loading && !hasRows) {
        status.textContent = "جارٍ تحميل المحاولات…";
        status.dataset.kind = "loading";
      } else if (lb.error) {
        status.textContent = "تعذّر تحميل الليدربورد: " + friendlyError(lb.error);
        status.dataset.kind = "bad";
      } else if (!hasRows) {
        status.textContent = "لا توجد محاولات مطابقة للفلتر الحالي.";
      } else {
        status.textContent = "عرض " + number(lb.rows.length) + " من " + number(lb.count) + " محاولة";
      }
    }

    if (table) table.hidden = !hasRows;
    if (empty) {
      empty.hidden = hasRows || lb.loading || !!lb.error;
      const title = $("#lbEmptyTitle");
      const note = $("#lbEmptyNote");
      if (lb.search || lb.quiz !== "all") {
        if (title) title.textContent = "مفيش نتائج مطابقة";
        if (note) note.textContent = "جرّب تغيير المحاضرة أو مسح كلمة البحث.";
      } else {
        if (title) title.textContent = "لسه مفيش محاولات";
        if (note) note.textContent = "حل أي اختبار وهتظهر محاولتك هنا فورًا.";
      }
    }

    if (more) {
      more.hidden = !hasRows || lb.loading || lb.rows.length >= lb.count;
      more.textContent = "عرض المزيد (" + number(Math.max(0, lb.count - lb.rows.length)) + ")";
    }

    if (summary) {
      if (lb.error) summary.textContent = "—";
      else if (!lb.count) summary.textContent = "0 محاولة";
      else {
        let best = 0;
        lb.rows.forEach(row => {
          const pct = Number(row.percent) || 0;
          if (pct > best) best = pct;
        });
        summary.textContent = number(lb.count) + " محاولة · أعلى نسبة في المعروض: " + best + "%";
      }
    }

    if (!body || !hasRows) return;

    lb.rows.forEach((row, index) => {
      const tr = document.createElement("tr");
      const isMe = !!(session && session.user && row.user_id === session.user.id);
      if (isMe) tr.className = "is-me";

      const rank = document.createElement("td");
      rank.className = "lb-rank" + (index < 3 ? " top" : "");
      rank.textContent = String(index + 1);

      const player = document.createElement("td");
      const playerWrap = document.createElement("span");
      playerWrap.className = "lb-player";
      const avatar = document.createElement("span");
      avatar.className = "lb-av";
      avatar.textContent = initial(row.username);
      const name = document.createElement("b");
      name.textContent = row.username || "لاعب";
      playerWrap.append(avatar, name);
      if (isMe) {
        const me = document.createElement("i");
        me.className = "lb-me";
        me.textContent = "أنت";
        playerWrap.appendChild(me);
      }
      player.appendChild(playerWrap);

      const quiz = document.createElement("td");
      const quizBadge = document.createElement("span");
      quizBadge.className = "lb-quiz lb-quiz-" + row.quiz_key;
      quizBadge.textContent = QUIZ_LABELS[row.quiz_key] || row.quiz_key;
      quiz.appendChild(quizBadge);

      const score = document.createElement("td");
      score.className = "lb-score";
      score.textContent = row.score + " / " + row.total;

      const percent = document.createElement("td");
      const pill = document.createElement("span");
      const pct = Number(row.percent) || 0;
      pill.className = "lb-pill " + (pct >= 80 ? "great" : pct >= 50 ? "mid" : "low");
      pill.textContent = pct + "%";
      percent.appendChild(pill);

      const duration = document.createElement("td");
      duration.className = "lb-time";
      duration.textContent = formatDuration(row.duration_seconds);

      const date = document.createElement("td");
      date.className = "lb-date";
      date.textContent = formatDate(row.created_at);

      tr.append(rank, player, quiz, score, percent, duration, date);
      body.appendChild(tr);
    });
  }

  async function loadLeaderboard(options) {
    options = options || {};
    if (!ready || !client) {
      renderLeaderboardUnavailable();
      return;
    }
    if (!session) {
      renderLeaderboardGuest();
      return;
    }

    if (options.reset) lb.limit = 25;

    const req = ++lbRequest;
    lb.loading = true;
    lb.error = null;
    renderLeaderboard();

    try {
      let query = client
        .from("leaderboard")
        .select("*", { count: "exact" });

      if (lb.quiz !== "all") query = query.eq("quiz_key", lb.quiz);
      if (lb.search) query = query.ilike("username", "%" + lb.search.replace(/[%_\\]/g, "") + "%");

      const orders = SORTS[lb.sort] || SORTS.recent;
      orders.forEach(part => {
        query = query.order(part[0], { ascending: part[1] });
      });

      const { data, error, count } = await query.range(0, Math.max(0, lb.limit - 1));

      if (req !== lbRequest) return;
      if (error) throw error;

      lb.rows = data || [];
      lb.count = typeof count === "number" ? count : lb.rows.length;
      lb.loaded = true;
    } catch (err) {
      if (req !== lbRequest) return;
      console.warn("[CFCloud] تعذّر تحميل الليدربورد:", err);
      lb.error = err;
      lb.rows = [];
      lb.count = 0;
    } finally {
      if (req === lbRequest) {
        lb.loading = false;
        renderLeaderboard();
      }
    }
  }

  /* ------------------------------------------------------------
     تحديث تلقائي للليدربورد
     Realtime في Supabase يحترم RLS ولا يرسل أحداث attempts إلا
     لصاحب المحاولة، لذلك نستخدم تحديثًا دوريًا خفيفًا.
  ------------------------------------------------------------ */
  function startAutoRefresh() {
    if (!ready) return;

    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!session || document.hidden) return;
      const panel = $("#tab-leaderboard");
      if (!panel || !panel.classList.contains("active") || lb.loading) return;
      loadLeaderboard();
    }, 20000);

    document.addEventListener("visibilitychange", () => {
      if (!session || document.hidden) return;
      const panel = $("#tab-leaderboard");
      if (!panel || !panel.classList.contains("active")) return;
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => loadLeaderboard(), 400);
    });
  }

  /* ------------------------------------------------------------
     Auth bootstrap
  ------------------------------------------------------------ */
  async function initAuth() {
    try {
      const { data } = await client.auth.getSession();
      session = (data && data.session) || null;
    } catch (e) {
      session = null;
    }

    if (session) {
      setGuestMode(false);
      await loadProfile();
    }

    renderAccount();
    renderAuthViews();
    updateHomeCallout();
    startAutoRefresh();
    loadAuthSettings();

    client.auth.onAuthStateChange((event, newSession) => {
      session = newSession || null;

      if (!session) {
        profile = null;
        profileError = null;
        clearLocalBest();
        renderAccount();
        renderAuthViews();
        updateHomeCallout();
        lb.rows = [];
        lb.count = 0;
        lb.loaded = false;
        renderLeaderboard();
        return;
      }

      if (event === "TOKEN_REFRESHED") {
        renderAccount();
        return;
      }

      // لا نستخدم await داخل الcallback مباشرة
      setTimeout(async () => {
        setGuestMode(false);
        await loadProfile();
        renderAccount();
        renderAuthViews();
        updateHomeCallout();
        loadLeaderboard();
      }, 0);
    });
  }

  /* ------------------------------------------------------------
     UI wiring
  ------------------------------------------------------------ */
  function initUi() {
    const accountBtn = $("#accountBtn");
    if (accountBtn) {
      accountBtn.addEventListener("click", () => openAccount());
    }

    const homeBtn = $("#homeCloudBtn");
    if (homeBtn) {
      homeBtn.addEventListener("click", () => {
        if (!ready) openAccount();
        else if (session) openAccount("profile");
        else openAccount(guestMode() ? "signup" : "login");
      });
    }

    const closeBtn = $("#accountClose");
    if (closeBtn) closeBtn.addEventListener("click", closeAccount);

    const modal = $("#accountModal");
    if (modal) {
      modal.addEventListener("click", event => {
        if (event.target === modal) closeAccount();
      });
    }

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        if (modal && !modal.hidden) closeAccount();
      }
    });

    $$("[data-open-account]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        openAccount(button.getAttribute("data-open-account") || undefined);
      });
    });

    // إغلاق المودال عند الانتقال لتبويب آخر من داخله
    if (modal) {
      modal.addEventListener("click", event => {
        const goto = event.target.closest("[data-goto]");
        if (goto) setTimeout(closeAccount, 60);
      });
    }

    $$("[data-auth-tab]").forEach(button => {
      button.addEventListener("click", () => setAuthTab(button.dataset.authTab));
    });

    const loginForm = $("#loginForm");
    if (loginForm) loginForm.addEventListener("submit", handleLogin);

    const signupForm = $("#signupForm");
    if (signupForm) signupForm.addEventListener("submit", handleSignup);

    const guestBtn = $("#guestBtn");
    if (guestBtn) guestBtn.addEventListener("click", handleGuest);

    const signOutBtn = $("#signOutBtn");
    if (signOutBtn) signOutBtn.addEventListener("click", handleSignOut);

    const passwordForm = $("#passwordForm");
    if (passwordForm) passwordForm.addEventListener("submit", handlePasswordSave);

    // فلاتر الليدربورد
    const quizSelect = $("#lbQuiz");
    if (quizSelect) {
      quizSelect.addEventListener("change", () => {
        lb.quiz = quizSelect.value;
        lb.limit = 25;
        loadLeaderboard();
      });
    }

    const sortSelect = $("#lbSort");
    if (sortSelect) {
      sortSelect.addEventListener("change", () => {
        lb.sort = sortSelect.value;
        lb.limit = 25;
        loadLeaderboard();
      });
    }

    const searchInput = $("#lbSearch");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          lb.search = searchInput.value.trim();
          lb.limit = 25;
          loadLeaderboard();
        }, 350);
      });
    }

    const refreshBtn = $("#lbRefresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => loadLeaderboard({ reset: true }));
    }

    const moreBtn = $("#lbMore");
    if (moreBtn) {
      moreBtn.addEventListener("click", () => {
        lb.limit += 25;
        loadLeaderboard();
      });
    }

    document.addEventListener("cf:tab", event => {
      if (!event.detail || event.detail.tab !== "leaderboard" || !ready) return;
      if (!session) {
        renderLeaderboardGuest();
        return;
      }
      if (lb.loading) return;
      if (!lb.loaded || !lb.rows.length) loadLeaderboard();
      else renderLeaderboard();
    });

    window.addEventListener("online", () => {
      if (ready && session) loadLeaderboard();
    });
  }

  /* ------------------------------------------------------------
     Public API
  ------------------------------------------------------------ */
  window.CFCloud = {
    isConfigured: () => ready,
    getUser: () => (session ? session.user : null),
    getProfile: () => profile,
    isGuest: () => !session && guestMode(),
    openAccount,
    closeAccount,
    enterGuest: handleGuest,
    submitAttempt,
    refreshLeaderboard: () => loadLeaderboard({ reset: true }),
    signOut: handleSignOut
  };

  /* ------------------------------------------------------------
     Boot
  ------------------------------------------------------------ */
  function boot() {
    if (booted) return;
    booted = true;

    initUi();
    renderAccount();
    renderAuthViews();
    updateHomeCallout();

    if (!ready) {
      renderLeaderboardUnavailable();
      return;
    }

    initAuth();
    renderLeaderboard();
    startAutoRefresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
