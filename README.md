# Aura ⚡ Daily Workspace & Analytics Tracker

**Aura** is a premium, distraction-free productivity dashboard designed to optimize daily performance, build consistent habits, and keep track of academic milestones. Aura combines a distraction-free frontend with a real-time, secured cloud backend powered by **Supabase** and **Resend**.

---

## 🚀 Key Features
- **Daily Grind & Habit Tracker**: Manage immediate goals and consistent habits with live streak indicators.
- **Academic Priority Queue**: Track upcoming submissions and exams sorted dynamically by due dates.
- **Midnight Rollover Sync Engine**: Automatically resets daily goals, resets failed habit streaks, logs performance snapshot scores, and records item consistency histories at the end of each day.
- **Performance Analytics**: Visual 7-day bar charts and a weekly calendar grid detailing habit/task consistency.
- **Automated Email Reminders**: Deno Edge Function fetches upcoming deadlines and sends alerts via the Resend API.
- **Secure Architecture**: Enforced Row Level Security (RLS) policies on PostgreSQL tables restricting all reads/writes to authenticated owners.

---

## 🛠️ Technology Stack
- **Frontend**: Pure HTML5 (Semantic Structure) & ES6+ Vanilla JavaScript.
- **Styling**: Universal CSS3 stylesheet employing custom property variables and CSS grid/flexbox responsive layouts.
- **Backend / Database**: Cloud PostgreSQL (Supabase) + Built-in Supabase Auth.
- **Email Notifications**: Supabase Edge Functions (Deno Runtime) + Resend Email API.

---

## 💻 Local Setup & Development

Aura is designed as a static client-side web application. It does not require any compile or build steps.

1. **Clone the repository**:
   ```bash
   git clone <repository_url>
   cd Aura-App
   ```

2. **Serve the project**:
   You can run a local development server using Python, Node.js, or any static file hosting tool:
   - **Using Node (npx)**:
     ```bash
     npx http-server -p 8000
     ```
   - **Using Python 3**:
     ```bash
     python -m http.server 8000
     ```
   - **Direct Access**:
     Alternatively, you can open `login.html` directly in your web browser using `file://` protocol.

3. **Configure API Keys**:
   - The application connects to Supabase via `static/js/script.js`.
   - By default, it uses live database handles. To point to your own clone, adjust `SUPABASE_URL` and `SUPABASE_KEY` values in `static/js/script.js`.

---

## 🗄️ Database Schema & RLS Setup

Database schema initialization resides in `supabase/migrations/20260705000000_init_schema.sql`.

### 1. Data Models
- **`tasks`**: Stores items (`daily`, `habit`, `deadline`) with IDs, text, categories, due dates, statuses, and streaks.
- **`user_preferences`**: Manages app state preferences per user such as `vacation_mode` and `last_checked_date` (for midnight rollover triggers).
- **`user_profiles`**: Holds academic metadata fields (`full_name`, `institution`, `bio`) updated via the Profile dashboard.
- **`macro_history`**: Aggregates daily completion percentages for daily/hobby tasks over the last 7 days.
- **`item_history`**: Tracks historical weekly logs for individual habits and dailies.
- **`developer_messages`**: Safe inbox collecting developer connect submissions.

### 2. Row Level Security (RLS)
Every user-facing table restricts access to ensure privacy. Policies validate transactions using the account's JWT metadata:
```sql
(auth.jwt() -> 'user_metadata' ->> 'username') = username
```
- Users are granted full control (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) over records tagged with their username.
- For signup resilience, `user_preferences` and `user_profiles` allow inserts for anonymous users.
- The `developer_messages` table is **insert-only** for public (anon) requests, and select-restricted to admin/service role credentials.

---

## ⚡ Email Reminders (Edge Function Setup)

The edge function resides in `supabase/functions/send-reminders/index.ts`.

### 1. Secure Execution Check
To prevent spam or external abuse, the Edge Function inspects the `Authorization` header, permitting requests only when signed with the service role key:
```typescript
const authHeader = req.headers.get('Authorization')
if (!authHeader || authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
}
```

### 2. Deployment
Deploy the edge function directly to your Supabase project:
```bash
# Log in to Supabase
supabase login

# Deploy the function
supabase functions deploy send-reminders
```

### 3. Configure Secrets
Set the environment variables in your Supabase dashboard or via CLI:
```bash
supabase secrets set RESEND_API_KEY="your-resend-api-key"
```

### 4. Scheduling with pg_cron
To automatically send alerts at midnight every day for tasks due in exactly 1 or 3 days, enable `pg_cron` and `pg_net` in Supabase, and schedule the HTTP request:

```sql
-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule daily cron execution
SELECT cron.schedule(
  'send-daily-reminders-job',
  '0 0 * * *', -- Everyday at 12:00 AM UTC
  $$
  SELECT net.http_post(
    url := 'https://your-project-ref.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer your-service-role-key-here'
    ),
    body := '{}'::jsonb
  );
  $$
);
```
*(Replace `your-project-ref` and `your-service-role-key-here` with your actual Supabase configurations. Note that service role keys are secure to store in database cron scripts as pg_cron runs locally in your isolated database instance).*
