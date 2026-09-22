/**
 * Hide the topic cover image inside the OP body so it is not shown twice
 * (once as the list card cover, once in the post).
 *
 * Rules:
 * - If any img has data-thumbnail="true" (|thumbnail), hide those only.
 * - Otherwise hide the first upload image / lightbox in the OP.
 * - Later images stay visible.
 */
export function hideOpCoverImage(element) {
  if (!element) {
    return;
  }

  element
    .querySelectorAll(".topic-thumbnails-hidden-cover")
    .forEach((node) => node.classList.remove("topic-thumbnails-hidden-cover"));

  const marked = element.querySelectorAll("img[data-thumbnail='true']");
  if (marked.length) {
    marked.forEach((img) => {
      const wrap = img.closest(".lightbox-wrapper");
      (wrap || img).classList.add("topic-thumbnails-hidden-cover");
    });
    return;
  }

  const firstLightbox = element.querySelector(".lightbox-wrapper");
  if (firstLightbox) {
    firstLightbox.classList.add("topic-thumbnails-hidden-cover");
    return;
  }

  const firstImg = element.querySelector(
    "img:not(.emoji):not(.avatar):not(.ytp-thumbnail-image)"
  );
  if (firstImg) {
    firstImg.classList.add("topic-thumbnails-hidden-cover");
  }
}

export function shouldHideCoverInCooked(helper, element) {
  const model = helper?.getModel?.();
  if (model && typeof model.post_number === "number") {
    return model.post_number === 1;
  }

  const postEl = element?.closest?.("[data-post-number]");
  if (postEl) {
    return postEl.getAttribute("data-post-number") === "1";
  }

  // Composer preview has no post number — still hide the preview cover.
  return !element?.closest?.(".topic-post, .post-stream");
}
