/** Plain HTML body for /join — no React. */
export function getJoinPageBodyHtml(): string {
  return `
<header class="flex flex-col items-center text-center">
  <h1 class="font-logo text-4xl tracking-wide text-[#BE26C1] sm:text-5xl">Quiz-It</h1>
  <p class="mt-3 text-sm text-white">Powered by MAC Entertainment</p>
</header>

<div id="join-form-section" class="mt-8 flex w-full flex-col gap-5">
  <input
    id="team-name-input"
    type="text"
    placeholder="Team name"
    aria-label="Team name"
    class="join-touch-input w-full rounded-xl border border-[#BE26C1] bg-black px-5 text-center text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#BE26C1]"
  />
  <p id="join-error" class="text-center text-base text-red-400" role="alert" style="display:none"></p>
  <button
    type="button"
    id="join-game-btn"
    class="join-touch-button font-logo w-full rounded-xl bg-[#BE26C1] px-6 tracking-wide text-white"
  >
    Join Game
  </button>
</div>

<div id="join-waiting" class="join-body-text mt-8 w-full text-center text-white" style="display:none">
  You're in! Waiting for the quiz to start...
</div>

<div id="join-question" class="mt-6 w-full" style="display:none">
  <p id="q-meta" class="text-center text-base text-white/60"></p>
  <p id="q-text" class="join-question-text mt-4 text-center font-medium text-white"></p>
  <div class="mt-4 flex flex-col items-center gap-2">
    <div id="q-timer-num" class="font-logo text-4xl tracking-wide text-white">10</div>
    <div class="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div id="q-timer-bar" class="h-full rounded-full bg-[#BE26C1]" style="width:100%"></div>
    </div>
  </div>
  <ul id="q-options" class="mt-6 flex flex-col gap-4"></ul>
  <p id="q-time-up" class="mt-4 text-center text-sm text-white/50" style="display:none">Time's up</p>
</div>
`.trim();
}

