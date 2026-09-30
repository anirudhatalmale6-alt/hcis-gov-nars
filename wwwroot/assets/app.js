/**
 * The shell: who is signed in, which screen is showing.
 *
 * Routing is on the hash so the whole thing is a static folder behind nginx
 * with no server-side rewriting to get wrong.
 */

import * as api from './api.js';
import * as views from './views.js';

const el = views.el;
const root = document.getElementById('app');

/** Set by go() and consumed once, so a success message survives the redirect
    that follows saving but does not reappear on a refresh. */
let pending = null;

const MENU = [
  { group: 'Main', items: [{ href: '#/', label: 'Dashboard' }] },
  { group: 'Assessment', items: [{ href: '#/applicants', label: 'Applicants' }] },
];

function go(hash, options) {
  pending = (options && options.flash) || null;
  if (location.hash === hash) render();
  else location.hash = hash;
}

function shell(inner, active) {
  const me = api.currentUser();
  const side = el('nav', { class: 'side' }, [
    el('div', { class: 'side-top' }, [
      el('div', { class: 'side-crest', role: 'img',
                  'aria-label': 'Coat of arms of Seychelles' }),
      el('div', { class: 'side-words' }, [
        el('strong', { text: 'NARS' }),
        el('span', { text: 'WHODAS 2.0' }),
      ]),
    ]),
  ]);

  for (const section of MENU) {
    side.appendChild(el('div', { class: 'side-group', text: section.group }));
    for (const item of section.items) {
      side.appendChild(el('a', {
        href: item.href,
        text: item.label,
        class: active && active.startsWith(item.href) && item.href !== '#/' ? 'on'
             : (active === item.href ? 'on' : ''),
      }));
    }
  }
  side.appendChild(el('div', { class: 'side-foot', text: 'Seychelles Home Care' }));

  return el('div', { class: 'shell' }, [
    side,
    el('div', { class: 'main' }, [
      el('header', { class: 'topbar' }, [
        el('div', { class: 'who' }, [
          el('b', { text: me ? me.name : '' }),
          el('span', { text: me ? `${me.user_group} · ${me.role}` : '' }),
        ]),
        el('button', {
          class: 'btn-plain', text: 'Password',
          onclick: () => go('#/password'),
        }),
        el('button', {
          class: 'btn-plain', text: 'Sign out',
          onclick: async () => { await api.signOut(); go('#/'); },
        }),
      ]),
      el('main', { class: 'content' }, [inner]),
    ]),
  ]);
}

function render() {
  const flash = pending;
  pending = null;

  root.innerHTML = '';

  if (!api.signedIn()) {
    root.appendChild(views.signInView(() => go('#/')));
    return;
  }

  // The database refuses everything to an account outside the Health group, so
  // showing them a module full of empty screens would only be confusing.
  if (!api.isHealth()) {
    root.appendChild(shell(
      el('div', { class: 'note note-bad' }, [
        'This account is not in the Health Department group, so it has no access to the ' +
        'Needs Assessment module.',
      ]), '#/'));
    return;
  }

  // A temporary password is only temporary if something insists. Nothing else
  // is reachable until it is changed.
  if (api.mustChangePassword()) {
    root.appendChild(shell(views.changePasswordView(
      () => go('#/', { flash: 'Password changed.' }), true), '#/'));
    return;
  }

  const hash = location.hash || '#/';
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);

  let view;
  if (parts.length === 0) {
    view = views.dashboardView(flash);
  } else if (parts[0] === 'applicants' && parts.length === 1) {
    view = views.applicantsView(go);
  } else if (parts[0] === 'applicants' && parts[1] === 'new') {
    view = views.newApplicantView(go);
  } else if (parts[0] === 'applicants' && parts.length === 2) {
    view = views.applicantView(parts[1], go, flash);
  } else if (parts[0] === 'applicants' && parts[2] === 'visit') {
    view = views.homeVisitView(parts[1], go);
  } else if (parts[0] === 'interview' && parts[2] === 'finish') {
    view = views.finishInterviewView(parts[1], go);
  } else if (parts[0] === 'interview' && parts.length === 2) {
    view = views.interviewView(parts[1], go);
  } else if (parts[0] === 'password') {
    view = views.changePasswordView(() => go('#/', { flash: 'Password changed.' }), false);
  } else {
    view = el('div', {}, [
      el('h1', { text: 'Not found' }),
      el('p', {}, [el('a', { href: '#/', text: 'Back to the dashboard' })]),
    ]);
  }

  root.appendChild(shell(view, '#/' + parts.slice(0, 1).join('/')));
}

window.addEventListener('hashchange', render);
render();
