(function () {
"use strict";

const GITHUB_OWNER = "PythDom";
const GITHUB_REPO = "Launcher";
const DATA_PATH = "data/shortcuts.json";
const API_BASE = "https://api.github.com/repos/" + GITHUB_OWNER + "/" + GITHUB_REPO + "/contents/";
const PRODUCTION_HOST = "pythdom.github.io";

const DRAFT_KEY = "portalDraft";
const TOKEN_KEY = "portalToken";
const SHA_KEY = "portalDataSha";

// Last-resort seed used only if both the network and the service worker cache
// fail on a first-ever load (e.g. first visit happens offline).
const FALLBACK_DATA = { categories: [{ id: "start", name: "Get Started", open: true, items: [] }] };

// A web page has no way to read the list of apps actually installed on the
// phone (no browser exposes that, for privacy reasons) — this is a curated
// list of common package names offered as a quick-pick shortcut instead of
// manual typing. Anything not listed can still be entered by hand.
const POPULAR_APPS = [
    { name: "WhatsApp", package: "com.whatsapp" },
    { name: "Messenger", package: "com.facebook.orca" },
    { name: "Instagram", package: "com.instagram.android" },
    { name: "Facebook", package: "com.facebook.katana" },
    { name: "Telegram", package: "org.telegram.messenger" },
    { name: "Signal", package: "org.thoughtcrime.securesms" },
    { name: "Snapchat", package: "com.snapchat.android" },
    { name: "Twitter / X", package: "com.twitter.android" },
    { name: "Discord", package: "com.discord" },
    { name: "TikTok", package: "com.zhiliaoapp.musically" },
    { name: "LinkedIn", package: "com.linkedin.android" },
    { name: "Slack", package: "com.Slack" },
    { name: "Microsoft Teams", package: "com.microsoft.teams" },
    { name: "Viber", package: "com.viber.voip" },
    { name: "Skype", package: "com.skype.raider" },
    { name: "Gmail", package: "com.google.android.gm" },
    { name: "Google Maps", package: "com.google.android.apps.maps" },
    { name: "Google Photos", package: "com.google.android.apps.photos" },
    { name: "Google Drive", package: "com.google.android.apps.docs" },
    { name: "YouTube", package: "com.google.android.youtube" },
    { name: "YouTube Music", package: "com.google.android.apps.youtube.music" },
    { name: "Chrome", package: "com.android.chrome" },
    { name: "Google Calendar", package: "com.google.android.calendar" },
    { name: "Google Keep", package: "com.google.android.keep" },
    { name: "Google Authenticator", package: "com.google.android.apps.authenticator2" },
    { name: "Spotify", package: "com.spotify.music" },
    { name: "Netflix", package: "com.netflix.mediaclient" },
    { name: "Disney+", package: "com.disney.disneyplus" },
    { name: "Amazon Prime Video", package: "com.amazon.avod.thirdpartyclient" },
    { name: "VLC", package: "org.videolan.vlc" },
    { name: "Audible", package: "com.audible.application" },
    { name: "Kindle", package: "com.amazon.kindle" },
    { name: "PayPal", package: "com.paypal.android.p2pmobile" },
    { name: "Revolut", package: "com.revolut.revolut" },
    { name: "N26", package: "de.number26.android" },
    { name: "Wise", package: "com.transferwise.android" },
    { name: "Amazon Shopping", package: "com.amazon.mShop.android.shopping" },
    { name: "eBay", package: "com.ebay.mobile" },
    { name: "Uber", package: "com.ubercab" },
    { name: "Bolt", package: "ee.mtakso.client" },
    { name: "Waze", package: "com.waze" },
    { name: "Booking.com", package: "com.booking" },
    { name: "Airbnb", package: "com.airbnb.android" },
    { name: "Microsoft Outlook", package: "com.microsoft.office.outlook" },
    { name: "Zoom", package: "us.zoom.videomeetings" },
    { name: "Notion", package: "notion.id" },
    { name: "Todoist", package: "com.todoist" },
    { name: "Duolingo", package: "com.duolingo" },
    { name: "Google Play Store", package: "com.android.vending" },
    { name: "F-Droid", package: "org.fdroid.fdroid" }
];

let shortcutsData = null;
let lastKnownSha = localStorage.getItem(SHA_KEY) || null;
let editMode = false;
let currentEditItemId = null;
let syncTimer = null;
let syncing = false;
let lastSyncAt = 0;
const MIN_SYNC_INTERVAL_MS = 15000;

// ---------- data load ----------

async function loadData() {
    const draftRaw = localStorage.getItem(DRAFT_KEY);
    let draft = null;
    try { draft = draftRaw ? JSON.parse(draftRaw) : null; } catch (e) { draft = null; }

    let remote = null;
    try {
        const res = await fetch("./" + DATA_PATH, { cache: "no-store" });
        if (res.ok) remote = await res.json();
    } catch (e) {
        // offline and not yet cached — fine, fall through
    }

    if (draft && draft.dirty) {
        // Unsynced local edits take priority over whatever is on GitHub.
        return draft.data;
    }
    if (remote) return remote;
    if (draft) return draft.data;
    return JSON.parse(JSON.stringify(FALLBACK_DATA));
}

function saveDraft(dirty) {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ data: shortcutsData, dirty: dirty !== false }));
    updateStatus();
    if (dirty !== false) scheduleAutoSync();
}

