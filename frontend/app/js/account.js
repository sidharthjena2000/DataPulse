/*
 * Session guard and account menu.
 * The session marker is written by the sign-in page (assets/js/login.js). Profile details are
 * derived from the email address: nothing is looked up over the network.
 */
(function (DP) {
  'use strict';

  var SESSION_KEY = 'datapulse.session.v1';
  var LOGIN_URL = '../';
  var FREE_MAIL = ['gmail', 'googlemail', 'outlook', 'hotmail', 'live', 'yahoo', 'icloud', 'me', 'proton', 'protonmail', 'aol'];

  function read() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }

  var session = read();
  if (!session) { window.location.replace(LOGIN_URL); return; }

  function title(word) { return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(); }

  function profile(sess) {
    var email = sess.email || '';
    if (email.indexOf('@') > 0) {
      var parts = email.split('@'), local = parts[0], domain = parts[1].toLowerCase();
      var words = local.split(/[._+-]+/).map(function (w) { return w.replace(/\d+/g, ''); }).filter(Boolean);
      var name = words.map(title).join(' ') || email;
      var label = domain.split('.')[0];
      var personal = FREE_MAIL.indexOf(label) !== -1;
      var org = personal ? 'Personal email' : label.split('-').map(title).join(' ');
      return { name: name, email: email, org: org, orgNote: personal ? 'No organisation in this domain' : domain,
        initials: (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] || email).slice(0, 2)).toUpperCase() };
    }
    var ws = sess.workspace || 'workspace';
    return { name: 'API key', email: '', org: ws, orgNote: 'Workspace', initials: 'API' };
  }

  function signOut() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    window.location.replace(LOGIN_URL + '?signed_out=1');
  }

  function fmtWhen(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function build() {
    var esc = DP.esc, p = profile(session);
    var host = document.querySelector('.sidebar');
    if (!host) return;
    var wrap = document.createElement('div');
    wrap.className = 'acct';
    wrap.innerHTML =
      '<button type="button" class="acct-btn" id="acct-btn" aria-expanded="false" aria-controls="acct-menu">' +
      '<span class="acct-av" aria-hidden="true">' + esc(p.initials) + '</span>' +
      '<span class="acct-who"><strong>' + esc(p.name) + '</strong><span>' + esc(p.email || p.org) + '</span></span>' +
      '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg></button>' +
      '<div class="acct-menu" id="acct-menu" role="group" aria-label="Account" hidden>' +
      '<dl>' +
      '<div><dt>Name</dt><dd>' + esc(p.name) + '</dd></div>' +
      (p.email ? '<div><dt>Email</dt><dd>' + esc(p.email) + '</dd></div>' : '') +
      '<div><dt>Organisation</dt><dd>' + esc(p.org) + '<span>' + esc(p.orgNote) + '</span></dd></div>' +
      '<div><dt>Workspace</dt><dd>' + esc(session.workspace && session.workspace !== p.org ? session.workspace : 'gbs_health_prod') + '</dd></div>' +
      '<div><dt>Signed in with</dt><dd>' + (session.method === 'api_key' ? 'API key' : 'Work email') + (session.issuedAt ? '<span>' + esc(fmtWhen(session.issuedAt)) + '</span>' : '') + '</dd></div>' +
      '</dl>' +
      '<p class="acct-note">Name and organisation are inferred from the email address. Demo session: nothing is sent to a server.</p>' +
      '<button type="button" class="acct-out" id="acct-out">Sign out</button></div>';
    var brand = host.querySelector('.brand');
    host.insertBefore(wrap, brand ? brand.nextSibling : host.firstChild);

    var btn = document.getElementById('acct-btn'), menu = document.getElementById('acct-menu');
    function setOpen(on, refocus) {
      menu.hidden = !on;
      btn.setAttribute('aria-expanded', String(on));
      if (on) document.getElementById('acct-out').focus();
      else if (refocus) btn.focus();
    }
    btn.addEventListener('click', function () { setOpen(menu.hidden); });
    document.getElementById('acct-out').addEventListener('click', signOut);
    document.addEventListener('click', function (e) { if (!menu.hidden && !wrap.contains(e.target)) setOpen(false); });
    wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); setOpen(false, true); } });
    window.addEventListener('storage', function (e) { if (e.key === SESSION_KEY && !e.newValue) window.location.replace(LOGIN_URL); });
  }

  DP.session = { get: function () { return session; }, profile: function () { return profile(session); }, signOut: signOut };
  document.addEventListener('DOMContentLoaded', build);
})(window.DP = window.DP || {});
