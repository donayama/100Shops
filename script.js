const STORAGE_KEY = "100shops.userState.v1";
const DATA_KEY = "100shops.customData.v1";
const ACTIVE_DATASET_KEY = "100shops.activeDataset.v1";
const UI_STATE_KEY = "100shops.uiState.v1";

const fallbackCenter = [35.6812, 139.7671];
const SELECTED_SHOP_ZOOM = 16;
const SINGLE_RESULT_ZOOM = 16;
const FILTERED_MAX_ZOOM = 13;
const MAX_VISIBLE_MARKERS = 800;
const LIST_RENDER_BATCH = 80;
const ALL_DATASETS_ID = "all";
const DETAIL_DATA_PREFIX = "data/details-";
const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
];
const PREFECTURE_ORDER = new Map(PREFECTURES.map((prefecture, index) => [prefecture, index + 1]));
const DESIGNATED_CITIES = [
  "札幌市", "仙台市", "さいたま市", "千葉市", "横浜市", "川崎市", "相模原市",
  "新潟市", "静岡市", "浜松市", "名古屋市", "京都市", "大阪市", "堺市",
  "神戸市", "岡山市", "広島市", "北九州市", "福岡市", "熊本市"
];
const REGION_COORDINATES = [
  ["大阪府大阪市北区曽根崎新地", 34.6975, 135.4986],
  ["東京都港区赤坂", 35.6721, 139.7365],
  ["大阪府大阪市北区", 34.7055, 135.5100],
  ["京都府京都市中京区", 35.0104, 135.7517],
  ["愛知県名古屋市東区", 35.1790, 136.9257],
  ["東京都中央区", 35.6707, 139.7720],
  ["東京都渋谷区", 35.6618, 139.7041],
  ["東京都目黒区", 35.6415, 139.6982],
  ["東京都港区", 35.6581, 139.7516],
  ["愛知県名古屋市", 35.1815, 136.9066],
  ["京都府京都市", 35.0116, 135.7681],
  ["山梨県韮崎市", 35.7089, 138.4462],
  ["奈良県奈良市", 34.6851, 135.8048]
];
const datasets = getDatasets();
let activeDatasetId = getInitialDatasetId();
let shops = loadShops();
let userState = loadUserState();
let selectedId = getInitialSelectedId();
let markers = new Map();
let lastMapSignature = "";
let visibleListCount = LIST_RENDER_BATCH;
let detailDataByDataset = new Map();
let detailLoadPromises = new Map();
let detailLoadFailures = new Set();

const els = {
  searchInput: document.querySelector("#searchInput"),
  datasetSelect: document.querySelector("#datasetSelect"),
  prefectureFilter: document.querySelector("#prefectureFilter"),
  localityFilter: document.querySelector("#localityFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  shopList: document.querySelector("#shopList"),
  shopDetail: document.querySelector("#shopDetail"),
  resultCount: document.querySelector("#resultCount"),
  datasetLabel: document.querySelector("#datasetLabel"),
  importButton: document.querySelector("#importButton"),
  resetButton: document.querySelector("#resetButton"),
  importDialog: document.querySelector("#importDialog"),
  csvInput: document.querySelector("#csvInput"),
  applyImportButton: document.querySelector("#applyImportButton"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  filtersToggle: document.querySelector("#filtersToggle"),
  detailToggle: document.querySelector("#detailToggle")
};

applyInitialUrlState();
const uiState = loadUiState();

const map = L.map("map", {
  zoomControl: false
}).setView(fallbackCenter, 12);

L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);

applyUiState();

requestAnimationFrame(() => map.invalidateSize());

if ("ResizeObserver" in window) {
  new ResizeObserver(() => map.invalidateSize()).observe(document.querySelector("#map"));
}

function loadShops() {
  if (activeDatasetId === ALL_DATASETS_ID) {
    return Object.entries(datasets).flatMap(([datasetId, dataset]) => {
      return (dataset.shops ?? []).map((shop, index) => normalizeShop(shop, index, datasetId, dataset));
    });
  }

  if (activeDatasetId !== "custom") {
    const dataset = datasets[activeDatasetId];
    return (dataset?.shops ?? []).map((shop, index) => normalizeShop(shop, index, activeDatasetId, dataset));
  }

  const saved = localStorage.getItem(DATA_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.map((shop, index) => normalizeShop(shop, index, "custom", { label: "取り込みデータ" }));
    } catch {
      localStorage.removeItem(DATA_KEY);
    }
  }
  const dataset = datasets[window.DEFAULT_DATASET_ID];
  return (dataset?.shops ?? window.SEED_SHOPS ?? []).map((shop, index) => normalizeShop(shop, index, window.DEFAULT_DATASET_ID, dataset));
}

