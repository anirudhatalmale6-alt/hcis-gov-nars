/**
 * The screens.
 *
 * Every field an assessor types into is built here rather than written out in
 * HTML, so the validation rules and the field live next to each other and
 * cannot drift apart.
 */

import * as api from './api.js';

/** The module's full name, as the Health Department gave it. Written once. */
export const MODULE_TITLE = 'WHODAS 2.0 & Needs Assessment Information System';

/* --------------------------------------------------------------- helpers */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

/** Dates are shown the way they are written in Seychelles, not the way the
    database stores them. */
export function showDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return String(d.getDate()).padStart(2, '0') + '/' +
         String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

function note(kind, message) {
  return el('div', { class: 'note note-' + kind, text: message });
}

function loading(what) {
  return el('div', { class: 'loading', text: what || 'Loading…' });
}

/* ---------------------------------------------------------------- fields */

/**
 * One labelled input that knows how to check itself.
 *
 * `check` returns an error message, or nothing when the value is acceptable.
 */
function field(spec) {
  const id = 'f_' + spec.name;
  const input = spec.type === 'textarea'
    ? el('textarea', { id, name: spec.name, rows: spec.rows || 3 })
    : spec.type === 'select'
      ? el('select', { id, name: spec.name },
          (spec.options || []).map((o) => el('option', { value: o.value, text: o.label })))
      : el('input', {
          id, name: spec.name, type: spec.type || 'text',
          placeholder: spec.placeholder || '',
          inputmode: spec.inputmode || null,
          max: spec.max || null,
          maxlength: spec.maxlength || null,
        });

  if (spec.value !== undefined && spec.value !== null) input.value = spec.value;

  const error = el('div', { class: 'err', style: 'display:none' });
  const wrap = el('div', { class: 'field' }, [
    el('label', { for: id, text: spec.label + (spec.required ? ' *' : '') }),
    input,
    spec.hint ? el('div', { class: 'hint', text: spec.hint }) : null,
    error,
  ]);

  input.addEventListener('input', () => {
    if (error.style.display !== 'none') wrap.validate();
  });
  // Checking when they leave the field is the moment a person expects to be
  // told. Waiting for the save button means filling in six more fields before
  // finding out the second one was wrong. Nothing is said while the field is
  // still empty and untouched.
  input.addEventListener('blur', () => {
    if (String(input.value || '').trim() !== '') wrap.validate();
  });

  wrap.input = input;
  wrap.validate = function () {
    const value = String(input.value || '').trim();
    let message = '';
    if (spec.required && !value) message = spec.label + ' is required.';
    else if (value && spec.check) message = spec.check(value) || '';
    error.textContent = message;
    error.style.display = message ? 'block' : 'none';
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    return !message;
  };
  return wrap;
}

function form(fields, onSubmit, submitLabel) {
  const problem = el('div');
  const button = el('button', { class: 'btn', type: 'submit', text: submitLabel });

  const node = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      problem.innerHTML = '';

      // Check every field, not just up to the first failure - being told about
      // one problem at a time is how a five-field form takes five attempts.
      let ok = true;
      for (const f of fields) if (!f.validate()) ok = false;
      if (!ok) {
        problem.appendChild(note('bad', 'Please correct the fields marked below.'));
        return;
      }

      const values = {};
      for (const f of fields) {
        const v = String(f.input.value || '').trim();
        values[f.input.name] = v === '' ? null : v;
      }

      button.disabled = true;
      const restore = button.textContent;
      button.textContent = 'Saving…';
      try {
        await onSubmit(values);
      } catch (err) {
        problem.appendChild(note('bad', err.message || 'That could not be saved.'));
        button.disabled = false;
        button.textContent = restore;
      }
    },
  }, [problem, ...fields, el('div', { class: 'actions' }, [button])]);

  return node;
}

/* ------------------------------------------------------------- the rules */

/**
 * A Seychelles national identity number is eleven digits, and the first three
 * are the year of birth. Punctuation is accepted and stripped, because it is
 * written on documents as 999-9999-9-9-99 and nobody should have to know that
 * the database does not want the dashes.
 */
function checkNin(value) {
  // Character check FIRST. "abc-defg-h-i-jk" has no digits in it, so counting
  // digits reports "this one has 0" - true, and no help at all to somebody who
  // has typed in the wrong box. Say the useful thing.
  if (/[^0-9\s-]/.test(value)) {
    return 'Only digits and dashes, as written on the card.';
  }
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) {
    return `A national identity number has 11 digits — this one has ${digits.length}.`;
  }
  return '';
}

function checkDateOfBirth(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'That is not a date.';
  if (d > new Date()) return 'A date of birth cannot be in the future.';
  if (d < new Date('1900-01-01')) return 'That date is too far back to be right.';
  return '';
}

