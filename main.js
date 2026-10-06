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
        showError("For gifts over $50,000, email give@monumentalrecovery.org and we will handle it personally.");
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
            message = "We could not reach the payment system. Please try again, or email give@monumentalrecovery.org.";
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

  /* Scholarship Submit dialog -------------------------------------------- */
  var submitDialog = document.getElementById("submit-dialog");
  if (submitDialog) {
    var MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // the email function accepts about 4.2 MB of files
    var submitForm = document.getElementById("submit-form");
    var fileInput = document.getElementById("s_files");
    var fileList = document.getElementById("file-list");
    var sendBtn = submitForm.querySelector("button[type=submit]");
    var errorEl = submitForm.querySelector(".form-error");

    var formatSize = function (bytes) {
      return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
    };

    var listFiles = function () {
      fileList.innerHTML = "";
      errorEl.hidden = true;
      Array.prototype.forEach.call(fileInput.files || [], function (f) {
        var li = document.createElement("li");
        li.innerHTML = "<span></span><span></span>";
        li.firstChild.textContent = f.name;
        li.lastChild.textContent = formatSize(f.size);
        fileList.appendChild(li);
      });
    };

    var openDialog = function () {
      if (submitDialog.showModal) { submitDialog.showModal(); } else { submitDialog.setAttribute("open", ""); }
    };
    var closeDialog = function () {
      if (sendBtn.disabled) { return; }
      if (submitDialog.close) { submitDialog.close(); } else { submitDialog.removeAttribute("open"); }
    };

    document.querySelectorAll("[data-open-submit]").forEach(function (btn) {
      btn.addEventListener("click", openDialog);
    });
    submitDialog.querySelectorAll("[data-close-submit]").forEach(function (btn) {
      btn.addEventListener("click", closeDialog);
    });
    // Clicking the dimmed backdrop closes the dialog.
    submitDialog.addEventListener("click", function (e) {
      if (e.target === submitDialog) { closeDialog(); }
    });
    submitDialog.addEventListener("cancel", function (e) {
      if (sendBtn.disabled) { e.preventDefault(); }
    });
    fileInput.addEventListener("change", listFiles);
    if (window.location.hash === "#submit") { openDialog(); }

    submitForm.addEventListener("submit", function (e) {
      e.preventDefault();
      errorEl.hidden = true;

      var files = Array.prototype.slice.call(fileInput.files || []);
      var total = files.reduce(function (sum, f) { return sum + f.size; }, 0);
      var showError = function (message) {
        errorEl.textContent = message;
        errorEl.hidden = false;
      };
      if (!files.length) { showError("Please choose your completed PDF."); return; }
      if (total > MAX_UPLOAD_BYTES) {
        showError("Your files add up to " + formatSize(total) + ", and the limit is 4 MB. " +
          "Please email them to give@monumentalrecovery.org instead.");
        return;
      }

      var label = sendBtn.textContent;
      sendBtn.disabled = true;
      sendBtn.textContent = "Sending\u2026";

      fetch(submitForm.getAttribute("action"), { method: "POST", body: new FormData(submitForm) })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            if (!res.ok || !body.ok) {
              throw new Error(body.error || "We could not send your form. Please try again.");
            }
            window.location.href = "application-received.html";
          });
        })
        .catch(function (err) {
          var message = err && err.message ? err.message : "";
          if (!message || /failed to fetch|networkerror|load failed/i.test(message)) {
            message = "We could not reach the server. Check your connection and try again, or email give@monumentalrecovery.org.";
          }
          showError(message);
          sendBtn.disabled = false;
          sendBtn.textContent = label;
        });
    });
  }

  /* Footer year ---------------------------------------------------------- */
  var year = document.querySelectorAll(".js-year");
  year.forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
