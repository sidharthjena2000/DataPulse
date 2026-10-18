# DataPulse front end

Front end for **AI-Driven Data Element Discovery**: an AI layer on top of Databricks Unity Catalog metadata that recommends critical and monitored data elements and proposes data quality rules. It follows the four-step flow and the three extension ideas from the hackathon deck.

| Screen | Deck step | What it does |
| --- | --- | --- |
| Read | 1 Read | Browse tables, columns, tags, usage and lineage |
| Recommend | 2 Recommend | Critical / monitored elements with business reason, confidence and a transparent score breakdown |
| Propose rules | 3 Propose rules | Basic, Intermediate and Advanced rules per element, as Databricks SQL |
| Approve | 4 Approve | Accept or reject with a reason; decisions can be exported as JSON |
| Impact simulation | Extension | If this field fails, which dashboards, reports and tables break |
| Ask DataPulse | Extension | Natural-language questions such as "Which fields feed our regulatory report?" |

## Run it

No build step and no dependencies. Serve this folder (the sign-in page is `index.html`; the workspace is at `/app/`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

It deploys as a static site (for example on Vercel with this folder as the root directory).

## Status: prototype on sample data

- All metadata, lineage, assets and usage figures in `app/js/data.js` are **fictional sample data**.
- Scoring is deterministic: five weighted signals (regulatory use, downstream dependencies, usage, sensitivity, lineage reach) give a 0-100 criticality score. Critical is 60 or above, Monitored is 35 to 59. Confidence falls as a score nears a threshold.
- The chat answers by matching the question against the scored sample data. It is not a language model.
- Accept/reject decisions are kept in the browser's `localStorage` and can be exported. Nothing is sent anywhere.

## Run logs and DQ Copilot

- **Run logs** (`#/logs`): seven days of sample validation runs (every six hours) with rule validations, null-rate anomalies, freshness SLA breaches, schema drift and quarantines. Filter by level, type, table or text, export CSV, and see review activity. Each event has an **Ask Copilot** button.
- **DQ Copilot** (button at bottom right): a slide-out assistant grounded in the sample catalog and the latest run issues. It writes Great Expectations, PySpark and Databricks SQL in code blocks with a copy button, traces failures, and explains SQL errors.

The Copilot uses Gemini's free tier, in this order:

1. A key pasted under Copilot settings. It is kept in the browser's localStorage and sent only to Google.
2. The server proxy `api/chat.js`, which reads `GEMINI_API_KEY` (create a free key in Google AI Studio and add it under Vercel project settings, Environment Variables, then redeploy). `GEMINI_MODEL` optionally overrides the default `gemini-2.5-flash`.
3. Otherwise it answers locally from the sample metadata and says so.

Free-tier limits apply, and on the free tier Google may use prompts to improve its products, so do not send real customer data. The context sent is sample data only.

## Connecting a backend later

`app/js/data.js` is the only file that knows where data comes from. A backend would return the same shapes (`tables`, `lineage`, `assets`, per-element scores and rule proposals), and the views render whatever `DP.data` holds.

## Layout

```
index.html              sign-in page (simulated auth, see assets/js/login.js)
assets/css/             design tokens (base.css) and sign-in styles (login.css)
assets/js/              login.js (form, validation, authenticate() seam), hero.js (sample run preview)
assets/fonts/           Geist and Geist Mono, self-hosted (SIL OFL, see OFL.txt)
app/                    the workspace prototype (index.html, css/, js/; logs.js and copilot.js added)
../api/chat.js          Gemini proxy (Vercel function)
```

Sign-in is a demo: any well-formed credentials open the sample workspace, and nothing is transmitted. SOC 2, HIPAA and SSO badges are labelled roadmap/planned and must stay that way until they are real.