function isDirty() {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return false;
    try { return !!JSON.parse(raw).dirty; } catch (e) { return false; }
}

function generateId() {
    return "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- icon helpers ----------

function normalizeIconUrl(url) {
    const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (m) return "https://drive.google.com/thumbnail?id=" + m[1];
    return url;
}

function placeholderIcon(name) {
    const letter = ((name || "?").trim().charAt(0) || "?").toUpperCase();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150">'
        + '<rect width="100%" height="100%" rx="24" fill="#9aa0a6"/>'
        + '<text x="50%" y="58%" font-size="72" fill="white" text-anchor="middle" font-family="Arial">' + letter + '</text>'
        + '</svg>';
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function resolveIconSrc(icon, name) {
    if (!icon) return placeholderIcon(name);
    return icon;
}

function fileToIconDataURL(file, maxDim) {
    maxDim = maxDim || 160;
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                canvas.getContext("2d").drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/png"));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ---------- href computation ----------

function navigateTo(href) {
    // Android's Chrome (including installed PWAs/WebAPKs) only reliably
    // hands an intent:// URL off to the OS when it comes from a real <a>
    // element being clicked — a script-driven location.href assignment is
    // often silently ignored for intent:// (regular http(s) links work
    // fine either way, but app shortcuts need the real-anchor path).
    const a = document.createElement("a");
    a.href = href;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1000);
}

function computeHref(item) {
    if (item.type === "app") {
        const pkg = item.package || "";
        const fallback = item.fallbackUrl || ("https://play.google.com/store/apps/details?id=" + pkg);
        return "intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package="
            + pkg + ";S.browser_fallback_url=" + encodeURIComponent(fallback) + ";end";
    }
    return item.url || "#";
}

// ---------- rendering ----------

function render() {
    const container = document.getElementById("categories");
    container.innerHTML = "";

    shortcutsData.categories.forEach((cat, ci) => {
        const details = document.createElement("details");
        details.open = cat.open !== false;
        // Note: setting .open programmatically can itself fire a "toggle"
        // event in current browsers. Update the in-memory state so the UI
        // stays consistent, but do NOT persist/sync from this listener —
        // doing so previously caused an infinite render -> toggle -> sync
        // -> render loop that repeatedly overwrote real data with stale
        // copies. Open/closed section state is intentionally session-only.
        details.addEventListener("toggle", () => {
            cat.open = details.open;
        });

        const summary = document.createElement("summary");
        const nameSpan = document.createElement("span");
        nameSpan.textContent = cat.name;
        summary.appendChild(nameSpan);

        if (editMode) {
            const controls = document.createElement("span");
            controls.className = "cat-controls";
            controls.innerHTML =
                '<button data-action="rename" title="Rename">✏️</button>'
                + '<button data-action="up" title="Move up">▲</button>'
                + '<button data-action="down" title="Move down">▼</button>'
                + '<button data-action="del" title="Delete">🗑️</button>';
            controls.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                const action = e.target.getAttribute("data-action");
                if (!action) return;
                if (action === "rename") renameCategory(cat.id);
                if (action === "up") moveCategory(ci, -1);
                if (action === "down") moveCategory(ci, 1);
                if (action === "del") deleteCategory(cat.id);
            });
            summary.appendChild(controls);
        }
        details.appendChild(summary);

        const grid = document.createElement("div");
        grid.className = "grid";
        cat.items.forEach((item) => grid.appendChild(renderItem(cat.id, item)));

        if (editMode) {
            const addTile = document.createElement("div");
            addTile.className = "item add-tile";
            addTile.innerHTML = '<div class="add-plus">+</div><div class="item-label">Add</div>';
            addTile.onclick = () => openItemModal(cat.id, null);
            grid.appendChild(addTile);
        }

        details.appendChild(grid);
        container.appendChild(details);
    });

    if (editMode) {
        const addCat = document.createElement("div");
        addCat.style.textAlign = "center";
        addCat.style.margin = "16px 10px";
        const btn = document.createElement("button");
        btn.textContent = "+ Add Category";
        btn.style.padding = "10px 16px";
        btn.style.borderRadius = "8px";
        btn.onclick = addCategoryPrompt;
        addCat.appendChild(btn);
        container.appendChild(addCat);
    }

    applySearch();
}

