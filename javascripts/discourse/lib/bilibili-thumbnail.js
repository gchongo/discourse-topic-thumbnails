import { ajax } from "discourse/lib/ajax";

const bilibiliThumbnailCache = new Map();
const bilibiliThumbnailInflight = new Map();
const LOCAL_THUMBNAIL_PATH_REGEXP = /\/(?:uploads|optimized)\//;
const BILIBILI_VIDEO_ID_REGEXP =
  /(?:bilibili\.com\/video\/|player\.bilibili\.com\/[^"'?\s]*[?&](?:bvid=)|\/video\/|[?&]bvid=)(BV[a-zA-Z0-9]+)/i;
const BILIBILI_AID_REGEXP =
  /(?:bilibili\.com\/video\/av|player\.bilibili\.com\/[^"'?\s]*[?&](?:aid=)|[?&]aid=)(\d+)/i;
const BILIBILI_VIDEO_URL_REGEXP =
  /https?:\/\/(?:www\.)?bilibili\.com\/video\/(BV[a-zA-Z0-9]+|av\d+)[^"'\s<]*/i;
const BILIBILI_SHORT_URL_REGEXP =
  /https?:\/\/(?:www\.)?b23\.tv\/[A-Za-z0-9]+[^"'\s<]*/i;
const BILIBILI_PLAYER_URL_REGEXP =
  /https?:\/\/player\.bilibili\.com\/player\.html\?[^"'\s<]*/i;

function remoteFallbackEnabled() {
  // New theme settings may be undefined until the component is re-saved;
  // treat missing as enabled (matches settings.yml default: true).
  return settings.bilibili_remote_thumbnail_fallback !== false;
}

function parseOverrideMap() {
  const map = new Map();
  const raw = (settings.bilibili_thumbnail_urls || "")
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean);

  for (let index = 0; index < raw.length - 1; index += 2) {
    map.set(raw[index].toLowerCase(), raw[index + 1]);
  }

  return map;
}

const bilibiliThumbnailOverrides = parseOverrideMap();

function normalizeUrl(url) {
  return url?.replaceAll("&amp;", "&");
}

function normalizeThumbnailUrl(url) {
  const normalizedUrl = normalizeUrl(url);

  if (!normalizedUrl) {
    return null;
  }

  if (normalizedUrl.startsWith("//")) {
    return `https:${normalizedUrl}`;
  }

  if (normalizedUrl.startsWith(window.location.origin)) {
    return normalizedUrl.slice(window.location.origin.length);
  }

  return normalizedUrl.replace(/^http:\/\//, "https://");
}

function isLocalThumbnailUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(normalizeUrl(url), window.location.origin);

    return (
      parsedUrl.origin === window.location.origin &&
      LOCAL_THUMBNAIL_PATH_REGEXP.test(parsedUrl.pathname)
    );
  } catch {
    return false;
  }
}

function videoFromText(text) {
  if (!text) {
    return null;
  }

  const urlMatch = text.match(BILIBILI_VIDEO_URL_REGEXP);
  if (urlMatch) {
    return {
      id: urlMatch[1],
      url: normalizeUrl(urlMatch[0]),
    };
  }

  const playerMatch = text.match(BILIBILI_PLAYER_URL_REGEXP);
  if (playerMatch) {
    const playerUrl = normalizeUrl(playerMatch[0]);
    const bvid = playerUrl.match(/[?&]bvid=(BV[a-zA-Z0-9]+)/i)?.[1];
    const aid = playerUrl.match(/[?&]aid=(\d+)/i)?.[1];
    if (bvid) {
      return { id: bvid, url: `https://www.bilibili.com/video/${bvid}` };
    }
    if (aid) {
      return { id: `av${aid}`, url: `https://www.bilibili.com/video/av${aid}` };
    }
  }

  const shortMatch = text.match(BILIBILI_SHORT_URL_REGEXP);
  if (shortMatch) {
    return {
      id: null,
      url: normalizeUrl(shortMatch[0]),
    };
  }

  const bvidMatch = text.match(BILIBILI_VIDEO_ID_REGEXP);
  if (bvidMatch?.[1]) {
    return {
      id: bvidMatch[1],
      url: `https://www.bilibili.com/video/${bvidMatch[1]}`,
    };
  }

  const aidMatch = text.match(BILIBILI_AID_REGEXP);
  if (aidMatch?.[1]) {
    return {
      id: `av${aidMatch[1]}`,
      url: `https://www.bilibili.com/video/av${aidMatch[1]}`,
    };
  }

  return null;
}

export function extractBilibiliVideo(sources) {
  const text = sources.filter(Boolean).join(" ");
  return videoFromText(text);
}

function extractImageFromHtml(html, localOnly = false) {
  if (!html) {
    return null;
  }

  const template = document.createElement("template");
  const candidates = [];

  template.innerHTML = html;

  template.content.querySelectorAll(".onebox img, img").forEach((image) => {
    const classes = image.getAttribute("class") || "";
    if (
      classes.includes("site-icon") ||
      classes.includes("avatar") ||
      classes.includes("emoji")
    ) {
      return;
    }

    const src = normalizeThumbnailUrl(
      image.getAttribute("src") ||
        image.getAttribute("data-src") ||
        image.getAttribute("data-orig-src")
    );
    if (src) {
      candidates.push({ url: src, width: null });
    }
  });

  const usable = localOnly
    ? candidates.filter((c) => isLocalThumbnailUrl(c.url))
    : candidates;

  return usable[0]?.url || null;
}

function fetchBilibiliApiCoverViaJsonp(videoId) {
  const query = videoId.toLowerCase().startsWith("av")
    ? `aid=${videoId.slice(2)}`
    : `bvid=${videoId}`;
  const callbackName = `__discourseBiliThumb_${Date.now()}_${Math.floor(
    Math.random() * 1e6
  )}`;

  return new Promise((resolve) => {
    const script = document.createElement("script");
    let settled = false;

    const cleanup = () => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        delete window[callbackName];
      } catch {
        window[callbackName] = undefined;
      }
      script.remove();
    };

    const timer = window.setTimeout(() => {
      cleanup();
      resolve(null);
    }, 8000);

    window[callbackName] = (payload) => {
      window.clearTimeout(timer);
      cleanup();
      resolve(normalizeThumbnailUrl(payload?.data?.pic));
    };

    script.src = `https://api.bilibili.com/x/web-interface/view?${query}&jsonp=jsonp&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      cleanup();
      resolve(null);
    };
    document.head.appendChild(script);
  });
}

async function fetchOneboxThumbnail(videoUrl, topic) {
  const params = new URLSearchParams({
    url: videoUrl,
    topic_id: String(topic.id),
  });
  if (topic.category_id) {
    params.set("category_id", String(topic.category_id));
  }

  const html = await fetch(`/onebox?${params.toString()}`, {
    headers: { Accept: "text/html" },
  }).then((r) => r.text());

  // Prefer any usable image from onebox (local first, then remote covers).
  return (
    extractImageFromHtml(html, true) ||
    (remoteFallbackEnabled() ? extractImageFromHtml(html) : null)
  );
}

async function resolveVideoFromTopicJson(topic) {
  try {
    const slug = topic.slug;
    const topicPath = slug
      ? `/t/${slug}/${topic.id}.json`
      : `/t/${topic.id}.json`;
    const payload = await ajax(topicPath);
    const firstPost = payload?.post_stream?.posts?.[0];
    const cooked = firstPost?.cooked || "";

    const cookedLocalImage = extractImageFromHtml(cooked, true);
    if (cookedLocalImage) {
      return { thumbnailUrl: cookedLocalImage };
    }

    if (remoteFallbackEnabled()) {
      const cookedRemoteImage = extractImageFromHtml(cooked, false);
      if (cookedRemoteImage && /hdslb\.com|bili(img|bili)/i.test(cookedRemoteImage)) {
        return { thumbnailUrl: cookedRemoteImage };
      }
    }

    const video = extractBilibiliVideo([
      payload?.featured_link,
      cooked,
      firstPost?.link_counts?.map((link) => link.url).join(" "),
      topic.excerpt,
      topic.last_post_excerpt,
    ]);

    return { video };
  } catch {
    return null;
  }
}

async function resolveBilibiliThumbnailForTopic(topic) {
  let video = extractBilibiliVideo([
    topic.featured_link,
    topic.excerpt,
    topic.last_post_excerpt,
    topic.title,
  ]);

  // List payloads often omit the Bilibili URL; load first post cooked HTML.
  if (!video?.id) {
    const fromTopic = await resolveVideoFromTopicJson(topic);
    if (fromTopic?.thumbnailUrl) {
      return fromTopic.thumbnailUrl;
    }
    if (fromTopic?.video) {
      video = fromTopic.video;
    }
  }

  if (!video?.url && !video?.id) {
    return null;
  }

  if (video.id) {
    const override = bilibiliThumbnailOverrides.get(video.id.toLowerCase());
    if (override) {
      return normalizeThumbnailUrl(override);
    }
  }

  if (video.url) {
    try {
      const oneboxImage = await fetchOneboxThumbnail(video.url, topic);
      if (oneboxImage) {
        return oneboxImage;
      }
    } catch {
      // fall through
    }
  }

  if (video.id && remoteFallbackEnabled()) {
    try {
      const apiCover = await fetchBilibiliApiCoverViaJsonp(video.id);
      if (apiCover) {
        return apiCover;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Returns a cover image URL for Bilibili topics without local Discourse thumbnails.
 */
export async function loadBilibiliThumbnailForTopic(topic) {
  if (!topic?.id || (topic.thumbnails?.length || 0) > 0) {
    return null;
  }

  const cached = bilibiliThumbnailCache.get(topic.id);
  if (cached !== undefined) {
    return cached;
  }

  const inflight = bilibiliThumbnailInflight.get(topic.id);
  if (inflight) {
    return inflight;
  }

  const promise = resolveBilibiliThumbnailForTopic(topic)
    .then((url) => {
      bilibiliThumbnailCache.set(topic.id, url || null);
      bilibiliThumbnailInflight.delete(topic.id);
      return url || null;
    })
    .catch(() => {
      bilibiliThumbnailCache.set(topic.id, null);
      bilibiliThumbnailInflight.delete(topic.id);
      return null;
    });

  bilibiliThumbnailInflight.set(topic.id, promise);
  return promise;
}