/** Vanilla JS for /join — DOM only for join transition; fetch + Supabase CDN for network. */
export function getJoinPageScript(supabaseUrl: string, supabaseKey: string): string {
  const url = JSON.stringify(supabaseUrl);
  const key = JSON.stringify(supabaseKey);

  return `
(function () {
  var SUPABASE_URL = ${url};
  var SUPABASE_KEY = ${key};
  var CHANNEL = "quiz-it-handsets";
  var EVENT_QUESTION = "question";
  var EVENT_REVEAL = "reveal";
  var CORRECT_ANSWER = "b";
  var TOTAL_SECONDS = 10;

  var teamName = "";
  var answered = false;
  var timerId = null;
  var revealed = false;
  var correctAnswer = null;
  var currentQuestion = null;

  function $(id) {
    return document.getElementById(id);
  }

  function hide(el) {
    if (el) el.style.display = "none";
  }

  function show(el, display) {
    if (el) el.style.display = display || "block";
  }

  function insertTeam(name) {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    fetch(SUPABASE_URL + "/rest/v1/teams", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: "Bearer " + SUPABASE_KEY,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ team_name: name }),
    });
  }

  function insertAnswer(choice) {
    if (!currentQuestion || !teamName || !SUPABASE_URL || !SUPABASE_KEY) return;
    fetch(SUPABASE_URL + "/rest/v1/answers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: "Bearer " + SUPABASE_KEY,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        team_name: teamName,
        question_id: currentQuestion.question_id,
        selected_answer: choice,
        is_correct: choice === CORRECT_ANSWER,
      }),
    });
  }

  function stopTimer() {
    answered = true;
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    var numEl = $("q-timer-num");
    var barEl = $("q-timer-bar");
    var timeUpEl = $("q-time-up");
    var endAt = Date.now() + TOTAL_SECONDS * 1000;
    answered = false;
    if (timeUpEl) hide(timeUpEl);

    if (timerId) clearInterval(timerId);

    timerId = setInterval(function () {
      var ms = endAt - Date.now();
      var left = Math.max(0, Math.ceil(ms / 1000));
      if (numEl) numEl.textContent = String(left);
      if (barEl) {
        barEl.style.width = (left / TOTAL_SECONDS) * 100 + "%";
        barEl.className =
          "h-full rounded-full " +
          (left <= 3 ? "bg-red-500" : left <= 5 ? "bg-orange-500" : "bg-[#BE26C1]");
      }
      if (left <= 0) {
        if (timerId) {
          clearInterval(timerId);
          timerId = null;
        }
        if (!answered) {
          answered = true;
          lockOptions();
          if (timeUpEl) show(timeUpEl);
        }
      }
    }, 200);
  }

  function lockOptions() {
    var buttons = document.querySelectorAll("[data-answer]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = true;
    }
  }

  function paintOptions() {
    var list = $("q-options");
    if (!list || !currentQuestion) return;
    list.innerHTML = "";
    var items = [
      { letter: "A", value: "a", text: currentQuestion.option_a },
      { letter: "B", value: "b", text: currentQuestion.option_b },
      { letter: "C", value: "c", text: currentQuestion.option_c },
      { letter: "D", value: "d", text: currentQuestion.option_d },
    ];
    for (var j = 0; j < items.length; j++) {
      (function (item) {
        var li = document.createElement("li");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("data-answer", item.value);
        btn.className =
          "join-touch-button w-full rounded-xl border border-[#BE26C1] bg-black px-5 text-center text-white";
        btn.innerHTML = "<span class='font-medium'>" + item.letter + ":</span> " + item.text;
        btn.onclick = function () {
          if (answered || revealed) return;
          stopTimer();
          answered = true;
          btn.className =
            "join-touch-button w-full rounded-xl border border-[#BE26C1] bg-[#BE26C1] px-5 text-center text-white";
          lockOptions();
          insertAnswer(item.value);
        };
        li.appendChild(btn);
        list.appendChild(li);
      })(items[j]);
    }
  }

  function applyReveal() {
    if (!correctAnswer) return;
    var buttons = document.querySelectorAll("[data-answer]");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var val = btn.getAttribute("data-answer");
      btn.disabled = true;
      if (val === correctAnswer) {
        btn.className =
          "join-touch-button w-full rounded-xl border border-green-500 bg-green-600 px-5 text-center text-white";
      } else {
        btn.className =
          "join-touch-button w-full rounded-xl border border-red-500 bg-red-600 px-5 text-center text-white";
      }
    }
  }

  function showQuestion(payload) {
    currentQuestion = payload;
    revealed = false;
    correctAnswer = null;
    hide($("join-waiting"));
    hide($("join-form-section"));
    show($("join-question"));
    if ($("q-meta")) {
      $("q-meta").textContent =
        "Round " + payload.round_number + " · Question " + payload.question_number;
    }
    if ($("q-text")) $("q-text").textContent = payload.question_text;
    hide($("q-time-up"));
    paintOptions();
    startTimer();
  }

  function onReveal(payload) {
    revealed = true;
    correctAnswer = payload.correct_answer;
    stopTimer();
    applyReveal();
  }

  function startRealtime() {
    if (!window.supabase || !SUPABASE_URL || !SUPABASE_KEY) return;
    var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    client
      .channel(CHANNEL)
      .on("broadcast", { event: EVENT_QUESTION }, function (msg) {
        if (msg && msg.payload) showQuestion(msg.payload);
      })
      .on("broadcast", { event: EVENT_REVEAL }, function (msg) {
        if (msg && msg.payload) onReveal(msg.payload);
      })
      .subscribe();
  }

  function loadSupabaseThenRealtime() {
    if (window.supabase) {
      startRealtime();
      return;
    }
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.onload = startRealtime;
    document.head.appendChild(s);
  }

  window.quizItJoin = function () {
    var input = $("team-name-input");
    var err = $("join-error");
    var name = input && input.value ? input.value.trim() : "";
    if (!name) {
      if (err) {
        err.textContent = "Please enter a team name.";
        show(err);
      }
      return;
    }
    if (err) hide(err);
    teamName = name;

    hide($("join-form-section"));
    show($("join-waiting"));

    setTimeout(function () {
      insertTeam(name);
      loadSupabaseThenRealtime();
    }, 100);
  };

  function bindJoinButton() {
    var btn = $("join-game-btn");
    if (!btn) return;
    btn.onclick = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      window.quizItJoin();
      return false;
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindJoinButton);
  } else {
    bindJoinButton();
  }
})();
`.trim();
}
