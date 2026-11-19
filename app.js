(function () {
  "use strict";

  const RISK_FIELD = "CRITIC_Risk_Index";
  const CLASS_FIELD = "Jenks_Class_ID";
  const CLASS_LABEL_FIELD = "Jenks_Class";
  const TRAIL_FIELD = "TRAIL_ID";
  const SEGMENT_FIELD = "SEG_ID";
  const DATA_FILE = "Risk_assess_result_CRITIC_Jenks_name.geojson";
  const ACCIDENT_DATA_FILE = "accident_statistics.json";
  const ACCIDENT_YEARS_FOR_AVERAGE = 5;
  const KEY_STORAGE = "trail-risk-amap-api-key";
  const CRS_2326 =
    "+proj=tmerc +lat_0=22.3121333333333 +lon_0=114.178555555556 +k=1 " +
    "+x_0=836694.05 +y_0=819069.8 +ellps=intl " +
    "+towgs84=-162.619,-276.959,-161.764,0.067753,-2.243648,-1.158828,-1.094246 " +
    "+units=m +no_defs +type=crs";
  const CLASSES = [
    { id: 1, label: "Low / 低", color: "#6e9e81" },
    { id: 2, label: "Moderate / 中", color: "#d0ad52" },
    { id: 3, label: "High / 高", color: "#e78642" },
    { id: 4, label: "Very High / 很高", color: "#bd554c" }
  ];
  const FACTORS = [
    { label: "Slope", fields: ["Slope_Score", "SLP_SCORE"] },
    { label: "Surface", fields: ["Surface_Score", "SURF_SCORE"] },
    { label: "Vegetation", fields: ["Vegetation_Score", "VEG_SCORE"] },
    { label: "Cliff exposure", fields: ["CLIFF_SC5"] },
    { label: "Trailhead access", fields: ["Trailhead_Score", "TRHD_SCORE"] },
    { label: "Road proximity", fields: ["Road_Score", "ROAD_SCORE"] },
    { label: "Mobile signal", fields: ["Signal_Score", "SIG_SCORE"] },
    { label: "Support / supplies", fields: ["Supply_Score", "SUP_SCORE"] }
  ];

  const statusElement = document.getElementById("data-status");
  const segmentCountElement = document.getElementById("segment-count");
  const mapMessageElement = document.getElementById("map-message");
  const legendElement = document.getElementById("legend");
  const routeSearch = document.getElementById("trail-search");
  const routeSelect = document.getElementById("trail-select");
  const classSelect = document.getElementById("class-select");
  const thresholdInput = document.getElementById("risk-threshold");
  const thresholdValue = document.getElementById("risk-threshold-value");
  const routesToggle = document.getElementById("routes-toggle");
  const basemapSelect = document.getElementById("basemap-select");
  const roadNetToggle = document.getElementById("roadnet-toggle");
  const detailContent = document.getElementById("detail-content");
  const searchResults = document.getElementById("trail-search-results");

  let AMapApi;
  let map;
  let segmentRecords = [];
  let trailGroups = new Map();
  let mapMessageTimer;

  setupNavigation();
  setupHomeCarousel();
  loadAccidentChart();
  setupDashboardControls();
  loadRoutes();
  initializeMap();

  function initializeMap() {
    const key = readSavedKey();
    if (!key) {
      showMapMessage("AMap base layer is unavailable: no Web JavaScript API key is saved for this browser.", true);
      return;
    }
    loadAmapApi(key)
      .then(function () {
        AMapApi = window.AMap;
        map = new AMapApi.Map("map", {
          viewMode: "2D",
          center: [114.17, 22.32],
          zoom: 10,
          zooms: [8, 19],
          resizeEnable: true
        });
        const mapElement = document.getElementById("map");
        if ("ResizeObserver" in window) {
          new ResizeObserver(function () {
            if (map) {
              window.requestAnimationFrame(function () {
                map.resize();
              });
            }
          }).observe(mapElement);
        }
        window.addEventListener("resize", function () {
          window.requestAnimationFrame(function () {
            map.resize();
          });
        });
        map.addControl(new AMapApi.Scale());
        map.addControl(new AMapApi.ToolBar({ position: "RB" }));
        map.on("click", function (event) {
          const record = findNearestSegment(event.lnglat);
          if (record) {
            renderSegmentDetails(record);
          }
        });
        basemapSelect.addEventListener("change", updateBaseLayers);
        roadNetToggle.addEventListener("change", updateBaseLayers);
        renderSegmentsOnMap();
        updateBaseLayers();
        window.requestAnimationFrame(function () {
          map.resize();
          zoomToRecords(segmentRecords, 12);
        });
        showMapMessage("AMap initialized. If the basemap stays blank, check the key and its allowed domain.", false);
        map.on("complete", function () {
          if (!mapMessageElement.classList.contains("is-error")) {
            mapMessageElement.hidden = true;
          }
        });
        map.on("error", function (event) {
          showMapMessage("AMap reported a map error. Verify the key, domain authorization, and tile network access.", true);
          console.error("AMap map rendering error:", event);
        });
      })
      .catch(function (error) {
        showMapMessage("AMap failed to load. Verify the Web API key, its allowed domain, and network access.", true);
        console.error("AMap initialization failed:", error);
      });
  }

  function readSavedKey() {
    const deploymentKey =
      typeof window.TRAIL_RISK_AMAP_API_KEY === "string"
        ? window.TRAIL_RISK_AMAP_API_KEY
        : "";
    if (deploymentKey) {
      return deploymentKey;
    }
    try {
      return window.localStorage.getItem(KEY_STORAGE) || "";
    } catch (error) {
      showMapMessage("Browser storage is unavailable; the map key could not be read.", true);
      console.error("AMap key storage read failed:", error);
      return "";
    }
  }

  function loadAmapApi(key) {
    return new Promise(function (resolve, reject) {
      if (window.AMap) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://webapi.amap.com/maps?v=2.0&key=" + encodeURIComponent(key) + "&plugin=AMap.Scale,AMap.ToolBar";
      script.async = true;
      script.onload = function () {
        if (window.AMap) {
          resolve();
        } else {
          reject(new Error("AMap script loaded without exposing the AMap API."));
        }
      };
      script.onerror = function () {
        reject(new Error("AMap JavaScript API request failed."));
      };
      document.head.append(script);
    });
  }

  function setupDashboardControls() {
    routeSearch.addEventListener("input", function () {
      renderSearchResults(routeSearch.value);
      if (routeSelect.value) {
        const selected = trailGroups.get(routeSelect.value);
        if (selected && !groupMatchesQuery(selected, routeSearch.value)) {
          routeSelect.value = "";
          populateTrailOptions();
          applyFilters();
          renderDefaultDetails();
        }
      }
    });
    routeSearch.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        hideSearchResults();
      } else if (event.key === "ArrowDown") {
        const firstResult = searchResults.querySelector("button");
        if (firstResult) {
          event.preventDefault();
          firstResult.focus();
        }
      } else if (event.key === "Enter") {
        const firstResult = searchResults.querySelector("button");
        if (firstResult) {
          event.preventDefault();
          firstResult.click();
        }
      }
    });
    routeSearch.addEventListener("focus", function () {
      if (routeSearch.value.trim()) {
        renderSearchResults(routeSearch.value);
      }
    });
    document.addEventListener("click", function (event) {
      if (!event.target.closest(".route-search-group")) {
        hideSearchResults();
      }
    });
    routeSelect.addEventListener("change", function () {
      const trailId = routeSelect.value;
      applyFilters();
      if (trailId) {
        const group = trailGroups.get(trailId);
        if (group) {
          renderTrailDetails(group);
          zoomToRecords(group.records, 16);
        }
      } else {
        renderDefaultDetails();
      }
    });
    classSelect.addEventListener("change", applyFilters);
    thresholdInput.addEventListener("input", function () {
      thresholdValue.value = Number(thresholdInput.value).toFixed(2);
      thresholdValue.textContent = Number(thresholdInput.value).toFixed(2);
      applyFilters();
    });
    routesToggle.addEventListener("change", applyFilters);
    document.getElementById("home-button").addEventListener("click", function () {
      zoomToRecords(segmentRecords, 12);
    });
  }

  function groupMatchesQuery(group, query) {
    const normalizedQuery = query.trim().normalize("NFKC").toLocaleLowerCase();
    return (
      !normalizedQuery ||
      [group.properties.TRAIL_NAME_EN, group.properties.TRAIL_NAME_TC, group.id]
        .filter(Boolean)
        .some(function (value) {
          return String(value).normalize("NFKC").toLocaleLowerCase().includes(normalizedQuery);
        })
    );
  }

  function renderSearchResults(query) {
    searchResults.replaceChildren();
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      hideSearchResults();
      return;
    }
    const matches = Array.from(trailGroups.values())
      .filter(function (group) {
        return groupMatchesQuery(group, normalizedQuery);
      })
      .sort(function (left, right) {
        return String(left.properties.TRAIL_NAME_EN || left.id).localeCompare(
          String(right.properties.TRAIL_NAME_EN || right.id)
        );
      });

    if (matches.length === 0) {
      const empty = document.createElement("p");
      empty.className = "search-no-results";
      empty.textContent = "No matching trails. Try an English or Traditional Chinese name.";
      searchResults.append(empty);
    } else {
      matches.slice(0, 8).forEach(function (group) {
        const button = document.createElement("button");
        button.className = "trail-search-result";
        button.type = "button";
        button.setAttribute("role", "option");
        const english = document.createElement("span");
        english.className = "search-result-en";
        english.textContent = group.properties.TRAIL_NAME_EN || group.id;
        const chinese = document.createElement("span");
        chinese.className = "search-result-cn";
        chinese.textContent = group.properties.TRAIL_NAME_TC || group.id;
        button.append(english, chinese);
        button.addEventListener("click", function () {
          selectTrail(group);
        });
        searchResults.append(button);
      });
      if (matches.length > 8) {
        const more = document.createElement("p");
        more.className = "search-more-results";
        more.textContent = "Showing 8 of " + matches.length + " matches. Refine your search.";
        searchResults.append(more);
      }
    }
    searchResults.hidden = false;
    routeSearch.setAttribute("aria-expanded", "true");
  }

  function selectTrail(group) {
    hideSearchResults();
    routeSearch.value = group.properties.TRAIL_NAME_EN || group.properties.TRAIL_NAME_TC || group.id;
    routeSelect.value = group.id;
    routeSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function hideSearchResults() {
    searchResults.hidden = true;
    routeSearch.setAttribute("aria-expanded", "false");
  }

  function updateBaseLayers() {
    if (!map || !AMapApi) {
      showMapMessage("The map is not ready yet.", true);
      return;
    }
    let layers;
    if (basemapSelect.value === "satellite") {
      layers = [new AMapApi.TileLayer.Satellite()];
    } else {
      layers = [new AMapApi.TileLayer()];
    }
    if (roadNetToggle.checked) {
      layers.push(new AMapApi.TileLayer.RoadNet());
    }
    map.setLayers(layers);
    window.requestAnimationFrame(function () {
      map.resize();
    });
  }

  async function loadRoutes() {
    statusElement.textContent = "Reading route dataset…";
    try {
      proj4.defs("EPSG:2326", CRS_2326);
      const response = await fetch("./" + DATA_FILE);
      if (!response.ok) {
        throw new Error("Route data request failed with HTTP " + response.status + ".");
      }
      const data = await response.json();
      if (!data || !Array.isArray(data.features) || data.features.length === 0) {
        throw new Error("The route dataset contains no GeoJSON features.");
      }

      segmentRecords = data.features.map(function (feature) {
        const properties = feature && feature.properties;
        if (
          !feature ||
          !feature.geometry ||
          feature.geometry.type !== "MultiLineString" ||
          !Number.isFinite(Number(properties && properties[RISK_FIELD])) ||
          !Number.isInteger(Number(properties && properties[CLASS_FIELD])) ||
          Number(properties[CLASS_FIELD]) < 1 ||
          Number(properties[CLASS_FIELD]) > CLASSES.length
        ) {
          return null;
        }
        const paths = feature.geometry.coordinates.map(function (line) {
          return line.map(toGcj02);
        });
        const trailId = String(properties[TRAIL_FIELD] || "unassigned");
        const record = {
          properties: properties,
          paths: paths,
          trailId: trailId,
          risk: Number(properties[RISK_FIELD]),
          classId: Number(properties[CLASS_FIELD]),
          classInfo: CLASSES[Number(properties[CLASS_FIELD]) - 1],
          overlay: null,
          isVisible: false
        };
        if (!trailGroups.has(trailId)) {
          trailGroups.set(trailId, { id: trailId, records: [], properties: properties });
        }
        trailGroups.get(trailId).records.push(record);
        return record;
      }).filter(Boolean);

      if (!segmentRecords.length) {
        throw new Error("No usable route segments with valid risk index and Jenks class values were found.");
      }
      updateLegend(segmentRecords);
      updateSummary(segmentRecords);
      populateTrailOptions();
      statusElement.textContent = "Route data loaded";
      renderSegmentsOnMap();
      applyFilters();
      segmentCountElement.textContent =
        segmentRecords.length.toLocaleString() + " / " + segmentRecords.length.toLocaleString() + " segments";
    } catch (error) {
      statusElement.textContent = "Route data could not be loaded.";
      showMapMessage("Route data could not be loaded. Check the dataset and coordinate definition.", true);
      console.error("Route data loading failed:", error);
    }
  }

  function toGcj02(coordinate) {
    if (!Array.isArray(coordinate) || !Number.isFinite(Number(coordinate[0])) || !Number.isFinite(Number(coordinate[1]))) {
      throw new Error("Route data contains an invalid HK1980 coordinate.");
    }
    const wgs84 = proj4("EPSG:2326", "EPSG:4326", coordinate.slice(0, 2));
    if (!Number.isFinite(wgs84[0]) || !Number.isFinite(wgs84[1])) {
      throw new Error("A route coordinate could not be transformed from HK1980 to WGS84.");
    }
    return wgs84ToGcj02(wgs84);
  }

  function wgs84ToGcj02(point) {
    const longitude = point[0];
    const latitude = point[1];
    const x = longitude - 105;
    const y = latitude - 35;
    let deltaLatitude =
      -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    deltaLatitude += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
    deltaLatitude += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
    deltaLatitude += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
    let deltaLongitude =
      300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    deltaLongitude += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
    deltaLongitude += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
    deltaLongitude += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
    const radians = (latitude * Math.PI) / 180;
    const magic = 1 - 0.006693421622965943 * Math.sin(radians) ** 2;
    const root = Math.sqrt(magic);
    deltaLatitude = (deltaLatitude * 180) / (((6378245 * (1 - 0.006693421622965943)) / (magic * root)) * Math.PI);
    deltaLongitude = (deltaLongitude * 180) / ((6378245 / root) * Math.cos(radians) * Math.PI);
    return [longitude + deltaLongitude, latitude + deltaLatitude];
  }

  function renderSegmentsOnMap() {
    if (!map || !AMapApi || !segmentRecords.length || segmentRecords[0].overlay) {
      return;
    }
    segmentRecords.forEach(function (record) {
      const overlay = new AMapApi.Polyline({
        path: record.paths,
        strokeColor: record.classInfo.color,
        strokeWeight: 4,
        strokeOpacity: 0.92,
        lineJoin: "round",
        lineCap: "round",
        zIndex: record.classId
      });
      overlay.on("click", function () {
        renderSegmentDetails(record);
      });
      record.overlay = overlay;
    });
    map.add(segmentRecords.map(function (record) {
      return record.overlay;
    }));
    applyFilters();
    zoomToRecords(segmentRecords, 12);
  }

  function populateTrailOptions() {
    const previousValue = routeSelect.value;
    const optionItems = Array.from(trailGroups.values())
      .sort(function (left, right) {
        return String(left.properties.TRAIL_NAME_EN || left.id).localeCompare(
          String(right.properties.TRAIL_NAME_EN || right.id)
        );
      });
    routeSelect.replaceChildren(new Option("All assessed trails", ""));
    optionItems.forEach(function (group) {
      const properties = group.properties;
      const englishName = properties.TRAIL_NAME_EN || group.id;
      const chineseName = properties.TRAIL_NAME_TC || "";
      const option = new Option(
        englishName + (chineseName ? " · " + chineseName : "") + " (" + group.id + ")",
        group.id
      );
      routeSelect.append(option);
    });
    if (previousValue && optionItems.some(function (group) { return group.id === previousValue; })) {
      routeSelect.value = previousValue;
    } else {
      routeSelect.value = "";
    }
  }

  function applyFilters() {
    const selectedTrail = routeSelect.value;
    const selectedClass = classSelect.value ? Number(classSelect.value) : null;
    const maxRisk = Number(thresholdInput.value);
    let matchingCount = 0;
    segmentRecords.forEach(function (record) {
      const matches =
        (!selectedTrail || record.trailId === selectedTrail) &&
        (!selectedClass || record.classId === selectedClass) &&
        record.risk <= maxRisk;
      if (matches) {
        matchingCount += 1;
      }
      if (record.overlay && record.isVisible !== (matches && routesToggle.checked)) {
        if (matches && routesToggle.checked) {
          record.overlay.setMap(map);
        } else {
          record.overlay.setMap(null);
        }
        record.isVisible = matches && routesToggle.checked;
      }
    });
    segmentCountElement.textContent =
      (routesToggle.checked ? matchingCount : 0).toLocaleString() +
      " / " +
      segmentRecords.length.toLocaleString() +
      " segments";
  }

  function findNearestSegment(position) {
    if (!position || typeof position.getLng !== "function" || typeof position.getLat !== "function") {
      return null;
    }
    const longitude = position.getLng();
    const latitude = position.getLat();
    const latitudeScale = 110540;
    const longitudeScale = 111320 * Math.cos((latitude * Math.PI) / 180);
    const metersPerPixel =
      (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, map.getZoom());
    const searchRadius = Math.min(120, Math.max(35, metersPerPixel * 10));
    const radiusSquared = searchRadius * searchRadius;
    const latitudeMargin = searchRadius / latitudeScale;
    const longitudeMargin = searchRadius / longitudeScale;
    let nearest = null;
    let nearestDistanceSquared = radiusSquared;

    segmentRecords.forEach(function (record) {
      if (!record.isVisible) {
        return;
      }
      record.paths.forEach(function (path) {
        for (let index = 1; index < path.length; index += 1) {
          const first = path[index - 1];
          const second = path[index];
          if (
            Math.max(first[0], second[0]) < longitude - longitudeMargin ||
            Math.min(first[0], second[0]) > longitude + longitudeMargin ||
            Math.max(first[1], second[1]) < latitude - latitudeMargin ||
            Math.min(first[1], second[1]) > latitude + latitudeMargin
          ) {
            continue;
          }
          const firstX = (first[0] - longitude) * longitudeScale;
          const firstY = (first[1] - latitude) * latitudeScale;
          const secondX = (second[0] - longitude) * longitudeScale;
          const secondY = (second[1] - latitude) * latitudeScale;
          const deltaX = secondX - firstX;
          const deltaY = secondY - firstY;
          const lengthSquared = deltaX * deltaX + deltaY * deltaY;
          const ratio = lengthSquared
            ? Math.max(0, Math.min(1, -(firstX * deltaX + firstY * deltaY) / lengthSquared))
            : 0;
          const distanceX = firstX + ratio * deltaX;
          const distanceY = firstY + ratio * deltaY;
          const distanceSquared = distanceX * distanceX + distanceY * distanceY;
          if (distanceSquared < nearestDistanceSquared) {
            nearest = record;
            nearestDistanceSquared = distanceSquared;
          }
        }
      });
    });
    return nearest;
  }

  function updateLegend(records) {
    const ranges = CLASSES.map(function (riskClass) {
      const values = records
        .filter(function (record) { return record.classId === riskClass.id; })
        .map(function (record) { return record.risk; });
      return values.length
        ? formatScore(Math.min.apply(null, values)) + "–" + formatScore(Math.max.apply(null, values))
        : "No segments";
    });
    legendElement.replaceChildren();
    CLASSES.forEach(function (riskClass, index) {
      const item = document.createElement("div");
      item.className = "legend-item";
      const swatch = document.createElement("span");
      swatch.className = "legend-swatch";
      swatch.style.backgroundColor = riskClass.color;
      const name = document.createElement("span");
      name.textContent = riskClass.label;
      const range = document.createElement("span");
      range.className = "legend-range";
      range.textContent = ranges[index];
      item.append(swatch, name, range);
      legendElement.append(item);
    });
  }

  function updateSummary(records) {
    document.getElementById("summary-segments").textContent = records.length.toLocaleString();
    document.getElementById("summary-trails").textContent = trailGroups.size.toLocaleString();
    document.getElementById("study-segment-count").textContent = records.length.toLocaleString();
    const classCounts = new Map(CLASSES.map(function (riskClass) { return [riskClass.id, 0]; }));
    records.forEach(function (record) {
      classCounts.set(record.classId, (classCounts.get(record.classId) || 0) + 1);
    });
    const chart = document.getElementById("risk-distribution");
    CLASSES.forEach(function (riskClass) {
      const row = chart.querySelector('[data-class="' + riskClass.id + '"]');
      const count = classCounts.get(riskClass.id) || 0;
      const share = (count / records.length) * 100;
      row.querySelector(".distribution-track i").style.setProperty("--share", share.toFixed(1) + "%");
      row.querySelector(".distribution-track i").style.setProperty("--class-color", riskClass.color);
      row.querySelector(".distribution-value").textContent = count.toLocaleString() + " · " + share.toFixed(1) + "%";
      row.setAttribute("aria-label", riskClass.label + ": " + count.toLocaleString() + " segments");
    });
  }

  function renderDefaultDetails() {
    detailContent.replaceChildren();
    const message = document.createElement("p");
    message.className = "detail-empty";
    message.textContent = "Select a colored segment on the map, or choose a route to see its information.";
    detailContent.append(message);
  }

  function renderTrailDetails(group) {
    const properties = group.properties;
    detailContent.replaceChildren();
    const name = addDetailElement("h3", "detail-trail-name", properties.TRAIL_NAME_EN || group.id);
    detailContent.append(name);
    if (properties.TRAIL_NAME_TC) {
      detailContent.append(addDetailElement("p", "detail-trail-name-cn", properties.TRAIL_NAME_TC));
    }
    const count = addDetailElement("p", "detail-trail-count", group.records.length + " assessed segments");
    detailContent.append(count);
    appendTrailMetadata(properties);
    appendOfficialLink(properties);
  }

  function renderSegmentDetails(record) {
    const properties = record.properties;
    detailContent.replaceChildren();
    const name = addDetailElement("h3", "detail-trail-name", properties.TRAIL_NAME_EN || record.trailId);
    detailContent.append(name);
    if (properties.TRAIL_NAME_TC) {
      detailContent.append(addDetailElement("p", "detail-trail-name-cn", properties.TRAIL_NAME_TC));
    }
    const badge = addDetailElement("span", "detail-risk-badge", properties[CLASS_LABEL_FIELD] || record.classInfo.label);
    badge.style.setProperty("--class-color", record.classInfo.color);
    detailContent.append(badge);
    const metrics = document.createElement("dl");
    metrics.className = "detail-metrics";
    addDefinition(metrics, "Segment", properties[SEGMENT_FIELD] || properties.SEG_NO);
    addDefinition(metrics, "CRITIC index", formatScore(record.risk));
    addDefinition(metrics, "Segment length", formatDistance(properties.LENGTH_M));
    detailContent.append(metrics);
    appendFactorList(properties);
    appendTrailMetadata(properties);
    appendOfficialLink(properties);
  }

  function appendFactorList(properties) {
    const heading = addDetailElement("h4", "detail-subheading", "Risk factor scores");
    detailContent.append(heading);
    const list = document.createElement("dl");
    list.className = "factor-list";
    FACTORS.forEach(function (factor) {
      const field = factor.fields.find(function (fieldName) {
        return properties[fieldName] !== undefined && properties[fieldName] !== null && properties[fieldName] !== "";
      });
      if (field) {
        addDefinition(list, factor.label, formatScore(properties[field]));
      }
    });
    detailContent.append(list);
  }

  function appendTrailMetadata(properties) {
    const heading = addDetailElement("h4", "detail-subheading", "Trail information");
    detailContent.append(heading);
    const metadata = document.createElement("dl");
    metadata.className = "detail-metadata";
    addDefinition(metadata, "Route type", localizedValue(properties.TYPE_EN, properties.TYPE_TC));
    addDefinition(metadata, "Difficulty", localizedValue(properties.DIFFICULTY_EN, properties.DIFFICULTY_TC));
    addDefinition(metadata, "Region", localizedValue(properties.REGION_EN, properties.REGION_TC));
    addDefinition(
      metadata,
      "Start → Finish",
      localizedValue(properties.STARTpt_EN, properties.STARTpt_TC) +
        " → " +
        localizedValue(properties.FINISHpt_EN, properties.FINISHpt_TC)
    );
    detailContent.append(metadata);
  }

  function appendOfficialLink(properties) {
    if (!properties.WEBSITE) {
      return;
    }
    let url;
    try {
      url = new URL(properties.WEBSITE);
    } catch (error) {
      console.error("Ignored invalid official trail URL:", error);
      return;
    }
    if (url.protocol !== "https:") {
      return;
    }
    const link = document.createElement("a");
    link.className = "official-trail-link";
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open official trail introduction ↗";
    detailContent.append(link);
  }

  function addDefinition(list, label, value) {
    if (value === undefined || value === null || value === "" || value === "— → —") {
      return;
    }
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = String(value);
    list.append(term, description);
  }

  function addDetailElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = String(text || "");
    return element;
  }

  function localizedValue(english, chinese) {
    if (english && chinese) {
      return english + " / " + chinese;
    }
    return english || chinese || "";
  }

  function zoomToRecords(records, maxZoom) {
    if (!map || !AMapApi || !records.length) {
      return;
    }
    const overlays = records.map(function (record) { return record.overlay; }).filter(Boolean);
    if (overlays.length) {
      map.setFitView(overlays, false, [45, 45, 45, 45], maxZoom, true);
    }
  }

  function showMapMessage(message, persistent) {
    mapMessageElement.textContent = message;
    mapMessageElement.hidden = false;
    window.clearTimeout(mapMessageTimer);
    if (persistent) {
      mapMessageElement.classList.add("is-error");
    } else {
      mapMessageElement.classList.remove("is-error");
      mapMessageTimer = window.setTimeout(function () {
        mapMessageElement.hidden = true;
      }, 6500);
    }
  }

  function formatScore(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : "—";
  }

  function formatDistance(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number).toLocaleString() + " m" : "—";
  }

  function setupNavigation() {
    const links = Array.from(document.querySelectorAll(".nav-link"));
    const sections = links.map(function (link) {
      return document.querySelector(link.getAttribute("href"));
    }).filter(Boolean);

    function setActiveSection(sectionId) {
      links.forEach(function (link) {
        const isActive = link.getAttribute("href") === "#" + sectionId;
        link.classList.toggle("is-active", isActive);
        if (isActive) {
          link.setAttribute("aria-current", "location");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    }
    links.forEach(function (link) {
      link.addEventListener("click", function () {
        setActiveSection(link.getAttribute("href").slice(1));
      });
    });
    function updateActiveSection() {
      const headerOffset = document.querySelector(".site-header").getBoundingClientRect().height + 80;
      let activeSection = sections[0];
      sections.forEach(function (section) {
        if (section.getBoundingClientRect().top <= headerOffset) {
          activeSection = section;
        }
      });
      if (activeSection) {
        setActiveSection(activeSection.id);
      }
    }
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    updateActiveSection();
  }

  function setupHomeCarousel() {
    const carousel = document.getElementById("home-carousel");
    const slides = Array.from(carousel.querySelectorAll(".carousel-slide"));
    const dots = Array.from(carousel.querySelectorAll(".carousel-dot"));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let activeIndex = 0;
    let rotationTimer;
    function showSlide(index) {
      activeIndex = index;
      slides.forEach(function (slide, slideIndex) {
        const isActive = slideIndex === activeIndex;
        slide.hidden = !isActive;
        slide.classList.toggle("is-active", isActive);
      });
      dots.forEach(function (dot, dotIndex) {
        const isActive = dotIndex === activeIndex;
        dot.classList.toggle("is-active", isActive);
        if (isActive) {
          dot.setAttribute("aria-current", "true");
        } else {
          dot.removeAttribute("aria-current");
        }
      });
    }
    function stopRotation() {
      window.clearInterval(rotationTimer);
      rotationTimer = undefined;
    }
    function startRotation() {
      stopRotation();
      if (reducedMotion.matches || document.hidden || carousel.matches(":hover,:focus-within")) {
        return;
      }
      rotationTimer = window.setInterval(function () {
        showSlide((activeIndex + 1) % slides.length);
      }, 7000);
    }
    dots.forEach(function (dot, index) {
      dot.addEventListener("click", function () {
        showSlide(index);
        startRotation();
      });
    });
    carousel.addEventListener("mouseenter", stopRotation);
    carousel.addEventListener("mouseleave", startRotation);
    carousel.addEventListener("focusin", stopRotation);
    carousel.addEventListener("focusout", function (event) {
      if (!carousel.contains(event.relatedTarget)) {
        startRotation();
      }
    });
    document.addEventListener("visibilitychange", startRotation);
    reducedMotion.addEventListener("change", startRotation);
    showSlide(0);
    startRotation();
  }

  async function loadAccidentChart() {
    const chart = document.getElementById("accident-chart");
    try {
      const response = await fetch("./" + ACCIDENT_DATA_FILE);
      if (!response.ok) {
        throw new Error("Accident statistics request failed with HTTP " + response.status + ".");
      }
      const data = await response.json();
      const records = data && data.years;
      if (
        !Array.isArray(records) ||
        records.length === 0 ||
        records.some(function (record) {
          return (
            !Number.isInteger(record.year) ||
            !Number.isFinite(record.cases) ||
            !Number.isFinite(record.injuries) ||
            !Number.isFinite(record.deaths)
          );
        })
      ) {
        throw new Error("Accident statistics are missing valid yearly case, injury, or death values.");
      }
      renderAccidentChart(chart, records);
      const recentRecords = records.slice(-ACCIDENT_YEARS_FOR_AVERAGE);
      const average = recentRecords.reduce(function (total, record) {
        return total + record.cases;
      }, 0) / recentRecords.length;
      document.getElementById("accident-average").textContent = Math.round(average).toLocaleString();
      document.querySelector(".accident-average-period").textContent =
        recentRecords[0].year + "–" + recentRecords[recentRecords.length - 1].year + " · 5 complete years";
    } catch (error) {
      chart.replaceChildren();
      const message = document.createElementNS("http://www.w3.org/2000/svg", "text");
      message.setAttribute("x", "320");
      message.setAttribute("y", "128");
      message.setAttribute("text-anchor", "middle");
      message.setAttribute("class", "chart-error");
      message.textContent = "Accident chart could not be loaded.";
      chart.append(message);
      document.getElementById("accident-average").textContent = "—";
      console.error("Accident chart loading failed:", error);
    }
  }

  function renderAccidentChart(chart, records) {
    const namespace = "http://www.w3.org/2000/svg";
    const plot = { left: 52, right: 620, top: 24, bottom: 207 };
    const maxCases = Math.max.apply(null, records.map(function (record) { return record.cases; }));
    const maxValue = Math.ceil(maxCases / 200) * 200;
    const plotHeight = plot.bottom - plot.top;
    const plotWidth = plot.right - plot.left;
    const step = plotWidth / records.length;
    const barWidth = Math.min(42, step * 0.56);
    chart.replaceChildren();
    function addElement(tag, attributes, text) {
      const element = document.createElementNS(namespace, tag);
      Object.keys(attributes).forEach(function (key) { element.setAttribute(key, attributes[key]); });
      if (text !== undefined) {
        element.textContent = text;
      }
      chart.append(element);
      return element;
    }
    for (let tick = 0; tick <= maxValue; tick += 200) {
      const y = plot.bottom - (tick / maxValue) * plotHeight;
      addElement("line", { x1: plot.left, x2: plot.right, y1: y, y2: y, class: "chart-gridline" });
      addElement("text", { x: plot.left - 10, y: y + 3.5, "text-anchor": "end", class: "chart-axis-label" }, tick.toLocaleString());
    }
    records.forEach(function (record, index) {
      const height = (record.cases / maxValue) * plotHeight;
      const x = plot.left + step * index + (step - barWidth) / 2;
      const y = plot.bottom - height;
      const bar = addElement("rect", {
        x: x,
        y: y,
        width: barWidth,
        height: height,
        rx: 4,
        class: record.cases === maxCases ? "chart-bar chart-bar-peak" : "chart-bar"
      });
      const title = document.createElementNS(namespace, "title");
      title.textContent =
        record.year + ": " + record.cases.toLocaleString() + " cases, " +
        record.injuries.toLocaleString() + " injuries, " + record.deaths.toLocaleString() + " deaths";
      bar.append(title);
      addElement("text", { x: x + barWidth / 2, y: y - 7, "text-anchor": "middle", class: "chart-value-label" }, record.cases.toLocaleString());
      addElement("text", { x: x + barWidth / 2, y: plot.bottom + 22, "text-anchor": "middle", class: "chart-axis-label" }, String(record.year));
    });
    addElement("line", { x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom, class: "chart-axis-line" });
    chart.setAttribute(
      "aria-label",
      "Country-park accident cases, " + records[0].year + " to " + records[records.length - 1].year + ". " +
        records.map(function (record) { return record.year + ": " + record.cases; }).join("; ") + "."
    );
  }
})();
