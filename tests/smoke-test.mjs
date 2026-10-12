import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
assert.deepEqual(duplicateIds, [], "HTML 中不能出现重复 id");

const queriedIds = [...app.matchAll(/querySelector\("#([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
const missingIds = [...new Set(queriedIds.filter((id) => !ids.includes(id)))];
assert.deepEqual(missingIds, [], "app.js 查询的元素必须存在于 index.html");

for (const venue of ["field1", "field2", "field3"]) {
  assert.match(app, new RegExp(`${venue}:`), `缺少球场配置：${venue}`);
  assert.match(html, new RegExp(`value="${venue}"`), `管理员表单缺少球场：${venue}`);
}

assert.match(html, /id="booking-venue"/, "预约表单必须记录球场");
assert.match(html, /id="booking-half"/, "预约表单必须记录半场");

console.log("Smoke test passed: 三块球场配置与页面引用完整。");