function getDatasets() {
  if (window.SHOP_DATASETS_LIGHT && Object.keys(window.SHOP_DATASETS_LIGHT).length > 0) {
    return window.SHOP_DATASETS_LIGHT;
  }
  if (window.SHOP_DATASETS && Object.keys(window.SHOP_DATASETS).length > 0) {
    return window.SHOP_DATASETS;
  }
  return {
    [window.DEFAULT_DATASET_ID ?? "default"]: {
      label: window.SEED_DATASET_LABEL ?? "初期データ",
      genre: "",
      sourceUrl: "",
      shops: window.SEED_SHOPS ?? []
    }
  };
}

function getInitialDatasetId() {
  const urlDataset = getUrlParam("dataset");
  if (urlDataset === ALL_DATASETS_ID) return ALL_DATASETS_ID;
  if (urlDataset === "custom" && localStorage.getItem(DATA_KEY)) return "custom";
  if (urlDataset && datasets[urlDataset]) return urlDataset;

  const saved = localStorage.getItem(ACTIVE_DATASET_KEY);
  if (saved === ALL_DATASETS_ID) return ALL_DATASETS_ID;
  if (saved === "custom" && localStorage.getItem(DATA_KEY)) return "custom";
  if (saved && datasets[saved]) return saved;
  return ALL_DATASETS_ID;
}

function getInitialSelectedId() {
  const urlShopId = getUrlParam("shop");
  if (urlShopId && shops.some((shop) => shop.id === urlShopId)) return urlShopId;
  return shops[0]?.id ?? null;
}

function getUrlParam(key) {
  try {
    return new URLSearchParams(window.location.search).get(key);
  } catch {
    return null;
  }
}

function applyInitialUrlState() {
  const params = getUrlParams();
  const query = params.get("q");
  const prefecture = params.get("pref");
  const locality = params.get("area");
  const sort = params.get("sort");

  if (query) els.searchInput.value = query;
  if (prefecture) els.prefectureFilter.value = prefecture;
  if (locality) els.localityFilter.value = locality;
  if (sort && [...(els.sortSelect.options ?? [])].some((option) => option.value === sort)) {
    els.sortSelect.value = sort;
  }
}

function getUrlParams() {
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return new URLSearchParams();
  }
}

function updateUrlState() {
  if (!window.history?.replaceState || !window.location) return;

  const params = new URLSearchParams();
  setUrlParam(params, "dataset", activeDatasetId !== ALL_DATASETS_ID ? activeDatasetId : "");
  setUrlParam(params, "q", els.searchInput.value.trim());
  setUrlParam(params, "pref", els.prefectureFilter.value !== "all" ? els.prefectureFilter.value : "");
  setUrlParam(params, "area", els.localityFilter.value !== "all" ? els.localityFilter.value : "");
  setUrlParam(params, "sort", els.sortSelect.value !== "rank" ? els.sortSelect.value : "");
  setUrlParam(params, "shop", selectedId && selectedId !== shops[0]?.id ? selectedId : "");

  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    window.history.replaceState(null, "", nextUrl);
  }
}

function setUrlParam(params, key, value) {
  if (value !== undefined && value !== null && value !== "") {
    params.set(key, value);
  }
}

function loadUserState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

function persistUserState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userState));
}

function loadUiState() {
  const mobile = window.matchMedia?.("(max-width: 900px)")?.matches ?? false;
  const defaults = {
    sidebarCollapsed: false,
    filtersCollapsed: mobile,
    detailCollapsed: mobile
  };
  try {
    const loaded = { ...defaults, ...JSON.parse(localStorage.getItem(UI_STATE_KEY)) };
    if (loaded.sidebarCollapsed) loaded.filtersCollapsed = true;
    return loaded;
  } catch {
    return defaults;
  }
}

function persistUiState() {
  localStorage.setItem(UI_STATE_KEY, JSON.stringify(uiState));
}

function applyUiState() {
  if (uiState.sidebarCollapsed) uiState.filtersCollapsed = true;
  document.body.classList.toggle("is-sidebar-collapsed", uiState.sidebarCollapsed);
  document.body.classList.toggle("is-filters-collapsed", uiState.filtersCollapsed);
  document.body.classList.toggle("is-detail-collapsed", uiState.detailCollapsed);

  els.sidebarToggle?.setAttribute("aria-label", uiState.sidebarCollapsed ? "検索部を開く" : "検索部を畳む");
  els.sidebarToggle?.setAttribute("title", uiState.sidebarCollapsed ? "検索部を開く" : "検索部を畳む");
  els.sidebarToggle?.querySelector("i")?.setAttribute("data-lucide", uiState.sidebarCollapsed ? "panel-left-open" : "panel-left-close");

  els.filtersToggle?.setAttribute("aria-expanded", String(!uiState.filtersCollapsed));
  els.detailToggle?.setAttribute("aria-label", uiState.detailCollapsed ? "詳細を開く" : "詳細を畳む");
  els.detailToggle?.setAttribute("title", uiState.detailCollapsed ? "詳細を開く" : "詳細を畳む");
  els.detailToggle?.querySelector("i")?.setAttribute("data-lucide", uiState.detailCollapsed ? "panel-right-open" : "panel-right-close");

  requestAnimationFrame(() => {
    map?.invalidateSize();
    refreshIcons();
  });
}