function renderItem(catId, item) {
    const div = document.createElement("div");
    div.className = "item" + (editMode ? " editing" : "");
    div.setAttribute("data-search", ((item.name || "") + " " + (item.tags || "")).toLowerCase());

    const img = document.createElement("img");
    img.src = resolveIconSrc(item.icon, item.name);
    img.loading = "lazy";
    img.onerror = () => { img.src = placeholderIcon(item.name); };
    div.appendChild(img);

    const label = document.createElement("div");
    label.className = "item-label";
    label.textContent = item.name;
    div.appendChild(label);

    div.onclick = () => {
        if (editMode) {
            openItemModal(catId, item.id);
        } else {
            navigateTo(computeHref(item));
        }
    };
    return div;
}

function applySearch() {
    const q = document.getElementById("search").value.toLowerCase().trim();
    document.querySelectorAll(".item").forEach((item) => {
        if (item.classList.contains("add-tile")) return;
        const hay = item.getAttribute("data-search") || "";
        item.style.display = (q === "" || hay.includes(q)) ? "" : "none";
    });
}

// ---------- category actions ----------

function addCategoryPrompt() {
    const name = prompt("New category name:");
    if (!name) return;
    shortcutsData.categories.push({ id: generateId(), name: name.trim(), open: true, items: [] });
    saveDraft();
    render();
}

function renameCategory(catId) {
    const cat = shortcutsData.categories.find((c) => c.id === catId);
    if (!cat) return;
    const name = prompt("Rename category:", cat.name);
    if (!name) return;
    cat.name = name.trim();
    saveDraft();
    render();
}

function moveCategory(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= shortcutsData.categories.length) return;
    const arr = shortcutsData.categories;
    const tmp = arr[index]; arr[index] = arr[target]; arr[target] = tmp;
    saveDraft();
    render();
}

function deleteCategory(catId) {
    const cat = shortcutsData.categories.find((c) => c.id === catId);
    if (!cat) return;
    const ok = confirm('Delete category "' + cat.name + '" and its ' + cat.items.length + ' shortcut(s)?');
    if (!ok) return;
    shortcutsData.categories = shortcutsData.categories.filter((c) => c.id !== catId);
    saveDraft();
    render();
}