const DISTRICTS = [
  'Anse aux Pins', 'Anse Boileau', 'Anse Etoile', 'Anse Royale', 'Au Cap',
  'Baie Lazare', 'Baie Sainte Anne', 'Beau Vallon', 'Bel Air', 'Bel Ombre',
  'Cascade', 'Glacis', 'Grand Anse Mahe', 'Grand Anse Praslin', 'La Digue',
  'La Riviere Anglaise', 'Les Mamelles', 'Mont Buxton', 'Mont Fleuri',
  'Plaisance', 'Pointe Larue', 'Port Glaud', 'Roche Caiman', 'Saint Louis',
  'Takamaka',
];

/* ------------------------------------------------------------------ views */

export function signInView(onDone) {
  const user = el('input', { type: 'text', id: 'u', autocomplete: 'username' });
  const pass = el('input', { type: 'password', id: 'p', autocomplete: 'current-password' });
  const problem = el('div');
  const button = el('button', { class: 'btn btn-wide', type: 'submit', text: 'Sign in' });

  return el('div', { class: 'signin' }, [
    el('div', { class: 'signin-card' }, [
      el('div', { class: 'crest', role: 'img',
                  'aria-label': 'Coat of arms of Seychelles' }),
      el('h1', { class: 'signin-title', text: MODULE_TITLE }),
      el('div', { class: 'signin-sub', text: 'Health Department · Seychelles Home Care' }),
      el('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          problem.innerHTML = '';
          button.disabled = true;
          button.textContent = 'Signing in…';
          try {
            const who = await api.signIn(user.value.trim(), pass.value);
            if (who.user_group !== 'Health') {
              // The database would refuse them everything anyway. Saying so
              // here saves somebody staring at an empty screen wondering what
              // they did wrong.
              api.forget();
              throw new api.ApiError(
                'This account is not in the Health Department group, so it has no access to the Needs Assessment module. Please use HCIS instead.', 403, null);
            }
            onDone();
          } catch (err) {
            problem.appendChild(note('bad', err.message));
            button.disabled = false;
            button.textContent = 'Sign in';
            pass.value = '';
          }
        },
      }, [
        problem,
        el('div', { class: 'field' }, [el('label', { for: 'u', text: 'Username or email' }), user]),
        el('div', { class: 'field' }, [el('label', { for: 'p', text: 'Password' }), pass]),
        button,
      ]),
    ]),
  ]);
}

export function dashboardView(flash) {
  const cards = el('div', { class: 'cards' }, [loading('Counting…')]);
  const body = el('div', {}, [
    flash ? note('good', flash) : null,
    el('h1', { text: MODULE_TITLE }),
    el('p', { class: 'signin-sub',
              text: 'Health Department · applicants, home visits and interviews' }),
    cards,
  ]);

  api.summary().then((s) => {
    cards.innerHTML = '';
    const items = [
      ['Applicants registered', s ? s.applicants : 0, ''],
      ['Awaiting a home visit', s ? s.awaiting_visit : 0, 'warn'],
      ['Interviews in progress', s ? s.awaiting_interview : 0, ''],
      ['Assessments completed', s ? s.completed : 0, ''],
      ['Due for renewal within 30 days', s ? s.due_for_renewal : 0, 'warn'],
    ];
    for (const [label, n, kind] of items) {
      cards.appendChild(el('div', { class: 'card ' + (n > 0 && kind ? kind : '') }, [
        el('div', { class: 'n', text: String(n) }),
        el('div', { class: 'l', text: label }),
      ]));
    }
  }).catch((err) => {
    cards.innerHTML = '';
    cards.appendChild(note('bad', err.message));
  });

  return body;
}

