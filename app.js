(function () {
  "use strict";
  const C = window.FCT_CONFIG || {};
  const DEMO = C.DEMO_MODE || !C.SUPABASE_URL || !C.SUPABASE_ANON_KEY;
  const STORE_KEY = "FCT_MSDS_VER8_DEMO";
  const DB_NAME = "FCT_MSDS_VER8_FILES",
    DB_STORE = "pdfs";
  const $ = (id) => document.getElementById(id);
  const state = {
    factories: [],
    documents: [],
    admin: null,
    token: "",
    notesSupported: DEMO,
    selected: { factory: "", department: "", equipment: "" },
    browse: {
      factory_id: "",
      department_id: "",
      equipment_id: "",
      process_id: "",
    },
    statusFilter: "",
    draftUses: [],
    editUses: [],
    files: [],
    excelFile: null,
    bulkPdfFiles: [],
    importPlan: null,
    edit: null,
    editDocumentId: "",
    layoutMode: "",
  };
  let layoutLocked = Boolean(localStorage.getItem("fct-layout-mode"));
  let toastTimer = null;

  const uid = (p) =>
    p +
    "-" +
    (crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[m],
    );
  const norm = (v) =>
    String(v ?? "")
      .trim()
      .toLocaleLowerCase("ko");
  const safeName = (v) => String(v || "file").replace(/[\\/:*?"<>|]/g, "_");
  const sizeText = (n) => {
    n = Number(n) || 0;
    return n < 1024
      ? n + " B"
      : n < 1048576
        ? (n / 1024).toFixed(1) + " KB"
        : (n / 1048576).toFixed(1) + " MB";
  };
  const hasPdf = (d) =>
    Boolean(
      d &&
        d.file_name &&
        !String(d.file_name).startsWith("__NO_PDF__") &&
        d.storage_path &&
        !String(d.storage_path).startsWith("unattached/"),
    );
  const shownFileName = (d) => (hasPdf(d) ? d.file_name : "");
  const dateText = (v) => (v ? new Date(v).toLocaleDateString("ko-KR") : "-");
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3300);
  }

  function defaultData() {
    const f1 = { id: "f-1", name: "1공장", sort_order: 1, departments: [] },
      f2 = { id: "f-2", name: "2공장", sort_order: 2, departments: [] };
    const paths = [
      ["박막", "Spin Cleaner", "세라믹 전처리"],
      ["박막", "Spray Etcher", "Cu Etching"],
      ["가공", "MCT", "가공"],
      ["소성", "소성로", "Sintering"],
      ["전반", "볼밀기", "배치"],
    ];
    [f1, f2].forEach((f, fi) =>
      paths.forEach((r, i) => {
        let d = f.departments.find((x) => x.name === r[0]);
        if (!d) {
          d = {
            id: `d-${fi}-${f.departments.length}`,
            factory_id: f.id,
            name: r[0],
            sort_order: f.departments.length + 1,
            equipments: [],
          };
          f.departments.push(d);
        }
        let e = d.equipments.find((x) => x.name === r[1]);
        if (!e) {
          e = {
            id: `e-${fi}-${i}`,
            department_id: d.id,
            name: r[1],
            sort_order: d.equipments.length + 1,
            processes: [],
          };
          d.equipments.push(e);
        }
        e.processes.push({
          id: `p-${fi}-${i}`,
          equipment_id: e.id,
          name: r[2],
          sort_order: e.processes.length + 1,
        });
      }),
    );
    const p1 = findByNames(
        [f1, f2],
        "1공장",
        "박막",
        "Spin Cleaner",
        "세라믹 전처리",
      ),
      p2 = findByNames(
        [f1, f2],
        "2공장",
        "박막",
        "Spin Cleaner",
        "세라믹 전처리",
      );
    return {
      factories: [f1, f2],
      documents: [
        {
          id: "sample-dth2-f1",
          factory_id: f1.id,
          material_name: "DTH-2",
          file_name: "DTH-2_MSDS_KR_240822.pdf",
          storage_path: "sample/DTH-2_MSDS_KR_240822.pdf",
          size_bytes: 315698,
          created_at: "2024-08-22T00:00:00+09:00",
          asset_url: "./sample/DTH-2_MSDS_KR_240822.pdf",
          locations: [toLocation(p1)],
        },
        {
          id: "sample-dth2-f2",
          factory_id: f2.id,
          material_name: "DTH-2",
          file_name: "DTH-2_MSDS_KR_240822.pdf",
          storage_path: "sample/DTH-2_MSDS_KR_240822.pdf",
          size_bytes: 315698,
          created_at: "2024-08-22T00:00:00+09:00",
          asset_url: "./sample/DTH-2_MSDS_KR_240822.pdf",
          locations: [toLocation(p2)],
        },
      ],
    };
  }
  function findByNames(factories, fn, dn, en, pn) {
    const f = factories.find((x) => norm(x.name) === norm(fn)),
      d = f?.departments.find((x) => norm(x.name) === norm(dn)),
      e = d?.equipments.find((x) => norm(x.name) === norm(en)),
      p = e?.processes.find((x) => norm(x.name) === norm(pn));
    return { f, d, e, p };
  }
  function toLocation(x) {
    return {
      id: uid("loc"),
      factory_id: x.f.id,
      department_id: x.d.id,
      equipment_id: x.e.id,
      process_id: x.p.id,
      factory_name: x.f.name,
      department_name: x.d.name,
      equipment_name: x.e.name,
      process_name: x.p.name,
    };
  }
  function demoLoad() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (d?.factories && d?.documents) {
        state.factories = d.factories;
        state.documents = d.documents;
        return;
      }
    } catch (e) {}
    const d = defaultData();
    state.factories = d.factories;
    state.documents = d.documents;
    demoSave();
  }
  function demoSave() {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        factories: state.factories,
        documents: state.documents,
      }),
    );
  }

  function openDb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(DB_STORE))
          r.result.createObjectStore(DB_STORE);
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function blobPut(id, file) {
    const db = await openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(file, id);
      tx.oncomplete = () => {
        db.close();
        res();
      };
      tx.onerror = () => rej(tx.error);
    });
  }
  async function blobGet(id) {
    const db = await openDb();
    return new Promise((res, rej) => {
      const q = db.transaction(DB_STORE).objectStore(DB_STORE).get(id);
      q.onsuccess = () => {
        db.close();
        res(q.result || null);
      };
      q.onerror = () => rej(q.error);
    });
  }
  async function blobDelete(id) {
    const db = await openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete = () => {
        db.close();
        res();
      };
      tx.onerror = () => rej(tx.error);
    });
  }

  function apiHeaders(extra = {}) {
    return {
      apikey: C.SUPABASE_ANON_KEY,
      Authorization: "Bearer " + (state.token || C.SUPABASE_ANON_KEY),
      "Content-Type": "application/json",
      ...extra,
    };
  }
  async function api(path, options = {}) {
    const r = await fetch(C.SUPABASE_URL + path, {
      ...options,
      headers: apiHeaders(options.headers || {}),
    });
    if (!r.ok) {
      let msg = "요청 처리 실패";
      try {
        const x = await r.json();
        msg = x.message || x.error_description || x.error || msg;
      } catch (e) {}
      throw new Error(msg);
    }
    if (r.status === 204) return null;
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }
  async function remoteLoad() {
    const fs = await api(
      "/rest/v1/factories?select=id,name,sort_order,departments(id,factory_id,name,sort_order,equipments(id,department_id,name,sort_order))&order=sort_order.asc",
    );
    let docs;
    try {
      docs = await api(
        "/rest/v1/documents?select=id,factory_id,material_name,notes,file_name,storage_path,size_bytes,created_at,updated_at,document_locations(id,factory_id,department_id,equipment_id,process_id,factories(name),departments(name),equipments(name))&order=created_at.desc",
      );
      state.notesSupported = true;
    } catch (err) {
      if (!/notes|column|schema cache/i.test(err.message)) throw err;
      docs = await api(
        "/rest/v1/documents?select=id,factory_id,material_name,file_name,storage_path,size_bytes,created_at,updated_at,document_locations(id,factory_id,department_id,equipment_id,process_id,factories(name),departments(name),equipments(name))&order=created_at.desc",
      );
      state.notesSupported = false;
    }
    state.factories = fs || [];
    state.documents = (docs || [])
      .map((d) => ({
        ...d,
        locations: (d.document_locations || []).map((l) => ({
          id: l.id,
          factory_id: l.factory_id,
          department_id: l.department_id,
          equipment_id: l.equipment_id,
          process_id: l.process_id,
          factory_name: l.factories?.name || "",
          department_name: l.departments?.name || "",
          equipment_name: l.equipments?.name || "",
          process_name: "",
        })),
      }))
      .filter((d) => d.locations.length);
    sortStructure();
  }
  async function loadData() {
    if (DEMO) demoLoad();
    else await remoteLoad();
    renderAll();
  }
  function sortStructure() {
    state.factories.sort(sorter);
    state.factories.forEach((f) => {
      f.departments = (f.departments || []).sort(sorter);
      f.departments.forEach((d) => {
        d.equipments = (d.equipments || []).sort(sorter);
        d.equipments.forEach((e) => (e.processes = []));
      });
    });
  }
  const sorter = (a, b) =>
    (a.sort_order || 0) - (b.sort_order || 0) ||
    a.name.localeCompare(b.name, "ko");
  const factory = (id) => state.factories.find((x) => x.id === id);
  const dept = (fid, id) => factory(fid)?.departments.find((x) => x.id === id);
  const equip = (fid, did, id) =>
    dept(fid, did)?.equipments.find((x) => x.id === id);
  const processOf = (fid, did, eid, id) =>
    equip(fid, did, eid)?.processes.find((x) => x.id === id);
  const allLocations = () => state.documents.flatMap((d) => d.locations);
  const allDepartments = () =>
    state.factories.flatMap((f) => f.departments || []);
  const allEquipments = () =>
    allDepartments().flatMap((d) => d.equipments || []);
  function equipmentPath(equipmentId) {
    for (const f of state.factories)
      for (const d of f.departments || [])
        for (const e of d.equipments || [])
          if (e.id === equipmentId)
            return {
              factory_id: f.id,
              department_id: d.id,
              equipment_id: e.id,
              process_id: null,
              factory_name: f.name,
              department_name: d.name,
              equipment_name: e.name,
              process_name: "",
            };
    return null;
  }
  const emptyEquipments = () =>
    allEquipments()
      .map((e) => equipmentPath(e.id))
      .filter(Boolean)
      .filter(
        (p) =>
          !state.documents.some((d) =>
            d.locations.some((l) => l.equipment_id === p.equipment_id),
          ),
      );
  function structureItems(kind) {
    const out = [];
    for (const f of state.factories) {
      if (kind === "factories")
        out.push({
          level: "factory",
          id: f.id,
          label: f.name,
          path: f.name,
          scope: {
            factory_id: f.id,
            department_id: "",
            equipment_id: "",
            process_id: "",
          },
        });
      for (const d of f.departments || []) {
        if (kind === "departments")
          out.push({
            level: "department",
            id: d.id,
            label: d.name,
            path: f.name + " › " + d.name,
            scope: {
              factory_id: f.id,
              department_id: d.id,
              equipment_id: "",
              process_id: "",
            },
          });
        for (const e of d.equipments || []) {
          if (kind === "equipments")
            out.push({
              level: "equipment",
              id: e.id,
              label: e.name,
              path: f.name + " › " + d.name + " › " + e.name,
              scope: {
                factory_id: f.id,
                department_id: d.id,
                equipment_id: e.id,
                process_id: "",
              },
            });
        }
      }
    }
    return out;
  }

  function setLayoutMode(mode, persist = false) {
    state.layoutMode = mode;
    document.body.classList.toggle("mode-pc", mode === "pc");
    document.body.classList.toggle("mode-mobile", mode === "mobile");
    $("pcModeBtn").classList.toggle("active", mode === "pc");
    $("mobileModeBtn").classList.toggle("active", mode === "mobile");
    if (persist) {
      layoutLocked = true;
      localStorage.setItem("fct-layout-mode", mode);
    }
  }

  function switchView(name) {
    if (!["browse", "help"].includes(name) && !state.admin) {
      openLogin();
      return;
    }
    document
      .querySelectorAll(".view")
      .forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
    document
      .querySelectorAll("[data-view]")
      .forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    if (name === "manage") renderManage();
    if (name === "upload") renderUsageRows();
    if (name === "data") renderDataSelects();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function applyAdminUi() {
    document
      .querySelectorAll(".admin-only")
      .forEach((x) => x.classList.toggle("hidden", !state.admin));
    $("adminNav").classList.toggle("hidden", !state.admin);
    document
      .querySelectorAll(".admin-entry")
      .forEach((x) => x.classList.toggle("hidden", Boolean(state.admin)));
    $("logoutBtn").classList.toggle("hidden", !state.admin);
    document
      .querySelector(".bottom-nav")
      .classList.toggle("admin-mode", Boolean(state.admin));
    $("modeBadge").textContent = state.admin ? "관리자 모드" : "";
    $("modeBadge").classList.toggle("hidden", !state.admin);
    if (
      !state.admin &&
      !$("view-browse").classList.contains("active") &&
      !$("view-help").classList.contains("active")
    )
      switchView("browse");
    renderDocuments();
  }
  function openLogin() {
    $("loginError").textContent = "";
    $("loginDialog").showModal();
    setTimeout(() => $("adminPassword").focus(), 40);
  }
  async function login(e) {
    e.preventDefault();
    const password = $("adminPassword").value;
    try {
      if (password !== String(C.ADMIN_PASSWORD || "1004"))
        throw new Error("비밀번호가 맞지 않습니다.");
      state.admin = { name: "관리자" };
      state.token = DEMO ? "demo" : C.SUPABASE_ANON_KEY;
      sessionStorage.setItem("fct-admin-unlocked", "1");
      $("loginDialog").close();
      $("loginForm").reset();
      applyAdminUi();
      toast("관리자 모드로 전환했습니다.");
    } catch (err) {
      state.token = "";
      state.admin = null;
      $("loginError").textContent = err.message;
    }
  }
  function logout() {
    state.admin = null;
    state.token = "";
    sessionStorage.removeItem("fct-admin-unlocked");
    applyAdminUi();
    toast("관리자 모드를 종료했습니다.");
  }

  function fillSelect(el, items, label, value) {
    el.innerHTML =
      '<option value="">' +
      label +
      "</option>" +
      items
        .map(
          (x) =>
            '<option value="' + esc(x.id) + '">' + esc(x.name) + "</option>",
        )
        .join("");
    if (items.some((x) => x.id === value)) el.value = value;
  }
  function locationMatches(l, scope = state.browse) {
    return (
      (!scope.factory_id || l.factory_id === scope.factory_id) &&
      (!scope.department_id || l.department_id === scope.department_id) &&
      (!scope.equipment_id || l.equipment_id === scope.equipment_id) &&
      (!scope.process_id || l.process_id === scope.process_id)
    );
  }
  function scopeCount(scope) {
    return new Set(
      state.documents
        .filter((d) => d.locations.some((l) => locationMatches(l, scope)))
        .map((d) => d.id),
    ).size;
  }
  function browseGroups() {
    const q = norm($("searchInput").value);
    return state.documents
      .filter(
        (d) =>
          (!q || norm(d.material_name).includes(q)) &&
          (!state.browse.factory_id ||
            d.factory_id === state.browse.factory_id) &&
          (state.statusFilter !== "pdf-missing" || !hasPdf(d)) &&
          (state.statusFilter !== "pdf-ready" || hasPdf(d)),
      )
      .map((d) => ({
        ...d,
        locations: d.locations.filter((l) => locationMatches(l)),
      }))
      .filter((d) => d.locations.length);
  }
  function selectBrowse(level, id) {
    state.statusFilter = "";
    if (level === "factory") {
      state.browse = {
        factory_id: id,
        department_id: "",
        equipment_id: "",
        process_id: "",
      };
    } else if (level === "department") {
      state.browse.department_id = id;
      state.browse.equipment_id = "";
      state.browse.process_id = "";
    } else if (level === "equipment") {
      state.browse.equipment_id = id;
      state.browse.process_id = "";
    }
    renderHierarchy();
    renderDocuments();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function resetBrowse(clearSearch = false) {
    state.browse = {
      factory_id: "",
      department_id: "",
      equipment_id: "",
      process_id: "",
    };
    state.statusFilter = "";
    if (clearSearch) $("searchInput").value = "";
    renderHierarchy();
    renderDocuments();
  }
  function goHome() {
    switchView("browse");
    resetBrowse(true);
  }
  function renderHierarchy() {
    const b = state.browse,
      f = factory(b.factory_id),
      d = dept(b.factory_id, b.department_id),
      e = equip(b.factory_id, b.department_id, b.equipment_id);
    if (!f)
      state.browse = {
        factory_id: "",
        department_id: "",
        equipment_id: "",
        process_id: "",
      };
    const crumbs = [{ label: "전체 MSDS", level: "root", id: "" }];
    if (f) crumbs.push({ label: f.name, level: "factory", id: f.id });
    if (d) crumbs.push({ label: d.name, level: "department", id: d.id });
    if (e) crumbs.push({ label: e.name, level: "equipment", id: e.id });
    let items = state.factories,
      level = "factory",
      label = "공장";
    if (f) {
      items = f.departments;
      level = "department";
      label = "부서";
    }
    if (d) {
      items = d.equipments;
      level = "equipment";
      label = "설비";
    }
    if (e) {
      items = [];
    }
    const crumbHtml =
      '<div class="crumbs">' +
      crumbs
        .map(
          (c, i) =>
            '<button class="' +
            (i === crumbs.length - 1 ? "current" : "") +
            '" data-browse-crumb="' +
            c.level +
            '" data-browse-id="' +
            esc(c.id) +
            '">' +
            esc(c.label) +
            "</button>" +
            (i < crumbs.length - 1 ? "<i>›</i>" : ""),
        )
        .join("") +
      "</div>";
    const cards = items
      .map((x) => {
        const scope = {
          factory_id: b.factory_id,
          department_id: b.department_id,
          equipment_id: b.equipment_id,
          process_id: b.process_id,
        };
        scope[level + "_id"] = x.id;
        return (
          '<button class="level-card" data-browse-level="' +
          level +
          '" data-browse-id="' +
          esc(x.id) +
          '"><strong>' +
          esc(
            level === "factory"
              ? "공장"
              : level === "department"
                ? "부서"
                : "설비",
          ) +
          "</strong><span>" +
          esc(x.name) +
          "<small>" +
          (level === "equipment" ? "사용물질 " : "MSDS ") +
          scopeCount(scope) +
          "건</small></span></button>"
        );
      })
      .join("");
    $("hierarchyNav").innerHTML =
      crumbHtml +
      (items.length
        ? '<div class="level-head"><h3>' +
          label +
          ' 선택</h3><span>선택한 범위의 MSDS가 아래에 표시됩니다.</span></div><div class="level-grid">' +
          cards +
          "</div>"
        : '<div class="scope-strip"><b>' +
          esc(e?.name || d?.name || f?.name || "전체") +
          "</b> 범위의 MSDS 전체</div>");
    const title = e
      ? e.name + " MSDS"
      : d
        ? d.name + " MSDS"
        : f
          ? f.name + " MSDS"
          : "전체 MSDS";
    $("browseTitle").textContent = title;
    $("browseSubtitle").textContent = e
      ? "선택한 설비에서 사용하는 물질입니다."
      : d
        ? "설비를 선택하거나 부서 전체 물질을 확인하세요."
        : f
          ? "부서를 선택하거나 공장 전체 물질을 확인하세요."
          : "공장을 선택하거나 물질명을 검색하세요.";
  }
  function pathHtml(l) {
    return (
      '<div class="path"><span class="factory">' +
      esc(l.factory_name) +
      "</span><i>›</i><span>" +
      esc(l.department_name) +
      "</span><i>›</i><span>" +
      esc(l.equipment_name) +
      "</span></div>"
    );
  }
  function prepareRegistration(l) {
    state.draftUses = [
      {
        id: uid("draft"),
        factory_id: l.factory_id,
        department_id: l.department_id,
        equipment_id: l.equipment_id,
        process_id: null,
      },
    ];
    state.files = [];
    $("materialName").value = "";
    $("materialNote").value = "";
    renderSelectedFiles();
    switchView("upload");
  }
  function showStatus(kind) {
    state.browse = {
      factory_id: "",
      department_id: "",
      equipment_id: "",
      process_id: "",
    };
    switchView("browse");
    if (kind === "factories") {
      state.statusFilter = "";
      renderHierarchy();
      renderDocuments();
    } else {
      state.statusFilter = kind;
      renderHierarchy();
      renderDocuments();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function renderDocuments() {
    const list = browseGroups(),
      noMaterial = emptyEquipments(),
      pdfReady = state.documents.filter(hasPdf).length,
      pdfMissing = state.documents.length - pdfReady;
    $("statDepartments").textContent = allDepartments().length;
    $("statEquipments").textContent = allEquipments().length;
    $("statMaterials").textContent = state.documents.length;
    $("statNoMaterial").textContent = noMaterial.length;
    $("statPdfReady").textContent = pdfReady;
    $("statPdfMissing").textContent = pdfMissing;
    document
      .querySelectorAll("[data-status]")
      .forEach((x) =>
        x.classList.toggle("active", x.dataset.status === state.statusFilter),
      );
    const statusBox = $("statusResults");
    if (["departments", "equipments"].includes(state.statusFilter)) {
      const items = structureItems(state.statusFilter),
        label = state.statusFilter === "departments" ? "부서" : "설비";
      statusBox.classList.remove("hidden");
      statusBox.innerHTML =
        '<div class="status-head"><b>' +
        label +
        " 목록</b><span>" +
        items.length +
        '건</span></div><div class="status-list">' +
        items
          .map(
            (x) =>
              "<article><div><b>" +
              esc(x.label) +
              "</b><small>" +
              esc(x.path) +
              (x.level === "equipment"
                ? " · 사용물질 " + scopeCount(x.scope) + "개"
                : "") +
              '</small></div><button class="btn btn-light btn-small" data-open-scope="' +
              esc(x.level) +
              '" data-scope-id="' +
              esc(x.id) +
              '">이동</button></article>',
          )
          .join("") +
        "</div>";
      $("documentTable").innerHTML = "";
      $("documentCards").innerHTML = "";
      $("documentEmpty").hidden = true;
      return;
    }
    if (state.statusFilter === "no-material") {
      statusBox.classList.remove("hidden");
      statusBox.innerHTML =
        '<div class="status-head"><b>사용약품이 등록되지 않은 설비</b><span>' +
        noMaterial.length +
        '건</span></div><div class="status-list">' +
        noMaterial
          .map(
            (l) =>
              "<article><div>" +
              pathHtml(l) +
              "</div>" +
              (state.admin
                ? '<button class="btn btn-blue btn-small" data-register-equipment="' +
                  esc(l.equipment_id) +
                  '">사용물질 등록</button>'
                : '<button class="btn btn-light btn-small" data-open-equipment="' +
                  esc(l.equipment_id) +
                  '">설비 보기</button>') +
              "</article>",
          )
          .join("") +
        "</div>";
      $("documentTable").innerHTML = "";
      $("documentCards").innerHTML = "";
      $("documentEmpty").hidden = true;
      return;
    } else statusBox.classList.add("hidden");
    if (state.statusFilter === "pdf-missing" && state.admin && list.length) {
      statusBox.classList.remove("hidden");
      statusBox.innerHTML =
        '<div class="status-head"><b>PDF 미등록 물질</b><button class="btn btn-blue btn-small" data-edit-first-missing>다음 미등록 항목</button></div>';
    }
    const adminHead = state.admin
      ? '<td><div class="row-actions"><button class="btn btn-light btn-small" data-edit-doc="{id}">수정</button><button class="btn btn-danger btn-small" data-delete-doc="{id}">삭제</button></div></td>'
      : "";
    $("documentTable").innerHTML = list
      .map((d) => {
        const ready = hasPdf(d),
          paths =
            d.locations.slice(0, 2).map(pathHtml).join("") +
            (d.locations.length > 2
              ? '<span class="more">외 ' +
                (d.locations.length - 2) +
                "개 사용처</span>"
              : "");
        const actions = ready
          ? '<button class="btn btn-blue btn-small" data-open-doc="' +
            esc(d.id) +
            '">PDF 보기</button><button class="btn btn-light btn-small" data-download-doc="' +
            esc(d.id) +
            '">다운로드</button>'
          : state.admin
            ? '<button class="btn btn-blue btn-small" data-edit-doc="' +
              esc(d.id) +
              '">PDF 첨부</button>'
            : '<span class="status-badge waiting">PDF 준비 중</span>';
        return (
          '<tr><td><div class="file-cell"><span class="pdf-icon ' +
          (ready ? "" : "empty-pdf") +
          '">' +
          (ready ? "PDF" : "—") +
          '</span><div><span class="file-name">' +
          esc(d.material_name) +
          (d.locations.length > 1
            ? '<span class="usage-badge">' + d.locations.length + "곳</span>"
            : "") +
          '</span><span class="sub">' +
          (ready
            ? esc(shownFileName(d)) + " · " + sizeText(d.size_bytes)
            : state.admin
              ? "PDF 미등록 · 첨부 필요"
              : "PDF 준비 중") +
          "</span>" +
          (d.notes
            ? '<span class="sub note-text">비고 · ' + esc(d.notes) + "</span>"
            : "") +
          '</div></div></td><td><div class="paths">' +
          paths +
          '</div></td><td><div class="row-actions">' +
          actions +
          "</div></td>" +
          adminHead.replaceAll("{id}", esc(d.id)) +
          "</tr>"
        );
      })
      .join("");
    $("documentCards").innerHTML = list
      .map((d) => {
        const ready = hasPdf(d);
        return (
          '<article class="mobile-card"><h3>' +
          esc(d.material_name) +
          (d.locations.length > 1
            ? '<span class="usage-badge">' + d.locations.length + "곳</span>"
            : "") +
          "</h3><p>" +
          (ready
            ? esc(shownFileName(d))
            : state.admin
              ? "PDF 미등록 · 첨부 필요"
              : "PDF 준비 중") +
          "<br>" +
          d.locations
            .slice(0, 2)
            .map((l) =>
              esc(
                [l.factory_name, l.department_name, l.equipment_name].join(
                  " › ",
                ),
              ),
            )
            .join("<br>") +
          (d.notes ? "<br>비고 · " + esc(d.notes) : "") +
          '</p><div class="mobile-actions">' +
          (ready
            ? '<button class="btn btn-blue" data-open-doc="' +
              esc(d.id) +
              '">PDF 보기</button><button class="btn btn-light" data-download-doc="' +
              esc(d.id) +
              '">다운로드</button>'
            : state.admin
              ? '<button class="btn btn-blue" data-edit-doc="' +
                esc(d.id) +
                '">PDF 첨부</button>'
              : '<span class="status-badge waiting">PDF 준비 중</span>') +
          (state.admin
            ? '<button class="btn btn-light" data-edit-doc="' +
              esc(d.id) +
              '">수정</button><button class="btn btn-danger" data-delete-doc="' +
              esc(d.id) +
              '">삭제</button>'
            : "") +
          "</div></article>"
        );
      })
      .join("");
    const equipmentSelected = Boolean(state.browse.equipment_id);
    $("documentEmpty").innerHTML = equipmentSelected
      ? "<b>사용약품 없음</b>이 설비에는 등록된 사용물질이 없습니다."
      : "<b>조건에 맞는 사용물질이 없습니다.</b>공장 단계 또는 물질명을 다시 확인하세요.";
    $("documentEmpty").hidden = list.length > 0;
  }

  function emptyUse() {
    return {
      id: uid("draft"),
      factory_id: "",
      department_id: "",
      equipment_id: "",
      process_id: "",
    };
  }
  function useSelect(items, value, label, field, id) {
    return (
      "<div><label>" +
      label +
      '</label><select data-use="' +
      esc(id) +
      '" data-field="' +
      field +
      '"><option value="">' +
      label +
      " 선택</option>" +
      items
        .map(
          (x) =>
            '<option value="' +
            esc(x.id) +
            '" ' +
            (x.id === value ? "selected" : "") +
            ">" +
            esc(x.name) +
            "</option>",
        )
        .join("") +
      "</select></div>"
    );
  }
  function renderUsageRows() {
    if (!state.draftUses.length) state.draftUses = [emptyUse()];
    $("usageList").innerHTML = state.draftUses
      .map((u) => {
        const f = factory(u.factory_id),
          d = dept(u.factory_id, u.department_id);
        return (
          '<div class="usage-row">' +
          useSelect(state.factories, u.factory_id, "공장", "factory_id", u.id) +
          useSelect(
            f?.departments || [],
            u.department_id,
            "부서",
            "department_id",
            u.id,
          ) +
          useSelect(
            d?.equipments || [],
            u.equipment_id,
            "설비",
            "equipment_id",
            u.id,
          ) +
          '<button class="usage-remove" data-remove-use="' +
          esc(u.id) +
          '" ' +
          (state.draftUses.length === 1 ? "disabled" : "") +
          ">×</button></div>"
        );
      })
      .join("");
  }
  function addFiles(files) {
    [...files].forEach((f) => {
      if (
        (f.type === "application/pdf" ||
          f.name.toLowerCase().endsWith(".pdf")) &&
        !state.files.some((x) => x.name === f.name && x.size === f.size)
      )
        state.files.push(f);
    });
    renderSelectedFiles();
  }
  function renderSelectedFiles() {
    $("selectedFiles").innerHTML = state.files
      .map(
        (f, i) =>
          '<div class="selected-file"><span class="pdf-icon">PDF</span><b>' +
          esc(f.name) +
          "</b><span>" +
          sizeText(f.size) +
          '</span><button class="tool del" data-remove-file="' +
          i +
          '">×</button></div>',
      )
      .join("");
  }
  function locationFromUse(u) {
    const f = factory(u.factory_id),
      d = dept(u.factory_id, u.department_id),
      e = equip(u.factory_id, u.department_id, u.equipment_id);
    return {
      id: uid("loc"),
      factory_id: f.id,
      department_id: d.id,
      equipment_id: e.id,
      process_id: null,
      factory_name: f.name,
      department_name: d.name,
      equipment_name: e.name,
      process_name: "",
    };
  }
  async function storagePut(path, file) {
    const r = await fetch(
      C.SUPABASE_URL + "/storage/v1/object/" + C.STORAGE_BUCKET + "/" + path,
      {
        method: "POST",
        headers: {
          apikey: C.SUPABASE_ANON_KEY,
          Authorization: "Bearer " + state.token,
          "x-upsert": "true",
          "Content-Type": file.type || "application/pdf",
        },
        body: file,
      },
    );
    if (!r.ok) {
      const x = await r.json().catch(() => ({}));
      throw new Error(x.message || "PDF 저장 실패");
    }
  }
  async function storageDelete(paths) {
    if (!paths.length) return;
    await api("/storage/v1/object/" + C.STORAGE_BUCKET, {
      method: "DELETE",
      body: JSON.stringify({ prefixes: paths }),
    });
  }
  async function saveDocuments() {
    const uses = state.draftUses,
      material = $("materialName").value.trim(),
      note = $("materialNote").value.trim(),
      file = state.files[0] || null;
    if (
      !uses.length ||
      uses.some((u) => !u.factory_id || !u.department_id || !u.equipment_id)
    ) {
      toast("모든 사용처를 선택해 주세요.");
      return;
    }
    if (!material) {
      toast("물질명을 입력해 주세요.");
      return;
    }
    if (note && !state.notesSupported) {
      toast(
        "비고 저장 설정이 필요합니다. VER10 데이터베이스 업데이트를 먼저 실행해 주세요.",
      );
      return;
    }
    const factoryIds = [...new Set(uses.map((u) => u.factory_id))];
    if (factoryIds.length !== 1) {
      toast("1공장과 2공장은 한 번에 같이 등록할 수 없습니다.");
      return;
    }
    const factoryId = factoryIds[0];
    let doc = state.documents.find(
      (x) =>
        x.factory_id === factoryId && norm(x.material_name) === norm(material),
    );
    if (DEMO) {
      if (!doc) {
        const id = uid("material");
        doc = {
          id,
          factory_id: factoryId,
          material_name: material,
          notes: note,
          file_name: file ? file.name : "__NO_PDF__" + id,
          storage_path: file
            ? "demo/" + factoryId + "/" + file.name
            : "unattached/" + id,
          size_bytes: file?.size || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          locations: [],
        };
        state.documents.push(doc);
      } else {
        doc.notes = note;
        doc.updated_at = new Date().toISOString();
      }
      if (file) {
        doc.file_name = file.name;
        doc.storage_path = "demo/" + factoryId + "/" + file.name;
        doc.size_bytes = file.size;
        await blobPut(doc.id, file);
        delete doc.asset_url;
      }
      uses.forEach((u) => {
        const l = locationFromUse(u);
        if (!doc.locations.some((x) => x.equipment_id === l.equipment_id))
          doc.locations.push(l);
      });
      demoSave();
    } else {
      const id = doc?.id || crypto.randomUUID();
      if (!doc) {
        const fileName = file ? file.name : "__NO_PDF__" + id,
          path = file
            ? "factory-" + factoryId + "/" + id + "/" + safeName(file.name)
            : "unattached/" + id;
        if (file) await storagePut(path, file);
        const rows = await api("/rest/v1/documents", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify([
            {
              id,
              factory_id: factoryId,
              material_name: material,
              ...(state.notesSupported ? { notes: note } : {}),
              file_name: fileName,
              storage_path: path,
              size_bytes: file?.size || 0,
              updated_at: new Date().toISOString(),
            },
          ]),
        });
        doc = rows?.[0] || { id };
      } else {
        if (state.notesSupported)
          await api("/rest/v1/documents?id=eq." + encodeURIComponent(doc.id), {
            method: "PATCH",
            body: JSON.stringify({
              notes: note,
              updated_at: new Date().toISOString(),
            }),
          });
        if (file) {
          const path =
            "factory-" + factoryId + "/" + doc.id + "/" + safeName(file.name);
          await storagePut(path, file);
          await api("/rest/v1/documents?id=eq." + encodeURIComponent(doc.id), {
            method: "PATCH",
            body: JSON.stringify({
              file_name: file.name,
              storage_path: path,
              size_bytes: file.size,
              updated_at: new Date().toISOString(),
            }),
          });
        }
      }
      for (const u of uses)
        await api(
          "/rest/v1/document_locations?on_conflict=document_id,equipment_id",
          {
            method: "POST",
            headers: { Prefer: "resolution=ignore-duplicates" },
            body: JSON.stringify([
              {
                document_id: doc.id,
                factory_id: u.factory_id,
                department_id: u.department_id,
                equipment_id: u.equipment_id,
                process_id: u.process_id,
              },
            ]),
          },
        );
    }
    state.files = [];
    state.draftUses = [emptyUse()];
    $("materialName").value = "";
    $("materialNote").value = "";
    $("pdfInput").value = "";
    renderSelectedFiles();
    if (!DEMO) await remoteLoad();
    renderAll();
    switchView("browse");
    toast(
      file
        ? "사용물질과 PDF를 저장했습니다."
        : "사용물질을 저장했습니다. PDF는 나중에 첨부할 수 있습니다.",
    );
  }

  function renderEditUsageRows() {
    const doc = state.documents.find((x) => x.id === state.editDocumentId);
    if (!doc) return;
    $("editUsageList").innerHTML = state.editUses
      .map((u) => {
        const f = factory(u.factory_id),
          d = dept(u.factory_id, u.department_id);
        return (
          '<div class="usage-row">' +
          useSelect(
            [f].filter(Boolean),
            u.factory_id,
            "공장",
            "factory_id",
            u.id,
          ).replaceAll("data-use=", "data-edit-use=") +
          useSelect(
            f?.departments || [],
            u.department_id,
            "부서",
            "department_id",
            u.id,
          ).replaceAll("data-use=", "data-edit-use=") +
          useSelect(
            d?.equipments || [],
            u.equipment_id,
            "설비",
            "equipment_id",
            u.id,
          ).replaceAll("data-use=", "data-edit-use=") +
          '<button class="usage-remove" type="button" data-edit-remove-use="' +
          esc(u.id) +
          '" ' +
          (state.editUses.length === 1 ? "disabled" : "") +
          ">×</button></div>"
        );
      })
      .join("");
  }
  function openEditDocument(id) {
    const d = state.documents.find((x) => x.id === id);
    if (!d) return;
    state.editDocumentId = id;
    state.editUses = d.locations.map((l) => ({
      id: uid("edituse"),
      factory_id: d.factory_id,
      department_id: l.department_id,
      equipment_id: l.equipment_id,
      process_id: l.process_id,
    }));
    $("editMaterialName").value = d.material_name;
    $("editMaterialNote").value = d.notes || "";
    $("editPdfInput").value = "";
    renderEditUsageRows();
    $("editDocumentDialog").showModal();
  }
  async function saveEditedDocument(e) {
    e.preventDefault();
    const d = state.documents.find((x) => x.id === state.editDocumentId),
      uses = state.editUses,
      name = $("editMaterialName").value.trim(),
      note = $("editMaterialNote").value.trim(),
      file = $("editPdfInput").files?.[0];
    if (!d || !name) return;
    if (note && !state.notesSupported) {
      toast(
        "비고 저장 설정이 필요합니다. VER10 데이터베이스 업데이트를 먼저 실행해 주세요.",
      );
      return;
    }
    if (!uses.length || uses.some((u) => !u.department_id || !u.equipment_id)) {
      toast("사용 위치를 모두 선택해 주세요.");
      return;
    }
    const locations = uses.map(locationFromUse);
    if (DEMO) {
      d.material_name = name;
      d.notes = note;
      d.locations = locations;
      d.updated_at = new Date().toISOString();
      if (file) {
        d.file_name = file.name;
        d.storage_path = "demo/" + d.factory_id + "/" + file.name;
        d.size_bytes = file.size;
        await blobPut(d.id, file);
        delete d.asset_url;
      }
      demoSave();
    } else {
      let patch = {
        material_name: name,
        ...(state.notesSupported ? { notes: note } : {}),
        updated_at: new Date().toISOString(),
      };
      if (file) {
        const old = hasPdf(d) ? d.storage_path : "",
          path =
            "factory-" + d.factory_id + "/" + d.id + "/" + safeName(file.name);
        await storagePut(path, file);
        patch = {
          ...patch,
          file_name: file.name,
          storage_path: path,
          size_bytes: file.size,
        };
        if (old && old !== path) await storageDelete([old]);
      }
      await api("/rest/v1/documents?id=eq." + encodeURIComponent(d.id), {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await api(
        "/rest/v1/document_locations?document_id=eq." +
          encodeURIComponent(d.id),
        { method: "DELETE" },
      );
      await api("/rest/v1/document_locations", {
        method: "POST",
        body: JSON.stringify(
          locations.map((l) => ({
            document_id: d.id,
            factory_id: d.factory_id,
            department_id: l.department_id,
            equipment_id: l.equipment_id,
            process_id: l.process_id,
          })),
        ),
      });
      await remoteLoad();
    }
    $("editDocumentDialog").close();
    renderAll();
    toast(
      file ? "사용물질과 PDF를 수정했습니다." : "사용물질 정보를 수정했습니다.",
    );
  }

  async function resolveDocBlob(doc) {
    if (DEMO) {
      const b = await blobGet(doc.id);
      if (b) return b;
      if (doc.asset_url) {
        const r = await fetch(doc.asset_url);
        if (r.ok) return r.blob();
      }
      return null;
    }
    const r = await fetch(publicFileUrl(doc));
    return r.ok ? r.blob() : null;
  }
  function publicFileUrl(doc) {
    return DEMO
      ? doc.asset_url || ""
      : C.SUPABASE_URL +
          "/storage/v1/object/public/" +
          C.STORAGE_BUCKET +
          "/" +
          doc.storage_path.split("/").map(encodeURIComponent).join("/");
  }
  async function openDocument(id) {
    const d = state.documents.find((x) => x.id === id);
    if (!d || !hasPdf(d)) {
      toast("아직 PDF가 등록되지 않았습니다.");
      return;
    }
    let url = publicFileUrl(d);
    if (DEMO && !url) {
      const b = await resolveDocBlob(d);
      if (!b) {
        toast("PDF 파일을 찾지 못했습니다.");
        return;
      }
      url = URL.createObjectURL(b);
    }
    $("pdfTitle").textContent = d.material_name + " · " + shownFileName(d);
    $("pdfOpenNative").href = url;
    $("pdfDownload").href = url;
    $("pdfDownload").download = shownFileName(d);
    $("pdfFrame").src = url + "#toolbar=1&navpanes=0&view=FitH";
    $("pdfDialog").showModal();
  }
  async function downloadDocument(id) {
    const d = state.documents.find((x) => x.id === id);
    if (!d || !hasPdf(d)) {
      toast("아직 PDF가 등록되지 않았습니다.");
      return;
    }
    const b = await resolveDocBlob(d);
    if (!b) {
      toast("PDF 파일을 찾지 못했습니다.");
      return;
    }
    downloadBlob(b, shownFileName(d));
  }
  function downloadBlob(blob, name) {
    const u = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  }
  async function deleteDocument(id) {
    const d = state.documents.find((x) => x.id === id),
      f = factory(d?.factory_id);
    if (
      !d ||
      !confirm(
        "“" +
          (f?.name || "해당 공장") +
          " / " +
          d.material_name +
          "” 자료만 삭제할까요?\n다른 공장의 같은 물질은 삭제되지 않습니다.",
      )
    )
      return;
    if (DEMO) {
      await blobDelete(id).catch(() => {});
      state.documents = state.documents.filter((x) => x.id !== id);
      demoSave();
    } else {
      if (hasPdf(d)) await storageDelete([d.storage_path]);
      await api("/rest/v1/documents?id=eq." + encodeURIComponent(id), {
        method: "DELETE",
      });
      await remoteLoad();
    }
    renderAll();
    toast((f?.name || "해당 공장") + " 사용물질을 삭제했습니다.");
  }
  async function zipAll() {
    const ready = state.documents.filter(hasPdf);
    if (!ready.length) {
      toast("등록된 PDF가 없습니다.");
      return;
    }
    const zip = new JSZip();
    let n = 0;
    for (const d of ready) {
      const b = await resolveDocBlob(d),
        f = factory(d.factory_id);
      if (b) {
        zip
          .folder(safeName(f?.name || "공장"))
          .file(
            String(++n).padStart(3, "0") + "_" + safeName(shownFileName(d)),
            b,
          );
      }
    }
    if (!n) {
      toast("저장된 PDF를 찾지 못했습니다.");
      return;
    }
    downloadBlob(
      await zip.generateAsync({ type: "blob" }),
      "FCT_MSDS_전체PDF_VER10_rev.1.zip",
    );
  }

  function manageRow(x, type, active) {
    return (
      '<div class="manage-row ' +
      (active ? "active" : "") +
      '"><button class="manage-name" data-select-type="' +
      type +
      '" data-select-id="' +
      esc(x.id) +
      '">' +
      esc(x.name) +
      (type === "equipment"
        ? " · 사용물질 " + scopeCount({ equipment_id: x.id }) + "개"
        : "") +
      '</button><div class="manage-tools"><button class="tool" data-move-type="' +
      type +
      '" data-id="' +
      esc(x.id) +
      '" data-dir="-1" aria-label="위로 이동">↑</button><button class="tool" data-move-type="' +
      type +
      '" data-id="' +
      esc(x.id) +
      '" data-dir="1" aria-label="아래로 이동">↓</button><button class="tool" data-edit-type="' +
      type +
      '" data-id="' +
      esc(x.id) +
      '" aria-label="수정">✎</button><button class="tool del" data-delete-type="' +
      type +
      '" data-id="' +
      esc(x.id) +
      '" aria-label="삭제">×</button></div></div>'
    );
  }
  function renderManage() {
    if (!factory(state.selected.factory))
      state.selected.factory = state.factories[0]?.id || "";
    const f = factory(state.selected.factory);
    if (!f?.departments.some((x) => x.id === state.selected.department))
      state.selected.department = f?.departments[0]?.id || "";
    const d = dept(state.selected.factory, state.selected.department);
    if (!d?.equipments.some((x) => x.id === state.selected.equipment))
      state.selected.equipment = d?.equipments[0]?.id || "";
    $("factoryList").innerHTML = state.factories.length
      ? state.factories
          .map((x) => manageRow(x, "factory", x.id === state.selected.factory))
          .join("")
      : '<div class="manage-empty">공장이 없습니다.</div>';
    $("departmentList").innerHTML = f?.departments.length
      ? f.departments
          .map((x) =>
            manageRow(x, "department", x.id === state.selected.department),
          )
          .join("")
      : '<div class="manage-empty">부서를 추가하세요.</div>';
    $("equipmentList").innerHTML = d?.equipments.length
      ? d.equipments
          .map((x) =>
            manageRow(x, "equipment", x.id === state.selected.equipment),
          )
          .join("")
      : '<div class="manage-empty">설비를 추가하세요.</div>';
  }
  function typeInfo(type) {
    if (type === "factory")
      return {
        label: "공장",
        table: "factories",
        parent: null,
        arr: state.factories,
      };
    if (type === "department")
      return {
        label: "부서",
        table: "departments",
        parent: { factory_id: state.selected.factory },
        arr: factory(state.selected.factory)?.departments,
      };
    if (type === "equipment")
      return {
        label: "설비",
        table: "equipments",
        parent: { department_id: state.selected.department },
        arr: dept(state.selected.factory, state.selected.department)
          ?.equipments,
      };
    throw new Error("지원하지 않는 구조 항목입니다.");
  }
  function openName(mode, type, id) {
    const info = typeInfo(type);
    if (!info.arr) {
      toast("상위 항목을 먼저 선택해 주세요.");
      return;
    }
    const item = info.arr.find((x) => x.id === id);
    state.edit = { mode, type, id };
    $("nameDialogTitle").textContent =
      (mode === "add" ? "추가 · " : "수정 · ") + info.label;
    $("itemName").value = item?.name || "";
    $("nameDialog").showModal();
    setTimeout(() => $("itemName").focus(), 40);
  }
  async function saveName(e) {
    e.preventDefault();
    const name = $("itemName").value.trim(),
      ctx = state.edit,
      info = typeInfo(ctx.type);
    if (!name) return;
    if (info.arr.some((x) => x.id !== ctx.id && norm(x.name) === norm(name))) {
      toast("같은 명칭이 이미 있습니다.");
      return;
    }
    if (DEMO) {
      if (ctx.mode === "add") {
        const item = {
          id: uid(ctx.type[0]),
          name,
          sort_order: info.arr.length + 1,
          ...(info.parent || {}),
        };
        if (ctx.type === "factory") {
          item.departments = [];
          state.selected.factory = item.id;
        }
        if (ctx.type === "department") {
          item.equipments = [];
          state.selected.department = item.id;
        }
        if (ctx.type === "equipment") {
          item.processes = [];
          state.selected.equipment = item.id;
        }
        info.arr.push(item);
      } else info.arr.find((x) => x.id === ctx.id).name = name;
      demoSave();
    } else {
      if (ctx.mode === "add") {
        const rows = await api("/rest/v1/" + info.table, {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify([
            { name, sort_order: info.arr.length + 1, ...(info.parent || {}) },
          ]),
        });
        const id = rows[0].id;
        if (ctx.type === "factory") state.selected.factory = id;
        if (ctx.type === "department") state.selected.department = id;
        if (ctx.type === "equipment") state.selected.equipment = id;
      } else
        await api(
          "/rest/v1/" + info.table + "?id=eq." + encodeURIComponent(ctx.id),
          { method: "PATCH", body: JSON.stringify({ name }) },
        );
      await remoteLoad();
    }
    $("nameDialog").close();
    renderAll();
    toast("항목을 저장했습니다.");
  }
  async function deleteStructure(type, id) {
    const info = typeInfo(type);
    if (
      !confirm(info.label + "를 삭제할까요? 연결된 사용처도 함께 해제됩니다.")
    )
      return;
    if (DEMO) {
      if (type === "factory")
        state.factories = state.factories.filter((x) => x.id !== id);
      else
        info.arr.splice(
          info.arr.findIndex((x) => x.id === id),
          1,
        );
      state.documents.forEach(
        (d) =>
          (d.locations = d.locations.filter((l) =>
            type === "factory"
              ? l.factory_id !== id
              : type === "department"
                ? l.department_id !== id
                : type === "equipment"
                  ? l.equipment_id !== id
                  : l.process_id !== id,
          )),
      );
      state.documents = state.documents.filter((d) => d.locations.length);
      demoSave();
    } else {
      await api("/rest/v1/" + info.table + "?id=eq." + encodeURIComponent(id), {
        method: "DELETE",
      });
      await remoteLoad();
    }
    renderAll();
    toast(info.label + "를 삭제했습니다.");
  }
  async function moveStructure(type, id, dir) {
    const info = typeInfo(type),
      i = info.arr.findIndex((x) => x.id === id),
      j = i + Number(dir);
    if (i < 0 || j < 0 || j >= info.arr.length) return;
    [info.arr[i], info.arr[j]] = [info.arr[j], info.arr[i]];
    info.arr.forEach((x, k) => (x.sort_order = k + 1));
    if (DEMO) demoSave();
    else {
      await Promise.all(
        info.arr.map((x) =>
          api("/rest/v1/" + info.table + "?id=eq." + encodeURIComponent(x.id), {
            method: "PATCH",
            body: JSON.stringify({ sort_order: x.sort_order }),
          }),
        ),
      );
      await remoteLoad();
    }
    renderAll();
  }

  function renderDataSelects() {
    const opts = state.factories
      .map(
        (f) => '<option value="' + esc(f.id) + '">' + esc(f.name) + "</option>",
      )
      .join("");
    $("exportFactory").innerHTML = '<option value="">전체 공장</option>' + opts;
    $("importTargetFactory").innerHTML =
      '<option value="">엑셀 공장명 그대로</option>' + opts;
  }
  function colName(n) {
    let s = "";
    while (n >= 0) {
      s = String.fromCharCode((n % 26) + 65) + s;
      n = Math.floor(n / 26) - 1;
    }
    return s;
  }
  const xmlEsc = (v) =>
    String(v ?? "").replace(
      /[<>&'"]/g,
      (m) =>
        ({
          "<": "&lt;",
          ">": "&gt;",
          "&": "&amp;",
          "'": "&apos;",
          '"': "&quot;",
        })[m],
    );
  function sheetXml(rows) {
    return (
      '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      rows
        .map(
          (r, ri) =>
            '<row r="' +
            (ri + 1) +
            '">' +
            r
              .map(
                (v, ci) =>
                  '<c r="' +
                  colName(ci) +
                  (ri + 1) +
                  '" t="inlineStr"' +
                  (ri === 0 ? ' s="1"' : "") +
                  "><is><t>" +
                  xmlEsc(v) +
                  "</t></is></c>",
              )
              .join("") +
            "</row>",
        )
        .join("") +
      "</sheetData></worksheet>"
    );
  }
  async function workbookBlob(rows) {
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    );
    zip
      .folder("_rels")
      .file(
        ".rels",
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      );
    zip
      .folder("xl")
      .file(
        "workbook.xml",
        '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="MSDS연결현황" sheetId="1" r:id="rId1"/></sheets></workbook>',
      );
    zip
      .folder("xl")
      .folder("_rels")
      .file(
        "workbook.xml.rels",
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      );
    zip
      .folder("xl")
      .file(
        "styles.xml",
        '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0C1935"/></patternFill></fill></fills><borders count="1"><border/></borders><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>',
      );
    zip.folder("xl").folder("worksheets").file("sheet1.xml", sheetXml(rows));
    return zip.generateAsync({
      type: "blob",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
  async function exportExcel() {
    const fid = $("exportFactory").value,
      f = factory(fid),
      rows = [["공장", "부서", "설비", "물질명", "비고", "PDF파일명"]];
    state.factories
      .filter((x) => !fid || x.id === fid)
      .forEach((fa) =>
        (fa.departments || []).forEach((d) =>
          (d.equipments || []).forEach((e) => {
            const docs = state.documents.filter((doc) =>
              doc.locations.some((l) => l.equipment_id === e.id),
            );
            if (docs.length)
              docs.forEach((doc) =>
                rows.push([
                  fa.name,
                  d.name,
                  e.name,
                  doc.material_name,
                  doc.notes || "",
                  shownFileName(doc),
                ]),
              );
            else rows.push([fa.name, d.name, e.name, "", "", ""]);
          }),
        ),
      );
    downloadBlob(
      await workbookBlob(rows),
      "FCT_MSDS_" + (f ? safeName(f.name) : "전체") + "_VER10_rev.1.xlsx",
    );
  }
  function parseCsv(text) {
    const rows = [];
    let r = [],
      c = "",
      q = false;
    for (let i = 0; i < text.length; i++) {
      const x = text[i],
        n = text[i + 1];
      if (x === '"' && q && n === '"') {
        c += '"';
        i++;
      } else if (x === '"') q = !q;
      else if (x === "," && !q) {
        r.push(c);
        c = "";
      } else if ((x === "\n" || x === "\r") && !q) {
        if (x === "\r" && n === "\n") i++;
        r.push(c);
        rows.push(r);
        r = [];
        c = "";
      } else c += x;
    }
    if (c || r.length) {
      r.push(c);
      rows.push(r);
    }
    return rows;
  }
  function xmlNodes(root, name) {
    return [...root.getElementsByTagNameNS("*", name)];
  }
  async function parseXlsx(file) {
    const zip = await JSZip.loadAsync(file),
      sf = zip.file("xl/worksheets/sheet1.xml");
    if (!sf) throw new Error("첫 번째 시트가 없습니다.");
    let shared = [];
    const ss = zip.file("xl/sharedStrings.xml");
    if (ss) {
      const x = new DOMParser().parseFromString(
        await ss.async("text"),
        "application/xml",
      );
      shared = xmlNodes(x, "si").map((si) =>
        xmlNodes(si, "t")
          .map((t) => t.textContent)
          .join(""),
      );
    }
    const x = new DOMParser().parseFromString(
      await sf.async("text"),
      "application/xml",
    );
    return xmlNodes(x, "row").map((row) => {
      const out = [];
      xmlNodes(row, "c").forEach((c) => {
        const ref = c.getAttribute("r") || "A1";
        let idx = 0;
        for (const ch of (ref.match(/[A-Z]+/) || ["A"])[0])
          idx = idx * 26 + ch.charCodeAt(0) - 64;
        idx--;
        const t = c.getAttribute("t"),
          v = xmlNodes(c, "v")[0]?.textContent || "";
        out[idx] =
          t === "s"
            ? shared[Number(v)] || ""
            : t === "inlineStr"
              ? xmlNodes(c, "t")
                  .map((n) => n.textContent)
                  .join("")
              : v;
      });
      return out;
    });
  }
  async function ensurePath(fn, dn, en) {
    let f = state.factories.find((x) => norm(x.name) === norm(fn));
    if (!f) {
      await createNamed("factory", fn);
      f = state.factories.find((x) => norm(x.name) === norm(fn));
    }
    state.selected.factory = f.id;
    let d = f.departments.find((x) => norm(x.name) === norm(dn));
    if (!d) {
      await createNamed("department", dn);
      d = factory(f.id).departments.find((x) => norm(x.name) === norm(dn));
    }
    state.selected.department = d.id;
    let e = d.equipments.find((x) => norm(x.name) === norm(en));
    if (!e) {
      await createNamed("equipment", en);
      e = dept(f.id, d.id).equipments.find((x) => norm(x.name) === norm(en));
    }
    state.selected.equipment = e.id;
    return {
      factory_id: f.id,
      department_id: d.id,
      equipment_id: e.id,
      process_id: null,
    };
  }
  async function createNamed(type, name) {
    const info = typeInfo(type);
    if (DEMO) {
      const x = {
        id: uid(type[0]),
        name,
        sort_order: info.arr.length + 1,
        ...(info.parent || {}),
      };
      if (type === "factory") x.departments = [];
      if (type === "department") x.equipments = [];
      if (type === "equipment") x.processes = [];
      info.arr.push(x);
      demoSave();
    } else {
      await api("/rest/v1/" + info.table, {
        method: "POST",
        body: JSON.stringify([
          { name, sort_order: info.arr.length + 1, ...(info.parent || {}) },
        ]),
      });
      await remoteLoad();
    }
  }
  async function importExcel() {
    const file = state.excelFile;
    if (!file) return;
    try {
      let rows = file.name.toLowerCase().endsWith(".csv")
        ? parseCsv(await file.text())
        : await parseXlsx(file);
      rows = rows.filter((r) => r.some((v) => String(v || "").trim()));
      const hi = rows.findIndex(
        (r) => r.includes("공장") && r.includes("PDF파일명"),
      );
      if (hi < 0) throw new Error("공장과 PDF파일명 열을 찾지 못했습니다.");
      const h = rows[hi].map((x) => String(x || "").trim()),
        at = (n) => h.indexOf(n),
        c = {
          f: at("공장"),
          d: at("부서"),
          e: at("설비"),
          m: at("물질명"),
          pdf: at("PDF파일명"),
        };
      if ([c.f, c.d, c.e].some((x) => x < 0))
        throw new Error("공장·부서·설비 열이 필요합니다.");
      const target = factory($("importTargetFactory").value);
      let linked = 0,
        missing = 0;
      for (const r of rows.slice(hi + 1)) {
        const fn = target?.name || String(r[c.f] || "").trim(),
          dn = String(r[c.d] || "").trim(),
          en = String(r[c.e] || "").trim();
        if (!fn || !dn || !en) continue;
        const u = await ensurePath(fn, dn, en),
          pdf = c.pdf >= 0 ? String(r[c.pdf] || "").trim() : "",
          doc = state.documents.find((x) => norm(x.file_name) === norm(pdf));
        if (doc) {
          if (DEMO) {
            const l = locationFromUse(u);
            if (!doc.locations.some((x) => x.equipment_id === l.equipment_id)) {
              doc.locations.push(l);
              linked++;
              demoSave();
            }
          } else {
            await api(
              "/rest/v1/document_locations?on_conflict=document_id,equipment_id",
              {
                method: "POST",
                headers: { Prefer: "resolution=ignore-duplicates" },
                body: JSON.stringify([{ document_id: doc.id, ...u }]),
              },
            );
            linked++;
          }
        } else if (pdf) missing++;
      }
      if (!DEMO) await remoteLoad();
      renderAll();
      toast(
        "엑셀 등록 완료 · PDF 연결 " +
          linked +
          "건" +
          (missing ? " · 원본 없음 " + missing + "건" : ""),
      );
    } catch (err) {
      alert("엑셀 등록 오류\n" + err.message);
    }
  }

  async function buildImportPlan() {
    const file = state.excelFile;
    if (!file) throw new Error("엑셀 파일을 선택해 주세요.");
    let rows = file.name.toLowerCase().endsWith(".csv")
      ? parseCsv(await file.text())
      : await parseXlsx(file);
    rows = rows.filter((r) => r.some((v) => String(v || "").trim()));
    const hi = rows.findIndex(
      (r) =>
        r.map((v) => String(v || "").trim()).includes("공장") &&
        r.map((v) => String(v || "").trim()).includes("설비"),
    );
    if (hi < 0) throw new Error("공장과 설비 열을 찾지 못했습니다.");
    const h = rows[hi].map((x) => String(x || "").trim()),
      at = (n) => h.indexOf(n),
      c = {
        f: at("공장"),
        d: at("부서"),
        e: at("설비"),
        m: at("물질명"),
        n: at("비고"),
        pdf: at("PDF파일명"),
      };
    if ([c.f, c.d, c.e].some((x) => x < 0))
      throw new Error("공장·부서·설비 열이 필요합니다.");
    const target = factory($("importTargetFactory").value),
      valid = [],
      errors = [];
    rows.slice(hi + 1).forEach((r, i) => {
      const item = {
        row: hi + i + 2,
        factory: target?.name || String(r[c.f] || "").trim(),
        department: String(r[c.d] || "").trim(),
        equipment: String(r[c.e] || "").trim(),
        material: c.m >= 0 ? String(r[c.m] || "").trim() : "",
        note: c.n >= 0 ? String(r[c.n] || "").trim() : "",
        pdf: c.pdf >= 0 ? String(r[c.pdf] || "").trim() : "",
      };
      if (!item.factory || !item.department || !item.equipment)
        errors.push({ ...item, error: "공장·부서·설비 누락" });
      else valid.push(item);
    });
    const pdfMap = new Map(state.bulkPdfFiles.map((f) => [norm(f.name), f])),
      existingNames = new Set(
        state.documents.filter(hasPdf).map((d) => norm(d.file_name)),
      );
    valid.forEach((x) => {
      x.hasPdf =
        !x.pdf || pdfMap.has(norm(x.pdf)) || existingNames.has(norm(x.pdf));
      if (x.pdf && !x.hasPdf) errors.push({ ...x, error: "PDF 파일 미첨부" });
    });
    const groups = new Map();
    valid
      .filter((x) => x.material)
      .forEach((x) => {
        const key = [norm(x.factory), norm(x.material)].join("|");
        if (!groups.has(key))
          groups.set(key, {
            factory: x.factory,
            material: x.material,
            note: x.note,
            pdf: x.pdf,
            rows: [],
          });
        groups.get(key).rows.push(x);
      });
    return {
      rows: valid,
      groups: [...groups.values()],
      errors,
      totalRows: valid.length,
    };
  }
  async function previewBulkImport() {
    try {
      state.importPlan = await buildImportPlan();
      const p = state.importPlan,
        locationCount = p.rows.length,
        materialCount = p.groups.length,
        factoryCount = new Set(p.rows.map((x) => norm(x.factory))).size;
      $("importSummary").innerHTML =
        '<b>등록 예정</b><div class="summary-grid"><span>공장<strong>' +
        factoryCount +
        "</strong></span><span>물질<strong>" +
        materialCount +
        "</strong></span><span>사용 위치<strong>" +
        locationCount +
        "</strong></span><span>오류<strong>" +
        p.errors.length +
        "</strong></span></div>" +
        (p.errors.length
          ? "<details><summary>오류 행 확인</summary><ul>" +
            p.errors
              .slice(0, 20)
              .map(
                (x) =>
                  "<li>" +
                  x.row +
                  "행 · " +
                  esc(x.material || "-") +
                  " · " +
                  esc(x.error) +
                  "</li>",
              )
              .join("") +
            "</ul></details>"
          : "<p>모든 행의 PDF 연결을 확인했습니다.</p>");
      $("importSummary").classList.remove("hidden");
      $("excelImportBtn").classList.toggle("hidden", !p.rows.length);
      toast("등록 내용을 확인했습니다.");
    } catch (err) {
      state.importPlan = null;
      $("excelImportBtn").classList.add("hidden");
      $("importSummary").classList.add("hidden");
      alert("엑셀 확인 오류\n" + err.message);
    }
  }
  async function bulkImportExcel() {
    const plan = state.importPlan;
    if (!plan?.rows.length) return;
    if (!state.notesSupported && plan.rows.some((x) => x.note)) {
      alert(
        "비고 저장 설정이 필요합니다. VER10 데이터베이스 업데이트를 먼저 실행해 주세요.",
      );
      return;
    }
    let materials = 0,
      locations = 0;
    const pdfMap = new Map(state.bulkPdfFiles.map((f) => [norm(f.name), f])),
      pathMap = new Map();
    for (const r of plan.rows) {
      const u = await ensurePath(r.factory, r.department, r.equipment);
      pathMap.set(r.row, u);
    }
    for (const group of plan.groups) {
      const uses = group.rows.map((r) => pathMap.get(r.row)),
        fid = uses[0].factory_id;
      let doc = state.documents.find(
        (x) =>
          x.factory_id === fid &&
          norm(x.material_name) === norm(group.material),
      );
      const source = group.pdf
        ? state.documents.find(
            (x) => hasPdf(x) && norm(x.file_name) === norm(group.pdf),
          )
        : null;
      let blob = group.pdf ? pdfMap.get(norm(group.pdf)) || null : null;
      if (!blob && source) blob = await resolveDocBlob(source);
      if (DEMO) {
        if (!doc) {
          const id = uid("material");
          doc = {
            id,
            factory_id: fid,
            material_name: group.material,
            notes: group.note || "",
            file_name: blob ? group.pdf : "__NO_PDF__" + id,
            storage_path: blob
              ? "demo/" + fid + "/" + group.pdf
              : "unattached/" + id,
            size_bytes: blob?.size || 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            locations: [],
          };
          state.documents.push(doc);
          materials++;
        } else doc.notes = group.note || "";
        if (blob) {
          doc.file_name = group.pdf;
          doc.storage_path = "demo/" + fid + "/" + group.pdf;
          doc.size_bytes = blob.size;
          await blobPut(doc.id, blob);
        }
        for (const u of uses) {
          const l = locationFromUse(u);
          if (!doc.locations.some((x) => x.equipment_id === l.equipment_id)) {
            doc.locations.push(l);
            locations++;
          }
        }
        demoSave();
      } else {
        const id = doc?.id || crypto.randomUUID();
        if (!doc) {
          const fileName = blob ? group.pdf : "__NO_PDF__" + id,
            path = blob
              ? "factory-" + fid + "/" + id + "/" + safeName(group.pdf)
              : "unattached/" + id;
          if (blob) await storagePut(path, blob);
          const rows = await api("/rest/v1/documents", {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify([
              {
                id,
                factory_id: fid,
                material_name: group.material,
                ...(state.notesSupported ? { notes: group.note || "" } : {}),
                file_name: fileName,
                storage_path: path,
                size_bytes: blob?.size || 0,
                updated_at: new Date().toISOString(),
              },
            ]),
          });
          doc = rows?.[0] || { id };
          materials++;
        } else {
          if (state.notesSupported)
            await api(
              "/rest/v1/documents?id=eq." + encodeURIComponent(doc.id),
              {
                method: "PATCH",
                body: JSON.stringify({
                  notes: group.note || "",
                  updated_at: new Date().toISOString(),
                }),
              },
            );
          if (blob) {
            const path =
              "factory-" + fid + "/" + doc.id + "/" + safeName(group.pdf);
            await storagePut(path, blob);
            await api(
              "/rest/v1/documents?id=eq." + encodeURIComponent(doc.id),
              {
                method: "PATCH",
                body: JSON.stringify({
                  file_name: group.pdf,
                  storage_path: path,
                  size_bytes: blob.size,
                  updated_at: new Date().toISOString(),
                }),
              },
            );
          }
        }
        for (const u of uses) {
          await api(
            "/rest/v1/document_locations?on_conflict=document_id,equipment_id",
            {
              method: "POST",
              headers: { Prefer: "resolution=ignore-duplicates" },
              body: JSON.stringify([{ document_id: doc.id, ...u }]),
            },
          );
          locations++;
        }
      }
    }
    if (!DEMO) await remoteLoad();
    state.importPlan = null;
    state.excelFile = null;
    state.bulkPdfFiles = [];
    $("excelInput").value = "";
    $("bulkPdfInput").value = "";
    $("excelFileStatus").textContent = "선택된 엑셀 없음";
    $("bulkPdfStatus").textContent = "선택된 PDF 없음";
    $("importSummary").classList.add("hidden");
    $("excelImportBtn").classList.add("hidden");
    $("excelPreviewBtn").disabled = true;
    renderAll();
    switchView("browse");
    toast(
      "전체 등록 완료 · 사용물질 " +
        materials +
        "건 · 사용 위치 " +
        locations +
        "건",
    );
  }

  function renderAll() {
    sortStructure();
    renderHierarchy();
    renderDocuments();
    renderUsageRows();
    renderManage();
    renderDataSelects();
  }
  async function saveEditedDocumentSafely(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const d = state.documents.find((x) => x.id === state.editDocumentId);
    if (!DEMO && d) {
      const latest = await api(
        "/rest/v1/documents?id=eq." +
          encodeURIComponent(d.id) +
          "&select=updated_at",
      );
      if (
        latest?.[0]?.updated_at &&
        d.updated_at &&
        latest[0].updated_at !== d.updated_at
      ) {
        await remoteLoad();
        renderAll();
        $("editDocumentDialog").close();
        toast(
          "다른 관리자가 먼저 수정했습니다. 최신 내용을 확인한 후 다시 수정해 주세요.",
        );
        return;
      }
    }
    await saveEditedDocument(e);
  }
  $("editDocumentForm").addEventListener(
    "submit",
    (e) => saveEditedDocumentSafely(e).catch((x) => toast(x.message)),
    true,
  );
  document.addEventListener("click", (e) => {
    const scope = e.target.closest("[data-open-scope]");
    if (scope) {
      e.stopImmediatePropagation();
      const item = structureItems(
        scope.dataset.openScope === "process"
          ? "processes"
          : scope.dataset.openScope + "s",
      ).find((x) => x.id === scope.dataset.scopeId);
      if (item) {
        state.statusFilter = "";
        state.browse = item.scope;
        renderHierarchy();
        renderDocuments();
      }
      return;
    }
    const next = e.target.closest("[data-edit-first-missing]");
    if (next) {
      e.stopImmediatePropagation();
      const d = state.documents.find((x) => !hasPdf(x));
      if (d) openEditDocument(d.id);
      return;
    }
    const status = e.target.closest("[data-status]");
    if (status) {
      e.stopImmediatePropagation();
      showStatus(status.dataset.status);
      return;
    }
    const register = e.target.closest("[data-register-equipment]");
    if (register) {
      e.stopImmediatePropagation();
      const l = equipmentPath(register.dataset.registerEquipment);
      if (l) prepareRegistration(l);
      return;
    }
    const openEquipment = e.target.closest("[data-open-equipment]");
    if (openEquipment) {
      e.stopImmediatePropagation();
      const l = equipmentPath(openEquipment.dataset.openEquipment);
      if (l) {
        state.statusFilter = "";
        state.browse = {
          factory_id: l.factory_id,
          department_id: l.department_id,
          equipment_id: l.equipment_id,
          process_id: "",
        };
        renderHierarchy();
        renderDocuments();
      }
      return;
    }
  });
  document.addEventListener("click", async (e) => {
    const browse = e.target.closest("[data-browse-level]");
    if (browse) {
      selectBrowse(browse.dataset.browseLevel, browse.dataset.browseId);
      return;
    }
    const crumb = e.target.closest("[data-browse-crumb]");
    if (crumb) {
      if (crumb.dataset.browseCrumb === "root") resetBrowse(false);
      else selectBrowse(crumb.dataset.browseCrumb, crumb.dataset.browseId);
      return;
    }
    const v = e.target.closest("[data-view]");
    if (v) {
      switchView(v.dataset.view);
      return;
    }
    const close = e.target.closest("[data-close-dialog]");
    if (close) {
      $(close.dataset.closeDialog).close();
      return;
    }
    const o = e.target.closest("[data-open-doc]");
    if (o) {
      await openDocument(o.dataset.openDoc);
      return;
    }
    const dl = e.target.closest("[data-download-doc]");
    if (dl) {
      await downloadDocument(dl.dataset.downloadDoc);
      return;
    }
    const ed = e.target.closest("[data-edit-doc]");
    if (ed) {
      openEditDocument(ed.dataset.editDoc);
      return;
    }
    const dd = e.target.closest("[data-delete-doc]");
    if (dd) {
      await deleteDocument(dd.dataset.deleteDoc);
      return;
    }
    const ru = e.target.closest("[data-remove-use]");
    if (ru) {
      state.draftUses = state.draftUses.filter(
        (x) => x.id !== ru.dataset.removeUse,
      );
      renderUsageRows();
      return;
    }
    const eru = e.target.closest("[data-edit-remove-use]");
    if (eru) {
      state.editUses = state.editUses.filter(
        (x) => x.id !== eru.dataset.editRemoveUse,
      );
      renderEditUsageRows();
      return;
    }
    const rf = e.target.closest("[data-remove-file]");
    if (rf) {
      state.files.splice(Number(rf.dataset.removeFile), 1);
      renderSelectedFiles();
      return;
    }
    const sel = e.target.closest("[data-select-type]");
    if (sel) {
      if (sel.dataset.selectType === "factory") {
        state.selected.factory = sel.dataset.selectId;
        state.selected.department = "";
        state.selected.equipment = "";
      }
      if (sel.dataset.selectType === "department") {
        state.selected.department = sel.dataset.selectId;
        state.selected.equipment = "";
      }
      if (sel.dataset.selectType === "equipment")
        state.selected.equipment = sel.dataset.selectId;
      renderManage();
      return;
    }
    const add = e.target.closest("[data-add-type]");
    if (add) {
      openName("add", add.dataset.addType, "");
      return;
    }
    const edit = e.target.closest("[data-edit-type]");
    if (edit) {
      e.stopPropagation();
      openName("edit", edit.dataset.editType, edit.dataset.id);
      return;
    }
    const del = e.target.closest("[data-delete-type]");
    if (del) {
      e.stopPropagation();
      await deleteStructure(del.dataset.deleteType, del.dataset.id);
      return;
    }
    const move = e.target.closest("[data-move-type]");
    if (move) {
      e.stopPropagation();
      await moveStructure(
        move.dataset.moveType,
        move.dataset.id,
        move.dataset.dir,
      );
    }
  });
  $("usageList").addEventListener("change", (e) => {
    const s = e.target.closest("[data-use]");
    if (!s) return;
    const u = state.draftUses.find((x) => x.id === s.dataset.use);
    u[s.dataset.field] = s.value;
    if (s.dataset.field === "factory_id") {
      u.department_id = "";
      u.equipment_id = "";
      u.process_id = "";
    }
    if (s.dataset.field === "department_id") {
      u.equipment_id = "";
      u.process_id = "";
    }
    if (s.dataset.field === "equipment_id") u.process_id = "";
    renderUsageRows();
  });
  $("editUsageList").addEventListener("change", (e) => {
    const s = e.target.closest("[data-edit-use]");
    if (!s) return;
    const u = state.editUses.find((x) => x.id === s.dataset.editUse);
    u[s.dataset.field] = s.value;
    if (s.dataset.field === "department_id") {
      u.equipment_id = "";
      u.process_id = "";
    }
    if (s.dataset.field === "equipment_id") u.process_id = "";
    renderEditUsageRows();
  });
  $("pdfDialog").addEventListener("close", () => {
    $("pdfFrame").src = "about:blank";
  });
  $("adminEntryBtn").addEventListener("click", openLogin);
  $("mobileAdminBtn").addEventListener("click", openLogin);
  $("logoutBtn").addEventListener("click", logout);
  $("loginForm").addEventListener("submit", login);
  $("nameForm").addEventListener("submit", saveName);
  $("editDocumentForm").addEventListener("submit", (e) =>
    saveEditedDocument(e).catch((x) => toast(x.message)),
  );
  $("editAddUsageBtn").addEventListener("click", () => {
    const d = state.documents.find((x) => x.id === state.editDocumentId),
      base = d?.locations[0];
    if (base) {
      state.editUses.push({
        id: uid("edituse"),
        factory_id: d.factory_id,
        department_id: base.department_id,
        equipment_id: base.equipment_id,
        process_id: base.process_id,
      });
      renderEditUsageRows();
    }
  });
  $("addUsageBtn").addEventListener("click", () => {
    state.draftUses.push(emptyUse());
    renderUsageRows();
  });
  $("pdfInput").addEventListener("change", (e) => addFiles(e.target.files));
  $("dropzone").addEventListener("dragover", (e) => {
    e.preventDefault();
    $("dropzone").classList.add("drag");
  });
  $("dropzone").addEventListener("dragleave", () =>
    $("dropzone").classList.remove("drag"),
  );
  $("dropzone").addEventListener("drop", (e) => {
    e.preventDefault();
    $("dropzone").classList.remove("drag");
    addFiles(e.dataTransfer.files);
  });
  $("saveDocumentsBtn").addEventListener("click", () =>
    saveDocuments().catch((e) => toast(e.message)),
  );
  $("searchInput").addEventListener("input", renderDocuments);
  $("clearBrowseBtn").addEventListener("click", () => resetBrowse(true));
  $("pcModeBtn").addEventListener("click", () => setLayoutMode("pc", true));
  $("mobileModeBtn").addEventListener("click", () =>
    setLayoutMode("mobile", true),
  );
  $("pdfClose").addEventListener("click", () => {
    $("pdfDialog").close();
    $("pdfFrame").src = "about:blank";
  });
  $("adminDownloadAllBtn").addEventListener("click", () =>
    zipAll().catch((e) => toast(e.message)),
  );
  $("excelExportBtn").addEventListener("click", () =>
    exportExcel().catch((e) => toast(e.message)),
  );
  $("excelInput").addEventListener("change", (e) => {
    state.excelFile = e.target.files?.[0] || null;
    state.importPlan = null;
    $("excelFileStatus").textContent = state.excelFile
      ? state.excelFile.name
      : "선택된 엑셀 없음";
    $("excelPreviewBtn").disabled = !state.excelFile;
    $("excelImportBtn").classList.add("hidden");
    $("importSummary").classList.add("hidden");
  });
  $("bulkPdfInput").addEventListener("change", (e) => {
    state.bulkPdfFiles = [...(e.target.files || [])];
    state.importPlan = null;
    $("bulkPdfStatus").textContent = state.bulkPdfFiles.length
      ? "PDF " + state.bulkPdfFiles.length + "개 선택"
      : "선택된 PDF 없음";
    $("excelImportBtn").classList.add("hidden");
    $("importSummary").classList.add("hidden");
  });
  $("importTargetFactory").addEventListener("change", () => {
    state.importPlan = null;
    $("excelImportBtn").classList.add("hidden");
    $("importSummary").classList.add("hidden");
  });
  $("excelPreviewBtn").addEventListener("click", previewBulkImport);
  $("excelImportBtn").addEventListener("click", () =>
    bulkImportExcel().catch((e) => alert("전체 등록 오류\n" + e.message)),
  );
  window.addEventListener("resize", () => {
    if (!layoutLocked)
      setLayoutMode(
        window.matchMedia("(max-width:760px)").matches ? "mobile" : "pc",
      );
  });
  $("homeLogo").addEventListener("click", goHome);
  async function init() {
    state.draftUses = [emptyUse()];
    setLayoutMode(
      localStorage.getItem("fct-layout-mode") ||
        (window.matchMedia("(max-width:760px)").matches ? "mobile" : "pc"),
    );
    $("demoBanner").classList.toggle("hidden", !DEMO);
    if (sessionStorage.getItem("fct-admin-unlocked") === "1") {
      state.admin = { name: "관리자" };
      state.token = DEMO ? "demo" : C.SUPABASE_ANON_KEY;
    }
    try {
      await loadData();
      applyAdminUi();
    } catch (err) {
      toast("자료 연결 오류: " + err.message);
      state.admin = null;
      state.token = "";
      applyAdminUi();
    }
  }
  init();
})();
