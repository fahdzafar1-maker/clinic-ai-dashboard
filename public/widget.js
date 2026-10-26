/*
 * Clinic OS website chat widget.
 * <script src="https://clinic-ai-dashboard-five.vercel.app/widget.js" data-clinic="your-clinic-slug" defer></script>
 * Optional: data-color="#1593a3"  data-label="Chat with us"
 */
(function () {
  var script = document.currentScript;
  if (!script || window.__clinicOsChat) return;
  window.__clinicOsChat = true;
  var slug = script.getAttribute('data-clinic');
  if (!slug) return;
  var origin = new URL(script.src).origin;
  var color = script.getAttribute('data-color') || '#1593a3';
  var label = script.getAttribute('data-label') || 'Chat with us';

  var css = '' +
    '.cos-chat-btn{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;align-items:center;gap:8px;height:52px;padding:0 20px 0 16px;border:0;border-radius:26px;background:' + color + ';color:#fff;font:600 14px/1 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18);cursor:pointer}' +
    '.cos-chat-btn svg{width:22px;height:22px}' +
    '.cos-chat-frame{position:fixed;right:20px;bottom:84px;z-index:2147483000;width:380px;height:600px;max-width:calc(100vw - 24px);max-height:calc(100vh - 110px);border:0;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.22);background:#fff;display:none}' +
    '.cos-chat-frame.open{display:block}' +
    '@media(max-width:480px){.cos-chat-frame{right:12px;left:12px;width:auto;bottom:80px}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var frame = document.createElement('iframe');
  frame.className = 'cos-chat-frame';
  frame.title = 'Chat';
  frame.setAttribute('loading', 'lazy');

  var btn = document.createElement('button');
  btn.className = 'cos-chat-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', label);
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span></span>';
  btn.querySelector('span').textContent = label;

  btn.addEventListener('click', function () {
    if (!frame.src) frame.src = origin + '/chat/' + encodeURIComponent(slug) + '?embed=1';
    frame.classList.toggle('open');
  });

  document.body.appendChild(frame);
  document.body.appendChild(btn);
})();
