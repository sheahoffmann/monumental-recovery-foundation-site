/* Monumental Recovery Foundation — site behaviour */
(function () {
  "use strict";

  /* Mobile navigation ---------------------------------------------------- */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("primary-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* Sticky header hairline ----------------------------------------------- */
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-stuck", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* Reveal on scroll ----------------------------------------------------- */
  var reveals = document.querySelectorAll(".reveal");
  if (reveals.length) {
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              io.unobserve(entry.target);
            }
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
      );
      reveals.forEach(function (el) { io.observe(el); });
    } else {
      reveals.forEach(function (el) { el.classList.add("is-visible"); });
    }
  }

  /* Donation amount selector --------------------------------------------- */
  var amounts = document.querySelectorAll(".amount");
  var otherField = document.getElementById("other-amount");
  if (amounts.length) {
    amounts.forEach(function (btn) {
      btn.addEventListener("click", function () {
        amounts.forEach(function (b) {
          b.classList.remove("is-selected");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("is-selected");
        btn.setAttribute("aria-pressed", "true");
        if (otherField) {
          if (btn.dataset.amount) {
            otherField.value = btn.dataset.amount;
          } else {
            otherField.value = "";
            otherField.focus();
          }
        }
      });
    });
  }

  /* Donation checkout ----------------------------------------------------- */
  var giveForm = document.getElementById("give-form");
  if (giveForm) {
    var amountField = document.getElementById("other-amount");
    var monthlyField = document.getElementById("monthly");
    var submitBtn = document.getElementById("give-submit");
    var errorEl = document.getElementById("give-error");

    var showError = function (message) {
      if (!errorEl) { return; }
      errorEl.textContent = message;
      errorEl.hidden = false;
    };
    var clearError = function () {
      if (errorEl) { errorEl.hidden = true; errorEl.textContent = ""; }
    };

    if (amountField) { amountField.addEventListener("input", clearError); }

    giveForm.addEventListener("submit", function (e) {
      e.preventDefault();
      clearError();

      var amount = parseFloat(amountField ? amountField.value : "");
      if (!isFinite(amount) || amount < 1) {
        showError("Please choose an amount, or enter one above.");
        if (amountField) { amountField.focus(); }
        return;
      }
      if (amount > 50000) {
        showError("For gifts over $50,000, email give@monumentalrecovery.com and we will handle it personally.");
        return;
      }

      var label = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Taking you to checkout\u2026";

      fetch("/.netlify/functions/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amount,
          monthly: !!(monthlyField && monthlyField.checked)
        })
      })
        .then(function (res) {
          return res.json().then(function (data) { return { ok: res.ok, data: data }; });
        })
        .then(function (result) {
          if (result.ok && result.data && result.data.url) {
            window.location.href = result.data.url;
            return;
          }
          throw new Error(
            (result.data && result.data.error) ||
            "We could not start checkout. Please try again."
          );
        })
        .catch(function (err) {
          var message = err && err.message ? err.message : "";
          if (!message || /failed to fetch|networkerror|load failed/i.test(message)) {
            message = "We could not reach the payment system. Please try again, or email give@monumentalrecovery.com.";
          }
          showError(message);
          submitBtn.disabled = false;
          submitBtn.textContent = label;
        });
    });
  }

  /* Hero headline: reveal the emphasised phrase --------------------------- */
  var typeEl = document.getElementById("hero-type");
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (typeEl && !reduced) {
    var text = typeEl.textContent;
    typeEl.textContent = "";

    for (var i = 0; i < text.length; i++) {
      var ch = document.createElement("span");
      ch.className = "ch";
      ch.textContent = text.charAt(i);
      ch.style.animationDelay = i * 34 + "ms";
      typeEl.appendChild(ch);
    }
  }

  /* Preselect the contact reason from ?reason=donate ---------------------- */
  var reason = document.getElementById("reason");
  if (reason) {
    var param = new URLSearchParams(window.location.search).get("reason");
    if (param) {
      var match = Array.prototype.some.call(reason.options, function (o) { return o.value === param; });
      if (match) { reason.value = param; }
    }
  }

  /* Footer year ---------------------------------------------------------- */
  var year = document.querySelectorAll(".js-year");
  year.forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
