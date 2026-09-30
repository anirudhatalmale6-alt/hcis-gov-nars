/**
 * Talking to the database.
 *
 * Everything goes through here so there is exactly one place that knows about
 * the token, and exactly one place to look when a request is refused.
 *
 * Note what this file does NOT do: it does not decide who may see what. The
 * database does that, and it would do it even if this file lied. What is here
 * is to keep an assessor from being shown a screen that cannot work.
 */

const API = '/rest/v1';
const TOKEN_KEY = 'nars.token';
const SESSION_KEY = 'nars.session';
const USER_KEY = 'nars.user';

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/* ------------------------------------------------------------- the session */

export function token() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function currentUser() {
  try { return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}

export function signedIn() {
  return Boolean(token() && currentUser());
}

/** The Health Department's own group. The database checks this too. */
export function isHealth() {
  const u = currentUser();
  return Boolean(u && u.user_group === 'Health');
}

function store(row) {
  sessionStorage.setItem(TOKEN_KEY, row.access_token);
  // The session token is a different thing from the signed token above. The
  // account functions - changing your own password - identify you by this one.
  sessionStorage.setItem(SESSION_KEY, row.token);
  sessionStorage.setItem(USER_KEY, JSON.stringify({
    display_id: row.display_id,
    username: row.username,
    email: row.email,
    name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username,
    role: row.role,
    user_group: row.user_group,
    expires_at: row.expires_at,
    must_change_password: row.must_change_password === true,
  }));
}

export function forget() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch { /* private browsing */ }
}

/**
 * Change your own password.
 *
 * The database asks for the current one as well, so a borrowed session cannot
 * be used to take the account over permanently. It returns the word "ok", or a
 * sentence explaining what was wrong - which is shown to the person as it
 * stands, because those sentences were written to be read.
 */
export async function changePassword(oldPassword, newPassword) {
  const session = sessionStorage.getItem(SESSION_KEY);
  const result = await request('/rpc/hcis_change_password', {
    method: 'POST',
    body: {
      p_token: session,
      p_old_password: oldPassword,
      p_new_password: newPassword,
    },
  });
  if (result !== 'ok') throw new ApiError(String(result), 400, null);

  // Changing it clears the flag in the database; keep what is on screen in
  // step, or the person is asked to change it again on the next page.
  const who = currentUser();
  if (who) {
    who.must_change_password = false;
    sessionStorage.setItem(USER_KEY, JSON.stringify(who));
  }
}

export function mustChangePassword() {
  const who = currentUser();
  return Boolean(who && who.must_change_password);
}

/* ------------------------------------------------------------- requests -- */

async function request(path, options = {}) {
  const headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
  const t = token();
  if (t) headers.Authorization = 'Bearer ' + t;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(API + path, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (e) {
    // A network failure is not a permission decision, and must not be shown
    // as one. This is the difference between "you may not" and "I could not
    // ask".
    throw new ApiError('Could not reach the server. Check the connection and try again.', 0, null);
  }

  // An eight-hour session ends mid-afternoon for somebody. Say so plainly
  // rather than showing an empty list.
  if (response.status === 401) {
    forget();
    throw new ApiError('Your session has ended. Please sign in again.', 401, null);
  }

  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }

  if (!response.ok) {
    // PostgREST puts the database's own message in "message". Those messages
    // were written to be read by a person - "This assessment has 12 of 20
    // questions answered" - so show them rather than a status code.
    const message = (body && body.message) || `The server refused that (${response.status}).`;
    throw new ApiError(message, response.status, body);
  }
  return body;
}

/* ------------------------------------------------------------- signing in */

export async function signIn(identifier, password) {
  // No token on this one: nobody has one yet.
  const response = await fetch(API + '/rpc/hcis_login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ p_identifier: identifier, p_password: password }),
  });

  if (!response.ok) throw new ApiError('Could not sign in. Please try again.', response.status, null);

  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : rows;

  // The login function returns NO rows for a wrong password AND for an unknown
  // account, deliberately, so this message must not distinguish them either.
  if (!row || !row.access_token) {
    throw new ApiError('That username or password was not recognised.', 401, null);
  }

  store(row);
  return currentUser();
}

