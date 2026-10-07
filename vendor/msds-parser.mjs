import { normalizeComponents, undisclosedComponent, validCas } from './material-values.mjs?v=VER13_rev.16';
const CAS_RE = /\b\d{2,7}\s*-\s*\d{2}\s*-\s*\d\b/;
const PRODUCT_LABEL_RE = /(?:^|\s)(?:가\s*[.)]?\s*)?(?:제품명|제품의\s*명칭|화학품\s*명칭|상품명|product\s*(?:name|identifier))\s*[:：]?/i;
const CHEMICAL_HEADER_RE = /화학\s*물질\s*명|화학명(?:\s*또는\s*일반명)?|물질명|구성\s*성분(?:의\s*명칭)?|성분명|chemical\s*name|ingredient/i;
const CAS_HEADER_RE = /CAS(?:\s*(?:No\.?|번호|Registry))?/i;
const AMOUNT_HEADER_RE = /함유량|함량|농도|content|concentration|weight\s*%|wt\.?\s*%/i;
const ALIAS_HEADER_RE = /관용명|이명|common\s*name|synonym/i;
const SECTION3_RE = /^\s*(?:section\s*)?[3３]\s*(?:[.．)–—-]|\s)\s*(?:구성|성분|조성|composition)/i;
const SECTION4_RE = /^\s*(?:section\s*)?[4４]\s*(?:[.．)–—-]|\s)\s*(?:응급|first\s*aid)/i;
const FOOTNOTE_RE = /^(?:※|\*|주\s*[:：]|참고\s*[:：]|note\s*[:：])/i;
const AMOUNT_RE = /^(?:(?:[<>≤≥]=?|약)\s*)?(?:\d+(?:\.\d+)?(?:\s*(?:[-~–—]|내지|to)\s*(?:[<>≤≥]=?\s*)?\d+(?:\.\d+)?)?|trace|잔량|balance|영업비밀|기밀)(?:\s*(?:%|wt\.?\s*%))?$/i;
const CANONICAL_NAMES_BY_CAS = {
  "1344-28-1": "산화알루미늄 (Aluminum oxide)",
  "7429-90-5": "알루미늄 (Aluminum)",
  "162627-22-7": "인산 폴리에스터 (Phosphoric acid polyester)",
  "7664-38-2": "인산 (Phosphoric acid)",
  "7758-99-8": "황산구리(II) 오수화물",
  "84-74-2": "디부틸 프탈레이트",
  "67-68-5": "디메틸 설폭사이드",
  "7732-18-5": "물 (Water)",
  "7803-57-8": "히드라진 수화물",
  "75-59-2": "수산화 테트라메틸암모늄",
  "64-17-5": "에탄올 (Ethanol)",
  "7705-08-0": "염화철(III) (Iron(III) chloride)",
  "108-88-3": "톨루엔 (Toluene)",
  "107-41-5": "2-메틸-2,4-펜탄디올 (Hexylene glycol)",
  "64742-47-8": "수소처리 경질 석유 증류물",
  "27360-07-2": "비닐 부티랄 중합체",
  "94-28-0": "2-에틸헥산산 에스터계 성분",
  "1333-74-0": "수소 (Hydrogen)",
  "7664-93-9": "황산 (Sulfuric acid)",
  "7647-01-0": "염화수소 (Hydrogen chloride)",
  "872-50-4": "N-메틸-2-피롤리돈",
  "109-17-1": "3,6,9-Trioxaundecamethylene dimethacrylate",
  "65894-76-0": "O-(Ethoxycarbonyl)-N-(1-methyl-2-oxo-2-phenylethylidene)hydroxylamine",
  "23779-32-0": "[3-(Triethoxysilyl)propyl]urea",
  "868-77-9": "2-하이드록시에틸 메타크릴레이트",
  "53185-52-7": "3-Methoxy-N,N-dimethylpropanamide",
  "51728-26-8": "Poly(oxy-1,2-ethanediyl) acrylate ether",
  "7664-39-3": "불화수소 (Hydrogen fluoride)",
  "999-97-3": "헥사메틸디실라잔 (HMDS)",
  "67-63-0": "이소프로필 알코올 (IPA)",
  "13967-50-5": "금 시안화칼륨 (Gold potassium cyanide)",
  "1309-48-4": "산화마그네슘",
  "7439-98-7": "몰리브덴 (Molybdenum)",
  "9004-57-3": "에틸셀룰로오스",
  "124-17-4": "부틸 카비톨 아세테이트",
  "8000-41-7": "테르피네올",
  "1302-93-8": "규산알루미늄",
  "1313-59-3": "산화나트륨",
  "1309-37-1": "산화철(III)",
  "7727-37-9": "질소 (Nitrogen)",
  "13462-88-9": "브로민화 니켈",
  "124594-15-6": "설파민산니켈 사수화물",
  "112-34-5": "부틸 카비톨",
  "63148-65-2": "폴리비닐 부티랄 (PVB)",
  "107-98-2": "프로필렌글리콜 메틸에테르",
  "67-64-1": "아세톤 (Acetone)",
  "67-56-1": "메탄올 (Methanol)",
  "14808-60-7": "결정질 실리카 (Quartz)",
  "1314-36-9": "산화이트륨",
  "1308-38-9": "산화크롬(III)",
  "848301-69-9": "C18-50 중질 석유 증류물",
  "90-30-2": "N-페닐-1-나프틸아민",
  "3115-49-9": "(4-노닐페녹시)아세트산",
  "13463-67-7": "이산화티타늄",
  "102-71-6": "트리에탄올아민",
  "10043-35-3": "붕산 (Boric acid)",
  "57675-44-2": "트라이메틸올프로판 트리올레에이트",
  "2634-33-5": "1,2-벤즈아이소티아졸-3(2H)-온 (BIT)",
  "78-93-3": "부탄온 (MEK)",
};