// ---------- item modal ----------

let pendingIconData = null;
let iconProcessing = null;

function populateCategorySelect(selectedId) {
    const sel = document.getElementById("f-category");
    sel.innerHTML = "";
    shortcutsData.categories.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat.id;
        opt.textContent = cat.name;
        if (cat.id === selectedId) opt.selected = true;
        sel.appendChild(opt);
    });
}

function setTypeFieldsVisibility(type) {
    document.getElementById("f-link-fields").style.display = type === "link" ? "block" : "none";
    document.getElementById("f-app-fields").style.display = type === "app" ? "block" : "none";
}

function renderAppPickerResults(query) {
    const box = document.getElementById("f-app-picker-results");
    const q = query.trim().toLowerCase();
    if (!q) { box.innerHTML = ""; box.classList.remove("show"); return; }
    const matches = POPULAR_APPS.filter((a) =>
        a.name.toLowerCase().includes(q) || a.package.toLowerCase().includes(q)
    ).slice(0, 8);
    if (!matches.length) { box.innerHTML = '<div class="picker-empty">No match — type the package name manually below.</div>'; box.classList.add("show"); return; }
    box.innerHTML = "";
    matches.forEach((a) => {
        const row = document.createElement("div");
        row.className = "picker-item";
        row.textContent = a.name + " — " + a.package;
        row.onclick = () => {
            document.getElementById("f-package").value = a.package;
            document.getElementById("f-package").dispatchEvent(new Event("input"));
            if (!document.getElementById("f-name").value.trim()) {
                document.getElementById("f-name").value = a.name;
            }
            document.getElementById("f-app-picker").value = "";
            box.innerHTML = "";
            box.classList.remove("show");
        };
        box.appendChild(row);
    });
    box.classList.add("show");
}

function openItemModal(catId, itemId) {
    currentEditItemId = itemId;
    pendingIconData = null;
    iconProcessing = null;

    populateCategorySelect(catId);
    document.getElementById("f-icon-file").value = "";
    document.getElementById("f-fallback").dataset.userEdited = "";
    document.getElementById("f-app-picker").value = "";
    document.getElementById("f-app-picker-results").innerHTML = "";
    document.getElementById("f-app-picker-results").classList.remove("show");
    const saveBtn = document.getElementById("f-save");
    saveBtn.disabled = false;
    saveBtn.textContent = "Save";

    let item = null;
    if (itemId) {
        const cat = shortcutsData.categories.find((c) => c.id === catId);
        item = cat ? cat.items.find((i) => i.id === itemId) : null;
    }

    document.getElementById("itemModalTitle").textContent = item ? "Edit Shortcut" : "Add Shortcut";
    document.getElementById("f-delete").style.display = item ? "inline-block" : "none";

    document.getElementById("f-name").value = item ? item.name : "";
    document.getElementById("f-type").value = item ? item.type : "link";
    setTypeFieldsVisibility(item ? item.type : "link");
    document.getElementById("f-url").value = item && item.type === "link" ? (item.url || "") : "";
    document.getElementById("f-package").value = item && item.type === "app" ? (item.package || "") : "";
    document.getElementById("f-fallback").value = item && item.type === "app" ? (item.fallbackUrl || "") : "";
    document.getElementById("f-icon-url").value = item && item.icon && !item.icon.startsWith("data:") ? item.icon : "";
    updateIconPreview(item ? item.icon : "");

    document.getElementById("itemModal").classList.add("open");
}

function closeItemModal() {
    document.getElementById("itemModal").classList.remove("open");
    currentEditItemId = null;
    pendingIconData = null;
}

function updateIconPreview(src) {
    const img = document.getElementById("f-icon-preview");
    img.src = src || placeholderIcon(document.getElementById("f-name").value);
}

