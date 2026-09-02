/* ==========================================================================
   willdiggle — mobile menu, welcome screen, entrance animations, contact form.
   ========================================================================== */

(function () {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = () => window.matchMedia('(max-width: 900px)').matches;

  /* ── Mobile welcome screen ───────────────────────────────────────────────
     The Wix mobile site opens on a paper field, fades the mark in, then
     fades away. Mobile only, and skipped entirely for reduced motion.     */

  function welcome() {
    if (reduced || !isMobile()) return;

    const screen = document.createElement('div');
    screen.className = 'welcome';
    screen.setAttribute('aria-hidden', 'true');

    const mark = document.createElement('img');
    mark.src = '/img/welcome-logo.png';
    mark.alt = '';
    mark.width = 120;
    mark.height = 116;
    screen.appendChild(mark);
    document.body.appendChild(screen);

    // Match the original's beat: a blank hold, the mark in, then out.
    setTimeout(() => screen.classList.add('logo-in'), 400);
    setTimeout(() => screen.classList.add('done'), 1700);
    setTimeout(() => screen.remove(), 2300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', welcome);
  } else {
    welcome();
  }

  /* ── Menu ──────────────────────────────────────────────────────────────── */

  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('nav');

  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    // Close it when a link is chosen or focus leaves the header.
    nav.addEventListener('click', (e) => {
      if (e.target.closest('a')) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  /* ── Float-in on scroll ──────────────────────────────────────────────────
     Section content rises 21px with a fade as it enters the viewport, as on
     the original. Without IntersectionObserver everything stays visible.  */

  const targets = document.querySelectorAll('[data-reveal]');

  if (targets.length && !reduced && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });

    targets.forEach((el) => {
      // Elements laid out with `display: contents` (the Teaching columns on
      // mobile) generate no box, so the observer would never fire for them
      // and they would sit in the pre-animation state forever.
      if (!el.getClientRects().length) return;
      el.classList.add('reveal');
      io.observe(el);
    });
  }

  /* ── Contact form ──────────────────────────────────────────────────────── */

  const form = document.getElementById('contact-form');
  if (!form) return;

  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('.form-status');

  // The German pages carry lang="de" on <html>; everything else gets English.
  const COPY = {
    en: {
      invalid: 'Please add your name, a valid email address, and a message.',
      sending: 'Sending…',
      sent: "Thank's for reaching out",
      failed: 'Something went wrong. Please try again.',
      offline: 'Could not reach the server. Please check your connection.',
    },
    de: {
      invalid: 'Bitte geben Sie Ihren Namen, eine gültige E-Mail-Adresse und eine Nachricht an.',
      sending: 'Wird gesendet…',
      sent: 'Vielen Dank für Ihre Nachricht',
      failed: 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.',
      offline: 'Der Server ist nicht erreichbar. Bitte prüfen Sie Ihre Verbindung.',
    },
  };

  const t = COPY[document.documentElement.lang === 'de' ? 'de' : 'en'];

  function say(text, kind) {
    status.textContent = text;
    status.className = 'form-status' + (kind ? ' ' + kind : '');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      say(t.invalid, 'error');
      return;
    }

    button.disabled = true;
    say(t.sending);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const result = await response.json().catch(() => ({}));

      if (response.ok && result.ok) {
        form.reset();
        say(t.sent, 'ok');
      } else {
        // The Worker's own errors are English; fall back to our own wording
        // on the German pages rather than mixing the two.
        say(document.documentElement.lang === 'de'
          ? t.failed
          : (result.error || t.failed), 'error');
      }
    } catch {
      say(t.offline, 'error');
    } finally {
      button.disabled = false;
    }
  });
})();
