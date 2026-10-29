import { visit } from "./remark-plugins.mjs";

// The longest first-column entry that still reads as a label, such as a
// field or setting name, rather than a sentence.
const LABEL_LENGTH = 24;

// Marks tables for the layouts in theme.css:
// - "labelled" when every first-column entry is a short label, which then
//   stays on one line instead of wrapping beside a long description;
// - "stacked" for three or more columns, too wide for a phone, which reads
//   there as one card per row. Each cell then carries its column's heading
//   in data-label, which the card shows above the cell.
export function rehypeTableLayout() {
  return (tree) =>
    visit(tree, (node) => {
      if (node.tagName !== "table") return;
      const body = rows(node, "tbody");
      const classes = [];
      if (body.every((cells) => text(cells[0] ?? {}).length <= LABEL_LENGTH)) {
        classes.push("labelled");
      }
      const labels = rows(node, "thead")[0]?.map(text) ?? [];
      if (labels.length >= 3) {
        classes.push("stacked");
        for (const cells of body) {
          cells.forEach((cell, i) => {
            cell.properties.dataLabel = labels[i];
          });
        }
      }
      if (classes.length) node.properties.className = classes;
    });
}

function rows(table, section) {
  return children(table)
    .filter((child) => child.tagName === section)
    .flatMap(children)
    .filter((child) => child.tagName === "tr")
    .map((row) =>
      children(row).filter((cell) => ["th", "td"].includes(cell.tagName)),
    );
}

function children(node) {
  return node.children ?? [];
}

function text(node) {
  return node.type === "text" ? node.value : children(node).map(text).join("");
}
