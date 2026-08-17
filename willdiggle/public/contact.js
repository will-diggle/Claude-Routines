// Submits the contact form to /api/contact without leaving the page.
(function () {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('.status');

  function say(text, kind) {
    status.textContent = text;
    status.className = 'status' + (kind ? ' ' + kind : '');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      say('Please fill in your name, a valid email, and a message.', 'error');
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
        say('Thank you — your message has been sent.', 'ok');
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