function clean(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lineText(cells) {
  const sorted = [...cells].sort((a, b) => a.x - b.x);
  let text = "";
  let previous = null;
  sorted.forEach((cell) => {
    if (previous) {
      const gap = cell.x - (previous.x + (previous.width || 0));
      const threshold = Math.max(1.8, Math.min(4.5, (cell.height || previous.height || 9) * 0.22));
      if (gap > threshold) text += " ";
    }
    text += cell.text;
    previous = cell;
  });
  return clean(text);
}

function normalizeCas(value) {
  const matches = clean(value).match(new RegExp(CAS_RE.source, "g")) || [];
  for (const raw of matches) {
    const normalized = raw.replace(/\s/g, "");
    const digits = normalized.replace(/-/g, "");
    const check = Number(digits.at(-1));
    const sum = [...digits.slice(0, -1)]
      .reverse()
      .reduce((total, digit, index) => total + Number(digit) * (index + 1), 0);
    if (sum % 10 === check) return normalized;
  }
  return /영업비밀|영업기밀|기밀|trade[\s-]*secret|proprietary|confidential|비대상물질|규제되지 않는 성분|T-\d{4}-\d{5}/i.test(value) ? "영업비밀" : "";
}

function groupLines(items) {
  const lines = [];
  items.forEach((item) => {
    if (!item.text) return;
    const tolerance = Math.max(2.2, Math.min(5, (item.height || 9) * 0.35));
    let line = lines.find((row) => Math.abs(row.y - item.y) <= tolerance);
    if (!line) {
      line = { y: item.y, cells: [] };
      lines.push(line);
    }
    line.cells.push(item);
  });
  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => {
      line.cells.sort((a, b) => a.x - b.x);
      line.text = lineText(line.cells);
      return line;
    });
}

export async function buildPdfData(pdf) {
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item) => clean(item.str))
      .map((item) => ({
        text: clean(item.str),
        x: Number(item.transform?.[4] || 0),
        y: Number(item.transform?.[5] || 0),
        width: Number(item.width || 0),
        height: Math.abs(Number(item.height || item.transform?.[3] || 0)),
      }));
    const lines = groupLines(items);
    pages.push({ pageNumber, items, lines, text: lines.map((line) => line.text).join("\n") });
  }
  return { pages, text: pages.map((page) => page.text).join("\n") };
}