export function applicantsView(go) {
  const rows = el('tbody', {}, [el('tr', {}, [el('td', { colspan: '6' }, [loading()])])]);
  const search = el('input', { type: 'text', placeholder: 'Name, reference or NIN…', style: 'max-width:280px' });

  async function load() {
    rows.innerHTML = '';
    rows.appendChild(el('tr', {}, [el('td', { colspan: '6' }, [loading()])]));
    try {
      const list = await api.applicants.list(search.value);
      rows.innerHTML = '';
      if (!list.length) {
        rows.appendChild(el('tr', {}, [el('td', { colspan: '6' }, [
          el('div', { class: 'empty' }, [
            el('p', { text: search.value.trim()
              ? 'No applicant matches that.'
              : 'No applicants registered yet.' }),
            el('button', { class: 'btn', text: 'Register the first applicant',
                           onclick: () => go('#/applicants/new') }),
          ]),
        ])]));
        return;
      }
      for (const a of list) {
        rows.appendChild(el('tr', {}, [
          el('td', { class: 'ref', text: a.reference }),
          el('td', {}, [el('a', { href: '#/applicants/' + a.id, text: a.full_name })]),
          el('td', { text: a.nin || '—' }),
          el('td', { text: a.district || '—' }),
          el('td', { text: showDate(a.registered_at) }),
          el('td', {}, [el('a', { href: '#/applicants/' + a.id, text: 'Open' })]),
        ]));
      }
    } catch (err) {
      rows.innerHTML = '';
      rows.appendChild(el('tr', {}, [el('td', { colspan: '6' }, [note('bad', err.message)])]));
    }
  }

  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
  load();

  return el('div', {}, [
    el('div', { style: 'display:flex;align-items:center;gap:16px' }, [
      el('h1', { text: 'Applicants' }),
      el('div', { style: 'margin-left:auto;display:flex;gap:10px' }, [
        search,
        el('button', { class: 'btn', text: 'Register applicant', onclick: () => go('#/applicants/new') }),
      ]),
    ]),
    el('div', { class: 'panel' }, [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Reference' }), el('th', { text: 'Name' }),
          el('th', { text: 'NIN' }), el('th', { text: 'District' }),
          el('th', { text: 'Registered' }), el('th', { text: '' }),
        ])]),
        rows,
      ]),
    ]),
  ]);
}

export function newApplicantView(go) {
  const fields = [
    field({ name: 'full_name', label: 'Full name', required: true,
            hint: 'As it appears on the identity card.' }),
    field({ name: 'nin', label: 'National identity number', required: true,
            placeholder: '999-9999-9-9-99', inputmode: 'numeric', check: checkNin,
            maxlength: 18,
            hint: 'Eleven digits. Dashes are fine — they are removed when saved.' }),
    field({ name: 'date_of_birth', label: 'Date of birth', type: 'date',
            max: new Date().toISOString().slice(0, 10), check: checkDateOfBirth }),
    field({ name: 'sex', label: 'Sex', type: 'select', options: [
      { value: '', label: '—' }, { value: 'Female', label: 'Female' },
      { value: 'Male', label: 'Male' }] }),
    field({ name: 'district', label: 'District', type: 'select', required: true,
            options: [{ value: '', label: '—' }]
              .concat(DISTRICTS.map((d) => ({ value: d, label: d }))) }),
    field({ name: 'address', label: 'Address', type: 'textarea',
            hint: 'Enough for an assessor to find the house.' }),
    field({ name: 'phone', label: 'Telephone' }),
    field({ name: 'notes', label: 'Notes', type: 'textarea',
            hint: 'Anything the assessor should know before visiting.' }),
  ];

  const node = form(fields, async (values) => {
    values.nin = values.nin ? values.nin.replace(/\D/g, '') : null;
    const created = await api.applicants.create(values);
    go('#/applicants/' + created.id, {
      flash: `${created.full_name} registered as ${created.reference}.`,
    });
  }, 'Register applicant');

  return el('div', {}, [
    el('h1', { text: 'Register an applicant' }),
    el('p', { class: 'signin-sub',
              text: 'The reference number is allocated when the record is saved.' }),
    el('div', { class: 'panel' }, [el('div', { class: 'panel-body' }, [node])]),
  ]);
}

