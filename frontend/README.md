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

No build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

It deploys as a static site (for example on Vercel with this folder as the root directory).

## Status: prototype on sample data

- All metadata, lineage, assets and usage figures in `js/data.js` are **fictional sample data**.
- Scoring is deterministic: five weighted signals (regulatory use, downstream dependencies, usage, sensitivity, lineage reach) give a 0-100 criticality score. Critical is 60 or above, Monitored is 35 to 59. Confidence falls as a score nears a threshold.
- The chat answers by matching the question against the scored sample data. It is not a language model.
- Accept/reject decisions are kept in the browser's `localStorage` and can be exported. Nothing is sent anywhere.

## Connecting a backend later

`js/data.js` is the only file that knows where data comes from. A backend would return the same shapes (`tables`, `lineage`, `assets`, per-element scores and rule proposals), and the views render whatever `DP.data` holds.

## Layout

```
index.html        page shell, dialog and drawer containers
css/styles.css    design tokens and styles
js/data.js        sample metadata, scoring and rule generation
js/core.js        helpers and the decision store
js/views/*.js     one file per screen (each returns an HTML string)
js/app.js         routing, events, drawer, reject dialog, export
```