function setUiState(nextState) {
  Object.assign(uiState, nextState);
  if (uiState.sidebarCollapsed) uiState.filtersCollapsed = true;
  persistUiState();
  applyUiState();
}

function persistShops() {
  localStorage.setItem(DATA_KEY, JSON.stringify(shops));
}

function normalizeShop(shop, index = 0, datasetId = activeDatasetId, dataset = datasets[datasetId]) {
  const id = shop.id || crypto.randomUUID();
  const address = cleanAddress(shop.address, shop.area);
  const admin = getAdministrativeArea({ ...shop, address });
  const location = normalizeLocation(shop, address);
  return {
    id,
    datasetId,
    datasetLabel: shop.datasetLabel || dataset?.label || "",
    rank: Number(shop.rank) || index + 1,
    name: shop.name?.trim() || "名称未設定",
    tabelogUrl: shop.tabelogUrl || shop.tabelog_url || "",
    area: shop.area || "",
    prefecture: admin.prefecture,
    municipality: admin.municipality,
    district: admin.district,
    locality: admin.locality,
    station: shop.station || "",
    address,
    lat: location.lat,
    lng: location.lng,
    genre: shop.genre || "立ち飲み",
    closed: shop.closed || "",
    phone: shop.phone || "",
    price: shop.price || "",
    rating: shop.rating || "",
    reviewCount: shop.reviewCount || "",
    hours: shop.hours || "",
    access: shop.access || "",
    seats: shop.seats || "",
    smoking: shop.smoking || "",
    instagramUrl: shop.instagramUrl || "",
    xUrl: shop.xUrl || "",
    officialUrls: Array.isArray(shop.officialUrls) ? shop.officialUrls : [],
    description: shop.description || "",
    sourceUrl: shop.sourceUrl || "",
    locationAccuracy: location.accuracy || shop.locationAccuracy || "",
    note: shop.note || ""
  };
}

function getAdministrativeArea(shop) {
  const fallbackPrefecture = shop.area || "";
  const source = cleanAddress(shop.address || `${shop.area ?? ""}${shop.station ?? ""}`, fallbackPrefecture)
    .replace(/\s+/g, "")
    .replaceAll("　", "");
  const prefecture = PREFECTURES.find((item) => source.startsWith(item))
    || PREFECTURES.find((item) => source.includes(item))
    || fallbackPrefecture;
  const prefIndex = prefecture ? source.indexOf(prefecture) : -1;
  const rest = cleanAdministrativeText(prefecture && prefIndex >= 0 ? source.slice(prefIndex + prefecture.length) : source);

  if (!prefecture) {
    return { prefecture: "", municipality: "", district: "", locality: "" };
  }

  if (prefecture === "東京都") {
    const tokyoLocality = rest.match(/^(.+?区|.+?市|.+?町|.+?村)/);
    const locality = normalizeLocality(tokyoLocality?.[1] ?? "");
    return {
      prefecture,
      municipality: locality.endsWith("区") ? "東京23区" : locality,
      district: locality.endsWith("区") ? locality : "",
      locality
    };
  }

  const designatedCity = DESIGNATED_CITIES.find((city) => rest.startsWith(city));
  if (designatedCity) {
    const ward = rest.slice(designatedCity.length).match(/^(.+?区)/);
    const district = normalizeLocality(ward?.[1] ?? "");
    return {
      prefecture,
      municipality: designatedCity,
      district,
      locality: district || designatedCity
    };
  }

  const locality = rest.match(/^(.+?市|.+?郡.+?町|.+?郡.+?村|.+?町|.+?村)/);
  const normalized = normalizeLocality(locality?.[1] ?? "");
  return { prefecture, municipality: normalized, district: "", locality: normalized };
}

function normalizeLocality(value) {
  const locality = cleanAdministrativeText(value);
  if (!locality) return "";
  if (/(駅|停留場|電停|バス停)$/.test(locality)) return "";
  if (/(駅|停留場|電停|バス停)/.test(locality) && !/[市区町村]$/.test(locality)) return "";
  return locality;
}

function cleanAdministrativeText(value) {
  return String(value ?? "")
    .trim()
    .replace(/^[\s\-ー－―−–—・･]+/, "")
    .trim();
}

