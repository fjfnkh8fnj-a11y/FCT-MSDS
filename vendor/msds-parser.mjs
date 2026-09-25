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
  return /영업비밀|기밀|trade\s*secret/i.test(value) ? "영업비밀" : "";
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
    .replace(/([A-Za-z])(?=\d)/g, "$1 ")
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
  const chemicalStart = Math.min(layout.chemical.x, layout.cas.x, layout.amount.x) - 100;
  const nextColumnX = [layout.alias?.x, layout.cas.x, layout.amount.x]
    .filter((x) => Number.isFinite(x) && x > layout.chemical.x + 12)
    .sort((a, b) => a - b)[0];
  const chemicalEnd = (layout.chemical.x + (nextColumnX || layout.cas.x)) / 2;
  const casColumnStart = layout.cas.x - 55;
  const casColumnEnd = amountStart;
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
    const amount = normalizeAmount(
      anchor.anchorType === "amount" ? anchor.text : amountMatch?.[0] || "",
    );
    const casText = joinColumnItems(
      inBand.filter((item) => item.x >= casColumnStart && item.x < casColumnEnd),
    );
    const cas = normalizeCas(anchor.anchorType === "cas" ? anchor.text : casText);
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
      ((amountBefore?.[0] || afterCas.match(/(?:[<>≤≥]=?\s*)?\d+(?:\.\d+)?(?:\s*[-~–—]\s*(?:[<>≤≥]=?\s*)?\d+(?:\.\d+)?)?\s*%?/)?.[0]) || ""),
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
  [...rows, ...fallback].forEach((row) => {
    const normalized = {
      name: clean(row.name)
        .replace(/^(?:화학\s*물질명|물질명|성분명)\s*[:：]?\s*/i, "")
        .trim(),
      content: clean(row.content),
      cas: clean(row.cas),
    };
    if (/^(?:CAS\s*(?:번호|No\.?)?|함유량|함량|농도)\s*[:：]?$/i.test(normalized.name))
      normalized.name = "";
    const singleAmount = normalized.content.replace(/[%<>=≤≥\s]/g, "");
    const isRange = /[-~–—]|\bto\b/i.test(normalized.content);
    if (
      /^\d+\s*\/\s*\d+$/.test(normalized.name) ||
      (!isRange && /^\d+(?:\.\d+)?$/.test(singleAmount) && Number(singleAmount) > 100)
    )
      normalized.name = "";
    if (normalized.name) {
      const existingIndex = unique.findIndex((item) =>
        normalized.cas ? item.cas === normalized.cas : !item.cas && item.name === normalized.name,
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

export function parseMsds(data) {
  const components = findComponents(data);
  const noListedComponents = /유해한\s*성분\s*없음|분류기준에\s*해당하는\s*화학물질을\s*포함하지\s*않음/i.test(data.text);
  const reviewRequired = components.some(
    (row) =>
      !row.name ||
      !row.content ||
      !row.cas ||
      row.cas === "영업비밀" ||
      row.name.length > 100 ||
      /(?:화학\s*물질명|구성\s*성분|함유량|CAS\s*(?:No|번호))/i.test(row.name),
  );
  return {
    productName: findProductName(data) || (components.length === 1 ? components[0].name : ""),
    components,
    noListedComponents,
    reviewRequired,
  };
}
