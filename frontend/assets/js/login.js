/*
 * DataPulse sign-in.
 *
 * Authentication is simulated: authenticate() is the single seam to replace with a call to the
 * real identity service. Nothing is transmitted; a successful sign-in stores a session marker in
 * sessionStorage and opens the sample workspace at app/.
 */
(function () {
  "use strict";

  var APP_URL = "app/";
  var SESSION_KEY = "datapulse.session.v1";
  var EMAIL_KEY = "datapulse.login.email";

  var RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var RE_KEY = /^dp_(live|test)_[A-Za-z0-9]{16,}$/;
  var RE_WORKSPACE = /^[a-z0-9][a-z0-9-]{1,38}$/;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function store(kind) {
    try { return window[kind]; } catch (e) { return null; }
  }
  function read(kind, key) {
    try { var s = store(kind); return s ? s.getItem(key) : null; } catch (e) { return null; }
  }
  function write(kind, key, value) {
    try { var s = store(kind); if (s) { if (value === null) s.removeItem(key); else s.setItem(key, value); } } catch (e) { /* storage unavailable */ }
  }

  /* ---- Authentication seam ---- */
  function authenticate(method, payload) {
    return new Promise(function (resolve) {
      window.setTimeout(function () {
        resolve({
          ok: true,
          session: {
            method: method,
            subject: payload.email || payload.workspace,
            workspace: "gbs_health_prod",
            issuedAt: new Date().toISOString(),
            demo: true
          }
        });
      }, 750);
    });
  }

  /* ---- Banner ---- */
  var slot = $("#banner-slot");
  var ICONS = {
    error: '<path d="M8 1.8l6.2 11.4H1.8L8 1.8z"/><path d="M8 6.5v3"/><path d="M8 11.4v.1"/>',
    info: '<circle cx="8" cy="8" r="6.2"/><path d="M8 7.4v3.6"/><path d="M8 5v.1"/>',
    ok: '<circle cx="8" cy="8" r="6.2"/><path d="M5.2 8.3l2 2 3.6-4.4"/>'
  };

  function showBanner(tone, text) {
    clearBanner();
    var box = document.createElement("div");
    box.className = "banner";
    box.setAttribute("data-tone", tone);
    box.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[tone] + "</svg>";
    var p = document.createElement("p");
    p.textContent = text;
    box.appendChild(p);
    slot.appendChild(box);
  }
  function clearBanner() { slot.textContent = ""; }

  /* ---- Fields ---- */
  function fieldOf(input) { return input.closest(".field"); }

  function setField(input, state, message) {
    var field = fieldOf(input);
    var msg = $(".msg:not(.msg-caps)", field);
    var hint = msg ? msg.getAttribute("data-hint") : null;
    field.setAttribute("data-state", state);
    if (state === "invalid") input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
    if (msg) msg.textContent = state === "invalid" ? message : (hint || "");
  }

  var VALIDATORS = {
    email: function (v) {
      if (!v) return "Enter your work email.";
      if (!RE_EMAIL.test(v)) return "Enter a valid email address, like name@company.com.";
      return "";
    },
    password: function (v) {
      if (!v) return "Enter your password.";
      if (v.length < 8) return "Passwords have at least 8 characters.";
      return "";
    },
    workspace: function (v) {
      if (!v) return "Enter your workspace name.";
      if (!RE_WORKSPACE.test(v)) return "Use lowercase letters, numbers, and hyphens, starting with a letter or number.";
      return "";
    },
    apikey: function (v) {
      if (!v) return "Enter your API key.";
      if (!RE_KEY.test(v)) return "Keys start with dp_live_ or dp_test_ followed by at least 16 characters.";
      return "";
    }
  };

  function valueOf(input) {
    var v = input.value;
    return input.id === "password" || input.id === "apikey" ? v : v.trim();
  }

  function validate(input, quiet) {
    var error = VALIDATORS[input.id](valueOf(input));
    if (error) {
      setField(input, "invalid", error);
      return false;
    }
    setField(input, input.id === "password" || input.id === "apikey" ? "idle" : "valid");
    return true;
  }

  function wireField(input) {
    input.addEventListener("blur", function () {
      if (input.value !== "" || fieldOf(input).getAttribute("data-state") === "invalid") validate(input);
    });
    input.addEventListener("input", function () {
      var state = fieldOf(input).getAttribute("data-state");
      if (state === "invalid") validate(input);
      else if (state === "valid") setField(input, "idle");
      clearBanner();
    });
  }

  ["email", "password", "workspace", "apikey"].forEach(function (id) { wireField($("#" + id)); });

  /* ---- Reveal toggles ---- */
  $$("[data-reveal]").forEach(function (btn) {
    var input = document.getElementById(btn.getAttribute("data-reveal"));
    var noun = input.id === "apikey" ? "API key" : "password";
    btn.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", (show ? "Hide " : "Show ") + noun);
    });
  });

  /* ---- Caps Lock ---- */
  var password = $("#password");
  var caps = $("#caps-msg");
  function syncCaps(e) {
    if (typeof e.getModifierState !== "function") return;
    caps.hidden = !e.getModifierState("CapsLock");
  }
  password.addEventListener("keydown", syncCaps);
  password.addEventListener("keyup", syncCaps);
  password.addEventListener("blur", function () { caps.hidden = true; });

  /* ---- Method tabs ---- */
  var seg = $("#seg");
  var tabs = [$("#tab-email"), $("#tab-key")];
  var panels = { email: $("#panel-email"), key: $("#panel-key") };

  function selectTab(name, focus) {
    tabs.forEach(function (tab) {
      var on = tab.id === "tab-" + name;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
    });
    seg.setAttribute("data-active", name);
    panels.email.hidden = name !== "email";
    panels.key.hidden = name !== "key";
    clearBanner();
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () { selectTab(i === 0 ? "email" : "key", false); });
    tab.addEventListener("keydown", function (e) {
      var next = null;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") next = 1 - i;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = 1;
      if (next === null) return;
      e.preventDefault();
      selectTab(next === 0 ? "email" : "key", true);
    });
  });

  /* ---- Busy state ---- */
  var busy = false;

  function setBusy(button, on, label) {
    busy = on;
    var text = $(".btn-label", button);
    var old = button.querySelector(".spinner");
    if (on) {
      button.setAttribute("data-label", text.textContent);
      text.textContent = label;
      if (!old) {
        var s = document.createElement("span");
        s.className = "spinner";
        s.setAttribute("aria-hidden", "true");
        button.insertBefore(s, text);
      }
    } else {
      if (old) old.remove();
      if (button.hasAttribute("data-label")) text.textContent = button.getAttribute("data-label");
    }
    button.setAttribute("aria-busy", String(on));
    $$("button[data-submit], button[data-sso]").forEach(function (b) { b.disabled = on; });
  }

  function finish(result, button) {
    if (!result.ok) {
      setBusy(button, false);
      showBanner("error", "Sign-in failed. Check your details and try again.");
      return;
    }
    write("sessionStorage", SESSION_KEY, JSON.stringify(result.session));
    var text = $(".btn-label", button);
    var spin = button.querySelector(".spinner");
    if (spin) spin.remove();
    text.textContent = "Signed in";
    showBanner("ok", "Signed in. Opening the sample workspace.");
    window.setTimeout(function () { window.location.assign(APP_URL); }, 450);
  }

  function failure(button) {
    setBusy(button, false);
    showBanner("error", "Could not reach the sign-in service. Check your connection and try again.");
  }

  /* ---- Submit ---- */
  function submit(form, method, ids, payloadFor) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy) return;
      clearBanner();
      var firstBad = null;
      ids.forEach(function (id) {
        var input = document.getElementById(id);
        if (!validate(input) && !firstBad) firstBad = input;
      });
      if (firstBad) { firstBad.focus(); return; }

      var button = $("[data-submit]", form);
      setBusy(button, true, "Signing in");
      authenticate(method, payloadFor()).then(function (r) { finish(r, button); }, function () { failure(button); });
    });
  }

  submit($("#panel-email"), "password", ["email", "password"], function () {
    var email = $("#email").value.trim();
    write("localStorage", EMAIL_KEY, $("#remember").checked ? email : null);
    return { email: email };
  });

  submit($("#panel-key"), "api_key", ["workspace", "apikey"], function () {
    return { workspace: $("#workspace").value.trim() };
  });

  /* ---- SSO and password recovery (demo: not configured) ---- */
  $$("[data-sso]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (busy) return;
      clearBanner();
      var provider = btn.getAttribute("data-sso");
      setBusy(btn, true, "Contacting " + provider);
      window.setTimeout(function () {
        setBusy(btn, false);
        showBanner("info", "Single sign-on through " + provider + " is not configured in this demo. Sign in with your work email or an API key.");
      }, 700);
    });
  });

  $("#forgot").addEventListener("click", function () {
    var email = $("#email").value.trim();
    showBanner("info", email && RE_EMAIL.test(email)
      ? "Password reset is not available in this demo. In a connected workspace, a reset link is sent to " + email + "."
      : "Enter your work email first. In a connected workspace, a reset link is sent to that address.");
    if (!email || !RE_EMAIL.test(email)) $("#email").focus();
  });

  /* ---- Prefill remembered email ---- */
  var saved = read("localStorage", EMAIL_KEY);
  if (saved) {
    $("#email").value = saved;
    $("#remember").checked = true;
    setField($("#email"), "valid");
  }
})();