function normalizeLocation(shop, address) {
  const lat = Number(shop.lat);
  const lng = Number(shop.lng);
  if (isValidCoordinatePair(lat, lng)) {
    return { lat, lng, accuracy: shop.locationAccuracy || "" };
  }

  const fallback = getRegionalCoordinate(address);
  if (fallback) {
    return {
      lat: fallback.lat,
      lng: fallback.lng,
      accuracy: "地域代表点"
    };
  }

  return { lat: Number.NaN, lng: Number.NaN, accuracy: "座標未取得" };
}

function getRegionalCoordinate(address) {
  const normalizedAddress = normalizeAddressKey(address);
  const match = REGION_COORDINATES.find(([key]) => normalizedAddress.startsWith(normalizeAddressKey(key)));
  return match ? { lat: match[1], lng: match[2] } : null;
}

function normalizeAddressKey(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replaceAll("　", "")
    .replace(/(都|道|府|県)[\-ー－―−–—・･]+/g, "$1");
}

function isValidCoordinatePair(lat, lng) {
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && !(lat === 0 && lng === 0)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180;
}

function cleanAddress(address, fallbackPrefecture = "") {
  let value = String(address || "").replaceAll("\\r\\n", "\n").replaceAll("\\n", "\n").replaceAll("\\r", "\n");
  const prefecture = PREFECTURES.find((item) => value.includes(item)) || fallbackPrefecture;
  if (prefecture && value.includes(prefecture)) {
    value = value.slice(value.indexOf(prefecture));
  }
  value = value
    .split(/\r?\n|●|周辺のお店|情報掲載日|【|"\s*,|"reviewRating"|}\]\}/)[0]
    .replace(/^住所[:：]?/, "")
    .replace(/〒\d{3}-?\d{4}/, "")
    .replace(/（地図）.*/, "")
    .replace(/(都|道|府|県)[\s\-ー－―−–—・･]+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return value || String(address || "").trim();
}

function getState(shopId) {
  return userState[shopId] ?? { status: "none", memo: "" };
}

function getQuery(shop) {
  return [shop.name, shop.area, shop.station].filter(Boolean).join(" ");
}

function getLinks(shop) {
  const query = encodeURIComponent(getQuery(shop));
  const addressQuery = encodeURIComponent([shop.name, shop.address].filter(Boolean).join(" "));
  const instaTag = encodeURIComponent(shop.name.replace(/\s+/g, ""));
  return {
    tabelog: shop.tabelogUrl,
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${addressQuery}`,
    googleReviews: `https://www.google.com/search?q=${query}%20Google%20%E3%82%AF%E3%83%81%E3%82%B3%E3%83%9F`,
    instagram: shop.instagramUrl || `https://www.instagram.com/explore/search/keyword/?q=${instaTag}`,
    x: shop.xUrl || ""
  };
}

function getFilteredShops() {
  const search = els.searchInput.value.trim().toLowerCase();
  const prefecture = els.prefectureFilter.value;
  const locality = els.localityFilter.value;
  const sort = els.sortSelect.value;

  const filtered = shops.filter((shop) => {
    const state = getState(shop.id);
    const haystack = [
      shop.name,
      shop.area,
      shop.prefecture,
      shop.municipality,
      shop.district,
      shop.locality,
      shop.station,
      shop.genre,
      shop.datasetLabel,
      shop.address,
      shop.closed,
      shop.phone,
      shop.price,
      shop.description,
      shop.note,
      state.memo
    ].join(" ").toLowerCase();
    const matchesSearch = !search || haystack.includes(search);
    const matchesPrefecture = prefecture === "all" || shop.prefecture === prefecture;
    const matchesLocality = locality === "all" || matchesLocalityFilter(shop, locality);
    return matchesSearch && matchesPrefecture && matchesLocality;
  });

  return filtered.sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "ja");
    if (sort === "area") {
      return getPrefectureOrder(a.prefecture) - getPrefectureOrder(b.prefecture)
        || getAreaLabel(a).localeCompare(getAreaLabel(b), "ja")
        || a.genre.localeCompare(b.genre, "ja")
        || a.rank - b.rank;
    }
    return a.datasetLabel.localeCompare(b.datasetLabel, "ja") || a.rank - b.rank;
  });
}

function getPrefectureOrder(prefecture) {
  return PREFECTURE_ORDER.get(prefecture) ?? 999;
}

function matchesLocalityFilter(shop, filterValue) {
  const parsed = parseLocalityFilterValue(filterValue);
  if (parsed.type === "municipality") {
    return shop.municipality === parsed.municipality || shop.locality === parsed.municipality;
  }
  if (parsed.type === "district") {
    return shop.municipality === parsed.municipality && shop.district === parsed.district;
  }
  return shop.locality === filterValue;
}

