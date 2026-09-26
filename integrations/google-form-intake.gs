/**
 * Hedgewise: send each new Google Form response into the client tracker.
 *
 * Setup (one time):
 *  1. Open your Google Form -> ⋮ (top right) -> Script editor (Apps Script).
 *  2. Replace everything there with this file.
 *  3. Fill in the three values below.
 *  4. Run `setup` once (Run button). Approve the permissions Google asks for.
 *  From then on every new response creates / updates the client in Hedgewise.
 *
 * Optional: run `sendAllExisting` once to backfill responses you already have.
 */

const SUPABASE_URL = "https://ueueajalybkbjbjubieo.supabase.co";
const SUPABASE_ANON_KEY = "PASTE_ANON_KEY";        // Supabase -> Project Settings -> API Keys -> anon / publishable
const INTAKE_SECRET = "PASTE_INTAKE_SECRET";        // SQL Editor: SELECT value FROM app_settings WHERE key = 'intake_secret';

// Form answer (lowercased, spaces/punctuation removed) -> Hedgewise offer key
const BOOK_KEYS = {
  fanduel: "fd-sb", draftkings: "dk-sb", espnbet: "tsb-sb", thescorebet: "tsb-sb", thescore: "tsb-sb",
  caesars: "czr-sb", betmgm: "mgm-sb", mgm: "mgm-sb", bet365: "365-sb", betrivers: "br-sb", betriver: "br-sb",
  fanatics: "fan-sb", hardrock: "hr-sb",
};

function setup() {
  const form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("onFormSubmit").forForm(form).onFormSubmit().create();
  Logger.log("Hedgewise intake is connected.");
}

function onFormSubmit(e) {
  send_(e.response);
}

function sendAllExisting() {
  FormApp.getActiveForm().getResponses().forEach(r => { try { send_(r); } catch (err) { Logger.log(err); } });
}

function send_(response) {
  const answers = {};
  let notRegistered = null, allBooks = [];
  response.getItemResponses().forEach(ir => {
    const item = ir.getItem();
    const title = item.getTitle().toLowerCase();
    const val = ir.getResponse();
    answers[title] = Array.isArray(val) ? val.join(", ") : String(val || "");
    if (title.indexOf("not registered") >= 0) {
      notRegistered = Array.isArray(val) ? val : String(val || "").split(",");
      try { allBooks = item.asCheckboxItem().getChoices().map(c => c.getValue()); } catch (x) {}
    }
  });
  const find = (...words) => {
    const k = Object.keys(answers).find(t => words.some(w => t.indexOf(w) >= 0));
    return k ? answers[k].trim() : "";
  };

  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const toKey = s => BOOK_KEYS[norm(s)];
  // Books offered on the form that they did NOT tick as "not registered" = already have an account.
  const notSet = new Set((notRegistered || []).map(norm));
  const already = allBooks.filter(b => !notSet.has(norm(b))).map(toKey).filter(Boolean);

  const address = find("address");
  const notes = [
    find("bank") && `Bank: ${find("bank")}`,
    find("zelle") && `Zelle: ${find("zelle")}`,
    find("travel") && `Traveling soon: ${find("travel")}`,
    `Intake form: ${Utilities.formatDate(response.getTimestamp(), "America/New_York", "yyyy-MM-dd")}`,
  ].filter(Boolean).join(" · ");

  const payload = {
    name: find("your name", "name"),
    phone: find("phone", "cell", "number"),
    email: response.getRespondentEmail ? (response.getRespondentEmail() || find("email")) : find("email"),
    state: stateOf_(address),
    referred_by: find("refer"),
    notes: notes,
    already_registered: notRegistered === null ? [] : already,
  };
  if (!payload.name) return;

  const res = UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/rpc/intake_submit`, {
    method: "post",
    contentType: "application/json",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    payload: JSON.stringify({ secret: INTAKE_SECRET, payload: payload }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error(`Hedgewise intake failed (${res.getResponseCode()}): ${res.getContentText()}`);
}

// State from the end of an address: "..., Arlington VA 22206" or "..., Virginia 22801"
function stateOf_(addr) {
  if (!addr) return "";
  const a = String(addr).toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const names = { "NEW JERSEY": "NJ", "PENNSYLVANIA": "PA", "WEST VIRGINIA": "WV", "VIRGINIA": "VA", "NORTH CAROLINA": "NC",
    "NEW YORK": "NY", "MASSACHUSETTS": "MA", "CONNECTICUT": "CT", "MARYLAND": "MD", "DELAWARE": "DE", "OHIO": "OH" };
  let m = a.match(/\b([A-Z]{2})\s+\d{5}(\s*\d{4})?$/);
  if (m) return m[1];
  for (const n in names) if (new RegExp("\\b" + n + "\\s*(\\d{5})?$").test(a)) return names[n];
  m = a.match(/\b(VA|NJ|PA|NC|NY|MA|MD|DC|WV|OH)$/);
  return m ? m[1] : "";
}
