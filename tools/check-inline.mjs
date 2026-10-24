/* 校验 index.html 内联脚本语法 */
import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
const startTag = html.lastIndexOf("<script>");
const endTag = html.lastIndexOf("</script>");
if (startTag < 0 || endTag < 0) {
  console.log("未找到内联脚本");
  process.exit(1);
}
const code = html.slice(startTag + "<script>".length, endTag);
try {
  new Function(code);
  console.log("内联脚本语法 OK，长度", code.length);
} catch (e) {
  console.log("语法错误:", e.message);
  process.exit(1);
}