function parseLocalityFilterValue(value) {
  const [type, municipality = "", district = ""] = String(value).split("::");
  return { type, municipality, district };
}

function createLocalityFilterValue(type, municipality, district = "") {
  return [type, municipality, district].filter(Boolean).join("::");
}

function getAreaLabel(shop) {
  if (shop.municipality && shop.district) return `${shop.municipality} > ${shop.district}`;
  return shop.locality || shop.municipality || shop.station || "";
}

function renderAreaOptions() {
  const currentPrefecture = els.prefectureFilter.value || "all";
  const currentLocality = els.localityFilter.value || "all";
  const prefectures = [...new Set(shops.map((shop) => shop.prefecture).filter(Boolean))]
    .sort((a, b) => getPrefectureOrder(a) - getPrefectureOrder(b));

  els.prefectureFilter.innerHTML = [
    '<option value="all">全域</option>',
    ...prefectures.map((prefecture) => `<option value="${escapeHtml(prefecture)}">${escapeHtml(prefecture)}</option>`)
  ].join("");
  els.prefectureFilter.value = prefectures.includes(currentPrefecture) ? currentPrefecture : "all";

  const selectedPrefecture = els.prefectureFilter.value;
  const localityOptions = getLocalityOptions(selectedPrefecture);

  els.localityFilter.innerHTML = [
    '<option value="all">全域</option>',
    ...localityOptions.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
  ].join("");
  els.localityFilter.value = localityOptions.some((option) => option.value === currentLocality) ? currentLocality : "all";
}

function getLocalityOptions(selectedPrefecture) {
  const scopedShops = shops.filter((shop) => selectedPrefecture === "all" || shop.prefecture === selectedPrefecture);
  const grouped = new Map();

  scopedShops.forEach((shop) => {
    const municipality = normalizeLocality(shop.municipality || shop.locality);
    const district = normalizeLocality(shop.district);
    if (!municipality) return;
    if (!grouped.has(municipality)) grouped.set(municipality, new Set());
    if (district) grouped.get(municipality).add(district);
  });

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ja"))
    .flatMap(([municipality, districtSet]) => {
      const districts = [...districtSet].sort((a, b) => a.localeCompare(b, "ja"));
      if (districts.length === 0) {
        return [{
          value: createLocalityFilterValue("municipality", municipality),
          label: municipality
        }];
      }
      return [
        {
          value: createLocalityFilterValue("municipality", municipality),
          label: `${municipality} > 全域`
        },
        ...districts.map((district) => ({
          value: createLocalityFilterValue("district", municipality, district),
          label: `${municipality} > ${district}`
        }))
      ];
    });
}

function renderDatasetOptions() {
  const custom = localStorage.getItem(DATA_KEY)
    ? [['custom', { label: '取り込みデータ' }]]
    : [];
  const options = [
    [ALL_DATASETS_ID, { label: '全ジャンル' }],
    ...Object.entries(datasets),
    ...custom
  ];

  els.datasetSelect.innerHTML = options.map(([id, dataset]) => {
    return `<option value="${escapeHtml(id)}">${escapeHtml(dataset.label)}</option>`;
  }).join("");
  els.datasetSelect.value = activeDatasetId;
}

function renderList(filtered) {
  els.resultCount.textContent = `${filtered.length}件`;
  els.datasetLabel.textContent = activeDatasetId === ALL_DATASETS_ID
    ? "全ジャンル"
    : activeDatasetId === "custom"
    ? "取り込みデータ"
    : datasets[activeDatasetId]?.label ?? window.SEED_DATASET_LABEL ?? "初期データ";
  if (filtered.length > MAX_VISIBLE_MARKERS) {
    els.datasetLabel.textContent += ` / 地図は${MAX_VISIBLE_MARKERS}件以下で表示`;
  }

  if (filtered.length === 0) {
    els.shopList.innerHTML = '<div class="empty-state">条件に合う店舗がありません。</div>';
    return;
  }

  const visibleShops = filtered.slice(0, visibleListCount);
  const listHtml = visibleShops.map((shop) => {
    return `
      <button class="shop-card ${shop.id === selectedId ? "is-active" : ""}" type="button" data-shop-id="${shop.id}">
        <span class="rank">${shop.rank}</span>
        <span>
          <h3>${escapeHtml(shop.name)}</h3>
          <p>${escapeHtml([activeDatasetId === ALL_DATASETS_ID ? shop.genre : "", shop.prefecture, getAreaLabel(shop)].filter(Boolean).join(" / "))}</p>
          ${shop.price || shop.rating ? `<p>${escapeHtml([shop.rating ? `★${shop.rating}` : "", shop.price].filter(Boolean).join(" / "))}</p>` : ""}
          ${shop.closed ? `<p>定休日: ${escapeHtml(shop.closed)}</p>` : ""}
        </span>
      </button>
    `;
  }).join("");

  const moreHtml = filtered.length > visibleShops.length
    ? `
      <button class="load-more-button" type="button" data-load-more>
        さらに表示（${visibleShops.length} / ${filtered.length}）
      </button>
    `
    : "";

  els.shopList.innerHTML = listHtml + moreHtml;
}