export function applicantView(id, go, flash) {
  const wrap = el('div', {}, [loading()]);

  Promise.all([
    api.applicants.get(id),
    api.homeVisits.forApplicant(id),
    api.assessments.forApplicant(id),
  ]).then(([person, visits, rounds]) => {
    wrap.innerHTML = '';
    if (!person) {
      wrap.appendChild(note('bad', 'That applicant could not be found.'));
      return;
    }

    if (flash) wrap.appendChild(note('good', flash));

    wrap.appendChild(el('div', { style: 'display:flex;align-items:center;gap:16px' }, [
      el('div', {}, [
        el('h1', { text: person.full_name }),
        el('p', { class: 'signin-sub',
                  text: `${person.reference} · ${person.district || 'district not recorded'}` }),
      ]),
      el('div', { style: 'margin-left:auto' }, [
        el('a', { href: '#/applicants', text: 'Back to applicants' }),
      ]),
    ]));

    const detail = (label, value) => el('div', { class: 'field' }, [
      el('label', { text: label }),
      el('div', { text: value || '—' }),
    ]);

    wrap.appendChild(el('div', { class: 'panel' }, [
      el('div', { class: 'panel-head' }, [el('h2', { text: 'Details' })]),
      el('div', { class: 'panel-body' }, [
        el('div', { class: 'row' }, [
          detail('National identity number', person.nin),
          detail('Date of birth', person.date_of_birth ? showDate(person.date_of_birth) : ''),
          detail('Sex', person.sex),
          detail('Telephone', person.phone),
        ]),
        detail('Address', person.address),
        person.notes ? detail('Notes', person.notes) : null,
      ]),
    ]));

    /* ---- home visits ---- */
    const visitPanel = el('div', { class: 'panel' }, [
      el('div', { class: 'panel-head' }, [
        el('h2', { text: 'Home visits' }),
        el('span', { class: 'sub', text: visits.length ? `${visits.length} recorded` : 'none yet' }),
        el('div', { style: 'margin-left:auto' }, [
          el('button', { class: 'btn', text: 'Record a home visit',
                         onclick: () => go('#/applicants/' + id + '/visit') }),
        ]),
      ]),
    ]);

    if (!visits.length) {
      visitPanel.appendChild(el('div', { class: 'empty' }, [
        el('p', { text: 'No home visit has been recorded for this applicant.' }),
      ]));
    } else {
      const body = el('tbody');
      for (const v of visits) {
        body.appendChild(el('tr', {}, [
          el('td', { text: showDate(v.visited_on) }),
          el('td', { text: v.visitor_name || '—' }),
          el('td', { text: v.household_size === null ? '—' : String(v.household_size) }),
          el('td', { text: v.findings || '—' }),
        ]));
      }
      visitPanel.appendChild(el('table', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Visited' }), el('th', { text: 'Assessor' }),
          el('th', { text: 'Household' }), el('th', { text: 'Findings' }),
        ])]),
        body,
      ]));
    }
    wrap.appendChild(visitPanel);

    /* ---- assessments ---- */
    const roundPanel = el('div', { class: 'panel' }, [
      el('div', { class: 'panel-head' }, [
        el('h2', { text: 'Assessments' }),
        el('span', { class: 'sub', text: 'the interview and its score' }),
      ]),
    ]);
    // What this person needs NEXT, as one obvious button.
    //
    // This panel used to offer "Start the interview" whatever state they were
    // in - so on somebody already assessed it invited you to create a second,
    // empty assessment, and the one action actually outstanding (sending the
    // finished outcome to HCIS) was buried on another screen behind a link
    // nobody could see was a link. The client designed that step with me and
    // still could not find it.
    const openDraft = rounds.find((r) => r.status === 'draft');
    const toSend = rounds.find((r) => r.status === 'completed'
                                   && !r.released_at && !r.published_at);

    function startButton(label) {
      const b = el('button', { class: 'btn', text: label });
      b.addEventListener('click', async () => {
        b.disabled = true;
        const was = b.textContent;
        b.textContent = 'Opening…';
        try {
          await startInterview(id, go);
        } catch (err) {
          b.disabled = false;
          b.textContent = was;
          wrap.insertBefore(note('bad', err.message), wrap.firstChild);
        }
      });
      return b;
    }

    const nextAction =
      openDraft
        ? el('button', { class: 'btn', text: `Continue the interview (${openDraft.answered} of 20)`,
                         onclick: () => go('#/interview/' + openDraft.id) })
        : toSend
          ? el('button', { class: 'btn', text: 'Send to HCIS',
                           onclick: () => go('#/interview/' + toSend.id) })
          // A renewal is a legitimate second assessment, so the button stays -
          // but it says what it would actually do.
          : startButton(rounds.length ? 'Start a new assessment' : 'Start the interview');

    roundPanel.querySelector('.panel-head').appendChild(
      el('div', { style: 'margin-left:auto' }, [nextAction]));

    if (!rounds.length) {
      roundPanel.appendChild(el('div', { class: 'empty' }, [
        el('p', { text: 'No assessment has been started for this applicant.' }),
      ]));
    } else {
      const body = el('tbody');
      for (const r of rounds) {
        const pill = r.status !== 'completed'
          ? el('span', { class: 'pill pill-warn', text: `Draft · ${r.answered} of 20` })
          : (r.released_at || r.published_at)
            ? el('span', { class: 'pill pill-good', text: 'Sent to HCIS' })
            : el('span', { class: 'pill pill-warn', text: 'Not sent to HCIS yet' });
        body.appendChild(el('tr', {}, [
          el('td', { class: 'ref' }, [
            el('a', { href: '#/interview/' + r.id, text: r.reference }),
          ]),
          el('td', { text: showDate(r.assessed_on) }),
          el('td', {}, [pill]),
          el('td', { text: r.percent === null ? '—' : r.percent + '%' }),
          el('td', { text: r.band || '—' }),
        ]));
      }
      roundPanel.appendChild(el('table', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Reference' }), el('th', { text: 'Date' }),
          el('th', { text: 'Status' }), el('th', { text: 'Score' }), el('th', { text: 'Outcome' }),
        ])]),
        body,
      ]));
    }
    wrap.appendChild(roundPanel);
  }).catch((err) => {
    wrap.innerHTML = '';
    wrap.appendChild(note('bad', err.message));
  });

  return wrap;
}

