// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(role) {
  document.getElementById('modal').classList.add('open');
  switchRole(role);
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    const focusId = role === 'company' ? 'coreg-legal-name' : 'creg-email';
    document.getElementById(focusId)?.focus();
  }, 50);
}
function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.body.style.overflow = '';
}
function handleOverlayClick(e) {
  if (e.target === document.getElementById('modal')) closeModal();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── Role switching ─────────────────────────────────────────────────────────────
function switchRole(role) {
  ['candidate','company'].forEach(r => {
    document.getElementById(`btn-${r}`).classList.toggle('active', r === role);
    document.getElementById(`tab-${r}`).classList.toggle('active', r === role);
  });
  document.getElementById('modal-title').textContent =
    role === 'candidate' ? 'Find your next role' : 'Start hiring fairly';
}

// ── Mode switching (register / login) ─────────────────────────────────────────
function switchMode(role, mode) {
  const tab = document.getElementById(`tab-${role}`);
  tab.querySelectorAll('.mode-btn').forEach((btn, i) => {
    btn.classList.toggle('active', (i === 0 && mode === 'register') || (i === 1 && mode === 'login'));
  });
  document.getElementById(`${role}-register`).style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById(`${role}-login`).style.display    = mode === 'login'    ? 'block' : 'none';
}

// ── API base ──────────────────────────────────────────────────────────────────
const API = 'http://localhost:3000/v1';

// ── Token storage ─────────────────────────────────────────────────────────────
// Stored in sessionStorage (cleared when tab closes).
// candidate-app.html and company-dashboard.html read from these keys on load.
function storeTokens(accessToken, refreshToken, role) {
  sessionStorage.setItem('fhp_access_token',  accessToken);
  sessionStorage.setItem('fhp_refresh_token', refreshToken);
  sessionStorage.setItem('fhp_role',          role);
}

// ── Shared fetch helper ───────────────────────────────────────────────────────
async function apiPost(path, body) {
  const res = await fetch(API + path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function showError(elId, msg, focusId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  if (!focusId) return;
  const target = document.getElementById(focusId);
  if (!target) return;
  target.focus();
  target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (target.type === 'checkbox') {
    const row = target.closest('.form-check');
    if (row) {
      row.style.transition = 'color 0.15s';
      row.style.color = 'var(--err, #e05)';
      setTimeout(() => { row.style.color = ''; }, 2000);
    }
    target.style.outline = '2px solid #e05';
    target.style.outlineOffset = '2px';
    setTimeout(() => { target.style.outline = ''; target.style.outlineOffset = ''; }, 2000);
  }
}
function hideError(elId) {
  const el = document.getElementById(elId);
  if (el) el.style.display = 'none';
}
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait...' : btn.dataset.label || btn.textContent;
}

// ── Candidate register ────────────────────────────────────────────────────────
async function handleCandidateRegister() {
  hideError('creg-error');
  const email    = document.getElementById('creg-email')?.value?.trim();
  const password = document.getElementById('creg-password')?.value;
  const ageOk    = document.getElementById('age-confirm')?.checked;
  const termsOk  = document.getElementById('terms-confirm')?.checked;

  if (!email)               { showError('creg-error', 'Email is required.', 'creg-email'); return; }
  if (!isValidEmail(email)) { showError('creg-error', 'Please enter a valid email address.', 'creg-email'); return; }
  if (!password)            { showError('creg-error', 'Password is required.', 'creg-password'); return; }
  if (password.length < 12) { showError('creg-error', 'Password must be at least 12 characters.', 'creg-password'); return; }
  if (!ageOk)               { showError('creg-error', 'You must confirm you are 18 or older.', 'age-confirm'); return; }
  if (!termsOk)             { showError('creg-error', 'You must accept the Terms of Service.', 'terms-confirm'); return; }

  setLoading('creg-btn', true);
  try {
    const data = await apiPost('/auth/register', {
      email,
      password,
      age_confirmed:  true,
      terms_accepted: true,
    });
    storeTokens(data.access_token, data.refresh_token, 'candidate');
    closeModal();
    window.location.href = 'candidate-app.html#profile';
  } catch (err) {
    showError('creg-error', err.message, 'creg-email');
  } finally {
    setLoading('creg-btn', false);
  }
}

// ── Candidate login ───────────────────────────────────────────────────────────
async function handleCandidateLogin() {
  hideError('clog-error');
  const email    = document.getElementById('clog-email')?.value?.trim();
  const password = document.getElementById('clog-password')?.value;

  if (!email)               { showError('clog-error', 'Email is required.', 'clog-email'); return; }
  if (!isValidEmail(email)) { showError('clog-error', 'Please enter a valid email address.', 'clog-email'); return; }
  if (!password)            { showError('clog-error', 'Password is required.', 'clog-password'); return; }

  setLoading('clog-btn', true);
  try {
    const data = await apiPost('/auth/login', { email, password });
    storeTokens(data.access_token, data.refresh_token, 'candidate');
    closeModal();
    window.location.href = 'candidate-app.html';
  } catch (err) {
    showError('clog-error', err.message || 'Invalid email or password.', 'clog-email');
  } finally {
    setLoading('clog-btn', false);
  }
}

// ── Company register ──────────────────────────────────────────────────────────
async function handleCompanyRegister() {
  hideError('coreg-error');
  const legalName   = document.getElementById('coreg-legal-name').value.trim();
  const jurisdiction = document.getElementById('coreg-jurisdiction').value;
  const email       = document.getElementById('coreg-email').value.trim();
  const password    = document.getElementById('coreg-password').value;
  const volume      = parseInt(document.getElementById('coreg-volume').value, 10);
  const compliance  = document.getElementById('compliance-confirm').checked;

  if (!legalName)           { showError('coreg-error', 'Legal company name is required.', 'coreg-legal-name'); return; }
  if (!email)               { showError('coreg-error', 'Compliance contact email is required.', 'coreg-email'); return; }
  if (!isValidEmail(email)) { showError('coreg-error', 'Please enter a valid email address.', 'coreg-email'); return; }
  if (!password)            { showError('coreg-error', 'Password is required.', 'coreg-password'); return; }
  if (password.length < 12) { showError('coreg-error', 'Password must be at least 12 characters.', 'coreg-password'); return; }
  if (!compliance)          { showError('coreg-error', 'You must accept the FHP Company Compliance Agreement.', 'compliance-confirm'); return; }

  const btn = document.getElementById('coreg-btn');
  btn.disabled = true;
  btn.textContent = 'Registering…';
  try {
    const data = await apiPost('/auth/register-company', {
      legal_name:                    legalName,
      jurisdiction,
      compliance_contact_email:      email,
      password,
      declared_monthly_roles:        volume,
      compliance_agreement_accepted: true,
    });
    storeTokens(data.access_token, data.refresh_token, 'company');
    closeModal();
    window.location.href = 'company-dashboard.html';
  } catch (err) {
    showError('coreg-error', err.message || 'Registration failed. Please try again.', 'coreg-email');
    btn.disabled = false;
    btn.textContent = 'Register company';
  }
}

// ── Company login ─────────────────────────────────────────────────────────────
async function handleCompanyLogin() {
  hideError('colog-error');
  const email    = document.getElementById('colog-email').value.trim();
  const password = document.getElementById('colog-password').value;

  if (!email)               { showError('colog-error', 'Email is required.', 'colog-email'); return; }
  if (!isValidEmail(email)) { showError('colog-error', 'Please enter a valid email address.', 'colog-email'); return; }
  if (!password)            { showError('colog-error', 'Password is required.', 'colog-password'); return; }

  const btn = document.getElementById('colog-btn');
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  try {
    const data = await apiPost('/auth/login-company', { email, password });
    storeTokens(data.access_token, data.refresh_token, 'company');
    closeModal();
    window.location.href = 'company-dashboard.html';
  } catch (err) {
    showError('colog-error', err.message || 'Invalid email or password.', 'colog-email');
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
}

// ── Nav scroll highlight ───────────────────────────────────────────────────────
const navEl = document.querySelector('nav');
window.addEventListener('scroll', () => {
  navEl.style.boxShadow = window.scrollY > 40 ? '0 2px 20px rgba(0,0,0,0.08)' : '';
});