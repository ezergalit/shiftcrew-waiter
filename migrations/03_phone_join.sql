-- ============================================================================
-- 03: הצטרפות עובדים עם אימות טלפון (Twilio Verify) — 2026-08-30
--
-- 🔴 לא להחיל לפני שגוגל פליי מאשרת את שתי האפליקציות (הוראת יותם, 30.8).
-- הקובץ הזה + Edge Function ‏phone-join + הענף phone-join הם חבילה אחת;
-- סדר ההרצה המלא ב-PHONE-JOIN-ROLLOUT.md.
--
-- העיקרון: טלפון אחד = עובד אחד למסעדה. ההצטרפות דורשת קוד חד-פעמי
-- (וואטסאפ/SMS דרך Twilio Verify); הצטרפות חוזרת מאותו מספר מחזירה את אותו
-- פרופיל עם כל ההתקדמות. חסימה = שורה ב-phone_blocklist (מפעיל בלבד, ב-SQL).
-- הכל אדיטיבי: team_join הישן לא נגוע, והמסלול נדלק פר-מסעדה עם
-- features.phone_join = true.
--
-- ⚠️ דפוס ההרשאות (הלקח שחזר שלוש פעמים): הטלפונים יושבים בטבלה מבודדת
-- בלי שום GRANT — לא REVOKE על עמודה בטבלה שיש לה GRANT טבלתי (PostgreSQL
-- בודק את ה-table ACL קודם, ו-OwnerDashboard מושך select("*")).
-- ============================================================================

-- ---- 1. הטבלאות (אפס גישה ל-anon: בלי GRANT, ו-RLS דלוק בלי policies) ----

create table if not exists menu_app.team_member_phones (
  team_member_id uuid primary key references menu_app.team_members(id) on delete cascade,
  restaurant_id  uuid not null references menu_app.restaurants(id) on delete cascade,
  phone          text not null,                    -- E.164: ‎+9725XXXXXXXX
  verified_at    timestamptz not null default now()
);
-- טלפון אחד = עובד אחד למסעדה. זה גם מה שהופך הצטרפות חוזרת לשחזור פרופיל.
create unique index if not exists team_member_phones_rest_phone
  on menu_app.team_member_phones (restaurant_id, phone);

create table if not exists menu_app.phone_blocklist (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid references menu_app.restaurants(id) on delete cascade,  -- NULL = חסום בכל המסעדות
  phone         text not null,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists phone_blocklist_phone on menu_app.phone_blocklist (phone);

-- טוקן אימות חד-פעמי: ה-Edge Function כותבת שורה אחרי VerificationCheck מוצלח,
-- ו-team_join_v2 צורכת אותה. נשמר כ-sha256 — כמו app_sessions.
create table if not exists menu_app.phone_verifications (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);
create index if not exists phone_verifications_phone on menu_app.phone_verifications (phone);

-- יומן שליחות — המכסות של ההגנה מפני SMS pumping נבדקות מולו בצד השרת.
create table if not exists menu_app.phone_otp_sends (
  id      uuid primary key default gen_random_uuid(),
  phone   text not null,
  ip      text,
  sent_at timestamptz not null default now()
);
create index if not exists phone_otp_sends_phone_time on menu_app.phone_otp_sends (phone, sent_at);
create index if not exists phone_otp_sends_ip_time    on menu_app.phone_otp_sends (ip, sent_at);

-- "לגלות מאיפה הם": כל הצטרפות/שחזור/חסימה נרשמים עם IP ו-user-agent
-- (PostgREST מעביר אותם ב-request.headers). קריאה — מפעיל בלבד, ב-SQL.
create table if not exists menu_app.join_audit (
  id             uuid primary key default gen_random_uuid(),
  at             timestamptz not null default now(),
  restaurant_id  uuid,
  team_member_id uuid,
  action         text not null,       -- joined / reclaimed / blocked / need_verify / bad_token
  full_name      text,
  phone          text,
  ip             text,
  user_agent     text
);
create index if not exists join_audit_rest_time on menu_app.join_audit (restaurant_id, at);

alter table menu_app.team_member_phones  enable row level security;
alter table menu_app.phone_blocklist     enable row level security;
alter table menu_app.phone_verifications enable row level security;
alter table menu_app.phone_otp_sends     enable row level security;
alter table menu_app.join_audit          enable row level security;

-- ---- 2. עזרי שרת ----

-- ה-IP וה-user-agent של הבקשה הנוכחית, כפי ש-PostgREST מוסר אותם.
create or replace function menu_app._req_meta()
returns table (ip text, ua text)
language sql stable
set search_path to 'menu_app', 'pg_temp'
as $$
  select
    split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1),
    left(coalesce(current_setting('request.headers', true)::json ->> 'user-agent', ''), 300);