export function homeVisitView(applicantId, go) {
  const wrap = el('div', {}, [loading()]);

  api.applicants.get(applicantId).then((person) => {
    wrap.innerHTML = '';
    if (!person) {
      wrap.appendChild(note('bad', 'That applicant could not be found.'));
      return;
    }

    const me = api.currentUser();
    const today = new Date().toISOString().slice(0, 10);

    const fields = [
      field({ name: 'visited_on', label: 'Date of visit', type: 'date', required: true,
              value: today, max: today,
              check: (v) => (new Date(v) > new Date() ? 'A visit cannot be in the future.' : '') }),
      field({ name: 'visitor_name', label: 'Assessor', required: true, value: me ? me.name : '' }),
      field({ name: 'household_size', label: 'People living in the household', type: 'number',
              check: (v) => {
                const n = Number(v);
                if (!Number.isInteger(n) || n < 1) return 'That should be a whole number, 1 or more.';
                if (n > 30) return 'That looks too high — please check.';
                return '';
              } }),
      field({ name: 'findings', label: 'What the assessor found', type: 'textarea', rows: 6,
              required: true,
              hint: 'Living conditions, who is helping at present, anything affecting the interview.' }),
    ];

    const node = form(fields, async (values) => {
      values.applicant_id = applicantId;
      values.household_size = values.household_size ? Number(values.household_size) : null;
      await api.homeVisits.create(values);
      go('#/applicants/' + applicantId, { flash: 'Home visit recorded.' });
    }, 'Save home visit');

    wrap.appendChild(el('div', {}, [
      el('h1', { text: 'Record a home visit' }),
      el('p', { class: 'signin-sub', text: `${person.full_name} · ${person.reference}` }),
      el('div', { class: 'panel' }, [el('div', { class: 'panel-body' }, [node])]),
    ]));
  }).catch((err) => {
    wrap.innerHTML = '';
    wrap.appendChild(note('bad', err.message));
  });

  return wrap;
}

/**
 * Set a new password.
 *
 * Shown on its own, before anything else, when the account is still on the
 * temporary password it was created with. A temporary password that is never
 * changed is just a password that several people know.
 */
export function changePasswordView(onDone, forced) {
  const current = el('input', { type: 'password', id: 'cp_old', autocomplete: 'current-password' });
  const next = el('input', { type: 'password', id: 'cp_new', autocomplete: 'new-password' });
  const again = el('input', { type: 'password', id: 'cp_again', autocomplete: 'new-password' });
  const problem = el('div');
  const button = el('button', { class: 'btn', type: 'submit', text: 'Set new password' });

  const node = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      problem.innerHTML = '';

      if (next.value !== again.value) {
        problem.appendChild(note('bad', 'The two new passwords do not match.'));
        return;
      }
      if (next.value.length < 8) {
        problem.appendChild(note('bad', 'The new password must be at least 8 characters.'));
        return;
      }

      button.disabled = true;
      button.textContent = 'Saving…';
      try {
        await api.changePassword(current.value, next.value);
        onDone();
      } catch (err) {
        // The database's own wording - "Your current password is not correct."
        problem.appendChild(note('bad', err.message));
        button.disabled = false;
        button.textContent = 'Set new password';
      }
    },
  }, [
    problem,
    el('div', { class: 'field' }, [
      el('label', { for: 'cp_old', text: forced ? 'The temporary password you were given' : 'Current password' }),
      current,
    ]),
    el('div', { class: 'field' }, [
      el('label', { for: 'cp_new', text: 'New password' }),
      next,
      el('div', { class: 'hint', text: 'At least 8 characters, and different from the current one.' }),
    ]),
    el('div', { class: 'field' }, [
      el('label', { for: 'cp_again', text: 'New password again' }),
      again,
    ]),
    el('div', { class: 'actions' }, [button]),
  ]);

  return el('div', {}, [
    el('h1', { text: forced ? 'Choose your own password' : 'Change your password' }),
    forced
      ? note('info',
          'This account is still using the temporary password it was set up with. '
          + 'Please choose your own before going any further.')
      : null,
    el('div', { class: 'panel', style: 'max-width:520px' }, [
      el('div', { class: 'panel-body' }, [node]),
    ]),
  ]);
}

/* --------------------------------------------------------- the interview */

const SEVERITY_LABEL = {
  en: ['No problem', 'Moderate problem', 'Severe problem', 'Very severe or total'],
  kr: ['Napa problenm', 'Problenm modere', 'Problenm sever', 'Tre grav oubyen total'],
};

/**
 * The twenty questions.
 *
 * One question on screen at a time. An assessor is sitting in somebody's front
 * room reading these out loud, so the thing being asked has to be the biggest
 * thing on the page, and the answers have to be readable at arm's length.
 *
 * Every answer is saved the moment it is chosen. Nobody loses an interview
 * because a tablet went to sleep on question seventeen.
 */