function cleanProduct(value) {
  return clean(value)
    .replace(/^[\s·•\-:：]+/, "")
    .replace(/^대표\s*제품명\s*[:：]\s*/i, "")
    .replace(/\s+(?:MSDS|SDS)\s*(?:번호|No\.?).*$/i, "")
    .trim();
}

export function findProductName(data) {
  for (const page of data.pages.slice(0, 3)) {
    const lines = page.lines.map((line) => line.text);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!PRODUCT_LABEL_RE.test(line) || /권고\s*용도|사용상의\s*제한/.test(line)) continue;
      const inline = cleanProduct(line.replace(PRODUCT_LABEL_RE, ""));
      if (inline && inline.length <= 120) return inline;
      for (let next = index + 1; next < Math.min(lines.length, index + 5); next++) {
        const value = cleanProduct(lines[next]);
        if (!value) continue;
        if (/^[나다라마바]\s*[.)]|권고\s*용도|사용상의\s*제한|제조자|공급자/.test(value)) break;
        if (value.length <= 120) return value;
      }
    }
  }
  return "";
}

export function headerLayout(page) {
  const candidates = page.lines.filter((line) => {
    const text = line.text;
    return CAS_HEADER_RE.test(text) && AMOUNT_HEADER_RE.test(text) && CHEMICAL_HEADER_RE.test(text);
  });
  for (const line of candidates) {
    const chemicalCells = line.cells.filter((cell) => CHEMICAL_HEADER_RE.test(cell.text));
    const casCells = line.cells.filter((cell) => CAS_HEADER_RE.test(cell.text));
    const amountCells = line.cells.filter((cell) => AMOUNT_HEADER_RE.test(cell.text));
    const chemical = chemicalCells[0] || line.cells[0];
    const splitCasIndex = line.cells.findIndex(
      (cell, index) => /^C$/i.test(cell.text) && /^AS$/i.test(line.cells[index + 1]?.text || ""),
    );
    const cas =
      casCells[0] ||
      (splitCasIndex >= 0
        ? {
            ...line.cells[splitCasIndex],
            text: "CAS",
            width:
              line.cells[splitCasIndex + 1].x +
              (line.cells[splitCasIndex + 1].width || 0) -
              line.cells[splitCasIndex].x,
          }
        : null);
    const amount = amountCells[0];
    if (!chemical || !cas || !amount || new Set([chemical.x, cas.x, amount.x]).size < 3) continue;
    const alias = line.cells.find((cell) => ALIAS_HEADER_RE.test(cell.text));
    return { line, chemical, alias, cas, amount };
  }

  const casItems = page.items.filter((item) => CAS_HEADER_RE.test(item.text));
  for (const cas of casItems) {
    const near = page.items.filter((item) => Math.abs(item.y - cas.y) <= 18);
    const chemical = near.find((item) => CHEMICAL_HEADER_RE.test(item.text));
    const amount = near.find((item) => AMOUNT_HEADER_RE.test(item.text));
    if (!chemical || !amount) continue;
    return {
      line: { y: (chemical.y + cas.y + amount.y) / 3, cells: near, text: clean(near.map((x) => x.text).join(" ")) },
      chemical,
      alias: near.find((item) => ALIAS_HEADER_RE.test(item.text)),
      cas,
      amount,
    };
  }
  return null;
}

function joinColumnItems(items) {
  const rows = groupLines(items);
  return clean(rows.map((row) => row.text).join(" "))
    .replace(/^[\s·•\-]+|[\s;]+$/g, "")
    .trim();
}

function normalizeAmount(value) {
  return clean(value).replace(/\s*(?:wt\.?\s*)?%$/i, "%").replace(/\s/g, "");
}

export function cleanComponentName(value, cas) {
  const name = clean(value)
    .replace(/\s+CAS\s*번호란이\s*빈\s*칸인\s*화학물질입니다\.?$/i, "")
    .replace(/^\d+\)\s*/, "")
    .trim();
  if (/물질안전보건자료|제품\s*사양|MSDS\s*번호|문서\s*번호|페이지\s*Page|에\s*따르면|이\s*자료는|※\s*비고|기재\s*의무/i.test(name)) return CANONICAL_NAMES_BY_CAS[cas] || "";
  return name && name !== '-' ? name : CANONICAL_NAMES_BY_CAS[cas] || "";
}