function renderMap(filtered, options = {}) {
  markerLayer.clearLayers();
  markers = new Map();

  const valid = filtered.filter((shop) => isValidCoordinatePair(shop.lat, shop.lng));
  const visible = valid.length > MAX_VISIBLE_MARKERS ? [] : valid;

  visible.forEach((shop) => {
    const marker = L.marker([shop.lat, shop.lng], {
      icon: createShopIcon(shop)
    }).addTo(markerLayer);
    marker.bindPopup(`
      <strong>${escapeHtml(shop.name)}</strong><br>
      ${escapeHtml([shop.area, shop.station].filter(Boolean).join(" / "))}<br>
      ${shop.address ? `${escapeHtml(shop.address)}<br>` : ""}
      ${shop.closed ? `定休日: ${escapeHtml(shop.closed)}` : ""}
    `);
    marker.on("click", () => selectShop(shop.id));
    markers.set(shop.id, marker);
  });

  const signature = visible.map((shop) => shop.id).join("|");
  const shouldFit = options.forceFit || signature !== lastMapSignature;
  lastMapSignature = signature;

  requestAnimationFrame(() => {
    map.invalidateSize();
    if (!shouldFit) return;

    if (visible.length > 1) {
      map.fitBounds(L.latLngBounds(visible.map((shop) => [shop.lat, shop.lng])), {
        paddingTopLeft: [52, 52],
        paddingBottomRight: [52, 52],
        maxZoom: FILTERED_MAX_ZOOM
      });
    } else if (visible.length === 1) {
      map.setView([visible[0].lat, visible[0].lng], SINGLE_RESULT_ZOOM);
    }
  });
}

function openSelectedPopup() {
  const marker = markers.get(selectedId);
  if (marker) {
    updateMarkerIcons();
    requestAnimationFrame(() => marker.openPopup());
  }
}

function focusSelectedMarker() {
  const shop = shops.find((item) => item.id === selectedId);
  if (!shop || !isValidCoordinatePair(shop.lat, shop.lng)) return;

  requestAnimationFrame(() => {
    map.invalidateSize();
    updateMarkerIcons();
    map.setView([shop.lat, shop.lng], SELECTED_SHOP_ZOOM, { animate: true });
    markers.get(shop.id)?.openPopup();
  });
}

function createShopIcon(shop) {
  const isSelected = shop.id === selectedId;
  const label = getPinLabel(shop);
  const classes = [
    "shop-map-pin",
    isSelected ? "is-selected" : ""
  ].filter(Boolean).join(" ");

  return L.divIcon({
    className: "",
    html: `<span class="${classes}"><span>${escapeHtml(label)}</span></span>`,
    iconSize: isSelected ? [34, 42] : [28, 36],
    iconAnchor: isSelected ? [17, 42] : [14, 36],
    popupAnchor: [0, isSelected ? -38 : -32]
  });
}

function getPinLabel(shop) {
  if (activeDatasetId !== ALL_DATASETS_ID) return String(shop.rank);
  return `${getGenrePrefix(shop)}${shop.rank}`;
}

function getGenrePrefix(shop) {
  const source = String(shop.genre || shop.datasetLabel || "").trim();
  const map = [
    [/アジア|エスニック/, "亜"],
    [/カレー/, "カ"],
    [/中国料理/, "中"],
    [/焼き鳥/, "鳥"],
    [/焼肉/, "焼"],
    [/ステーキ|鉄板/, "鉄"],
    [/フレンチ/, "仏"],
    [/日本料理/, "和"],
    [/ハンバーガー/, "バ"],
    [/とんかつ/, "豚"],
    [/ラーメン/, "麺"],
    [/うどん/, "饂"],
    [/そば/, "蕎"],
    [/寿司|鮨/, "鮨"],
    [/食堂/, "食"],
    [/スペイン/, "西"],
    [/イタリアン/, "伊"],
    [/ピザ/, "ピ"],
    [/スイーツ|ケーキ|パン|ジェラート|和菓子/, "甘"],
    [/立ち飲み/, "立"],
    [/居酒屋/, "居"]
  ];
  const found = map.find(([pattern]) => pattern.test(source));
  return found ? found[1] : source.slice(0, 1) || "?";
}