export function interviewView(assessmentId, go) {
  const wrap = el('div', {}, [loading('Opening the interview…')]);

  Promise.all([
    api.interview.get(assessmentId),
    api.interview.answers(assessmentId),
    api.questions(),
  ]).then(([assessment, saved, bank]) => {
    if (!assessment) {
      wrap.innerHTML = '';
      wrap.appendChild(note('bad', 'That assessment could not be found.'));
      return;
    }

    let language = assessment.language || 'en';
    let index = 0;
    const answers = new Map();
    for (const a of saved) answers.set(a.question_number, a.severity);

    // Open on the first unanswered question rather than making somebody click
    // through the ones they have already done.
    const firstUnanswered = bank.findIndex((q) => !answers.has(q.number));
    index = firstUnanswered === -1 ? bank.length - 1 : firstUnanswered;

    api.applicants.get(assessment.applicant_id).then((person) => {
      render(person);
    });

    function render(person) {
      wrap.innerHTML = '';

      if (assessment.status === 'completed') {
        wrap.appendChild(completedPanel(assessment, person, go));
        return;
      }

      const q = bank[index];
      const chosen = answers.get(q.number);

      /* ---- heading ---- */
      wrap.appendChild(el('div', { style: 'display:flex;align-items:flex-start;gap:16px' }, [
        el('div', {}, [
          el('h1', { text: person ? person.full_name : 'Interview' }),
          el('p', { class: 'signin-sub',
                    text: `${assessment.reference} · ${answers.size} of ${bank.length} answered` }),
        ]),
        el('div', { style: 'margin-left:auto;display:flex;gap:8px;align-items:center' }, [
          el('span', { class: 'sub', style: 'color:var(--muted);font-size:12.5px', text: 'Language' }),
          languageToggle(),
        ]),
      ]));

      /* ---- progress ---- */
      const done = (answers.size / bank.length) * 100;
      wrap.appendChild(el('div', {
        style: 'height:6px;background:#e2e8f0;border-radius:99px;margin:14px 0 4px;overflow:hidden',
      }, [el('div', {
        style: `height:100%;width:${done}%;background:var(--brand);transition:width .2s`,
      })]));

      /* ---- the question ---- */
      const card = el('div', { class: 'panel' }, [
        el('div', { class: 'panel-head' }, [
          el('span', { class: 'pill pill-grey', text: q.group }),
          el('span', { class: 'sub', text: `Question ${q.number} of ${bank.length}` }),
        ]),
      ]);

      const body = el('div', { class: 'panel-body' });
      body.appendChild(el('h2', {
        style: 'font-size:20px;line-height:1.35;margin-bottom:4px',
        text: language === 'kr' ? q.kr : q.en,
      }));
      // The other language underneath, small. An assessor working in Kreol
      // still has to write the record in English, and switching back and forth
      // to check a word wastes their time.
      body.appendChild(el('p', {
        style: 'color:var(--muted);font-size:13.5px;margin:0 0 18px',
        text: language === 'kr' ? q.en : q.kr,
      }));

      for (const option of [...q.options].sort((a, b) => a.score - b.score)) {
        const text = language === 'kr' ? option.kr : option.en;
        const fallback = language === 'kr' && !option.kr;
        const isChosen = chosen === option.score;

        const button = el('button', {
          type: 'button',
          class: 'answer' + (isChosen ? ' answer-on' : ''),
          onclick: () => choose(q.number, option.score, person),
        }, [
          el('span', { class: 'answer-mark', text: String(option.score) }),
          el('span', {}, [
            el('span', { class: 'answer-text', text: text || option.en }),
            el('span', { class: 'answer-sev',
                         text: SEVERITY_LABEL[language][option.score]
                               || SEVERITY_LABEL.en[option.score] }),
            fallback
              ? el('span', { class: 'answer-warn',
                             text: 'Shown in English — the Kreol form has no wording for this answer yet.' })
              : null,
          ]),
        ]);
        body.appendChild(button);
      }
      card.appendChild(body);
      wrap.appendChild(card);

      /* ---- moving about ---- */
      const back = el('button', {
        class: 'btn-plain', text: '← Previous',
        disabled: index === 0,
        onclick: () => { index -= 1; render(person); },
      });
      const next = el('button', {
        class: 'btn-plain', text: 'Next →',
        disabled: index >= bank.length - 1,
        onclick: () => { index += 1; render(person); },
      });

      const finish = el('button', {
        class: 'btn',
        text: `Finish and score (${answers.size} of ${bank.length})`,
        disabled: answers.size < bank.length,
        onclick: () => go(`#/interview/${assessmentId}/finish`),
      });

      wrap.appendChild(el('div', {
        style: 'display:flex;gap:10px;align-items:center;margin-top:18px',
      }, [
        back, next,
        el('div', { style: 'margin-left:auto;display:flex;gap:10px' }, [
          el('a', { href: '#/applicants/' + assessment.applicant_id,
                    style: 'align-self:center;font-size:13.5px', text: 'Save and come back later' }),
          finish,
        ]),
      ]));

      if (answers.size < bank.length) {
        const missing = bank.filter((x) => !answers.has(x.number)).map((x) => x.number);
        wrap.appendChild(el('p', {
          style: 'color:var(--muted);font-size:13px;margin-top:10px',
          text: `Still to answer: ${missing.join(', ')}`,
        }));
      }
    }

    function languageToggle() {
      const group = el('div', { style: 'display:flex;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden' });
      for (const [code, label] of [['en', 'English'], ['kr', 'Kreol']]) {
        group.appendChild(el('button', {
          type: 'button',
          style: 'border:0;border-radius:0;padding:6px 12px;font-size:13px;'
               + (language === code ? 'background:var(--brand);color:#fff' : 'background:#fff;color:var(--ink)'),
          text: label,
          onclick: () => {
            if (language === code) return;
            language = code;
            api.interview.setLanguage(assessmentId, code).catch(() => {});
            api.applicants.get(assessment.applicant_id).then(render);
          },
        }));
      }
      return group;
    }

    async function choose(questionNumber, severity, person) {
      const previous = answers.get(questionNumber);
      answers.set(questionNumber, severity);   // show it immediately
      if (index < bank.length - 1) index += 1; // and move on
      render(person);

      try {
        await api.interview.answer(assessmentId, questionNumber, severity);
      } catch (err) {
        // Put it back the way it was rather than leaving the screen claiming
        // something was saved when it was not.
        if (previous === undefined) answers.delete(questionNumber);
        else answers.set(questionNumber, previous);
        render(person);
        wrap.insertBefore(note('bad', 'That answer was not saved: ' + err.message), wrap.firstChild);
      }
    }
  }).catch((err) => {
    wrap.innerHTML = '';
    wrap.appendChild(note('bad', err.message));
  });

  return wrap;
}

