import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight, ChevronLeft, User, CalendarDays, Utensils, ShieldCheck,
  Plus, Trash2, Check, X, Phone, Loader2, Send, Sun, Sunset, Moon,
  Pencil, AlertTriangle, Soup, IceCream, Wine, Sparkles, Users, Power,
} from "lucide-react";
import {
  loadStaffRoster, addStaff, setStaffActive, setStaffAccessRole, removeStaff,
  loadMenuItems, saveMenuItem, deleteMenuItem, publishMenu,
  loadScheduleDraft, saveScheduleDraft, publishScheduleRows,
  normPhone,
} from "../lib/shiftcrew";

// ─────────────────────────────────────────────────────────────────────────────
// Manage — role-gated management screens inside the SAME no-password team app.
// A staff member's access_role (set by the owner / an admin) unlocks exactly the
// management surface their role describes:
//   • admin        → staff roster (add / suspend / remove, set access roles)
//   • scheduler    → build & publish the weekly schedule
//   • menu_manager → edit the menu, dishes and the questions derived from them
// All writes go to the isolated shiftcrew_owner schema via the anon client (which
// holds the needed DML + publish RPCs). No new account is ever created and the
// ShiftMatch `public` schema is never touched.
// ─────────────────────────────────────────────────────────────────────────────

const CARD = "bg-[#16181c] border border-[#22252b] rounded-3xl shadow-[0_2px_14px_rgba(30,25,70,0.05)]";

export const ACCESS_ROLES = [
  { key: "waiter",       label: "מלצר/ית",       desc: "לימוד תפריט, סידור וזמינות אישיים — בלי הרשאות ניהול", Icon: User,        color: "#8a8aa0", bg: "#1c1e22", bd: "#2a2d34" },
  { key: "scheduler",    label: "אחראי/ת סידור", desc: "בונה ומפרסם/ת את הסידור השבועי לכל הצוות",            Icon: CalendarDays, color: "#6d5efc", bg: "#241f3a", bd: "#6d5efc" },
  { key: "menu_manager", label: "אחראי/ת תפריט", desc: "עורך/ת את התפריט, המנות והשאלות עליהן",               Icon: Utensils,     color: "#ea7317", bg: "#2a2114", bd: "#ea7317" },
  { key: "admin",        label: "מנהל/ת",        desc: "מוסיף/ה ומסיר/ה אנשי צוות ומשנה הרשאות",             Icon: ShieldCheck,  color: "#22c08c", bg: "#15302b", bd: "#22c08c" },
];
export const accessRoleMeta = (k) => ACCESS_ROLES.find((r) => r.key === k) || ACCESS_ROLES[0];
export const canManage = (accessRole) => ["admin", "scheduler", "menu_manager"].includes(accessRole);

// Which panel each access role unlocks.
const PANEL_FOR = { admin: "staff", scheduler: "schedule", menu_manager: "menu" };

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const DAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const SHIFTS = {
  morning: { label: "בוקר", from: "09:00", to: "16:00", icon: Sun },
  evening: { label: "ערב",  from: "16:00", to: "23:00", icon: Sunset },
  night:   { label: "לילה", from: "22:00", to: "03:00", icon: Moon },
};
const CATS = {
  starters: { label: "ראשונות",        icon: Soup },
  mains:    { label: "עיקריות",         icon: Utensils },
  desserts: { label: "קינוחים",          icon: IceCream },
  drinks:   { label: "קוקטיילים ויין",  icon: Wine },
};
const ALLERGENS = ["גלוטן", "חלב", "ביצים", "אגוזים", "בוטנים", "דגים", "רכיכות", "סויה", "שומשום", "סולפיטים"];

const AVATAR_COLORS = ["#22c08c", "#ff7a59", "#e0315a", "#f3a712", "#3a86ff", "#6d5efc", "#9b7bff", "#1aa376"];
function colorForName(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name) { return String(name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2); }

function isoDate(d) {
  const z = new Date(d);
  z.setMinutes(z.getMinutes() - z.getTimezoneOffset());
  return z.toISOString().slice(0, 10);
}
function weekStartDate(ref = new Date()) {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}
const WEEK_START = weekStartDate();
const WEEK_ISO = isoDate(WEEK_START);

