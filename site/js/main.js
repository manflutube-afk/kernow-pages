/* =========================================================
   Kernow Pages — site behaviour
   Every page loads this one file. Each block checks that its
   elements exist first, so nothing breaks on pages that
   don't use it.
   ========================================================= */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Mobile navigation ---- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.nav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---- Header shadow once you scroll ---- */
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-stuck', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---- Scroll reveals ---- */
  var revealables = document.querySelectorAll('[data-reveal]');
  if (revealables.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      revealables.forEach(function (el) { el.classList.add('is-in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
      revealables.forEach(function (el) { io.observe(el); });
    }
  }

  /* ---- Hero: type a business name into the mock site ---- */
  var mockTitle = document.getElementById('mock-title');
  var mockLogo = document.getElementById('mock-logo');
  var mockUrl = document.getElementById('mock-url');
  var nameInput = document.getElementById('bizname');

  if (mockTitle && mockLogo && mockUrl) {
    var samples = [
      'The Loaded Scone Co.',
      "Endean's Barber Shop",
      'Falmouth Flowers',
      'Par Market Fishmonger',
      'Kernow Kayak Hire'
    ];
    var touched = false;
    var caret = '<span class="caret" aria-hidden="true"></span>';

    var setMock = function (name) {
      mockTitle.innerHTML = escapeHtml(name) + (touched ? '' : caret);
      mockLogo.textContent = name;
      mockUrl.textContent = 'https://' + slug(name) + '.co.uk';
    };

    var slug = function (s) {
      return s.toLowerCase()
        .replace(/['’.]/g, '')
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 24) || 'yourbusiness';
    };

    function escapeHtml(s) {
      return s.replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    if (nameInput) {
      nameInput.addEventListener('input', function () {
        touched = true;
        setMock(nameInput.value.trim() || 'Your business');
      });
    }

    if (reduceMotion) {
      setMock(samples[0]);
    } else {
      var sampleIndex = 0;
      var charIndex = 0;
      var deleting = false;

      var tick = function () {
        if (touched) return;
        var current = samples[sampleIndex];
        charIndex += deleting ? -1 : 1;
        setMock(current.slice(0, charIndex) || '\u00a0');

        var delay = deleting ? 35 : 75;
        if (!deleting && charIndex === current.length) {
          deleting = true;
          delay = 1800;
        } else if (deleting && charIndex === 0) {
          deleting = false;
          sampleIndex = (sampleIndex + 1) % samples.length;
          delay = 400;
        }
        setTimeout(tick, delay);
      };
      tick();
    }
  }

  /* ---- Pricing: one-off vs monthly ---- */
  var toggleBtns = document.querySelectorAll('[data-billing]');
  if (toggleBtns.length) {
    var toggleEl = document.querySelector('.toggle');

    var applyBilling = function (mode) {
      // The sliding pill is driven off this attribute, so the switch is
      // something you watch happen rather than just a colour change.
      if (toggleEl) toggleEl.dataset.mode = mode;
      toggleBtns.forEach(function (b) {
        b.setAttribute('aria-pressed', b.dataset.billing === mode ? 'true' : 'false');
      });
      document.querySelectorAll('.price-value').forEach(function (el) {
        var next = mode === 'monthly' ? el.dataset.monthly : el.dataset.oneoff;
        if (!next || el.textContent === next) return;
        el.classList.add('is-swapping');
        setTimeout(function () {
          el.textContent = next;
          el.classList.remove('is-swapping');
        }, reduceMotion ? 0 : 180);
      });
      document.querySelectorAll('[data-billing-note]').forEach(function (el) {
        el.textContent = mode === 'monthly' ? el.dataset.monthlyNote : el.dataset.oneoffNote;
      });
    };
    toggleBtns.forEach(function (b) {
      b.addEventListener('click', function () { applyBilling(b.dataset.billing); });
    });
    applyBilling('oneoff');
  }

  /* ---- Contact form ----
     Posts to /api/contact (functions/api/contact.js), which sends the
     enquiry on with Resend. If JavaScript is off the form posts natively
     and the function redirects back here with ?sent=1 or ?error=..., which
     the first block below picks up.                                     */
  var form = document.getElementById('contact-form');
  var status = document.getElementById('form-status');

  var showStatus = function (message, isError) {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('form-status--error', !!isError);
    status.classList.add('is-visible');
  };

  var fallbackLine = function () {
    var to = (form && form.dataset.email) || 'contact@leodiablo.com';
    return ' Please email me directly at ' + to + '.';
  };

  var SENT_MESSAGE = "Thank you — that's with me. I'll get back to you as soon as I can.";

  var thanks = document.getElementById('thanks');
  var thanksClose = document.getElementById('thanks-close');

  /* The dialog is the nice version. If <dialog> isn't supported, or it refuses
     to open for any reason, the inline status line is still there underneath. */
  var celebrate = function (email) {
    showStatus(SENT_MESSAGE, false);
    if (!thanks || typeof thanks.showModal !== 'function') return;
    var target = document.getElementById('thanks-email');
    if (target && email) target.textContent = email;
    try {
      thanks.showModal();
    } catch (e) {
      /* already open, or not attached — the status line has it covered */
    }
  };

  if (thanks && thanksClose) {
    thanksClose.addEventListener('click', function () { thanks.close(); });
    /* Clicking the backdrop closes it too, which is what people expect. */
    thanks.addEventListener('click', function (e) {
      if (e.target === thanks) thanks.close();
    });
  }

  if (status) {
    var params = new URLSearchParams(window.location.search);
    if (params.get('sent')) {
      celebrate('');
      if (form) form.reset();
    } else if (params.get('error')) {
      showStatus(params.get('error') + fallbackLine(), true);
    }
    if (params.get('sent') || params.get('error')) {
      history.replaceState(null, '', window.location.pathname);
      status.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }

  if (form) {
    var submitBtn = document.getElementById('form-submit');
    var sending = false;

    form.addEventListener('submit', function (e) {
      if (sending) { e.preventDefault(); return; }
      if (!window.fetch) return;          // let the browser post it the old way
      e.preventDefault();

      sending = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending…';
      }

      fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      })
        .then(function (res) {
          return res.json().catch(function () { return { ok: false }; });
        })
        .then(function (data) {
          if (data && data.ok) {
            var email = (new FormData(form)).get('email') || '';
            form.reset();
            celebrate(email);
          } else {
            showStatus(((data && data.error) || 'Something went wrong sending that.') + fallbackLine(), true);
          }
        })
        .catch(function () {
          showStatus('Something went wrong sending that.' + fallbackLine(), true);
        })
        .then(function () {
          sending = false;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send enquiry';
          }
        });
    });
  }

  /* ---- Ko-fi support modal ----
     The support buttons are ordinary links to ko-fi.com, so they still work
     with JavaScript off or if <dialog> isn't supported. When it is, the click
     is intercepted and Ko-fi's own form opens in a modal instead, so nobody
     has to leave the site to chip in. The iframe isn't given a src until the
     first open, which keeps Ko-fi out of every page load.               */
  var kofi = document.getElementById('kofi');
  var kofiFrame = document.getElementById('kofi-frame');
  var kofiClose = document.getElementById('kofi-close');
  var kofiButtons = document.querySelectorAll('.support-btn');
  var KOFI_EMBED = 'https://ko-fi.com/kernow/?hidefeed=true&widget=true&embed=true&preview=true';

  if (kofi && kofiFrame && kofiButtons.length && typeof kofi.showModal === 'function') {
    var kofiLoaded = false;

    kofiButtons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!kofiLoaded) {
          kofiFrame.src = KOFI_EMBED;
          kofiLoaded = true;
        }
        try {
          kofi.showModal();
        } catch (err) {
          window.open(btn.href, '_blank', 'noopener');
        }
      });
    });

    if (kofiClose) kofiClose.addEventListener('click', function () { kofi.close(); });
    kofi.addEventListener('click', function (e) { if (e.target === kofi) kofi.close(); });
  }

  /* ---- Footer year ---- */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