function completedPanel(assessment, person, go) {
  return el('div', {}, [
    note('good', 'This assessment is complete.'),
    el('h1', { text: person ? person.full_name : 'Assessment' }),
    el('p', { class: 'signin-sub', text: assessment.reference }),
    el('div', { class: 'panel' }, [
      el('div', { class: 'panel-body' }, [
        el('div', { class: 'row' }, [
          el('div', { class: 'field' }, [el('label', { text: 'Score' }),
            el('div', { style: 'font-size:28px;font-weight:680', text: assessment.percent + '%' })]),
          el('div', { class: 'field' }, [el('label', { text: 'Outcome' }),
            el('div', { style: 'font-size:18px;font-weight:600', text: assessment.band || '—' })]),
        ]),
        el('div', { class: 'row' }, [
          el('div', { class: 'field' }, [el('label', { text: 'Renewal' }),
            el('div', { text: assessment.renewal_months
              ? `every ${assessment.renewal_months} months — next due ${showDate(assessment.renewal_due)}`
              : '—' })]),
          el('div', { class: 'field' }, [el('label', { text: 'Sent to HCIS' }),
            el('div', { text: assessment.published_at ? showDate(assessment.published_at) : 'not yet' })]),
        ]),
        // Either the release box speaks, or the note does - never both. Two
        // messages about one decision, one red and one blue, read as a
        // contradiction even when they agree.
        assessment.published_at || assessment.released_at
          ? (assessment.publish_note ? note('info', assessment.publish_note) : null)
          : releaseBox(assessment, go),
      ]),
    ]),
    el('div', { class: 'actions' }, [
      el('a', { href: '#/applicants/' + assessment.applicant_id, text: 'Back to the applicant' }),
    ]),
  ]);
}

/**
 * The send-to-HCIS step.
 *
 * Deliberately a button somebody presses. For a new applicant this is the
 * moment they enter the benefits register, and that should be a decision
 * rather than something that happened while nobody was looking.
 */
