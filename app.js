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
    metadataSupported: DEMO,
    selected: { factory: "", department: "", equipment: "" },
    browse: {
      factory_id: "",
      department_id: "",
      equipment_id: "",
      process_id: "",
    },
    statusFilter: "",
    draftUses: [],
    draftComponents: [],
    editUses: [],
    editComponents: [],
    files: [],
    excelFile: null,
    bulkPdfFiles: [],
    importPlan: null,
    edit: null,
    editDocumentId: "",
    layoutMode: "",
    regPath: [],
    analysisResult: null,
    analysisRun: 0,
    isAnalyzing: false,
    isSaving: false,
    isEditing: false,
  };
  let layoutLocked = Boolean(localStorage.getItem("fct-layout-mode"));
  let toastTimer = null;

  const REGULATORY_CATALOG = {
    toluene: {
      components: [
        { name: "톨루엔", content: "85% 이상 여부 확인", cas: "108-88-3" },
      ],
      regulations: {
        chemical: ["사고대비물질"],
        osh: ["관리대상 유해물질", "작업환경측정 대상", "특수건강진단 대상"],
        dangerous: ["제4류 인화성액체", "제1석유류(비수용성)", "지정수량 200L"],
        basis:
          "사고대비물질: 톨루엔 85% 이상 함유 혼합물. 위험물 분류는 제품 인화점과 함량을 최종 확인해야 합니다.",
        checked_at: "2026-09-22",
      },
    },
  };

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
  const pdfKey = (v) =>
    norm(v)
      .normalize("NFKC")
      .replace(/[^a-z0-9가-힣]/g, "");
  const BULK_PDF_ALIASES = {
    ipa: ["isopropylalcohol"],
    습동면유: ["shellmorlinas2bl10"],
    절삭유: ["onc3002"],
    boricacid: ["boricacid"],
    cuso4: ["copperiisulfatepentahydrate", "coppersulfate"],
    ferricchloride: ["염화제2철"],
    h2so4: ["황산msds20251113"],
    hcl: ["염산msds20251113"],
    hf: ["불산msds"],
    kaucn2: ["goldpotassiumcyanide", "pgc"],
    nickelsulfamate: ["nisulfamate60"],
    ry5125: ["ry5100series"],
    wbr2050: ["wbr2000series"],
    ethanol: ["ethanol995"],
    alumina: ["aluminumoxide"],
    alumina알루미나파우더al2o3: ["aluminumoxide"],
    byk111: ["disperbyk111"],
    dbp: ["dibutylphthalate"],
    dibutylphthalatedbp: ["dibutylphthalate"],
    ethanol995: ["ethanol995"],
    ethylalcohol95: ["ethanol95"],
    magnesiumoxidemgo산화마그네슘: ["tatehomag500"],
    mgo: ["tatehomag500"],
    mopaste: ["paronmp2"],
    mopasteparonmp289: ["paronmp2"],
    mullite: ["shomullite"],
    mullitekcm: ["shomullite"],
    mullite뮬라이트: ["shomullite"],
    mullite뮬라이트kcmlinker: ["shomullite"],
    pastefctp2: ["fctp2paste"],
    pastepctp1: ["fctp1paste"],
    pastev1: ["fctv1paste"],
    pvbbinder: ["slecb", "slecbbhblbm"],
    silicondioxide: ["snowmarksp3"],
    silicondioxide이산화규소: ["snowmarksp3"],
    toluene995: ["toluenemsds"],
    산화이트륨yttriumiiioxide: ["yttriumoxide"],
    산화크롬chromiumiiioxide: ["cr2o3"],
    이산화타이타늄titaniumdioxide: ["tio2"],
  };
  function automaticBulkPdfName(material) {
    const key = pdfKey(material),
      aliases = BULK_PDF_ALIASES[key] || [key],
      candidates = state.bulkPdfFiles
        .map((file) => ({ file, key: pdfKey(file.name.replace(/\.pdf$/i, "")) }))
        .filter(({ key: fileKey }) =>
          aliases.some((alias) => alias && (fileKey.includes(alias) || alias.includes(fileKey))),
        );
    if (!candidates.length) return "";
    candidates.sort((a, b) => {
      const exactA = aliases.some((alias) => a.key === alias) ? 1 : 0,
        exactB = aliases.some((alias) => b.key === alias) ? 1 : 0;
      return exactB - exactA || a.key.length - b.key.length;
    });
    return candidates[0].file.name;
  }
  function catalogFor(name) {
    const key = norm(name)
      .replace(/[^a-z가-힣0-9]/g, "")
      .replace(/(?:물질안전보건자료|msds|sds)$/i, "");
    return ["톨루엔", "toluene", "톨루엔toluene", "toluene톨루엔"].includes(key)
      ? REGULATORY_CATALOG.toluene
      : null;
  }
  function metadataFor(doc) {
    const preset = catalogFor(doc.material_name) || {},
      stored = doc.regulations || {},
      presetReg = preset.regulations || {};
    return {
      components:
        Array.isArray(doc.components) && doc.components.length
          ? doc.components
          : preset.components || [],
      regulations: {
        ...presetReg,
        ...stored,
        chemical: (stored.chemical || []).length ? stored.chemical : presetReg.chemical || [],
        osh: (stored.osh || []).length ? stored.osh : presetReg.osh || [],
        dangerous: (stored.dangerous || []).length ? stored.dangerous : presetReg.dangerous || [],
        basis: stored.basis || presetReg.basis || "",
      },
    };
  }
  function regulationHasValues(r = {}) {
    return Boolean((r.chemical || []).length || (r.osh || []).length || (r.dangerous || []).length || r.basis || r.physical_state);
  }
  function searchableText(doc) {
    const m = metadataFor(doc), r = m.regulations || {};
    return norm([
      doc.material_name, shownFileName(doc), doc.notes,
      ...(m.components || []).flatMap((c) => [c.name, c.content, c.cas]),
      ...(r.chemical || []), ...(r.osh || []), ...(r.dangerous || []),
      r.basis, r.physical_state,
      ...(doc.locations || []).flatMap((l) => [l.factory_name,l.department_name,l.equipment_name]),
    ].filter(Boolean).join(" "));
  }
  const safeName = (v) => String(v || "file").replace(/[\\/:*?"<>|]/g, "_");
  const storageSafeName = (v) => {
    const original = safeName(v);
    const dot = original.lastIndexOf(".");
    const ext = dot >= 0 ? original.slice(dot).replace(/[^.A-Za-z0-9_-]/g, "") : "";
    const stem = (dot >= 0 ? original.slice(0, dot) : original)
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
    return (stem || "msds") + (ext || ".pdf");
  };
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
        "/rest/v1/documents?select=id,factory_id,material_name,notes,components,regulations,file_name,storage_path,size_bytes,created_at,updated_at,document_locations(id,factory_id,department_id,equipment_id,process_id,factories(name),departments(name),equipments(name))&order=created_at.desc",
      );
      state.notesSupported = true;
      state.metadataSupported = true;
    } catch (err) {
      if (!/notes|column|schema cache/i.test(err.message)) throw err;
      state.metadataSupported = false;
      try {
        docs = await api(
          "/rest/v1/documents?select=id,factory_id,material_name,notes,file_name,storage_path,size_bytes,created_at,updated_at,document_locations(id,factory_id,department_id,equipment_id,process_id,factories(name),departments(name),equipments(name))&order=created_at.desc",
        );
        state.notesSupported = true;
      } catch (notesErr) {
        docs = await api(
          "/rest/v1/documents?select=id,factory_id,material_name,file_name,storage_path,size_bytes,created_at,updated_at,document_locations(id,factory_id,department_id,equipment_id,process_id,factories(name),departments(name),equipments(name))&order=created_at.desc",
        );
        state.notesSupported = false;
      }
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

  function regulationGroups(doc) {
    const m = metadataFor(doc),
      r = m.regulations || {};
    return {
      chemical: r.chemical || [],
      osh: r.osh || [],
      dangerous: r.dangerous || [],
    };
  }
  function regulationReviewLabel(doc) {
    const r = metadataFor(doc).regulations || {};
    return r.confirmed
      ? '<span class="review-state confirmed">확인 완료</span>'
      : '<span class="review-state pending">자동입력 · 확인 필요</span>';
  }
  function regulationBadges(doc) {
    const g = regulationGroups(doc),
      labels = [
        ...g.chemical,
        ...g.osh,
        ...(g.dangerous.length ? ["위험물"] : []),
      ];
    return labels.length
      ? '<span class="reg-badges">' +
          labels
            .slice(0, 4)
            .map((x) => "<em>" + esc(x) + "</em>")
            .join("") +
          (labels.length > 4
            ? "<em>외 " + (labels.length - 4) + "개</em>"
            : "") +
          "</span>"
      : "";
  }
  function regulatoryStats(items = state.documents) {
    const defs = {
      chemical: {
        label: "유해화학물질",
        children: [
          "인체급성유해성물질",
          "인체만성유해성물질",
          "생태유해성물질",
          "사고대비물질",
        ],
      },
      osh: {
        label: "산업안전보건법 대상",
        children: [
          "관리대상 유해물질",
          "특별관리물질",
          "작업환경측정 대상",
          "특수건강진단 대상",
        ],
      },
      dangerous: {
        label: "위험물",
        children: ["제1류", "제2류", "제3류", "제4류", "제5류", "제6류"],
      },
    };
    const level = state.regPath[0],
      detail = state.regPath[1];
    const make = (key, label, matcher) => {
      const docs = items.filter((d) =>
        matcher(regulationGroups(d)[level || key] || []),
      );
      const cas = new Set(
        docs
          .flatMap((d) => metadataFor(d).components.map((c) => c.cas))
          .filter(Boolean),
      );
      return { key, label, products: docs.length, ingredients: cas.size, pending: docs.filter((d)=>!metadataFor(d).regulations.confirmed).length };
    };
    if (!level)
      return Object.entries(defs).map(([k, v]) =>
        make(k, v.label, (a) => a.length),
      );
    if (!detail)
      return defs[level].children.map((x) =>
        make(x, x, (a) =>
          a.some((v) => v.includes(x) || x.includes(String(v).split("(")[0])),
        ),
      );
    return [];
  }
  function renderRegulatoryDashboard() {
    const box = $("regDashboard"),
      back = $("regBackBtn"),
      crumb = $("regBreadcrumb");
    if (!box) return;
    const labels = {
      chemical: "유해화학물질",
      osh: "산업안전보건법 대상",
      dangerous: "위험물",
    };
    crumb.textContent = [
      "전체 법적 규제 현황",
      ...state.regPath.map((x) => labels[x] || x),
    ].join(" › ");
    back.classList.toggle("hidden", !state.regPath.length);
    const stats = regulatoryStats();
    if (stats.length) {
      box.innerHTML = stats
        .map(
          (x) =>
            '<button type="button" data-reg-key="' +
            esc(x.key) +
            '"><span>' +
            esc(x.label) +
            "</span><strong>" +
            x.products +
            "개 제품</strong><small>규제 성분 " +
            x.ingredients +
            "개</small>" +
            (x.pending ? '<em class="reg-review-count">확인 필요 '+x.pending+'개</em>' : '<em class="reg-review-count done">전체 확인 완료</em>') +
            "</button>",
        )
        .join("");
      return;
    }
    const level = state.regPath[0],
      detail = state.regPath[1];
    const docs = state.documents.filter((d) =>
      (regulationGroups(d)[level] || []).some(
        (v) => v.includes(detail) || detail.includes(String(v).split("(")[0]),
      ),
    );
    box.innerHTML = docs.length
      ? docs
          .map((d) => {
            const m = metadataFor(d);
            return (
              '<article class="reg-product"><b>' +
              esc(d.material_name) +
              regulationReviewLabel(d) +
              "</b><span>" +
              m.components
                .map(
                  (c) =>
                    esc(c.name) + " · " + esc(c.content) + " · " + esc(c.cas),
                )
                .join("<br>") +
              "</span><small>" +
              esc(m.regulations.basis || "판정 근거 확인 필요") +
              '</small><button class="btn btn-light btn-small" data-open-reg-doc="' +
              esc(d.id) +
              '">사용처 보기</button></article>'
            );
          })
          .join("")
      : '<div class="reg-empty">해당 제품이 없습니다.</div>';
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
    if (!["browse", "regulations", "help"].includes(name) && !state.admin) {
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
    if (name === "regulations") renderRegulatoryDashboard();
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
      !$("view-regulations").classList.contains("active") &&
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
          (!q || searchableText(d).includes(q)) &&
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
          : "공장을 선택하거나 제품명을 검색하세요.";
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
    state.analysisRun++;
    state.analysisResult = null;
    state.draftComponents = [emptyComponent()];
    $("materialName").value = "";
    $("materialNote").value = "";
    clearRegulationForm();
    $("analysisStatus").classList.add("hidden");
    $("existingDocumentNotice").classList.add("hidden");
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
          (metadataFor(d).regulations.physical_state ? '<span class="state-badge">'+esc(metadataFor(d).regulations.physical_state)+'</span>' : '') +
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
          regulationBadges(d) +
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
          (metadataFor(d).regulations.physical_state ? '<span class="state-badge">'+esc(metadataFor(d).regulations.physical_state)+'</span>' : '') +
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
          regulationBadges(d) +
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
      : "<b>조건에 맞는 사용물질이 없습니다.</b>공장 단계 또는 제품명을 다시 확인하세요.";
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
  function emptyComponent() {
    return { id: uid("component"), name: "", content: "", cas: "" };
  }
  function renderComponentRows() {
    if (!state.draftComponents.length)
      state.draftComponents = [emptyComponent()];
    $("componentList").innerHTML = state.draftComponents
      .map(
        (c) =>
          '<div class="component-row"><input data-component="' +
          esc(c.id) +
          '" data-component-field="name" value="' +
          esc(c.name) +
          '" placeholder="화학물질명"><input data-component="' +
          esc(c.id) +
          '" data-component-field="content" value="' +
          esc(c.content) +
          '" placeholder="함량(%)"><input data-component="' +
          esc(c.id) +
          '" data-component-field="cas" value="' +
          esc(c.cas) +
          '" placeholder="CAS No."><button type="button" class="usage-remove" data-remove-component="' +
          esc(c.id) +
          '" ' +
          (state.draftComponents.length === 1 ? "disabled" : "") +
          ">×</button></div>",
      )
      .join("");
  }
  function selectedValues(name) {
    return [
      ...document.querySelectorAll('input[name="' + name + '"]:checked'),
    ].map((x) => x.value);
  }
  function draftRegulations() {
    const dangerous = $("regDangerous").checked
      ? [
          $("dangerousClass").value.trim(),
          $("designatedQuantity").value.trim(),
        ].filter(Boolean)
      : [];
    return {
      chemical: selectedValues("regChemical"),
      osh: selectedValues("regOsh"),
      dangerous,
      basis: $("regBasis").value.trim(),
      checked_at: new Date().toISOString().slice(0, 10),
      confirmed: $("regConfirmed").checked,
      confirmed_at: $("regConfirmed").checked ? new Date().toISOString() : "",
      physical_state: $("physicalState").value,
      input_method: state.analysisResult?.method || "manual",
      missing_fields: state.analysisResult?.missing || [],
    };
  }
  function clearRegulationForm() {
    document.querySelectorAll('input[name="regChemical"],input[name="regOsh"]').forEach((x) => (x.checked = false));
    $("regDangerous").checked = false;
    $("dangerousClass").value = "";
    $("designatedQuantity").value = "";
    $("regBasis").value = "";
    $("regConfirmed").checked = false;
    $("physicalState").value = "";
  }
  function clearPdfDerivedFields() {
    state.analysisRun++;
    state.isAnalyzing = false;
    state.analysisResult = null;
    state.draftComponents = [emptyComponent()];
    renderComponentRows();
    clearRegulationForm();
    $("materialName").value = "";
    $("analysisStatus").classList.add("hidden");
    updateExistingNotice();
  }
  function updateExistingNotice() {
    const uses = state.draftUses.filter((u) => u.factory_id);
    const fids = [...new Set(uses.map((u) => u.factory_id))];
    const found = fids.length === 1 && state.documents.find((d) => d.factory_id === fids[0] && norm(d.material_name) === norm($("materialName").value));
    $("existingDocumentNotice").classList.toggle("hidden", !found);
    if (!found) $("updateExistingInfo").checked = false;
    return found || null;
  }
  function applyCatalogToForm(preserveComponents = false) {
    const preset = catalogFor($("materialName").value);
    if (!preset) return;
    if (!preserveComponents) {
      state.draftComponents = preset.components.map((c) => ({
        id: uid("component"),
        ...c,
      }));
      renderComponentRows();
    }
    document
      .querySelectorAll('input[name="regChemical"],input[name="regOsh"]')
      .forEach(
        (x) =>
          (x.checked = [
            ...(preset.regulations.chemical || []),
            ...(preset.regulations.osh || []),
          ].includes(x.value)),
      );
    $("regDangerous").checked = Boolean(preset.regulations.dangerous?.length);
    $("dangerousClass").value = preset.regulations.dangerous?.[0] || "";
    $("designatedQuantity").value =
      preset.regulations.dangerous?.[2] ||
      preset.regulations.dangerous?.[1] ||
      "";
    $("regBasis").value = preset.regulations.basis || "";
  }
  function setAnalysisStatus(items, scanned = false) {
    const box = $("analysisStatus");
    box.classList.remove("hidden");
    box.innerHTML =
      "<b>" +
      (scanned ? "자동인식 불가 · 수기입력 필요" : "PDF 자동분석 결과") +
      '</b><div class="analysis-grid">' +
      items.map(x => '<span class="'+(x.ok?'found':'missing')+'"><i>'+(x.ok?'✓':'!')+'</i>'+esc(x.label)+'<small>'+esc(x.message || (x.ok?'자동입력 완료':'미입력 · 수기확인 필요'))+'</small></span>').join("") +
      "</div>" +
      (scanned ? "<p>글자가 이미지로 저장된 스캔 PDF입니다. 아래 입력칸에 직접 입력해 주세요.</p>" : "<p>자동입력 결과는 저장 전에 반드시 확인·수정해 주세요.</p>");
  }
  async function extractPdfData(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = new TextDecoder("latin1").decode(bytes.slice(0, 1024));
    if (!header.includes("%PDF-")) {
      const error = new Error("보안 또는 DRM 적용 PDF");
      error.code = "SECURED_PDF";
      throw error;
    }
    const pdfjs = await import("./vendor/pdf.min.mjs");
    const parser = await import("./vendor/msds-parser.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.mjs";
    let pdf;
    try {
      pdf = await pdfjs.getDocument({ data: bytes }).promise;
    } catch (error) {
      if (/password|encrypted|invalid pdf|pdf structure/i.test(error?.message || ""))
        error.code = "SECURED_PDF";
      throw error;
    }
    const data = await parser.buildPdfData(pdf);
    data.parsed = parser.parseMsds(data);
    return data;
  }
  async function enrichBulkGroupFromPdf(group, file) {
    if (!file) return;
    const missing = new Set(group.regulations.missing_fields || []);
    try {
      const pdfData = await extractPdfData(file),
        text = pdfData.text || "",
        compact = text.replace(/\s+/g, " ").trim();
      if (!compact || compact.length < 40) {
        group.regulations.input_method = "scanned";
        ["화학물질명", "함량", "CAS No.", "법적 규제정보"].forEach((x) => missing.add(x));
      } else {
        if (!group.components.length && pdfData.parsed.components.length)
          group.components = pdfData.parsed.components.map((item) => ({ ...item }));
        if (!group.regulations.physical_state) {
          const stateMatch = compact.match(/(?:물리적\s*상태|성상)\s*[:：]?\s*(액체|고체|기체)/i);
          if (stateMatch) group.regulations.physical_state = stateMatch[1];
        }
        const known = [
          ["인체급성유해성물질", "chemical"],
          ["인체만성유해성물질", "chemical"],
          ["생태유해성물질", "chemical"],
          ["사고대비물질", "chemical"],
          ["관리대상 유해물질", "osh"],
          ["특별관리물질", "osh"],
          ["작업환경측정 대상", "osh"],
          ["특수건강진단 대상", "osh"],
        ];
        known.forEach(([label, bucket]) => {
          if (text.replace(/\s/g, "").includes(label.replace(/\s/g, "")))
            group.regulations[bucket] = [...new Set([...group.regulations[bucket], label])];
        });
        if (/제\s*4\s*류|제1\s*석유류|위험물안전관리법/.test(text))
          group.regulations.dangerous = [
            ...new Set([...group.regulations.dangerous, "제4류 인화성액체(세부 품명 확인 필요)"]),
          ];
        group.regulations.input_method = "pdf-text";
        if (!group.components.length && !pdfData.parsed.noListedComponents)
          ["화학물질명", "함량", "CAS No."].forEach((x) => missing.add(x));
        missing.add("법적 규제정보");
      }
    } catch (error) {
      group.regulations.input_method = error?.code === "SECURED_PDF" ? "secured" : "failed";
      ["화학물질명", "함량", "CAS No.", "법적 규제정보"].forEach((x) => missing.add(x));
    }
    group.regulations.missing_fields = [...missing];
  }
  async function analyzeSelectedPdf() {
    const file = state.files[0];
    if (!file || state.isAnalyzing) return;
    const run = ++state.analysisRun;
    const btn = $("analyzePdfBtn"), save = $("saveDocumentsBtn");
    state.isAnalyzing = true;
    btn.disabled = true;
    save.disabled = true;
    btn.textContent = "PDF 분석 중…";
    setAnalysisStatus([{label:"PDF 읽기",ok:true,message:"페이지를 분석하고 있습니다."}]);
    try {
      const pdfData = await extractPdfData(file),
        text = pdfData.text,
        compact = text.replace(/\s+/g," ").trim();
      if (run !== state.analysisRun || state.files[0] !== file) return;
      if (compact.length < 40) { state.analysisResult={method:"scanned",missing:["제품명","성상","화학물질명","함량","CAS No.","법적 규제정보"]}; setAnalysisStatus([{label:"제품명"},{label:"성상"},{label:"화학물질명·함량"},{label:"CAS No."},{label:"법적 규제정보"}], true); return; }
      const comps = pdfData.parsed.components.map((item) => ({ id: uid("component"), ...item })); if (comps.length) { state.draftComponents = comps; renderComponentRows(); }
      const parsedProduct = pdfData.parsed.productName || "";
      const filenameProduct = file.name.replace(/\.pdf$/i, "").replace(/^(msds|sds)[\s_\-]*/i, "").trim();
      const product = /^\d+$/.test(parsedProduct) || /^o\s*제품\s*형태/i.test(parsedProduct) ? filenameProduct : parsedProduct;
      if (!$("materialName").value.trim() && product) $("materialName").value = product;
      if (catalogFor($("materialName").value)) applyCatalogToForm(Boolean(comps.length));
      const stateMatch = compact.match(/(?:물리적\s*상태|성상)\s*[:：]?\s*(액체|고체|기체)/i);
      if (stateMatch) $("physicalState").value = stateMatch[1];
      const known=[["인체급성유해성물질","regChemical"],["인체만성유해성물질","regChemical"],["생태유해성물질","regChemical"],["사고대비물질","regChemical"],["관리대상 유해물질","regOsh"],["특별관리물질","regOsh"],["작업환경측정 대상","regOsh"],["특수건강진단 대상","regOsh"]];
      known.forEach(([label,name])=>{if(text.replace(/\s/g,"").includes(label.replace(/\s/g,""))){const el=[...document.querySelectorAll('input[name="'+name+'"]')].find(x=>x.value===label);if(el)el.checked=true;}});
      if (/제\s*4\s*류|제1\s*석유류|위험물안전관리법/.test(text)) { $("regDangerous").checked=true; if(!$("dangerousClass").value)$("dangerousClass").value="제4류 인화성액체(세부 품명 확인 필요)"; }
      const noListed = Boolean(pdfData.parsed.noListedComponents);
      const reviewRequired = Boolean(pdfData.parsed.reviewRequired);
      const regulationCandidates = selectedValues("regChemical").length+selectedValues("regOsh").length+($("regDangerous").checked?1:0)>0;
      const items=[
        {label:"제품명",ok:Boolean($("materialName").value.trim())},
        {label:"성상",ok:Boolean($("physicalState").value),message:$("physicalState").value || "미입력 · 수기확인 필요"},
        noListed
          ? {label:"구성성분",ok:true,message:"MSDS에 기재 대상 성분 없음"}
          : {label:"화학물질명",ok:Boolean(comps.length)&&comps.every(x=>x.name)},
        {label:"함량",ok:noListed||(Boolean(comps.length)&&comps.every(x=>x.content))},
        {label:"CAS No.",ok:noListed||(Boolean(comps.length)&&comps.every(x=>x.cas))},
        {label:"법적 규제정보",ok:false,message:regulationCandidates?"자동 후보 · 원문 확인 필요":"미입력 · 수기확인 필요"},
        ...(reviewRequired ? [{label:"자동분석 검토",ok:false,message:"복합 표·영업비밀 항목 확인 필요"}] : [])
      ];
      state.analysisResult={method:"pdf-text",missing:items.filter(x=>!x.ok).map(x=>x.label)}; setAnalysisStatus(items);
      updateExistingNotice();
    } catch (err) {
      if (run !== state.analysisRun) return;
      const secured = err?.code === "SECURED_PDF";
      state.analysisResult={method:secured?"secured":"failed",missing:["제품명","성상","화학물질명","함량","CAS No.","법적 규제정보"]};
      setAnalysisStatus([{label:secured?"보안 PDF":"손상되었거나 읽을 수 없는 PDF"},{label:"제품명"},{label:"성상"},{label:"화학물질명·함량"},{label:"법적 규제정보"}],true);
      if (secured) $("analysisStatus").querySelector("b").textContent = "보안 PDF · 수기입력 필요";
      if (secured) $("analysisStatus").querySelector("p").textContent = "보안 또는 DRM이 적용된 PDF입니다. PDF는 그대로 첨부하고 항목은 직접 입력해 주세요.";
    }
    finally {
      if (run === state.analysisRun) {
        state.isAnalyzing = false;
        btn.disabled = !state.files.length;
        save.disabled = false;
        btn.textContent="PDF 다시 분석";
      }
    }
  }
  function addFiles(files) {
    const list = [...files], f = list.find((x) => x.type === "application/pdf" || x.name.toLowerCase().endsWith(".pdf"));
    if (!f) { toast("PDF 파일 한 개를 선택해 주세요."); return; }
    if (f.size > 50 * 1024 * 1024) { toast("PDF는 50MB 이하만 등록할 수 있습니다."); return; }
    clearPdfDerivedFields();
    state.files = [f];
    renderSelectedFiles();
    $("analyzePdfBtn").disabled = false;
    analyzeSelectedPdf();
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
  async function saveDocumentsCore() {
    const uses = state.draftUses,
      material = $("materialName").value.trim(),
      note = $("materialNote").value.trim(),
      file = state.files[0] || null,
      components = state.draftComponents
        .filter((c) => c.name || c.content || c.cas)
        .map(({ name, content, cas }) => ({
          name: name.trim(),
          content: content.trim(),
          cas: cas.trim(),
        })),
      regulations = draftRegulations();
    if (
      !uses.length ||
      uses.some((u) => !u.factory_id || !u.department_id || !u.equipment_id)
    ) {
      toast("모든 사용처를 선택해 주세요.");
      return;
    }
    if (!material) {
      toast("제품명을 입력해 주세요.");
      return;
    }
    if (note && !state.notesSupported) {
      toast(
        "비고 저장 설정이 필요합니다. VER11 데이터베이스 업데이트를 먼저 실행해 주세요.",
      );
      return;
    }
    if (
      !DEMO &&
      !state.metadataSupported &&
      (components.length ||
        regulations.chemical.length ||
        regulations.osh.length ||
        regulations.dangerous.length)
    ) {
      toast(
        "VER11 데이터베이스 설정 후 성분·규제정보를 저장할 수 있습니다.",
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
    const existedBeforeSave = Boolean(doc);
    const updateExisting = !doc || $("updateExistingInfo").checked;
    const saveFile = updateExisting ? file : null;
    if (DEMO) {
      if (!doc) {
        const id = uid("material");
        doc = {
          id,
          factory_id: factoryId,
          material_name: material,
          notes: note,
          components,
          regulations,
          file_name: saveFile ? saveFile.name : "__NO_PDF__" + id,
          storage_path: saveFile
            ? "demo/" + factoryId + "/" + saveFile.name
            : "unattached/" + id,
          size_bytes: saveFile?.size || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          locations: [],
        };
        state.documents.push(doc);
      } else if (updateExisting) {
        doc.notes = note;
        if (components.length) doc.components = components;
        if (regulationHasValues(regulations)) doc.regulations = regulations;
        doc.updated_at = new Date().toISOString();
      }
      if (saveFile) {
        doc.file_name = saveFile.name;
        doc.storage_path = "demo/" + factoryId + "/" + saveFile.name;
        doc.size_bytes = saveFile.size;
        await blobPut(doc.id, saveFile);
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
        const fileName = saveFile ? saveFile.name : "__NO_PDF__" + id,
          path = saveFile
            ? "factory-" + factoryId + "/" + id + "/" + storageSafeName(saveFile.name)
            : "unattached/" + id;
        if (saveFile) await storagePut(path, saveFile);
        let rows;
        try {
          rows = await api("/rest/v1/documents", {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify([{id,factory_id:factoryId,material_name:material,...(state.notesSupported?{notes:note}:{}),...(state.metadataSupported?{components,regulations}:{}),file_name:fileName,storage_path:path,size_bytes:saveFile?.size||0,updated_at:new Date().toISOString()}]),
          });
        } catch (error) {
          if (saveFile) await storageDelete([path]).catch(() => {});
          throw error;
        }
        doc = rows?.[0] || { id };
      } else if (updateExisting) {
        if (state.notesSupported || state.metadataSupported)
          await api("/rest/v1/documents?id=eq." + encodeURIComponent(doc.id), {
            method: "PATCH",
            body: JSON.stringify({
              ...(state.notesSupported && note ? { notes: note } : {}),
              ...(state.metadataSupported && components.length ? { components } : {}),
              ...(state.metadataSupported && regulationHasValues(regulations) ? { regulations } : {}),
              updated_at: new Date().toISOString(),
            }),
          });
        if (saveFile) {
          const path =
            "factory-" + factoryId + "/" + doc.id + "/" + storageSafeName(saveFile.name);
          await storagePut(path, saveFile);
          await api("/rest/v1/documents?id=eq." + encodeURIComponent(doc.id), {
            method: "PATCH",
            body: JSON.stringify({
              file_name: saveFile.name,
              storage_path: path,
              size_bytes: saveFile.size,
              updated_at: new Date().toISOString(),
            }),
          });
        }
      }
      try {
        const linkedEquipmentIds = new Set((doc.locations || []).map((x) => x.equipment_id));
        for (const u of uses) {
          if (linkedEquipmentIds.has(u.equipment_id)) continue;
          await api("/rest/v1/document_locations", {
            method: "POST",
            body: JSON.stringify([{document_id:doc.id,factory_id:u.factory_id,department_id:u.department_id,equipment_id:u.equipment_id,process_id:u.process_id}]),
          });
          linkedEquipmentIds.add(u.equipment_id);
        }
      } catch (error) {
        if (!existedBeforeSave) {
          await api("/rest/v1/documents?id=eq."+encodeURIComponent(doc.id), {method:"DELETE"}).catch(()=>{});
          if (saveFile && doc.storage_path) await storageDelete([doc.storage_path]).catch(()=>{});
        }
        throw error;
      }
    }
    state.files = [];
    state.draftUses = [emptyUse()];
    state.draftComponents = [emptyComponent()];
    $("materialName").value = "";
    $("materialNote").value = "";
    clearRegulationForm();
    $("pdfInput").value = "";
    state.analysisResult = null;
    $("analyzePdfBtn").disabled = true;
    $("analyzePdfBtn").textContent = "PDF 자동분석";
    $("analysisStatus").classList.add("hidden");
    $("existingDocumentNotice").classList.add("hidden");
    $("updateExistingInfo").checked = false;
    renderSelectedFiles();
    if (!DEMO) await remoteLoad();
    renderAll();
    switchView("browse");
    toast(
      saveFile
        ? "사용물질과 PDF를 저장했습니다."
        : doc && !updateExisting
          ? "기존 제품정보는 유지하고 사용처만 추가했습니다."
          : "사용물질을 저장했습니다. PDF는 나중에 첨부할 수 있습니다.",
    );
  }
  async function saveDocuments() {
    if (state.isAnalyzing) { toast("PDF 분석이 끝난 뒤 저장해 주세요."); return; }
    if (state.isSaving) return;
    state.isSaving = true;
    const btn = $("saveDocumentsBtn");
    btn.disabled = true;
    btn.textContent = "저장 중…";
    try { await saveDocumentsCore(); }
    finally { state.isSaving = false; btn.disabled = false; btn.textContent = "사용물질 저장"; }
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
  function renderEditComponentRows() {
    if (!state.editComponents.length) state.editComponents = [emptyComponent()];
    $("editComponentList").innerHTML = state.editComponents.map((c) =>
      '<div class="component-row"><input data-edit-component="'+esc(c.id)+'" data-component-field="name" value="'+esc(c.name)+'" placeholder="화학물질명"><input data-edit-component="'+esc(c.id)+'" data-component-field="content" value="'+esc(c.content)+'" placeholder="함량(%)"><input data-edit-component="'+esc(c.id)+'" data-component-field="cas" value="'+esc(c.cas)+'" placeholder="CAS No."><button type="button" class="usage-remove" data-edit-remove-component="'+esc(c.id)+'" '+(state.editComponents.length===1?'disabled':'')+'>×</button></div>'
    ).join("");
  }
  function setChecked(name, values) {
    const set = new Set(values || []);
    document.querySelectorAll('input[name="'+name+'"]').forEach((x) => (x.checked = set.has(x.value)));
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
    const meta = metadataFor(d), r = meta.regulations || {};
    state.editComponents = (meta.components || []).map((c) => ({id:uid("editcomponent"),name:c.name||"",content:c.content||"",cas:c.cas||""}));
    renderEditComponentRows();
    setChecked("editRegChemical", r.chemical);
    setChecked("editRegOsh", r.osh);
    $("editRegDangerous").checked = Boolean((r.dangerous || []).length);
    $("editDangerousClass").value = r.dangerous?.[0] || "";
    $("editDesignatedQuantity").value = r.dangerous?.[2] || r.dangerous?.[1] || "";
    $("editRegBasis").value = r.basis || "";
    $("editRegConfirmed").checked = Boolean(r.confirmed);
    $("editPhysicalState").value = r.physical_state || "";
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
      file = $("editPdfInput").files?.[0],
      components = state.editComponents.filter((c)=>c.name||c.content||c.cas).map(({name,content,cas})=>({name:name.trim(),content:content.trim(),cas:cas.trim()})),
      regulations = {
        chemical:selectedValues("editRegChemical"), osh:selectedValues("editRegOsh"),
        dangerous:$("editRegDangerous").checked ? [$("editDangerousClass").value.trim(),$("editDesignatedQuantity").value.trim()].filter(Boolean) : [],
        basis:$("editRegBasis").value.trim(), physical_state:$("editPhysicalState").value,
        confirmed:$("editRegConfirmed").checked, confirmed_at:$("editRegConfirmed").checked?new Date().toISOString():"",
        checked_at:new Date().toISOString().slice(0,10), input_method:"manual-review", missing_fields:[],
      };
    if (!d || !name) return;
    if (note && !state.notesSupported) {
      toast(
        "비고 저장 설정이 필요합니다. VER11 데이터베이스 업데이트를 먼저 실행해 주세요.",
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
      d.components = components;
      d.regulations = regulations;
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
        ...(state.metadataSupported ? { components, regulations } : {}),
        updated_at: new Date().toISOString(),
      };
      if (file) {
        if (file.size > 50 * 1024 * 1024) { toast("PDF는 50MB 이하만 등록할 수 있습니다."); return; }
        const old = hasPdf(d) ? d.storage_path : "",
          path =
            "factory-" + d.factory_id + "/" + d.id + "/" + storageSafeName(file.name);
        await storagePut(path, file);
        patch = {
          ...patch,
          file_name: file.name,
          storage_path: path,
          size_bytes: file.size,
        };
        patch._old_storage_path = old && old !== path ? old : "";
      }
      const oldPath = patch._old_storage_path;
      delete patch._old_storage_path;
      await api("/rest/v1/documents?id=eq." + encodeURIComponent(d.id), {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (oldPath) await storageDelete([oldPath]).catch(() => {});
      const linkedEquipmentIds = new Set((d.locations || []).map((x) => x.equipment_id));
      for (const l of locations) {
        if (linkedEquipmentIds.has(l.equipment_id)) continue;
        await api("/rest/v1/document_locations", {
          method: "POST",
          body: JSON.stringify([{document_id:d.id,factory_id:d.factory_id,department_id:l.department_id,equipment_id:l.equipment_id,process_id:l.process_id}]),
        });
        linkedEquipmentIds.add(l.equipment_id);
      }
      const keep = new Set(locations.map((l)=>l.equipment_id));
      for (const old of d.locations.filter((l)=>!keep.has(l.equipment_id))) {
        await api("/rest/v1/document_locations?id=eq."+encodeURIComponent(old.id), {method:"DELETE"});
      }
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
      await api("/rest/v1/documents?id=eq." + encodeURIComponent(id), {
        method: "DELETE",
      });
      if (hasPdf(d)) await storageDelete([d.storage_path]).catch(() => {});
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
      "FCT_MSDS_전체PDF_VER11_rev.1.zip",
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
    const linked = state.documents.filter((d) => d.locations.some((l) =>
      type === "factory" ? l.factory_id === id : type === "department" ? l.department_id === id : l.equipment_id === id
    ));
    if (linked.length) {
      alert(info.label + "에 사용물질 " + linked.length + "건이 연결되어 있어 삭제할 수 없습니다.\n사용물질 수정에서 위치를 옮기거나 해당 자료를 삭제한 뒤 다시 시도해 주세요.");
      return;
    }
    if (
      !confirm(info.label + "를 삭제할까요? 연결된 사용물질은 없습니다.")
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
      rows = [
        [
          "공장",
          "부서",
          "설비",
          "제품명",
          "성상",
          "화학물질명",
          "함량",
          "CAS No.",
          "유해화학물질",
          "산안법",
          "위험물",
          "판정근거",
          "규제확인",
          "입력방식",
          "미입력항목",
          "비고",
          "PDF파일명",
        ],
      ];
    state.factories
      .filter((x) => !fid || x.id === fid)
      .forEach((fa) =>
        (fa.departments || []).forEach((d) =>
          (d.equipments || []).forEach((e) => {
            const docs = state.documents.filter((doc) =>
              doc.locations.some((l) => l.equipment_id === e.id),
            );
            if (docs.length)
              docs.forEach((doc) => {
                const m = metadataFor(doc),
                  comps = m.components.length
                    ? m.components
                    : [{ name: "", content: "", cas: "" }],
                  r = m.regulations || {};
                comps.forEach((c) =>
                  rows.push([
                    fa.name,
                    d.name,
                    e.name,
                    doc.material_name,
                    r.physical_state || "",
                    c.name || "",
                    c.content || "",
                    c.cas || "",
                    (r.chemical || []).join(", "),
                    (r.osh || []).join(", "),
                    (r.dangerous || []).join(", "),
                    r.basis || "",
                    r.confirmed ? "확인" : "검토필요",
                    r.input_method === "pdf-text" ? "PDF 자동입력" : r.input_method === "scanned" ? "스캔 PDF · 수기입력" : r.input_method === "secured" ? "보안 PDF · 수기입력" : r.input_method || "수기입력",
                    (r.missing_fields || []).join(", "),
                    doc.notes || "",
                    shownFileName(doc),
                  ]),
                );
              });
            else
              rows.push([
                fa.name,
                d.name,
                e.name,
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
              ]);
          }),
        ),
      );
    downloadBlob(
      await workbookBlob(rows),
      "FCT_MSDS_" + (f ? safeName(f.name) : "전체") + "_VER11_rev.1.xlsx",
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
          m: at("제품명") >= 0 ? at("제품명") : at("물질명"),
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
            if (!doc.locations.some((x) => x.equipment_id === u.equipment_id)) {
              await api("/rest/v1/document_locations", {
                method: "POST",
                body: JSON.stringify([{ document_id: doc.id, ...u }]),
              });
              doc.locations.push(locationFromUse(u));
              linked++;
            }
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
    const hi = rows.findIndex((r) => {
      const cells = r.map((v) => String(v || "").trim());
      return cells.includes("설비") && (cells.includes("제품명") || cells.includes("물질명"));
    });
    if (hi < 0) throw new Error("제품명과 설비 열을 찾지 못했습니다.");
    const h = rows[hi].map((x) => String(x || "").trim()),
      at = (n) => h.indexOf(n),
      c = {
        f: at("공장"),
        d: at("부서"),
        e: at("설비"),
        m: at("제품명") >= 0 ? at("제품명") : at("물질명"),
        state: at("성상") >= 0 ? at("성상") : at("약품상태"),
        component: at("화학물질명"),
        content: at("함량"),
        cas: at("CAS No."),
        chemical: at("유해화학물질"),
        osh: at("산안법"),
        dangerous: at("위험물"),
        basis: at("판정근거"),
        confirmed: at("규제확인"),
        method: at("입력방식"),
        missing: at("미입력항목"),
        n: at("비고"),
        pdf: at("PDF파일명"),
      };
    const target = factory($("importTargetFactory").value),
      valid = [],
      errors = [];
    if (c.d < 0 || c.e < 0) throw new Error("부서·설비 열이 필요합니다.");
    if (c.f < 0 && !target)
      throw new Error("공장 열이 없는 엑셀입니다. 위에서 등록할 공장을 먼저 선택해 주세요.");
    rows.slice(hi + 1).forEach((r, i) => {
      const item = {
        row: hi + i + 2,
        factory: target?.name || String(r[c.f] || "").trim(),
        department: String(r[c.d] || "").trim(),
        equipment: String(r[c.e] || "").trim(),
        material: c.m >= 0 ? String(r[c.m] || "").trim() : "",
        physicalState: c.state >= 0 ? String(r[c.state] || "").trim() : "",
        component: c.component >= 0 ? String(r[c.component] || "").trim() : "",
        content: c.content >= 0 ? String(r[c.content] || "").trim() : "",
        cas: c.cas >= 0 ? String(r[c.cas] || "").trim() : "",
        chemical: c.chemical >= 0 ? String(r[c.chemical] || "").split(/[,;\n]/).map(x=>x.trim()).filter(Boolean) : [],
        osh: c.osh >= 0 ? String(r[c.osh] || "").split(/[,;\n]/).map(x=>x.trim()).filter(Boolean) : [],
        dangerous: c.dangerous >= 0 ? String(r[c.dangerous] || "").split(/[,;\n]/).map(x=>x.trim()).filter(Boolean) : [],
        basis: c.basis >= 0 ? String(r[c.basis] || "").trim() : "",
        confirmed: c.confirmed >= 0 && /^(확인|y|yes|true|1)$/i.test(String(r[c.confirmed] || "").trim()),
        method: c.method >= 0 ? String(r[c.method] || "").trim() : "",
        missing: c.missing >= 0 ? String(r[c.missing] || "").split(/[,;\n]/).map(x=>x.trim()).filter(Boolean) : [],
        note: c.n >= 0 ? String(r[c.n] || "").trim() : "",
        pdf: c.pdf >= 0 ? String(r[c.pdf] || "").trim() : "",
      };
      if (!item.factory || !item.department || !item.equipment)
        errors.push({ ...item, error: "공장·부서·설비 누락" });
      else valid.push(item);
    });
    const pdfMap = new Map(state.bulkPdfFiles.map((f) => [norm(f.name), f])),
      oversizedNames = new Set(state.bulkPdfFiles.filter((f)=>f.size>50*1024*1024).map((f)=>norm(f.name))),
      existingNames = new Set(
        state.documents.filter(hasPdf).map((d) => norm(d.file_name)),
      );
    valid.forEach((x) => {
      if (!x.pdf && x.material) {
        x.pdf = automaticBulkPdfName(x.material);
        x.autoPdf = Boolean(x.pdf);
      }
      x.hasPdf =
        !x.pdf || pdfMap.has(norm(x.pdf)) || existingNames.has(norm(x.pdf));
      if (x.pdf && !x.hasPdf) errors.push({ ...x, error: "PDF 파일 미첨부" });
      if (x.pdf && oversizedNames.has(norm(x.pdf))) errors.push({ ...x, error: "PDF 50MB 초과" });
    });
    const pdfNameCounts = new Map();
    state.bulkPdfFiles.forEach((f)=>pdfNameCounts.set(norm(f.name),(pdfNameCounts.get(norm(f.name))||0)+1));
    for (const [name,count] of pdfNameCounts) if (count>1) errors.push({row:"-",material:name,error:"같은 이름의 PDF "+count+"개 선택"});
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
            components: [],
            regulations: {chemical:[],osh:[],dangerous:[],basis:"",physical_state:"",confirmed:false,confirmed_at:"",input_method:"excel",missing_fields:[]},
            rows: [],
          });
        const g = groups.get(key);
        g.rows.push(x);
        if (x.note) g.note = x.note;
        if (x.pdf) g.pdf = x.pdf;
        if (x.component || x.content || x.cas) {
          const ck = [norm(x.component),norm(x.content),norm(x.cas)].join("|");
          if (!g.components.some((c)=>[norm(c.name),norm(c.content),norm(c.cas)].join("|")===ck)) g.components.push({name:x.component,content:x.content,cas:x.cas});
        }
        for (const k of ["chemical","osh","dangerous"]) g.regulations[k] = [...new Set([...g.regulations[k],...x[k]])];
        if (x.basis) g.regulations.basis = x.basis;
        if (x.physicalState) g.regulations.physical_state = x.physicalState;
        if (x.confirmed) { g.regulations.confirmed = true; g.regulations.confirmed_at = new Date().toISOString(); }
        if (x.method) g.regulations.input_method = /PDF 자동입력/.test(x.method) ? "pdf-text" : /스캔/.test(x.method) ? "scanned" : /보안/.test(x.method) ? "secured" : x.method;
        g.regulations.missing_fields = [...new Set([...g.regulations.missing_fields,...x.missing])];
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
        factoryCount = new Set(p.rows.map((x) => norm(x.factory))).size,
        pdfCount = p.groups.filter((x) => x.pdf).length,
        pendingPdfCount = materialCount - pdfCount;
      $("importSummary").innerHTML =
        '<b>등록 예정</b><div class="summary-grid"><span>공장<strong>' +
        factoryCount +
        "</strong></span><span>물질<strong>" +
        materialCount +
        "</strong></span><span>PDF 연결<strong>" +
        pdfCount +
        "</strong></span><span>PDF 확인 필요<strong>" +
        pendingPdfCount +
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
          : "<p>엑셀 행을 확인했습니다." +
            (pendingPdfCount ? " PDF를 찾지 못한 제품은 PDF 확인 필요로 등록됩니다." : " 모든 제품의 PDF를 연결했습니다.") +
            "</p>");
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
    if (state.bulkPdfFiles.some((f)=>f.size>50*1024*1024)) { alert("50MB를 초과한 PDF가 있습니다. 해당 파일을 제외하거나 크기를 줄여 주세요."); return; }
    const selectedNames = state.bulkPdfFiles.map((f)=>norm(f.name));
    if (new Set(selectedNames).size !== selectedNames.length) { alert("같은 이름의 PDF가 여러 개 선택되었습니다. 중복 파일을 제외해 주세요."); return; }
    if (!state.notesSupported && plan.rows.some((x) => x.note)) {
      alert(
        "비고 저장 설정이 필요합니다. VER11 데이터베이스 업데이트를 먼저 실행해 주세요.",
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
      if (blob) await enrichBulkGroupFromPdf(group, blob);
      if (DEMO) {
        if (!doc) {
          const id = uid("material");
          doc = {
            id,
            factory_id: fid,
            material_name: group.material,
            notes: group.note || "",
            components: group.components,
            regulations: group.regulations,
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
        } else {
          if (group.note) doc.notes = group.note;
          if (group.components.length) doc.components = group.components;
          if (regulationHasValues(group.regulations)) doc.regulations = group.regulations;
        }
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
              ? "factory-" + fid + "/" + id + "/" + storageSafeName(group.pdf)
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
                ...(state.metadataSupported ? { components:group.components, regulations:group.regulations } : {}),
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
          if (state.notesSupported || state.metadataSupported)
            await api(
              "/rest/v1/documents?id=eq." + encodeURIComponent(doc.id),
              {
                method: "PATCH",
                body: JSON.stringify({
                  ...(state.notesSupported && group.note ? {notes:group.note} : {}),
                  ...(state.metadataSupported && group.components.length ? {components:group.components} : {}),
                  ...(state.metadataSupported && regulationHasValues(group.regulations) ? {regulations:group.regulations} : {}),
                  updated_at: new Date().toISOString(),
                }),
              },
            );
          if (
            blob &&
            (!hasPdf(doc) || norm(doc.file_name) !== norm(group.pdf))
          ) {
            const path =
              "factory-" + fid + "/" + doc.id + "/" + storageSafeName(group.pdf);
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
        const linkedEquipmentIds = new Set((doc.locations || []).map((x) => x.equipment_id));
        for (const u of uses) {
          if (linkedEquipmentIds.has(u.equipment_id)) continue;
          await api("/rest/v1/document_locations", {
            method: "POST",
            body: JSON.stringify([{ document_id: doc.id, ...u }]),
          });
          linkedEquipmentIds.add(u.equipment_id);
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
    renderComponentRows();
    renderRegulatoryDashboard();
    renderManage();
    renderDataSelects();
  }
  async function saveEditedDocumentSafely(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (state.isEditing) return;
    state.isEditing = true;
    const saveBtn = $("editDocumentSaveBtn");
    saveBtn.disabled = true;
    saveBtn.textContent = "저장 중…";
    try {
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
    } finally {
      state.isEditing = false;
      saveBtn.disabled = false;
      saveBtn.textContent = "수정 저장";
    }
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
    const reg = e.target.closest("[data-reg-key]");
    if (reg) {
      state.regPath.push(reg.dataset.regKey);
      renderRegulatoryDashboard();
      return;
    }
    const regDoc = e.target.closest("[data-open-reg-doc]");
    if (regDoc) {
      const d = state.documents.find((x) => x.id === regDoc.dataset.openRegDoc);
      if (d) {
        state.regPath = [];
        state.statusFilter = "";
        $("searchInput").value = d.material_name;
        renderRegulatoryDashboard();
        renderDocuments();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
    const removeComponent = e.target.closest("[data-remove-component]");
    if (removeComponent) {
      state.draftComponents = state.draftComponents.filter(
        (x) => x.id !== removeComponent.dataset.removeComponent,
      );
      renderComponentRows();
      return;
    }
    const editRemoveComponent = e.target.closest("[data-edit-remove-component]");
    if (editRemoveComponent) {
      state.editComponents = state.editComponents.filter((x) => x.id !== editRemoveComponent.dataset.editRemoveComponent);
      renderEditComponentRows();
      return;
    }
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
      state.analysisRun++;
      state.isAnalyzing = false;
      state.files = [];
      renderSelectedFiles();
      $("analyzePdfBtn").disabled = !state.files.length;
      $("saveDocumentsBtn").disabled = false;
      if (!state.files.length) $("analysisStatus").classList.add("hidden");
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
    updateExistingNotice();
  });
  $("componentList").addEventListener("input", (e) => {
    const el = e.target.closest("[data-component]");
    if (!el) return;
    const c = state.draftComponents.find((x) => x.id === el.dataset.component);
    if (c) c[el.dataset.componentField] = el.value;
  });
  $("editComponentList").addEventListener("input", (e) => {
    const el = e.target.closest("[data-edit-component]");
    if (!el) return;
    const c = state.editComponents.find((x) => x.id === el.dataset.editComponent);
    if (c) c[el.dataset.componentField] = el.value;
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
  $("editAddComponentBtn").addEventListener("click", () => {
    state.editComponents.push(emptyComponent());
    renderEditComponentRows();
  });
  $("addUsageBtn").addEventListener("click", () => {
    state.draftUses.push(emptyUse());
    renderUsageRows();
  });
  $("addComponentBtn").addEventListener("click", () => {
    state.draftComponents.push(emptyComponent());
    renderComponentRows();
  });
  $("materialName").addEventListener("change", () => { applyCatalogToForm(); updateExistingNotice(); });
  $("materialName").addEventListener("input", updateExistingNotice);
  $("regBackBtn").addEventListener("click", () => {
    state.regPath.pop();
    renderRegulatoryDashboard();
  });
  $("pdfInput").addEventListener("change", (e) => addFiles(e.target.files));
  $("analyzePdfBtn").addEventListener("click", analyzeSelectedPdf);
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