export function rowsFromPositionedTable(page, layout) {
  const headerY = layout.line.y;
  const section4 = page.lines.find((line) => line.y < headerY && SECTION4_RE.test(line.text));
  const minimumY = section4?.y ?? Math.min(...page.items.map((item) => item.y)) - 1;
  const tableItems = page.items.filter((item) => item.y < headerY - 2 && item.y > minimumY);
  const casStart = Math.min(layout.cas.x, layout.amount.x);
  const casEnd = Math.max(layout.cas.x, layout.amount.x);
  const directCasCells = page.lines
    .filter((line) => line.y < headerY - 2 && line.y > minimumY && normalizeCas(line.text))
    .map((line) => ({ text: normalizeCas(line.text), x: layout.cas.x, y: line.y, anchorType: "cas" }));
  const casHeaderEnd = Math.max(
    layout.cas.x + (layout.cas.width || 0),
    ...layout.line.cells
      .filter((cell) => cell.x >= layout.cas.x && cell.x < layout.amount.x)
      .map((cell) => cell.x + (cell.width || 0)),
  );
  const amountStart = (casHeaderEnd + layout.amount.x) / 2;
  const amountEnd = layout.amount.x + Math.max(layout.amount.width || 0, 105);
  const amountCells = page.lines
    .filter((line) => line.y < headerY - 2 && line.y > minimumY)
    .map((line) => ({
      text: joinColumnItems(line.cells.filter((item) => item.x >= amountStart && item.x <= amountEnd)),
      x: layout.amount.x,
      y: line.y,
      anchorType: "amount",
    }))
    .filter((item) => AMOUNT_RE.test(clean(item.text)));
  const anchors = (directCasCells.length >= amountCells.length ? directCasCells : amountCells)
    .sort((a, b) => b.y - a.y)
    .filter((item, index, list) => !index || Math.abs(item.y - list[index - 1].y) > 3);
  if (!anchors.length) return [];

  const footnote = page.lines.find(
    (line) => line.y < anchors.at(-1).y && line.y > minimumY && FOOTNOTE_RE.test(line.text),
  );
  const chemicalStart = Math.min(...page.items.map(item=>item.x));
  const nextColumnX = [layout.alias?.x, layout.cas.x, layout.amount.x]
    .filter((x) => Number.isFinite(x) && x > layout.chemical.x + 12)
    .sort((a, b) => a - b)[0];
  const extraIdColumn = layout.line.cells.find(c=>/^(?:KE|EC)\b/.test(c.text) && c.x>layout.cas.x);
  const chemicalEnd = extraIdColumn ? (nextColumnX || layout.cas.x)-5 : (layout.chemical.x+(nextColumnX || layout.cas.x))/2;
  const casColumnStart = extraIdColumn ? layout.cas.x - 12 : layout.cas.x - 55;
  const casColumnEnd = extraIdColumn ? extraIdColumn.x - 5 : amountStart;
  const rows = [];

  anchors.forEach((anchor, index) => {
    const previous = anchors[index - 1];
    const next = anchors[index + 1];
    const upper = previous ? (previous.y + anchor.y) / 2 : headerY - 2;
    const lower = next
      ? (anchor.y + next.y) / 2
      : footnote
        ? footnote.y + 2
        : Math.max(minimumY, anchor.y - 55);
    const inBand = tableItems.filter((item) => item.y <= upper && item.y > lower);
    const name = joinColumnItems(
      inBand.filter((item) => item.x >= chemicalStart && item.x < chemicalEnd && !CAS_RE.test(item.text)),
    );
    const amountColumnText = joinColumnItems(
      inBand.filter(
        (item) =>
          item.x >= amountStart &&
          item.x <= amountEnd &&
          Math.abs(item.y - anchor.y) <= 25,
      ),
    );
    const amountMatch = amountColumnText
      .replace(/\s/g, "")
      .match(/(?:[<>≤≥]=?)?\d+(?:\.\d+)?(?:[-~–—](?:[<>≤≥]=?)?\d+(?:\.\d+)?)?%?|영업비밀|기밀|balance|trace/i);
    let amount = normalizeAmount(
      anchor.anchorType === "amount" ? anchor.text : amountMatch?.[0] || "",
    );
    const casText = joinColumnItems(
      inBand.filter((item) => item.x >= casColumnStart && item.x < casColumnEnd),
    );
    const cas = normalizeCas(anchor.anchorType === "cas" ? anchor.text : casText) || normalizeCas(joinColumnItems(inBand));
    if(!amount && validCas(cas)) {
      const line=page.lines.find(l=>Math.abs(l.y-anchor.y)<3 && normalizeCas(l.text)===cas);
      const tail=line?.text.split(cas)[1]?.trim();
      if(tail && AMOUNT_RE.test(tail)) amount=normalizeAmount(tail);
    }
    if (name) rows.push({ name, content: amount, cas });
  });
  return rows;
}

