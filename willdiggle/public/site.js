// Mobile menu and contact form submission.
(function () {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('nav');

  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

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