export async function signOut() {
  forget();
}

/* ------------------------------------------------------------- the module */

export const applicants = {
  list(search) {
    let q = '/nars_applicants?select=*&order=registered_at.desc';
    if (search && search.trim()) {
      const safe = encodeURIComponent('*' + search.trim().replace(/[,()]/g, '') + '*');
      q += `&or=(full_name.ilike.${safe},reference.ilike.${safe},nin.ilike.${safe})`;
    }
    return request(q);
  },
  get(id) {
    return request(`/nars_applicants?select=*&id=eq.${encodeURIComponent(id)}`)
      .then((r) => (r && r[0]) || null);
  },
  create(record) {
    return request('/nars_applicants', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: record,
    }).then((r) => (Array.isArray(r) ? r[0] : r));
  },
  update(id, patch) {
    return request(`/nars_applicants?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: patch,
    }).then((r) => (Array.isArray(r) ? r[0] : r));
  },
};

export const homeVisits = {
  forApplicant(applicantId) {
    return request(
      `/nars_home_visits?select=*&applicant_id=eq.${encodeURIComponent(applicantId)}&order=visited_on.desc`
    );
  },
  create(record) {
    return request('/nars_home_visits', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: record,
    }).then((r) => (Array.isArray(r) ? r[0] : r));
  },
};

export const assessments = {
  forApplicant(applicantId) {
    return request(
      `/nars_assessments?select=*&applicant_id=eq.${encodeURIComponent(applicantId)}&order=assessed_on.desc`
    );
  },
};

export function summary() {
  return request('/rpc/nars_summary', { method: 'POST', body: {} })
    .then((r) => (Array.isArray(r) ? r[0] : r));
}

/* ------------------------------------------------------- the interview -- */

export const interview = {
  /** Start a new assessment for an applicant. */
  create(applicantId, language) {
    return request('/nars_assessments', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: { applicant_id: applicantId, language: language || 'en' },
    }).then((r) => (Array.isArray(r) ? r[0] : r));
  },

  get(id) {
    return request(`/nars_assessments?select=*&id=eq.${encodeURIComponent(id)}`)
      .then((r) => (r && r[0]) || null);
  },

  answers(assessmentId) {
    return request(
      `/nars_answers?select=question_number,severity&assessment_id=eq.${encodeURIComponent(assessmentId)}`
    );
  },

  /**
   * Record one answer.
   *
   * Upserted on (assessment, question) so changing your mind replaces the
   * answer rather than adding a second one. The database recalculates the
   * score itself, so the number on screen is never worked out here.
   */
  answer(assessmentId, questionNumber, severity) {
    return request('/nars_answers?on_conflict=assessment_id,question_number', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: {
        assessment_id: assessmentId,
        question_number: questionNumber,
        severity,
      },
    });
  },

  setLanguage(id, language) {
    return request(`/nars_assessments?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { language },
    });
  },

  /** Finish it. The database refuses unless all twenty are answered. */
  complete(id, renewalMonths) {
    return request(`/nars_assessments?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: { status: 'completed', renewal_months: renewalMonths },
    }).then((r) => (Array.isArray(r) ? r[0] : r));
  },
};

let questionBank = null;
export async function questions() {
  if (questionBank) return questionBank;
  const r = await fetch('/assets/questions.json');
  if (!r.ok) throw new ApiError('The question list could not be loaded.', r.status, null);
  const data = await r.json();
  questionBank = data.questions;
  return questionBank;
}

/**
 * Send a completed assessment to HCIS.
 *
 * For somebody already receiving care this just passes the outcome across. For
 * a new applicant it enters them into the benefits register as an application,
 * which is why a person presses this rather than it happening by itself.
 *
 * A score of 0 to 40 does not qualify, and the database refuses it without a
 * reason - normally an appeal.
 */
export async function releaseToHcis(assessmentId, reason) {
  const result = await request('/rpc/nars_release_to_hcis', {
    method: 'POST',
    body: { p_assessment: assessmentId, p_reason: reason || null },
  });
  if (result !== 'ok') throw new ApiError(String(result), 400, null);
}