function fallbackRows(data) {
  const rows = [];
  const allLines = data.pages.flatMap((page) => page.lines);
  const start = allLines.findIndex((line) => SECTION3_RE.test(line.text));
  if (start < 0) return rows;
  const afterStart = allLines.slice(start + 1);
  const end = afterStart.findIndex((line) => SECTION4_RE.test(line.text));
  const body = end >= 0 ? afterStart.slice(0, end) : afterStart.slice(0, 80);

  const nameLabel = /^(?:\d+\s*[.．)]\s*)?(?:화학\s*물질명|물질명|성분명|화학\s*명칭|화학명|구성\s*요소|chemical\s*name)\s*[:：]?\s*/i;
  const casLabel = /^CAS\s*(?:번호|No\.?|RN|Registry\s*No\.?)?\s*[:：]?\s*/i;
  const amountLabel = /^(?:함유량(?:\(%\))?|함량|농도|성분\s*및\s*함유량|성분\s*및\s*함량|퍼센트|composition\s*\(%\)|content|concentration)\s*[:：]?\s*/i;
  let keyedName = "",
    keyedCas = "",
    keyedAmount = "";
  const pushKeyed = () => {
    if (keyedName && keyedCas && !rows.some((row) => row.cas === keyedCas)) {
      rows.push({ name: keyedName, content: keyedAmount, cas: keyedCas });
      return true;
    }
    return false;
  };
  const resetKeyed = () => {
    keyedName = "";
    keyedCas = "";
    keyedAmount = "";
  };
  body.forEach((line) => {
    const text = line.text;
    if (nameLabel.test(text)) {
      pushKeyed();
      resetKeyed();
      keyedName = clean(text.replace(nameLabel, ""));
    }
    if (casLabel.test(text)) {
      keyedCas = normalizeCas(text);
      if (keyedAmount && pushKeyed()) resetKeyed();
    }
    if (amountLabel.test(text)) {
      const value = clean(text.replace(amountLabel, ""));
      keyedAmount = normalizeAmount(
        (value.match(/(?:[<>≤≥]=?\s*)?\d+(?:\.\d+)?(?:\s*[-~–—]\s*(?:[<>≤≥]=?\s*)?\d+(?:\.\d+)?)?\s*%?/) || [""])[0],
      );
      if (keyedCas && pushKeyed()) resetKeyed();
    }
  });
  pushKeyed();

  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    const cas = normalizeCas(line.text);
    if (!cas || casLabel.test(line.text)) continue;
    const rawCas = line.text.match(CAS_RE)?.[0] || "";
    const beforeCas = clean(rawCas ? line.text.split(rawCas)[0] : line.text);
    const amountBefore = beforeCas.match(/(?:[<>≤≥]=?\s*)?\d+(?:\.\d+)?(?:\s*[-~–—]\s*\d+(?:\.\d+)?)?\s*%?/);
    let nameSource = amountBefore ? beforeCas.slice(0, amountBefore.index) : beforeCas;
    let name = clean(nameSource.split(/\s{2,}|\t+/).filter(Boolean)[0] || nameSource);
    if (!name || CHEMICAL_HEADER_RE.test(name)) name = clean(body[i - 1]?.text || "");
    const afterCas = clean(rawCas ? line.text.split(rawCas)[1] : "");
    const amount = normalizeAmount(
      ((AMOUNT_RE.test(afterCas) ? afterCas : amountBefore?.[0]) || ""),
    );
    if (name && !rows.some((row) => row.cas === cas)) rows.push({ name, content: amount, cas });
  }
  return rows;
}