$$;

-- נרמול לוגיקה אחת בשרת: קלט ישראלי בלבד ⇒ ‎+9725XXXXXXXX, אחרת NULL.
-- (העתק של src/lib/phone.js — שינוי חייב לקרות בשניהם, כמו dishFlags.)
create or replace function menu_app._normalize_il_phone(p text)
returns text
language plpgsql immutable
set search_path to 'menu_app', 'pg_temp'
as $$
declare v text := regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g');
begin
  if v ~ '^\+9725[0-9]{8}$' then return v; end if;
  if v ~ '^9725[0-9]{8}$'  then return '+' || v; end if;
  if v ~ '^05[0-9]{8}$'    then return '+972' || substr(v, 2); end if;
  return null;
end $$;

-- ---- 3. ההצטרפות המאומתת ----
-- עוטפת את team_join הקיים (כל לוגיקת ה-fuzzy-match נשארת שם, לא משוכפלת):
-- שער טלפון לפני, קשירת טלפון ותיעוד אחרי. הטוקן נצרך רק על 'ok' — מסלול
-- ה-confirm (שאלת "זה אתה?") משאיר אותו בתוקף לקריאה החוזרת.
create or replace function menu_app.team_join_v2(
  p_team_code text, p_first text, p_last text,
  p_phone text, p_verify_token text,
  p_confirm_member uuid default null, p_force_new boolean default false
) returns jsonb
language plpgsql security definer
set search_path to 'menu_app', 'extensions', 'pg_temp'
as $$
declare
  v_phone  text := menu_app._normalize_il_phone(p_phone);
  v_rest   record;
  v_bound  record;
  v_ver    record;
  v_result jsonb;
  v_member uuid;
  v_token  text;
  v_meta   record;
