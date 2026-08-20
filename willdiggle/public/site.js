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

  function say(text, kind) {
    status.textContent = text;
    status.className = 'form-status' + (kind ? ' ' + kind : '');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      say('Please add your name, a valid email address, and a message.', 'error');
      return;
    }

    button.disabled = true;
    say('Sending…');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const result = await response.json().catch(() => ({}));

      if (response.ok && result.ok) {
        form.reset();
        say("Thank's for reaching out", 'ok');
      } else {
        say(result.error || 'Something went wrong. Please try again.', 'error');
      }
    } catch {
      say('Could not reach the server. Please check your connection.', 'error');
    } finally {
      button.disabled = false;
    }
  });
})();