export function findComponents(data) {
  const rows = [];
  let activeLayout = null;
  let inCompositionSection = false;
  data.pages.forEach((page) => {
    if (page.lines.some((line) => SECTION3_RE.test(line.text))) inCompositionSection = true;
    if (!inCompositionSection) return;
    const detectedLayout = headerLayout(page);
    if (detectedLayout) activeLayout = detectedLayout;
    const section4Line = page.lines.find((line) => SECTION4_RE.test(line.text));
    const hasCasAboveSection4 = page.lines.some(
      (line) => (!section4Line || line.y > section4Line.y) && normalizeCas(line.text),
    );
    const continuedLayout =
      !detectedLayout && inCompositionSection && activeLayout && hasCasAboveSection4
        ? {
            ...activeLayout,
            line: {
              ...activeLayout.line,
              y: Math.max(...page.items.map((item) => item.y)) + 10,
            },
          }
        : null;
    const layout = detectedLayout || continuedLayout;
    if (layout) rows.push(...rowsFromPositionedTable(page, layout));
    if (page.lines.some((line) => SECTION4_RE.test(line.text))) inCompositionSection = false;
  });
  const fallback = fallbackRows(data);
  const unique = [];
  // Prefer positioned rows; fallback must not merge two source rows with a secret CAS.
  const candidates = rows.length ? [...rows, ...fallback.filter(f => validCas(f.cas) && !rows.some(r=>r.cas===f.cas))] : fallback;
  candidates.forEach((row) => {
    const normalized = {
      name: cleanComponentName(clean(row.name)
        .replace(/^(?:화학\s*물질명|물질명|성분명)\s*[:：]?\s*/i, "")
        .trim(), clean(row.cas)),
      content: clean(row.content),
      cas: clean(row.cas),
    };
    if (/^(?:CAS\s*(?:번호|No\.?)?|함유량|함량|농도)\s*[:：]?$/i.test(normalized.name))
      normalized.name = "";
    const amountNumbers = [...normalized.content.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
    if (amountNumbers.some((number) => number > 100)) normalized.content = "";
    const singleAmount = normalized.content.replace(/[%<>=≤≥\s]/g, "");
    const isRange = /[-~–—]|\bto\b/i.test(normalized.content);
    if (
      /^\d+\s*\/\s*\d+$/.test(normalized.name) ||
      (!isRange && /^\d+(?:\.\d+)?$/.test(singleAmount) && Number(singleAmount) > 100)
    )
      normalized.name = "";
    if (normalized.name) {
      const existingIndex = unique.findIndex((item) =>
        validCas(normalized.cas) ? item.cas === normalized.cas && (item.content === normalized.content || !item.content || !normalized.content) : item.name === normalized.name && item.content === normalized.content && item.cas === normalized.cas,
      );
      if (existingIndex < 0) unique.push(normalized);
      else {
        const existing = unique[existingIndex];
        const score = (item) =>
          (item.content ? 3 : 0) +
          (item.cas ? 2 : 0) +
          (/^[\p{L}\p{N}(\[]/u.test(item.name) ? 2 : -5) -
          (item.name.length > 120 ? 4 : 0);
        if (score(normalized) > score(existing)) unique[existingIndex] = normalized;
      }
    }
  });
  return unique.slice(0, 40);
}

function findSection15Text(data) {
  const lines = data.pages.flatMap((page) => page.lines.map((line) => line.text));
  const start = lines.findIndex((line) => /^(?:section\s*)?15\s*(?:[.．–—-]|\s)\s*(?:법적|regulatory)/i.test(clean(line)));
  if (start < 0) return "";
  const body = lines.slice(start + 1);
  const end = body.findIndex((line) => /^(?:section\s*)?16\s*(?:[.．–—-]|\s)/i.test(clean(line)));
  return (end < 0 ? body.slice(0, 180) : body.slice(0, end)).map(clean).filter(Boolean).join("\n");
}

function positiveLegalItem(section, patterns) {
  const lines = section.split("\n");
  for (let index = 0; index < lines.length; index++) {
    if (!patterns.some((pattern) => pattern.test(lines[index]))) continue;
    const sample = lines.slice(index, index + 4).join(" ");
    if (/(?:해당\s*없음|해당되지\s*않음|규제\s*되지\s*않음|비해당)/.test(sample) && !/해당\s*됨/.test(sample)) continue;
    if (/해당\s*됨|\b\d{2,7}-\d{2}-\d\b|기준치\s*\(%\)|측정주기|진단주기/.test(sample)) return true;
    const current = clean(lines[index]);
    const next = clean(lines[index + 1]);
    if (!/[:：]\s*$/.test(current) && (!next || /대상|관리물질|유해물질|법에\s*의한\s*규제/.test(next))) return true;
  }
  return false;
}

export function findRegulations(data) {
  const section = findSection15Text(data);
  if (!section) return { chemical: [], osh: [], dangerous: [] };
  const chemical = [], osh = [];
  const definitions = [
    ["인체급성유해성물질", [/인체\s*급성\s*유해성물질/], chemical],
    ["인체만성유해성물질", [/인체\s*만성\s*유해성물질/], chemical],
    ["생태유해성물질", [/생태\s*유해성물질/], chemical],
    ["사고대비물질", [/사고\s*대비물질/], chemical],
    ["관리대상 유해물질", [/관리대상\s*유해(?:화학)?물질/], osh],
    ["특별관리물질", [/특별관리(?:대상)?물질/], osh],
    ["작업환경측정 대상", [/작업환경\s*측정(?:대상)?(?:물질|\s*유해인자)?/], osh],
    ["특수건강진단 대상", [/특수건강(?:검진|진단)(?:대상)?(?:물질|\s*유해인자)?/], osh],
  ];
  definitions.forEach(([label, patterns, bucket]) => {
    if (positiveLegalItem(section, patterns)) bucket.push(label);
  });

  let dangerous = [];
  const dangerStart = section.search(/위험물\s*안전관리법|위험물안전관리법/);
  if (dangerStart >= 0) {
    const tail = section.slice(dangerStart);
    const end = tail.slice(1).search(/폐기물관리법/);
    const dangerSection = end >= 0 ? tail.slice(0, end + 1) : tail.slice(0, 1200);
    const productNegative = /제품\s*[:：]?[^\n]*(?:해당되지\s*않음|규제되지\s*않음)|위험물에\s*해당되지\s*않음|위험물안전관리법[^\n]*(?:해당\s*없음|규제\s*되지\s*않음)/.test(dangerSection);
    if (!productNegative) {
      const classLine = dangerSection.split("\n").map(clean).find((line) => /제\s*[1-6]\s*류/.test(line));
      if (classLine) dangerous = [classLine.replace(/^[-·•\s]+/, "").slice(0, 120)];
    }
  }
  return { chemical: [...new Set(chemical)], osh: [...new Set(osh)], dangerous };
}

export function parseMsds(data) {
  const components = normalizeComponents(findComponents(data));
  const noListedComponents = /유해한\s*성분\s*없음|분류기준에\s*해당하는\s*화학물질을\s*포함하지\s*않음/i.test(data.text);
  const reviewRequired = components.some(
    (row) => !undisclosedComponent(row) && (
      !row.name ||
      !row.content ||
      (!row.cas && !/^(?:additive|첨가제|영업비밀|영업기밀|기밀|filler\s*other|규제되지 않는 성분|기타\s*\(영업기밀\))/i.test(row.name || '')) ||
      /(?:화학\s*물질명|구성\s*성분|함유량|CAS\s*(?:No|번호))/i.test(row.name)),
  );
  return {
    productName: findProductName(data) || (components.length === 1 ? components[0].name : ""),
    physicalState: data.text.match(/(?:물리적\s*상태|성상)\s*[:：]?\s*(액체|고체|기체)/i)?.[1] || '',
    components,
    regulations: findRegulations(data),
    noListedComponents,
    reviewRequired,
  };
}