function releaseBox(assessment, go) {
  const qualifies = assessment.hours !== 'none';
  const problem = el('div');
  const reason = el('textarea', {
    id: 'release_reason', rows: 2,
    placeholder: 'Why is this being sent? For example: appeal lodged by the family.',
  });

  const button = el('button', {
    class: 'btn',
    text: qualifies ? 'Send to HCIS' : 'Send to HCIS anyway',
  });
  button.addEventListener('click', async () => {
    problem.innerHTML = '';
    button.disabled = true;
    const was = button.textContent;
    button.textContent = 'Sending…';
    try {
      await api.releaseToHcis(assessment.id, reason.value);
      go('#/interview/' + assessment.id, { flash: 'Sent to HCIS.' });
    } catch (err) {
      problem.appendChild(note('bad', err.message));
      button.disabled = false;
      button.textContent = was;
    }
  });

  return el('div', { style: 'border-top:1px solid var(--line);margin-top:6px;padding-top:16px' }, [
    problem,
    qualifies
      ? note('info',
          'Sending this to HCIS passes the outcome to the payment side. If this '
          + 'person is not in HCIS yet it also registers them as a new application '
          + 'for an officer to approve.')
      : note('bad',
          'This scored ' + assessment.percent + '%, which is no home care, so it does '
          + 'not qualify. It stays on record here either way. Send it across only if '
          + 'there is a reason - an appeal, for instance - and write the reason down.'),
    qualifies ? null : el('div', { class: 'field' }, [
      el('label', { for: 'release_reason', text: 'Reason *' }),
      reason,
    ]),
    el('div', { class: 'actions' }, [button]),
  ]);
}

/**
 * Finishing: check the score, set the renewal period, commit.
 *
 * Shown before committing because completing is the moment the outcome leaves
 * the Health Department and becomes something HCIS acts on.
 */
export function finishInterviewView(assessmentId, go) {
  const wrap = el('div', {}, [loading()]);

  Promise.all([api.interview.get(assessmentId), api.interview.answers(assessmentId)])
    .then(async ([assessment, saved]) => {
      wrap.innerHTML = '';
      if (!assessment) {
        wrap.appendChild(note('bad', 'That assessment could not be found.'));
        return;
      }
      if (assessment.status === 'completed') {
        go(`#/interview/${assessmentId}`);
        return;
      }

      const person = await api.applicants.get(assessment.applicant_id);

      if (saved.length < 20) {
        wrap.appendChild(note('bad',
          `Only ${saved.length} of the 20 questions have been answered. All twenty are needed before this can be completed.`));
        wrap.appendChild(el('div', { class: 'actions' }, [
          el('button', { class: 'btn', text: 'Back to the interview',
                         onclick: () => go(`#/interview/${assessmentId}`) }),
        ]));
        return;
      }

      const months = el('select', { id: 'renewal' },
        [3, 5, 6, 12].map((m) => el('option', { value: String(m), text: `${m} months` })));
      months.value = String(assessment.renewal_months || 6);

      const problem = el('div');
      const button = el('button', { class: 'btn', text: 'Complete this assessment' });
      button.addEventListener('click', async () => {
        problem.innerHTML = '';
        button.disabled = true;
        button.textContent = 'Completing…';
        try {
          await api.interview.complete(assessmentId, Number(months.value));
          go(`#/interview/${assessmentId}`);
        } catch (err) {
          problem.appendChild(note('bad', err.message));
          button.disabled = false;
          button.textContent = 'Complete this assessment';
        }
      });

      wrap.appendChild(el('div', {}, [
        el('h1', { text: 'Finish the assessment' }),
        el('p', { class: 'signin-sub',
                  text: `${person ? person.full_name : ''} · ${assessment.reference}` }),
        el('div', { class: 'panel' }, [
          el('div', { class: 'panel-body' }, [
            problem,
            el('div', { class: 'cards' }, [
              el('div', { class: 'card' }, [
                el('div', { class: 'n', text: assessment.percent + '%' }),
                el('div', { class: 'l', text: 'Score' }),
              ]),
              el('div', { class: 'card' }, [
                el('div', { class: 'n', style: 'font-size:17px;line-height:1.3',
                            text: assessment.band || '—' }),
                el('div', { class: 'l', text: 'Outcome' }),
              ]),
              el('div', { class: 'card' }, [
                el('div', { class: 'n', text: `${assessment.raw_score}/${assessment.max_score}` }),
                el('div', { class: 'l', text: 'Raw total' }),
              ]),
            ]),
            el('div', { class: 'field', style: 'margin-top:20px;max-width:240px' }, [
              el('label', { for: 'renewal', text: 'Reassess this person every' }),
              months,
            ]),
            note('info',
              'Once completed this cannot be edited, and the outcome becomes visible to HCIS '
              + 'so the payment side can act on it. The interview answers do not go with it.'),
            el('div', { class: 'actions' }, [
              button,
              el('a', { href: `#/interview/${assessmentId}`, style: 'align-self:center',
                        text: 'Go back and check an answer' }),
            ]),
          ]),
        ]),
      ]));
    })
    .catch((err) => {
      wrap.innerHTML = '';
      wrap.appendChild(note('bad', err.message));
    });

  return wrap;
}

/** Start an interview from the applicant screen. */
export async function startInterview(applicantId, go) {
  const created = await api.interview.create(applicantId, 'en');
  go(`#/interview/${created.id}`);
}
