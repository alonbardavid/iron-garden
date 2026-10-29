import { PRODUCT_DISPLAY_NAME } from "@lib/contract/constants";

const PRODUCT_NAME_TOKEN = /%PRODUCT_NAME%/g;

// Pages write %PRODUCT_NAME% (as index.html does) instead of the product name,
// which is never hardcoded: in text, code and link targets alike.
export function remarkProductName() {
  return (tree) =>
    visit(tree, (node) => {
      if (typeof node.value === "string") {
        node.value = node.value.replace(
          PRODUCT_NAME_TOKEN,
          PRODUCT_DISPLAY_NAME,
        );
      }
      if (typeof node.url === "string") {
        node.url = node.url.replace(PRODUCT_NAME_TOKEN, PRODUCT_DISPLAY_NAME);
      }
    });
}

// Pages link to each other from the site root (/getting-started/deploy/),
// never with the base, which differs between the app's /docs/ and a standalone
// site. The links validator runs after this, on the prefixed links.
export function remarkBaseLinks({ base }) {
  const prefix = base.replace(/\/$/, "");
  return () => (tree) =>
    visit(tree, (node) => {
      if (
        (node.type === "link" || node.type === "definition") &&
        node.url.startsWith("/") &&
        !node.url.startsWith("//")
      ) {
        node.url = prefix + node.url;
      }
    });
}

export function visit(node, fn) {
  fn(node);
  node.children?.forEach((child) => visit(child, fn));
}
