/* ============================================================
   Computer Fundamentals — Interactive Course
   app.js — navigation, quizzes, widgets, theme & progress
   ============================================================ */
(function () {
  "use strict";

  const QUIZ = (typeof QUIZZES !== "undefined") ? QUIZZES : {};
  const LECTURES = ["l1", "l3", "l4", "l5", "l6"];
  const LECTURE_NAMES = {
    l1: "المحاضرة 1 و2 — مقدمة في الحوسبة",
    l3: "المحاضرة 3 — العتاد",
    l4: "المحاضرة 4 — Windows وWord",
    l5: "المحاضرة 5 — Excel وPowerPoint",
    l6: "المحاضرة 6 — أنظمة الأعداد والترميز"
  };
  const LETTERS = ["A", "B", "C", "D", "E", "F"];
  const TAB_NAMES = ["home", "l1", "l3", "l4", "l5", "l6", "exercises", "exam"];

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const on = (el, ev, fn, opts) => { if (el) el.addEventListener(ev, fn, opts); };
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  /* ------------------------------------------------------------
     Storage helpers
  ------------------------------------------------------------ */
  function storeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storeSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function bestKey(key) { return "cf-best-" + key; }

  function readBest(key) {
    try {
      const raw = storeGet(bestKey(key));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data.percent !== "number" || !isFinite(data.percent)) return null;
      return data;
    } catch (e) { return null; }
  }

  function saveBest(key, result) {
    const prev = readBest(key);
    const best = (prev && prev.percent >= result.percent) ? prev : result;
    const record = {
      percent: Math.round(best.percent),
      score: best.score,
      total: best.total,
      done: true,
      at: Date.now()
    };
    storeSet(bestKey(key), JSON.stringify(record));
    markDone(key);
    updateHome();
    return { best: record, isNew: !prev || result.percent > prev.percent };
  }

  function markDone(key) {
    if (key === "exam") return;
    const btn = $('.tab-btn[data-tab="' + key + '"]');
    if (btn) btn.classList.add("done");
  }

  function updateHome() {
    let completed = 0;
    LECTURES.forEach(key => {
      const best = readBest(key);
      if (best) { completed++; markDone(key); }
    });

    const pct = Math.round((completed / LECTURES.length) * 100);
    const ring = $("#homeRing");
    const ringTxt = $("#homeRingTxt");
    const bar = $("#homeBar");
    const progressTxt = $("#homeProgressTxt");
    const examTxt = $("#homeExamTxt");
    const examBar = $("#homeExamBar");

    if (ring) ring.style.setProperty("--p", pct);
    if (ringTxt) ringTxt.textContent = pct + "%";
    if (bar) bar.style.width = pct + "%";
    if (progressTxt) progressTxt.textContent = completed + " من " + LECTURES.length + " محاضرات";

    const exam = readBest("exam");
    if (exam) {
      if (examTxt) examTxt.textContent = exam.percent + "% (" + exam.score + "/" + exam.total + ")";
      if (examBar) examBar.style.width = exam.percent + "%";
    } else {
      if (examTxt) examTxt.textContent = "لم تجرّبه بعد";
      if (examBar) examBar.style.width = "0%";
    }
  }

  /* ------------------------------------------------------------
     Theme
  ------------------------------------------------------------ */
  function applyTheme(theme) {
    const isLight = theme === "light";
    document.documentElement.setAttribute("data-theme", isLight ? "light" : "dark");
    document.documentElement.style.colorScheme = isLight ? "light" : "dark";
    const btn = $("#themeBtn");
    if (btn) {
      btn.textContent = isLight ? "🌙" : "☀️";
      btn.title = isLight ? "التبديل إلى الوضع الداكن" : "التبديل إلى الوضع الفاتح";
      btn.setAttribute("aria-label", btn.title);
    }
  }

  function initTheme() {
    const saved = storeGet("cf-theme");
    applyTheme(saved === "light" ? "light" : "dark");
    on($("#themeBtn"), "click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(next);
      storeSet("cf-theme", next);
    });
  }

  /* ------------------------------------------------------------
     Navigation
  ------------------------------------------------------------ */
  let hashLock = false;

  function setHash(value) {
    if (hashLock) return;
    try {
      history.replaceState(null, "", "#" + value);
    } catch (e) {
      if (location.hash !== "#" + value) location.hash = value;
    }
  }

  function scrollHighlight(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.pageYOffset - 86;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    try {
      el.animate([
        { boxShadow: "0 0 0 0 rgba(34,211,238,0)" },
        { boxShadow: "0 0 0 6px rgba(34,211,238,.42)" },
        { boxShadow: "0 0 0 0 rgba(34,211,238,0)" }
      ], { duration: 1200, easing: "ease-out" });
    } catch (e) { /* ignore */ }
  }

  function navigate(target, opts) {
    opts = opts || {};
    if (!target) return;

    let tabName = target;
    let scrollTarget = null;
    if (target.indexOf("quiz-") === 0) {
      tabName = target.slice(5);
      scrollTarget = target;
    }

    const panel = document.getElementById("tab-" + tabName);
    if (!panel) return;

    const wasActive = panel.classList.contains("active");
    $$(".tab-panel").forEach(p => p.classList.toggle("active", p === panel));
    $$(".tab-btn[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === tabName));

    if (!opts.noHash) setHash(target);

    if (scrollTarget) {
      setTimeout(() => scrollHighlight(scrollTarget), 130);
    } else if (!opts.noScroll) {
      window.scrollTo({ top: 0, behavior: wasActive ? "smooth" : "auto" });
    }

    setTimeout(syncReveals, wasActive ? 0 : 110);
  }

  function handleHash() {
    const raw = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    if (!raw) return;
    const isTab = TAB_NAMES.indexOf(raw) >= 0;
    const isQuiz = raw.indexOf("quiz-") === 0;
    if (isTab || isQuiz) {
      hashLock = true;
      navigate(raw, { noHash: true });
      hashLock = false;
    }
  }

  function initTabs() {
    $$(".tab-btn[data-tab]").forEach(btn => {
      on(btn, "click", () => navigate(btn.dataset.tab));
    });

    $$("[data-goto]").forEach(el => {
      on(el, "click", event => {
        if (el.tagName === "A" && el.getAttribute("href")) return;
        event.preventDefault();
        navigate(el.dataset.goto);
      });

      if (el.tagName === "A" && !el.getAttribute("href")) {
        el.setAttribute("role", "link");
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
        on(el, "keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            navigate(el.dataset.goto);
          }
        });
      }
    });

    on(window, "hashchange", handleHash);

    if (location.hash) {
      hashLock = true;
      handleHash();
      hashLock = false;
    }
  }

  function initSubTabs() {
    $$(".pill[data-sub]").forEach(pill => {
      on(pill, "click", () => {
        const targetId = pill.dataset.sub;
        const target = document.getElementById(targetId);
        if (!target) return;

        const group = pill.parentElement;
        $$(".pill[data-sub]", group).forEach(p => p.classList.toggle("active", p === pill));

        const panelParent = target.parentElement;
        Array.from(panelParent.children).forEach(child => {
          if (child.classList && child.classList.contains("subpanel")) {
            child.classList.toggle("active", child === target);
          }
        });

        syncReveals();
      });
    });
  }

  /* ------------------------------------------------------------
     Scroll progress + back to top
  ------------------------------------------------------------ */
  function initScrollUi() {
    const progress = $("#scrollProgress");
    const toTop = $("#toTop");

    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      if (progress) progress.style.width = pct + "%";
      if (toTop) toTop.classList.toggle("show", window.scrollY > 550);
    };

    on(window, "scroll", update, { passive: true });
    on(window, "resize", update);
    on(toTop, "click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    update();
  }

  /* ------------------------------------------------------------
     Reveal on scroll
  ------------------------------------------------------------ */
  function syncReveals() {
    const panel = $(".tab-panel.active");
    if (!panel) return;
    $$(".reveal:not(.in)", panel).forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.96 && r.bottom > 0) el.classList.add("in");
    });
  }

  function initReveals() {
    const targets = $$(".sec");
    if (!("IntersectionObserver" in window)) {
      targets.forEach(t => t.classList.add("reveal", "in"));
      return;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.04, rootMargin: "0px 0px -30px 0px" });

    targets.forEach(t => {
      t.classList.add("reveal");
      observer.observe(t);
    });

    setTimeout(syncReveals, 500);
  }

  /* ------------------------------------------------------------
     Flip cards
  ------------------------------------------------------------ */
  function bindFlips(root) {
    $$(".flip", root).forEach(flip => {
      if (flip.dataset.flipBound === "1") return;
      flip.dataset.flipBound = "1";

      const toggle = () => flip.classList.toggle("open");
      on(flip, "click", toggle);
      on(flip, "keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        }
      });
    });
  }

  /* ------------------------------------------------------------
     Quiz engine
  ------------------------------------------------------------ */
  function scoreMessage(pct) {
    if (pct === 100) return "كامل العلامة! معلوماتك ثابتة 🏆";
    if (pct >= 90) return "ممتاز! فهمك للمحاضرة قوي جدًا 🌟";
    if (pct >= 75) return "جيد جدًا — راجع الأسئلة التي أخطأت فيها وستكون جاهزًا 💪";
    if (pct >= 50) return "بداية جيدة، لكن تحتاج مراجعة الأقسام المرتبطة بالأخطاء 📚";
    return "لا تقلق — اقرأ الشرح تحت كل سؤال ثم أعد المحاولة. التكرار يصنع الإتقان 🔁";
  }

  function shuffle(array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = a[i];
      a[i] = a[j];
      a[j] = temp;
    }
    return a;
  }

  function renderQuiz(container, key, items, opts) {
    opts = opts || {};
    if (!container) return;
    if (!items || !items.length) {
      container.innerHTML = '<div class="card" style="text-align:center">لا توجد أسئلة متاحة حاليًا.</div>';
      return;
    }

    const total = items.length;
    const isExam = key === "exam";
    const meta = QUIZ[key] || {};
    const best = readBest(key);
    const baseSubtitle = opts.subtitle || meta.subtitle || "";

    container.innerHTML = "";

    const quiz = document.createElement("div");
    quiz.className = "quiz";

    const head = document.createElement("div");
    head.className = "quiz-head";
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = isExam ? "اختبار شامل" : "اختبر نفسك";
    const title = document.createElement("h3");
    title.textContent = opts.title || meta.title || "اختبار";
    head.append(badge, title);

    const sub = document.createElement("p");
    sub.className = "quiz-sub";
    sub.textContent = baseSubtitle + (best ? " · أفضل نتيجة محفوظة: " + best.percent + "%" : "");

    quiz.append(head, sub);

    const qEls = [];
    const state = {
      selected: new Array(total).fill(-1),
      corrected: false
    };

    items.forEach((item, index) => {
      const q = document.createElement("div");
      q.className = "q";
      q.dataset.index = index;

      const top = document.createElement("div");
      top.className = "q-top";

      const num = document.createElement("span");
      num.className = "q-num";
      num.textContent = String(index + 1);

      const text = document.createElement("div");
      text.className = "q-text";

      if (isExam && item.lecture) {
        const source = document.createElement("span");
        source.className = "q-src";
        source.textContent = LECTURE_NAMES[item.lecture] || item.lecture;
        text.appendChild(source);
      }

      text.appendChild(document.createTextNode(item.q || ""));
      top.append(num, text);
      q.appendChild(top);

      const optionsWrap = document.createElement("div");
      optionsWrap.className = "q-opts";

      const options = item.o || [];
      const correctIndex = clamp(Number(item.a) || 0, 0, Math.max(0, options.length - 1));

      options.forEach((optionText, optionIndex) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "opt";
        option.setAttribute("aria-pressed", "false");

        const keySpan = document.createElement("span");
        keySpan.className = "key";
        keySpan.textContent = LETTERS[optionIndex] || String(optionIndex + 1);

        const optText = document.createElement("span");
        optText.className = "opt-txt";
        optText.textContent = optionText;

        const mark = document.createElement("span");
        mark.className = "mark";

        option.append(keySpan, optText, mark);
        option.addEventListener("click", () => choose(index, optionIndex));
        optionsWrap.appendChild(option);
      });

      const explanation = document.createElement("div");
      explanation.className = "exp";

      const answerLine = document.createElement("div");
      const answerLabel = document.createElement("b");
      answerLabel.textContent = "الإجابة الصحيحة: ";
      answerLine.append(answerLabel, document.createTextNode(
        (LETTERS[correctIndex] || String(correctIndex + 1)) + " — " + (options[correctIndex] || "—")
      ));

      const explanationLine = document.createElement("div");
      explanationLine.style.marginTop = "4px";
      const explanationLabel = document.createElement("b");
      explanationLabel.textContent = "الشرح: ";
      explanationLine.append(explanationLabel, document.createTextNode(item.e || "—"));

      explanation.append(answerLine, explanationLine);

      if (isExam && item.lecture) {
        const sourceLine = document.createElement("div");
        sourceLine.style.marginTop = "4px";
        const sourceLabel = document.createElement("b");
        sourceLabel.textContent = "المصدر: ";
        sourceLine.append(sourceLabel, document.createTextNode(LECTURE_NAMES[item.lecture] || item.lecture));
        explanation.appendChild(sourceLine);
      }

      q.append(optionsWrap, explanation);
      qEls.push(q);
      quiz.appendChild(q);
    });

    const bar = document.createElement("div");
    bar.className = "quiz-bar";

    const answered = document.createElement("span");
    answered.className = "answered";

    const spacer = document.createElement("span");
    spacer.className = "spacer";

    const checkBtn = document.createElement("button");
    checkBtn.type = "button";
    checkBtn.className = "btn btn-primary";
    checkBtn.textContent = "صحّح إجاباتي ✓";

    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "btn btn-ghost";
    retryBtn.style.display = "none";
    retryBtn.textContent = opts.retryLabel || "إعادة المحاولة ↻";

    bar.append(answered, spacer, checkBtn, retryBtn);

    const scoreEl = document.createElement("div");
    scoreEl.className = "score";

    const ring = document.createElement("div");
    ring.className = "ring";
    ring.style.setProperty("--p", "0");
    const ringPct = document.createElement("b");
    ringPct.textContent = "0%";
    const ringSmall = document.createElement("small");
    ringSmall.textContent = "0 / 0";
    ring.append(ringPct, ringSmall);

    const scoreText = document.createElement("div");
    scoreText.className = "score-txt";
    const scoreTitle = document.createElement("b");
    const scoreDetail = document.createElement("p");
    scoreText.append(scoreTitle, scoreDetail);
    scoreEl.append(ring, scoreText);

    quiz.append(bar, scoreEl);
    container.appendChild(quiz);

    function updateAnswered() {
      const count = state.selected.filter(value => value >= 0).length;
      answered.textContent = "أجبت " + count + " من " + total + " سؤالًا";
      answered.style.color = count === total ? "var(--ok)" : "var(--muted)";
    }

    function choose(qIndex, optionIndex) {
      if (state.corrected) return;
      state.selected[qIndex] = optionIndex;
      $$(".opt", qEls[qIndex]).forEach((option, index) => {
        option.classList.toggle("sel", index === optionIndex);
      });
      updateAnswered();
    }

    checkBtn.addEventListener("click", () => {
      if (state.corrected) return;

      const missing = state.selected.indexOf(-1);
      if (missing >= 0) {
        const left = total - state.selected.filter(value => value >= 0).length;
        answered.textContent = "⚠️ باقي " + left + " سؤال — جاوب كل الأسئلة الأول";
        answered.style.color = "var(--bad)";
        qEls[missing].scrollIntoView({ behavior: "smooth", block: "center" });
        try {
          qEls[missing].animate([
            { boxShadow: "0 0 0 0 rgba(251,113,133,0)" },
            { boxShadow: "0 0 0 6px rgba(251,113,133,.42)" },
            { boxShadow: "0 0 0 0 rgba(251,113,133,0)" }
          ], { duration: 1200 });
        } catch (e) { /* ignore */ }
        return;
      }

      state.corrected = true;
      let score = 0;

      items.forEach((item, index) => {
        const options = item.o || [];
        const correctIndex = clamp(Number(item.a) || 0, 0, Math.max(0, options.length - 1));
        const chosen = state.selected[index];
        const optionEls = $$(".opt", qEls[index]);

        optionEls.forEach((option, optionIndex) => {
          option.classList.add("locked");
          option.setAttribute("aria-pressed", optionIndex === chosen ? "true" : "false");

          const mark = $(".mark", option);
          if (optionIndex === correctIndex) {
            option.classList.add("correct");
            if (mark) mark.textContent = "✓";
          }
          if (optionIndex === chosen && chosen !== correctIndex) {
            option.classList.add("wrong");
            if (mark) mark.textContent = "✗";
          }
        });

        qEls[index].classList.add(chosen === correctIndex ? "correct-q" : "wrong-q");
        qEls[index].classList.add("revealed");
        if (chosen === correctIndex) score++;
      });

      const pct = Math.round((score / total) * 100);
      const saved = saveBest(key, { percent: pct, score: score, total: total });

      ringPct.textContent = pct + "%";
      ringSmall.textContent = score + " / " + total;
      scoreTitle.textContent = scoreMessage(pct);
      scoreDetail.textContent = "نتيجتك: " + score + " صحيحة من " + total + " (" + pct + "%). " +
        (saved.isNew ? "رقم قياسي جديد! 🎉" : "أفضل نتيجة محفوظة: " + saved.best.percent + "%");

      scoreEl.classList.add("show");
      requestAnimationFrame(() => ring.style.setProperty("--p", pct));

      checkBtn.style.display = "none";
      retryBtn.style.display = "";
      answered.textContent = "انتهى الاختبار — " + score + " صحيحة و" + (total - score) + " خاطئة";
      answered.style.color = "var(--ok)";
      sub.textContent = baseSubtitle + " · أفضل نتيجة محفوظة: " + saved.best.percent + "%";
    });

    retryBtn.addEventListener("click", () => {
      if (isExam && typeof opts.onRetry === "function") {
        opts.onRetry();
      } else {
        renderQuiz(container, key, items, opts);
      }
    });

    updateAnswered();
  }

  function initQuizzes() {
    LECTURES.forEach(key => {
      const container = document.getElementById("quiz-" + key);
      const lecture = QUIZ[key];
      if (container && lecture && Array.isArray(lecture.questions)) {
        renderQuiz(container, key, lecture.questions.slice());
      }
    });
  }

  function startExam() {
    const intro = $("#examIntro");
    const container = $("#quiz-exam");
    if (!container) return;
    if (intro) intro.style.display = "none";

    const picked = [];

    // 4 أسئلة عشوائية من كل محاضرة = 20 سؤالًا بتغطية متوازنة
    LECTURES.forEach(key => {
      const lecture = QUIZ[key];
      const pool = lecture && Array.isArray(lecture.questions) ? shuffle(lecture.questions) : [];
      pool.slice(0, 4).forEach(question => {
        picked.push(Object.assign({}, question, { lecture: key }));
      });
    });

    // احتياطي في حال كان بنك الأسئلة أقل من المتوقع
    if (picked.length < 20) {
      const used = new Set(picked.map(q => q.q));
      const rest = [];
      LECTURES.forEach(key => {
        const lecture = QUIZ[key];
        (lecture && lecture.questions || []).forEach(question => {
          if (!used.has(question.q)) rest.push(Object.assign({}, question, { lecture: key }));
        });
      });
      picked.push.apply(picked, shuffle(rest).slice(0, 20 - picked.length));
    }

    const items = shuffle(picked).slice(0, 20);

    renderQuiz(container, "exam", items, {
      title: "الاختبار الشامل",
      subtitle: items.length + " سؤالًا عشوائيًا — 4 من كل محاضرة. أجب عن الكل ثم اضغط «صحّح إجاباتي».",
      retryLabel: "اختبار جديد 🔄",
      onRetry: startExam
    });

    setTimeout(() => {
      container.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function initExam() {
    on($("#examStart"), "click", startExam);
  }

  /* ------------------------------------------------------------
     Pixel editor
  ------------------------------------------------------------ */
  function initPixel() {
    const grid = $("#pixelGrid");
    const output = $("#pixelOut");
    if (!grid || !output) return;

    const smile = [
      "00111100",
      "01000010",
      "10100101",
      "10000001",
      "10100101",
      "10011001",
      "01000010",
      "00111100"
    ].join("");

    const heart = [
      "00000000",
      "01100110",
      "11111111",
      "11111111",
      "11111111",
      "01111110",
      "00111100",
      "00011000"
    ].join("");

    const cells = [];
    for (let i = 0; i < 64; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.dataset.index = String(i);
      cell.setAttribute("aria-label", "بكسل رقم " + (i + 1));
      cell.setAttribute("aria-pressed", "false");
      cell.addEventListener("click", () => {
        cell.classList.toggle("on");
        cell.setAttribute("aria-pressed", cell.classList.contains("on") ? "true" : "false");
        updateOutput();
      });
      grid.appendChild(cell);
      cells.push(cell);
    }

    function updateOutput() {
      const bits = cells.map(cell => cell.classList.contains("on") ? "1" : "0").join("");
      output.textContent = bits.replace(/(.{8})(?=.)/g, "$1 ");
    }

    function setPattern(pattern) {
      const clean = pattern.replace(/\s/g, "");
      cells.forEach((cell, index) => {
        const onCell = clean[index] === "1";
        cell.classList.toggle("on", onCell);
        cell.setAttribute("aria-pressed", onCell ? "true" : "false");
      });
      updateOutput();
    }

    on($("#pixelClear"), "click", () => setPattern("0".repeat(64)));
    on($("#pixelSmile"), "click", () => setPattern(smile));
    on($("#pixelHeart"), "click", () => setPattern(heart));

    updateOutput();
  }

  /* ------------------------------------------------------------
     CPU instruction cycle
  ------------------------------------------------------------ */
  function initCpu() {
    const steps = $$("#cpuSteps .step");
    const body = $("#cpuBody");
    const nextBtn = $("#cpuNext");
    const autoBtn = $("#cpuAuto");
    if (!steps.length || !body) return;

    const content = [
      "<b>1. Fetch — احضار التعليمية:</b> تجلب وحدة التحكم (CU) التعليمية التالية من الذاكرة (RAM) وتضعها في المعالج استعدادًا لفهمها. تخيّلها كأنك تسحب ورقة تعليمات من الدرج.",
      "<b>2. Decode — فكّ التشفير:</b> تفكّ وحدة التحكم شفرة التعليمية وتفهم المطلوب: هل هي جمع؟ مقارنة؟ نقل بيانات؟ ثم تحدد أي وحدة ستنفّذها.",
      "<b>3. Execute — التنفيذ:</b> تنفّذ الوحدة المناسبة العملية — غالبًا ALU للعمليات الحسابية والمنطقية — ثم تُخزَّن النتيجة أو تُرسَل إلى الإخراج، وتستعد الدورة لتعليمية جديدة."
    ];

    let index = 0;
    let timer = null;

    function render() {
      steps.forEach((step, i) => step.classList.toggle("active", i === index));
      body.innerHTML = content[index] || "";
    }

    function stopAuto() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (autoBtn) autoBtn.textContent = "تشغيل تلقائي ▶";
    }

    function goTo(i) {
      index = (i + content.length) % content.length;
      render();
    }

    steps.forEach((step, i) => {
      step.addEventListener("click", () => {
        stopAuto();
        goTo(i);
      });
    });

    on(nextBtn, "click", () => {
      stopAuto();
      goTo(index + 1);
    });

    on(autoBtn, "click", () => {
      if (timer) {
        stopAuto();
        return;
      }
      autoBtn.textContent = "إيقاف تلقائي ⏸";
      timer = setInterval(() => goTo(index + 1), 2200);
    });

    render();
  }

  /* ------------------------------------------------------------
     Data-size converter
  ------------------------------------------------------------ */
  function initSize() {
    const valueInput = $("#sizeVal");
    const unitSelect = $("#sizeUnit");
    const button = $("#sizeGo");
    const output = $("#sizeOut");
    if (!valueInput || !unitSelect || !output) return;

    const units = ["B", "KB", "MB", "GB", "TB"];

    function formatNumber(number) {
      if (!isFinite(number)) return "—";
      if (number !== 0 && (Math.abs(number) >= 1e15 || Math.abs(number) < 1e-6)) {
        return number.toExponential(4);
      }
      return number.toLocaleString("en-US", { maximumFractionDigits: 6 });
    }

    function run() {
      const value = parseFloat(valueInput.value);
      const unitIndex = clamp(parseInt(unitSelect.value, 10) || 0, 0, units.length - 1);

      if (!isFinite(value) || value < 0) {
        output.innerHTML = '<div class="conv-cell" style="grid-column:1/-1"><b>تنبيه</b><span style="direction:rtl">أدخل قيمة رقمية موجبة</span></div>';
        return;
      }

      const bytes = value * Math.pow(1024, unitIndex);
      const values = [
        { label: "Bits (bit)", value: bytes * 8 },
        { label: "Bytes (B)", value: bytes },
        { label: "Kilobytes (KB)", value: bytes / Math.pow(1024, 1) },
        { label: "Megabytes (MB)", value: bytes / Math.pow(1024, 2) },
        { label: "Gigabytes (GB)", value: bytes / Math.pow(1024, 3) },
        { label: "Terabytes (TB)", value: bytes / Math.pow(1024, 4) }
      ];

      output.innerHTML = values.map(item =>
        '<div class="conv-cell"><b>' + item.label + '</b><span>' + formatNumber(item.value) + '</span></div>'
      ).join("");
    }

    on(button, "click", run);
    on(valueInput, "input", run);
    on(unitSelect, "change", run);
    run();
  }

  /* ------------------------------------------------------------
     Windows shortcuts — flip cards
  ------------------------------------------------------------ */
  function initShortcuts() {
    const cards = $("#shortcutCards");
    if (!cards) return;

    const shortcuts = [
      { keys: "Ctrl + C", title: "Copy — نسخ", desc: "ينسخ العنصر المحدد إلى الحافظة دون حذفه من مكانه." },
      { keys: "Ctrl + V", title: "Paste — لصق", desc: "يلصق محتوى الحافظة في المكان الحالي." },
      { keys: "Ctrl + X", title: "Cut — قص", desc: "ينقل العنصر المحدد إلى الحافظة، ثم تلصقه بـ Ctrl + V." },
      { keys: "Ctrl + Z", title: "Undo — تراجع", desc: "يرجع آخر خطوة قمت بها. منقذ ممتاز عند الخطأ." },
      { keys: "Ctrl + Y", title: "Redo — إعادة", desc: "يعيد تنفيذ الخطوة التي تراجعت عنها." },
      { keys: "Ctrl + A", title: "Select All — تحديد الكل", desc: "يحدد كل المحتوى في النافذة أو المستند." },
      { keys: "Ctrl + S", title: "Save — حفظ", desc: "يحفظ المستند الحالي. احفظ كثيرًا لتجنب فقدان العمل." },
      { keys: "Ctrl + F", title: "Find — بحث", desc: "يفتح مربع البحث للعثور على كلمة داخل الصفحة أو الملف." },
      { keys: "Win + D", title: "Desktop — إظهار سطح المكتب", desc: "يُصغّر كل النوافذ فورًا ويعرض سطح المكتب." },
      { keys: "Win + E", title: "File Explorer — مستكشف الملفات", desc: "يفتح مستكشف الملفات لتصفح الأقراص والمجلدات." },
      { keys: "Alt + Tab", title: "Switch — تبديل النوافذ", desc: "ينتقل بين النوافذ والتطبيقات المفتوحة." },
      { keys: "Ctrl + Shift + Esc", title: "Task Manager — مدير المهام", desc: "يفتح مدير المهام لمراقبة البرامج وإنهاء التطبيقات المتوقفة." }
    ];

    cards.innerHTML = shortcuts.map(item =>
      '<div class="flip" tabindex="0" role="button" aria-label="اختصار ' + item.keys + '">' +
        '<div class="flip-inner">' +
          '<div class="flip-face flip-front">' +
            '<span class="ico">⌨️</span>' +
            '<b>' + item.keys + '</b>' +
            '<small>اضغط للكشف</small>' +
            '<span class="flip-hint">' + item.title + '</span>' +
          '</div>' +
          '<div class="flip-face flip-back">' +
            '<b>' + item.title + '</b>' +
            item.desc +
          '</div>' +
        '</div>' +
      '</div>'
    ).join("");

    bindFlips(cards);
  }

  /* ------------------------------------------------------------
     Mini Excel
  ------------------------------------------------------------ */
  function initExcel() {
    const table = $("#xlSheet");
    const refLabel = $("#xlRef");
    const fxLabel = $("#xlFx");
    const message = $("#xlMsg");
    if (!table) return;

    const columns = ["A", "B", "C", "D", "E"];
    const rowCount = 8;
    const defaults = {
      A1: "Name", B1: "Age", C1: "Score", D1: "Result", E1: "Note",
      A2: "Ahmed", B2: "20", C2: "90",
      A3: "Ali", B3: "22", C3: "70",
      A4: "Omar", B4: "21", C4: "85"
    };

    let raw = Object.assign({}, defaults);
    let cache = {};
    let currentRef = "A1";
    let currentInput = null;

    function normalize(value) {
      return String(value == null ? "" : value).trim();
    }

    function isFormula(value) {
      return normalize(value).charAt(0) === "=";
    }

    function parseNumeric(value) {
      const text = normalize(value);
      if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
      const number = Number(text);
      return isFinite(number) ? number : null;
    }

    function columnIndex(letters) {
      let result = 0;
      const upper = letters.toUpperCase();
      for (let i = 0; i < upper.length; i++) {
        result = result * 26 + (upper.charCodeAt(i) - 64);
      }
      return result - 1;
    }

    function columnName(index) {
      let name = "";
      let n = index + 1;
      while (n > 0) {
        const rem = (n - 1) % 26;
        name = String.fromCharCode(65 + rem) + name;
        n = Math.floor((n - 1) / 26);
      }
      return name;
    }

    function rangeRefs(start, end) {
      const startMatch = /^([A-Z]+)(\d+)$/i.exec(start);
      const endMatch = /^([A-Z]+)(\d+)$/i.exec(end);
      if (!startMatch || !endMatch) return [];
      let c1 = columnIndex(startMatch[1]);
      let c2 = columnIndex(endMatch[1]);
      let r1 = parseInt(startMatch[2], 10);
      let r2 = parseInt(endMatch[2], 10);
      if (c1 > c2) { const tc = c1; c1 = c2; c2 = tc; }
      if (r1 > r2) { const tr = r1; r1 = r2; r2 = tr; }
      const refs = [];
      for (let row = r1; row <= r2; row++) {
        for (let col = c1; col <= c2; col++) {
          refs.push(columnName(col) + row);
          if (refs.length > 500) return refs;
        }
      }
      return refs;
    }

    function cellLiteral(value) {
      if (typeof value === "number" && isFinite(value)) return "(" + value + ")";
      if (typeof value === "string") return JSON.stringify(value);
      if (typeof value === "boolean") return value ? "true" : "false";
      return "null";
    }

    function evaluateCell(ref, stack) {
      const upperRef = ref.toUpperCase();
      if (Object.prototype.hasOwnProperty.call(cache, upperRef)) return cache[upperRef];
      if (stack.indexOf(upperRef) >= 0) throw new Error("مرجع دائري");
      if (stack.length > 40) throw new Error("مراجع متداخلة كثيرة");

      const value = normalize(raw[upperRef]);

      if (value === "") {
        cache[upperRef] = null;
        return null;
      }
      if (!isFormula(value)) {
        const number = parseNumeric(value);
        cache[upperRef] = number === null ? value : number;
        return cache[upperRef];
      }

      stack.push(upperRef);
      const result = evaluateFormula(value.slice(1), stack);
      stack.pop();
      cache[upperRef] = result;
      return result;
    }

    function evaluateFormula(formula, stack) {
      let expression = String(formula || "").trim();

      // حماية النصوص بين علامتي التنصيص قبل استبدال المراجع
      const strings = [];
      expression = expression.replace(/"(?:[^"\\]|\\.)*"/g, match => {
        strings.push(match);
        return "__STR" + (strings.length - 1) + "__";
      });

      // تحويل النطاقات مثل C2:C4 إلى قيم الخلايا
      expression = expression.replace(/\b([A-Z]+\d+)\s*:\s*([A-Z]+\d+)\b/gi, (match, start, end) => {
        const refs = rangeRefs(start, end);
        return refs.map(ref => cellLiteral(evaluateCell(ref, stack))).join(",");
      });

      // استبدال مراجع الخلايا بقيمها
      expression = expression.replace(/\b([A-Z]{1,3}\d{1,4})\b/gi, ref => {
        return cellLiteral(evaluateCell(ref, stack));
      });

      // دوال Excel
      expression = expression.replace(/\b(SUM|AVERAGE|MIN|MAX|COUNT)\s*\(/gi, (match, name) => {
        return "__" + name.toUpperCase() + "(";
      });

      // استعادة النصوص
      expression = expression.replace(/__STR(\d+)__/g, (match, index) => strings[Number(index)]);

      if (/[;{}\[\]`\\]/.test(expression) || /\b(function|return|new|document|window|alert|eval|constructor|prototype|import|class)\b/i.test(expression)) {
        throw new Error("صيغة غير مدعومة");
      }

      const numeric = values => values.filter(value => typeof value === "number" && isFinite(value));
      const helpers = {
        __SUM: function () { return numeric(Array.prototype.slice.call(arguments)).reduce((a, b) => a + b, 0); },
        __AVERAGE: function () {
          const numbers = numeric(Array.prototype.slice.call(arguments));
          return numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0;
        },
        __MIN: function () {
          const numbers = numeric(Array.prototype.slice.call(arguments));
          return numbers.length ? Math.min.apply(Math, numbers) : 0;
        },
        __MAX: function () {
          const numbers = numeric(Array.prototype.slice.call(arguments));
          return numbers.length ? Math.max.apply(Math, numbers) : 0;
        },
        __COUNT: function () { return numeric(Array.prototype.slice.call(arguments)).length; },
        IF: function (condition, whenTrue, whenFalse) { return condition ? whenTrue : whenFalse; }
      };

      const fn = new Function("__SUM", "__AVERAGE", "__MIN", "__MAX", "__COUNT", "IF",
        '"use strict"; return (' + expression + ");");

      let result = fn(
        helpers.__SUM, helpers.__AVERAGE, helpers.__MIN,
        helpers.__MAX, helpers.__COUNT, helpers.IF
      );

      if (typeof result === "number" && !isFinite(result)) return "#DIV/0!";
      if (result === undefined) return "";
      return result;
    }

    function displayValue(value) {
      if (value === null || value === undefined) return "";
      if (typeof value === "number") {
        if (!isFinite(value)) return "#DIV/0!";
        return String(Math.round(value * 1000000) / 1000000);
      }
      if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
      return String(value);
    }

    function recalc() {
      cache = {};
      Object.keys(raw).forEach(ref => {
        if (normalize(raw[ref]) !== "") {
          try { evaluateCell(ref, []); } catch (e) { cache[ref.toUpperCase()] = "#ERROR!"; }
        }
      });
    }

    function refreshCells() {
      $$("input", table).forEach(input => {
        if (document.activeElement === input) return;
        const ref = input.dataset.cell;
        const value = normalize(raw[ref]);
        const formula = isFormula(value);
        const cached = cache[ref];
        input.value = formula ? displayValue(cached === undefined ? "" : cached) : value;
        const td = input.closest("td");
        if (td) td.classList.toggle("res", formula);
      });
    }

    function selectCell(ref, input) {
      currentRef = ref;
      currentInput = input;
      if (refLabel) refLabel.textContent = ref;
      if (fxLabel) fxLabel.textContent = normalize(raw[ref]) || "—";
      if (message) {
        message.className = "sheet-msg";
        message.textContent = "الخلية " + ref + ": " + (normalize(raw[ref]) || "(فارغة)");
      }
    }

    function commit(ref, input) {
      raw[ref] = input.value;
      recalc();
      refreshCells();
      selectCell(ref, input);
    }

    // بناء الجدول
    table.innerHTML = "";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.className = "rowh";
    headRow.appendChild(corner);
    columns.forEach(column => {
      const th = document.createElement("th");
      th.textContent = column;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (let row = 1; row <= rowCount; row++) {
      const tr = document.createElement("tr");
      const rowHead = document.createElement("th");
      rowHead.className = "rowh";
      rowHead.textContent = String(row);
      tr.appendChild(rowHead);

      columns.forEach(column => {
        const ref = column + row;
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.type = "text";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.dataset.cell = ref;
        input.setAttribute("aria-label", "خلية " + ref);
        input.value = normalize(raw[ref]);
        td.appendChild(input);

        input.addEventListener("focus", () => {
          if (isFormula(raw[ref])) input.value = normalize(raw[ref]);
          selectCell(ref, input);
        });
        input.addEventListener("input", () => {
          if (currentRef === ref && fxLabel) fxLabel.textContent = input.value || "—";
        });
        input.addEventListener("blur", () => commit(ref, input));
        input.addEventListener("keydown", event => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(ref, input);
            input.blur();
          }
        });

        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    function applyFormula(ref, formula, label) {
      raw[ref] = formula;
      recalc();
      refreshCells();
      const input = $('input[data-cell="' + ref + '"]', table);
      if (input) {
        selectCell(ref, input);
        const td = input.closest("td");
        try {
          input.animate([
            { boxShadow: "inset 0 0 0 0 rgba(52,211,153,0)" },
            { boxShadow: "inset 0 0 0 3px rgba(52,211,153,.75)" },
            { boxShadow: "inset 0 0 0 0 rgba(52,211,153,0)" }
          ], { duration: 1100 });
        } catch (e) { /* ignore */ }
        if (message) {
          message.className = "sheet-msg ok";
          message.textContent = label + ": " + formula + " في " + ref + " → النتيجة " + displayValue(cache[ref]);
        }
        if (td) td.classList.add("res");
      }
    }

    on($("#xlSum"), "click", () => applyFormula("D2", "=SUM(C2:C4)", "دالة SUM"));
    on($("#xlAvg"), "click", () => applyFormula("D3", "=AVERAGE(C2:C4)", "دالة AVERAGE"));
    on($("#xlIf"), "click", () => applyFormula("D4", '=IF(C2>=70,"Pass","Fail")', "دالة IF"));
    on($("#xlReset"), "click", () => {
      raw = Object.assign({}, defaults);
      recalc();
      refreshCells();
      if (refLabel) refLabel.textContent = "A1";
      if (fxLabel) fxLabel.textContent = "—";
      if (message) {
        message.className = "sheet-msg";
        message.textContent = "اختر خلية لعرض محتواها هنا.";
      }
    });

    recalc();
    refreshCells();
  }

  /* ------------------------------------------------------------
     Number systems converter
  ------------------------------------------------------------ */
  function initNumberConverter() {
    const fields = {
      dec: $("#numDec"),
      bin: $("#numBin"),
      oct: $("#numOct"),
      hex: $("#numHex")
    };
    const bcdOut = $("#numBcd");
    const bitsOut = $("#numBits");
    if (!fields.dec || !fields.bin || !fields.oct || !fields.hex) return;

    const bases = { dec: 10, bin: 2, oct: 8, hex: 16 };
    let updating = false;

    function digitValue(char) {
      const code = char.toUpperCase().charCodeAt(0);
      if (code >= 48 && code <= 57) return code - 48;
      if (code >= 65 && code <= 70) return code - 55;
      return -1;
    }

    function parseBase(text, base) {
      let value = String(text || "").trim().replace(/_/g, "").replace(/\s+/g, "");
      if (!value) return null;
      if (value.charAt(0) === ".") value = "0" + value;
      if (value.charAt(value.length - 1) === ".") value = value.slice(0, -1);

      const parts = value.split(".");
      if (parts.length > 2) return null;
      if (!parts[0] && !parts[1]) return null;

      const limit = base === 10 ? 9 : base - 1;
      const intPart = parts[0] || "";
      const fracPart = parts[1] || "";

      let intValue = 0;
      for (let i = 0; i < intPart.length; i++) {
        const digit = digitValue(intPart.charAt(i));
        if (digit < 0 || digit > limit) return null;
        intValue = intValue * base + digit;
      }

      let fracValue = 0;
      for (let i = 0; i < fracPart.length; i++) {
        const digit = digitValue(fracPart.charAt(i));
        if (digit < 0 || digit > limit) return null;
        fracValue += digit / Math.pow(base, i + 1);
      }

      return intValue + fracValue;
    }

    function toBase(number, base, maxFractionDigits) {
      if (!isFinite(number)) return "—";
      const negative = number < 0;
      let value = Math.abs(number);
      let integer = Math.floor(value);
      let fraction = value - integer;
      const digits = "0123456789ABCDEF";

      let integerText = integer.toString(base).toUpperCase();
      if (!integerText) integerText = "0";

      let fractionText = "";
      const limit = maxFractionDigits || 10;
      let guard = 0;
      while (fraction > 1e-10 && guard < limit) {
        fraction *= base;
        const digit = Math.floor(fraction + 1e-10);
        fractionText += digits.charAt(clamp(digit, 0, base - 1));
        fraction -= digit;
        guard++;
      }
      fractionText = fractionText.replace(/0+$/, "");

      return (negative ? "-" : "") + integerText + (fractionText ? "." + fractionText : "");
    }

    function decimalString(number) {
      if (Number.isInteger(number)) return String(number);
      return String(Math.round(number * 1000000) / 1000000);
    }

    function toBcd(decimalText) {
      const parts = String(decimalText).split(".");
      const encode = text => text.split("").map(char => {
        const digit = parseInt(char, 10);
        return isNaN(digit) ? "" : digit.toString(2).padStart(4, "0");
      }).join(" ");
      return encode(parts[0] || "0") + (parts[1] ? "." + encode(parts[1]) : "");
    }

    function clearErrors() {
      Object.keys(fields).forEach(key => {
        fields[key].style.borderColor = "";
        fields[key].style.boxShadow = "";
      });
    }

    function syncFrom(kind) {
      if (updating) return;
      const input = fields[kind];
      const rawText = input.value.trim();
      clearErrors();

      if (!rawText) {
        updating = true;
        Object.keys(fields).forEach(key => { if (key !== kind) fields[key].value = ""; });
        if (bcdOut) bcdOut.textContent = "—";
        if (bitsOut) bitsOut.textContent = "—";
        updating = false;
        return;
      }

      const number = parseBase(rawText, bases[kind]);
      if (number === null) {
        input.style.borderColor = "var(--bad)";
        input.style.boxShadow = "0 0 0 3px rgba(251,113,133,.15)";
        if (bitsOut) bitsOut.textContent = "—";
        return;
      }

      updating = true;

      const decimalText = kind === "dec" ? rawText.replace(/\.$/, "") : decimalString(number);
      const values = {
        dec: kind === "dec" ? rawText : decimalString(number),
        bin: toBase(number, 2),
        oct: toBase(number, 8),
        hex: toBase(number, 16)
      };

      Object.keys(fields).forEach(key => {
        if (key !== kind) fields[key].value = values[key];
      });

      if (bcdOut) bcdOut.textContent = toBcd(decimalText || "0");

      const integerBits = Math.max(1, Math.floor(Math.abs(number)).toString(2).length);
      if (bitsOut) bitsOut.textContent = integerBits + " بت للجزء الصحيح";

      updating = false;
    }

    Object.keys(fields).forEach(key => {
      fields[key].addEventListener("input", () => syncFrom(key));
    });

    // القيم الابتدائية موجودة في HTML (42) — نزامن باقي الحقول
    syncFrom("dec");
  }

  /* ------------------------------------------------------------
     Arbitrary base converter (Base 2–36)
  ------------------------------------------------------------ */
  function initBaseXConverter() {
    const root = $("#basexWidget");
    if (!root) return;
    const fromInput = $("#bxFrom");
    const toInput = $("#bxTo");
    const valueInput = $("#bxValue");
    const decOut = $("#bxDec");
    const resultOut = $("#bxResult");
    const stepsOut = $("#bxSteps");
    if (!fromInput || !toInput || !valueInput || !decOut || !resultOut || !stepsOut) return;

    const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function digitValue(char) {
      return ALPHABET.indexOf(String(char).toUpperCase());
    }

    function shortNumber(value) {
      if (!isFinite(value)) return "—";
      if (Number.isInteger(value)) return String(value);
      return String(Number(value.toFixed(8)));
    }

    function readBase(input) {
      const base = parseInt(input.value, 10);
      if (!isFinite(base) || base < 2 || base > 36) return null;
      return base;
    }

    function parseBaseValue(text, base) {
      let raw = String(text || "").trim().replace(/[\s_]/g, "");
      if (!raw) return null;
      if (raw.charAt(0) === ".") raw = "0" + raw;
      if (raw.charAt(raw.length - 1) === ".") raw = raw.slice(0, -1);
      if (raw.indexOf("-") >= 0) return null;

      const parts = raw.split(".");
      if (parts.length > 2) return null;
      const intText = parts[0] || "0";
      const fracText = parts[1] || "";
      if (!intText && !fracText) return null;

      const intDigits = intText.split("").map(digitValue);
      const fracDigits = fracText.split("").map(digitValue);
      if (intDigits.some(d => d < 0 || d >= base)) return null;
      if (fracDigits.some(d => d < 0 || d >= base)) return null;

      let value = 0;
      for (let i = 0; i < intText.length; i++) {
        value = value * base + digitValue(intText.charAt(i));
      }
      for (let i = 0; i < fracText.length; i++) {
        value += digitValue(fracText.charAt(i)) / Math.pow(base, i + 1);
      }

      return {
        text: raw.toUpperCase(),
        intText: intText.toUpperCase(),
        fracText: fracText.toUpperCase(),
        value: value
      };
    }

    function toBaseN(number, base, maxFractionDigits) {
      if (!isFinite(number)) return "—";
      const negative = number < 0;
      let value = Math.abs(number);
      const intPart = Math.floor(value);
      let fraction = value - intPart;

      let intText = "";
      if (intPart === 0) {
        intText = "0";
      } else {
        let rest = intPart;
        while (rest > 0) {
          intText = ALPHABET.charAt(rest % base) + intText;
          rest = Math.floor(rest / base);
        }
      }

      let fracText = "";
      const limit = maxFractionDigits || 10;
      let guard = 0;
      while (fraction > 1e-12 && guard < limit) {
        fraction *= base;
        const digit = Math.floor(fraction + 1e-12);
        fracText += ALPHABET.charAt(clamp(digit, 0, base - 1));
        fraction -= digit;
        guard++;
      }
      fracText = fracText.replace(/0+$/, "");

      return (negative ? "-" : "") + intText + (fracText ? "." + fracText : "");
    }

    function expansionHtml(parsed, base) {
      const terms = [];
      const evaluated = [];
      const intDigits = parsed.intText.split("");

      intDigits.forEach((char, index) => {
        const position = intDigits.length - index - 1;
        terms.push(char + "×" + base + "^" + position);
        evaluated.push(digitValue(char) + "×" + Math.pow(base, position));
      });

      parsed.fracText.split("").forEach((char, index) => {
        terms.push(char + "×" + base + "^-" + (index + 1));
        evaluated.push(digitValue(char) + "÷" + Math.pow(base, index + 1));
      });

      return '<p class="bx-formula"><code class="ltr">' + terms.join(" + ") + "</code></p>" +
        '<p class="bx-formula">= <code class="ltr">' + evaluated.join(" + ") + "</code> = <b>" +
        escapeHtml(shortNumber(parsed.value)) + "</b></p>";
    }

    function divisionRowsHtml(value, base) {
      let rows = "";
      let rest = Math.floor(value);
      let guard = 0;

      if (rest === 0) {
        return '<tr><td><code class="ltr">0 ÷ ' + base + "</code></td><td>0</td><td><b>0</b></td></tr>";
      }

      while (rest > 0 && guard < 80) {
        const remainder = rest % base;
        const quotient = Math.floor(rest / base);
        rows += "<tr><td><code class=\"ltr\">" + rest + " ÷ " + base + "</code></td><td>" +
          quotient + "</td><td><b>" + ALPHABET.charAt(remainder) + "</b></td></tr>";
        rest = quotient;
        guard++;
      }
      return rows;
    }

    function fractionRowsHtml(value, base) {
      let fraction = value - Math.floor(value);
      if (fraction <= 1e-12) return "";

      let html = '<p>نضرب الجزء العشري في ' + base + " ونسجّل الجزء الصحيح (من أعلى إلى أسفل):</p>" +
        '<ul class="clean bx-frac-list">';
      let guard = 0;

      while (fraction > 1e-12 && guard < 10) {
        const result = fraction * base;
        const digit = Math.floor(result + 1e-12);
        html += "<li><code class=\"ltr\">" + shortNumber(fraction) + " × " + base + " = " +
          shortNumber(result) + "</code> → <b>" + ALPHABET.charAt(clamp(digit, 0, base - 1)) + "</b></li>";
        fraction = result - digit;
        guard++;
      }

      html += "</ul>";
      if (fraction > 1e-12) {
        html += '<p class="bx-hint">الكسر لم ينتهِ بعد 10 خطوات — الناتج تقريبي (كما في 0.75 إلى Base 3).</p>';
      }
      return html;
    }

    function stepsHtml(parsed, fromBase, toBase, resultText) {
      if (fromBase === toBase) {
        return '<div class="bx-step"><h5>الأساس نفسه</h5><p>الرقم <b class="ltr">' +
          escapeHtml(parsed.text) + "</b> مكتوب بالفعل في Base " + toBase + ".</p></div>";
      }

      let html = "";

      if (fromBase !== 10) {
        html += '<div class="bx-step"><h5>1) من Base ' + fromBase + " إلى Decimal</h5>" +
          '<p>اضرب كل رقم في (الأساس ^ موضعه) ثم اجمع:</p>' +
          expansionHtml(parsed, fromBase) + "</div>";
      } else {
        html += '<div class="bx-step"><h5>1) القيمة العشرية</h5><p>الرقم عشري بالفعل: <b>' +
          escapeHtml(shortNumber(parsed.value)) + "</b></p></div>";
      }

      if (toBase !== 10) {
        html += '<div class="bx-step"><h5>2) من Decimal إلى Base ' + toBase + "</h5>" +
          "<p>الجزء الصحيح: قسمة متكررة على " + toBase + " وقراءة البواقي من أسفل إلى أعلى.</p>" +
          '<div class="table-wrap"><table class="bx-table"><thead><tr><th>العملية</th><th>الناتج</th><th>الباقي</th></tr></thead><tbody>' +
          divisionRowsHtml(parsed.value, toBase) +
          "</tbody></table></div>";

        const fractionHtml = fractionRowsHtml(parsed.value, toBase);
        if (fractionHtml) html += fractionHtml;

        html += '<p class="bx-result-line">الناتج في Base ' + toBase + ': <b class="ltr">' +
          escapeHtml(resultText) + "</b></p></div>";
      } else {
        html += '<div class="bx-step"><h5>2) الناتج</h5><p>التحويل إلى Decimal مباشر: <b>' +
          escapeHtml(resultText) + "</b></p></div>";
      }

      return html;
    }

    function setError(message) {
      decOut.textContent = "—";
      resultOut.textContent = "—";
      stepsOut.innerHTML = '<div class="bx-error">' + escapeHtml(message) + "</div>";
    }

    function clearErrors() {
      [fromInput, toInput, valueInput].forEach(input => {
        input.style.borderColor = "";
        input.style.boxShadow = "";
      });
    }

    function update() {
      clearErrors();
      const fromBase = readBase(fromInput);
      const toBase = readBase(toInput);

      if (!fromBase) {
        fromInput.style.borderColor = "var(--bad)";
        setError("الأساس المصدر يجب أن يكون رقمًا صحيحًا بين 2 و36.");
        return;
      }
      if (!toBase) {
        toInput.style.borderColor = "var(--bad)";
        setError("الأساس الهدف يجب أن يكون رقمًا صحيحًا بين 2 و36.");
        return;
      }

      const parsed = parseBaseValue(valueInput.value, fromBase);
      if (!parsed) {
        valueInput.style.borderColor = "var(--bad)";
        setError("الرقم غير صالح في Base " + fromBase + ". تأكد أن كل رقم أقل من " + fromBase +
          " (الأرقام المسموحة: 0 إلى " + (fromBase - 1) + ").");
        return;
      }

      const decimalText = shortNumber(parsed.value);
      const resultText = toBase === 10 ? decimalText : toBaseN(parsed.value, toBase, 10);
      decOut.textContent = decimalText;
      resultOut.textContent = resultText;
      stepsOut.innerHTML = stepsHtml(parsed, fromBase, toBase, resultText);
    }

    [fromInput, toInput, valueInput].forEach(input => {
      input.addEventListener("input", update);
    });

    $$(".bx-presets [data-bx-from]", root).forEach(button => {
      button.addEventListener("click", () => {
        fromInput.value = button.dataset.bxFrom;
        toInput.value = button.dataset.bxTo;
        valueInput.value = button.dataset.bxValue;
        update();
      });
    });

    update();
  }

  /* ------------------------------------------------------------
     English explanation toggle (Lecture 6)
  ------------------------------------------------------------ */
  function initL6English() {
    const button = $("#l6EnBtn");
    const panel = $("#l6EnPanel");
    if (!button || !panel) return;

    const closeButtons = [$("#l6EnClose"), $("#l6EnClose2")].filter(Boolean);

    function setOpen(open, skipScroll) {
      panel.hidden = !open;
      button.setAttribute("aria-pressed", open ? "true" : "false");
      button.classList.toggle("is-on", open);
      button.textContent = open ? "🌐 إخفاء الشرح الإنجليزي" : "🌐 English explanation";

      if (open) {
        panel.querySelectorAll(".sec").forEach(section => section.classList.add("in"));
      }
      try {
        localStorage.setItem("cf-l6-en", open ? "1" : "0");
      } catch (e) { /* ignore */ }

      if (!skipScroll) {
        const target = open ? panel : document.querySelector("#tab-l6 .hero");
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    button.addEventListener("click", () => setOpen(panel.hidden));
    closeButtons.forEach(closeButton => {
      closeButton.addEventListener("click", () => setOpen(false));
    });

    const goConverter = $("#l6GoConverter");
    if (goConverter) {
      goConverter.addEventListener("click", () => scrollHighlight("basexWidget"));
    }

    let saved = false;
    try {
      saved = localStorage.getItem("cf-l6-en") === "1";
    } catch (e) { /* ignore */ }
    if (saved) setOpen(true, true);
  }

  /* ------------------------------------------------------------
     ASCII playground
  ------------------------------------------------------------ */
  function initAscii() {
    const input = $("#asciiInput");
    const decOut = $("#asciiDec");
    const binOut = $("#asciiBin");
    const hexOut = $("#asciiHex");
    if (!input) return;

    function update() {
      const text = input.value;
      if (!text) {
        if (decOut) decOut.textContent = "—";
        if (binOut) binOut.textContent = "—";
        if (hexOut) hexOut.textContent = "—";
        return;
      }

      const code = text.codePointAt(0);
      if (decOut) decOut.textContent = String(code);
      if (binOut) binOut.textContent = code.toString(2).padStart(8, "0");
      if (hexOut) hexOut.textContent = code.toString(16).toUpperCase().padStart(2, "0");
    }

    on(input, "input", update);
    update();
  }

  /* ------------------------------------------------------------
     Gray code table
  ------------------------------------------------------------ */
  function initGray() {
    const grid = $("#grayGrid");
    if (!grid) return;

    const cells = [];
    for (let n = 0; n < 16; n++) {
      const binary = n.toString(2).padStart(4, "0");
      const gray = (n ^ (n >> 1)).toString(2).padStart(4, "0");
      cells.push(
        '<div class="gray-cell"><b>' + gray + '</b><small>' +
        String(n).padStart(2, "0") + ' → ' + binary + '</small></div>'
      );
    }
    grid.innerHTML = cells.join("");
  }

  /* ------------------------------------------------------------
     PowerPoint transitions / animations demo
  ------------------------------------------------------------ */
  function initDemo() {
    const slide = $("#demoSlide");
    const buttons = $$("[data-demo]");
    if (!slide || !buttons.length) return;

    const animations = {
      fade: [
        { opacity: 0 },
        { opacity: 1 }
      ],
      zoom: [
        { opacity: 0, transform: "scale(.35)" },
        { opacity: 1, transform: "scale(1)" }
      ],
      fly: [
        { opacity: 0, transform: "translateX(-160px)" },
        { opacity: 1, transform: "translateX(0)" }
      ],
      wipe: [
        { opacity: 1, clipPath: "inset(0 0 0 100%)" },
        { opacity: 1, clipPath: "inset(0 0 0 0)" }
      ]
    };

    buttons.forEach(button => {
      on(button, "click", () => {
        const kind = button.dataset.demo;
        if (slide.getAnimations) slide.getAnimations().forEach(animation => animation.cancel());
        try {
          slide.animate(animations[kind] || animations.fade, {
            duration: 850,
            easing: "cubic-bezier(.2,.8,.2,1)",
            fill: "both"
          });
        } catch (e) { /* ignore */ }
      });
    });
  }

  /* ------------------------------------------------------------
     Boot
  ------------------------------------------------------------ */
  function boot() {
    initTheme();
    initTabs();
    initSubTabs();
    initScrollUi();
    bindFlips(document);
    initQuizzes();
    initExam();
    initPixel();
    initCpu();
    initSize();
    initShortcuts();
    initExcel();
    initNumberConverter();
    initBaseXConverter();
    initL6English();
    initAscii();
    initGray();
    initDemo();
    initReveals();
    updateHome();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