async function saveItemFromModal() {
    if (iconProcessing) {
        document.getElementById("f-save").disabled = true;
        document.getElementById("f-save").textContent = "Processing icon…";
        await iconProcessing;
        document.getElementById("f-save").disabled = false;
        document.getElementById("f-save").textContent = "Save";
    }

    const catId = document.getElementById("f-category").value;
    const name = document.getElementById("f-name").value.trim();
    if (!name) { alert("Name is required."); return; }
    if (!catId) { alert("Pick a category."); return; }

    const type = document.getElementById("f-type").value;
    const item = {
        id: currentEditItemId || generateId(),
        name: name,
        type: type,
        tags: name.toLowerCase()
    };

    if (type === "app") {
        const pkg = document.getElementById("f-package").value.trim();
        if (!pkg) { alert("Package name is required for an app shortcut."); return; }
        item.package = pkg;
        item.fallbackUrl = document.getElementById("f-fallback").value.trim()
            || ("https://play.google.com/store/apps/details?id=" + pkg);
    } else {
        const url = document.getElementById("f-url").value.trim();
        if (!url) { alert("URL is required."); return; }
        item.url = url;
    }

    const iconUrlField = normalizeIconUrl(document.getElementById("f-icon-url").value.trim());
    item.icon = pendingIconData || iconUrlField || "";

    if (currentEditItemId) {
        shortcutsData.categories.forEach((c) => {
            c.items = c.items.filter((i) => i.id !== currentEditItemId);
        });
    }
    const targetCat = shortcutsData.categories.find((c) => c.id === catId);
    targetCat.items.push(item);

    closeItemModal();
    saveDraft();
    render();
    toast(navigator.onLine ? "Saved — syncing to GitHub…" : "Saved on this device — will sync when back online.");
}

function deleteItemFromModal() {
    if (!currentEditItemId) return;
    const ok = confirm("Delete this shortcut?");
    if (!ok) return;
    shortcutsData.categories.forEach((c) => {
        c.items = c.items.filter((i) => i.id !== currentEditItemId);
    });
    closeItemModal();
    saveDraft();
    render();
}

// ---------- backup export / import ----------

function exportJSON() {
    const blob = new Blob([JSON.stringify(shortcutsData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shortcuts-backup.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast("Backup downloaded.");
}

function importJSONFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!parsed || !Array.isArray(parsed.categories)) throw new Error("Invalid backup file.");
            shortcutsData = parsed;
            saveDraft();
            render();
            toast("Backup restored — tap Sync to push it to GitHub.");
        } catch (err) {
            alert("Could not read that file: " + err.message);
        }
    };
    reader.readAsText(file);
}

// ---------- GitHub sync ----------

function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
}

function ghHeaders() {
    return {
        "Authorization": "Bearer " + getToken(),
        "Accept": "application/vnd.github+json"
    };
}