function updateMarkerIcons() {
  markers.forEach((marker, shopId) => {
    const shop = shops.find((item) => item.id === shopId);
    if (shop) marker.setIcon(createShopIcon(shop));
  });
}

function renderDetail() {
  const shop = shops.find((item) => item.id === selectedId) ?? shops[0];
  if (!shop) {
    els.shopDetail.innerHTML = '<div class="empty-state">店舗データがありません。</div>';
    return;
  }
  selectedId = shop.id;
  ensureDetailsLoaded(shop);
  const detail = getShopDetail(shop);
  const view = { ...shop, ...detail };
  const state = getState(shop.id);
  const links = getLinks(view);
  const sourceLink = view.sourceUrl || datasets[shop.datasetId]?.sourceUrl || "https://award.tabelog.com/hyakumeiten";
  const isDetailPending = detailLoadPromises.has(shop.datasetId) && !detailDataByDataset.has(shop.datasetId);
  const factsHtml = [
    detailFact("選出", view.datasetLabel || "百名店"),
    detailFact("住所", view.address),
    detailFact("最寄り", view.station),
    detailFact("電話", view.phone, view.phone ? `<a href="tel:${escapeHtml(view.phone)}">${escapeHtml(view.phone)}</a>` : ""),
    detailFact("予算", view.price),
    detailFact("定休日", view.closed),
    detailFact("席数", view.seats),
    detailFact("喫煙", view.smoking),
    detailFact("営業時間", compactText(view.hours)),
    detailFact("交通", compactText(view.access)),
    detailFact("地図精度", view.locationAccuracy),
    detailFact("掲載元", sourceLink, `<a href="${sourceLink}" target="_blank" rel="noopener noreferrer">食べログ百名店</a>`)
  ].filter(Boolean).join("");

  els.shopDetail.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>${escapeHtml(view.name)}</h2>
        <p class="detail-meta">${escapeHtml([view.area, view.station, view.genre].filter(Boolean).join(" / "))}</p>
      </div>
      <span class="rank">${view.rank}</span>
    </div>

    ${factsHtml ? `<dl class="shop-facts">${factsHtml}</dl>` : ""}

    <div class="detail-actions">
      ${links.tabelog ? linkButton(links.tabelog, "external-link", "食べログ") : ""}
      ${linkButton(links.googleMaps, "map-pin", "Google Maps")}
      ${linkButton(links.googleReviews, "search", "Googleクチコミ")}
      ${linkButton(links.instagram, "instagram", "Instagram")}
      ${links.x ? linkButton(links.x, "message-circle", "X") : ""}
    </div>

    ${isDetailPending ? `<p class="shop-description">詳細情報を読み込み中です。最新情報は食べログで確認してください。</p>` : ""}
    ${view.description ? `<p class="shop-description">${escapeHtml(compactText(view.description))}</p>` : ""}

    <label class="memo-field">
      <span>メモ</span>
      <textarea id="memoInput" placeholder="注文したもの、混雑、再訪メモなど">${escapeHtml(state.memo ?? view.note ?? "")}</textarea>
    </label>
  `;

  openSelectedPopup();
  refreshIcons();
}

function detailFact(label, value, html = "") {
  if (value === undefined || value === null || value === "") return "";
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${html || escapeHtml(value)}</dd>
    </div>
  `;
}

function getShopDetail(shop) {
  if (!shop?.id || !shop.datasetId) return {};
  return detailDataByDataset.get(shop.datasetId)?.[shop.id] ?? {};
}

function ensureDetailsLoaded(shop) {
  if (activeDatasetId === "custom" || !shop?.datasetId) return;
  if (detailDataByDataset.has(shop.datasetId) || detailLoadPromises.has(shop.datasetId) || detailLoadFailures.has(shop.datasetId)) return;
  if (typeof fetch !== "function" || !window.location?.href || window.location.protocol === "file:") return;

  const detailUrl = `${DETAIL_DATA_PREFIX}${shop.datasetId}.json`;
  const promise = fetch(detailUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`detail load failed: ${response.status}`);
      return response.json();
    })
    .then((data) => {
      detailDataByDataset.set(shop.datasetId, data && typeof data === "object" ? data : {});
      if (selectedId === shop.id) renderDetail();
    })
    .catch(() => {
      detailLoadFailures.add(shop.datasetId);
    })
    .finally(() => {
      detailLoadPromises.delete(shop.datasetId);
    });
  detailLoadPromises.set(shop.datasetId, promise);
}

function linkButton(href, icon, label) {
  return `
    <a class="link-button" href="${href}" target="_blank" rel="noopener noreferrer">
      <i data-lucide="${icon}"></i>
      ${label}
    </a>
  `;
}

