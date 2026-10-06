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

  /* Scholarship application ---------------------------------------------- */
  var applyForm = document.getElementById("scholarship-form");
  if (applyForm) {
    var applyBtn = document.getElementById("apply-submit");
    var applyError = document.getElementById("apply-error");
    var MAX_BYTES = 7.5 * 1024 * 1024; // Netlify Forms caps a submission at 8 MB
    var dirty = false;
    var submitting = false;

    // Default the signature date to today.
    var sigDate = document.getElementById("sig_date");
    if (sigDate && !sigDate.value) {
      var now = new Date();
      sigDate.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }

    // Typing in an "Other:" box selects its option.
    applyForm.querySelectorAll(".choice-other").forEach(function (wrap) {
      var option = wrap.querySelector("input[type=radio], input[type=checkbox]");
      var detail = wrap.querySelector("input[type=text], input[type=date]");
      if (option && detail) {
        detail.addEventListener("input", function () {
          if (detail.value) { option.checked = true; }
        });
      }
    });

    applyForm.addEventListener("input", function () { dirty = true; });
    window.addEventListener("beforeunload", function (e) {
      if (dirty && !submitting) { e.preventDefault(); e.returnValue = ""; }
    });

    var showApplyError = function (message) {
      applyError.textContent = message;
      applyError.hidden = false;
    };

    // Re-encode phone photos as smaller JPEGs so several fit under the cap.
    var shrinkImage = function (file) {
      if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || file.size < 400 * 1024 ||
          !window.createImageBitmap) {
        return Promise.resolve(file);
      }
      return createImageBitmap(file).then(function (bmp) {
        var scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.round(bmp.width * scale);
        canvas.height = Math.round(bmp.height * scale);
        canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
        return new Promise(function (resolve) {
          canvas.toBlob(function (blob) {
            if (!blob || blob.size >= file.size) { resolve(file); return; }
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
          }, "image/jpeg", 0.82);
        });
      }).catch(function () { return file; });
    };

    applyForm.addEventListener("submit", function (e) {
      e.preventDefault();
      applyError.hidden = true;

      var data = new FormData(applyForm);
      var fileInputs = applyForm.querySelectorAll("input[type=file]");
      var label = applyBtn.textContent;
      applyBtn.disabled = true;
      applyBtn.textContent = "Preparing your application…";

      Promise.all(Array.prototype.map.call(fileInputs, function (input) {
        var file = input.files && input.files[0];
        return file ? shrinkImage(file).then(function (f) { data.set(input.name, f, f.name); }) : null;
      }))
        .then(function () {
          var total = 0;
          var biggest = null;
          fileInputs.forEach(function (input) {
            var f = data.get(input.name);
            if (f && f.size) {
              total += f.size;
              if (!biggest || f.size > biggest.size) { biggest = f; }
            }
          });
          if (total > MAX_BYTES) {
            throw new Error(
              "Your uploads add up to " + (total / 1048576).toFixed(1) + " MB, and the limit is 8 MB. " +
              "Remove the largest file (" + biggest.name + ") and email it to give@monumentalrecovery.org instead, then submit again."
            );
          }
          applyBtn.textContent = "Sending…";
          return fetch("/", { method: "POST", body: data });
        })
        .then(function (res) {
          if (!res.ok) { throw new Error("We could not submit your application. Please try again."); }
          submitting = true;
          window.location.href = applyForm.getAttribute("action");
        })
        .catch(function (err) {
          var message = err && err.message ? err.message : "";
          if (!message || /failed to fetch|networkerror|load failed/i.test(message)) {
            message = "We could not reach the server. Check your connection and try again, or email give@monumentalrecovery.org.";
          }
          showApplyError(message);
          applyBtn.disabled = false;
          applyBtn.textContent = label;
        });
    });
  }

  /* Footer year ---------------------------------------------------------- */
  var year = document.querySelectorAll(".js-year");
  year.forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