function base64EncodeUnicode(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

async function ghGetFile(path) {
    const res = await fetch(API_BASE + encodeURI(path), { headers: ghHeaders(), cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("GitHub GET " + path + " failed: " + res.status);
    return res.json();
}

async function ghPutFile(path, contentBase64, message, sha) {
    const body = { message: message, content: contentBase64 };
    if (sha) body.sha = sha;
    const res = await fetch(API_BASE + encodeURI(path), {
        method: "PUT",
        headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const errBody = await res.text();
        throw new Error("GitHub PUT " + path + " failed: " + res.status + " " + errBody);
    }
    return res.json();
}

async function uploadPendingIcons() {
    for (const cat of shortcutsData.categories) {
        for (const item of cat.items) {
            if (item.icon && item.icon.startsWith("data:")) {
                const m = item.icon.match(/^data:(image\/\w+);base64,(.+)$/);
                if (!m) continue;
                const ext = m[1].split("/")[1] === "jpeg" ? "jpg" : m[1].split("/")[1];
                const path = "icons/" + item.id + "." + ext;
                let existingSha;
                try {
                    const existing = await ghGetFile(path);
                    if (existing) existingSha = existing.sha;
                } catch (e) {
                    // couldn't check — attempt a plain create below
                }
                await ghPutFile(path, m[2], "Add icon for " + item.name, existingSha);
                item.icon = path;
            }
        }
    }
}

async function syncToGitHub(silent) {
    if (!isDirty()) return;
    if (location.hostname !== PRODUCTION_HOST) {
        console.warn("Sync to GitHub skipped: not running on " + PRODUCTION_HOST + " (host is " + location.hostname + ").");
        return;
    }
    if (!navigator.onLine) {
        if (!silent) toast("Offline — will sync automatically when you're back online.");
        return;
    }
    if (!getToken()) {
        if (!silent) { toast("No GitHub token saved yet — opening Settings."); openSettingsModal(); }
        return;
    }
    if (syncing) return;
    if (Date.now() - lastSyncAt < MIN_SYNC_INTERVAL_MS) {
        console.warn("Sync rate-limited — too soon since last sync.");
        return;
    }
    syncing = true;
    lastSyncAt = Date.now();
    updateStatus("syncing");
    try {
        await uploadPendingIcons();
        const current = await ghGetFile(DATA_PATH);
        const sha = current ? current.sha : undefined;
        const content = base64EncodeUnicode(JSON.stringify(shortcutsData, null, 2));
        const result = await ghPutFile(DATA_PATH, content, "Update shortcuts from device", sha);
        lastKnownSha = result.content.sha;
        localStorage.setItem(SHA_KEY, lastKnownSha);
        saveDraft(false);
        toast("Synced to GitHub ✓");
    } catch (err) {
        console.error(err);
        toast("Sync failed — will retry. (" + err.message + ")");
    } finally {
        syncing = false;
        updateStatus();
    }
}

function scheduleAutoSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncToGitHub(true), 4000);
}

function updateStatus(forceState) {
    const dot = document.getElementById("statusDot");
    if (!dot) return;
    let state = forceState;
    if (!state) {
        if (!navigator.onLine) state = isDirty() ? "offline-dirty" : "offline";
        else state = isDirty() ? "dirty" : "synced";
    }
    dot.className = "status-dot status-" + state;
    dot.title = {
        "synced": "Synced with GitHub",
        "dirty": "Unsynced changes — syncing shortly",
        "syncing": "Syncing to GitHub…",
        "offline": "Offline",
        "offline-dirty": "Offline — changes saved on this device, will sync when back online"
    }[state] || "";
}

function openSettingsModal() {
    document.getElementById("f-token").value = getToken();
    document.getElementById("settingsRepoLabel").textContent = GITHUB_OWNER + "/" + GITHUB_REPO;
    document.getElementById("settingsModal").classList.add("open");
}

function closeSettingsModal() {
    document.getElementById("settingsModal").classList.remove("open");
}

async function testConnection() {
    const tokenField = document.getElementById("f-token").value.trim();
    const prevToken = getToken();
    setToken(tokenField);
    const status = document.getElementById("settingsStatus");
    status.textContent = "Testing…";
    try {
        const res = await fetch("https://api.github.com/repos/" + GITHUB_OWNER + "/" + GITHUB_REPO, { headers: ghHeaders() });
        if (res.ok) {
            status.textContent = "✓ Connected to " + GITHUB_OWNER + "/" + GITHUB_REPO;
        } else {
            status.textContent = "✗ Failed (" + res.status + ") — check the token's repo access and permissions.";
            setToken(prevToken);
        }
    } catch (e) {
        status.textContent = "✗ Network error: " + e.message;
        setToken(prevToken);
    }
}

// ---------- toast ----------

let toastTimer = null;
function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

// ---------- edit mode toggle ----------

function setEditMode(on) {
    editMode = on;
    document.body.classList.toggle("editing", editMode);
    document.getElementById("editToggle").textContent = editMode ? "✓ Done" : "✏️ Edit";
    document.getElementById("toolbar").style.display = editMode ? "flex" : "none";
    render();
}

// ---------- wire up ----------

document.addEventListener("DOMContentLoaded", async () => {
    shortcutsData = await loadData();
    render();
    updateStatus();

    document.getElementById("search").addEventListener("input", applySearch);
    document.getElementById("editToggle").addEventListener("click", () => setEditMode(!editMode));

    document.getElementById("btnAddCategory").addEventListener("click", addCategoryPrompt);
    document.getElementById("btnSyncNow").addEventListener("click", () => syncToGitHub(false));
    document.getElementById("btnSettings").addEventListener("click", openSettingsModal);
    document.getElementById("btnExport").addEventListener("click", exportJSON);
    document.getElementById("btnImport").addEventListener("click", () => document.getElementById("importFileInput").click());
    document.getElementById("importFileInput").addEventListener("change", (e) => {
        if (e.target.files[0]) importJSONFile(e.target.files[0]);
        e.target.value = "";
    });
    document.getElementById("btnDiscard").addEventListener("click", async () => {
        const ok = confirm("Discard unsaved changes on this device and reload the last synced version?");
        if (!ok) return;
        localStorage.removeItem(DRAFT_KEY);
        shortcutsData = await loadData();
        render();
        updateStatus();
    });

    document.getElementById("f-type").addEventListener("change", (e) => setTypeFieldsVisibility(e.target.value));
    document.getElementById("f-app-picker").addEventListener("input", (e) => renderAppPickerResults(e.target.value));
    document.getElementById("f-package").addEventListener("input", (e) => {
        const fb = document.getElementById("f-fallback");
        if (!fb.dataset.userEdited) {
            fb.value = e.target.value.trim() ? ("https://play.google.com/store/apps/details?id=" + e.target.value.trim()) : "";
        }
    });
    document.getElementById("f-fallback").addEventListener("input", (e) => { e.target.dataset.userEdited = "1"; });
    document.getElementById("f-icon-url").addEventListener("input", (e) => {
        pendingIconData = null;
        updateIconPreview(normalizeIconUrl(e.target.value.trim()));
    });
    document.getElementById("f-icon-file").addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        document.getElementById("f-icon-url").value = "";
        const saveBtn = document.getElementById("f-save");
        saveBtn.disabled = true;
        saveBtn.textContent = "Processing icon…";
        iconProcessing = fileToIconDataURL(file).then((dataUrl) => {
            pendingIconData = dataUrl;
            updateIconPreview(pendingIconData);
        }).finally(() => {
            iconProcessing = null;
            saveBtn.disabled = false;
            saveBtn.textContent = "Save";
        });
    });

    document.getElementById("f-save").addEventListener("click", saveItemFromModal);
    document.getElementById("f-cancel").addEventListener("click", closeItemModal);
    document.getElementById("f-delete").addEventListener("click", deleteItemFromModal);
    document.getElementById("itemModal").addEventListener("click", (e) => {
        if (e.target.id === "itemModal") closeItemModal();
    });

    document.getElementById("btnTestConnection").addEventListener("click", testConnection);
    document.getElementById("btnSaveToken").addEventListener("click", () => {
        setToken(document.getElementById("f-token").value.trim());
        closeSettingsModal();
        toast("Token saved on this device.");
        if (isDirty()) syncToGitHub(false);
    });
    document.getElementById("btnClearToken").addEventListener("click", () => {
        setToken("");
        document.getElementById("f-token").value = "";
        document.getElementById("settingsStatus").textContent = "Token cleared.";
    });
    document.getElementById("btnCloseSettings").addEventListener("click", closeSettingsModal);
    document.getElementById("settingsModal").addEventListener("click", (e) => {
        if (e.target.id === "settingsModal") closeSettingsModal();
    });

    window.addEventListener("online", () => { updateStatus(); if (isDirty()) syncToGitHub(true); });
    window.addEventListener("offline", () => updateStatus());

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch((err) => console.error("SW registration failed", err));
    }
});

})();