begin
  select * into v_meta from menu_app._req_meta();

  if v_phone is null then
    return jsonb_build_object('status', 'bad_phone');
  end if;

  select id, name into v_rest from menu_app.restaurants
  where upper(team_code) = upper(btrim(coalesce(p_team_code, '')))
     or upper(coalesce(trainee_code, '')) = upper(btrim(coalesce(p_team_code, '')));
  if not found then
    return jsonb_build_object('status', 'bad_code');
  end if;

  -- חסימה — לפי מספר, של המסעדה או גלובלית. הודעה גנרית בצד הלקוח.
  if exists (select 1 from menu_app.phone_blocklist
             where phone = v_phone and (restaurant_id is null or restaurant_id = v_rest.id)) then
    insert into menu_app.join_audit (restaurant_id, action, full_name, phone, ip, user_agent)
    values (v_rest.id, 'blocked', btrim(p_first) || ' ' || btrim(p_last), v_phone, v_meta.ip, v_meta.ua);
    return jsonb_build_object('status', 'blocked');
  end if;

  -- המספר כבר קשור לעובד במסעדה הזו ⇒ שחזור פרופיל, בלי שאלות ניחוש-שמות.
  -- הטלפון הוא הזהות; השם שהוקלד עכשיו לא משנה את הפרופיל.
  select tmp.team_member_id into v_bound
  from menu_app.team_member_phones tmp
  join menu_app.team_members tm on tm.id = tmp.team_member_id
  where tmp.restaurant_id = v_rest.id and tmp.phone = v_phone;
  if found then
    -- גם השחזור דורש אימות טרי — אחרת ידיעת מספר של קולגה מספיקה להתחזות.
    select * into v_ver from menu_app.phone_verifications
    where token_hash = encode(extensions.digest(coalesce(p_verify_token, ''), 'sha256'), 'hex')
      and phone = v_phone and used_at is null and expires_at > now();
    if not found then
      return jsonb_build_object('status', 'need_verify');
    end if;
    update menu_app.phone_verifications set used_at = now() where id = v_ver.id;

    select jsonb_build_object(
      'status', 'ok', 'is_new', false, 'reclaimed', true,
      'token', menu_app._issue_session(v_rest.id, tm.id, 'team', null),
      'trainee', false,
      'member', jsonb_build_object('id', tm.id, 'name', tm.name,
        'first_name', tm.first_name, 'last_name', tm.last_name),
      'restaurant', jsonb_build_object('id', r.id, 'name', r.name,
        'description', r.description, 'cuisine_types', r.cuisine_types,
        'service_style', r.service_style, 'service_notes', r.service_notes,
        'welcome_video_url', r.welcome_video_url,
        'features', coalesce(r.features, '{}'::jsonb)))
    into v_result
    from menu_app.team_members tm, menu_app.restaurants r
    where tm.id = v_bound.team_member_id and r.id = v_rest.id;

    insert into menu_app.join_audit (restaurant_id, team_member_id, action, full_name, phone, ip, user_agent)
    values (v_rest.id, v_bound.team_member_id, 'reclaimed', null, v_phone, v_meta.ip, v_meta.ua);
    return v_result;
  end if;

  -- מספר חדש: הטוקן חייב להיות בתוקף. נבדק כאן, נצרך רק אחרי 'ok'.
  select * into v_ver from menu_app.phone_verifications
  where token_hash = encode(extensions.digest(coalesce(p_verify_token, ''), 'sha256'), 'hex')
    and phone = v_phone and used_at is null and expires_at > now();
  if not found then
    insert into menu_app.join_audit (restaurant_id, action, full_name, phone, ip, user_agent)
    values (v_rest.id, 'bad_token', btrim(p_first) || ' ' || btrim(p_last), v_phone, v_meta.ip, v_meta.ua);
    return jsonb_build_object('status', 'need_verify');
  end if;

  v_result := menu_app.team_join(p_team_code, p_first, p_last, p_confirm_member, p_force_new);

  if v_result ->> 'status' = 'ok' then
    update menu_app.phone_verifications set used_at = now() where id = v_ver.id;
    v_member := (v_result -> 'member' ->> 'id')::uuid;
    insert into menu_app.team_member_phones (team_member_id, restaurant_id, phone)
    values (v_member, v_rest.id, v_phone)
    on conflict (team_member_id) do update set phone = excluded.phone, verified_at = now();
    insert into menu_app.join_audit (restaurant_id, team_member_id, action, full_name, phone, ip, user_agent)
    values (v_rest.id, v_member, 'joined', v_result -> 'member' ->> 'name', v_phone, v_meta.ip, v_meta.ua);
  end if;

  return v_result;
end $$;

-- מצב ההצטרפות של קוד — בלי לטבוע session (בניגוד ל-team_preview) ובלי לחשוף
-- דבר מעבר לשם ולדגל. הלקוח שואל את זה אחרי הקלדת הקוד כדי לדעת אם להציג
-- את שלב הטלפון.
create or replace function menu_app.join_mode(p_team_code text)
returns jsonb
language sql stable security definer
set search_path to 'menu_app', 'pg_temp'
as $$
  select coalesce(
    (select jsonb_build_object('status', 'ok', 'name', name,
            'phone_join', coalesce((features ->> 'phone_join')::boolean, false))
     from menu_app.restaurants
     where upper(team_code) = upper(btrim(coalesce(p_team_code, '')))
        or upper(coalesce(trainee_code, '')) = upper(btrim(coalesce(p_team_code, '')))
     limit 1),
    jsonb_build_object('status', 'bad_code'));
$$;

grant execute on function menu_app.team_join_v2(text, text, text, text, text, uuid, boolean) to anon;
grant execute on function menu_app.join_mode(text) to anon;

-- ---- 4. תיעוד הצטרפות גם במסלול הישן (בונוס "מאיפה הם" לכל המסעדות) ----
-- מוחל בנפרד בעת ההרצה: עטיפת INSERT ל-join_audit בתוך team_join הקיים אינה
-- כלולה כאן בכוונה — נעשית כ-patch ידני כדי לא לגעת בפונקציה חיה לפני האישור.
