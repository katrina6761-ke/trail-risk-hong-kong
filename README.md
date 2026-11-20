# Hiking in Hong Kong: Where Are the Risks?

A static Web GIS prototype for exploring the CRITIC risk index and supplied Jenks classes of assessed hiking trail segments in Hong Kong.

## Prototype features

- Five-section navigation: Background, Platform, Data, Method, and Advice, in page-reading order.
- Anchored, responsive page sections with an active navigation indicator.
- Background overview with hiking-visitor context and a three-slide auto-rotating carousel.
- Accident-case chart and five-year average derived from `事故统计表-2018-2024.xlsx`.
- Linked official MacLehose Trail example and supplied hiking-accident news image.
- Proposal-based research background, questions, study area, data-source summary, methodology, and preliminary AHP weight chart.
- Dataset-driven chart of trail segment counts and shares in each Jenks class.
- AMap standard and satellite basemaps, optional live traffic and road-network overlays, and a collapsible map-layer control.
- `Risk_assess_result_CRITIC_Jenks_name.geojson` route segments drawn and colored by `Jenks_Class_ID`.
- Single English/Traditional Chinese trail search with hierarchical region browsing, section disambiguation, route selection and zoom, Jenks class filter, and maximum CRITIC-index threshold.
- Selected trail and segment details are arranged in horizontal information cards without an internal vertical scrollbar.
- Click a segment to inspect its risk rating, factor scores, route metadata, and official hiking.gov.hk trail link.
- Screenshot-matched dashboard layout: full-height filter sidebar, a compact upper details/toolbar band, and a large map beneath it.
- Enlarged dashboard typography and a full-width selected-details panel above the map.
- Body, navigation, and interface text use a one-pixel larger type size while page headings retain their established sizes.
- Browser-side conversion from Hong Kong 1980 Grid System (EPSG:2326) to WGS 84 and then GCJ-02 for AMap.

The map uses the Jenks class ID and CRITIC risk index supplied in the updated GeoJSON; it does not recalculate either. Legend ranges show the minimum and maximum observed CRITIC index in each class. These classes are research classifications, not official safety ratings or real-time trail conditions.

The proposal describes a planned AHP and Entropy Weight Method workflow with preliminary dimension weights of 80% for natural factors and 20% for society and human factors. Its indicator table is presented as proposal methodology, not as the calculation source for the currently mapped `CRITIC_Risk_Index`. Confirm the final weighting formula and classification method before treating these as a single workflow. The proposal and current GeoJSON do not record dataset-specific acquisition dates.

The study content summarizes the supplied proposal: AFCD's 167 country-park trails, 25 country parks and 22 special areas (proposal citing AFCD, 2026), and context figures cited from the Hong Kong Legislative Council (2025). The proposal's source inventory includes a Digital Terrain Model, Territory-wide Terrestrial Habitat Map, boulder and historical landslide data, hiking trails and roads, emergency stations, distance posts, shelters, kiosks, water-filling stations, and OFCA mobile coverage.

The Home-page visitor context is approximately 12 million country-park visits annually (2018–2024 average, as cited in the proposal; this is visits, not a count of unique hikers). The accident table's `No. of cases` values for the five latest complete years (2020–2024) sum to 3,850, averaging 770 cases per year. Accident cases are distinct from injuries and deaths.

## Run locally

1. Open this folder in VS Code.
2. Start a static local web server from the project directory, for example:

   ```sh
   python3 -m http.server 8000
   ```

3. Visit `http://localhost:8000`.
4. The map key is supplied outside the webpage and stored in this browser under `trail-risk-amap-api-key`; the key is not embedded in project files or displayed in the dashboard. Without a key in a visitor's browser, the route metadata and filters remain available but the basemap will not load.

The site must be served over HTTP; opening `index.html` directly as a `file://` URL will prevent the browser from fetching the GeoJSON.

## Publish with GitHub Pages

The repository includes a GitHub Actions workflow that publishes only the files needed by the site. It does not publish the proposal PDF, source spreadsheets, or previous/raw GeoJSON files.

1. Create a **public** GitHub repository and push this project to its `main` branch.
2. In the repository, open **Settings → Secrets and variables → Actions** and add the repository secret `AMAP_JS_API_KEY`.
3. Restrict the AMap Web JavaScript API key to the final GitHub Pages hostname (for example, `your-account.github.io`) in the AMap console.
4. Open **Settings → Pages**, select **GitHub Actions** as the build and deployment source, and wait for the `Deploy GitHub Pages` workflow to finish.

The workflow writes the secret into a generated `amap-config.js` in the published site; it is not committed to the repository. A browser-side map key is necessarily visible to site visitors, so domain restrictions and usage limits are essential. If the secret is not configured, visitors can still supply their own key in that browser's local storage.

## AMap Web API key

The map does not show a key-entry field. Locally, the key is read from browser local storage and is not included in project files. The deployed site uses the key injected by the GitHub Actions workflow, when configured. Local storage is scoped to the exact origin, so `http://localhost:8000` and `http://127.0.0.1:8000` do not share a saved key. Browser-based map keys are visible to site visitors and sent to AMap to load its JavaScript API. Restrict allowed domains and usage in the AMap console before publishing; do not use an unrestricted key.

## Project files

- `index.html` — page structure and dashboard controls.
- `styles.css` — responsive page, navigation, and map dashboard styles.
- `app.js` — section navigation, GeoJSON loading, coordinate transformation, map rendering, filters, and segment/trail details.
- `amap-config.js` — local, empty deployment-key placeholder; GitHub Actions generates the published version from the repository secret.
- `accident_statistics.json` — chart-ready values transcribed from the supplied spreadsheet.
- `hiking_risk_icon.svg` — header icon.
- `乐极生悲-疫后旅客山野意外激增.png` — supplied image for the third Background carousel slide.
- `Screenshot_MacLehoseTrail(Section2)_ENJOYHIKING.png` — supplied official trail-page example image.
- `Risk_assess_result_CRITIC_Jenks_name.geojson` — current route-segment data used by the site.
- Source spreadsheets, proposal documents, intermediate analysis files, and older route datasets remain local and are excluded from the public website repository.

## Further research content to complete

The proposal does not include layer-specific acquisition dates, and the current prototype does not independently verify every source layer against the GeoJSON fields. Add dated source metadata and document the final implemented weighting workflow before publishing final research conclusions. Additional indicator layers, expanded analysis visualizations, and GitHub Pages deployment can be added as the source data and methods are finalized.
