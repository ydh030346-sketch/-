// Notion 연동. 내부 통합(Integration) 토큰을 사용한다.
// 주의: 통합을 대상 페이지/데이터베이스에 "연결(Connections)"해 두지 않으면 404가 난다.
const { Client } = require("@notionhq/client");

function client(cfg) {
  if (!cfg.notionToken) throw new Error("Notion 토큰이 설정되지 않았습니다. 설정에서 입력하세요.");
  return new Client({ auth: cfg.notionToken });
}

function richText(text) {
  // Notion rich_text 한 조각은 2000자 제한
  const parts = [];
  for (let i = 0; i < text.length; i += 1900) {
    parts.push({ type: "text", text: { content: text.slice(i, i + 1900) } });
  }
  return parts.length ? parts : [{ type: "text", text: { content: "" } }];
}

// 아주 단순한 마크다운 → Notion 블록 변환 (#, ##, ###, -, 1., 빈 줄, 일반 문단)
function markdownToBlocks(md) {
  const blocks = [];
  for (const line of String(md || "").split(/\r?\n/)) {
    const t = line.trimEnd();
    if (!t.trim()) continue;
    let m;
    if ((m = t.match(/^###\s+(.*)/))) blocks.push(b("heading_3", m[1]));
    else if ((m = t.match(/^##\s+(.*)/))) blocks.push(b("heading_2", m[1]));
    else if ((m = t.match(/^#\s+(.*)/))) blocks.push(b("heading_1", m[1]));
    else if ((m = t.match(/^\s*[-*]\s+(.*)/))) blocks.push(b("bulleted_list_item", m[1]));
    else if ((m = t.match(/^\s*\d+[.)]\s+(.*)/))) blocks.push(b("numbered_list_item", m[1]));
    else blocks.push(b("paragraph", t));
  }
  return blocks;
}

function b(type, text) {
  return { object: "block", type, [type]: { rich_text: richText(text) } };
}

async function appendInChunks(notion, blockId, blocks) {
  for (let i = 0; i < blocks.length; i += 90) {
    await notion.blocks.children.append({ block_id: blockId, children: blocks.slice(i, i + 90) });
  }
}

function titleOf(page) {
  const props = page.properties || {};
  for (const p of Object.values(props)) {
    if (p.type === "title") return p.title.map((t) => t.plain_text).join("");
  }
  return "(제목 없음)";
}

async function search(cfg, { query }) {
  const notion = client(cfg);
  const res = await notion.search({ query, page_size: 10 });
  return res.results.map((r) => ({
    id: r.id,
    type: r.object,
    title: r.object === "database" ? (r.title || []).map((t) => t.plain_text).join("") : titleOf(r),
    url: r.url,
  }));
}

async function createPage(cfg, { title, content_markdown, parent_id, parent_type }) {
  const notion = client(cfg);
  let parent;
  let properties;
  const pid = parent_id || cfg.notionDatabaseId || cfg.notionParentPageId;
  const ptype = parent_id ? parent_type || "page" : cfg.notionDatabaseId ? "database" : "page";
  if (!pid) throw new Error("저장할 Notion 위치가 없습니다. 설정에서 데이터베이스 ID 또는 상위 페이지 ID를 넣거나, 먼저 검색으로 위치를 찾으세요.");

  if (ptype === "database") {
    parent = { database_id: pid };
    // 데이터베이스의 제목 속성 이름을 실제로 조회해서 맞춘다 (설정값이 틀려도 동작하도록)
    let titleProp = cfg.notionTitleProperty || "Name";
    try {
      const db = await notion.databases.retrieve({ database_id: pid });
      const found = Object.entries(db.properties).find(([, v]) => v.type === "title");
      if (found) titleProp = found[0];
    } catch {
      /* 권한 문제면 아래 create에서 에러가 난다 */
    }
    properties = { [titleProp]: { title: richText(title) } };
  } else {
    parent = { page_id: pid };
    properties = { title: { title: richText(title) } };
  }

  const blocks = markdownToBlocks(content_markdown);
  const page = await notion.pages.create({ parent, properties, children: blocks.slice(0, 90) });
  if (blocks.length > 90) await appendInChunks(notion, page.id, blocks.slice(90));
  return { id: page.id, url: page.url };
}

async function appendToPage(cfg, { page_id, content_markdown }) {
  const notion = client(cfg);
  await appendInChunks(notion, page_id, markdownToBlocks(content_markdown));
  return { ok: true, page_id };
}

module.exports = { search, createPage, appendToPage, markdownToBlocks };
