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

  /* Scholarship Submit Form ---------------------------------------------- */
  var submitForm = document.getElementById("submit-form");
  if (submitForm) {
    var MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // the email function accepts about 4.2 MB of files
    var submitBtn = submitForm.querySelector("button[type=submit]");
    var errorEl = submitForm.querySelector(".form-error");
    var fileList = document.getElementById("file-list");
    var applicantField = document.getElementById("s_applicant");
    var dirty = false;
    var leaving = false;

    var currentRole = function () {
      var checked = submitForm.querySelector("input[name=role]:checked");
      return checked ? checked.value : "applicant";
    };

    // Swap labels and fields between applicant and clinician.
    var applyRole = function () {
      var role = currentRole();
      submitForm.querySelectorAll("[data-show]").forEach(function (el) {
        el.hidden = el.getAttribute("data-show") !== role;
      });
      submitForm.querySelectorAll("label[data-applicant]").forEach(function (el) {
        el.textContent = el.getAttribute("data-" + role);
      });
      applicantField.required = role === "clinician";
      if (role === "clinician") { document.getElementById("s_docs").value = ""; }
      listFiles();
    };

    var selectedFiles = function () {
      var files = [];
      submitForm.querySelectorAll("input[type=file]").forEach(function (input) {
        if (input.closest("[hidden]")) { return; }
        Array.prototype.forEach.call(input.files || [], function (f) { files.push(f); });
      });
      return files;
    };

    var formatSize = function (bytes) {
      return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
    };

    var listFiles = function () {
      var files = selectedFiles();
      fileList.innerHTML = "";
      if (!files.length) { return; }
      var total = 0;
      files.forEach(function (f) {
        total += f.size;
        var li = document.createElement("li");
        li.innerHTML = "<span></span><span></span>";
        li.firstChild.textContent = f.name;
        li.lastChild.textContent = formatSize(f.size);
        fileList.appendChild(li);
      });
      if (files.length > 1) {
        var sum = document.createElement("li");
        sum.className = "is-total";
        sum.innerHTML = "<span>Total before photos are shrunk</span><span></span>";
        sum.lastChild.textContent = formatSize(total);
        fileList.appendChild(sum);
      }
    };

    // Re-encode phone photos as smaller JPEGs so several pages fit.
    var shrinkImage = function (file) {
      if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || file.size < 300 * 1024 ||
          !window.createImageBitmap) {
        return Promise.resolve(file);
      }
      return createImageBitmap(file).then(function (bmp) {
        var scale = Math.min(1, 1700 / Math.max(bmp.width, bmp.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.round(bmp.width * scale);
        canvas.height = Math.round(bmp.height * scale);
        canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
        return new Promise(function (resolve) {
          canvas.toBlob(function (blob) {
            if (!blob || blob.size >= file.size) { resolve(file); return; }
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
          }, "image/jpeg", 0.78);
        });
      }).catch(function () { return file; });
    };

    // Preselect from apply.html?role=clinician#submit
    var roleParam = new URLSearchParams(window.location.search).get("role");
    if (roleParam === "clinician") {
      submitForm.querySelector("input[name=role][value=clinician]").checked = true;
    }
    submitForm.querySelectorAll("input[name=role]").forEach(function (r) {
      r.addEventListener("change", applyRole);
    });
    submitForm.querySelectorAll("input[type=file]").forEach(function (input) {
      input.addEventListener("change", listFiles);
    });
    applyRole();

    submitForm.addEventListener("input", function () { dirty = true; });
    window.addEventListener("beforeunload", function (e) {
      if (dirty && !leaving) { e.preventDefault(); e.returnValue = ""; }
    });

    submitForm.addEventListener("submit", function (e) {
      e.preventDefault();
      errorEl.hidden = true;

      var role = currentRole();
      var data = new FormData();
      ["company", "role", "name", "email", "phone", "notes"].forEach(function (field) {
        var value = new FormData(submitForm).get(field);
        if (value) { data.append(field, value); }
      });
      if (role === "clinician") { data.append("applicant_name", applicantField.value); }

      var label = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Preparing\u2026";

      Promise.all(selectedFiles().map(shrinkImage))
        .then(function (files) {
          var total = 0;
          var biggest = null;
          files.forEach(function (f) {
            data.append("files", f, f.name);
            total += f.size;
            if (!biggest || f.size > biggest.size) { biggest = f; }
          });
          if (total > MAX_UPLOAD_BYTES) {
            throw new Error(
              "Your files add up to " + formatSize(total) + ", and the limit is 4 MB. " +
              "Remove the largest file (" + biggest.name + ") and email it to give@monumentalrecovery.org instead, then submit again."
            );
          }
          submitBtn.textContent = "Sending\u2026";
          return fetch(submitForm.getAttribute("action"), { method: "POST", body: data });
        })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            if (!res.ok || !body.ok) {
              throw new Error(body.error || "We could not send your form. Please try again.");
            }
            leaving = true;
            window.location.href = role === "clinician" ? "recommendation-received.html" : "application-received.html";
          });
        })
        .catch(function (err) {
          var message = err && err.message ? err.message : "";
          if (!message || /failed to fetch|networkerror|load failed/i.test(message)) {
            message = "We could not reach the server. Check your connection and try again, or email give@monumentalrecovery.org.";
          }
          errorEl.textContent = message;
          errorEl.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = label;
        });
    });
  }

  /* Footer year ---------------------------------------------------------- */
  var year = document.querySelectorAll(".js-year");
  year.forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