// ── Header shared by every management panel ───────────────────────────────────
function ManageHeader({ title, onBack }) {
  return (
    <div className="bg-[#0c0d10] px-4 pt-6 pb-3 flex items-center gap-3 sticky top-0 z-10">
      <button onClick={onBack} className="w-9 h-9 rounded-xl bg-[#16181c] border border-[#22252b] flex items-center justify-center text-[#8a8aa0] active:bg-[#1c1e22] shadow-sm">
        <ChevronRight size={18} />
      </button>
      <span className="text-lg font-black text-[#eef0f6]">{title}</span>
    </div>
  );
}

// ── Entry router ──────────────────────────────────────────────────────────────
export default function ManageScreen({ waiter, onBack }) {
  const accessRole = waiter?.accessRole || "waiter";
  const restId = waiter?.restaurantId ?? waiter?.restaurant_id ?? null;
  const panel = PANEL_FOR[accessRole] || null;

  if (panel === "staff")    return <AdminStaffPanel restId={restId} onBack={onBack} />;
  if (panel === "schedule") return <SchedulerPanel restId={restId} onBack={onBack} />;
  if (panel === "menu")     return <MenuManagerPanel restId={restId} onBack={onBack} />;

  // No management role — shouldn't be reachable (the entry is gated), but be safe.
  return (
    <>
      <ManageHeader title="ניהול" onBack={onBack} />
      <div className="flex-1 flex items-center justify-center px-8 text-center">
        <p className="text-sm font-bold text-[#8a8aa0]">אין לך הרשאות ניהול. פנה/י למנהל/ת המסעדה.</p>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — staff roster
// ═══════════════════════════════════════════════════════════════════════════════
function AdminStaffPanel({ restId, onBack }) {
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("מלצר/ית");
  const [accessRole, setAccessRole] = useState("waiter");
  const [editRoleFor, setEditRoleFor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const reload = () => loadStaffRoster(restId).then(setRows);
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [restId]);

  const canAdd = name.trim() && normPhone(phone).length >= 9 && !busy;

  const submitAdd = async () => {
    if (!canAdd) return;
    setBusy(true); setErr("");
    try {
      await addStaff(restId, { name, phone, role, accessRole });
      setName(""); setPhone(""); setRole("מלצר/ית"); setAccessRole("waiter");
      setAdding(false);
      await reload();
    } catch (e) {
      console.error(e);
      setErr(String(e?.message || "").includes("duplicate") ? "המספר כבר קיים בצוות" : "ההוספה נכשלה — נסה/י שוב");
    } finally { setBusy(false); }
  };

  const toggleActive = async (s) => {
    setRows((p) => p.map((r) => r.id === s.id ? { ...r, active: !r.active } : r));
    try { await setStaffActive(s.id, !s.active); } catch { reload(); }
  };
  const changeRole = async (s, key) => {
    setRows((p) => p.map((r) => r.id === s.id ? { ...r, access_role: key } : r));
    setEditRoleFor(null);
    try { await setStaffAccessRole(s.id, key); } catch { reload(); }
  };
  const remove = async (s) => {
    setRows((p) => p.filter((r) => r.id !== s.id));
    try { await removeStaff(s.id); } catch { reload(); }
  };

  return (
    <>
      <ManageHeader title="ניהול צוות" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <p className="text-xs font-semibold text-[#8a8aa0] leading-relaxed">
          הוסף/הסר אנשי צוות וקבע את ההרשאות שלהם. כל מי שמופיע כאן יכול להיכנס לאפליקציית הצוות עם מספר הטלפון שלו.
        </p>

        {!adding ? (
          <button onClick={() => setAdding(true)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm bg-[#6d5efc] text-white active:bg-[#5b4ef0] shadow-[0_6px_18px_rgba(109,94,252,0.35)]">
            <Plus size={18} /> הוספת איש/אשת צוות
          </button>
        ) : (
          <div className={`${CARD} p-4 space-y-3`}>
            <Field label="שם מלא">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: דנה כהן"
                className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-right placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#6d5efc]" />
            </Field>
            <Field label="טלפון">
              <div className="flex items-center gap-2 bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 focus-within:border-[#6d5efc]">
                <Phone size={16} className="text-[#8a8aa0] flex-shrink-0" />
                <input type="tel" inputMode="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050-1234567"
                  className="w-full bg-transparent py-3 text-sm font-bold text-[#eef0f6] text-left placeholder:text-[#b4b4c4] focus:outline-none" />
              </div>
            </Field>
            <Field label="תפקיד (תיאור חופשי)">
              <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="מלצר/ית"
                className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-right placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#6d5efc]" />
            </Field>
            <Field label="הרשאות באפליקציה">
              <RolePicker value={accessRole} onChange={setAccessRole} />
            </Field>
            {err && <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5"><AlertTriangle size={14} /> {err}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setAdding(false); setErr(""); }}
                className="flex-1 py-3 rounded-2xl font-bold text-sm bg-[#0c0d10] border border-[#22252b] text-[#c4c4d4] active:bg-[#1c1e22]">
                ביטול
              </button>
              <button onClick={submitAdd} disabled={!canAdd}
                className={`flex-1 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-1.5 ${canAdd ? "bg-[#6d5efc] text-white active:bg-[#5b4ef0]" : "bg-[#22252b] text-[#b4b4c4]"}`}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <><Check size={16} /> הוספה</>}
              </button>
            </div>
          </div>
        )}

        {rows === null ? (
          <div className={`${CARD} p-6 text-center`}><p className="text-sm font-bold text-[#8a8aa0]">טוען צוות…</p></div>
        ) : rows.length === 0 ? (
          <div className={`${CARD} p-8 text-center`}>
            <Users size={30} className="mx-auto text-[#c4c4d4] mb-2" />
            <p className="text-sm font-black text-[#c4c4d4]">אין עדיין אנשי צוות</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((s) => {
              const meta = accessRoleMeta(s.access_role);
              return (
                <div key={s.id} className={`${CARD} p-3.5`}>
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
                      style={{ background: s.active ? colorForName(s.name) : "#3a3d44" }}>
                      {initials(s.name)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-black truncate ${s.active ? "text-[#eef0f6]" : "text-[#8a8aa0]"}`}>{s.name}</p>
                      <p className="text-xs text-[#8a8aa0] font-semibold" dir="ltr">{s.phone}</p>
                    </div>
                    <button onClick={() => setEditRoleFor(editRoleFor === s.id ? null : s.id)}
                      className="text-[11px] font-bold px-2.5 py-1.5 rounded-xl flex items-center gap-1 flex-shrink-0"
                      style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.bd}` }}>
                      <meta.Icon size={12} /> {meta.label}
                    </button>
                  </div>

                  {editRoleFor === s.id && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {ACCESS_ROLES.map((r) => {
                        const on = s.access_role === r.key;
                        return (
                          <button key={r.key} onClick={() => changeRole(s, r.key)}
                            className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-right transition-colors"
                            style={{ background: on ? r.bg : "#0c0d10", border: `1px solid ${on ? r.bd : "#22252b"}` }}>
                            <r.Icon size={14} style={{ color: on ? r.color : "#8a8aa0" }} className="flex-shrink-0" />
                            <span className="text-[11px] font-bold leading-tight" style={{ color: on ? r.color : "#c4c4d4" }}>{r.label}</span>
                            {on && <Check size={13} style={{ color: r.color }} className="mr-auto flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex gap-2 mt-3">
                    <button onClick={() => toggleActive(s)}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold rounded-xl py-2 ${s.active ? "bg-[#33290f] text-[#f3c14b] active:bg-[#2a210c]" : "bg-[#15302b] text-[#22c08c] active:bg-[#11261f]"}`}>
                      <Power size={13} /> {s.active ? "השעיה" : "הפעלה"}
                    </button>
                    <button onClick={() => remove(s)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-[#e0315a] bg-[#3a1d22] rounded-xl py-2 active:bg-[#2a1721]">
                      <Trash2 size={13} /> הסרה
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <p className="text-[12px] font-bold text-[#8a8aa0] mb-1.5 px-1">{label}</p>
      {children}
    </div>
  );
}

function RolePicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {ACCESS_ROLES.map((r) => {
        const on = value === r.key;
        return (
          <button key={r.key} type="button" onClick={() => onChange(r.key)}
            className="flex items-center gap-2 px-2.5 py-2.5 rounded-xl text-right transition-colors"
            style={{ background: on ? r.bg : "#0c0d10", border: `1px solid ${on ? r.bd : "#22252b"}` }}>
            <r.Icon size={15} style={{ color: on ? r.color : "#8a8aa0" }} className="flex-shrink-0" />
            <span className="text-[12px] font-bold leading-tight" style={{ color: on ? r.color : "#c4c4d4" }}>{r.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MENU MANAGER — edit dishes + publish
// ═══════════════════════════════════════════════════════════════════════════════
const emptyDish = { id: null, category: "mains", name: "", price: "", description: "", ingredients: [], allergens: [], is_special: false };

function MenuManagerPanel({ restId, onBack }) {
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null); // dish object or null
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  const reload = () => loadMenuItems(restId).then(setItems);
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [restId]);

  const onSaved = async (dish) => {
    try {
      await saveMenuItem(restId, dish);
      setEditing(null); setPublished(false);
      await reload();
    } catch (e) { console.error(e); }
  };
  const onDelete = async (id) => {
    setItems((p) => p.filter((x) => x.id !== id));
    setPublished(false);
    try { await deleteMenuItem(id); } catch { reload(); }
  };
  const doPublish = async () => {
    setPublishing(true);
    try { await publishMenu(restId); setPublished(true); }
    catch (e) { console.error(e); }
    finally { setPublishing(false); }
  };

  if (editing) return <DishEditor restId={restId} dish={editing} onCancel={() => setEditing(null)} onSave={onSaved} onBack={onBack} />;

  const grouped = Object.keys(CATS).map((k) => ({ key: k, ...CATS[k], list: (items || []).filter((i) => (CATS[i.category] ? i.category : "mains") === k) }));

  return (
    <>
      <ManageHeader title="ניהול תפריט" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <p className="text-xs font-semibold text-[#8a8aa0] leading-relaxed">
          ערוך/י את המנות, המרכיבים והאלרגנים. השאלות בלימוד והחידון נבנות אוטומטית מהפרטים האלה. בסיום — פרסם/י לצוות.
        </p>

        <div className="flex gap-2">
          <button onClick={() => setEditing(emptyDish)}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm bg-[#16181c] border border-[#22252b] text-[#eef0f6] active:bg-[#1c1e22]">
            <Plus size={18} className="text-[#ea7317]" /> מנה חדשה
          </button>
          <button onClick={doPublish} disabled={publishing || !(items && items.length)}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm ${published ? "bg-[#15302b] text-[#22c08c]" : (items && items.length) ? "bg-[#6d5efc] text-white active:bg-[#5b4ef0] shadow-[0_6px_18px_rgba(109,94,252,0.35)]" : "bg-[#22252b] text-[#b4b4c4]"}`}>
            {publishing ? <Loader2 size={16} className="animate-spin" /> : published ? <><Check size={16} /> פורסם</> : <><Send size={16} /> פרסום לצוות</>}
          </button>
        </div>

        {items === null ? (
          <div className={`${CARD} p-6 text-center`}><p className="text-sm font-bold text-[#8a8aa0]">טוען תפריט…</p></div>
        ) : items.length === 0 ? (
          <div className={`${CARD} p-8 text-center`}>
            <Utensils size={30} className="mx-auto text-[#c4c4d4] mb-2" />
            <p className="text-sm font-black text-[#c4c4d4]">התפריט ריק</p>
            <p className="text-xs text-[#8a8aa0] font-semibold mt-1">הוסף/י מנה ראשונה כדי להתחיל</p>
          </div>
        ) : (
          grouped.map((g) => g.list.length === 0 ? null : (
            <div key={g.key}>
              <p className="text-xs font-bold text-[#8a8aa0] mb-2 flex items-center gap-1.5"><g.icon size={13} /> {g.label} · {g.list.length}</p>
              <div className="space-y-2.5">
                {g.list.map((it) => (
                  <div key={it.id} className={`${CARD} p-3.5`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-[#eef0f6] truncate">{it.name}</p>
                          {it.is_special && <span className="text-[10px] font-bold text-[#22c08c] bg-[#15302b] px-2 py-0.5 rounded-md flex items-center gap-0.5"><Sparkles size={10} /> מנת היום</span>}
                        </div>
                        {it.description && <p className="text-xs text-[#8a8aa0] font-semibold mt-0.5 line-clamp-2">{it.description}</p>}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {(it.allergens || []).slice(0, 4).map((a) => <span key={a} className="text-[10px] font-bold text-[#e0315a] bg-[#3a1d22] px-1.5 py-0.5 rounded">{a}</span>)}
                        </div>
                      </div>
                      <span className="text-sm font-black text-[#ea7317] flex-shrink-0">₪{Number(it.price)}</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => setEditing({ ...emptyDish, ...it, price: String(it.price ?? ""), ingredients: it.ingredients || [], allergens: it.allergens || [] })}
                        className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-[#6d5efc] bg-[#0c0d10] rounded-xl py-2 active:bg-[#1c1e22]">
                        <Pencil size={13} /> עריכה
                      </button>
                      <button onClick={() => onDelete(it.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-[#e0315a] bg-[#3a1d22] rounded-xl py-2 active:bg-[#2a1721]">
                        <Trash2 size={13} /> מחיקה
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function DishEditor({ dish, onCancel, onSave, onBack }) {
  const [d, setD] = useState(dish);
  const [ingText, setIngText] = useState((dish.ingredients || []).join(", "));
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setD((p) => ({ ...p, [k]: v }));
  const toggleAllergen = (a) => set("allergens", d.allergens.includes(a) ? d.allergens.filter((x) => x !== a) : [...d.allergens, a]);
  const canSave = d.name.trim() && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    const ingredients = ingText.split(",").map((s) => s.trim()).filter(Boolean);
    await onSave({ ...d, ingredients, price: Number(d.price) || 0 });
    setBusy(false);
  };

  return (
    <>
      <ManageHeader title={dish.id ? "עריכת מנה" : "מנה חדשה"} onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        <Field label="שם המנה">
          <input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="לדוגמה: סלט קיסר"
            className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-right placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#ea7317]" />
        </Field>

        <Field label="קטגוריה">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(CATS).map(([k, c]) => {
              const on = d.category === k;
              return (
                <button key={k} type="button" onClick={() => set("category", k)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-right ${on ? "bg-[#2a2114] border border-[#ea7317] text-[#ea7317]" : "bg-[#0c0d10] border border-[#22252b] text-[#c4c4d4]"}`}>
                  <c.icon size={15} /> <span className="text-[12px] font-bold">{c.label}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="מחיר (₪)">
            <input type="number" inputMode="decimal" value={d.price} onChange={(e) => set("price", e.target.value)} placeholder="0" dir="ltr"
              className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-left placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#ea7317]" />
          </Field>
          <Field label="מנת היום?">
            <button type="button" onClick={() => set("is_special", !d.is_special)}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold ${d.is_special ? "bg-[#15302b] text-[#22c08c] border border-[#22c08c]" : "bg-[#0c0d10] border border-[#22252b] text-[#c4c4d4]"}`}>
              {d.is_special ? <><Check size={16} /> מסומנת</> : <><Sparkles size={16} /> לא</>}
            </button>
          </Field>
        </div>

        <Field label="תיאור">
          <textarea value={d.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="תיאור קצר של המנה"
            className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-semibold text-[#eef0f6] text-right placeholder:text-[#b4b4c4] resize-none focus:outline-none focus:border-[#ea7317]" />
        </Field>

        <Field label="מרכיבים (מופרדים בפסיק)">
          <input value={ingText} onChange={(e) => setIngText(e.target.value)} placeholder="חסה, פרמזן, קרוטונים, רוטב"
            className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-semibold text-[#eef0f6] text-right placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#ea7317]" />
        </Field>

        <Field label="אלרגנים">
          <div className="flex flex-wrap gap-2">
            {ALLERGENS.map((a) => {
              const on = d.allergens.includes(a);
              return (
                <button key={a} type="button" onClick={() => toggleAllergen(a)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl ${on ? "bg-[#3a1d22] text-[#e0315a] border border-[#e0315a]" : "bg-[#0c0d10] border border-[#22252b] text-[#c4c4d4]"}`}>
                  {a}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="flex gap-2 pt-2 pb-6">
          <button onClick={onCancel} className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-[#0c0d10] border border-[#22252b] text-[#c4c4d4] active:bg-[#1c1e22]">ביטול</button>
          <button onClick={save} disabled={!canSave}
            className={`flex-1 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-1.5 ${canSave ? "bg-[#ea7317] text-white active:opacity-90" : "bg-[#22252b] text-[#b4b4c4]"}`}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <><Check size={16} /> שמירה</>}
          </button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULER — build & publish the weekly schedule
// ═══════════════════════════════════════════════════════════════════════════════
function SchedulerPanel({ restId, onBack }) {
  const [staff, setStaff] = useState([]);
  const [draft, setDraft] = useState([]); // [{ key, day, bucket, staffId, name }]
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(false);

  // pick form state
  const [day, setDay] = useState(0);
  const [bucket, setBucket] = useState("evening");
  const [staffId, setStaffId] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const [roster, sched] = await Promise.all([
        loadStaffRoster(restId),
        loadScheduleDraft(restId, WEEK_ISO),
      ]);
      if (!alive) return;
      const active = (roster || []).filter((s) => s.active);
      setStaff(active);
      if (active[0]) setStaffId(active[0].id);
      const saved = sched?.assignments?.teamRows;
      if (Array.isArray(saved)) setDraft(saved);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [restId]);

  const weekEnd = new Date(WEEK_START); weekEnd.setDate(weekEnd.getDate() + 6);
  const range = `${WEEK_START.getDate()}.${WEEK_START.getMonth() + 1} – ${weekEnd.getDate()}.${weekEnd.getMonth() + 1}`;

  const addRow = () => {
    const s = staff.find((x) => x.id === staffId);
    if (!s) return;
    const key = `${day}-${bucket}-${s.id}`;
    if (draft.some((r) => r.key === key)) return; // no dup
    setDraft((p) => [...p, { key, day, bucket, staffId: s.id, name: s.name, position: s.role || "מלצר/ית" }]);
    setPublished(false);
  };
  const removeRow = (key) => { setDraft((p) => p.filter((r) => r.key !== key)); setPublished(false); };

  const persist = (rows) => saveScheduleDraft(restId, WEEK_ISO, { teamRows: rows }).catch((e) => console.error(e));

  const saveNow = async () => {
    setSaving(true);
    try { await persist(draft); } finally { setSaving(false); }
  };

  const publish = async () => {
    setSaving(true);
    try {
      await persist(draft);
      const rows = draft.map((r) => {
        const sh = SHIFTS[r.bucket];
        return { day: r.day, label: sh.label, name: r.name, from: sh.from, to: sh.to, position: r.position, color: colorForName(r.name) };
      });
      await publishScheduleRows(restId, WEEK_ISO, rows);
      setPublished(true);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const byDay = useMemo(() => {
    const m = {};
    draft.forEach((r) => { (m[r.day] = m[r.day] || []).push(r); });
    return m;
  }, [draft]);

  if (loading) {
    return (<><ManageHeader title="בניית סידור" onBack={onBack} /><div className="flex-1 flex items-center justify-center"><Loader2 size={22} className="animate-spin text-[#6d5efc]" /></div></>);
  }

  return (
    <>
      <ManageHeader title="בניית סידור" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div className="flex items-center justify-center">
          <span className="text-sm font-black text-[#eef0f6] bg-[#16181c] border border-[#22252b] rounded-2xl px-4 py-2">{range}</span>
        </div>

        {staff.length === 0 ? (
          <div className={`${CARD} p-8 text-center`}>
            <Users size={30} className="mx-auto text-[#c4c4d4] mb-2" />
            <p className="text-sm font-black text-[#c4c4d4]">אין אנשי צוות פעילים לשיבוץ</p>
            <p className="text-xs text-[#8a8aa0] font-semibold mt-1">בקש/י ממנהל/ת להוסיף אנשי צוות</p>
          </div>
        ) : (
          <>
            {/* Add assignment */}
            <div className={`${CARD} p-4 space-y-3`}>
              <p className="text-xs font-bold text-[#8a8aa0]">שיבוץ חדש</p>
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_SHORT.map((ds, di) => (
                  <button key={di} onClick={() => setDay(di)}
                    className={`aspect-square rounded-xl text-xs font-bold ${day === di ? "bg-[#6d5efc] text-white" : "bg-[#0c0d10] border border-[#22252b] text-[#c4c4d4]"}`}>
                    {ds}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(SHIFTS).map(([k, s]) => (
                  <button key={k} onClick={() => setBucket(k)}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl ${bucket === k ? "bg-[#241f3a] border border-[#6d5efc] text-[#6d5efc]" : "bg-[#0c0d10] border border-[#22252b] text-[#c4c4d4]"}`}>
                    <s.icon size={16} />
                    <span className="text-[11px] font-bold">{s.label}</span>
                    <span className="text-[9px] font-semibold opacity-70" dir="ltr">{s.from}–{s.to}</span>
                  </button>
                ))}
              </div>
              <select value={staffId} onChange={(e) => setStaffId(e.target.value)}
                className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-right focus:outline-none focus:border-[#6d5efc]">
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role || "מלצר/ית"}</option>)}
              </select>
              <button onClick={addRow}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-sm bg-[#6d5efc] text-white active:bg-[#5b4ef0]">
                <Plus size={17} /> הוספה לסידור
              </button>
            </div>

            {/* Current draft grouped by day */}
            {draft.length === 0 ? (
              <div className={`${CARD} p-6 text-center`}>
                <CalendarDays size={28} className="mx-auto text-[#c4c4d4] mb-2" />
                <p className="text-sm font-bold text-[#c4c4d4]">עוד לא שובצו משמרות</p>
              </div>
            ) : (
              <div className="space-y-3">
                {DAYS.map((dname, di) => (byDay[di] || []).length === 0 ? null : (
                  <div key={di}>
                    <p className="text-xs font-bold text-[#8a8aa0] mb-2">{dname}</p>
                    <div className="space-y-2">
                      {byDay[di].map((r) => {
                        const sh = SHIFTS[r.bucket];
                        return (
                          <div key={r.key} className={`${CARD} p-3 flex items-center gap-3`}>
                            <span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0" style={{ background: colorForName(r.name) }}>
                              {initials(r.name)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-black text-[#eef0f6] truncate">{r.name}</p>
                              <p className="text-xs text-[#8a8aa0] font-semibold flex items-center gap-1">
                                <sh.icon size={12} /> {sh.label} · <span dir="ltr">{sh.from}–{sh.to}</span>
                              </p>
                            </div>
                            <button onClick={() => removeRow(r.key)} className="w-8 h-8 rounded-xl bg-[#3a1d22] flex items-center justify-center text-[#e0315a] active:bg-[#2a1721] flex-shrink-0">
                              <X size={15} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pb-6">
              <button onClick={saveNow} disabled={saving}
                className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-[#16181c] border border-[#22252b] text-[#c4c4d4] active:bg-[#1c1e22]">
                {saving ? "שומר…" : "שמירת טיוטה"}
              </button>
              <button onClick={publish} disabled={saving || draft.length === 0}
                className={`flex-1 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-1.5 ${published ? "bg-[#15302b] text-[#22c08c]" : draft.length ? "bg-[#6d5efc] text-white active:bg-[#5b4ef0] shadow-[0_6px_18px_rgba(109,94,252,0.35)]" : "bg-[#22252b] text-[#b4b4c4]"}`}>
                {published ? <><Check size={16} /> פורסם לצוות</> : <><Send size={16} /> פרסום הסידור</>}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