function compactText(value, maxLength = 160) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function render(options = {}) {
  if (options.resetList) resetListWindow();
  renderDatasetOptions();
  renderAreaOptions();
  const filtered = getFilteredShops();
  if (!filtered.some((shop) => shop.id === selectedId)) {
    selectedId = filtered[0]?.id ?? shops[0]?.id ?? null;
  }
  renderList(filtered);
  renderMap(filtered, { forceFit: options.forceFit });
  renderDetail();
  updateUrlState();
  refreshIcons();
}

function selectShop(shopId, options = {}) {
  selectedId = shopId;
  const filtered = getFilteredShops();
  ensureSelectedListItemVisible(filtered);
  renderList(filtered);
  renderDetail();
  updateMarkerIcons();
  if (options.focusMap) focusSelectedMarker();
  updateUrlState();
}

function resetListWindow() {
  visibleListCount = LIST_RENDER_BATCH;
}

function expandListWindow() {
  visibleListCount += LIST_RENDER_BATCH;
}

function ensureSelectedListItemVisible(filtered) {
  const index = filtered.findIndex((shop) => shop.id === selectedId);
  if (index >= visibleListCount) {
    visibleListCount = Math.ceil((index + 1) / LIST_RENDER_BATCH) * LIST_RENDER_BATCH;
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells, index) => {
    const record = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]?.trim() ?? ""]));
    return normalizeShop(record, index);
  }).filter((shop) => shop.name && isValidCoordinatePair(shop.lat, shop.lng));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

els.sidebarToggle.addEventListener("click", () => {
  setUiState({ sidebarCollapsed: !uiState.sidebarCollapsed });
});

els.filtersToggle.addEventListener("click", () => {
  setUiState({ filtersCollapsed: !uiState.filtersCollapsed });
});

els.detailToggle.addEventListener("click", () => {
  setUiState({ detailCollapsed: !uiState.detailCollapsed });
});

els.searchInput.addEventListener("input", () => render({ resetList: true }));
els.datasetSelect.addEventListener("change", () => {
  activeDatasetId = els.datasetSelect.value;
  localStorage.setItem(ACTIVE_DATASET_KEY, activeDatasetId);
  shops = loadShops();
  selectedId = shops[0]?.id ?? null;
  lastMapSignature = "";
  els.prefectureFilter.value = "all";
  els.localityFilter.value = "all";
  render({ forceFit: true, resetList: true });
});
els.prefectureFilter.addEventListener("change", () => {
  els.localityFilter.value = "all";
  render({ forceFit: true, resetList: true });
});
els.localityFilter.addEventListener("change", () => render({ forceFit: true, resetList: true }));
els.sortSelect.addEventListener("change", () => render({ resetList: true }));

els.shopList.addEventListener("click", (event) => {
  const moreButton = event.target.closest("[data-load-more]");
  if (moreButton) {
    expandListWindow();
    renderList(getFilteredShops());
    return;
  }

  const card = event.target.closest("[data-shop-id]");
  if (card) selectShop(card.dataset.shopId, { focusMap: true });
});

els.shopDetail.addEventListener("input", (event) => {
  if (event.target.id !== "memoInput" || !selectedId) return;
  userState[selectedId] = {
    ...getState(selectedId),
    memo: event.target.value
  };
  persistUserState();
  renderList(getFilteredShops());
});

els.importButton.addEventListener("click", () => {
  els.csvInput.value = "";
  els.importDialog.showModal();
  refreshIcons();
});

els.applyImportButton.addEventListener("click", () => {
  const imported = parseCsv(els.csvInput.value);
  if (imported.length === 0) {
    els.csvInput.setCustomValidity("有効なCSVを貼り付けてください。");
    els.csvInput.reportValidity();
    els.csvInput.setCustomValidity("");
    return;
  }
  shops = imported;
  activeDatasetId = "custom";
  localStorage.setItem(ACTIVE_DATASET_KEY, activeDatasetId);
  selectedId = shops[0]?.id ?? null;
  persistShops();
  els.importDialog.close();
  lastMapSignature = "";
  render({ forceFit: true, resetList: true });
});

els.resetButton.addEventListener("click", () => {
  localStorage.removeItem(DATA_KEY);
  localStorage.removeItem(STORAGE_KEY);
  activeDatasetId = window.DEFAULT_DATASET_ID && datasets[window.DEFAULT_DATASET_ID]
    ? ALL_DATASETS_ID
    : Object.keys(datasets)[0];
  localStorage.setItem(ACTIVE_DATASET_KEY, activeDatasetId);
  shops = loadShops();
  userState = {};
  selectedId = shops[0]?.id ?? null;
  lastMapSignature = "";
  render({ forceFit: true, resetList: true });
});

render();
