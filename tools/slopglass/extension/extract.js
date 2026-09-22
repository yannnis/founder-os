/**
 * Finds LinkedIn feed posts and reads the author's own text.
 * Loaded before content.js. Also imported by the node test via vm.
 */
(function (root) {
  var POST_SELECTOR = [
    "div.feed-shared-update-v2",
    "article.feed-shared-update-v2",
    "div[data-urn*='urn:li:activity']",
    "div[data-id*='urn:li:activity']",
    "article[data-urn*='urn:li:activity']",
  ].join(",");

  var TEXT_SELECTOR = [
    ".update-components-text",
    ".feed-shared-update-v2__description",
    ".feed-shared-inline-show-more-text",
    "[data-testid='expandable-text-box']",
  ].join(",");

  var AUTHOR_SELECTOR = ".update-components-actor__name, .update-components-actor__title";

  function normalizePost(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(function (line) {
        return line.replace(/[ \t]+/g, " ").trim();
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function inComment(node) {
    return Boolean(
      node.closest(".comments-comment-item, .comments-comments-list, .comments-comment-entity, .comments-comment-item__main-content"),
    );
  }

  function owned(rootEl, node) {
    if (!node || typeof node.closest !== "function") return false;
    if (inComment(node)) return false;
    return node.closest(POST_SELECTOR) === rootEl;
  }

  function findPostRoots(doc) {
    var nodes = Array.prototype.slice.call(doc.querySelectorAll(POST_SELECTOR));
    var seen = new Set();
    return nodes.filter(function (node) {
      if (seen.has(node)) return false;
      seen.add(node);
      if (node.closest(".comments-comment-item, .comments-comments-list, .comments-comment-entity")) {
        return false;
      }
      return true;
    });
  }

  function isNested(rootEl) {
    var parent = rootEl.parentElement;
    if (!parent || typeof parent.closest !== "function") return false;
    var outer = parent.closest(POST_SELECTOR);
    return Boolean(outer && outer !== rootEl);
  }

  function isRepost(rootEl) {
    var nested = Array.prototype.slice.call(rootEl.querySelectorAll(POST_SELECTOR)).some(function (node) {
      return node !== rootEl;
    });
    if (!nested) return false;
    var post = readPost(rootEl);
    if (!post) return true;
    return post.text.length < 40;
  }

  function readPost(rootEl) {
    var nodes = Array.prototype.slice.call(rootEl.querySelectorAll(TEXT_SELECTOR)).filter(function (node) {
      return owned(rootEl, node);
    });
    var chunks = nodes
      .filter(function (node) {
        return !nodes.some(function (other) {
          return other !== node && node.contains(other);
        });
      })
      .map(function (node) {
        return node.textContent || "";
      });

    var text = normalizePost(chunks.join("\n"));
    if (!text) return null;

    var authorNode = Array.prototype.slice.call(rootEl.querySelectorAll(AUTHOR_SELECTOR)).find(function (node) {
      return owned(rootEl, node);
    });
    var author = authorNode ? normalizePost(authorNode.textContent || "") : "";
    var urn = rootEl.getAttribute("data-urn") || rootEl.getAttribute("data-id") || "";

    return { text: text, author: author, urn: urn };
  }

  root.SlopglassExtract = {
    POST_SELECTOR: POST_SELECTOR,
    findPostRoots: findPostRoots,
    readPost: readPost,
    normalizePost: normalizePost,
    isNested: isNested,
    isRepost: isRepost,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
